//! Stitches captured sound-card takes into a clean reference WAV and invokes
//! openvoice_worker to extract the speaker tone-color embedding (.pth) into speech-bridge.

use crate::cards::{save_wav_mono, SoundCard};
use crate::dsp::{normalize_peak, SAMPLE_RATE};
use crate::piper_target::{app_root_dir, speech_bridge_dir};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn find_openvoice_python_and_worker() -> Option<(PathBuf, PathBuf)> {
    let root = app_root_dir();
    let candidates = [
        root.join("openvoice_worker"),
        PathBuf::from(
            r"C:\Users\Dillo\OneDrive\Desktop\Github\Website\public\Glue\RUST\RustyVoiceCloner\openvoice_worker",
        ),
    ];
    for dir in candidates {
        let py = dir.join(".venv").join("Scripts").join("python.exe");
        let worker = dir.join("worker.py");
        if py.is_file() && worker.is_file() {
            return Some((py, worker));
        }
    }
    None
}

pub fn cloned_voices_output_dir() -> PathBuf {
    if let Some(sb) = speech_bridge_dir() {
        sb.join("voices").join("cloned")
    } else {
        app_root_dir().join("cloned_voices")
    }
}

pub fn stitch_and_export_profile(profile_name: &str, cards: &[SoundCard]) -> Result<PathBuf, String> {
    let clean_name: String = profile_name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if clean_name.is_empty() {
        return Err("Profile name cannot be empty.".to_string());
    }

    let pad = vec![0.0f32; (SAMPLE_RATE as usize) * 150 / 1000]; // 150ms silence between clips
    let mut stitched: Vec<f32> = Vec::new();
    let mut count = 0usize;

    for card in cards {
        if let Some(take) = &card.best_take {
            if !take.samples.is_empty() {
                stitched.extend_from_slice(&take.samples);
                stitched.extend_from_slice(&pad);
                count += 1;
            }
        }
    }

    if count == 0 {
        return Err("Record at least one sound card before generating your voice!".to_string());
    }

    let normalized = normalize_peak(&stitched, 0.75);
    let out_dir = cloned_voices_output_dir();
    let ref_wav = out_dir.join(format!("{clean_name}_ref.wav"));
    let out_pth = out_dir.join(format!("{clean_name}.pth"));

    save_wav_mono(&ref_wav, &normalized, SAMPLE_RATE)?;

    let Some((py, worker)) = find_openvoice_python_and_worker() else {
        return Err(format!(
            "Saved reference WAV to {}, but OpenVoice v2 worker is not set up yet. Run openvoice_worker\\Setup.bat first!",
            ref_wav.display()
        ));
    };

    let output = Command::new(&py)
        .arg(&worker)
        .arg("--extract-se")
        .arg("--ref")
        .arg(&ref_wav)
        .arg("--out")
        .arg(&out_pth)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run OpenVoice worker: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("OpenVoice extraction failed:\n{stdout}\n{stderr}"));
    }

    Ok(out_pth)
}

pub fn check_openvoice_ready() -> bool {
    find_openvoice_python_and_worker()
        .and_then(|(_, worker)| worker.parent().map(|d| d.join("checkpoints_v2").join("converter").join("checkpoint.pth").is_file()))
        .unwrap_or(false)
}
