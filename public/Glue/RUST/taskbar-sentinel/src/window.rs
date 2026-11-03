use crate::menu::{
    self, IDM_EXIT, IDM_RATE_12, IDM_RATE_16, IDM_RATE_20, IDM_RATE_28, IDM_RATE_36,
    IDM_RATE_CUSTOM, IDM_STARTUP, IDM_TASKMGR,
};
use crate::telemetry::{TelemetryCollector, TelemetrySnapshot};
use std::mem::zeroed;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    GetStockObject, InvalidateRect, RoundRect, SelectObject, SetBkMode, SetTextColor,
    SetWindowRgn, DT_CENTER, DT_SINGLELINE, DT_VCENTER, FW_BOLD, FW_SEMIBOLD, HDC, HFONT,
    HGDIOBJ, NULL_BRUSH, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetSystemMetrics, KillTimer, LoadCursorW, PostQuitMessage, RegisterClassW, SetCursor, SetTimer, SetWindowPos,
    ShowWindow, SystemParametersInfoW, HWND_TOPMOST, IDC_ARROW, IDC_HAND, MSG, SM_CYSCREEN, SPI_GETWORKAREA,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOWNORMAL, WM_COMMAND,
    WM_CONTEXTMENU, WM_DESTROY, WM_LBUTTONUP, WM_PAINT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SETCURSOR, WM_TIMER,
    WNDCLASSW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

const TIMER_ID: usize = 1;
const WIDTH: i32 = 340;
const HEIGHT: i32 = 40;

struct AppState {
    collector: TelemetryCollector,
    snapshot: TelemetrySnapshot,
}

static APP_STATE: Mutex<Option<AppState>> = Mutex::new(None);

