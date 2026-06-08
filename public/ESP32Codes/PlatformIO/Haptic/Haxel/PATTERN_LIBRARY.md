# Haxel — Pattern Library

40+ built-in patterns across six categories. Each pattern is a pure function of time, parameters, and (optionally) the latest audio frame. Patterns advertise their parameters so the portal can render the right controls.

**Conventions**
- Output is a normalized 0..1 envelope per channel. The HAL handles polarity & duty mapping.
- Time `t` is engine ticks in milliseconds, monotonically increasing, never wraps in normal use.
- Patterns must be deterministic given `(t, params)` — no per-instance hidden state except declared `runtime` fields.
- Patterns label themselves with `tags[]`: `pulse`, `rhythm`, `reactive`, `music`, `alert`, `ambient`, `lra-friendly`, `solenoid-friendly`, `library-rom` (DRV2605L).

---

## 1. Pulse (rhythmic, single-shape)

### 1.1 `Pulse`
Square pulse: `value = (t % period < duty*period) ? intensity : 0`.
Params: `period_ms` 50..5000, `duty` 0..1, `intensity` 0..1.

### 1.2 `Sine`
`value = intensity * (0.5 + 0.5 * sin(2π * t / period))`. Smooth, LRA-friendly.
Params: `period_ms` 50..5000, `intensity`.

### 1.3 `Triangle`
Linear ramp up + down. Good for solenoid throws where you want a deliberate stroke.
Params: `period_ms`, `intensity`.

### 1.4 `Sawtooth`
Ramp up, instant drop. Mimics a flick / snap.
Params: `period_ms`, `intensity`, `direction` ∈ {up,down}.

### 1.5 `Breath`
Slow inhale/exhale, exponential ease both directions. Calibration-friendly default pattern (the device boots into this on first-run).
Params: `period_ms` default 4000, `intensity` default 0.6.

### 1.6 `Heartbeat`
Lub-dub: two pulses (80 ms, 30 ms gap, 60 ms) inside a 1 s window, configurable BPM.
Params: `bpm` 30..180, `intensity`.

### 1.7 `Throb`
Two layered sines (4 Hz × 0.7 Hz). Slower than Sine, more organic.
Params: `intensity`.

### 1.8 `Click`
Single 5 ms spike at full intensity, repeated every `period_ms`. Library-ROM equivalent (`DRV2605L effect 1`) is preferred when available.
Params: `period_ms`, `intensity`.

---

## 2. Rhythm (compound, multi-element)

### 2.1 `Morse`
Plays an arbitrary text string as Morse, dot=80 ms full, dash=240 ms full.
Params: `text` (string, ≤ 32 chars), `wpm` 5..30, `intensity`.

### 2.2 `Stutter`
Random gap pulses inside a window — irregular tactile attention grab.
Params: `density` 0..1, `intensity`, `seed`.

### 2.3 `Cascade` (multi-channel)
Across N channels, plays the same envelope with phase offset `360° / N`.
Params: `period_ms`, `intensity`. Requires `channels ≥ 2`.

### 2.4 `Ripple`
Same as Cascade but the envelope amplitude tapers down channel index.
Params: `period_ms`, `intensity`, `falloff` 0..1.

### 2.5 `Volley`
N channels fire in sequence (1 → 2 → … → N → 1) at `period_ms / N` per step.
Params: `period_ms`, `intensity`.

### 2.6 `BackAndForth`
Bidirectional sweep (Volley forward, then reverse). Reads as "moving" touch when actuators are spatially arranged.
Params: `period_ms`, `intensity`.

### 2.7 `Polyrhythm`
Two layered rhythms at coprime BPMs (e.g., 60 and 75). Renders interesting compound feel.
Params: `bpm_a`, `bpm_b`, `intensity`.

### 2.8 `Strum`
Six rapid descending pulses (mimicking a guitar strum), repeating at `period_ms`.
Params: `period_ms`, `intensity`.

---

## 3. Reactive (sensor-driven, no audio)

### 3.1 `TouchPulse`
Pulses when a configured GPIO touch pin crosses threshold. Until release, repeats.
Params: `pin`, `threshold`, `intensity`.

### 3.2 `Knock`
ADC envelope detector on an analog input. Fires a short transient on detected onset.
Params: `pin`, `threshold`, `intensity`, `cooldown_ms`.

### 3.3 `OrientationTilt` (requires I2C IMU, optional add-on)
Intensity proportional to absolute roll angle. Requires `MPU6050` or `LSM6DS3` wired on the I2C bus.
Params: `axis` ∈ {roll, pitch}, `gain`, `intensity_max`.

### 3.4 `HeartRateMirror`
Reads BPM via REST PUT (e.g., from a phone HR sensor) and renders a Heartbeat pattern at that BPM. No on-device sensor required.
Params: `intensity`.

### 3.5 `ProximityRamp`
Reads an HC-SR04 or VL53L0X distance sensor; intensity ramps up as distance shrinks.
Params: `near_cm`, `far_cm`, `curve` ∈ {linear, exp}, `intensity_max`.

---

## 4. Music / audio-reactive

All four require `AudioAnalyzer` running. They consume the `AudioFrame` written by `audio_task`.

### 4.1 `EnvelopeFollow`
Output = RMS envelope, smoothed.
Params: `attack_ms`, `release_ms`, `gain`, `gate_db`.

### 4.2 `BassPunch`
Mag-sum of bins 0..3 (≈ 0..125 Hz), gated and ducked. Hits hard on kicks.
Params: `gain`, `gate_db`, `release_ms`.

