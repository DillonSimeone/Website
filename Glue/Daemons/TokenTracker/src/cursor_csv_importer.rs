use crate::data_sources::strip_unc_prefix;
use crate::{log_info, log_warn};
use crate::models::{make_entry_id, parse_datetime_flexible, TokenEntry};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const CSV_SOURCE_ID: &str = "csv-import";
pub const CSV_PROVIDER: &str = "cursor";

const TIMESTAMP_COLS: &[&str] = &["date", "timestamp", "time", "created_at", "event_time"];
const MODEL_COLS: &[&str] = &["model", "model_name", "modelName"];
const INPUT_COLS: &[&str] = &[
    "input_tokens",
    "inputTokens",
    "input tokens",
    "prompt_tokens",
    "promptTokens",
];
const OUTPUT_COLS: &[&str] = &[
    "output_tokens",
    "outputTokens",
    "output tokens",
    "completion_tokens",
    "completionTokens",
];
const CACHE_COLS: &[&str] = &[
    "cache_read_tokens",
    "cacheReadTokens",
    "cached_tokens",
    "cache_write_tokens",
    "cacheWriteTokens",
];
const THINKING_COLS: &[&str] = &["thinking_tokens", "thinkingTokens"];

fn find_col_index(headers: &csv::StringRecord, candidates: &[&str]) -> Option<usize> {
    let mut map: HashMap<String, usize> = HashMap::new();
    for (idx, h) in headers.iter().enumerate() {
        let cleaned = h.trim().trim_start_matches('\u{feff}').to_lowercase();
        map.entry(cleaned).or_insert(idx);
    }
    for cand in candidates {
        if let Some(&idx) = map.get(&cand.to_lowercase()) {
            return Some(idx);
        }
    }
    None
}

fn parse_int(val: Option<&str>) -> u64 {
    let Some(s) = val else {
        return 0;
    };
    let cleaned = s.trim().replace(',', "");
    if cleaned.is_empty() {
        return 0;
    }
    if let Ok(v) = cleaned.parse::<u64>() {
        return v;
    }
    if let Ok(f) = cleaned.parse::<f64>() {
        return f.max(0.0) as u64;
    }
    0
}

pub fn parse_csv_file(csv_path: &Path, account_key: &str) -> Vec<TokenEntry> {
    let mut entries = Vec::new();
    if !csv_path.is_file() {
        return entries;
    }

    let mut reader = match csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(csv_path)
    {
        Ok(r) => r,
        Err(e) => {
            log_warn!("cursor_csv_importer", "Could not read CSV {}: {}", csv_path.display(), e);
            return entries;
        }
    };

    let Ok(headers) = reader.headers().cloned() else {
        return entries;
    };

    // Resolve column indices once per file (fixes per-row lookup overhead)
    let ts_idx = find_col_index(&headers, TIMESTAMP_COLS);
    let model_idx = find_col_index(&headers, MODEL_COLS);
    let input_idx = find_col_index(&headers, INPUT_COLS);
    let output_idx = find_col_index(&headers, OUTPUT_COLS);
    let cache_idx = find_col_index(&headers, CACHE_COLS);
    let thinking_idx = find_col_index(&headers, THINKING_COLS);

    let stem = csv_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "csv".to_string());

    for (row_idx, result) in reader.records().enumerate() {
        let Ok(record) = result else {
            continue;
        };
        let Some(ts_str) = ts_idx.and_then(|i| record.get(i)) else {
            continue;
        };
        let Some(timestamp) = parse_datetime_flexible(ts_str) else {
            continue;
        };

        let prompt = parse_int(input_idx.and_then(|i| record.get(i)));
        let output = parse_int(output_idx.and_then(|i| record.get(i)));
        let cached = parse_int(cache_idx.and_then(|i| record.get(i)));
        let thinking = parse_int(thinking_idx.and_then(|i| record.get(i)));
        let model = model_idx
            .and_then(|i| record.get(i))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("unknown")
            .to_string();

        if prompt == 0 && output == 0 {
            continue;
        }

        let conv_id = format!("csv:{stem}:{row_idx}");
        let entry_id = make_entry_id(
            CSV_PROVIDER,
            CSV_SOURCE_ID,
            &conv_id,
            timestamp,
            prompt,
            output,
        );

        entries.push(TokenEntry {
            timestamp,
            model,
            prompt_tokens: prompt,
            output_tokens: output,
            thinking_tokens: thinking,
            cached_tokens: cached,
            conversation_id: conv_id,
            provider: CSV_PROVIDER.to_string(),
            source_id: CSV_SOURCE_ID.to_string(),
            account_key: account_key.to_string(),
            entry_id,
        });
    }

    log_info!(
        "cursor_csv_importer",
        "Imported {} entries from {}",
        entries.len(),
        csv_path.file_name().unwrap_or_default().to_string_lossy()
    );
    entries
}

pub fn scan_csv_directory(csv_dir: &Path, account_key: &str) -> Vec<TokenEntry> {
    if !csv_dir.is_dir() {
        return Vec::new();
    }

    let mut files: Vec<PathBuf> = Vec::new();
    if let Ok(read_dir) = fs::read_dir(csv_dir) {
        for entry in read_dir.flatten() {
            let p = entry.path();
            if p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("csv"))
                    .unwrap_or(false)
            {
                files.push(p);
            }
        }
    }
    files.sort();

    let mut seen_files: HashSet<String> = HashSet::new();
    let mut all_entries = Vec::new();
    for csv_path in files {
        let key = fs::canonicalize(&csv_path)
            .map(|p| strip_unc_prefix(&p).to_string_lossy().to_lowercase())
            .unwrap_or_else(|_| csv_path.to_string_lossy().to_lowercase());
        if seen_files.insert(key) {
            all_entries.extend(parse_csv_file(&csv_path, account_key));
        }
    }

    all_entries.sort_unstable_by_key(|e| e.timestamp);
    all_entries
}

pub fn merge_csv_over_local(
    local_entries: Vec<TokenEntry>,
    csv_entries: Vec<TokenEntry>,
    window_seconds: i64,
) -> Vec<TokenEntry> {
    if csv_entries.is_empty() {
        return local_entries;
    }

    let csv_cursor: Vec<TokenEntry> = csv_entries
        .into_iter()
        .filter(|e| e.source_id == CSV_SOURCE_ID)
        .collect();
    if csv_cursor.is_empty() {
        return local_entries;
    }

    // Index CSV timestamps by model for O(log N) or fast lookup
    let mut csv_by_model: HashMap<&str, Vec<i64>> = HashMap::new();
    for csv_e in &csv_cursor {
        csv_by_model
            .entry(csv_e.model.as_str())
            .or_default()
            .push(csv_e.timestamp.timestamp());
    }

    let mut by_id: HashMap<String, TokenEntry> = HashMap::with_capacity(local_entries.len() + csv_cursor.len());
    for local in local_entries {
        if local.provider == "cursor" && local.source_id != CSV_SOURCE_ID {
            if let Some(times) = csv_by_model.get(local.model.as_str()) {
                let local_ts = local.timestamp.timestamp();
                if times.iter().any(|&t| (local_ts - t).abs() <= window_seconds) {
                    continue;
                }
            }
        }
        by_id.insert(local.entry_id.clone(), local);
    }

    for csv_e in csv_cursor {
        by_id.insert(csv_e.entry_id.clone(), csv_e);
    }

    let mut result: Vec<TokenEntry> = by_id.into_values().collect();
    result.sort_unstable_by_key(|e| e.timestamp);
    result
}
