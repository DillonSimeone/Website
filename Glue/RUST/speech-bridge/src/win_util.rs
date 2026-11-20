//! Shared Win32, COM, asset-path, and audio-pipeline constants/helpers.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT, COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED,
};
use windows::Win32::UI::WindowsAndMessaging::PostMessageW;

/// Win32 process creation flag to suppress console windows on child processes.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Single source of truth for the 16 kHz mono audio pipeline (meter, denoise, STT).
pub const AUDIO_SAMPLE_RATE: u32 = 16_000;
/// Single source of truth for the 512-sample (32 ms) FFT / VAD / meter chunk size.
pub const AUDIO_CHUNK_SAMPLES: usize = 512;

/// Null-terminated UTF-16 conversion for Win32 `*W` APIs.
pub fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

/// Posts a window message to `hwnd_raw` from a background worker thread.
pub fn post_app_msg(hwnd_raw: isize, msg: u32, wparam: usize) {
    if hwnd_raw != 0 {
        unsafe {
            let _ = PostMessageW(HWND(hwnd_raw as *mut _), msg, WPARAM(wparam), LPARAM(0));
        }
    }
}

/// RAII guard for COM initialization/uninitialization on a thread.
pub struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    pub fn sta() -> Self {
        Self::init(COINIT_APARTMENTTHREADED)
    }

    pub fn mta() -> Self {
        Self::init(COINIT_MULTITHREADED)
    }

    fn init(coinit: COINIT) -> Self {
        let hr = unsafe { CoInitializeEx(None, coinit) };
        Self {
            initialized: hr.is_ok(),
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

/// Resolves a bundled file or directory relative to the executable, `target/release` parent, or CWD.
pub fn resolve_asset_path(rel_paths: &[&str], is_dir: bool) -> Option<PathBuf> {
    let exists = |p: &PathBuf| if is_dir { p.is_dir() } else { p.is_file() };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in rel_paths {
                let candidate = dir.join(rel);
                if exists(&candidate) {
                    return Some(candidate);
                }
            }
            if let Some(root) = dir.parent().and_then(|p| p.parent()) {
                for rel in rel_paths {
                    let candidate = root.join(rel);
                    if exists(&candidate) {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    for rel in rel_paths {
        let candidate = PathBuf::from(rel);
        if exists(&candidate) {
            return Some(candidate);
        }
    }

    None
}
