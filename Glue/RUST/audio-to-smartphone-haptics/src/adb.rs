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

/// Pre-Haxel Default ("Audio Volume to PWM"): Continuous state-tracked hold (`1500ms` window refreshed smoothly)
/// so the motor stays continuously ON while audio is present and updates amplitude in real time.
pub fn build_continuous_hold_cmd(amp: u32) -> String {
    let clamped = amp.clamp(1, 255);
    format!(
        "cmd vibrator_manager synced -f -B oneshot -a 1500 {}\n",
        clamped
    )
}

/// Haxel-style crisp micro-pulse (`navigator.vibrate(pulse_ms)` with 1..255 hardware amplitude scaling).
/// Leaves a 12-18ms mechanical braking gap before the next pulse so the 155 Hz LRA never blurs into brown noise.
pub fn build_haxel_pulse_cmd(amp: u32, pulse_ms: u32) -> String {
    let clamped = amp.clamp(1, 255);
    let dur = pulse_ms.clamp(18, 120);
    format!(
        "cmd vibrator_manager synced -f -B oneshot -a {} {}\n",
        dur, clamped
    )
}

/// Fires a closed-loop Android hardware primitive (`1`=CLICK, `2`=THUD, `3`=SPIN, `4`=QUICK_RISE,
/// `6`=QUICK_FALL, `7`=TICK, `8`=LOW_TICK) with `0.10..1.00` scale.
pub fn build_primitive_cmd(prim_id: u32, scale: f32) -> String {
    let s = scale.clamp(0.12, 1.0);
    format!(
        "cmd vibrator_manager synced -f -B primitives -s {:.2} {}\n",
        s, prim_id
    )
}

/// Immediately stops the smartphone vibration motor (`navigator.vibrate(0)`).
pub fn build_cancel_cmd() -> String {
    "cmd vibrator_manager cancel\n".to_string()
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
