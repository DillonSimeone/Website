use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject, DrawTextW,
    SelectObject, SetBkMode, SetTextColor, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CLIP_DEFAULT_PRECIS,
    DEFAULT_CHARSET, DEFAULT_PITCH, DIB_RGB_COLORS, DT_CALCRECT, DT_CENTER, DT_SINGLELINE,
    DT_VCENTER, FF_DONTCARE, FW_BOLD, OUT_DEFAULT_PRECIS, CLEARTYPE_QUALITY, TRANSPARENT,
};
use windows_sys::Win32::Foundation::RECT;
use windows_sys::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, HICON, ICONINFO};

pub const ICON_SIZE: i32 = 32;

pub fn format_token_count(count: u64) -> String {
    if count < 1_000 {
        return count.to_string();
    }
    if count < 10_000 {
        let val = count as f64 / 1_000.0;
        let s = format!("{val:.1}");
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        return format!("{trimmed}K");
    }
    if count < 1_000_000 {
        let val = count as f64 / 1_000.0;
        return format!("{val:.0}K");
    }
    if count < 10_000_000 {
        let val = count as f64 / 1_000_000.0;
        let s = format!("{val:.1}");
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        return format!("{trimmed}M");
    }
    let val = count as f64 / 1_000_000.0;
    format!("{val:.0}M")
}

fn lerp_u8(a: u8, b: u8, t: f64) -> u8 {
    let t = t.clamp(0.0, 1.0);
    (a as f64 + (b as f64 - a as f64) * t) as u8
}

fn lerp_rgb(c1: (u8, u8, u8), c2: (u8, u8, u8), t: f64) -> (u8, u8, u8) {
    (
        lerp_u8(c1.0, c2.0, t),
        lerp_u8(c1.1, c2.1, t),
        lerp_u8(c1.2, c2.2, t),
    )
}

fn pick_text_color(daily_tokens: u64) -> (u8, u8, u8) {
    let bands: &[(u64, (u8, u8, u8), (u8, u8, u8))] = &[
        (50_000, (0, 200, 83), (105, 240, 174)),
        (200_000, (255, 214, 0), (255, 171, 0)),
        (u64::MAX, (255, 109, 0), (255, 23, 68)),
    ];
    let mut lo: u64 = 0;
    for &(threshold, c_start, c_end) in bands {
        if daily_tokens < threshold {
            let span = (threshold - lo).max(1) as f64;
            let t = (daily_tokens - lo) as f64 / span;
            return lerp_rgb(c_start, c_end, t);
        }
        lo = threshold;
    }
    (255, 109, 0)
}

