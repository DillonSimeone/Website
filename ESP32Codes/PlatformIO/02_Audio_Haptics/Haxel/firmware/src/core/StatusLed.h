#pragma once

#include <Arduino.h>

namespace haxel {

namespace core { class Engine; }

// StatusLed — onboard LED UX for WiFi connection status & haptic mirror feedback.
// Uses LEDC group 1 / timer 1 to avoid motor PWM collision (group 0 / timer 0).
class StatusLed {
public:
    StatusLed() = default;

    // Initialize LED on the given GPIO with LEDC channel (recommend channel 5 for C3).
    // Returns true on success.
    bool begin(uint8_t pin, uint8_t ledcChannel = 5);

    // Attach engine pointer for real-time haptic intensity mirroring.
    void attachEngine(core::Engine* engine) { engine_ = engine; }

    // Update the LED state — call from 10 Hz housekeeping tick.
    void tick();

    // Mode setters — switch LED pattern.
    void breathing();   // Slow fade in/out during STA connect (~1 s period, 30% brightness)
    void connected();   // Follows active haptic intensity (or solid 10% dim if idle)
    void apMode();      // Fast flash 4 Hz square — captive portal active

private:
    enum class Mode : uint8_t { OFF, BREATHING, CONNECTED, AP_FLASH };

    uint8_t pin_        = 255;
    uint8_t channel_    = 5;
    Mode    mode_       = Mode::OFF;
    uint32_t tickCount_ = 0;
    core::Engine* engine_ = nullptr;
    float smoothIntensity_ = 0.0f;

    void setDuty_(float duty01);
};

} // namespace haxel
