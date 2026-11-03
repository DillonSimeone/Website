use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

#[repr(C)]
#[derive(Copy, Clone, Default)]
struct SystemTime {
    w_year: u16,
    w_month: u16,
    w_day_of_week: u16,
    w_day: u16,
    w_hour: u16,
    w_minute: u16,
    w_second: u16,
    w_milliseconds: u16,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetLocalTime(lp_system_time: *mut SystemTime);
}

pub fn get_timestamp() -> String {
    let mut st: SystemTime = unsafe { std::mem::zeroed() };
    unsafe {
        GetLocalTime(&mut st);
    }
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        st.w_year, st.w_month, st.w_day, st.w_hour, st.w_minute, st.w_second
    )
}

pub struct SentinelLogger {
    log_path: PathBuf,
    max_bytes: u64,
    keep_lines: usize,
}

impl SentinelLogger {
    pub fn new(log_path: impl AsRef<Path>) -> Self {
        Self {
            log_path: log_path.as_ref().to_path_buf(),
            max_bytes: 200 * 1024, // 200 KB
            keep_lines: 500,
        }
    }

    pub fn log(&self, message: &str) {
        let timestamp = get_timestamp();
        let line = format!("[{}] {}", timestamp, message);

        // Append line to file
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let _ = writeln!(file, "{}", line);
        }

        // Check if size exceeded limit
        if let Ok(meta) = std::fs::metadata(&self.log_path) {
            if meta.len() > self.max_bytes {
                self.trim();
            }
        }
    }

    fn trim(&self) {
        if let Ok(content) = std::fs::read_to_string(&self.log_path) {
            let lines: Vec<&str> = content.lines().collect();
            if lines.len() > self.keep_lines {
                let slice = &lines[lines.len() - self.keep_lines..];
                let mut truncated = slice.join("\r\n");
                truncated.push_str("\r\n");
                let _ = std::fs::write(&self.log_path, truncated);
            }
        }
    }
}
