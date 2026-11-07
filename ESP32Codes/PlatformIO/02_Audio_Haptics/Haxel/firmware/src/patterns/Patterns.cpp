// Built-in patterns. Each is a stateless functor (or stateless-after-construction).
// Adding a pattern: implement IPattern, then list it in registerAll().
//
// Mid-frequency patterns and audio-reactive patterns are split off into
// separate translation units in real codebases; for the skeleton, we keep them
// here for review.

#include "Patterns.h"
#include "../core/Pattern.h"
#include "../core/PatternRegistry.h"
#include <math.h>
#include <cstring>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "CustomPattern.h"

namespace haxel::patterns {
using namespace haxel::core;

namespace {

inline float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

// ---------- 1. Pulse / shape patterns ----------

class Sine : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,50,5000,1000,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.7f,nullptr},
        };
        static const PatternMeta m{
            "Sine","pulse","pulse,lra-friendly","Smooth single sine LFO.",
            p, 2, false, false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float w = 2.0f * (float)M_PI * ctx.tMs / period_;
        return clamp01(intensity_ * (0.5f + 0.5f * sinf(w)));
    }
private:
    float period_ = 1000.0f;
    float intensity_ = 0.7f;
};

class Pulse : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,50,5000,500,nullptr},
            {"duty","Duty",ParamType::FLOAT,0.05f,0.95f,0.5f,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1,nullptr},
        };
        static const PatternMeta m{
            "Pulse","pulse","pulse","Square pulse with adjustable duty.",
            p, 3, false, false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"duty"))      { duty_ = v;   return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        return ph < duty_ ? intensity_ : 0.0f;
    }
private:
    float period_ = 500.0f;
    float duty_ = 0.5f;
    float intensity_ = 1.0f;
};

class Breath : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,1000,10000,4000,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.6f,nullptr},
        };
        static const PatternMeta m{
            "Breath","pulse","pulse,ambient,lra-friendly","Slow inhale/exhale.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        // Eased half-sine, fuller exhale than inhale for that "letting go" feel.
        float v = ph < 0.5f
                      ? 0.5f - 0.5f * cosf(ph * 2.0f * (float)M_PI)
                      : 0.5f + 0.5f * cosf((ph - 0.5f) * 2.0f * (float)M_PI);
        return clamp01(intensity_ * v);
    }
private:
    float period_ = 4000.0f;
    float intensity_ = 0.6f;
};

class Heartbeat : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"bpm","BPM",ParamType::FLOAT,30,180,72,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Heartbeat","pulse","pulse,iconic","Lub-dub heartbeat.",p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"bpm")) { bpm_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float period = 60000.0f / bpm_;
        float t = fmodf(ctx.tMs, period);
        // Instant attack + exponential decay per beat (like Tap). The old
        // 80 ms haversine bumps ramped too gently for ERM rotors to spin up,
        // so the pattern produced output the motor never turned into motion.
        // Beat widths scale with BPM; hard cutoff keeps true silence between
        // beats so the startup floor doesn't hold the motor at a constant hum.
        float lub = expf(-t / (period * 0.075f));
        float dubStart = period * 0.30f;
        float dub = t >= dubStart
                        ? 0.85f * expf(-(t - dubStart) / (period * 0.06f))
                        : 0.0f;
        float v = lub > dub ? lub : dub;
        if (v < 0.05f) v = 0.0f;
        return clamp01(intensity_ * v);
    }
private:
    float bpm_ = 72.0f;
    float intensity_ = 1.0f;
};

// ---------- 2. Audio-reactive patterns ----------

class EnvelopeFollow : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"gain","Gain",ParamType::FLOAT,0,10,3.0f,nullptr},
            {"gate","Gate (0..1)",ParamType::FLOAT,0,1,0.04f,nullptr},
        };
        static const PatternMeta m{
            "EnvelopeFollow","music","reactive,music","Maps RMS envelope to intensity.",
            p,2,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"gain")) { gain_ = v; return true; }
        if (!strcmp(id,"gate")) { gate_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        float v = ctx.audio.rms * gain_;
        if (v < gate_) return 0.0f;
        return clamp01(v);
    }
