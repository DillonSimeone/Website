#pragma once

#include <Arduino.h>

namespace haxel {

// StatusLed — onboard LED UX for WiFi connection status.
// Uses LEDC group 1 / timer 1 to avoid motor PWM collision (group 0 / timer 0).
// Patterns: breathing (STA connect), solid dim (connected), fast flash (AP mode).
class StatusLed {
public:
    StatusLed() = default;

    // Initialize LED on the given GPIO with LEDC channel (recommend channel 5 for C3).
    // Returns true on success.
    bool begin(uint8_t pin, uint8_t ledcChannel = 5);

    // Update the LED state — call from 10 Hz housekeeping tick.
    void tick();

    // Mode setters — switch LED pattern.
    void breathing();   // Slow fade in/out during STA connect (~1 s period, 30% brightness)
    void connected();   // Solid dim (10% duty) — idle, connected
    void apMode();      // Fast flash 4 Hz square — captive portal active

private:
    enum class Mode : uint8_t { OFF, BREATHING, CONNECTED, AP_FLASH };

    uint8_t pin_        = 255;
    uint8_t channel_    = 5;
    Mode    mode_       = Mode::OFF;
    uint32_t tickCount_ = 0;

    void setDuty_(float duty01);
};

} // namespace haxel
