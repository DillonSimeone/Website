#![windows_subsystem = "windows"]

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, ERROR_ALREADY_EXISTS, HANDLE, SYSTEMTIME, WAIT_OBJECT_0,
};
use windows_sys::Win32::System::Console::{
    AttachConsole, SetConsoleCtrlHandler, ATTACH_PARENT_PROCESS,
};
use windows_sys::Win32::System::SystemInformation::GetLocalTime;
use windows_sys::Win32::System::Threading::{
    CreateEventW, CreateMutexW, GetExitCodeProcess, OpenEventW, OpenProcess, SetEvent,
    WaitForSingleObject, EVENT_MODIFY_STATE, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_TERMINATE, TerminateProcess,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;
const STILL_ACTIVE: u32 = 259;

const MUTEX_NAME: &str = "Local\\PixelEnergyDaemon_Mutex";
const STOP_EVENT_NAME: &str = "Local\\PixelEnergyDaemon_Stop";

static GLOBAL_STOP_EVENT: AtomicUsize = AtomicUsize::new(0);

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn format_timestamp() -> String {
    let mut st: SYSTEMTIME = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut st) };
    format!(
        "[{:04}-{:02}-{:02} {:02}:{:02}:{:02}]",
        st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond
    )
}

fn get_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

#[derive(Clone)]
struct Logger {
    log_path: PathBuf,
    console_attached: bool,
}

impl Logger {
    fn new(exe_dir: &Path, console_attached: bool) -> Self {
        Self {
            log_path: exe_dir.join("energy.log"),
            console_attached,
        }
    }

    fn log(&self, msg: &str) {
        let ts = format_timestamp();
        let formatted = format!("{} {}", ts, msg);

        if self.console_attached {
            println!("{}", formatted);
        }

        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let _ = writeln!(f, "{}", formatted);
        }
    }
}

fn locate_adb(exe_dir: &Path) -> PathBuf {
    let candidates = [
        // 0. Unified RUST platform-tools (laptop / portable installation)
        exe_dir.join(r"..\platform-tools\adb.exe"),
        exe_dir.join(r"platform-tools\adb.exe"),
        // 1. Relative to executable: ..\..\Daemons\USBTethering\platform-tools\adb.exe
        exe_dir.join(r"..\..\Daemons\USBTethering\platform-tools\adb.exe"),
        // 2. Relative to current directory
        PathBuf::from(r"..\..\Daemons\USBTethering\platform-tools\adb.exe"),
        // 3. Absolute known path in repository
        PathBuf::from(r"F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe"),
        // 4. Android SDK in LocalAppData
        std::env::var_os("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join(r"Android\Sdk\platform-tools\adb.exe"))
            .unwrap_or_else(|| PathBuf::from("")),
        // 5. Root platform-tools
        PathBuf::from(r"C:\platform-tools\adb.exe"),
    ];

    for candidate in &candidates {
        if candidate.as_os_str().is_empty() {
            continue;
        }
        if candidate.is_file() {
            if let Ok(canonical) = candidate.canonicalize() {
                return canonical;
            }
            return candidate.clone();
        }
    }

    // 6. Check system PATH
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("adb.exe");
            if candidate.is_file() {
                return candidate;
            }
        }
    }

    // 7. Fallback to bare "adb.exe"
    PathBuf::from("adb.exe")
}

fn run_adb_timeout(adb: &Path, args: &[&str], timeout_secs: u64) -> Result<String, String> {
    let mut child = Command::new(adb)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn adb: {}", e))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        buf
    });

    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let out_bytes = stdout_handle.join().unwrap_or_default();
                let err_bytes = stderr_handle.join().unwrap_or_default();
                let stdout_str = String::from_utf8_lossy(&out_bytes).trim().to_string();
                let stderr_str = String::from_utf8_lossy(&err_bytes).trim().to_string();

                if status.success() {
                    return Ok(stdout_str);
                } else if !stderr_str.is_empty() {
                    return Err(stderr_str);
                } else {
                    return Ok(stdout_str);
                }
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("ADB command timed out after {}s", timeout_secs));
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Error waiting for ADB child: {}", e));
            }
        }
    }
}

