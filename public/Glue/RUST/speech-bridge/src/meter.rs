//! Live 24-band audio spectrum, WASAPI multi-mic capture with automatic
//! highest-SNR switching, System Audio Loopback, TTS echo-gating, and live
//! Signal/SNR health telemetry.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::tts::TtsEchoGate;
use crate::ui::WM_APP_METER_TICK;
use crate::win_util::{post_app_msg, AUDIO_CHUNK_SAMPLES, AUDIO_SAMPLE_RATE};

pub const BANDS: usize = 24;
const SAMPLE_RATE: f32 = AUDIO_SAMPLE_RATE as f32;
const CHUNK_SAMPLES: usize = AUDIO_CHUNK_SAMPLES; // 512 samples = 32 ms @ 16 kHz

/// Fixed stack-allocated 32 ms audio frame (zero heap allocation inside real-time WASAPI callbacks).
pub type AudioFrame = [i16; AUDIO_CHUNK_SAMPLES];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AudioSource {
    Mic,
    Loopback,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SignalStatus {
    Standby,
    TtsMuted,
    Clear,
    Noisy,
    Drowned,
    Clipping,
}

impl SignalStatus {
    pub fn short_label(self) -> &'static str {
        match self {
            Self::Standby => "QUIET",
            Self::TtsMuted => "TTS GATE",
            Self::Clear => "CLEAR",
            Self::Noisy => "NOISY",
            Self::Drowned => "DROWNED",
            Self::Clipping => "CLIP!",
        }
    }
}

/// Shared smoothed frequency bands, peak level, and real-time SNR health telemetry.
pub struct MeterData {
    pub bands: [f32; BANDS],
    pub peak: f32,
    pub snr_db: f32,
    pub noise_floor_db: f32,
    pub status: SignalStatus,
    pub active_mic_name: String,
    pub active_mic_count: usize,
}

impl Default for MeterData {
    fn default() -> Self {
        Self {
            bands: [0.0; BANDS],
            peak: 0.0,
            snr_db: 0.0,
            noise_floor_db: -60.0,
            status: SignalStatus::Standby,
            active_mic_name: "Default Mic".to_string(),
            active_mic_count: 1,
        }
    }
}

#[derive(Clone)]
struct CaptureConfig {
    source: AudioSource,
    /// Empty = system default input device; 1 = specific mic; 2+ = multi-mic active-SNR fusion.
    selected_mics: Vec<String>,
}

