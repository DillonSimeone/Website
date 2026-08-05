#pragma once

#include <Arduino.h>
#include "MotionAnalyzer.h"
#include "Patterns.h"

static constexpr int kMaxBins = 8;
static constexpr int kMaxDividers = kMaxBins - 1;

struct DeviceState {
    bool on = true;
    bool mute = false;
    float intensity = 0.85f;
    float speed = 1.0f;
    float startupFloor = 0.15f;
    char patternId[24] = "DualAxis";
    int numBins = 4;
    int dividers[kMaxDividers] = {8, 16, 24};
    char binPatterns[kMaxBins][24] = {"Heartbeat", "Gallop", "Shimmer", "SwingKick"};
    float chargeRate = 0.1f;
    float decayRate = 0.6f;
    char deviceName[24] = "LightBaton";
};

class PatternEngine {
public:
    void setState(const DeviceState& state) { state_ = state; }
    const DeviceState& state() const { return state_; }
    DeviceState& mutableState() { return state_; }

    float evaluateMotor(const MotionFrame& motion, float energyLevel, uint32_t tMs);
    float lastMotorDuty() const { return lastMotorDuty_; }
    bool usesMotionRouting() const;

private:
    DeviceState state_;
    float lastMotorDuty_ = 0.0f;

    float evaluateBinRouting(const MotionFrame& motion, const PatternContext& ctx) const;
    float evaluateDirectPattern(const PatternContext& ctx) const;
};