fn run_adb_shell(adb: &Path, cmd: &str, timeout_secs: u64) -> Result<String, String> {
    run_adb_timeout(adb, &["shell", cmd], timeout_secs)
}

fn is_device_connected(adb: &Path) -> bool {
    if let Ok(output) = run_adb_timeout(adb, &["devices"], 4) {
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("List of devices") {
                continue;
            }
            if trimmed.ends_with("\tdevice") || trimmed.ends_with(" device") {
                return true;
            }
        }
    }
    false
}

fn is_tethering_active(adb: &Path) -> bool {
    // 1. Check dumpsys tethering
    if let Ok(out) = run_adb_timeout(adb, &["shell", "dumpsys", "tethering"], 4) {
        let lower = out.to_lowercase();
        if lower.contains("tetheredstate") {
            return true;
        }
    }

    // 2. Check ip -br link for ncm0 or rndis0 UP
    if let Ok(out) = run_adb_timeout(adb, &["shell", "ip", "-br", "link"], 3) {
        for line in out.lines() {
            let lower = line.to_lowercase();
            if (lower.contains("ncm0") || lower.contains("rndis0")) && lower.contains("up") {
                return true;
            }
        }
    }

    false
}

fn is_screen_awake(adb: &Path) -> bool {
    if let Ok(out) = run_adb_timeout(adb, &["shell", "dumpsys", "power"], 4) {
        if out.contains("mWakefulness=Awake") || out.contains("mIsInteractive: true") {
            return true;
        }
    }
    false
}

#[derive(Debug, Clone, Default)]
struct BatteryMetrics {
    level: u32,
    status: String,
    current_ma: f64,
    usb_powered: bool,
}

fn get_battery_metrics(adb: &Path) -> BatteryMetrics {
    let mut metrics = BatteryMetrics {
        level: 50,
        status: "Unknown".to_string(),
        current_ma: 0.0,
        usb_powered: false,
    };

    if let Ok(out) = run_adb_timeout(adb, &["shell", "dumpsys", "battery"], 4) {
        for line in out.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("level:") {
                if let Some(val_str) = trimmed.strip_prefix("level:") {
                    if let Ok(val) = val_str.trim().parse::<u32>() {
                        metrics.level = val;
                    }
                }
            } else if trimmed.starts_with("status:") {
                if let Some(val_str) = trimmed.strip_prefix("status:") {
                    metrics.status = match val_str.trim() {
                        "2" => "Charging".to_string(),
                        "3" => "Discharging".to_string(),
                        "4" => "Not Charging".to_string(),
                        "5" => "Full".to_string(),
                        _ => "Unknown".to_string(),
                    };
                }
            } else if trimmed.starts_with("USB powered: true") {
                metrics.usb_powered = true;
            }
        }
    }

    if let Ok(out) = run_adb_timeout(
        adb,
        &["shell", "cat", "/sys/class/power_supply/battery/current_now"],
        3,
    ) {
        if let Ok(ua) = out.trim().parse::<i64>() {
            metrics.current_ma = (ua as f64) / 1000.0;
        }
    }

    metrics
}

struct DeviceSettings {
    timeout: String,
    refresh_rate: String,
    brightness: String,
    low_power: String,
    doze_aod: String,
}

fn query_current_settings(adb: &Path) -> DeviceSettings {
    let timeout = run_adb_shell(adb, "settings get system screen_off_timeout", 3)
        .unwrap_or_else(|_| "unknown".to_string());
    let refresh_rate = run_adb_shell(adb, "settings get system peak_refresh_rate", 3)
        .unwrap_or_else(|_| "unknown".to_string());
    let brightness = run_adb_shell(adb, "settings get system screen_brightness", 3)
        .unwrap_or_else(|_| "unknown".to_string());
    let low_power = run_adb_shell(adb, "settings get global low_power", 3)
        .unwrap_or_else(|_| "unknown".to_string());
    let doze_aod = run_adb_shell(adb, "settings get secure doze_always_on", 3)
        .unwrap_or_else(|_| "unknown".to_string());

    DeviceSettings {
        timeout,
        refresh_rate,
        brightness,
        low_power,
        doze_aod,
    }
}

