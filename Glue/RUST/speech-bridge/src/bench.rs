//! Automated WAV + Background Noise Overlay Benchmark Engine.
//!
//! Feeds clean speech WAVs mixed with real/synthetic noisy-room WAV overlays at calibrated
//! SNR levels (+10, +5, 0, -5 dB) through the exact same [`StreamDecoder`] used in live mode,
//! measuring WER, CER, spoken-to-text latency (ms), flicker rate, and GPU inference speed.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::llm_polish::{load_hotwords, LlmPolisher};
use crate::stream_decoder::{
    norm_word, AsrModel, DenoiseMode, DenoiserModel, SpeakerIdModel, StreamDecoder, StreamEvent,
    VadModel, CHUNK_SAMPLES,
};
use crate::tts::{find_piper_exe, find_piper_voices_dir, synthesize_piper_wav};
use crate::whisper_gpu::build_wav_16k_mono_f32;
use crate::win_util::AUDIO_SAMPLE_RATE;

#[derive(Clone, Debug)]
pub struct SpeechFixture {
    pub name: String,
    pub transcript: String,
    pub samples_16k: Vec<f32>,
    /// Optional ground-truth speaker count for multi-speaker fixtures.
    pub expected_speakers: usize,
}

#[derive(Clone, Debug)]
pub struct NoiseFixture {
    pub name: String,
    pub samples_16k: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct BenchResult {
    pub engine: String,
    pub denoise_label: String,
    pub fixture: String,
    pub noise: String,
    pub snr_label: String,
    pub wer_pct: f32,
    pub cer_pct: f32,
    pub first_text_ms: f32,
    pub word_lock_ms: f32,
    pub flicker_pct: f32,
    pub rtf: f32,
    pub avg_infer_ms: f32,
    pub speakers_detected: usize,
    pub hypothesis: String,
}

/// Parses a PCM16 / PCM24 / IEEE-float32 WAV byte slice and resamples cleanly to 16 kHz mono f32.
pub fn decode_wav_to_16k_mono(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Not a valid RIFF/WAVE file".to_string());
    }
    let mut pos = 12usize;
    let mut audio_fmt = 1u16;
    let mut channels = 1u16;
    let mut sample_rate = AUDIO_SAMPLE_RATE;
    let mut bits_per_sample = 16u16;
    let mut data_slice: Option<&[u8]> = None;

    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let sz = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let body_start = pos + 8;
        let body_end = (body_start + sz).min(bytes.len());
        let body = &bytes[body_start..body_end];

        if id == b"fmt " && body.len() >= 16 {
            audio_fmt = u16::from_le_bytes([body[0], body[1]]);
            channels = u16::from_le_bytes([body[2], body[3]]).max(1);
            sample_rate = u32::from_le_bytes([body[4], body[5], body[6], body[7]]).max(1);
            bits_per_sample = u16::from_le_bytes([body[14], body[15]]);
        } else if id == b"data" {
            data_slice = Some(body);
            break;
        }
        pos = body_start + sz + (sz & 1);
    }

    let data = data_slice.ok_or_else(|| "WAV missing data chunk".to_string())?;
    let bytes_per_sample = (bits_per_sample / 8).max(1) as usize;
    let frame_bytes = bytes_per_sample * channels as usize;
    if frame_bytes == 0 {
        return Err("Invalid WAV frame size".to_string());
    }

    let num_frames = data.len() / frame_bytes;
    let mut mono = Vec::with_capacity(num_frames);

    for f in 0..num_frames {
        let mut sum = 0.0f32;
        for ch in 0..channels as usize {
            let off = f * frame_bytes + ch * bytes_per_sample;
            let s = match (audio_fmt, bits_per_sample) {
                (1, 16) => i16::from_le_bytes([data[off], data[off + 1]]) as f32 / 32768.0,
                (1, 24) => {
                    let b0 = data[off] as i32;
                    let b1 = (data[off + 1] as i32) << 8;
                    let b2 = ((data[off + 2] as i8) as i32) << 16;
                    (b0 | b1 | b2) as f32 / 8_388_608.0
                }
                (3, 32) => f32::from_le_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]]),
                _ => 0.0,
            };
            sum += s;
        }
        mono.push((sum / channels as f32).clamp(-1.0, 1.0));
    }

    if sample_rate == AUDIO_SAMPLE_RATE {
        Ok(mono)
    } else {
        Ok(resample_linear_aa(&mono, sample_rate, AUDIO_SAMPLE_RATE))
    }
}

