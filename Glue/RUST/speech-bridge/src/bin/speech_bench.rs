//! CLI Benchmark Harness for `speech-bridge`:
//! Pipes clean speech `.wav` files overlaid with noisy-room `.wav` backgrounds at calibrated SNRs
//! through the live streaming pipeline and compares WER, spoken-to-text latency, flicker, and RTF.

use std::path::PathBuf;

use speech_bridge::bench::{
    decode_wav_to_16k_mono, load_or_generate_fixtures, run_streaming_trial, BenchResult,
    NoiseFixture, SpeechFixture,
};
use speech_bridge::denoise::LegacySnrVad;
use speech_bridge::llm_polish::LlmPolisher;
use speech_bridge::sherpa_ffi::{
    DenoiserKind, NeuralDenoiser, ParakeetAsr, SherpaRuntime, SileroVad, WeSpeakerTracker,
};
use speech_bridge::stream_decoder::{AsrModel, DenoiseMode, DenoiserModel, SpeakerIdModel, VadModel};
use speech_bridge::whisper_gpu::{WhisperServerAsr, WhisperVariant};

struct Args {
    bench_dir: PathBuf,
    regen: bool,
    realtime: bool,
    custom_speech: Option<PathBuf>,
    custom_ref: Option<String>,
    custom_noise: Option<PathBuf>,
    snrs: Vec<Option<f32>>,
    engines: Vec<String>,
    show_hyp: bool,
}

fn parse_args() -> Args {
    let mut args = Args {
        bench_dir: PathBuf::from("bench_data"),
        regen: false,
        realtime: false,
        custom_speech: None,
        custom_ref: None,
        custom_noise: None,
        snrs: vec![None, Some(10.0), Some(5.0), Some(0.0), Some(-5.0)],
        engines: Vec::new(),
        show_hyp: false,
    };

    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--dir" => {
                if let Some(v) = it.next() {
                    args.bench_dir = PathBuf::from(v);
                }
            }
            "--regen" => args.regen = true,
            "--realtime" => args.realtime = true,
            "--show-hyp" => args.show_hyp = true,
            "--speech" => {
                if let Some(v) = it.next() {
                    args.custom_speech = Some(PathBuf::from(v));
                }
            }
            "--ref" => {
                if let Some(v) = it.next() {
                    args.custom_ref = Some(v);
                }
            }
            "--noise" => {
                if let Some(v) = it.next() {
                    args.custom_noise = Some(PathBuf::from(v));
                }
            }
            "--snrs" => {
                if let Some(v) = it.next() {
                    args.snrs.clear();
                    for tok in v.split(',') {
                        let t = tok.trim();
                        if t.eq_ignore_ascii_case("clean") {
                            args.snrs.push(None);
                        } else if let Ok(db) = t.parse::<f32>() {
                            args.snrs.push(Some(db));
                        }
                    }
                }
            }
            "--engines" => {
                if let Some(v) = it.next() {
                    args.engines = v
                        .split(',')
                        .map(|s| s.trim().to_ascii_lowercase())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            _ => {}
        }
    }
    args
}

fn print_help() {
    println!("speech-bench — WAV + Background Noise Streaming STT Benchmark");
    println!("Usage: speech-bench [OPTIONS]");
    println!("  --dir <DIR>         Fixture directory (default: bench_data)");
    println!("  --regen             Regenerate Piper speech + synthetic cafe/restaurant noise WAVs");
    println!("  --realtime          Pace audio in real time (32 ms/chunk) instead of simulated clock");
    println!("  --snrs <LIST>       Comma list e.g. clean,10,5,0,-5");
    println!("  --engines <LIST>    Subset: legacy,parakeet,distil (default: all available)");
    println!("  --speech <WAV>      Test a single custom speech WAV file");
    println!("  --ref <TEXT|FILE>   Reference transcript text or .txt path for --speech");
    println!("  --noise <WAV>       Noise WAV overlay to mix with --speech");
    println!("  --show-hyp          Print full hypothesis text for every trial");
}

fn engine_enabled(args: &Args, name: &str) -> bool {
    args.engines.is_empty() || args.engines.iter().any(|e| e == name)
}

