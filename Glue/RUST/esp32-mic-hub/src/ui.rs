use std::sync::atomic::Ordering;
use std::sync::{Arc, OnceLock};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect, FrameRect,
    InvalidateRect, LineTo, MoveToEx, SelectObject, SetBkMode, SetTextColor, DT_LEFT,
    DT_SINGLELINE, DT_VCENTER, HBRUSH, HDC, HPEN, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    DispatchMessageW, GetClientRect, GetCursorPos, GetMessageW, KillTimer, LoadCursorW,
    LoadIconW, PostQuitMessage, RegisterClassW, SetForegroundWindow, SetTimer, ShowWindow,
    TrackPopupMenu, TranslateMessage, CW_USEDEFAULT, IDC_ARROW, IDI_APPLICATION, MF_CHECKED,
    MF_SEPARATOR, MF_STRING, MF_UNCHECKED, MSG, PM_REMOVE, SIZE_MINIMIZED, SW_HIDE, SW_RESTORE,
    SW_SHOW, TPM_BOTTOMALIGN, TPM_LEFTALIGN, WM_APP, WM_CLOSE, WM_COMMAND, WM_CREATE, WM_DESTROY,
    WM_ERASEBKGND, WM_LBUTTONDOWN, WM_PAINT, WM_RBUTTONUP, WM_SIZE, WM_TIMER, WNDCLASSW,
    WS_EX_APPWINDOW, WS_OVERLAPPEDWINDOW,
};

use crate::ble::{toggle_mic_connection, BleScanner};
use crate::flasher::start_flash_async;
use crate::startup::set_startup_enabled;
use crate::state::{MicConnState, SharedHubState, MAX_CONNECTED};

const WM_TRAYICON: u32 = WM_APP + 1;
const TIMER_REPAINT: usize = 1;

const CMD_SHOW: usize = 1001;
const CMD_STARTUP: usize = 1002;
const CMD_EXIT: usize = 1003;

// Technical Blueprint palette
const COL_BG_BLUE: COLORREF = COLORREF(0x00442200); // #002244 (BGR)
const COL_GRID: COLORREF = COLORREF(0x005B3207); // #07325B
const COL_CARD_BG: COLORREF = COLORREF(0x00351A00); // #001A35
const COL_TRACK_BG: COLORREF = COLORREF(0x00241200); // #001224
const COL_CYAN: COLORREF = COLORREF(0x00FFF000); // #00F0FF
const COL_CYAN_DIM: COLORREF = COLORREF(0x00997A00); // #007A99
const COL_WHITE: COLORREF = COLORREF(0x00FFFFFF); // #FFFFFF
const COL_MUTED: COLORREF = COLORREF(0x00CCB870); // #70B8CC
const COL_GREEN: COLORREF = COLORREF(0x0099FF00); // #00FF99
const COL_AMBER: COLORREF = COLORREF(0x0000B0FF); // #FFB000
const COL_RED: COLORREF = COLORREF(0x005544FF); // #FF4455

struct UiContext {
    state: SharedHubState,
    scanner: Option<BleScanner>,
    hit_rects: std::sync::Mutex<Vec<HitRegion>>,
}

#[derive(Clone, Copy)]
enum HitAction {
    Flash,
    Rescan,
    ToggleMic(u64),
}

#[derive(Clone, Copy)]
struct HitRegion {
    rect: RECT,
    action: HitAction,
}

static UI_CTX: OnceLock<UiContext> = OnceLock::new();

fn to_wide(s: &str) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.push(0);
    v
}

fn rssi_to_distance(rssi: i16) -> (&'static str, usize) {
    if rssi >= -55 {
        ("NEAR <1m", 5)
    } else if rssi >= -67 {
        ("CLOSE ~1-2m", 4)
    } else if rssi >= -77 {
        ("MID ~2-4m", 3)
    } else if rssi >= -87 {
        ("FAR ~5m+", 2)
    } else {
        ("WEAK", 1)
    }
}

fn add_tray_icon(hwnd: HWND) {
    let mut nid = NOTIFYICONDATAW::default();
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = 1;
    nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid.uCallbackMessage = WM_TRAYICON;
    nid.hIcon = unsafe { LoadIconW(None, IDI_APPLICATION).unwrap_or_default() };
    let tip = "ESP32-Mic Hub";
    for (i, ch) in tip.encode_utf16().take(127).enumerate() {
        nid.szTip[i] = ch;
    }
    unsafe {
        let _ = Shell_NotifyIconW(NIM_ADD, &nid);
    }
}

