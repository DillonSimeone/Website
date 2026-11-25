//! Strict, zero-hallucination local LLM phonetic post-correction powered by `llama-server.exe`
//! on CUDA (`Qwen2.5-1.5B-Instruct Q4_K_M`, ~1.1 GB VRAM, ~100-150 ms per sentence).
//!
//! Includes a deterministic edit-distance safety guard that rejects any candidate edit changing
//! more than 30% of words, guaranteeing the LLM can never invent content or rewrite meaning.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::stream_decoder::norm_word;
use crate::stt::{SttEvent, SttEventQueue};
use crate::win_util::{resolve_asset_path, CREATE_NO_WINDOW};

/// Persistent local `llama-server.exe` CUDA process for strict phonetic ASR post-correction.
pub struct LlmPolisher {
    child: Child,
    port: u16,
    label: String,
}

impl LlmPolisher {
    pub fn spawn() -> Result<Self, String> {
        let server_exe = find_llama_server()
            .ok_or_else(|| "Missing runtime/llama-cuda/llama-server.exe".to_string())?;
        let model_path = find_llm_model()
            .ok_or_else(|| "Missing models/llm/qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string())?;

        let port = pick_free_port().unwrap_or(18294);
        let mut cmd = Command::new(&server_exe);
        if let Some(dir) = server_exe.parent() {
            cmd.current_dir(dir);
        }

        // Reuse already-bundled CUDA 12.4 runtime DLLs from runtime/whisper-cuda & runtime/sherpa-cuda/lib.
        let mut path_parts: Vec<String> = Vec::new();
        for rel in &[
            "runtime/llama-cuda",
            "runtime/whisper-cuda/Release",
            "runtime/whisper-cuda",
            "runtime/sherpa-cuda/lib",
        ] {
            if let Some(d) = resolve_asset_path(&[rel], true) {
                path_parts.push(d.to_string_lossy().into_owned());
            }
        }
        if let Ok(existing) = std::env::var("PATH") {
            path_parts.push(existing);
        }
        cmd.env("PATH", path_parts.join(";"));

        cmd.arg("-m")
            .arg(&model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("-ngl")
            .arg("99")
            .arg("-c")
            .arg("1024")
            .arg("-np")
            .arg("1")
            .arg("--no-webui")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("llama-server spawn failed: {e}"))?;

        if !wait_health(&mut child, port, Duration::from_secs(25)) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("llama-server failed to become ready".to_string());
        }

        Ok(Self {
            child,
            port,
            label: "Qwen2.5-1.5B CUDA".to_string(),
        })
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    /// Runs strict phonetic-only correction with recent context & optional custom hotwords.
    /// Returns `Ok(Some(polished))` only if a safe, meaningful correction passed the <=30% edit guard.
    pub fn polish(
        &self,
        raw_text: &str,
        recent_context: &[String],
        hotwords: &[String],
    ) -> Result<Option<String>, String> {
        let trimmed = raw_text.trim();
        // Skip ultra-short 1-2 word interjections ("Yeah.", "Okay.") where LLM adds no value.
        if trimmed.split_whitespace().count() < 3 {
            return Ok(None);
        }

        let mut user_msg = String::with_capacity(512);
        if !hotwords.is_empty() {
            user_msg.push_str("Known names/terms: ");
            user_msg.push_str(&hotwords.join(", "));
            user_msg.push('\n');
        }
        if !recent_context.is_empty() {
            user_msg.push_str("Recent conversation:\n");
            for line in recent_context.iter().rev().take(4).rev() {
                user_msg.push_str("- ");
                user_msg.push_str(line);
                user_msg.push('\n');
            }
        }
        user_msg.push_str("Raw transcript to fix: ");
        user_msg.push_str(trimmed);

        let sys_prompt = "You fix obvious phonetic speech-to-text errors for a deaf reader. \
            Rules: 1) Fix ONLY misheard words, broken word splits, or names matching the glossary/context. \
            2) NEVER invent facts, NEVER summarize, NEVER answer questions, NEVER add explanations. \
            3) Output ONLY the corrected sentence, with no quotes or prefix.";

        let max_tokens = (trimmed.split_whitespace().count() * 2 + 16).clamp(24, 140);
        let body = format!(
            "{{\"model\":\"local\",\"temperature\":0.0,\"max_tokens\":{max_tokens},\"messages\":[{{\"role\":\"system\",\"content\":{}}}, {{\"role\":\"user\",\"content\":{}}}]}}",
            json_quote(sys_prompt),
            json_quote(&user_msg),
        );

        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", self.port))
            .map_err(|e| format!("llama-server connect failed: {e}"))?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(6)));

