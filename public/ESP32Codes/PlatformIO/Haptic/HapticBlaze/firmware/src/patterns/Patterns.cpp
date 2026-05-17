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

namespace hapticblaze::patterns {
using namespace hapticblaze::core;

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

// ---------- 3. External (driven entirely by API push) ----------

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
EnvelopeFollow  gEnvelopeFollow;
BassPunch       gBassPunch;
External        gExternal;

} // anonymous

void registerAll(PatternRegistry& reg) {
    reg.registerPattern(&gSine);
    reg.registerPattern(&gPulse);
    reg.registerPattern(&gBreath);
    reg.registerPattern(&gHeartbeat);
    reg.registerPattern(&gEnvelopeFollow);
    reg.registerPattern(&gBassPunch);
    reg.registerPattern(&gExternal);
    // The remaining 34+ built-ins from PATTERN_LIBRARY.md live in
    // src/patterns/Patterns_*.cpp and register themselves in this same call —
    // see ROADMAP.md v0.2 / v0.4 / v0.6 for the rollout.
}

} // namespace hapticblaze::patterns
