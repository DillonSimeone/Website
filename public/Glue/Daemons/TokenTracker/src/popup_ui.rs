use crate::models::TokenStats;
use chrono::{DateTime, Local, Utc};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW,
    CreatePen, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
    InvalidateRect, LineTo, MoveToEx, RoundRect, ScreenToClient, SelectObject, SetBkMode,
    SetTextColor, CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_PITCH,
    DT_CALCRECT, DT_LEFT, DT_RIGHT, DT_SINGLELINE, DT_WORDBREAK, FF_DONTCARE, FW_BOLD,
    FW_LIGHT, FW_NORMAL, FW_SEMIBOLD, OUT_DEFAULT_PRECIS, PAINTSTRUCT, PS_SOLID, SRCCOPY,
    TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    GetClientRect, GetCursorPos, GetSystemMetrics, KillTimer, LoadCursorW, PostMessageW,
    RegisterClassW, SetForegroundWindow, SetLayeredWindowAttributes, SetTimer,
    ShowWindow, TrackPopupMenu, AppendMenuW, IDC_ARROW, IDC_HAND, LWA_ALPHA, MF_CHECKED,
    MF_STRING, MF_UNCHECKED, SM_CXSCREEN, SM_CYSCREEN, SW_SHOW, TPM_LEFTALIGN, TPM_RETURNCMD,
    TPM_TOPALIGN, WA_INACTIVE, WM_ACTIVATE, WM_APP, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_PAINT, WM_TIMER, WNDCLASSW, WS_EX_LAYERED,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

pub const WM_APP_REFRESH_DONE: u32 = WM_APP + 10;

const POPUP_W: i32 = 450;
const POPUP_H: i32 = 760;
const TIMER_FADE: usize = 1;

const ML_PER_TOKEN: f64 = 0.0003;
const HUMAN_DAILY_WATER_ML: f64 = 2500.0;

// RGB -> COLORREF (0x00BBGGRR)
const fn rgb(r: u8, g: u8, b: u8) -> u32 {
    ((b as u32) << 16) | ((g as u32) << 8) | (r as u32)
}

const COL_BG: u32 = rgb(0x1a, 0x1a, 0x2e);
const COL_BG_SEC: u32 = rgb(0x16, 0x21, 0x3e);
const COL_CARD: u32 = rgb(0x1f, 0x29, 0x40);
const COL_CARD_HOVER: u32 = rgb(0x26, 0x33, 0x50);
const COL_BLUE: u32 = rgb(0x4f, 0xc3, 0xf7);
const COL_PURPLE: u32 = rgb(0xb3, 0x88, 0xff);
const COL_GREEN: u32 = rgb(0x69, 0xf0, 0xae);
const COL_AMBER: u32 = rgb(0xff, 0xd7, 0x40);
const COL_RED: u32 = rgb(0xff, 0x52, 0x52);
const COL_TEXT_PRI: u32 = rgb(0xe8, 0xea, 0xed);
const COL_TEXT_SEC: u32 = rgb(0x9a, 0xa0, 0xa6);
const COL_TEXT_DIM: u32 = rgb(0x5f, 0x63, 0x68);
const COL_BORDER: u32 = rgb(0x2d, 0x35, 0x48);
const COL_DIVIDER: u32 = rgb(0x2a, 0x2a, 0x4a);
const COL_WATER: u32 = rgb(0x29, 0xb6, 0xf6);
const COL_HUMAN_WATER: u32 = rgb(0x26, 0xa6, 0x9a);

#[derive(Clone)]
pub struct ProviderPopupInfo {
    pub today_tokens: u64,
    pub accounts: Vec<String>,
    pub paths: Vec<String>,
    pub disclaimer: String,
}