/// Enumerates all currently connected WASAPI audio input devices.
pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    let Ok(devices) = host.input_devices() else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for dev in devices {
        if let Ok(name) = dev.name() {
            if !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names.push("ESP32-BLE Hub (UDP :47100)".to_string());
    names
}

/// Returns the default WASAPI input device name, if available.
pub fn default_input_device_name() -> Option<String> {
    cpal::default_host()
        .default_input_device()
        .and_then(|d| d.name().ok())
}

/// Background audio capture handle feeding both the spectrum meter and STT pipeline.
pub struct MicMeter {
    pub data: Arc<Mutex<MeterData>>,
    audio_tx: Arc<Mutex<Option<SyncSender<AudioFrame>>>>,
    config: Arc<Mutex<CaptureConfig>>,
    config_gen: Arc<AtomicU64>,
    stop_flag: Arc<AtomicBool>,
}

impl MicMeter {
    pub fn start(notify_hwnd: isize, echo_gate: Arc<TtsEchoGate>) -> Self {
        let data = Arc::new(Mutex::new(MeterData::default()));
        let audio_tx: Arc<Mutex<Option<SyncSender<AudioFrame>>>> = Arc::new(Mutex::new(None));
        let default_mic = default_input_device_name();
        let initial_mics = default_mic.into_iter().collect();
        let config = Arc::new(Mutex::new(CaptureConfig {
            source: AudioSource::Mic,
            selected_mics: initial_mics,
        }));
        let config_gen = Arc::new(AtomicU64::new(1));
        let stop_flag = Arc::new(AtomicBool::new(false));

        let data_bg = Arc::clone(&data);
        let tx_bg = Arc::clone(&audio_tx);
        let cfg_bg = Arc::clone(&config);
        let gen_bg = Arc::clone(&config_gen);
        let stop_bg = Arc::clone(&stop_flag);

        thread::spawn(move || {
            supervisor_loop(
                notify_hwnd,
                data_bg,
                tx_bg,
                cfg_bg,
                gen_bg,
                stop_bg,
                echo_gate,
            )
        });

        Self {
            data,
            audio_tx,
            config,
            config_gen,
            stop_flag,
        }
    }

    pub fn set_audio_sink(&self, sink: Option<SyncSender<AudioFrame>>) {
        if let Ok(mut guard) = self.audio_tx.lock() {
            *guard = sink;
        }
    }

    pub fn set_source(&self, source: AudioSource) {
        if let Ok(mut guard) = self.config.lock() {
            guard.source = source;
        }
        self.config_gen.fetch_add(1, Ordering::Release);
    }

    pub fn set_selected_mics(&self, mics: Vec<String>) {
        if let Ok(mut guard) = self.config.lock() {
            guard.selected_mics = mics;
            guard.source = AudioSource::Mic;
        }
        self.config_gen.fetch_add(1, Ordering::Release);
    }

    pub fn selected_mics(&self) -> Vec<String> {
        self.config
            .lock()
            .map(|g| g.selected_mics.clone())
            .unwrap_or_default()
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
    audio_tx: Arc<Mutex<Option<SyncSender<AudioFrame>>>>,
    config: Arc<Mutex<CaptureConfig>>,
    config_gen: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
    echo_gate: Arc<TtsEchoGate>,
) {
    let coeffs = precompute_goertzel();
    while !stop.load(Ordering::Relaxed) {
        let gen = config_gen.load(Ordering::Acquire);
        let cfg = config
            .lock()
            .map(|g| g.clone())
            .unwrap_or(CaptureConfig {
                source: AudioSource::Mic,
                selected_mics: Vec::new(),
            });

        match cfg.source {
            AudioSource::Mic => {
                run_multi_mic_capture(
                    notify_hwnd,
                    &data,
                    &audio_tx,
                    &cfg.selected_mics,
                    gen,
                    &config_gen,
                    &stop,
                    &echo_gate,
                    &coeffs,
                );
            }
            AudioSource::Loopback => {
                run_loopback_capture(
                    notify_hwnd,
                    &data,
                    &audio_tx,
                    gen,
                    &config_gen,
                    &stop,
                    &coeffs,
                );
            }
        }

        if !stop.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(80));
        }
    }
}

struct MicFrame {
    mic_idx: usize,
    pcm: AudioFrame,
}

/// Lightweight per-microphone SNR & clipping tracker for active-SNR multi-mic switching.
struct MicSignalStats {
    name: String,
    noise_floor_rms: f32,
    snr_db: f32,
    noise_floor_db: f32,
    clipping: bool,
    init_frames: usize,
    hp_prev_x: f32,
    hp_prev_y: f32,
}

impl MicSignalStats {
    fn new(name: String) -> Self {
        Self {
            name,
            noise_floor_rms: 0.002,
            snr_db: 0.0,
            noise_floor_db: -54.0,
            clipping: false,
            init_frames: 0,
            hp_prev_x: 0.0,
            hp_prev_y: 0.0,
        }
    }

