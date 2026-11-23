//! Local Text-to-Speech supporting Windows 11 WinRT voices + local Piper neural voices,
//! plus a sequential Voice Benchmark mode.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use windows::core::HSTRING;
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Storage::Streams::{DataReader, IInputStream};
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT, SND_SYNC};

use crate::ui::{WM_APP_BENCH_PROGRESS, WM_APP_TTS_STATUS};
use crate::win_util::{post_app_msg, resolve_asset_path, ComGuard, CREATE_NO_WINDOW};

/// Tail suppression window (ms) after TTS stops playing to let room reverb decay.
const TTS_ECHO_TAIL_MS: u64 = 320;

/// Shared lock-free gate that tells the STT pipeline when outbound TTS is playing
/// (plus a brief room-reverb tail) so the laptop's own voice never echoes into HEARD.
pub struct TtsEchoGate {
    speaking: AtomicBool,
    mute_until_ms: AtomicU64,
}

impl TtsEchoGate {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            speaking: AtomicBool::new(false),
            mute_until_ms: AtomicU64::new(0),
        })
    }

    pub fn set_speaking(&self, active: bool) {
        self.speaking.store(active, Ordering::Release);
        if !active {
            self.mute_until_ms
                .store(now_epoch_ms().saturating_add(TTS_ECHO_TAIL_MS), Ordering::Release);
        }
    }

    pub fn is_gated(&self) -> bool {
        if self.speaking.load(Ordering::Acquire) {
            return true;
        }
        now_epoch_ms() < self.mute_until_ms.load(Ordering::Acquire)
    }
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Clone)]
pub enum VoiceKind {
    WinRt { id: String },
    Piper { model_path: PathBuf },
    PiperCloned {
        model_path: PathBuf,
        se_path: PathBuf,
        src_key: String,
    },
}

/// Metadata for a local Windows 11 or Piper neural voice.
#[derive(Clone)]
pub struct VoiceEntry {
    pub display_name: String,
    pub language: String,
    pub kind: VoiceKind,
}

enum TtsCommand {
    Speak {
        text: String,
        voice: Option<VoiceEntry>,
        rate: f64,
    },
    Benchmark {
        voices: Vec<VoiceEntry>,
        sample_text: Option<String>,
        rate: f64,
    },
    Stop,
}

/// Tracks real-time word-by-word progress during TTS WAV playback so the UI can
/// bold and underline the exact word currently being spoken aloud.
struct WordSchedule {
    started_at: Instant,
    word_ends_ms: Vec<u64>,
}

pub struct TtsWordTracker {
    active: AtomicBool,
    schedule: Mutex<Option<WordSchedule>>,
}

impl TtsWordTracker {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            active: AtomicBool::new(false),
            schedule: Mutex::new(None),
        })
    }

    fn begin(&self, text: &str, wav: &[u8]) {
        let (start_ms, end_ms) = parse_wav_speech_span_ms(wav);
        let word_ends_ms = build_word_schedule_ms(text, start_ms, end_ms);
        if word_ends_ms.is_empty() {
            self.clear();
            return;
        }
        if let Ok(mut g) = self.schedule.lock() {
            *g = Some(WordSchedule {
                started_at: Instant::now(),
                word_ends_ms,
            });
        }
        self.active.store(true, Ordering::Release);
    }

    fn clear(&self) {
        self.active.store(false, Ordering::Release);
        if let Ok(mut g) = self.schedule.lock() {
            *g = None;
        }
    }

    pub fn current_word_index(&self) -> Option<usize> {
        if !self.active.load(Ordering::Acquire) {
            return None;
        }
        let g = self.schedule.lock().ok()?;
        let sched = g.as_ref()?;
        if sched.word_ends_ms.is_empty() {
            return None;
        }
        let elapsed = sched.started_at.elapsed().as_millis() as u64;
        for (idx, &end_ms) in sched.word_ends_ms.iter().enumerate() {
            if elapsed < end_ms {
                return Some(idx);
            }
        }
        Some(sched.word_ends_ms.len().saturating_sub(1))
    }
}