pub struct PopupData {
    pub stats_today: TokenStats,
    pub stats_7d: TokenStats,
    pub stats_30d: TokenStats,
    pub stats_lifetime: TokenStats,
    pub provider_breakdown: HashMap<String, ProviderPopupInfo>,
    pub refresh_interval_minutes: u64,
    pub last_scan_time: Option<DateTime<Utc>>,
    pub on_interval_change: Arc<dyn Fn(u64) + Send + Sync>,
    pub on_refresh_now: Arc<dyn Fn() + Send + Sync>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HitId {
    CloseBtn,
    Slider,
    Preset(u32),
    ModeCached,
    ModeRetail,
    IntervalDropdown,
    RefreshNowBtn,
}

#[derive(Clone)]
struct HitRect {
    rect: RECT,
    id: HitId,
}

struct PopupState {
    hwnd: usize,
    data: PopupData,
    scroll_y: i32,
    content_h: i32,
    alpha: u8,
    plan_fee: f64,
    retail_mode: bool,
    dragging_slider: bool,
    slider_track: RECT,
    hover_id: Option<HitId>,
    hits: Vec<HitRect>,
    menu_open: bool,
}

static POPUP_STATE: Mutex<Option<Box<PopupState>>> = Mutex::new(None);

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn format_tokens(count: u64) -> String {
    if count >= 1_000_000_000 {
        format!("{:.2}B", count as f64 / 1e9)
    } else if count >= 1_000_000 {
        format!("{:.2}M", count as f64 / 1e6)
    } else if count >= 100_000 {
        format!("{:.1}K", count as f64 / 1e3)
    } else if count >= 1_000 {
        format_with_commas(count)
    } else {
        count.to_string()
    }
}

fn format_with_commas(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn format_money(val: f64) -> String {
    let rounded = format!("{val:.2}");
    let (int_part, frac_part) = rounded.split_once('.').unwrap_or((&rounded, "00"));
    let int_num = int_part.parse::<u64>().unwrap_or(0);
    format!("{}.{frac_part}", format_with_commas(int_num))
}

fn format_water_equivalent(ml: f64) -> String {
    if ml < 1.0 {
        format!("{ml:.3} mL (a tiny droplet)")
    } else if ml < 5.0 {
        format!("{ml:.1} mL (an eye-dropper)")
    } else if ml < 15.0 {
        format!("{ml:.1} mL (a tablespoon)")
    } else if ml < 250.0 {
        format!("{ml:.0} mL (about {:.1} cups)", ml / 250.0)
    } else if ml < 500.0 {
        format!("{ml:.0} mL (~1 cup)")
    } else if ml < 1000.0 {
        format!("{ml:.0} mL (~{:.1} water bottles)", ml / 500.0)
    } else if ml < 5000.0 {
        format!("{:.2}L (~{:.1} water bottles)", ml / 1000.0, ml / 500.0)
    } else {
        format!("{:.1}L (~{:.0} water bottles)", ml / 1000.0, ml / 500.0)
    }
}

fn model_rates(model_name: &str) -> (f64, f64, f64) {
    let m = model_name.to_lowercase();
    if m.contains("opus") {
        (15.00, 1.50, 75.00)
    } else if m.contains("sonnet") {
        (3.00, 0.30, 15.00)
    } else if m.contains("pro") {
        (2.50, 0.625, 10.00)
    } else if m.contains("flash") || m.contains("gemini") {
        (0.10, 0.025, 0.30)
    } else {
        (3.00, 0.75, 15.00)
    }
}

fn compute_cost(stats: &TokenStats) -> (f64, f64) {
    let mut cached_cost = 0.0;
    let mut retail_cost = 0.0;
    if !stats.by_model.is_empty() {
        for (model_name, mdata) in &stats.by_model {
            let (u_rate, c_rate, o_rate) = model_rates(model_name);
            let uncached = mdata.prompt.saturating_sub(mdata.cached) as f64;
            let cached = mdata.cached as f64;
            let prompt = mdata.prompt as f64;
            let output = mdata.output as f64;
            cached_cost += (uncached / 1e6 * u_rate) + (cached / 1e6 * c_rate) + (output / 1e6 * o_rate);
            retail_cost += (prompt / 1e6 * u_rate) + (output / 1e6 * o_rate);
        }
    } else {
        let (u_rate, c_rate, o_rate) = (0.10, 0.025, 0.30);
        let uncached = stats.total_prompt.saturating_sub(stats.total_cached) as f64;
        let cached = stats.total_cached as f64;
        let prompt = stats.total_prompt as f64;
        let output = stats.total_output as f64;
        cached_cost = (uncached / 1e6 * u_rate) + (cached / 1e6 * c_rate) + (output / 1e6 * o_rate);
        retail_cost = (prompt / 1e6 * u_rate) + (output / 1e6 * o_rate);
    }
    (cached_cost, retail_cost)
}

unsafe fn make_font(pt: i32, weight: u32) -> *mut core::ffi::c_void {
    let name = to_wide("Segoe UI");
    CreateFontW(
        -pt,
        0,
        0,
        0,
        weight as i32,
        0,
        0,
        0,
        DEFAULT_CHARSET as u32,
        OUT_DEFAULT_PRECIS as u32,
        CLIP_DEFAULT_PRECIS as u32,
        CLEARTYPE_QUALITY as u32,
        (DEFAULT_PITCH | FF_DONTCARE) as u32,
        name.as_ptr(),
    )
}

unsafe fn fill_rect_color(hdc: *mut core::ffi::c_void, rc: &RECT, color: u32) {
    let brush = CreateSolidBrush(color);
    FillRect(hdc, rc, brush);
    DeleteObject(brush as _);
}

unsafe fn draw_round_card(
    hdc: *mut core::ffi::c_void,
    rc: &RECT,
    bg: u32,
    border: Option<u32>,
    radius: i32,
) {
    let brush = CreateSolidBrush(bg);
    let pen = CreatePen(PS_SOLID as i32, 1, border.unwrap_or(bg));
    let old_b = SelectObject(hdc, brush as _);
    let old_p = SelectObject(hdc, pen as _);
    RoundRect(hdc, rc.left, rc.top, rc.right, rc.bottom, radius, radius);
    SelectObject(hdc, old_b);
    SelectObject(hdc, old_p);
    DeleteObject(brush as _);
    DeleteObject(pen as _);
}

unsafe fn draw_text_line(
    hdc: *mut core::ffi::c_void,
    text: &str,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    color: u32,
    font: *mut core::ffi::c_void,
    flags: u32,
) -> i32 {
    let old_f = SelectObject(hdc, font as _);
    SetTextColor(hdc, color);
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    let mut rc = RECT {
        left: x,
        top: y,
        right: x + w,
        bottom: y + h,
    };
    let drawn_h = DrawTextW(hdc, wide.as_mut_ptr(), wide.len() as i32, &mut rc, flags);
    SelectObject(hdc, old_f);
    drawn_h
}

unsafe fn measure_wrapped_height(
    hdc: *mut core::ffi::c_void,
    text: &str,
    w: i32,
    font: *mut core::ffi::c_void,
) -> i32 {
    let old_f = SelectObject(hdc, font as _);
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    let mut rc = RECT {
        left: 0,
        top: 0,
        right: w,
        bottom: 0,
    };
    DrawTextW(
        hdc,
        wide.as_mut_ptr(),
        wide.len() as i32,
        &mut rc,
        DT_CALCRECT | DT_WORDBREAK,
    );
    SelectObject(hdc, old_f);
    rc.bottom - rc.top
}

unsafe fn render_popup(hdc: *mut core::ffi::c_void, state: &mut PopupState) {
    state.hits.clear();
    let sy = state.scroll_y;

    let f_title = make_font(18, FW_SEMIBOLD);
    let f_hero_num = make_font(46, FW_LIGHT);
    let f_h1 = make_font(12, FW_BOLD);
    let f_sec = make_font(14, FW_SEMIBOLD);
    let f_body = make_font(13, FW_NORMAL);
    let f_small = make_font(11, FW_NORMAL);
    let f_small_bold = make_font(11, FW_BOLD);
    let f_tiny = make_font(10, FW_NORMAL);
    let f_close = make_font(16, FW_NORMAL);

    SetBkMode(hdc, TRANSPARENT as i32);

    let full_rc = RECT {
        left: 0,
        top: 0,
        right: POPUP_W,
        bottom: POPUP_H,
    };
    fill_rect_color(hdc, &full_rc, COL_BG);

    let mut y: i32 = 0 - sy;

    // --- Header ---
    let hdr_rc = RECT { left: 0, top: y, right: POPUP_W, bottom: y + 48 };
    fill_rect_color(hdc, &hdr_rc, COL_BG_SEC);
    draw_text_line(hdc, "⚡ Token Tracker", 16, y + 12, 220, 26, COL_TEXT_PRI, f_title, DT_LEFT | DT_SINGLELINE);

    let close_rc = RECT { left: POPUP_W - 36, top: y + 10, right: POPUP_W - 12, bottom: y + 36 };
    let close_col = if state.hover_id == Some(HitId::CloseBtn) { COL_RED } else { COL_TEXT_SEC };
    draw_text_line(hdc, "✕", close_rc.left, close_rc.top + 2, 24, 24, close_col, f_close, DT_RIGHT | DT_SINGLELINE);
    state.hits.push(HitRect { rect: close_rc, id: HitId::CloseBtn });

    if let Some(last_scan) = state.data.last_scan_time {
        let local_scan: DateTime<Local> = last_scan.with_timezone(&Local);
        let scan_str = format!("Last scan: {}", local_scan.format("%H:%M:%S"));
        draw_text_line(hdc, &scan_str, POPUP_W - 180, y + 16, 136, 20, COL_TEXT_DIM, f_small, DT_RIGHT | DT_SINGLELINE);
    }
    y += 56;

    // --- Today Hero ---
    draw_text_line(hdc, "TODAY", 20, y + 8, 200, 18, COL_TEXT_SEC, f_h1, DT_LEFT | DT_SINGLELINE);
    y += 28;
    let today_total = state.data.stats_today.total_tokens;
    draw_text_line(hdc, &format_tokens(today_total), 20, y, 400, 48, COL_AMBER, f_hero_num, DT_LEFT | DT_SINGLELINE);
    y += 48;
    draw_text_line(hdc, "total tokens", 20, y, 200, 18, COL_TEXT_SEC, f_body, DT_LEFT | DT_SINGLELINE);
    y += 26;

    let col_w = (POPUP_W - 40) / 4;
    let mini_items = [
        ("Prompt", format_tokens(state.data.stats_today.total_prompt), COL_BLUE),
        ("Output", format_tokens(state.data.stats_today.total_output), COL_GREEN),
        ("Thinking", format_tokens(state.data.stats_today.total_thinking), COL_PURPLE),
        ("Turns", state.data.stats_today.turns.to_string(), COL_TEXT_SEC),
    ];
    for (i, (lbl, val, col)) in mini_items.iter().enumerate() {
        let mx = 20 + (i as i32) * col_w;
        draw_text_line(hdc, val, mx, y, col_w - 4, 20, *col, f_sec, DT_LEFT | DT_SINGLELINE);
        draw_text_line(hdc, lbl, mx, y + 20, col_w - 4, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
    }
    y += 48;

    // --- By Provider (Today) ---
    if !state.data.provider_breakdown.is_empty() {
        draw_text_line(hdc, "BY PROVIDER (TODAY)", 20, y, 300, 18, COL_TEXT_SEC, f_h1, DT_LEFT | DT_SINGLELINE);
        y += 22;
        for (key, label, color) in [("antigravity", "AntiGravity", COL_BLUE), ("cursor", "Cursor", COL_PURPLE)] {
            if let Some(info) = state.data.provider_breakdown.get(key) {
                let mut card_h = 34;
                if !info.accounts.is_empty() {
                    card_h += 16;
                }
                if !info.disclaimer.is_empty() {
                    card_h += 15;
                }
                let card_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + card_h };
                draw_round_card(hdc, &card_rc, COL_CARD, None, 6);

                let mut cy = y + 8;
                draw_text_line(hdc, label, 32, cy, 180, 20, color, f_sec, DT_LEFT | DT_SINGLELINE);
                draw_text_line(hdc, &format_tokens(info.today_tokens), POPUP_W - 180, cy, 148, 20, COL_TEXT_PRI, f_sec, DT_RIGHT | DT_SINGLELINE);
                cy += 22;

                if !info.accounts.is_empty() {
                    let acct = format!("Account: {}", info.accounts.join(", "));
                    draw_text_line(hdc, &acct, 32, cy, POPUP_W - 64, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
                    cy += 16;
                }
                if !info.disclaimer.is_empty() {
                    draw_text_line(hdc, &info.disclaimer, 32, cy, POPUP_W - 64, 15, COL_AMBER, f_tiny, DT_LEFT | DT_SINGLELINE);
                }
                y += card_h + 6;
            }
        }
    }

    // Divider
    y += 6;
    fill_rect_color(hdc, &RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 1 }, COL_DIVIDER);
    y += 12;

    // --- Time Range Cards ---
    let range_cards = [
        ("Last 7 Days", &state.data.stats_7d, COL_BLUE),
        ("Last 30 Days", &state.data.stats_30d, COL_PURPLE),
        ("Lifetime", &state.data.stats_lifetime, COL_GREEN),
    ];
    for (title, st, accent) in range_cards {
        let card_rc = RECT { left: 16, top: y, right: POPUP_W - 16, bottom: y + 58 };
        draw_round_card(hdc, &card_rc, COL_CARD, None, 6);
        draw_text_line(hdc, title, 30, y + 10, 180, 20, accent, f_sec, DT_LEFT | DT_SINGLELINE);
        draw_text_line(hdc, &format_tokens(st.total_tokens), POPUP_W - 190, y + 10, 160, 22, COL_TEXT_PRI, f_sec, DT_RIGHT | DT_SINGLELINE);
        let detail = format!(
            "↓{} prompt  ↑{} output  💭{} thinking  🔄{} turns",
            format_tokens(st.total_prompt),
            format_tokens(st.total_output),
            format_tokens(st.total_thinking),
            st.turns
        );
        draw_text_line(hdc, &detail, 30, y + 34, POPUP_W - 60, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
        y += 66;
    }

    // Divider
    y += 4;
    fill_rect_color(hdc, &RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 1 }, COL_DIVIDER);
    y += 12;

    // --- Plan Value & Cost Estimator ---
    draw_text_line(hdc, "💰 PLAN VALUE & COST ESTIMATOR", 16, y, 360, 18, COL_GREEN, f_h1, DT_LEFT | DT_SINGLELINE);
    y += 20;
    draw_text_line(hdc, "Compare flat subscription costs vs equivalent pay-per-token API market value", 16, y, POPUP_W - 32, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
    y += 22;

    let (c30_cached, c30_retail) = compute_cost(&state.data.stats_30d);
    let (cl_cached, cl_retail) = compute_cost(&state.data.stats_lifetime);

    let metrics_rc = RECT { left: 16, top: y, right: POPUP_W - 16, bottom: y + 70 };
    draw_round_card(hdc, &metrics_rc, COL_CARD, None, 6);
    let mid_x = POPUP_W / 2;
    draw_text_line(hdc, "30-Day API Value", 30, y + 10, mid_x - 40, 16, COL_TEXT_SEC, f_small, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format!("${}", format_money(c30_cached)), 30, y + 26, mid_x - 40, 22, COL_GREEN, f_sec, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format!("Retail: ${}", format_money(c30_retail)), 30, y + 48, mid_x - 40, 15, COL_TEXT_DIM, f_tiny, DT_LEFT | DT_SINGLELINE);

    fill_rect_color(hdc, &RECT { left: mid_x, top: y + 10, right: mid_x + 1, bottom: y + 60 }, COL_BORDER);

    draw_text_line(hdc, "Lifetime API Value", mid_x + 14, y + 10, mid_x - 40, 16, COL_TEXT_SEC, f_small, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format!("${}", format_money(cl_cached)), mid_x + 14, y + 26, mid_x - 40, 22, COL_PURPLE, f_sec, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format!("Retail: ${}", format_money(cl_retail)), mid_x + 14, y + 48, mid_x - 40, 15, COL_TEXT_DIM, f_tiny, DT_LEFT | DT_SINGLELINE);
    y += 78;

    // Interactive Slider Card
    let slider_card_rc = RECT { left: 16, top: y, right: POPUP_W - 16, bottom: y + 116 };
    draw_round_card(hdc, &slider_card_rc, COL_CARD, None, 6);
    draw_text_line(hdc, "Your Monthly Plan Fee:", 30, y + 10, 200, 18, COL_TEXT_PRI, f_body, DT_LEFT | DT_SINGLELINE);
    let fee_str = format!("${:.0} / mo", state.plan_fee);
    draw_text_line(hdc, &fee_str, POPUP_W - 130, y + 10, 100, 18, COL_BLUE, f_sec, DT_RIGHT | DT_SINGLELINE);

    // Slider track
    let track_rc = RECT { left: 30, top: y + 34, right: POPUP_W - 30, bottom: y + 54 };
    state.slider_track = track_rc;
    state.hits.push(HitRect { rect: track_rc, id: HitId::Slider });
    let bar_y = y + 42;
    fill_rect_color(hdc, &RECT { left: track_rc.left, top: bar_y, right: track_rc.right, bottom: bar_y + 4 }, COL_BG);
    let frac = (state.plan_fee / 100.0).clamp(0.0, 1.0);
    let knob_x = track_rc.left + ((track_rc.right - track_rc.left) as f64 * frac) as i32;
    fill_rect_color(hdc, &RECT { left: track_rc.left, top: bar_y, right: knob_x, bottom: bar_y + 4 }, COL_BLUE);
    draw_round_card(hdc, &RECT { left: knob_x - 7, top: bar_y - 5, right: knob_x + 7, bottom: bar_y + 9 }, COL_BLUE, Some(COL_TEXT_PRI), 14);

    // Preset pills
    let presets = [("$20 Single", 20u32), ("$40 Dual Pro", 40), ("$60 Triple", 60), ("$0 Free Tier", 0)];
    let mut px = 30;
    let py = y + 60;
    for (lbl, val) in presets {
        let pw = (lbl.len() as i32) * 7 + 16;
        let p_rc = RECT { left: px, top: py, right: px + pw, bottom: py + 22 };
        let bg = if state.hover_id == Some(HitId::Preset(val)) { rgb(0x3a, 0x48, 0x70) } else { rgb(0x2a, 0x35, 0x50) };
        draw_round_card(hdc, &p_rc, bg, None, 4);
        draw_text_line(hdc, lbl, px + 8, py + 4, pw - 16, 16, COL_BLUE, f_small_bold, DT_LEFT | DT_SINGLELINE);
        state.hits.push(HitRect { rect: p_rc, id: HitId::Preset(val) });
        px += pw + 6;
    }

    // Benchmark pills
    let by = y + 88;
    draw_text_line(hdc, "API Benchmark:", 30, by + 3, 90, 16, COL_TEXT_DIM, f_tiny, DT_LEFT | DT_SINGLELINE);
    let c_rc = RECT { left: 120, top: by, right: 230, bottom: by + 20 };
    let r_rc = RECT { left: 236, top: by, right: 356, bottom: by + 20 };
    if !state.retail_mode {
        draw_round_card(hdc, &c_rc, rgb(0x1f, 0x3b, 0x2f), None, 4);
        draw_text_line(hdc, "⚡ Prompt Cached", c_rc.left + 6, by + 3, 100, 15, COL_GREEN, f_small_bold, DT_LEFT | DT_SINGLELINE);
        draw_round_card(hdc, &r_rc, rgb(0x2a, 0x35, 0x50), None, 4);
        draw_text_line(hdc, "🏷️ Retail Uncached", r_rc.left + 6, by + 3, 110, 15, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
    } else {
        draw_round_card(hdc, &c_rc, rgb(0x2a, 0x35, 0x50), None, 4);
        draw_text_line(hdc, "⚡ Prompt Cached", c_rc.left + 6, by + 3, 100, 15, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
        draw_round_card(hdc, &r_rc, rgb(0x3d, 0x2c, 0x55), None, 4);
        draw_text_line(hdc, "🏷️ Retail Uncached", r_rc.left + 6, by + 3, 110, 15, COL_PURPLE, f_small_bold, DT_LEFT | DT_SINGLELINE);
    }
    state.hits.push(HitRect { rect: c_rc, id: HitId::ModeCached });
    state.hits.push(HitRect { rect: r_rc, id: HitId::ModeRetail });
    y += 124;

    // Verdict card
    let val_30d = if state.retail_mode { c30_retail } else { c30_cached };
    let val_life = if state.retail_mode { cl_retail } else { cl_cached };
    let fee = state.plan_fee;
    let net = val_30d - fee;
    let life_net = val_life - (fee * 6.0);
    let (roi_mult, roi_str) = if fee > 0.0 {
        let m = val_30d / fee;
        let pct = ((val_30d - fee) / fee) * 100.0;
        (m, format!("{m:.1}× ROI ({pct:+.0}%)"))
    } else {
        (f64::INFINITY, "∞ Free Value".to_string())
    };

    let (v_bg, v_border, v_badge_col, v_text_col, net_str, v_msg, badge_disp) = if net > 50.0 {
        (
            rgb(0x13, 0x2d, 0x22),
            rgb(0x23, 0x5e, 0x40),
            COL_GREEN,
            rgb(0xa3, 0xcf, 0xbb),
            format!("+${} / mo net surplus value  (Lifetime: +${})", format_money(net), format_money(life_net.max(0.0))),
            format!("🔥 Definite YES! You are extracting {roi_mult:.1}× more API compute than your ${fee:.0} plan fee."),
            roi_str,
        )
    } else if net > 0.0 {
        (
            rgb(0x13, 0x2d, 0x22),
            rgb(0x23, 0x5e, 0x40),
            COL_GREEN,
            rgb(0xa3, 0xcf, 0xbb),
            format!("+${} / mo net surplus value  (Lifetime: +${})", format_money(net), format_money(life_net.max(0.0))),
            format!("✅ Worth it! Your usage comfortably outvalues your ${fee:.0}/mo subscription cost."),
            roi_str,
        )
    } else if net == 0.0 {
        (
            rgb(0x26, 0x2b, 0x3a),
            rgb(0x3d, 0x45, 0x5d),
            COL_AMBER,
            COL_TEXT_SEC,
            "$0.00 / mo net (even)".to_string(),
            "⚖️ Exact break-even. You are getting exactly the token volume you pay for.".to_string(),
            "1.0× Break-Even".to_string(),
        )
    } else {
        (
            rgb(0x2d, 0x18, 0x18),
            rgb(0x5e, 0x23, 0x23),
            COL_RED,
            rgb(0xcf, 0xab, 0xab),
            format!("-${} / mo underutilized", format_money(net.abs())),
            format!("⚠️ Underutilized at ${fee:.0}/mo. You could switch to pay-per-token API or downscale."),
            roi_str,
        )
    };

    let v_msg_h = measure_wrapped_height(hdc, &v_msg, POPUP_W - 60, f_small);
    let v_card_h = 56 + v_msg_h + 12;
    let v_rc = RECT { left: 16, top: y, right: POPUP_W - 16, bottom: y + v_card_h };
    draw_round_card(hdc, &v_rc, v_bg, Some(v_border), 6);
    draw_text_line(hdc, &badge_disp, 30, y + 10, POPUP_W - 60, 22, v_badge_col, f_sec, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &net_str, 30, y + 34, POPUP_W - 60, 18, COL_TEXT_PRI, f_body, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &v_msg, 30, y + 54, POPUP_W - 60, v_msg_h + 4, v_text_col, f_small, DT_LEFT | DT_WORDBREAK);
    y += v_card_h + 10;

    // Divider
    fill_rect_color(hdc, &RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 1 }, COL_DIVIDER);
    y += 12;

    // --- Water Usage ---
    draw_text_line(hdc, "💧 WATER USAGE", 20, y, 250, 18, COL_WATER, f_h1, DT_LEFT | DT_SINGLELINE);
    y += 24;

    let today_water = state.data.stats_today.total_tokens as f64 * ML_PER_TOKEN;
    let life_water = state.data.stats_lifetime.total_tokens as f64 * ML_PER_TOKEN;

    let w1_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 54 };
    draw_round_card(hdc, &w1_rc, COL_CARD, None, 6);
    draw_text_line(hdc, "AI Water Usage Today", 34, y + 8, 300, 18, COL_TEXT_SEC, f_body, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format_water_equivalent(today_water), 34, y + 28, 380, 20, COL_WATER, f_sec, DT_LEFT | DT_SINGLELINE);
    y += 60;

    let w2_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 54 };
    draw_round_card(hdc, &w2_rc, COL_CARD, None, 6);
    draw_text_line(hdc, "AI Water Usage Lifetime", 34, y + 8, 300, 18, COL_TEXT_SEC, f_body, DT_LEFT | DT_SINGLELINE);
    draw_text_line(hdc, &format_water_equivalent(life_water), 34, y + 28, 380, 20, COL_WATER, f_sec, DT_LEFT | DT_SINGLELINE);
    y += 60;

    let human_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 92 };
    draw_round_card(hdc, &human_rc, COL_CARD, None, 6);
    draw_text_line(hdc, "🧍 Human Token-Water Usage", 34, y + 8, 300, 18, COL_HUMAN_WATER, f_h1, DT_LEFT | DT_SINGLELINE);
    let human_days = life_water / HUMAN_DAILY_WATER_ML;
    let human_equiv = if human_days < 1.0 {
        format!("Your AI has used {human_days:.3} days of your drinking water")
    } else {
        format!("Your AI has used {human_days:.1} days of your drinking water")
    };
    draw_text_line(hdc, &human_equiv, 34, y + 28, 380, 20, COL_TEXT_PRI, f_body, DT_LEFT | DT_SINGLELINE);
    let human_tok = (HUMAN_DAILY_WATER_ML / ML_PER_TOKEN) as u64;
    draw_text_line(hdc, &format!("You drink the equivalent of ~{} tokens/day", format_tokens(human_tok)), 34, y + 50, 380, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
    let ratio_text = if today_water > 0.0 {
        let ratio = (HUMAN_DAILY_WATER_ML / today_water).round() as u64;
        format!("You drink {}× more water than your AI used today", format_with_commas(ratio))
    } else {
        "No AI water used today — your body wins this round 🏆".to_string()
    };
    draw_text_line(hdc, &ratio_text, 34, y + 68, 380, 16, COL_TEXT_DIM, f_small, DT_LEFT | DT_SINGLELINE);
    y += 102;

    // Divider
    fill_rect_color(hdc, &RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 1 }, COL_DIVIDER);
    y += 12;

    // --- Models ---
    draw_text_line(hdc, "🤖 MODELS", 20, y, 250, 18, COL_TEXT_SEC, f_h1, DT_LEFT | DT_SINGLELINE);
    y += 22;

    if state.data.stats_lifetime.by_model.is_empty() {
        draw_text_line(hdc, "No model data available", 20, y, 300, 18, COL_TEXT_DIM, f_body, DT_LEFT | DT_SINGLELINE);
        y += 24;
    } else {
        let mut sorted: Vec<(&String, u64)> = state
            .data
            .stats_lifetime
            .by_model
            .iter()
            .map(|(k, v)| (k, v.prompt + v.output))
            .collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));

