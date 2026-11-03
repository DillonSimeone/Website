#![windows_subsystem = "windows"]

mod adb;
mod config;
mod dsp;
mod telemetry;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
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

fn log_msg(msg: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let line = format!("[{}] {}\n", now, msg);

    // Limit log file to 200 KB
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
        if h == std::ptr::null_mut() {
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

    // 1. Kill any existing PID from haptics.pid
    if let Ok(content) = fs::read_to_string(PID_FILE) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
    }
    let _ = fs::remove_file(PID_FILE);

    // 2. Kill legacy Python haptics daemon if still lingering
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*audio_haptics_daemon.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    log_msg("AudioToSmartphoneHaptics daemons stopped cleanly.");
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
        if mutex_handle != std::ptr::null_mut() {
            unsafe { CloseHandle(mutex_handle) };
        }
        return;
    }

    // Write PID file
    let pid = std::process::id();
    let _ = fs::write(PID_FILE, pid.to_string());
    log_msg(&format!("AudioToSmartphoneHaptics (Rust) started with PID {}", pid));

    // Resolve config path
    let config_path = config::get_config_path();
    let initial_cfg = config::load_config(&config_path);
    log_msg(&format!("Loaded configuration from {:?}: Scale={}x, BaseAmp={}, PunchDur={}ms, Enabled={}",
        config_path, initial_cfg.amplitude_scale, initial_cfg.base_amplitude, initial_cfg.punch_duration_ms, initial_cfg.enabled));

    // Initialize ADB persistent pipeline
    let adb_path = adb::find_adb_path();
    log_msg(&format!("Using ADB binary: {:?}", adb_path));
    let adb_pipeline = Arc::new(adb::PersistentAdbPipeline::new(adb_path));

    // Initialize Telemetry UDP Broadcaster
    let telemetry_broadcaster = Arc::new(telemetry::TelemetryBroadcaster::new());

    // Initialize CPAL loopback
    let host = cpal::default_host();
    let device = match host.default_output_device() {
        Some(d) => d,
        None => {
            log_msg("FATAL: No default audio output device found for loopback capture.");
            cleanup(mutex_handle);
            return;
        }
    };

    let device_name = device.name().unwrap_or_else(|_| "Unknown Output Device".to_string());
    log_msg(&format!("Default Audio Playback Endpoint: {}", device_name));

    let output_config = match device.default_output_config() {
        Ok(c) => c,
        Err(e) => {
            log_msg(&format!("FATAL: Failed to get default output config: {:?}", e));
            cleanup(mutex_handle);
            return;
        }
    };

    let channels = output_config.channels() as usize;
    let sample_rate = output_config.sample_rate().0 as f32;
    log_msg(&format!("Audio loopback format: {} Hz, {} channels, {:?}", sample_rate, channels, output_config.sample_format()));

    let stream_config: cpal::StreamConfig = output_config.into();

    // Shared state between audio thread and main loop
    let dsp_state = Arc::new(Mutex::new(dsp::DspProcessor::new(
        initial_cfg.sub_bass_low_hz as f32,
        initial_cfg.sub_bass_high_hz as f32,
        initial_cfg.mid_punch_high_hz as f32,
        initial_cfg.snap_high_hz as f32,
        sample_rate,
    )));

    let active_cfg = Arc::new(Mutex::new(initial_cfg));

    // Audio callback
    let dsp_for_audio = Arc::clone(&dsp_state);
    let cfg_for_audio = Arc::clone(&active_cfg);
    let adb_for_audio = Arc::clone(&adb_pipeline);
    let broadcaster_for_audio = Arc::clone(&telemetry_broadcaster);

    let start_time = Instant::now();
    let mut last_telemetry_time = 0.0f64;
    let mut mono_buffer: Vec<f32> = Vec::with_capacity(1024);

    let stream = match device.build_input_stream(
        &stream_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if data.is_empty() {
                return;
            }

            let now = start_time.elapsed().as_secs_f64();

            // Downmix interleaved channels to mono
            let frame_count = data.len() / channels;
            mono_buffer.clear();
            if channels == 1 {
                mono_buffer.extend_from_slice(&data[..frame_count]);
            } else if channels == 2 {
                for i in 0..frame_count {
                    let l = data[i * 2];
                    let r = data[i * 2 + 1];
                    mono_buffer.push((l + r) * 0.5);
                }
            } else {
                let inv = 1.0 / channels as f32;
                for i in 0..frame_count {
                    let mut sum = 0.0f32;
                    for c in 0..channels {
                        sum += data[i * channels + c];
                    }
                    mono_buffer.push(sum * inv);
                }
            }

            let cfg = if let Ok(c) = cfg_for_audio.try_lock() {
                c.clone()
            } else {
                return;
            };

            let mut dsp = if let Ok(d) = dsp_for_audio.try_lock() {
                d
            } else {
                return;
            };

            let analysis = dsp.process_mono_chunk(
                &mono_buffer,
                now,
                cfg.amplitude_scale,
                cfg.noise_floor,
                cfg.min_velocity,
                cfg.enable_snap_primitives,
                cfg.enabled,
            );

            if analysis.should_trigger {
                let env = adb::build_envelope(
                    analysis.velocity_curved,
                    analysis.is_snap,
                    analysis.is_deep_sub,
                    cfg.punch_duration_ms,
                    cfg.base_amplitude,
                );
                adb_for_audio.send(env.cmd);
                dsp.set_hit_state(env.peak_amp, env.duration_ms, now);
            }

            // Emit 40 FPS telemetry to local visualizer (every 25ms)
            if now - last_telemetry_time >= 0.025 {
                last_telemetry_time = now;
                broadcaster_for_audio.send(&telemetry::TelemetryPacket {
                    energy: analysis.bass_energy,
                    sub: analysis.sub_energy,
                    punch: analysis.punch_energy,
                    snap: analysis.snap_energy,
                    vel: analysis.velocity,
                    pwm: analysis.active_pwm,
                    hit: analysis.should_trigger,
                    peak: analysis.displayed_peak,
                    enabled: cfg.enabled,
                });
            }
        },
        move |err| {
            log_msg(&format!("CPAL Stream Error: {:?}", err));
        },
        None,
    ) {
        Ok(s) => s,
        Err(e) => {
            log_msg(&format!("FATAL: Failed to build CPAL input stream: {:?}", e));
            cleanup(mutex_handle);
            return;
        }
    };

    if let Err(e) = stream.play() {
        log_msg(&format!("FATAL: Failed to start playback stream: {:?}", e));
        cleanup(mutex_handle);
        return;
    }

    log_msg("AudioToSmartphoneHaptics engine actively processing audio loopback.");

    // Dynamic config reload watcher & heartbeat in main loop
    let mut last_mtime = fs::metadata(&config_path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    while RUNNING.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(250));

        // Check for config file modification
        if let Ok(meta) = fs::metadata(&config_path) {
            if let Ok(mtime) = meta.modified() {
                if mtime > last_mtime {
                    last_mtime = mtime;
                    let new_cfg = config::load_config(&config_path);
                    log_msg(&format!("Config reloaded dynamically: Scale={}x, BaseAmp={}, PunchDur={}ms, Enabled={}",
                        new_cfg.amplitude_scale, new_cfg.base_amplitude, new_cfg.punch_duration_ms, new_cfg.enabled));

                    if let Ok(mut dsp) = dsp_state.lock() {
                        dsp.filter_bank.update(
                            new_cfg.sub_bass_low_hz as f32,
                            new_cfg.sub_bass_high_hz as f32,
                            new_cfg.mid_punch_high_hz as f32,
                            new_cfg.snap_high_hz as f32,
                        );
                    }
                    if let Ok(mut cfg_guard) = active_cfg.lock() {
                        *cfg_guard = new_cfg;
                    }
                }
            }
        }
    }

    drop(stream);
    cleanup(mutex_handle);
}

fn cleanup(mutex_handle: HANDLE) {
    let _ = fs::remove_file(PID_FILE);
    if mutex_handle != std::ptr::null_mut() {
        unsafe { CloseHandle(mutex_handle) };
    }
    log_msg("AudioToSmartphoneHaptics shut down cleanly.");
}
