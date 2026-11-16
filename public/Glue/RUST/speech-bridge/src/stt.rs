//! Near-real-time local offline Speech-to-Text using persistent `whisper-server.exe`
//! fed by an adaptive-VAD 16 kHz PCM stream with live partial hypotheses.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::denoise::VoiceIsolator;
use crate::live_captions::{run_live_captions_loop, LcCommand};
use crate::meter::MicMeter;
use crate::ui::WM_APP_STT_EVENT;
use crate::win_util::{post_app_msg, resolve_asset_path, AUDIO_SAMPLE_RATE, CREATE_NO_WINDOW};

const SAMPLE_RATE: u32 = AUDIO_SAMPLE_RATE;
const PRE_ROLL_CHUNKS: usize = 10; // ~320 ms
const SILENCE_CHUNKS_END: usize = 9; // ~288 ms pause triggers finalization
const PARTIAL_INTERVAL_MS: u64 = 650; // live partial transcription cadence while speaking
const MIN_SPEECH_SAMPLES: usize = 4_800; // ~300 ms
const MAX_UTT_SAMPLES: usize = 56_000; // ~3.5 seconds max segment in continuous noise

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SttBackend {
    Win11Captions,
    WhisperLive,
}

impl SttBackend {
    pub fn short_label(self) -> &'static str {
        match self {
            Self::Win11Captions => "Win11 Captions",
            Self::WhisperLive => "Whisper Live",
        }
    }

    pub fn button_label(self) -> &'static str {
        match self {
            Self::Win11Captions => "STT: WIN11",
            Self::WhisperLive => "STT: WHISP",
        }
    }

    pub fn live_status(self) -> &'static str {
        match self {
            Self::Win11Captions => ">> RX LIVE [Win11 Captions]",
            Self::WhisperLive => ">> RX LIVE [Whisper Live]",
        }
    }
}

/// Events emitted by the speech recognition worker to the UI thread.
pub enum SttEvent {
    Started { backend: &'static str },
    Hypothesis(String),
    Final(String),
    Stopped,
    Error(String),
}

enum SttCommand {
    Start(SttBackend),
    Stop,
    Shutdown,
}

/// Thread-safe queue for delivering STT events without leaking heap pointers in LPARAM.
pub struct SttEventQueue {
    notify_hwnd: isize,
    queue: Mutex<VecDeque<SttEvent>>,
}

impl SttEventQueue {
    pub fn new(notify_hwnd: isize) -> Arc<Self> {
        Arc::new(Self {
            notify_hwnd,
            queue: Mutex::new(VecDeque::new()),
        })
    }

    pub fn push(&self, event: SttEvent) {
        if let Ok(mut q) = self.queue.lock() {
            q.push_back(event);
        }
        post_app_msg(self.notify_hwnd, WM_APP_STT_EVENT, 0);
    }

    pub fn drain_all(&self) -> VecDeque<SttEvent> {
        let Ok(mut q) = self.queue.lock() else {
            return VecDeque::new();
        };
        std::mem::take(&mut *q)
    }
}

/// Controller for toggling near-real-time local Whisper speech-to-text.
pub struct SttEngine {
    tx: mpsc::Sender<SttCommand>,
    meter: Arc<MicMeter>,
}

impl SttEngine {
    pub fn new(events: Arc<SttEventQueue>, meter: Arc<MicMeter>) -> Self {
        let (tx, rx) = mpsc::channel::<SttCommand>();
        let meter_bg = Arc::clone(&meter);
        thread::spawn(move || stt_worker(rx, events, meter_bg));
        Self { tx, meter }
    }

    pub fn start(&self, backend: SttBackend) {
        let _ = self.tx.send(SttCommand::Start(backend));
    }

    pub fn stop(&self) {
        self.meter.set_audio_sink(None);
        let _ = self.tx.send(SttCommand::Stop);
    }
}

impl Drop for SttEngine {
    fn drop(&mut self) {
        self.meter.set_audio_sink(None);
        let _ = self.tx.send(SttCommand::Shutdown);
    }
}

struct WhisperServer {
    child: Child,
    port: u16,
}

impl WhisperServer {
    fn spawn() -> Result<Self, String> {
        let (server_exe, model_path) = find_whisper_server().ok_or_else(|| {
            "Missing whisper/Release/whisper-server.exe or ggml-base.en.bin".to_string()
        })?;
        let port = pick_free_port().unwrap_or(18193);

        let child = Command::new(&server_exe)
            .arg("-m")
            .arg(&model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("-t")
            .arg("6")
            .arg("-l")
            .arg("en")
            .arg("-nt")
            .arg("-bo")
            .arg("2")
            .arg("-bs")
            .arg("2")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("whisper-server spawn failed: {e}"))?;

        Ok(Self { child, port })
    }

