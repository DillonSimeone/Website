#include "LedcAllocator.h"
#include <Arduino.h>

#if !defined(ESP_ARDUINO_VERSION) || ESP_ARDUINO_VERSION < ESP_ARDUINO_VERSION_VAL(3, 0, 0)
static inline bool ledcAttachSlot(int8_t slot, uint8_t pin, uint32_t hz, uint8_t bits) {
    ledcSetup((uint8_t)slot, hz, bits);
    ledcAttachPin(pin, (uint8_t)slot);
    return true;
}
static inline void ledcDetach(uint8_t pin) {
    ledcDetachPin(pin);
}
#endif


namespace haxel::hal {

LedcAllocator& LedcAllocator::instance() {
    static LedcAllocator a;
    return a;
}

int8_t LedcAllocator::allocate(int8_t pin, uint32_t hz, uint8_t bits) {
    if (pin < 0) return -1;
    for (int8_t i = 0; i < 16; ++i) {
        if (slots_[i].pin == pin) {
            return i;
        }
    }
    for (int8_t i = 0; i < 16; ++i) {
        if (slots_[i].pin == -1) {
#if !defined(ESP_ARDUINO_VERSION) || ESP_ARDUINO_VERSION < ESP_ARDUINO_VERSION_VAL(3, 0, 0)
            if (ledcAttachSlot(i, (uint8_t)pin, hz, bits)) {
#else
            if (ledcAttach((uint8_t)pin, hz, bits)) {
#endif
                slots_[i].pin = pin;
                slots_[i].bits = bits;
                #if !defined(ESP_ARDUINO_VERSION) || ESP_ARDUINO_VERSION < ESP_ARDUINO_VERSION_VAL(3, 0, 0)
                ledcWrite(i, 0);
#else
                ledcWrite((uint8_t)pin, 0);
#endif
                return i;
            } else {
                log_e("LEDC: ledcAttach failed for pin %d", pin);
                return -1;
            }
        }
    }
    log_e("LEDC: out of slots (pin %d)", pin);
    return -1;
}

void LedcAllocator::release(int8_t pin) {
    if (pin < 0) return;
    for (int8_t i = 0; i < 16; ++i) {
        if (slots_[i].pin == pin) {
            ledcDetach((uint8_t)pin);
            slots_[i] = {};
            return;
        }
    }
}

void LedcAllocator::releaseAll() {
    for (int8_t i = 0; i < 16; ++i) {
        if (slots_[i].pin != -1) {
            ledcDetach((uint8_t)slots_[i].pin);
            slots_[i] = {};
        }
    }
}

void LedcAllocator::write(int8_t pin, float duty01) {
    if (pin < 0) return;
    if (duty01 < 0) duty01 = 0;
    if (duty01 > 1) duty01 = 1;
    for (int8_t i = 0; i < 16; ++i) {
        if (slots_[i].pin == pin) {
            uint32_t maxDuty = (1u << slots_[i].bits) - 1u;
#if !defined(ESP_ARDUINO_VERSION) || ESP_ARDUINO_VERSION < ESP_ARDUINO_VERSION_VAL(3, 0, 0)
            ledcWrite((uint8_t)i, (uint32_t)(duty01 * maxDuty));
#else
            ledcWrite((uint8_t)pin, (uint32_t)(duty01 * maxDuty));
#endif
            return;
        }
    }
}

} // namespace haxel::hal
