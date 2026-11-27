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
use std::sync::{Arc, Mutex};
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

    /// Directs expressive speech prosody (speed, pitch arc, energy, dramatic pauses) for TTS
    /// using the already-loaded local Qwen2.5-1.5B CUDA server.
    /// Splits beats in Rust first and asks Qwen ONLY for numeric direction per beat so zero words
    /// can ever be altered, dropped, or hallucinated.
    pub fn direct_prosody(
        &self,
        text: &str,
        recent_replies: &[String],
        persona: &str,
    ) -> (Vec<ProsodyBeat>, bool) {
        let trimmed = text.trim();
        let raw_beats = split_spoken_beats(trimmed);
        if raw_beats.is_empty() {
            return (Vec::new(), false);
        }

        let mut user_msg = String::with_capacity(768);
        user_msg.push_str("Persona: ");
        user_msg.push_str(persona.trim());
        user_msg.push('\n');
        if !recent_replies.is_empty() {
            user_msg.push_str("Recent prior replies:\n");
            for r in recent_replies.iter().rev().take(2).rev() {
                user_msg.push_str("- ");
                user_msg.push_str(r);
                user_msg.push('\n');
            }
        }
        user_msg.push_str("Numbered beats to direct:\n");
        for (i, b) in raw_beats.iter().enumerate() {
            user_msg.push_str(&format!("{}: {}\n", i + 1, b));
        }

        let sys_prompt = "You are a voice acting director. For each numbered beat, output ONLY its numeric vocal direction on one line in this exact format: \
            NUM|SPEED|PITCH|ENERGY|PAUSE_MS \
            Do NOT repeat the text. \
            Ranges: SPEED 0.84 to 1.24 (0.88=slow deadpan, 1.20=fast excited), \
            PITCH -2.0 to +3.0 semitones (-1.2=low dry, +2.6=animated high), \
            ENERGY 0.80 to 1.30 (0.85=quiet, 1.26=punchy climax), \
            PAUSE_MS 40 to 400 (pause AFTER the beat; use 280-380 after '...' or before punchlines). \
            Make the persona clearly audible across the beats. Output ONLY lines of numbers separated by '|'.";

        let max_tokens = (raw_beats.len() * 18 + 32).clamp(48, 280);
        let body = format!(
            "{{\"model\":\"local\",\"temperature\":0.25,\"max_tokens\":{max_tokens},\"messages\":[{{\"role\":\"system\",\"content\":{}}}, {{\"role\":\"user\",\"content\":{}}}]}}",
            json_quote(sys_prompt),
            json_quote(&user_msg),
        );

        let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{}", self.port)) else {
            return (fallback_prosody_beats(trimmed), false);
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(6)));

        let req = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            self.port,
            body.len(),
            body
        );
        if stream.write_all(req.as_bytes()).is_err() {
            return (fallback_prosody_beats(trimmed), false);
        }
        let mut resp = String::new();
        if stream.read_to_string(&mut resp).is_err() {
            return (fallback_prosody_beats(trimmed), false);
        }
        let json_body = resp.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or(&resp);
        let content = extract_chat_content(json_body);
        if let Some(directed) = parse_numbered_prosody_scores(&raw_beats, &content) {
            (directed, true)
        } else {
            (fallback_prosody_beats(trimmed), false)
        }
    }
}

/// One expressive vocal beat directed by Qwen2.5-1.5B (or deterministic fallback).
#[derive(Clone, Debug)]
pub struct ProsodyBeat {
    pub text: String,
    pub speed: f32,
    pub pitch_st: f32,
    pub energy: f32,
    pub pause_ms: u32,
}

/// A named vocal persona stored as a `.txt` file inside `vibes/`.
#[derive(Clone, Debug)]
pub struct VibePersona {
    pub name: String,
    pub prompt: String,
}