fn apply_eco_profile(adb: &Path, logger: &Logger) {
    logger.log("Activating Eco Tether Profile on Pixel 6a...");

    // 1. Turn on Low Power / Battery Saver
    let _ = run_adb_shell(adb, "settings put global low_power 1", 4);

    // 2. Set screen off timeout to 15s (15000ms)
    let _ = run_adb_shell(adb, "settings put system screen_off_timeout 15000", 4);

    // 3. Cap display refresh rate at 60Hz
    let _ = run_adb_shell(adb, "settings put system peak_refresh_rate 60.0", 4);

    // 4. Dim screen brightness to 1
    let _ = run_adb_shell(adb, "settings put system screen_brightness 1", 4);

    // 5. Disable Always-On Display (AOD / Ambient Doze)
    let _ = run_adb_shell(adb, "settings put secure doze_always_on 0", 4);

    // 6. Disable GPS / Location mode
    let _ = run_adb_shell(adb, "settings put secure location_mode 0", 4);

    // 7. Disable auxiliary radios (Bluetooth & NFC)
    let _ = run_adb_shell(adb, "svc bluetooth disable", 4);
    let _ = run_adb_shell(adb, "svc nfc disable", 4);

    // 8. Put display to sleep if awake
    if is_screen_awake(adb) {
        let _ = run_adb_shell(adb, "input keyevent 26", 4);
    }

    logger.log("Eco Tether Profile applied: Battery Saver ON, 60Hz Cap, Timeout 15s, Brightness 1, Radios OFF, Display Sleep.");
}

fn restore_normal_profile(adb: &Path, logger: &Logger) {
    logger.log("Restoring standard mobile power profile...");

    // 1. Turn off Battery Saver
    let _ = run_adb_shell(adb, "settings put global low_power 0", 4);

    // 2. Restore screen timeout to 60s
    let _ = run_adb_shell(adb, "settings put system screen_off_timeout 60000", 4);

    // 3. Delete refresh rate cap (restores device default dynamic refresh rate)
    let _ = run_adb_shell(adb, "settings delete system peak_refresh_rate", 4);

    // 4. Restore brightness to 50
    let _ = run_adb_shell(adb, "settings put system screen_brightness 50", 4);

    // 5. Restore Always-On Display (AOD)
    let _ = run_adb_shell(adb, "settings put secure doze_always_on 1", 4);

    // 6. Restore High Accuracy GPS / Location
    let _ = run_adb_shell(adb, "settings put secure location_mode 3", 4);

    // 7. Re-enable Bluetooth
    let _ = run_adb_shell(adb, "svc bluetooth enable", 4);

    logger.log("Normal mobile power profile restored.");
}

fn ensure_screen_asleep(adb: &Path, logger: &Logger) {
    if is_screen_awake(adb) {
        let _ = run_adb_shell(adb, "input keyevent 26", 3);
        logger.log("Display woke while tethered; forced display to sleep (keyevent 26).");
    }
}

fn is_process_alive(pid: u32) -> bool {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let success = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        success != 0 && exit_code == STILL_ACTIVE
    }
}

fn write_pid_file(pid_path: &Path) {
    let pid = std::process::id();
    if let Ok(mut f) = File::create(pid_path) {
        let _ = write!(f, "{}", pid);
    }
}

fn remove_pid_file(pid_path: &Path) {
    let _ = fs::remove_file(pid_path);
}

fn read_pid_file(pid_path: &Path) -> Option<u32> {
    if let Ok(content) = fs::read_to_string(pid_path) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            return Some(pid);
        }
    }
    None
}

unsafe extern "system" fn ctrl_handler(_ctrl_type: u32) -> BOOL {
    let event = GLOBAL_STOP_EVENT.load(Ordering::SeqCst) as HANDLE;
    if !event.is_null() {
        SetEvent(event);
    }
    1
}

