use crate::tuning_window::{
    apply_haxel_preset, get_active_preset_mode, is_glue_popup_hwnd, register_drawer_closed,
    register_drawer_opened, LeftDrawer,
};
use std::mem::zeroed;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    GetStockObject, InvalidateRect, RoundRect, ScreenToClient, SelectObject, SetBkMode,
    SetTextColor, SetWindowRgn, DT_CENTER, DT_LEFT, DT_SINGLELINE, DT_VCENTER, FW_BOLD,
    FW_SEMIBOLD, HDC, HGDIOBJ, NULL_BRUSH, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, IsWindowVisible, LoadCursorW, RegisterClassW,
    SetCursor, SetForegroundWindow, ShowWindow, IDC_ARROW, IDC_HAND, SW_HIDE, SW_SHOW,
    WM_KILLFOCUS, WM_LBUTTONDOWN, WM_PAINT, WM_SETCURSOR, WNDCLASSW, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_POPUP,
};

pub const PRESETS_WIDTH: i32 = 356;
pub const PRESETS_HEIGHT: i32 = 444;

static mut PRESETS_HWND: HWND = std::ptr::null_mut();

pub fn get_presets_hwnd() -> HWND {
    unsafe { PRESETS_HWND }
}

pub struct HaxelPresetInfo {
    pub id: &'static str,
    pub title: &'static str,
    pub subtitle: &'static str,
    pub badge: &'static str,
    pub accent_rgb: (u8, u8, u8),
    pub scale: f32,
    pub base_amp: i32,
    pub punch_dur: i32,
    pub min_vel: f32,
    pub sub_high: i32,
}

pub const HAXEL_PRESETS: [HaxelPresetInfo; 8] = [
    HaxelPresetInfo {
        id: "VolumeToPwm",
        title: "🔊 Audio Volume to PWM (Default)",
        subtitle: "Continuous 1:1 volume-to-motor PWM hold (Pre-Haxel)",
        badge: "VOL->PWM",
        accent_rgb: (0, 210, 255), // Electric Cyan
        scale: 2.0,
        base_amp: 55,
        punch_dur: 85,
        min_vel: 0.018,
        sub_high: 95,
    },
    HaxelPresetInfo {
        id: "HaxelMultiBin",
        title: "🎛️ Haxel 3-Bin Audio Matrix",
        subtitle: "BassPunch + Mid Throb + Treble Staccato",
        badge: "3-BIN FFT",
        accent_rgb: (245, 194, 231), // Neon Pink
        scale: 2.2,
        base_amp: 60,
        punch_dur: 85,
        min_vel: 0.016,
        sub_high: 95,
    },
    HaxelPresetInfo {
        id: "Heartbeat",
        title: "💓 Haxel Heartbeat (Lub-Dub)",
        subtitle: "exp(-p/0.062) + 0.85*exp(-(p-0.25)/0.05)",
        badge: "RHYTHM",
        accent_rgb: (255, 82, 120), // Crimson Pink
        scale: 2.5,
        base_amp: 75,
        punch_dur: 95,
        min_vel: 0.015,
        sub_high: 105,
    },
    HaxelPresetInfo {
        id: "BouncingDecay",
        title: "🏀 Haxel Bouncing Ball Decay",
        subtitle: "square(frac(c*(2.5+c*1.5)), 0.25) * decay",
        badge: "TIME PHYS",
        accent_rgb: (105, 240, 174), // Mint
        scale: 2.3,
        base_amp: 65,
        punch_dur: 75,
        min_vel: 0.015,
        sub_high: 95,
    },
    HaxelPresetInfo {
        id: "EngineRev",
        title: "🏎️ Haxel Engine Rev (FM Throttle)",
        subtitle: "abs(0.4 + 0.6*sin(t*(15 + vol*45)))",
        badge: "FM ACCEL",
        accent_rgb: (255, 215, 64), // Gold
        scale: 2.4,
        base_amp: 65,
        punch_dur: 80,
        min_vel: 0.016,
        sub_high: 100,
    },
    HaxelPresetInfo {
        id: "Throb",
        title: "🌊 Haxel Dual-Sine Organic Throb",
        subtitle: "(0.5+0.5*sin(t*25.13)) * (0.5+0.5*sin(t*4.4))",
        badge: "DUAL SINE",
        accent_rgb: (79, 195, 247), // Cyan
        scale: 2.2,
        base_amp: 60,
        punch_dur: 90,
        min_vel: 0.016,
        sub_high: 95,
    },
    HaxelPresetInfo {
        id: "Staccato",
        title: "⚡ Haxel Staccato & Pulse Wave",
        subtitle: "square(frac(t * rate), 0.30) micro-clicks",
        badge: "STACCATO",
        accent_rgb: (186, 104, 200), // Purple
        scale: 2.1,
        base_amp: 55,
        punch_dur: 65,
        min_vel: 0.014,
        sub_high: 90,
    },
    HaxelPresetInfo {
        id: "SawTremolo",
        title: "🪚 Haxel Saw Tremolo & Chaos",
        subtitle: "Fast carrier AM'd by saw ramp + Perlin sparks",
        badge: "TREMOLO",
        accent_rgb: (255, 138, 101), // Coral Orange
        scale: 2.3,
        base_amp: 60,
        punch_dur: 80,
        min_vel: 0.016,
        sub_high: 95,
    },
];

