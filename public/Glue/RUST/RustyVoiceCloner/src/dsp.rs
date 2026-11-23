//! Audio DSP utilities: resampling, envelope, F0 pitch estimation, 24-band spectrum,
//! real-time similarity scoring, and best-segment extraction.

use rustfft::{num_complex::Complex, FftPlanner};
use std::f32::consts::PI;

pub const SAMPLE_RATE: u32 = 22050;
pub const SPECTRUM_BANDS: usize = 24;
const FFT_SIZE: usize = 1024;

/// Resamples mono f32 audio from `src_rate` to `dst_rate` using linear interpolation.
pub fn resample_linear(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if input.is_empty() || src_rate == dst_rate || src_rate == 0 {
        return input.to_vec();
    }
    let ratio = src_rate as f64 / dst_rate as f64;
    let out_len = ((input.len() as f64) / ratio).round().max(1.0) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let pos = i as f64 * ratio;
        let idx = pos as usize;
        let frac = (pos - idx as f64) as f32;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }
    out
}

/// Computes a smoothed RMS amplitude envelope normalized to [0, 1] (or raw RMS if `normalize` is false).
pub fn compute_envelope(samples: &[f32], hop_samples: usize, normalize: bool) -> Vec<f32> {
    if samples.is_empty() || hop_samples == 0 {
        return Vec::new();
    }
    let win = (hop_samples * 2).max(1);
    let mut env = Vec::with_capacity(samples.len() / hop_samples + 1);
    let mut i = 0;
    while i < samples.len() {
        let end = (i + win).min(samples.len());
        let slice = &samples[i..end];
        let rms = (slice.iter().map(|s| s * s).sum::<f32>() / slice.len() as f32).sqrt();
        env.push(rms);
        i += hop_samples;
    }
    if normalize {
        let max_v = env.iter().copied().fold(0.0f32, f32::max);
        if max_v > 1e-4 {
            for v in &mut env {
                *v = (*v / max_v).clamp(0.0, 1.0);
            }
        }
    }
    smooth_curve(&env, 2)
}

/// Applies a symmetric moving-average filter of half-width `radius` to smooth jittery curves.
pub fn smooth_curve(vals: &[f32], radius: usize) -> Vec<f32> {
    if vals.len() <= 2 || radius == 0 {
        return vals.to_vec();
    }
    let mut out = Vec::with_capacity(vals.len());
    for i in 0..vals.len() {
        let lo = i.saturating_sub(radius);
        let hi = (i + radius).min(vals.len() - 1);
        let sum: f32 = vals[lo..=hi].iter().sum();
        out.push(sum / (hi - lo + 1) as f32);
    }
    out
}

/// Estimates fundamental frequency (F0 in Hz) using the YIN cumulative mean normalized
/// difference function with parabolic interpolation. Immune to envelope ramps and octave flips.
pub fn estimate_pitch_hz(frame: &[f32], sample_rate: u32) -> Option<f32> {
    if frame.len() < 512 {
        return None;
    }
    let energy: f32 = frame.iter().map(|x| x * x).sum::<f32>() / frame.len() as f32;
    if energy < 1.2e-5 {
        return None;
    }

    let min_lag = (sample_rate as f32 / 360.0).round() as usize;
    let max_lag = ((sample_rate as f32 / 65.0).round() as usize).min(frame.len() / 2);
    if min_lag >= max_lag || max_lag < 4 {
        return None;
    }

    let n = frame.len() - max_lag;
    let mut diff = vec![0.0f32; max_lag + 1];
    for tau in 1..=max_lag {
        let mut sum = 0.0f32;
        for j in 0..n {
            let d = frame[j] - frame[j + tau];
            sum += d * d;
        }
        diff[tau] = sum;
    }

    // Cumulative mean normalized difference (CMND)
    let mut cmnd = vec![1.0f32; max_lag + 1];
    let mut running_sum = 0.0f32;
    for tau in 1..=max_lag {
        running_sum += diff[tau];
        cmnd[tau] = if running_sum > 1e-8 {
            diff[tau] * (tau as f32) / running_sum
        } else {
            1.0
        };
    }

    // Pick first local minimum below threshold (0.20), or global minimum if < 0.30
    let mut best_tau = None;
    for tau in min_lag..max_lag {
        if cmnd[tau] < 0.20 && cmnd[tau] <= cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1] {
            best_tau = Some(tau);
            break;
        }
    }
    let tau = match best_tau {
        Some(t) => t,
        None => {
            let (t, &val) = cmnd[min_lag..=max_lag]
                .iter()
                .enumerate()
                .min_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))?;
            if val > 0.30 {
                return None;
            }
            min_lag + t
        }
    };

    // Parabolic interpolation for sub-sample precision
    let refined_tau = if tau > min_lag && tau < max_lag {
        let s0 = cmnd[tau - 1];
        let s1 = cmnd[tau];
        let s2 = cmnd[tau + 1];
        let denom = 2.0 * (2.0 * s1 - s2 - s0);
        if denom.abs() > 1e-6 {
            tau as f32 + (s2 - s0) / denom
        } else {
            tau as f32
        }
    } else {
        tau as f32
    };

    if refined_tau > 0.0 {
        Some(sample_rate as f32 / refined_tau)
    } else {
        None
    }
}

