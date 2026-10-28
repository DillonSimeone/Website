#include "MotionAnalyzer.h"
#include <cmath>

namespace {
constexpr float kGyroMaxRad = 8.0f;
constexpr float kAccelSwingMax = 12.0f;
constexpr float kSpeedSmoothAlpha = 0.35f;
constexpr float kRmsSmoothAlpha = 0.25f;
} // namespace

void MotionAnalyzer::update(const MotionSample& sample, float dt) {
    (void)dt;

    const float gyroMag = sqrtf(
        sample.gyroX * sample.gyroX +
        sample.gyroY * sample.gyroY +
        sample.gyroZ * sample.gyroZ);
    const float accelMag = sqrtf(
        sample.accelX * sample.accelX +
        sample.accelY * sample.accelY +
        sample.accelZ * sample.accelZ) - 9.81f;

    frame_.magnitude = gyroMag + fabsf(accelMag);

    const float rawSpeedX = fabsf(sample.gyroZ) * 0.65f + fabsf(sample.accelX) * 0.35f;
    const float rawSpeedY = fabsf(sample.gyroX) * 0.65f + fabsf(sample.accelY) * 0.35f;

    smoothSpeedX_ += (rawSpeedX - smoothSpeedX_) * kSpeedSmoothAlpha;
    smoothSpeedY_ += (rawSpeedY - smoothSpeedY_) * kSpeedSmoothAlpha;

    frame_.speedX = constrain(smoothSpeedX_ / kGyroMaxRad, 0.0f, 1.0f);
    frame_.speedY = constrain(smoothSpeedY_ / kGyroMaxRad, 0.0f, 1.0f);

    const float instantRms = constrain(frame_.magnitude / (kGyroMaxRad + kAccelSwingMax), 0.0f, 1.0f);
    rmsSmooth_ += (instantRms - rmsSmooth_) * kRmsSmoothAlpha;
    frame_.rms = rmsSmooth_;

    const float speedMag = sqrtf(frame_.speedX * frame_.speedX + frame_.speedY * frame_.speedY);
    frame_.onset = constrain(speedMag - prevSpeedMag_, 0.0f, 1.0f);
    prevSpeedMag_ = speedMag;

    fillBins(frame_.speedX, frame_.speedY);
}

float MotionAnalyzer::bandActivation(float speedNorm, int bandIndex) {
    const float bandWidth = 1.0f / static_cast<float>(MOTION_AXIS_BINS);
    const float center = (static_cast<float>(bandIndex) + 0.5f) * bandWidth;
    const float dist = fabsf(speedNorm - center) / bandWidth;
    return constrain(1.0f - dist, 0.0f, 1.0f);
}

void MotionAnalyzer::fillBins(float speedXNorm, float speedYNorm) {
    for (int i = 0; i < MOTION_AXIS_BINS; ++i) {
        frame_.bins[i] = bandActivation(speedXNorm, i);
        frame_.bins[i + MOTION_AXIS_BINS] = bandActivation(speedYNorm, i);
    }
}
