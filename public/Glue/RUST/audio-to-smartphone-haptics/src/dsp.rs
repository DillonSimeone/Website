use std::f32::consts::PI;

#[derive(Clone, Copy, Debug, Default)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

#[derive(Clone, Debug, Default)]
pub struct Biquad {
    pub coeffs: BiquadCoeffs,
    pub s1: f32,
    pub s2: f32,
}

impl Biquad {
    pub fn new(coeffs: BiquadCoeffs) -> Self {
        Self {
            coeffs,
            s1: 0.0,
            s2: 0.0,
        }
    }

    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.coeffs.b0 * x + self.s1;
        self.s1 = self.coeffs.b1 * x - self.coeffs.a1 * y + self.s2;
        self.s2 = self.coeffs.b2 * x - self.coeffs.a2 * y;
        y
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

pub fn butterworth_hp(fc: f32, fs: f32) -> BiquadCoeffs {
    let w0 = 2.0 * PI * (fc / fs).clamp(0.0001, 0.499);
    let cos_w0 = w0.cos();
    let q = 0.70710678; // 1 / sqrt(2)
    let alpha = w0.sin() / (2.0 * q);

    let b0 = (1.0 + cos_w0) * 0.5;
    let b1 = -(1.0 + cos_w0);
    let b2 = (1.0 + cos_w0) * 0.5;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

pub fn butterworth_lp(fc: f32, fs: f32) -> BiquadCoeffs {
    let w0 = 2.0 * PI * (fc / fs).clamp(0.0001, 0.499);
    let cos_w0 = w0.cos();
    let q = 0.70710678; // 1 / sqrt(2)
    let alpha = w0.sin() / (2.0 * q);

    let b0 = (1.0 - cos_w0) * 0.5;
    let b1 = 1.0 - cos_w0;
    let b2 = (1.0 - cos_w0) * 0.5;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

#[derive(Clone, Debug, Default)]
pub struct BandPassFilter {
    pub hp: Biquad,
    pub lp: Biquad,
}

impl BandPassFilter {
    pub fn new(f_low: f32, f_high: f32, fs: f32) -> Self {
        Self {
            hp: Biquad::new(butterworth_hp(f_low, fs)),
            lp: Biquad::new(butterworth_lp(f_high, fs)),
        }
    }

    pub fn update(&mut self, f_low: f32, f_high: f32, fs: f32) {
        self.hp.coeffs = butterworth_hp(f_low, fs);
        self.lp.coeffs = butterworth_lp(f_high, fs);
    }

    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        self.lp.process(self.hp.process(x))
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.hp.reset();
        self.lp.reset();
    }
}

pub struct FilterBank {
    pub sub: BandPassFilter,
    pub punch: BandPassFilter,
    pub snap: BandPassFilter,
    pub sample_rate: f32,
}

impl FilterBank {
    pub fn new(sub_low: f32, sub_high: f32, punch_high: f32, snap_high: f32, fs: f32) -> Self {
        Self {
            sub: BandPassFilter::new(sub_low, sub_high, fs),
            punch: BandPassFilter::new(sub_high, punch_high, fs),
            snap: BandPassFilter::new(punch_high, snap_high, fs),
            sample_rate: fs,
        }
    }

    pub fn update(&mut self, sub_low: f32, sub_high: f32, punch_high: f32, snap_high: f32) {
        self.sub.update(sub_low, sub_high, self.sample_rate);
        self.punch.update(sub_high, punch_high, self.sample_rate);
        self.snap.update(punch_high, snap_high, self.sample_rate);
    }
}

pub struct DspProcessor {
    pub filter_bank: FilterBank,
    pub bass_slow_ema: f32,
    pub bass_fast_ema: f32,
    pub last_fast_ema: f32,
    pub max_bass: f32,
    pub continuous_pwm: f32,
    pub current_peak_amp: u32,
    pub current_envelope_end: f64,
    pub total_envelope_ms: u32,
    pub cooldown_until: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct DspAnalysis {
    pub sub_energy: f32,
    pub punch_energy: f32,
    pub snap_energy: f32,
    pub bass_energy: f32,
    pub velocity: f32,
    pub active_pwm: u32,
    pub displayed_peak: u32,
    pub is_snap: bool,
    pub is_deep_sub: bool,
    pub should_trigger: bool,
    pub velocity_curved: f32,
}

impl DspProcessor {
    pub fn new(sub_low: f32, sub_high: f32, punch_high: f32, snap_high: f32, fs: f32) -> Self {
        Self {
            filter_bank: FilterBank::new(sub_low, sub_high, punch_high, snap_high, fs),
            bass_slow_ema: 0.01,
            bass_fast_ema: 0.01,
            last_fast_ema: 0.01,
            max_bass: 0.05,
            continuous_pwm: 0.0,
            current_peak_amp: 0,
            current_envelope_end: 0.0,
            total_envelope_ms: 0,
            cooldown_until: 0.0,
        }
    }

    pub fn process_mono_chunk(
        &mut self,
        samples: &[f32],
        now: f64,
        scale: f32,
        noise_floor: f32,
        min_vel: f32,
        enable_snap_primitives: bool,
        enabled: bool,
    ) -> DspAnalysis {
        let n = samples.len() as f32;
        if n == 0.0 {
            return DspAnalysis {
                sub_energy: 0.0,
                punch_energy: 0.0,
                snap_energy: 0.0,
                bass_energy: 0.0,
                velocity: 0.0,
                active_pwm: 0,
                displayed_peak: 0,
                is_snap: false,
                is_deep_sub: false,
                should_trigger: false,
                velocity_curved: 0.0,
            };
        }

        let mut sub_sum_sq = 0.0f32;
        let mut sub_max = 0.0f32;
        let mut punch_sum_sq = 0.0f32;
        let mut punch_max = 0.0f32;
        let mut snap_sum_sq = 0.0f32;
        let mut snap_max = 0.0f32;

        for &x in samples {
            let s = self.filter_bank.sub.process(x);
            let s_abs = s.abs();
            sub_sum_sq += s * s;
            if s_abs > sub_max { sub_max = s_abs; }

            let p = self.filter_bank.punch.process(x);
            let p_abs = p.abs();
            punch_sum_sq += p * p;
            if p_abs > punch_max { punch_max = p_abs; }

            let sn = self.filter_bank.snap.process(x);
            let sn_abs = sn.abs();
            snap_sum_sq += sn * sn;
            if sn_abs > snap_max { snap_max = sn_abs; }
        }

        let sub_energy = 0.5 * (sub_sum_sq / n).sqrt() + 0.5 * sub_max;
        let punch_energy = 0.5 * (punch_sum_sq / n).sqrt() + 0.5 * punch_max;
        let snap_energy = 0.5 * (snap_sum_sq / n).sqrt() + 0.5 * snap_max;

        let bass_energy = sub_energy * 0.65 + punch_energy * 0.35;

        // Gestolumina Dual EMA Tracking
        self.bass_slow_ema = 0.992 * self.bass_slow_ema + 0.008 * bass_energy;
        self.bass_fast_ema = 0.70 * self.bass_fast_ema + 0.30 * bass_energy;

        // Automatic Gain Control (AGC) - adaptive dynamic headroom
        if bass_energy > self.max_bass {
            self.max_bass = bass_energy;
        } else if self.max_bass > (3.0 * self.bass_slow_ema) && self.max_bass > noise_floor {
            self.max_bass *= 0.995;
        }

        let surge = (self.bass_fast_ema - self.bass_slow_ema).max(0.0);
        let rise = (self.bass_fast_ema - self.last_fast_ema).max(0.0);
        self.last_fast_ema = self.bass_fast_ema;

        let headroom = noise_floor.max(self.max_bass);
        let velocity = (0.5 * rise + 0.5 * surge) / (0.005f32.max(headroom * 0.35));

        // Check trigger condition
        let mut should_trigger = false;
        let mut velocity_curved = 0.0f32;
        let mut is_snap = false;
        let mut is_deep_sub = false;

        if enabled && now >= self.cooldown_until && velocity > min_vel && bass_energy > (1.15 * self.bass_slow_ema) {
            let norm_v = ((velocity - min_vel) / (0.02f32.max(0.55 - min_vel))).clamp(0.0, 1.0);
            velocity_curved = (norm_v.powf(0.85) * (scale / 2.0)).clamp(0.05, 1.0);

            is_snap = enable_snap_primitives
                && (snap_energy > punch_energy * 1.3)
                && (snap_energy > sub_energy * 1.8);

            is_deep_sub = sub_energy > (punch_energy * 1.25);
            should_trigger = true;
        }

        // Continuous acoustic PWM tracking
        let energy_ratio = (bass_energy / (0.012f32.max(headroom * 0.90))).clamp(0.0, 1.0);
        let raw_target_pwm = (energy_ratio.powf(0.85) * (scale / 2.0) * 100.0).clamp(0.0, 100.0);

        // Attack ~25ms / Release ~85ms smoothing
        if raw_target_pwm > self.continuous_pwm {
            self.continuous_pwm = 0.50 * raw_target_pwm + 0.50 * self.continuous_pwm;
        } else {
            self.continuous_pwm = 0.12 * raw_target_pwm + 0.88 * self.continuous_pwm;
        }

        // Transient hit layer with cosine decay
        let mut hit_pwm = 0.0f32;
        if now < self.current_envelope_end && self.total_envelope_ms > 0 {
            let rem = ((self.current_envelope_end - now) / (self.total_envelope_ms as f64 / 1000.0)).clamp(0.0, 1.0) as f32;
            let decay_shape = 0.5 * (1.0 + ((1.0 - rem) * PI).cos());
            hit_pwm = (self.current_peak_amp as f32 / 255.0) * 100.0 * decay_shape;
        }

        let active_pwm = (self.continuous_pwm.max(hit_pwm).clamp(0.0, 100.0)) as u32;
        let displayed_peak = if active_pwm > 0 {
            let calc_p = (active_pwm as f32 * 2.55) as u32;
            if now < self.current_envelope_end {
                calc_p.max(self.current_peak_amp)
            } else {
                calc_p
            }
        } else {
            0
        };

        DspAnalysis {
            sub_energy,
            punch_energy,
            snap_energy,
            bass_energy,
            velocity,
            active_pwm,
            displayed_peak,
            is_snap,
            is_deep_sub,
            should_trigger,
            velocity_curved,
        }
    }

    pub fn set_hit_state(&mut self, peak_amp: u32, duration_ms: u32, now: f64) {
        self.current_peak_amp = peak_amp;
        self.current_envelope_end = now + (duration_ms as f64 / 1000.0);
        self.total_envelope_ms = duration_ms;
        self.cooldown_until = now + ((duration_ms + 16) as f64 / 1000.0);
    }
}
