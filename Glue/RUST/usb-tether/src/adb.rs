use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::logger::log;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AdbResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AndroidDevice {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub device: String,
    pub transport_id: String,
}

/// Runs an ADB command with CREATE_NO_WINDOW and an explicit timeout.
pub fn run_adb(adb_path: &Path, args: &[&str], timeout_secs: u64) -> Result<AdbResult, String> {
    let mut cmd = Command::new(adb_path);
    cmd.args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn ADB: {}", e))?;
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout_bytes = Vec::new();
                let mut stderr_bytes = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = out.read_to_end(&mut stdout_bytes);
                }
                if let Some(mut err) = child.stderr.take() {
                    let _ = err.read_to_end(&mut stderr_bytes);
                }
                let stdout = String::from_utf8_lossy(&stdout_bytes).trim().to_string();
                let stderr = String::from_utf8_lossy(&stderr_bytes).trim().to_string();
                return Ok(AdbResult {
                    exit_code: status.code().unwrap_or(-1),
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    return Err(format!("Command timed out after {}s: adb {:?}", timeout_secs, args));
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(format!("Error waiting for ADB child: {}", e)),
        }
    }
}

/// Discovers adb.exe from candidate locations according to AGENTS.md / specifications.
pub fn find_adb(exe_dir: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 0. Unified RUST platform-tools (laptop / portable installation)
    candidates.push(exe_dir.join(r"..\platform-tools\adb.exe"));
    candidates.push(exe_dir.join(r"platform-tools\adb.exe"));

    // 1. Relative to exe directory: ../../Daemons/USBTethering/platform-tools/adb.exe
    candidates.push(exe_dir.join(r"..\..\Daemons\USBTethering\platform-tools\adb.exe"));
    // 2. Relative to current dir if running from workspace
    candidates.push(PathBuf::from(r"F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe"));
    // 3. Bundled in local platform-tools directory
    candidates.push(exe_dir.join(r"platform-tools\adb.exe"));
    // 4. Candidate in user's Android SDK (%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe)
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local_appdata).join(r"Android\Sdk\platform-tools\adb.exe"));
    }
    // 5. Common root install C:\platform-tools\adb.exe
    candidates.push(PathBuf::from(r"C:\platform-tools\adb.exe"));

    // 6. System PATH candidates
    if let Ok(path_var) = std::env::var("PATH") {
        for entry in path_var.split(';') {
            let trimmed = entry.trim();
            if !trimmed.is_empty() {
                candidates.push(PathBuf::from(trimmed).join("adb.exe"));
            }
        }
    }

    // Evaluate each candidate
    for cand in candidates {
        if cand.is_file() {
            // Verify execution
            if let Ok(res) = run_adb(&cand, &["version"], 5) {
                if res.exit_code == 0 {
                    if let Ok(canonical) = cand.canonicalize() {
                        // Canonicalize might prepend \\?\ on Windows
                        let clean_str = canonical.to_string_lossy().replace(r"\\?\", "");
                        return Some(PathBuf::from(clean_str));
                    }
                    return Some(cand);
                }
            }
        }
    }

    // Final fallback: plain "adb"
    if let Ok(res) = run_adb(Path::new("adb"), &["version"], 5) {
        if res.exit_code == 0 {
            return Some(PathBuf::from("adb"));
        }
    }

    None
}

/// Parses the output of `adb devices -l` to identify all connected Android devices.
pub fn get_connected_devices(adb_path: &Path) -> Vec<AndroidDevice> {
    let mut devices = Vec::new();
    let res = match run_adb(adb_path, &["devices", "-l"], 6) {
        Ok(r) => r,
        Err(_) => return devices,
    };

    if res.exit_code != 0 {
        return devices;
    }

    for line in res.stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("List of devices") || trimmed.starts_with('*') {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let serial = parts[0].to_string();
        let state = parts[1].to_string();

        let mut product = String::new();
        let mut model = String::new();
        let mut device = String::new();
        let mut transport_id = String::new();

        for part in &parts[2..] {
            if let Some(val) = part.strip_prefix("product:") {
                product = val.to_string();
            } else if let Some(val) = part.strip_prefix("model:") {
                model = val.to_string();
            } else if let Some(val) = part.strip_prefix("device:") {
                device = val.to_string();
            } else if let Some(val) = part.strip_prefix("transport_id:") {
                transport_id = val.to_string();
            }
        }

        // If model or device wasn't in device line, fetch via getprop
        if state == "device" {
            if model.is_empty() {
                if let Ok(m) = run_adb(adb_path, &["-s", &serial, "shell", "getprop", "ro.product.model"], 4) {
                    model = m.stdout;
                }
            }
            if device.is_empty() {
                if let Ok(d) = run_adb(adb_path, &["-s", &serial, "shell", "getprop", "ro.product.device"], 4) {
                    device = d.stdout;
                }
            }
        }

        devices.push(AndroidDevice {
            serial,
            state,
            model: if model.is_empty() { product } else { model },
            device,
            transport_id,
        });
    }

    devices
}

