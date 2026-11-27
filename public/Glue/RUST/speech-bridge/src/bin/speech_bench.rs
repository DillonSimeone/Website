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
    test_loopback: bool,
    test_gap: bool,
    render_cycle: Option<(PathBuf, String)>,
    render_vibe_demo: Option<PathBuf>,
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
        test_loopback: false,
        test_gap: false,
        render_cycle: None,
        render_vibe_demo: None,
    };

    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--test-loopback" => args.test_loopback = true,
            "--test-gap" => args.test_gap = true,
            "--render-vibe-demo" => {
                if let Some(out) = it.next() {
                    args.render_vibe_demo = Some(PathBuf::from(out));
                }
            }
            "--render-cycle" => {
                if let (Some(out), Some(txt)) = (it.next(), it.next()) {
                    args.render_cycle = Some((PathBuf::from(out), txt));
                }
            }
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
    println!("  --test-loopback     Run live 2-way VB-Cable virtual mic & System Loopback audio test");
}

fn run_loopback_diagnostic() {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    println!("=== SPEECH_BRIDGE :: LIVE 2-WAY AUDIO & VB-CABLE DIAGNOSTIC ===");
    let host = cpal::default_host();
    let def_out = host.default_output_device().and_then(|d| d.name().ok());
    let def_in = host.default_input_device().and_then(|d| d.name().ok());
    println!("Windows Default Output: {:?}", def_out);
    println!("Windows Default Input : {:?}", def_in);

    let out_devs = speech_bridge::tts::list_output_devices();
    let in_devs = speech_bridge::meter::list_input_devices();
    println!("\nAvailable Output Devices (OUT:):");
    for d in &out_devs {
        println!("  - {d}");
    }
    println!("Available Input Devices (MIC:):");
    for d in &in_devs {
        println!("  - {d}");
    }

    let piper_exe = speech_bridge::tts::find_piper_exe().expect("piper.exe not found");
    let voices_dir = speech_bridge::tts::find_piper_voices_dir().expect("piper/voices not found");
    let model = voices_dir.join("en_GB-alan-medium.onnx");

    let rt = SherpaRuntime::load().expect("SherpaRuntime load failed");
    let mut parakeet = ParakeetAsr::load(rt, true).expect("Parakeet load failed");

    // Helper: capture from any cpal device (input or loopback output) while playing a WAV.
    let run_capture = |cap_device: &cpal::Device,
                       cap_cfg: cpal::SupportedStreamConfig,
                       play_dev_name: Option<&str>,
                       wav: &[u8]|
     -> (f32, f32, Vec<f32>) {
        let cap_sr = cap_cfg.sample_rate().0;
        let cap_ch = cap_cfg.channels().max(1) as usize;
        let fmt = cap_cfg.sample_format();
        let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let cap_cb = Arc::clone(&captured);
        let stream_cfg: cpal::StreamConfig = cap_cfg.into();

        let stream = match fmt {
            cpal::SampleFormat::F32 => cap_device
                .build_input_stream(
                    &stream_cfg,
                    move |data: &[f32], _| {
                        if let Ok(mut buf) = cap_cb.lock() {
                            for frame in data.chunks(cap_ch) {
                                let sum: f32 = frame.iter().copied().sum();
                                buf.push(sum / cap_ch as f32);
                            }
                        }
                    },
                    |_| {},
                    None,
                )
                .ok(),
            cpal::SampleFormat::I16 => cap_device
                .build_input_stream(
                    &stream_cfg,
                    move |data: &[i16], _| {
                        if let Ok(mut buf) = cap_cb.lock() {
                            for frame in data.chunks(cap_ch) {
                                let sum: f32 = frame.iter().map(|&s| s as f32 / 32768.0).sum();
                                buf.push(sum / cap_ch as f32);
                            }
                        }
                    },
                    |_| {},
                    None,
                )
                .ok(),
            _ => None,
        };
        let Some(stream) = stream else {
            return (0.0, 0.0, Vec::new());
        };
        let _ = stream.play();
        std::thread::sleep(Duration::from_millis(120));

        let cancel = AtomicBool::new(false);
        let ok = speech_bridge::tts::play_wav_cpal(wav, play_dev_name, &cancel);
        println!("  play_wav_cpal({play_dev_name:?}) -> ok={ok}");
        std::thread::sleep(Duration::from_millis(200));
        drop(stream);

        let raw = captured.lock().map(|g| g.clone()).unwrap_or_default();
        if raw.is_empty() {
            return (0.0, 0.0, Vec::new());
        }
        let peak = raw.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        let rms = (raw.iter().map(|&x| x * x).sum::<f32>() / raw.len() as f32).sqrt();

        // Resample captured audio to 16 kHz for Parakeet verification
        let out_len = ((raw.len() as u64 * 16_000) / cap_sr.max(1) as u64).max(1) as usize;
        let ratio = cap_sr as f64 / 16_000.0;
        let mut r16 = Vec::with_capacity(out_len);
        for i in 0..out_len {
            let pos = i as f64 * ratio;
            let idx = (pos as usize).min(raw.len() - 1);
            let frac = (pos - idx as f64) as f32;
            let a = raw[idx];
            let b = raw[(idx + 1).min(raw.len() - 1)];
            r16.push(a + (b - a) * frac);
        }
        (peak, rms, r16)
    };

    // TEST 1: TTS -> VB-Cable Output (Virtual Mic that Discord listens to!)
    println!("\n--- TEST 1: TTS -> VB-Audio Virtual Cable -> Discord Virtual Mic ---");
    let cable_play = out_devs
        .iter()
        .find(|d| {
            let l = d.to_ascii_lowercase();
            (l.contains("vb-audio virtual cable") || l.contains("cable input"))
                && !l.contains("16 ch")
        })
        .cloned();
    let cable_mic = host.input_devices().ok().and_then(|mut ds| {
        ds.find(|d| {
            d.name()
                .map(|n| n.to_ascii_lowercase().contains("cable output"))
                .unwrap_or(false)
        })
    });

    if let (Some(play_name), Some(mic_dev)) = (cable_play, cable_mic) {
        let wav1 = speech_bridge::tts::synthesize_piper_wav(
            &piper_exe,
            &model,
            "Testing virtual microphone routing into Discord.",
            1.0,
        )
        .expect("piper synth 1");
        let cfg = mic_dev.default_input_config().expect("cable mic cfg");
        let (peak, rms, pcm16k) = run_capture(&mic_dev, cfg, Some(&play_name), &wav1);
        let text = parakeet.transcribe(&pcm16k).unwrap_or_default();
        println!(
            "  Captured from {:?}: samples={} peak={:.3} rms={:.4}",
            mic_dev.name().ok(),
            pcm16k.len(),
            peak,
            rms
        );
        println!("  Parakeet heard on Virtual Mic: \"{text}\"");
    } else {
        println!("  [FAIL] Could not locate both VB-Cable playback & CABLE Output mic!");
    }

    // TEST 2: System Audio Loopback -> Speech Bridge STT
    println!("\n--- TEST 2: System Audio Loopback -> Speech Bridge STT ---");
    if let Some(out_dev) = host.default_output_device() {
        let wav2 = speech_bridge::tts::synthesize_piper_wav(
            &piper_exe,
            &model,
            "Testing system audio loopback capture from a meeting.",
            1.0,
        )
        .expect("piper synth 2");
        let cfg = out_dev.default_output_config().expect("default out cfg");
        let (peak, rms, pcm16k) = run_capture(&out_dev, cfg, None, &wav2);
        let text = parakeet.transcribe(&pcm16k).unwrap_or_default();
        println!(
            "  Captured via WASAPI Loopback on {:?}: samples={} peak={:.3} rms={:.4}",
            out_dev.name().ok(),
            pcm16k.len(),
            peak,
            rms
        );
        println!("  Parakeet heard on System Loopback: \"{text}\"");
    } else {
        println!("  [FAIL] No default output device found!");
    }
}

