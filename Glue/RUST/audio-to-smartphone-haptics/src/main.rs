#![windows_subsystem = "windows"]

mod adb;
mod config;
mod dsp;
mod telemetry;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, HANDLE};
use windows_sys::Win32::System::Threading::CreateMutexW;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const MUTEX_NAME: &str = "Global\\AudioToSmartphoneHaptics_RustMutex\0";
const PID_FILE: &str = "haptics.pid";
const LOG_FILE: &str = "haptics.log";

static RUNNING: AtomicBool = AtomicBool::new(true);

struct MultiMicRouter {
    active_mic_idx: usize,
    active_mic_rms: f32,
    last_active_time: f64,
    active_source_label: String,
    last_telemetry_time: f64,
}

fn log_msg(msg: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let line = format!("[{}] {}\n", now, msg);

    if let Ok(meta) = fs::metadata(LOG_FILE) {
        if meta.len() > 200_000 {
            let _ = fs::write(LOG_FILE, "");
        }
    }

    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(LOG_FILE) {
        let _ = f.write_all(line.as_bytes());
    }
}

fn acquire_mutex() -> (HANDLE, bool) {
    let wide_name: Vec<u16> = MUTEX_NAME.encode_utf16().collect();
    unsafe {
        let h = CreateMutexW(std::ptr::null(), 0, wide_name.as_ptr());
        if h.is_null() {
            (std::ptr::null_mut(), false)
        } else {
            let err = windows_sys::Win32::Foundation::GetLastError();
            if err == ERROR_ALREADY_EXISTS {
                (h, false)
            } else {
                (h, true)
            }
        }
    }
}

fn handle_stop() {
    log_msg("Stop signal received via --stop flag");

    if let Ok(content) = fs::read_to_string(PID_FILE) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
    }
    let _ = fs::remove_file(PID_FILE);
    log_msg("AudioToSmartphoneHaptics daemon stopped cleanly.");
}

fn shorten_device_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.len() <= 34 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..31])
    }
}