    fn analyze(&mut self, pcm: &[i16]) -> (f32, f32, bool) {
        let mut sum_sq = 0.0f32;
        let mut clipped_samples = 0usize;
        const HP_ALPHA: f32 = 0.94; // ~160 Hz high-pass to ignore HVAC/table rumble in SNR score

        for &s in pcm {
            if s.unsigned_abs() >= 32_400 {
                clipped_samples += 1;
            }
            let x = s as f32 / 32768.0;
            let y = HP_ALPHA * (self.hp_prev_y + x - self.hp_prev_x);
            self.hp_prev_x = x;
            self.hp_prev_y = y;
            sum_sq += y * y;
        }

        let rms = (sum_sq / pcm.len().max(1) as f32).sqrt().max(1e-6);
        let clipping = clipped_samples >= 4;

        if self.init_frames < 12 {
            self.noise_floor_rms = self.noise_floor_rms * 0.7 + rms * 0.3;
            self.init_frames += 1;
        } else if rms < self.noise_floor_rms * 1.6 {
            self.noise_floor_rms = self.noise_floor_rms * 0.96 + rms * 0.04;
        } else {
            // Very slow upward drift so sustained room noise adapts without eating speech.
            self.noise_floor_rms = self.noise_floor_rms * 0.997 + rms * 0.003;
        }

        self.noise_floor_rms = self.noise_floor_rms.clamp(1e-4, 0.35);
        self.snr_db = 20.0 * (rms / self.noise_floor_rms).log10();
        self.noise_floor_db = 20.0 * self.noise_floor_rms.log10();
        self.clipping = clipping;

        (self.snr_db, self.noise_floor_db, clipping)
    }

    fn classify_status(&self, tts_gated: bool) -> SignalStatus {
        if tts_gated {
            return SignalStatus::TtsMuted;
        }
        if self.clipping {
            return SignalStatus::Clipping;
        }
        if self.noise_floor_db > -22.0 && self.snr_db < 4.5 {
            return SignalStatus::Drowned;
        }
        if self.noise_floor_db > -32.0 {
            return SignalStatus::Noisy;
        }
        if self.snr_db >= 5.0 {
            return SignalStatus::Clear;
        }
        SignalStatus::Standby
    }
}

/// Resamples arbitrary-channel / arbitrary-sample-rate WASAPI audio to 16 kHz mono 512-sample chunks
/// using a boxcar anti-aliasing prefilter to prevent high-frequency noise folding into the speech band.
struct StreamResampler {
    channels: usize,
    step: f64,
    frac_pos: f64,
    prev_sample: f32,
    mono_buf: Vec<f32>,
    chunk_buf: AudioFrame,
    chunk_len: usize,
}

impl StreamResampler {
    fn new(channels: usize, src_rate: u32) -> Self {
        Self {
            channels: channels.max(1),
            step: src_rate as f64 / SAMPLE_RATE as f64,
            frac_pos: 0.0,
            prev_sample: 0.0,
            mono_buf: Vec::with_capacity(2048),
            chunk_buf: [0i16; CHUNK_SAMPLES],
            chunk_len: 0,
        }
    }

    fn push_f32(&mut self, input: &[f32], mut on_chunk: impl FnMut(&AudioFrame)) {
        self.mono_buf.clear();
        let inv_ch = 1.0 / self.channels as f32;
        for frame in input.chunks_exact(self.channels) {
            let sum: f32 = frame.iter().copied().sum();
            let raw = sum * inv_ch;
            // Light 1-pole anti-aliasing prefilter when downsampling (e.g., 48k -> 16k).
            let filt = if self.step > 1.5 {
                let y = 0.55 * raw + 0.45 * self.prev_sample;
                self.prev_sample = y;
                y
            } else {
                raw
            };
            self.mono_buf.push(filt);
        }
        self.drain_resampled(&mut on_chunk);
    }

    fn push_i16(&mut self, input: &[i16], mut on_chunk: impl FnMut(&AudioFrame)) {
        self.mono_buf.clear();
        let inv_ch = 1.0 / (self.channels as f32 * 32768.0);
        for frame in input.chunks_exact(self.channels) {
            let sum: f32 = frame.iter().map(|&s| s as f32).sum();
            let raw = sum * inv_ch;
            let filt = if self.step > 1.5 {
                let y = 0.55 * raw + 0.45 * self.prev_sample;
                self.prev_sample = y;
                y
            } else {
                raw
            };
            self.mono_buf.push(filt);
        }
        self.drain_resampled(&mut on_chunk);
    }

