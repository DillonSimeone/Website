use crate::data_sources::{open_readonly_sqlite, DataSource};
use crate::log_warn;
use crate::models::{make_entry_id, TokenEntry};
use crate::proto_decoder::{
    decode_message, get_bytes, get_string, get_varint, ProtoField, WireValue,
};
use chrono::{DateTime, Duration, TimeZone, Utc};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

fn source_priority(source: &DataSource) -> u8 {
    let parent_name = source
        .path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("");
    match parent_name {
        "antigravity-ide" => 0,
        "antigravity" => 1,
        "antigravity-backup" => 2,
        _ => 99,
    }
}

fn extract_timestamp_from_step(step_metadata: &[u8]) -> Option<DateTime<Utc>> {
    if step_metadata.is_empty() {
        return None;
    }
    let msg = decode_message(step_metadata);
    let ts_bytes = get_bytes(&msg, 1)?;
    let ts_fields = decode_message(ts_bytes);
    let seconds = get_varint(&ts_fields, 1)?;
    if seconds == 0 {
        return None;
    }
    let nanos = get_varint(&ts_fields, 2).unwrap_or(0);
    DateTime::from_timestamp(seconds as i64, nanos as u32)
}

struct ParsedGenMeta {
    model: String,
    prompt_tokens: u64,
    output_tokens: u64,
    thinking_tokens: u64,
    cached_tokens: u64,
}

fn extract_gen_metadata(data_blob: &[u8]) -> Option<ParsedGenMeta> {
    let root = decode_message(data_blob);
    let f1_bytes = get_bytes(&root, 1)?;
    let f1 = decode_message(f1_bytes);
    if f1.is_empty() {
        return None;
    }
    let f4_bytes = get_bytes(&f1, 4)?;
    let f4 = decode_message(f4_bytes);
    if f4.is_empty() {
        return None;
    }

    let uncached_prompt = get_varint(&f4, 2).unwrap_or(0);
    let cached_tokens = get_varint(&f4, 5).unwrap_or(0);
    let mut output_tokens = get_varint(&f4, 3).unwrap_or(0);
    let thinking_tokens = get_varint(&f4, 9).unwrap_or(0);
    let text_tokens = get_varint(&f4, 10).unwrap_or(0);
    let model = get_string(&f1, 19).unwrap_or("unknown").to_string();

    if output_tokens == 0 {
        output_tokens = thinking_tokens + text_tokens;
    }

    let mut prompt_tokens = uncached_prompt + cached_tokens;
    if prompt_tokens == 0 {
        prompt_tokens = text_tokens;
    }

    if prompt_tokens == 0 && output_tokens == 0 {
        return None;
    }

    Some(ParsedGenMeta {
        model,
        prompt_tokens,
        output_tokens,
        thinking_tokens,
        cached_tokens,
    })
}

fn extract_last_step_index(data_blob: &[u8]) -> Option<i64> {
    let root = decode_message(data_blob);
    let f1_bytes = get_bytes(&root, 1)?;
    let f1 = decode_message(f1_bytes);
    for field in f1 {
        if field.field_number == 20 {
            if let WireValue::Bytes(val) = field.value {
                let f20 = decode_message(val);
                let mut key: Option<&str> = None;
                let mut value_str: Option<String> = None;
                for sub in f20 {
                    if sub.field_number == 1 {
                        if let WireValue::Bytes(b) = sub.value {
                            key = std::str::from_utf8(b).ok();
                        }
                    } else if sub.field_number == 2 {
                        match sub.value {
                            WireValue::Bytes(b) => {
                                value_str = Some(String::from_utf8_lossy(b).to_string());
                            }
                            WireValue::Varint(v) => {
                                value_str = Some(v.to_string());
                            }
                            _ => {}
                        }
                    }
                }
                if key == Some("last_step_index") {
                    if let Some(vs) = value_str {
                        if let Ok(parsed) = vs.parse::<i64>() {
                            return Some(parsed);
                        }
                    }
                }
            }
        }
    }
    None
}

fn resolve_timestamp(idx: i64, step_timestamps: &HashMap<i64, DateTime<Utc>>) -> DateTime<Utc> {
    for offset in [0i64, 1, -1, 2, -2] {
        if let Some(ts) = step_timestamps.get(&(idx + offset)) {
            return *ts;
        }
    }
    Utc.timestamp_opt(0, 0).unwrap()
}

fn stamp_entry(mut entry: TokenEntry, source: &DataSource, gen_idx: i64) -> TokenEntry {
    entry.provider = "antigravity".to_string();
    entry.source_id = source.source_id.clone();
    entry.account_key = source.account_key.clone();
    let conv_idx = format!("{}:{gen_idx}", entry.conversation_id);
    entry.entry_id = make_entry_id(
        "antigravity",
        &source.source_id,
        &conv_idx,
        entry.timestamp,
        entry.prompt_tokens,
        entry.output_tokens,
    );
    entry
}