fn resample_linear_aa(src: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src.len() < 2 || src_rate == dst_rate {
        return src.to_vec();
    }
    let ratio = src_rate as f64 / dst_rate as f64;
    let dst_len = ((src.len() as f64) / ratio).floor() as usize;
    let mut out = Vec::with_capacity(dst_len);
    let mut prev = src[0];
    let filtered: Vec<f32> = if ratio > 1.3 {
        src.iter()
            .map(|&x| {
                let y = 0.55 * x + 0.45 * prev;
                prev = y;
                y
            })
            .collect()
    } else {
        src.to_vec()
    };

    for i in 0..dst_len {
        let pos = i as f64 * ratio;
        let idx = (pos as usize).min(filtered.len() - 2);
        let t = (pos - idx as f64) as f32;
        out.push(filtered[idx] * (1.0 - t) + filtered[idx + 1] * t);
    }
    out
}

/// Mixes clean speech with a background noise overlay at an exact calibrated speech-active SNR (dB),
/// adding realistic pre-roll (0.6s) and post-roll (0.9s) noise padding.
pub fn mix_at_snr_db(speech: &[f32], noise: &[f32], snr_db: Option<f32>) -> (Vec<i16>, usize) {
    let lead_samples = (AUDIO_SAMPLE_RATE as usize * 6) / 10; // 600 ms leading noise
    let trail_samples = (AUDIO_SAMPLE_RATE as usize * 9) / 10; // 900 ms trailing noise
    let total = lead_samples + speech.len() + trail_samples;

    // Measure speech-active RMS (frames above -36 dBFS) so silence doesn't distort target SNR.
    let speech_rms = active_rms(speech, 0.015).max(0.02);
    let noise_rms = active_rms(noise, 0.001).max(1e-4);

    let noise_gain = match snr_db {
        None => 0.0,
        Some(db) => {
            if noise.is_empty() {
                0.0
            } else {
                let target_noise_rms = speech_rms / 10.0f32.powf(db / 20.0);
                target_noise_rms / noise_rms
            }
        }
    };

    let mut mixed = Vec::with_capacity(total);
    for i in 0..total {
        let s = if i >= lead_samples && i < lead_samples + speech.len() {
            speech[i - lead_samples]
        } else {
            0.0
        };
        let n = if noise_gain > 0.0 && !noise.is_empty() {
            noise[i % noise.len()] * noise_gain
        } else {
            0.0
        };
        let v = (s + n).clamp(-0.98, 0.98);
        mixed.push((v * 32767.0) as i16);
    }
    (mixed, lead_samples)
}

fn active_rms(samples: &[f32], floor: f32) -> f32 {
    let mut sum_sq = 0.0f64;
    let mut count = 0usize;
    for chunk in samples.chunks(320) {
        let rms = (chunk.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>()
            / chunk.len().max(1) as f64)
            .sqrt() as f32;
        if rms >= floor {
            for &x in chunk {
                sum_sq += (x as f64) * (x as f64);
                count += 1;
            }
        }
    }
    if count == 0 {
        let all = samples.iter().map(|&x| (x as f64) * (x as f64)).sum::<f64>();
        (all / samples.len().max(1) as f64).sqrt() as f32
    } else {
        (sum_sq / count as f64).sqrt() as f32
    }
}