    fn drain_resampled(&mut self, on_chunk: &mut impl FnMut(&AudioFrame)) {
        if self.mono_buf.len() < 2 {
            return;
        }
        while (self.frac_pos as usize) + 1 < self.mono_buf.len() {
            let idx = self.frac_pos as usize;
            let t = (self.frac_pos - idx as f64) as f32;
            let s = self.mono_buf[idx] * (1.0 - t) + self.mono_buf[idx + 1] * t;
            self.chunk_buf[self.chunk_len] = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
            self.chunk_len += 1;
            self.frac_pos += self.step;

            if self.chunk_len == CHUNK_SAMPLES {
                on_chunk(&self.chunk_buf);
                self.chunk_len = 0;
            }
        }
        self.frac_pos -= self.mono_buf.len() as f64;
        if self.frac_pos < 0.0 {
            self.frac_pos = 0.0;
        }
    }
}

fn open_cpal_input_stream(
    device: &cpal::Device,
    mic_idx: usize,
    frame_tx: SyncSender<MicFrame>,
) -> Option<cpal::Stream> {
    let cfg = device.default_input_config().ok()?;
    let channels = cfg.channels() as usize;
    let src_rate = cfg.sample_rate().0;
    let sample_format = cfg.sample_format();
    let stream_cfg: cpal::StreamConfig = cfg.into();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let mut resampler = StreamResampler::new(channels, src_rate);
            device.build_input_stream(
                &stream_cfg,
                move |data: &[f32], _| {
                    resampler.push_f32(data, |chunk| {
                        let _ = frame_tx.try_send(MicFrame {
                            mic_idx,
                            pcm: *chunk,
                        });
                    });
                },
                |_| {},
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let mut resampler = StreamResampler::new(channels, src_rate);
            device.build_input_stream(
                &stream_cfg,
                move |data: &[i16], _| {
                    resampler.push_i16(data, |chunk| {
                        let _ = frame_tx.try_send(MicFrame {
                            mic_idx,
                            pcm: *chunk,
                        });
                    });
                },
                |_| {},
                None,
            )
        }
        _ => return None,
    }
    .ok()?;

    if stream.play().is_err() {
        return None;
    }
    Some(stream)
}

