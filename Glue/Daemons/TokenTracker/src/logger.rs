use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use chrono::Local;

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
}

struct LoggerState {
    level: LogLevel,
    to_stdout: bool,
    file: Option<File>,
}

static LOGGER: OnceLock<Mutex<LoggerState>> = OnceLock::new();

pub fn init(debug: bool, to_stdout: bool, log_file: Option<&Path>) {
    let level = if debug { LogLevel::Debug } else { LogLevel::Info };
    let file = log_file.and_then(|p| {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        OpenOptions::new().create(true).append(true).open(p).ok()
    });
    let _ = LOGGER.set(Mutex::new(LoggerState {
        level,
        to_stdout,
        file,
    }));
}

pub fn log(level: LogLevel, module: &str, msg: &str) {
    let Some(lock) = LOGGER.get() else {
        return;
    };
    let Ok(mut state) = lock.lock() else {
        return;
    };
    if level > state.level {
        return;
    }
    let level_str = match level {
        LogLevel::Error => "ERROR",
        LogLevel::Warn => "WARNING",
        LogLevel::Info => "INFO",
        LogLevel::Debug => "DEBUG",
    };
    let now = Local::now().format("%Y-%m-%d %H:%M:%S,%3f");
    let line = format!("{now} [{level_str}] {module}: {msg}\n");
    if state.to_stdout {
        let _ = std::io::stdout().write_all(line.as_bytes());
        let _ = std::io::stdout().flush();
    }
    if let Some(ref mut f) = state.file {
        let _ = f.write_all(line.as_bytes());
    }
}

#[macro_export]
macro_rules! log_info {
    ($mod:expr, $($arg:tt)*) => {
        $crate::logger::log($crate::logger::LogLevel::Info, $mod, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_warn {
    ($mod:expr, $($arg:tt)*) => {
        $crate::logger::log($crate::logger::LogLevel::Warn, $mod, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_error {
    ($mod:expr, $($arg:tt)*) => {
        $crate::logger::log($crate::logger::LogLevel::Error, $mod, &format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_debug {
    ($mod:expr, $($arg:tt)*) => {
        $crate::logger::log($crate::logger::LogLevel::Debug, $mod, &format!($($arg)*))
    };
}