    fn wait_ready(&mut self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return false;
            }
            if TcpStream::connect_timeout(
                &format!("127.0.0.1:{}", self.port).parse().unwrap(),
                Duration::from_millis(120),
            )
            .is_ok()
            {
                return true;
            }
            thread::sleep(Duration::from_millis(80));
        }
        false
    }

    fn transcribe_pcm(&self, samples: &[i16]) -> Result<String, String> {
        let wav = build_wav_16k_mono(samples);
        let boundary = "----SpeechBridgeBoundary7f3a";
        let mut body = Vec::with_capacity(wav.len() + 256);

        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"utt.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(&wav);
        body.extend_from_slice(
            format!(
                "\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n--{boundary}--\r\n"
            )
            .as_bytes(),
        );

        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", self.port))
            .map_err(|e| format!("whisper-server connect failed: {e}"))?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));

        let header = format!(
            "POST /inference HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: multipart/form-data; boundary={boundary}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            self.port,
            body.len()
        );
        stream
            .write_all(header.as_bytes())
            .map_err(|e| format!("whisper-server write header failed: {e}"))?;
        stream
            .write_all(&body)
            .map_err(|e| format!("whisper-server write body failed: {e}"))?;

        let mut resp = String::new();
        stream
            .read_to_string(&mut resp)
            .map_err(|e| format!("whisper-server read failed: {e}"))?;

        let json_body = resp
            .split_once("\r\n\r\n")
            .map(|(_, b)| b)
            .unwrap_or(&resp);
        Ok(clean_transcript(&extract_json_text(json_body)))
    }
}

impl Drop for WhisperServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn stt_worker(rx: Receiver<SttCommand>, events: Arc<SttEventQueue>, meter: Arc<MicMeter>) {
    let mut server: Option<WhisperServer> = None;
    let mut pending_cmd: Option<SttCommand> = None;

    loop {
        let cmd = match pending_cmd.take() {
            Some(c) => c,
            None => match rx.recv() {
                Ok(c) => c,
                Err(_) => break,
            },
        };

        match cmd {
            SttCommand::Shutdown => break,
            SttCommand::Stop => {}
            SttCommand::Start(SttBackend::Win11Captions) => {
                let (lc_tx, lc_rx) = mpsc::channel::<LcCommand>();
                let ev_bg = Arc::clone(&events);
                let handle = thread::spawn(move || run_live_captions_loop(&lc_rx, &ev_bg));
                let mut should_quit = false;

                while let Ok(c) = rx.recv() {
                    match c {
                        SttCommand::Stop => {
                            let _ = lc_tx.send(LcCommand::Stop);
                            break;
                        }
                        SttCommand::Shutdown => {
                            let _ = lc_tx.send(LcCommand::Shutdown);
                            should_quit = true;
                            break;
                        }
                        SttCommand::Start(b) => {
                            let _ = lc_tx.send(LcCommand::Stop);
                            pending_cmd = Some(SttCommand::Start(b));
                            break;
                        }
                    }
                }
                let _ = handle.join();
                events.push(SttEvent::Stopped);
                if should_quit {
                    break;
                }
            }
            SttCommand::Start(SttBackend::WhisperLive) => {
                if !ensure_whisper(&mut server, &events) {
                    events.push(SttEvent::Stopped);
                    continue;
                }
                if let Some(ref srv) = server {
                    let should_quit = run_streaming_session(&rx, &events, &meter, srv);
                    meter.set_audio_sink(None);
                    events.push(SttEvent::Stopped);
                    if should_quit {
                        break;
                    }
                }
            }
        }
    }
}

fn ensure_whisper(server: &mut Option<WhisperServer>, events: &Arc<SttEventQueue>) -> bool {
    if server.is_some() {
        return true;
    }
    match WhisperServer::spawn() {
        Ok(mut srv) => {
            if srv.wait_ready(Duration::from_secs(8)) {
                *server = Some(srv);
                true
            } else {
                events.push(SttEvent::Error(
                    "whisper-server failed to become ready".to_string(),
                ));
                false
            }
        }
        Err(e) => {
            events.push(SttEvent::Error(e));
            false
        }
    }
}

