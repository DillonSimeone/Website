use crate::antigravity_parser::scan_all_antigravity;
use crate::cursor_csv_importer::{
    merge_csv_over_local, parse_csv_file, scan_csv_directory, CSV_SOURCE_ID,
};
use crate::cursor_parser::scan_all_cursor;
use crate::data_sources::{
    discover_all_sources, get_app_data_dir, get_default_cursor_csv_dir, DataSource,
};
use crate::icon_gen::{create_default_icon, create_tray_icon, format_token_count};
use crate::{log_error, log_info};
use crate::models::{
    compute_stats, local_day_start, local_today_start, merge_entries, CachePayload,
    SourceScanState, TokenEntry,
};
use crate::popup_ui::{close_popup, show_popup, PopupData, ProviderPopupInfo};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Controls::Dialogs::{GetOpenFileNameW, OPENFILENAMEW};
use windows_sys::Win32::UI::Shell::{
    ShellExecuteW, Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE,
    NIM_MODIFY, NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyIcon, DestroyMenu,
    DestroyWindow, DispatchMessageW, GetCursorPos, GetMessageW, PostMessageW, PostQuitMessage,
    RegisterClassW, SetForegroundWindow, TrackPopupMenu, TranslateMessage, HICON, MF_GRAYED,
    MF_SEPARATOR, MF_STRING, MSG, SW_SHOWNORMAL, TPM_BOTTOMALIGN, TPM_LEFTALIGN, TPM_RETURNCMD,
    WM_APP, WM_DESTROY, WM_LBUTTONUP, WM_RBUTTONUP, WNDCLASSW,
};

const CACHE_VERSION: u32 = 5;
const WM_TRAY_CALLBACK: u32 = WM_APP + 1;
const WM_TRAY_SHOW_POPUP: u32 = WM_APP + 2;
const WM_TRAY_REFRESH_UI: u32 = WM_APP + 3;

const CMD_SHOW_STATS: usize = 1001;
const CMD_REFRESH_NOW: usize = 1002;
const CMD_IMPORT_CSV: usize = 1003;
const CMD_OPEN_FOLDER: usize = 1004;
const CMD_EXIT: usize = 1005;

struct AppState {
    providers: Vec<String>,
    data_dir: PathBuf,
    refresh_interval_minutes: u64,
    extra_antigravity_dirs: Vec<PathBuf>,
    cursor_csv_dir: PathBuf,
    cursor_db_max_mb: u64,
    sources: Vec<DataSource>,
    entries: Vec<TokenEntry>,
    last_scan_time: Option<DateTime<Utc>>,
    source_states: HashMap<String, SourceScanState>,
    cache_file: PathBuf,
}

static TRAY_APP_PTR: Mutex<Option<Arc<TokenTrackerApp>>> = Mutex::new(None);
static TRAY_HWND: Mutex<usize> = Mutex::new(0);
static TRAY_HICON: Mutex<usize> = Mutex::new(0);

pub struct TokenTrackerApp {
    state: Mutex<AppState>,
    stop_flag: AtomicBool,
}

impl TokenTrackerApp {
    pub fn new(
        providers: Vec<String>,
        data_dir: Option<&str>,
        refresh_interval_minutes: u64,
        extra_antigravity_dirs: Vec<PathBuf>,
        cursor_csv_dir: Option<&str>,
        cursor_db_max_mb: u64,
    ) -> Self {
        let data_dir_path = get_app_data_dir(data_dir);
        let csv_dir = match cursor_csv_dir {
            Some(d) if !d.is_empty() => PathBuf::from(d),
            _ => get_default_cursor_csv_dir(Some(&data_dir_path)),
        };
        let sources = discover_all_sources(&providers, &extra_antigravity_dirs);
        let cache_file = data_dir_path.join("cache.json");

        Self {
            state: Mutex::new(AppState {
                providers,
                data_dir: data_dir_path,
                refresh_interval_minutes,
                extra_antigravity_dirs,
                cursor_csv_dir: csv_dir,
                cursor_db_max_mb,
                sources,
                entries: Vec::new(),
                last_scan_time: None,
                source_states: HashMap::new(),
                cache_file,
            }),
            stop_flag: AtomicBool::new(false),
        }
    }