fn handle_status_command(adb: &Path, exe_dir: &Path) {
    println!("==================================================");
    println!("     Phone Energy Daemon Status & Diagnostics     ");
    println!("==================================================");

    let pid_path = exe_dir.join("energy.pid");
    let daemon_pid = read_pid_file(&pid_path);
    let daemon_running = daemon_pid.map(is_process_alive).unwrap_or(false);

    if daemon_running {
        println!(" Daemon Process   : RUNNING (PID: {})", daemon_pid.unwrap());
    } else {
        println!(" Daemon Process   : STOPPED");
    }

    println!(" ADB Binary       : {}", adb.display());

    let connected = is_device_connected(adb);
    if !connected {
        println!(" Android Device   : NOT DETECTED");
        println!("==================================================");
        return;
    }

    println!(" Android Device   : CONNECTED");

    let tether_active = is_tethering_active(adb);
    println!(
        " USB Tethering    : {}",
        if tether_active { "ACTIVE (Eco Profile Target)" } else { "INACTIVE" }
    );

    let awake = is_screen_awake(adb);
    println!(
        " Display State    : {}",
        if awake { "AWAKE" } else { "SLEEP / DOZING" }
    );

    let metrics = get_battery_metrics(adb);
    let sign = if metrics.current_ma > 0.0 { "+" } else { "" };
    println!(
        " Battery Level    : {}% ({})",
        metrics.level, metrics.status
    );
    println!(
        " Charging Current : {}{:.1} mA (USB: {})",
        sign, metrics.current_ma, metrics.usb_powered
    );

    let settings = query_current_settings(adb);
    println!(" Device Settings  :");
    println!("   - Screen Timeout : {} ms", settings.timeout);
    println!("   - Peak Refresh   : {} Hz", settings.refresh_rate);
    println!("   - Brightness     : {}", settings.brightness);
    println!("   - Low Power Mode : {}", settings.low_power);
    println!("   - Ambient AOD    : {}", settings.doze_aod);

    println!("==================================================");
}