/// Estimates when active speech starts and ends inside a clean speech waveform (in samples).
fn speech_active_span(samples: &[f32]) -> (usize, usize) {
    let mut start = 0usize;
    let mut end = samples.len();
    for (i, ch) in samples.chunks(160).enumerate() {
        let peak = ch.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
        if peak > 0.025 {
            start = i * 160;
            break;
        }
    }
    for (i, ch) in samples.chunks(160).enumerate().rev() {
        let peak = ch.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
        if peak > 0.025 {
            end = ((i + 1) * 160).min(samples.len());
            break;
        }
    }
    if end <= start {
        (0, samples.len())
    } else {
        (start, end)
    }
}

/// Runs a single streaming benchmark trial, tracking WER, CER, latency, flicker, and GPU timing.
#[allow(clippy::too_many_arguments)]
pub fn run_streaming_trial<'d, 's>(
    engine_label: &str,
    denoise_label: &str,
    denoise_mode: DenoiseMode,
    fixture: &SpeechFixture,
    noise: Option<&NoiseFixture>,
    snr_db: Option<f32>,
    realtime_paced: bool,
    vad: &mut dyn VadModel,
    mut denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
    asr: &mut dyn AsrModel,
    mut speaker: Option<&mut (dyn SpeakerIdModel + 's)>,
    llm: Option<&LlmPolisher>,
) -> Result<BenchResult, String> {
    vad.reset();
    if let Some(ref mut d) = denoiser {
        d.reset();
    }
    if let Some(ref mut s) = speaker {
        s.reset();
    }

    let noise_samples: &[f32] = noise.map(|n| n.samples_16k.as_slice()).unwrap_or(&[]);
    let (mixed_pcm, lead_samples) = mix_at_snr_db(&fixture.samples_16k, noise_samples, snr_db);
    let (sp_start, sp_end) = speech_active_span(&fixture.samples_16k);
    let speech_onset_ms = ((lead_samples + sp_start) as f32 / AUDIO_SAMPLE_RATE as f32) * 1000.0;
    let speech_dur_ms = ((sp_end - sp_start).max(1600) as f32 / AUDIO_SAMPLE_RATE as f32) * 1000.0;

    let ref_words: Vec<String> = normalize_words(&fixture.transcript);
    let mut word_spoken_ms: Vec<(String, f32)> = Vec::with_capacity(ref_words.len());
    for (idx, w) in ref_words.iter().enumerate() {
        let frac = (idx as f32 + 0.5) / ref_words.len().max(1) as f32;
        word_spoken_ms.push((w.clone(), speech_onset_ms + frac * speech_dur_ms));
    }

    let mut decoder = StreamDecoder::new(denoise_mode, speaker.is_some());
    let mut events: Vec<StreamEvent> = Vec::with_capacity(4);
    let mut final_segments: Vec<String> = Vec::new();
    let mut detected_speakers: Vec<u8> = Vec::new();

    let mut first_text_latency_ms: Option<f32> = None;
    let mut locked_word_latencies: Vec<f32> = Vec::new();
    let mut seen_locked_count: usize = 0;

    let mut prev_partial_tokens: Vec<String> = Vec::new();
    let mut partial_updates: usize = 0;
    let mut partial_flickers: usize = 0;

    let mut total_compute_ms = 0.0f64;
    let mut infer_calls = 0usize;

    let mut padded = mixed_pcm;
    while padded.len() % CHUNK_SAMPLES != 0 {
        padded.push(0);
    }

    for (chunk_idx, chunk) in padded.chunks_exact(CHUNK_SAMPLES).enumerate() {
        let audio_clock_ms = ((chunk_idx + 1) * CHUNK_SAMPLES) as f32 * 1000.0 / AUDIO_SAMPLE_RATE as f32;
        events.clear();

        let t0 = Instant::now();
        decoder.push_chunk(
            chunk,
            vad,
            denoiser.as_deref_mut(),
            asr,
            speaker.as_deref_mut(),
            &mut events,
        )?;
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        total_compute_ms += elapsed_ms;

        if realtime_paced {
            let sleep_ms = 32.0 - elapsed_ms;
            if sleep_ms > 1.0 {
                std::thread::sleep(Duration::from_millis(sleep_ms as u64));
            }
        }

        for ev in events.drain(..) {
            match ev {
                StreamEvent::SpeechStarted | StreamEvent::Cleared => {}
                StreamEvent::Partial { stable, draft } => {
                    infer_calls += 1;
                    let combined = format!("{stable} {draft}");
                    let tokens = normalize_words(&combined);
                    if !tokens.is_empty() && first_text_latency_ms.is_none() {
                        first_text_latency_ms =
                            Some((audio_clock_ms + elapsed_ms as f32 - speech_onset_ms).max(0.0));
                    }

                    // Flicker check: did previously emitted non-tail words change?
                    if !prev_partial_tokens.is_empty() && !tokens.is_empty() {
                        partial_updates += 1;
                        let cmp_len = prev_partial_tokens.len().saturating_sub(1).min(tokens.len());
                        let mut changed = false;
                        for i in 0..cmp_len {
                            if prev_partial_tokens[i] != tokens[i] {
                                changed = true;
                                break;
                            }
                        }
                        if changed {
                            partial_flickers += 1;
                        }
                    }
                    prev_partial_tokens = tokens;

                    let stable_tokens = normalize_words(&stable);
                    record_locked_latencies(
                        &stable_tokens,
                        &mut seen_locked_count,
                        &word_spoken_ms,
                        audio_clock_ms + elapsed_ms as f32,
                        &mut locked_word_latencies,
                    );
                }
                StreamEvent::Final { text, speaker_id } => {
                    infer_calls += 1;
                    let tokens = normalize_words(&text);
                    if !tokens.is_empty() && first_text_latency_ms.is_none() {
                        first_text_latency_ms =
                            Some((audio_clock_ms + elapsed_ms as f32 - speech_onset_ms).max(0.0));
                    }
                    record_locked_latencies(
                        &tokens,
                        &mut seen_locked_count,
                        &word_spoken_ms,
                        audio_clock_ms + elapsed_ms as f32,
                        &mut locked_word_latencies,
                    );
                    prev_partial_tokens.clear();
                    final_segments.push(text);
                    if let Some(sid) = speaker_id {
                        if !detected_speakers.contains(&sid) {
                            detected_speakers.push(sid);
                        }
                    }
                }
            }
        }
    }

    // Flush any remaining buffered speech at end of WAV.
    let end_clock_ms = padded.len() as f32 * 1000.0 / AUDIO_SAMPLE_RATE as f32;
    events.clear();
    let t0 = Instant::now();
    decoder.flush(
        denoiser.as_deref_mut(),
        asr,
        speaker.as_deref_mut(),
        &mut events,
    )?;
    let flush_ms = t0.elapsed().as_secs_f64() * 1000.0;
    total_compute_ms += flush_ms;
    for ev in events.drain(..) {
        if let StreamEvent::Final { text, speaker_id } = ev {
            infer_calls += 1;
            let tokens = normalize_words(&text);
            record_locked_latencies(
                &tokens,
                &mut seen_locked_count,
                &word_spoken_ms,
                end_clock_ms + flush_ms as f32,
                &mut locked_word_latencies,
            );
            final_segments.push(text);
            if let Some(sid) = speaker_id {
                if !detected_speakers.contains(&sid) {
                    detected_speakers.push(sid);
                }
            }
        }
    }

    // Optional local LLM phonetic polish pass on finalized segments (measuring exact WER & latency delta).
    if let Some(polisher) = llm {
        let hotwords = load_hotwords();
        let mut ctx: Vec<String> = Vec::new();
        for seg in &mut final_segments {
            let t_llm = Instant::now();
            if let Ok(Some(fixed)) = polisher.polish(seg, &ctx, &hotwords) {
                *seg = fixed;
            }
            total_compute_ms += t_llm.elapsed().as_secs_f64() * 1000.0;
            ctx.push(seg.clone());
        }
    }

    let hypothesis = final_segments.join(" ");
    let wer_pct = compute_wer_pct(&fixture.transcript, &hypothesis);
    let cer_pct = compute_cer_pct(&fixture.transcript, &hypothesis);

    let median_lock_ms = if locked_word_latencies.is_empty() {
        first_text_latency_ms.unwrap_or(0.0)
    } else {
        locked_word_latencies.sort_by(|a, b| a.total_cmp(b));
        locked_word_latencies[locked_word_latencies.len() / 2]
    };

    let audio_dur_ms = padded.len() as f64 * 1000.0 / AUDIO_SAMPLE_RATE as f64;
    let rtf = (total_compute_ms / audio_dur_ms.max(1.0)) as f32;
    let avg_infer_ms = (total_compute_ms / infer_calls.max(1) as f64) as f32;
    let flicker_pct = if partial_updates == 0 {
        0.0
    } else {
        (partial_flickers as f32 / partial_updates as f32) * 100.0
    };

    Ok(BenchResult {
        engine: engine_label.to_string(),
        denoise_label: denoise_label.to_string(),
        fixture: fixture.name.clone(),
        noise: noise.map(|n| n.name.clone()).unwrap_or_else(|| "clean".to_string()),
        snr_label: match snr_db {
            None => "clean".to_string(),
            Some(db) => format!("{db:+.0}dB"),
        },
        wer_pct,
        cer_pct,
        first_text_ms: first_text_latency_ms.unwrap_or(0.0),
        word_lock_ms: median_lock_ms,
        flicker_pct,
        rtf,
        avg_infer_ms,
        speakers_detected: detected_speakers.len(),
        hypothesis,
    })
}

fn record_locked_latencies(
    tokens: &[String],
    seen_count: &mut usize,
    ref_timeline: &[(String, f32)],
    now_ms: f32,
    out_latencies: &mut Vec<f32>,
) {
    if tokens.len() <= *seen_count {
        return;
    }
    for i in *seen_count..tokens.len() {
        let spoken_ms = ref_timeline
            .get(i)
            .map(|(_, t)| *t)
            .or_else(|| ref_timeline.last().map(|(_, t)| *t))
            .unwrap_or(0.0);
        out_latencies.push((now_ms - spoken_ms).max(0.0));
    }
    *seen_count = tokens.len();
}

pub fn normalize_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(norm_word)
        .filter(|w| !w.is_empty())
        .collect()
}

