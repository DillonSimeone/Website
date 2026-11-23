//! Discovers Piper executable & voices from ../speech-bridge/piper and generates target WAVs.

use crate::cards::{load_wav_mono, SoundCard, TargetFeatures};
use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone)]
pub struct PiperVoice {
    pub name: String,
    pub model_path: PathBuf,
}

pub fn app_root_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            // If running from target/release or target/debug, walk up to RustyVoiceCloner/
            if parent.ends_with("release") || parent.ends_with("debug") {
                if let Some(root) = parent.parent().and_then(|p| p.parent()) {
                    return root.to_path_buf();
                }
            }
            return parent.to_path_buf();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn speech_bridge_dir() -> Option<PathBuf> {
    let root = app_root_dir();
    let candidates = [
        root.join("..").join("speech-bridge"),
        root.join("speech-bridge"),
        PathBuf::from(r"C:\Users\Dillo\OneDrive\Desktop\Github\Website\public\Glue\RUST\speech-bridge"),
    ];
    candidates.into_iter().find(|p| p.join("piper").is_dir())
}

pub fn find_piper_exe() -> Option<PathBuf> {
    let sb = speech_bridge_dir()?;
    let candidates = [
        sb.join("piper").join("piper").join("piper.exe"),
        sb.join("piper").join("piper.exe"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

pub fn discover_piper_voices() -> Vec<PiperVoice> {
    let Some(sb) = speech_bridge_dir() else {
        return Vec::new();
    };
    let voices_dir = sb.join("piper").join("voices");
    let Ok(entries) = fs::read_dir(&voices_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("onnx") {
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("voice");
            let name = parse_piper_name(stem);
            out.push(PiperVoice { name, model_path: p });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn parse_piper_name(stem: &str) -> String {
    let parts: Vec<&str> = stem.split('-').collect();
    let raw = parts.get(1).copied().unwrap_or(stem);
    let mut chars = raw.chars();
    match chars.next() {
        Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
        None => raw.to_string(),
    }
}

pub fn ensure_card_target(
    piper_exe: &Path,
    voice: &PiperVoice,
    card: &mut SoundCard,
    cache_root: &Path,
) -> Result<(), String> {
    let voice_dir = cache_root.join(&voice.name);
    fs::create_dir_all(&voice_dir).map_err(|e| format!("cache dir error: {e}"))?;
    let wav_path = voice_dir.join(format!("{}.wav", card.id));

    if !wav_path.is_file() {
        let mut child = Command::new(piper_exe)
            .arg("--model")
            .arg(&voice.model_path)
            .arg("--output_file")
            .arg(&wav_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to spawn piper.exe: {e}"))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(card.piper_text.as_bytes());
        }
        let status = child.wait().map_err(|e| format!("piper wait failed: {e}"))?;
        if !status.success() {
            return Err(format!("piper exited with {status}"));
        }
    }

    let (samples, sr) = load_wav_mono(&wav_path)?;
    card.target = Some(TargetFeatures::from_samples(samples, sr));
    card.custom_wav_name = None;
    Ok(())
}