        let total_all = state.data.stats_lifetime.total_tokens.max(1) as f64;
        for (model_name, model_total) in sorted {
            let pct = (model_total as f64 / total_all) * 100.0;
            let lower = model_name.to_lowercase();
            let color = if lower.contains("gemini") {
                COL_BLUE
            } else if lower.contains("claude") {
                COL_PURPLE
            } else if lower.contains("gpt") {
                COL_GREEN
            } else {
                COL_TEXT_PRI
            };
            let row_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 32 };
            draw_round_card(hdc, &row_rc, COL_CARD, None, 4);
            let disp_name = model_name.replace('-', " ");
            draw_text_line(hdc, &disp_name, 32, y + 7, 250, 18, color, f_body, DT_LEFT | DT_SINGLELINE);
            let info_str = format!("{} ({pct:.1}%)", format_tokens(model_total));
            draw_text_line(hdc, &info_str, POPUP_W - 170, y + 7, 138, 18, COL_TEXT_SEC, f_body, DT_RIGHT | DT_SINGLELINE);
            y += 36;
        }
    }

    // Divider
    y += 6;
    fill_rect_color(hdc, &RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 1 }, COL_DIVIDER);
    y += 12;

    // --- Settings ---
    draw_text_line(hdc, "⚙️ SETTINGS", 20, y, 250, 18, COL_TEXT_SEC, f_h1, DT_LEFT | DT_SINGLELINE);
    y += 24;

    let int_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 38 };
    draw_round_card(hdc, &int_rc, COL_CARD, None, 6);
    draw_text_line(hdc, "Refresh interval", 32, y + 10, 180, 18, COL_TEXT_PRI, f_body, DT_LEFT | DT_SINGLELINE);

    let dd_rc = RECT { left: POPUP_W - 132, top: y + 6, right: POPUP_W - 30, bottom: y + 32 };
    let dd_bg = if state.hover_id == Some(HitId::IntervalDropdown) { COL_CARD_HOVER } else { COL_BG };
    draw_round_card(hdc, &dd_rc, dd_bg, Some(COL_BORDER), 4);
    let iv_label = match state.data.refresh_interval_minutes {
        5 => "5 min".to_string(),
        15 => "15 min".to_string(),
        30 => "30 min".to_string(),
        60 => "1 hour".to_string(),
        120 => "2 hours".to_string(),
        360 => "6 hours".to_string(),
        m => format!("{m} min"),
    };
    draw_text_line(hdc, &format!("{iv_label}  ▾"), dd_rc.left + 8, dd_rc.top + 5, 86, 18, COL_TEXT_PRI, f_small, DT_LEFT | DT_SINGLELINE);
    state.hits.push(HitRect { rect: dd_rc, id: HitId::IntervalDropdown });
    y += 44;

    let ref_rc = RECT { left: 20, top: y, right: POPUP_W - 20, bottom: y + 34 };
    let ref_bg = if state.hover_id == Some(HitId::RefreshNowBtn) { COL_CARD_HOVER } else { COL_CARD };
    draw_round_card(hdc, &ref_rc, ref_bg, None, 6);
    draw_text_line(hdc, "🔄 Refresh Now", 32, y + 8, 200, 18, COL_BLUE, f_body, DT_LEFT | DT_SINGLELINE);
    state.hits.push(HitRect { rect: ref_rc, id: HitId::RefreshNowBtn });
    y += 44;

    // --- Data Sources Footer ---
    if !state.data.provider_breakdown.is_empty() {
        draw_text_line(hdc, "DATA SOURCES", 20, y, 200, 16, COL_TEXT_DIM, f_small_bold, DT_LEFT | DT_SINGLELINE);
        y += 18;
        for (provider, info) in &state.data.provider_breakdown {
            for p in info.paths.iter().take(3) {
                let disp = if p.len() < 55 {
                    p.clone()
                } else {
                    format!("...{}", &p[p.len().saturating_sub(52)..])
                };
                draw_text_line(hdc, &format!("  {provider}: {disp}"), 20, y, POPUP_W - 40, 14, COL_TEXT_DIM, f_tiny, DT_LEFT | DT_SINGLELINE);
                y += 15;
            }
        }
    }

    y += 16;
    state.content_h = y + sy;

    // Subtle border around popup
    let pen_b = CreatePen(PS_SOLID as i32, 1, COL_BORDER);
    let old_p = SelectObject(hdc, pen_b as _);
    MoveToEx(hdc, 0, 0, std::ptr::null_mut());
    LineTo(hdc, POPUP_W - 1, 0);
    LineTo(hdc, POPUP_W - 1, POPUP_H - 1);
    LineTo(hdc, 0, POPUP_H - 1);
    LineTo(hdc, 0, 0);
    SelectObject(hdc, old_p);
    DeleteObject(pen_b as _);

    for f in [f_title, f_hero_num, f_h1, f_sec, f_body, f_small, f_small_bold, f_tiny, f_close] {
        DeleteObject(f as _);
    }
}