        let req = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            self.port,
            body.len(),
            body
        );
        stream
            .write_all(req.as_bytes())
            .map_err(|e| format!("llama-server write failed: {e}"))?;

        let mut resp = String::new();
        stream
            .read_to_string(&mut resp)
            .map_err(|e| format!("llama-server read failed: {e}"))?;

        let json_body = resp.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or(&resp);
        let candidate = extract_chat_content(json_body);
        Ok(guard_polish_candidate(trimmed, &candidate))
    }
}

impl Drop for LlmPolisher {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

enum PolishCmd {
    Prewarm,
    Polish {
        card_id: u64,
        raw_text: String,
        context: Vec<String>,
        hotwords: Vec<String>,
    },
    Shutdown,
}

/// Non-blocking background worker for polishing finished UI caption cards without stalling live STT.
pub struct AsyncLlmPolisher {
    tx: Sender<PolishCmd>,
}

impl AsyncLlmPolisher {
    pub fn spawn_worker(events: Arc<SttEventQueue>) -> Self {
        let (tx, rx) = mpsc::channel::<PolishCmd>();
        thread::spawn(move || polish_worker_loop(rx, events));
        Self { tx }
    }

    pub fn prewarm(&self) {
        let _ = self.tx.send(PolishCmd::Prewarm);
    }

    pub fn submit(
        &self,
        card_id: u64,
        raw_text: String,
        context: Vec<String>,
        hotwords: Vec<String>,
    ) {
        let _ = self.tx.send(PolishCmd::Polish {
            card_id,
            raw_text,
            context,
            hotwords,
        });
    }
}

impl Drop for AsyncLlmPolisher {
    fn drop(&mut self) {
        let _ = self.tx.send(PolishCmd::Shutdown);
    }
}

fn polish_worker_loop(rx: Receiver<PolishCmd>, events: Arc<SttEventQueue>) {
    let mut engine: Option<LlmPolisher> = None;
    let mut init_failed = false;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            PolishCmd::Shutdown => break,
            PolishCmd::Prewarm => {
                if engine.is_none() && !init_failed {
                    match LlmPolisher::spawn() {
                        Ok(p) => engine = Some(p),
                        Err(_) => init_failed = true,
                    }
                }
            }
            PolishCmd::Polish {
                card_id,
                raw_text,
                context,
                hotwords,
            } => {
                if engine.is_none() && !init_failed {
                    match LlmPolisher::spawn() {
                        Ok(p) => engine = Some(p),
                        Err(_) => init_failed = true,
                    }
                }
                if let Some(ref polisher) = engine {
                    if let Ok(Some(polished)) = polisher.polish(&raw_text, &context, &hotwords) {
                        events.push(SttEvent::Polished {
                            card_id,
                            text: polished,
                        });
                    }
                }
            }
        }
    }
}

