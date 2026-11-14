use crate::haptics_cfg::{
    load_haptics_config, save_haptics_config, trigger_preset_preview, trigger_test_haptic,
    HapticsConfig,
};
use crate::presets_window::{get_preset_short_label, HaxelPresetInfo};
use serde::Deserialize;
use std::mem::zeroed;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    GetStockObject, InvalidateRect, LineTo, MoveToEx, Polygon, Polyline, RoundRect, ScreenToClient,
    SelectObject, SetBkMode, SetTextColor, SetWindowRgn, DT_CENTER, DT_LEFT, DT_RIGHT,
    DT_SINGLELINE, DT_VCENTER, FW_BOLD, FW_SEMIBOLD, HDC, HFONT, HGDIOBJ, NULL_BRUSH,
    PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, GetWindowRect, IsWindowVisible, KillTimer,
    LoadCursorW, RegisterClassW, SetCursor, SetForegroundWindow, SetTimer, SetWindowPos,
    ShowWindow, HWND_TOPMOST, IDC_ARROW, IDC_HAND, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE,
    SW_SHOW, WM_KILLFOCUS, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT, WM_SETCURSOR,
    WM_TIMER, WNDCLASSW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

pub const TUNING_WIDTH: i32 = 420;
pub const TUNING_HEIGHT: i32 = 444;
const VISUALIZER_TIMER_ID: usize = 42;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LeftDrawer {
    TestMode,
    Presets,
}

static LEFT_DRAWER_ORDER: Mutex<Vec<LeftDrawer>> = Mutex::new(Vec::new());

pub fn register_drawer_opened(drawer: LeftDrawer) {
    if let Ok(mut order) = LEFT_DRAWER_ORDER.lock() {
        if !order.contains(&drawer) {
            order.push(drawer);
        }
    }
    reposition_left_drawers();
}

pub fn register_drawer_closed(drawer: LeftDrawer) {
    if let Ok(mut order) = LEFT_DRAWER_ORDER.lock() {
        order.retain(|&d| d != drawer);
    }
    reposition_left_drawers();
}

/// Positions open left-side drawers (`TestMode` and `Presets`) in the exact order they were opened:
/// - The 1st opened drawer sits immediately to the left of the Haptics Tuning window.
/// - The 2nd opened drawer spawns out further to the left of the 1st drawer.
/// - When the 1st drawer is closed, the remaining drawer automatically shifts right to sit beside Tuning!
pub fn reposition_left_drawers() {
    unsafe {
        if TUNING_HWND.is_null() || IsWindowVisible(TUNING_HWND) == 0 {
            return;
        }
        let mut tuning_rect: RECT = zeroed();
        GetWindowRect(TUNING_HWND, &mut tuning_rect);
        let mut cursor_x = tuning_rect.left;
        let pos_y = tuning_rect.top;

        if let Ok(order) = LEFT_DRAWER_ORDER.lock() {
            for &drawer in order.iter() {
                match drawer {
                    LeftDrawer::TestMode => {
                        let hwnd = crate::test_mode_window::get_test_hwnd();
                        if !hwnd.is_null() && IsWindowVisible(hwnd) != 0 {
                            let w = crate::test_mode_window::TEST_WIDTH;
                            let h = crate::test_mode_window::TEST_HEIGHT;
                            let x = (cursor_x - w - 8).max(6);
                            SetWindowPos(
                                hwnd,
                                HWND_TOPMOST,
                                x,
                                pos_y,
                                w,
                                h,
                                SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                            cursor_x = x;
                        }
                    }
                    LeftDrawer::Presets => {
                        let hwnd = crate::presets_window::get_presets_hwnd();
                        if !hwnd.is_null() && IsWindowVisible(hwnd) != 0 {
                            let w = crate::presets_window::PRESETS_WIDTH;
                            let h = crate::presets_window::PRESETS_HEIGHT;
                            let x = (cursor_x - w - 8).max(6);
                            SetWindowPos(
                                hwnd,
                                HWND_TOPMOST,
                                x,
                                pos_y,
                                w,
                                h,
                                SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                            cursor_x = x;
                        }
                    }
                }
            }
        }
    }
}

pub fn is_glue_popup_hwnd(hwnd: HWND) -> bool {
    if hwnd.is_null() {
        return false;
    }
    hwnd == crate::hud::get_hud_hwnd()
        || hwnd == get_tuning_hwnd()
        || hwnd == crate::test_mode_window::get_test_hwnd()
        || hwnd == crate::presets_window::get_presets_hwnd()
}

pub fn get_active_preset_mode() -> String {
    if let Ok(lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            return state.config.mode.clone();
        }
    }
    load_haptics_config().mode
}

pub fn apply_haxel_preset(preset: &HaxelPresetInfo) {
    let mut adb_opt: Option<PathBuf> = None;
    if let Ok(mut lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            state.config.mode = preset.id.to_string();
            state.config.amplitude_scale = preset.scale;
            state.config.base_amplitude = preset.base_amp;
            state.config.punch_duration_ms = preset.punch_dur;
            state.config.min_velocity = preset.min_vel;
            state.config.sub_bass_high_hz = preset.sub_high;
            save_haptics_config(&state.config);
            adb_opt = state.adb.clone();
        } else {
            let mut cfg = load_haptics_config();
            cfg.mode = preset.id.to_string();
            cfg.amplitude_scale = preset.scale;
            cfg.base_amplitude = preset.base_amp;
            cfg.punch_duration_ms = preset.punch_dur;
            cfg.min_velocity = preset.min_vel;
            cfg.sub_bass_high_hz = preset.sub_high;
            save_haptics_config(&cfg);
        }
    }
    if let Some(adb) = adb_opt {
        trigger_preset_preview(&adb, preset.id);
    }
    unsafe {
        if !TUNING_HWND.is_null() && IsWindowVisible(TUNING_HWND) != 0 {
            InvalidateRect(TUNING_HWND, std::ptr::null(), 0);
        }
    }
}