fn process_interleaved_f32(
    data: &[f32],
    channels: usize,
    sample_rate: f32,
    mic_idx: usize,
    total_mics: usize,
    source_name: &str,
    start_time: Instant,
    mono_buffer: &mut Vec<f32>,
    router: &Arc<Mutex<MultiMicRouter>>,
    dsp_state: &Arc<Mutex<dsp::DspProcessor>>,
    cfg_state: &Arc<Mutex<config::HapticsConfig>>,
    adb_pipeline: &Arc<adb::PersistentAdbPipeline>,
    telemetry_broadcaster: &Arc<telemetry::TelemetryBroadcaster>,
) {
    if data.is_empty() || channels == 0 {
        return;
    }

    let now = start_time.elapsed().as_secs_f64();
    let frame_count = data.len() / channels;
    if frame_count == 0 {
        return;
    }

    mono_buffer.clear();
    let mut sum_sq = 0.0f32;
    if channels == 1 {
        for &s in &data[..frame_count] {
            sum_sq += s * s;
            mono_buffer.push(s);
        }
    } else if channels == 2 {
        for i in 0..frame_count {
            let m = (data[i * 2] + data[i * 2 + 1]) * 0.5;
            sum_sq += m * m;
            mono_buffer.push(m);
        }
    } else {
        let inv = 1.0 / channels as f32;
        for i in 0..frame_count {
            let mut s = 0.0f32;
            for c in 0..channels {
                s += data[i * channels + c];
            }
            let m = s * inv;
            sum_sq += m * m;
            mono_buffer.push(m);
        }
    }

    let chunk_rms = (sum_sq / frame_count as f32).sqrt();

    // When multiple microphones are open simultaneously, dynamically route whichever mic has
    // the strongest signal (or default to mic 0 when all mics are silent) so quiet mics don't dilute active mics.
    let mut should_emit_telemetry = false;
    let active_label: String;

    if let Ok(mut r) = router.try_lock() {
        if total_mics > 1 {
            let elapsed_since_active = now - r.last_active_time;
            if mic_idx == r.active_mic_idx {
                r.active_mic_rms = 0.75 * r.active_mic_rms + 0.25 * chunk_rms;
                if chunk_rms > 0.0015 {
                    r.last_active_time = now;
                }
            } else if chunk_rms > (r.active_mic_rms * 1.35).max(0.0025) || (elapsed_since_active > 0.18 && chunk_rms > 0.0015) {
                r.active_mic_idx = mic_idx;
                r.active_mic_rms = chunk_rms;
                r.last_active_time = now;
                r.active_source_label = source_name.to_string();
            } else if elapsed_since_active > 0.35 && mic_idx == 0 {
                r.active_mic_idx = 0;
            } else {
                // Another microphone is currently active and louder; skip this quieter secondary mic chunk
                return;
            }
        }
        active_label = r.active_source_label.clone();
        if now - r.last_telemetry_time >= 0.025 {
            r.last_telemetry_time = now;
            should_emit_telemetry = true;
        }
    } else {
        return;
    }

    let cfg = if let Ok(c) = cfg_state.try_lock() {
        c.clone()
    } else {
        return;
    };

    let mut dsp = if let Ok(d) = dsp_state.try_lock() {
        d
    } else {
        return;
    };

    if (dsp.filter_bank.sample_rate - sample_rate).abs() > 1.0 {
        let eff_punch_high = if cfg.mic_mode { (cfg.mid_punch_high_hz as f32).max(420.0) } else { cfg.mid_punch_high_hz as f32 };
        let eff_snap_high = if cfg.mic_mode { (cfg.snap_high_hz as f32).max(2400.0) } else { cfg.snap_high_hz as f32 };
        dsp.filter_bank.set_sample_rate_and_update(
            sample_rate,
            cfg.sub_bass_low_hz as f32,
            cfg.sub_bass_high_hz as f32,
            eff_punch_high,
            eff_snap_high,
        );
    }

    let analysis = dsp.process_mono_chunk(
        mono_buffer,
        now,
        cfg.amplitude_scale,
        cfg.noise_floor,
        cfg.min_velocity,
        cfg.base_amplitude,
        cfg.enable_snap_primitives,
        cfg.enabled,
        cfg.mic_mode,
        cfg.punch_duration_ms,
        &cfg.mode,
    );

    match analysis.motor_action {
        dsp::MotorAction::ContinuousHold { amp } => {
            adb_pipeline.send(adb::build_continuous_hold_cmd(amp));
        }
        dsp::MotorAction::Pulse { amp, pulse_ms } => {
            adb_pipeline.send(adb::build_haxel_pulse_cmd(amp, pulse_ms));
        }
        dsp::MotorAction::Primitive { id, scale } => {
            adb_pipeline.send(adb::build_primitive_cmd(id, scale));
        }
        dsp::MotorAction::Cancel => {
            adb_pipeline.send(adb::build_cancel_cmd());
        }
        dsp::MotorAction::None => {}
    }

    if should_emit_telemetry {
        telemetry_broadcaster.send(&telemetry::TelemetryPacket {
            energy: analysis.bass_energy,
            audio_pct: analysis.audio_pct,
            sub: analysis.sub_energy,
            punch: analysis.punch_energy,
            snap: analysis.snap_energy,
            vel: analysis.velocity,
            pwm: analysis.active_pwm,
            hit: analysis.hit,
            peak: analysis.displayed_peak,
            enabled: cfg.enabled,
            mic_mode: cfg.mic_mode,
            source: active_label,
        });
    }
}