/// Computes Word Error Rate (%) via Levenshtein edit distance over normalized tokens.
pub fn compute_wer_pct(reference: &str, hypothesis: &str) -> f32 {
    let r = normalize_words(reference);
    let h = normalize_words(hypothesis);
    if r.is_empty() {
        return if h.is_empty() { 0.0 } else { 100.0 };
    }
    let dist = levenshtein(&r, &h);
    (dist as f32 / r.len() as f32) * 100.0
}

/// Computes Character Error Rate (%) over normalized space-joined text.
pub fn compute_cer_pct(reference: &str, hypothesis: &str) -> f32 {
    let r: Vec<char> = normalize_words(reference).join(" ").chars().collect();
    let h: Vec<char> = normalize_words(hypothesis).join(" ").chars().collect();
    if r.is_empty() {
        return if h.is_empty() { 0.0 } else { 100.0 };
    }
    let dist = levenshtein(&r, &h);
    (dist as f32 / r.len() as f32) * 100.0
}

fn levenshtein<T: PartialEq>(a: &[T], b: &[T]) -> usize {
    let m = b.len();
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut curr = vec![0usize; m + 1];
    for (i, ai) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, bj) in b.iter().enumerate() {
            let cost = usize::from(ai != bj);
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
}

// ============================================================================
// Fixture Loader & Auto-Generator (Piper Multi-Speaker + Synthetic Cafe Noise)
// ============================================================================

