//! Cyber-terminal double-buffered Win32 GDI UI with:
//! - Multi-engine RTX GPU STT selector (Parakeet TDT 0.6B v2, Distil-Whisper v3.5, Win11, Legacy)
//! - Multi-mic WASAPI picker (1 mic, 2+ simultaneous mics with active-SNR switching, or System Loopback)
//! - Quick Denoise mode toggle (OFF / BAL / MAX) & color-coded Speaker Labels ([SPK 1..N])
//! - Two-tone LocalAgreement streaming hypothesis (bright locked words + amber tentative tail)
//! - Live Signal/SNR health badge & active-mic telemetry
//! - Auto-gated STT during outbound Piper/WinRT TTS playback
//! - Scalable caption font size (A-/A+ buttons and Ctrl+/Ctrl-/Ctrl+0)

use std::fs::{self, File};
use std::io::Write;
use std::sync::Arc;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{
    COLORREF, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW,
    CreatePen, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, Ellipse, EndPaint, FillRect,
    FrameRect, GetTextExtentPoint32W, IntersectClipRect, InvalidateRect, RestoreDC, SaveDC,
    ScreenToClient, SelectObject, SetBkColor, SetBkMode, SetTextColor, CLEARTYPE_QUALITY,
    CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_PITCH, DT_CALCRECT, DT_CENTER, DT_LEFT,
    DT_NOPREFIX, DT_RIGHT, DT_SINGLELINE, DT_VCENTER, DT_WORDBREAK, FF_MODERN, FW_BOLD, FW_NORMAL,
    HBRUSH, HDC, HFONT, OUT_DEFAULT_PRECIS, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, SetFocus, VK_ADD, VK_CONTROL, VK_ESCAPE, VK_OEM_MINUS, VK_OEM_PLUS, VK_SHIFT,
    VK_SUBTRACT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CallWindowProcW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
    GetClientRect, GetCursorPos, GetParent, GetWindowLongPtrW, GetWindowTextLengthW,
    GetWindowTextW, LoadCursorW, MoveWindow, PostMessageW, PostQuitMessage, SendMessageW,
    SetCursor, SetWindowLongPtrW, SetWindowPos, SetWindowTextW, TrackPopupMenu, ES_AUTOVSCROLL,
    ES_MULTILINE, ES_WANTRETURN, GWLP_USERDATA, GWLP_WNDPROC, HMENU, HWND_NOTOPMOST, HWND_TOPMOST,
    IDC_HAND, MF_CHECKED, MF_SEPARATOR, MF_STRING, MF_UNCHECKED, SWP_NOMOVE, SWP_NOSIZE,
    TPM_LEFTALIGN, TPM_RETURNCMD, TPM_TOPALIGN, WM_APP, WM_CHAR, WM_CREATE, WM_CTLCOLOREDIT,
    WM_DESTROY, WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_MOUSEWHEEL,
    WM_NCDESTROY, WM_PAINT, WM_SETCURSOR, WM_SETFONT, WM_SIZE, WNDPROC, WS_CHILD, WS_TABSTOP,
    WS_VISIBLE,
};

use crate::meter::{list_input_devices, AudioSource, MicMeter, SignalStatus, BANDS};
use crate::stream_decoder::DenoiseMode;
use crate::stt::{SttBackend, SttEngine, SttEvent, SttEventQueue};
use crate::tts::{list_local_voices, list_output_devices, TtsEchoGate, TtsEngine, VoiceEntry};
use crate::win_util::to_wide;

pub const WM_APP_STT_EVENT: u32 = WM_APP + 1;
pub const WM_APP_TTS_STATUS: u32 = WM_APP + 2;
const WM_APP_SPEAK_SUBMIT: u32 = WM_APP + 3;
pub const WM_APP_METER_TICK: u32 = WM_APP + 4;
const WM_APP_STOP_TTS: u32 = WM_APP + 5;
const WM_APP_TOGGLE_PIN: u32 = WM_APP + 6;
pub const WM_APP_BENCH_PROGRESS: u32 = WM_APP + 7;
const WM_APP_FONT_DELTA: u32 = WM_APP + 8;

const ID_EDIT_INPUT: usize = 201;
const CF_UNICODETEXT: u32 = 13;
const RATES: [f64; 4] = [0.8, 1.0, 1.25, 1.5];

// Cyber-Terminal Palette (COLORREF is 0x00BBGGRR)
pub const C_BG: COLORREF = COLORREF(0x000E0A07); // #070A0E
const C_PANE: COLORREF = COLORREF(0x00140F0A); // #0A0F14
const C_CARD: COLORREF = COLORREF(0x001D160F); // #0F161D
const C_CARD_HOVER: COLORREF = COLORREF(0x00262113); // #132126
const C_CARD_ACTIVE: COLORREF = COLORREF(0x00222A12); // #122A22
const C_BORDER: COLORREF = COLORREF(0x0034281B); // #1B2834
const C_GREEN: COLORREF = COLORREF(0x0088FF00); // #00FF88
const C_GREEN_DIM: COLORREF = COLORREF(0x00589E3A); // #3A9E58
const C_GREEN_BG: COLORREF = COLORREF(0x0018240A); // #0A2418
const C_CYAN: COLORREF = COLORREF(0x00FFD400); // #00D4FF
const C_RED: COLORREF = COLORREF(0x005C3BFF); // #FF3B5C
const C_RED_BG: COLORREF = COLORREF(0x0018102A); // #2A1018
const C_AMBER: COLORREF = COLORREF(0x0033B8FF); // #FFB833
const C_AMBER_BG: COLORREF = COLORREF(0x0010202C); // #2C2010
const C_VIOLET: COLORREF = COLORREF(0x00FF7DC7); // #C77DFF
const C_CORAL: COLORREF = COLORREF(0x008B6BFF); // #FF6B8B
const C_SKY: COLORREF = COLORREF(0x00DDEF72); // #72EFDD
const C_TEXT: COLORREF = COLORREF(0x00F4FFE6); // #E6FFF4
const C_TEXT_CYAN: COLORREF = COLORREF(0x00F2E6C9); // #C9E6F2
const C_MUTED: COLORREF = COLORREF(0x008A7A62); // #627A8A