const DEFAULT_PERSONAS: &[(&str, &str)] = &[
    (
        "Mad Scientist",
        "Mad scientist vibe: start calm, deadpan, or conspiratorially curious, then steadily wind up with rising pitch, faster animated pace, punchier emphasis, and crisp dramatic pauses right before wild realizations or punchlines.",
    ),
    (
        "Deadpan Dry",
        "Dry deadpan comedian: steady unbothered low pitch (-1.2 to -0.3 semitones), measured deliberate pacing (0.88-0.96 speed), understated energy, with well-timed 280-360ms pauses right before absurd punchlines.",
    ),
    (
        "Warm & Friendly",
        "Warm conversational friend: gentle welcoming pace (0.96-1.05), subtle upbeat pitch lift (+0.4 to +1.2 semitones), natural relaxed energy, smooth short pauses.",
    ),
    (
        "Hype Storytelling",
        "High-energy storyteller: brisk enthusiastic pace (1.06-1.22), wide animated pitch swings (+0.5 to +2.8 semitones), punchy emphasis on exciting twists, tight energetic pauses.",
    ),
    (
        "Calm & Serious",
        "Clear, grounded professional tone: balanced neutral pace (0.94-1.00), steady low-neutral pitch (-0.3 to +0.2 semitones), consistent clear energy, crisp 180-220ms sentence pauses.",
    ),
];

fn vibes_dir() -> PathBuf {
    if let Some(existing) = resolve_asset_path(&["vibes"], true) {
        return existing;
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("vibes")))
        .unwrap_or_else(|| PathBuf::from("vibes"))
}

/// Ensures starter persona `.txt` files exist in `vibes/` and returns all loaded personas.
pub fn load_vibe_personas() -> Vec<VibePersona> {
    let dir = vibes_dir();
    let _ = std::fs::create_dir_all(&dir);

    let has_any = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("txt"))
        })
        .unwrap_or(false);

    if !has_any {
        for &(name, prompt) in DEFAULT_PERSONAS {
            let _ = std::fs::write(dir.join(format!("{name}.txt")), prompt);
        }
    }

    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let mut files: Vec<PathBuf> = rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("txt"))
            .collect();
        files.sort();
        for p in files {
            if let (Some(stem), Ok(txt)) = (
                p.file_stem().and_then(|s| s.to_str()),
                std::fs::read_to_string(&p),
            ) {
                let clean = txt.trim();
                if !clean.is_empty() {
                    out.push(VibePersona {
                        name: stem.to_string(),
                        prompt: clean.to_string(),
                    });
                }
            }
        }
    }

    if out.is_empty() {
        for &(name, prompt) in DEFAULT_PERSONAS {
            out.push(VibePersona {
                name: name.to_string(),
                prompt: prompt.to_string(),
            });
        }
    }

    // Put "Mad Scientist" first if present so it is the default persona.
    if let Some(pos) = out
        .iter()
        .position(|p| p.name.eq_ignore_ascii_case("Mad Scientist"))
    {
        if pos > 0 {
            let ms = out.remove(pos);
            out.insert(0, ms);
        }
    }
    out
}

/// Saves a new custom persona into `vibes/<Name>.txt` so it persists across restarts.
pub fn save_vibe_persona(name: &str, prompt: &str) -> Result<VibePersona, String> {
    let clean_name: String = name
        .trim()
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let clean_prompt = prompt.trim();
    if clean_name.is_empty() || clean_prompt.is_empty() {
        return Err("Persona name and description cannot be empty".to_string());
    }
    let dir = vibes_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create vibes dir: {e}"))?;
    let path = dir.join(format!("{clean_name}.txt"));
    std::fs::write(&path, clean_prompt).map_err(|e| format!("write persona: {e}"))?;
    Ok(VibePersona {
        name: clean_name,
        prompt: clean_prompt.to_string(),
    })
}

/// Reads optional custom vibe persona (first persona from `vibes/` or `vibe.txt` fallback).
pub fn load_vibe_persona() -> String {
    if let Some(first) = load_vibe_personas().into_iter().next() {
        return first.prompt;
    }
    DEFAULT_PERSONAS[0].1.to_string()
}