pub fn get_preset_short_label(mode: &str) -> &'static str {
    if mode == "VolumeToPwm" || mode == "Default" || mode == "Balanced" {
        return "VOL->PWM";
    }
    for p in &HAXEL_PRESETS {
        if p.id == mode {
            return p.badge;
        }
    }
    "VOL->PWM"
}

pub fn create_presets_window() -> HWND {
    let class_name: Vec<u16> = "GlueHapticsPresetsWindowClass\0".encode_utf16().collect();
    let title: Vec<u16> = "Haptic Patterns\0".encode_utf16().collect();

    unsafe {
        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(presets_wndproc),
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

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP,
            100,
            100,
            PRESETS_WIDTH,
            PRESETS_HEIGHT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if !hwnd.is_null() {
            let rgn = CreateRoundRectRgn(0, 0, PRESETS_WIDTH + 1, PRESETS_HEIGHT + 1, 16, 16);
            SetWindowRgn(hwnd, rgn, 1);
        }

        PRESETS_HWND = hwnd;
        hwnd
    }
}

pub fn toggle_presets_window() {
    unsafe {
        if PRESETS_HWND.is_null() {
            create_presets_window();
        }

        if IsWindowVisible(PRESETS_HWND) != 0 {
            close_presets_window();
        } else {
            ShowWindow(PRESETS_HWND, SW_SHOW);
            register_drawer_opened(LeftDrawer::Presets);
            SetForegroundWindow(PRESETS_HWND);
            InvalidateRect(PRESETS_HWND, std::ptr::null(), 0);
        }
    }
}

pub fn close_presets_window() {
    unsafe {
        if !PRESETS_HWND.is_null() && IsWindowVisible(PRESETS_HWND) != 0 {
            ShowWindow(PRESETS_HWND, SW_HIDE);
        }
    }
    register_drawer_closed(LeftDrawer::Presets);
}

