//! Live 24-band audio spectrum & PCM tap supporting Microphone (`waveIn`)
//! and Windows WASAPI System Audio Loopback (`cpal`).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use windows::Win32::Media::Audio::{
    waveInAddBuffer, waveInClose, waveInOpen, waveInPrepareHeader, waveInReset, waveInStart,
    waveInStop, waveInUnprepareHeader, CALLBACK_NULL, HWAVEIN, WAVEFORMATEX, WAVEHDR, WAVE_MAPPER,
    WAVE_FORMAT_PCM, WHDR_DONE,
};

use crate::ui::WM_APP_METER_TICK;
use crate::win_util::{post_app_msg, AUDIO_CHUNK_SAMPLES, AUDIO_SAMPLE_RATE};

pub const BANDS: usize = 24;
const SAMPLE_RATE: f32 = AUDIO_SAMPLE_RATE as f32;
const CHUNK_SAMPLES: usize = AUDIO_CHUNK_SAMPLES; // ~32ms per frame

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum AudioSource {
    Mic = 0,
    Loopback = 1,
}

/// Shared smoothed frequency bands (0.0..=1.0) and peak level.
pub struct MeterData {
    pub bands: [f32; BANDS],
    pub peak: f32,
}

impl Default for MeterData {
    fn default() -> Self {
        Self {
            bands: [0.0; BANDS],
            peak: 0.0,
        }
    }
}

/// Background audio capture handle feeding both the spectrum meter and Whisper STT.
pub struct MicMeter {
    pub data: Arc<Mutex<MeterData>>,
    audio_tx: Arc<Mutex<Option<SyncSender<Vec<i16>>>>>,
    desired_source: Arc<AtomicU8>,
    stop_flag: Arc<AtomicBool>,
}

impl MicMeter {
    pub fn start(notify_hwnd: isize) -> Self {
        let data = Arc::new(Mutex::new(MeterData::default()));
        let audio_tx: Arc<Mutex<Option<SyncSender<Vec<i16>>>>> = Arc::new(Mutex::new(None));
        let desired_source = Arc::new(AtomicU8::new(AudioSource::Mic as u8));
        let stop_flag = Arc::new(AtomicBool::new(false));

        let data_bg = Arc::clone(&data);
        let tx_bg = Arc::clone(&audio_tx);
        let src_bg = Arc::clone(&desired_source);
        let stop_bg = Arc::clone(&stop_flag);

        thread::spawn(move || supervisor_loop(notify_hwnd, data_bg, tx_bg, src_bg, stop_bg));

        Self {
            data,
            audio_tx,
            desired_source,
            stop_flag,
        }
    }

    pub fn set_audio_sink(&self, sink: Option<SyncSender<Vec<i16>>>) {
        if let Ok(mut guard) = self.audio_tx.lock() {
            *guard = sink;
        }
    }

    pub fn set_source(&self, source: AudioSource) {
        self.desired_source.store(source as u8, Ordering::Relaxed);
    }
}

impl Drop for MicMeter {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
    }
}

fn precompute_goertzel() -> [f32; BANDS] {
    let mut coeffs = [0.0f32; BANDS];
    for (i, c) in coeffs.iter_mut().enumerate() {
        let t = i as f32 / (BANDS - 1) as f32;
        let freq = 85.0 * (7200.0f32 / 85.0).powf(t);
        let k = (0.5 + (CHUNK_SAMPLES as f32 * freq) / SAMPLE_RATE).floor();
        let omega = (2.0 * PI * k) / CHUNK_SAMPLES as f32;
        *c = 2.0 * omega.cos();
    }
    coeffs
}

fn supervisor_loop(
    notify_hwnd: isize,
    data: Arc<Mutex<MeterData>>,
    audio_tx: Arc<Mutex<Option<SyncSender<Vec<i16>>>>>,
    desired_source: Arc<AtomicU8>,
    stop: Arc<AtomicBool>,
) {
    let coeffs = precompute_goertzel();
    while !stop.load(Ordering::Relaxed) {
        let src = desired_source.load(Ordering::Relaxed);
        if src == AudioSource::Mic as u8 {
            run_mic_capture(notify_hwnd, &data, &audio_tx, &desired_source, &stop, &coeffs);
        } else {
            run_loopback_capture(notify_hwnd, &data, &audio_tx, &desired_source, &stop, &coeffs);
        }
        if !stop.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(60));
        }
    }
}

