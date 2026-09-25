#pragma once

#include <Arduino.h>
#include "MpuSensor.h"

static constexpr int MOTION_BIN_COUNT = 32;
static constexpr int MOTION_AXIS_BINS = 16;

struct MotionFrame {
    float speedX = 0.0f;
    float speedY = 0.0f;
    float magnitude = 0.0f;
    float rms = 0.0f;
    float onset = 0.0f;
    float bins[MOTION_BIN_COUNT] = {};
};

class MotionAnalyzer {
public:
    void update(const MotionSample& sample, float dt);

    const MotionFrame& frame() const { return frame_; }

    float motionMagnitude() const { return frame_.magnitude; }

private:
    float smoothSpeedX_ = 0.0f;
    float smoothSpeedY_ = 0.0f;
    float prevSpeedMag_ = 0.0f;
    float rmsSmooth_ = 0.0f;
    MotionFrame frame_;

    static float bandActivation(float speedNorm, int bandIndex);
    void fillBins(float speedXNorm, float speedYNorm);
};