private:
    float gain_ = 3.0f;
    float gate_ = 0.04f;
};

class BassPunch : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"gain","Gain",ParamType::FLOAT,0,10,4.0f,nullptr},
            {"release_ms","Release",ParamType::FLOAT,30,1000,180,nullptr},
        };
        static const PatternMeta m{
            "BassPunch","music","reactive,music","Hits hard on kicks.",
            p,2,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"gain")) { gain_ = v; return true; }
        if (!strcmp(id,"release_ms")) { release_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        float bass = 0;
        for (int i = 0; i < 4; ++i) bass += ctx.audio.mags[i];
        bass *= gain_ * 0.25f;
        // Cheap decaying peak hold.
        const float decay = 1.0f / release_;
        peak_ -= decay;
        if (bass > peak_) peak_ = bass;
        return clamp01(peak_);
    }
private:
    float gain_ = 4.0f;
    float release_ = 180.0f;
    float peak_ = 0;
};

// ---------- 3. New standard patterns ----------

class Rumble : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.7f,nullptr},
            {"smoothing","Smoothing",ParamType::FLOAT,0,0.99f,0.85f,nullptr},
        };
        static const PatternMeta m{
            "Rumble","pulse","pulse,game,controller","Low-freq random rumble like a game controller.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        if (!strcmp(id,"smoothing")) { smoothing_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        // Simple LFSR pseudo-random, smoothed for low-freq rumble feel.
        lfsr_ ^= lfsr_ << 13; lfsr_ ^= lfsr_ >> 17; lfsr_ ^= lfsr_ << 5;
        float raw = (float)(lfsr_ & 0xFFFF) / 65535.0f;
        smoothed_ = smoothing_ * smoothed_ + (1.0f - smoothing_) * raw;
        return clamp01(smoothed_ * intensity_);
    }
private:
    float intensity_ = 0.7f;
    float smoothing_ = 0.85f;
    uint32_t lfsr_ = 0xACE1u;
    float smoothed_ = 0.0f;
};

class Tap : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,100,5000,800,nullptr},
            {"attack_ms","Attack",ParamType::FLOAT,1,100,8,nullptr},
            {"decay_ms","Decay",ParamType::FLOAT,10,500,120,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Tap","pulse","pulse,sharp,click","Sharp tap with fast attack + exponential decay.",
            p,4,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"attack_ms")) { attack_ = v; return true; }
        if (!strcmp(id,"decay_ms"))  { decay_ = v;  return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = fmodf(ctx.tMs, period_);
        if (t < attack_) return intensity_ * (t / attack_);
        float elapsed = t - attack_;
        if (elapsed < decay_ * 5.0f) {
            return intensity_ * expf(-3.0f * elapsed / decay_);
        }
        return 0.0f;
    }
private:
    float period_ = 800.0f;
    float attack_ = 8.0f;
    float decay_ = 120.0f;
    float intensity_ = 1.0f;
};

class Ramp : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,100,5000,1000,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.8f,nullptr},
        };
        static const PatternMeta m{
            "Ramp","pulse","pulse,sawtooth,linear","Linear sawtooth ramp up, instant drop.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        return clamp01(intensity_ * ph);
    }
private:
    float period_ = 1000.0f;
    float intensity_ = 0.8f;
};

