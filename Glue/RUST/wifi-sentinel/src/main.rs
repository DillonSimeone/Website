#![windows_subsystem = "windows"]

mod adb;
mod logger;
mod notify;

use std::path::PathBuf;
use std::time::{Duration, Instant};

use adb::AdbClient;
use logger::SentinelLogger;
use notify::{play_sound_alert, play_sound_success, play_sound_warning, send_toast};

const STILL_ACTIVE: u32 = 259;
const PROCESS_TERMINATE: u32 = 0x0001;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const ATTACH_PARENT_PROCESS: u32 = 0xFFFFFFFF;
const STD_OUTPUT_HANDLE: u32 = 0xFFFFFFF5; // -11

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> *mut std::ffi::c_void;
    fn GetExitCodeProcess(h_process: *mut std::ffi::c_void, lp_exit_code: *mut u32) -> i32;
    fn TerminateProcess(h_process: *mut std::ffi::c_void, u_exit_code: u32) -> i32;
    fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
    fn AttachConsole(dw_process_id: u32) -> i32;
    fn GetStdHandle(n_std_handle: u32) -> *mut std::ffi::c_void;
    fn WriteFile(
        h_file: *mut std::ffi::c_void,
        lp_buffer: *const u8,
        n_number_of_bytes_to_write: u32,
        lp_number_of_bytes_written: *mut u32,
        lp_overlapped: *mut std::ffi::c_void,
    ) -> i32;
}

fn print_console(msg: &str) {
    let s = if !msg.ends_with("\r\n") {
        format!("{}\r\n", msg.trim_end_matches('\n'))
    } else {
        msg.to_string()
    };
    unsafe {
        let handle = GetStdHandle(STD_OUTPUT_HANDLE);
        if !handle.is_null() && handle != -1isize as *mut _ {
            let mut written: u32 = 0;
            WriteFile(
                handle,
                s.as_ptr(),
                s.len() as u32,
                &mut written,
                std::ptr::null_mut(),
            );
        }
    }
}

fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        ok != 0 && exit_code == STILL_ACTIVE
    }
}

fn terminate_pid(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let mut terminated = false;
        if GetExitCodeProcess(handle, &mut exit_code) != 0 && exit_code == STILL_ACTIVE {
            terminated = TerminateProcess(handle, 0) != 0;
        }
        CloseHandle(handle);
        terminated
    }
}

fn get_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

struct PidLock {
    path: PathBuf,
}

impl PidLock {
    fn acquire(path: PathBuf) -> Option<Self> {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(old_pid) = content.trim().parse::<u32>() {
                    if old_pid != std::process::id() && is_process_alive(old_pid) {
                        return None; // Another instance is actively running
                    }
                }
            }
        }

        let my_pid = std::process::id();
        if std::fs::write(&path, my_pid.to_string()).is_ok() {
            Some(Self { path })
        } else {
            None
        }
    }
}