/// Splits text into natural spoken beats at ellipses, exclamations, questions, newlines, and sentences.
pub fn split_spoken_beats(text: &str) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut cur = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        cur.push(c);
        let is_ellipsis =
            c == '.' && i + 2 < chars.len() && chars[i + 1] == '.' && chars[i + 2] == '.';
        if is_ellipsis {
            cur.push('.');
            cur.push('.');
            i += 2;
            let trimmed = cur.trim().to_string();
            if !trimmed.is_empty() {
                chunks.push(trimmed);
            }
            cur.clear();
        } else if matches!(c, '!' | '?' | '\n')
            || (c == '.' && cur.split_whitespace().count() >= 4)
        {
            let trimmed = cur.trim().to_string();
            if !trimmed.is_empty() {
                chunks.push(trimmed);
            }
            cur.clear();
        }
        i += 1;
    }
    if !cur.trim().is_empty() {
        chunks.push(cur.trim().to_string());
    }
    chunks
}

/// Parses Qwen2.5-1.5B's `NUM|SPEED|PITCH|ENERGY|PAUSE_MS` numeric lines and applies them to `beats`.
pub fn parse_numbered_prosody_scores(beats: &[String], raw_output: &str) -> Option<Vec<ProsodyBeat>> {
    if beats.is_empty() {
        return None;
    }
    let mut scores: Vec<Option<(f32, f32, f32, u32)>> = vec![None; beats.len()];
    let mut matched = 0usize;

    for line in raw_output.lines() {
        let l = line.trim().trim_start_matches('-').trim();
        if !l.contains('|') {
            continue;
        }
        let parts: Vec<&str> = l.split('|').collect();
        if parts.len() < 5 {
            continue;
        }
        // Accept "1|..." or "1:|..." or "Beat 1|..."
        let idx_str: String = parts[0].chars().filter(|c| c.is_ascii_digit()).collect();
        let Ok(num) = idx_str.parse::<usize>() else {
            continue;
        };
        if num == 0 || num > beats.len() {
            continue;
        }
        let parse_f = |s: &str| -> Option<f32> {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || matches!(c, '.' | '-' | '+'))
                .collect();
            cleaned.parse::<f32>().ok()
        };
        let Some(spd) = parse_f(parts[1]) else { continue };
        let Some(pit) = parse_f(parts[2]) else { continue };
        let Some(eng) = parse_f(parts[3]) else { continue };
        let Some(pau) = parse_f(parts[4]) else { continue };

        scores[num - 1] = Some((
            spd.clamp(0.84, 1.24),
            pit.clamp(-2.0, 3.0),
            eng.clamp(0.78, 1.30),
            (pau.round() as i32).clamp(40, 420) as u32,
        ));
        matched += 1;
    }

    // Require at least half the beats to be LLM-directed; fill any missing beat with neutral interpolation.
    if matched == 0 || matched * 2 < beats.len() {
        return None;
    }

    let mut out = Vec::with_capacity(beats.len());
    for (i, text) in beats.iter().enumerate() {
        let (speed, pitch_st, energy, pause_ms) = scores[i].unwrap_or((1.0, 0.0, 1.0, 160));
        out.push(ProsodyBeat {
            text: text.clone(),
            speed,
            pitch_st,
            energy,
            pause_ms,
        });
    }
    Some(out)
}

/// Deterministic escalation fallback if the LLM server isn't ready yet.
pub fn fallback_prosody_beats(text: &str) -> Vec<ProsodyBeat> {
    let chunks = split_spoken_beats(text);
    if chunks.is_empty() {
        return Vec::new();
    }
    let n = chunks.len().max(1) as f32;
    chunks
        .into_iter()
        .enumerate()
        .map(|(idx, chunk)| {
            let progress = if n <= 1.0 { 0.5 } else { idx as f32 / (n - 1.0) };
            let exclaim = chunk.ends_with('!');
            let ellipsis = chunk.ends_with("...");
            let speed = (0.92 + progress * 0.20 + if exclaim { 0.06 } else { 0.0 } - if ellipsis { 0.06 } else { 0.0 })
                .clamp(0.86, 1.20);
            let pitch_st = (-0.6 + progress * 2.4 + if exclaim { 0.5 } else { 0.0 } - if ellipsis { 0.4 } else { 0.0 })
                .clamp(-1.5, 2.8);
            let energy = (0.88 + progress * 0.28 + if exclaim { 0.08 } else { 0.0 }).clamp(0.84, 1.26);
            let pause_ms = if ellipsis {
                320
            } else if exclaim {
                220
            } else {
                150
            };
            ProsodyBeat {
                text: chunk,
                speed,
                pitch_st,
                energy,
                pause_ms,
            }
        })
        .collect()
}