/// Inspects an in-memory PCM WAV buffer to find the active speech span `(start_ms, end_ms)`,
/// trimming leading/trailing synthesis silence so word highlights stay tightly synced to audio.
fn parse_wav_speech_span_ms(wav: &[u8]) -> (u64, u64) {
    if wav.len() < 44 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return (0, 0);
    }
    let mut pos = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 1u16;
    let mut bits_per_sample = 16u16;
    let mut data_slice: &[u8] = &[];

    while pos + 8 <= wav.len() {
        let id = &wav[pos..pos + 4];
        let sz = u32::from_le_bytes([wav[pos + 4], wav[pos + 5], wav[pos + 6], wav[pos + 7]]) as usize;
        let body_start = pos + 8;
        let body_end = body_start.saturating_add(sz).min(wav.len());
        if id == b"fmt " && body_end >= body_start + 16 {
            channels = u16::from_le_bytes([wav[body_start + 2], wav[body_start + 3]]).max(1);
            sample_rate = u32::from_le_bytes([
                wav[body_start + 4],
                wav[body_start + 5],
                wav[body_start + 6],
                wav[body_start + 7],
            ]);
            bits_per_sample = u16::from_le_bytes([wav[body_start + 14], wav[body_start + 15]]);
        } else if id == b"data" {
            data_slice = &wav[body_start..body_end];
            break;
        }
        pos = body_end + (sz & 1);
    }

    if sample_rate == 0 || bits_per_sample == 0 || data_slice.is_empty() {
        return (0, 0);
    }
    let bytes_per_frame = ((bits_per_sample as usize / 8) * channels as usize).max(1);
    let total_frames = data_slice.len() / bytes_per_frame;
    let total_ms = (total_frames as u64 * 1000) / sample_rate as u64;
    if bits_per_sample != 16 || total_frames == 0 {
        return (0, total_ms);
    }

    // Scan 10 ms windows to trim leading/trailing silence in synthesized audio.
    let win_frames = ((sample_rate as usize) / 100).max(1);
    let num_wins = total_frames / win_frames;
    if num_wins < 4 {
        return (0, total_ms);
    }

    let mut peak_rms = 0.0f32;
    let mut rms_vals = Vec::with_capacity(num_wins);
    for w in 0..num_wins {
        let f0 = w * win_frames;
        let mut sum_sq = 0.0f64;
        for f in 0..win_frames {
            let off = (f0 + f) * bytes_per_frame;
            let s = i16::from_le_bytes([data_slice[off], data_slice[off + 1]]) as f64;
            sum_sq += s * s;
        }
        let rms = (sum_sq / win_frames as f64).sqrt() as f32;
        if rms > peak_rms {
            peak_rms = rms;
        }
        rms_vals.push(rms);
    }

    let thresh = (peak_rms * 0.035).max(180.0);
    let first_voiced = rms_vals.iter().position(|&r| r >= thresh).unwrap_or(0);
    let last_voiced = rms_vals.iter().rposition(|&r| r >= thresh).unwrap_or(num_wins - 1);
    if last_voiced <= first_voiced {
        return (0, total_ms);
    }
    let start_ms = (first_voiced as u64) * 10;
    let end_ms = (((last_voiced + 1) as u64) * 10).min(total_ms);
    (start_ms, end_ms)
}

/// Distributes `[start_ms .. end_ms]` across whitespace-delimited words weighted by phonetic length
/// and punctuation pauses so each word's active interval tracks natural spoken cadence.
fn build_word_schedule_ms(text: &str, start_ms: u64, end_ms: u64) -> Vec<u64> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let span = end_ms.saturating_sub(start_ms).max((words.len() as u64) * 180);
    let last_idx = words.len() - 1;
    let mut weights = Vec::with_capacity(words.len());
    let mut total_w = 0.0f64;

    for (i, w) in words.iter().enumerate() {
        let alpha = w.chars().filter(|c| c.is_alphanumeric()).count() as f64;
        let mut weight = alpha.max(1.5) + 1.4;
        if i < last_idx {
            if let Some(last_ch) = w.chars().last() {
                match last_ch {
                    ',' | ';' | ':' => weight += 2.2,
                    '.' | '!' | '?' => weight += 4.2,
                    _ => {}
                }
            }
        }
        total_w += weight;
        weights.push(weight);
    }

    let mut ends = Vec::with_capacity(words.len());
    let mut acc = 0.0f64;
    for w in weights {
        acc += w;
        let t = start_ms + ((acc / total_w) * span as f64).round() as u64;
        ends.push(t);
    }
    ends
}

/// Manages a background COM/WinRT + Piper worker thread for non-blocking speech synthesis.
pub struct TtsEngine {
    tx: Sender<TtsCommand>,
    cancel_flag: Arc<AtomicBool>,
    bench_status: Arc<Mutex<String>>,
    echo_gate: Arc<TtsEchoGate>,
    word_tracker: Arc<TtsWordTracker>,
}

