#include "LedcAllocator.h"
#include <Arduino.h>

namespace hapticblaze::hal {

#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(CONFIG_IDF_TARGET_ESP32H2)
static constexpr int kMaxLedcChannels = 6;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32S2)
static constexpr int kMaxLedcChannels = 8;
#else
static constexpr int kMaxLedcChannels = 16;
#endif

LedcAllocator& LedcAllocator::instance() {
    static LedcAllocator a;
    return a;
}

int8_t LedcAllocator::allocate(int8_t pin, uint32_t hz, uint8_t bits) {
    if (pin < 0) return -1;
    for (int8_t i = 0; i < kMaxLedcChannels; ++i) {
        if (slots_[i].pin == -1) {
            ledcSetup(i, hz, bits);
            ledcAttachPin((uint8_t)pin, i);
            slots_[i].pin = pin;
            slots_[i].bits = bits;
            ledcWrite(i, 0);
            return i;
        }
    }
    log_e("LEDC: out of channels (pin %d)", pin);
    return -1;
}

void LedcAllocator::release(int8_t pin) {
    if (pin < 0) return;
    for (int8_t i = 0; i < kMaxLedcChannels; ++i) {
        if (slots_[i].pin == pin) {
            ledcDetachPin((uint8_t)pin);
            slots_[i] = {};
            return;
        }
    }
}

void LedcAllocator::releaseAll() {
    for (int8_t i = 0; i < kMaxLedcChannels; ++i) {
        if (slots_[i].pin != -1) {
            ledcDetachPin((uint8_t)slots_[i].pin);
            slots_[i] = {};
        }
    }
}

void LedcAllocator::write(int8_t pin, float duty01) {
    if (pin < 0) return;
    if (duty01 < 0) duty01 = 0;
    if (duty01 > 1) duty01 = 1;
    for (int8_t i = 0; i < kMaxLedcChannels; ++i) {
        if (slots_[i].pin == pin) {
            uint32_t maxDuty = (1u << slots_[i].bits) - 1u;
            ledcWrite(i, (uint32_t)(duty01 * maxDuty));
            return;
        }
    }
}

} // namespace hapticblaze::hal