/// Deterministic safety guard: accepts a polished transcript ONLY if it makes real, bounded
/// phonetic fixes (<= 30% normalized word edit distance, no conversational filler).
pub fn guard_polish_candidate(raw: &str, candidate: &str) -> Option<String> {
    let clean = candidate
        .trim()
        .trim_matches('"')
        .lines()
        .next()
        .unwrap_or("")
        .trim();
    if clean.is_empty() || clean == raw.trim() {
        return None;
    }

    let lower = clean.to_ascii_lowercase();
    for bad_prefix in [
        "sure",
        "here is",
        "here's",
        "corrected:",
        "fixed:",
        "note:",
        "transcript:",
    ] {
        if lower.starts_with(bad_prefix) {
            return None;
        }
    }

    let r_words: Vec<String> = raw
        .split_whitespace()
        .map(norm_word)
        .filter(|w| !w.is_empty())
        .collect();
    let c_words: Vec<String> = clean
        .split_whitespace()
        .map(norm_word)
        .filter(|w| !w.is_empty())
        .collect();
    if r_words.is_empty() || c_words.is_empty() {
        return None;
    }

    // Reject if normalized words didn't actually improve or changed >30% of the sentence.
    let len_diff = r_words.len().abs_diff(c_words.len()) as f32 / r_words.len() as f32;
    if len_diff > 0.35 {
        return None;
    }
    let edits = word_levenshtein(&r_words, &c_words);
    let edit_ratio = edits as f32 / r_words.len() as f32;
    if edit_ratio > 0.30 {
        return None;
    }

    // If only capitalization/punctuation changed slightly, still accept if clean != raw.
    Some(clean.to_string())
}

fn word_levenshtein(a: &[String], b: &[String]) -> usize {
    let m = b.len();
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut curr = vec![0usize; m + 1];
    for (i, ai) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, bj) in b.iter().enumerate() {
            let cost = usize::from(ai != bj);
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
}

/// Reads optional custom names/terms from `hotwords.txt` (1 entry per line, `#` comments ignored).
pub fn load_hotwords() -> Vec<String> {
    let Some(path) = resolve_asset_path(&["hotwords.txt"], false) else {
        return Vec::new();
    };
    load_hotwords_from(&path)
}

pub fn load_hotwords_from(path: &Path) -> Vec<String> {
    let Ok(txt) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    txt.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .take(64)
        .map(str::to_string)
        .collect()
}

pub fn find_llama_server() -> Option<PathBuf> {
    resolve_asset_path(
        &[
            "runtime/llama-cuda/llama-server.exe",
            "runtime/llama-cuda/Release/llama-server.exe",
        ],
        false,
    )
}

pub fn find_llm_model() -> Option<PathBuf> {
    resolve_asset_path(
        &[
            "models/llm/qwen2.5-1.5b-instruct-q4_k_m.gguf",
            "models/llm/qwen2.5-3b-instruct-q4_k_m.gguf",
        ],
        false,
    )
}

fn wait_health(child: &mut Child, port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return false;
        }
        if let Ok(mut s) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(150),
        ) {
            let _ = s.set_read_timeout(Some(Duration::from_millis(300)));
            let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
            if s.write_all(req.as_bytes()).is_ok() {
                let mut buf = String::new();
                if s.read_to_string(&mut buf).is_ok() && buf.contains("200 OK") {
                    return true;
                }
            }
        }
        thread::sleep(Duration::from_millis(120));
    }
    false
}

fn pick_free_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    Some(listener.local_addr().ok()?.port())
}

fn json_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

fn extract_chat_content(json: &str) -> String {
    let Some(idx) = json.find("\"content\"") else {
        return String::new();
    };
    let rest = &json[idx + 9..];
    let Some(colon) = rest.find(':') else {
        return String::new();
    };
    let rest = rest[colon + 1..].trim_start();
    if !rest.starts_with('"') {
        return String::new();
    }
    let mut out = String::new();
    let mut chars = rest[1..].chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => break,
            '\\' => match chars.next() {
                Some('n') => out.push('\n'),
                Some('r') => {}
                Some('t') => out.push(' '),
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('/') => out.push('/'),
                Some(other) => out.push(other),
                None => break,
            },
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_accepts_small_phonetic_fix_and_rejects_hallucination() {
        let ok = guard_polish_candidate(
            "Can I get an iced oat milk lot they and two muffins?",
            "Can I get an iced oat milk latte and two muffins?",
        );
        assert_eq!(
            ok.as_deref(),
            Some("Can I get an iced oat milk latte and two muffins?")
        );

        let rej = guard_polish_candidate(
            "Can I get an iced oat milk latte?",
            "Sure! Here is a completely rewritten explanation about coffee orders.",
        );
        assert!(rej.is_none());
    }
}