fn run_mic_capture(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    audio_tx: &Arc<Mutex<Option<SyncSender<Vec<i16>>>>>,
    desired_source: &Arc<AtomicU8>,
    stop: &Arc<AtomicBool>,
    coeffs: &[f32; BANDS],
) {
    let wfx = WAVEFORMATEX {
        wFormatTag: WAVE_FORMAT_PCM as u16,
        nChannels: 1,
        nSamplesPerSec: SAMPLE_RATE as u32,
        nAvgBytesPerSec: (SAMPLE_RATE as u32) * 2,
        nBlockAlign: 2,
        wBitsPerSample: 16,
        cbSize: 0,
    };

    let mut hwi = HWAVEIN::default();
    let res = unsafe { waveInOpen(Some(&mut hwi), WAVE_MAPPER, &wfx, 0, 0, CALLBACK_NULL) };
    if res != 0 || hwi.is_invalid() {
        return;
    }

    let mut buf_a = vec![0i16; CHUNK_SAMPLES];
    let mut buf_b = vec![0i16; CHUNK_SAMPLES];
    let mut hdr_a = WAVEHDR {
        lpData: windows::core::PSTR(buf_a.as_mut_ptr() as *mut u8),
        dwBufferLength: (CHUNK_SAMPLES * 2) as u32,
        ..Default::default()
    };
    let mut hdr_b = WAVEHDR {
        lpData: windows::core::PSTR(buf_b.as_mut_ptr() as *mut u8),
        dwBufferLength: (CHUNK_SAMPLES * 2) as u32,
        ..Default::default()
    };

    let hdr_sz = std::mem::size_of::<WAVEHDR>() as u32;
    unsafe {
        if waveInPrepareHeader(hwi, &mut hdr_a, hdr_sz) != 0
            || waveInPrepareHeader(hwi, &mut hdr_b, hdr_sz) != 0
        {
            let _ = waveInClose(hwi);
            return;
        }
        let _ = waveInAddBuffer(hwi, &mut hdr_a, hdr_sz);
        let _ = waveInAddBuffer(hwi, &mut hdr_b, hdr_sz);
        let _ = waveInStart(hwi);
    }

    let mut samples_f32 = [0.0f32; CHUNK_SAMPLES];
    let mut smoothed = [0.0f32; BANDS];
    let mut smoothed_peak = 0.0f32;

    while !stop.load(Ordering::Relaxed)
        && desired_source.load(Ordering::Relaxed) == AudioSource::Mic as u8
    {
        let mut updated = false;
        for (hdr, buf) in [(&mut hdr_a, &buf_a), (&mut hdr_b, &buf_b)] {
            if (hdr.dwFlags & WHDR_DONE) != 0 {
                process_chunk(
                    buf,
                    coeffs,
                    &mut samples_f32,
                    &mut smoothed,
                    &mut smoothed_peak,
                );
                forward_pcm(audio_tx, buf);
                unsafe {
                    hdr.dwFlags &= !WHDR_DONE;
                    let _ = waveInAddBuffer(hwi, hdr, hdr_sz);
                }
                updated = true;
            }
        }

        if updated {
            publish_meter(notify_hwnd, data, smoothed, smoothed_peak);
        } else {
            thread::sleep(Duration::from_millis(12));
        }
    }

    unsafe {
        let _ = waveInStop(hwi);
        let _ = waveInReset(hwi);
        let _ = waveInUnprepareHeader(hwi, &mut hdr_a, hdr_sz);
        let _ = waveInUnprepareHeader(hwi, &mut hdr_b, hdr_sz);
        let _ = waveInClose(hwi);
    }
}