fn build_device_stream(
    device: &cpal::Device,
    supported_cfg: cpal::SupportedStreamConfig,
    mic_idx: usize,
    total_mics: usize,
    source_label: String,
    start_time: Instant,
    router: Arc<Mutex<MultiMicRouter>>,
    dsp_state: Arc<Mutex<dsp::DspProcessor>>,
    cfg_state: Arc<Mutex<config::HapticsConfig>>,
    adb_pipeline: Arc<adb::PersistentAdbPipeline>,
    telemetry_broadcaster: Arc<telemetry::TelemetryBroadcaster>,
) -> Option<cpal::Stream> {
    let channels = supported_cfg.channels() as usize;
    let sample_rate = supported_cfg.sample_rate().0 as f32;
    let sample_format = supported_cfg.sample_format();
    let stream_config: cpal::StreamConfig = supported_cfg.into();

    let mut mono_buffer: Vec<f32> = Vec::with_capacity(1024);
    let mut conv_buffer: Vec<f32> = Vec::with_capacity(2048);

    let err_label = source_label.clone();
    let err_label_closure = err_label.clone();
    let err_fn = move |err| {
        log_msg(&format!("CPAL Stream Error ({}): {:?}", err_label_closure, err));
    };

    let stream_res = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                process_interleaved_f32(
                    data,
                    channels,
                    sample_rate,
                    mic_idx,
                    total_mics,
                    &source_label,
                    start_time,
                    &mut mono_buffer,
                    &router,
                    &dsp_state,
                    &cfg_state,
                    &adb_pipeline,
                    &telemetry_broadcaster,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                conv_buffer.clear();
                conv_buffer.extend(data.iter().map(|&s| s as f32 / 32768.0));
                process_interleaved_f32(
                    &conv_buffer,
                    channels,
                    sample_rate,
                    mic_idx,
                    total_mics,
                    &source_label,
                    start_time,
                    &mut mono_buffer,
                    &router,
                    &dsp_state,
                    &cfg_state,
                    &adb_pipeline,
                    &telemetry_broadcaster,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                conv_buffer.clear();
                conv_buffer.extend(data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0));
                process_interleaved_f32(
                    &conv_buffer,
                    channels,
                    sample_rate,
                    mic_idx,
                    total_mics,
                    &source_label,
                    start_time,
                    &mut mono_buffer,
                    &router,
                    &dsp_state,
                    &cfg_state,
                    &adb_pipeline,
                    &telemetry_broadcaster,
                );
            },
            err_fn,
            None,
        ),
        _ => {
            log_msg(&format!("Unsupported sample format {:?} on {}", sample_format, source_label));
            return None;
        }
    };

    match stream_res {
        Ok(s) => {
            if let Err(e) = s.play() {
                log_msg(&format!("Failed to start stream for {}: {:?}", err_label, e));
                None
            } else {
                Some(s)
            }
        }
        Err(e) => {
            log_msg(&format!("Failed to build stream for {}: {:?}", err_label, e));
            None
        }
    }
}