/// Computes a smooth pitch contour (Hz, 0.0 for unvoiced) across `samples`,
/// bridging 1-frame dropouts and applying a 5-point median + smoothing filter.
pub fn compute_pitch_contour(samples: &[f32], hop_samples: usize, sample_rate: u32) -> Vec<f32> {
    let win = 1024usize.min(samples.len());
    if win < 512 || hop_samples == 0 {
        return Vec::new();
    }
    let mut raw = Vec::new();
    let mut i = 0;
    while i + win <= samples.len() {
        let hz = estimate_pitch_hz(&samples[i..i + win], sample_rate).unwrap_or(0.0);
        raw.push(hz);
        i += hop_samples;
    }

    // Drop isolated 1-frame blips surrounded by silence
    for idx in 1..raw.len().saturating_sub(1) {
        if raw[idx] > 40.0 && raw[idx - 1] <= 1.0 && raw[idx + 1] <= 1.0 {
            raw[idx] = 0.0;
        }
    }

    // Bridge single-frame dropouts between two close voiced frames
    for idx in 1..raw.len().saturating_sub(1) {
        if raw[idx] <= 1.0 && raw[idx - 1] > 40.0 && raw[idx + 1] > 40.0 {
            if (raw[idx - 1] - raw[idx + 1]).abs() < 45.0 {
                raw[idx] = 0.5 * (raw[idx - 1] + raw[idx + 1]);
            }
        }
    }

    // 5-point median filter over voiced neighbors to kill isolated spikes
    let mut med = raw.clone();
    for idx in 0..raw.len() {
        if raw[idx] <= 40.0 {
            continue;
        }
        let lo = idx.saturating_sub(2);
        let hi = (idx + 2).min(raw.len() - 1);
        let mut win_vals: Vec<f32> = raw[lo..=hi].iter().copied().filter(|&v| v > 40.0).collect();
        if win_vals.len() >= 3 {
            win_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            med[idx] = win_vals[win_vals.len() / 2];
        }
    }

    // Double-pass smoothing across the whole curve (0 Hz -> pitch -> 0 Hz) for fluid visual lines
    let pass1 = smooth_curve(&med, 4);
    smooth_curve(&pass1, 3)
}

