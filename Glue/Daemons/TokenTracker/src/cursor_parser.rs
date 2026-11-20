use crate::data_sources::{open_readonly_sqlite, DataSource};
use crate::{log_debug, log_warn};
use crate::models::{make_entry_id, parse_datetime_flexible, TokenEntry};
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;

pub const DEFAULT_CURSOR_DB_MAX_MB: u64 = 2048;

fn parse_json_value(raw: rusqlite::types::ValueRef<'_>) -> Option<Value> {
    match raw {
        rusqlite::types::ValueRef::Text(bytes) => serde_json::from_slice(bytes).ok(),
        rusqlite::types::ValueRef::Blob(bytes) => serde_json::from_slice(bytes).ok(),
        _ => None,
    }
}

fn json_u64(v: Option<&Value>) -> u64 {
    match v {
        Some(Value::Number(n)) => {
            n.as_u64()
                .or_else(|| n.as_i64().map(|i| i.max(0) as u64))
                .or_else(|| n.as_f64().map(|f| f.max(0.0) as u64))
                .unwrap_or(0)
        }
        Some(Value::String(s)) => s.parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

fn ms_to_datetime(v: Option<&Value>) -> Option<DateTime<Utc>> {
    let ms = match v? {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => s.parse::<f64>().ok()?,
        _ => return None,
    };
    let secs = (ms / 1000.0).floor() as i64;
    let nanos = (((ms / 1000.0) - (secs as f64)) * 1e9).round().max(0.0) as u32;
    DateTime::from_timestamp(secs, nanos.min(999_999_999))
}

fn load_composer_models(conn: &Connection) -> HashMap<String, String> {
    let mut models = HashMap::new();
    let Ok(mut stmt) = conn.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'") else {
        return models;
    };
    let Ok(mut rows) = stmt.query([]) else {
        return models;
    };
    while let Ok(Some(row)) = rows.next() {
        let Ok(key) = row.get::<_, String>(0) else {
            continue;
        };
        let composer_id = key.split_once(':').map(|(_, id)| id).unwrap_or("");
        let Ok(val_ref) = row.get_ref(1) else {
            continue;
        };
        let Some(data) = parse_json_value(val_ref) else {
            continue;
        };
        let model = data
            .get("lastUsedModel")
            .or_else(|| data.get("model"))
            .or_else(|| data.get("modelName"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let Some(m) = model {
            models.insert(composer_id.to_string(), m.to_string());
        }
    }
    log_debug!("cursor_parser", "Loaded {} composer models", models.len());
    models
}

fn extract_bubble_tokens(
    key: &str,
    data: &Value,
    composer_models: &HashMap<String, String>,
    source: &DataSource,
) -> Option<(TokenEntry, String)> {
    if !key.starts_with("bubbleId:") {
        return None;
    }
    let mut parts = key.splitn(4, ':');
    let _prefix = parts.next()?;
    let composer_id = parts.next()?;
    let bubble_id = parts.next()?;

    let token_count = data.get("tokenCount");
    let mut prompt = json_u64(token_count.and_then(|tc| tc.get("inputTokens")));
    let output = json_u64(token_count.and_then(|tc| tc.get("outputTokens")));

    if prompt == 0 && output == 0 {
        prompt = json_u64(
            data.get("contextWindowStatusAtCreation")
                .and_then(|ctx| ctx.get("tokensUsed")),
        );
    }

    if prompt == 0 && output == 0 {
        return None;
    }

    let timing = data.get("timingInfo");
    let timestamp = ms_to_datetime(timing.and_then(|t| t.get("clientRpcSendTime")))
        .or_else(|| ms_to_datetime(timing.and_then(|t| t.get("clientEndTime"))))
        .or_else(|| {
            data.get("createdAt")
                .and_then(|v| v.as_str())
                .and_then(parse_datetime_flexible)
        })?;

    let mut model = composer_models
        .get(composer_id)
        .cloned()
        .unwrap_or_else(|| "unknown".to_string());

    if model == "unknown" {
        if let Some(Value::Object(usage)) = data.get("usageData") {
            if let Some(first_key) = usage.keys().next() {
                model = first_key.clone();
            }
        }
    }

    let cached = json_u64(
        token_count.and_then(|tc| tc.get("cachedTokens").or_else(|| tc.get("cacheReadTokens"))),
    );
    let thinking = json_u64(token_count.and_then(|tc| tc.get("thinkingTokens")));

    let conv_bubble = format!("{composer_id}:{bubble_id}");
    let entry_id = make_entry_id(
        "cursor",
        &source.source_id,
        &conv_bubble,
        timestamp,
        prompt,
        output,
    );

    let entry = TokenEntry {
        timestamp,
        model,
        prompt_tokens: prompt,
        output_tokens: output,
        thinking_tokens: thinking,
        cached_tokens: cached,
        conversation_id: composer_id.to_string(),
        provider: "cursor".to_string(),
        source_id: source.source_id.clone(),
        account_key: source.account_key.clone(),
        entry_id,
    };

    Some((entry, conv_bubble))
}

fn file_mtime_secs(path: &std::path::Path) -> Option<f64> {
    let mut mtime = fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64());
    let wal_name = format!("{}-wal", path.file_name()?.to_string_lossy());
    let wal_path = path.with_file_name(wal_name);
    if wal_path.is_file() {
        if let Some(wm) = fs::metadata(&wal_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
        {
            mtime = Some(mtime.map_or(wm, |m| m.max(wm)));
        }
    }
    mtime
}

fn scan_state_vscdb(
    source: &DataSource,
    seen_bubble_keys: &mut HashSet<String>,
    db_max_mb: u64,
    last_db_mtime: Option<f64>,
) -> Vec<(TokenEntry, String)> {
    let mut entries = Vec::new();

    if !source.path.is_file() {
        return entries;
    }

    if let (Some(prev_m), Some(cur_m)) = (last_db_mtime, file_mtime_secs(&source.path)) {
        if (cur_m - prev_m).abs() < 1e-3 && !seen_bubble_keys.is_empty() {
            return entries;
        }
    }

    if let Ok(meta) = fs::metadata(&source.path) {
        let size_mb = meta.len() / (1024 * 1024);
        if size_mb > db_max_mb {
            log_warn!(
                "cursor_parser",
                "Cursor DB {} is {} MB (limit {} MB); scan may be slow",
                source.path.file_name().unwrap_or_default().to_string_lossy(),
                size_mb,
                db_max_mb
            );
        }
    }

    let conn = match open_readonly_sqlite(&source.path) {
        Ok(c) => c,
        Err(e) => {
            log_warn!(
                "cursor_parser",
                "Cannot open Cursor DB {}: {}",
                source.path.display(),
                e
            );
            return entries;
        }
    };

    // Fast path when we already have seen keys: scan keys only first (avoids reading 1GB+ of value blobs!)
    if !seen_bubble_keys.is_empty() {
        let mut unseen_keys = Vec::new();
        if let Ok(mut stmt) = conn.prepare("SELECT key FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'") {
            if let Ok(mut rows) = stmt.query([]) {
                while let Ok(Some(row)) = rows.next() {
                    if let Ok(key) = row.get::<_, String>(0) {
                        if !seen_bubble_keys.contains(&key) {
                            seen_bubble_keys.insert(key.clone());
                            unseen_keys.push(key);
                        }
                    }
                }
            }
        }
        if unseen_keys.is_empty() {
            return entries;
        }
        let composer_models = load_composer_models(&conn);
        if let Ok(mut val_stmt) = conn.prepare("SELECT value FROM cursorDiskKV WHERE key = ?1") {
            for key in unseen_keys {
                if let Ok(mut rows) = val_stmt.query([&key]) {
                    if let Ok(Some(row)) = rows.next() {
                        if let Ok(val_ref) = row.get_ref(0) {
                            if let Some(data) = parse_json_value(val_ref) {
                                if let Some(pair) = extract_bubble_tokens(&key, &data, &composer_models, source) {
                                    entries.push(pair);
                                }
                            }
                        }
                    }
                }
            }
        }
        entries.sort_unstable_by_key(|(e, _)| e.timestamp);
        return entries;
    }

    let composer_models = load_composer_models(&conn);

    let mut stmt = match conn.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'") {
        Ok(s) => s,
        Err(e) => {
            log_warn!(
                "cursor_parser",
                "Error reading Cursor DB {}: {}",
                source.path.file_name().unwrap_or_default().to_string_lossy(),
                e
            );
            return entries;
        }
    };

    let Ok(mut rows) = stmt.query([]) else {
        return entries;
    };

    while let Ok(Some(row)) = rows.next() {
        let Ok(key) = row.get::<_, String>(0) else {
            continue;
        };
        if seen_bubble_keys.contains(&key) {
            continue;
        }
        seen_bubble_keys.insert(key.clone());
        let Ok(val_ref) = row.get_ref(1) else {
            continue;
        };
        let Some(data) = parse_json_value(val_ref) else {
            continue;
        };
        if let Some(pair) = extract_bubble_tokens(&key, &data, &composer_models, source) {
            entries.push(pair);
        }
    }

    entries.sort_unstable_by_key(|(e, _)| e.timestamp);
    entries
}

pub fn scan_all_cursor(
    sources: &[DataSource],
    source_states: &mut HashMap<String, HashSet<String>>,
    source_mtimes: &HashMap<String, f64>,
    existing_entries: Vec<TokenEntry>,
    db_max_mb: u64,
) -> Vec<TokenEntry> {
    let mut by_source: HashMap<String, Vec<TokenEntry>> = HashMap::new();
    for entry in existing_entries {
        by_source.entry(entry.source_id.clone()).or_default().push(entry);
    }

    let mut all_entries: Vec<TokenEntry> = Vec::new();
    let mut seen_bubbles_global: HashSet<String> = HashSet::new();

    let mut global_sources: Vec<&DataSource> = Vec::new();
    let mut workspace_sources: Vec<&DataSource> = Vec::new();
    for s in sources {
        if s.provider != "cursor" || s.source_type == "chat_store" {
            continue;
        }
        if s.source_type == "global_state" {
            global_sources.push(s);
        } else {
            workspace_sources.push(s);
        }
    }

    for source in global_sources.into_iter().chain(workspace_sources.into_iter()) {
        let seen = source_states.entry(source.source_id.clone()).or_default();
        let had_seen = !seen.is_empty();
        let last_mtime = source_mtimes.get(&source.source_id).copied();

        let new_pairs = scan_state_vscdb(source, seen, db_max_mb, last_mtime);

        let mut source_entries: HashMap<String, TokenEntry> = HashMap::new();
        if had_seen {
            if let Some(prev) = by_source.remove(&source.source_id) {
                for e in prev {
                    source_entries.insert(e.entry_id.clone(), e);
                }
            }
        }
        for (entry, conv_bubble) in new_pairs {
            if source.source_type == "global_state" || !seen_bubbles_global.contains(&conv_bubble) {
                seen_bubbles_global.insert(conv_bubble);
                source_entries.insert(entry.entry_id.clone(), entry);
            }
        }

        all_entries.extend(source_entries.into_values());
    }

    let mut by_id: HashMap<String, TokenEntry> = HashMap::with_capacity(all_entries.len());
    for entry in all_entries {
        by_id.insert(entry.entry_id.clone(), entry);
    }
    let mut merged: Vec<TokenEntry> = by_id.into_values().collect();
    merged.sort_unstable_by_key(|e| e.timestamp);
    merged
}
