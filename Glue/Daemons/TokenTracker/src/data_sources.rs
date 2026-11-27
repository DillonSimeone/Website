use crate::{log_debug, log_info, log_warn};
use regex::Regex;
use rusqlite::{Connection, OpenFlags};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const ANTIGRAVITY_VARIANT_PREFIXES: &[&str] = &[
    "antigravity",
    "antigravity-ide",
    "antigravity-backup",
    "Antigravity",
    "Antigravity IDE",
];

const CURSOR_AUTH_EMAIL_KEY: &str = "cursorAuth/cachedEmail";

#[derive(Debug, Clone)]
pub struct DataSource {
    pub provider: String,
    pub source_id: String,
    pub path: PathBuf,
    pub account_key: String,
    pub source_type: String,
}

fn detect_runtime_root() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Ok(resolved) = fs::canonicalize(&exe_path) {
            let mut cur = resolved.parent().map(|p| p.to_path_buf());
            let mut depth = 0;
            while let Some(dir) = cur {
                if dir.join("index.html").is_file() {
                    return strip_unc_prefix(&dir);
                }
                if depth >= 5 {
                    break;
                }
                cur = dir.parent().map(|p| p.to_path_buf());
                depth += 1;
            }
            if let Some(p) = resolved.parent() {
                return strip_unc_prefix(p);
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn strip_unc_prefix(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        p.to_path_buf()
    }
}

pub fn expand_tilde(p: &str) -> PathBuf {
    if p == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(p));
    }
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

pub fn get_app_data_dir(data_dir: Option<&str>) -> PathBuf {
    let root = match data_dir {
        Some(d) if !d.is_empty() => expand_tilde(d),
        _ => detect_runtime_root(),
    };
    let _ = fs::create_dir_all(&root);
    root
}

pub fn get_default_cursor_csv_dir(data_dir: Option<&Path>) -> PathBuf {
    let root = match data_dir {
        Some(p) => p.to_path_buf(),
        None => get_app_data_dir(None),
    };
    let csv_dir = root.join("cursor-csv");
    let _ = fs::create_dir_all(&csv_dir);
    csv_dir
}

pub fn canonical_posix_lower(path: &Path) -> String {
    let resolved = fs::canonicalize(path)
        .map(|p| strip_unc_prefix(&p))
        .unwrap_or_else(|_| path.to_path_buf());
    resolved.to_string_lossy().replace('\\', "/").to_lowercase()
}

pub fn make_source_id(provider: &str, path: &Path) -> String {
    let key = format!("{provider}:{}", canonical_posix_lower(path));
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    let digest = hasher.finalize();
    hex::encode(digest)[..16].to_string()
}

pub fn open_readonly_sqlite(db_path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

pub fn read_vscdb_string(db_path: &Path, table: &str, key: &str) -> Option<String> {
    if !db_path.is_file() {
        return None;
    }
    let conn = match open_readonly_sqlite(db_path) {
        Ok(c) => c,
        Err(e) => {
            log_debug!("data_sources", "Could not open {}: {}", db_path.display(), e);
            return None;
        }
    };
    let query = format!("SELECT value FROM {table} WHERE key = ?1");
    let raw: rusqlite::types::Value = match conn.query_row(&query, [key], |row| row.get(0)) {
        Ok(v) => v,
        Err(_) => return None,
    };
    let text = match raw {
        rusqlite::types::Value::Text(s) => s.trim().to_string(),
        rusqlite::types::Value::Blob(b) => String::from_utf8_lossy(&b).trim().to_string(),
        rusqlite::types::Value::Null => return None,
        rusqlite::types::Value::Integer(i) => i.to_string(),
        rusqlite::types::Value::Real(r) => r.to_string(),
    };
    if text.starts_with('"') && text.ends_with('"') && text.len() >= 2 {
        if let Ok(parsed) = serde_json::from_str::<String>(&text) {
            return if parsed.is_empty() { None } else { Some(parsed) };
        }
        let trimmed = text.trim_matches('"').to_string();
        return if trimmed.is_empty() { None } else { Some(trimmed) };
    }
    if text.is_empty() { None } else { Some(text) }
}

fn has_conversation_files(conversations_dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(conversations_dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("db") || ext.eq_ignore_ascii_case("pb") {
                return true;
            }
        }
    }
    false
}

fn antigravity_account_key(variant_dir: &Path, conversations_dir: &Path) -> String {
    let email_re = Regex::new(r"[\w.+-]+@[\w.-]+\.\w+").unwrap();
    for name in &["antigravity_state.pbtxt", "user_settings.pb"] {
        let state_file = variant_dir.join(name);
        if state_file.is_file() {
            if let Ok(bytes) = fs::read(&state_file) {
                let text = String::from_utf8_lossy(&bytes);
                if let Some(m) = email_re.find(&text) {
                    return m.as_str().to_string();
                }
            }
        }
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        for app_name in &["Antigravity IDE", "Antigravity"] {
            let state_db = Path::new(&appdata)
                .join(app_name)
                .join("User")
                .join("globalStorage")
                .join("state.vscdb");
            if let Some(email) = read_vscdb_string(&state_db, "ItemTable", CURSOR_AUTH_EMAIL_KEY) {
                return email;
            }
        }
    }

    let variant_name = variant_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "antigravity".to_string());

    if let Ok(entries) = fs::read_dir(conversations_dir) {
        let mut max_mtime: Option<u64> = None;
        for entry in entries.flatten() {
            let p = entry.path();
            let is_conv = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("db") || e.eq_ignore_ascii_case("pb"))
                .unwrap_or(false);
            if is_conv {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                            let secs = dur.as_secs();
                            max_mtime = Some(max_mtime.map_or(secs, |m| m.max(secs)));
                        }
                    }
                }
            }
        }
        if let Some(m) = max_mtime {
            return format!("{variant_name}@{m}");
        }
    }

    variant_name
}

