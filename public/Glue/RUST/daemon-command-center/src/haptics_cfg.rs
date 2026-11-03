use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HapticsConfig {
    pub enabled: bool,
    pub amplitude_scale: f32,
    pub base_amplitude: i32,
    pub punch_duration_ms: i32,
    pub noise_floor: f32,
    pub min_velocity: f32,
    pub enable_snap_primitives: bool,
    pub sub_bass_low_hz: i32,
    pub sub_bass_high_hz: i32,
    pub mid_punch_high_hz: i32,
    pub snap_high_hz: i32,
    pub mode: String,
    pub govee_sync: bool,
}

impl Default for HapticsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            amplitude_scale: 2.0,
            base_amplitude: 70,
            punch_duration_ms: 90,
            noise_floor: 0.01,
            min_velocity: 0.02,
            enable_snap_primitives: true,
            sub_bass_low_hz: 30,
            sub_bass_high_hz: 90,
            mid_punch_high_hz: 220,
            snap_high_hz: 1200,
            mode: "gestolumina_pwm".to_string(),
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
            if let Ok(cfg) = serde_json::from_str::<HapticsConfig>(&content) {
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
    let _ = Command::new(adb)
        .args([
            "shell",
            "cmd vibrator_manager synced -f -B waveform -a -c 8 70 90 220 18 100 8 0",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