/// Loads custom WAV+TXT fixtures from `bench_dir/speech` and noise WAVs from `bench_dir/noise`,
/// auto-generating realistic Piper speech + cafe/restaurant noise fixtures if none exist yet.
pub fn load_or_generate_fixtures(
    bench_dir: &Path,
    force_regen: bool,
) -> Result<(Vec<SpeechFixture>, Vec<NoiseFixture>), String> {
    let speech_dir = bench_dir.join("speech");
    let noise_dir = bench_dir.join("noise");
    fs::create_dir_all(&speech_dir).map_err(|e| format!("mkdir speech failed: {e}"))?;
    fs::create_dir_all(&noise_dir).map_err(|e| format!("mkdir noise failed: {e}"))?;

    let has_speech = dir_has_wav(&speech_dir);
    let has_noise = dir_has_wav(&noise_dir);

    if force_regen || !has_speech {
        generate_piper_speech_fixtures(&speech_dir)?;
    }
    if force_regen || !has_noise {
        generate_room_noise_fixtures(&noise_dir)?;
    }

    let speech = load_speech_dir(&speech_dir)?;
    let noise = load_noise_dir(&noise_dir)?;
    Ok((speech, noise))
}

fn dir_has_wav(dir: &Path) -> bool {
    fs::read_dir(dir)
        .ok()
        .map(|rd| {
            rd.flatten()
                .any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("wav"))
        })
        .unwrap_or(false)
}