class Staccato : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"hits","Hits",ParamType::FLOAT,1,8,3,nullptr},
            {"gap_ms","Gap",ParamType::FLOAT,30,500,80,nullptr},
            {"hit_ms","Hit duration",ParamType::FLOAT,10,200,40,nullptr},
            {"pause_ms","Pause after burst",ParamType::FLOAT,200,3000,600,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Staccato","pulse","pulse,burst,rapid","Rapid-fire short bursts with pause.",
            p,5,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"hits"))     { hits_ = (int)v; return true; }
        if (!strcmp(id,"gap_ms"))   { gap_ = v;  return true; }
        if (!strcmp(id,"hit_ms"))   { hit_ = v;  return true; }
        if (!strcmp(id,"pause_ms")) { pause_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float burstLen = hits_ * hit_ + (hits_ - 1) * gap_;
        float totalPeriod = burstLen + pause_;
        float t = fmodf(ctx.tMs, totalPeriod);
        if (t >= burstLen) return 0.0f;
        // Which hit are we in?
        float slot = hit_ + gap_;
        int hitIdx = (int)(t / slot);
        float inSlot = fmodf(t, slot);
        if (hitIdx < hits_ && inSlot < hit_) {
            return intensity_;
        }
        return 0.0f;
    }
private:
    int   hits_ = 3;
    float gap_ = 80.0f;
    float hit_ = 40.0f;
    float pause_ = 600.0f;
    float intensity_ = 1.0f;
};

class Ocean : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.5f,nullptr},
            {"speed","Speed",ParamType::FLOAT,0.2f,3.0f,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Ocean","pulse","pulse,ambient,organic,calm","Layered sine waves like ocean surf.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        if (!strcmp(id,"speed"))     { speed_ = v;     return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * speed_;
        // Three layered waves at different frequencies for organic feel.
        float w1 = 0.5f + 0.5f * sinf(t * 0.0004f * 2.0f * (float)M_PI);
        float w2 = 0.5f + 0.5f * sinf(t * 0.00071f * 2.0f * (float)M_PI + 1.2f);
        float w3 = 0.5f + 0.5f * sinf(t * 0.00019f * 2.0f * (float)M_PI + 2.8f);
        float combined = w1 * 0.5f + w2 * 0.3f + w3 * 0.2f;
        return clamp01(intensity_ * combined);
    }
private:
    float intensity_ = 0.5f;
    float speed_ = 1.0f;
};

// ---------- 4. More audio-reactive patterns ----------

class SpectrumPulse : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"gain","Gain",ParamType::FLOAT,0,10,3.5f,nullptr},
            {"bass_weight","Bass Weight",ParamType::FLOAT,0,5,2.5f,nullptr},
        };
        static const PatternMeta m{
            "SpectrumPulse","music","reactive,music,spectrum","Weighted FFT spectrum mapped to intensity.",
            p,2,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"gain")) { gain_ = v; return true; }
        if (!strcmp(id,"bass_weight")) { bassW_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        float sum = 0;
        // Bass bands (0-3) weighted heavier for physical punch.
        for (int i = 0; i < 4; ++i)  sum += ctx.audio.mags[i] * bassW_;
        // Mid bands (4-11).
        for (int i = 4; i < 12; ++i) sum += ctx.audio.mags[i] * 1.0f;
        // High bands (12-31) lighter.
        for (int i = 12; i < 32; ++i) sum += ctx.audio.mags[i] * 0.3f;
        sum /= (4.0f * bassW_ + 8.0f + 20.0f * 0.3f);
        return clamp01(sum * gain_);
    }
private:
    float gain_ = 3.5f;
    float bassW_ = 2.5f;
};

class BeatSync : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"threshold","Threshold",ParamType::FLOAT,0,1,0.35f,nullptr},
            {"decay_ms","Decay",ParamType::FLOAT,30,500,100,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "BeatSync","music","reactive,music,beat","Fires sharp pulses on detected beats.",
            p,3,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"threshold"))  { threshold_ = v;  return true; }
        if (!strcmp(id,"decay_ms"))   { decay_ = v;      return true; }
        if (!strcmp(id,"intensity"))  { intensity_ = v;   return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        // Use onset flag from the audio analyzer, or fall back to RMS spike.
        bool beat = ctx.audio.onset || (ctx.audio.rms > threshold_ && ctx.audio.rms > lastRms_ * 1.5f);
        lastRms_ = ctx.audio.rms;
        if (beat) envelope_ = intensity_;
        // Exponential decay.
        float decayFactor = 1.0f / (decay_ * 0.001f);
        envelope_ -= envelope_ * decayFactor * 0.001f; // per-ms tick approx
        if (envelope_ < 0.001f) envelope_ = 0.0f;
        return clamp01(envelope_);
    }