impl Drop for PidLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let exe_dir = get_exe_dir();
    let pid_file = exe_dir.join("sentinel.pid");
    let log_file = exe_dir.join("sentinel.log");

    // Command line argument handling
    if args.len() > 1 {
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
        let cmd = args[1].as_str();
        match cmd {
            "--help" | "-h" | "/?" => {
                print_console("Phone Wi-Fi 5GHz Sentinel Daemon (Native Rust)");
                print_console("Usage: wifi-sentinel.exe [OPTION]");
                print_console("");
                print_console("Options:");
                print_console("  --status     Query phone Wi-Fi telemetry and exit");
                print_console("  --stop       Stop any running background sentinel daemon");
                print_console("  --help, -h   Show this help message");
                print_console("");
                print_console("Running without arguments starts the background sentinel daemon.");
                return;
            }
            "--status" => {
                let adb = match AdbClient::locate(&exe_dir) {
                    Some(c) => c,
                    None => {
                        print_console("ERROR: adb.exe could not be located in candidate paths or PATH.");
                        return;
                    }
                };
                print_console(&format!("Using ADB: {}", adb.adb_path.display()));
                if !adb.is_device_connected() {
                    print_console("Status: No authorized Android device connected via ADB.");
                    return;
                }
                match adb.query_wifi_status() {
                    Some(info) => {
                        print_console("Wi-Fi Status:");
                        print_console(&format!("  Connected: {}", if info.connected { "Yes" } else { "No" }));
                        print_console(&format!("  SSID:      {}", info.ssid));
                        print_console(&format!("  BSSID:     {}", if info.bssid.is_empty() { "N/A" } else { &info.bssid }));
                        print_console(&format!(
                            "  Frequency: {} MHz ({})",
                            info.frequency_mhz,
                            if info.frequency_mhz >= 5000 { "5 GHz" } else { "2.4 GHz" }
                        ));
                        print_console(&format!("  Rx Speed:  {} Mbps", info.rx_link_speed_mbps));
                        print_console(&format!("  Tx Speed:  {} Mbps", info.tx_link_speed_mbps));
                        print_console(&format!("  Link Speed:{} Mbps", info.link_speed_mbps));
                        print_console(&format!("  Score:     {}", info.score));
                    }
                    None => {
                        print_console("Status: Connected device is not associated with any Wi-Fi network.");
                    }
                }
                return;
            }
            "--stop" => {
                if !pid_file.exists() {
                    print_console("No sentinel.pid file found. Daemon might not be running.");
                    return;
                }
                if let Ok(content) = std::fs::read_to_string(&pid_file) {
                    if let Ok(pid) = content.trim().parse::<u32>() {
                        if terminate_pid(pid) {
                            print_console(&format!("Stopped Sentinel process (PID: {}).", pid));
                        } else {
                            print_console(&format!("Process PID {} was not running or could not be terminated.", pid));
                        }
                    }
                }
                let _ = std::fs::remove_file(&pid_file);
                print_console("Removed sentinel.pid.");
                return;
            }
            _ => {}
        }
    }

    // --- Background Daemon Mode ---
    let _lock = match PidLock::acquire(pid_file) {
        Some(l) => l,
        None => {
            // Already running, exit silently
            return;
        }
    };

    let logger = SentinelLogger::new(&log_file);

    let adb = match AdbClient::locate(&exe_dir) {
        Some(c) => c,
        None => {
            logger.log("CRITICAL ERROR: Unable to locate adb.exe in any candidate path or PATH.");
            return;
        }
    };

    logger.log("=== Phone 5GHz Sentinel started ===");
    logger.log(&format!("Using ADB at: {}", adb.adb_path.display()));

    let _ = adb.start_server();

    let mut last_nudge_time = Instant::now() - Duration::from_secs(60);
    let cooldown = Duration::from_secs(45);

    loop {
        // Check if an authorized device is connected
        if !adb.is_device_connected() {
            std::thread::sleep(Duration::from_secs(10));
            continue;
        }

        // Query Wi-Fi status
        if let Some(info) = adb.query_wifi_status() {
            if info.connected && info.frequency_mhz > 0 {
                let is_24ghz = info.frequency_mhz < 5000;
                let is_degraded = info.rx_link_speed_mbps > 0 && info.rx_link_speed_mbps <= 5;

                if is_24ghz || is_degraded {
                    let now = Instant::now();
                    if now.duration_since(last_nudge_time) >= cooldown {
                        last_nudge_time = now;

                        logger.log(&format!(
                            "ALERT: Phone drifted to 2.4 GHz or degraded! SSID: {}, Freq: {} MHz, Rx: {} Mbps, Score: {}",
                            info.ssid, info.frequency_mhz, info.rx_link_speed_mbps, info.score
                        ));

                        play_sound_alert();
                        send_toast(
                            "Wi-Fi Drift Detected!",
                            &format!(
                                "Phone roamed to 2.4 GHz ({} MHz, {} Mbps). Nudging back to 5 GHz...",
                                info.frequency_mhz, info.rx_link_speed_mbps
                            ),
                        );

                        // Execute auto-nudge (Wi-Fi cycle via ADB)
                        logger.log("Executing auto-nudge (Wi-Fi cycle via ADB)...");
                        adb.cycle_wifi();

                        // Wait 6 seconds for Wi-Fi to re-associate
                        std::thread::sleep(Duration::from_secs(6));

                        // Verify new state
                        if let Some(new_info) = adb.query_wifi_status() {
                            if new_info.frequency_mhz >= 5000 {
                                logger.log(&format!(
                                    "SUCCESS: Reconnected to 5 GHz ({} MHz, {} Mbps).",
                                    new_info.frequency_mhz, new_info.rx_link_speed_mbps
                                ));
                                play_sound_success();
                                send_toast(
                                    "5 GHz Restored",
                                    &format!(
                                        "Successfully pushed phone back to 5 GHz ({} MHz, {} Mbps).",
                                        new_info.frequency_mhz, new_info.rx_link_speed_mbps
                                    ),
                                );
                            } else {
                                logger.log(&format!(
                                    "WARNING: Auto-nudge failed to restore 5 GHz. Currently still on {} MHz.",
                                    new_info.frequency_mhz
                                ));
                                play_sound_warning();
                                send_toast(
                                    "5 GHz Reconnect Failed",
                                    &format!(
                                        "Phone is still on 2.4 GHz ({} MHz). You may need to cycle Wi-Fi manually.",
                                        new_info.frequency_mhz
                                    ),
                                );
                            }
                        }
                    }
                }
            }
        }

        std::thread::sleep(Duration::from_secs(12));
    }
}
