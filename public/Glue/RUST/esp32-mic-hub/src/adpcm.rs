pub const SAMPLES_PER_PKT: usize = 480;

static IMA_INDEX_TABLE: [i8; 16] = [
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8,
];

static IMA_STEP_TABLE: [i16; 89] = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
    19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
    5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

/// Decode a BLE audio packet (excluding the 2-byte sequence header) into `out`.
/// Supports 244-byte 4-bit IMA-ADPCM (480 samples) or raw 16-bit PCM fallback.
/// Returns the number of decoded samples.
pub fn decode_packet_payload(payload: &[u8], out: &mut [i16; SAMPLES_PER_PKT]) -> usize {
    if payload.len() == 244 {
        let mut pred = i16::from_le_bytes([payload[0], payload[1]]) as i32;
        let mut index = (payload[2] as usize).min(88) as i32;
        let mut pos = 0usize;

        for &b in &payload[4..244] {
            for nib in [b & 0x0F, (b >> 4) & 0x0F] {
                let step = IMA_STEP_TABLE[index as usize] as i32;
                let mut diff = step >> 3;
                if (nib & 4) != 0 {
                    diff += step;
                }
                if (nib & 2) != 0 {
                    diff += step >> 1;
                }
                if (nib & 1) != 0 {
                    diff += step >> 2;
                }
                if (nib & 8) != 0 {
                    pred -= diff;
                } else {
                    pred += diff;
                }
                pred = pred.clamp(-32768, 32767);
                index = (index + IMA_INDEX_TABLE[nib as usize] as i32).clamp(0, 88);
                out[pos] = pred as i16;
                pos += 1;
            }
        }
        pos
    } else {
        let count = (payload.len() / 2).min(SAMPLES_PER_PKT);
        for (i, chunk) in payload[..count * 2].chunks_exact(2).enumerate() {
            out[i] = i16::from_le_bytes([chunk[0], chunk[1]]);
        }
        count
    }
}

/// Returns normalized (rms, peak) in `0.0..=1.0` for VU meter display.
pub fn compute_vu(samples: &[i16]) -> (f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0);
    }
    let mut sum_sq = 0.0f64;
    let mut peak = 0i32;
    for &s in samples {
        let v = s as i32;
        let av = v.abs();
        if av > peak {
            peak = av;
        }
        sum_sq += (v as f64) * (v as f64);
    }
    let rms = ((sum_sq / samples.len() as f64).sqrt() / 32768.0) as f32;
    let pk = (peak as f32) / 32768.0;
    (rms.min(1.0), pk.min(1.0))
}