#[allow(clippy::too_many_arguments)]
fn run_multi_mic_capture(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    audio_tx: &Arc<Mutex<Option<SyncSender<AudioFrame>>>>,
    selected_mics: &[String],
    my_gen: u64,
    config_gen: &Arc<AtomicU64>,
    stop: &Arc<AtomicBool>,
    echo_gate: &Arc<TtsEchoGate>,
    coeffs: &[f32; BANDS],
) {
    let host = cpal::default_host();
    let mut devices: Vec<(String, cpal::Device)> = Vec::new();

    if !selected_mics.is_empty() {
        if let Ok(all) = host.input_devices() {
            for dev in all {
                if let Ok(name) = dev.name() {
                    if selected_mics.iter().any(|wanted| wanted == &name) {
                        devices.push((name, dev));
                    }
                }
            }
        }
    }

    if devices.is_empty() {
        if let Some(def) = host.default_input_device() {
            let name = def.name().unwrap_or_else(|_| "Default Mic".to_string());
            devices.push((name, def));
        }
    }
    if devices.is_empty() {
        return;
    }

    let (frame_tx, frame_rx): (SyncSender<MicFrame>, Receiver<MicFrame>) = mpsc::sync_channel(128);
    let mut streams = Vec::with_capacity(devices.len());
    let mut stats = Vec::with_capacity(devices.len());

    for (idx, (name, dev)) in devices.into_iter().enumerate() {
        if let Some(s) = open_cpal_input_stream(&dev, idx, frame_tx.clone()) {
            streams.push(s);
            stats.push(MicSignalStats::new(name));
        }
    }

    // Bind local UDP IPC receiver for esp32-mic-hub (127.0.0.1:47100)
    let esp_base_idx = stats.len();
    let esp_udp_ok = if let Ok(sock) = std::net::UdpSocket::bind("127.0.0.1:47100") {
        let _ = sock.set_read_timeout(Some(Duration::from_millis(50)));
        for ch in 1..=3 {
            stats.push(MicSignalStats::new(format!("ESP32-BLE CH {ch}")));
        }
        let tx_udp = frame_tx.clone();
        let stop_udp = Arc::clone(stop);
        let gen_udp = Arc::clone(config_gen);
        thread::spawn(move || {
            let mut buf = [0u8; 1024];
            let mut pcm_in = [0i16; 480];
            let mut resamplers = [
                StreamResampler::new(1, 16_000),
                StreamResampler::new(1, 16_000),
                StreamResampler::new(1, 16_000),
            ];
            while !stop_udp.load(Ordering::Relaxed) && gen_udp.load(Ordering::Acquire) == my_gen {
                let Ok((len, _)) = sock.recv_from(&mut buf) else {
                    continue;
                };
                if len < 9 + 2 || &buf[0..4] != b"EMIC" {
                    continue;
                }
                let slot = (buf[4] as usize).min(2);
                let sample_count = ((len - 9) / 2).min(480);
                for (i, chunk) in buf[9..9 + sample_count * 2].chunks_exact(2).enumerate() {
                    pcm_in[i] = i16::from_le_bytes([chunk[0], chunk[1]]);
                }
                let mic_idx = esp_base_idx + slot;
                resamplers[slot].push_i16(&pcm_in[..sample_count], |chunk| {
                    let _ = tx_udp.try_send(MicFrame {
                        mic_idx,
                        pcm: *chunk,
                    });
                });
            }
        });
        true
    } else {
        false
    };
    drop(frame_tx);

    if streams.is_empty() && !esp_udp_ok {
        return;
    }

    let active_mic_count = stats.len();
    let mut active_idx: usize = 0;
    let mut last_switch = Instant::now();
    let mut prev_tail: [i16; 16] = [0; 16];
    let mut need_crossfade = false;

    let mut samples_f32 = [0.0f32; CHUNK_SAMPLES];
    let mut smoothed = [0.0f32; BANDS];
    let mut smoothed_peak = 0.0f32;
    let silent_chunk: AudioFrame = [0i16; CHUNK_SAMPLES];

    while !stop.load(Ordering::Relaxed) && config_gen.load(Ordering::Acquire) == my_gen {
        let Ok(mut frame) = frame_rx.recv_timeout(Duration::from_millis(50)) else {
            continue;
        };
        if frame.mic_idx >= stats.len() {
            continue;
        }

        let (snr_db, _floor_db, _clip) = stats[frame.mic_idx].analyze(&frame.pcm);

        // Multi-mic Active-SNR selection with 250ms hysteresis hangover.
        if stats.len() > 1 && frame.mic_idx != active_idx {
            let cur_snr = stats[active_idx].snr_db;
            let switch_margin = if last_switch.elapsed() < Duration::from_millis(250) {
                6.0
            } else {
                2.8
            };
            if snr_db > cur_snr + switch_margin && snr_db > 3.5 && !stats[frame.mic_idx].clipping {
                active_idx = frame.mic_idx;
                last_switch = Instant::now();
                need_crossfade = true;
            }
        }

        if frame.mic_idx != active_idx {
            continue;
        }

        if need_crossfade {
            for i in 0..16.min(frame.pcm.len()) {
                let alpha = (i as f32 + 1.0) / 17.0;
                let mixed = prev_tail[i] as f32 * (1.0 - alpha) + frame.pcm[i] as f32 * alpha;
                frame.pcm[i] = mixed.clamp(-32768.0, 32767.0) as i16;
            }
            need_crossfade = false;
        }
        if frame.pcm.len() >= 16 {
            prev_tail.copy_from_slice(&frame.pcm[frame.pcm.len() - 16..]);
        }

        let tts_gated = echo_gate.is_gated();
        process_chunk(
            &frame.pcm,
            coeffs,
            &mut samples_f32,
            &mut smoothed,
            &mut smoothed_peak,
        );

        if tts_gated {
            forward_pcm(audio_tx, &silent_chunk);
        } else {
            forward_pcm(audio_tx, &frame.pcm);
        }

        let active_stat = &stats[active_idx];
        let health = active_stat.classify_status(tts_gated);
        publish_meter(
            notify_hwnd,
            data,
            smoothed,
            smoothed_peak,
            active_stat.snr_db,
            active_stat.noise_floor_db,
            health,
            &active_stat.name,
            active_mic_count,
        );
    }

    drop(streams);
}

