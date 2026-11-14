//! Windows 11 Live Captions (`LiveCaptions.exe`) bridge via UI Automation (`IUIAutomation`).

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::process::Command;
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use windows::core::{BSTR, PCWSTR, VARIANT};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
    UIA_AutomationIdPropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

use crate::stt::{SttEvent, SttEventQueue};

pub enum LcCommand {
    Start,
    Stop,
    Shutdown,
}

/// Polls Windows 11 `LiveCaptions.exe` via UI Automation and streams lines as `SttEvent`s.
pub fn run_live_captions_loop(rx: &Receiver<LcCommand>, events: &Arc<SttEventQueue>) -> bool {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let result = run_inner(rx, events);

    unsafe {
        CoUninitialize();
    }
    result
}

fn run_inner(rx: &Receiver<LcCommand>, events: &Arc<SttEventQueue>) -> bool {
    let lc_hwnd = match find_or_launch_live_captions() {
        Ok(h) => h,
        Err(msg) => {
            events.push(SttEvent::Error(msg));
            return false;
        }
    };

    let Ok(uia) = (unsafe { CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }) else {
        events.push(SttEvent::Error("UIAutomation init failed".to_string()));
        return false;
    };

    let mut caption_elem: Option<IUIAutomationElement> = None;
    let mut prev_lines: Vec<String> = Vec::new();
    let mut last_hyp = String::new();

    events.push(SttEvent::Started {
        backend: "Win11 Captions",
    });

    loop {
        match rx.try_recv() {
            Ok(LcCommand::Stop) => return false,
            Ok(LcCommand::Shutdown) | Err(mpsc::TryRecvError::Disconnected) => return true,
            Ok(LcCommand::Start) | Err(mpsc::TryRecvError::Empty) => {}
        }

        if caption_elem.is_none() {
            caption_elem = find_captions_text_block(&uia, lc_hwnd);
            if caption_elem.is_none() {
                // Re-acquire HWND if LiveCaptions restarted.
                if let Some(h) = find_live_captions_hwnd() {
                    caption_elem = find_captions_text_block(&uia, h);
                }
            }
        }

        if let Some(ref elem) = caption_elem {
            match unsafe { elem.CurrentName() } {
                Ok(bstr) => {
                    let full = bstr.to_string();
                    let lines = parse_caption_lines(&full);
                    if !lines.is_empty() {
                        // Any lines before the final line that weren't committed yet -> Final
                        let committed_count = lines.len().saturating_sub(1);
                        if committed_count > prev_lines.len().saturating_sub(1) {
                            let start = prev_lines.len().saturating_sub(1);
                            for line in &lines[start..committed_count] {
                                if !is_placeholder(line) {
                                    events.push(SttEvent::Final(line.clone()));
                                }
                            }
                        } else if committed_count > 0
                            && prev_lines.len() > committed_count
                            && lines[committed_count - 1] != prev_lines[committed_count - 1]
                            && !is_placeholder(&lines[committed_count - 1])
                        {
                            events.push(SttEvent::Final(lines[committed_count - 1].clone()));
                        }

                        if let Some(active) = lines.last() {
                            if !is_placeholder(active) && *active != last_hyp {
                                last_hyp = active.clone();
                                events.push(SttEvent::Hypothesis(active.clone()));
                            }
                        }
                        prev_lines = lines;
                    }
                }
                Err(_) => {
                    caption_elem = None;
                }
            }
        }

        thread::sleep(Duration::from_millis(140));
    }
}

fn find_live_captions_hwnd() -> Option<HWND> {
    let cls: Vec<u16> = OsStr::new("LiveCaptionsDesktopWindow")
        .encode_wide()
        .chain(Some(0))
        .collect();
    let hwnd = unsafe { FindWindowW(PCWSTR(cls.as_ptr()), None) }.ok()?;
    if hwnd.0.is_null() {
        None
    } else {
        Some(hwnd)
    }
}

fn find_or_launch_live_captions() -> Result<HWND, String> {
    if let Some(h) = find_live_captions_hwnd() {
        return Ok(h);
    }
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let exe = format!("{windir}\\System32\\LiveCaptions.exe");
    Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Failed to launch LiveCaptions.exe: {e}"))?;

    for _ in 0..30 {
        thread::sleep(Duration::from_millis(120));
        if let Some(h) = find_live_captions_hwnd() {
            return Ok(h);
        }
    }
    Err("LiveCaptions window did not appear".to_string())
}

fn find_captions_text_block(
    uia: &IUIAutomation,
    hwnd: HWND,
) -> Option<IUIAutomationElement> {
    unsafe {
        let root = uia.ElementFromHandle(hwnd).ok()?;
        let val = VARIANT::from(BSTR::from("CaptionsTextBlock"));
        let cond = uia
            .CreatePropertyCondition(UIA_AutomationIdPropertyId, &val)
            .ok()?;
        root.FindFirst(TreeScope_Descendants, &cond).ok()
    }
}

fn parse_caption_lines(raw: &str) -> Vec<String> {
    raw.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

fn is_placeholder(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("ready to caption")
        || lower.starts_with("live captions")
        || lower.starts_with("downloading")
}
