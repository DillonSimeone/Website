#![windows_subsystem = "windows"]

mod antigravity_parser;
mod cursor_csv_importer;
mod cursor_parser;
mod data_sources;
mod icon_gen;
mod logger;
mod models;
mod popup_ui;
mod proto_decoder;
mod tray_app;

use clap::Parser;
use data_sources::get_app_data_dir;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tray_app::TokenTrackerApp;
use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};

#[link(name = "kernel32")]
extern "system" {
    fn CreateMutexW(
        lp_mutex_attributes: *const core::ffi::c_void,
        b_initial_owner: i32,
        lp_name: *const u16,
    ) -> *mut core::ffi::c_void;
}

#[derive(Parser, Debug)]
#[command(name = "LLMTokenTracker", about = "LLM Token Tracker - System Tray App (AntiGravity + Cursor)")]
struct Cli {
    #[arg(long)]
    data_dir: Option<String>,

    #[arg(long)]
    conversations_dir: Option<String>,

    #[arg(long, default_value = "antigravity,cursor")]
    providers: String,

    #[arg(long)]
    cursor_csv_dir: Option<String>,

    #[arg(long, default_value_t = 2048)]
    cursor_db_max_mb: u64,

    #[arg(long, default_value_t = 60)]
    refresh_interval: u64,

    #[arg(long)]
    log_file: Option<String>,

    #[arg(long, default_value_t = false)]
    debug: bool,

    #[arg(long, default_value_t = false)]
    tray: bool,

    #[arg(long, default_value_t = true)]
    headless: bool,

    /// Run a single scan, write cache, and exit (useful for benchmarking/testing)
    #[arg(long, default_value_t = false)]
    once: bool,

    /// Skip single-instance mutex (useful for isolated benchmark runs)
    #[arg(long, default_value_t = false)]
    no_mutex: bool,
}

fn acquire_single_instance() -> bool {
    let name: Vec<u16> = "Global\\LLMTokenTracker_Mutex\0".encode_utf16().collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if handle.is_null() {
            return true;
        }
        GetLastError() != ERROR_ALREADY_EXISTS
    }
}

fn main() {
    let has_console = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) != 0 };

    let cli = Cli::parse();
    if !cli.no_mutex && !acquire_single_instance() {
        std::process::exit(0);
    }

    let headless_mode = !cli.tray;
    let data_dir = get_app_data_dir(cli.data_dir.as_deref());

    let log_path: Option<PathBuf> = match &cli.log_file {
        Some(p) if !p.is_empty() => Some(PathBuf::from(p)),
        _ if !has_console => Some(data_dir.join("token_tracker.log")),
        _ => None,
    };

    logger::init(cli.debug, has_console, log_path.as_deref());

    let providers: Vec<String> = cli
        .providers
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    let mut extra_dirs: Vec<PathBuf> = Vec::new();
    if let Some(ref conv) = cli.conversations_dir {
        let p = PathBuf::from(conv);
        if !p.is_dir() {
            log_error!("token_tracker", "Specified conversations directory not found: {}", conv);
            std::process::exit(1);
        }
        extra_dirs.push(p);
    }

    let pid_file = data_dir.join("token_tracker.pid");
    let _ = fs::write(&pid_file, std::process::id().to_string());

    let app = Arc::new(TokenTrackerApp::new(
        providers,
        cli.data_dir.as_deref(),
        cli.refresh_interval,
        extra_dirs,
        cli.cursor_csv_dir.as_deref(),
        cli.cursor_db_max_mb,
    ));

    app.start(headless_mode, cli.once);

    if pid_file.is_file() {
        let _ = fs::remove_file(&pid_file);
    }
}
