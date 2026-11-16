//! Shared pure-Rust cyber-waveform icon pixel generator (used by both `build.rs` and `src/icon.rs`).

/// Generates a `size x size` 32-bit BGRA pixel buffer for the rounded-square cyber-waveform icon.
/// `bottom_up = true` produces DIB row ordering for `.ico` resources; `false` produces top-down ordering.
pub fn generate_icon_bgra(size: u32, bottom_up: bool) -> Vec<u8> {
    let w = size as usize;
    let h = size as usize;
    let mut bgra = vec![0u8; w * h * 4];

    let cx = (w as f32 - 1.0) * 0.5;
    let cy = (h as f32 - 1.0) * 0.5;
    let half = w as f32 * 0.5;
    let radius = w as f32 * 0.22;
    let bar_heights = [0.28f32, 0.54, 0.78, 0.54, 0.28];

    for row in 0..h {
        let y = if bottom_up { h - 1 - row } else { row };
        for x in 0..w {
            let dx = (x as f32 - cx).abs() - (half - radius - 1.0);
            let dy = (y as f32 - cy).abs() - (half - radius - 1.0);
            let ox = dx.max(0.0);
            let oy = dy.max(0.0);
            let dist = (ox * ox + oy * oy).sqrt() + dx.max(dy).min(0.0) - radius;

            if dist > 0.6 {
                continue;
            }

            let alpha = ((0.6 - dist).clamp(0.0, 1.0) * 255.0) as u8;
            // Default obsidian fill (#070A0E -> BGRA)
            let mut b: u8 = 0x0E;
            let mut g: u8 = 0x0A;
            let mut r: u8 = 0x07;

            if dist > -1.6 {
                // Neon matrix green border (#00FF88)
                b = 0x88;
                g = 0xFF;
                r = 0x00;
            } else {
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

            let idx = (row * w + x) * 4;
            bgra[idx] = b;
            bgra[idx + 1] = g;
            bgra[idx + 2] = r;
            bgra[idx + 3] = alpha;
        }
    }

    bgra
}