fn inside_rounded_rect(x: i32, y: i32, w: i32, h: i32, r: i32) -> bool {
    let cx = if x < r {
        r - x
    } else if x >= w - r {
        x - (w - 1 - r)
    } else {
        0
    };
    let cy = if y < r {
        r - y
    } else if y >= h - r {
        y - (h - 1 - r)
    } else {
        0
    };
    if cx == 0 || cy == 0 {
        return true;
    }
    cx * cx + cy * cy <= r * r
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn create_tray_icon(daily_tokens: u64) -> HICON {
    let label = format_token_count(daily_tokens);
    let color = pick_text_color(daily_tokens);
    render_icon_with_text(&label, color)
}

pub fn create_default_icon() -> HICON {
    render_icon_with_text("...", (160, 160, 160))
}

fn render_icon_with_text(text: &str, rgb: (u8, u8, u8)) -> HICON {
    unsafe {
        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = ICON_SIZE;
        bmi.bmiHeader.biHeight = -ICON_SIZE; // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let hdc = CreateCompatibleDC(std::ptr::null_mut());
        let hbm_color = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
        if hbm_color.is_null() || bits.is_null() {
            DeleteDC(hdc);
            return std::ptr::null_mut();
        }

        let old_bm = SelectObject(hdc, hbm_color as _);

        // Fill dark rounded-rect gradient background
        let pixels = std::slice::from_raw_parts_mut(bits as *mut u32, (ICON_SIZE * ICON_SIZE) as usize);
        for y in 0..ICON_SIZE {
            let t = y as f64 / (ICON_SIZE - 1) as f64;
            let bg = lerp_rgb((30, 30, 30), (50, 50, 50), t);
            for x in 0..ICON_SIZE {
                let idx = (y * ICON_SIZE + x) as usize;
                if inside_rounded_rect(x, y, ICON_SIZE, ICON_SIZE, 6) {
                    let a: u32 = 240;
                    pixels[idx] = (a << 24) | ((bg.0 as u32) << 16) | ((bg.1 as u32) << 8) | (bg.2 as u32);
                } else {
                    pixels[idx] = 0;
                }
            }
        }

        SetBkMode(hdc, TRANSPARENT as i32);
        let font_name = to_wide("Segoe UI");
        let mut wide_text: Vec<u16> = text.encode_utf16().collect();

        // Pick largest font size from 18 down to 8 that fits in 28x30
        let mut chosen_font = std::ptr::null_mut();
        for size in (8..=18).rev() {
            let hfont = CreateFontW(
                -size,
                0,
                0,
                0,
                FW_BOLD as i32,
                0,
                0,
                0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32,
                (DEFAULT_PITCH | FF_DONTCARE) as u32,
                font_name.as_ptr(),
            );
            let old_f = SelectObject(hdc, hfont as _);
            let mut rc = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            DrawTextW(
                hdc,
                wide_text.as_ptr(),
                wide_text.len() as i32,
                &mut rc,
                DT_CALCRECT | DT_SINGLELINE,
            );
            SelectObject(hdc, old_f);
            if (rc.right - rc.left) <= ICON_SIZE - 4 && (rc.bottom - rc.top) <= ICON_SIZE - 2 {
                chosen_font = hfont;
                break;
            }
            DeleteObject(hfont as _);
        }

        if chosen_font.is_null() {
            chosen_font = CreateFontW(
                -8,
                0,
                0,
                0,
                FW_BOLD as i32,
                0,
                0,
                0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32,
                (DEFAULT_PITCH | FF_DONTCARE) as u32,
                font_name.as_ptr(),
            );
        }

        let old_f = SelectObject(hdc, chosen_font as _);

        // Shadow
        let mut rc_shadow = RECT {
            left: 1,
            top: 1,
            right: ICON_SIZE + 1,
            bottom: ICON_SIZE + 1,
        };
        SetTextColor(hdc, 0x00000000);
        DrawTextW(
            hdc,
            wide_text.as_mut_ptr(),
            wide_text.len() as i32,
            &mut rc_shadow,
            DT_CENTER | DT_VCENTER | DT_SINGLELINE,
        );

        // Foreground text (COLORREF is 0x00BBGGRR)
        let mut rc_fg = RECT {
            left: 0,
            top: 0,
            right: ICON_SIZE,
            bottom: ICON_SIZE,
        };
        let colorref = ((rgb.2 as u32) << 16) | ((rgb.1 as u32) << 8) | (rgb.0 as u32);
        SetTextColor(hdc, colorref);
        DrawTextW(
            hdc,
            wide_text.as_mut_ptr(),
            wide_text.len() as i32,
            &mut rc_fg,
            DT_CENTER | DT_VCENTER | DT_SINGLELINE,
        );

        // Ensure text pixels have full alpha
        for y in 0..ICON_SIZE {
            for x in 0..ICON_SIZE {
                let idx = (y * ICON_SIZE + x) as usize;
                if inside_rounded_rect(x, y, ICON_SIZE, ICON_SIZE, 6) {
                    if (pixels[idx] >> 24) == 0 && (pixels[idx] & 0x00FFFFFF) != 0 {
                        pixels[idx] |= 0xFF000000;
                    }
                }
            }
        }

        SelectObject(hdc, old_f);
        DeleteObject(chosen_font as _);
        SelectObject(hdc, old_bm);

        let mut icon_info: ICONINFO = std::mem::zeroed();
        icon_info.fIcon = 1;
        icon_info.hbmColor = hbm_color;
        icon_info.hbmMask = hbm_color;
        let hicon = CreateIconIndirect(&icon_info);

        DeleteObject(hbm_color as _);
        DeleteDC(hdc);
        hicon
    }
}
