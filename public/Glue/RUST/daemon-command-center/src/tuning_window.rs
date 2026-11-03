use crate::haptics_cfg::{load_haptics_config, save_haptics_config, trigger_test_haptic, HapticsConfig};
use serde::Deserialize;
use std::mem::zeroed;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW,
    CreatePen, CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint,
    FillRect, GetStockObject, InvalidateRect, LineTo, MoveToEx, Polygon, Polyline, RoundRect,
    ScreenToClient, SelectObject, SetBkMode, SetTextColor, SetWindowRgn, DT_CENTER, DT_LEFT,
    DT_RIGHT, DT_SINGLELINE, DT_VCENTER, FW_BOLD, FW_SEMIBOLD, HDC, HFONT, HGDIOBJ, NULL_BRUSH,
    PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, IsWindowVisible, KillTimer, LoadCursorW,
    RegisterClassW, SetCursor, SetForegroundWindow, SetTimer, SetWindowPos, ShowWindow,
    HWND_TOPMOST, IDC_ARROW, IDC_HAND, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, WM_KILLFOCUS,
    WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT, WM_SETCURSOR, WM_TIMER, WNDCLASSW,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

pub const TUNING_WIDTH: i32 = 420;
pub const TUNING_HEIGHT: i32 = 384;
const VISUALIZER_TIMER_ID: usize = 42;

#[derive(Deserialize, Default)]
struct HapticUdpPacket {
    #[serde(default)]
    energy: f32,
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
}

fn default_true() -> bool {
    true
}

pub struct VisualizerData {
    pub audio_hist: [f32; 55],
    pub pwm_hist: [f32; 55],
    pub pwm: u32,
    pub peak: u32,
    pub sub: f32,
    pub vel: f32,
    pub enabled: bool,
    pub hit: bool,
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
            // Read fresh config
            let cfg = load_haptics_config();

            // Setup or reuse non-blocking UDP socket
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
                        pwm: 0,
                        peak: 0,
                        sub: 0.0,
                        vel: 0.0,
                        enabled: true,
                        hit: false,
                        socket: sock,
                    },
                });
            }

            // Position to the left of main HUD
            let mut hud_rect: RECT = zeroed();
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect(hud_hwnd, &mut hud_rect);

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

            // 40 FPS real-time visualizer timer
            SetTimer(TUNING_HWND, VISUALIZER_TIMER_ID, 25, None);

            InvalidateRect(TUNING_HWND, std::ptr::null(), 0);
        }
    }
}