pub fn run_app() {
    let class_name: Vec<u16> = "TaskbarSentinelClass\0".encode_utf16().collect();
    let window_title: Vec<u16> = "Taskbar Sentinel\0".encode_utf16().collect();

    unsafe {
        let mut collector = TelemetryCollector::new();
        let snapshot = collector.sample();
        if let Ok(mut lock) = APP_STATE.lock() {
            *lock = Some(AppState {
                collector,
                snapshot,
            });
        }

        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: h_instance,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };

        RegisterClassW(&wc);

        // Detect taskbar geometry
        let mut work_area: RECT = zeroed();
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            &mut work_area as *mut _ as *mut _,
            0,
        );

        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        let taskbar_h = screen_h.saturating_sub(work_area.bottom);
        let taskbar_h = if taskbar_h <= 0 { 48 } else { taskbar_h };

        let pos_x = 4;
        let pos_y = work_area.bottom + ((taskbar_h - HEIGHT) / 2).max(0);

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            class_name.as_ptr(),
            window_title.as_ptr(),
            WS_POPUP | windows_sys::Win32::UI::WindowsAndMessaging::WS_VISIBLE,
            pos_x,
            pos_y,
            WIDTH,
            HEIGHT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if hwnd.is_null() {
            return;
        }

        // Apply smooth rounded pill clip
        let rgn = CreateRoundRectRgn(0, 0, WIDTH + 1, HEIGHT + 1, 16, 16);
        SetWindowRgn(hwnd, rgn, 1);

        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            pos_x,
            pos_y,
            WIDTH,
            HEIGHT,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );

        ShowWindow(hwnd, SW_SHOWNORMAL);

        SetTimer(hwnd, TIMER_ID, 1000, None);

        let mut msg: MSG = zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_TIMER => {
            if let Ok(mut lock) = APP_STATE.lock() {
                if let Some(state) = lock.as_mut() {
                    state.snapshot = state.collector.sample();
                }
            }
            // Keep window topmost over taskbar
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
            InvalidateRect(hwnd, std::ptr::null(), 0);
            0
        }
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            render_window(hwnd, hdc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_SETCURSOR => {
            SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_HAND));
            1
        }
        WM_LBUTTONUP => {
            // Launch Task Manager
            let taskmgr: Vec<u16> = "taskmgr.exe\0".encode_utf16().collect();
            let open: Vec<u16> = "open\0".encode_utf16().collect();
            ShellExecuteW(
                hwnd,
                open.as_ptr(),
                taskmgr.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            );
            0
        }
        WM_RBUTTONDOWN => {
            // Absorb right-click down completely so Windows Taskbar never receives it
            0
        }
        WM_RBUTTONUP => {
            // Open native Sentinel context menu
            menu::show_context_menu(hwnd);
            0
        }
        WM_CONTEXTMENU => {
            // Suppress default Windows context menu popup
            0
        }
        WM_COMMAND => {
            let cmd_id = (wparam & 0xFFFF) as usize;
            match cmd_id {
                IDM_TASKMGR => {
                    let taskmgr: Vec<u16> = "taskmgr.exe\0".encode_utf16().collect();
                    let open: Vec<u16> = "open\0".encode_utf16().collect();
                    ShellExecuteW(
                        hwnd,
                        open.as_ptr(),
                        taskmgr.as_ptr(),
                        std::ptr::null(),
                        std::ptr::null(),
                        SW_SHOWNORMAL,
                    );
                }
                IDM_STARTUP => {
                    menu::toggle_startup();
                }
                IDM_RATE_12 => {
                    menu::set_kwh_rate(0.12);
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                IDM_RATE_16 => {
                    menu::set_kwh_rate(0.16);
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                IDM_RATE_20 => {
                    menu::set_kwh_rate(0.20);
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                IDM_RATE_28 => {
                    menu::set_kwh_rate(0.28);
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                IDM_RATE_36 => {
                    menu::set_kwh_rate(0.36);
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                IDM_RATE_CUSTOM => {
                    menu::prompt_custom_rate();
                }
                IDM_EXIT => {
                    DestroyWindow(hwnd);
                }
                _ => {}
            }
            0
        }
        WM_DESTROY => {
            KillTimer(hwnd, TIMER_ID);
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn render_window(_hwnd: HWND, hdc: HDC) {
    let mem_dc = CreateCompatibleDC(hdc);
    let mem_bmp = CreateCompatibleBitmap(hdc, WIDTH, HEIGHT);
    let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

    // Double-buffered background: Dark Acrylic Pill (#18181b)
    let bg_brush = CreateSolidBrush(rgb(24, 24, 27));
    let bg_rect = RECT {
        left: 0,
        top: 0,
        right: WIDTH,
        bottom: HEIGHT,
    };
    FillRect(mem_dc, &bg_rect, bg_brush);
    DeleteObject(bg_brush as HGDIOBJ);

    // Subtle Border (#2e2e34)
    let border_pen = CreatePen(PS_SOLID as i32, 1, rgb(46, 46, 52));
    let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
    let null_brush = GetStockObject(NULL_BRUSH);
    let old_brush = SelectObject(mem_dc, null_brush);
    RoundRect(mem_dc, 0, 0, WIDTH, HEIGHT, 16, 16);
    SelectObject(mem_dc, old_pen);
    SelectObject(mem_dc, old_brush);
    DeleteObject(border_pen as HGDIOBJ);

    SetBkMode(mem_dc, TRANSPARENT as i32);

    let snapshot = if let Ok(lock) = APP_STATE.lock() {
        lock.as_ref()
            .map(|s| s.snapshot)
            .unwrap_or(TelemetrySnapshot {
                cpu_pct: 0,
                ram_pct: 0,
                ram_used_gb: 0.0,
                ram_total_gb: 0.0,
                disk_mb_s: 0.0,
                wall_watts: 0.0,
                gpu_watts: 0.0,
                monthly_cost: 0.0,
            })
    } else {
        TelemetrySnapshot {
            cpu_pct: 0,
            ram_pct: 0,
            ram_used_gb: 0.0,
            ram_total_gb: 0.0,
            disk_mb_s: 0.0,
            wall_watts: 0.0,
            gpu_watts: 0.0,
            monthly_cost: 0.0,
        }
    };

    // Fonts: Segoe UI
    let font_name: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
    let lbl_font = CreateFontW(
        -10, 0, 0, 0, FW_SEMIBOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr(),
    );
    let val_font = CreateFontW(
        -12, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr(),
    );

    // Section 1: CPU (left: 6..70)
    draw_metric_cell(
        mem_dc,
        6,
        64,
        lbl_font,
        val_font,
        "CPU",
        &format!("{}%", snapshot.cpu_pct),
        snapshot.cpu_pct.min(100) as f32 / 100.0,
        rgb(79, 195, 247), // Cyan
    );

    draw_vertical_divider(mem_dc, 71);

    // Section 2: RAM (left: 73..137)
    draw_metric_cell(
        mem_dc,
        73,
        64,
        lbl_font,
        val_font,
        "RAM",
        &format!("{}%", snapshot.ram_pct),
        snapshot.ram_pct.min(100) as f32 / 100.0,
        rgb(105, 240, 174), // Neon Green
    );

    draw_vertical_divider(mem_dc, 138);

    // Section 3: DSK (left: 140..204)
    let dsk_str = if snapshot.disk_mb_s >= 100.0 {
        format!("{:.0}M", snapshot.disk_mb_s)
    } else if snapshot.disk_mb_s >= 10.0 {
        format!("{:.0}M", snapshot.disk_mb_s)
    } else if snapshot.disk_mb_s >= 0.1 {
        format!("{:.1}M", snapshot.disk_mb_s)
    } else {
        "0M".to_string()
    };
    let dsk_fill = (snapshot.disk_mb_s / 50.0).clamp(0.0, 1.0);
    draw_metric_cell(
        mem_dc,
        140,
        64,
        lbl_font,
        val_font,
        "DSK",
        &dsk_str,
        dsk_fill,
        rgb(255, 215, 64), // Amber
    );

    draw_vertical_divider(mem_dc, 205);

    // Section 4: PWR (left: 207..271)
    let pwr_str = format!("{:.0}W", snapshot.wall_watts);
    // Fill scaled to 250W full scale
    let pwr_fill = (snapshot.wall_watts / 250.0).clamp(0.0, 1.0);
    draw_metric_cell(
        mem_dc,
        207,
        64,
        lbl_font,
        val_font,
        "PWR",
        &pwr_str,
        pwr_fill,
        rgb(255, 145, 0), // Flame Orange
    );

    draw_vertical_divider(mem_dc, 272);

    // Section 5: EST Cost (left: 274..334)
    let cost_str = if snapshot.monthly_cost >= 100.0 {
        format!("${:.0}/m", snapshot.monthly_cost)
    } else {
        format!("${:.1}/m", snapshot.monthly_cost)
    };
    // Fill scaled to $30/mo full scale
    let cost_fill = (snapshot.monthly_cost / 30.0).clamp(0.0, 1.0);
    draw_metric_cell(
        mem_dc,
        274,
        60,
        lbl_font,
        val_font,
        "EST",
        &cost_str,
        cost_fill,
        rgb(0, 230, 118), // Emerald Green
    );

    DeleteObject(lbl_font as HGDIOBJ);
    DeleteObject(val_font as HGDIOBJ);

    BitBlt(hdc, 0, 0, WIDTH, HEIGHT, mem_dc, 0, 0, SRCCOPY);

    SelectObject(mem_dc, old_bmp);
    DeleteObject(mem_bmp as HGDIOBJ);
    DeleteDC(mem_dc);
}

unsafe fn draw_metric_cell(
    dc: HDC,
    x: i32,
    w: i32,
    lbl_font: HFONT,
    val_font: HFONT,
    label: &str,
    value: &str,
    fill_ratio: f32,
    accent_color: COLORREF,
) {
    // Label
    let old_font = SelectObject(dc, lbl_font as HGDIOBJ);
    SetTextColor(dc, rgb(140, 140, 150));
    let mut lbl_rect = RECT {
        left: x,
        top: 4,
        right: x + w,
        bottom: 16,
    };
    let lbl_u16: Vec<u16> = format!("{}\0", label).encode_utf16().collect();
    DrawTextW(
        dc,
        lbl_u16.as_ptr(),
        (lbl_u16.len() - 1) as i32,
        &mut lbl_rect,
        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
    );

    // Value
    SelectObject(dc, val_font as HGDIOBJ);
    SetTextColor(dc, rgb(240, 240, 245));
    let mut val_rect = RECT {
        left: x,
        top: 17,
        right: x + w,
        bottom: 30,
    };
    let val_u16: Vec<u16> = format!("{}\0", value).encode_utf16().collect();
    DrawTextW(
        dc,
        val_u16.as_ptr(),
        (val_u16.len() - 1) as i32,
        &mut val_rect,
        DT_CENTER | DT_SINGLELINE | DT_VCENTER,
    );
    SelectObject(dc, old_font);

    // Micro-bar (at bottom of cell: y=32..35)
    let bar_y = 33;
    let bar_h = 3;
    let bar_w = (w - 12).max(10);
    let bar_x = x + 6;

    // Background track
    let track_brush = CreateSolidBrush(rgb(38, 38, 44));
    let track_rect = RECT {
        left: bar_x,
        top: bar_y,
        right: bar_x + bar_w,
        bottom: bar_y + bar_h,
    };
    FillRect(dc, &track_rect, track_brush);
    DeleteObject(track_brush as HGDIOBJ);

    // Accent fill
    let fill_w = ((bar_w as f32) * fill_ratio.clamp(0.0, 1.0)).round() as i32;
    if fill_w > 0 {
        let accent_brush = CreateSolidBrush(accent_color);
        let fill_rect = RECT {
            left: bar_x,
            top: bar_y,
            right: bar_x + fill_w,
            bottom: bar_y + bar_h,
        };
        FillRect(dc, &fill_rect, accent_brush);
        DeleteObject(accent_brush as HGDIOBJ);
    }
}

unsafe fn draw_vertical_divider(dc: HDC, x: i32) {
    let div_pen = CreatePen(PS_SOLID as i32, 1, rgb(40, 40, 46));
    let old_pen = SelectObject(dc, div_pen as HGDIOBJ);
    windows_sys::Win32::Graphics::Gdi::MoveToEx(dc, x, 7, std::ptr::null_mut());
    windows_sys::Win32::Graphics::Gdi::LineTo(dc, x, HEIGHT - 7);
    SelectObject(dc, old_pen);
    DeleteObject(div_pen as HGDIOBJ);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
