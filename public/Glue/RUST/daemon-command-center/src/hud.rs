use crate::adb::{force_5ghz_nudge, retrigger_tether, PhoneTelemetry};
use crate::supervisor::Supervisor;
use std::mem::zeroed;
use std::path::PathBuf;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    GetStockObject, InvalidateRect, RoundRect, ScreenToClient, SelectObject, SetBkMode, SetTextColor,
    SetWindowRgn, DT_CENTER, DT_LEFT, DT_SINGLELINE, DT_VCENTER, FW_BOLD, FW_SEMIBOLD, HDC,
    HFONT, HGDIOBJ, NULL_BRUSH, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, IsWindowVisible, LoadCursorW, RegisterClassW,
    SetCursor, SetForegroundWindow, SetWindowPos, ShowWindow, SystemParametersInfoW,
    HWND_TOPMOST, IDC_ARROW, IDC_HAND, SPI_GETWORKAREA, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW,
    WM_KILLFOCUS, WM_LBUTTONUP, WM_PAINT, WM_SETCURSOR, WNDCLASSW, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_POPUP,
};

pub const HUD_WIDTH: i32 = 320;
pub const HUD_HEIGHT: i32 = 376;

pub struct HudState {
    pub supervisor: Supervisor,
    pub telemetry: PhoneTelemetry,
    pub adb: Option<PathBuf>,
}

pub static HUD_STATE: Mutex<Option<HudState>> = Mutex::new(None);
static mut HUD_HWND: HWND = std::ptr::null_mut();

pub fn get_hud_hwnd() -> HWND {
    unsafe { HUD_HWND }
}

pub fn create_hud_window() -> HWND {
    let class_name: Vec<u16> = "GlueHudWindowClass\0".encode_utf16().collect();
    let title: Vec<u16> = "Glue Command Center HUD\0".encode_utf16().collect();

    unsafe {
        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(hud_wndproc),
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

        // Detect work area near bottom-right tray
        let mut work_area: RECT = zeroed();
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            &mut work_area as *mut _ as *mut _,
            0,
        );

        let pos_x = (work_area.right - HUD_WIDTH - 12).max(10);
        let pos_y = (work_area.bottom - HUD_HEIGHT - 12).max(10);

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP,
            pos_x,
            pos_y,
            HUD_WIDTH,
            HUD_HEIGHT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if !hwnd.is_null() {
            let rgn = CreateRoundRectRgn(0, 0, HUD_WIDTH + 1, HUD_HEIGHT + 1, 16, 16);
            SetWindowRgn(hwnd, rgn, 1);
        }

        HUD_HWND = hwnd;
        hwnd
    }
}

pub fn toggle_hud(hwnd: HWND) {
    unsafe {
        if IsWindowVisible(hwnd) != 0 {
            ShowWindow(hwnd, SW_HIDE);
            crate::tuning_window::close_tuning_window();
        } else {
            // Position near current work area bottom-right
            let mut work_area: RECT = zeroed();
            SystemParametersInfoW(
                SPI_GETWORKAREA,
                0,
                &mut work_area as *mut _ as *mut _,
                0,
            );
            let pos_x = (work_area.right - HUD_WIDTH - 12).max(10);
            let pos_y = (work_area.bottom - HUD_HEIGHT - 12).max(10);

            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                pos_x,
                pos_y,
                HUD_WIDTH,
                HUD_HEIGHT,
                SWP_SHOWWINDOW,
            );
            ShowWindow(hwnd, SW_SHOW);
            SetForegroundWindow(hwnd);
            InvalidateRect(hwnd, std::ptr::null(), 0);
        }
    }
}