/// Simulates realistic 2-person and 3-person conversations with real Piper neural voices,
/// mid-sentence breath pauses (150-350ms), tight handoffs (300-450ms), and natural turn gaps
/// (800-1400ms), then tests queuing TTS replies at 20 random timestamps per scenario.
fn run_gap_simulation() {
    println!("=== SPEECH_BRIDGE :: 2-PERSON & 3-PERSON GAP TURN-TAKING SIMULATION ===");
    let piper_exe = speech_bridge::tts::find_piper_exe().expect("piper.exe not found");
    let voices_dir = speech_bridge::tts::find_piper_voices_dir().expect("piper/voices not found");
    let v_lessac = voices_dir.join("en_US-lessac-medium.onnx");
    let v_alan = voices_dir.join("en_GB-alan-medium.onnx");

    let rt = SherpaRuntime::load().expect("SherpaRuntime load failed");
    let mut vad = SileroVad::load(rt, 0.35).expect("SileroVad load failed");

    // Helper: synth a line to 16kHz i16 mono, trimming leading/trailing silence.
    let synth_16k = |model: &PathBuf, text: &str, rate: f64| -> Vec<i16> {
        let wav = speech_bridge::tts::synthesize_piper_wav(&piper_exe, model, text, rate)
            .expect("piper synth failed");
        let pcm_f32 = decode_wav_to_16k_mono(&wav).expect("decode wav failed");
        let first = pcm_f32.iter().position(|&s| s.abs() > 0.012).unwrap_or(0);
        let last = pcm_f32
            .iter()
            .rposition(|&s| s.abs() > 0.012)
            .unwrap_or(pcm_f32.len().saturating_sub(1));
        let slice = if last > first {
            &pcm_f32[first..=last]
        } else {
            &pcm_f32[..]
        };
        slice
            .iter()
            .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0) as i16)
            .collect()
    };

    struct SpeechSpan {
        start_ms: u64,
        end_ms: u64,
    }

    // Build a timeline of (16kHz PCM, ground-truth speech spans) from (speaker, text, rate, gap_after_ms).
    let build_conversation = |turns: &[(usize, &str, f64, u64)]| -> (Vec<i16>, Vec<SpeechSpan>) {
        let mut pcm: Vec<i16> = vec![0i16; 16_000 / 2]; // 500 ms lead-in silence
        let mut spans = Vec::new();
        for &(spk, text, rate, gap_ms) in turns {
            let model = if spk == 2 { &v_alan } else { &v_lessac };
            let seg = synth_16k(model, text, rate);
            let start_ms = (pcm.len() as u64 * 1000) / 16_000;
            pcm.extend_from_slice(&seg);
            let end_ms = (pcm.len() as u64 * 1000) / 16_000;
            spans.push(SpeechSpan { start_ms, end_ms });
            let gap_samples = ((gap_ms as usize) * 16_000) / 1000;
            pcm.resize(pcm.len() + gap_samples, 0);
        }
        // 2.0 s final silence so any late-queued message can settle.
        pcm.resize(pcm.len() + 32_000, 0);
        (pcm, spans)
    };

    // Scenario A: Normal 2-person talk (mix of mid-sentence 220ms breath pauses, 400ms quick replies, and 900-1300ms natural gaps)
    let conv_2p_script: &[(usize, &str, f64, u64)] = &[
        (1, "Hey did you get a chance to review the new design doc", 1.0, 220), // mid-thought pause!
        (1, "before we jump into the sprint planning meeting?", 1.0, 1050),     // real gap #1
        (2, "Yeah I skimmed most of it this morning", 1.0, 260),                // mid-sentence breath
        (2, "and the timeline looks super reasonable overall.", 1.0, 380),      // quick handoff
        (1, "Awesome, I was mostly worried about the audio latency budget.", 1.0, 1150), // real gap #2
        (2, "Honestly it feels way snappier now, especially with the GPU.", 1.0, 950),   // real gap #3
        (1, "Great, let us lock that in for Friday's demo.", 1.0, 1300),                 // real gap #4
    ];

    // Scenario B: Lively 3-person group call (fast handoffs 250-450ms + real topic gaps 800-1200ms)
    let conv_3p_script: &[(usize, &str, f64, u64)] = &[
        (1, "Alright everyone, let us figure out where we are meeting tonight.", 1.0, 320),
        (2, "I vote for the taco spot downtown", 1.0, 200),                     // mid-sentence breath
        (2, "since it has a big patio for all of us.", 1.0, 900),               // real gap #1
        (3, "Works for me, though parking there gets pretty wild after six.", 1.12, 350),
        (1, "Good point, maybe we carpool from the station?", 1.0, 850),        // real gap #2
        (2, "Yeah I can drive three people if we leave by five thirty.", 1.0, 280),
        (3, "Count me in, I will bring the extra microphones too.", 1.12, 1100),// real gap #3
        (1, "Sweet, sounds like a plan.", 1.0, 1200),                           // real gap #4
    ];

    // Simulate both the current (StreamDecoder in_speech + 650ms) and direct Silero VAD + gap_ms
    let simulate = |label: &str, pcm: &[i16], spans: &[SpeechSpan], vad: &mut SileroVad| {
        println!("\n--- {label} (total {:.1}s, {} turns) ---", pcm.len() as f64 / 16000.0, spans.len());
        vad.reset();

        // Precompute per-chunk (32ms) signals:
        // 1) dec_in_speech (old stacked StreamDecoder hangover)
        // 2) hybrid_speech: instant 32ms adaptive-RMS speech energy OR Silero VAD (0ms onset lag!)
        let chunk_sz = 512usize;
        let num_chunks = pcm.len() / chunk_sz;
        let mut dec_in_speech = Vec::with_capacity(num_chunks);
        let mut hybrid_speech = Vec::with_capacity(num_chunks);
        let mut in_sp = false;
        let mut sil_chunks = 0usize;
        let mut hp_px = 0.0f32;
        let mut hp_py = 0.0f32;
        let mut noise_floor = 0.002f32;

        for c in 0..num_chunks {
            let slice = &pcm[c * chunk_sz..(c + 1) * chunk_sz];
            let mut f32_buf = [0.0f32; 512];
            let mut sum_sq = 0.0f32;
            for (i, &s) in slice.iter().enumerate() {
                let x = s as f32 / 32768.0;
                let y = 0.955 * (hp_py + x - hp_px);
                hp_px = x;
                hp_py = y;
                let v = y.clamp(-1.0, 1.0);
                f32_buf[i] = v;
                sum_sq += v * v;
            }
            let rms = (sum_sq / 512.0).sqrt();
            if rms < noise_floor * 1.6 {
                noise_floor = (noise_floor * 0.95 + rms * 0.05).max(0.0015);
            }
            let instant_energy = rms > (noise_floor * 3.0).max(0.010);
            let is_v = vad.is_speech(&f32_buf);
            // Instant energy gives 0ms onset + 0ms offset; Silero confirms speech during soft tails.
            hybrid_speech.push(instant_energy || is_v);

            if is_v {
                in_sp = true;
                sil_chunks = 0;
            } else if in_sp {
                sil_chunks += 1;
                if sil_chunks >= 14 {
                    in_sp = false;
                    sil_chunks = 0;
                }
            }
            dec_in_speech.push(in_sp);
        }

        // Helper: check if timestamp `t_ms` is inside any ground-truth speech span or <280ms mid-sentence breath!
        let is_mid_sentence = |t_ms: u64| -> Option<&'static str> {
            for s in spans {
                if t_ms >= s.start_ms && t_ms < s.end_ms {
                    return Some("MID-SPEECH (BARGE-IN!)");
                }
            }
            // Check if t_ms landed inside a tiny <350ms breath gap right between two spans
            for w in spans.windows(2) {
                let gap = w[1].start_ms.saturating_sub(w[0].end_ms);
                if gap < 350 && t_ms >= w[0].end_ms && t_ms < w[1].start_ms {
                    return Some("MID-BREATH PAUSE (<350ms)");
                }
            }
            None
        };

        // 20 deterministic pseudo-random press-Enter timestamps spread across the conversation
        let total_ms = (num_chunks as u64) * 32;
        let active_end = spans.last().map(|s| s.end_ms).unwrap_or(total_ms);
        let mut seed: u64 = 0x5EED_CAFE_1234;
        let mut press_times = Vec::new();
        for _ in 0..20 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let t = 500 + (seed % active_end.saturating_sub(600).max(1));
            press_times.push(t);
        }
        press_times.sort_unstable();

        for (mode_name, signal, gap_ms) in [
            ("OLD    (StreamDecoder in_speech + 650ms)", &dec_in_speech, 650u64),
            ("HYBRID (Energy||Silero + 500ms)         ", &hybrid_speech, 500u64),
            ("HYBRID (Energy||Silero + 600ms)         ", &hybrid_speech, 600u64),
        ] {
            let mut barge_ins = 0usize;
            let mut breath_hits = 0usize;
            let mut hung = 0usize;
            let mut caught_mid_conv_gap = 0usize;
            let mut total_wait_ms = 0u64;

            for &press_ms in &press_times {
                // Find the earliest chunk >= press_ms where signal has been false for >= gap_ms
                let start_c = (press_ms / 32) as usize;
                let need_sil_chunks = ((gap_ms + 31) / 32) as usize;
                let mut fired_ms: Option<u64> = None;

                for c in start_c..num_chunks {
                    let mut ok = true;
                    let back = c.saturating_sub(need_sil_chunks);
                    for k in back..=c {
                        if signal[k] {
                            ok = false;
                            break;
                        }
                    }
                    if ok {
                        fired_ms = Some((c as u64) * 32);
                        break;
                    }
                }

                match fired_ms {
                    None => hung += 1,
                    Some(t) => {
                        total_wait_ms += t.saturating_sub(press_ms);
                        if t < active_end {
                            caught_mid_conv_gap += 1;
                        }
                        if let Some(reason) = is_mid_sentence(t) {
                            if reason.contains("BARGE") {
                                barge_ins += 1;
                            } else {
                                breath_hits += 1;
                            }
                        }
                    }
                }
            }

            let avg_wait = total_wait_ms / press_times.len() as u64;
            println!(
                "  {mode_name} | Barge-ins: {:2}/20 | Breath-hits: {:2}/20 | Caught Mid-Talk Gaps: {:2}/20 | Hung: {:2} | Avg Wait: {:4} ms",
                barge_ins, breath_hits, caught_mid_conv_gap, hung, avg_wait
            );
        }
    };

    let (pcm2, spans2) = build_conversation(conv_2p_script);
    simulate("SCENARIO A: 2-PERSON CONVERSATION", &pcm2, &spans2, &mut vad);

    let (pcm3, spans3) = build_conversation(conv_3p_script);
    simulate("SCENARIO B: 3-PERSON GROUP DISCUSSION", &pcm3, &spans3, &mut vad);
}

