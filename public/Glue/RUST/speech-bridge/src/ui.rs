//! Leet-hacker double-buffered Win32 GDI UI with clickable TTS/STT cards,
//! WASAPI loopback toggle, voice speed control, export, and always-on-top pin.

use std::fs::{self, File};
use std::io::Write;
use std::sync::Arc;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{
    COLORREF, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW,
    CreatePen, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, Ellipse, EndPaint, FillRect,
    FrameRect, IntersectClipRect, InvalidateRect, RestoreDC, SaveDC, ScreenToClient, SelectObject,
    SetBkColor, SetBkMode, SetTextColor, CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET,
    DEFAULT_PITCH, DT_CALCRECT, DT_CENTER, DT_LEFT, DT_NOPREFIX, DT_RIGHT, DT_SINGLELINE,
    DT_VCENTER, DT_WORDBREAK, FF_MODERN, FW_BOLD, FW_NORMAL, HBRUSH, HDC, HFONT,
    OUT_DEFAULT_PRECIS, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, SetFocus, VK_CONTROL, VK_ESCAPE, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CallWindowProcW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
    GetClientRect, GetCursorPos, GetParent, GetWindowLongPtrW, GetWindowTextLengthW,
    GetWindowTextW, LoadCursorW, MoveWindow, PostMessageW, PostQuitMessage, SendMessageW,
    SetCursor, SetWindowLongPtrW, SetWindowPos, SetWindowTextW, TrackPopupMenu, ES_AUTOVSCROLL,
    ES_MULTILINE, ES_WANTRETURN, GWLP_USERDATA, GWLP_WNDPROC, HMENU, HWND_NOTOPMOST, HWND_TOPMOST,
    IDC_HAND, MF_CHECKED, MF_STRING, MF_UNCHECKED, SWP_NOMOVE, SWP_NOSIZE, TPM_LEFTALIGN,
    TPM_RETURNCMD, TPM_TOPALIGN, WM_APP, WM_CHAR, WM_CREATE, WM_CTLCOLOREDIT, WM_DESTROY,
    WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_NCDESTROY,
    WM_PAINT, WM_SETCURSOR, WM_SETFONT, WM_SIZE, WNDPROC, WS_CHILD, WS_TABSTOP, WS_VISIBLE,
};

use crate::meter::{AudioSource, MicMeter, BANDS};
use crate::stt::{SttBackend, SttEngine, SttEvent, SttEventQueue};
use crate::tts::{list_local_voices, TtsEngine, VoiceEntry};
use crate::win_util::to_wide;

pub const WM_APP_STT_EVENT: u32 = WM_APP + 1;
pub const WM_APP_TTS_STATUS: u32 = WM_APP + 2;
const WM_APP_SPEAK_SUBMIT: u32 = WM_APP + 3;
pub const WM_APP_METER_TICK: u32 = WM_APP + 4;
const WM_APP_STOP_TTS: u32 = WM_APP + 5;
const WM_APP_TOGGLE_PIN: u32 = WM_APP + 6;
pub const WM_APP_BENCH_PROGRESS: u32 = WM_APP + 7;

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
const C_AMBER: COLORREF = COLORREF(0x0033B8FF); // #FFB833
const C_TEXT: COLORREF = COLORREF(0x00F4FFE6); // #E6FFF4
const C_TEXT_CYAN: COLORREF = COLORREF(0x00F2E6C9); // #C9E6F2
const C_MUTED: COLORREF = COLORREF(0x008A7A62); // #627A8A

#[derive(Clone, Copy, PartialEq, Eq)]
enum HitTarget {
    None,
    BtnMic,
    BtnEngine,
    BtnSource,
    BtnVoice,
    BtnBench,
    BtnRate,
    BtnPin,
    BtnExport,
    BtnClear,
    BtnSpeak,
    HeardCard(usize),
    ReplyCard(usize),
}

struct MessageItem {
    time: String,
    text: String,
}

