#include "DRV8833Driver.h"
#include "LedcAllocator.h"
#include "PinSanity.h"
#include <Arduino.h>

namespace haxel::hal {

DriverCaps DRV8833Driver::capabilities() const {
    return DriverCaps{
        2, true, true, false, false,
        50000, 0.05f, 1.0f,
    };
}

bool DRV8833Driver::begin(const DriverConfig& cfg) {
    cfg_ = cfg;
    PinIssue issue{};
    if (!validate(cfg_, &issue)) {
        log_e("DRV8833 pin sanity failed: pin=%d %s", issue.pin,
              issue.message ? issue.message : "");
        return false;
    }
    auto& alloc = LedcAllocator::instance();
    // AIN1, AIN2, BIN1, BIN2 — all PWM.
    for (int i = 0; i < 4; ++i) {
        if (cfg_.pins[i] < 0) return false;
        if (alloc.allocate(cfg_.pins[i], cfg_.pwmHz ? cfg_.pwmHz : 30000, cfg_.pwmBits) < 0) {
            return false;
        }
    }
    if (cfg_.pins[4] >= 0) { pinMode(cfg_.pins[4], OUTPUT); digitalWrite(cfg_.pins[4], HIGH); }
    slowDecay_ = (cfg_.flags & 0x2) == 0; // flag bit1 = fast decay
    allOff();
    ready_ = true;
    return true;
}

void DRV8833Driver::end() {
    if (!ready_) return;
    allOff();
    auto& alloc = LedcAllocator::instance();
    for (int i = 0; i < 4; ++i) alloc.release(cfg_.pins[i]);
    if (cfg_.pins[4] >= 0) digitalWrite(cfg_.pins[4], LOW); // nSLEEP low = power save
    ready_ = false;
}

void DRV8833Driver::write(uint8_t ch, float duty01) { writeSigned(ch, duty01); }

void DRV8833Driver::writeSigned(uint8_t ch, float v) {
    if (!ready_ || ch > 1) return;
    int8_t inA = (ch == 0) ? cfg_.pins[0] : cfg_.pins[2];
    int8_t inB = (ch == 0) ? cfg_.pins[1] : cfg_.pins[3];

    if (v > 1.0f)  v = 1.0f;
    if (v < -1.0f) v = -1.0f;
    auto& alloc = LedcAllocator::instance();

    bool reverse = v < 0;
    float mag = reverse ? -v : v;

    if (slowDecay_) {
        // Slow decay: drive one input PWM, the other HIGH (full duty).
        if (!reverse) { alloc.write(inA, mag); alloc.write(inB, 1.0f); }
        else          { alloc.write(inA, 1.0f); alloc.write(inB, mag); }
        if (mag == 0.0f) { alloc.write(inA, 0.0f); alloc.write(inB, 0.0f); }
    } else {
        // Fast decay: drive one input PWM, the other LOW (0 duty).
        if (!reverse) { alloc.write(inA, mag); alloc.write(inB, 0.0f); }
        else          { alloc.write(inA, 0.0f); alloc.write(inB, mag); }
    }
}

void DRV8833Driver::allOff() {
    auto& alloc = LedcAllocator::instance();
    for (int i = 0; i < 4; ++i) alloc.write(cfg_.pins[i], 0.0f);
}

} // namespace haxel::hal
