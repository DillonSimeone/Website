//! Local Text-to-Speech supporting Windows 11 WinRT voices + local Piper neural voices,
//! plus a sequential Voice Benchmark mode.

use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use windows::core::HSTRING;
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceInformation};
use windows::Storage::Streams::{DataReader, IInputStream};
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT, SND_SYNC};

use crate::ui::{WM_APP_BENCH_PROGRESS, WM_APP_TTS_STATUS};
use crate::win_util::{post_app_msg, resolve_asset_path, ComGuard, CREATE_NO_WINDOW};

#[derive(Clone)]
pub enum VoiceKind {
    WinRt { id: String },
    Piper { model_path: PathBuf },
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

/// Manages a background COM/WinRT + Piper worker thread for non-blocking speech synthesis.
pub struct TtsEngine {
    tx: Sender<TtsCommand>,
    cancel_flag: Arc<AtomicBool>,
    bench_status: Arc<Mutex<String>>,
}

impl TtsEngine {
    /// Spawns the TTS worker thread and returns a handle for queuing speech.
    pub fn new(notify_hwnd: isize) -> Self {
        let (tx, rx) = mpsc::channel::<TtsCommand>();
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let bench_status = Arc::new(Mutex::new(String::new()));
        let cancel_bg = Arc::clone(&cancel_flag);
        let status_bg = Arc::clone(&bench_status);

        thread::spawn(move || tts_worker_loop(rx, notify_hwnd, cancel_bg, status_bg));

        Self {
            tx,
            cancel_flag,
            bench_status,
        }
    }

    /// Queues text to be spoken with the given optional voice and speaking rate.
    pub fn speak(&self, text: String, voice: Option<VoiceEntry>, rate: f64) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        let _ = self.tx.send(TtsCommand::Speak { text, voice, rate });
    }

    /// Runs a sequential audition across all voices.
    pub fn benchmark(&self, voices: Vec<VoiceEntry>, sample_text: Option<String>, rate: f64) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        let _ = self.tx.send(TtsCommand::Benchmark {
            voices,
            sample_text,
            rate,
        });
    }

    /// Stops any currently playing speech or active benchmark.
    pub fn stop(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
        }
        let _ = self.tx.send(TtsCommand::Stop);
    }

    pub fn take_bench_status(&self) -> String {
        self.bench_status
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}

/// Lists all local Windows 11 OneCore voices + Piper neural voices.
pub fn list_local_voices() -> Vec<VoiceEntry> {
    let mut out = Vec::new();

    // Local Piper neural voices first (more natural)
    if let Some(voices_dir) = find_piper_voices_dir() {
        if let Ok(entries) = fs::read_dir(&voices_dir) {
            let mut paths: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("onnx"))
                .collect();
            paths.sort();
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
    voice: Option<&VoiceEntry>,
    text: &str,
    rate: f64,
) -> Vec<u8> {
    match voice.map(|v| &v.kind) {
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
) {
    let _com = ComGuard::mta();
    let synth = SpeechSynthesizer::new().ok();
    let piper_exe = find_piper_exe();
    let mut active_wav: Vec<u8> = Vec::new();

    while let Ok(cmd) = rx.recv() {
        match cmd {
            TtsCommand::Stop => {
                cancel_bg.store(true, Ordering::Relaxed);
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
                handle_benchmark(
                    notify_hwnd,
                    synth.as_ref(),
                    piper_exe.as_deref(),
                    &cancel_bg,
                    &status_bg,
                    &mut active_wav,
                    &voices,
                    sample_text.as_deref(),
                    rate,
                );
            }
        }
    }

    unsafe {
        let _ = PlaySoundW(None, None, SND_ASYNC);
    }
}

fn handle_speak(
    notify_hwnd: isize,
    synth: Option<&SpeechSynthesizer>,
    piper_exe: Option<&Path>,
    active_wav: &mut Vec<u8>,
    text: &str,
    voice: Option<&VoiceEntry>,
    rate: f64,
) {
    post_app_msg(notify_hwnd, WM_APP_TTS_STATUS, 1);
    let wav = synthesize_voice(synth, piper_exe, voice, text, rate);
    if !wav.is_empty() {
        unsafe {
            let _ = PlaySoundW(None, None, SND_ASYNC);
            *active_wav = wav;
            let ok = PlaySoundW(
                windows::core::PCWSTR(active_wav.as_ptr() as *const u16),
                None,
                SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
            )
            .as_bool();
            if !ok {
                active_wav.clear();
            }
        }
    }
    post_app_msg(notify_hwnd, WM_APP_TTS_STATUS, 0);
}

#[allow(clippy::too_many_arguments)]
fn handle_benchmark(
    notify_hwnd: isize,
    synth: Option<&SpeechSynthesizer>,
    piper_exe: Option<&Path>,
    cancel_bg: &AtomicBool,
    status_bg: &Mutex<String>,
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
        let wav = synthesize_voice(synth, piper_exe, Some(v), &phrase, rate);
        let ms = t0.elapsed().as_millis();
        if cancel_bg.load(Ordering::Relaxed) {
            break;
        }

        if let Ok(mut g) = status_bg.lock() {
            *g = format!(">> BENCH [{}/{}]: {} ({} ms)", idx + 1, total, v.display_name, ms);
        }
        post_app_msg(notify_hwnd, WM_APP_BENCH_PROGRESS, 1);

        if !wav.is_empty() {
            unsafe {
                *active_wav = wav;
                let _ = PlaySoundW(
                    windows::core::PCWSTR(active_wav.as_ptr() as *const u16),
                    None,
                    SND_MEMORY | SND_SYNC | SND_NODEFAULT,
                );
                active_wav.clear();
            }
        }
    }
    post_app_msg(notify_hwnd, WM_APP_BENCH_PROGRESS, 0);
}

fn synthesize_piper_wav(
    piper_exe: &Path,
    model_path: &Path,
    text: &str,
    rate: f64,
) -> std::io::Result<Vec<u8>> {
    let out_wav = std::env::temp_dir().join("speech_bridge_piper.wav");
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

fn find_piper_exe() -> Option<PathBuf> {
    resolve_asset_path(&["piper/piper/piper.exe", "piper/piper.exe"], false)
}

fn find_piper_voices_dir() -> Option<PathBuf> {
    resolve_asset_path(&["piper/voices"], true)
}