pub fn close_tuning_window() {
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
                if let Ok(mut lock) = TUNING_STATE.lock() {
                    if let Some(state) = lock.as_mut() {
                        if let Some(sock) = &state.visualizer.socket {
                            let mut buf = [0u8; 1024];
                            while let Ok(len) = sock.recv(&mut buf) {
                                if let Ok(pkt) = serde_json::from_slice::<HapticUdpPacket>(&buf[..len]) {
                                    let norm_audio = (pkt.energy * 2.8).min(1.0);
                                    let norm_pwm = (pkt.pwm as f32 / 100.0).clamp(0.0, 1.0);
                                    state.visualizer.audio_hist.rotate_left(1);
                                    state.visualizer.audio_hist[54] = norm_audio;
                                    state.visualizer.pwm_hist.rotate_left(1);
                                    state.visualizer.pwm_hist[54] = norm_pwm;
                                    state.visualizer.pwm = pkt.pwm;
                                    state.visualizer.peak = pkt.peak;
                                    state.visualizer.sub = pkt.sub;
                                    state.visualizer.vel = pkt.vel;
                                    state.visualizer.enabled = pkt.enabled;
                                    state.visualizer.hit = pkt.hit;
                                    updated = true;
                                }
                            }
                        }
                    }
                }
                if updated {
                    let mut canvas_rect = RECT {
                        left: 14,
                        top: 52,
                        right: TUNING_WIDTH - 14,
                        bottom: 124,
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
                // Left button held down
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
            // Keep window open if focus moved to main HUD window
            let focus_hwnd = wparam as HWND;
            let hud_hwnd = crate::hud::get_hud_hwnd();
            if focus_hwnd != hud_hwnd {
                close_tuning_window();
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn is_clickable_area(x: i32, y: i32) -> bool {
    // Close button
    if x >= TUNING_WIDTH - 36 && x <= TUNING_WIDTH - 12 && y >= 12 && y <= 36 {
        return true;
    }
    // Sliders (y = 126..292)
    if y >= 126 && y <= 292 && x >= 130 && x <= 340 {
        return true;
    }
    // Checkbox (y = 300..326)
    if y >= 300 && y <= 326 && x >= 16 && x <= 390 {
        return true;
    }
    // Preset & Test buttons (y = 334..370)
    if y >= 334 && y <= 370 && x >= 14 && x <= 406 {
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

    if let Ok(mut lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            // Check Sliders (5 rows starting at y = 132, row height 34)
            let slider_y_starts = [132, 166, 200, 234, 268];
            for (idx, &sy) in slider_y_starts.iter().enumerate() {
                if y >= sy - 6 && y <= sy + 22 {
                    state.dragging_slider = Some(idx);
                    update_slider_from_x(state, idx, x);
                    save_haptics_config(&state.config);
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                    return;
                }
            }

            // Snare Hardware Primitives Checkbox (y = 300..326)
            if y >= 300 && y <= 326 && x >= 16 && x <= 390 {
                state.config.enable_snap_primitives = !state.config.enable_snap_primitives;
                save_haptics_config(&state.config);
                unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                return;
            }

            // Presets & Test Hit (y = 334..370)
            if y >= 334 && y <= 370 {
                if x >= 14 && x <= 104 {
                    // Balanced
                    state.config.amplitude_scale = 2.0;
                    state.config.base_amplitude = 70;
                    state.config.punch_duration_ms = 90;
                    state.config.min_velocity = 0.020;
                    state.config.sub_bass_high_hz = 90;
                    save_haptics_config(&state.config);
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                } else if x >= 112 && x <= 202 {
                    // Heavy Bass
                    state.config.amplitude_scale = 2.8;
                    state.config.base_amplitude = 95;
                    state.config.punch_duration_ms = 110;
                    state.config.min_velocity = 0.015;
                    state.config.sub_bass_high_hz = 110;
                    save_haptics_config(&state.config);
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                } else if x >= 210 && x <= 300 {
                    // Snappy
                    state.config.amplitude_scale = 1.6;
                    state.config.base_amplitude = 55;
                    state.config.punch_duration_ms = 70;
                    state.config.min_velocity = 0.025;
                    state.config.sub_bass_high_hz = 80;
                    save_haptics_config(&state.config);
                    unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
                } else if x >= 308 && x <= 405 {
                    // Test Hit
                    if let Some(adb) = &state.adb {
                        trigger_test_haptic(adb);
                    }
                }
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
            // Master Gain: 0.5 .. 3.5
            let v = 0.5 + ratio * 3.0;
            state.config.amplitude_scale = (v * 10.0).round() / 10.0;
        }
        1 => {
            // Base Kick Floor: 15 .. 130
            let v = 15.0 + ratio * 115.0;
            state.config.base_amplitude = ((v / 5.0).round() * 5.0) as i32;
        }
        2 => {
            // Sustained Hold: 40 .. 150 ms
            let v = 40.0 + ratio * 110.0;
            state.config.punch_duration_ms = ((v / 5.0).round() * 5.0) as i32;
        }
        3 => {
            // Trigger Sens: 0.010 .. 0.080
            let v = 0.010 + ratio * 0.070;
            state.config.min_velocity = (v * 1000.0).round() / 1000.0;
        }
        4 => {
            // Sub-Bass Cutoff: 50 .. 150 Hz
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

    // Header Title (Rebranded to AudioToSmartphoneHaptics, NO badges)
    SetTextColor(mem_dc, rgb(245, 194, 231)); // Pink
    let title_text: Vec<u16> = "⚡ AudioToSmartphoneHaptics Tuning\0".encode_utf16().collect();
    let mut r_title = RECT { left: 16, top: 12, right: 350, bottom: 32 };
    DrawTextW(mem_dc, title_text.as_ptr(), (title_text.len() - 1) as i32, &mut r_title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Close Button [✕]
    SetTextColor(mem_dc, rgb(160, 160, 175));
    SelectObject(mem_dc, bold_font as HGDIOBJ);
    let close_text: Vec<u16> = "✕\0".encode_utf16().collect();
    let mut r_close = RECT { left: TUNING_WIDTH - 36, top: 12, right: TUNING_WIDTH - 12, bottom: 34 };
    DrawTextW(mem_dc, close_text.as_ptr(), (close_text.len() - 1) as i32, &mut r_close, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    // Subtitle
    SelectObject(mem_dc, small_font as HGDIOBJ);
    SetTextColor(mem_dc, rgb(140, 140, 155));
    let sub_text: Vec<u16> = "WASAPI loopback multi-band transient DSP & tactile synthesis\0".encode_utf16().collect();
    let mut r_sub = RECT { left: 16, top: 32, right: TUNING_WIDTH - 16, bottom: 48 };
    DrawTextW(mem_dc, sub_text.as_ptr(), (sub_text.len() - 1) as i32, &mut r_sub, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    if let Ok(lock) = TUNING_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            // ==========================================
            // REAL-TIME PWM & AUDIO VISUALIZER CANVAS
            // ==========================================
            let c_left = 14;
            let c_top = 52;
            let c_right = TUNING_WIDTH - 14;
            let c_bottom = 122;
            let c_w = c_right - c_left;
            let c_h = c_bottom - c_top;

            // Canvas Background (#101018)
            let c_bg = CreateSolidBrush(rgb(16, 16, 24));
            let c_border = CreatePen(PS_SOLID as i32, 1, rgb(42, 43, 61));
            let old_b = SelectObject(mem_dc, c_bg as HGDIOBJ);
            let old_p = SelectObject(mem_dc, c_border as HGDIOBJ);
            RoundRect(mem_dc, c_left, c_top, c_right, c_bottom, 8, 8);
            SelectObject(mem_dc, old_b);
            SelectObject(mem_dc, old_p);
            DeleteObject(c_bg as HGDIOBJ);
            DeleteObject(c_border as HGDIOBJ);

            // Duty-cycle guide lines: 25%, 50%, 75%
            let guide_pen = CreatePen(PS_SOLID as i32, 1, rgb(24, 26, 40));
            let old_gp = SelectObject(mem_dc, guide_pen as HGDIOBJ);
            for &pct in &[0.25f32, 0.50f32, 0.75f32] {
                let y_line = (c_bottom - 4) - (pct * (c_h - 16) as f32) as i32;
                MoveToEx(mem_dc, c_left + 4, y_line, std::ptr::null_mut());
                LineTo(mem_dc, c_right - 4, y_line);
            }
            SelectObject(mem_dc, old_gp);
            DeleteObject(guide_pen as HGDIOBJ);

            // 1. Synthesized PWM Duty-Cycle Envelope (Neon Pink + Polygon area fill #2c1424)
            let n_pts = 55;
            let mut pwm_points: Vec<POINT> = Vec::with_capacity(n_pts);
            for i in 0..n_pts {
                let x = c_left + 4 + (i as i32 * (c_w - 8)) / (n_pts as i32 - 1);
                let val = state.visualizer.pwm_hist[i];
                let y = (c_bottom - 4) - (val * (c_h - 16) as f32) as i32;
                pwm_points.push(POINT { x, y: y.clamp(c_top + 4, c_bottom - 4) });
            }

            // Fill area underneath PWM curve
            let mut poly_pts = Vec::with_capacity(n_pts + 2);
            poly_pts.push(POINT { x: c_left + 4, y: c_bottom - 4 });
            poly_pts.extend_from_slice(&pwm_points);
            poly_pts.push(POINT { x: c_right - 4, y: c_bottom - 4 });

            let area_brush = CreateSolidBrush(rgb(44, 20, 36));
            let null_p = CreatePen(PS_SOLID as i32, 0, rgb(44, 20, 36));
            let old_ab = SelectObject(mem_dc, area_brush as HGDIOBJ);
            let old_np = SelectObject(mem_dc, null_p as HGDIOBJ);
            Polygon(mem_dc, poly_pts.as_ptr(), poly_pts.len() as i32);
            SelectObject(mem_dc, old_ab);
            SelectObject(mem_dc, old_np);
            DeleteObject(area_brush as HGDIOBJ);
            DeleteObject(null_p as HGDIOBJ);

            // Draw PWM envelope line (Neon Pink #ff2a85)
            let pink_pen = CreatePen(PS_SOLID as i32, 2, rgb(255, 42, 133));
            let old_pp = SelectObject(mem_dc, pink_pen as HGDIOBJ);
            Polyline(mem_dc, pwm_points.as_ptr(), n_pts as i32);
            SelectObject(mem_dc, old_pp);
            DeleteObject(pink_pen as HGDIOBJ);

            // 2. Audio Waveform Line (Cyan #00c8ff)
            let mut audio_points: Vec<POINT> = Vec::with_capacity(n_pts);
            for i in 0..n_pts {
                let x = c_left + 4 + (i as i32 * (c_w - 8)) / (n_pts as i32 - 1);
                let val = state.visualizer.audio_hist[i];
                let y = (c_bottom - 4) - (val * (c_h - 16) as f32) as i32;
                audio_points.push(POINT { x, y: y.clamp(c_top + 4, c_bottom - 4) });
            }
            let cyan_pen = CreatePen(PS_SOLID as i32, 1, rgb(0, 200, 255));
            let old_cp = SelectObject(mem_dc, cyan_pen as HGDIOBJ);
            Polyline(mem_dc, audio_points.as_ptr(), n_pts as i32);
            SelectObject(mem_dc, old_cp);
            DeleteObject(cyan_pen as HGDIOBJ);

            // 3. Telemetry HUD Text on Top of Canvas
            SelectObject(mem_dc, hud_bold as HGDIOBJ);
            if !state.visualizer.enabled {
                SetTextColor(mem_dc, rgb(255, 215, 64)); // Amber
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 6, right: c_left + 220, bottom: c_top + 22 };
                let txt: Vec<u16> = "⏸️ HAPTICS PAUSED / MUTED\0".encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            } else if state.visualizer.pwm > 0 || state.visualizer.hit {
                SetTextColor(mem_dc, rgb(255, 42, 133)); // Neon Pink
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 6, right: c_left + 220, bottom: c_top + 22 };
                let txt: Vec<u16> = format!("⚡ PWM: {}%  [PEAK {}]\0", state.visualizer.pwm, state.visualizer.peak).encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            } else {
                SetTextColor(mem_dc, rgb(130, 130, 145)); // Muted
                let mut r_txt = RECT { left: c_left + 8, top: c_top + 6, right: c_left + 220, bottom: c_top + 22 };
                let txt: Vec<u16> = "⚡ PWM: IDLE (0%)\0".encode_utf16().collect();
                DrawTextW(mem_dc, txt.as_ptr(), (txt.len() - 1) as i32, &mut r_txt, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            }

            // Right side HUD details
            SelectObject(mem_dc, small_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(160, 160, 175));
            let mut r_info = RECT { left: c_right - 180, top: c_top + 6, right: c_right - 8, bottom: c_top + 22 };
            let info_txt: Vec<u16> = format!("Sub: {}%  •  Vel: {:.3}\0", (state.visualizer.sub * 100.0) as i32, state.visualizer.vel).encode_utf16().collect();
            DrawTextW(mem_dc, info_txt.as_ptr(), (info_txt.len() - 1) as i32, &mut r_info, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

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

            let slider_y_starts = [132, 166, 200, 234, 268];
            for (i, (label, val_str, ratio, accent)) in sliders.iter().enumerate() {
                let sy = slider_y_starts[i];

                // Label
                SelectObject(mem_dc, norm_font as HGDIOBJ);
                SetTextColor(mem_dc, rgb(190, 190, 205));
                let l_u16: Vec<u16> = format!("{}\0", label).encode_utf16().collect();
                let mut r_l = RECT { left: 16, top: sy, right: 130, bottom: sy + 20 };
                DrawTextW(mem_dc, l_u16.as_ptr(), (l_u16.len() - 1) as i32, &mut r_l, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

                // Slider Track Trough
                let t_left = 135;
                let t_right = 335;
                let t_y = sy + 8;
                let trough_brush = CreateSolidBrush(rgb(35, 35, 46));
                let trough_rect = RECT { left: t_left, top: t_y, right: t_right, bottom: t_y + 6 };
                FillRect(mem_dc, &trough_rect, trough_brush);
                DeleteObject(trough_brush as HGDIOBJ);

                // Filled portion
                let clamped_ratio = (*ratio).clamp(0.0, 1.0);
                let fill_right = t_left + ((t_right - t_left) as f32 * clamped_ratio) as i32;
                let fill_brush = CreateSolidBrush(*accent);
                let fill_rect = RECT { left: t_left, top: t_y, right: fill_right, bottom: t_y + 6 };
                FillRect(mem_dc, &fill_rect, fill_brush);
                DeleteObject(fill_brush as HGDIOBJ);

                // Knob
                let knob_brush = CreateSolidBrush(rgb(250, 250, 255));
                let knob_rect = RECT { left: fill_right - 6, top: t_y - 4, right: fill_right + 6, bottom: t_y + 10 };
                FillRect(mem_dc, &knob_rect, knob_brush);
                DeleteObject(knob_brush as HGDIOBJ);

                // Value Readout
                SelectObject(mem_dc, bold_font as HGDIOBJ);
                SetTextColor(mem_dc, *accent);
                let v_u16: Vec<u16> = format!("{}\0", val_str).encode_utf16().collect();
                let mut r_v = RECT { left: 345, top: sy, right: TUNING_WIDTH - 16, bottom: sy + 20 };
                DrawTextW(mem_dc, v_u16.as_ptr(), (v_u16.len() - 1) as i32, &mut r_v, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);
            }

            // Snare Hardware Primitives Checkbox (y = 302..322)
            SelectObject(mem_dc, norm_font as HGDIOBJ);
            let chk_str = if state.config.enable_snap_primitives {
                "[✓] Crisp Hardware Primitives (TICK / CLICK for Snares)\0"
            } else {
                "[  ] Crisp Hardware Primitives (TICK / CLICK for Snares)\0"
            };
            SetTextColor(mem_dc, if state.config.enable_snap_primitives { rgb(79, 195, 247) } else { rgb(120, 120, 135) });
            let chk_u16: Vec<u16> = chk_str.encode_utf16().collect();
            let mut r_chk = RECT { left: 16, top: 302, right: TUNING_WIDTH - 16, bottom: 322 };
            DrawTextW(mem_dc, chk_u16.as_ptr(), (chk_u16.len() - 1) as i32, &mut r_chk, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Bottom Presets & Test Hit Buttons (y = 334..366)
            draw_tuning_btn(mem_dc, 14, 334, 90, 32, "🎵 Balanced", rgb(245, 194, 231), norm_font);
            draw_tuning_btn(mem_dc, 112, 334, 90, 32, "🔊 Heavy", rgb(186, 104, 200), norm_font);
            draw_tuning_btn(mem_dc, 210, 334, 90, 32, "⚡ Snappy", rgb(79, 195, 247), norm_font);
            draw_tuning_btn(mem_dc, 308, 334, 98, 32, "🎯 Test Hit", rgb(105, 240, 174), bold_font);
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

unsafe fn draw_tuning_btn(hdc: HDC, x: i32, y: i32, w: i32, h: i32, text: &str, color: COLORREF, font: HFONT) {
    let brush = CreateSolidBrush(rgb(30, 30, 40));
    let pen = CreatePen(PS_SOLID as i32, 1, rgb(50, 50, 65));
    let old_brush = SelectObject(hdc, brush as HGDIOBJ);
    let old_pen = SelectObject(hdc, pen as HGDIOBJ);
    RoundRect(hdc, x, y, x + w, y + h, 10, 10);
    SelectObject(hdc, old_brush);
    SelectObject(hdc, old_pen);
    DeleteObject(brush as HGDIOBJ);
    DeleteObject(pen as HGDIOBJ);

    let old_font = SelectObject(hdc, font as HGDIOBJ);
    SetTextColor(hdc, color);
    let u16_txt: Vec<u16> = format!("{}\0", text).encode_utf16().collect();
    let mut rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
    DrawTextW(hdc, u16_txt.as_ptr(), (u16_txt.len() - 1) as i32, &mut rect, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SelectObject(hdc, old_font);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}
