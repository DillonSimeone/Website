//! Programmatic 32-bit ARGB cyber-terminal waveform icon for Speech Bridge.

use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, HICON, ICONINFO};

use crate::icon_gen::generate_icon_bgra;

/// Builds a crisp 32-bit ARGB cyber-hacker waveform icon at `size x size` pixels.
pub fn create_cyber_icon(size: i32) -> Option<HICON> {
    let w = size as usize;
    let h = size as usize;
    let bgra = generate_icon_bgra(size as u32, false);

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