pub struct AppState {
    hwnd: HWND,
    edit_input: HWND,
    font_mono: HFONT,
    font_bold: HFONT,
    font_small: HFONT,
    brush_input: HBRUSH,
    voices: Vec<VoiceEntry>,
    selected_voice: usize,
    rate_idx: usize,
    pinned: bool,
    source: AudioSource,
    backend: SttBackend,
    tts: TtsEngine,
    stt: SttEngine,
    stt_queue: Arc<SttEventQueue>,
    meter: Arc<MicMeter>,
    mic_active: bool,
    tts_speaking: bool,
    bench_active: bool,
    active_reply_idx: Option<usize>,
    status_text: String,
    heard_items: Vec<MessageItem>,
    current_hypothesis: String,
    reply_items: Vec<MessageItem>,
    left_scroll: i32,
    right_scroll: i32,
    left_max_scroll: i32,
    right_max_scroll: i32,
    hover: HitTarget,
    rect_mic: RECT,
    rect_engine: RECT,
    rect_source: RECT,
    rect_voice: RECT,
    rect_bench: RECT,
    rect_rate: RECT,
    rect_pin: RECT,
    rect_export: RECT,
    rect_clear: RECT,
    rect_status: RECT,
    rect_meter: RECT,
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

    fn current_rate(&self) -> f64 {
        RATES[self.rate_idx]
    }

    fn redraw(&self) {
        unsafe {
            let _ = InvalidateRect(self.hwnd, None, false);
        }
    }

    fn toggle_mic(&mut self) {
        if self.mic_active {
            self.mic_active = false;
            self.status_text = ">> STANDBY".to_string();
            self.stt.stop();
        } else {
            self.mic_active = true;
            self.status_text = ">> ARMING...".to_string();
            self.stt.start(self.backend);
        }
        self.redraw();
    }

    fn toggle_engine(&mut self) {
        self.backend = match self.backend {
            SttBackend::Win11Captions => SttBackend::WhisperLive,
            SttBackend::WhisperLive => SttBackend::Win11Captions,
        };
        if self.mic_active {
            self.status_text = ">> SWITCHING STT...".to_string();
            self.stt.start(self.backend);
        } else {
            self.status_text = format!(">> ENG: {}", self.backend.short_label());
        }
        self.redraw();
    }

    fn toggle_source(&mut self) {
        self.source = match self.source {
            AudioSource::Mic => AudioSource::Loopback,
            AudioSource::Loopback => AudioSource::Mic,
        };
        self.meter.set_source(self.source);
        self.status_text = match self.source {
            AudioSource::Mic => ">> SRC: MIC".to_string(),
            AudioSource::Loopback => ">> SRC: SYS LOOPBACK".to_string(),
        };
        self.redraw();
    }

    fn cycle_rate(&mut self) {
        self.rate_idx = (self.rate_idx + 1) % RATES.len();
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
        self.status_text = ">> TTS STOPPED".to_string();
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
        self.status_text = format!(">> BENCHMARKING {} VOICES...", self.voices.len());
        self.tts
            .benchmark(self.voices.clone(), sample_opt, self.current_rate());
        self.redraw();
    }

    fn speak_text(&mut self, text: String, card_idx: Option<usize>) {
        self.bench_active = false;
        self.active_reply_idx = card_idx;
        let voice = self.selected_voice_entry();
        self.tts.speak(text, voice, self.current_rate());
        self.redraw();
    }