fn parse_db_file(db_path: &Path, source: &DataSource) -> Vec<TokenEntry> {
    let conversation_id = db_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut entries = Vec::new();

    let conn = match open_readonly_sqlite(db_path) {
        Ok(c) => c,
        Err(e) => {
            log_warn!(
                "antigravity_parser",
                "Cannot open {}: {}",
                db_path.file_name().unwrap_or_default().to_string_lossy(),
                e
            );
            return entries;
        }
    };

    let mut step_timestamps: HashMap<i64, DateTime<Utc>> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT rowid, metadata FROM steps") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let rowid: i64 = row.get(0)?;
            let meta: Option<Vec<u8>> = row.get(1)?;
            Ok((rowid, meta))
        }) {
            for row in rows.flatten() {
                if let (rowid, Some(meta)) = row {
                    if let Some(ts) = extract_timestamp_from_step(&meta) {
                        step_timestamps.insert(rowid, ts);
                    }
                }
            }
        }
    }

    let mut stmt = match conn.prepare("SELECT idx, data FROM gen_metadata") {
        Ok(s) => s,
        Err(_) => return entries,
    };

    let rows = match stmt.query_map([], |row| {
        let idx: i64 = row.get(0)?;
        let data: Option<Vec<u8>> = row.get(1)?;
        Ok((idx, data))
    }) {
        Ok(r) => r,
        Err(e) => {
            log_warn!(
                "antigravity_parser",
                "Error reading {}: {}",
                db_path.file_name().unwrap_or_default().to_string_lossy(),
                e
            );
            return entries;
        }
    };

    for row in rows.flatten() {
        let (idx, Some(data_blob)) = row else {
            continue;
        };
        let Some(parsed) = extract_gen_metadata(&data_blob) else {
            continue;
        };
        // Fix bug from Python: `0 or idx` would discard step_idx == 0
        let step_idx = extract_last_step_index(&data_blob).unwrap_or(idx);
        let timestamp = resolve_timestamp(step_idx, &step_timestamps);
        let entry = TokenEntry {
            timestamp,
            model: parsed.model,
            prompt_tokens: parsed.prompt_tokens,
            output_tokens: parsed.output_tokens,
            thinking_tokens: parsed.thinking_tokens,
            cached_tokens: parsed.cached_tokens,
            conversation_id: conversation_id.clone(),
            provider: "antigravity".to_string(),
            source_id: String::new(),
            account_key: String::new(),
            entry_id: String::new(),
        };
        entries.push(stamp_entry(entry, source, idx));
    }

    entries
}

