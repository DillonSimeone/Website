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

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

pub fn butterworth_hp(fc: f32, fs: f32) -> BiquadCoeffs {
    let w0 = 2.0 * PI * (fc / fs).clamp(0.0001, 0.499);
    let cos_w0 = w0.cos();
    let q = 0.70710678;
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
    let q = 0.70710678;
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

    pub fn set_sample_rate_and_update(&mut self, fs: f32, sub_low: f32, sub_high: f32, punch_high: f32, snap_high: f32) {
        if (self.sample_rate - fs).abs() > 1.0 {
            self.sample_rate = fs;
            self.sub.reset();
            self.punch.reset();
            self.snap.reset();
        }
        self.update(sub_low, sub_high, punch_high, snap_high);
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MotorAction {
    None,
    /// Pre-Haxel Default ("VolumeToPwm"): Continuous hold (`oneshot -a 1500 <amp>`) that keeps the motor ON without gaps.
    ContinuousHold { amp: u32 },
    /// Haxel-style gated micro-pulse (`oneshot -a <pulse_ms> <amp>`), leaving a crisp braking gap before the next pulse.
    Pulse { amp: u32, pulse_ms: u32 },
    /// Closed-loop Android LRA primitive (`1`=CLICK, `2`=THUD, `3`=SPIN, `4`=QUICK_RISE, `7`=TICK, `8`=LOW_TICK).
    Primitive { id: u32, scale: f32 },
    /// Immediately stop the motor (`navigator.vibrate(0)` / `cmd vibrator_manager cancel`).
    Cancel,
}

pub struct DspProcessor {
    pub filter_bank: FilterBank,
    pub bass_slow_ema: f32,
    pub bass_fast_ema: f32,
    pub last_fast_ema: f32,
    pub max_bass: f32,
    pub smoothed_audio_env: f32,
    pub pattern_start_time: f64,
    pub was_active: bool,
    pub vibrate_active: bool,
    pub last_vibrate_time: f64,
    pub motor_active_amp: u32,
    pub motor_last_refresh_time: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct DspAnalysis {
    pub sub_energy: f32,
    pub punch_energy: f32,
    pub snap_energy: f32,
    pub bass_energy: f32,
    pub audio_pct: u32,
    pub velocity: f32,
    pub active_pwm: u32,
    pub displayed_peak: u32,
    pub hit: bool,
    pub motor_action: MotorAction,
}

/// Fast 1D Perlin-style value noise matching `pnoise1(x)` in `public/Projects/Haxel/compiler.js`.
fn haxel_pnoise1(x: f32) -> f32 {
    let xi = x.floor();
    let f = x - xi;
    let u = f * f * (3.0 - 2.0 * f);
    let h0 = ((xi * 12.9898).sin() * 43758.5453).fract().abs();
    let h1 = (((xi + 1.0) * 12.9898).sin() * 43758.5453).fract().abs();
    h0 + (h1 - h0) * u
}

/// Evaluates the selected Haxel mathematical pattern `pat.func(t)` from `public/Projects/Haxel/haptics.js`
/// modulated by the live 3-band audio spectrum (`sub_vol`, `mid_vol`, `treble_vol`, `audio_env`).
fn evaluate_haxel_pattern(
    mode: &str,
    t: f32,
    audio_env: f32,
    sub_vol: f32,
    mid_vol: f32,
    treble_vol: f32,
) -> f32 {
    match mode {
        "HaxelMultiBin" => {
            // Haxel Audio Tab 3-Bin Mapper (`public/Projects/Haxel/main.js` lines 1357-1375):
            // Bin 0 (Bass)   -> BassPunch: (t % 0.42 < 0.12) ? 1.0 : 0.0
            // Bin 1 (Mid)    -> Throb:     (0.5 + 0.5*sin(t*25.13)) * (0.5 + 0.5*sin(t*5.0))
            // Bin 2 (Treble) -> Staccato:  (t % 0.22 < 0.05) ? 1.0 : 0.0
            let bass_pat = if (t % 0.42) < 0.13 { 1.0 } else { 0.0 };
            let mid_pat = (0.5 + 0.5 * (t * 25.13).sin()) * (0.5 + 0.5 * (t * 5.0).sin());
            let mid_gated = if mid_pat > 0.22 { mid_pat } else { 0.0 };
            let treb_pat = if (t % 0.22) < 0.055 { 1.0 } else { 0.0 };

            (sub_vol * bass_pat)
                .max(mid_vol * mid_gated)
                .max(treble_vol * treb_pat)
                .max(audio_env * mid_gated * 0.85)
        }
        "Heartbeat" => {
            // Haxel `Heartbeat` (`haptics.js` lines 40-47):
            // p = t % 0.833; lub = exp(-p / 0.062); dub = p < 0.25 ? 0 : 0.85 * exp(-(p - 0.25) / 0.05);
            let p = t % 0.78;
            let lub = (-p / 0.062).exp();
            let dub = if p < 0.23 {
                0.0
            } else {
                0.88 * (-(p - 0.23) / 0.052).exp()
            };
            let v = lub.max(dub);
            if v < 0.16 {
                0.0
            } else {
                audio_env * v
            }
        }
        "BouncingDecay" => {
            // Haxel `BouncingDecay` (`haptics.js` lines 180-187):
            // cycle = t % 2.2; decay = 1.0 - (cycle / 2.6); bounce = frac(cycle * (2.5 + cycle * 1.8)); square(bounce, 0.28) * decay
            let c = t % 2.2;
            let decay = (1.0 - c / 2.6).max(0.28);
            let bounce = (c * (2.5 + c * 1.8)).fract();
            if bounce < 0.28 {
                audio_env * decay
            } else {
                0.0
            }
        }
        "EngineRev" => {
            // Haxel `EngineRev` (`haptics.js` lines 110-112):
            // Frequency-modulated acceleration pulse whose RPM scales with audio volume + time
            let rev_freq = 14.0 + audio_env * 42.0 + (t % 1.8) * 24.0;
            let s = (t * rev_freq).sin();
            if s > 0.15 {
                audio_env * (0.45 + 0.55 * s)
            } else {
                0.0
            }
        }
        "Throb" => {
            // Haxel `Throb` (`haptics.js` lines 92-94):
            // (0.5 + 0.5 * sin(t * 25.13)) * (0.5 + 0.5 * sin(t * 4.4))
            let fast = 0.5 + 0.5 * (t * 25.13).sin();
            let slow = 0.5 + 0.5 * (t * 5.2).sin();
            let pat = fast * slow;
            if pat > 0.20 {
                audio_env * pat
            } else {
                0.0
            }
        }
        "Staccato" => {
            // Haxel `Staccato` + `Pulse` (`haptics.js` lines 6-13 & 74-80):
            // Sharp square on/off micro-clicks with wide silent gaps
            let rate = 4.5 + audio_env * 6.0;
            let ph = (t * rate).fract();
            if ph < 0.26 {
                audio_env
            } else {
                0.0
            }
        }
        "SawTremolo" => {
            // Haxel `SawTremolo` + `ChaosWave` (`haptics.js` lines 125-127 & 219-222):
            let saw = (t % 0.90) / 0.90;
            let carrier = if (t * 16.0).fract() < 0.52 { 1.0 } else { 0.0 };
            let spark = (haxel_pnoise1(t * 24.0) * 1.4 - 0.3).clamp(0.0, 1.0);
            audio_env * ((0.30 + 0.70 * saw) * carrier).max(treble_vol * spark)
        }
        _ => {
            // "VolumeToPwm" / "Default" — Direct 1:1 audio volume envelope
            audio_env
        }
    }
}

impl DspProcessor {
    pub fn new(sub_low: f32, sub_high: f32, punch_high: f32, snap_high: f32, fs: f32) -> Self {
        Self {
            filter_bank: FilterBank::new(sub_low, sub_high, punch_high, snap_high, fs),
            bass_slow_ema: 0.01,
            bass_fast_ema: 0.01,
            last_fast_ema: 0.01,
            max_bass: 0.05,
            smoothed_audio_env: 0.0,
            pattern_start_time: 0.0,
            was_active: false,
            vibrate_active: false,
            last_vibrate_time: 0.0,
            motor_active_amp: 0,
            motor_last_refresh_time: 0.0,
        }
    }

    pub fn reset_for_source_switch(
        &mut self,
        fs: f32,
        mic_mode: bool,
        sub_low: f32,
        sub_high: f32,
        punch_high: f32,
        snap_high: f32,
    ) {
        let eff_punch_high = if mic_mode { punch_high.max(420.0) } else { punch_high };
        let eff_snap_high = if mic_mode { snap_high.max(2400.0) } else { snap_high };
        self.filter_bank.set_sample_rate_and_update(
            fs,
            sub_low,
            sub_high,
            eff_punch_high,
            eff_snap_high,
        );
        self.bass_slow_ema = 0.01;
        self.bass_fast_ema = 0.01;
        self.last_fast_ema = 0.01;
        self.max_bass = 0.04;
        self.smoothed_audio_env = 0.0;
        self.was_active = false;
        self.vibrate_active = false;
        self.motor_active_amp = 0;
    }

    pub fn process_mono_chunk(
        &mut self,
        samples: &[f32],
        now: f64,
        scale: f32,
        noise_floor: f32,
        min_vel: f32,
        base_amp: i32,
        enable_snap_primitives: bool,
        enabled: bool,
        mic_mode: bool,
        punch_duration_ms: i32,
        mode: &str,
    ) -> DspAnalysis {
        let n = samples.len() as f32;
        if n == 0.0 {
            return DspAnalysis {
                sub_energy: 0.0,
                punch_energy: 0.0,
                snap_energy: 0.0,
                bass_energy: 0.0,
                audio_pct: 0,
                velocity: 0.0,
                active_pwm: 0,
                displayed_peak: 0,
                hit: false,
                motor_action: MotorAction::None,
            };
        }

        let mut sub_sum_sq = 0.0f32;
        let mut sub_max = 0.0f32;
        let mut punch_sum_sq = 0.0f32;
        let mut punch_max = 0.0f32;
        let mut snap_sum_sq = 0.0f32;
        let mut snap_max = 0.0f32;

        let pre_gain = if mic_mode { 4.2 } else { 1.0 };

        for &raw_x in samples {
            let x = if mic_mode {
                let g = raw_x * pre_gain;
                (g / (1.0 + g.abs() * 0.35)).clamp(-1.0, 1.0)
            } else {
                raw_x
            };

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

        let bass_energy = if mic_mode {
            sub_energy * 0.55 + punch_energy * 0.68 + snap_energy * 0.38
        } else {
            sub_energy * 0.65 + punch_energy * 0.35 + snap_energy * 0.12
        };

        self.bass_slow_ema = 0.992 * self.bass_slow_ema + 0.008 * bass_energy;
        self.bass_fast_ema = 0.70 * self.bass_fast_ema + 0.30 * bass_energy;

        if bass_energy > self.max_bass {
            self.max_bass = bass_energy;
        } else if self.max_bass > noise_floor {
            let decay = if self.max_bass > (2.5 * self.bass_slow_ema) { 0.994 } else { 0.9985 };
            self.max_bass = (self.max_bass * decay).max(noise_floor);
        }

        let surge = (self.bass_fast_ema - self.bass_slow_ema).max(0.0);
        let rise = (self.bass_fast_ema - self.last_fast_ema).max(0.0);
        self.last_fast_ema = self.bass_fast_ema;

        let headroom = (noise_floor.max(self.max_bass) * 0.92).max(0.012);
        let velocity = (0.5 * rise + 0.5 * surge) / (0.005f32.max(headroom * 0.38));

        let gain_factor = (scale / 2.0).clamp(0.25, 1.85);
        let gate_mult = if mic_mode { 0.85 } else { 0.60 };

        let raw_audio_env = if bass_energy > noise_floor * gate_mult {
            (((bass_energy - noise_floor * 0.5).max(0.0) / headroom).powf(0.75) * gain_factor).clamp(0.0, 1.0)
        } else {
            0.0
        };

        // Smooth audio envelope (`smoothedAmp += (activeAmp - smoothedAmp) * 0.2` from Haxel `main.js` line 1409)
        if raw_audio_env > self.smoothed_audio_env {
            self.smoothed_audio_env = 0.50 * raw_audio_env + 0.50 * self.smoothed_audio_env;
        } else {
            self.smoothed_audio_env = 0.16 * raw_audio_env + 0.84 * self.smoothed_audio_env;
        }

        let hit = enabled && velocity > min_vel && bass_energy > (1.15 * self.bass_slow_ema);
        if hit {
            let norm_v = ((velocity - min_vel) / (0.04f32.max(0.65 - min_vel))).clamp(0.0, 1.0);
            let boost = (0.55 * norm_v.powf(0.65) + 0.45 * raw_audio_env).clamp(0.0, 1.0);
            if boost > self.smoothed_audio_env {
                self.smoothed_audio_env = boost;
            }
        }

        let audio_pct = (self.smoothed_audio_env * 100.0).round().clamp(0.0, 100.0) as u32;

        // Normalize 3 bins for Haxel pattern evaluation
        let sub_vol = ((sub_energy / headroom) * gain_factor).clamp(0.0, 1.0);
        let mid_vol = ((punch_energy / headroom) * gain_factor).clamp(0.0, 1.0);
        let treble_vol = ((snap_energy / (headroom * 0.7)) * gain_factor).clamp(0.0, 1.0);

        let is_volume_to_pwm = mode == "VolumeToPwm" || mode == "Default" || mode == "Balanced";

        let mut haxel_out = 0.0f32;
        if enabled && self.smoothed_audio_env >= 0.05 {
            if !self.was_active {
                self.was_active = true;
                self.pattern_start_time = now;
            }
            if is_volume_to_pwm {
                haxel_out = self.smoothed_audio_env;
            } else {
                let t_pat = (now - self.pattern_start_time) as f32;
                haxel_out = evaluate_haxel_pattern(
                    mode,
                    t_pat,
                    self.smoothed_audio_env,
                    sub_vol,
                    mid_vol,
                    treble_vol,
                )
                .clamp(0.0, 1.0);
            }
        } else {
            self.was_active = false;
        }

        // Apply Motor Startup Floor Calibration (`public/Projects/Haxel/main.js` line 1391:
        // `activeAmp = startupFloor + scaledAmp * (1.0 - startupFloor)`)
        let startup_floor = (base_amp as f32 / 255.0).clamp(0.10, 0.55);
        let calibrated_amp = if haxel_out > 0.08 {
            (startup_floor + haxel_out * (1.0 - startup_floor)).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let active_pwm = (calibrated_amp * 100.0).round() as u32;
        let displayed_peak = (calibrated_amp * 255.0).round() as u32;

        let mut motor_action = MotorAction::None;

        if is_volume_to_pwm {
            // =========================================================================
            // DEFAULT MODE: AUDIO VOLUME TO PWM (Pre-Haxel Continuous State-Tracked Hold)
            // =========================================================================
            // Keeps the smartphone motor continuously ON while audio is present, updating
            // PWM amplitude smoothly when it changes by >= 20/255 or every 900ms, and
            // cancelling immediately when audio drops to silence.
            if enabled && displayed_peak > 0 {
                let amp_diff = displayed_peak.abs_diff(self.motor_active_amp);
                let elapsed = now - self.motor_last_refresh_time;
                if self.motor_active_amp == 0 || amp_diff >= 20 || elapsed >= 0.90 {
                    self.motor_active_amp = displayed_peak;
                    self.motor_last_refresh_time = now;
                    self.vibrate_active = true;
                    motor_action = MotorAction::ContinuousHold {
                        amp: displayed_peak.clamp(15, 255),
                    };
                }
            } else if self.motor_active_amp > 0 || self.vibrate_active {
                self.motor_active_amp = 0;
                self.vibrate_active = false;
                motor_action = MotorAction::Cancel;
            }
        } else {
            // =========================================================================
            // HAXEL PATTERN MOTOR TRIGGER ENGINE (`public/Projects/Haxel/main.js` lines 1412-1431)
            // =========================================================================
            self.motor_active_amp = 0;
            let haptic_threshold = 0.14;
            let hold_ratio = ((punch_duration_ms as f32 - 40.0) / 110.0).clamp(0.0, 1.0);
            let pulse_ms = (38.0 + hold_ratio * 22.0).round() as u32;
            let interval_sec = (pulse_ms as f64 + 13.0) / 1000.0;

            if enabled && calibrated_amp > haptic_threshold {
                if (now - self.last_vibrate_time) >= interval_sec {
                    self.last_vibrate_time = now;
                    self.vibrate_active = true;

                    if enable_snap_primitives {
                        let prim_scale = calibrated_amp.clamp(0.20, 1.0);
                        let prim_id = match mode {
                            "Heartbeat" => {
                                let p = ((now - self.pattern_start_time) as f32) % 0.78;
                                if p < 0.18 { 2 } else { 1 } // Lub = THUD (2), Dub = CLICK (1)
                            }
                            "Staccato" => {
                                if calibrated_amp > 0.65 { 1 } else { 7 } // CLICK (1) or TICK (7)
                            }
                            "BouncingDecay" => {
                                let c = ((now - self.pattern_start_time) as f32) % 2.2;
                                if c < 0.6 { 2 } else if c < 1.3 { 1 } else { 7 } // THUD -> CLICK -> TICK
                            }
                            "HaxelMultiBin" => {
                                if sub_vol >= mid_vol && sub_vol >= treble_vol {
                                    2 // BassPunch -> THUD (2)
                                } else if treble_vol > mid_vol {
                                    if calibrated_amp > 0.6 { 1 } else { 7 } // Treble -> CLICK (1) / TICK (7)
                                } else {
                                    8 // Mid Throb -> LOW_TICK (8)
                                }
                            }
                            _ => 0,
                        };

                        if prim_id > 0 {
                            motor_action = MotorAction::Primitive {
                                id: prim_id,
                                scale: prim_scale,
                            };
                        } else {
                            motor_action = MotorAction::Pulse {
                                amp: displayed_peak.clamp(35, 255),
                                pulse_ms,
                            };
                        }
                    } else {
                        motor_action = MotorAction::Pulse {
                            amp: displayed_peak.clamp(35, 255),
                            pulse_ms,
                        };
                    }
                }
            } else if self.vibrate_active {
                motor_action = MotorAction::Cancel;
                self.vibrate_active = false;
            }
        }

        DspAnalysis {
            sub_energy,
            punch_energy,
            snap_energy,
            bass_energy,
            audio_pct,
            velocity,
            active_pwm,
            displayed_peak,
            hit,
            motor_action,
        }
    }
}
