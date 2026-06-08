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
        // Lub at 0..80ms, dub at 110..170ms, silence rest.
        if (t < 80) {
            float ph = t / 80.0f;
            return intensity_ * sinf(ph * (float)M_PI);
        } else if (t > 110 && t < 170) {
            float ph = (t - 110) / 60.0f;
            return intensity_ * 0.8f * sinf(ph * (float)M_PI);
        }
        return 0.0f;
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

// ---------- 5. External (driven entirely by API push) ----------

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
    reg.registerPattern(&gEnvelopeFollow);
    reg.registerPattern(&gBassPunch);
    reg.registerPattern(&gSpectrumPulse);
    reg.registerPattern(&gBeatSync);
    reg.registerPattern(&gExternal);
}

} // namespace haxel::patterns
