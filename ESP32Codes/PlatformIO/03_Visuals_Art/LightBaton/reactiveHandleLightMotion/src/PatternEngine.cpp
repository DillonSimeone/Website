#include "PatternEngine.h"
#include <cmath>
#include <cstring>

bool PatternEngine::usesMotionRouting() const {
    return patternUsesMotion(state_.patternId);
}

float PatternEngine::evaluateBinRouting(const MotionFrame& motion, const PatternContext& ctx) const {
    // If there is negligible motion RMS, produce 0 output
    if (motion.rms < 0.015f) return 0.0f;

    float maxAmp = 0.0f;
    const int numBins = constrain(state_.numBins, 1, kMaxBins);

    for (int i = 0; i < numBins; ++i) {
        const int startIdx = (i == 0) ? 0 : state_.dividers[i - 1];
        const int endIdx = (i == numBins - 1) ? MOTION_BIN_COUNT : state_.dividers[i];
        int len = endIdx - startIdx;
        if (len < 1) len = 1;

        float sum = 0.0f;
        for (int b = startIdx; b < endIdx && b < MOTION_BIN_COUNT; ++b) {
            sum += motion.bins[b];
        }
        // Purely motion-driven volume without static baseline offset
        float vol = (sum / static_cast<float>(len)) * (motion.rms * 1.4f);

        const char* patId = state_.binPatterns[i];
        if (!patId || strcmp(patId, "none") == 0 || patId[0] == '\0') {
            continue;
        }

        const PatternInfo* binPat = findPattern(patId);
        if (!binPat) continue;

        const float out = vol * binPat->sample(ctx);
        if (out > maxAmp) maxAmp = out;
    }

    return maxAmp;
}

float PatternEngine::evaluateDirectPattern(const PatternContext& ctx) const {
    const PatternInfo* pattern = findPattern(state_.patternId);
    if (!pattern) return 0.0f;
    return pattern->sample(ctx);
}

float PatternEngine::evaluateMotor(const MotionFrame& motion, float energyLevel, uint32_t tMs) {
    if (!state_.on || state_.mute) {
        lastMotorDuty_ = 0.0f;
        return 0.0f;
    }

    // Motion deadband: If device is at rest and no energy accumulated, motor is completely off
    if (motion.rms < 0.015f && motion.magnitude < 0.3f && energyLevel < 0.02f) {
        lastMotorDuty_ = 0.0f;
        return 0.0f;
    }

    // Scale energy so 3/4 (75%) LED fill reaches 100% (1.0) PWM duty
    const float energyScaled = constrain(energyLevel / 0.75f, 0.0f, 1.0f);

    PatternContext ctx;
    ctx.tMs = tMs;
    ctx.intensity = state_.intensity;
    ctx.speed = state_.speed;
    ctx.startupFloor = state_.startupFloor;
    ctx.motion = &motion;
    ctx.energyLevel = energyScaled;

    float v = 0.0f;
    if (usesMotionRouting()) {
        v = evaluateBinRouting(motion, ctx);
        // Energy charge drives motor PWM up to 100% in sync with the LEDs
        if (energyScaled > v) {
            v = energyScaled;
        }
    } else {
        v = evaluateDirectPattern(ctx);
        if (v < 0.05f && energyScaled > 0.05f) {
            v = energyScaled;
        }
    }

    v *= state_.intensity;
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;

    // Apply startup floor only if there is intentional output (above 5%)
    if (v >= 0.05f && state_.startupFloor > 0.0f) {
        v = state_.startupFloor + v * (1.0f - state_.startupFloor);
    } else if (v < 0.05f) {
        v = 0.0f;
    }

    if (v > 1.0f) v = 1.0f;

    lastMotorDuty_ = v;
    return v;
}