private:
    float threshold_ = 0.35f;
    float decay_ = 100.0f;
    float intensity_ = 1.0f;
    float lastRms_ = 0.0f;
    float envelope_ = 0.0f;
};

// ---------- 4. More built-in pulse / alert / multi-channel patterns ----------

class Triangle : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,50,5000,1000,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.8f,nullptr},
        };
        static const PatternMeta m{
            "Triangle","pulse","pulse,linear","Linear ramp up and down.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        float tri = ph < 0.5f ? (ph * 2.0f) : (2.0f - ph * 2.0f);
        return clamp01(intensity_ * tri);
    }
private:
    float period_ = 1000.0f;
    float intensity_ = 0.8f;
};

class Throb : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.7f,nullptr},
        };
        static const PatternMeta m{
            "Throb","pulse","pulse,ambient,organic","Two layered sines (4 Hz x 0.7 Hz).",
            p,1,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float v = (0.5f + 0.5f * sinf(t * 4.0f * 2.0f * (float)M_PI)) *
                  (0.5f + 0.5f * sinf(t * 0.7f * 2.0f * (float)M_PI));
        return clamp01(intensity_ * v);
    }
private:
    float intensity_ = 0.7f;
};

class Click : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,50,5000,500,nullptr},
            {"width_ms","Width",ParamType::FLOAT,2,40,5,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Click","pulse","pulse,sharp,click","Ultra-short spike click.",
            p,3,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"width_ms"))  { width_ = v;  return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = fmodf(ctx.tMs, period_);
        return t < width_ ? intensity_ : 0.0f;
    }
private:
    float period_ = 500.0f;
    float width_ = 5.0f;
    float intensity_ = 1.0f;
};

class DoubleTap : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,400,4000,1500,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "DoubleTap","pulse","pulse,confirm","Tactile confirmation double buzz.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = fmodf(ctx.tMs, period_);
        if (t < 80.0f || (t > 160.0f && t < 240.0f)) return intensity_;
        return 0.0f;
    }
private:
    float period_ = 1500.0f;
    float intensity_ = 1.0f;
};

class SOS : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "SOS","alert","alert,morse","Morse S.O.S. beacon.",
            p,1,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float cycle = fmodf(ctx.tMs * 0.001f, 4.0f);
        auto on = [](float c, float a, float b) { return c >= a && c < b; };
        if (on(cycle,0.0f,0.1f) || on(cycle,0.2f,0.3f) || on(cycle,0.4f,0.5f)) return intensity_;
        if (on(cycle,0.8f,1.1f) || on(cycle,1.2f,1.5f) || on(cycle,1.6f,1.9f)) return intensity_;
        if (on(cycle,2.2f,2.3f) || on(cycle,2.4f,2.5f) || on(cycle,2.6f,2.7f)) return intensity_;
        return 0.0f;
    }
private:
    float intensity_ = 1.0f;
};

class EngineRev : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.85f,nullptr},
        };
        static const PatternMeta m{
            "EngineRev","alert","alert,accel","Frequency-modulated acceleration pulse.",
            p,1,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float sweep = fmodf(t, 2.0f);
        float v = 0.4f + 0.6f * sinf(t * (15.0f + sweep * 45.0f));
        return clamp01(intensity_ * (v < 0 ? -v : v));
    }
private:
    float intensity_ = 0.85f;
};

class Crescendo : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,200,5000,1800,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Crescendo","rhythm","rhythm,rise","Smooth intensity sweep to maximum.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        return clamp01(intensity_ * ph);
    }
private:
    float period_ = 1800.0f;
    float intensity_ = 1.0f;
};

class Lighthouse : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,500,8000,4200,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Lighthouse","ambient","ambient,sweep","Slow sweeping beam with sharp peak.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float ph = fmodf(ctx.tMs, period_) / period_;
        float s = sinf(ph * 2.0f * (float)M_PI);
        if (s < 0) s = 0;
        float peak = powf(s, 6.0f);
        return clamp01(intensity_ * peak);
    }
