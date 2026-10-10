#pragma once

#include <Arduino.h>
#include "MotionAnalyzer.h"

struct PatternContext {
    uint32_t tMs = 0;
    float intensity = 1.0f;
    float speed = 1.0f;
    float startupFloor = 0.0f;
    const MotionFrame* motion = nullptr;
    float energyLevel = 0.0f;
};

struct PatternInfo {
    const char* id;
    const char* name;
    bool usesMotion;
    float (*sample)(const PatternContext& ctx);
};

const PatternInfo* findPattern(const char* id);
const PatternInfo* const* allPatterns(size_t& count);
bool patternUsesMotion(const char* id);