    fn submit_speak(&mut self) {
        let text = get_window_text(self.edit_input);
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        let owned = trimmed.to_string();
        self.reply_items.push(MessageItem {
            time: now_hms(),
            text: owned.clone(),
        });
        let idx = self.reply_items.len() - 1;
        set_window_text(self.edit_input, "");
        self.right_scroll = i32::MAX;
        self.speak_text(owned, Some(idx));
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
                let _ = writeln!(f, "[{}] {}", item.time, item.text);
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
        self.current_hypothesis.clear();
        self.reply_items.clear();
        self.active_reply_idx = None;
        self.left_scroll = 0;
        self.right_scroll = 0;
        self.redraw();
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
                SttEvent::Hypothesis(text) => {
                    self.current_hypothesis = text;
                    self.left_scroll = i32::MAX;
                }
                SttEvent::Final(text) => {
                    self.current_hypothesis.clear();
                    self.heard_items.push(MessageItem {
                        time: now_hms(),
                        text,
                    });
                    self.left_scroll = i32::MAX;
                }
                SttEvent::Stopped => {
                    self.mic_active = false;
                    self.current_hypothesis.clear();
                    self.status_text = ">> STANDBY".to_string();
                }
                SttEvent::Error(msg) => {
                    self.mic_active = false;
                    self.current_hypothesis.clear();
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
        let w = (rc.right - rc.left).max(740);
        let h = (rc.bottom - rc.top).max(400);
        let pad = 14;
        let top_h = 34;

        let mut x = pad;
        self.rect_mic = RECT {
            left: x,
            top: pad,
            right: x + 122,
            bottom: pad + top_h,
        };
        x = self.rect_mic.right + 6;
        self.rect_engine = RECT {
            left: x,
            top: pad,
            right: x + 98,
            bottom: pad + top_h,
        };
        x = self.rect_engine.right + 6;
        self.rect_source = RECT {
            left: x,
            top: pad,
            right: x + 86,
            bottom: pad + top_h,
        };
        x = self.rect_source.right + 6;
        self.rect_voice = RECT {
            left: x,
            top: pad,
            right: x + 150,
            bottom: pad + top_h,
        };
        x = self.rect_voice.right + 6;
        self.rect_bench = RECT {
            left: x,
            top: pad,
            right: x + 68,
            bottom: pad + top_h,
        };
        x = self.rect_bench.right + 6;
        self.rect_rate = RECT {
            left: x,
            top: pad,
            right: x + 56,
            bottom: pad + top_h,
        };
        x = self.rect_rate.right + 6;
        self.rect_pin = RECT {
            left: x,
            top: pad,
            right: x + 64,
            bottom: pad + top_h,
        };
        x = self.rect_pin.right + 6;
        self.rect_export = RECT {
            left: x,
            top: pad,
            right: x + 68,
            bottom: pad + top_h,
        };
        x = self.rect_export.right + 6;
        self.rect_clear = RECT {
            left: x,
            top: pad,
            right: x + 64,
            bottom: pad + top_h,
        };

        let status_left = self.rect_clear.right + 10;
        let meter_w = 180.min((w - status_left - pad).max(80));
        let meter_left = (w - pad - meter_w).max(status_left + 90);
        self.rect_status = RECT {
            left: status_left,
            top: pad,
            right: meter_left - 8,
            bottom: pad + top_h,
        };
        self.rect_meter = RECT {
            left: meter_left,
            top: pad,
            right: (w - pad).max(meter_left + 60),
            bottom: pad + top_h,
        };

        let pane_top = pad + top_h + 14;
        let col_w = (w - pad * 3) / 2;
        let right_x = pad * 2 + col_w;
        let header_h = 26;

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
        if pt_in_rect(pt, self.rect_source) {
            return HitTarget::BtnSource;
        }
        if pt_in_rect(pt, self.rect_voice) {
            return HitTarget::BtnVoice;
        }
        if pt_in_rect(pt, self.rect_bench) {
            return HitTarget::BtnBench;
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

            // Top Command Bar
            self.draw_mic_button(mem_dc);
            let eng_acc = match self.backend {
                SttBackend::Win11Captions => C_CYAN,
                SttBackend::WhisperLive => C_GREEN,
            };
            self.draw_button(
                mem_dc,
                self.rect_engine,
                self.backend.button_label(),
                self.hover == HitTarget::BtnEngine,
                eng_acc,
                self.backend == SttBackend::Win11Captions,
            );
            let (src_lbl, src_acc) = match self.source {
                AudioSource::Mic => ("SRC: MIC", C_GREEN),
                AudioSource::Loopback => ("SRC: SYS", C_CYAN),
            };
            self.draw_button(
                mem_dc,
                self.rect_source,
                src_lbl,
                self.hover == HitTarget::BtnSource,
                src_acc,
                self.source == AudioSource::Loopback,
            );
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
            self.draw_button(
                mem_dc,
                self.rect_bench,
                if self.bench_active { "STOP" } else { "BENCH" },
                self.hover == HitTarget::BtnBench,
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
            draw_text_single(mem_dc, &self.status_text, self.rect_status, DT_LEFT | DT_VCENTER);

            self.draw_freq_meter(mem_dc);

            // Pane Headers
            let left_hdr = RECT {
                left: self.rect_left_feed.left,
                top: self.rect_left_feed.top - 24,
                right: self.rect_left_feed.right,
                bottom: self.rect_left_feed.top - 2,
            };
            let right_hdr = RECT {
                left: self.rect_right_feed.left,
                top: self.rect_right_feed.top - 24,
                right: self.rect_right_feed.right,
                bottom: self.rect_right_feed.top - 2,
            };
            SetTextColor(mem_dc, if self.mic_active { C_GREEN } else { C_CYAN });
            draw_text_single(
                mem_dc,
                "// INBOUND :: SPEECH_TO_TEXT (CLICK CARD TO COPY)",
                left_hdr,
                DT_LEFT | DT_VCENTER,
            );
            SetTextColor(mem_dc, C_GREEN);
            draw_text_single(
                mem_dc,
                "// OUTBOUND :: VOICE_CARDS (CLICK TO SPEAK | ESC STOP)",
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

            BitBlt(hdc_screen, 0, 0, w, h, mem_dc, 0, 0, SRCCOPY).ok();
            SelectObject(mem_dc, old_font);
            SelectObject(mem_dc, old_bmp);
            let _ = DeleteObject(bmp);
            let _ = DeleteDC(mem_dc);
        }
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
        let _ = Ellipse(hdc, self.rect_mic.left + 12, cy - 4, self.rect_mic.left + 20, cy + 4);
        SelectObject(hdc, old_br);
        SelectObject(hdc, old_pen);
        let _ = DeleteObject(dot_br);
        let _ = DeleteObject(dot_pen);

        SelectObject(hdc, self.font_bold);
        SetTextColor(hdc, if self.mic_active { C_GREEN } else { C_TEXT });
        let trc = RECT {
            left: self.rect_mic.left + 18,
            top: self.rect_mic.top,
            right: self.rect_mic.right - 6,
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

        let label_w = 46;
        SelectObject(hdc, self.font_small);
        SetTextColor(hdc, if peak > 0.05 { C_GREEN } else { C_MUTED });
        let lbl_rc = RECT {
            left: rc.left + 6,
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
        let bar_area_right = rc.right - 6;
        let area_w = (bar_area_right - bar_area_left).max(BANDS as i32 * 2);
        let top_pad = 5;
        let bot_pad = 5;
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
        draw_border(hdc, pane, if self.mic_active { C_GREEN_DIM } else { C_BORDER });

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
        let mut item_heights = Vec::with_capacity(self.heard_items.len());
        SelectObject(hdc, self.font_mono);
        for item in &self.heard_items {
            let th = measure_wrapped_height(hdc, &item.text, inner_w);
            let card_h = 24 + th + 10;
            item_heights.push(card_h);
            total_h += card_h + 8;
        }
        let hyp_h = if !self.current_hypothesis.is_empty() {
            let h_text = format!(">_ {}", self.current_hypothesis);
            measure_wrapped_height(hdc, &h_text, inner_w) + 18
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
        if self.heard_items.is_empty() && self.current_hypothesis.is_empty() {
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
                "// Listening... Speak into mic or toggle [SRC: SYS] for system audio.",
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
                    let is_hovered = self.hover == HitTarget::HeardCard(i);
                    let cbr = CreateSolidBrush(if is_hovered { C_CARD_HOVER } else { C_CARD });
                    FillRect(hdc, &card_rc, cbr);
                    let _ = DeleteObject(cbr);
                    draw_border(hdc, card_rc, if is_hovered { C_CYAN } else { C_BORDER });
                    draw_accent_stripe(hdc, card_rc, C_CYAN);

                    SelectObject(hdc, self.font_small);
                    SetTextColor(hdc, C_CYAN);
                    let hdr_rc = RECT {
                        left: card_rc.left + 10,
                        top: card_rc.top + 5,
                        right: card_rc.right - 90,
                        bottom: card_rc.top + 21,
                    };
                    draw_text_single(hdc, &format!("[{}] RX", item.time), hdr_rc, DT_LEFT);

                    if is_hovered {
                        let copy_rc = RECT {
                            left: card_rc.right - 90,
                            top: card_rc.top + 5,
                            right: card_rc.right - 10,
                            bottom: card_rc.top + 21,
                        };
                        draw_text_single(hdc, "COPY", copy_rc, DT_RIGHT);
                    }

                    SelectObject(hdc, self.font_mono);
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
                SelectObject(hdc, self.font_mono);
                SetTextColor(hdc, C_CYAN);
                let body_rc = RECT {
                    left: h_rc.left + 10,
                    top: h_rc.top + 8,
                    right: h_rc.right - 8,
                    bottom: h_rc.bottom - 8,
                };
                draw_text_wrapped(hdc, &format!(">_ {}", self.current_hypothesis), body_rc);
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
                "// Type below & press [ENTER] to speak. Cards appear here — click any card to re-speak.",
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
                    let (fill_c, border_c) = if is_active {
                        (C_CARD_ACTIVE, C_GREEN)
                    } else if is_hovered {
                        (C_CARD_HOVER, C_GREEN)
                    } else {
                        (C_CARD, C_BORDER)
                    };

                    let cbr = CreateSolidBrush(fill_c);
                    FillRect(hdc, &card_rc, cbr);
                    let _ = DeleteObject(cbr);
                    draw_border(hdc, card_rc, border_c);
                    draw_accent_stripe(hdc, card_rc, C_GREEN);

                    SelectObject(hdc, self.font_small);
                    SetTextColor(
                        hdc,
                        if is_hovered || is_active {
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
                        left: card_rc.right - 150,
                        top: card_rc.top + 5,
                        right: card_rc.right - 10,
                        bottom: card_rc.top + 22,
                    };
                    let tag = if is_active {
                        "\u{25B6} SPEAKING..."
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
                    draw_text_wrapped(hdc, &item.text, body_rc);
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
            if wparam.0 == VK_ESCAPE.0 as usize {
                if let Some(st) = get_state(hwnd) {
                    st.stop_tts();
                }
                return LRESULT(0);
            }
            if wparam.0 == b'T' as usize
                && (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0
            {
                if let Some(st) = get_state(hwnd) {
                    st.toggle_pin();
                }
                return LRESULT(0);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_MOUSEMOVE => {
            let pt = lparam_point(lparam);
            if let Some(st) = get_state(hwnd) {
                let hit = st.hit_test(pt);
                if hit != st.hover {
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
                if st.hit_test(pt) != HitTarget::None {
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
                    HitTarget::BtnEngine => st.toggle_engine(),
                    HitTarget::BtnSource => st.toggle_source(),
                    HitTarget::BtnVoice => st.show_voice_menu(),
                    HitTarget::BtnBench => st.toggle_benchmark(),
                    HitTarget::BtnRate => st.cycle_rate(),
                    HitTarget::BtnPin => st.toggle_pin(),
                    HitTarget::BtnExport => st.export_transcript(),
                    HitTarget::BtnClear => st.clear_all(),
                    HitTarget::BtnSpeak => st.submit_speak(),
                    HitTarget::HeardCard(idx) => st.copy_heard_card(idx),
                    HitTarget::ReplyCard(idx) => {
                        if let Some(item) = st.reply_items.get(idx) {
                            let text = item.text.clone();
                            st.speak_text(text, Some(idx));
                        }
                    }
                    HitTarget::None => {}
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
                    st.status_text = ">> TX AUDIO...".to_string();
                } else {
                    st.active_reply_idx = None;
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

/// Subclassed procedure for the reply input box (Enter = Speak, Esc = Stop TTS, Ctrl+T = Pin).
unsafe extern "system" fn input_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let parent = GetParent(hwnd).unwrap_or_default();
    let orig_proc = get_state(parent).and_then(|s| s.orig_input_proc);

    if msg == WM_KEYDOWN {
        if wparam.0 == 0x0D {
            let shift_down = (GetKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            if !shift_down {
                let _ = PostMessageW(parent, WM_APP_SPEAK_SUBMIT, WPARAM(0), LPARAM(0));
                return LRESULT(0);
            }
        } else if wparam.0 == VK_ESCAPE.0 as usize {
            let _ = PostMessageW(parent, WM_APP_STOP_TTS, WPARAM(0), LPARAM(0));
            return LRESULT(0);
        } else if wparam.0 == b'T' as usize
            && (GetKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0
        {
            let _ = PostMessageW(parent, WM_APP_TOGGLE_PIN, WPARAM(0), LPARAM(0));
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
    let font_mono = make_font("Consolas", -15, FW_NORMAL.0 as i32);
    let font_bold = make_font("Consolas", -13, FW_BOLD.0 as i32);
    let font_small = make_font("Consolas", -12, FW_BOLD.0 as i32);
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
    SendMessageW(edit_input, WM_SETFONT, WPARAM(font_mono.0 as usize), LPARAM(1));

    let orig_ptr = SetWindowLongPtrW(
        edit_input,
        GWLP_WNDPROC,
        input_subclass_proc as *const () as isize,
    );
    let orig_input_proc: WNDPROC = std::mem::transmute(orig_ptr);

    let voices = list_local_voices();
    let hwnd_raw = hwnd.0 as isize;
    let meter = Arc::new(MicMeter::start(hwnd_raw));
    let stt_queue = SttEventQueue::new(hwnd_raw);
    let stt = SttEngine::new(Arc::clone(&stt_queue), Arc::clone(&meter));
    let tts = TtsEngine::new(hwnd_raw);

    // Auto-engage speech-to-text on startup (default: Windows 11 Live Captions).
    stt.start(SttBackend::Win11Captions);

    Box::new(AppState {
        hwnd,
        edit_input,
        font_mono,
        font_bold,
        font_small,
        brush_input,
        voices,
        selected_voice: 0,
        rate_idx: 1,
        pinned: false,
        source: AudioSource::Mic,
        backend: SttBackend::Win11Captions,
        tts,
        stt,
        stt_queue,
        meter,
        mic_active: true,
        tts_speaking: false,
        bench_active: false,
        active_reply_idx: None,
        status_text: ">> ARMING...".to_string(),
        heard_items: Vec::new(),
        current_hypothesis: String::new(),
        reply_items: Vec::new(),
        left_scroll: 0,
        right_scroll: 0,
        left_max_scroll: 0,
        right_max_scroll: 0,
        hover: HitTarget::None,
        rect_mic: RECT::default(),
        rect_engine: RECT::default(),
        rect_source: RECT::default(),
        rect_voice: RECT::default(),
        rect_bench: RECT::default(),
        rect_rate: RECT::default(),
        rect_pin: RECT::default(),
        rect_export: RECT::default(),
        rect_clear: RECT::default(),
        rect_status: RECT::default(),
        rect_meter: RECT::default(),
        rect_speak: RECT::default(),
        rect_left_feed: RECT::default(),
        rect_right_feed: RECT::default(),
        rect_input_box: RECT::default(),
        left_card_rects: Vec::new(),
        card_rects: Vec::new(),
        orig_input_proc,
    })
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
    let face_w = to_wide(face);
    CreateFontW(
        height,
        0,
        0,
        0,
        weight,
        0,
        0,
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
        DrawTextW(hdc, &mut wide, &mut rc, DT_LEFT | DT_WORDBREAK | DT_NOPREFIX);
    }
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