impl TtsEngine {
    /// Spawns the TTS worker thread and returns a handle for queuing speech.
    pub fn new(notify_hwnd: isize, echo_gate: Arc<TtsEchoGate>) -> Self {
        let (tx, rx) = mpsc::channel::<TtsCommand>();
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let bench_status = Arc::new(Mutex::new(String::new()));
        let word_tracker = TtsWordTracker::new();
        let cancel_bg = Arc::clone(&cancel_flag);
        let status_bg = Arc::clone(&bench_status);
        let gate_bg = Arc::clone(&echo_gate);
        let tracker_bg = Arc::clone(&word_tracker);

        thread::spawn(move || {
            tts_worker_loop(rx, notify_hwnd, cancel_bg, status_bg, gate_bg, tracker_bg)
        });

        Self {
            tx,
            cancel_flag,
            bench_status,
            echo_gate,
            word_tracker,
        }
    }

    /// Returns the 0-based word index currently being spoken aloud, if any.
    pub fn current_word_index(&self) -> Option<usize> {
        self.word_tracker.current_word_index()
    }

    /// Queues text to be spoken with the given optional voice and speaking rate.
    pub fn speak(&self, text: String, voice: Option<VoiceEntry>, rate: f64) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        self.word_tracker.clear();
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
        }
        let _ = self.tx.send(TtsCommand::Speak { text, voice, rate });
    }

    /// Runs a sequential audition across all voices.
    pub fn benchmark(&self, voices: Vec<VoiceEntry>, sample_text: Option<String>, rate: f64) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        self.word_tracker.clear();
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
        }
        let _ = self.tx.send(TtsCommand::Benchmark {
            voices,
            sample_text,
            rate,
        });
    }

    /// Stops any currently playing speech or active benchmark.
    pub fn stop(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        self.word_tracker.clear();
        self.echo_gate.set_speaking(false);
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
        }
        let _ = self.tx.send(TtsCommand::Stop);
    }

    pub fn take_bench_status(&self) -> String {
        self.bench_status
            .lock()
            .map(|mut g| std::mem::take(&mut *g))
            .unwrap_or_default()
    }
}

/// Lists all local cloned Piper voices, Piper neural voices, and Windows 11 OneCore voices.
pub fn list_local_voices() -> Vec<VoiceEntry> {
    let mut out = Vec::new();
    let cloned_profiles = find_cloned_profiles();

    // Local Piper neural voices (+ cloned variants if any .pth profiles exist)
    if let Some(voices_dir) = find_piper_voices_dir() {
        if let Ok(entries) = fs::read_dir(&voices_dir) {
            let mut paths: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("onnx"))
                .collect();
            paths.sort();

            for (profile_name, se_path) in &cloned_profiles {
                for p in &paths {
                    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("piper");
                    let (lang, name) = parse_piper_stem(stem);
                    out.push(VoiceEntry {
                        display_name: format!("{name}-{profile_name}"),
                        language: lang,
                        kind: VoiceKind::PiperCloned {
                            model_path: p.clone(),
                            se_path: se_path.clone(),
                            src_key: name,
                        },
                    });
                }
            }

            for p in paths {
                let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("piper");
                let (lang, name) = parse_piper_stem(stem);
                out.push(VoiceEntry {
                    display_name: format!("Neural {name}"),
                    language: lang,
                    kind: VoiceKind::Piper { model_path: p },
                });
            }
        }
    }

    // Windows 11 OneCore voices
    if let Ok(voices) = SpeechSynthesizer::AllVoices() {
        for voice in voices {
            if let Some(entry) = winrt_voice_to_entry(&voice) {
                out.push(entry);
            }
        }
    }

    out
}

fn parse_piper_stem(stem: &str) -> (String, String) {
    // e.g. "en_US-lessac-medium" -> ("en-US", "Lessac")
    let parts: Vec<&str> = stem.split('-').collect();
    let lang = parts
        .first()
        .map(|s| s.replace('_', "-"))
        .unwrap_or_else(|| "en-US".to_string());
    let raw_name = parts.get(1).copied().unwrap_or(stem);
    let mut chars = raw_name.chars();
    let cap = match chars.next() {
        Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
        None => raw_name.to_string(),
    };
    (lang, cap)
}