fn engine_enabled(args: &Args, name: &str) -> bool {
    args.engines.is_empty() || args.engines.iter().any(|e| e == name)
}

fn main() {
    let args = parse_args();
    if args.test_loopback {
        run_loopback_diagnostic();
        return;
    }
    if args.test_gap {
        run_gap_simulation();
        return;
    }
    if let Some(out_dir) = args.render_vibe_demo {
        let _ = std::fs::create_dir_all(&out_dir);
        let shared_llm = speech_bridge::llm_polish::SharedLlmServer::new();
        println!("Pre-warming Qwen2.5-1.5B CUDA Prosody Director...");
        shared_llm.prewarm();

        let body = "A bag of flour has always been my weapon of choice in D and D... A cloud of powder is ridiculously versatile and deadly! Even if it's onion flour. Basically all flour is very flammable! And fire solves a lot of problems. Onion flour is probably extra scary, come think of it, due to the amount of sugar in them... Goes hotter and burns longer like sugar water! Borderline improvised napalm!";

        let parts = [
            (
                "01_vibe_off_single.wav",
                false,
                false,
                format!("This is Dillon testing his new voice system! This section of the voice thing has no vibe and uses a single voice. {body}"),
            ),
            (
                "02_vibe_off_cycle.wav",
                true,
                false,
                format!("This is Dillon testing his new voice system! This section of the voice thing has no vibe and uses all of the voices. {body}"),
            ),
            (
                "03_vibe_on_single.wav",
                false,
                true,
                format!("This is Dillon testing his new voice system! This section has vibe mode turned on and uses a single voice. {body}"),
            ),
            (
                "04_vibe_on_cycle.wav",
                true,
                true,
                format!("This is Dillon testing his new voice system! This final section has vibe mode turned on and cycles through all of the voices. {body}"),
            ),
        ];

        for (fname, cycle, vibe_on, text) in parts {
            println!("\n--- Rendering {fname} (cycle={cycle}, vibe={vibe_on}) ---");
            let wav = speech_bridge::tts::render_vibe_demo_segment(
                &text,
                cycle,
                vibe_on,
                &shared_llm,
                1.0,
            )
            .expect("render_vibe_demo_segment failed");
            let p = out_dir.join(fname);
            std::fs::write(&p, &wav).expect("write demo wav");
            println!("  [OK] {} ({} bytes)", p.display(), wav.len());
        }
        return;
    }
    if let Some((out_wav, text_or_file)) = args.render_cycle {
        let text = if PathBuf::from(&text_or_file).is_file() {
            std::fs::read_to_string(&text_or_file).expect("read text file")
        } else {
            text_or_file
        };
        println!("Rendering CYCLE-Dillon WAV ({} words)...", text.split_whitespace().count());
        let wav = speech_bridge::tts::render_cycle_cloned_wav(&text, 1.0)
            .expect("render_cycle_cloned_wav failed");
        std::fs::write(&out_wav, &wav).expect("write out wav");
        println!("[OK] Wrote {} ({} bytes)", out_wav.display(), wav.len());
        return;
    }
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