fn run_streaming_session(
    rx: &Receiver<SttCommand>,
    events: &Arc<SttEventQueue>,
    meter: &MicMeter,
    server: &WhisperServer,
) -> bool {
    let (pcm_tx, pcm_rx): (SyncSender<Vec<i16>>, Receiver<Vec<i16>>) = mpsc::sync_channel(64);
    meter.set_audio_sink(Some(pcm_tx));
    events.push(SttEvent::Started {
        backend: SttBackend::WhisperLive.short_label(),
    });

    let mut pre_roll: VecDeque<Vec<i16>> = VecDeque::with_capacity(PRE_ROLL_CHUNKS);
    let mut utterance: Vec<i16> = Vec::new();
    let mut in_speech = false;
    let mut silence_count: usize = 0;
    let mut isolator = VoiceIsolator::new();
    let mut hp_prev_x: f32 = 0.0;
    let mut hp_prev_y: f32 = 0.0;
    let mut last_partial_at = Instant::now();
    let mut last_partial_len: usize = 0;

    loop {
        match rx.try_recv() {
            Ok(SttCommand::Stop) | Ok(SttCommand::Start(_)) => return false,
            Ok(SttCommand::Shutdown) | Err(mpsc::TryRecvError::Disconnected) => return true,
            Err(mpsc::TryRecvError::Empty) => {}
        }

        match pcm_rx.recv_timeout(Duration::from_millis(35)) {
            Ok(chunk) => {
                // Keep clean 120 Hz high-passed audio for Whisper (preserves consonants 3.8-8 kHz).
                let mut clean_chunk = Vec::with_capacity(chunk.len());
                const HP_ALPHA: f32 = 0.955; // ~120 Hz @ 16 kHz
                for &s in &chunk {
                    let x = s as f32;
                    let y = HP_ALPHA * (hp_prev_y + x - hp_prev_x);
                    hp_prev_x = x;
                    hp_prev_y = y;
                    clean_chunk.push(y.clamp(-32768.0, 32767.0) as i16);
                }

                // Use STFT VoiceIsolator strictly for noise-resilient voice-band VAD scoring.
                let mut vad_buf = chunk;
                let (voice_snr, voice_rms) = isolator.process_chunk(&mut vad_buf);
                let is_voice = if in_speech {
                    voice_snr >= 1.25 && voice_rms >= 120.0
                } else {
                    voice_snr >= 1.50 && voice_rms >= 160.0
                };

                if is_voice {
                    if !in_speech {
                        in_speech = true;
                        silence_count = 0;
                        last_partial_at = Instant::now();
                        last_partial_len = 0;
                        utterance.clear();
                        for prev in pre_roll.drain(..) {
                            utterance.extend_from_slice(&prev);
                        }
                        events.push(SttEvent::Hypothesis("listening...".to_string()));
                    } else {
                        silence_count = 0;
                    }
                    utterance.extend_from_slice(&clean_chunk);
                } else if in_speech {
                    utterance.extend_from_slice(&clean_chunk);
                    silence_count += 1;
                } else {
                    if pre_roll.len() == PRE_ROLL_CHUNKS {
                        pre_roll.pop_front();
                    }
                    pre_roll.push_back(clean_chunk);
                }

                // Live partial hypothesis while user is still speaking.
                if in_speech
                    && utterance.len() >= MIN_SPEECH_SAMPLES
                    && utterance.len() > last_partial_len + 4_000
                    && last_partial_at.elapsed() >= Duration::from_millis(PARTIAL_INTERVAL_MS)
                {
                    last_partial_at = Instant::now();
                    last_partial_len = utterance.len();
                    if let Ok(partial) = server.transcribe_pcm(&utterance) {
                        if !partial.is_empty() {
                            events.push(SttEvent::Hypothesis(partial));
                        }
                    }
                }

                let should_flush = in_speech
                    && (silence_count >= SILENCE_CHUNKS_END || utterance.len() >= MAX_UTT_SAMPLES);

                if should_flush {
                    in_speech = false;
                    silence_count = 0;
                    let samples = std::mem::take(&mut utterance);
                    if samples.len() >= MIN_SPEECH_SAMPLES {
                        match server.transcribe_pcm(&samples) {
                            Ok(text) if !text.is_empty() => {
                                events.push(SttEvent::Final(text));
                            }
                            Ok(_) => {
                                events.push(SttEvent::Hypothesis(String::new()));
                            }
                            Err(err) => {
                                events.push(SttEvent::Error(err));
                                return false;
                            }
                        }
                    } else {
                        events.push(SttEvent::Hypothesis(String::new()));
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return false,
        }
    }
}

fn pick_free_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    Some(listener.local_addr().ok()?.port())
}

fn find_whisper_server() -> Option<(PathBuf, PathBuf)> {
    let base = resolve_asset_path(&["whisper"], true)?;
    let srv = base.join("Release").join("whisper-server.exe");
    let model = base.join("ggml-base.en.bin");
    if srv.is_file() && model.is_file() {
        Some((srv, model))
    } else {
        None
    }
}

fn build_wav_16k_mono(samples: &[i16]) -> Vec<u8> {
    let peak = samples
        .iter()
        .fold(1i32, |acc, &s| acc.max((s as i32).abs()));
    let gain = if peak < 24_000 {
        (24_000.0 / peak as f32).min(4.0)
    } else {
        1.0
    };

    let data_bytes = (samples.len() * 2) as u32;
    let riff_size = 36 + data_bytes;
    let mut out = Vec::with_capacity(44 + data_bytes as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_size.to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_bytes.to_le_bytes());
    if (gain - 1.0).abs() < 0.05 {
        let pcm_bytes = unsafe {
            std::slice::from_raw_parts(samples.as_ptr() as *const u8, samples.len() * 2)
        };
        out.extend_from_slice(pcm_bytes);
    } else {
        for &s in samples {
            let v = (s as f32 * gain).clamp(-32768.0, 32767.0) as i16;
            out.extend_from_slice(&v.to_le_bytes());
        }
    }
    out
}

fn extract_json_text(json: &str) -> String {
    let Some(idx) = json.find("\"text\"") else {
        return String::new();
    };
    let rest = &json[idx + 6..];
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
                Some('n') => out.push(' '),
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

fn clean_transcript(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('[')
        || trimmed.starts_with('(')
        || trimmed.eq_ignore_ascii_case("you")
    {
        return String::new();
    }
    trimmed.to_string()
}
