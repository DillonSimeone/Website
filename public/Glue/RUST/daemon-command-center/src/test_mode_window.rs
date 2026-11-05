use std::f32::consts::PI;
use std::mem::zeroed;
use std::sync::Mutex;
use windows_sys::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreatePen,
    CreateRoundRectRgn, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    GetStockObject, InvalidateRect, RoundRect, ScreenToClient, SelectObject, SetBkMode,
    SetTextColor, SetWindowRgn, DT_CENTER, DT_LEFT, DT_RIGHT, DT_SINGLELINE, DT_VCENTER, FW_BOLD,
    FW_SEMIBOLD, HDC, HGDIOBJ, NULL_BRUSH, PAINTSTRUCT, PS_SOLID, SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetCursorPos, IsWindowVisible, LoadCursorW,
    RegisterClassW, SetCursor, SetForegroundWindow, ShowWindow,
    IDC_ARROW, IDC_HAND, SW_HIDE, SW_SHOW, WM_KILLFOCUS, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT, WM_SETCURSOR, WNDCLASSW, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_POPUP,
};

#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(psz_sound: *const u8, hmod: isize, fdw_sound: u32) -> i32;
}

const SND_ASYNC: u32 = 0x0001;
const SND_NODEFAULT: u32 = 0x0002;
const SND_MEMORY: u32 = 0x0004;
const SND_LOOP: u32 = 0x0008;

pub const TEST_WIDTH: i32 = 340;
pub const TEST_HEIGHT: i32 = 444;

pub struct TestModeState {
    pub active_track: Option<usize>,
    pub volume_pct: u32,
    pub dragging_vol: bool,
    pub wav_buffer: Option<Vec<u8>>,
}

pub static TEST_STATE: Mutex<Option<TestModeState>> = Mutex::new(None);
static mut TEST_HWND: HWND = std::ptr::null_mut();

pub fn get_test_hwnd() -> HWND {
    unsafe { TEST_HWND }
}

pub struct TrackInfo {
    pub title: &'static str,
    pub subtitle: &'static str,
    pub is_nature: bool,
}

pub const TRACKS: [TrackInfo; 7] = [
    TrackInfo {
        title: "🌊 Synth Bass Swell",
        subtitle: "Continuous 0-100% PWM volume ramp",
        is_nature: false,
    },
    TrackInfo {
        title: "🥁 808 Sub Drops & Snare Snap",
        subtitle: "Deep 45Hz glides + crisp snare clicks",
        is_nature: false,
    },
    TrackInfo {
        title: "🎸 Funky Slap Bass Groove",
        subtitle: "Soft ghost notes vs hard thumb slaps",
        is_nature: false,
    },
    TrackInfo {
        title: "🎻 Cello & Timpani Crescendo",
        subtitle: "Bowed low strings & orchestral swell",
        is_nature: false,
    },
    TrackInfo {
        title: "⛈️ Rolling Thunder & Rainstorm",
        subtitle: "Pattering rain + deep rolling thunder",
        is_nature: true,
    },
    TrackInfo {
        title: "🌊 Ocean Surf on Pebble Shore",
        subtitle: "Rhythmic 6s wave swells & foam wash",
        is_nature: true,
    },
    TrackInfo {
        title: "🔥 Campfire & Deep Wind Gusts",
        subtitle: "Warm low wind drafts + ember snaps",
        is_nature: true,
    },
];

pub fn create_test_window() -> HWND {
    let class_name: Vec<u16> = "GlueHapticsTestModeWindowClass\0".encode_utf16().collect();
    let title: Vec<u16> = "Haptics Test Mode\0".encode_utf16().collect();

    unsafe {
        let h_instance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(test_wndproc),
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
            TEST_WIDTH,
            TEST_HEIGHT,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            h_instance,
            std::ptr::null(),
        );

        if !hwnd.is_null() {
            let rgn = CreateRoundRectRgn(0, 0, TEST_WIDTH + 1, TEST_HEIGHT + 1, 16, 16);
            SetWindowRgn(hwnd, rgn, 1);
        }

        if let Ok(mut lock) = TEST_STATE.lock() {
            if lock.is_none() {
                *lock = Some(TestModeState {
                    active_track: None,
                    volume_pct: 80,
                    dragging_vol: false,
                    wav_buffer: None,
                });
            }
        }

        TEST_HWND = hwnd;
        hwnd
    }
}