pub fn discover_antigravity_sources(extra_dirs: &[PathBuf]) -> Vec<DataSource> {
    let mut sources = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut candidates = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let gemini_root = home.join(".gemini");
        if gemini_root.is_dir() {
            if let Ok(entries) = fs::read_dir(&gemini_root) {
                let mut children: Vec<PathBuf> = entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect();
                children.sort();
                for child in children {
                    let name_lower = child
                        .file_name()
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    let matches = ANTIGRAVITY_VARIANT_PREFIXES.iter().any(|prefix| {
                        let pl = prefix.to_lowercase();
                        name_lower == pl || name_lower.starts_with(&pl)
                    });
                    if matches {
                        candidates.push(child.join("conversations"));
                    }
                }
            }
        }
    }

    for d in extra_dirs {
        candidates.push(d.clone());
    }

    for conv_dir in candidates {
        let conv_resolved = fs::canonicalize(&conv_dir)
            .map(|p| strip_unc_prefix(&p))
            .unwrap_or_else(|_| conv_dir.clone());
        let path_key = canonical_posix_lower(&conv_resolved);
        if seen_paths.contains(&path_key) {
            continue;
        }
        if !has_conversation_files(&conv_resolved) {
            continue;
        }
        seen_paths.insert(path_key);
        let variant_dir = conv_resolved.parent().unwrap_or(&conv_resolved);
        let account = antigravity_account_key(variant_dir, &conv_resolved);
        let source_id = make_source_id("antigravity", &conv_resolved);
        log_info!(
            "data_sources",
            "Discovered AntiGravity source: {} (account: {})",
            conv_resolved.display(),
            account
        );
        sources.push(DataSource {
            provider: "antigravity".to_string(),
            source_id,
            path: conv_resolved,
            account_key: account,
            source_type: "conversations".to_string(),
        });
    }

    sources
}

fn collect_store_dbs(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_store_dbs(&p, out);
        } else if p.file_name().and_then(|n| n.to_str()) == Some("store.db") {
            out.push(p);
        }
    }
}

pub fn discover_cursor_sources() -> Vec<DataSource> {
    let mut sources = Vec::new();
    let mut seen_ids = HashSet::new();

    let Ok(appdata) = std::env::var("APPDATA") else {
        log_warn!(
            "data_sources",
            "APPDATA not set; cannot discover Cursor sources on this platform"
        );
        return sources;
    };

    let cursor_user = Path::new(&appdata).join("Cursor").join("User");
    let global_db = cursor_user.join("globalStorage").join("state.vscdb");
    let mut global_email = String::new();

    if global_db.is_file() {
        global_email = read_vscdb_string(&global_db, "ItemTable", CURSOR_AUTH_EMAIL_KEY)
            .unwrap_or_default();
        let sid = make_source_id("cursor", &global_db);
        if seen_ids.insert(sid.clone()) {
            log_info!(
                "data_sources",
                "Discovered Cursor global source: {} (account: {})",
                global_db.display(),
                if global_email.is_empty() { "unknown" } else { &global_email }
            );
            sources.push(DataSource {
                provider: "cursor".to_string(),
                source_id: sid,
                path: global_db.clone(),
                account_key: global_email.clone(),
                source_type: "global_state".to_string(),
            });
        }
    }

    let workspace_root = cursor_user.join("workspaceStorage");
    if workspace_root.is_dir() {
        if let Ok(entries) = fs::read_dir(&workspace_root) {
            let mut dirs: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            dirs.sort();
            for ws_dir in dirs {
                let ws_db = ws_dir.join("state.vscdb");
                if !ws_db.is_file() {
                    continue;
                }
                let sid = make_source_id("cursor", &ws_db);
                if seen_ids.insert(sid.clone()) {
                    sources.push(DataSource {
                        provider: "cursor".to_string(),
                        source_id: sid,
                        path: ws_db,
                        account_key: global_email.clone(),
                        source_type: "workspace_state".to_string(),
                    });
                }
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let chats_root = home.join(".cursor").join("chats");
        if chats_root.is_dir() {
            let mut store_dbs = Vec::new();
            collect_store_dbs(&chats_root, &mut store_dbs);
            store_dbs.sort();
            for store_db in store_dbs {
                let sid = make_source_id("cursor", &store_db);
                if seen_ids.insert(sid.clone()) {
                    sources.push(DataSource {
                        provider: "cursor".to_string(),
                        source_id: sid,
                        path: store_db,
                        account_key: global_email.clone(),
                        source_type: "chat_store".to_string(),
                    });
                }
            }
        }
    }

    sources
}

pub fn discover_all_sources(providers: &[String], extra_antigravity_dirs: &[PathBuf]) -> Vec<DataSource> {
    let enabled: HashSet<String> = providers.iter().map(|p| p.to_lowercase()).collect();
    let mut sources = Vec::new();
    if enabled.contains("antigravity") {
        sources.extend(discover_antigravity_sources(extra_antigravity_dirs));
    }
    if enabled.contains("cursor") {
        sources.extend(discover_cursor_sources());
    }
    sources
}
