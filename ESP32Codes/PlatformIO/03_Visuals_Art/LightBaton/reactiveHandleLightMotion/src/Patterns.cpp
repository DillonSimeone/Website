#include "Patterns.h"
#include <cmath>
#include <cstring>

namespace {
float clamp01(float v) {
    if (v < 0.0f) return 0.0f;
    if (v > 1.0f) return 1.0f;
    return v;
}

float phase01(uint32_t tMs, float periodMs, float speed) {
    if (periodMs <= 1.0f) return 0.0f;
    const float p = periodMs / speed;
    return fmodf(static_cast<float>(tMs), p) / p;
}

float samplePulse(const PatternContext& ctx) {
    const float ph = phase01(ctx.tMs, 900.0f, ctx.speed);
    return (ph < 0.18f) ? 1.0f : 0.0f;
}

float sampleHeartbeat(const PatternContext& ctx) {
    const float ph = phase01(ctx.tMs, 1500.0f, ctx.speed);
    if (ph < 0.07f || (ph > 0.20f && ph < 0.27f)) return 1.0f;
    return 0.0f;
}

float sampleGallop(const PatternContext& ctx) {
    const float ph = phase01(ctx.tMs, 600.0f, ctx.speed);
    if (ph < 0.13f || (ph > 0.27f && ph < 0.40f)) return 1.0f;
    return 0.0f;
}

float sampleShimmer(const PatternContext& ctx) {
    const float wave = sinf(static_cast<float>(ctx.tMs) * 0.015f * ctx.speed);
    return clamp01(0.55f + wave * 0.45f);
}

float sampleRumble(const PatternContext& ctx) {
    const float wave = sinf(static_cast<float>(ctx.tMs) * 0.006f * ctx.speed);
    return clamp01(0.35f + wave * 0.25f);
}

float sampleSawtooth(const PatternContext& ctx) {
    const float ph = phase01(ctx.tMs, 800.0f, ctx.speed);
    return ph;
}

float sampleSpinWave(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float spin = ctx.motion->speedX;
    const float ph = phase01(ctx.tMs, 500.0f, ctx.speed);
    return clamp01(spin * (0.35f + 0.65f * (ph < 0.5f ? ph * 2.0f : (1.0f - ph) * 2.0f)));
}

float sampleSwingKick(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    return clamp01(ctx.motion->onset * 1.4f);
}

float sampleDrift(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float wave = sinf(static_cast<float>(ctx.tMs) * 0.003f * ctx.speed);
    return clamp01(ctx.motion->speedY * 0.5f + wave * 0.2f);
}

float sampleFlicker(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float gate = ctx.motion->speedY;
    const float flick = fmodf(static_cast<float>(ctx.tMs) * 0.04f * ctx.speed, 1.0f) > 0.45f ? 1.0f : 0.0f;
    return clamp01(gate * flick);
}

float sampleSpeedFollow(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    return clamp01(ctx.motion->rms * 1.2f);
}

float sampleAxisPulse(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float dominant = fmaxf(ctx.motion->speedX, ctx.motion->speedY);
    const float ph = phase01(ctx.tMs, 700.0f, ctx.speed);
    return clamp01(dominant * (ph < 0.25f ? 1.0f : 0.0f));
}

float sampleSpinSync(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float spin = ctx.motion->speedX;
    const float wave = sinf(static_cast<float>(ctx.tMs) * 0.012f * ctx.speed);
    return clamp01(spin * (0.4f + 0.6f * ((wave + 1.0f) * 0.5f)));
}

float sampleSwingBeat(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float beat = ctx.motion->onset;
    const float ph = phase01(ctx.tMs, 450.0f, ctx.speed);
    return clamp01(beat + (ph < 0.12f ? ctx.motion->rms * 0.5f : 0.0f));
}

float sampleDualAxis(const PatternContext& ctx) {
    if (!ctx.motion) return 0.0f;
    const float mix = (ctx.motion->speedX * 0.55f) + (ctx.motion->speedY * 0.45f);
    const float ph = phase01(ctx.tMs, 650.0f, ctx.speed);
    return clamp01(mix * (0.25f + 0.75f * (ph < 0.35f ? 1.0f : 0.0f)));
}

float sampleEnergyCharge(const PatternContext& ctx) {
    return clamp01(ctx.energyLevel);
}

const PatternInfo kPatterns[] = {
    {"Pulse", "Pulse", false, samplePulse},
    {"Heartbeat", "Heartbeat", false, sampleHeartbeat},
    {"Gallop", "Gallop", false, sampleGallop},
    {"Shimmer", "Shimmer", false, sampleShimmer},
    {"Rumble", "Rumble", false, sampleRumble},
    {"Sawtooth", "Sawtooth", false, sampleSawtooth},
    {"SpinWave", "Spin Wave", true, sampleSpinWave},
    {"SwingKick", "Swing Kick", true, sampleSwingKick},
    {"Drift", "Drift", true, sampleDrift},
    {"Flicker", "Flicker", true, sampleFlicker},
    {"SpeedFollow", "Speed Follow", true, sampleSpeedFollow},
    {"AxisPulse", "Axis Pulse", true, sampleAxisPulse},
    {"SpinSync", "Spin Sync", true, sampleSpinSync},
    {"SwingBeat", "Swing Beat", true, sampleSwingBeat},
    {"DualAxis", "Dual Axis", true, sampleDualAxis},
    {"EnergyCharge", "Energy Charge", true, sampleEnergyCharge},
};
} // namespace

const PatternInfo* findPattern(const char* id) {
    if (!id || !id[0]) return nullptr;
    for (const auto& p : kPatterns) {
        if (strcmp(p.id, id) == 0) return &p;
    }
    return nullptr;
}

const PatternInfo* const* allPatterns(size_t& count) {
    count = sizeof(kPatterns) / sizeof(kPatterns[0]);
    return reinterpret_cast<const PatternInfo* const*>(kPatterns);
}

bool patternUsesMotion(const char* id) {
    const PatternInfo* p = findPattern(id);
    return p && p->usesMotion;
}