fn remove_tray_icon(hwnd: HWND) {
    let mut nid = NOTIFYICONDATAW::default();
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = 1;
    unsafe {
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
    }
}

fn show_hub_window(hwnd: HWND) {
    if let Some(ctx) = UI_CTX.get() {
        {
            let mut guard = ctx.state.lock().unwrap();
            guard.window_visible = true;
            guard.scanning = true;
        }
        if let Some(scanner) = &ctx.scanner {
            scanner.start();
        }
    }
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        let _ = SetTimer(hwnd, TIMER_REPAINT, 33, None);
        let _ = InvalidateRect(hwnd, None, false);
    }
}

fn hide_to_tray(hwnd: HWND) {
    let should_pause_scan = if let Some(ctx) = UI_CTX.get() {
        let mut guard = ctx.state.lock().unwrap();
        guard.window_visible = false;
        let active = guard.connected_count();
        if active == 0 {
            guard.scanning = false;
        }
        active == 0
    } else {
        true
    };

    if should_pause_scan {
        if let Some(ctx) = UI_CTX.get() {
            if let Some(scanner) = &ctx.scanner {
                scanner.stop();
            }
        }
    }

    unsafe {
        let _ = KillTimer(hwnd, TIMER_REPAINT);
        let _ = ShowWindow(hwnd, SW_HIDE);
    }
}

fn show_tray_menu(hwnd: HWND) {
    let startup_on = UI_CTX
        .get()
        .map(|c| c.state.lock().unwrap().start_with_windows)
        .unwrap_or(false);

    unsafe {
        let Ok(hmenu) = CreatePopupMenu() else {
            return;
        };
        let show_w = to_wide("Open ESP32-Mic Hub");
        let start_w = to_wide("Start with Windows");
        let exit_w = to_wide("Exit");

        let _ = AppendMenuW(hmenu, MF_STRING, CMD_SHOW, PCWSTR(show_w.as_ptr()));
        let _ = AppendMenuW(
            hmenu,
            MF_STRING | if startup_on { MF_CHECKED } else { MF_UNCHECKED },
            CMD_STARTUP,
            PCWSTR(start_w.as_ptr()),
        );
        let _ = AppendMenuW(hmenu, MF_SEPARATOR, 0, PCWSTR::null());
        let _ = AppendMenuW(hmenu, MF_STRING, CMD_EXIT, PCWSTR(exit_w.as_ptr()));

        let mut pt = POINT::default();
        let _ = GetCursorPos(&mut pt);
        let _ = SetForegroundWindow(hwnd);
        let _ = TrackPopupMenu(
            hmenu,
            TPM_LEFTALIGN | TPM_BOTTOMALIGN,
            pt.x,
            pt.y,
            0,
            hwnd,
            None,
        );
        let _ = DestroyMenu(hmenu);
    }
}

fn draw_text(hdc: HDC, text: &str, mut rect: RECT, color: COLORREF) {
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    unsafe {
        SetTextColor(hdc, color);
        let _ = DrawTextW(
            hdc,
            &mut wide,
            &mut rect,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE,
        );
    }
}

fn draw_line(hdc: HDC, x1: i32, y1: i32, x2: i32, y2: i32) {
    unsafe {
        let _ = MoveToEx(hdc, x1, y1, None);
        let _ = LineTo(hdc, x2, y2);
    }
}