fn winrt_voice_to_entry(voice: &VoiceInformation) -> Option<VoiceEntry> {
    let display_name = voice.DisplayName().ok()?.to_string_lossy();
    let language = voice.Language().ok()?.to_string_lossy();
    let id = voice.Id().ok()?.to_string_lossy();
    Some(VoiceEntry {
        display_name,
        language,
        kind: VoiceKind::WinRt { id },
    })
}

fn synthesize_voice(
    synth: Option<&SpeechSynthesizer>,
    piper_exe: Option<&Path>,
    openvoice: &mut Option<OpenVoiceDaemon>,
    voice: Option<&VoiceEntry>,
    text: &str,
    rate: f64,
) -> Vec<u8> {
    match voice.map(|v| &v.kind) {
        Some(VoiceKind::PiperCloned {
            model_path,
            se_path,
            src_key,
        }) => {
            let Some(exe) = piper_exe else {
                return Vec::new();
            };
            let Ok(piper_wav) = synthesize_piper_wav(exe, model_path, text, rate) else {
                return Vec::new();
            };
            if openvoice.is_none() {
                *openvoice = OpenVoiceDaemon::spawn().ok();
            }
            if let Some(ov) = openvoice.as_mut() {
                if let Ok(converted) = ov.convert_wav(&piper_wav, src_key, se_path) {
                    return converted;
                }
            }
            // Fallback to raw Piper WAV if OpenVoice sidecar is not installed
            piper_wav
        }
        Some(VoiceKind::Piper { model_path }) => piper_exe
            .and_then(|exe| synthesize_piper_wav(exe, model_path, text, rate).ok())
            .unwrap_or_default(),
        other => {
            let Some(synth) = synth else {
                return Vec::new();
            };
            if let Some(VoiceKind::WinRt { id }) = other {
                if let Ok(voices) = SpeechSynthesizer::AllVoices() {
                    for v in voices {
                        if v.Id().map(|vid| vid.to_string_lossy() == *id).unwrap_or(false) {
                            let _ = synth.SetVoice(&v);
                            break;
                        }
                    }
                }
            }
            if let Ok(opts) = synth.Options() {
                let _ = opts.SetSpeakingRate(rate);
            }
            synthesize_winrt_wav(synth, text).unwrap_or_default()
        }
    }
}

fn tts_worker_loop(
    rx: Receiver<TtsCommand>,
    notify_hwnd: isize,
    cancel_bg: Arc<AtomicBool>,
    status_bg: Arc<Mutex<String>>,
    echo_gate: Arc<TtsEchoGate>,
    word_tracker: Arc<TtsWordTracker>,
) {
    let _com = ComGuard::mta();
    let synth = SpeechSynthesizer::new().ok();
    let piper_exe = find_piper_exe();
    let mut openvoice: Option<OpenVoiceDaemon> = None;
    let mut active_wav: Vec<u8> = Vec::new();

    while let Ok(cmd) = rx.recv() {
        match cmd {
            TtsCommand::Stop => {
                cancel_bg.store(true, Ordering::Relaxed);
                word_tracker.clear();
                echo_gate.set_speaking(false);
                unsafe {
                    let _ = PlaySoundW(None, None, SND_ASYNC);
                }
                active_wav.clear();
                post_app_msg(notify_hwnd, WM_APP_TTS_STATUS, 0);
            }
            TtsCommand::Speak { text, voice, rate } => {
                cancel_bg.store(false, Ordering::Relaxed);
                handle_speak(
                    notify_hwnd,
                    synth.as_ref(),
                    piper_exe.as_deref(),
                    &mut openvoice,
                    &echo_gate,
                    &word_tracker,
                    &mut active_wav,
                    &text,
                    voice.as_ref(),
                    rate,
                );
            }
            TtsCommand::Benchmark {
                voices,
                sample_text,
                rate,
            } => {
                cancel_bg.store(false, Ordering::Relaxed);
                word_tracker.clear();
                handle_benchmark(
                    notify_hwnd,
                    synth.as_ref(),
                    piper_exe.as_deref(),
                    &mut openvoice,
                    &cancel_bg,
                    &status_bg,
                    &echo_gate,
                    &mut active_wav,
                    &voices,
                    sample_text.as_deref(),
                    rate,
                );
            }
        }
    }

    if let Some(mut ov) = openvoice.take() {
        ov.shutdown();
    }
    word_tracker.clear();
    echo_gate.set_speaking(false);
    unsafe {
        let _ = PlaySoundW(None, None, SND_ASYNC);
    }
}