    fn find_legacy_cache_files() -> Vec<PathBuf> {
        let mut legacy = Vec::new();
        if let Some(home) = dirs::home_dir() {
            let gemini_root = home.join(".gemini");
            if gemini_root.is_dir() {
                if let Ok(entries) = fs::read_dir(gemini_root) {
                    for entry in entries.flatten() {
                        let c = entry.path().join("token_tracker_cache.json");
                        if c.is_file() {
                            legacy.push(c);
                        }
                    }
                }
            }
        }
        legacy
    }

    pub fn load_cache(&self) {
        let cache_file = {
            let st = self.state.lock().unwrap();
            st.cache_file.clone()
        };

        if cache_file.is_file() {
            if let Ok(file) = File::open(&cache_file) {
                let reader = BufReader::with_capacity(256 * 1024, file);
                match serde_json::from_reader::<_, CachePayload>(reader) {
                    Ok(payload) => {
                        if payload.version < CACHE_VERSION {
                            log_info!(
                                "token_tracker",
                                "Cache version {} is outdated (current: {}); forcing full rescan",
                                payload.version,
                                CACHE_VERSION
                            );
                            return;
                        }
                        let mut st = self.state.lock().unwrap();
                        st.entries = payload.entries;
                        st.source_states = payload.sources;
                        st.last_scan_time = payload.last_scan_time;
                        log_info!(
                            "token_tracker",
                            "Loaded {} cached entries from cache. Last scan: {:?}",
                            st.entries.len(),
                            st.last_scan_time
                        );
                        return;
                    }
                    Err(e) => {
                        log_error!("token_tracker", "Error loading cache file: {}", e);
                    }
                }
            }
            return;
        }

        for legacy in Self::find_legacy_cache_files() {
            if legacy.is_file() {
                log_info!("token_tracker", "Migrating legacy cache from {}", legacy.display());
                if let Ok(file) = File::open(&legacy) {
                    if let Ok(payload) = serde_json::from_reader::<_, CachePayload>(BufReader::new(file)) {
                        let mut st = self.state.lock().unwrap();
                        let first_ag = st
                            .sources
                            .iter()
                            .find(|s| s.provider == "antigravity")
                            .map(|s| (s.source_id.clone(), s.account_key.clone()));
                        let mut migrated = Vec::with_capacity(payload.entries.len());
                        for mut e in payload.entries {
                            if e.provider.is_empty() {
                                e.provider = "antigravity".to_string();
                            }
                            if e.source_id.is_empty() {
                                if let Some((ref sid, ref acct)) = first_ag {
                                    e.source_id = sid.clone();
                                    e.account_key = acct.clone();
                                }
                            }
                            e.ensure_entry_id();
                            migrated.push(e);
                        }
                        st.entries = migrated;
                        st.last_scan_time = payload.last_scan_time;
                        log_info!("token_tracker", "Migrated {} entries from v1 cache", st.entries.len());
                        return;
                    }
                }
            }
        }

        log_info!("token_tracker", "No cache file found. A full scan will be performed.");
    }

    pub fn save_cache(&self) {
        let mut st = self.state.lock().unwrap();
        for state in st.source_states.values_mut() {
            if state.seen_entry_ids.len() > 5000 {
                let drain_end = state.seen_entry_ids.len() - 5000;
                state.seen_entry_ids.drain(..drain_end);
            }
            if state.seen_bubble_keys.len() > 50000 {
                let excess = state.seen_bubble_keys.len() - 50000;
                let to_remove: Vec<String> = state.seen_bubble_keys.iter().take(excess).cloned().collect();
                for k in to_remove {
                    state.seen_bubble_keys.remove(&k);
                }
            }
        }

        #[derive(Serialize)]
        struct CachePayloadRef<'a> {
            version: u32,
            last_scan_time: Option<DateTime<Utc>>,
            sources: &'a HashMap<String, SourceScanState>,
            entries: &'a [TokenEntry],
        }

        let payload = CachePayloadRef {
            version: CACHE_VERSION,
            last_scan_time: st.last_scan_time,
            sources: &st.source_states,
            entries: &st.entries,
        };