fn load_speech_dir(dir: &Path) -> Result<Vec<SpeechFixture>, String> {
    let mut wavs: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("read_dir failed: {e}"))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("wav"))
        .collect();
    wavs.sort();

    let mut out = Vec::new();
    for wav_path in wavs {
        let txt_path = wav_path.with_extension("txt");
        if !txt_path.is_file() {
            continue;
        }
        let transcript = fs::read_to_string(&txt_path)
            .map_err(|e| format!("Failed reading {}: {e}", txt_path.display()))?
            .trim()
            .to_string();
        let bytes = fs::read(&wav_path)
            .map_err(|e| format!("Failed reading {}: {e}", wav_path.display()))?;
        let samples_16k = decode_wav_to_16k_mono(&bytes)?;
        let name = wav_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("clip")
            .to_string();
        let expected_speakers = if name.contains("group") { 3 } else { 1 };
        out.push(SpeechFixture {
            name,
            transcript,
            samples_16k,
            expected_speakers,
        });
    }
    Ok(out)
}

fn load_noise_dir(dir: &Path) -> Result<Vec<NoiseFixture>, String> {
    let mut wavs: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("read_dir failed: {e}"))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("wav"))
        .collect();
    wavs.sort();

    let mut out = Vec::new();
    for wav_path in wavs {
        let bytes = fs::read(&wav_path)
            .map_err(|e| format!("Failed reading {}: {e}", wav_path.display()))?;
        let samples_16k = decode_wav_to_16k_mono(&bytes)?;
        let name = wav_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("noise")
            .to_string();
        out.push(NoiseFixture { name, samples_16k });
    }
    Ok(out)
}

