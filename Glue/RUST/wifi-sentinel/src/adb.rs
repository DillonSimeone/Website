use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Default)]
pub struct WifiInfo {
    pub connected: bool,
    pub ssid: String,
    pub bssid: String,
    pub frequency_mhz: i32,
    pub rx_link_speed_mbps: i32,
    pub tx_link_speed_mbps: i32,
    pub link_speed_mbps: i32,
    pub score: i32,
}

pub struct AdbClient {
    pub adb_path: PathBuf,
}

impl AdbClient {
    pub fn locate(exe_dir: &Path) -> Option<Self> {
        let mut candidates = Vec::new();

        // 1. Unified RUST platform-tools (laptop / portable installation)
        candidates.push(exe_dir.join(r"..\platform-tools\adb.exe"));
        candidates.push(exe_dir.join(r"platform-tools\adb.exe"));

        // 2. Relative to exe directory: ..\..\Daemons\USBTethering\platform-tools\adb.exe
        candidates.push(exe_dir.join(r"..\..\Daemons\USBTethering\platform-tools\adb.exe"));
        // 2. In case binary is running inside target\release
        candidates.push(exe_dir.join(r"..\..\..\Daemons\USBTethering\platform-tools\adb.exe"));
        // 3. Known project absolute path
        candidates.push(PathBuf::from(
            r"F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe",
        ));

        // 4. User local app data: %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local_appdata).join(r"Android\Sdk\platform-tools\adb.exe"));
        }

        // 5. Root installation: C:\platform-tools\adb.exe
        candidates.push(PathBuf::from(r"C:\platform-tools\adb.exe"));

        for candidate in &candidates {
            if candidate.is_file() {
                if let Ok(canon) = candidate.canonicalize() {
                    return Some(Self { adb_path: canon });
                }
                return Some(Self {
                    adb_path: candidate.clone(),
                });
            }
        }

        // 6. Search system PATH
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join("adb.exe");
                if candidate.is_file() {
                    if let Ok(canon) = candidate.canonicalize() {
                        return Some(Self { adb_path: canon });
                    }
                    return Some(Self { adb_path: candidate });
                }
            }
        }

        None
    }

    pub fn start_server(&self) -> bool {
        Command::new(&self.adb_path)
            .arg("start-server")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    pub fn is_device_connected(&self) -> bool {
        let output = match Command::new(&self.adb_path)
            .arg("devices")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            Ok(o) => o,
            Err(_) => return false,
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("List of devices")
                || trimmed.starts_with("* daemon")
            {
                continue;
            }
            if trimmed.ends_with("\tdevice") || trimmed.ends_with(" device") {
                return true;
            }
        }
        false
    }

    pub fn query_wifi_status(&self) -> Option<WifiInfo> {
        // First try the ultra-fast "cmd wifi status"
        if let Ok(output) = Command::new(&self.adb_path)
            .args(["shell", "cmd wifi status"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(info) = parse_wifi_output(&text) {
                return Some(info);
            }
        }

        // Fallback to "dumpsys wifi"
        if let Ok(output) = Command::new(&self.adb_path)
            .args(["shell", "dumpsys wifi"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(info) = parse_wifi_output(&text) {
                return Some(info);
            }
        }

        None
    }

    pub fn cycle_wifi(&self) -> bool {
        // Executes: svc wifi disable; sleep 1; svc wifi enable
        Command::new(&self.adb_path)
            .args(["shell", "svc wifi disable; sleep 1; svc wifi enable"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

pub fn parse_wifi_output(raw: &str) -> Option<WifiInfo> {
    if raw.trim().is_empty() {
        return None;
    }

    // Identify target line or block
    let mut target_line = "";
    for line in raw.lines() {
        if (line.contains("WifiInfo:") || line.contains("mWifiInfo"))
            && (line.contains("COMPLETED") || line.contains("Frequency:"))
        {
            target_line = line;
            if line.contains("COMPLETED") {
                break;
            }
        }
    }

    let target = if target_line.is_empty() { raw } else { target_line };

    let mut info = WifiInfo::default();

    // 1. Frequency
    if let Some(pos) = target.find("Frequency:") {
        let rest = &target[pos + "Frequency:".len()..];
        let num_str: String = rest
            .trim_start()
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '-')
            .collect();
        if let Ok(f) = num_str.parse::<i32>() {
            info.frequency_mhz = f;
        }
    }

    if info.frequency_mhz <= 0 {
        return None;
    }
    info.connected = true;

    // 2. SSID
    if let Some(pos) = target.find("SSID:") {
        let rest = target[pos + "SSID:".len()..].trim_start();
        if rest.starts_with('"') {
            if let Some(end_idx) = rest[1..].find('"') {
                info.ssid = rest[1..=end_idx].to_string();
            }
        } else {
            let s: String = rest
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != ',')
                .collect();
            if s != "<unknown ssid>" && s != "<none>" && !s.is_empty() {
                info.ssid = s;
            }
        }
    }

    if info.ssid.is_empty() {
        if let Some(pos) = raw.find("Wifi is connected to \"") {
            let rest = &raw[pos + "Wifi is connected to \"".len()..];
            if let Some(end_idx) = rest.find('"') {
                info.ssid = rest[..end_idx].to_string();
            }
        }
    }

    if info.ssid.is_empty() {
        info.ssid = "Unknown".to_string();
    }

    // 3. BSSID
    if let Some(pos) = target.find("BSSID:") {
        let rest = target[pos + "BSSID:".len()..].trim_start();
        let bssid: String = rest
            .chars()
            .take_while(|c| !c.is_whitespace() && *c != ',')
            .collect();
        if bssid != "<none>" && !bssid.is_empty() {
            info.bssid = bssid;
        }
    }

    // 4. Rx Link speed
    if let Some(pos) = target.find("Rx Link speed:") {
        let rest = target[pos + "Rx Link speed:".len()..].trim_start();
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '-').collect();
        if let Ok(rx) = num_str.parse::<i32>() {
            info.rx_link_speed_mbps = rx;
        }
    }

    // 5. Tx Link speed
    if let Some(pos) = target.find("Tx Link speed:") {
        let rest = target[pos + "Tx Link speed:".len()..].trim_start();
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '-').collect();
        if let Ok(tx) = num_str.parse::<i32>() {
            info.tx_link_speed_mbps = tx;
        }
    }

    // 6. Link speed
    if let Some(pos) = target.find("Link speed:") {
        let rest = target[pos + "Link speed:".len()..].trim_start();
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '-').collect();
        if let Ok(ls) = num_str.parse::<i32>() {
            info.link_speed_mbps = ls;
        }
    }

    // 7. score
    if let Some(pos) = target.find("score:") {
        let rest = target[pos + "score:".len()..].trim_start();
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(s) = num_str.parse::<i32>() {
            info.score = s;
        }
    }

    Some(info)
}
