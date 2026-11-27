//! Guided sound cards for visual voice mimicry, with physical mouth/throat cues.

use crate::dsp::{
    compute_average_spectrum, compute_envelope, compute_pitch_contour, median_nonzero,
    resample_linear, trim_silence, SAMPLE_RATE, SPECTRUM_BANDS,
};
use std::path::Path;

#[derive(Clone)]
pub struct TargetFeatures {
    pub samples: Vec<f32>,
    pub envelope: Vec<f32>,
    pub pitch_contour: Vec<f32>,
    pub median_pitch_hz: Option<f32>,
    pub avg_spectrum: [f32; SPECTRUM_BANDS],
    #[allow(dead_code)]
    pub duration_secs: f32,
}

impl TargetFeatures {
    pub fn from_samples(raw_samples: Vec<f32>, src_rate: u32) -> Self {
        let resampled = resample_linear(&raw_samples, src_rate, SAMPLE_RATE);
        let trimmed = trim_silence(&resampled, 0.008);
        let samples = if trimmed.is_empty() { resampled } else { trimmed };
        let hop = 512;
        let envelope = compute_envelope(&samples, hop, true);
        let pitch_contour = compute_pitch_contour(&samples, hop, SAMPLE_RATE);
        let median_pitch_hz = median_nonzero(&pitch_contour);
        let avg_spectrum = compute_average_spectrum(&samples, SAMPLE_RATE);
        let duration_secs = samples.len() as f32 / SAMPLE_RATE as f32;
        Self {
            samples,
            envelope,
            pitch_contour,
            median_pitch_hz,
            avg_spectrum,
            duration_secs,
        }
    }
}

#[derive(Clone)]
pub struct BestTake {
    pub samples: Vec<f32>,
    pub score: f32,
}

#[derive(Clone)]
pub struct SoundCard {
    pub id: &'static str,
    pub title: &'static str,
    pub cue: &'static str,
    pub piper_text: &'static str,
    pub target: Option<TargetFeatures>,
    pub custom_wav_name: Option<String>,
    pub best_take: Option<BestTake>,
}

pub fn default_cards() -> Vec<SoundCard> {
    vec![
        SoundCard {
            id: "01_hum_mmm",
            title: "1. Hum (Mmm)",
            cue: "Close your lips gently and hum. Feel a steady buzz in your lips and nose.",
            piper_text: "mmmmmm.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "02_vowel_ah",
            title: "2. Open Ah",
            cue: "Drop your jaw wide open with a relaxed tongue, steady breath from your chest.",
            piper_text: "aaaaah.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "03_vowel_ee",
            title: "3. Smile Ee",
            cue: "Pull the corners of your mouth slightly back like a smile, tongue high near the roof.",
            piper_text: "eeeeee.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "04_vowel_oo",
            title: "4. Round Oo",
            cue: "Purse your lips into a small tight circle, as if blowing through a straw.",
            piper_text: "oooooo.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "05_vowel_oh",
            title: "5. Open Oh",
            cue: "Make a medium 'O' shape with your lips, slightly more open than 'Oo'.",
            piper_text: "oooooh.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "06_breath_sh",
            title: "6. Soft Sh",
            cue: "Teeth gently together, lips slightly forward, push steady air (no throat vibration).",
            piper_text: "shhhhh.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "07_syllable_mah",
            title: "7. Syllable: Mah",
            cue: "Start with lips closed (Mmm) for a moment, then open your jaw into Ah.",
            piper_text: "mah, mah.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "08_word_hello",
            title: "8. Word: Hello",
            cue: "Two-part wave: soft breathy start rising into a clear Oh at the end.",
            piper_text: "hello.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
        SoundCard {
            id: "09_phrase_yes",
            title: "9. Short Phrase",
            cue: "Three gentle beats with short pauses: Yes, I am here.",
            piper_text: "Yes, I am here.",
            target: None,
            custom_wav_name: None,
            best_take: None,
        },
    ]
}

/// Loads a mono f32 WAV file using `hound`.
pub fn load_wav_mono(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("WAV open error: {e}"))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;

    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max_val = (1i64 << (spec.bits_per_sample.saturating_sub(1))) as f32;
            reader
                .samples::<i32>()
                .filter_map(Result::ok)
                .map(|s| s as f32 / max_val.max(1.0))
                .collect()
        }
        hound::SampleFormat::Float => reader.samples::<f32>().filter_map(Result::ok).collect(),
    };

    let mono = if channels == 1 {
        raw
    } else {
        raw.chunks(channels)
            .map(|c| c.iter().sum::<f32>() / channels as f32)
            .collect()
    };
    Ok((mono, spec.sample_rate))
}

/// Saves mono f32 samples as 16-bit PCM WAV at `SAMPLE_RATE`.
pub fn save_wav_mono(path: &Path, samples: &[f32], sample_rate: u32) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {e}"))?;
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer =
        hound::WavWriter::create(path, spec).map_err(|e| format!("WAV create failed: {e}"))?;
    for &s in samples {
        let clamped = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        writer
            .write_sample(clamped)
            .map_err(|e| format!("WAV write failed: {e}"))?;
    }
    writer
        .finalize()
        .map_err(|e| format!("WAV finalize failed: {e}"))?;
    Ok(())
}
