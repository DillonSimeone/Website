#![windows_subsystem = "windows"]

mod adb;
mod logger;
mod net;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use adb::{activate_usb_tethering, find_adb, get_connected_devices, is_usb_tethering_active, run_adb};
use logger::{init_logger, log};
use net::{check_internet_connectivity, find_tether_adapter, get_network_adapters};

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE, INVALID_HANDLE_VALUE, STILL_ACTIVE,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    OPEN_EXISTING,
};
use windows_sys::Win32::System::Console::{
    AttachConsole, SetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, GetExitCodeProcess, OpenProcess, TerminateProcess,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};

static RUNNING: AtomicBool = AtomicBool::new(true);

unsafe extern "system" fn console_ctrl_handler(_ctrl_type: u32) -> i32 {
    RUNNING.store(false, Ordering::SeqCst);
    1 // Handled
}

fn attach_console_output() {
    unsafe {
        let stdout_h = windows_sys::Win32::System::Console::GetStdHandle(STD_OUTPUT_HANDLE);
        if stdout_h.is_null() || stdout_h == INVALID_HANDLE_VALUE {
            if AttachConsole(ATTACH_PARENT_PROCESS) != 0 {
                let conout: Vec<u16> = "CONOUT$\0".encode_utf16().collect();
                let h = CreateFileW(
                    conout.as_ptr(),
                    FILE_GENERIC_WRITE | FILE_GENERIC_READ,
                    FILE_SHARE_READ | FILE_SHARE_WRITE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    std::ptr::null_mut(),
                );
                if h != INVALID_HANDLE_VALUE && !h.is_null() {
                    SetStdHandle(STD_OUTPUT_HANDLE, h);
                    SetStdHandle(STD_ERROR_HANDLE, h);
                }
            }
        }
    }
}

fn get_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn is_pid_running(pid: u32) -> bool {
    unsafe {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !handle.is_null() {
            let mut exit_code: u32 = 0;
            let ok = GetExitCodeProcess(handle, &mut exit_code) != 0;
            CloseHandle(handle);
            ok && (exit_code as i32 == STILL_ACTIVE)
        } else {
            false
        }
    }
}

fn kill_pid(pid: u32) -> bool {
    unsafe {
        let handle: HANDLE = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !handle.is_null() {
            let res = TerminateProcess(handle, 1) != 0;
            CloseHandle(handle);
            res
        } else {
            false
        }
    }
}

fn print_status(exe_dir: &Path, pid_path: &Path) {
    println!("============================================================");
    println!("Pixel USB Tethering Daemon (Rust Native) - Status");
    println!("============================================================");

    // 1. Daemon process status
    if pid_path.is_file() {
        if let Ok(content) = fs::read_to_string(pid_path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if is_pid_running(pid) {
                    println!("[Daemon] Running (PID: {})", pid);
                } else {
                    println!("[Daemon] Not running (stale PID file found: {})", pid);
                }
            } else {
                println!("[Daemon] Invalid PID file format.");
            }
        }
    } else {
        println!("[Daemon] Not running (no auto_tether.pid found).");
    }

    // 2. ADB status
    match find_adb(exe_dir) {
        Some(adb_path) => {
            println!("[ADB] Detected: {}", adb_path.display());
            if let Ok(res) = run_adb(&adb_path, &["version"], 5) {
                for line in res.stdout.lines() {
                    println!("      {}", line);
                }
            }

            // 3. Android devices
            println!("\n[Connected Android Devices]");
            let devices = get_connected_devices(&adb_path);
            if devices.is_empty() {
                println!("  No Android devices detected via ADB.");
            } else {
                for d in &devices {
                    println!(
                        "  * Serial: {}, Model: {}, Codename: {}, State: {}",
                        d.serial, d.model, d.device, d.state
                    );
                    if d.state == "device" {
                        let active = is_usb_tethering_active(&adb_path);
                        println!(
                            "    Tethering Status: {}",
                            if active { "ACTIVE (Enabled)" } else { "INACTIVE (Disabled)" }
                        );
                    }
                }
            }
        }
        None => {
            println!("[ADB] Error: adb.exe could not be located in candidate search paths.");
        }
    }

    // 4. Windows Network Adapters
    println!("\n[Windows Network Adapters (Active & Tethered)]");
    let adapters = get_network_adapters();
    let mut found = false;
    for a in &adapters {
        if a.is_usb_tether || a.status == 1 {
            println!(
                "  * {} ({}): Status=[{}], Speed={} Mbps, IPs={:?}",
                a.name, a.description, a.status_str, a.link_speed_mbps, a.ipv4
            );
            found = true;
        }
    }
    if !found {
        println!("  No active network adapters found.");
    }

    // 5. Internet Connectivity Probe
    println!("\n[Internet Connectivity Watchdog Probe]");
    let online = check_internet_connectivity(1500);
    println!("  Internet Ping (1.1.1.1:53 / 8.8.8.8:53): {}", if online { "PASS (Connected)" } else { "FAIL (No response)" });
    println!("============================================================");
}