fn hit_test(hits: &[HitRect], x: i32, y: i32) -> Option<HitId> {
    for h in hits.iter().rev() {
        if x >= h.rect.left && x <= h.rect.right && y >= h.rect.top && y <= h.rect.bottom {
            return Some(h.id);
        }
    }
    None
}

unsafe fn update_slider_from_x(state: &mut PopupState, x: i32) {
    let w = (state.slider_track.right - state.slider_track.left).max(1) as f64;
    let frac = ((x - state.slider_track.left) as f64 / w).clamp(0.0, 1.0);
    state.plan_fee = (frac * 100.0).round();
}

unsafe extern "system" fn popup_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rc: RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rc);

            let mem_dc = CreateCompatibleDC(hdc);
            let mem_bm = CreateCompatibleBitmap(hdc, POPUP_W, POPUP_H);
            let old_bm = SelectObject(mem_dc, mem_bm as _);

            if let Ok(mut guard) = POPUP_STATE.lock() {
                if let Some(ref mut state) = *guard {
                    render_popup(mem_dc, state);
                }
            }

            BitBlt(hdc, 0, 0, POPUP_W, POPUP_H, mem_dc, 0, 0, SRCCOPY);
            SelectObject(mem_dc, old_bm);
            DeleteObject(mem_bm as _);
            DeleteDC(mem_dc);
            EndPaint(hwnd, &ps);
            0
        }
        WM_TIMER => {
            if wparam == TIMER_FADE {
                let mut done = false;
                let mut alpha = 247u8;
                if let Ok(mut guard) = POPUP_STATE.lock() {
                    if let Some(ref mut state) = *guard {
                        if state.alpha < 240 {
                            state.alpha = state.alpha.saturating_add(25).min(247);
                            alpha = state.alpha;
                        } else {
                            state.alpha = 247;
                            alpha = 247;
                            done = true;
                        }
                    }
                }
                SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
                if done {
                    KillTimer(hwnd, TIMER_FADE);
                }
            }
            0
        }
        WM_MOUSEWHEEL => {
            let delta = ((wparam >> 16) as i16) as i32;
            let step = -(delta / 120) * 40;
            if let Ok(mut guard) = POPUP_STATE.lock() {
                if let Some(ref mut state) = *guard {
                    let max_scroll = (state.content_h - POPUP_H).max(0);
                    state.scroll_y = (state.scroll_y + step).clamp(0, max_scroll);
                }
            }
            InvalidateRect(hwnd, std::ptr::null(), 0);
            0
        }
        WM_MOUSEMOVE => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut need_redraw = false;
            let mut is_hand = false;
            if let Ok(mut guard) = POPUP_STATE.lock() {
                if let Some(ref mut state) = *guard {
                    if state.dragging_slider {
                        update_slider_from_x(state, x);
                        need_redraw = true;
                        is_hand = true;
                    } else {
                        let new_hover = hit_test(&state.hits, x, y);
                        is_hand = new_hover.is_some();
                        if new_hover != state.hover_id {
                            state.hover_id = new_hover;
                            need_redraw = true;
                        }
                    }
                }
            }
            let cursor = LoadCursorW(std::ptr::null_mut(), if is_hand { IDC_HAND } else { IDC_ARROW });
            windows_sys::Win32::UI::WindowsAndMessaging::SetCursor(cursor);
            if need_redraw {
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }
            0
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut action: Option<HitId> = None;
            if let Ok(mut guard) = POPUP_STATE.lock() {
                if let Some(ref mut state) = *guard {
                    action = hit_test(&state.hits, x, y);
                    match action {
                        Some(HitId::Slider) => {
                            state.dragging_slider = true;
                            update_slider_from_x(state, x);
                        }
                        Some(HitId::Preset(v)) => {
                            state.plan_fee = v as f64;
                        }
                        Some(HitId::ModeCached) => {
                            state.retail_mode = false;
                        }
                        Some(HitId::ModeRetail) => {
                            state.retail_mode = true;
                        }
                        _ => {}
                    }
                }
            }
            match action {
                Some(HitId::CloseBtn) => {
                    DestroyWindow(hwnd);
                    return 0;
                }
                Some(HitId::RefreshNowBtn) => {
                    let cb = POPUP_STATE
                        .lock()
                        .ok()
                        .and_then(|g| g.as_ref().map(|s| s.data.on_refresh_now.clone()));
                    if let Some(f) = cb {
                        std::thread::spawn(move || f());
                    }
                }
                Some(HitId::IntervalDropdown) => {
                    show_interval_menu(hwnd);
                }
                Some(_) => {
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                None => {}
            }
            0
        }
        WM_LBUTTONUP => {
            if let Ok(mut guard) = POPUP_STATE.lock() {
                if let Some(ref mut state) = *guard {
                    state.dragging_slider = false;
                }
            }
            0
        }
        WM_KEYDOWN => {
            if wparam == 0x1B {
                // VK_ESCAPE
                DestroyWindow(hwnd);
            }
            0
        }
        WM_ACTIVATE => {
            let active_flag = (wparam & 0xFFFF) as u32;
            if active_flag == WA_INACTIVE {
                let menu_open = POPUP_STATE
                    .lock()
                    .ok()
                    .and_then(|g| g.as_ref().map(|s| s.menu_open))
                    .unwrap_or(false);
                if !menu_open {
                    DestroyWindow(hwnd);
                }
            }
            0
        }
        WM_DESTROY => {
            KillTimer(hwnd, TIMER_FADE);
            if let Ok(mut guard) = POPUP_STATE.lock() {
                *guard = None;
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn show_interval_menu(hwnd: HWND) {
    let current_iv = {
        let Ok(mut guard) = POPUP_STATE.lock() else { return };
        let Some(ref mut state) = *guard else { return };
        state.menu_open = true;
        state.data.refresh_interval_minutes
    };

    let hmenu = CreatePopupMenu();
    let options: &[(u64, &str)] = &[
        (5, "5 min"),
        (15, "15 min"),
        (30, "30 min"),
        (60, "1 hour"),
        (120, "2 hours"),
        (360, "6 hours"),
    ];
    for &(mins, lbl) in options {
        let flags = MF_STRING | if mins == current_iv { MF_CHECKED } else { MF_UNCHECKED };
        let w = to_wide(lbl);
        AppendMenuW(hmenu, flags, mins as usize, w.as_ptr());
    }

    let mut pt = POINT { x: 0, y: 0 };
    GetCursorPos(&mut pt);
    SetForegroundWindow(hwnd);
    let cmd = TrackPopupMenu(
        hmenu,
        TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RETURNCMD,
        pt.x,
        pt.y,
        0,
        hwnd,
        std::ptr::null(),
    );
    DestroyMenu(hmenu);

    let mut cb: Option<Arc<dyn Fn(u64) + Send + Sync>> = None;
    if let Ok(mut guard) = POPUP_STATE.lock() {
        if let Some(ref mut state) = *guard {
            state.menu_open = false;
            if cmd > 0 {
                state.data.refresh_interval_minutes = cmd as u64;
                cb = Some(state.data.on_interval_change.clone());
            }
        }
    }
    if let Some(f) = cb {
        f(cmd as u64);
    }
    InvalidateRect(hwnd, std::ptr::null(), 0);
}

pub fn close_popup() {
    let hwnd = POPUP_STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.hwnd));
    if let Some(h) = hwnd {
        unsafe {
            DestroyWindow(h as HWND);
        }
    }
}