fn main() {
    let args = parse_args();
    println!("=== SPEECH_BRIDGE :: WAV + NOISE OVERLAY BENCHMARK ===");

    let (speech_fixtures, noise_fixtures) = if let Some(ref sp_path) = args.custom_speech {
        let bytes = std::fs::read(sp_path).expect("Failed reading --speech WAV");
        let pcm = decode_wav_to_16k_mono(&bytes).expect("Failed decoding --speech WAV");
        let transcript = match &args.custom_ref {
            Some(r) if PathBuf::from(r).is_file() => {
                std::fs::read_to_string(r).unwrap_or_default().trim().to_string()
            }
            Some(r) => r.clone(),
            None => std::fs::read_to_string(sp_path.with_extension("txt"))
                .unwrap_or_default()
                .trim()
                .to_string(),
        };
        let sp = SpeechFixture {
            name: sp_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("custom")
                .to_string(),
            transcript,
            samples_16k: pcm,
            expected_speakers: 1,
        };
        let mut noises = Vec::new();
        if let Some(ref np) = args.custom_noise {
            let nb = std::fs::read(np).expect("Failed reading --noise WAV");
            let npcm = decode_wav_to_16k_mono(&nb).expect("Failed decoding --noise WAV");
            noises.push(NoiseFixture {
                name: np
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("noise")
                    .to_string(),
                samples_16k: npcm,
            });
        }
        (vec![sp], noises)
    } else {
        match load_or_generate_fixtures(&args.bench_dir, args.regen) {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("Fixture setup failed: {e}");
                std::process::exit(1);
            }
        }
    };

    println!(
        "Loaded {} speech fixture(s), {} noise overlay(s).",
        speech_fixtures.len(),
        noise_fixtures.len()
    );
    for s in &speech_fixtures {
        println!(
            "  [SPEECH] {:<20} ({:.1}s, {} words)",
            s.name,
            s.samples_16k.len() as f32 / 16000.0,
            s.transcript.split_whitespace().count()
        );
    }
    for n in &noise_fixtures {
        println!(
            "  [NOISE]  {:<20} ({:.1}s)",
            n.name,
            n.samples_16k.len() as f32 / 16000.0
        );
    }

    let sherpa_rt = match SherpaRuntime::load() {
        Ok(rt) => {
            println!("[OK] Loaded sherpa-onnx CUDA/ONNX runtime");
            Some(rt)
        }
        Err(e) => {
            println!("[WARN] sherpa-onnx runtime unavailable: {e}");
            None
        }
    };

    let mut silero_vad = sherpa_rt
        .as_ref()
        .and_then(|rt| SileroVad::load(rt.clone(), 0.35).ok());
    let mut legacy_vad = LegacySnrVad::new();
    let mut dpdf_denoiser = sherpa_rt
        .as_ref()
        .and_then(|rt| NeuralDenoiser::load(rt.clone(), DenoiserKind::DpdfNet8, false).ok());
    let mut gtcrn_denoiser = sherpa_rt
        .as_ref()
        .and_then(|rt| NeuralDenoiser::load(rt.clone(), DenoiserKind::Gtcrn, false).ok());
    let mut voxlock_denoiser = sherpa_rt
        .as_ref()
        .and_then(|rt| NeuralDenoiser::load(rt.clone(), DenoiserKind::VoxLock, false).ok());
    let mut speaker_tracker = sherpa_rt
        .as_ref()
        .and_then(|rt| WeSpeakerTracker::load(rt.clone()).ok());
    let llm_polisher = if engine_enabled(&args, "llm") || engine_enabled(&args, "max") {
        match LlmPolisher::spawn() {
            Ok(p) => {
                println!("[OK] Loaded Local LLM Polisher: {}", p.label());
                Some(p)
            }
            Err(e) => {
                println!("[WARN] Local LLM Polisher unavailable: {e}");
                None
            }
        }
    } else {
        None
    };

    println!(
        "Components: SileroVAD={} | DPDFNet8={} | GTCRN={} | VoxLock={} | WeSpeaker={} | LLM={}",
        silero_vad.is_some(),
        dpdf_denoiser.is_some(),
        gtcrn_denoiser.is_some(),
        voxlock_denoiser.is_some(),
        speaker_tracker.is_some(),
        llm_polisher.is_some()
    );

    let mut all_results: Vec<BenchResult> = Vec::new();

    // 1. Legacy Whisper base.en CPU baseline (with legacy SNR VAD & no neural denoiser)
    if engine_enabled(&args, "legacy") {
        match WhisperServerAsr::spawn(WhisperVariant::LegacyBaseCpu) {
            Ok(mut asr) => {
                println!("\n--- Running Engine: {} (Baseline) ---", asr.model_name());
                run_matrix(
                    &args,
                    "Legacy Whisper CPU",
                    "None (SNR-VAD)",
                    DenoiseMode::Off,
                    &speech_fixtures,
                    &noise_fixtures,
                    &mut legacy_vad,
                    None,
                    &mut asr,
                    None,
                    None,
                    &mut all_results,
                );
            }
            Err(e) => println!("[SKIP] Legacy Whisper CPU: {e}"),
        }
    }

    // 2. NVIDIA Parakeet TDT 0.6B v2 FP16 on RTX 3050 CUDA
    if engine_enabled(&args, "parakeet") || engine_enabled(&args, "voxlock") || engine_enabled(&args, "llm") || engine_enabled(&args, "max") {
        if let Some(ref rt) = sherpa_rt {
            match ParakeetAsr::load(rt.clone(), true) {
                Ok(mut asr) => {
                    let eng_name = asr.model_name().to_string();
                    println!("\n--- Running Engine: {eng_name} ---");

                    let vad: &mut dyn VadModel = match silero_vad {
                        Some(ref mut s) => s,
                        None => &mut legacy_vad,
                    };

                    if engine_enabled(&args, "parakeet") {
                        run_matrix(
                            &args,
                            &eng_name,
                            "OFF",
                            DenoiseMode::Off,
                            &speech_fixtures,
                            &noise_fixtures,
                            vad,
                            None,
                            &mut asr,
                            speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                            None,
                            &mut all_results,
                        );
                        if let Some(ref mut g) = gtcrn_denoiser {
                            run_matrix(
                                &args,
                                &eng_name,
                                "GTCRN",
                                DenoiseMode::Balanced,
                                &speech_fixtures,
                                &noise_fixtures,
                                vad,
                                Some(g as &mut dyn DenoiserModel),
                                &mut asr,
                                speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                                None,
                                &mut all_results,
                            );
                        }
                        if let Some(ref mut d) = dpdf_denoiser {
                            run_matrix(
                                &args,
                                &eng_name,
                                "DPDF8",
                                DenoiseMode::Strong,
                                &speech_fixtures,
                                &noise_fixtures,
                                vad,
                                Some(d as &mut dyn DenoiserModel),
                                &mut asr,
                                speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                                None,
                                &mut all_results,
                            );
                        }
                    }

                    // 2e. VoxLock Target-Speaker Isolation
                    if (engine_enabled(&args, "voxlock") || engine_enabled(&args, "max"))
                        && voxlock_denoiser.is_some()
                    {
                        if let Some(ref mut v) = voxlock_denoiser {
                            run_matrix(
                                &args,
                                &eng_name,
                                "VOXLOCK",
                                DenoiseMode::VoxLock,
                                &speech_fixtures,
                                &noise_fixtures,
                                vad,
                                Some(v as &mut dyn DenoiserModel),
                                &mut asr,
                                speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                                None,
                                &mut all_results,
                            );
                        }
                    }

                    // 2f. Parakeet + Local Qwen2.5-1.5B CUDA LLM Polish
                    if let Some(ref polisher) = llm_polisher {
                        run_matrix(
                            &args,
                            &format!("{eng_name}+LLM"),
                            "OFF+QWEN1.5B",
                            DenoiseMode::Off,
                            &speech_fixtures,
                            &noise_fixtures,
                            vad,
                            None,
                            &mut asr,
                            speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                            Some(polisher),
                            &mut all_results,
                        );
                        if let Some(ref mut g) = gtcrn_denoiser {
                            run_matrix(
                                &args,
                                &format!("{eng_name}+LLM"),
                                "GTCRN+QWEN1.5B",
                                DenoiseMode::Balanced,
                                &speech_fixtures,
                                &noise_fixtures,
                                vad,
                                Some(g as &mut dyn DenoiserModel),
                                &mut asr,
                                speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                                Some(polisher),
                                &mut all_results,
                            );
                        }
                    }
                }
                Err(e) => println!("[SKIP] Parakeet GPU: {e}"),
            }
        }
    }

    // 3. Distil-Whisper Large-v3.5 EN on RTX 3050 CUDA
    if engine_enabled(&args, "distil") {
        match WhisperServerAsr::spawn(WhisperVariant::DistilLargeV35Gpu) {
            Ok(mut asr) => {
                let eng_name = asr.model_name().to_string();
                println!("\n--- Running Engine: {eng_name} ---");
                let vad: &mut dyn VadModel = match silero_vad {
                    Some(ref mut s) => s,
                    None => &mut legacy_vad,
                };
                run_matrix(
                    &args,
                    &eng_name,
                    "OFF",
                    DenoiseMode::Off,
                    &speech_fixtures,
                    &noise_fixtures,
                    vad,
                    None,
                    &mut asr,
                    speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                    None,
                    &mut all_results,
                );
                if let Some(ref mut d) = dpdf_denoiser {
                    run_matrix(
                        &args,
                        &eng_name,
                        "DPDF8",
                        DenoiseMode::Strong,
                        &speech_fixtures,
                        &noise_fixtures,
                        vad,
                        Some(d as &mut dyn DenoiserModel),
                        &mut asr,
                        speaker_tracker.as_mut().map(|s| s as &mut dyn SpeakerIdModel),
                        None,
                        &mut all_results,
                    );
                }
            }
            Err(e) => println!("[SKIP] Distil-Whisper GPU: {e}"),
        }
    }

    print_summary_table(&all_results, args.show_hyp);
}