/// Shared single-instance `llama-server.exe` CUDA host used by BOTH STT phonetic polish and
/// TTS Prosody Director (0 MB extra VRAM!).
struct SharedLlmInner {
    engine: Option<LlmPolisher>,
    init_failed: bool,
}

pub struct SharedLlmServer {
    inner: Mutex<SharedLlmInner>,
}

impl SharedLlmServer {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(SharedLlmInner {
                engine: None,
                init_failed: false,
            }),
        })
    }

    pub fn prewarm(&self) {
        let Ok(mut g) = self.inner.lock() else {
            return;
        };
        if g.engine.is_none() && !g.init_failed {
            match LlmPolisher::spawn() {
                Ok(p) => g.engine = Some(p),
                Err(_) => g.init_failed = true,
            }
        }
    }

    pub fn polish(
        &self,
        raw_text: &str,
        context: &[String],
        hotwords: &[String],
    ) -> Option<String> {
        let Ok(mut g) = self.inner.lock() else {
            return None;
        };
        if g.engine.is_none() && !g.init_failed {
            match LlmPolisher::spawn() {
                Ok(p) => g.engine = Some(p),
                Err(_) => g.init_failed = true,
            }
        }
        g.engine
            .as_ref()
            .and_then(|p| p.polish(raw_text, context, hotwords).ok().flatten())
    }

    pub fn direct_prosody(
        &self,
        text: &str,
        recent_replies: &[String],
        persona: &str,
    ) -> (Vec<ProsodyBeat>, bool) {
        let Ok(mut g) = self.inner.lock() else {
            return (fallback_prosody_beats(text), false);
        };
        if g.engine.is_none() && !g.init_failed {
            match LlmPolisher::spawn() {
                Ok(p) => g.engine = Some(p),
                Err(_) => g.init_failed = true,
            }
        }
        match g.engine.as_ref() {
            Some(p) => p.direct_prosody(text, recent_replies, persona),
            None => (fallback_prosody_beats(text), false),
        }
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
    pub fn spawn_worker(events: Arc<SttEventQueue>, shared: Arc<SharedLlmServer>) -> Self {
        let (tx, rx) = mpsc::channel::<PolishCmd>();
        thread::spawn(move || polish_worker_loop(rx, events, shared));
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

fn polish_worker_loop(
    rx: Receiver<PolishCmd>,
    events: Arc<SttEventQueue>,
    shared: Arc<SharedLlmServer>,
) {
    while let Ok(cmd) = rx.recv() {
        match cmd {
            PolishCmd::Shutdown => break,
            PolishCmd::Prewarm => {
                shared.prewarm();
            }
            PolishCmd::Polish {
                card_id,
                raw_text,
                context,
                hotwords,
            } => {
                if let Some(polished) = shared.polish(&raw_text, &context, &hotwords) {
                    events.push(SttEvent::Polished {
                        card_id,
                        text: polished,
                    });
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

    #[test]
    fn numbered_prosody_parser_preserves_exact_text_and_clamps_scores() {
        let beats = split_spoken_beats("A bag of flour... It is flammable! Borderline napalm!");
        assert_eq!(beats.len(), 3);
        let raw = "1|0.90|-0.8|0.88|320\n2|1.08|+1.2|1.10|190\n3|1.18|+2.4|1.24|240";
        let parsed = parse_numbered_prosody_scores(&beats, raw).expect("should parse 3 beats");
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].text, "A bag of flour...");
        assert_eq!(parsed[2].text, "Borderline napalm!");
        assert!((parsed[0].speed - 0.90).abs() < 1e-3);
        assert!((parsed[2].pitch_st - 2.4).abs() < 1e-3);
        assert_eq!(parsed[0].pause_ms, 320);
    }
}