private:
    float period_ = 4200.0f;
    float intensity_ = 1.0f;
};

class AmbientHum : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.45f,nullptr},
        };
        static const PatternMeta m{
            "AmbientHum","ambient","ambient,gentle","Gentle low-intensity background pulse.",
            p,1,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        return clamp01(intensity_ * (0.3f + 0.15f * sinf(t * 12.0f)));
    }
private:
    float intensity_ = 0.45f;
};

class ModRumble : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.8f,nullptr},
        };
        static const PatternMeta m{
            "ModRumble","alert","alert,am","AM high-speed buzz.",
            p,1,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float env = 0.5f + 0.5f * sinf(t * 3.0f);
        float car = 0.5f + 0.5f * sinf(t * 60.0f);
        return clamp01(intensity_ * env * car);
    }
private:
    float intensity_ = 0.8f;
};

class ChaosWave : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.9f,nullptr},
            {"density","Density",ParamType::FLOAT,0.1f,1.0f,0.55f,nullptr},
        };
        static const PatternMeta m{
            "ChaosWave","pulse","pulse,noise","Semi-random tactile noise impulses.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        if (!strcmp(id,"density"))   { density_ = v;   return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        // Cheap hash of time for glittery impulses.
        uint32_t h = (uint32_t)(ctx.tMs * 15.0f);
        h ^= h << 13; h ^= h >> 17; h ^= h << 5;
        float n = (float)(h & 0xFFFF) / 65535.0f;
        float v = n * 2.0f - (1.0f - density_);
        if (v < 0) v = 0;
        return clamp01(intensity_ * v);
    }
private:
    float intensity_ = 0.9f;
    float density_ = 0.55f;
};

class Metronome : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"bpm","BPM",ParamType::FLOAT,40,240,60,nullptr},
            {"width_ms","Width",ParamType::FLOAT,5,80,40,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "Metronome","rhythm","rhythm,tempo","Precise BPM click.",
            p,3,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"bpm")) { bpm_ = v; return true; }
        if (!strcmp(id,"width_ms")) { width_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float period = 60000.0f / bpm_;
        float t = fmodf(ctx.tMs, period);
        return t < width_ ? intensity_ : 0.0f;
    }
private:
    float bpm_ = 60.0f;
    float width_ = 40.0f;
    float intensity_ = 1.0f;
};

class Cascade : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_ms","Period",ParamType::FLOAT,200,4000,1200,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.85f,nullptr},
        };
        static const PatternMeta m{
            "Cascade","rhythm","rhythm,multi,spatial","Phase-offset envelope across channels.",
            p,2,true,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_ms")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float phase = (float)ctx.channelIndex * 0.25f; // 90° steps for up to 4 ch
        float ph = fmodf(ctx.tMs / period_ + phase, 1.0f);
        float v = 0.5f + 0.5f * sinf(ph * 2.0f * (float)M_PI);
        return clamp01(intensity_ * v);
    }
private:
    float period_ = 1200.0f;
    float intensity_ = 0.85f;
};

class TrebleSpark : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"gain","Gain",ParamType::FLOAT,0,10,4.0f,nullptr},
            {"gate","Gate",ParamType::FLOAT,0,1,0.08f,nullptr},
        };
        static const PatternMeta m{
            "TrebleSpark","music","reactive,music,treble","High-band flutter from FFT.",
            p,2,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"gain")) { gain_ = v; return true; }
        if (!strcmp(id,"gate")) { gate_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        float sum = 0;
        for (int i = 16; i < 32; ++i) sum += ctx.audio.mags[i];
        float v = (sum / 16.0f) * gain_;
        if (v < gate_) return 0.0f;
        return clamp01(v);
    }
private:
    float gain_ = 4.0f;
    float gate_ = 0.08f;
};