        let _ = fs::create_dir_all(&st.data_dir);
        let temp_cache = st.cache_file.with_extension("tmp");
        match File::create(&temp_cache) {
            Ok(f) => {
                let writer = BufWriter::with_capacity(256 * 1024, f);
                if let Err(e) = serde_json::to_writer(writer, &payload) {
                    log_error!("token_tracker", "Error serializing cache: {}", e);
                    return;
                }
                if let Err(e) = fs::rename(&temp_cache, &st.cache_file) {
                    log_error!("token_tracker", "Error replacing cache file: {}", e);
                } else {
                    log_info!(
                        "token_tracker",
                        "Saved {} entries to {}",
                        st.entries.len(),
                        st.cache_file.display()
                    );
                }
            }
            Err(e) => {
                log_error!("token_tracker", "Error creating temp cache file: {}", e);
            }
        }
    }

    pub fn refresh_data(&self) {
        log_info!("token_tracker", "Scanning all data sources...");
        let start = Instant::now();

        let (
            providers,
            extra_dirs,
            last_scan_time,
            existing_entries,
            mut new_source_states,
            cursor_csv_dir,
            cursor_db_max_mb,
        ) = {
            let mut st = self.state.lock().unwrap();
            (
                st.providers.clone(),
                st.extra_antigravity_dirs.clone(),
                st.last_scan_time,
                std::mem::take(&mut st.entries),
                std::mem::take(&mut st.source_states),
                st.cursor_csv_dir.clone(),
                st.cursor_db_max_mb,
            )
        };

        let sources = discover_all_sources(&providers, &extra_dirs);
        let mut active_source_ids: HashSet<String> =
            sources.iter().map(|s| s.source_id.clone()).collect();
        active_source_ids.insert(CSV_SOURCE_ID.to_string());

        // Partition existing entries by destination without cloning a single TokenEntry
        let mut ag_existing = Vec::new();
        let mut cursor_existing = Vec::new();
        let mut all_entries = Vec::new();
        for e in existing_entries {
            if !e.source_id.is_empty() && !active_source_ids.contains(&e.source_id) {
                all_entries.push(e);
            } else if e.provider == "antigravity" {
                ag_existing.push(e);
            } else if e.provider == "cursor" {
                cursor_existing.push(e);
            }
        }

        let ag_sources: Vec<&DataSource> = sources
            .iter()
            .filter(|s| s.provider == "antigravity")
            .collect();
        if !ag_sources.is_empty() && providers.iter().any(|p| p == "antigravity") {
            let ag_owned: Vec<DataSource> = ag_sources.iter().map(|s| (*s).clone()).collect();
            let ag_entries = scan_all_antigravity(&ag_owned, last_scan_time, ag_existing);
            all_entries.extend(ag_entries);
            let now = Utc::now();
            for src in &ag_sources {
                new_source_states.insert(
                    src.source_id.clone(),
                    SourceScanState {
                        provider: "antigravity".to_string(),
                        path: src.path.to_string_lossy().to_string(),
                        account_key: src.account_key.clone(),
                        last_scan_time: Some(now),
                        last_db_mtime: None,
                        seen_entry_ids: Vec::new(),
                        seen_bubble_keys: HashSet::new(),
                    },
                );
            }
        }

        let cursor_sources: Vec<DataSource> = sources
            .iter()
            .filter(|s| s.provider == "cursor")
            .cloned()
            .collect();
        if !cursor_sources.is_empty() && providers.iter().any(|p| p == "cursor") {
            let mut bubble_states: HashMap<String, HashSet<String>> = HashMap::new();
            let mut source_mtimes: HashMap<String, f64> = HashMap::new();
            for (sid, state) in &mut new_source_states {
                if !state.seen_bubble_keys.is_empty() {
                    bubble_states.insert(sid.clone(), std::mem::take(&mut state.seen_bubble_keys));
                }
                if let Some(m) = state.last_db_mtime {
                    source_mtimes.insert(sid.clone(), m);
                }
            }
            let cursor_entries = scan_all_cursor(
                &cursor_sources,
                &mut bubble_states,
                &source_mtimes,
                cursor_existing,
                cursor_db_max_mb,
            );
            all_entries.extend(cursor_entries);
            let now = Utc::now();
            for src in &cursor_sources {
                if src.source_type == "chat_store" {
                    continue;
                }
                let mtime = fs::metadata(&src.path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs_f64());
                new_source_states.insert(
                    src.source_id.clone(),
                    SourceScanState {
                        provider: "cursor".to_string(),
                        path: src.path.to_string_lossy().to_string(),
                        account_key: src.account_key.clone(),
                        last_scan_time: Some(now),
                        last_db_mtime: mtime,
                        seen_entry_ids: Vec::new(),
                        seen_bubble_keys: bubble_states.remove(&src.source_id).unwrap_or_default(),
                    },
                );
            }
        }

        let cursor_account = cursor_sources
            .iter()
            .find(|s| !s.account_key.is_empty())
            .map(|s| s.account_key.as_str())
            .unwrap_or("");
        let csv_entries = scan_csv_directory(&cursor_csv_dir, cursor_account);
        let merged = merge_entries(all_entries);
        let merged = merge_csv_over_local(merged, csv_entries, 60);

        let count = merged.len();
        {
            let mut st = self.state.lock().unwrap();
            st.sources = sources;
            st.entries = merged;
            st.source_states = new_source_states;
            st.last_scan_time = Some(Utc::now());
        }
        self.save_cache();

        let elapsed = start.elapsed().as_secs_f64();
        log_info!(
            "token_tracker",
            "Scan complete: {} entries in {:.3}s",
            count,
            elapsed
        );
    }

    pub fn start(self: Arc<Self>, headless: bool, once: bool) {
        {
            let st = self.state.lock().unwrap();
            log_info!(
                "token_tracker",
                "Starting LLM Token Tracker (headless={}, once={})...",
                headless,
                once
            );
            log_info!("token_tracker", "Providers: {}", st.providers.join(", "));
            log_info!("token_tracker", "Data dir: {}", st.data_dir.display());
            log_info!("token_tracker", "Discovered {} data sources", st.sources.len());
            for src in &st.sources {
                log_info!(
                    "token_tracker",
                    "  [{}] {} ({})",
                    src.provider,
                    src.path.display(),
                    if src.account_key.is_empty() {
                        "unknown account"
                    } else {
                        &src.account_key
                    }
                );
            }
            log_info!(
                "token_tracker",
                "Refresh interval: {} minutes",
                st.refresh_interval_minutes
            );
        }

        self.load_cache();
        self.refresh_data();

        if once {
            return;
        }

        let bg_self = self.clone();
        std::thread::spawn(move || {
            while !bg_self.stop_flag.load(Ordering::Relaxed) {
                let mins = {
                    let st = bg_self.state.lock().unwrap();
                    st.refresh_interval_minutes.max(1)
                };
                let total_secs = mins * 60;
                for _ in 0..total_secs {
                    if bg_self.stop_flag.load(Ordering::Relaxed) {
                        return;
                    }
                    std::thread::sleep(Duration::from_secs(1));
                }
                log_info!("token_tracker", "Auto-refreshing data...");
                bg_self.refresh_data();
                let hwnd = *TRAY_HWND.lock().unwrap() as HWND;
                if !hwnd.is_null() {
                    unsafe {
                        PostMessageW(hwnd, WM_TRAY_REFRESH_UI, 0, 0);
                    }
                }
            }
        });

        if headless {
            log_info!("token_tracker", "Running in headless background scanner mode...");
            while !self.stop_flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_secs(1));
            }
        } else {
            run_tray_loop(self);
        }
    }

    fn build_popup_data(self: &Arc<Self>) -> PopupData {
        let st = self.state.lock().unwrap();
        let today_start = local_today_start();
        let seven_days = local_day_start(6);
        let thirty_days = local_day_start(29);

        let stats_today = compute_stats(&st.entries, Some(today_start), None, None, false);
        let stats_7d = compute_stats(&st.entries, Some(seven_days), None, None, false);
        let stats_30d = compute_stats(&st.entries, Some(thirty_days), None, None, false);
        let stats_lifetime = compute_stats(&st.entries, None, None, None, true);

        let mut provider_breakdown = HashMap::new();
        for provider in ["antigravity", "cursor"] {
            if !st.providers.iter().any(|p| p == provider) {
                continue;
            }
            let p_today = compute_stats(&st.entries, Some(today_start), None, Some(provider), false);
            let mut accounts: Vec<String> = st
                .sources
                .iter()
                .filter(|s| s.provider == provider && !s.account_key.is_empty())
                .map(|s| s.account_key.clone())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            accounts.sort();
            let paths: Vec<String> = st
                .sources
                .iter()
                .filter(|s| s.provider == provider)
                .map(|s| s.path.to_string_lossy().to_string())
                .collect();
            let disclaimer = if provider == "cursor" {
                "Local estimate; import CSV for billing accuracy".to_string()
            } else {
                String::new()
            };
            provider_breakdown.insert(
                provider.to_string(),
                ProviderPopupInfo {
                    today_tokens: p_today.total_tokens,
                    accounts,
                    paths,
                    disclaimer,
                },
            );
        }

        let self_iv = self.clone();
        let on_interval_change = Arc::new(move |mins: u64| {
            let mut s = self_iv.state.lock().unwrap();
            s.refresh_interval_minutes = mins;
            log_info!("token_tracker", "Refresh interval changed to {} minutes", mins);
        });

        let self_ref = self.clone();
        let on_refresh_now = Arc::new(move || {
            self_ref.refresh_data();
            let hwnd = *TRAY_HWND.lock().unwrap() as HWND;
            if !hwnd.is_null() {
                unsafe {
                    PostMessageW(hwnd, WM_TRAY_REFRESH_UI, 0, 0);
                    PostMessageW(hwnd, WM_TRAY_SHOW_POPUP, 0, 0);
                }
            }
        });

        PopupData {
            stats_today,
            stats_7d,
            stats_30d,
            stats_lifetime,
            provider_breakdown,
            refresh_interval_minutes: st.refresh_interval_minutes,
            last_scan_time: st.last_scan_time,
            on_interval_change,
            on_refresh_now,
        }
    }

    fn current_icon_and_tip(&self) -> (HICON, String) {
        let st = self.state.lock().unwrap();
        if st.entries.is_empty() {
            return (create_default_icon(), "Token Tracker — Loading...".to_string());
        }
        let today_start = local_today_start();
        let today_stats = compute_stats(&st.entries, Some(today_start), None, None, false);
        let icon = create_tray_icon(today_stats.total_tokens);
        let tip = format!("Today: {} tokens", format_token_count(today_stats.total_tokens));
        (icon, tip)
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn set_tray_nid_tip(nid: &mut NOTIFYICONDATAW, tip: &str) {
    nid.szTip.fill(0);
    let wide: Vec<u16> = tip.encode_utf16().collect();
    let max_len = nid.szTip.len() - 1;
    let count = wide.len().min(max_len);
    nid.szTip[..count].copy_from_slice(&wide[..count]);
}

unsafe fn update_tray_icon(hwnd: HWND, app: &TokenTrackerApp, add: bool) {
    let (hicon, tip) = app.current_icon_and_tip();
    let mut nid: NOTIFYICONDATAW = std::mem::zeroed();
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = 1;
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    nid.uCallbackMessage = WM_TRAY_CALLBACK;
    nid.hIcon = hicon;
    set_tray_nid_tip(&mut nid, &tip);

    Shell_NotifyIconW(if add { NIM_ADD } else { NIM_MODIFY }, &nid);

    let mut old_guard = TRAY_HICON.lock().unwrap();
    let old_icon = *old_guard as HICON;
    *old_guard = hicon as usize;
    if !old_icon.is_null() {
        DestroyIcon(old_icon);
    }
}

unsafe fn show_tray_context_menu(hwnd: HWND, app: &Arc<TokenTrackerApp>) {
    let hmenu = CreatePopupMenu();
    let items: &[(usize, &str)] = &[
        (CMD_SHOW_STATS, "📊 Show Stats"),
        (CMD_REFRESH_NOW, "🔄 Refresh Now"),
    ];
    for &(id, lbl) in items {
        let w = to_wide(lbl);
        AppendMenuW(hmenu, MF_STRING, id, w.as_ptr());
    }
    AppendMenuW(hmenu, MF_SEPARATOR, 0, std::ptr::null());
    let w_imp = to_wide("📥 Import Cursor CSV...");
    AppendMenuW(hmenu, MF_STRING, CMD_IMPORT_CSV, w_imp.as_ptr());
    let w_open = to_wide("📂 Open Data Folder");
    AppendMenuW(hmenu, MF_STRING, CMD_OPEN_FOLDER, w_open.as_ptr());
    AppendMenuW(hmenu, MF_SEPARATOR, 0, std::ptr::null());

    {
        let st = app.state.lock().unwrap();
        for provider in &st.providers {
            let count = st.sources.iter().filter(|s| &s.provider == provider).count();
            let mut title = provider.clone();
            if let Some(first) = title.get_mut(0..1) {
                first.make_ascii_uppercase();
            }
            let lbl = format!("{title}: {count} source(s)");
            let w = to_wide(&lbl);
            AppendMenuW(hmenu, MF_STRING | MF_GRAYED, 0, w.as_ptr());
        }
    }

    AppendMenuW(hmenu, MF_SEPARATOR, 0, std::ptr::null());
    let w_exit = to_wide("❌ Exit");
    AppendMenuW(hmenu, MF_STRING, CMD_EXIT, w_exit.as_ptr());

    let mut pt = POINT { x: 0, y: 0 };
    GetCursorPos(&mut pt);
    SetForegroundWindow(hwnd);
    let cmd = TrackPopupMenu(
        hmenu,
        TPM_LEFTALIGN | TPM_BOTTOMALIGN | TPM_RETURNCMD,
        pt.x,
        pt.y,
        0,
        hwnd,
        std::ptr::null(),
    );
    DestroyMenu(hmenu);

    match cmd as usize {
        CMD_SHOW_STATS => show_popup(app.build_popup_data()),
        CMD_REFRESH_NOW => {
            let app_c = app.clone();
            let hwnd_val = hwnd as usize;
            std::thread::spawn(move || {
                app_c.refresh_data();
                PostMessageW(hwnd_val as HWND, WM_TRAY_REFRESH_UI, 0, 0);
            });
        }
        CMD_IMPORT_CSV => {
            let mut file_buf = [0u16; 1024];
            let filter = to_wide("CSV files (*.csv)\0*.csv\0All files (*.*)\0*.*\0\0");
            let title = to_wide("Import Cursor Usage CSV");
            let mut ofn: OPENFILENAMEW = std::mem::zeroed();
            ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
            ofn.hwndOwner = hwnd;
            ofn.lpstrFilter = filter.as_ptr();
            ofn.lpstrFile = file_buf.as_mut_ptr();
            ofn.nMaxFile = file_buf.len() as u32;
            ofn.lpstrTitle = title.as_ptr();
            if GetOpenFileNameW(&mut ofn) != 0 {
                let len = file_buf.iter().position(|&c| c == 0).unwrap_or(0);
                let path_str = String::from_utf16_lossy(&file_buf[..len]);
                let csv_entries = parse_csv_file(Path::new(&path_str), "");
                {
                    let mut st = app.state.lock().unwrap();
                    let old = std::mem::take(&mut st.entries);
                    st.entries = merge_csv_over_local(old, csv_entries, 60);
                }
                app.save_cache();
                update_tray_icon(hwnd, app, false);
                log_info!("token_tracker", "Imported CSV: {}", path_str);
            }
        }
        CMD_OPEN_FOLDER => {
            let folder = {
                let st = app.state.lock().unwrap();
                st.data_dir.to_string_lossy().to_string()
            };
            let op = to_wide("open");
            let w_folder = to_wide(&folder);
            ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                w_folder.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            );
        }
        CMD_EXIT => {
            log_info!("token_tracker", "Exiting Token Tracker...");
            app.stop_flag.store(true, Ordering::Relaxed);
            close_popup();
            DestroyWindow(hwnd);
        }
        _ => {}
    }
}