#[derive(Deserialize, Default)]
struct HapticUdpPacket {
    #[serde(default)]
    energy: f32,
    #[serde(default)]
    audio_pct: u32,
    #[serde(default)]
    sub: f32,
    #[serde(default)]
    vel: f32,
    #[serde(default)]
    pwm: u32,
    #[serde(default)]
    hit: bool,
    #[serde(default)]
    peak: u32,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    mic_mode: bool,
    #[serde(default)]
    source: String,
}

fn default_true() -> bool {
    true
}

pub struct VisualizerData {
    pub audio_hist: [f32; 55],
    pub pwm_hist: [f32; 55],
    pub audio_pct: u32,
    pub pwm: u32,
    pub peak: u32,
    pub sub: f32,
    pub vel: f32,
    pub enabled: bool,
    pub hit: bool,
    pub source: String,
    pub socket: Option<UdpSocket>,
}

pub struct TuningState {
    pub config: HapticsConfig,
    pub adb: Option<PathBuf>,
    pub dragging_slider: Option<usize>,
    pub visualizer: VisualizerData,
}

pub static TUNING_STATE: Mutex<Option<TuningState>> = Mutex::new(None);
static mut TUNING_HWND: HWND = std::ptr::null_mut();

pub fn get_tuning_hwnd() -> HWND {
    unsafe { TUNING_HWND }
}

pub fn is_mic_mode_enabled() -> bool {
    if let Ok(lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            return state.config.mic_mode;
        }
    }
    load_haptics_config().mic_mode
}

pub fn toggle_mic_mode_shared() {
    if let Ok(mut lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            state.config.mic_mode = !state.config.mic_mode;
            save_haptics_config(&state.config);
        } else {
            let mut cfg = load_haptics_config();
            cfg.mic_mode = !cfg.mic_mode;
            save_haptics_config(&cfg);
        }
    }
    unsafe {
        if !TUNING_HWND.is_null() && IsWindowVisible(TUNING_HWND) != 0 {
            InvalidateRect(TUNING_HWND, std::ptr::null(), 0);
        }
        let test_hwnd = crate::test_mode_window::get_test_hwnd();
        if !test_hwnd.is_null() && IsWindowVisible(test_hwnd) != 0 {
            InvalidateRect(test_hwnd, std::ptr::null(), 0);
        }
    }
}

pub fn create_tuning_window() -> HWND {
    let class_name: Vec<u16> = "GlueAudioToHapticsTuningWindowClass\0".encode_utf16().collect();
    let title: Vec<u16> = "AudioToSmartphoneHaptics Tuning\0".encode_utf16().collect();

    unsafe {
        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(tuning_wndproc),
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
            TUNING_WIDTH,
            TUNING_HEIGHT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if !hwnd.is_null() {
            let rgn = CreateRoundRectRgn(0, 0, TUNING_WIDTH + 1, TUNING_HEIGHT + 1, 16, 16);
            SetWindowRgn(hwnd, rgn, 1);
        }

        TUNING_HWND = hwnd;
        hwnd
    }
}

pub fn toggle_tuning_window(hud_hwnd: HWND, adb: Option<PathBuf>) {
    unsafe {
        if TUNING_HWND.is_null() {
            create_tuning_window();
        }

        if IsWindowVisible(TUNING_HWND) != 0 {
            close_tuning_window();
        } else {
            let cfg = load_haptics_config();

            let sock = UdpSocket::bind("127.0.0.1:48123").ok();
            if let Some(s) = &sock {
                let _ = s.set_nonblocking(true);
            }

            if let Ok(mut lock) = TUNING_STATE.lock() {
                *lock = Some(TuningState {
                    config: cfg,
                    adb,
                    dragging_slider: None,
                    visualizer: VisualizerData {
                        audio_hist: [0.0; 55],
                        pwm_hist: [0.0; 55],
                        audio_pct: 0,
                        pwm: 0,
                        peak: 0,
                        sub: 0.0,
                        vel: 0.0,
                        enabled: true,
                        hit: false,
                        source: String::new(),
                        socket: sock,
                    },
                });
            }

            let mut hud_rect: RECT = zeroed();
            GetWindowRect(hud_hwnd, &mut hud_rect);

            let pos_x = (hud_rect.left - TUNING_WIDTH - 8).max(10);
            let pos_y = hud_rect.top;

            SetWindowPos(
                TUNING_HWND,
                HWND_TOPMOST,
                pos_x,
                pos_y,
                TUNING_WIDTH,
                TUNING_HEIGHT,
                SWP_SHOWWINDOW,
            );
            ShowWindow(TUNING_HWND, SW_SHOW);
            SetForegroundWindow(TUNING_HWND);

            SetTimer(TUNING_HWND, VISUALIZER_TIMER_ID, 25, None);

            InvalidateRect(TUNING_HWND, std::ptr::null(), 0);
        }
    }
}

