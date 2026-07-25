#include "PatternEngine.h"
#include <cmath>
#include <cstring>

bool PatternEngine::usesMotionRouting() const {
    return patternUsesMotion(state_.patternId);
}

float PatternEngine::evaluateBinRouting(const MotionFrame& motion, const PatternContext& ctx) const {
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
        float vol = (sum / static_cast<float>(len)) * (motion.rms * 1.35f + 0.05f);

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

    PatternContext ctx;
    ctx.tMs = tMs;
    ctx.intensity = state_.intensity;
    ctx.speed = state_.speed;
    ctx.startupFloor = state_.startupFloor;
    ctx.motion = &motion;
    ctx.energyLevel = energyLevel;

    float v = 0.0f;
    if (usesMotionRouting()) {
        v = evaluateBinRouting(motion, ctx);
        if (v < 0.01f) {
            v = evaluateDirectPattern(ctx);
        }
    } else {
        v = evaluateDirectPattern(ctx);
        if (v < 0.05f && energyLevel > 0.05f) {
            v = energyLevel;
        }
    }

    v *= state_.intensity;
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;

    if (v > 0.001f && state_.startupFloor > 0.0f) {
        v = state_.startupFloor + v * (1.0f - state_.startupFloor);
    }

    lastMotorDuty_ = v;
    return v;
}