unsafe extern "system" fn presets_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            render_presets_window(hwnd, hdc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_SETCURSOR => {
            let mut pt: POINT = zeroed();
            GetCursorPos(&mut pt);
            ScreenToClient(hwnd, &mut pt);
            if is_presets_clickable(pt.x, pt.y) {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_HAND));
            } else {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_ARROW));
            }
            1
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i32;
            handle_presets_mouse_down(hwnd, x, y);
            0
        }
        WM_KILLFOCUS => {
            let focus_hwnd = wparam as HWND;
            if !is_glue_popup_hwnd(focus_hwnd) {
                crate::tuning_window::close_tuning_window();
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn preset_row_y(idx: usize) -> i32 {
    if idx == 0 {
        66
    } else {
        130 + ((idx - 1) as i32 * 43)
    }
}

fn is_presets_clickable(x: i32, y: i32) -> bool {
    if x >= PRESETS_WIDTH - 36 && x <= PRESETS_WIDTH - 12 && y >= 8 && y <= 32 {
        return true;
    }
    for i in 0..HAXEL_PRESETS.len() {
        let ry = preset_row_y(i);
        if y >= ry && y <= ry + 39 && x >= 12 && x <= PRESETS_WIDTH - 12 {
            return true;
        }
    }
    false
}

fn handle_presets_mouse_down(hwnd: HWND, x: i32, y: i32) {
    if x >= PRESETS_WIDTH - 36 && x <= PRESETS_WIDTH - 12 && y >= 8 && y <= 32 {
        close_presets_window();
        let tuning_hwnd = crate::tuning_window::get_tuning_hwnd();
        if !tuning_hwnd.is_null() {
            unsafe { InvalidateRect(tuning_hwnd, std::ptr::null(), 0); }
        }
        return;
    }

    for (i, p) in HAXEL_PRESETS.iter().enumerate() {
        let ry = preset_row_y(i);
        if y >= ry && y <= ry + 39 && x >= 12 && x <= PRESETS_WIDTH - 12 {
            apply_haxel_preset(p);
            unsafe {
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }
            return;
        }
    }
}

unsafe fn render_presets_window(_hwnd: HWND, hdc: HDC) {
    let mem_dc = CreateCompatibleDC(hdc);
    let mem_bmp = CreateCompatibleBitmap(hdc, PRESETS_WIDTH, PRESETS_HEIGHT);
    let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

    // Background: Dark acrylic (#16161c)
    let bg_brush = CreateSolidBrush(rgb(22, 22, 28));
    let bg_rect = RECT { left: 0, top: 0, right: PRESETS_WIDTH, bottom: PRESETS_HEIGHT };
    FillRect(mem_dc, &bg_rect, bg_brush);
    DeleteObject(bg_brush as HGDIOBJ);

    // Border (#2e2e3a)
    let border_pen = CreatePen(PS_SOLID as i32, 1, rgb(46, 46, 58));
    let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
    let null_brush = GetStockObject(NULL_BRUSH);
    let old_brush = SelectObject(mem_dc, null_brush);
    RoundRect(mem_dc, 0, 0, PRESETS_WIDTH, PRESETS_HEIGHT, 16, 16);
    SelectObject(mem_dc, old_pen);
    SelectObject(mem_dc, old_brush);
    DeleteObject(border_pen as HGDIOBJ);

    SetBkMode(mem_dc, TRANSPARENT as i32);

    let font_name: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
    let title_font = CreateFontW(15, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let bold_font = CreateFontW(12, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let badge_font = CreateFontW(10, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let small_font = CreateFontW(11, 0, 0, 0, FW_SEMIBOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());

    let old_font = SelectObject(mem_dc, title_font as HGDIOBJ);

    // Header Title
    SetTextColor(mem_dc, rgb(245, 194, 231));
    let title_text: Vec<u16> = "〰️ Haptic Patterns\0".encode_utf16().collect();
    let mut r_title = RECT { left: 14, top: 8, right: 310, bottom: 28 };
    DrawTextW(mem_dc, title_text.as_ptr(), (title_text.len() - 1) as i32, &mut r_title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Close Button [✕]
    SetTextColor(mem_dc, rgb(160, 160, 175));
    SelectObject(mem_dc, bold_font as HGDIOBJ);
    let close_text: Vec<u16> = "✕\0".encode_utf16().collect();
    let mut r_close = RECT { left: PRESETS_WIDTH - 36, top: 8, right: PRESETS_WIDTH - 12, bottom: 28 };
    DrawTextW(mem_dc, close_text.as_ptr(), (close_text.len() - 1) as i32, &mut r_close, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    // Subtitle
    SelectObject(mem_dc, small_font as HGDIOBJ);
    SetTextColor(mem_dc, rgb(140, 145, 165));
    let sub_text: Vec<u16> = "Click any pattern to switch behavior & feel preview:\0".encode_utf16().collect();
    let mut r_sub = RECT { left: 14, top: 28, right: PRESETS_WIDTH - 14, bottom: 44 };
    DrawTextW(mem_dc, sub_text.as_ptr(), (sub_text.len() - 1) as i32, &mut r_sub, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Section 1 Header: DEFAULT PATTERN
    SelectObject(mem_dc, badge_font as HGDIOBJ);
    SetTextColor(mem_dc, rgb(0, 210, 255));
    let def_hdr: Vec<u16> = "🔊 DEFAULT CONTINUOUS ENVELOPE\0".encode_utf16().collect();
    let mut r_dh = RECT { left: 14, top: 48, right: PRESETS_WIDTH - 14, bottom: 64 };
    DrawTextW(mem_dc, def_hdr.as_ptr(), (def_hdr.len() - 1) as i32, &mut r_dh, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Section 2 Header: HAXEL PATTERNS
    SetTextColor(mem_dc, rgb(245, 194, 231));
    let hax_hdr: Vec<u16> = "⚡ HAXEL PATTERNS (Projects/Haxel)\0".encode_utf16().collect();
    let mut r_hh = RECT { left: 14, top: 111, right: PRESETS_WIDTH - 14, bottom: 128 };
    DrawTextW(mem_dc, hax_hdr.as_ptr(), (hax_hdr.len() - 1) as i32, &mut r_hh, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    let active_mode = get_active_preset_mode();

    for (i, p) in HAXEL_PRESETS.iter().enumerate() {
        let ry = preset_row_y(i);
        let is_active = active_mode == p.id
            || (p.id == "VolumeToPwm" && (active_mode == "Default" || active_mode == "Balanced"));
        let (ar, ag, ab) = p.accent_rgb;
        let accent = rgb(ar, ag, ab);

        let bg_col = if is_active {
            rgb((ar / 5).max(26), (ag / 5).max(24), (ab / 5).max(34))
        } else {
            rgb(28, 28, 38)
        };
        let border_col = if is_active { accent } else { rgb(45, 45, 58) };

        let b_brush = CreateSolidBrush(bg_col);
        let b_pen = CreatePen(PS_SOLID as i32, 1, border_col);
        let ob = SelectObject(mem_dc, b_brush as HGDIOBJ);
        let op = SelectObject(mem_dc, b_pen as HGDIOBJ);
        RoundRect(mem_dc, 12, ry, PRESETS_WIDTH - 12, ry + 39, 8, 8);
        SelectObject(mem_dc, ob);
        SelectObject(mem_dc, op);
        DeleteObject(b_brush as HGDIOBJ);
        DeleteObject(b_pen as HGDIOBJ);

        // Title
        SelectObject(mem_dc, bold_font as HGDIOBJ);
        SetTextColor(mem_dc, if is_active { rgb(255, 255, 255) } else { rgb(220, 220, 232) });
        let prefix = if is_active { "● " } else { "" };
        let t_u16: Vec<u16> = format!("{}{}\0", prefix, p.title).encode_utf16().collect();
        let mut r_t = RECT { left: 20, top: ry + 4, right: PRESETS_WIDTH - 86, bottom: ry + 21 };
        DrawTextW(mem_dc, t_u16.as_ptr(), (t_u16.len() - 1) as i32, &mut r_t, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

        // Badge pill on right
        let pill_bg = CreateSolidBrush(if is_active { accent } else { rgb(38, 38, 52) });
        let pill_pen = CreatePen(PS_SOLID as i32, 1, if is_active { accent } else { rgb(60, 60, 78) });
        let pob = SelectObject(mem_dc, pill_bg as HGDIOBJ);
        let pop = SelectObject(mem_dc, pill_pen as HGDIOBJ);
        RoundRect(mem_dc, PRESETS_WIDTH - 84, ry + 5, PRESETS_WIDTH - 18, ry + 20, 6, 6);
        SelectObject(mem_dc, pob);
        SelectObject(mem_dc, pop);
        DeleteObject(pill_bg as HGDIOBJ);
        DeleteObject(pill_pen as HGDIOBJ);

        SelectObject(mem_dc, badge_font as HGDIOBJ);
        SetTextColor(mem_dc, if is_active { rgb(18, 18, 24) } else { accent });
        let b_u16: Vec<u16> = format!("{}\0", p.badge).encode_utf16().collect();
        let mut r_b = RECT { left: PRESETS_WIDTH - 84, top: ry + 5, right: PRESETS_WIDTH - 18, bottom: ry + 20 };
        DrawTextW(mem_dc, b_u16.as_ptr(), (b_u16.len() - 1) as i32, &mut r_b, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

        // Subtitle
        SelectObject(mem_dc, small_font as HGDIOBJ);
        SetTextColor(mem_dc, if is_active { accent } else { rgb(135, 138, 155) });
        let s_u16: Vec<u16> = format!("{}\0", p.subtitle).encode_utf16().collect();
        let mut r_s = RECT { left: 20, top: ry + 20, right: PRESETS_WIDTH - 18, bottom: ry + 37 };
        DrawTextW(mem_dc, s_u16.as_ptr(), (s_u16.len() - 1) as i32, &mut r_s, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
    }

    SelectObject(mem_dc, old_font);
    DeleteObject(title_font as HGDIOBJ);
    DeleteObject(bold_font as HGDIOBJ);
    DeleteObject(badge_font as HGDIOBJ);
    DeleteObject(small_font as HGDIOBJ);

    BitBlt(hdc, 0, 0, PRESETS_WIDTH, PRESETS_HEIGHT, mem_dc, 0, 0, SRCCOPY);
    SelectObject(mem_dc, old_bmp);
    DeleteObject(mem_bmp as HGDIOBJ);
    DeleteDC(mem_dc);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