/// Computes 24 log-spaced spectral energy bands (80 Hz - 6000 Hz), normalized to [0, 1].
pub fn compute_spectrum_bands(frame: &[f32], sample_rate: u32) -> [f32; SPECTRUM_BANDS] {
    let mut bands = [0.0f32; SPECTRUM_BANDS];
    if frame.is_empty() {
        return bands;
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let mut buf = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];
    let copy_len = frame.len().min(FFT_SIZE);
    let offset = frame.len().saturating_sub(FFT_SIZE);
    for i in 0..copy_len {
        let hann = 0.5 * (1.0 - (2.0 * PI * i as f32 / (copy_len as f32 - 1.0).max(1.0)).cos());
        buf[i].re = frame[offset + i] * hann;
    }
    fft.process(&mut buf);

    let bin_hz = sample_rate as f32 / FFT_SIZE as f32;
    let f_min = 80.0f32;
    let f_max = 6000.0f32;

    for b in 0..SPECTRUM_BANDS {
        let t0 = b as f32 / SPECTRUM_BANDS as f32;
        let t1 = (b + 1) as f32 / SPECTRUM_BANDS as f32;
        let lo_hz = f_min * (f_max / f_min).powf(t0);
        let hi_hz = f_min * (f_max / f_min).powf(t1);
        let lo_bin = ((lo_hz / bin_hz).floor() as usize).clamp(1, FFT_SIZE / 2 - 1);
        let hi_bin = ((hi_hz / bin_hz).ceil() as usize).clamp(lo_bin + 1, FFT_SIZE / 2);

        let mut sum = 0.0f32;
        for k in lo_bin..hi_bin {
            sum += buf[k].norm();
        }
        let avg = sum / (hi_bin - lo_bin) as f32;
        bands[b] = (1.0 + avg).ln();
    }

    let max_b = bands.iter().copied().fold(0.0f32, f32::max);
    if max_b > 1e-5 {
        for v in &mut bands {
            *v = (*v / max_b).clamp(0.0, 1.0);
        }
    }
    bands
}

/// Computes an average spectrum across all active (voiced/energetic) frames of a target clip.
pub fn compute_average_spectrum(samples: &[f32], sample_rate: u32) -> [f32; SPECTRUM_BANDS] {
    let mut acc = [0.0f32; SPECTRUM_BANDS];
    let mut count = 0usize;
    let hop = 512;
    let mut i = 0;
    while i + FFT_SIZE <= samples.len() {
        let frame = &samples[i..i + FFT_SIZE];
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();
        if rms > 0.015 {
            let b = compute_spectrum_bands(frame, sample_rate);
            for idx in 0..SPECTRUM_BANDS {
                acc[idx] += b[idx];
            }
            count += 1;
        }
        i += hop;
    }
    if count > 0 {
        for v in &mut acc {
            *v /= count as f32;
        }
    }
    acc
}

/// Computes a 0..100 visual match score between live mic frame and target features.
pub fn compute_match_score(
    live_rms: f32,
    live_pitch_hz: Option<f32>,
    live_bands: &[f32; SPECTRUM_BANDS],
    target_median_pitch_hz: Option<f32>,
    target_bands: &[f32; SPECTRUM_BANDS],
) -> f32 {
    // Gentle quiet-room gate so soft hums and normal speaking register immediately
    if live_rms < 0.0025 {
        return 0.0;
    }

    // 1. Spectral cosine similarity (vowel / timbre shape)
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for i in 0..SPECTRUM_BANDS {
        dot += live_bands[i] * target_bands[i];
        norm_a += live_bands[i] * live_bands[i];
        norm_b += target_bands[i] * target_bands[i];
    }
    let spec_sim = if norm_a > 1e-6 && norm_b > 1e-6 {
        (dot / (norm_a.sqrt() * norm_b.sqrt())).clamp(0.0, 1.0)
    } else {
        0.0
    };

    // 2. Pitch proximity (in semitones)
    let pitch_sim = match (live_pitch_hz, target_median_pitch_hz) {
        (Some(lp), Some(tp)) if lp > 40.0 && tp > 40.0 => {
            let semitones = (12.0 * (lp / tp).log2()).abs();
            // Full credit within 2 semitones, decays smoothly to 0 at 14 semitones
            (1.0 - (semitones - 1.5).max(0.0) / 12.5).clamp(0.0, 1.0)
        }
        (None, None) => 0.85, // Unvoiced consonant like "sh"
        _ => 0.35,
    };

    // 3. Energy presence (tuned for quiet-room laptop mics)
    let energy_sim = (live_rms / 0.025).clamp(0.0, 1.0);

    let combined = 0.55 * spec_sim + 0.25 * pitch_sim + 0.20 * energy_sim;
    (combined * 100.0).clamp(0.0, 100.0)
}

