//! Real-time 512-point STFT Wiener spectral noise suppressor & voice-band VAD
//! for isolating human speech (200 Hz - 4000 Hz) in loud environments.

use std::f32::consts::PI;

use crate::win_util::{AUDIO_CHUNK_SAMPLES, AUDIO_SAMPLE_RATE};

const FFT_N: usize = AUDIO_CHUNK_SAMPLES;
const HOP: usize = FFT_N / 2;
const BINS: usize = FFT_N / 2 + 1;
const SAMPLE_RATE: f32 = AUDIO_SAMPLE_RATE as f32;

#[derive(Clone, Copy)]
struct Complex {
    re: f32,
    im: f32,
}

impl Complex {
    #[inline]
    fn new(re: f32, im: f32) -> Self {
        Self { re, im }
    }
    #[inline]
    fn mag_sq(self) -> f32 {
        self.re * self.re + self.im * self.im
    }
}

/// Stateful overlap-add STFT denoiser + voice-band SNR estimator.
pub struct VoiceIsolator {
    window: [f32; FFT_N],
    in_ring: [f32; FFT_N],
    out_acc: [f32; FFT_N],
    noise_psd: [f32; BINS],
    gain_smooth: [f32; BINS],
    voice_bin_lo: usize,
    voice_bin_hi: usize,
    init_frames: usize,
}

impl VoiceIsolator {
    pub fn new() -> Self {
        let mut window = [0.0f32; FFT_N];
        for (i, w) in window.iter_mut().enumerate() {
            // Root-Hann window for perfect overlap-add reconstruction at 50% hop.
            let hann = 0.5 * (1.0 - (2.0 * PI * i as f32 / FFT_N as f32).cos());
            *w = hann.sqrt();
        }
        let bin_hz = SAMPLE_RATE / FFT_N as f32;
        Self {
            window,
            in_ring: [0.0; FFT_N],
            out_acc: [0.0; FFT_N],
            noise_psd: [1e-6; BINS],
            gain_smooth: [1.0; BINS],
            voice_bin_lo: (200.0 / bin_hz).round() as usize,
            voice_bin_hi: (3800.0 / bin_hz).round() as usize,
            init_frames: 0,
        }
    }

    /// Denoises a 512-sample (32 ms) 16 kHz mono chunk in place and returns
    /// `(voice_band_snr, voice_band_rms)` for noise-resilient VAD.
    pub fn process_chunk(&mut self, chunk: &mut [i16]) -> (f32, f32) {
        if chunk.len() != FFT_N {
            return (0.0, 0.0);
        }

        let mut snr_sum = 0.0f32;
        let mut rms_sum = 0.0f32;

        // Process two 256-sample hops per 512-sample chunk.
        for half in 0..2 {
            let src = &chunk[half * HOP..(half + 1) * HOP];
            self.in_ring.copy_within(HOP..FFT_N, 0);
            for (dst, &s) in self.in_ring[HOP..FFT_N].iter_mut().zip(src.iter()) {
                *dst = s as f32 / 32768.0;
            }

            let (snr, v_rms) = self.process_frame(&mut chunk[half * HOP..(half + 1) * HOP]);
            snr_sum = snr_sum.max(snr);
            rms_sum = rms_sum.max(v_rms);
        }

        (snr_sum, rms_sum)
    }

    fn process_frame(&mut self, out_hop: &mut [i16]) -> (f32, f32) {
        let mut buf = [Complex::new(0.0, 0.0); FFT_N];
        for i in 0..FFT_N {
            buf[i].re = self.in_ring[i] * self.window[i];
        }

        fft_in_place(&mut buf, false);

        let mut voice_sig = 0.0f32;
        let mut voice_noise = 0.0f32;

        // First pass: measure current frame voice-band energy vs tracked noise floor.
        for k in self.voice_bin_lo..=self.voice_bin_hi {
            voice_sig += buf[k].mag_sq();
            voice_noise += self.noise_psd[k];
        }

        let voice_snr = (voice_sig / voice_noise.max(1e-7)).sqrt();
        let voice_rms = (voice_sig / (self.voice_bin_hi - self.voice_bin_lo + 1) as f32).sqrt();

        // Adapt noise PSD quickly during startup (first ~15 frames = ~240ms) or when not in speech.
        let is_noise_frame = self.init_frames < 15 || voice_snr < 2.2;
        if self.init_frames < 15 {
            self.init_frames += 1;
        }
        let alpha = if self.init_frames < 15 { 0.35 } else { 0.06 };

        for k in 0..BINS {
            let p = buf[k].mag_sq();
            if is_noise_frame {
                self.noise_psd[k] = self.noise_psd[k] * (1.0 - alpha) + p * alpha;
            } else if p < self.noise_psd[k] {
                // Minimum-tracking even during speech.
                self.noise_psd[k] = self.noise_psd[k] * 0.90 + p * 0.10;
            }

            // Hard attenuate out-of-band rumble (<200 Hz) and hiss (>3800 Hz).
            let target_gain = if k < self.voice_bin_lo || k > self.voice_bin_hi {
                0.04
            } else {
                let over_sub = 1.45;
                let g = (p - over_sub * self.noise_psd[k]) / p.max(1e-8);
                g.clamp(0.08, 1.0)
            };

            // Smooth gain across frames to avoid musical noise artifacts.
            self.gain_smooth[k] = self.gain_smooth[k] * 0.45 + target_gain * 0.55;
            let g = self.gain_smooth[k];

            buf[k].re *= g;
            buf[k].im *= g;
            if k > 0 && k < FFT_N / 2 {
                let sym = FFT_N - k;
                buf[sym].re *= g;
                buf[sym].im *= g;
            }
        }

        fft_in_place(&mut buf, true);

        // Overlap-add synthesis.
        for i in 0..FFT_N {
            self.out_acc[i] += buf[i].re * self.window[i];
        }
        for (dst, &val) in out_hop.iter_mut().zip(self.out_acc[..HOP].iter()) {
            *dst = (val.clamp(-1.0, 1.0) * 32767.0) as i16;
        }
        self.out_acc.copy_within(HOP..FFT_N, 0);
        self.out_acc[HOP..FFT_N].fill(0.0);

        (voice_snr, voice_rms * 32768.0)
    }
}

fn fft_in_place(buf: &mut [Complex; FFT_N], inverse: bool) {
    // Bit-reversal permutation.
    let mut j = 0usize;
    for i in 1..FFT_N {
        let mut bit = FFT_N >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            buf.swap(i, j);
        }
    }

    let sign = if inverse { 1.0f32 } else { -1.0f32 };
    let mut len = 2usize;
    while len <= FFT_N {
        let ang = sign * 2.0 * PI / len as f32;
        let wlen = Complex::new(ang.cos(), ang.sin());
        let half = len / 2;
        for start in (0..FFT_N).step_by(len) {
            let mut w = Complex::new(1.0, 0.0);
            for k in 0..half {
                let u = buf[start + k];
                let t_in = buf[start + k + half];
                let t = Complex::new(
                    w.re * t_in.re - w.im * t_in.im,
                    w.re * t_in.im + w.im * t_in.re,
                );
                buf[start + k] = Complex::new(u.re + t.re, u.im + t.im);
                buf[start + k + half] = Complex::new(u.re - t.re, u.im - t.im);
                w = Complex::new(w.re * wlen.re - w.im * wlen.im, w.re * wlen.im + w.im * wlen.re);
            }
        }
        len <<= 1;
    }

    if inverse {
        let inv_n = 1.0 / FFT_N as f32;
        for c in buf.iter_mut() {
            c.re *= inv_n;
            c.im *= inv_n;
        }
    }
}