fn stop_daemon(pid_path: &Path) {
    if !pid_path.is_file() {
        println!("No active daemon PID file found at: {}", pid_path.display());
        return;
    }

    if let Ok(content) = fs::read_to_string(pid_path) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if is_pid_running(pid) {
                println!("Stopping auto_tether daemon (PID: {})...", pid);
                if kill_pid(pid) {
                    println!("Daemon successfully terminated.");
                } else {
                    println!("Warning: Could not terminate PID {}.", pid);
                }
            } else {
                println!("Daemon PID {} is no longer running.", pid);
            }
        }
    }

    let _ = fs::remove_file(pid_path);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let exe_dir = get_exe_dir();
    let log_file = exe_dir.join("tethering.log");
    let pid_file = exe_dir.join("auto_tether.pid");

    // Check CLI flags that need console attachment
    if args.len() > 1 {
        let flag = args[1].as_str();
        match flag {
            "--status" => {
                attach_console_output();
                print_status(&exe_dir, &pid_file);
                return;
            }
            "--stop" => {
                attach_console_output();
                stop_daemon(&pid_file);
                return;
            }
            "--help" | "-h" => {
                attach_console_output();
                println!("Pixel USB Tethering Daemon (Rust Native Windows Port)");
                println!("Usage: usb-tether.exe [OPTIONS]");
                println!();
                println!("Options:");
                println!("  (no arguments)  Run daemon in background (silent, zero console flash)");
                println!("  --status        Display current daemon, device, and network status");
                println!("  --test          Run a single check & activation pass, logging to console");
                println!("  --stop          Terminate the running background daemon instance");
                println!("  --help, -h      Display this help dialog");
                return;
            }
            "--test" => {
                attach_console_output();
                init_logger(log_file, true);
                log("Executing diagnostic test pass...");
                let adb = match find_adb(&exe_dir) {
                    Some(a) => a,
                    None => {
                        log("Fatal: ADB executable could not be resolved.");
                        return;
                    }
                };
                log(&format!("Resolved ADB: {}", adb.display()));
                let devices = get_connected_devices(&adb);
                log(&format!("Connected devices: {}", devices.len()));
                for d in &devices {
                    log(&format!("Device: {} [{}] ({})", d.serial, d.model, d.state));
                }
                let active = is_usb_tethering_active(&adb);
                log(&format!("Tethering status before activation: {}", active));
                if !active && !devices.is_empty() {
                    activate_usb_tethering(&adb);
                }
                if let Some(adapter) = find_tether_adapter() {
                    log(&format!(
                        "Tether adapter: {} ({}) [{}] speed: {} Mbps",
                        adapter.name, adapter.description, adapter.status_str, adapter.link_speed_mbps
                    ));
                }
                let online = check_internet_connectivity(1500);
                log(&format!("Internet connectivity probe: {}", online));
                return;
            }
            _ => {}
        }
    }

    // Default: Run as background daemon
    // Initialize logger (file only, no console unless console was attached)
    init_logger(log_file, false);

    // Single-instance enforcement via Windows Mutex
    let mutex_name: Vec<u16> = "Global\\PixelAutoTetherDaemon_RustMutex\0"
        .encode_utf16()
        .collect();
    let h_mutex = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name.as_ptr()) };
    if h_mutex.is_null() || unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        log("Another instance of auto_tether is already running (Mutex held). Exiting silently.");
        if !h_mutex.is_null() {
            unsafe { CloseHandle(h_mutex); }
        }
        return;
    }

    // Single-instance check via PID file
    if pid_file.is_file() {
        if let Ok(content) = fs::read_to_string(&pid_file) {
            if let Ok(existing_pid) = content.trim().parse::<u32>() {
                if is_pid_running(existing_pid) {
                    log(&format!(
                        "Another instance of auto_tether is running (PID: {}). Exiting silently.",
                        existing_pid
                    ));
                    if !h_mutex.is_null() {
                        unsafe { CloseHandle(h_mutex); }
                    }
                    return;
                }
            }
        }
    }

    // Write current PID to auto_tether.pid
    let current_pid = std::process::id();
    let _ = fs::write(&pid_file, current_pid.to_string());

    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(console_ctrl_handler), 1);
    }

    log("============================================================");
    log("Pixel USB Tethering Daemon (Native Rust) starting...");
    log("============================================================");

    // Locate ADB
    let adb_path = match find_adb(&exe_dir) {
        Some(p) => {
            log(&format!("Using ADB binary: {}", p.display()));
            p
        }
        None => {
            log("Fatal error initializing ADB: Could not locate adb.exe in any search candidate.");
            let _ = fs::remove_file(&pid_file);
            if !h_mutex.is_null() {
                unsafe { CloseHandle(h_mutex); }
            }
            return;
        }
    };

    // Ensure ADB server is running
    let _ = run_adb(&adb_path, &["start-server"], 10);

    // Main daemon loop
    while RUNNING.load(Ordering::SeqCst) {
        log("Listening for phone connection (waiting for USB plug-in)...");

        // Polling loop for connected device
        let mut connected_device: Option<adb::AndroidDevice> = None;
        while RUNNING.load(Ordering::SeqCst) {
            let devices = get_connected_devices(&adb_path);
            if let Some(dev) = devices.into_iter().next() {
                connected_device = Some(dev);
                break;
            }
            thread::sleep(Duration::from_millis(2000));
        }

        if !RUNNING.load(Ordering::SeqCst) {
            break;
        }

        let dev = match connected_device {
            Some(d) => d,
            None => continue,
        };

        log(&format!(
            "Phone detected: {} ({}) [Serial: {}]",
            dev.model, dev.device, dev.serial
        ));

        if dev.state == "unauthorized" {
            log("Warning: Phone is unauthorized. Please unlock your phone and tap 'Allow USB Debugging'.");
            thread::sleep(Duration::from_secs(5));
            continue;
        }

        // Delay to allow USB bus stabilization
        thread::sleep(Duration::from_secs(2));

        // Activate USB tethering if not already engaged
        activate_usb_tethering(&adb_path);

        // Monitor and log Windows network adapter link status
        thread::sleep(Duration::from_millis(1500));
        if let Some(adapter) = find_tether_adapter() {
            log(&format!(
                "Windows network adapter link: {} ({}) - Status: {}, Speed: {} Mbps, IPs: {:?}",
                adapter.name, adapter.description, adapter.status_str, adapter.link_speed_mbps, adapter.ipv4
            ));
        } else {
            log("Notice: USB tether network adapter not yet detected by Windows IP stack.");
        }

        // Active connection watchdog loop
        log("Device is connected and active. Tether watchdog active (monitoring ping & disconnect)...");
        let mut fail_count = 0;
        let mut last_watchdog_check = Instant::now();
        let watchdog_interval = Duration::from_secs(12);

        while RUNNING.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_secs(3));

            // Check if device is still connected
            let check_devs = get_connected_devices(&adb_path);
            let still_connected = check_devs.iter().any(|d| d.serial == dev.serial);
            if !still_connected {
                log("Device disconnected.");
                break;
            }

            // Periodic watchdog check
            if last_watchdog_check.elapsed() >= watchdog_interval {
                last_watchdog_check = Instant::now();

                // Check adapter link status
                if let Some(adapter) = find_tether_adapter() {
                    if adapter.status != 1 {
                        log(&format!(
                            "[WATCHDOG] Tether adapter link degraded to: {}",
                            adapter.status_str
                        ));
                    }
                }

                // Check internet connectivity
                if !check_internet_connectivity(1500) {
                    fail_count += 1;
                    log(&format!(
                        "[WATCHDOG] Internet probe failed ({}/2). Checking tether status...",
                        fail_count
                    ));
                    if fail_count >= 2 {
                        log("[WATCHDOG] Tether stall detected! Auto-recovering USB tethering...");
                        activate_usb_tethering(&adb_path);
                        fail_count = 0;
                    }
                } else {
                    fail_count = 0;
                }
            }
        }
    }

    log("Daemon shutting down cleanly.");
    let _ = fs::remove_file(&pid_file);
    if !h_mutex.is_null() {
        unsafe { CloseHandle(h_mutex); }
    }
}
