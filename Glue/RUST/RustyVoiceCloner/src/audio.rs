//! Microphone capture via cpal, continuous full-session WAV recording,
//! and live ring + active take buffers for 60fps visualization.

use crate::dsp::{resample_linear, SAMPLE_RATE};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const LIVE_RING_CAPACITY: usize = (SAMPLE_RATE as usize) * 3; // 3 seconds

pub struct AudioCapture {
    pub mic_name: String,
    pub session_wav_path: PathBuf,
    live_ring: Arc<Mutex<VecDeque<f32>>>,
    take_buf: Arc<Mutex<Vec<f32>>>,
    is_recording_take: Arc<AtomicBool>,
    session_writer: Arc<Mutex<Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>>>,
    _stream: Option<cpal::Stream>,
}

impl AudioCapture {
    pub fn start(recordings_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(recordings_dir)
            .map_err(|e| format!("Failed to create recordings dir: {e}"))?;

        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let session_wav_path = recordings_dir.join(format!("session_{ts}.wav"));

        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = hound::WavWriter::create(&session_wav_path, spec)
            .map_err(|e| format!("Failed to open session WAV: {e}"))?;
        let session_writer = Arc::new(Mutex::new(Some(writer)));

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default microphone input device found".to_string())?;
        let mic_name = device.name().unwrap_or_else(|_| "Default Microphone".to_string());
        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {e}"))?;

        let src_rate = config.sample_rate().0;
        let channels = config.channels().max(1) as usize;

        let live_ring = Arc::new(Mutex::new(VecDeque::with_capacity(LIVE_RING_CAPACITY)));
        let take_buf = Arc::new(Mutex::new(Vec::new()));
        let is_recording_take = Arc::new(AtomicBool::new(false));

        let ring_c = Arc::clone(&live_ring);
        let take_c = Arc::clone(&take_buf);
        let rec_flag = Arc::clone(&is_recording_take);
        let writer_c = Arc::clone(&session_writer);

        let err_fn = |err| {
            eprintln!("cpal input stream error: {err}");
        };

        let handle_mono = move |mono: Vec<f32>| {
            let resampled = resample_linear(&mono, src_rate, SAMPLE_RATE);

            // 1. Always append to continuous full-session WAV
            if let Ok(mut guard) = writer_c.lock() {
                if let Some(w) = guard.as_mut() {
                    for &s in &resampled {
                        let q = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
                        let _ = w.write_sample(q);
                    }
                }
            }

            // 2. Append to live ring buffer
            if let Ok(mut ring) = ring_c.lock() {
                for &s in &resampled {
                    if ring.len() >= LIVE_RING_CAPACITY {
                        ring.pop_front();
                    }
                    ring.push_back(s);
                }
            }

            // 3. Append to active take buffer if Spacebar/Record is held
            if rec_flag.load(Ordering::Acquire) {
                if let Ok(mut tb) = take_c.lock() {
                    tb.extend_from_slice(&resampled);
                }
            }
        };

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    let mono: Vec<f32> = data
                        .chunks(channels)
                        .map(|c| c.iter().sum::<f32>() / channels as f32)
                        .collect();
                    handle_mono(mono);
                },
                err_fn,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _| {
                    let mono: Vec<f32> = data
                        .chunks(channels)
                        .map(|c| c.iter().map(|&x| x as f32 / 32768.0).sum::<f32>() / channels as f32)
                        .collect();
                    handle_mono(mono);
                },
                err_fn,
                None,
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &config.into(),
                move |data: &[u16], _| {
                    let mono: Vec<f32> = data
                        .chunks(channels)
                        .map(|c| {
                            c.iter()
                                .map(|&x| (x as f32 - 32768.0) / 32768.0)
                                .sum::<f32>()
                                / channels as f32
                        })
                        .collect();
                    handle_mono(mono);
                },
                err_fn,
                None,
            ),
            other => return Err(format!("Unsupported mic sample format: {other:?}")),
        }
        .map_err(|e| format!("Failed to build mic input stream: {e}"))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start mic stream: {e}"))?;

        Ok(Self {
            mic_name,
            session_wav_path,
            live_ring,
            take_buf,
            is_recording_take,
            session_writer,
            _stream: Some(stream),
        })
    }

    pub fn start_take(&self) {
        if let Ok(mut tb) = self.take_buf.lock() {
            tb.clear();
        }
        self.is_recording_take.store(true, Ordering::Release);
    }

    pub fn stop_take(&self) -> Vec<f32> {
        self.is_recording_take.store(false, Ordering::Release);
        if let Ok(mut tb) = self.take_buf.lock() {
            std::mem::take(&mut *tb)
        } else {
            Vec::new()
        }
    }

    pub fn snapshot_live_samples(&self, max_samples: usize) -> Vec<f32> {
        if let Ok(ring) = self.live_ring.lock() {
            let skip = ring.len().saturating_sub(max_samples);
            ring.iter().skip(skip).copied().collect()
        } else {
            Vec::new()
        }
    }

    pub fn finalize_session(&self) {
        if let Ok(mut guard) = self.session_writer.lock() {
            if let Some(w) = guard.take() {
                let _ = w.finalize();
            }
        }
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.finalize_session();
    }
}