pub fn close_tuning_window() {
    crate::test_mode_window::close_test_window();
    crate::presets_window::close_presets_window();
    if let Ok(mut order) = LEFT_DRAWER_ORDER.lock() {
        order.clear();
    }
    unsafe {
        if !TUNING_HWND.is_null() {
            KillTimer(TUNING_HWND, VISUALIZER_TIMER_ID);
            if IsWindowVisible(TUNING_HWND) != 0 {
                ShowWindow(TUNING_HWND, SW_HIDE);
            }
        }
    }
}

unsafe extern "system" fn tuning_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            render_tuning(hwnd, hdc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_TIMER => {
            if wparam == VISUALIZER_TIMER_ID {
                let mut updated = false;
                let mut source_changed = false;
                if let Ok(mut lock) = TUNING_STATE.lock() {
                    if let Some(state) = lock.as_mut() {
                        if let Some(sock) = &state.visualizer.socket {
                            let mut buf = [0u8; 1024];
                            while let Ok(len) = sock.recv(&mut buf) {
                                if let Ok(pkt) = serde_json::from_slice::<HapticUdpPacket>(&buf[..len]) {
                                    let pct_in = if pkt.audio_pct > 0 {
                                        pkt.audio_pct
                                    } else {
                                        ((pkt.energy * 280.0).round() as u32).min(100)
                                    };
                                    let norm_audio = (pct_in as f32 / 100.0).clamp(0.0, 1.0);
                                    let norm_pwm = (pkt.pwm as f32 / 100.0).clamp(0.0, 1.0);
                                    state.visualizer.audio_hist.rotate_left(1);
                                    state.visualizer.audio_hist[54] = norm_audio;
                                    state.visualizer.pwm_hist.rotate_left(1);
                                    state.visualizer.pwm_hist[54] = norm_pwm;
                                    state.visualizer.audio_pct = pct_in;
                                    state.visualizer.pwm = pkt.pwm;
                                    state.visualizer.peak = pkt.peak;
                                    state.visualizer.sub = pkt.sub;
                                    state.visualizer.vel = pkt.vel;
                                    state.visualizer.enabled = pkt.enabled;
                                    state.visualizer.hit = pkt.hit;
                                    if !pkt.source.is_empty() && state.visualizer.source != pkt.source {
                                        state.visualizer.source = pkt.source;
                                        source_changed = true;
                                    }
                                    let _ = pkt.mic_mode;
                                    updated = true;
                                }
                            }
                        }
                    }
                }
                if source_changed {
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                } else if updated {
                    let mut canvas_rect = RECT {
                        left: 14,
                        top: 32,
                        right: TUNING_WIDTH - 14,
                        bottom: 182,
                    };
                    InvalidateRect(hwnd, &mut canvas_rect, 0);
                }
                0
            } else {
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
        }
        WM_SETCURSOR => {
            let mut pt: POINT = zeroed();
            GetCursorPos(&mut pt);
            ScreenToClient(hwnd, &mut pt);
            if is_clickable_area(pt.x, pt.y) {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_HAND));
            } else {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_ARROW));
            }
            1
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i32;
            handle_tuning_mouse_down(hwnd, x, y);
            0
        }
        WM_MOUSEMOVE => {
            if (wparam & 1) != 0 {
                let x = (lparam & 0xFFFF) as i32;
                let y = ((lparam >> 16) & 0xFFFF) as i32;
                handle_tuning_mouse_move(hwnd, x, y);
            }
            0
        }
        WM_LBUTTONUP => {
            if let Ok(mut lock) = TUNING_STATE.lock() {
                if let Some(state) = lock.as_mut() {
                    if state.dragging_slider.is_some() {
                        state.dragging_slider = None;
                        save_haptics_config(&state.config);
                    }
                }
            }
            0
        }
        WM_KILLFOCUS => {
            let focus_hwnd = wparam as HWND;
            if !is_glue_popup_hwnd(focus_hwnd) {
                close_tuning_window();
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn is_clickable_area(x: i32, y: i32) -> bool {
    // Top Header MIC MODE button (x = 176..272, y = 10..35)
    if x >= 176 && x <= 272 && y >= 10 && y <= 35 {
        return true;
    }
    // Top Header TEST MODE button (x = 278..380, y = 10..35)
    if x >= 278 && x <= 380 && y >= 10 && y <= 35 {
        return true;
    }
    // Close button
    if x >= TUNING_WIDTH - 36 && x <= TUNING_WIDTH - 12 && y >= 12 && y <= 36 {
        return true;
    }
    // Sliders (y = 184..350)
    if y >= 184 && y <= 350 && x >= 130 && x <= 340 {
        return true;
    }
    // Checkbox (y = 358..386)
    if y >= 358 && y <= 386 && x >= 16 && x <= 390 {
        return true;
    }
    // Bottom Patterns, Test Mode & Test Hit buttons (y = 392..432)
    if y >= 392 && y <= 432 && x >= 14 && x <= 406 {
        return true;
    }
    false
}

fn handle_tuning_mouse_down(hwnd: HWND, x: i32, y: i32) {
    // Close button
    if x >= TUNING_WIDTH - 36 && x <= TUNING_WIDTH - 12 && y >= 12 && y <= 36 {
        close_tuning_window();
        return;
    }

    // Top Header [🎤 MIC MODE] button (x = 176..272, y = 10..35)
    if x >= 176 && x <= 272 && y >= 10 && y <= 35 {
        toggle_mic_mode_shared();
        return;
    }

    // Top Header [◀ TEST MODE] button (x = 278..380, y = 10..35)
    if x >= 278 && x <= 380 && y >= 10 && y <= 35 {
        crate::test_mode_window::toggle_test_window(hwnd);
        unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
        return;
    }

    // Bottom Bar Buttons (y = 392..432):
    // 1. [◀ 〰️ PATTERNS] (x = 14..166)
    // 2. [◀ 🎧 TEST MODE] (x = 174..306)
    // 3. [🎯 TEST HIT] (x = 314..406)
    if y >= 392 && y <= 432 {
        if x >= 14 && x <= 166 {
            crate::presets_window::toggle_presets_window();
            unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
            return;
        } else if x >= 174 && x <= 306 {
            crate::test_mode_window::toggle_test_window(hwnd);
            unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
            return;
        } else if x >= 314 && x <= 406 {
            if let Ok(lock) = TUNING_STATE.lock() {
                if let Some(state) = lock.as_ref() {
                    if let Some(adb) = &state.adb {
                        trigger_test_haptic(adb);
                    }
                }
            }
            return;
        }
    }

    if let Ok(mut lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            let slider_y_starts = [190, 224, 258, 292, 326];
            for (idx, &sy) in slider_y_starts.iter().enumerate() {
                if y >= sy - 6 && y <= sy + 22 {
                    state.dragging_slider = Some(idx);
                    update_slider_from_x(state, idx, x);
                    save_haptics_config(&state.config);
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                    return;
                }
            }

            if y >= 358 && y <= 386 && x >= 16 && x <= 390 {
                state.config.enable_snap_primitives = !state.config.enable_snap_primitives;
                save_haptics_config(&state.config);
                unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                return;
            }
        }
    }
}

fn handle_tuning_mouse_move(hwnd: HWND, x: i32, _y: i32) {
    if let Ok(mut lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            if let Some(idx) = state.dragging_slider {
                update_slider_from_x(state, idx, x);
                unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
            }
        }
    }
}