/// Extracts the highest-scoring contiguous segment from `recorded` samples
/// using the per-chunk match scores, trims leading/trailing silence, and normalizes peak.
pub fn extract_best_segment(
    recorded: &[f32],
    target_len_samples: usize,
    target_median_pitch_hz: Option<f32>,
    target_bands: &[f32; SPECTRUM_BANDS],
) -> Option<(Vec<f32>, f32)> {
    let win_len = target_len_samples.clamp((SAMPLE_RATE as usize) / 2, SAMPLE_RATE as usize * 3);
    if recorded.len() < (SAMPLE_RATE as usize) / 3 {
        return None;
    }

    if recorded.len() <= win_len {
        let trimmed = trim_silence(recorded, 0.003);
        if trimmed.len() < (SAMPLE_RATE as usize) / 4 {
            return None;
        }
        let score = score_clip(&trimmed, target_median_pitch_hz, target_bands);
        return Some((normalize_peak(&trimmed, 0.7), score));
    }

    let step = (SAMPLE_RATE as usize) / 10; // 100 ms slide
    let mut best_start = 0usize;
    let mut best_score = -1.0f32;

    let mut pos = 0usize;
    while pos + win_len <= recorded.len() {
        let slice = &recorded[pos..pos + win_len];
        let s = score_clip(slice, target_median_pitch_hz, target_bands);
        if s > best_score {
            best_score = s;
            best_start = pos;
        }
        pos += step;
    }

    let best_slice = &recorded[best_start..(best_start + win_len).min(recorded.len())];
    let trimmed = trim_silence(best_slice, 0.003);
    if trimmed.len() < (SAMPLE_RATE as usize) / 4 {
        return None;
    }
    Some((normalize_peak(&trimmed, 0.7), best_score.max(0.0)))
}

fn score_clip(
    samples: &[f32],
    target_median_pitch_hz: Option<f32>,
    target_bands: &[f32; SPECTRUM_BANDS],
) -> f32 {
    let hop = 512;
    let mut total = 0.0f32;
    let mut active = 0usize;
    let mut i = 0;
    while i + FFT_SIZE <= samples.len() {
        let frame = &samples[i..i + FFT_SIZE];
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();
        if rms > 0.0025 {
            let pitch = estimate_pitch_hz(frame, SAMPLE_RATE);
            let bands = compute_spectrum_bands(frame, SAMPLE_RATE);
            total += compute_match_score(rms, pitch, &bands, target_median_pitch_hz, target_bands);
            active += 1;
        }
        i += hop;
    }
    if active == 0 {
        0.0
    } else {
        total / active as f32
    }
}

pub fn trim_silence(samples: &[f32], threshold: f32) -> Vec<f32> {
    let win = 220; // 10 ms
    let mut start = 0usize;
    let mut end = samples.len();

    for i in (0..samples.len()).step_by(win) {
        let slice = &samples[i..(i + win).min(samples.len())];
        let rms = (slice.iter().map(|s| s * s).sum::<f32>() / slice.len() as f32).sqrt();
        if rms > threshold {
            start = i.saturating_sub(win * 2);
            break;
        }
    }
    for i in (0..samples.len()).rev().step_by(win) {
        let lo = i.saturating_sub(win);
        let slice = &samples[lo..=i.min(samples.len() - 1)];
        let rms = (slice.iter().map(|s| s * s).sum::<f32>() / slice.len() as f32).sqrt();
        if rms > threshold {
            end = (i + win * 2).min(samples.len());
            break;
        }
    }
    if start >= end {
        return Vec::new();
    }
    samples[start..end].to_vec()
}

pub fn normalize_peak(samples: &[f32], target_peak: f32) -> Vec<f32> {
    let peak = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    if peak < 1e-5 {
        return samples.to_vec();
    }
    let gain = (target_peak / peak).min(12.0);
    samples.iter().map(|s| (s * gain).clamp(-1.0, 1.0)).collect()
}

pub fn median_nonzero(vals: &[f32]) -> Option<f32> {
    let mut nz: Vec<f32> = vals.iter().copied().filter(|&v| v > 1.0).collect();
    if nz.is_empty() {
        return None;
    }
    nz.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(nz[nz.len() / 2])
}