/// Checks whether USB tethering is currently active on the device.
pub fn is_usb_tethering_active(adb_path: &Path) -> bool {
    // 1. Check dumpsys tethering
    if let Ok(res) = run_adb(adb_path, &["shell", "dumpsys", "tethering"], 8) {
        if res.exit_code == 0 {
            let out_l = res.stdout.to_lowercase();
            if out_l.contains("tetheredstate") || out_l.contains("state=tethered") {
                return true;
            }
            // Check for tethered: [ ... ]
            if let Some(pos) = out_l.find("tethered:") {
                let rest = &out_l[pos..];
                if let Some(end) = rest.find(']') {
                    let block = &rest[..end];
                    if block.contains("ncm") || block.contains("rndis") || block.contains("usb") {
                        return true;
                    }
                }
            }
            // Check Tether state section: ncm0 - TetheredState
            if out_l.contains("ncm0 - tethered") || out_l.contains("rndis0 - tethered") || out_l.contains("usb0 - tethered") {
                return true;
            }
        }
    }

    // 2. Check ip -br link for active tethered interfaces
    if let Ok(res_ip) = run_adb(adb_path, &["shell", "ip", "-br", "link"], 5) {
        if res_ip.exit_code == 0 {
            for line in res_ip.stdout.lines() {
                let line_l = line.to_lowercase();
                if line_l.contains("rndis0") || line_l.contains("ncm0") || line_l.contains("usb0") {
                    if line_l.contains("up") {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Attempts kernel gadget switch (NCM/RNDIS).
fn toggle_gadget(adb_path: &Path) -> bool {
    log("Attempting kernel gadget function switch (NCM/RNDIS)...");
    let modes = ["ncm,adb", "rndis,adb", "ncm", "rndis"];
    for mode in &modes {
        let _ = run_adb(adb_path, &["shell", "svc", "usb", "setFunctions", mode], 8);
        thread::sleep(Duration::from_millis(1500));
        if is_usb_tethering_active(adb_path) {
            log(&format!("USB tethering enabled via gadget mode: {}", mode));
            return true;
        }
    }
    false
}

/// Extracts XML bounding box `[x1,y1][x2,y2]` and returns center `(tap_x, tap_y)`.
fn parse_bounds_center(bounds_str: &str) -> Option<(i32, i32)> {
    // Format: "[x1,y1][x2,y2]"
    let parts: Vec<&str> = bounds_str.split(&['[', ']', ','][..]).filter(|s| !s.is_empty()).collect();
    if parts.len() == 4 {
        let x1: i32 = parts[0].parse().ok()?;
        let y1: i32 = parts[1].parse().ok()?;
        let x2: i32 = parts[2].parse().ok()?;
        let y2: i32 = parts[3].parse().ok()?;
        return Some(((x1 + x2) / 2, (y1 + y2) / 2));
    }
    None
}

/// UI Automation fallback: dumps hierarchy, finds toggle, taps coordinates.
fn toggle_ui(adb_path: &Path) -> bool {
    log("Attempting TetherSettings UI automation...");
    // Wake screen and unlock if keyguard is on
    let _ = run_adb(adb_path, &["shell", "input", "keyevent", "224"], 5); // KEYCODE_WAKEUP
    let _ = run_adb(adb_path, &["shell", "input", "keyevent", "82"], 5);  // KEYCODE_MENU

    // Launch Hotspot & tethering settings page
    let _ = run_adb(adb_path, &["shell", "am", "start", "-n", "com.android.settings/.TetherSettings"], 8);
    thread::sleep(Duration::from_millis(1200));

    // Dump UI hierarchy
    let _ = run_adb(adb_path, &["shell", "uiautomator", "dump", "/data/local/tmp/uidump.xml"], 10);
    let dump = run_adb(adb_path, &["shell", "cat", "/data/local/tmp/uidump.xml"], 10);
    let _ = run_adb(adb_path, &["shell", "rm", "-f", "/data/local/tmp/uidump.xml"], 5);

    if let Ok(res) = dump {
        if res.exit_code == 0 && res.stdout.contains("<node") {
            let xml = res.stdout;
            let mut target_tap: Option<(i32, i32)> = None;

            for line in xml.split("/>") {
                let line_l = line.to_lowercase();
                if line_l.contains("usb tethering") || line_l.contains("usb-tethering") {
                    if line_l.contains(r#"checked="true""#) {
                        log("USB tethering toggle is already ON in UI.");
                        let _ = run_adb(adb_path, &["shell", "input", "keyevent", "3"], 5);
                        return true;
                    }
                    if let Some(pos) = line.find(r#"bounds=""#) {
                        let rest = &line[pos + 8..];
                        if let Some(end) = rest.find('"') {
                            if let Some(center) = parse_bounds_center(&rest[..end]) {
                                target_tap = Some(center);
                                break;
                            }
                        }
                    }
                }
            }

            // Fallback: look for unchecked switch widget
            if target_tap.is_none() {
                for line in xml.split("/>") {
                    if (line.contains("Switch") || line.contains("CompoundButton")) && line.contains(r#"checked="false""#) {
                        if let Some(pos) = line.find(r#"bounds=""#) {
                            let rest = &line[pos + 8..];
                            if let Some(end) = rest.find('"') {
                                if let Some(center) = parse_bounds_center(&rest[..end]) {
                                    target_tap = Some(center);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if let Some((x, y)) = target_tap {
                log(&format!("Tapping USB tethering toggle switch at ({}, {})...", x, y));
                let _ = run_adb(adb_path, &["shell", "input", "tap", &x.to_string(), &y.to_string()], 5);
                thread::sleep(Duration::from_millis(1000));
                let _ = run_adb(adb_path, &["shell", "input", "keyevent", "3"], 5); // Return to home

                if is_usb_tethering_active(adb_path) {
                    log("USB tethering enabled successfully via UI toggle.");
                    return true;
                }
            }
        }
    }

    let _ = run_adb(adb_path, &["shell", "input", "keyevent", "3"], 5); // Home
    false
}

/// Connectivity service commands (Android 11+).
fn toggle_cmd(adb_path: &Path) -> bool {
    log("Attempting cmd connectivity/tethering start-tethering...");
    let _ = run_adb(adb_path, &["shell", "cmd", "connectivity", "start-tethering", "1"], 6);
    thread::sleep(Duration::from_millis(1000));
    if is_usb_tethering_active(adb_path) {
        log("USB tethering enabled via cmd connectivity.");
        return true;
    }

    let _ = run_adb(adb_path, &["shell", "cmd", "tethering", "start-tethering", "1"], 6);
    thread::sleep(Duration::from_millis(1000));
    if is_usb_tethering_active(adb_path) {
        log("USB tethering enabled via cmd tethering.");
        return true;
    }

    false
}

/// Multi-tier tethering activation sequence.
pub fn activate_usb_tethering(adb_path: &Path) -> bool {
    if is_usb_tethering_active(adb_path) {
        log("USB tethering is already active.");
        return true;
    }

    log("Activating USB tethering on connected device...");

    // Tier 1: Gadget mode switch (Fastest, native kernel level)
    if toggle_gadget(adb_path) {
        return true;
    }

    // Tier 2: UI Automation fallback
    if toggle_ui(adb_path) {
        return true;
    }

    // Tier 3: Android Connectivity / Tethering service command
    if toggle_cmd(adb_path) {
        return true;
    }

    // Final verification check
    if is_usb_tethering_active(adb_path) {
        log("USB tethering verified active.");
        return true;
    }

    log("Notice: USB tethering could not be toggled automatically.");
    log("Tip: On your phone, go to Developer Options -> 'Default USB configuration' -> select 'USB tethering'.");
    false
}