class MidPresence : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"gain","Gain",ParamType::FLOAT,0,10,3.5f,nullptr},
            {"gate","Gate",ParamType::FLOAT,0,1,0.05f,nullptr},
        };
        static const PatternMeta m{
            "MidPresence","music","reactive,music,vocal","Mid-band presence / vocal follower.",
            p,2,false,true,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"gain")) { gain_ = v; return true; }
        if (!strcmp(id,"gate")) { gate_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.audio.valid) return 0.0f;
        float sum = 0;
        for (int i = 6; i < 16; ++i) sum += ctx.audio.mags[i];
        float v = (sum / 10.0f) * gain_;
        if (v < gate_) return 0.0f;
        return clamp01(v);
    }
private:
    float gain_ = 3.5f;
    float gate_ = 0.05f;
};

// ---------- Time-based evolving patterns ----------

class AcceleratingBuzz : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"cycle_s","Cycle (s)",ParamType::FLOAT,1,12,5,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "AcceleratingBuzz","time","time,accel","Buzz frequency accelerates over a cycle.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"cycle_s")) { cycle_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float mod = fmodf(t, cycle_);
        float v = 0.5f + 0.5f * sinf(t * (10.0f + mod * 20.0f));
        return clamp01(intensity_ * v);
    }
private:
    float cycle_ = 5.0f;
    float intensity_ = 1.0f;
};

class BouncingDecay : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"cycle_s","Cycle (s)",ParamType::FLOAT,1,10,4,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "BouncingDecay","time","time,bounce","Bounce gaps that decay like a dropped ball.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"cycle_s")) { cycle_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float c = fmodf(t, cycle_);
        float decay = 1.0f - (c / cycle_);
        float bounce = fmodf(c * (2.5f + c * 1.5f), 1.0f);
        return bounce < 0.25f ? clamp01(intensity_ * decay) : 0.0f;
    }
private:
    float cycle_ = 4.0f;
    float intensity_ = 1.0f;
};

class TimeSwell : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"period_s","Period (s)",ParamType::FLOAT,2,20,6,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,0.8f,nullptr},
        };
        static const PatternMeta m{
            "TimeSwell","time","time,ambient,swell","Slow breathing swell over a long window.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"period_s")) { period_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float v = sinf(t * ((float)M_PI / period_));
        if (v < 0) v = -v; // full-wave breathe
        return clamp01(intensity_ * v);
    }
private:
    float period_ = 6.0f;
    float intensity_ = 0.8f;
};

class LinearFade : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"fade_s","Fade (s)",ParamType::FLOAT,0.5f,10,3,nullptr},
            {"carrier_hz","Carrier Hz",ParamType::FLOAT,5,80,30,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "LinearFade","time","time,fade","Starts full and fades to zero each cycle.",
            p,3,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"fade_s")) { fade_ = v; return true; }
        if (!strcmp(id,"carrier_hz")) { carrier_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float env = 1.0f - fmodf(t, fade_) / fade_;
        if (env < 0) env = 0;
        float car = 0.5f + 0.5f * sinf(t * carrier_ * 2.0f * (float)M_PI);
        return clamp01(intensity_ * env * car);
    }
private:
    float fade_ = 3.0f;
    float carrier_ = 30.0f;
    float intensity_ = 1.0f;
};

class DeceleratingPulse : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"cycle_s","Cycle (s)",ParamType::FLOAT,1,10,4,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "DeceleratingPulse","time","time,decel","Pulse rate slows across each cycle.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"cycle_s")) { cycle_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float c = fmodf(t, cycle_);
        float rate = 1.0f + (3.0f * (1.0f - c / cycle_));
        return sinf(t * rate * 5.0f) > 0.5f ? intensity_ : 0.0f;
    }
private:
    float cycle_ = 4.0f;
    float intensity_ = 1.0f;
};