fn handle_stop_command(adb: &Path, exe_dir: &Path) {
    println!("Stopping Phone Energy Daemon...");

    let pid_path = exe_dir.join("energy.pid");
    let pid_opt = read_pid_file(&pid_path);

    let wide_stop = to_wide_null(STOP_EVENT_NAME);
    let event = unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, wide_stop.as_ptr()) };

    if !event.is_null() {
        unsafe {
            SetEvent(event);
            CloseHandle(event);
        }
        println!("[+] Sent stop signal to daemon event.");
    }

    if let Some(pid) = pid_opt {
        let start = Instant::now();
        let mut stopped = false;
        while start.elapsed() < Duration::from_secs(5) {
            if !is_process_alive(pid) {
                stopped = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        if !stopped {
            println!("[!] Daemon did not exit within 5s. Terminating PID {}...", pid);
            unsafe {
                let h_proc = OpenProcess(PROCESS_TERMINATE, 0, pid);
                if !h_proc.is_null() {
                    TerminateProcess(h_proc, 0);
                    CloseHandle(h_proc);
                }
            }
        }
    }

    remove_pid_file(&pid_path);

    // Restore device settings via ADB to ensure phone is left in normal state
    if is_device_connected(adb) {
        let logger = Logger::new(exe_dir, true);
        restore_normal_profile(adb, &logger);
    }

    println!("[OK] Phone Energy Daemon stopped.");
}

fn handle_eco_command(adb: &Path, exe_dir: &Path) {
    if !is_device_connected(adb) {
        eprintln!("[ERROR] No Android device connected via ADB.");
        return;
    }
    let logger = Logger::new(exe_dir, true);
    apply_eco_profile(adb, &logger);
    println!("[OK] Eco Tether profile successfully applied to connected device.");
}

fn handle_restore_command(adb: &Path, exe_dir: &Path) {
    if !is_device_connected(adb) {
        eprintln!("[ERROR] No Android device connected via ADB.");
        return;
    }
    let logger = Logger::new(exe_dir, true);
    restore_normal_profile(adb, &logger);
    println!("[OK] Normal mobile power profile successfully restored on connected device.");
}

fn print_help() {
    println!("Phone Energy Daemon (Native Windows Rust)");
    println!("Usage: energy-daemon.exe [OPTIONS]");
    println!();
    println!("Options:");
    println!("  (no args)    Run as silent background daemon (zero console flicker)");
    println!("  --status     Query daemon status, telemetry, and phone profile");
    println!("  --stop       Gracefully stop the running daemon and restore phone settings");
    println!("  --eco        Force apply Eco-Tether profile now via ADB");
    println!("  --restore    Force restore default phone settings now via ADB");
    println!("  --help, -h   Show this help message");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let has_cli_arg = args.len() > 1;

    let exe_dir = get_exe_dir();
    let adb_path = locate_adb(&exe_dir);

    if has_cli_arg {
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }

        let cmd = args[1].as_str();
        match cmd {
            "--status" => handle_status_command(&adb_path, &exe_dir),
            "--stop" => handle_stop_command(&adb_path, &exe_dir),
            "--eco" => handle_eco_command(&adb_path, &exe_dir),
            "--restore" => handle_restore_command(&adb_path, &exe_dir),
            "--help" | "-h" => print_help(),
            other => {
                eprintln!("Unknown option: {}", other);
                print_help();
            }
        }
        return;
    }

    // Background Daemon Mode:
    // Ensure single instance via Named Mutex
    let wide_mutex = to_wide_null(MUTEX_NAME);
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, wide_mutex.as_ptr()) };

    let pid_path = exe_dir.join("energy.pid");
    let logger = Logger::new(&exe_dir, false);

    if mutex.is_null() || unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        // Check if existing process is truly alive
        if let Some(existing_pid) = read_pid_file(&pid_path) {
            if is_process_alive(existing_pid) {
                logger.log("Another instance of energy-daemon is already running. Exiting.");
                return;
            }
        }
    }

    write_pid_file(&pid_path);

    // Create named stop event
    let wide_stop = to_wide_null(STOP_EVENT_NAME);
    let stop_event = unsafe { CreateEventW(std::ptr::null(), 1, 0, wide_stop.as_ptr()) };
    GLOBAL_STOP_EVENT.store(stop_event as usize, Ordering::SeqCst);

    unsafe {
        SetConsoleCtrlHandler(Some(ctrl_handler), 1);
    }

    logger.log("============================================================");
    logger.log("Phone Energy Daemon (Rust Native) started.");
    logger.log(&format!("Using ADB binary: {}", adb_path.display()));
    logger.log(&format!("Daemon PID: {}", std::process::id()));
    logger.log("============================================================");

    // Start adb server if needed
    let _ = run_adb_timeout(&adb_path, &["start-server"], 10);

    let mut eco_applied = false;
    let mut last_telemetry_time = Instant::now() - Duration::from_secs(120);

    loop {
        let connected = is_device_connected(&adb_path);
        if !connected {
            if eco_applied {
                eco_applied = false;
                logger.log("Device disconnected. Waiting for reconnection...");
            }
            let wait_res = unsafe { WaitForSingleObject(stop_event, 8000) };
            if wait_res == WAIT_OBJECT_0 {
                logger.log("Received stop signal. Initiating graceful shutdown...");
                break;
            }
            continue;
        }

        let tether_active = is_tethering_active(&adb_path);

        if tether_active {
            if !eco_applied {
                apply_eco_profile(&adb_path, &logger);
                eco_applied = true;
            } else {
                ensure_screen_asleep(&adb_path, &logger);
            }

            if last_telemetry_time.elapsed() >= Duration::from_secs(120) {
                last_telemetry_time = Instant::now();
                let metrics = get_battery_metrics(&adb_path);
                let sign = if metrics.current_ma > 0.0 { "+" } else { "" };
                logger.log(&format!(
                    "Telemetry: Battery {}% ({}) • Current: {}{:.1} mA",
                    metrics.level, metrics.status, sign, metrics.current_ma
                ));
            }
        } else if eco_applied {
            logger.log("USB tethering inactive; restoring normal power profile...");
            restore_normal_profile(&adb_path, &logger);
            eco_applied = false;
        }

        // Responsive event wait between poll intervals
        let wait_res = unsafe { WaitForSingleObject(stop_event, 12000) };
        if wait_res == WAIT_OBJECT_0 {
            logger.log("Received stop signal. Initiating graceful shutdown...");
            break;
        }
    }

    // Graceful exit: restore settings on phone
    if is_device_connected(&adb_path) && eco_applied {
        restore_normal_profile(&adb_path, &logger);
    }

    remove_pid_file(&pid_path);

    if !stop_event.is_null() {
        unsafe { CloseHandle(stop_event) };
    }
    if !mutex.is_null() {
        unsafe { CloseHandle(mutex) };
    }

    logger.log("Phone Energy Daemon stopped cleanly.");
}