#[allow(clippy::too_many_arguments)]
fn run_matrix<'d, 's>(
    args: &Args,
    engine_label: &str,
    denoise_label: &str,
    denoise_mode: DenoiseMode,
    speech: &[SpeechFixture],
    noises: &[NoiseFixture],
    vad: &mut dyn VadModel,
    mut denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
    asr: &mut dyn AsrModel,
    mut speaker: Option<&mut (dyn SpeakerIdModel + 's)>,
    llm: Option<&LlmPolisher>,
    out: &mut Vec<BenchResult>,
) {
    for sp in speech {
        for &snr in &args.snrs {
            if snr.is_none() {
                match run_streaming_trial(
                    engine_label,
                    denoise_label,
                    denoise_mode,
                    sp,
                    None,
                    None,
                    args.realtime,
                    vad,
                    denoiser.as_deref_mut(),
                    asr,
                    speaker.as_deref_mut(),
                    llm,
                ) {
                    Ok(r) => {
                        print_row(&r);
                        out.push(r);
                    }
                    Err(e) => eprintln!("Trial error: {e}"),
                }
            } else {
                for nz in noises {
                    match run_streaming_trial(
                        engine_label,
                        denoise_label,
                        denoise_mode,
                        sp,
                        Some(nz),
                        snr,
                        args.realtime,
                        vad,
                        denoiser.as_deref_mut(),
                        asr,
                        speaker.as_deref_mut(),
                        llm,
                    ) {
                        Ok(r) => {
                            print_row(&r);
                            out.push(r);
                        }
                        Err(e) => eprintln!("Trial error: {e}"),
                    }
                }
            }
        }
    }
}

fn print_row(r: &BenchResult) {
    println!(
        "  {:<24} | {:<14} | {:<14} | {:<12} | {:>5} | WER {:>5.1}% | 1st {:>4.0}ms | Lock {:>4.0}ms | Flk {:>4.1}% | Inf {:>4.0}ms | SPK {}",
        truncate(&r.engine, 24),
        truncate(&r.denoise_label, 14),
        truncate(&r.fixture, 14),
        truncate(&r.noise, 12),
        r.snr_label,
        r.wer_pct,
        r.first_text_ms,
        r.word_lock_ms,
        r.flicker_pct,
        r.avg_infer_ms,
        r.speakers_detected
    );
}

fn print_summary_table(results: &[BenchResult], show_hyp: bool) {
    if results.is_empty() {
        println!("\nNo benchmark trials ran.");
        return;
    }

    if show_hyp {
        println!("\n=== HYPOTHESES ===");
        for r in results {
            println!(
                "[{} | {} | {} | {} {}] WER={:.1}% -> {}",
                r.engine, r.denoise_label, r.fixture, r.noise, r.snr_label, r.wer_pct, r.hypothesis
            );
        }
    }

    println!("\n==========================================================================================================");
    println!(" SUMMARY BY ENGINE + DENOISER + SNR (Lower WER, Latency, Flicker & Infer-ms are better)");
    println!("==========================================================================================================");
    println!(
        "{:<28} | {:<14} | {:>6} | {:>7} | {:>8} | {:>8} | {:>7} | {:>7}",
        "ENGINE", "DENOISER", "SNR", "AVG WER", "1ST TXT", "LOCK MS", "FLICKER", "INF MS"
    );
    println!("{}", "-".repeat(106));

    // Group preserving insertion order
    let mut keys: Vec<(String, String, String)> = Vec::new();
    for r in results {
        let k = (r.engine.clone(), r.denoise_label.clone(), r.snr_label.clone());
        if !keys.contains(&k) {
            keys.push(k);
        }
    }

    for (eng, dns, snr) in keys {
        let group: Vec<&BenchResult> = results
            .iter()
            .filter(|r| r.engine == eng && r.denoise_label == dns && r.snr_label == snr)
            .collect();
        let n = group.len() as f32;
        let avg_wer = group.iter().map(|r| r.wer_pct).sum::<f32>() / n;
        let avg_1st = group.iter().map(|r| r.first_text_ms).sum::<f32>() / n;
        let avg_lock = group.iter().map(|r| r.word_lock_ms).sum::<f32>() / n;
        let avg_flk = group.iter().map(|r| r.flicker_pct).sum::<f32>() / n;
        let avg_inf = group.iter().map(|r| r.avg_infer_ms).sum::<f32>() / n;
        println!(
            "{:<28} | {:<14} | {:>6} | {:>6.1}% | {:>6.0}ms | {:>6.0}ms | {:>6.1}% | {:>5.0}ms",
            truncate(&eng, 28),
            truncate(&dns, 14),
            snr,
            avg_wer,
            avg_1st,
            avg_lock,
            avg_flk,
            avg_inf
        );
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
    }
}