class DopplerSweep : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"cycle_s","Cycle (s)",ParamType::FLOAT,1,8,3,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "DopplerSweep","time","time,doppler","Passing-source freq + volume shift.",
            p,2,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"cycle_s")) { cycle_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float c = fmodf(t, cycle_) - cycle_ * 0.5f;
        float volume = 1.0f / (1.0f + c * c * 4.0f);
        float freq = 150.0f - c * 80.0f;
        float v = sinf(t * freq * 0.1f) * volume;
        if (v < 0) v = -v;
        return clamp01(intensity_ * v);
    }
private:
    float cycle_ = 3.0f;
    float intensity_ = 1.0f;
};

class FibonacciBeat : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"cycle_s","Cycle (s)",ParamType::FLOAT,2,12,5,nullptr},
            {"hit_s","Hit (s)",ParamType::FLOAT,0.02f,0.3f,0.1f,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "FibonacciBeat","time","time,rhythm,fibonacci","Hits spaced by Fibonacci intervals.",
            p,3,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"cycle_s")) { cycle_ = v; return true; }
        if (!strcmp(id,"hit_s")) { hit_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        // Relative marks at 0, 0.2, 0.5, 1.0, 2.1, 3.4 inside a 5s reference, scaled to cycle_.
        static const float marks[] = {0.0f, 0.2f, 0.5f, 1.0f, 2.1f, 3.4f};
        const float scale = cycle_ / 5.0f;
        float c = fmodf(ctx.tMs * 0.001f, cycle_);
        for (float m : marks) {
            float at = m * scale;
            if (c >= at && c < at + hit_) return intensity_;
        }
        return 0.0f;
    }
private:
    float cycle_ = 5.0f;
    float hit_ = 0.1f;
    float intensity_ = 1.0f;
};

class SawTremolo : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const ParamMeta p[] = {
            {"carrier_hz","Carrier Hz",ParamType::FLOAT,10,120,80,nullptr},
            {"mod_s","Mod period (s)",ParamType::FLOAT,0.2f,8,2,nullptr},
            {"intensity","Intensity",ParamType::FLOAT,0,1,1.0f,nullptr},
        };
        static const PatternMeta m{
            "SawTremolo","time","time,am,tremolo","Fast carrier AM'd by a slow saw.",
            p,3,false,false,
        };
        return m;
    }
    bool setParam(const char* id, float v) override {
        if (!strcmp(id,"carrier_hz")) { carrier_ = v; return true; }
        if (!strcmp(id,"mod_s")) { mod_ = v; return true; }
        if (!strcmp(id,"intensity")) { intensity_ = v; return true; }
        return false;
    }
    float sample(const PatternContext& ctx) override {
        float t = ctx.tMs * 0.001f;
        float car = 0.5f + 0.5f * sinf(t * carrier_ * 2.0f * (float)M_PI);
        float modulator = fmodf(t, mod_) / mod_;
        return clamp01(intensity_ * car * modulator);
    }
private:
    float carrier_ = 80.0f;
    float mod_ = 2.0f;
    float intensity_ = 1.0f;
};

// ---------- External (driven entirely by API push) ----------

class External : public IPattern {
public:
    const PatternMeta& meta() const override {
        static const PatternMeta m{
            "External","reactive","reactive,api","Plays values pushed via /ws external messages.",
            nullptr, 0, true, false,
        };
        return m;
    }
    float sample(const PatternContext& ctx) override {
        if (!ctx.externalValues) return 0.0f;
        return clamp01(ctx.externalValues[ctx.channelIndex]);
    }
};

// Singletons. Lifetime: program. Registered once.
Sine            gSine;
Pulse           gPulse;
Breath          gBreath;
Heartbeat       gHeartbeat;
Rumble          gRumble;
Tap             gTap;
Ramp            gRamp;
Staccato        gStaccato;
Ocean           gOcean;
EnvelopeFollow  gEnvelopeFollow;
BassPunch       gBassPunch;
SpectrumPulse   gSpectrumPulse;
BeatSync        gBeatSync;
Triangle        gTriangle;
Throb           gThrob;
Click           gClick;
DoubleTap       gDoubleTap;
SOS             gSOS;
EngineRev       gEngineRev;
Crescendo       gCrescendo;
Lighthouse      gLighthouse;
AmbientHum      gAmbientHum;
ModRumble       gModRumble;
ChaosWave       gChaosWave;
Metronome       gMetronome;
Cascade         gCascade;
TrebleSpark     gTrebleSpark;
MidPresence     gMidPresence;
AcceleratingBuzz gAcceleratingBuzz;
BouncingDecay   gBouncingDecay;
TimeSwell       gTimeSwell;
LinearFade      gLinearFade;
DeceleratingPulse gDeceleratingPulse;
DopplerSweep    gDopplerSweep;
FibonacciBeat   gFibonacciBeat;
SawTremolo      gSawTremolo;
External        gExternal;

} // anonymous