pub fn show_popup(data: PopupData) {
    close_popup();
    unsafe {
        let hinstance = GetModuleHandleW(std::ptr::null());
        let class_name = to_wide("LLMTokenTrackerPopupClass");

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(popup_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);

        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        let x = (screen_w - POPUP_W - 12).max(0);
        let y = (screen_h - POPUP_H - 52).max(0);

        let title = to_wide("Token Tracker");
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP,
            x,
            y,
            POPUP_W,
            POPUP_H,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            hinstance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            return;
        }

        SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA);

        if let Ok(mut guard) = POPUP_STATE.lock() {
            *guard = Some(Box::new(PopupState {
                hwnd: hwnd as usize,
                data,
                scroll_y: 0,
                content_h: POPUP_H,
                alpha: 0,
                plan_fee: 20.0,
                retail_mode: false,
                dragging_slider: false,
                slider_track: RECT { left: 30, top: 0, right: POPUP_W - 30, bottom: 0 },
                hover_id: None,
                hits: Vec::new(),
                menu_open: false,
            }));
        }

        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
        SetTimer(hwnd, TIMER_FADE, 15, None);
        // Trigger initial cursor check
        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);
        ScreenToClient(hwnd, &mut pt);
        PostMessageW(hwnd, WM_MOUSEMOVE, 0, ((pt.y & 0xFFFF) << 16 | (pt.x & 0xFFFF)) as isize);
    }
}