#[allow(clippy::too_many_arguments)]
fn handle_speak(
    notify_hwnd: isize,
    synth: Option<&SpeechSynthesizer>,
    piper_exe: Option<&Path>,
    openvoice: &mut Option<OpenVoiceDaemon>,
    echo_gate: &TtsEchoGate,
    word_tracker: &TtsWordTracker,
    active_wav: &mut Vec<u8>,
    text: &str,
    voice: Option<&VoiceEntry>,
    rate: f64,
) {
    post_app_msg(notify_hwnd, WM_APP_TTS_STATUS, 1);
    let wav = synthesize_voice(synth, piper_exe, openvoice, voice, text, rate);
    if !wav.is_empty() {
        echo_gate.set_speaking(true);
        word_tracker.begin(text, &wav);
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
            *active_wav = wav;
            let _ = PlaySoundW(
                windows::core::PCWSTR(active_wav.as_ptr() as *const u16),
                None,
                SND_MEMORY | SND_SYNC | SND_NODEFAULT,
            );
            active_wav.clear();
        }
        word_tracker.clear();
        echo_gate.set_speaking(false);
    }
    post_app_msg(notify_hwnd, WM_APP_TTS_STATUS, 0);
}

#[allow(clippy::too_many_arguments)]
fn handle_benchmark(
    notify_hwnd: isize,
    synth: Option<&SpeechSynthesizer>,
    piper_exe: Option<&Path>,
    openvoice: &mut Option<OpenVoiceDaemon>,
    cancel_bg: &AtomicBool,
    status_bg: &Mutex<String>,
    echo_gate: &TtsEchoGate,
    active_wav: &mut Vec<u8>,
    voices: &[VoiceEntry],
    sample_text: Option<&str>,
    rate: f64,
) {
    let total = voices.len();
    for (idx, v) in voices.iter().enumerate() {
        if cancel_bg.load(Ordering::Relaxed) {
            break;
        }
        let phrase = match sample_text {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => format!(
                "Voice {} of {}: {}. Ready for conversation.",
                idx + 1,
                total,
                v.display_name
            ),
        };
        let t0 = Instant::now();
        let wav = synthesize_voice(synth, piper_exe, openvoice, Some(v), &phrase, rate);
        let ms = t0.elapsed().as_millis();
        if cancel_bg.load(Ordering::Relaxed) {
            break;
        }

        if let Ok(mut g) = status_bg.lock() {
            *g = format!(">> BENCH [{}/{}]: {} ({} ms)", idx + 1, total, v.display_name, ms);
        }
        post_app_msg(notify_hwnd, WM_APP_BENCH_PROGRESS, 1);

        if !wav.is_empty() {
            echo_gate.set_speaking(true);
            unsafe {
                *active_wav = wav;
                let _ = PlaySoundW(
                    windows::core::PCWSTR(active_wav.as_ptr() as *const u16),
                    None,
                    SND_MEMORY | SND_SYNC | SND_NODEFAULT,
                );
                active_wav.clear();
            }
            echo_gate.set_speaking(false);
        }
    }
    post_app_msg(notify_hwnd, WM_APP_BENCH_PROGRESS, 0);
}

pub fn synthesize_piper_wav(
    piper_exe: &Path,
    model_path: &Path,
    text: &str,
    rate: f64,
) -> std::io::Result<Vec<u8>> {
    let tid = format!("{:?}", thread::current().id())
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>();
    let out_wav = std::env::temp_dir().join(format!("speech_bridge_piper_{tid}.wav"));
    let length_scale = (1.0 / rate.clamp(0.5, 2.0)).to_string();
    let mut child = Command::new(piper_exe)
        .arg("--model")
        .arg(model_path)
        .arg("--length_scale")
        .arg(&length_scale)
        .arg("--output_file")
        .arg(&out_wav)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    let status = child.wait()?;
    if !status.success() {
        return Ok(Vec::new());
    }
    fs::read(&out_wav)
}

fn synthesize_winrt_wav(synth: &SpeechSynthesizer, text: &str) -> windows::core::Result<Vec<u8>> {
    let htext = HSTRING::from(text);
    let stream = synth.SynthesizeTextToStreamAsync(&htext)?.get()?;
    let size = stream.Size()? as u32;
    if size == 0 {
        return Ok(Vec::new());
    }
    let input_stream: IInputStream = stream.GetInputStreamAt(0)?;
    let reader = DataReader::CreateDataReader(&input_stream)?;
    let loaded = reader.LoadAsync(size)?.get()?;
    let mut buf = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buf)?;
    Ok(buf)
}