fn speaker_color(id: Option<u8>) -> COLORREF {
    match id {
        Some(1) => C_CYAN,
        Some(2) => C_GREEN,
        Some(3) => C_AMBER,
        Some(4) => C_VIOLET,
        Some(5) => C_CORAL,
        Some(6) => C_SKY,
        Some(n) => match n % 6 {
            0 => C_SKY,
            1 => C_CYAN,
            2 => C_GREEN,
            3 => C_AMBER,
            4 => C_VIOLET,
            _ => C_CORAL,
        },
        None => C_CYAN,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HitTarget {
    None,
    BtnMic,
    BtnEngine,
    BtnInputPicker,
    BtnDenoise,
    BtnSpeakers,
    BtnLlm,
    BtnFontDown,
    BtnFontUp,
    HealthBadge,
    MeterBadge,
    BtnVoice,
    BtnOutputDevice,
    BtnGapWait,
    BtnTestVoices,
    BtnRate,
    BtnPin,
    BtnExport,
    BtnClear,
    BtnSpeak,
    HeardCard(usize),
    ReplyCard(usize),
}

struct HeardItem {
    card_id: u64,
    time: String,
    text: String,
    speaker_id: Option<u8>,
    llm_polished: bool,
}

struct ReplyItem {
    time: String,
    text: String,
}

pub struct AppState {
    hwnd: HWND,
    edit_input: HWND,
    font_mono: HFONT,
    font_mono_active: HFONT,
    font_caption: HFONT,
    font_bold: HFONT,
    font_small: HFONT,
    caption_font_px: i32,
    brush_input: HBRUSH,
    voices: Vec<VoiceEntry>,
    selected_voice: usize,
    output_device: Option<String>,
    wait_for_gap: bool,
    queued_reply: Option<(usize, String)>,
    rate_idx: usize,
    pinned: bool,
    source: AudioSource,
    backend: SttBackend,
    denoise_mode: DenoiseMode,
    speaker_labels: bool,
    llm_polish: bool,
    tts: TtsEngine,
    stt: SttEngine,
    stt_queue: Arc<SttEventQueue>,
    meter: Arc<MicMeter>,
    mic_active: bool,
    tts_speaking: bool,
    bench_active: bool,
    active_reply_idx: Option<usize>,
    active_tts_word: Option<usize>,
    status_text: String,
    health_buf: String,
    heard_items: Vec<HeardItem>,
    stable_hypothesis: String,
    draft_hypothesis: String,
    reply_items: Vec<ReplyItem>,
    left_scroll: i32,
    right_scroll: i32,
    left_max_scroll: i32,
    right_max_scroll: i32,
    hover: HitTarget,
    hover_pt: POINT,
    // Row 1 controls (STT & Audio Health)
    rect_mic: RECT,
    rect_engine: RECT,
    rect_input_picker: RECT,
    rect_denoise: RECT,
    rect_speakers: RECT,
    rect_llm: RECT,
    rect_font_down: RECT,
    rect_font_up: RECT,
    rect_health: RECT,
    rect_meter: RECT,
    // Row 2 controls (TTS & Session)
    rect_voice: RECT,
    rect_output: RECT,
    rect_gap: RECT,
    rect_bench: RECT,
    rect_rate: RECT,
    rect_pin: RECT,
    rect_export: RECT,
    rect_clear: RECT,
    rect_status: RECT,
    // Main panes
    rect_speak: RECT,
    rect_left_feed: RECT,
    rect_right_feed: RECT,
    rect_input_box: RECT,
    left_card_rects: Vec<RECT>,
    card_rects: Vec<RECT>,
    orig_input_proc: WNDPROC,
}

impl AppState {
    fn selected_voice_entry(&self) -> Option<VoiceEntry> {
        self.voices.get(self.selected_voice).cloned()
    }

    fn selected_voice_label(&self) -> &str {
        self.voices
            .get(self.selected_voice)
            .map(|v| v.display_name.as_str())
            .unwrap_or("Default")
    }

    fn short_output_label(&self) -> String {
        let Some(ref dev) = self.output_device else {
            return "OUT: SPK \u{25BE}".to_string();
        };
        let trimmed = dev
            .strip_prefix("CABLE Input (")
            .map(|_| "CABLE In")
            .or_else(|| dev.strip_prefix("Speakers ("))
            .unwrap_or(dev.as_str());
        let short: String = if trimmed.chars().count() <= 8 {
            trimmed.to_string()
        } else {
            trimmed.chars().take(7).collect::<String>() + "\u{2026}"
        };
        format!("OUT: {short} \u{25BE}")
    }

    fn current_rate(&self) -> f64 {
        RATES[self.rate_idx]
    }

    fn redraw(&self) {
        unsafe {
            let _ = InvalidateRect(self.hwnd, None, false);
        }
    }

    fn adjust_caption_font(&mut self, delta: i32) {
        let next = if delta == 0 {
            17
        } else {
            (self.caption_font_px + delta).clamp(13, 34)
        };
        if next == self.caption_font_px {
            return;
        }
        self.caption_font_px = next;
        unsafe {
            let new_font = make_font("Consolas", -next, FW_NORMAL.0 as i32);
            let _ = DeleteObject(self.font_caption);
            self.font_caption = new_font;
        }
        self.status_text = format!(">> CAPTION FONT: {}px", self.caption_font_px);
        self.redraw();
    }

    fn toggle_mic(&mut self) {
        if self.mic_active {
            self.mic_active = false;
            self.status_text = ">> STANDBY".to_string();
            self.stt.stop();
        } else {
            self.mic_active = true;
            self.status_text = format!(">> ARMING {}...", self.backend.short_label());
            self.stt.start(self.backend);
        }
        self.redraw();
    }

    fn show_engine_menu(&mut self) {
        unsafe {
            let Ok(menu) = CreatePopupMenu() else {
                return;
            };
            for (i, &b) in SttBackend::ALL.iter().enumerate() {
                let wide = to_wide(b.menu_label());
                let flags = MF_STRING
                    | if b == self.backend {
                        MF_CHECKED
                    } else {
                        MF_UNCHECKED
                    };
                let _ = AppendMenuW(menu, flags, i + 1, PCWSTR(wide.as_ptr()));
            }
            let mut pt = POINT {
                x: self.rect_engine.left,
                y: self.rect_engine.bottom + 2,
            };
            let _ = ClientToScreen(self.hwnd, &mut pt);
            let cmd = TrackPopupMenu(
                menu,
                TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD,
                pt.x,
                pt.y,
                0,
                self.hwnd,
                None,
            );
            let _ = DestroyMenu(menu);
            if cmd.0 > 0 {
                let idx = (cmd.0 as usize) - 1;
                if let Some(&chosen) = SttBackend::ALL.get(idx) {
                    self.backend = chosen;
                    if self.mic_active {
                        self.status_text = format!(">> LOADING {}...", chosen.short_label());
                        self.stt.start(chosen);
                    } else {
                        self.status_text = format!(">> ENG: {}", chosen.short_label());
                    }
                    self.redraw();
                }
            }
        }
    }

    fn show_input_picker_menu(&mut self) {
        let devices = list_input_devices();
        let selected = self.meter.selected_mics();

        unsafe {
            let Ok(menu) = CreatePopupMenu() else {
                return;
            };
            // Item 1: System Audio Loopback
            let sys_lbl = to_wide("System Audio Loopback (Calls / Videos / Music)");
            let sys_flags = MF_STRING
                | if self.source == AudioSource::Loopback {
                    MF_CHECKED
                } else {
                    MF_UNCHECKED
                };
            let _ = AppendMenuW(menu, sys_flags, 1, PCWSTR(sys_lbl.as_ptr()));
            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());

            // Item 2: Select All Mics (Auto Best-SNR Fusion)
            if devices.len() > 1 {
                let all_lbl = to_wide("Use ALL Connected Mics (Auto Best-SNR Switching)");
                let all_checked = self.source == AudioSource::Mic
                    && devices.iter().all(|d| selected.contains(d));
                let _ = AppendMenuW(
                    menu,
                    MF_STRING | if all_checked { MF_CHECKED } else { MF_UNCHECKED },
                    2,
                    PCWSTR(all_lbl.as_ptr()),
                );
                let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
            }

            // Items 100+: Individual checkable microphones (toggle multiple for multi-mic fusion!)
            for (i, name) in devices.iter().enumerate() {
                let is_on = self.source == AudioSource::Mic
                    && (selected.contains(name) || (selected.is_empty() && i == 0));
                let lbl = to_wide(&format!("Mic: {name}"));
                let flags = MF_STRING | if is_on { MF_CHECKED } else { MF_UNCHECKED };
                let _ = AppendMenuW(menu, flags, 100 + i, PCWSTR(lbl.as_ptr()));
            }

            let mut pt = POINT {
                x: self.rect_input_picker.left,
                y: self.rect_input_picker.bottom + 2,
            };
            let _ = ClientToScreen(self.hwnd, &mut pt);
            let cmd = TrackPopupMenu(
                menu,
                TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD,
                pt.x,
                pt.y,
                0,
                self.hwnd,
                None,
            );
            let _ = DestroyMenu(menu);

            if cmd.0 == 1 {
                self.source = AudioSource::Loopback;
                self.meter.set_source(AudioSource::Loopback);
                self.status_text = ">> SRC: SYSTEM LOOPBACK".to_string();
                self.redraw();
            } else if cmd.0 == 2 && !devices.is_empty() {
                self.source = AudioSource::Mic;
                let n = devices.len();
                self.meter.set_selected_mics(devices);
                self.status_text = format!(">> MULTI-MIC ACTIVE ({n} MICS AUTO-SNR)");
                self.redraw();
            } else if cmd.0 >= 100 {
                let idx = (cmd.0 as usize) - 100;
                if let Some(chosen) = devices.get(idx) {
                    let mut next = if self.source == AudioSource::Loopback {
                        Vec::new()
                    } else {
                        selected
                    };
                    if let Some(pos) = next.iter().position(|n| n == chosen) {
                        // Keep at least 1 mic selected; uncheck only if >1 selected.
                        if next.len() > 1 {
                            next.remove(pos);
                        }
                    } else {
                        next.push(chosen.clone());
                    }
                    let count = next.len();
                    self.source = AudioSource::Mic;
                    self.meter.set_selected_mics(next);
                    self.status_text = if count > 1 {
                        format!(">> MULTI-MIC ({count} ACTIVE :: AUTO-SNR)")
                    } else {
                        format!(">> MIC: {}", short_mic_name(chosen))
                    };
                    self.redraw();
                }
            }
        }
    }

    fn cycle_denoise(&mut self) {
        self.denoise_mode = self.denoise_mode.next();
        self.stt.set_denoise_mode(self.denoise_mode);
        self.status_text = match self.denoise_mode {
            DenoiseMode::Off => ">> DENOISE: OFF (BEST FOR MULTI-TALKER BABBLE)".to_string(),
            DenoiseMode::Balanced => ">> DENOISE: GTCRN (FAST NEURAL ENHANCER)".to_string(),
            DenoiseMode::Strong => ">> DENOISE: DPDFNet8 (DEEP MUSIC/CAFE SUPPRESSOR)".to_string(),
            DenoiseMode::VoxLock => ">> DENOISE: VOXLOCK (1-ON-1 TARGET VOICE LOCK)".to_string(),
        };
        self.redraw();
    }

    fn toggle_speakers(&mut self) {
        self.speaker_labels = !self.speaker_labels;
        self.stt.set_speaker_labels(self.speaker_labels);
        self.status_text = if self.speaker_labels {
            ">> SPEAKER LABELS: ON (WeSpeaker CAM++)".to_string()
        } else {
            ">> SPEAKER LABELS: OFF".to_string()
        };
        self.redraw();
    }

    fn toggle_llm_polish(&mut self) {
        self.llm_polish = !self.llm_polish;
        self.stt.set_llm_polish(self.llm_polish);
        self.status_text = if self.llm_polish {
            ">> LLM POLISH: ON (Qwen2.5-1.5B CUDA <=30% GUARD)".to_string()
        } else {
            ">> LLM POLISH: OFF (RAW ASR ONLY)".to_string()
        };
        self.redraw();
    }

    fn cycle_rate(&mut self) {
        self.rate_idx = (self.rate_idx + 1) % RATES.len();
        self.tts
            .prewarm(self.selected_voice_entry(), self.current_rate());
        self.status_text = format!(">> RATE: {}x", self.current_rate());
        self.redraw();
    }

    fn toggle_pin(&mut self) {
        self.pinned = !self.pinned;
        unsafe {
            let insert_after = if self.pinned {
                HWND_TOPMOST
            } else {
                HWND_NOTOPMOST
            };
            let _ = SetWindowPos(self.hwnd, insert_after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
        }
        self.status_text = if self.pinned {
            ">> PINNED ON TOP".to_string()
        } else {
            ">> UNPINNED".to_string()
        };
        self.redraw();
    }

    fn stop_tts(&mut self) {
        self.tts.stop();
        self.tts_speaking = false;
        self.bench_active = false;
        self.active_reply_idx = None;
        self.queued_reply = None;
        self.status_text = ">> TTS STOPPED".to_string();
        self.redraw();
    }

    fn toggle_gap_wait(&mut self) {
        self.wait_for_gap = !self.wait_for_gap;
        if !self.wait_for_gap {
            if let Some((idx, text)) = self.queued_reply.take() {
                self.speak_text(text, Some(idx));
                return;
            }
        }
        self.status_text = if self.wait_for_gap {
            ">> GAP WAIT ON (waits for 650ms pause before speaking)".to_string()
        } else {
            ">> GAP WAIT OFF (speaks immediately)".to_string()
        };
        self.redraw();
    }

    fn toggle_benchmark(&mut self) {
        if self.bench_active {
            self.stop_tts();
            return;
        }
        if self.voices.is_empty() {
            return;
        }
        self.bench_active = true;
        let sample = get_window_text(self.edit_input);
        let sample_opt = if sample.trim().is_empty() {
            None
        } else {
            Some(sample)
        };
        self.status_text = format!(">> AUDITIONING {} VOICES...", self.voices.len());
        self.tts.benchmark(
            self.voices.clone(),
            sample_opt,
            self.current_rate(),
            self.output_device.clone(),
        );
        self.redraw();
    }

    fn should_gate_stt(&self) -> bool {
        // When piping TTS to a virtual cable (e.g. CABLE Input for Discord) while listening via
        // System Loopback, our own TTS doesn't play on local speakers so keep captions live!
        !(self.source == AudioSource::Loopback && self.output_device.is_some())
    }

    fn speak_text(&mut self, text: String, card_idx: Option<usize>) {
        self.bench_active = false;
        self.queued_reply = None;
        self.active_reply_idx = card_idx;
        let voice = self.selected_voice_entry();
        self.tts.speak(
            text,
            voice,
            self.current_rate(),
            self.output_device.clone(),
            self.should_gate_stt(),
        );
        self.redraw();
    }

    fn queue_or_speak(&mut self, text: String, card_idx: usize, force_now: bool) {
        const GAP_SILENCE_MS: u64 = 650;
        if !force_now
            && self.wait_for_gap
            && (self.tts_speaking || self.meter.speech_activity.is_talking_or_recent(GAP_SILENCE_MS))
        {
            self.queued_reply = Some((card_idx, text));
            self.status_text = ">> QUEUED: WAITING FOR SPEECH GAP...".to_string();
            self.redraw();
        } else {
            self.speak_text(text, Some(card_idx));
        }
    }

    fn check_gap_queue(&mut self) {
        const GAP_SILENCE_MS: u64 = 650;
        if self.tts_speaking {
            return;
        }
        if let Some((_, _)) = self.queued_reply {
            if !self.meter.speech_activity.is_talking_or_recent(GAP_SILENCE_MS) {
                if let Some((idx, text)) = self.queued_reply.take() {
                    self.speak_text(text, Some(idx));
                }
            }
        }
    }

    fn submit_speak(&mut self) {
        let text = get_window_text(self.edit_input);
        let trimmed = text.trim();
        if trimmed.is_empty() {
            // Pressing Enter/Speak with empty input while a reply is queued speaks it immediately.
            if let Some((idx, queued)) = self.queued_reply.take() {
                self.speak_text(queued, Some(idx));
            }
            return;
        }
        let owned = trimmed.to_string();
        self.reply_items.push(ReplyItem {
            time: now_hms(),
            text: owned.clone(),
        });
        let idx = self.reply_items.len() - 1;
        set_window_text(self.edit_input, "");
        self.right_scroll = i32::MAX;
        self.queue_or_speak(owned, idx, false);
        unsafe {
            let _ = SetFocus(self.edit_input);
        }
    }

    fn copy_heard_card(&mut self, idx: usize) {
        if let Some(item) = self.heard_items.get(idx) {
            if copy_to_clipboard(self.hwnd, &item.text) {
                self.status_text = format!(">> COPIED [#{}]", idx + 1);
                self.redraw();
            }
        }
    }

    fn export_transcript(&mut self) {
        if self.heard_items.is_empty() && self.reply_items.is_empty() {
            self.status_text = ">> NOTHING TO EXPORT".to_string();
            self.redraw();
            return;
        }
        let base_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("transcripts")))
            .unwrap_or_else(|| std::path::PathBuf::from("transcripts"));
        let _ = fs::create_dir_all(&base_dir);
        let st = unsafe { GetLocalTime() };
        let fname = format!(
            "speech_{:04}{:02}{:02}_{:02}{:02}{:02}.txt",
            st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond
        );
        let path = base_dir.join(&fname);
        if let Ok(mut f) = File::create(&path) {
            let _ = writeln!(f, "=== SPEECH_BRIDGE TRANSCRIPT ===");
            let _ = writeln!(f, "\n[INBOUND :: HEARD]");
            for item in &self.heard_items {
                if let Some(spk) = item.speaker_id {
                    let _ = writeln!(f, "[{}] [SPK {}] {}", item.time, spk, item.text);
                } else {
                    let _ = writeln!(f, "[{}] {}", item.time, item.text);
                }
            }
            let _ = writeln!(f, "\n[OUTBOUND :: REPLIES]");
            for item in &self.reply_items {
                let _ = writeln!(f, "[{}] {}", item.time, item.text);
            }
            self.status_text = format!(">> SAVED {fname}");
        } else {
            self.status_text = "!! EXPORT FAILED".to_string();
        }
        self.redraw();
    }

    fn clear_all(&mut self) {
        self.heard_items.clear();
        self.stable_hypothesis.clear();
        self.draft_hypothesis.clear();
        self.reply_items.clear();
        self.active_reply_idx = None;
        self.queued_reply = None;
        self.left_scroll = 0;
        self.right_scroll = 0;
        self.stt.reset_speakers();
        self.status_text = ">> CLEARED (SPEAKERS RESET)".to_string();
        self.redraw();
    }

    fn show_output_device_menu(&mut self) {
        let devices = list_output_devices();
        let has_cable = devices.iter().any(|d| {
            let l = d.to_ascii_lowercase();
            l.contains("cable input") || l.contains("voicemeeter") || l.contains("virtual")
        });
        unsafe {
            let Ok(menu) = CreatePopupMenu() else {
                return;
            };
            let def_w = to_wide("Default Speakers (Local Audio)");
            let def_flags = MF_STRING
                | if self.output_device.is_none() {
                    MF_CHECKED
                } else {
                    MF_UNCHECKED
                };
            let _ = AppendMenuW(menu, def_flags, 1, PCWSTR(def_w.as_ptr()));
            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());

            for (i, dev) in devices.iter().enumerate() {
                let checked = self.output_device.as_deref() == Some(dev.as_str());
                let flags = MF_STRING | if checked { MF_CHECKED } else { MF_UNCHECKED };
                let wide = to_wide(dev);
                let _ = AppendMenuW(menu, flags, i + 2, PCWSTR(wide.as_ptr()));
            }

            if !has_cable {
                let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                let tip_w = to_wide("Discord Tip: Install VB-Cable (vb-audio.com) for Virtual Mic");
                let _ = AppendMenuW(menu, MF_STRING, 9999, PCWSTR(tip_w.as_ptr()));
            }

            let mut pt = POINT {
                x: self.rect_output.left,
                y: self.rect_output.bottom + 2,
            };
            let _ = ClientToScreen(self.hwnd, &mut pt);
            let cmd = TrackPopupMenu(
                menu,
                TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD,
                pt.x,
                pt.y,
                0,
                self.hwnd,
                None,
            );
            let _ = DestroyMenu(menu);
            if cmd.0 == 1 {
                self.output_device = None;
                self.status_text = ">> TTS OUT: Default Speakers".to_string();
                self.redraw();
            } else if cmd.0 == 9999 {
                let _ = copy_to_clipboard(self.hwnd, "https://vb-audio.com/Cable/");
                self.status_text = ">> COPIED vb-audio.com/Cable/ URL (pick CABLE Input in OUT:)".to_string();
                self.redraw();
            } else if cmd.0 >= 2 {
                let idx = (cmd.0 as usize) - 2;
                if let Some(dev) = devices.get(idx) {
                    self.output_device = Some(dev.clone());
                    let short = short_mic_name(dev);
                    self.status_text = format!(">> TTS OUT: {short}");
                    self.redraw();
                }
            }
        }
    }

    fn show_voice_menu(&mut self) {
        if self.voices.is_empty() {
            return;
        }
        unsafe {
            let Ok(menu) = CreatePopupMenu() else {
                return;
            };
            for (i, v) in self.voices.iter().enumerate() {
                let label = format!("{} ({})", v.display_name, v.language);
                let wide = to_wide(&label);
                let flags = MF_STRING
                    | if i == self.selected_voice {
                        MF_CHECKED
                    } else {
                        MF_UNCHECKED
                    };
                let _ = AppendMenuW(menu, flags, i + 1, PCWSTR(wide.as_ptr()));
            }

            let mut pt = POINT {
                x: self.rect_voice.left,
                y: self.rect_voice.bottom + 2,
            };
            let _ = ClientToScreen(self.hwnd, &mut pt);
            let cmd = TrackPopupMenu(
                menu,
                TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD,
                pt.x,
                pt.y,
                0,
                self.hwnd,
                None,
            );
            let _ = DestroyMenu(menu);
            if cmd.0 > 0 {
                let idx = (cmd.0 as usize) - 1;
                if idx < self.voices.len() {
                    self.selected_voice = idx;
                    self.tts
                        .prewarm(self.selected_voice_entry(), self.current_rate());
                    self.redraw();
                }
            }
        }
    }

    fn handle_stt_events(&mut self) {
        let events = self.stt_queue.drain_all();
        for ev in events {
            match ev {
                SttEvent::Started { backend } => {
                    self.mic_active = true;
                    self.status_text = format!(">> RX LIVE [{backend}]");
                }
                SttEvent::Partial { stable, draft } => {
                    self.stable_hypothesis = stable;
                    self.draft_hypothesis = draft;
                    self.left_scroll = i32::MAX;
                }
                SttEvent::Final {
                    card_id,
                    text,
                    speaker_id,
                } => {
                    self.stable_hypothesis.clear();
                    self.draft_hypothesis.clear();
                    self.heard_items.push(HeardItem {
                        card_id,
                        time: now_hms(),
                        text,
                        speaker_id,
                        llm_polished: false,
                    });
                    self.left_scroll = i32::MAX;
                }
                SttEvent::Polished { card_id, text } => {
                    if let Some(item) = self
                        .heard_items
                        .iter_mut()
                        .rev()
                        .find(|h| h.card_id == card_id && card_id != 0)
                    {
                        item.text = text;
                        item.llm_polished = true;
                    }
                }
                SttEvent::Stopped => {
                    self.mic_active = false;
                    self.stable_hypothesis.clear();
                    self.draft_hypothesis.clear();
                    self.status_text = ">> STANDBY".to_string();
                }
                SttEvent::Error(msg) => {
                    self.mic_active = false;
                    self.stable_hypothesis.clear();
                    self.draft_hypothesis.clear();
                    self.status_text = format!("!! {msg}");
                }
            }
        }
        self.redraw();
    }

    fn layout(&mut self) {
        let mut rc = RECT::default();
        unsafe {
            let _ = GetClientRect(self.hwnd, &mut rc);
        }
        let w = (rc.right - rc.left).max(760);
        let h = (rc.bottom - rc.top).max(460);
        let pad = 14;
        let row_h = 30;
        let row1_y = pad;
        let row2_y = row1_y + row_h + 6;

        // --- Row 1: RX Arm | Engine | Mic Picker | Denoise | Speakers | LLM | A- | A+ | Health | Spectrum ---
        let mut x = pad;
        self.rect_mic = RECT { left: x, top: row1_y, right: x + 110, bottom: row1_y + row_h };
        x = self.rect_mic.right + 5;
        self.rect_engine = RECT { left: x, top: row1_y, right: x + 140, bottom: row1_y + row_h };
        x = self.rect_engine.right + 5;
        self.rect_input_picker = RECT { left: x, top: row1_y, right: x + 102, bottom: row1_y + row_h };
        x = self.rect_input_picker.right + 5;
        self.rect_denoise = RECT { left: x, top: row1_y, right: x + 112, bottom: row1_y + row_h };
        x = self.rect_denoise.right + 5;
        self.rect_speakers = RECT { left: x, top: row1_y, right: x + 72, bottom: row1_y + row_h };
        x = self.rect_speakers.right + 5;
        self.rect_llm = RECT { left: x, top: row1_y, right: x + 72, bottom: row1_y + row_h };
        x = self.rect_llm.right + 5;
        self.rect_font_down = RECT { left: x, top: row1_y, right: x + 32, bottom: row1_y + row_h };
        x = self.rect_font_down.right + 4;
        self.rect_font_up = RECT { left: x, top: row1_y, right: x + 32, bottom: row1_y + row_h };

        let right_space_left = self.rect_font_up.right + 8;
        let meter_w = 166.min((w - right_space_left - pad).max(76));
        let meter_left = (w - pad - meter_w).max(right_space_left + 104);
        self.rect_health = RECT {
            left: right_space_left,
            top: row1_y,
            right: (meter_left - 6).max(right_space_left + 40),
            bottom: row1_y + row_h,
        };
        self.rect_meter = RECT {
            left: meter_left,
            top: row1_y,
            right: (w - pad).max(meter_left + 60),
            bottom: row1_y + row_h,
        };

        // --- Row 2: Voice | Output Device | Gap Wait | Test | Rate | Pin | Export | Clear | Status ---
        let mut x2 = pad;
        self.rect_voice = RECT { left: x2, top: row2_y, right: x2 + 152, bottom: row2_y + row_h };
        x2 = self.rect_voice.right + 5;
        self.rect_output = RECT { left: x2, top: row2_y, right: x2 + 132, bottom: row2_y + row_h };
        x2 = self.rect_output.right + 5;
        self.rect_gap = RECT { left: x2, top: row2_y, right: x2 + 72, bottom: row2_y + row_h };
        x2 = self.rect_gap.right + 5;
        self.rect_bench = RECT { left: x2, top: row2_y, right: x2 + 54, bottom: row2_y + row_h };
        x2 = self.rect_bench.right + 5;
        self.rect_rate = RECT { left: x2, top: row2_y, right: x2 + 48, bottom: row2_y + row_h };
        x2 = self.rect_rate.right + 5;
        self.rect_pin = RECT { left: x2, top: row2_y, right: x2 + 50, bottom: row2_y + row_h };
        x2 = self.rect_pin.right + 5;
        self.rect_export = RECT { left: x2, top: row2_y, right: x2 + 50, bottom: row2_y + row_h };
        x2 = self.rect_export.right + 5;
        self.rect_clear = RECT { left: x2, top: row2_y, right: x2 + 50, bottom: row2_y + row_h };
        self.rect_status = RECT {
            left: self.rect_clear.right + 8,
            top: row2_y,
            right: w - pad,
            bottom: row2_y + row_h,
        };

        let pane_top = row2_y + row_h + 12;
        let col_w = (w - pad * 3) / 2;
        let right_x = pad * 2 + col_w;
        let header_h = 24;

        self.rect_left_feed = RECT {
            left: pad,
            top: pane_top + header_h,
            right: pad + col_w,
            bottom: h - pad,
        };

        let input_h = 62;
        self.rect_right_feed = RECT {
            left: right_x,
            top: pane_top + header_h,
            right: right_x + col_w,
            bottom: h - pad - input_h - 10,
        };

        let input_y = self.rect_right_feed.bottom + 10;
        let speak_w = 112;
        self.rect_input_box = RECT {
            left: right_x,
            top: input_y,
            right: right_x + col_w - speak_w - 8,
            bottom: input_y + input_h,
        };
        self.rect_speak = RECT {
            left: self.rect_input_box.right + 8,
            top: input_y,
            right: right_x + col_w,
            bottom: input_y + input_h,
        };

        unsafe {
            let _ = MoveWindow(
                self.edit_input,
                self.rect_input_box.left + 22,
                self.rect_input_box.top + 8,
                (self.rect_input_box.right - self.rect_input_box.left - 30).max(40),
                (input_h - 16).max(24),
                true,
            );
        }
        self.redraw();
    }

    fn hit_test(&self, pt: POINT) -> HitTarget {
        if pt_in_rect(pt, self.rect_mic) {
            return HitTarget::BtnMic;
        }
        if pt_in_rect(pt, self.rect_engine) {
            return HitTarget::BtnEngine;
        }
        if pt_in_rect(pt, self.rect_input_picker) {
            return HitTarget::BtnInputPicker;
        }
        if pt_in_rect(pt, self.rect_denoise) {
            return HitTarget::BtnDenoise;
        }
        if pt_in_rect(pt, self.rect_speakers) {
            return HitTarget::BtnSpeakers;
        }
        if pt_in_rect(pt, self.rect_llm) {
            return HitTarget::BtnLlm;
        }
        if pt_in_rect(pt, self.rect_font_down) {
            return HitTarget::BtnFontDown;
        }
        if pt_in_rect(pt, self.rect_font_up) {
            return HitTarget::BtnFontUp;
        }
        if pt_in_rect(pt, self.rect_health) {
            return HitTarget::HealthBadge;
        }
        if pt_in_rect(pt, self.rect_meter) {
            return HitTarget::MeterBadge;
        }
        if pt_in_rect(pt, self.rect_voice) {
            return HitTarget::BtnVoice;
        }
        if pt_in_rect(pt, self.rect_output) {
            return HitTarget::BtnOutputDevice;
        }
        if pt_in_rect(pt, self.rect_gap) {
            return HitTarget::BtnGapWait;
        }
        if pt_in_rect(pt, self.rect_bench) {
            return HitTarget::BtnTestVoices;
        }
        if pt_in_rect(pt, self.rect_rate) {
            return HitTarget::BtnRate;
        }
        if pt_in_rect(pt, self.rect_pin) {
            return HitTarget::BtnPin;
        }
        if pt_in_rect(pt, self.rect_export) {
            return HitTarget::BtnExport;
        }
        if pt_in_rect(pt, self.rect_clear) {
            return HitTarget::BtnClear;
        }
        if pt_in_rect(pt, self.rect_speak) {
            return HitTarget::BtnSpeak;
        }
        if pt_in_rect(pt, self.rect_left_feed) {
            for (i, r) in self.left_card_rects.iter().enumerate() {
                if pt_in_rect(pt, *r) {
                    return HitTarget::HeardCard(i);
                }
            }
        }
        if pt_in_rect(pt, self.rect_right_feed) {
            for (i, r) in self.card_rects.iter().enumerate() {
                if pt_in_rect(pt, *r) {
                    return HitTarget::ReplyCard(i);
                }
            }
        }
        HitTarget::None
    }

    fn render(&mut self, hdc_screen: HDC) {
        let mut rc = RECT::default();
        unsafe {
            let _ = GetClientRect(self.hwnd, &mut rc);
        }
        let w = (rc.right - rc.left).max(1);
        let h = (rc.bottom - rc.top).max(1);

        unsafe {
            let mem_dc = CreateCompatibleDC(hdc_screen);
            let bmp = CreateCompatibleBitmap(hdc_screen, w, h);
            let old_bmp = SelectObject(mem_dc, bmp);
            let old_font = SelectObject(mem_dc, self.font_mono);
            SetBkMode(mem_dc, TRANSPARENT);

            let bg_brush = CreateSolidBrush(C_BG);
            FillRect(mem_dc, &rc, bg_brush);
            let _ = DeleteObject(bg_brush);

            // Row 1: STT + Multi-Mic + Denoise + Speaker ID + Font + Health + Spectrum
            self.draw_mic_button(mem_dc);
            let eng_acc = match self.backend {
                SttBackend::ParakeetGpu => C_GREEN,
                SttBackend::DistilWhisperGpu => C_CYAN,
                SttBackend::Win11Captions => C_AMBER,
                SttBackend::WhisperCpuLegacy => C_MUTED,
            };
            self.draw_button(
                mem_dc,
                self.rect_engine,
                &format!("{} \u{25BE}", self.backend.button_label()),
                self.hover == HitTarget::BtnEngine,
                eng_acc,
                matches!(
                    self.backend,
                    SttBackend::ParakeetGpu | SttBackend::DistilWhisperGpu
                ),
            );

            let mic_count = self.meter.selected_mics().len().max(1);
            let (src_lbl, src_acc) = match self.source {
                AudioSource::Loopback => ("SRC: SYS \u{25BE}".to_string(), C_CYAN),
                AudioSource::Mic if mic_count > 1 => {
                    (format!("MICS:{mic_count} \u{25BE}"), C_GREEN)
                }
                AudioSource::Mic => ("MIC: 1 \u{25BE}".to_string(), C_GREEN),
            };
            self.draw_button(
                mem_dc,
                self.rect_input_picker,
                &src_lbl,
                self.hover == HitTarget::BtnInputPicker,
                src_acc,
                self.source == AudioSource::Loopback || mic_count > 1,
            );

            let dns_acc = match self.denoise_mode {
                DenoiseMode::Off => C_MUTED,
                DenoiseMode::Balanced => C_CYAN,
                DenoiseMode::Strong => C_GREEN,
                DenoiseMode::VoxLock => C_AMBER,
            };
            self.draw_button(
                mem_dc,
                self.rect_denoise,
                self.denoise_mode.button_label(),
                self.hover == HitTarget::BtnDenoise,
                dns_acc,
                self.denoise_mode != DenoiseMode::Off,
            );

            self.draw_button(
                mem_dc,
                self.rect_speakers,
                if self.speaker_labels { "SPK: ON" } else { "SPK:OFF" },
                self.hover == HitTarget::BtnSpeakers,
                if self.speaker_labels { C_VIOLET } else { C_MUTED },
                self.speaker_labels,
            );

            self.draw_button(
                mem_dc,
                self.rect_llm,
                if self.llm_polish { "LLM: ON" } else { "LLM:OFF" },
                self.hover == HitTarget::BtnLlm,
                if self.llm_polish { C_SKY } else { C_MUTED },
                self.llm_polish,
            );

            self.draw_button(
                mem_dc,
                self.rect_font_down,
                "A-",
                self.hover == HitTarget::BtnFontDown,
                C_CYAN,
                false,
            );
            self.draw_button(
                mem_dc,
                self.rect_font_up,
                "A+",
                self.hover == HitTarget::BtnFontUp,
                C_CYAN,
                false,
            );

            self.draw_signal_health(mem_dc);
            self.draw_freq_meter(mem_dc);

            // Row 2: TTS Voice + Output Device + Gap Wait + Test Voices + Rate + Pin + Export + Clear + Status
            let short_voice = self
                .selected_voice_label()
                .strip_prefix("Microsoft ")
                .unwrap_or(self.selected_voice_label());
            self.draw_button(
                mem_dc,
                self.rect_voice,
                &format!("VOICE: {short_voice} \u{25BE}"),
                self.hover == HitTarget::BtnVoice,
                C_CYAN,
                false,
            );
            let out_lbl = self.short_output_label();
            let out_custom = self.output_device.is_some();
            self.draw_button(
                mem_dc,
                self.rect_output,
                &out_lbl,
                self.hover == HitTarget::BtnOutputDevice,
                if out_custom { C_GREEN } else { C_CYAN },
                out_custom,
            );
            self.draw_button(
                mem_dc,
                self.rect_gap,
                if self.wait_for_gap { "GAP: ON" } else { "GAP:OFF" },
                self.hover == HitTarget::BtnGapWait,
                if self.wait_for_gap { C_AMBER } else { C_MUTED },
                self.wait_for_gap,
            );
            self.draw_button(
                mem_dc,
                self.rect_bench,
                if self.bench_active { "STOP" } else { "TEST" },
                self.hover == HitTarget::BtnTestVoices,
                if self.bench_active { C_RED } else { C_AMBER },
                self.bench_active,
            );
            self.draw_button(
                mem_dc,
                self.rect_rate,
                &format!("{}x", self.current_rate()),
                self.hover == HitTarget::BtnRate,
                C_CYAN,
                self.rate_idx != 1,
            );
            self.draw_button(
                mem_dc,
                self.rect_pin,
                if self.pinned { "PIN*" } else { "PIN" },
                self.hover == HitTarget::BtnPin,
                C_GREEN,
                self.pinned,
            );
            self.draw_button(
                mem_dc,
                self.rect_export,
                "EXP",
                self.hover == HitTarget::BtnExport,
                C_CYAN,
                false,
            );
            self.draw_button(
                mem_dc,
                self.rect_clear,
                "CLR",
                self.hover == HitTarget::BtnClear,
                C_AMBER,
                false,
            );

            // Status readout
            let status_color = if self.status_text.starts_with("!!") {
                C_RED
            } else if self.mic_active || self.tts_speaking {
                C_GREEN
            } else {
                C_CYAN
            };
            SelectObject(mem_dc, self.font_bold);
            SetTextColor(mem_dc, status_color);
            draw_text_single(
                mem_dc,
                &self.status_text,
                self.rect_status,
                DT_LEFT | DT_VCENTER,
            );

            // Pane Headers
            let left_hdr = RECT {
                left: self.rect_left_feed.left,
                top: self.rect_left_feed.top - 22,
                right: self.rect_left_feed.right,
                bottom: self.rect_left_feed.top - 2,
            };
            let right_hdr = RECT {
                left: self.rect_right_feed.left,
                top: self.rect_right_feed.top - 22,
                right: self.rect_right_feed.right,
                bottom: self.rect_right_feed.top - 2,
            };
            SelectObject(mem_dc, self.font_small);
            SetTextColor(mem_dc, if self.mic_active { C_GREEN } else { C_CYAN });
            draw_text_single(
                mem_dc,
                &format!(
                    "// INBOUND :: HEARD ({}px | CLICK CARD TO COPY | CTRL+/- ZOOM)",
                    self.caption_font_px
                ),
                left_hdr,
                DT_LEFT | DT_VCENTER,
            );
            SetTextColor(mem_dc, C_GREEN);
            draw_text_single(
                mem_dc,
                "// OUTBOUND :: VOICE_CARDS (AUTO-GATES STT WHILE SPEAKING | ESC STOP)",
                right_hdr,
                DT_LEFT | DT_VCENTER,
            );

            self.draw_left_feed(mem_dc);
            self.draw_right_feed(mem_dc);

            // Input Box Frame + Prompt Glyph
            let input_brush = CreateSolidBrush(C_CARD);
            FillRect(mem_dc, &self.rect_input_box, input_brush);
            let _ = DeleteObject(input_brush);
            draw_border(mem_dc, self.rect_input_box, C_GREEN_DIM);
            SelectObject(mem_dc, self.font_bold);
            SetTextColor(mem_dc, C_GREEN);
            let prompt_rc = RECT {
                left: self.rect_input_box.left + 8,
                top: self.rect_input_box.top + 8,
                right: self.rect_input_box.left + 22,
                bottom: self.rect_input_box.top + 28,
            };
            draw_text_single(mem_dc, ">", prompt_rc, DT_LEFT);

            self.draw_button(
                mem_dc,
                self.rect_speak,
                "SPEAK \u{21B5}",
                self.hover == HitTarget::BtnSpeak,
                C_GREEN,
                false,
            );

            self.draw_hover_tooltip(mem_dc, w, h);

            BitBlt(hdc_screen, 0, 0, w, h, mem_dc, 0, 0, SRCCOPY).ok();
            SelectObject(mem_dc, old_font);
            SelectObject(mem_dc, old_bmp);
            let _ = DeleteObject(bmp);
            let _ = DeleteDC(mem_dc);
        }
    }

    unsafe fn draw_signal_health(&mut self, hdc: HDC) {
        use std::fmt::Write as _;
        let rc = self.rect_health;
        if rc.right - rc.left < 50 {
            return;
        }
        self.health_buf.clear();
        let status = if let Ok(g) = self.meter.data.lock() {
            if g.status == SignalStatus::TtsMuted {
                self.health_buf.push_str("TTS GATE (MUTED)");
            } else if g.active_mic_count > 1 && !g.active_mic_name.is_empty() {
                let _ = write!(
                    self.health_buf,
                    "{} {:+.0}dB | ",
                    g.status.short_label(),
                    g.snr_db.clamp(-10.0, 40.0)
                );
                push_short_mic_name(&g.active_mic_name, &mut self.health_buf);
            } else {
                let _ = write!(
                    self.health_buf,
                    "SIG: {} ({:+.0}dB)",
                    g.status.short_label(),
                    g.snr_db.clamp(-10.0, 40.0)
                );
            }
            g.status
        } else {
            self.health_buf.push_str("SIG: QUIET");
            SignalStatus::Standby
        };

        let (bg, fg) = match status {
            SignalStatus::Clear => (C_GREEN_BG, C_GREEN),
            SignalStatus::TtsMuted => (C_CARD, C_CYAN),
            SignalStatus::Noisy => (C_AMBER_BG, C_AMBER),
            SignalStatus::Drowned | SignalStatus::Clipping => (C_RED_BG, C_RED),
            SignalStatus::Standby => (C_PANE, C_MUTED),
        };

        let br = CreateSolidBrush(bg);
        FillRect(hdc, &rc, br);
        let _ = DeleteObject(br);
        draw_border(hdc, rc, fg);

        SelectObject(hdc, self.font_small);
        SetTextColor(hdc, fg);
        let pad_rc = RECT {
            left: rc.left + 6,
            top: rc.top,
            right: rc.right - 6,
            bottom: rc.bottom,
        };
        draw_text_single(hdc, &self.health_buf, pad_rc, DT_CENTER | DT_VCENTER);
    }

    unsafe fn draw_hover_tooltip(&self, hdc: HDC, win_w: i32, win_h: i32) {
        let Some((title, desc)) = tooltip_for(self.hover) else {
            return;
        };
        let box_w = 340.min((win_w - 28).max(180));
        let inner_w = box_w - 20;

        SelectObject(hdc, self.font_small);
        let desc_h = measure_wrapped_height(hdc, desc, inner_w);
        let box_h = 26 + desc_h + 12;

        let mut left = self.hover_pt.x + 12;
        if left + box_w > win_w - 10 {
            left = (win_w - 10 - box_w).max(10);
        }
        let mut top = self.hover_pt.y + 20;
        if top + box_h > win_h - 10 {
            top = (self.hover_pt.y - box_h - 10).max(10);
        }

        let tip_rc = RECT {
            left,
            top,
            right: left + box_w,
            bottom: top + box_h,
        };

        let bg = CreateSolidBrush(C_PANE);
        FillRect(hdc, &tip_rc, bg);
        let _ = DeleteObject(bg);
        draw_border(hdc, tip_rc, C_CYAN);
        draw_accent_stripe(hdc, tip_rc, C_GREEN);

        SelectObject(hdc, self.font_bold);
        SetTextColor(hdc, C_CYAN);
        let title_rc = RECT {
            left: tip_rc.left + 10,
            top: tip_rc.top + 6,
            right: tip_rc.right - 10,
            bottom: tip_rc.top + 22,
        };
        draw_text_single(hdc, title, title_rc, DT_LEFT | DT_VCENTER);

        SelectObject(hdc, self.font_small);
        SetTextColor(hdc, C_TEXT);
        let body_rc = RECT {
            left: tip_rc.left + 10,
            top: tip_rc.top + 24,
            right: tip_rc.right - 10,
            bottom: tip_rc.bottom - 8,
        };
        draw_text_wrapped(hdc, desc, body_rc);
    }

    unsafe fn draw_mic_button(&self, hdc: HDC) {
        let hovered = self.hover == HitTarget::BtnMic;
        let (fill_c, border_c, dot_c, text) = if self.mic_active {
            (C_GREEN_BG, C_GREEN, C_GREEN, "  RX: ARMED")
        } else if hovered {
            (C_CARD_HOVER, C_CYAN, C_RED, "  RX: OFF")
        } else {
            (C_CARD, C_BORDER, C_RED, "  RX: OFF")
        };

        let br = CreateSolidBrush(fill_c);
        FillRect(hdc, &self.rect_mic, br);
        let _ = DeleteObject(br);
        draw_border(hdc, self.rect_mic, border_c);

        let dot_br = CreateSolidBrush(dot_c);
        let dot_pen = CreatePen(PS_SOLID, 1, dot_c);
        let old_br = SelectObject(hdc, dot_br);
        let old_pen = SelectObject(hdc, dot_pen);
        let cy = (self.rect_mic.top + self.rect_mic.bottom) / 2;
        let _ = Ellipse(
            hdc,
            self.rect_mic.left + 10,
            cy - 4,
            self.rect_mic.left + 18,
            cy + 4,
        );
        SelectObject(hdc, old_br);
        SelectObject(hdc, old_pen);
        let _ = DeleteObject(dot_br);
        let _ = DeleteObject(dot_pen);

        SelectObject(hdc, self.font_bold);
        SetTextColor(hdc, if self.mic_active { C_GREEN } else { C_TEXT });
        let trc = RECT {
            left: self.rect_mic.left + 16,
            top: self.rect_mic.top,
            right: self.rect_mic.right - 4,
            bottom: self.rect_mic.bottom,
        };
        draw_text_single(hdc, text, trc, DT_LEFT | DT_VCENTER);
    }

    unsafe fn draw_button(
        &self,
        hdc: HDC,
        rc: RECT,
        label: &str,
        hovered: bool,
        accent: COLORREF,
        active: bool,
    ) {
        let fill = if active {
            C_GREEN_BG
        } else if hovered {
            C_CARD_HOVER
        } else {
            C_CARD
        };
        let border = if active || hovered { accent } else { C_BORDER };
        let br = CreateSolidBrush(fill);
        FillRect(hdc, &rc, br);
        let _ = DeleteObject(br);
        draw_border(hdc, rc, border);

        SelectObject(hdc, self.font_bold);
        SetTextColor(hdc, if active || hovered { accent } else { C_TEXT });
        draw_text_single(hdc, label, rc, DT_CENTER | DT_VCENTER);
    }

    unsafe fn draw_freq_meter(&self, hdc: HDC) {
        let rc = self.rect_meter;
        if rc.right - rc.left < 60 {
            return;
        }
        let br = CreateSolidBrush(C_PANE);
        FillRect(hdc, &rc, br);
        let _ = DeleteObject(br);
        draw_border(hdc, rc, if self.mic_active { C_GREEN_DIM } else { C_BORDER });

        let (bands, peak) = if let Ok(g) = self.meter.data.lock() {
            (g.bands, g.peak)
        } else {
            ([0.0; BANDS], 0.0)
        };

        let label_w = 42;
        SelectObject(hdc, self.font_small);
        SetTextColor(hdc, if peak > 0.05 { C_GREEN } else { C_MUTED });
        let lbl_rc = RECT {
            left: rc.left + 5,
            top: rc.top,
            right: rc.left + label_w,
            bottom: rc.bottom,
        };
        draw_text_single(
            hdc,
            &format!("{:3}%", (peak * 100.0).round() as i32),
            lbl_rc,
            DT_LEFT | DT_VCENTER,
        );

        let bar_area_left = rc.left + label_w + 2;
        let bar_area_right = rc.right - 5;
        let area_w = (bar_area_right - bar_area_left).max(BANDS as i32 * 2);
        let top_pad = 4;
        let bot_pad = 4;
        let max_h = (rc.bottom - rc.top - top_pad - bot_pad).max(6);
        let slot_w = (area_w / BANDS as i32).max(2);
        let bar_w = (slot_w - 1).max(1);

        let br_dim = CreateSolidBrush(C_BORDER);
        let br_green = CreateSolidBrush(C_GREEN);
        let br_cyan = CreateSolidBrush(C_CYAN);
        let br_amber = CreateSolidBrush(C_AMBER);
        let br_red = CreateSolidBrush(C_RED);

        for (i, &val) in bands.iter().enumerate() {
            let x = bar_area_left + (i as i32) * slot_w;
            if x + bar_w > bar_area_right {
                break;
            }
            let bar_h = ((val * max_h as f32).round() as i32).clamp(2, max_h);
            let bg_rc = RECT {
                left: x,
                top: rc.top + top_pad,
                right: x + bar_w,
                bottom: rc.bottom - bot_pad,
            };
            FillRect(hdc, &bg_rc, br_dim);

            let fg_rc = RECT {
                left: x,
                top: rc.bottom - bot_pad - bar_h,
                right: x + bar_w,
                bottom: rc.bottom - bot_pad,
            };
            let brush = if val > 0.85 {
                br_red
            } else if val > 0.65 {
                br_amber
            } else if val > 0.35 {
                br_cyan
            } else {
                br_green
            };
            FillRect(hdc, &fg_rc, brush);
        }

        let _ = DeleteObject(br_dim);
        let _ = DeleteObject(br_green);
        let _ = DeleteObject(br_cyan);
        let _ = DeleteObject(br_amber);
        let _ = DeleteObject(br_red);
    }

    unsafe fn draw_left_feed(&mut self, hdc: HDC) {
        let pane = self.rect_left_feed;
        let br = CreateSolidBrush(C_PANE);
        FillRect(hdc, &pane, br);
        let _ = DeleteObject(br);
        draw_border(
            hdc,
            pane,
            if self.mic_active { C_GREEN_DIM } else { C_BORDER },
        );

        let saved = SaveDC(hdc);
        let _ = IntersectClipRect(
            hdc,
            pane.left + 1,
            pane.top + 1,
            pane.right - 1,
            pane.bottom - 1,
        );

        let pad = 10;
        let inner_w = (pane.right - pane.left - pad * 2 - 18).max(60);

        let mut total_h = pad;
        let mut item_heights = Vec::with_capacity(self.heard_items.len());
        SelectObject(hdc, self.font_caption);
        for item in &self.heard_items {
            let th = measure_wrapped_height(hdc, &item.text, inner_w);
            let card_h = 24 + th + 10;
            item_heights.push(card_h);
            total_h += card_h + 8;
        }

        let has_hyp = !self.stable_hypothesis.is_empty() || !self.draft_hypothesis.is_empty();
        let stable_h = if !self.stable_hypothesis.is_empty() {
            measure_wrapped_height(hdc, &format!(">_ {}", self.stable_hypothesis), inner_w)
        } else {
            0
        };
        let draft_h = if !self.draft_hypothesis.is_empty() {
            measure_wrapped_height(hdc, &format!("~ {}", self.draft_hypothesis), inner_w)
        } else {
            0
        };
        let hyp_h = if has_hyp {
            let gap = if stable_h > 0 && draft_h > 0 { 4 } else { 0 };
            stable_h + draft_h + gap + 18
        } else {
            0
        };
        if hyp_h > 0 {
            total_h += hyp_h + 8;
        }

        let view_h = pane.bottom - pane.top;
        self.left_max_scroll = (total_h - view_h).max(0);
        if self.left_scroll > self.left_max_scroll {
            self.left_scroll = self.left_max_scroll;
        }
        if self.left_scroll < 0 {
            self.left_scroll = 0;
        }

        self.left_card_rects.clear();
        let mut y = pane.top + pad - self.left_scroll;
        if self.heard_items.is_empty() && !has_hyp {
            SelectObject(hdc, self.font_caption);
            SetTextColor(hdc, C_MUTED);
            let empty_rc = RECT {
                left: pane.left + 14,
                top: pane.top + 14,
                right: pane.right - 14,
                bottom: pane.top + 100,
            };
            draw_text_wrapped(
                hdc,
                "// RTX Neural STT Armed. Pick 1 or multiple mics via [MIC], adjust [DNS] for noisy cafes, or press Ctrl+/Ctrl- to zoom text.",
                empty_rc,
            );
        } else {
            for (i, item) in self.heard_items.iter().enumerate() {
                let card_h = item_heights[i];
                let card_rc = RECT {
                    left: pane.left + pad,
                    top: y,
                    right: pane.right - pad,
                    bottom: y + card_h,
                };
                self.left_card_rects.push(card_rc);
                if card_rc.bottom >= pane.top && card_rc.top <= pane.bottom {
                    let accent = speaker_color(item.speaker_id);
                    let is_hovered = self.hover == HitTarget::HeardCard(i);
                    let cbr = CreateSolidBrush(if is_hovered { C_CARD_HOVER } else { C_CARD });
                    FillRect(hdc, &card_rc, cbr);
                    let _ = DeleteObject(cbr);
                    draw_border(hdc, card_rc, if is_hovered { accent } else { C_BORDER });
                    draw_accent_stripe(hdc, card_rc, accent);

                    SelectObject(hdc, self.font_small);
                    SetTextColor(hdc, accent);
                    let hdr_rc = RECT {
                        left: card_rc.left + 10,
                        top: card_rc.top + 5,
                        right: card_rc.right - 90,
                        bottom: card_rc.top + 21,
                    };
                    let llm_tag = if item.llm_polished { "  [LLM]" } else { "" };
                    let hdr_txt = match item.speaker_id {
                        Some(sid) => format!("[{}]  [SPK {}]{llm_tag}", item.time, sid),
                        None => format!("[{}]  RX{llm_tag}", item.time),
                    };
                    draw_text_single(hdc, &hdr_txt, hdr_rc, DT_LEFT);

                    if is_hovered {
                        let copy_rc = RECT {
                            left: card_rc.right - 90,
                            top: card_rc.top + 5,
                            right: card_rc.right - 10,
                            bottom: card_rc.top + 21,
                        };
                        draw_text_single(hdc, "COPY", copy_rc, DT_RIGHT);
                    }

                    SelectObject(hdc, self.font_caption);
                    SetTextColor(hdc, C_TEXT_CYAN);
                    let body_rc = RECT {
                        left: card_rc.left + 10,
                        top: card_rc.top + 23,
                        right: card_rc.right - 8,
                        bottom: card_rc.bottom - 6,
                    };
                    draw_text_wrapped(hdc, &item.text, body_rc);
                }
                y += card_h + 8;
            }

            // Two-tone LocalAgreement live streaming box (bright locked prefix + dim amber draft)
            if hyp_h > 0 {
                let h_rc = RECT {
                    left: pane.left + pad,
                    top: y,
                    right: pane.right - pad,
                    bottom: y + hyp_h,
                };
                let cbr = CreateSolidBrush(C_GREEN_BG);
                FillRect(hdc, &h_rc, cbr);
                let _ = DeleteObject(cbr);
                draw_border(hdc, h_rc, C_CYAN);
                draw_accent_stripe(hdc, h_rc, C_GREEN);

                SelectObject(hdc, self.font_caption);
                let mut cur_y = h_rc.top + 8;
                if stable_h > 0 {
                    SetTextColor(hdc, C_TEXT);
                    let s_rc = RECT {
                        left: h_rc.left + 10,
                        top: cur_y,
                        right: h_rc.right - 8,
                        bottom: cur_y + stable_h + 2,
                    };
                    draw_text_wrapped(hdc, &format!(">_ {}", self.stable_hypothesis), s_rc);
                    cur_y += stable_h + 4;
                }
                if draft_h > 0 {
                    SetTextColor(hdc, C_AMBER);
                    let d_rc = RECT {
                        left: h_rc.left + 10,
                        top: cur_y,
                        right: h_rc.right - 8,
                        bottom: h_rc.bottom - 6,
                    };
                    draw_text_wrapped(hdc, &format!("~ {}", self.draft_hypothesis), d_rc);
                }
            }
        }

        let _ = RestoreDC(hdc, saved);
    }

    unsafe fn draw_right_feed(&mut self, hdc: HDC) {
        let pane = self.rect_right_feed;
        let br = CreateSolidBrush(C_PANE);
        FillRect(hdc, &pane, br);
        let _ = DeleteObject(br);
        draw_border(hdc, pane, C_BORDER);

        let saved = SaveDC(hdc);
        let _ = IntersectClipRect(
            hdc,
            pane.left + 1,
            pane.top + 1,
            pane.right - 1,
            pane.bottom - 1,
        );

        let pad = 10;
        let inner_w = (pane.right - pane.left - pad * 2 - 16).max(60);

        let mut total_h = pad;
        let mut item_heights = Vec::with_capacity(self.reply_items.len());
        SelectObject(hdc, self.font_mono);
        for item in &self.reply_items {
            let th = measure_wrapped_height(hdc, &item.text, inner_w);
            let card_h = 26 + th + 10;
            item_heights.push(card_h);
            total_h += card_h + 8;
        }

        let view_h = pane.bottom - pane.top;
        self.right_max_scroll = (total_h - view_h).max(0);
        if self.right_scroll > self.right_max_scroll {
            self.right_scroll = self.right_max_scroll;
        }
        if self.right_scroll < 0 {
            self.right_scroll = 0;
        }

        self.card_rects.clear();
        let mut y = pane.top + pad - self.right_scroll;
        if self.reply_items.is_empty() {
            SelectObject(hdc, self.font_mono);
            SetTextColor(hdc, C_MUTED);
            let empty_rc = RECT {
                left: pane.left + 14,
                top: pane.top + 14,
                right: pane.right - 14,
                bottom: pane.top + 60,
            };
            draw_text_wrapped(
                hdc,
                "// Type below & press [ENTER] to speak. Mic auto-gates while TTS plays so your reply won't echo into HEARD.",
                empty_rc,
            );
        } else {
            for (i, item) in self.reply_items.iter().enumerate() {
                let card_h = item_heights[i];
                let card_rc = RECT {
                    left: pane.left + pad,
                    top: y,
                    right: pane.right - pad,
                    bottom: y + card_h,
                };
                self.card_rects.push(card_rc);

                if card_rc.bottom >= pane.top && card_rc.top <= pane.bottom {
                    let is_hovered = self.hover == HitTarget::ReplyCard(i);
                    let is_active = self.tts_speaking && self.active_reply_idx == Some(i);
                    let is_queued = !is_active
                        && self.queued_reply.as_ref().map(|(qi, _)| *qi == i).unwrap_or(false);
                    let (fill_c, border_c) = if is_active {
                        (C_CARD_ACTIVE, C_GREEN)
                    } else if is_queued {
                        (C_AMBER_BG, C_AMBER)
                    } else if is_hovered {
                        (C_CARD_HOVER, C_GREEN)
                    } else {
                        (C_CARD, C_BORDER)
                    };

                    let cbr = CreateSolidBrush(fill_c);
                    FillRect(hdc, &card_rc, cbr);
                    let _ = DeleteObject(cbr);
                    draw_border(hdc, card_rc, border_c);
                    draw_accent_stripe(hdc, card_rc, if is_queued { C_AMBER } else { C_GREEN });

                    SelectObject(hdc, self.font_small);
                    SetTextColor(
                        hdc,
                        if is_queued {
                            C_AMBER
                        } else if is_hovered || is_active {
                            C_GREEN
                        } else {
                            C_GREEN_DIM
                        },
                    );
                    let hdr_left = RECT {
                        left: card_rc.left + 10,
                        top: card_rc.top + 5,
                        right: card_rc.right - 140,
                        bottom: card_rc.top + 22,
                    };
                    draw_text_single(
                        hdc,
                        &format!("[#{:02}] {}", i + 1, item.time),
                        hdr_left,
                        DT_LEFT,
                    );

                    let hdr_right = RECT {
                        left: card_rc.right - 170,
                        top: card_rc.top + 5,
                        right: card_rc.right - 10,
                        bottom: card_rc.top + 22,
                    };
                    let tag = if is_active {
                        "\u{25B6} SPEAKING..."
                    } else if is_queued {
                        "\u{23F3} WAIT GAP (CLICK NOW)"
                    } else if is_hovered {
                        "\u{25B6} CLICK TO SPEAK"
                    } else {
                        "\u{25B6} RE-SPEAK"
                    };
                    draw_text_single(hdc, tag, hdr_right, DT_RIGHT);

                    SelectObject(hdc, self.font_mono);
                    SetTextColor(hdc, C_TEXT);
                    let body_rc = RECT {
                        left: card_rc.left + 10,
                        top: card_rc.top + 25,
                        right: card_rc.right - 10,
                        bottom: card_rc.bottom - 6,
                    };
                    if is_active {
                        if let Some(word_idx) = self.active_tts_word {
                            draw_text_wrapped_highlight_word(
                                hdc,
                                &item.text,
                                body_rc,
                                self.font_mono,
                                self.font_mono_active,
                                word_idx,
                            );
                        } else {
                            draw_text_wrapped(hdc, &item.text, body_rc);
                        }
                    } else {
                        draw_text_wrapped(hdc, &item.text, body_rc);
                    }
                }
                y += card_h + 8;
            }
        }

        let _ = RestoreDC(hdc, saved);
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        self.stt.stop();
        self.tts.stop();
        unsafe {
            let _ = DeleteObject(self.font_mono);
            let _ = DeleteObject(self.font_mono_active);
            let _ = DeleteObject(self.font_caption);
            let _ = DeleteObject(self.font_bold);
            let _ = DeleteObject(self.font_small);
            let _ = DeleteObject(self.brush_input);
        }
    }
}

