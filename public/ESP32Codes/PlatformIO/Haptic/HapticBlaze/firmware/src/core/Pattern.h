#pragma once

#include <Arduino.h>

namespace hapticblaze::core {

struct AudioFrame {
    bool   valid = false;
    float  rms = 0.0f;
    float  peakDb = -120.0f;
    bool   onset = false;
    float  mags[32] = {0};  // 32-band log-spaced spectrum, 0..1 normalized
};

struct PatternContext {
    float  tMs = 0.0f;
    float  intensityMaster = 1.0f;
    uint8_t channelIndex = 0;
    AudioFrame audio;
    const float* externalValues = nullptr; // 8-slot array, see Engine::pushExternal
};

enum class ParamType : uint8_t { FLOAT, INT, ENUM, BOOL, STRING };

struct ParamMeta {
    const char* id;
    const char* label;
    ParamType   type;
    float       minV;
    float       maxV;
    float       defaultV;
    const char* enumCsv; // for ParamType::ENUM
};

struct PatternMeta {
    const char* id;
    const char* category;
    const char* tags;
    const char* description;
    const ParamMeta* params;
    uint8_t     paramCount;
    bool        multiChannel;
    bool        usesAudio;
};

class IPattern {
public:
    virtual ~IPattern() = default;
    virtual const PatternMeta& meta() const = 0;
    virtual float sample(const PatternContext& ctx) = 0;

    // Mutate one parameter by id. Returns false if unknown. Patterns are
    // free to ignore values outside [min, max]; out-of-range is not a fault.
    virtual bool setParam(const char* id, float v) { (void)id; (void)v; return false; }

    // Convenience views.
    const char* id() const { return meta().id; }
    bool usesAudio() const { return meta().usesAudio; }
};

} // namespace hapticblaze::core