fn is_token_message(f4: &[ProtoField<'_>]) -> bool {
    get_varint(f4, 2).unwrap_or(0) > 0
        || get_varint(f4, 3).unwrap_or(0) > 0
        || get_varint(f4, 10).unwrap_or(0) > 0
}

// Fixed recursive protobuf token scanner for .pb files
fn recursive_find_token_data(
    fields: &[ProtoField<'_>],
    results: &mut Vec<ParsedGenMeta>,
    depth: usize,
    max_depth: usize,
) {
    if depth > max_depth {
        return;
    }

    if let Some(f4_bytes) = get_bytes(fields, 4) {
        let f4 = decode_message(f4_bytes);
        if is_token_message(&f4) {
            let uncached_prompt = get_varint(&f4, 2).unwrap_or(0);
            let cached_tokens = get_varint(&f4, 5).unwrap_or(0);
            let mut output_tokens = get_varint(&f4, 3).unwrap_or(0);
            let thinking_tokens = get_varint(&f4, 9).unwrap_or(0);
            let text_tokens = get_varint(&f4, 10).unwrap_or(0);

            if output_tokens == 0 {
                output_tokens = thinking_tokens + text_tokens;
            }
            let mut prompt_tokens = uncached_prompt + cached_tokens;
            if prompt_tokens == 0 {
                prompt_tokens = text_tokens;
            }

            results.push(ParsedGenMeta {
                model: get_string(fields, 19).unwrap_or("unknown").to_string(),
                prompt_tokens,
                output_tokens,
                thinking_tokens,
                cached_tokens,
            });
            return;
        }
    }

    for field in fields {
        if let WireValue::Bytes(child_bytes) = field.value {
            if !child_bytes.is_empty() {
                let sub = decode_message(child_bytes);
                if !sub.is_empty() {
                    recursive_find_token_data(&sub, results, depth + 1, max_depth);
                }
            }
        }
    }
}

fn parse_pb_file(pb_path: &Path, source: &DataSource) -> Vec<TokenEntry> {
    let conversation_id = pb_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut entries = Vec::new();

    let raw = match fs::read(pb_path) {
        Ok(b) if !b.is_empty() => b,
        _ => return entries,
    };

    let root = decode_message(&raw);
    let mut results = Vec::new();
    recursive_find_token_data(&root, &mut results, 0, 20);

    let file_mtime = fs::metadata(pb_path)
        .and_then(|m| m.modified())
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(|_| Utc.timestamp_opt(0, 0).unwrap());

    for (i, r) in results.into_iter().enumerate() {
        let entry = TokenEntry {
            timestamp: file_mtime,
            model: r.model,
            prompt_tokens: r.prompt_tokens,
            output_tokens: r.output_tokens,
            thinking_tokens: r.thinking_tokens,
            cached_tokens: r.cached_tokens,
            conversation_id: conversation_id.clone(),
            provider: "antigravity".to_string(),
            source_id: String::new(),
            account_key: String::new(),
            entry_id: String::new(),
        };
        entries.push(stamp_entry(entry, source, i as i64));
    }

    entries
}

fn file_mtime_utc(path: &Path) -> DateTime<Utc> {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(|_| Utc::now())
}

pub fn scan_source(
    source: &DataSource,
    last_scan_time: Option<DateTime<Utc>>,
    source_existing: Vec<TokenEntry>,
    exclude_conversation_ids: &HashSet<String>,
) -> Vec<TokenEntry> {
    let base = &source.path;
    if !base.is_dir() {
        return Vec::new();
    }

    let mut db_files: Vec<PathBuf> = Vec::new();
    let mut pb_files: Vec<PathBuf> = Vec::new();

    if let Ok(read_dir) = fs::read_dir(base) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if exclude_conversation_ids.contains(stem) {
                continue;
            }
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("db") {
                    db_files.push(path);
                } else if ext.eq_ignore_ascii_case("pb") {
                    pb_files.push(path);
                }
            }
        }
    }
    db_files.sort();
    pb_files.sort();

    let cutoff = last_scan_time.map(|t| t - Duration::seconds(10));
    let has_existing = !source_existing.is_empty();

    let db_to_scan: Vec<PathBuf> = db_files
        .into_iter()
        .filter(|db_file| {
            if cutoff.is_none() || !has_existing {
                return true;
            }
            let mut mtime = file_mtime_utc(db_file);
            let wal_name = format!("{}-wal", db_file.file_name().unwrap_or_default().to_string_lossy());
            let wal_file = db_file.with_file_name(wal_name);
            if wal_file.is_file() {
                let wal_mtime = file_mtime_utc(&wal_file);
                if wal_mtime > mtime {
                    mtime = wal_mtime;
                }
            }
            mtime > cutoff.unwrap()
        })
        .collect();

    let pb_to_scan: Vec<PathBuf> = pb_files
        .into_iter()
        .filter(|pb_file| {
            if cutoff.is_none() || !has_existing {
                return true;
            }
            file_mtime_utc(pb_file) > cutoff.unwrap()
        })
        .collect();

    let mut files_to_rescan: HashSet<String> = HashSet::new();
    for p in db_to_scan.iter().chain(pb_to_scan.iter()) {
        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            files_to_rescan.insert(stem.to_string());
        }
    }

    // Parallel parse across CPU cores using rayon
    let mut all_entries: Vec<TokenEntry> = db_to_scan
        .par_iter()
        .flat_map(|db| parse_db_file(db, source))
        .collect();

    let pb_entries: Vec<TokenEntry> = pb_to_scan
        .par_iter()
        .flat_map(|pb| parse_pb_file(pb, source))
        .collect();
    all_entries.extend(pb_entries);

    // Move retained entries without cloning
    for entry in source_existing {
        if !files_to_rescan.contains(&entry.conversation_id)
            && !exclude_conversation_ids.contains(&entry.conversation_id)
        {
            all_entries.push(entry);
        }
    }

    all_entries.sort_unstable_by_key(|e| e.timestamp);
    all_entries
}

pub fn scan_all_antigravity(
    sources: &[DataSource],
    last_scan_time: Option<DateTime<Utc>>,
    existing_entries: Vec<TokenEntry>,
) -> Vec<TokenEntry> {
    let mut ag_sources: Vec<&DataSource> = sources
        .iter()
        .filter(|s| s.provider == "antigravity")
        .collect();
    ag_sources.sort_by_key(|s| source_priority(s));

    let mut by_source: HashMap<String, Vec<TokenEntry>> = HashMap::new();
    for entry in existing_entries {
        by_source.entry(entry.source_id.clone()).or_default().push(entry);
    }

    let mut seen_conversation_ids: HashSet<String> = HashSet::new();
    let mut all_entries: Vec<TokenEntry> = Vec::new();

    for source in ag_sources {
        let source_existing = by_source.remove(&source.source_id).unwrap_or_default();
        let entries = scan_source(
            source,
            last_scan_time,
            source_existing,
            &seen_conversation_ids,
        );
        all_entries.extend(entries);

        if let Ok(read_dir) = fs::read_dir(&source.path) {
            for entry in read_dir.flatten() {
                let p = entry.path();
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("db") || ext.eq_ignore_ascii_case("pb") {
                        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                            seen_conversation_ids.insert(stem.to_string());
                        }
                    }
                }
            }
        }
    }

    all_entries.sort_unstable_by_key(|e| e.timestamp);
    all_entries
}
