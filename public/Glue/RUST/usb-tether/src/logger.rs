use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use windows_sys::Win32::Foundation::SYSTEMTIME;
use windows_sys::Win32::System::SystemInformation::GetLocalTime;

static CONSOLE_ATTACHED: AtomicBool = AtomicBool::new(false);
static LOG_FILE_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn init_logger(log_path: PathBuf, console_attached: bool) {
    CONSOLE_ATTACHED.store(console_attached, Ordering::SeqCst);
    let mut guard = LOG_FILE_PATH.lock().unwrap();
    *guard = Some(log_path);
}

pub fn log(msg: &str) {
    let mut st: SYSTEMTIME = unsafe { std::mem::zeroed() };
    unsafe {
        GetLocalTime(&mut st);
    }
    let timestamp = format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond
    );
    let formatted = format!("[{}] {}", timestamp, msg);

    // Mirror to console if attached
    if CONSOLE_ATTACHED.load(Ordering::Relaxed) {
        println!("{}", formatted);
    }

    // Write to tethering.log
    let guard = LOG_FILE_PATH.lock().unwrap();
    if let Some(ref path) = *guard {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", formatted);
        }
    }
}