fn start_audio_streams(
    mic_mode: bool,
    start_time: Instant,
    router: &Arc<Mutex<MultiMicRouter>>,
    dsp_state: &Arc<Mutex<dsp::DspProcessor>>,
    cfg_state: &Arc<Mutex<config::HapticsConfig>>,
    adb_pipeline: &Arc<adb::PersistentAdbPipeline>,
    telemetry_broadcaster: &Arc<telemetry::TelemetryBroadcaster>,
) -> Vec<cpal::Stream> {
    let host = cpal::default_host();
    let mut streams = Vec::new();

    if mic_mode {
        // Discover all distinct microphones on the computer (default input device first, then all others)
        let mut mic_devices: Vec<(cpal::Device, String)> = Vec::new();

        if let Some(def_in) = host.default_input_device() {
            let name = def_in.name().unwrap_or_else(|_| "Default Microphone".to_string());
            mic_devices.push((def_in, name));
        }

        if let Ok(all_inputs) = host.input_devices() {
            for dev in all_inputs {
                let name = dev.name().unwrap_or_else(|_| "Microphone".to_string());
                if !mic_devices.iter().any(|(_, existing_name)| existing_name == &name) {
                    mic_devices.push((dev, name));
                }
            }
        }

        let total_mics = mic_devices.len();
        log_msg(&format!("MIC MODE ENABLED: Discovered {} microphone input device(s).", total_mics));

        for (idx, (dev, name)) in mic_devices.into_iter().enumerate() {
            if let Ok(in_cfg) = dev.default_input_config() {
                let label = if total_mics > 1 {
                    format!("🎤 {} ({}/{})", shorten_device_name(&name), idx + 1, total_mics)
                } else {
                    format!("🎤 {}", shorten_device_name(&name))
                };
                log_msg(&format!(
                    "Opening Mic [{}]: '{}' ({} Hz, {} ch, {:?})",
                    idx,
                    name,
                    in_cfg.sample_rate().0,
                    in_cfg.channels(),
                    in_cfg.sample_format()
                ));

                if idx == 0 {
                    if let Ok(mut r) = router.lock() {
                        r.active_mic_idx = 0;
                        r.active_mic_rms = 0.0;
                        r.active_source_label = label.clone();
                    }
                }

                if let Some(s) = build_device_stream(
                    &dev,
                    in_cfg,
                    idx,
                    total_mics,
                    label,
                    start_time,
                    Arc::clone(router),
                    Arc::clone(dsp_state),
                    Arc::clone(cfg_state),
                    Arc::clone(adb_pipeline),
                    Arc::clone(telemetry_broadcaster),
                ) {
                    streams.push(s);
                }
            }
        }

        if !streams.is_empty() {
            return streams;
        }
        log_msg("WARNING: No active microphone could be opened. Falling back to speaker loopback.");
    }

    // Speaker Loopback Mode (default)
    if let Some(dev) = host.default_output_device() {
        let name = dev.name().unwrap_or_else(|_| "System Audio".to_string());
        if let Ok(out_cfg) = dev.default_output_config() {
            let label = format!("🔊 {}", shorten_device_name(&name));
            log_msg(&format!(
                "SPEAKER LOOPBACK MODE: '{}' ({} Hz, {} ch, {:?})",
                name,
                out_cfg.sample_rate().0,
                out_cfg.channels(),
                out_cfg.sample_format()
            ));
            if let Ok(mut r) = router.lock() {
                r.active_mic_idx = 0;
                r.active_mic_rms = 0.0;
                r.active_source_label = label.clone();
            }
            if let Some(s) = build_device_stream(
                &dev,
                out_cfg,
                0,
                1,
                label,
                start_time,
                Arc::clone(router),
                Arc::clone(dsp_state),
                Arc::clone(cfg_state),
                Arc::clone(adb_pipeline),
                Arc::clone(telemetry_broadcaster),
            ) {
                streams.push(s);
            }
        }
    } else {
        log_msg("ERROR: No default audio output device found for loopback capture.");
    }

    streams
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--stop") {
        handle_stop();
        return;
    }

    let (mutex_handle, acquired) = acquire_mutex();
    if !acquired {
        log_msg("Another instance of AudioToSmartphoneHaptics is already running. Exiting.");
        if !mutex_handle.is_null() {
            unsafe { CloseHandle(mutex_handle) };
        }
        return;
    }

    let pid = std::process::id();
    let _ = fs::write(PID_FILE, pid.to_string());
    log_msg(&format!("AudioToSmartphoneHaptics (Rust) started with PID {}", pid));

    let config_path = config::get_config_path();
    let initial_cfg = config::load_config(&config_path);
    log_msg(&format!(
        "Loaded config from {:?}: Scale={}x, BaseAmp={}, PunchDur={}ms, MicMode={}, Enabled={}",
        config_path,
        initial_cfg.amplitude_scale,
        initial_cfg.base_amplitude,
        initial_cfg.punch_duration_ms,
        initial_cfg.mic_mode,
        initial_cfg.enabled
    ));

    let adb_path = adb::find_adb_path();
    log_msg(&format!("Using ADB binary: {:?}", adb_path));
    let adb_pipeline = Arc::new(adb::PersistentAdbPipeline::new(adb_path));
    let telemetry_broadcaster = Arc::new(telemetry::TelemetryBroadcaster::new());

    let eff_punch_high = if initial_cfg.mic_mode {
        (initial_cfg.mid_punch_high_hz as f32).max(420.0)
    } else {
        initial_cfg.mid_punch_high_hz as f32
    };
    let eff_snap_high = if initial_cfg.mic_mode {
        (initial_cfg.snap_high_hz as f32).max(2400.0)
    } else {
        initial_cfg.snap_high_hz as f32
    };

    let dsp_state = Arc::new(Mutex::new(dsp::DspProcessor::new(
        initial_cfg.sub_bass_low_hz as f32,
        initial_cfg.sub_bass_high_hz as f32,
        eff_punch_high,
        eff_snap_high,
        48000.0,
    )));

    let mut current_mic_mode = initial_cfg.mic_mode;
    let active_cfg = Arc::new(Mutex::new(initial_cfg));
    let router = Arc::new(Mutex::new(MultiMicRouter {
        active_mic_idx: 0,
        active_mic_rms: 0.0,
        last_active_time: 0.0,
        active_source_label: "Initializing...".to_string(),
        last_telemetry_time: 0.0,
    }));

    let start_time = Instant::now();
    let mut active_streams = start_audio_streams(
        current_mic_mode,
        start_time,
        &router,
        &dsp_state,
        &active_cfg,
        &adb_pipeline,
        &telemetry_broadcaster,
    );

    let mut last_mtime = fs::metadata(&config_path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    while RUNNING.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(200));

        if let Ok(meta) = fs::metadata(&config_path) {
            if let Ok(mtime) = meta.modified() {
                if mtime > last_mtime {
                    last_mtime = mtime;
                    let new_cfg = config::load_config(&config_path);
                    let mode_switched = new_cfg.mic_mode != current_mic_mode;

                    log_msg(&format!(
                        "Config reloaded: Scale={}x, BaseAmp={}, PunchDur={}ms, MicMode={}, Enabled={}",
                        new_cfg.amplitude_scale,
                        new_cfg.base_amplitude,
                        new_cfg.punch_duration_ms,
                        new_cfg.mic_mode,
                        new_cfg.enabled
                    ));

                    let eff_p_high = if new_cfg.mic_mode {
                        (new_cfg.mid_punch_high_hz as f32).max(420.0)
                    } else {
                        new_cfg.mid_punch_high_hz as f32
                    };
                    let eff_s_high = if new_cfg.mic_mode {
                        (new_cfg.snap_high_hz as f32).max(2400.0)
                    } else {
                        new_cfg.snap_high_hz as f32
                    };

                    if let Ok(mut dsp) = dsp_state.lock() {
                        if mode_switched {
                            let fs = dsp.filter_bank.sample_rate;
                            dsp.reset_for_source_switch(
                                fs,
                                new_cfg.mic_mode,
                                new_cfg.sub_bass_low_hz as f32,
                                new_cfg.sub_bass_high_hz as f32,
                                eff_p_high,
                                eff_s_high,
                            );
                        } else {
                            dsp.filter_bank.update(
                                new_cfg.sub_bass_low_hz as f32,
                                new_cfg.sub_bass_high_hz as f32,
                                eff_p_high,
                                eff_s_high,
                            );
                        }
                    }

                    if let Ok(mut cfg_guard) = active_cfg.lock() {
                        *cfg_guard = new_cfg.clone();
                    }

                    if mode_switched {
                        current_mic_mode = new_cfg.mic_mode;
                        // Drop old streams before opening new capture endpoint(s)
                        active_streams.clear();
                        active_streams = start_audio_streams(
                            current_mic_mode,
                            start_time,
                            &router,
                            &dsp_state,
                            &active_cfg,
                            &adb_pipeline,
                            &telemetry_broadcaster,
                        );
                    }
                }
            }
        }
    }

    drop(active_streams);
    cleanup(mutex_handle);
}

fn cleanup(mutex_handle: HANDLE) {
    let _ = fs::remove_file(PID_FILE);
    if !mutex_handle.is_null() {
        unsafe { CloseHandle(mutex_handle) };
    }
    log_msg("AudioToSmartphoneHaptics shut down cleanly.");
}
