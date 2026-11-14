use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Debug, Default)]
pub struct PhoneTelemetry {
    pub connected: bool,
    pub model: String,
    pub battery_pct: u32,
    pub is_charging: bool,
    pub battery_status: String,
    pub current_ma: f64,
    pub tether_active: bool,
    pub wifi_ssid: String,
    pub wifi_freq_mhz: u32,
    pub is_5ghz: bool,
}

pub fn find_adb() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Check adjacent platform-tools
            let candidates = [
                dir.join("platform-tools").join("adb.exe"),
                dir.join("..").join("platform-tools").join("adb.exe"),
                dir.join("..").join("..").join("Daemons").join("USBTethering").join("platform-tools").join("adb.exe"),
            ];
            for c in candidates {
                if c.exists() {
                    return Some(c);
                }
            }
        }
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local).join("Android").join("Sdk").join("platform-tools").join("adb.exe");
        if p.exists() {
            return Some(p);
        }
    }

    // Try PATH
    if let Ok(output) = Command::new("where.exe")
        .arg("adb")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            if let Some(first) = s.lines().next() {
                let p = PathBuf::from(first.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

pub fn run_adb_cmd(adb: &PathBuf, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(adb);
    cmd.args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let child = cmd.spawn().ok()?;
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        let output = child.wait_with_output();
        let _ = tx.send(output);
    });

    match rx.recv_timeout(Duration::from_millis(2500)) {
        Ok(Ok(output)) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).to_string())
        }
        _ => None,
    }
}

pub fn query_telemetry(adb: &PathBuf) -> PhoneTelemetry {
    let mut telem = PhoneTelemetry::default();

    // Check devices
    let dev_out = match run_adb_cmd(adb, &["devices"]) {
        Some(s) => s,
        None => return telem,
    };

    let has_device = dev_out
        .lines()
        .skip(1)
        .any(|line| line.contains("\tdevice") || line.contains(" device"));

    if !has_device {
        return telem;
    }

    telem.connected = true;

    // Model
    if let Some(m) = run_adb_cmd(adb, &["shell", "getprop", "ro.product.model"]) {
        telem.model = m.trim().to_string();
    }
    if telem.model.is_empty() {
        telem.model = "Pixel 6a".to_string();
    }

    // Battery
    if let Some(b) = run_adb_cmd(adb, &["shell", "dumpsys", "battery"]) {
        for line in b.lines() {
            let line = line.trim();
            if line.starts_with("level:") {
                if let Ok(pct) = line.trim_start_matches("level:").trim().parse::<u32>() {
                    telem.battery_pct = pct;
                }
            } else if line.starts_with("status:") {
                let st = line.trim_start_matches("status:").trim();
                telem.battery_status = match st {
                    "2" => "Charging".to_string(),
                    "3" => "Discharging".to_string(),
                    "4" => "Not Charging".to_string(),
                    "5" => "Full".to_string(),
                    _ => "Connected".to_string(),
                };
            } else if line.starts_with("AC powered: true") || line.starts_with("USB powered: true") {
                telem.is_charging = true;
            }
        }
    }

    // Query Battery Current (microamperes -> milliamperes)
    if let Some(cur_out) = run_adb_cmd(adb, &["shell", "cat", "/sys/class/power_supply/battery/current_now"]) {
        if let Ok(raw_ua) = cur_out.trim().parse::<i64>() {
            let mut ma = (raw_ua as f64) / 1000.0;
            if telem.battery_status == "Discharging" && ma > 0.0 {
                ma = -ma;
            } else if telem.battery_status == "Charging" && ma < 0.0 {
                ma = -ma;
            }
            telem.current_ma = ma;
        }
    }

    // Wi-Fi Status
    if let Some(w) = run_adb_cmd(adb, &["shell", "cmd", "wifi", "status"]) {
        parse_wifi_status(&w, &mut telem);
    }

    // Tethering status
    if let Some(t) = run_adb_cmd(adb, &["shell", "dumpsys", "tethering"]) {
        telem.tether_active = t.contains("ncm0") || t.contains("rndis0") || t.contains("active: [");
    }

    telem
}

fn parse_wifi_status(out: &str, telem: &mut PhoneTelemetry) {
    // 1. SSID
    if let Some(pos) = out.find("SSID: \"") {
        let rest = &out[pos + "SSID: \"".len()..];
        if let Some(end) = rest.find('"') {
            telem.wifi_ssid = rest[..end].to_string();
        }
    } else if let Some(pos) = out.find("Wifi is connected to \"") {
        let rest = &out[pos + "Wifi is connected to \"".len()..];
        if let Some(end) = rest.find('"') {
            telem.wifi_ssid = rest[..end].to_string();
        }
    }

    // 2. Frequency
    if let Some(pos) = out.find("Frequency:") {
        let rest = &out[pos + "Frequency:".len()..];
        let num_str: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(f) = num_str.parse::<u32>() {
            telem.wifi_freq_mhz = f;
            telem.is_5ghz = f >= 5000;
        }
    } else if let Some(pos) = out.find("freq:") {
        let rest = &out[pos + "freq:".len()..];
        let num_str: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(f) = num_str.parse::<u32>() {
            telem.wifi_freq_mhz = f;
            telem.is_5ghz = f >= 5000;
        }
    }
}

pub fn force_5ghz_nudge(adb: &PathBuf) {
    let _ = Command::new(adb)
        .args(["shell", "svc wifi disable; sleep 1; svc wifi enable"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

pub fn retrigger_tether(adb: &PathBuf) {
    let _ = Command::new(adb)
        .args(["shell", "svc usb setFunctions ncm,adb || svc usb setFunctions rndis,adb"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
