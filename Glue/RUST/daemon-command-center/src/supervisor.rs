use crate::config::{load_config, save_config, AppConfig};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Debug)]
pub struct DaemonInfo {
    pub id: &'static str,
    pub title: &'static str,
    pub enabled: bool,
    pub running: bool,
    #[allow(dead_code)]
    pub pid: Option<u32>,
}

pub struct Supervisor {
    pub config: AppConfig,
    base_dir: PathBuf,
}

impl Supervisor {
    pub fn new() -> Self {
        let config = load_config();
        let base_dir = if let Ok(exe) = std::env::current_exe() {
            exe.parent().unwrap_or(Path::new(".")).to_path_buf()
        } else {
            PathBuf::from(".")
        };

        Self { config, base_dir }
    }

    pub fn get_daemon_path(&self, folder: &str, exe_name: &str) -> Option<PathBuf> {
        let candidates = [
            self.base_dir.join(folder).join(exe_name),
            self.base_dir.join("..").join(folder).join(exe_name),
            PathBuf::from(format!("F:\\Github\\Website\\public\\Glue\\RUST\\{}\\{}", folder, exe_name)),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
        None
    }

    pub fn check_pid_running(&self, pid_file: &Path) -> Option<u32> {
        if pid_file.exists() {
            if let Ok(content) = fs::read_to_string(pid_file) {
                if let Ok(pid) = content.trim().parse::<u32>() {
                    if is_pid_alive(pid) {
                        return Some(pid);
                    }
                }
            }
        }
        None
    }

    pub fn get_status_list(&self) -> Vec<DaemonInfo> {
        let mut list = Vec::new();

        // 1. Wi-Fi Sentinel
        let wifi_dir = self.base_dir.join("..").join("wifi-sentinel");
        let wifi_pid = self.check_pid_running(&wifi_dir.join("sentinel.pid"));
        list.push(DaemonInfo {
            id: "wifi_sentinel",
            title: "Wi-Fi 5GHz Sentinel",
            enabled: self.config.toggles.wifi_sentinel,
            running: wifi_pid.is_some(),
            pid: wifi_pid,
        });

        // 2. USB Tethering
        let tether_dir = self.base_dir.join("..").join("usb-tether");
        let tether_pid = self.check_pid_running(&tether_dir.join("auto_tether.pid"));
        list.push(DaemonInfo {
            id: "usb_tether",
            title: "USB Tethering Daemon",
            enabled: self.config.toggles.usb_tether,
            running: tether_pid.is_some(),
            pid: tether_pid,
        });

        // 3. Energy Daemon
        let energy_dir = self.base_dir.join("..").join("energy-daemon");
        let energy_pid = self.check_pid_running(&energy_dir.join("energy.pid"));
        list.push(DaemonInfo {
            id: "energy_daemon",
            title: "Phone Energy Daemon",
            enabled: self.config.toggles.energy_daemon,
            running: energy_pid.is_some(),
            pid: energy_pid,
        });

        // 4. AudioToSmartphoneHaptics
        let haptics_dir_rust = self.base_dir.join("..").join("audio-to-smartphone-haptics");
        let haptics_dir_legacy = self.base_dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics");
        let haptics_pid = self.check_pid_running(&haptics_dir_rust.join("haptics.pid"))
            .or_else(|| self.check_pid_running(&haptics_dir_legacy.join("haptics.pid")));
        list.push(DaemonInfo {
            id: "audio_haptics",
            title: "AudioToSmartphoneHaptics",
            enabled: self.config.toggles.audio_haptics,
            running: haptics_pid.is_some(),
            pid: haptics_pid,
        });

        list
    }

    pub fn toggle_daemon(&mut self, id: &str) {
        match id {
            "wifi_sentinel" => {
                self.config.toggles.wifi_sentinel = !self.config.toggles.wifi_sentinel;
                if self.config.toggles.wifi_sentinel {
                    self.start_wifi_sentinel();
                } else {
                    self.stop_wifi_sentinel();
                }
            }
            "usb_tether" => {
                self.config.toggles.usb_tether = !self.config.toggles.usb_tether;
                if self.config.toggles.usb_tether {
                    self.start_usb_tether();
                } else {
                    self.stop_usb_tether();
                }
            }
            "energy_daemon" => {
                self.config.toggles.energy_daemon = !self.config.toggles.energy_daemon;
                if self.config.toggles.energy_daemon {
                    self.start_energy_daemon();
                } else {
                    self.stop_energy_daemon();
                }
            }
            "audio_haptics" => {
                self.config.toggles.audio_haptics = !self.config.toggles.audio_haptics;
                if self.config.toggles.audio_haptics {
                    self.start_audio_haptics();
                } else {
                    self.stop_audio_haptics();
                }
            }
            _ => {}
        }
        save_config(&self.config);
    }

    pub fn watchdog_tick(&mut self) {
        if !self.config.auto_restart_crashed {
            return;
        }

        // Wi-Fi Sentinel
        if self.config.toggles.wifi_sentinel {
            let p = self.base_dir.join("..").join("wifi-sentinel").join("sentinel.pid");
            if self.check_pid_running(&p).is_none() {
                self.start_wifi_sentinel();
            }
        }

        // USB Tether
        if self.config.toggles.usb_tether {
            let p = self.base_dir.join("..").join("usb-tether").join("auto_tether.pid");
            if self.check_pid_running(&p).is_none() {
                self.start_usb_tether();
            }
        }

        // Energy Daemon
        if self.config.toggles.energy_daemon {
            let p = self.base_dir.join("..").join("energy-daemon").join("energy.pid");
            if self.check_pid_running(&p).is_none() {
                self.start_energy_daemon();
            }
        }

        // AudioToSmartphoneHaptics Engine
        if self.config.toggles.audio_haptics {
            let p_rust = self.base_dir.join("..").join("audio-to-smartphone-haptics").join("haptics.pid");
            let p_legacy = self.base_dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("haptics.pid");
            if self.check_pid_running(&p_rust).is_none() && self.check_pid_running(&p_legacy).is_none() {
                self.start_audio_haptics();
            }
        }
    }

    pub fn start_wifi_sentinel(&self) {
        if let Some(exe) = self.get_daemon_path("wifi-sentinel", "wifi-sentinel.exe") {
            let _ = Command::new(&exe)
                .current_dir(exe.parent().unwrap_or(Path::new(".")))
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn stop_wifi_sentinel(&self) {
        if let Some(exe) = self.get_daemon_path("wifi-sentinel", "wifi-sentinel.exe") {
            let _ = Command::new(&exe)
                .arg("--stop")
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn start_usb_tether(&self) {
        if let Some(exe) = self.get_daemon_path("usb-tether", "usb-tether.exe") {
            let _ = Command::new(&exe)
                .current_dir(exe.parent().unwrap_or(Path::new(".")))
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn stop_usb_tether(&self) {
        if let Some(exe) = self.get_daemon_path("usb-tether", "usb-tether.exe") {
            let _ = Command::new(&exe)
                .arg("--stop")
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn start_energy_daemon(&self) {
        if let Some(exe) = self.get_daemon_path("energy-daemon", "energy-daemon.exe") {
            let _ = Command::new(&exe)
                .current_dir(exe.parent().unwrap_or(Path::new(".")))
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn stop_energy_daemon(&self) {
        if let Some(exe) = self.get_daemon_path("energy-daemon", "energy-daemon.exe") {
            let _ = Command::new(&exe)
                .arg("--stop")
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }
    }

    pub fn start_audio_haptics(&self) {
        let mut cfg = crate::haptics_cfg::load_haptics_config();
        cfg.enabled = true;
        crate::haptics_cfg::save_haptics_config(&cfg);

        let p_rust = self.base_dir.join("..").join("audio-to-smartphone-haptics").join("haptics.pid");
        let p_legacy = self.base_dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("haptics.pid");
        if self.check_pid_running(&p_rust).is_none() && self.check_pid_running(&p_legacy).is_none() {
            if let Some(exe) = self.get_daemon_path("audio-to-smartphone-haptics", "audio-to-smartphone-haptics.exe") {
                let _ = Command::new(&exe)
                    .current_dir(exe.parent().unwrap_or(Path::new(".")))
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
            } else {
                let vbs = self.base_dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("Start-AudioHaptics.vbs");
                if vbs.exists() {
                    let _ = Command::new("wscript.exe")
                        .arg(vbs)
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn();
                }
            }
        }
    }

    pub fn stop_audio_haptics(&self) {
        let mut cfg = crate::haptics_cfg::load_haptics_config();
        cfg.enabled = false;
        crate::haptics_cfg::save_haptics_config(&cfg);

        if let Some(exe) = self.get_daemon_path("audio-to-smartphone-haptics", "audio-to-smartphone-haptics.exe") {
            let _ = Command::new(&exe)
                .arg("--stop")
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();
        }

        let p_rust = self.base_dir.join("..").join("audio-to-smartphone-haptics").join("haptics.pid");
        let p_legacy = self.base_dir.join("..").join("..").join("Daemons").join("AudioToSmartphoneHaptics").join("haptics.pid");
        for p in &[p_rust, p_legacy] {
            if let Ok(c) = fs::read_to_string(p) {
                if let Ok(pid) = c.trim().parse::<u32>() {
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .output();
                }
            }
        }
    }

    pub fn restart_all_active(&self) {
        self.stop_wifi_sentinel();
        self.stop_usb_tether();
        self.stop_energy_daemon();
        self.stop_audio_haptics();
        std::thread::sleep(std::time::Duration::from_millis(600));
        if self.config.toggles.wifi_sentinel {
            self.start_wifi_sentinel();
        }
        if self.config.toggles.usb_tether {
            self.start_usb_tether();
        }
        if self.config.toggles.energy_daemon {
            self.start_energy_daemon();
        }
        if self.config.toggles.audio_haptics {
            self.start_audio_haptics();
        }
    }
}

pub fn is_pid_alive(pid: u32) -> bool {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code = 0;
        let res = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        res != 0 && exit_code == STILL_ACTIVE as u32
    }
}