fn paint_blueprint(hwnd: HWND) {
    let Some(ctx) = UI_CTX.get() else {
        return;
    };

    let mut ps = PAINTSTRUCT::default();
    let hdc = unsafe { BeginPaint(hwnd, &mut ps) };
    let mut rc = RECT::default();
    unsafe {
        let _ = GetClientRect(hwnd, &mut rc);
    }
    let w = (rc.right - rc.left).max(1);
    let h = (rc.bottom - rc.top).max(1);

    let mem_dc = unsafe { CreateCompatibleDC(hdc) };
    let bmp = unsafe { CreateCompatibleBitmap(hdc, w, h) };
    let old_bmp = unsafe { SelectObject(mem_dc, bmp) };

    let bg_brush: HBRUSH = unsafe { CreateSolidBrush(COL_BG_BLUE) };
    let card_brush: HBRUSH = unsafe { CreateSolidBrush(COL_CARD_BG) };
    let track_brush: HBRUSH = unsafe { CreateSolidBrush(COL_TRACK_BG) };
    let cyan_brush: HBRUSH = unsafe { CreateSolidBrush(COL_CYAN) };
    let dim_brush: HBRUSH = unsafe { CreateSolidBrush(COL_CYAN_DIM) };
    let green_brush: HBRUSH = unsafe { CreateSolidBrush(COL_GREEN) };
    let amber_brush: HBRUSH = unsafe { CreateSolidBrush(COL_AMBER) };
    let red_brush: HBRUSH = unsafe { CreateSolidBrush(COL_RED) };

    let grid_pen: HPEN = unsafe { CreatePen(PS_SOLID, 1, COL_GRID) };
    let cyan_pen: HPEN = unsafe { CreatePen(PS_SOLID, 1, COL_CYAN) };

    let font_title_w = to_wide("Consolas");
    let font_title = unsafe {
        CreateFontW(
            22,
            0,
            0,
            0,
            700,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            PCWSTR(font_title_w.as_ptr()),
        )
    };
    let font_body = unsafe {
        CreateFontW(
            15,
            0,
            0,
            0,
            400,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            PCWSTR(font_title_w.as_ptr()),
        )
    };
    let font_small = unsafe {
        CreateFontW(
            13,
            0,
            0,
            0,
            400,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            PCWSTR(font_title_w.as_ptr()),
        )
    };

    unsafe {
        SetBkMode(mem_dc, TRANSPARENT);
        FillRect(mem_dc, &rc, bg_brush);

        // 15px Blueprint Grid
        let old_pen = SelectObject(mem_dc, grid_pen);
        let mut x = 0;
        while x < w {
            draw_line(mem_dc, x, 0, x, h);
            x += 15;
        }
        let mut y = 0;
        while y < h {
            draw_line(mem_dc, 0, y, w, y);
            y += 15;
        }
        SelectObject(mem_dc, old_pen);
    }

    let mut new_hits = Vec::new();

    // Header
    unsafe {
        SelectObject(mem_dc, font_title);
    }
    draw_text(
        mem_dc,
        "ESP32-MIC HUB // CAD_BLUEPRINT",
        RECT {
            left: 20,
            top: 14,
            right: w - 20,
            bottom: 42,
        },
        COL_WHITE,
    );

    let (connected, scanning, flash_busy, flash_msg) = {
        let guard = ctx.state.lock().unwrap();
        (
            guard.connected_count(),
            guard.scanning,
            guard.flash_in_progress,
            guard.flash_status.clone(),
        )
    };

    unsafe {
        SelectObject(mem_dc, font_small);
    }
    let sub = format!(
        "CONNECTED: {}/{}   |   IPC: UDP 127.0.0.1:47100   |   SCAN: {}",
        connected,
        MAX_CONNECTED,
        if scanning { "ACTIVE" } else { "PAUSED" }
    );
    draw_text(
        mem_dc,
        &sub,
        RECT {
            left: 20,
            top: 42,
            right: w - 20,
            bottom: 62,
        },
        COL_CYAN,
    );

    // Double cyan line under header
    unsafe {
        let old_pen = SelectObject(mem_dc, cyan_pen);
        draw_line(mem_dc, 20, 68, w - 20, 68);
        draw_line(mem_dc, 20, 72, w - 20, 72);
        SelectObject(mem_dc, old_pen);
    }

    // Toolbar buttons: FLASH NEW ESP32 + RESCAN
    let flash_rc = RECT {
        left: 20,
        top: 82,
        right: 210,
        bottom: 112,
    };
    let rescan_rc = RECT {
        left: 222,
        top: 82,
        right: 330,
        bottom: 112,
    };
    unsafe {
        FillRect(mem_dc, &flash_rc, card_brush);
        FrameRect(
            mem_dc,
            &flash_rc,
            if flash_busy { amber_brush } else { cyan_brush },
        );
        FillRect(mem_dc, &rescan_rc, card_brush);
        FrameRect(mem_dc, &rescan_rc, dim_brush);
        SelectObject(mem_dc, font_body);
    }
    draw_text(
        mem_dc,
        if flash_busy {
            "  FLASHING..."
        } else {
            "  [ FLASH NEW ESP32 ]"
        },
        flash_rc,
        if flash_busy { COL_AMBER } else { COL_WHITE },
    );
    draw_text(mem_dc, "  [ RESCAN ]", rescan_rc, COL_CYAN);
    new_hits.push(HitRegion {
        rect: flash_rc,
        action: HitAction::Flash,
    });
    new_hits.push(HitRegion {
        rect: rescan_rc,
        action: HitAction::Rescan,
    });

    // Flash status text
    unsafe {
        SelectObject(mem_dc, font_small);
    }
    draw_text(
        mem_dc,
        &flash_msg,
        RECT {
            left: 344,
            top: 82,
            right: w - 20,
            bottom: 112,
        },
        COL_MUTED,
    );

    // Mic Cards
    let mut y_cursor = 126;
    let card_h = 84;
    let guard = ctx.state.lock().unwrap();
    if guard.mics.is_empty() {
        let empty_rc = RECT {
            left: 20,
            top: y_cursor,
            right: w - 20,
            bottom: y_cursor + 70,
        };
        unsafe {
            FillRect(mem_dc, &empty_rc, card_brush);
            FrameRect(mem_dc, &empty_rc, dim_brush);
            SelectObject(mem_dc, font_body);
        }
        draw_text(
            mem_dc,
            "  SCANNING FOR C3-BLE-MIC DEVICES... POWER ON AN ESP32-C3 MIC",
            empty_rc,
            COL_MUTED,
        );
    } else {
        for (idx, mic) in guard.mics.iter().enumerate() {
            if y_cursor + card_h > h - 16 {
                break;
            }
            let card_rc = RECT {
                left: 20,
                top: y_cursor,
                right: w - 20,
                bottom: y_cursor + card_h,
            };
            let is_streaming = mic.state == MicConnState::Streaming;
            let is_connecting = mic.state == MicConnState::Connecting;

            unsafe {
                FillRect(mem_dc, &card_rc, card_brush);
                FrameRect(
                    mem_dc,
                    &card_rc,
                    if is_streaming {
                        cyan_brush
                    } else if is_connecting {
                        amber_brush
                    } else {
                        dim_brush
                    },
                );
            }

            // Crosshair '+' corners
            unsafe {
                SelectObject(mem_dc, font_small);
            }
            draw_text(
                mem_dc,
                "+",
                RECT {
                    left: card_rc.left + 4,
                    top: card_rc.top + 1,
                    right: card_rc.left + 18,
                    bottom: card_rc.top + 16,
                },
                COL_CYAN_DIM,
            );
            draw_text(
                mem_dc,
                "+",
                RECT {
                    left: card_rc.right - 14,
                    top: card_rc.top + 1,
                    right: card_rc.right - 2,
                    bottom: card_rc.top + 16,
                },
                COL_CYAN_DIM,
            );

            // Title & status
            let title = format!("MIC {} // {} [{}]", idx + 1, mic.name, mic.mac_suffix());
            unsafe {
                SelectObject(mem_dc, font_body);
            }
            draw_text(
                mem_dc,
                &title,
                RECT {
                    left: card_rc.left + 18,
                    top: card_rc.top + 8,
                    right: card_rc.right - 180,
                    bottom: card_rc.top + 30,
                },
                if is_streaming { COL_WHITE } else { COL_CYAN },
            );

            let badge = match mic.state {
                MicConnState::Available => "CLICK TO CONNECT".to_string(),
                MicConnState::Connecting => "CONNECTING...".to_string(),
                MicConnState::Streaming => format!(
                    "STREAMING [CH {}]  PKT:{}  DROP:{}",
                    mic.slot.unwrap_or(0) + 1,
                    mic.metrics.packets.load(Ordering::Relaxed),
                    mic.metrics.drops.load(Ordering::Relaxed)
                ),
                MicConnState::Error => mic.status_note.clone(),
            };
            unsafe {
                SelectObject(mem_dc, font_small);
            }
            draw_text(
                mem_dc,
                &badge,
                RECT {
                    left: card_rc.right - 270,
                    top: card_rc.top + 8,
                    right: card_rc.right - 16,
                    bottom: card_rc.top + 30,
                },
                match mic.state {
                    MicConnState::Streaming => COL_GREEN,
                    MicConnState::Connecting => COL_AMBER,
                    MicConnState::Error => COL_RED,
                    MicConnState::Available => COL_MUTED,
                },
            );

            // Signal strength (RSSI + distance + 5 bars)
            let (dist_label, bars) = rssi_to_distance(mic.rssi_dbm);
            let rssi_str = format!("SIGNAL: {} dBm ({})", mic.rssi_dbm, dist_label);
            draw_text(
                mem_dc,
                &rssi_str,
                RECT {
                    left: card_rc.left + 18,
                    top: card_rc.top + 32,
                    right: card_rc.left + 260,
                    bottom: card_rc.top + 50,
                },
                COL_MUTED,
            );

            for b in 0..5 {
                let bx = card_rc.left + 268 + (b as i32 * 8);
                let bh = 4 + (b as i32 * 3);
                let bar_rc = RECT {
                    left: bx,
                    top: card_rc.top + 48 - bh,
                    right: bx + 5,
                    bottom: card_rc.top + 48,
                };
                unsafe {
                    FillRect(
                        mem_dc,
                        &bar_rc,
                        if b < bars { cyan_brush } else { track_brush },
                    );
                }
            }

            // VU meter bar under each mic
            let vu_rc = RECT {
                left: card_rc.left + 18,
                top: card_rc.top + 56,
                right: card_rc.right - 18,
                bottom: card_rc.top + 72,
            };
            unsafe {
                FillRect(mem_dc, &vu_rc, track_brush);
                FrameRect(mem_dc, &vu_rc, dim_brush);
            }

            let (rms, peak) = mic.metrics.get_vu();
            // Boost visual curve slightly so normal speech fills 30%-85% of bar
            let level = (rms * 3.2).clamp(0.0, 1.0);
            let peak_pos = (peak * 1.4).clamp(0.0, 1.0);
            let inner_w = (vu_rc.right - vu_rc.left - 2).max(1);
            let fill_w = (inner_w as f32 * level) as i32;
            if fill_w > 0 {
                let fill_rc = RECT {
                    left: vu_rc.left + 1,
                    top: vu_rc.top + 1,
                    right: (vu_rc.left + 1 + fill_w).min(vu_rc.right - 1),
                    bottom: vu_rc.bottom - 1,
                };
                let fill_brush = if level > 0.90 {
                    red_brush
                } else if level > 0.72 {
                    amber_brush
                } else {
                    cyan_brush
                };
                unsafe {
                    FillRect(mem_dc, &fill_rc, fill_brush);
                }
            }
            if peak_pos > 0.02 {
                let px = vu_rc.left + 1 + (inner_w as f32 * peak_pos) as i32;
                let pk_rc = RECT {
                    left: px.min(vu_rc.right - 3),
                    top: vu_rc.top + 1,
                    right: (px + 2).min(vu_rc.right - 1),
                    bottom: vu_rc.bottom - 1,
                };
                unsafe {
                    let white_brush = CreateSolidBrush(COL_WHITE);
                    FillRect(mem_dc, &pk_rc, white_brush);
                    let _ = DeleteObject(white_brush);
                }
            }

            new_hits.push(HitRegion {
                rect: card_rc,
                action: HitAction::ToggleMic(mic.bt_addr),
            });
            y_cursor += card_h + 10;
        }
    }
    drop(guard);

    if let Ok(mut hits) = ctx.hit_rects.lock() {
        *hits = new_hits;
    }

    unsafe {
        let _ = BitBlt(hdc, 0, 0, w, h, mem_dc, 0, 0, SRCCOPY);
        SelectObject(mem_dc, old_bmp);
        let _ = DeleteObject(bmp);
        let _ = DeleteDC(mem_dc);
        let _ = DeleteObject(bg_brush);
        let _ = DeleteObject(card_brush);
        let _ = DeleteObject(track_brush);
        let _ = DeleteObject(cyan_brush);
        let _ = DeleteObject(dim_brush);
        let _ = DeleteObject(green_brush);
        let _ = DeleteObject(amber_brush);
        let _ = DeleteObject(red_brush);
        let _ = DeleteObject(grid_pen);
        let _ = DeleteObject(cyan_pen);
        let _ = DeleteObject(font_title);
        let _ = DeleteObject(font_body);
        let _ = DeleteObject(font_small);
        let _ = EndPaint(hwnd, &ps);
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CREATE => {
            add_tray_icon(hwnd);
            let visible = UI_CTX
                .get()
                .map(|c| c.state.lock().unwrap().window_visible)
                .unwrap_or(true);
            if visible {
                let _ = SetTimer(hwnd, TIMER_REPAINT, 33, None);
            }
            LRESULT(0)
        }
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            paint_blueprint(hwnd);
            LRESULT(0)
        }
        WM_TIMER => {
            let _ = InvalidateRect(hwnd, None, false);
            LRESULT(0)
        }
        WM_LBUTTONDOWN => {
            let x = (lparam.0 & 0xFFFF) as i16 as i32;
            let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
            if let Some(ctx) = UI_CTX.get() {
                let hit = ctx.hit_rects.lock().ok().and_then(|hits| {
                    hits.iter()
                        .find(|h| x >= h.rect.left && x <= h.rect.right && y >= h.rect.top && y <= h.rect.bottom)
                        .map(|h| h.action)
                });
                if let Some(action) = hit {
                    match action {
                        HitAction::Flash => start_flash_async(&ctx.state),
                        HitAction::Rescan => {
                            if let Some(scanner) = &ctx.scanner {
                                scanner.stop();
                                scanner.start();
                            }
                        }
                        HitAction::ToggleMic(addr) => toggle_mic_connection(&ctx.state, addr),
                    }
                    let _ = InvalidateRect(hwnd, None, false);
                }
            }
            LRESULT(0)
        }
        WM_SIZE => {
            if wparam.0 as u32 == SIZE_MINIMIZED {
                hide_to_tray(hwnd);
            }
            LRESULT(0)
        }
        WM_CLOSE => {
            hide_to_tray(hwnd);
            LRESULT(0)
        }
        WM_TRAYICON => {
            let ev = lparam.0 as u32;
            if ev == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONDBLCLK
                || ev == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONUP
            {
                show_hub_window(hwnd);
            } else if ev == WM_RBUTTONUP {
                show_tray_menu(hwnd);
            }
            LRESULT(0)
        }
        WM_COMMAND => {
            let cmd = wparam.0 & 0xFFFF;
            match cmd {
                CMD_SHOW => show_hub_window(hwnd),
                CMD_STARTUP => {
                    if let Some(ctx) = UI_CTX.get() {
                        let mut guard = ctx.state.lock().unwrap();
                        let next = !guard.start_with_windows;
                        if set_startup_enabled(next) {
                            guard.start_with_windows = next;
                        }
                    }
                }
                CMD_EXIT => {
                    let _ = DestroyWindow(hwnd);
                }
                _ => {}
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            if let Some(ctx) = UI_CTX.get() {
                if let Some(scanner) = &ctx.scanner {
                    scanner.stop();
                }
                let guard = ctx.state.lock().unwrap();
                for m in &guard.mics {
                    m.metrics.stop_flag.store(true, Ordering::Release);
                }
            }
            remove_tray_icon(hwnd);
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

pub fn run_ui(state: SharedHubState, start_minimized: bool) -> windows::core::Result<()> {
    let scanner = BleScanner::new(Arc::clone(&state)).ok();
    if !start_minimized {
        if let Some(sc) = &scanner {
            sc.start();
            state.lock().unwrap().scanning = true;
        }
    }

    let _ = UI_CTX.set(UiContext {
        state,
        scanner,
        hit_rects: std::sync::Mutex::new(Vec::new()),
    });

    unsafe {
        let hinst: HINSTANCE = GetModuleHandleW(None)?.into();
        let class_w = to_wide("Esp32MicHubWnd");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinst,
            hCursor: LoadCursorW(None, IDC_ARROW)?,
            lpszClassName: PCWSTR(class_w.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&wc);

        let title_w = to_wide("ESP32-Mic Hub");
        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW,
            PCWSTR(class_w.as_ptr()),
            PCWSTR(title_w.as_ptr()),
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            700,
            520,
            None,
            None,
            hinst,
            None,
        )?;

        let dark: i32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );

        if start_minimized {
            let _ = ShowWindow(hwnd, SW_HIDE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).into() {
            let _ = TranslateMessage(&msg);
            let _ = DispatchMessageW(&msg);
        }
    }
    let _ = PM_REMOVE;
    Ok(())
}