unsafe extern "system" fn hud_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            render_hud(hwnd, hdc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_SETCURSOR => {
            let mut pt: POINT = zeroed();
            GetCursorPos(&mut pt);
            ScreenToClient(hwnd, &mut pt);
            if is_hud_clickable(pt.x, pt.y) {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_HAND));
            } else {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_ARROW));
            }
            1
        }
        WM_KILLFOCUS => {
            // If focus moved to our child/drawer window (tuning window), do NOT hide!
            let focus_hwnd = wparam as HWND;
            let tuning_hwnd = crate::tuning_window::get_tuning_hwnd();
            if focus_hwnd != tuning_hwnd {
                ShowWindow(hwnd, SW_HIDE);
                crate::tuning_window::close_tuning_window();
            }
            0
        }
        WM_LBUTTONUP => {
            let x = (lparam & 0xFFFF) as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i32;
            handle_hud_click(hwnd, x, y);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn is_hud_clickable(x: i32, y: i32) -> bool {
    // Daemon rows (y = 120..252, x = 12..308)
    if y >= 120 && y <= 252 && x >= 12 && x <= HUD_WIDTH - 12 {
        return true;
    }
    // Haptics tuning button (y = 276..314, x = 14..306)
    if y >= 276 && y <= 314 && x >= 14 && x <= HUD_WIDTH - 14 {
        return true;
    }
    // Action buttons (y = 324..362, x = 14..306)
    if y >= 324 && y <= 362 && x >= 14 && x <= HUD_WIDTH - 14 {
        return true;
    }
    false
}

unsafe fn handle_hud_click(hwnd: HWND, x: i32, y: i32) {
    enum Action {
        ToggleDaemon(&'static str),
        ToggleTuning,
        Nudge5G,
        RetriggerTether,
        RestartAll,
        None,
    }

    // Determine action inside a tight block so HUD_STATE lock is IMMEDIATELY released!
    let action = {
        if let Ok(lock) = HUD_STATE.lock() {
            if let Some(_state) = lock.as_ref() {
                let daemon_ids = ["wifi_sentinel", "usb_tether", "energy_daemon", "audio_haptics"];
                let row_start_y = 120;
                let row_h = 32;

                let mut matched = None;
                for (i, &id) in daemon_ids.iter().enumerate() {
                    let row_y = row_start_y + (i as i32 * row_h);
                    if y >= row_y && y < row_y + row_h {
                        matched = Some(Action::ToggleDaemon(id));
                        break;
                    }
                }

                if let Some(act) = matched {
                    act
                } else if y >= 276 && y <= 314 {
                    Action::ToggleTuning
                } else if y >= 324 && y <= 362 {
                    if x >= 14 && x <= 104 {
                        Action::Nudge5G
                    } else if x >= 112 && x <= 202 {
                        Action::RetriggerTether
                    } else if x >= 210 && x <= 306 {
                        Action::RestartAll
                    } else {
                        Action::None
                    }
                } else {
                    Action::None
                }
            } else {
                Action::None
            }
        } else {
            Action::None
        }
    };

    // Execute outside the lock to completely prevent re-entrant deadlocks!
    match action {
        Action::ToggleDaemon(id) => {
            crate::toggle_daemon_global(id);
        }
        Action::ToggleTuning => {
            let adb = {
                let lock = HUD_STATE.lock().ok();
                lock.and_then(|l| l.as_ref().and_then(|s| s.adb.clone()))
            };
            crate::tuning_window::toggle_tuning_window(hwnd, adb);
        }
        Action::Nudge5G => {
            let adb = {
                let lock = HUD_STATE.lock().ok();
                lock.and_then(|l| l.as_ref().and_then(|s| s.adb.clone()))
            };
            if let Some(adb) = adb {
                force_5ghz_nudge(&adb);
            }
            InvalidateRect(hwnd, std::ptr::null(), 0);
        }
        Action::RetriggerTether => {
            let adb = {
                let lock = HUD_STATE.lock().ok();
                lock.and_then(|l| l.as_ref().and_then(|s| s.adb.clone()))
            };
            if let Some(adb) = adb {
                retrigger_tether(&adb);
            }
            InvalidateRect(hwnd, std::ptr::null(), 0);
        }
        Action::RestartAll => {
            crate::restart_active_daemons_global();
            InvalidateRect(hwnd, std::ptr::null(), 0);
        }
        Action::None => {}
    }
}

unsafe fn render_hud(_hwnd: HWND, hdc: HDC) {
    let mem_dc = CreateCompatibleDC(hdc);
    let mem_bmp = CreateCompatibleBitmap(hdc, HUD_WIDTH, HUD_HEIGHT);
    let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

    // Background: Dark acrylic (#16161c)
    let bg_brush = CreateSolidBrush(rgb(22, 22, 28));
    let bg_rect = RECT {
        left: 0,
        top: 0,
        right: HUD_WIDTH,
        bottom: HUD_HEIGHT,
    };
    FillRect(mem_dc, &bg_rect, bg_brush);
    DeleteObject(bg_brush as HGDIOBJ);

    // Border (#2e2e3a)
    let border_pen = CreatePen(PS_SOLID as i32, 1, rgb(46, 46, 58));
    let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
    let null_brush = GetStockObject(NULL_BRUSH);
    let old_brush = SelectObject(mem_dc, null_brush);
    RoundRect(mem_dc, 0, 0, HUD_WIDTH, HUD_HEIGHT, 16, 16);
    SelectObject(mem_dc, old_pen);
    SelectObject(mem_dc, old_brush);
    DeleteObject(border_pen as HGDIOBJ);

    SetBkMode(mem_dc, TRANSPARENT as i32);

    let font_name: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
    let title_font = CreateFontW(15, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let bold_font = CreateFontW(13, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let norm_font = CreateFontW(12, 0, 0, 0, FW_SEMIBOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let small_font = CreateFontW(11, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());

    let old_font = SelectObject(mem_dc, title_font as HGDIOBJ);

    if let Ok(lock) = HUD_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            let telem = &state.telemetry;

            // 1. Phone Header (Clean, no badges)
            SetTextColor(mem_dc, rgb(255, 255, 255));
            let model_text = if telem.connected {
                format!("📱 {}\0", telem.model)
            } else {
                "📱 Android (Offline)\0".to_string()
            };
            let u16_model: Vec<u16> = model_text.encode_utf16().collect();
            let mut r_model = RECT { left: 16, top: 16, right: HUD_WIDTH - 16, bottom: 36 };
            DrawTextW(mem_dc, u16_model.as_ptr(), (u16_model.len() - 1) as i32, &mut r_model, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Battery & Tether details with restore of +/- current in mA
            SelectObject(mem_dc, norm_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(170, 170, 185));

            let tether_str = if telem.tether_active { "Active" } else { "Off" };
            let detail1 = if !telem.connected || !state.supervisor.config.toggles.energy_daemon {
                format!("🔋 Battery: --% | Tether: {}\0", tether_str)
            } else {
                let sign = if telem.current_ma > 0.0 { "+" } else { "" };
                format!(
                    "🔋 Battery: {}% ({}{:.0} mA) | Tether: {}\0",
                    telem.battery_pct,
                    sign,
                    telem.current_ma,
                    tether_str
                )
            };
            let u16_d1: Vec<u16> = detail1.encode_utf16().collect();
            let mut r_d1 = RECT { left: 20, top: 42, right: HUD_WIDTH - 16, bottom: 60 };
            DrawTextW(mem_dc, u16_d1.as_ptr(), (u16_d1.len() - 1) as i32, &mut r_d1, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Wi-Fi details
            let detail2 = format!("📶 Wi-Fi: {} ({} MHz)\0", if telem.wifi_ssid.is_empty() { "None" } else { &telem.wifi_ssid }, telem.wifi_freq_mhz);
            let u16_d2: Vec<u16> = detail2.encode_utf16().collect();
            let mut r_d2 = RECT { left: 20, top: 64, right: HUD_WIDTH - 16, bottom: 82 };
            DrawTextW(mem_dc, u16_d2.as_ptr(), (u16_d2.len() - 1) as i32, &mut r_d2, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // 2. Daemons Header
            SetTextColor(mem_dc, rgb(140, 140, 155));
            SelectObject(mem_dc, small_font as HGDIOBJ);
            let d_hdr: Vec<u16> = "ACTIVE DAEMONS (CLICK TO TOGGLE)\0".encode_utf16().collect();
            let mut r_dhdr = RECT { left: 16, top: 100, right: HUD_WIDTH - 16, bottom: 116 };
            DrawTextW(mem_dc, d_hdr.as_ptr(), (d_hdr.len() - 1) as i32, &mut r_dhdr, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // 3. Daemons List (y = 120..250)
            let daemons = state.supervisor.get_status_list();
            for (i, d) in daemons.iter().enumerate() {
                let y = 120 + (i as i32 * 32);

                // Row background
                let row_brush = CreateSolidBrush(if d.enabled { rgb(28, 28, 38) } else { rgb(22, 22, 28) });
                let row_rect = RECT { left: 14, top: y, right: HUD_WIDTH - 14, bottom: y + 28 };
                FillRect(mem_dc, &row_rect, row_brush);
                DeleteObject(row_brush as HGDIOBJ);

                // Title
                SelectObject(mem_dc, norm_font as HGDIOBJ);
                SetTextColor(mem_dc, if d.enabled { rgb(235, 235, 245) } else { rgb(120, 120, 135) });
                let d_title: Vec<u16> = format!("{}\0", d.title).encode_utf16().collect();
                let mut r_t = RECT { left: 22, top: y, right: 230, bottom: y + 28 };
                DrawTextW(mem_dc, d_title.as_ptr(), (d_title.len() - 1) as i32, &mut r_t, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

                // Toggle pill [ ON / OFF ]
                SelectObject(mem_dc, bold_font as HGDIOBJ);
                let (btn_text, btn_color) = if d.enabled {
                    if d.running { ("● ON", rgb(105, 240, 174)) } else { ("○ START", rgb(255, 215, 64)) }
                } else {
                    ("○ OFF", rgb(100, 100, 115))
                };
                SetTextColor(mem_dc, btn_color);
                let u16_btn: Vec<u16> = format!("{}\0", btn_text).encode_utf16().collect();
                let mut r_btn = RECT { left: 240, top: y, right: HUD_WIDTH - 22, bottom: y + 28 };
                DrawTextW(mem_dc, u16_btn.as_ptr(), (u16_btn.len() - 1) as i32, &mut r_btn, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
            }

            // 4. AudioToSmartphoneHaptics Tuning Drawer Button (y = 276..312)
            draw_hud_button(
                mem_dc,
                14,
                276,
                HUD_WIDTH - 28,
                34,
                "⚡ AudioToSmartphoneHaptics Tuning ◀️",
                rgb(245, 194, 231),
                bold_font,
                rgb(36, 26, 38),
                rgb(75, 45, 80),
            );

            // 5. Action Buttons (y = 324..358)
            draw_hud_button(mem_dc, 14, 324, 90, 32, "⚡ 5G Nudge", rgb(79, 195, 247), norm_font, rgb(30, 30, 42), rgb(50, 50, 68));
            draw_hud_button(mem_dc, 112, 324, 90, 32, "🔄 Tether", rgb(105, 240, 174), norm_font, rgb(30, 30, 42), rgb(50, 50, 68));
            draw_hud_button(mem_dc, 210, 324, 96, 32, "♻️ Restart", rgb(255, 215, 64), norm_font, rgb(30, 30, 42), rgb(50, 50, 68));

            SelectObject(mem_dc, old_font);
        }
    }

    DeleteObject(title_font as HGDIOBJ);
    DeleteObject(bold_font as HGDIOBJ);
    DeleteObject(norm_font as HGDIOBJ);
    DeleteObject(small_font as HGDIOBJ);

    BitBlt(hdc, 0, 0, HUD_WIDTH, HUD_HEIGHT, mem_dc, 0, 0, SRCCOPY);

    SelectObject(mem_dc, old_bmp);
    DeleteObject(mem_bmp as HGDIOBJ);
    DeleteDC(mem_dc);
}

unsafe fn draw_hud_button(
    dc: HDC,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    label: &str,
    accent: COLORREF,
    font: HFONT,
    bg_color: COLORREF,
    border_color: COLORREF,
) {
    let btn_brush = CreateSolidBrush(bg_color);
    let border_pen = CreatePen(PS_SOLID as i32, 1, border_color);
    let old_brush = SelectObject(dc, btn_brush as HGDIOBJ);
    let old_pen = SelectObject(dc, border_pen as HGDIOBJ);
    RoundRect(dc, x, y, x + w, y + h, 10, 10);
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    DeleteObject(btn_brush as HGDIOBJ);
    DeleteObject(border_pen as HGDIOBJ);

    let old_font = SelectObject(dc, font as HGDIOBJ);
    SetTextColor(dc, accent);
    let u16_l: Vec<u16> = format!("{}\0", label).encode_utf16().collect();
    let mut mut_rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
    DrawTextW(dc, u16_l.as_ptr(), (u16_l.len() - 1) as i32, &mut mut_rect, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SelectObject(dc, old_font);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
