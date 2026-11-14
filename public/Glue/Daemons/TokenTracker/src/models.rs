use chrono::{DateTime, Duration, Local, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEntry {
    pub timestamp: DateTime<Utc>,
    pub model: String,
    pub prompt_tokens: u64,
    pub output_tokens: u64,
    #[serde(default)]
    pub thinking_tokens: u64,
    #[serde(default)]
    pub cached_tokens: u64,
    pub conversation_id: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub account_key: String,
    #[serde(default)]
    pub entry_id: String,
}

fn default_provider() -> String {
    "antigravity".to_string()
}

impl TokenEntry {
    pub fn ensure_entry_id(&mut self) {
        if self.entry_id.is_empty() {
            self.entry_id = make_entry_id(
                &self.provider,
                &self.source_id,
                &self.conversation_id,
                self.timestamp,
                self.prompt_tokens,
                self.output_tokens,
            );
        }
    }
}

pub fn make_entry_id(
    provider: &str,
    source_id: &str,
    conversation_id: &str,
    timestamp: DateTime<Utc>,
    prompt_tokens: u64,
    output_tokens: u64,
) -> String {
    let ts = timestamp.timestamp();
    format!("{provider}:{source_id}:{conversation_id}:{ts}:{prompt_tokens}:{output_tokens}")
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelStats {
    pub prompt: u64,
    pub output: u64,
    pub thinking: u64,
    pub cached: u64,
    pub turns: u64,
}

#[derive(Debug, Clone, Default)]
pub struct TokenStats {
    pub total_prompt: u64,
    pub total_output: u64,
    pub total_thinking: u64,
    pub total_cached: u64,
    pub total_tokens: u64,
    pub turns: u64,
    pub by_model: HashMap<String, ModelStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SourceScanState {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub account_key: String,
    #[serde(default)]
    pub last_scan_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_db_mtime: Option<f64>,
    #[serde(default)]
    pub seen_entry_ids: Vec<String>,
    #[serde(default)]
    pub seen_bubble_keys: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachePayload {
    pub version: u32,
    pub last_scan_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub sources: HashMap<String, SourceScanState>,
    #[serde(default)]
    pub entries: Vec<TokenEntry>,
}

pub fn parse_datetime_flexible(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    let normalized = s.trim().replace('Z', "+00:00");
    if let Ok(dt) = DateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S%.f%:z") {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(dt) = DateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S%:z") {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M:%S") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S") {
        return Some(Utc.from_utc_datetime(&ndt));
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d") {
        let ndt = d.and_hms_opt(0, 0, 0)?;
        return Some(Utc.from_utc_datetime(&ndt));
    }
    None
}

pub fn compute_stats(
    entries: &[TokenEntry],
    since: Option<DateTime<Utc>>,
    until: Option<DateTime<Utc>>,
    provider: Option<&str>,
    prefix_provider_in_model: bool,
) -> TokenStats {
    let mut stats = TokenStats::default();
    for entry in entries {
        if let Some(p) = provider {
            if entry.provider != p {
                continue;
            }
        }
        if let Some(s) = since {
            if entry.timestamp < s {
                continue;
            }
        }
        if let Some(u) = until {
            if entry.timestamp > u {
                continue;
            }
        }

        stats.total_prompt += entry.prompt_tokens;
        stats.total_output += entry.output_tokens;
        stats.total_thinking += entry.thinking_tokens;
        stats.total_cached += entry.cached_tokens;
        stats.turns += 1;

        let model_key = if prefix_provider_in_model {
            format!("[{}] {}", entry.provider, entry.model)
        } else {
            entry.model.clone()
        };
        let m = stats.by_model.entry(model_key).or_default();
        m.prompt += entry.prompt_tokens;
        m.output += entry.output_tokens;
        m.thinking += entry.thinking_tokens;
        m.cached += entry.cached_tokens;
        m.turns += 1;
    }
    stats.total_tokens = stats.total_prompt + stats.total_output;
    stats
}

pub fn local_today_start() -> DateTime<Utc> {
    let now = Local::now();
    let naive_midnight = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    Local
        .from_local_datetime(&naive_midnight)
        .earliest()
        .unwrap_or(now)
        .with_timezone(&Utc)
}

pub fn local_day_start(days_ago: i64) -> DateTime<Utc> {
    let now = Local::now();
    let target_date = now.date_naive() - Duration::days(days_ago);
    let naive_midnight = target_date.and_hms_opt(0, 0, 0).unwrap();
    Local
        .from_local_datetime(&naive_midnight)
        .earliest()
        .unwrap_or_else(|| now - Duration::days(days_ago))
        .with_timezone(&Utc)
}

pub fn merge_entries(entries: Vec<TokenEntry>) -> Vec<TokenEntry> {
    let mut by_id: HashMap<String, TokenEntry> = HashMap::with_capacity(entries.len());
    for mut entry in entries {
        entry.ensure_entry_id();
        by_id.insert(entry.entry_id.clone(), entry);
    }
    let mut merged: Vec<TokenEntry> = by_id.into_values().collect();
    merged.sort_unstable_by_key(|e| e.timestamp);
    merged
}