/// Main window procedure.
pub unsafe extern "system" fn main_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_ERASEBKGND => LRESULT(1),
        WM_CREATE => {
            let state = create_app_state(hwnd);
            let ptr = Box::into_raw(state) as isize;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, ptr);
            if let Some(st) = get_state(hwnd) {
                st.layout();
                let _ = SetFocus(st.edit_input);
            }
            LRESULT(0)
        }
        WM_SIZE => {
            if let Some(st) = get_state(hwnd) {
                st.layout();
            }
            LRESULT(0)
        }
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            if let Some(st) = get_state(hwnd) {
                st.render(hdc);
            }
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_KEYDOWN => {
            let ctrl = (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            if wparam.0 == VK_ESCAPE.0 as usize {
                if let Some(st) = get_state(hwnd) {
                    st.stop_tts();
                }
                return LRESULT(0);
            }
            if ctrl {
                if wparam.0 == b'T' as usize {
                    if let Some(st) = get_state(hwnd) {
                        st.toggle_pin();
                    }
                    return LRESULT(0);
                }
                if wparam.0 == VK_OEM_PLUS.0 as usize || wparam.0 == VK_ADD.0 as usize {
                    if let Some(st) = get_state(hwnd) {
                        st.adjust_caption_font(2);
                    }
                    return LRESULT(0);
                }
                if wparam.0 == VK_OEM_MINUS.0 as usize || wparam.0 == VK_SUBTRACT.0 as usize {
                    if let Some(st) = get_state(hwnd) {
                        st.adjust_caption_font(-2);
                    }
                    return LRESULT(0);
                }
                if wparam.0 == b'0' as usize {
                    if let Some(st) = get_state(hwnd) {
                        st.adjust_caption_font(0);
                    }
                    return LRESULT(0);
                }
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_MOUSEMOVE => {
            let pt = lparam_point(lparam);
            if let Some(st) = get_state(hwnd) {
                let hit = st.hit_test(pt);
                let had_tip = tooltip_for(st.hover).is_some();
                let has_tip = tooltip_for(hit).is_some();
                st.hover_pt = pt;
                if hit != st.hover || had_tip || has_tip {
                    st.hover = hit;
                    st.redraw();
                }
            }
            LRESULT(0)
        }
        WM_SETCURSOR => {
            if let Some(st) = get_state(hwnd) {
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                let _ = ScreenToClient(hwnd, &mut pt);
                let hit = st.hit_test(pt);
                if !matches!(
                    hit,
                    HitTarget::None | HitTarget::HealthBadge | HitTarget::MeterBadge
                ) {
                    if let Ok(hand) = LoadCursorW(None, IDC_HAND) {
                        SetCursor(hand);
                        return LRESULT(1);
                    }
                }
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_LBUTTONDOWN => {
            let pt = lparam_point(lparam);
            if let Some(st) = get_state(hwnd) {
                match st.hit_test(pt) {
                    HitTarget::BtnMic => st.toggle_mic(),
                    HitTarget::BtnEngine => st.show_engine_menu(),
                    HitTarget::BtnInputPicker => st.show_input_picker_menu(),
                    HitTarget::BtnDenoise => st.cycle_denoise(),
                    HitTarget::BtnSpeakers => st.toggle_speakers(),
                    HitTarget::BtnLlm => st.toggle_llm_polish(),
                    HitTarget::BtnFontDown => st.adjust_caption_font(-2),
                    HitTarget::BtnFontUp => st.adjust_caption_font(2),
                    HitTarget::BtnVoice => st.show_voice_menu(),
                    HitTarget::BtnOutputDevice => st.show_output_device_menu(),
                    HitTarget::BtnGapWait => st.toggle_gap_wait(),
                    HitTarget::BtnTestVoices => st.toggle_benchmark(),
                    HitTarget::BtnRate => st.cycle_rate(),
                    HitTarget::BtnPin => st.toggle_pin(),
                    HitTarget::BtnExport => st.export_transcript(),
                    HitTarget::BtnClear => st.clear_all(),
                    HitTarget::BtnSpeak => st.submit_speak(),
                    HitTarget::HeardCard(idx) => st.copy_heard_card(idx),
                    HitTarget::ReplyCard(idx) => {
                        let is_queued = st.queued_reply.as_ref().map(|(qi, _)| *qi == idx).unwrap_or(false);
                        if let Some(item) = st.reply_items.get(idx) {
                            let text = item.text.clone();
                            st.queue_or_speak(text, idx, is_queued);
                        }
                    }
                    HitTarget::HealthBadge | HitTarget::MeterBadge | HitTarget::None => {}
                }
            }
            LRESULT(0)
        }
        WM_MOUSEWHEEL => {
            let delta = ((wparam.0 >> 16) as u16 as i16) as i32;
            let mut pt = lparam_point(lparam);
            let _ = ScreenToClient(hwnd, &mut pt);
            if let Some(st) = get_state(hwnd) {
                let step = -(delta / 120) * 44;
                if pt_in_rect(pt, st.rect_left_feed) {
                    st.left_scroll = (st.left_scroll + step).clamp(0, st.left_max_scroll);
                    st.redraw();
                } else if pt_in_rect(pt, st.rect_right_feed) {
                    st.right_scroll = (st.right_scroll + step).clamp(0, st.right_max_scroll);
                    st.redraw();
                }
            }
            LRESULT(0)
        }
        WM_APP_STT_EVENT => {
            if let Some(st) = get_state(hwnd) {
                st.handle_stt_events();
            }
            LRESULT(0)
        }
        WM_APP_TTS_STATUS => {
            if let Some(st) = get_state(hwnd) {
                st.tts_speaking = wparam.0 != 0;
                if st.tts_speaking {
                    st.active_tts_word = st.tts.current_word_index();
                    st.status_text = ">> TX AUDIO (STT GATED)...".to_string();
                } else {
                    st.active_reply_idx = None;
                    st.active_tts_word = None;
                    st.status_text = if st.mic_active {
                        st.backend.live_status().to_string()
                    } else {
                        ">> STANDBY".to_string()
                    };
                }
                st.redraw();
            }
            LRESULT(0)
        }
        WM_APP_SPEAK_SUBMIT => {
            if let Some(st) = get_state(hwnd) {
                st.submit_speak();
            }
            LRESULT(0)
        }
        WM_APP_STOP_TTS => {
            if let Some(st) = get_state(hwnd) {
                st.stop_tts();
            }
            LRESULT(0)
        }
        WM_APP_TOGGLE_PIN => {
            if let Some(st) = get_state(hwnd) {
                st.toggle_pin();
            }
            LRESULT(0)
        }
        WM_APP_FONT_DELTA => {
            if let Some(st) = get_state(hwnd) {
                let delta = wparam.0 as isize as i32;
                st.adjust_caption_font(delta);
            }
            LRESULT(0)
        }
        WM_APP_BENCH_PROGRESS => {
            if let Some(st) = get_state(hwnd) {
                if wparam.0 != 0 {
                    st.bench_active = true;
                    st.status_text = st.tts.take_bench_status();
                } else {
                    st.bench_active = false;
                    st.status_text = ">> BENCH COMPLETE".to_string();
                }
                st.redraw();
            }
            LRESULT(0)
        }
        WM_APP_METER_TICK => {
            if let Some(st) = get_state(hwnd) {
                let _ = InvalidateRect(hwnd, Some(&st.rect_meter), false);
                let _ = InvalidateRect(hwnd, Some(&st.rect_health), false);
                st.check_gap_queue();
                if st.tts_speaking {
                    let cur = st.tts.current_word_index();
                    if cur != st.active_tts_word {
                        st.active_tts_word = cur;
                        let _ = InvalidateRect(hwnd, Some(&st.rect_right_feed), false);
                    }
                }
            }
            LRESULT(0)
        }
        WM_CTLCOLOREDIT => {
            let hdc = HDC(wparam.0 as *mut core::ffi::c_void);
            if let Some(st) = get_state(hwnd) {
                SetTextColor(hdc, C_GREEN);
                SetBkColor(hdc, C_CARD);
                return LRESULT(st.brush_input.0 as isize);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        WM_NCDESTROY => {
            let ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            if ptr != 0 {
                drop(Box::from_raw(ptr as *mut AppState));
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Subclassed procedure for the reply input box (Enter = Speak, Esc = Stop TTS, Ctrl+T = Pin, Ctrl+/- = Zoom).
unsafe extern "system" fn input_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let parent = GetParent(hwnd).unwrap_or_default();
    let orig_proc = get_state(parent).and_then(|s| s.orig_input_proc);

    if msg == WM_KEYDOWN {
        let ctrl = (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
        if wparam.0 == 0x0D {
            let shift_down = (GetKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            if !shift_down {
                let _ = PostMessageW(parent, WM_APP_SPEAK_SUBMIT, WPARAM(0), LPARAM(0));
                return LRESULT(0);
            }
        } else if wparam.0 == VK_ESCAPE.0 as usize {
            let _ = PostMessageW(parent, WM_APP_STOP_TTS, WPARAM(0), LPARAM(0));
            return LRESULT(0);
        } else if ctrl && wparam.0 == b'T' as usize {
            let _ = PostMessageW(parent, WM_APP_TOGGLE_PIN, WPARAM(0), LPARAM(0));
            return LRESULT(0);
        } else if ctrl && (wparam.0 == VK_OEM_PLUS.0 as usize || wparam.0 == VK_ADD.0 as usize) {
            let _ = PostMessageW(parent, WM_APP_FONT_DELTA, WPARAM(2isize as usize), LPARAM(0));
            return LRESULT(0);
        } else if ctrl && (wparam.0 == VK_OEM_MINUS.0 as usize || wparam.0 == VK_SUBTRACT.0 as usize) {
            let _ = PostMessageW(parent, WM_APP_FONT_DELTA, WPARAM((-2isize) as usize), LPARAM(0));
            return LRESULT(0);
        } else if ctrl && wparam.0 == b'0' as usize {
            let _ = PostMessageW(parent, WM_APP_FONT_DELTA, WPARAM(0), LPARAM(0));
            return LRESULT(0);
        }
    }
    if msg == WM_CHAR && wparam.0 == 0x0D {
        let shift_down = (GetKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
        if !shift_down {
            return LRESULT(0);
        }
    }

    if let Some(orig) = orig_proc {
        CallWindowProcW(Some(orig), hwnd, msg, wparam, lparam)
    } else {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

unsafe fn get_state<'a>(hwnd: HWND) -> Option<&'a mut AppState> {
    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
    if ptr == 0 {
        None
    } else {
        Some(&mut *(ptr as *mut AppState))
    }
}

unsafe fn create_app_state(hwnd: HWND) -> Box<AppState> {
    let hinst = HINSTANCE(std::ptr::null_mut());
    let caption_font_px = 17;
    let font_mono = make_font("Consolas", -15, FW_NORMAL.0 as i32);
    let font_mono_active = make_font_styled("Consolas", -15, FW_BOLD.0 as i32, true);
    let font_caption = make_font("Consolas", -caption_font_px, FW_NORMAL.0 as i32);
    let font_bold = make_font("Consolas", -12, FW_BOLD.0 as i32);
    let font_small = make_font("Consolas", -11, FW_BOLD.0 as i32);
    let brush_input = CreateSolidBrush(C_CARD);

    let edit_class = to_wide("EDIT");
    let empty = to_wide("");
    let edit_input = CreateWindowExW(
        windows::Win32::UI::WindowsAndMessaging::WINDOW_EX_STYLE(0),
        PCWSTR(edit_class.as_ptr()),
        PCWSTR(empty.as_ptr()),
        windows::Win32::UI::WindowsAndMessaging::WINDOW_STYLE(
            WS_CHILD.0
                | WS_VISIBLE.0
                | WS_TABSTOP.0
                | ES_MULTILINE as u32
                | ES_AUTOVSCROLL as u32
                | ES_WANTRETURN as u32,
        ),
        0,
        0,
        100,
        40,
        hwnd,
        HMENU(ID_EDIT_INPUT as *mut core::ffi::c_void),
        hinst,
        None,
    )
    .unwrap_or_default();
    SendMessageW(
        edit_input,
        WM_SETFONT,
        WPARAM(font_mono.0 as usize),
        LPARAM(1),
    );

    let orig_ptr = SetWindowLongPtrW(
        edit_input,
        GWLP_WNDPROC,
        input_subclass_proc as *const () as isize,
    );
    let orig_input_proc: WNDPROC = std::mem::transmute(orig_ptr);

    let voices = list_local_voices();
    let hwnd_raw = hwnd.0 as isize;
    let echo_gate = TtsEchoGate::new();
    let meter = Arc::new(MicMeter::start(hwnd_raw, Arc::clone(&echo_gate)));
    let stt_queue = SttEventQueue::new(hwnd_raw);

    let initial_denoise = DenoiseMode::Balanced;
    let initial_speakers = true;
    let initial_llm = true;
    let initial_backend = SttBackend::ParakeetGpu;

    let stt = SttEngine::new(
        Arc::clone(&stt_queue),
        Arc::clone(&meter),
        initial_denoise,
        initial_speakers,
        initial_llm,
    );
    let tts = TtsEngine::new(hwnd_raw, echo_gate);

    // Pre-warm Piper + OpenVoice CUDA TTS in the background on startup so Enter speaks instantly!
    tts.prewarm(voices.first().cloned(), RATES[1]);

    // Auto-engage RTX GPU Parakeet TDT 0.6B v2 on startup!
    stt.start(initial_backend);

    Box::new(AppState {
        hwnd,
        edit_input,
        font_mono,
        font_mono_active,
        font_caption,
        font_bold,
        font_small,
        caption_font_px,
        brush_input,
        voices,
        selected_voice: 0,
        output_device: None,
        wait_for_gap: false,
        queued_reply: None,
        rate_idx: 1,
        pinned: false,
        source: AudioSource::Mic,
        backend: initial_backend,
        denoise_mode: initial_denoise,
        speaker_labels: initial_speakers,
        llm_polish: initial_llm,
        tts,
        stt,
        stt_queue,
        meter,
        mic_active: true,
        tts_speaking: false,
        bench_active: false,
        active_reply_idx: None,
        active_tts_word: None,
        status_text: ">> LOADING PARAKEET GPU...".to_string(),
        health_buf: String::with_capacity(64),
        heard_items: Vec::new(),
        stable_hypothesis: String::new(),
        draft_hypothesis: String::new(),
        reply_items: Vec::new(),
        left_scroll: 0,
        right_scroll: 0,
        left_max_scroll: 0,
        right_max_scroll: 0,
        hover: HitTarget::None,
        hover_pt: POINT::default(),
        rect_mic: RECT::default(),
        rect_engine: RECT::default(),
        rect_input_picker: RECT::default(),
        rect_denoise: RECT::default(),
        rect_speakers: RECT::default(),
        rect_llm: RECT::default(),
        rect_font_down: RECT::default(),
        rect_font_up: RECT::default(),
        rect_health: RECT::default(),
        rect_meter: RECT::default(),
        rect_voice: RECT::default(),
        rect_output: RECT::default(),
        rect_gap: RECT::default(),
        rect_bench: RECT::default(),
        rect_rate: RECT::default(),
        rect_pin: RECT::default(),
        rect_export: RECT::default(),
        rect_clear: RECT::default(),
        rect_status: RECT::default(),
        rect_speak: RECT::default(),
        rect_left_feed: RECT::default(),
        rect_right_feed: RECT::default(),
        rect_input_box: RECT::default(),
        left_card_rects: Vec::new(),
        card_rects: Vec::new(),
        orig_input_proc,
    })
}

fn tooltip_for(target: HitTarget) -> Option<(&'static str, &'static str)> {
    match target {
        HitTarget::BtnMic => Some((
            "RX LISTEN TOGGLE",
            "Arm or pause live Speech-to-Text captioning. Green dot = actively listening on your RTX GPU.",
        )),
        HitTarget::BtnEngine => Some((
            "SPEECH RECOGNITION ENGINE",
            "Switch AI models: Parakeet TDT 0.6B (fastest & best English GPU accuracy), Distil-Whisper v3.5 GPU, Win11 Live Captions (battery saver), or Legacy Whisper CPU.",
        )),
        HitTarget::BtnInputPicker => Some((
            "MICROPHONE & MULTI-MIC PICKER",
            "Select 1 mic, check 2+ mics simultaneously for automatic best-SNR switching (great for placing a mic closer to someone), or choose System Audio Loopback for calls/videos.",
        )),
        HitTarget::BtnDenoise => Some((
            "NEURAL NOISE SUPPRESSION",
            "Cycles: OFF (best when nearby voices talk over your partner), GTCRN (fast 0.5 MB cafe/music cleaner), DPDF8 (deep music & clatter suppressor), VOXLOCK (locks onto 1 voice after 3s in crowded bars).",
        )),
        HitTarget::BtnSpeakers => Some((
            "SPEAKER LABELS [SPK 1..N]",
            "Color-codes who is talking around a group table using local WeSpeaker CAM++ voice embeddings. Click CLR to reset speaker profiles for a new conversation.",
        )),
        HitTarget::BtnLlm => Some((
            "LOCAL LLM PHONETIC POLISH",
            "Runs Qwen2.5-1.5B on your RTX GPU after each sentence to fix phonetic mishearings using context + hotwords.txt. Strict <=30% edit guard prevents hallucinations.",
        )),
        HitTarget::BtnFontDown => Some((
            "SHRINK CAPTION TEXT (Ctrl+-)",
            "Decreases HEARD caption font size (13px to 34px). Press Ctrl+0 to reset to default.",
        )),
        HitTarget::BtnFontUp => Some((
            "ENLARGE CAPTION TEXT (Ctrl++)",
            "Increases HEARD caption font size up to 34px so captions are easy to read across a table.",
        )),
        HitTarget::HealthBadge => Some((
            "VISUAL AUDIO SIGNAL HEALTH",
            "Real-time voice-to-noise ratio (SNR dB) so you can see mic health without hearing: CLEAR (good), NOISY (denoising working), DROWNED (move mic closer), CLIP! (too loud), or TTS GATE (muted during your reply).",
        )),
        HitTarget::MeterBadge => Some((
            "24-BAND LIVE FREQUENCY SPECTRUM",
            "Real-time Goertzel audio spectrum from 85 Hz (rumble) to 7.2 kHz (consonants). Confirms your mic is live and picking up speech.",
        )),
        HitTarget::BtnVoice => Some((
            "OUTBOUND TTS VOICE PICKER",
            "Choose which local cloned, neural Piper, or Windows voice speaks aloud when you type a reply and press Enter.",
        )),
        HitTarget::BtnOutputDevice => Some((
            "TTS AUDIO OUTPUT DEVICE (DISCORD / MEET)",
            "Route your spoken TTS voice to Default Speakers OR a Virtual Audio Cable (e.g. CABLE Input) so Discord/Zoom/Meet hears it as your mic! Pair with SRC: SYS to caption the meeting.",
        )),
        HitTarget::BtnGapWait => Some((
            "WAIT FOR CONVERSATION GAP (AUTO-TURN)",
            "When ON, pressing Enter while someone is talking queues your reply and waits for a 650 ms pause before speaking so you never talk over people. Click the queued card to speak immediately.",
        )),
        HitTarget::BtnTestVoices => Some((
            "AUDITION ALL VOICES (FOR LISTENERS)",
            "Speaks a sample sentence aloud through each installed voice one by one (showing synthesis ms) so a hearing person nearby can help pick the clearest voice for you. Press ESC to stop.",
        )),
        HitTarget::BtnRate => Some((
            "SPEAKING SPEED",
            "Cycles outbound TTS voice speed between 0.8x (slower/clearer), 1.0x (normal), 1.25x, and 1.5x.",
        )),
        HitTarget::BtnPin => Some((
            "ALWAYS ON TOP (Ctrl+T)",
            "Pins Speech Bridge above all other windows so captions stay visible during video calls or multitasking.",
        )),
        HitTarget::BtnExport => Some((
            "EXPORT CONVERSATION TRANSCRIPT",
            "Saves timestamped HEARD captions (with [SPK] labels) and your OUTBOUND replies to a .txt file in transcripts/.",
        )),
        HitTarget::BtnClear => Some((
            "CLEAR SESSION & RESET SPEAKERS",
            "Clears both panes and resets speaker ID clusters + LLM conversation context for a fresh conversation.",
        )),
        HitTarget::BtnSpeak => Some((
            "SPEAK REPLY ALOUD (Enter)",
            "Speaks your typed text aloud via local Piper TTS while automatically gating STT so your own reply never echoes back into HEARD. Shift+Enter adds a newline.",
        )),
        _ => None,
    }
}

fn push_short_mic_name(full: &str, out: &mut String) {
    let trimmed = full
        .strip_prefix("Microphone Array (")
        .or_else(|| full.strip_prefix("Microphone ("))
        .unwrap_or(full)
        .trim_end_matches(')');
    let mut count = 0usize;
    for ch in trimmed.chars() {
        if count == 15 {
            out.push('…');
            return;
        }
        out.push(ch);
        count += 1;
    }
}

fn short_mic_name(full: &str) -> String {
    let trimmed = full
        .strip_prefix("Microphone Array (")
        .or_else(|| full.strip_prefix("Microphone ("))
        .unwrap_or(full)
        .trim_end_matches(')');
    if trimmed.chars().count() <= 16 {
        trimmed.to_string()
    } else {
        trimmed.chars().take(15).collect::<String>() + "…"
    }
}

fn copy_to_clipboard(hwnd: HWND, text: &str) -> bool {
    let wide = to_wide(text);
    let bytes = wide.len() * 2;
    unsafe {
        if OpenClipboard(hwnd).is_err() {
            return false;
        }
        let _ = EmptyClipboard();
        let Ok(hmem) = GlobalAlloc(GMEM_MOVEABLE, bytes) else {
            let _ = CloseClipboard();
            return false;
        };
        let ptr = GlobalLock(hmem) as *mut u16;
        if ptr.is_null() {
            let _ = CloseClipboard();
            return false;
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        let _ = GlobalUnlock(hmem);
        let ok = SetClipboardData(CF_UNICODETEXT, HANDLE(hmem.0)).is_ok();
        let _ = CloseClipboard();
        ok
    }
}

unsafe fn make_font(face: &str, height: i32, weight: i32) -> HFONT {
    make_font_styled(face, height, weight, false)
}

unsafe fn make_font_styled(face: &str, height: i32, weight: i32, underline: bool) -> HFONT {
    let face_w = to_wide(face);
    CreateFontW(
        height,
        0,
        0,
        0,
        weight,
        0,
        u32::from(underline),
        0,
        DEFAULT_CHARSET.0 as u32,
        OUT_DEFAULT_PRECIS.0 as u32,
        CLIP_DEFAULT_PRECIS.0 as u32,
        CLEARTYPE_QUALITY.0 as u32,
        (DEFAULT_PITCH.0 | FF_MODERN.0) as u32,
        PCWSTR(face_w.as_ptr()),
    )
}

unsafe fn draw_border(hdc: HDC, rc: RECT, color: COLORREF) {
    let br = CreateSolidBrush(color);
    FrameRect(hdc, &rc, br);
    let _ = DeleteObject(br);
}

unsafe fn draw_accent_stripe(hdc: HDC, rc: RECT, color: COLORREF) {
    let stripe = RECT {
        left: rc.left + 1,
        top: rc.top + 1,
        right: rc.left + 4,
        bottom: rc.bottom - 1,
    };
    let br = CreateSolidBrush(color);
    FillRect(hdc, &stripe, br);
    let _ = DeleteObject(br);
}

unsafe fn draw_text_single(
    hdc: HDC,
    text: &str,
    mut rc: RECT,
    flags: windows::Win32::Graphics::Gdi::DRAW_TEXT_FORMAT,
) {
    let mut wide = to_wide(text);
    wide.pop();
    if !wide.is_empty() {
        DrawTextW(hdc, &mut wide, &mut rc, flags | DT_SINGLELINE | DT_NOPREFIX);
    }
}

unsafe fn draw_text_wrapped(hdc: HDC, text: &str, mut rc: RECT) {
    let mut wide = to_wide(text);
    wide.pop();
    if !wide.is_empty() {
        DrawTextW(
            hdc,
            &mut wide,
            &mut rc,
            DT_LEFT | DT_WORDBREAK | DT_NOPREFIX,
        );
    }
}

/// Draws wrapped monospace text while bolding, underlining, and highlighting the active spoken word.
unsafe fn draw_text_wrapped_highlight_word(
    hdc: HDC,
    text: &str,
    rc: RECT,
    font_normal: HFONT,
    font_active: HFONT,
    active_word_idx: usize,
) {
    SelectObject(hdc, font_normal);
    let mut space_sz = SIZE::default();
    let space_w = [b' ' as u16];
    let _ = GetTextExtentPoint32W(hdc, &space_w, &mut space_sz);
    let sp_w = space_sz.cx.max(6);
    let line_h = space_sz.cy.max(18);

    let mut x = rc.left;
    let mut y = rc.top;
    let mut word_idx = 0usize;

    for (line_i, raw_line) in text.split('\n').enumerate() {
        if line_i > 0 {
            x = rc.left;
            y += line_h;
        }
        let mut first_on_line = true;
        for word in raw_line.split_whitespace() {
            let mut wide = to_wide(word);
            wide.pop();
            if wide.is_empty() {
                continue;
            }
            let is_active = word_idx == active_word_idx;
            SelectObject(hdc, if is_active { font_active } else { font_normal });
            let mut wsz = SIZE::default();
            let _ = GetTextExtentPoint32W(hdc, &wide, &mut wsz);

            let needed_x = if first_on_line { x } else { x + sp_w };
            if !first_on_line && needed_x + wsz.cx > rc.right {
                x = rc.left;
                y += line_h;
            } else if !first_on_line {
                x = needed_x;
            }
            first_on_line = false;

            if y < rc.bottom {
                let mut wrc = RECT {
                    left: x,
                    top: y,
                    right: (x + wsz.cx + 2).min(rc.right),
                    bottom: (y + line_h).min(rc.bottom),
                };
                if is_active {
                    let pill = RECT {
                        left: (x - 2).max(rc.left),
                        top: y,
                        right: (x + wsz.cx + 2).min(rc.right),
                        bottom: (y + line_h).min(rc.bottom),
                    };
                    let pbr = CreateSolidBrush(C_GREEN_BG);
                    FillRect(hdc, &pill, pbr);
                    let _ = DeleteObject(pbr);

                    // Extra crisp cyan underline bar beneath active word
                    let ul = RECT {
                        left: pill.left,
                        top: (pill.bottom - 2).max(pill.top),
                        right: pill.right,
                        bottom: pill.bottom,
                    };
                    let ubr = CreateSolidBrush(C_CYAN);
                    FillRect(hdc, &ul, ubr);
                    let _ = DeleteObject(ubr);

                    SetTextColor(hdc, COLORREF(0x00FFFFFF));
                } else {
                    SetTextColor(hdc, C_TEXT);
                }
                DrawTextW(hdc, &mut wide, &mut wrc, DT_LEFT | DT_SINGLELINE | DT_NOPREFIX);
            }

            x += wsz.cx;
            word_idx += 1;
        }
    }
    SelectObject(hdc, font_normal);
}

unsafe fn measure_wrapped_height(hdc: HDC, text: &str, width: i32) -> i32 {
    let mut wide = to_wide(text);
    wide.pop();
    if wide.is_empty() {
        return 18;
    }
    let mut rc = RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: 0,
    };
    DrawTextW(
        hdc,
        &mut wide,
        &mut rc,
        DT_LEFT | DT_WORDBREAK | DT_CALCRECT | DT_NOPREFIX,
    );
    (rc.bottom - rc.top).max(18)
}

fn lparam_point(lparam: LPARAM) -> POINT {
    POINT {
        x: (lparam.0 & 0xFFFF) as i16 as i32,
        y: ((lparam.0 >> 16) & 0xFFFF) as i16 as i32,
    }
}

fn pt_in_rect(pt: POINT, rc: RECT) -> bool {
    pt.x >= rc.left && pt.x < rc.right && pt.y >= rc.top && pt.y < rc.bottom
}

fn now_hms() -> String {
    let st = unsafe { GetLocalTime() };
    format!("{:02}:{:02}:{:02}", st.wHour, st.wMinute, st.wSecond)
}

fn set_window_text(hwnd: HWND, text: &str) {
    let w = to_wide(text);
    unsafe {
        let _ = SetWindowTextW(hwnd, PCWSTR(w.as_ptr()));
    }
}

fn get_window_text(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..copied as usize])
    }
}