void registerAll(PatternRegistry& reg) {
    reg.registerPattern(&gSine);
    reg.registerPattern(&gPulse);
    reg.registerPattern(&gBreath);
    reg.registerPattern(&gHeartbeat);
    reg.registerPattern(&gRumble);
    reg.registerPattern(&gTap);
    reg.registerPattern(&gRamp);
    reg.registerPattern(&gStaccato);
    reg.registerPattern(&gOcean);
    reg.registerPattern(&gTriangle);
    reg.registerPattern(&gThrob);
    reg.registerPattern(&gClick);
    reg.registerPattern(&gDoubleTap);
    reg.registerPattern(&gSOS);
    reg.registerPattern(&gEngineRev);
    reg.registerPattern(&gCrescendo);
    reg.registerPattern(&gLighthouse);
    reg.registerPattern(&gAmbientHum);
    reg.registerPattern(&gModRumble);
    reg.registerPattern(&gChaosWave);
    reg.registerPattern(&gMetronome);
    reg.registerPattern(&gCascade);
    reg.registerPattern(&gAcceleratingBuzz);
    reg.registerPattern(&gBouncingDecay);
    reg.registerPattern(&gTimeSwell);
    reg.registerPattern(&gLinearFade);
    reg.registerPattern(&gDeceleratingPulse);
    reg.registerPattern(&gDopplerSweep);
    reg.registerPattern(&gFibonacciBeat);
    reg.registerPattern(&gSawTremolo);
    reg.registerPattern(&gEnvelopeFollow);
    reg.registerPattern(&gBassPunch);
    reg.registerPattern(&gSpectrumPulse);
    reg.registerPattern(&gBeatSync);
    reg.registerPattern(&gTrebleSpark);
    reg.registerPattern(&gMidPresence);
    reg.registerPattern(&gExternal);
}

void loadCustomPatterns(core::PatternRegistry& reg) {
    if (!LittleFS.exists("/custom_patterns.json")) {
        return;
    }
    File f = LittleFS.open("/custom_patterns.json", "r");
    if (!f) {
        log_e("Failed to open /custom_patterns.json");
        return;
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        log_e("Failed to parse /custom_patterns.json");
        return;
    }
    JsonArray arr = doc.as<JsonArray>();
    for (JsonVariant v : arr) {
        JsonObject obj = v.as<JsonObject>();
        std::string id = obj["id"] | "";
        std::string name = obj["name"] | "";
        std::string code = obj["code"] | "";
        if (!id.empty() && !code.empty()) {
            CustomPattern* cp = new CustomPattern(id, name, code);
            reg.registerCustomPattern(cp);
        }
    }
}

void saveCustomPatterns(const core::PatternRegistry& reg) {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for (auto* p : reg.all()) {
        if (strcmp(p->meta().category, "custom") == 0) {
            CustomPattern* cp = static_cast<CustomPattern*>(p);
            if (cp) {
                JsonObject obj = arr.add<JsonObject>();
                obj["id"] = cp->meta().id;
                obj["name"] = cp->getName();
                obj["code"] = cp->getCode();
            }
        }
    }
    File f = LittleFS.open("/custom_patterns.json", "w");
    if (!f) {
        log_e("Failed to open /custom_patterns.json for writing");
        return;
    }
    serializeJson(doc, f);
    f.close();
}

} // namespace haxel::patterns