#[allow(clippy::too_many_arguments)]
fn run_loopback_capture(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    audio_tx: &Arc<Mutex<Option<SyncSender<AudioFrame>>>>,
    my_gen: u64,
    config_gen: &Arc<AtomicU64>,
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
    let src_rate = out_cfg.sample_rate().0;
    let data_cb = Arc::clone(data);
    let tx_cb = Arc::clone(audio_tx);
    let coeffs_copy = *coeffs;

    let mut resampler = StreamResampler::new(channels, src_rate);
    let mut stat = MicSignalStats::new("System Loopback".to_string());
    let mut samples_f32 = [0.0f32; CHUNK_SAMPLES];
    let mut smoothed = [0.0f32; BANDS];
    let mut smoothed_peak = 0.0f32;

    let stream = device.build_input_stream(
        &out_cfg.into(),
        move |input: &[f32], _| {
            resampler.push_f32(input, |chunk| {
                stat.analyze(chunk);
                process_chunk(
                    chunk,
                    &coeffs_copy,
                    &mut samples_f32,
                    &mut smoothed,
                    &mut smoothed_peak,
                );
                forward_pcm(&tx_cb, chunk);
                let health = stat.classify_status(false);
                publish_meter(
                    notify_hwnd,
                    &data_cb,
                    smoothed,
                    smoothed_peak,
                    stat.snr_db,
                    stat.noise_floor_db,
                    health,
                    "System Loopback",
                    1,
                );
            });
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

    while !stop.load(Ordering::Relaxed) && config_gen.load(Ordering::Acquire) == my_gen {
        thread::sleep(Duration::from_millis(40));
    }
}

#[allow(clippy::too_many_arguments)]
fn publish_meter(
    notify_hwnd: isize,
    data: &Arc<Mutex<MeterData>>,
    bands: [f32; BANDS],
    peak: f32,
    snr_db: f32,
    noise_floor_db: f32,
    status: SignalStatus,
    mic_name: &str,
    active_mic_count: usize,
) {
    if let Ok(mut guard) = data.lock() {
        guard.bands = bands;
        guard.peak = peak;
        guard.snr_db = snr_db;
        guard.noise_floor_db = noise_floor_db;
        guard.status = status;
        if guard.active_mic_name != mic_name {
            guard.active_mic_name.clear();
            guard.active_mic_name.push_str(mic_name);
        }
        guard.active_mic_count = active_mic_count;
    }
    post_app_msg(notify_hwnd, WM_APP_METER_TICK, 0);
}

fn forward_pcm(audio_tx: &Arc<Mutex<Option<SyncSender<AudioFrame>>>>, pcm: &AudioFrame) {
    if let Ok(guard) = audio_tx.lock() {
        if let Some(ref tx) = *guard {
            let _ = tx.try_send(*pcm);
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