fn run_loopback_capture(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    audio_tx: &Arc<Mutex<Option<SyncSender<Vec<i16>>>>>,
    desired_source: &Arc<AtomicU8>,
    stop: &Arc<AtomicBool>,
    coeffs: &[f32; BANDS],
) {
    let host = cpal::default_host();
    let Some(device) = host.default_output_device() else {
        return;
    };
    let Ok(out_cfg) = device.default_output_config() else {
        return;
    };

    let channels = out_cfg.channels() as usize;
    let src_rate = out_cfg.sample_rate().0 as f64;
    let step = src_rate / SAMPLE_RATE as f64;

    let data_cb = Arc::clone(data);
    let tx_cb = Arc::clone(audio_tx);
    let coeffs_copy = *coeffs;

    let mut chunk_buf: Vec<i16> = Vec::with_capacity(CHUNK_SAMPLES);
    let mut frac_pos: f64 = 0.0;
    let mut mono_buf: Vec<f32> = Vec::new();
    let mut samples_f32 = [0.0f32; CHUNK_SAMPLES];
    let mut smoothed = [0.0f32; BANDS];
    let mut smoothed_peak = 0.0f32;

    let stream = device.build_input_stream(
        &out_cfg.into(),
        move |input: &[f32], _| {
            mono_buf.clear();
            for frame in input.chunks_exact(channels.max(1)) {
                let sum: f32 = frame.iter().copied().sum();
                mono_buf.push(sum / channels.max(1) as f32);
            }
            if mono_buf.len() < 2 {
                return;
            }

            while (frac_pos as usize) + 1 < mono_buf.len() {
                let idx = frac_pos as usize;
                let t = (frac_pos - idx as f64) as f32;
                let s = mono_buf[idx] * (1.0 - t) + mono_buf[idx + 1] * t;
                chunk_buf.push((s.clamp(-1.0, 1.0) * 32767.0) as i16);
                frac_pos += step;

                if chunk_buf.len() == CHUNK_SAMPLES {
                    process_chunk(
                        &chunk_buf,
                        &coeffs_copy,
                        &mut samples_f32,
                        &mut smoothed,
                        &mut smoothed_peak,
                    );
                    forward_pcm(&tx_cb, &chunk_buf);
                    publish_meter(notify_hwnd, &data_cb, smoothed, smoothed_peak);
                    chunk_buf.clear();
                }
            }
            frac_pos -= mono_buf.len() as f64;
            if frac_pos < 0.0 {
                frac_pos = 0.0;
            }
        },
        |_| {},
        None,
    );

    let Ok(stream) = stream else {
        return;
    };
    if stream.play().is_err() {
        return;
    }

    while !stop.load(Ordering::Relaxed)
        && desired_source.load(Ordering::Relaxed) == AudioSource::Loopback as u8
    {
        thread::sleep(Duration::from_millis(40));
    }
}

fn publish_meter(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    bands: [f32; BANDS],
    peak: f32,
) {
    if let Ok(mut guard) = data.lock() {
        guard.bands = bands;
        guard.peak = peak;
    }
    post_app_msg(notify_hwnd, WM_APP_METER_TICK, 0);
}

fn forward_pcm(audio_tx: &Arc<Mutex<Option<SyncSender<Vec<i16>>>>>, pcm: &[i16]) {
    if let Ok(guard) = audio_tx.lock() {
        if let Some(ref tx) = *guard {
            let _ = tx.try_send(pcm.to_vec());
        }
    }
}

fn process_chunk(
    pcm: &[i16],
    coeffs: &[f32; BANDS],
    norm: &mut [f32; CHUNK_SAMPLES],
    smoothed: &mut [f32; BANDS],
    smoothed_peak: &mut f32,
) {
    let mut peak = 0.0f32;
    for (i, &s) in pcm.iter().enumerate() {
        let v = s as f32 / 32768.0;
        let av = v.abs();
        if av > peak {
            peak = av;
        }
        let w = 0.5 * (1.0 - (2.0 * PI * i as f32 / (CHUNK_SAMPLES - 1) as f32).cos());
        norm[i] = v * w;
    }

    let db_peak = ((peak * 24.0).ln_1p() / 25.0f32.ln_1p()).clamp(0.0, 1.0);
    *smoothed_peak = (*smoothed_peak * 0.65).max(db_peak);

    for (b, &coeff) in coeffs.iter().enumerate() {
        let mut s_prev = 0.0f32;
        let mut s_prev2 = 0.0f32;
        for &x in norm.iter() {
            let s = x + coeff * s_prev - s_prev2;
            s_prev2 = s_prev;
            s_prev = s;
        }
        let power = (s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2).max(0.0);
        let mag = power.sqrt() / (CHUNK_SAMPLES as f32 * 0.25);
        let level = ((mag * 18.0).ln_1p() / 19.0f32.ln_1p()).clamp(0.0, 1.0);
        if level > smoothed[b] {
            smoothed[b] = level;
        } else {
            smoothed[b] = smoothed[b] * 0.72 + level * 0.28;
        }
    }
}
