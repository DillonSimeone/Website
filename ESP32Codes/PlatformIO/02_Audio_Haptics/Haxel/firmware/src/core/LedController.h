#pragma once

#include <Arduino.h>
#include "Config.h"
#include "Engine.h"

namespace haxel::core {

class LedController {
public:
    static LedController& instance();

    bool begin(Config* config, Engine* engine);
    void end();
    void tick();

    bool enabled() const { return enabled_; }

private:
    LedController() = default;
    ~LedController() = default;

    Config* config_ = nullptr;
    Engine* engine_ = nullptr;
    bool enabled_ = false;
    int8_t pin_ = -1;
    uint16_t count_ = 0;

    void* leds_ = nullptr; // CRGB array
    IPattern* lastPattern_ = nullptr;
    uint8_t r_ = 255;
    uint8_t g_ = 106;
    uint8_t b_ = 61; // Default accent color: #ff6a3d

    // Smoothed haptic envelope driving LED fade in/out.
    float smoothIntensity_ = 0.0f;
    static constexpr float kAttack  = 0.45f; // ~immediate punch with motor
    static constexpr float kRelease = 0.12f; // visible fade-out trail
};

} // namespace haxel::core