fn generate_piper_speech_fixtures(speech_dir: &Path) -> Result<(), String> {
    let piper = find_piper_exe()
        .ok_or_else(|| "Piper TTS not found to auto-generate speech fixtures".to_string())?;
    let voices_dir = find_piper_voices_dir()
        .ok_or_else(|| "Piper voices dir not found".to_string())?;

    let mut working_voices: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&voices_dir) {
        let mut paths: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("onnx"))
            .collect();
        paths.sort();
        for p in paths {
            if let Ok(probe) = synthesize_piper_wav(&piper, &p, "Hello.", 1.0) {
                if decode_wav_to_16k_mono(&probe).is_ok() {
                    let stem = p
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("voice")
                        .to_ascii_lowercase();
                    working_voices.push((stem, p));
                }
            }
        }
    }
    let any_voice = working_voices
        .first()
        .map(|(_, p)| p.clone())
        .ok_or_else(|| "No working Piper .onnx voices found".to_string())?;
    let pick_voice = |needle: &str, fallback_idx: usize| -> PathBuf {
        working_voices
            .iter()
            .find(|(k, _)| k.contains(needle))
            .map(|(_, v)| v.clone())
            .unwrap_or_else(|| {
                working_voices
                    .get(fallback_idx % working_voices.len())
                    .map(|(_, v)| v.clone())
                    .unwrap_or_else(|| any_voice.clone())
            })
    };

    let v_lessac = pick_voice("lessac", 0);
    let v_alan = pick_voice("alan", 1);
    let v_third = pick_voice("ryan", 0);

    // Fixture 1: 1-on-1 cafe order & conversation (numbers, fast consonants, natural phrasing)
    let f1_text = "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in fifteen minutes near the back patio.";
    let f1_wav = synthesize_piper_wav(&piper, &v_lessac, f1_text, 1.0)
        .map_err(|e| format!("Piper synth failed: {e}"))?;
    let f1_pcm = decode_wav_to_16k_mono(&f1_wav)?;
    fs::write(speech_dir.join("01_cafe_order.wav"), build_wav_16k_mono_f32(&f1_pcm))
        .map_err(|e| format!("write wav failed: {e}"))?;
    fs::write(speech_dir.join("01_cafe_order.txt"), f1_text)
        .map_err(|e| format!("write txt failed: {e}"))?;

    // Fixture 2: Group table conversation with distinct voices (tests speaker diarization too!)
    let turns = [
        (&v_lessac, "Did everyone get a chance to check the train schedule for tomorrow morning?"),
        (&v_alan, "Yeah, the express leaves at eight forty five from platform seven, so we should meet outside the station by eight twenty."),
        (&v_third, "Sounds good to me. I will grab coffee for the table before we head over."),
        (&v_alan, "Perfect, text me if traffic slows you down on the bridge."),
    ];
    let mut group_pcm: Vec<f32> = Vec::new();
    let mut group_texts: Vec<&str> = Vec::new();
    let pause = vec![0.0f32; (AUDIO_SAMPLE_RATE as usize * 75) / 100]; // 750ms turn gap
    for (idx, (voice, text)) in turns.iter().enumerate() {
        let wav = synthesize_piper_wav(&piper, voice, text, 1.0)
            .map_err(|e| format!("Piper group synth failed: {e}"))?;
        let pcm = decode_wav_to_16k_mono(&wav)?;
        if idx > 0 {
            group_pcm.extend_from_slice(&pause);
        }
        group_pcm.extend_from_slice(&pcm);
        group_texts.push(*text);
    }
    fs::write(speech_dir.join("02_group_table.wav"), build_wav_16k_mono_f32(&group_pcm))
        .map_err(|e| format!("write group wav failed: {e}"))?;
    fs::write(speech_dir.join("02_group_table.txt"), group_texts.join(" "))
        .map_err(|e| format!("write group txt failed: {e}"))?;

    Ok(())
}