pub fn toggle_test_window(_tuning_hwnd: HWND) {
    unsafe {
        if TEST_HWND.is_null() {
            create_test_window();
        }

        if IsWindowVisible(TEST_HWND) != 0 {
            close_test_window();
        } else {
            ShowWindow(TEST_HWND, SW_SHOW);
            crate::tuning_window::register_drawer_opened(crate::tuning_window::LeftDrawer::TestMode);
            SetForegroundWindow(TEST_HWND);
            InvalidateRect(TEST_HWND, std::ptr::null(), 0);
        }
    }
}

pub fn close_test_window() {
    stop_test_audio();
    unsafe {
        if !TEST_HWND.is_null() && IsWindowVisible(TEST_HWND) != 0 {
            ShowWindow(TEST_HWND, SW_HIDE);
        }
    }
    crate::tuning_window::register_drawer_closed(crate::tuning_window::LeftDrawer::TestMode);
}

pub fn stop_test_audio() {
    unsafe {
        PlaySoundW(std::ptr::null(), 0, 0);
    }
    if let Ok(mut lock) = TEST_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            state.active_track = None;
            state.wav_buffer = None;
        }
    }
    unsafe {
        if !TEST_HWND.is_null() && IsWindowVisible(TEST_HWND) != 0 {
            InvalidateRect(TEST_HWND, std::ptr::null(), 0);
        }
    }
}

fn start_track(track_idx: usize) {
    unsafe {
        PlaySoundW(std::ptr::null(), 0, 0);
    }
    if let Ok(mut lock) = TEST_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            let vol = (state.volume_pct as f32 / 100.0).clamp(0.05, 1.0);
            let wav = synthesize_track_wav(track_idx, vol);
            let ptr = wav.as_ptr();
            state.active_track = Some(track_idx);
            state.wav_buffer = Some(wav);
            unsafe {
                PlaySoundW(ptr, 0, SND_MEMORY | SND_ASYNC | SND_LOOP | SND_NODEFAULT);
            }
        }
    }
}

