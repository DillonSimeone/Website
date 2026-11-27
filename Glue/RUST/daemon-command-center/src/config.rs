use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct DaemonToggles {
    pub wifi_sentinel: bool,
    pub usb_tether: bool,
    pub energy_daemon: bool,
    pub audio_haptics: bool,
}

impl Default for DaemonToggles {
    fn default() -> Self {
        Self {
            wifi_sentinel: true,
            usb_tether: true,
            energy_daemon: true,
            audio_haptics: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub toggles: DaemonToggles,
    pub auto_restart_crashed: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            toggles: DaemonToggles::default(),
            auto_restart_crashed: true,
        }
    }
}

pub fn get_config_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join("config.json");
        }
    }
    PathBuf::from("config.json")
}

pub fn load_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<AppConfig>(&data) {
                return cfg;
            }
        }
    }
    let default_cfg = AppConfig::default();
    save_config(&default_cfg);
    default_cfg
}

pub fn save_config(cfg: &AppConfig) {
    let path = get_config_path();
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, json);
    }
}
