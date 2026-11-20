//! Persistent `whisper-server.exe` client implementing [`AsrModel`] for both:
//! - GPU-accelerated CUDA `Distil-Whisper Large-v3.5 EN` (`runtime/whisper-cuda` + `models/whisper/ggml-distil-large-v3.5.bin`)
//! - Legacy CPU `ggml-base.en.bin` (`whisper/Release` + `whisper/ggml-base.en.bin`) for fallback & A/B benchmarking.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::stream_decoder::AsrModel;
use crate::win_util::{resolve_asset_path, AUDIO_SAMPLE_RATE, CREATE_NO_WINDOW};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WhisperVariant {
    DistilLargeV35Gpu,
    LegacyBaseCpu,
}

pub struct WhisperServerAsr {
    child: Child,
    port: u16,
    label: String,
    variant: WhisperVariant,
}

impl WhisperServerAsr {
    pub fn spawn(variant: WhisperVariant) -> Result<Self, String> {
        let (server_exe, model_path, label, threads) = match variant {
            WhisperVariant::DistilLargeV35Gpu => {
                let exe = find_cuda_whisper_server()
                    .ok_or_else(|| "Missing runtime/whisper-cuda/whisper-server.exe".to_string())?;
                let model = find_distil_whisper_model().ok_or_else(|| {
                    "Missing models/whisper/ggml-distil-large-v3.5.bin".to_string()
                })?;
                (exe, model, "Distil-Whisper v3.5 GPU".to_string(), "4")
            }
            WhisperVariant::LegacyBaseCpu => {
                let exe = find_legacy_whisper_server()
                    .ok_or_else(|| "Missing whisper/Release/whisper-server.exe".to_string())?;
                let model = find_legacy_whisper_model()
                    .ok_or_else(|| "Missing whisper/ggml-base.en.bin".to_string())?;
                (exe, model, "Whisper base.en CPU".to_string(), "6")
            }
        };

        let port = pick_free_port().unwrap_or(18193);
        let server_dir = server_exe.parent().map(PathBuf::from);

        let mut cmd = Command::new(&server_exe);
        if let Some(dir) = server_dir {
            cmd.current_dir(dir);
        }
        cmd.arg("-m")
            .arg(&model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("-t")
            .arg(threads)
            .arg("-l")
            .arg("en")
            .arg("-nt")
            .arg("-bo")
            .arg("1")
            .arg("-bs")
            .arg("1")
            .arg("-nf")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("{label} spawn failed: {e}"))?;

        let timeout = match variant {
            WhisperVariant::DistilLargeV35Gpu => Duration::from_secs(20),
            WhisperVariant::LegacyBaseCpu => Duration::from_secs(10),
        };
        if !wait_ready(&mut child, port, timeout) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{label} failed to become ready on port {port}"));
        }

        Ok(Self {
            child,
            port,
            label,
            variant,
        })
    }

    pub fn variant(&self) -> WhisperVariant {
        self.variant
    }

    pub fn transcribe_f32(&self, samples_16k: &[f32]) -> Result<String, String> {
        let wav = build_wav_16k_mono_f32(samples_16k);
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
        let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));

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
        Ok(extract_json_text(json_body))
    }
}

impl AsrModel for WhisperServerAsr {
    fn transcribe(&mut self, samples_16k: &[f32]) -> Result<String, String> {
        self.transcribe_f32(samples_16k)
    }

    fn model_name(&self) -> &str {
        &self.label
    }
}

impl Drop for WhisperServerAsr {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn wait_ready(child: &mut Child, port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return false;
        }
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(120),
        )
        .is_ok()
        {
            return true;
        }
        thread::sleep(Duration::from_millis(90));
    }
    false
}

fn pick_free_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    Some(listener.local_addr().ok()?.port())
}

pub fn find_cuda_whisper_server() -> Option<PathBuf> {
    resolve_asset_path(
        &[
            "runtime/whisper-cuda/Release/whisper-server.exe",
            "runtime/whisper-cuda/whisper-server.exe",
        ],
        false,
    )
}

pub fn find_distil_whisper_model() -> Option<PathBuf> {
    resolve_asset_path(
        &[
            "models/whisper/ggml-distil-large-v3.5.bin",
            "models/whisper/ggml-large-v3-turbo-q5_0.bin",
        ],
        false,
    )
}

pub fn find_legacy_whisper_server() -> Option<PathBuf> {
    resolve_asset_path(&["whisper/Release/whisper-server.exe"], false)
}

pub fn find_legacy_whisper_model() -> Option<PathBuf> {
    resolve_asset_path(&["whisper/ggml-base.en.bin"], false)
}

pub fn build_wav_16k_mono_f32(samples: &[f32]) -> Vec<u8> {
    let data_bytes = (samples.len() * 2) as u32;
    let riff_size = 36 + data_bytes;
    let mut out = Vec::with_capacity(44 + data_bytes as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_size.to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&AUDIO_SAMPLE_RATE.to_le_bytes());
    out.extend_from_slice(&(AUDIO_SAMPLE_RATE * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_bytes.to_le_bytes());
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        out.extend_from_slice(&v.to_le_bytes());
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