pub fn find_piper_exe() -> Option<PathBuf> {
    resolve_asset_path(&["piper/piper/piper.exe", "piper/piper.exe"], false)
}

pub fn find_piper_voices_dir() -> Option<PathBuf> {
    resolve_asset_path(&["piper/voices"], true)
}

fn find_cloned_profiles() -> Vec<(String, PathBuf)> {
    let Some(dir) = resolve_asset_path(&["voices/cloned", "piper/cloned"], true) else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("pth") {
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                out.push((stem.to_string(), p));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

fn find_openvoice_worker() -> Option<(PathBuf, PathBuf)> {
    let worker_dir = resolve_asset_path(
        &[
            "openvoice_worker",
            "../RustyVoiceCloner/openvoice_worker",
        ],
        true,
    )?;
    let py = worker_dir.join(".venv").join("Scripts").join("python.exe");
    let script = worker_dir.join("worker.py");
    if py.is_file() && script.is_file() {
        Some((py, script))
    } else {
        None
    }
}

fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

struct OpenVoiceDaemon {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl OpenVoiceDaemon {
    fn spawn() -> Result<Self, String> {
        let (py, script) = find_openvoice_worker()
            .ok_or_else(|| "OpenVoice worker not found".to_string())?;
        let mut child = Command::new(&py)
            .arg(&script)
            .arg("--daemon")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to spawn OpenVoice daemon: {e}"))?;

        let stdin = child.stdin.take().ok_or("Missing OpenVoice stdin")?;
        let stdout_raw = child.stdout.take().ok_or("Missing OpenVoice stdout")?;
        let mut stdout = BufReader::new(stdout_raw);

        let mut ready_line = String::new();
        stdout
            .read_line(&mut ready_line)
            .map_err(|e| format!("Failed reading OpenVoice ready line: {e}"))?;
        if !ready_line.contains("\"ready\"") {
            let _ = child.kill();
            return Err(format!("OpenVoice failed to start: {ready_line}"));
        }

        Ok(Self {
            child,
            stdin,
            stdout,
        })
    }

    fn convert_wav(&mut self, piper_wav: &[u8], src_key: &str, tgt_se: &Path) -> Result<Vec<u8>, String> {
        let tid = now_epoch_ms();
        let src_path = std::env::temp_dir().join(format!("sb_ov_src_{tid}.wav"));
        let out_path = std::env::temp_dir().join(format!("sb_ov_out_{tid}.wav"));
        fs::write(&src_path, piper_wav).map_err(|e| format!("write src wav: {e}"))?;

        let cmd = format!(
            "{{\"cmd\":\"convert\",\"src_wav\":\"{}\",\"src_key\":\"{}\",\"tgt_se\":\"{}\",\"out_wav\":\"{}\"}}\n",
            json_escape(&src_path.to_string_lossy()),
            json_escape(src_key),
            json_escape(&tgt_se.to_string_lossy()),
            json_escape(&out_path.to_string_lossy()),
        );
        self.stdin
            .write_all(cmd.as_bytes())
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("write cmd: {e}"))?;

        let mut resp_line = String::new();
        self.stdout
            .read_line(&mut resp_line)
            .map_err(|e| format!("read resp: {e}"))?;

        let _ = fs::remove_file(&src_path);
        if !resp_line.contains("\"ok\": true") && !resp_line.contains("\"ok\":true") {
            let _ = fs::remove_file(&out_path);
            return Err(format!("OpenVoice convert failed: {resp_line}"));
        }

        let bytes = fs::read(&out_path).map_err(|e| format!("read out wav: {e}"))?;
        let _ = fs::remove_file(&out_path);
        Ok(bytes)
    }

    fn shutdown(&mut self) {
        let _ = self.stdin.write_all(b"{\"cmd\":\"quit\"}\n");
        let _ = self.stdin.flush();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_schedule_is_monotonic_and_respects_punctuation() {
        let ends = build_word_schedule_ms("Wait, can you repeat that?", 100, 1600);
        assert_eq!(ends.len(), 5);
        assert!(ends.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(*ends.last().unwrap(), 1600);
        // Comma word ("Wait,") should get more duration than a short plain word ("can")
        let d_wait = ends[0] - 100;
        let d_can = ends[1] - ends[0];
        assert!(d_wait > d_can);
    }
}
