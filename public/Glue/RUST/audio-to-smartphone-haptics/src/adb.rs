use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::thread;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn find_adb_path() -> PathBuf {
    let local = PathBuf::from("platform-tools").join("adb.exe");
    if local.exists() {
        return local;
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidates = [
                dir.join("platform-tools").join("adb.exe"),
                dir.join("..").join("platform-tools").join("adb.exe"),
                dir.join("..").join("USBTethering").join("platform-tools").join("adb.exe"),
                dir.join("..").join("..").join("USBTethering").join("platform-tools").join("adb.exe"),
                PathBuf::from(r"F:\Github\Website\public\Glue\USBTethering\platform-tools\adb.exe"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let sdk = Path::new(&local_app_data)
            .join("Android")
            .join("Sdk")
            .join("platform-tools")
            .join("adb.exe");
        if sdk.exists() {
            return sdk;
        }
    }

    PathBuf::from("adb.exe")
}

pub struct HapticEnvelope {
    pub cmd: String,
    pub duration_ms: u32,
    pub peak_amp: u32,
}

pub fn build_envelope(
    v: f32,
    is_snap: bool,
    is_deep_sub: bool,
    punch_dur: i32,
    base_amp: i32,
) -> HapticEnvelope {
    if is_snap && v < 0.45 {
        let prim_scale = (0.40 + v * 0.60).clamp(0.1, 1.0);
        let prim_scale_str = format!("{:.2}", prim_scale);
        let (prim_id, dur) = if v < 0.22 { (7, 26) } else { (1, 45) };
        let peak_amp = (prim_scale * 255.0) as u32;
        return HapticEnvelope {
            cmd: format!("cmd vibrator_manager synced -f -B primitives {} {}\n", prim_id, prim_scale_str),
            duration_ms: dur,
            peak_amp,
        };
    }

    let v_eff = v.powf(0.85).clamp(0.05, 1.0);
    let peak_amp = ((base_amp as f32 + (255.0 - base_amp as f32) * v_eff).clamp(base_amp as f32, 255.0)) as u32;

    if peak_amp < 110 {
        let hold_ms = 40.max((punch_dur as f32 * 0.55) as u32);
        let a1 = 25.max((peak_amp as f32 * 0.55) as u32);
        let a2 = peak_amp;
        let a3 = 15.max((peak_amp as f32 * 0.35) as u32);
        let dur = 8 + hold_ms + 18 + 8;
        HapticEnvelope {
            cmd: format!("cmd vibrator_manager synced -f -B waveform -a -c 8 {} {} {} 18 {} 8 0\n", a1, hold_ms, a2, a3),
            duration_ms: dur,
            peak_amp,
        }
    } else if peak_amp < 190 {
        let hold_ms = 60.max(punch_dur as u32);
        let a1 = 40.max((peak_amp as f32 * 0.55) as u32);
        let a2 = peak_amp;
        let a3 = 25.max((peak_amp as f32 * 0.42) as u32);
        let a4 = 12.max((peak_amp as f32 * 0.22) as u32);
        let dur = 10 + hold_ms + 24 + 14 + 8;
        HapticEnvelope {
            cmd: format!("cmd vibrator_manager synced -f -B waveform -a -c 10 {} {} {} 24 {} 14 {} 8 0\n", a1, hold_ms, a2, a3, a4),
            duration_ms: dur,
            peak_amp,
        }
    } else {
        let mult = if is_deep_sub { 1.25 } else { 1.05 };
        let hold_ms = 80.max((punch_dur as f32 * mult) as u32);
        let a1 = (peak_amp as f32 * 0.60) as u32;
        let a2 = peak_amp;
        let a3 = (peak_amp as f32 * 0.50) as u32;
        let a4 = (peak_amp as f32 * 0.28) as u32;
        let dur = 12 + hold_ms + 28 + 18 + 8;
        HapticEnvelope {
            cmd: format!("cmd vibrator_manager synced -f -B waveform -a -c 12 {} {} {} 28 {} 18 {} 8 0\n", a1, hold_ms, a2, a3, a4),
            duration_ms: dur,
            peak_amp,
        }
    }
}

pub struct PersistentAdbPipeline {
    tx: mpsc::Sender<String>,
}

impl PersistentAdbPipeline {
    pub fn new(adb_path: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel::<String>();

        thread::Builder::new()
            .name("adb-pipeline".to_string())
            .spawn(move || {
                let spawn_shell = || -> Option<(Child, ChildStdin)> {
                    let _ = Command::new(&adb_path)
                        .arg("start-server")
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();

                    match Command::new(&adb_path)
                        .arg("shell")
                        .creation_flags(CREATE_NO_WINDOW)
                        .stdin(Stdio::piped())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                    {
                        Ok(mut child) => {
                            if let Some(stdin) = child.stdin.take() {
                                Some((child, stdin))
                            } else {
                                None
                            }
                        }
                        Err(_) => None,
                    }
                };

                let mut current_child = spawn_shell();

                while let Ok(cmd) = rx.recv() {
                    let mut success = false;
                    if let Some((_, ref mut stdin)) = current_child {
                        if stdin.write_all(cmd.as_bytes()).is_ok() && stdin.flush().is_ok() {
                            success = true;
                        }
                    }

                    if !success {
                        if let Some((mut child, _)) = current_child.take() {
                            let _ = child.kill();
                        }
                        current_child = spawn_shell();
                        if let Some((_, ref mut stdin)) = current_child {
                            let _ = stdin.write_all(cmd.as_bytes());
                            let _ = stdin.flush();
                        }
                    }
                }

                if let Some((mut child, _)) = current_child.take() {
                    let _ = child.kill();
                }
            })
            .expect("Failed to spawn ADB pipeline thread");

        Self { tx }
    }

    pub fn send(&self, cmd: String) {
        let _ = self.tx.send(cmd);
    }
}
