use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HapticsConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub mic_mode: bool,
    #[serde(default = "default_scale")]
    pub amplitude_scale: f32,
    #[serde(default = "default_base_amp")]
    pub base_amplitude: i32,
    #[serde(default = "default_punch_dur")]
    pub punch_duration_ms: i32,
    #[serde(default = "default_noise_floor")]
    pub noise_floor: f32,
    #[serde(default = "default_min_vel")]
    pub min_velocity: f32,
    #[serde(default = "default_true")]
    pub enable_snap_primitives: bool,
    #[serde(default = "default_sub_low")]
    pub sub_bass_low_hz: i32,
    #[serde(default = "default_sub_high")]
    pub sub_bass_high_hz: i32,
    #[serde(default = "default_punch_high")]
    pub mid_punch_high_hz: i32,
    #[serde(default = "default_snap_high")]
    pub snap_high_hz: i32,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub govee_sync: bool,
}

fn default_true() -> bool { true }
fn default_scale() -> f32 { 2.0 }
fn default_base_amp() -> i32 { 55 }
fn default_punch_dur() -> i32 { 85 }
fn default_noise_floor() -> f32 { 0.008 }
fn default_min_vel() -> f32 { 0.018 }
fn default_sub_low() -> i32 { 30 }
fn default_sub_high() -> i32 { 95 }
fn default_punch_high() -> i32 { 240 }
fn default_snap_high() -> i32 { 1400 }
fn default_mode() -> String { "VolumeToPwm".to_string() }

impl Default for HapticsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            mic_mode: false,
            amplitude_scale: 2.0,
            base_amplitude: 55,
            punch_duration_ms: 85,
            noise_floor: 0.008,
            min_velocity: 0.018,
            enable_snap_primitives: true,
            sub_bass_low_hz: 30,
            sub_bass_high_hz: 95,
            mid_punch_high_hz: 240,
            snap_high_hz: 1400,
            mode: "VolumeToPwm".to_string(),
            govee_sync: false,
        }
    }
}

pub fn get_haptics_config_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p_rust = dir.join("..").join("audio-to-smartphone-haptics").join("config.json");
            if p_rust.exists() {
                return p_rust;
            }
            let p_local = dir.join("audio-to-smartphone-haptics").join("config.json");
            if p_local.exists() {
                return p_local;
            }
            let p1 = dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("config.json");
            if p1.exists() {
                return p1;
            }
            let p2 = dir.join("..").join("AudioToSmartphoneHaptics").join("config.json");
            if p2.exists() {
                return p2;
            }
            let p3 = dir.join("haptics_config.json");
            return p3;
        }
    }
    let p_fixed = PathBuf::from(r"F:\Github\Website\public\Glue\RUST\audio-to-smartphone-haptics\config.json");
    if p_fixed.exists() {
        return p_fixed;
    }
    PathBuf::from(r"F:\Github\Website\public\Glue\Daemons\AudioToSmartphoneHaptics\config.json")
}

pub fn load_haptics_config() -> HapticsConfig {
    let p = get_haptics_config_path();
    if p.exists() {
        if let Ok(content) = fs::read_to_string(&p) {
            let clean = content.strip_prefix('\u{feff}').unwrap_or(&content);
            if let Ok(cfg) = serde_json::from_str::<HapticsConfig>(clean) {
                return cfg;
            }
        }
    }
    HapticsConfig::default()
}

pub fn save_haptics_config(cfg: &HapticsConfig) {
    let p = get_haptics_config_path();
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(p, json);
    }
}

pub fn trigger_test_haptic(adb: &PathBuf) {
    let cfg = load_haptics_config();
    trigger_preset_preview(adb, &cfg.mode);
}

pub fn trigger_preset_preview(adb: &PathBuf, mode: &str) {
    let cmd_str = match mode {
        "HaxelMultiBin" => {
            // BassPunch THUD -> Mid Throb QUICK_RISE -> Treble Staccato CLICK + TICK
            "cmd vibrator_manager synced -f -B primitives -s 0.95 2 -w 25 -s 0.80 4 -w 20 -s 1.00 1 -w 18 -s 0.70 7"
        }
        "Heartbeat" => {
            // Biometric Lub-Dub double pulse (exact Haxel Heartbeat timing)
            "cmd vibrator_manager synced -f -B primitives -s 1.00 2 -w 110 -s 0.85 1 -w 260 -s 1.00 2 -w 110 -s 0.85 1"
        }
        "BouncingDecay" => {
            // Accelerating bouncing ball with decaying amplitude
            "cmd vibrator_manager synced -f -B primitives -s 1.00 2 -w 130 -s 0.82 1 -w 90 -s 0.65 1 -w 60 -s 0.48 7 -w 35 -s 0.32 7 -w 20 -s 0.20 8"
        }
        "EngineRev" => {
            // Frequency-modulated accelerating engine rev
            "cmd vibrator_manager synced -f -B waveform -a 35 120 25 0 28 160 18 0 22 200 14 0 18 240 10 0 14 255 8 0"
        }
        "Throb" => {
            // Dual-sine organic interference wave
            "cmd vibrator_manager synced -f -B primitives -s 0.65 4 -w 15 -s 0.95 3 -w 15 -s 0.80 6 -w 30 -s 0.75 4 -w 15 -s 0.90 3"
        }
        "Staccato" => {
            // Sharp square micro-clicks with wide silent gaps
            "cmd vibrator_manager synced -f -B primitives -s 0.95 1 -w 90 -s 0.80 7 -w 90 -s 0.95 1 -w 90 -s 0.80 7"
        }
        "SawTremolo" => {
            // Rising sawtooth ramp chopped by fast carrier
            "cmd vibrator_manager synced -f -B waveform -a 16 70 12 0 16 115 12 0 16 165 12 0 18 215 10 0 22 255 10 0"
        }
        _ => {
            // "VolumeToPwm" (Default): Smooth continuous volume-to-PWM swell ramp without gaps
            "cmd vibrator_manager synced -f -B waveform -a 60 75 60 120 60 175 60 230 90 255 60 160 60 80"
        }
    };

    let _ = Command::new(adb)
        .args(["shell", cmd_str])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
