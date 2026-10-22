#include "StatusLed.h"
#include "Engine.h"
#include <esp32-hal-ledc.h>
#include <math.h>

namespace haxel {

static constexpr uint32_t kLedPwmHz   = 5000;
static constexpr uint8_t  kLedPwmBits = 8;

bool StatusLed::begin(uint8_t pin, uint8_t ledcChannel) {
    pin_     = pin;
    channel_ = ledcChannel;

    // Arduino-ESP32 3.x API: attach pin directly
    ledcAttach(pin_, kLedPwmHz, kLedPwmBits);

    mode_ = Mode::OFF;
    setDuty_(0.0f);
    log_i("StatusLed: initialized on GPIO %u", pin_);
    return true;
}

void StatusLed::tick() {
    ++tickCount_;

    switch (mode_) {
        case Mode::OFF:
            setDuty_(0.0f);
            break;

        case Mode::BREATHING: {
            // ~1 s period at 10 Hz tick = 10 ticks/cycle; sine wave, 30% peak brightness.
            float phase = (tickCount_ % 10) / 10.0f * 2.0f * PI;
            float duty  = 0.15f + 0.15f * sinf(phase);  // 0..0.3 range
            setDuty_(duty);
            break;
        }

        case Mode::CONNECTED: {
            float target = 0.0f;
            if (engine_) {
                core::StagedState s;
                engine_->copyState(s);
                if (s.on && !s.mute) {
                    for (uint8_t i = 0; i < s.channelCount; ++i) {
                        float val = engine_->getPatternValue(i);
                        if (val > target) target = val;
                    }
                }
            }
            if (target > smoothIntensity_) {
                smoothIntensity_ += (target - smoothIntensity_) * 0.45f;
            } else {
                smoothIntensity_ += (target - smoothIntensity_) * 0.20f;
            }
            if (smoothIntensity_ < 0.002f) smoothIntensity_ = 0.0f;

            // When active, flash from 10% base duty up to 100% full brightness in sync with haptics
            float duty = 0.10f + 0.90f * smoothIntensity_;
            setDuty_(duty);
            break;
        }

        case Mode::AP_FLASH: {
            // 4 Hz square wave at 10 Hz tick: 2.5 ticks high, 2.5 ticks low → use bit 1 of tick/2
            bool on = ((tickCount_ / 2) & 1) == 0;
            setDuty_(on ? 0.5f : 0.0f);
            break;
        }
    }
}

void StatusLed::breathing() {
    mode_ = Mode::BREATHING;
    tickCount_ = 0;
}

void StatusLed::connected() {
    mode_ = Mode::CONNECTED;
    setDuty_(0.10f);
}

void StatusLed::apMode() {
    mode_ = Mode::AP_FLASH;
    tickCount_ = 0;
}

void StatusLed::setDuty_(float duty01) {
    if (duty01 < 0.0f) duty01 = 0.0f;
    if (duty01 > 1.0f) duty01 = 1.0f;
    uint32_t val = (uint32_t)(duty01 * ((1 << kLedPwmBits) - 1));
    ledcWrite(pin_, val);
}

} // namespace haxel
