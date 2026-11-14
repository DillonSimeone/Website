//! Programmatic 32-bit ARGB cyber-terminal waveform icon for Speech Bridge.

use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, HICON, ICONINFO};

/// Builds a crisp 32-bit ARGB cyber-hacker waveform icon at `size x size` pixels.
pub fn create_cyber_icon(size: i32) -> Option<HICON> {
    let w = size as usize;
    let h = size as usize;
    let mut bgra = vec![0u8; w * h * 4];

    let cx = (w as f32 - 1.0) * 0.5;
    let cy = (h as f32 - 1.0) * 0.5;
    let half = w as f32 * 0.5;
    let radius = w as f32 * 0.22;

    // 5 symmetric cyber waveform bar heights (normalized)
    let bar_heights = [0.28f32, 0.54, 0.78, 0.54, 0.28];

    for y in 0..h {
        for x in 0..w {
            let dx = (x as f32 - cx).abs() - (half - radius - 1.0);
            let dy = (y as f32 - cy).abs() - (half - radius - 1.0);
            let ox = dx.max(0.0);
            let oy = dy.max(0.0);
            let dist = (ox * ox + oy * oy).sqrt() + dx.max(dy).min(0.0) - radius;

            let idx = (y * w + x) * 4;
            if dist > 0.6 {
                // Transparent outside rounded square
                continue;
            }

            // Anti-aliased edge alpha
            let alpha = ((0.6 - dist).clamp(0.0, 1.0) * 255.0) as u8;

            // Default obsidian fill (#070A0E -> BGRA)
            let mut b: u8 = 0x0E;
            let mut g: u8 = 0x0A;
            let mut r: u8 = 0x07;

            // Neon green border (#00FF88)
            if dist > -1.6 {
                b = 0x88;
                g = 0xFF;
                r = 0x00;
            } else {
                // Inner waveform bars
                let nx = x as f32 / w as f32;
                let ny = (y as f32 - cy).abs() / half;
                for (bi, &bh) in bar_heights.iter().enumerate() {
                    let bx = 0.24 + (bi as f32) * 0.13;
                    if (nx - bx).abs() < 0.042 && ny <= bh * 0.72 {
                        if bi == 2 {
                            // Center peak bar in cyber cyan (#00D4FF)
                            b = 0xFF;
                            g = 0xD4;
                            r = 0x00;
                        } else {
                            // Outer bars in neon matrix green (#00FF88)
                            b = 0x88;
                            g = 0xFF;
                            r = 0x00;
                        }
                    }
                }
            }

            bgra[idx] = b;
            bgra[idx + 1] = g;
            bgra[idx + 2] = r;
            bgra[idx + 3] = alpha;
        }
    }

    unsafe {
        let color_bmp: HBITMAP = CreateBitmap(size, size, 1, 32, Some(bgra.as_ptr() as *const _));
        let mask_bytes = vec![0u8; (w * h).div_ceil(8)];
        let mask_bmp: HBITMAP = CreateBitmap(size, size, 1, 1, Some(mask_bytes.as_ptr() as *const _));

        let info = ICONINFO {
            fIcon: true.into(),
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: mask_bmp,
            hbmColor: color_bmp,
        };
        let icon = CreateIconIndirect(&info).ok();
        let _ = DeleteObject(color_bmp);
        let _ = DeleteObject(mask_bmp);
        icon
    }
}