unsafe extern "system" fn tray_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_TRAY_CALLBACK => {
            let event = (lparam & 0xFFFF) as u32;
            let app_opt = TRAY_APP_PTR.lock().ok().and_then(|g| g.clone());
            if let Some(app) = app_opt {
                if event == WM_LBUTTONUP {
                    show_popup(app.build_popup_data());
                } else if event == WM_RBUTTONUP {
                    show_tray_context_menu(hwnd, &app);
                }
            }
            0
        }
        WM_TRAY_SHOW_POPUP => {
            let app_opt = TRAY_APP_PTR.lock().ok().and_then(|g| g.clone());
            if let Some(app) = app_opt {
                show_popup(app.build_popup_data());
            }
            0
        }
        WM_TRAY_REFRESH_UI => {
            let app_opt = TRAY_APP_PTR.lock().ok().and_then(|g| g.clone());
            if let Some(app) = app_opt {
                update_tray_icon(hwnd, &app, false);
            }
            0
        }
        WM_DESTROY => {
            let mut nid: NOTIFYICONDATAW = std::mem::zeroed();
            nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
            nid.hWnd = hwnd;
            nid.uID = 1;
            Shell_NotifyIconW(NIM_DELETE, &nid);
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn run_tray_loop(app: Arc<TokenTrackerApp>) {
    *TRAY_APP_PTR.lock().unwrap() = Some(app.clone());
    unsafe {
        let hinstance = GetModuleHandleW(std::ptr::null());
        let class_name = to_wide("LLMTokenTrackerTrayClass");
        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(tray_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null(),
        );
        *TRAY_HWND.lock().unwrap() = hwnd as usize;
        update_tray_icon(hwnd, &app, true);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
