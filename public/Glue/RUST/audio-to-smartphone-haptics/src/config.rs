use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HapticsConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
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
fn default_base_amp() -> i32 { 70 }
fn default_punch_dur() -> i32 { 90 }
fn default_noise_floor() -> f32 { 0.010 }
fn default_min_vel() -> f32 { 0.018 }
fn default_sub_low() -> i32 { 30 }
fn default_sub_high() -> i32 { 90 }
fn default_punch_high() -> i32 { 220 }
fn default_snap_high() -> i32 { 1200 }
fn default_mode() -> String { "gestolumina_pwm".to_string() }

impl Default for HapticsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            amplitude_scale: 2.0,
            base_amplitude: 70,
            punch_duration_ms: 90,
            noise_floor: 0.010,
            min_velocity: 0.018,
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

pub fn get_config_path() -> PathBuf {
    let local = PathBuf::from("config.json");
    if local.exists() {
        return local;
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p1 = dir.join("config.json");
            if p1.exists() {
                return p1;
            }
            let p2 = dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("config.json");
            if p2.exists() {
                return p2;
            }
            let p3 = dir.join("..").join("AudioToSmartphoneHaptics").join("config.json");
            if p3.exists() {
                return p3;
            }
        }
    }

    PathBuf::from(r"F:\Github\Website\public\Glue\Daemons\AudioToSmartphoneHaptics\config.json")
}

pub fn load_config(path: &Path) -> HapticsConfig {
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            let clean = content.strip_prefix('\u{feff}').unwrap_or(&content);
            if let Ok(cfg) = serde_json::from_str::<HapticsConfig>(clean) {
                return cfg;
            }
        }
    }
    HapticsConfig::default()
}