/// Generates realistic noisy-room background overlays:
/// 1. `cafe_babble.wav`: overlapping muffled background voices + espresso steam + room rumble
/// 2. `restaurant_music_clatter.wav`: lounge music chords + clattering dishes/cutlery + ambient noise
fn generate_room_noise_fixtures(noise_dir: &Path) -> Result<(), String> {
    let dur_sec = 22usize;
    let total = dur_sec * AUDIO_SAMPLE_RATE as usize;

    // --- Noise 1: Restaurant lounge music + clatter + pink room floor ---
    let mut rng = 0x5EED_CAFEu64;
    let mut next_f32 = || -> f32 {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let u = ((rng >> 33) as u32) as f32 / (u32::MAX as f32);
        u * 2.0 - 1.0
    };

    let mut b0 = 0.0f32;
    let mut b1 = 0.0f32;
    let mut b2 = 0.0f32;
    let mut restaurant = vec![0.0f32; total];
    let chord_freqs = [
        [220.0f32, 261.63, 329.63, 392.0], // Am7
        [174.61, 220.0, 261.63, 329.63],   // Fmaj7
        [196.0, 246.94, 293.66, 392.0],    // G6
        [164.81, 196.0, 246.94, 329.63],   // Em7
    ];

    for (i, dst) in restaurant.iter_mut().enumerate() {
        let t = i as f32 / AUDIO_SAMPLE_RATE as f32;
        let w = next_f32();
        // Paul Kellet pink noise approximation (realistic room/HVAC floor)
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        let pink = (b0 + b1 + b2 + w * 0.1848) * 0.11;

        // Soft background lounge music chord progression + gentle beat pulse
        let chord = chord_freqs[((t / 2.5) as usize) % chord_freqs.len()];
        let beat_env = 0.65 + 0.35 * (2.0 * std::f32::consts::PI * 1.8 * t).sin().abs();
        let mut music = 0.0f32;
        for &f in &chord {
            music += (2.0 * std::f32::consts::PI * f * t).sin();
        }
        music *= 0.045 * beat_env;

        *dst = pink + music;
    }

    // Inject impulsive dish/cutlery clinks every ~1.3s
    let mut clink_pos = 8_000usize;
    while clink_pos + 2400 < total {
        let freq = 2100.0 + (next_f32().abs() * 2400.0);
        for k in 0..2400 {
            let tk = k as f32 / AUDIO_SAMPLE_RATE as f32;
            let env = (-tk * 38.0).exp();
            let ring = (2.0 * std::f32::consts::PI * freq * tk).sin()
                + 0.5 * (2.0 * std::f32::consts::PI * (freq * 1.47) * tk).sin();
            restaurant[clink_pos + k] += ring * env * 0.32;
        }
        clink_pos += 14_000 + ((next_f32().abs() * 18_000.0) as usize);
    }
    normalize_rms(&mut restaurant, 0.16);
    fs::write(
        noise_dir.join("restaurant_music_clatter.wav"),
        build_wav_16k_mono_f32(&restaurant),
    )
    .map_err(|e| format!("write restaurant noise failed: {e}"))?;

    // --- Noise 2: Cafe babble (overlapping muffled background chatter + espresso hiss) ---
    let mut babble = vec![0.0f32; total];
    // Start with warm pink cafe ambience + periodic espresso hiss
    let mut lp = 0.0f32;
    for (i, dst) in babble.iter_mut().enumerate() {
        let t = i as f32 / AUDIO_SAMPLE_RATE as f32;
        let w = next_f32();
        lp = lp * 0.88 + w * 0.12;
        let steam = if ((t as usize) % 7) == 3 {
            w * 0.09
        } else {
            0.0
        };
        *dst = lp * 0.25 + steam;
    }

    // Layer 3 overlapping Piper voices low-passed to simulate distant tables chattering!
    if let (Some(piper), Some(voices_dir)) = (find_piper_exe(), find_piper_voices_dir()) {
        let voices: Vec<PathBuf> = fs::read_dir(&voices_dir)
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("onnx"))
            .collect();
        let bg_scripts = [
            "We drove past the downtown market yesterday afternoon and found a really nice bakery right across from the park.",
            "Honestly I think the meeting got moved to Thursday because half the engineering team is traveling this week.",
            "Could you pass the napkins over here? The soup is delicious and the bread just came out of the oven.",
        ];
        for (idx, script) in bg_scripts.iter().enumerate() {
            if let Some(v) = voices.get(idx % voices.len().max(1)) {
                if let Ok(wav) = synthesize_piper_wav(&piper, v, script, 1.05 + 0.08 * idx as f64) {
                    if let Ok(mut pcm) = decode_wav_to_16k_mono(&wav) {
                        // Muffle distant chatter with 1-pole low-pass + simple echo tail.
                        let mut m = 0.0f32;
                        for s in &mut pcm {
                            m = m * 0.72 + *s * 0.28;
                            *s = m;
                        }
                        let offset = idx * 11_300;
                        for i in 0..total {
                            let src_i = (i + offset) % pcm.len().max(1);
                            babble[i] += pcm[src_i] * 0.42;
                        }
                    }
                }
            }
        }
    }
    normalize_rms(&mut babble, 0.16);
    fs::write(
        noise_dir.join("cafe_babble.wav"),
        build_wav_16k_mono_f32(&babble),
    )
    .map_err(|e| format!("write cafe babble noise failed: {e}"))?;

    Ok(())
}

fn normalize_rms(samples: &mut [f32], target_rms: f32) {
    let cur = active_rms(samples, 0.001).max(1e-5);
    let g = target_rms / cur;
    for s in samples.iter_mut() {
        *s = (*s * g).clamp(-0.95, 0.95);
    }
}