fn update_slider_from_x(state: &mut TuningState, idx: usize, x: i32) {
    let t_left = 135.0;
    let t_right = 335.0;
    let ratio = ((x as f32 - t_left) / (t_right - t_left)).clamp(0.0, 1.0);

    match idx {
        0 => {
            let v = 0.5 + ratio * 3.0;
            state.config.amplitude_scale = (v * 10.0).round() / 10.0;
        }
        1 => {
            let v = 15.0 + ratio * 115.0;
            state.config.base_amplitude = ((v / 5.0).round() * 5.0) as i32;
        }
        2 => {
            let v = 40.0 + ratio * 110.0;
            state.config.punch_duration_ms = ((v / 5.0).round() * 5.0) as i32;
        }
        3 => {
            let v = 0.010 + ratio * 0.070;
            state.config.min_velocity = (v * 1000.0).round() / 1000.0;
        }
        4 => {
            let v = 50.0 + ratio * 100.0;
            state.config.sub_bass_high_hz = ((v / 5.0).round() * 5.0) as i32;
        }
        _ => {}
    }
}

unsafe fn render_tuning(_hwnd: HWND, hdc: HDC) {
    let mem_dc = CreateCompatibleDC(hdc);
    let mem_bmp = CreateCompatibleBitmap(hdc, TUNING_WIDTH, TUNING_HEIGHT);
    let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

    // Background: Dark acrylic (#16161c)
    let bg_brush = CreateSolidBrush(rgb(22, 22, 28));
    let bg_rect = RECT { left: 0, top: 0, right: TUNING_WIDTH, bottom: TUNING_HEIGHT };
    FillRect(mem_dc, &bg_rect, bg_brush);
    DeleteObject(bg_brush as HGDIOBJ);

    // Border (#2e2e3a)
    let border_pen = CreatePen(PS_SOLID as i32, 1, rgb(46, 46, 58));
    let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
    let null_brush = GetStockObject(NULL_BRUSH);
    let old_brush = SelectObject(mem_dc, null_brush);
    RoundRect(mem_dc, 0, 0, TUNING_WIDTH, TUNING_HEIGHT, 16, 16);
    SelectObject(mem_dc, old_pen);
    SelectObject(mem_dc, old_brush);
    DeleteObject(border_pen as HGDIOBJ);

    SetBkMode(mem_dc, TRANSPARENT as i32);

    let font_name: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
    let title_font = CreateFontW(15, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let bold_font = CreateFontW(13, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let norm_font = CreateFontW(12, 0, 0, 0, FW_SEMIBOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let hud_bold = CreateFontW(11, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let small_font = CreateFontW(11, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());

    let old_font = SelectObject(mem_dc, title_font as HGDIOBJ);

    // Header Title
    SetTextColor(mem_dc, rgb(245, 194, 231)); // Pink
    let title_text: Vec<u16> = "⚡ Haptics Tuning\0".encode_utf16().collect();
    let mut r_title = RECT { left: 16, top: 10, right: 174, bottom: 32 };
    DrawTextW(mem_dc, title_text.as_ptr(), (title_text.len() - 1) as i32, &mut r_title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Close Button [✕]
    SetTextColor(mem_dc, rgb(160, 160, 175));
    SelectObject(mem_dc, bold_font as HGDIOBJ);
    let close_text: Vec<u16> = "✕\0".encode_utf16().collect();
    let mut r_close = RECT { left: TUNING_WIDTH - 36, top: 10, right: TUNING_WIDTH - 12, bottom: 34 };
    DrawTextW(mem_dc, close_text.as_ptr(), (close_text.len() - 1) as i32, &mut r_close, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    if let Ok(lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            let mic_on = state.config.mic_mode;
            let presets_open = {
                let h = crate::presets_window::get_presets_hwnd();
                !h.is_null() && IsWindowVisible(h) != 0
            };
            let test_open = {
                let h = crate::test_mode_window::get_test_hwnd();
                !h.is_null() && IsWindowVisible(h) != 0
            };

            // Top Header [🎤 MIC MODE] Toggle Button (x = 176..272)
            draw_styled_btn(
                mem_dc,
                176,
                10,
                96,
                24,
                if mic_on { "🎙️ MIC: ON" } else { "🎤 MIC MODE" },
                if mic_on { rgb(255, 215, 64) } else { rgb(185, 190, 210) },
                if mic_on { rgb(64, 42, 18) } else { rgb(30, 30, 40) },
                if mic_on { rgb(255, 171, 64) } else { rgb(52, 52, 68) },
                hud_bold,
            );

            // Top Header [◀ 🎧 TEST] Pop-out Button (x = 278..380)
            draw_styled_btn(
                mem_dc,
                278,
                10,
                102,
                24,
                "◀ 🎧 TEST",
                rgb(105, 240, 174),
                if test_open { rgb(28, 56, 42) } else { rgb(24, 42, 34) },
                if test_open { rgb(105, 240, 174) } else { rgb(56, 120, 88) },
                hud_bold,
            );

            // Subtitle showing live source + active pattern
            SelectObject(mem_dc, small_font as HGDIOBJ);
            let mode_badge = get_preset_short_label(&state.config.mode);
            let src_info = if state.visualizer.source.is_empty() {
                if mic_on {
                    format!("🎙️ LIVE MIC -> Pattern [{}] -> Phone Haptics", mode_badge)
                } else {
                    format!("🔊 Loopback -> Pattern [{}] -> Phone Haptics", mode_badge)
                }
            } else if mic_on {
                format!("🎙️ MIC [{}] • Pattern: {}", state.visualizer.source, mode_badge)
            } else {
                format!("🔊 {} • Pattern: {}", state.visualizer.source, mode_badge)
            };
            SetTextColor(mem_dc, if mic_on { rgb(255, 215, 64) } else { rgb(140, 140, 155) });
            let sub_text: Vec<u16> = format!("{}\0", src_info).encode_utf16().collect();
            let mut r_sub = RECT { left: 16, top: 34, right: TUNING_WIDTH - 16, bottom: 50 };
            DrawTextW(mem_dc, sub_text.as_ptr(), (sub_text.len() - 1) as i32, &mut r_sub, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            let c_left = 14;
            let c_right = TUNING_WIDTH - 14;
            let c_w = c_right - c_left;
            let n_pts = 55;

            // =========================================================================
            // GRAPH 1 (TOP): AUDIO INPUT WAVE (y = 52..112, height = 60px)
            // =========================================================================
            let a_top = 52;
            let a_bottom = 112;
            let a_h = a_bottom - a_top;

            let a_bg = CreateSolidBrush(rgb(15, 17, 25));
            let a_border = CreatePen(
                PS_SOLID as i32,
                1,
                if mic_on { rgb(120, 92, 34) } else { rgb(36, 62, 82) },
            );
            let old_b = SelectObject(mem_dc, a_bg as HGDIOBJ);
            let old_p = SelectObject(mem_dc, a_border as HGDIOBJ);
            RoundRect(mem_dc, c_left, a_top, c_right, a_bottom, 8, 8);
            SelectObject(mem_dc, old_b);
            SelectObject(mem_dc, old_p);
            DeleteObject(a_bg as HGDIOBJ);
            DeleteObject(a_border as HGDIOBJ);

            let guide_pen = CreatePen(PS_SOLID as i32, 1, rgb(24, 28, 42));
            let old_gp = SelectObject(mem_dc, guide_pen as HGDIOBJ);
            for &pct in &[0.33f32, 0.66f32] {
                let y_line = (a_bottom - 4) - (pct * (a_h - 16) as f32) as i32;
                MoveToEx(mem_dc, c_left + 4, y_line, std::ptr::null_mut());
                LineTo(mem_dc, c_right - 4, y_line);
            }
            SelectObject(mem_dc, old_gp);

            let mut audio_points: Vec<POINT> = Vec::with_capacity(n_pts);
            for i in 0..n_pts {
                let x = c_left + 4 + (i as i32 * (c_w - 8)) / (n_pts as i32 - 1);
                let val = state.visualizer.audio_hist[i];
                let y = (a_bottom - 4) - (val * (a_h - 16) as f32) as i32;
                audio_points.push(POINT { x, y: y.clamp(a_top + 4, a_bottom - 4) });
            }

            let mut a_poly = Vec::with_capacity(n_pts + 2);
            a_poly.push(POINT { x: c_left + 4, y: a_bottom - 4 });
            a_poly.extend_from_slice(&audio_points);
            a_poly.push(POINT { x: c_right - 4, y: a_bottom - 4 });

            let a_fill_col = if mic_on { rgb(48, 38, 16) } else { rgb(14, 38, 54) };
            let a_area_brush = CreateSolidBrush(a_fill_col);
            let a_null_p = CreatePen(PS_SOLID as i32, 0, a_fill_col);
            let old_ab = SelectObject(mem_dc, a_area_brush as HGDIOBJ);
            let old_np = SelectObject(mem_dc, a_null_p as HGDIOBJ);
            Polygon(mem_dc, a_poly.as_ptr(), a_poly.len() as i32);
            SelectObject(mem_dc, old_ab);
            SelectObject(mem_dc, old_np);
            DeleteObject(a_area_brush as HGDIOBJ);
            DeleteObject(a_null_p as HGDIOBJ);

            let a_line_col = if mic_on { rgb(255, 215, 64) } else { rgb(0, 210, 255) };
            let wave_pen = CreatePen(PS_SOLID as i32, 2, a_line_col);
            let old_cp = SelectObject(mem_dc, wave_pen as HGDIOBJ);
            Polyline(mem_dc, audio_points.as_ptr(), n_pts as i32);
            SelectObject(mem_dc, old_cp);
            DeleteObject(wave_pen as HGDIOBJ);

            SelectObject(mem_dc, hud_bold as HGDIOBJ);
            SetTextColor(mem_dc, a_line_col);
            let a_prefix = if mic_on { "🎙️ MIC AUDIO INPUT" } else { "🔊 AUDIO INPUT" };
            let a_lbl: Vec<u16> = format!("{}: {}%\0", a_prefix, state.visualizer.audio_pct).encode_utf16().collect();
            let mut r_atxt = RECT { left: c_left + 8, top: a_top + 4, right: c_left + 235, bottom: a_top + 20 };
            DrawTextW(mem_dc, a_lbl.as_ptr(), (a_lbl.len() - 1) as i32, &mut r_atxt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            SelectObject(mem_dc, small_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(155, 160, 175));
            let mut r_ainfo = RECT { left: c_right - 165, top: a_top + 4, right: c_right - 8, bottom: a_top + 20 };
            let a_info_txt: Vec<u16> = format!("Sub: {}%  •  Vel: {:.3}\0", (state.visualizer.sub * 100.0) as i32, state.visualizer.vel).encode_utf16().collect();
            DrawTextW(mem_dc, a_info_txt.as_ptr(), (a_info_txt.len() - 1) as i32, &mut r_ainfo, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

            // =========================================================================
            // GRAPH 2 (BOTTOM): HAPTIC PWM OUTPUT WAVE (y = 118..178, height = 60px)
            // =========================================================================
            let c_top = 118;
            let c_bottom = 178;
            let c_h = c_bottom - c_top;

            let c_bg = CreateSolidBrush(rgb(18, 15, 24));
            let c_border = CreatePen(PS_SOLID as i32, 1, rgb(72, 36, 62));
            let old_b2 = SelectObject(mem_dc, c_bg as HGDIOBJ);
            let old_p2 = SelectObject(mem_dc, c_border as HGDIOBJ);
            RoundRect(mem_dc, c_left, c_top, c_right, c_bottom, 8, 8);
            SelectObject(mem_dc, old_b2);
            SelectObject(mem_dc, old_p2);
            DeleteObject(c_bg as HGDIOBJ);
            DeleteObject(c_border as HGDIOBJ);

            let old_gp2 = SelectObject(mem_dc, guide_pen as HGDIOBJ);
            for &pct in &[0.33f32, 0.66f32] {
                let y_line = (c_bottom - 4) - (pct * (c_h - 16) as f32) as i32;
                MoveToEx(mem_dc, c_left + 4, y_line, std::ptr::null_mut());
                LineTo(mem_dc, c_right - 4, y_line);
            }
            SelectObject(mem_dc, old_gp2);
            DeleteObject(guide_pen as HGDIOBJ);

            let mut pwm_points: Vec<POINT> = Vec::with_capacity(n_pts);
            for i in 0..n_pts {
                let x = c_left + 4 + (i as i32 * (c_w - 8)) / (n_pts as i32 - 1);
                let val = state.visualizer.pwm_hist[i];
                let y = (c_bottom - 4) - (val * (c_h - 16) as f32) as i32;
                pwm_points.push(POINT { x, y: y.clamp(c_top + 4, c_bottom - 4) });
            }

            let mut poly_pts = Vec::with_capacity(n_pts + 2);
            poly_pts.push(POINT { x: c_left + 4, y: c_bottom - 4 });
            poly_pts.extend_from_slice(&pwm_points);
            poly_pts.push(POINT { x: c_right - 4, y: c_bottom - 4 });

            let area_brush = CreateSolidBrush(rgb(48, 18, 38));
            let null_p = CreatePen(PS_SOLID as i32, 0, rgb(48, 18, 38));
            let old_ab2 = SelectObject(mem_dc, area_brush as HGDIOBJ);
            let old_np2 = SelectObject(mem_dc, null_p as HGDIOBJ);
            Polygon(mem_dc, poly_pts.as_ptr(), poly_pts.len() as i32);
            SelectObject(mem_dc, old_ab2);
            SelectObject(mem_dc, old_np2);
            DeleteObject(area_brush as HGDIOBJ);
            DeleteObject(null_p as HGDIOBJ);

            let pink_pen = CreatePen(PS_SOLID as i32, 2, rgb(255, 42, 133));
            let old_pp = SelectObject(mem_dc, pink_pen as HGDIOBJ);
            Polyline(mem_dc, pwm_points.as_ptr(), n_pts as i32);
            SelectObject(mem_dc, old_pp);
            DeleteObject(pink_pen as HGDIOBJ);

            SelectObject(mem_dc, hud_bold as HGDIOBJ);
            if !state.visualizer.enabled {
                SetTextColor(mem_dc, rgb(255, 215, 64));
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 4, right: c_left + 250, bottom: c_top + 20 };
                let txt: Vec<u16> = "⏸️ HAPTICS PAUSED / MUTED\0".encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            } else if state.visualizer.pwm > 0 || state.visualizer.hit {
                SetTextColor(mem_dc, rgb(255, 42, 133));
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 4, right: c_left + 265, bottom: c_top + 20 };
                let txt: Vec<u16> = format!("⚡ HAPTIC PWM OUTPUT: {}% [PEAK {}]\0", state.visualizer.pwm, state.visualizer.peak).encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            } else {
                SetTextColor(mem_dc, rgb(140, 135, 155));
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 4, right: c_left + 265, bottom: c_top + 20 };
                let txt: Vec<u16> = "⚡ HAPTIC PWM OUTPUT: 0% (IDLE)\0".encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            }

            SelectObject(mem_dc, small_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(245, 194, 231));
            let mut r_pinfo = RECT { left: c_right - 145, top: c_top + 4, right: c_right - 8, bottom: c_top + 20 };
            let p_info_txt: Vec<u16> = format!("Mode: [{}]\0", mode_badge).encode_utf16().collect();
            DrawTextW(mem_dc, p_info_txt.as_ptr(), (p_info_txt.len() - 1) as i32, &mut r_pinfo, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

            // ==========================================
            // SLIDERS
            // ==========================================
            let sliders = [
                ("Master Gain:", format!("{:.1}x", state.config.amplitude_scale), (state.config.amplitude_scale - 0.5) / 3.0, rgb(245, 194, 231)),
                ("Base Kick Floor:", format!("{} PWM", state.config.base_amplitude), (state.config.base_amplitude as f32 - 15.0) / 115.0, rgb(79, 195, 247)),
                ("Sustained Hold:", format!("{} ms", state.config.punch_duration_ms), (state.config.punch_duration_ms as f32 - 40.0) / 110.0, rgb(105, 240, 174)),
                ("Trigger Sens:", format!("{:.3}", state.config.min_velocity), (state.config.min_velocity - 0.010) / 0.070, rgb(255, 215, 64)),
                ("Sub-Bass Cutoff:", format!("{} Hz", state.config.sub_bass_high_hz), (state.config.sub_bass_high_hz as f32 - 50.0) / 100.0, rgb(186, 104, 200)),
            ];

            let slider_y_starts = [190, 224, 258, 292, 326];
            for (i, (label, val_str, ratio, accent)) in sliders.iter().enumerate() {
                let sy = slider_y_starts[i];

                SelectObject(mem_dc, norm_font as HGDIOBJ);
                SetTextColor(mem_dc, rgb(190, 190, 205));
                let l_u16: Vec<u16> = format!("{}\0", label).encode_utf16().collect();
                let mut r_l = RECT { left: 16, top: sy, right: 130, bottom: sy + 20 };
                DrawTextW(mem_dc, l_u16.as_ptr(), (l_u16.len() - 1) as i32, &mut r_l, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

                let t_left = 135;
                let t_right = 335;
                let t_y = sy + 8;
                let trough_brush = CreateSolidBrush(rgb(35, 35, 46));
                let trough_rect = RECT { left: t_left, top: t_y, right: t_right, bottom: t_y + 6 };
                FillRect(mem_dc, &trough_rect, trough_brush);
                DeleteObject(trough_brush as HGDIOBJ);

                let clamped_ratio = (*ratio).clamp(0.0, 1.0);
                let fill_right = t_left + ((t_right - t_left) as f32 * clamped_ratio) as i32;
                let fill_brush = CreateSolidBrush(*accent);
                let fill_rect = RECT { left: t_left, top: t_y, right: fill_right, bottom: t_y + 6 };
                FillRect(mem_dc, &fill_rect, fill_brush);
                DeleteObject(fill_brush as HGDIOBJ);

                let knob_brush = CreateSolidBrush(rgb(250, 250, 255));
                let knob_rect = RECT { left: fill_right - 6, top: t_y - 4, right: fill_right + 6, bottom: t_y + 10 };
                FillRect(mem_dc, &knob_rect, knob_brush);
                DeleteObject(knob_brush as HGDIOBJ);

                SelectObject(mem_dc, bold_font as HGDIOBJ);
                SetTextColor(mem_dc, *accent);
                let v_u16: Vec<u16> = format!("{}\0", val_str).encode_utf16().collect();
                let mut r_v = RECT { left: 345, top: sy, right: TUNING_WIDTH - 16, bottom: sy + 20 };
                DrawTextW(mem_dc, v_u16.as_ptr(), (v_u16.len() - 1) as i32, &mut r_v, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
            }

            // Snare Hardware Primitives Checkbox (y = 362..382)
            SelectObject(mem_dc, norm_font as HGDIOBJ);
            let chk_str = if state.config.enable_snap_primitives {
                "[✓] Closed-Loop LRA Primitives (THUD / CLICK / TICK / RISE)\0"
            } else {
                "[  ] Closed-Loop LRA Primitives (THUD / CLICK / TICK / RISE)\0"
            };
            SetTextColor(mem_dc, if state.config.enable_snap_primitives { rgb(79, 195, 247) } else { rgb(120, 120, 135) });
            let chk_u16: Vec<u16> = chk_str.encode_utf16().collect();
            let mut r_chk = RECT { left: 16, top: 362, right: TUNING_WIDTH - 16, bottom: 382 };
            DrawTextW(mem_dc, chk_u16.as_ptr(), (chk_u16.len() - 1) as i32, &mut r_chk, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Bottom Bar: [◀ 〰️ PATTERNS]  [◀ 🎧 TEST MODE]  [🎯 TEST HIT]
            let preset_btn_lbl = format!("◀ 〰️ PATTERNS [{}]", mode_badge);
            draw_styled_btn(
                mem_dc,
                14,
                394,
                152,
                34,
                &preset_btn_lbl,
                rgb(245, 194, 231),
                if presets_open { rgb(52, 26, 46) } else { rgb(32, 28, 42) },
                if presets_open { rgb(245, 194, 231) } else { rgb(82, 56, 86) },
                hud_bold,
            );
            draw_styled_btn(
                mem_dc,
                174,
                394,
                132,
                34,
                "◀ 🎧 TEST MODE",
                rgb(105, 240, 174),
                if test_open { rgb(24, 52, 38) } else { rgb(26, 36, 34) },
                if test_open { rgb(105, 240, 174) } else { rgb(56, 110, 82) },
                hud_bold,
            );
            draw_styled_btn(
                mem_dc,
                314,
                394,
                92,
                34,
                "🎯 TEST HIT",
                rgb(255, 215, 64),
                rgb(36, 32, 24),
                rgb(95, 80, 40),
                hud_bold,
            );
        }
    }

    SelectObject(mem_dc, old_font);
    DeleteObject(title_font as HGDIOBJ);
    DeleteObject(bold_font as HGDIOBJ);
    DeleteObject(norm_font as HGDIOBJ);
    DeleteObject(hud_bold as HGDIOBJ);
    DeleteObject(small_font as HGDIOBJ);

    BitBlt(hdc, 0, 0, TUNING_WIDTH, TUNING_HEIGHT, mem_dc, 0, 0, SRCCOPY);
    SelectObject(mem_dc, old_bmp);
    DeleteObject(mem_bmp as HGDIOBJ);
    DeleteDC(mem_dc);
}

unsafe fn draw_styled_btn(
    hdc: HDC,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    text: &str,
    text_color: COLORREF,
    bg_color: COLORREF,
    border_color: COLORREF,
    font: HFONT,
) {
    let brush = CreateSolidBrush(bg_color);
    let pen = CreatePen(PS_SOLID as i32, 1, border_color);
    let old_brush = SelectObject(hdc, brush as HGDIOBJ);
    let old_pen = SelectObject(hdc, pen as HGDIOBJ);
    RoundRect(hdc, x, y, x + w, y + h, 10, 10);
    SelectObject(hdc, old_brush);
    SelectObject(hdc, old_pen);
    DeleteObject(brush as HGDIOBJ);
    DeleteObject(pen as HGDIOBJ);

    let old_font = SelectObject(hdc, font as HGDIOBJ);
    SetTextColor(hdc, text_color);
    let u16_txt: Vec<u16> = format!("{}\0", text).encode_utf16().collect();
    let mut rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
    DrawTextW(hdc, u16_txt.as_ptr(), (u16_txt.len() - 1) as i32, &mut rect, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SelectObject(hdc, old_font);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