### 4.3 `SpectrumChannels` (multi-channel)
N channels each bound to a frequency band. Ch 0 = lows, Ch N-1 = highs.
Params: `gain[]` per band, `attack_ms`, `release_ms`.

### 4.4 `BeatPulse`
Onset detector → single transient per detected beat. Underlying detector uses spectral flux + adaptive threshold.
Params: `intensity`, `sensitivity` 0..1.

### 4.5 `Vocoder`
Routes the audio's amplitude through a chosen base pattern (e.g., Heartbeat scaled by RMS). Lets users "speak through" a rhythm.
Params: `base_pattern` (id), `gain`.

### 4.6 `KickSnareSplit` (multi-channel)
Two channels: low-band (kick) and mid-high band (snare/clap). Useful with two actuators on chest/back.
Params: `gain_low`, `gain_mid`, `attack`, `release`.

---

## 5. Alert / notification

### 5.1 `Notification`
DRV2605L library effect 47 ("Strong Click 100%") if available, else 30 ms full pulse ×2 with 60 ms gap.
Params: `intensity`.

### 5.2 `Warning`
Three rising-intensity pulses (40/70/100 %), 80 ms each, 100 ms gap. Conveys urgency.
Params: none.

### 5.3 `Alarm`
Continuous 4 Hz square at 100 % until cleared. **Auto-clears after 30 s** unless `persist=true`.
Params: `persist` boolean.

### 5.4 `SOS`
Morse "SOS" loop, 2 s gap between repetitions.
Params: none.

### 5.5 `Ack`
Single short bump (10 ms full). The "got it" of haptics.
Params: none.

### 5.6 `Error`
Two harsh sawtooth pulses (down-direction) with 80 ms gap.
Params: none.

### 5.7 `LongPressFeedback`
Plays a 250 ms exponential ramp from 0→1 then immediate release. Designed to be triggered when a UI long-press fires.
Params: `ramp_ms`.

---

## 6. Ambient / continuous

Designed to be sat with for minutes or hours. All ambient patterns soft-cap intensity at 0.6 by default.

### 6.1 `OceanWaves`
Slow LFO (0.1 Hz) ducked by a faster sine (0.05 Hz). Reads as breathing tide.
Params: `intensity`.

### 6.2 `WindGusts`
Smoothed noise envelope, occasional gusts above mean.
Params: `intensity`, `gust_density`.

### 6.3 `PerlinFlow`
1D Perlin/value noise, slow (8 Hz sample, ramped). Organic, never repeats audibly.
Params: `intensity`, `speed`.

### 6.4 `Drone`
Constant intensity at `level`. Honest about being constant; surprisingly hard to do right with LRAs (uses RTP at register-level smoothing).
Params: `level` 0..1.

### 6.5 `Fireplace`
Layered crackles (random impulses) + low murmur. Surprisingly evocative.
Params: `intensity`, `crackle_density`.

### 6.6 `Rain`
Dense small random impulses. Higher density than Fireplace, no underlying murmur.
Params: `intensity`, `density`.

### 6.7 `LullabyBreath`
`Breath` pattern that decreases period by 5 % every cycle for 10 cycles then holds. Designed as a sleep aid; researchers can study with this as the baseline.
Params: `start_period_ms`, `intensity`.

---

## 7. DRV2605L on-chip library (auto-mapped)

When the active driver is DRV2605L and a pattern advertises `tags: ["library-rom"]`, the engine bypasses the RTP path and triggers a built-in effect ID. The portal renders a separate "ROM Effects" section listing all 123 effects by their TI-defined names (e.g., 1=Strong Click, 47=Buzz 100 %, 58=Transition Ramp Down Long Smooth 1).

This is fully additive — every ROM effect appears as a one-shot pattern named `rom:01` through `rom:123`.

---

## 8. Pattern parameter schema

Every pattern returns metadata used by the portal:

```cpp
struct PatternMeta {
    const char* id;          // "Heartbeat"
    const char* category;    // "pulse"
    const char* tags;        // CSV
    const char* description; // 1 sentence
    ParamMeta   params[8];
    uint8_t     paramCount;
    bool        multiChannel;
    bool        usesAudio;
};

struct ParamMeta {
    const char* id;       // "bpm"
    const char* label;    // "BPM"
    ParamType   type;     // FLOAT, INT, ENUM, BOOL, STRING
    float       min, max;
    float       defaultF;
    const char* enumCsv;  // for ENUM
};
```

`GET /json/patterns` returns this array verbatim. The portal builds its UI from it — adding a pattern requires zero portal changes.

## 9. Authoring guidelines

1. **No allocations** inside `sample()`. Pre-allocate in the constructor / `begin()`.
2. **Bounded math.** No `sin()` in tight loops when a precomputed table will do; the standard `sin()` is fine at 1 kHz with FPU.
3. **Cooperative timing.** If the pattern needs > 50 µs of work per tick, cache the result and interpolate.
4. **Audio frames are optional.** Check `ctx.audio.valid` before reading.
5. **Multi-channel awareness.** Patterns that need ≥ 2 channels gracefully degrade on 1-channel hardware (collapse to a sensible mono mix).

## 10. Future categories (post-1.0)

- **Spatial** — array-aware patterns for vests, suits, mats. Roadmapped.
- **Scripted** — Lua-defined patterns hot-loaded from `/littlefs/patterns/*.lua`. Roadmapped.
- **External** — patterns that *only* render data pushed over WebSocket (the device is a thin endpoint). Already possible via the `External` pseudo-pattern — see [API_SPEC.md](API_SPEC.md).