unsafe extern "system" fn test_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            render_test_window(hwnd, hdc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_SETCURSOR => {
            let mut pt: POINT = zeroed();
            GetCursorPos(&mut pt);
            ScreenToClient(hwnd, &mut pt);
            if is_test_clickable(pt.x, pt.y) {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_HAND));
            } else {
                SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_ARROW));
            }
            1
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i32;
            handle_test_mouse_down(hwnd, x, y);
            0
        }
        WM_MOUSEMOVE => {
            if (wparam & 1) != 0 {
                let x = (lparam & 0xFFFF) as i32;
                handle_test_mouse_move(hwnd, x);
            }
            0
        }
        WM_LBUTTONUP => {
            let mut restart: Option<usize> = None;
            if let Ok(mut lock) = TEST_STATE.lock() {
                if let Some(state) = lock.as_mut() {
                    if state.dragging_vol {
                        state.dragging_vol = false;
                        restart = state.active_track;
                    }
                }
            }
            if let Some(idx) = restart {
                start_track(idx);
            }
            0
        }
        WM_KILLFOCUS => {
            let focus_hwnd = wparam as HWND;
            if !crate::tuning_window::is_glue_popup_hwnd(focus_hwnd) {
                close_test_window();
                crate::tuning_window::close_tuning_window();
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn is_test_clickable(x: i32, y: i32) -> bool {
    // Mic Mode button in header (x = 196..296, y = 8..32)
    if x >= 196 && x <= 296 && y >= 8 && y <= 32 {
        return true;
    }
    // Close button
    if x >= TEST_WIDTH - 36 && x <= TEST_WIDTH - 12 && y >= 12 && y <= 36 {
        return true;
    }
    // Volume slider (y = 50..74, x = 95..285)
    if y >= 50 && y <= 74 && x >= 95 && x <= 285 {
        return true;
    }
    // Track rows (7 tracks)
    for i in 0..TRACKS.len() {
        let ry = track_row_y(i);
        if y >= ry && y <= ry + 38 && x >= 14 && x <= TEST_WIDTH - 14 {
            return true;
        }
    }
    // Stop button (y = 398..434)
    if y >= 398 && y <= 434 && x >= 14 && x <= TEST_WIDTH - 14 {
        return true;
    }
    false
}

fn track_row_y(idx: usize) -> i32 {
    if idx < 4 {
        // Music section (starts at y = 98)
        98 + (idx as i32 * 41)
    } else {
        // Nature section (starts at y = 282)
        282 + ((idx - 4) as i32 * 41)
    }
}

fn handle_test_mouse_down(hwnd: HWND, x: i32, y: i32) {
    // Close button
    if x >= TEST_WIDTH - 36 && x <= TEST_WIDTH - 12 && y >= 12 && y <= 36 {
        close_test_window();
        let tuning_hwnd = crate::tuning_window::get_tuning_hwnd();
        if !tuning_hwnd.is_null() {
            unsafe { InvalidateRect(tuning_hwnd, std::ptr::null(), 0); }
        }
        return;
    }

    // Mic Mode toggle button in header (x = 196..296, y = 8..32)
    if x >= 196 && x <= 296 && y >= 8 && y <= 32 {
        if !crate::tuning_window::is_mic_mode_enabled() {
            stop_test_audio();
        }
        crate::tuning_window::toggle_mic_mode_shared();
        return;
    }

    // Volume slider
    if y >= 50 && y <= 74 && x >= 95 && x <= 285 {
        if let Ok(mut lock) = TEST_STATE.lock() {
            if let Some(state) = lock.as_mut() {
                state.dragging_vol = true;
                let ratio = ((x as f32 - 100.0) / 180.0).clamp(0.05, 1.0);
                state.volume_pct = ((ratio * 20.0).round() as u32 * 5).clamp(5, 100);
            }
        }
        unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
        return;
    }

    // Track buttons
    for i in 0..TRACKS.len() {
        let ry = track_row_y(i);
        if y >= ry && y <= ry + 38 && x >= 14 && x <= TEST_WIDTH - 14 {
            let currently_active = TEST_STATE
                .lock()
                .ok()
                .and_then(|l| l.as_ref().and_then(|s| s.active_track));
            if currently_active == Some(i) {
                stop_test_audio();
            } else {
                // If Mic Mode was active, switch back to Speaker Loopback so the test loop pipes directly
                if crate::tuning_window::is_mic_mode_enabled() {
                    crate::tuning_window::toggle_mic_mode_shared();
                }
                start_track(i);
            }
            unsafe {
                InvalidateRect(hwnd, std::ptr::null(), 0);
                let tuning_hwnd = crate::tuning_window::get_tuning_hwnd();
                if !tuning_hwnd.is_null() {
                    InvalidateRect(tuning_hwnd, std::ptr::null(), 0);
                }
            }
            return;
        }
    }

    // Stop button
    if y >= 398 && y <= 434 && x >= 14 && x <= TEST_WIDTH - 14 {
        stop_test_audio();
        unsafe {
            InvalidateRect(hwnd, std::ptr::null(), 0);
            let tuning_hwnd = crate::tuning_window::get_tuning_hwnd();
            if !tuning_hwnd.is_null() {
                InvalidateRect(tuning_hwnd, std::ptr::null(), 0);
            }
        }
    }
}

fn handle_test_mouse_move(hwnd: HWND, x: i32) {
    if let Ok(mut lock) = TEST_STATE.lock() {
        if let Some(state) = lock.as_mut() {
            if state.dragging_vol {
                let ratio = ((x as f32 - 100.0) / 180.0).clamp(0.05, 1.0);
                state.volume_pct = ((ratio * 20.0).round() as u32 * 5).clamp(5, 100);
                unsafe { InvalidateRect(hwnd, std::ptr::null(), 0); }
            }
        }
    }
}

unsafe fn render_test_window(_hwnd: HWND, hdc: HDC) {
    let mem_dc = CreateCompatibleDC(hdc);
    let mem_bmp = CreateCompatibleBitmap(hdc, TEST_WIDTH, TEST_HEIGHT);
    let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

    // Background: Dark acrylic (#16161c)
    let bg_brush = CreateSolidBrush(rgb(22, 22, 28));
    let bg_rect = RECT { left: 0, top: 0, right: TEST_WIDTH, bottom: TEST_HEIGHT };
    FillRect(mem_dc, &bg_rect, bg_brush);
    DeleteObject(bg_brush as HGDIOBJ);

    // Border (#2e2e3a)
    let border_pen = CreatePen(PS_SOLID as i32, 1, rgb(46, 46, 58));
    let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
    let null_brush = GetStockObject(NULL_BRUSH);
    let old_brush = SelectObject(mem_dc, null_brush);
    RoundRect(mem_dc, 0, 0, TEST_WIDTH, TEST_HEIGHT, 16, 16);
    SelectObject(mem_dc, old_pen);
    SelectObject(mem_dc, old_brush);
    DeleteObject(border_pen as HGDIOBJ);

    SetBkMode(mem_dc, TRANSPARENT as i32);

    let font_name: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
    let title_font = CreateFontW(15, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let bold_font = CreateFontW(12, 0, 0, 0, FW_BOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let norm_font = CreateFontW(12, 0, 0, 0, FW_SEMIBOLD as i32, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());
    let small_font = CreateFontW(11, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 5, 0, font_name.as_ptr());

    let old_font = SelectObject(mem_dc, title_font as HGDIOBJ);

    // Header Title
    SetTextColor(mem_dc, rgb(105, 240, 174)); // Neon Mint
    let title_text: Vec<u16> = "🎧 Haptic Test Lab\0".encode_utf16().collect();
    let mut r_title = RECT { left: 16, top: 8, right: 192, bottom: 30 };
    DrawTextW(mem_dc, title_text.as_ptr(), (title_text.len() - 1) as i32, &mut r_title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    // Header [🎤 MIC MODE] button (x = 196..296, y = 8..30)
    let mic_on = crate::tuning_window::is_mic_mode_enabled();
    let m_bg = CreateSolidBrush(if mic_on { rgb(64, 42, 18) } else { rgb(30, 30, 40) });
    let m_pen = CreatePen(PS_SOLID as i32, 1, if mic_on { rgb(255, 171, 64) } else { rgb(52, 52, 68) });
    let ob = SelectObject(mem_dc, m_bg as HGDIOBJ);
    let op = SelectObject(mem_dc, m_pen as HGDIOBJ);
    RoundRect(mem_dc, 196, 8, 296, 30, 8, 8);
    SelectObject(mem_dc, ob);
    SelectObject(mem_dc, op);
    DeleteObject(m_bg as HGDIOBJ);
    DeleteObject(m_pen as HGDIOBJ);

    SelectObject(mem_dc, bold_font as HGDIOBJ);
    SetTextColor(mem_dc, if mic_on { rgb(255, 215, 64) } else { rgb(190, 195, 215) });
    let m_txt: Vec<u16> = if mic_on { "🎙️ MIC: ON\0" } else { "🎤 MIC MODE\0" }.encode_utf16().collect();
    let mut r_m = RECT { left: 196, top: 8, right: 296, bottom: 30 };
    DrawTextW(mem_dc, m_txt.as_ptr(), (m_txt.len() - 1) as i32, &mut r_m, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    // Close Button [✕]
    SetTextColor(mem_dc, rgb(160, 160, 175));
    let close_text: Vec<u16> = "✕\0".encode_utf16().collect();
    let mut r_close = RECT { left: TEST_WIDTH - 36, top: 8, right: TEST_WIDTH - 12, bottom: 30 };
    DrawTextW(mem_dc, close_text.as_ptr(), (close_text.len() - 1) as i32, &mut r_close, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    // Subtitle
    SelectObject(mem_dc, small_font as HGDIOBJ);
    SetTextColor(mem_dc, if mic_on { rgb(255, 215, 64) } else { rgb(140, 140, 155) });
    let sub_str = if mic_on {
        "🎙️ Live Computer Mics -> Phone Haptics (Speak, hum, or tap!)\0"
    } else {
        "100% offline procedural synthesis (0 bytes data used)\0"
    };
    let sub_text: Vec<u16> = sub_str.encode_utf16().collect();
    let mut r_sub = RECT { left: 16, top: 31, right: TEST_WIDTH - 16, bottom: 47 };
    DrawTextW(mem_dc, sub_text.as_ptr(), (sub_text.len() - 1) as i32, &mut r_sub, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    if let Ok(lock) = TEST_STATE.lock() {
        if let Some(state) = lock.as_ref() {
            // Volume Slider Row (y = 50..72)
            SelectObject(mem_dc, norm_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(200, 200, 215));
            let v_lbl: Vec<u16> = "Loop Vol:\0".encode_utf16().collect();
            let mut r_vl = RECT { left: 16, top: 50, right: 95, bottom: 70 };
            DrawTextW(mem_dc, v_lbl.as_ptr(), (v_lbl.len() - 1) as i32, &mut r_vl, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            let t_left = 100;
            let t_right = 280;
            let t_y = 58;
            let trough_brush = CreateSolidBrush(rgb(35, 35, 46));
            let trough_rect = RECT { left: t_left, top: t_y, right: t_right, bottom: t_y + 6 };
            FillRect(mem_dc, &trough_rect, trough_brush);
            DeleteObject(trough_brush as HGDIOBJ);

            let ratio = (state.volume_pct as f32 / 100.0).clamp(0.0, 1.0);
            let fill_right = t_left + ((t_right - t_left) as f32 * ratio) as i32;
            let fill_brush = CreateSolidBrush(rgb(105, 240, 174));
            let fill_rect = RECT { left: t_left, top: t_y, right: fill_right, bottom: t_y + 6 };
            FillRect(mem_dc, &fill_rect, fill_brush);
            DeleteObject(fill_brush as HGDIOBJ);

            let knob_brush = CreateSolidBrush(rgb(250, 250, 255));
            let knob_rect = RECT { left: fill_right - 5, top: t_y - 4, right: fill_right + 5, bottom: t_y + 10 };
            FillRect(mem_dc, &knob_rect, knob_brush);
            DeleteObject(knob_brush as HGDIOBJ);

            SelectObject(mem_dc, bold_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(105, 240, 174));
            let v_val: Vec<u16> = format!("{}%\0", state.volume_pct).encode_utf16().collect();
            let mut r_vv = RECT { left: 285, top: 50, right: TEST_WIDTH - 16, bottom: 70 };
            DrawTextW(mem_dc, v_val.as_ptr(), (v_val.len() - 1) as i32, &mut r_vv, DT_RIGHT | DT_SINGLELINE | DT_VCENTER);

            // Section 1 Header: MUSIC LOOPS
            SelectObject(mem_dc, bold_font as HGDIOBJ);
            SetTextColor(mem_dc, rgb(245, 194, 231)); // Pink
            let m_hdr: Vec<u16> = "🎵 MUSIC & BASS ENVELOPE LOOPS\0".encode_utf16().collect();
            let mut r_mh = RECT { left: 16, top: 76, right: TEST_WIDTH - 16, bottom: 94 };
            DrawTextW(mem_dc, m_hdr.as_ptr(), (m_hdr.len() - 1) as i32, &mut r_mh, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Section 2 Header: NATURE SOUNDS
            SetTextColor(mem_dc, rgb(79, 195, 247)); // Cyan
            let n_hdr: Vec<u16> = "🌿 NATURE & ORGANIC TEXTURE LOOPS\0".encode_utf16().collect();
            let mut r_nh = RECT { left: 16, top: 263, right: TEST_WIDTH - 16, bottom: 281 };
            DrawTextW(mem_dc, n_hdr.as_ptr(), (n_hdr.len() - 1) as i32, &mut r_nh, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

            // Render Track Buttons
            for (i, trk) in TRACKS.iter().enumerate() {
                let ry = track_row_y(i);
                let is_active = state.active_track == Some(i);

                let bg_col = if is_active {
                    if trk.is_nature { rgb(20, 48, 62) } else { rgb(52, 24, 46) }
                } else {
                    rgb(28, 28, 38)
                };
                let border_col = if is_active {
                    if trk.is_nature { rgb(79, 195, 247) } else { rgb(255, 42, 133) }
                } else {
                    rgb(45, 45, 58)
                };

                let b_brush = CreateSolidBrush(bg_col);
                let b_pen = CreatePen(PS_SOLID as i32, 1, border_col);
                let ob = SelectObject(mem_dc, b_brush as HGDIOBJ);
                let op = SelectObject(mem_dc, b_pen as HGDIOBJ);
                RoundRect(mem_dc, 14, ry, TEST_WIDTH - 14, ry + 38, 8, 8);
                SelectObject(mem_dc, ob);
                SelectObject(mem_dc, op);
                DeleteObject(b_brush as HGDIOBJ);
                DeleteObject(b_pen as HGDIOBJ);

                // Track title
                SelectObject(mem_dc, bold_font as HGDIOBJ);
                SetTextColor(
                    mem_dc,
                    if is_active {
                        rgb(255, 255, 255)
                    } else {
                        rgb(215, 215, 228)
                    },
                );
                let prefix = if is_active { "▶ LOOPING: " } else { "" };
                let t_u16: Vec<u16> = format!("{}{}\0", prefix, trk.title).encode_utf16().collect();
                let mut r_t = RECT { left: 22, top: ry + 4, right: TEST_WIDTH - 22, bottom: ry + 20 };
                DrawTextW(mem_dc, t_u16.as_ptr(), (t_u16.len() - 1) as i32, &mut r_t, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

                // Subtitle
                SelectObject(mem_dc, small_font as HGDIOBJ);
                SetTextColor(
                    mem_dc,
                    if is_active {
                        rgb(105, 240, 174)
                    } else {
                        rgb(135, 135, 150)
                    },
                );
                let s_u16: Vec<u16> = format!("{}\0", trk.subtitle).encode_utf16().collect();
                let mut r_s = RECT { left: 22, top: ry + 20, right: TEST_WIDTH - 22, bottom: ry + 35 };
                DrawTextW(mem_dc, s_u16.as_ptr(), (s_u16.len() - 1) as i32, &mut r_s, DT_LEFT | DT_SINGLELINE | DT_VCENTER);
            }

            // Bottom Stop Button (y = 408..434)
            let stop_y = 408;
            let has_active = state.active_track.is_some();
            let s_bg = CreateSolidBrush(if has_active { rgb(64, 24, 32) } else { rgb(28, 28, 36) });
            let s_pen = CreatePen(PS_SOLID as i32, 1, if has_active { rgb(255, 82, 82) } else { rgb(48, 48, 60) });
            let ob = SelectObject(mem_dc, s_bg as HGDIOBJ);
            let op = SelectObject(mem_dc, s_pen as HGDIOBJ);
            RoundRect(mem_dc, 14, stop_y, TEST_WIDTH - 14, stop_y + 26, 8, 8);
            SelectObject(mem_dc, ob);
            SelectObject(mem_dc, op);
            DeleteObject(s_bg as HGDIOBJ);
            DeleteObject(s_pen as HGDIOBJ);

            SelectObject(mem_dc, bold_font as HGDIOBJ);
            SetTextColor(mem_dc, if has_active { rgb(255, 110, 110) } else { rgb(120, 120, 135) });
            let stop_txt = if has_active {
                "⏹ STOP ACTIVE AUDIO LOOP\0"
            } else {
                "⏹ Click any loop above to start testing\0"
            };
            let st_u16: Vec<u16> = stop_txt.encode_utf16().collect();
            let mut r_st = RECT { left: 14, top: stop_y, right: TEST_WIDTH - 14, bottom: stop_y + 26 };
            DrawTextW(mem_dc, st_u16.as_ptr(), (st_u16.len() - 1) as i32, &mut r_st, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
        }
    }

    SelectObject(mem_dc, old_font);
    DeleteObject(title_font as HGDIOBJ);
    DeleteObject(bold_font as HGDIOBJ);
    DeleteObject(norm_font as HGDIOBJ);
    DeleteObject(small_font as HGDIOBJ);

    BitBlt(hdc, 0, 0, TEST_WIDTH, TEST_HEIGHT, mem_dc, 0, 0, SRCCOPY);
    SelectObject(mem_dc, old_bmp);
    DeleteObject(mem_bmp as HGDIOBJ);
    DeleteDC(mem_dc);
}

#[inline(always)]
fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}

/// Fast deterministic PRNG for organic rain/surf/campfire noise synthesis
struct XorShift32(u32);
impl XorShift32 {
    fn next_f32(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        ((x as f32) / (u32::MAX as f32)) * 2.0 - 1.0
    }
}

/// Synthesizes a complete 16-bit 44.1 kHz Stereo PCM WAV file in memory for the chosen loop.
fn synthesize_track_wav(track_idx: usize, master_vol: f32) -> Vec<u8> {
    let sample_rate = 44100u32;
    let duration_secs = 6u32;
    let num_samples = (sample_rate * duration_secs) as usize;
    let data_bytes = (num_samples * 4) as u32; // Stereo 16-bit = 4 bytes/frame
    let mut buf = Vec::with_capacity(44 + data_bytes as usize);

    // RIFF WAVE Header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(36 + data_bytes).to_le_bytes());
    buf.extend_from_slice(b"WAVEfmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&2u16.to_le_bytes()); // 2 channels
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&(sample_rate * 4).to_le_bytes());
    buf.extend_from_slice(&4u16.to_le_bytes());
    buf.extend_from_slice(&16u16.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_bytes.to_le_bytes());

    let mut rng = XorShift32(0x13579BDF);
    let mut lp_state = 0.0f32;
    let mut lp_state2 = 0.0f32;
    let mut phase1 = 0.0f32;
    let mut phase2 = 0.0f32;
    let mut phase3 = 0.0f32;

    let dur_f = duration_secs as f32;

    for i in 0..num_samples {
        let t = i as f32 / sample_rate as f32;

        // Smooth loop crossfade at very ends (20ms) to avoid loop boundary click
        let edge_fade = if t < 0.02 {
            t / 0.02
        } else if t > dur_f - 0.02 {
            (dur_f - t) / 0.02
        } else {
            1.0
        };

        let sample = match track_idx {
            0 => {
                // 0: Synth Bass Swell (Continuous 0-100% PWM volume ramp over 6 seconds)
                // Smooth sine-squared breathing swell + gentle 2 Hz pulse modulation
                let breath = ((PI * t / dur_f).sin()).powi(2); // 0.0 -> 1.0 -> 0.0
                let ripple = 0.82 + 0.18 * (2.0 * PI * 1.5 * t).sin();
                let env = (0.06 + 0.94 * breath) * ripple;

                let f_sub = 44.0 + 14.0 * (PI * t / dur_f).sin();
                phase1 = (phase1 + f_sub / sample_rate as f32).fract();
                phase2 = (phase2 + (f_sub * 2.0) / sample_rate as f32).fract();
                phase3 = (phase3 + 220.0 / sample_rate as f32).fract();

                let sub = (2.0 * PI * phase1).sin() * 0.72;
                let warm_harm = (2.0 * PI * phase2).sin() * 0.22;
                let shimmer = (2.0 * PI * phase3).sin() * 0.06 * breath;
                (sub + warm_harm + shimmer) * env
            }
            1 => {
                // 1: 808 Sub Drops & Snare Snap (4-bar pattern over 6s, 1.5s per bar)
                let bar_t = t % 1.5;
                let bar_idx = (t / 1.5) as usize;
                // Dynamic kick velocities across the 4 bars: soft (0.4), medium (0.7), heavy (1.0), medium-heavy (0.85)
                let bar_vel = match bar_idx % 4 {
                    0 => 0.42,
                    1 => 0.72,
                    2 => 1.00,
                    _ => 0.85,
                };

                // Kick hits at 0.0s and 0.55s in each 1.5s bar; Snare hits at 0.375s and 1.125s
                let kick_t = if bar_t < 0.55 { bar_t } else { bar_t - 0.55 };
                let kick_active = bar_t < 0.48 || (bar_t >= 0.55 && bar_t < 1.05);

                let mut out = 0.0f32;
                if kick_active {
                    // 808 pitch drop from 115 Hz down to 46 Hz
                    let f_kick = 46.0 + 70.0 * (-kick_t * 28.0).exp();
                    phase1 = (phase1 + f_kick / sample_rate as f32).fract();
                    let k_env = (-kick_t * 5.2).exp();
                    out += (2.0 * PI * phase1).sin() * k_env * bar_vel * 0.85;
                }

                // Crisp snare at 0.375s and 1.125s
                for &sn_start in &[0.375f32, 1.125f32] {
                    if bar_t >= sn_start && bar_t < sn_start + 0.12 {
                        let st = bar_t - sn_start;
                        let s_env = (-st * 35.0).exp();
                        let body = (2.0 * PI * 210.0 * st).sin() * 0.4;
                        let snap = rng.next_f32() * (2.0 * PI * 850.0 * st).sin() * 0.6;
                        out += (body + snap) * s_env * 0.75;
                    }
                }
                out
            }
            2 => {
                // 2: Funky Slap Bass Groove (16th-note grid: step = 0.1875s, 32 steps in 6s)
                let step_dur = 0.1875f32;
                let step = (t / step_dur) as usize;
                let st = t % step_dur;

                // Note frequencies (E1=41.2, G1=49.0, A1=55.0, B1=61.7, D2=73.4, E2=82.4)
                let freqs = [41.2, 41.2, 82.4, 49.0, 55.0, 73.4, 61.7, 82.4];
                // Articulation intensities: ghost note (0.28), medium pluck (0.62), hard thumb slap (1.0)
                let amps = [0.95, 0.28, 0.85, 0.32, 0.65, 0.30, 1.00, 0.55];

                let f = freqs[step % freqs.len()];
                let a = amps[step % amps.len()];

                phase1 = (phase1 + f / sample_rate as f32).fract();
                phase2 = (phase2 + (f * 2.0) / sample_rate as f32).fract();
                phase3 = (phase3 + (f * 3.0) / sample_rate as f32).fract();

                let env = (-st * 11.0).exp();
                let slap_pop = if a > 0.8 && st < 0.025 {
                    (2.0 * PI * 620.0 * st).sin() * (-st * 90.0).exp() * 0.45
                } else {
                    0.0
                };
                let fund = (2.0 * PI * phase1).sin() * 0.65;
                let harm2 = (2.0 * PI * phase2).sin() * 0.25;
                let harm3 = (2.0 * PI * phase3).sin() * 0.10;
                (fund + harm2 + harm3 + slap_pop) * env * a
            }
            3 => {
                // 3: Cello & Timpani Crescendo (Bowed low Cello C2=65.4Hz -> G1=49Hz -> E2=82.4Hz with vibrato + timpani rolls)
                let section = (t / 2.0) as usize;
                let f_base = match section {
                    0 => 55.0,
                    1 => 65.4,
                    _ => 49.0,
                };
                let vibrato = 1.0 + 0.008 * (2.0 * PI * 5.5 * t).sin();
                let f = f_base * vibrato;

                phase1 = (phase1 + f / sample_rate as f32).fract();
                phase2 = (phase2 + (f * 2.0) / sample_rate as f32).fract();

                // Gradual crescendo across each 2-second phrase
                let phrase_t = t % 2.0;
                let bow_env = (phrase_t / 1.5).min(1.0) * (1.0 - ((phrase_t - 1.5).max(0.0) / 0.5) * 0.6);

                // Timpani roll pulse at the peak of each phrase (1.2s..1.8s)
                let timpani = if phrase_t >= 1.1 && phrase_t <= 1.85 {
                    let roll = (2.0 * PI * 9.0 * phrase_t).sin().abs();
                    (2.0 * PI * 52.0 * phrase_t).sin() * roll * 0.45
                } else {
                    0.0
                };

                let cello = ((2.0 * PI * phase1).sin() * 0.70 + (2.0 * PI * phase2).sin() * 0.30) * bow_env * 0.75;
                (cello + timpani).clamp(-1.0, 1.0)
            }
            4 => {
                // 4: Rolling Thunder & Rainstorm
                let white = rng.next_f32();
                // Gentle rain patter (band-limited noise)
                lp_state = 0.85 * lp_state + 0.15 * white;
                let rain = (white - lp_state) * 0.08;

                // Deep low-pass filtered noise for rolling thunder (35-85 Hz rumble)
                lp_state2 = 0.992 * lp_state2 + 0.008 * white;
                // Thunder envelope: initial crack at t=0.6s, rolling swells at t=1.4s and t=3.2s, long tail decay
                let crack = if t > 0.5 && t < 1.2 {
                    (-(t - 0.5) * 4.5).exp() * 0.9
                } else {
                    0.0
                };
                let roll1 = if t > 1.0 && t < 3.5 {
                    ((PI * (t - 1.0) / 2.5).sin()).powi(2) * 0.85
                } else {
                    0.0
                };
                let roll2 = if t > 2.8 && t < 5.6 {
                    ((PI * (t - 2.8) / 2.8).sin()).powi(2) * 0.65
                } else {
                    0.0
                };
                let thunder_env = (crack + roll1 + roll2).min(1.0);
                phase1 = (phase1 + 42.0 / sample_rate as f32).fract();
                let sub_rumble = ((2.0 * PI * phase1).sin() * 0.55 + lp_state2 * 6.5) * thunder_env;

                (rain + sub_rumble).clamp(-1.0, 1.0)
            }
            5 => {
                // 5: Ocean Surf on Pebble Shore (6-second natural wave cycle)
                let white = rng.next_f32();
                lp_state = 0.975 * lp_state + 0.025 * white;
                lp_state2 = 0.994 * lp_state2 + 0.006 * white;

                // Wave crests at t = 2.4s, then slowly washes back down the pebbles
                let wave_env = if t < 2.4 {
                    (t / 2.4).powf(1.8)
                } else {
                    ((dur_f - t) / (dur_f - 2.4)).powf(1.4)
                };

                phase1 = (phase1 + (46.0 + 18.0 * wave_env) / sample_rate as f32).fract();
                let deep_undertow = (2.0 * PI * phase1).sin() * 0.52 * wave_env;
                let surf_roar = lp_state * 1.8 * wave_env + lp_state2 * 3.0 * wave_env;
                let foam_wash = white * 0.09 * wave_env.powi(2);

                (deep_undertow + surf_roar + foam_wash).clamp(-1.0, 1.0)
            }
            _ => {
                // 6: Campfire & Deep Wind Gusts
                let white = rng.next_f32();
                lp_state = 0.993 * lp_state + 0.007 * white;

                // Slow warm wind gusts
                let gust_env = 0.25 + 0.75 * ((PI * t / 3.0).sin()).powi(2);
                phase1 = (phase1 + (48.0 + 15.0 * gust_env) / sample_rate as f32).fract();
                let wind = ((2.0 * PI * phase1).sin() * 0.55 + lp_state * 4.5) * gust_env * 0.75;

                // Crisp wood-ember snaps/pops at pseudo-random intervals
                let snap_phase = (t * 17.3).fract();
                let is_ember_pop = ((t * 7.0) as u32 % 3 == 0) && snap_phase < 0.06;
                let ember = if is_ember_pop {
                    let st = snap_phase / 0.06;
                    (2.0 * PI * 780.0 * st).sin() * (-st * 6.0).exp() * 0.65
                } else {
                    0.0
                };

                (wind + ember).clamp(-1.0, 1.0)
            }
        };

        let scaled = (sample * master_vol * edge_fade).clamp(-0.98, 0.98);
        let pcm = (scaled * 32767.0) as i16;
        let bytes = pcm.to_le_bytes();
        // Stereo (L + R)
        buf.extend_from_slice(&bytes);
        buf.extend_from_slice(&bytes);
    }

    buf
}
