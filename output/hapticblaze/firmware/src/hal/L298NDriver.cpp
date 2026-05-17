#include "L298NDriver.h"
#include "LedcAllocator.h"
#include "PinSanity.h"
#include <Arduino.h>

namespace hapticblaze::hal {

DriverCaps L298NDriver::capabilities() const {
    return DriverCaps{
        /* channels */ 2,
        /* bidirectional */ true,
        /* brake */ true,
        /* onChipLibrary */ false,
        /* closedLoop */ false,
        /* maxPwmHzPerChannel */ 20000,
        /* minDuty */ 0.10f,
        /* maxRecommendedDuty */ 1.0f,
    };
}

// pins[] layout per channel:
//   ch0: [0]=ENA  [1]=IN1(fwd)  [2]=IN2(rev)
//   ch1: [3]=ENB  [4]=IN3(fwd)  [5]=IN4(rev)
// If ENA/ENB is -1, we run that channel in "sign-magnitude" mode: PWM is
// applied directly to the active direction pin while the other is held LOW.
// This is what lets users skip the ENA wire entirely when ENA is jumpered to +5V
// on the L298N module.

bool L298NDriver::channelHasPwm_(uint8_t ch) const {
    return (ch == 0 ? cfg_.pins[0] : cfg_.pins[3]) >= 0;
}

bool L298NDriver::begin(const DriverConfig& cfg) {
    cfg_ = cfg;
    PinIssue issue{};
    if (!validate(cfg_, &issue)) {
        log_e("L298N pin sanity failed: pin=%d %s", issue.pin,
              issue.message ? issue.message : "");
        return false;
    }
    auto& alloc = LedcAllocator::instance();
    channelCount_ = 0;
    const uint32_t hz = cfg_.pwmHz ? cfg_.pwmHz : 20000;

    for (uint8_t ch = 0; ch < 2; ++ch) {
        int8_t ena = (ch == 0) ? cfg_.pins[0] : cfg_.pins[3];
        int8_t inA = (ch == 0) ? cfg_.pins[1] : cfg_.pins[4];
        int8_t inB = (ch == 0) ? cfg_.pins[2] : cfg_.pins[5];

        bool anyPin = (ena >= 0) || (inA >= 0) || (inB >= 0);
        if (!anyPin) continue;

        if (ena >= 0) {
            // Separate-PWM mode: ENA = PWM, direction pins = digital.
            if (alloc.allocate(ena, hz, cfg_.pwmBits) < 0) return false;
            if (inA >= 0) { pinMode(inA, OUTPUT); digitalWrite(inA, LOW); }
            if (inB >= 0) { pinMode(inB, OUTPUT); digitalWrite(inB, LOW); }
        } else {
            // Sign-magnitude mode: PWM both direction pins. The unused side is
            // driven to duty 0 (slow-decay-equivalent on L298N with ENA tied
            // high externally).
            if (inA >= 0 && alloc.allocate(inA, hz, cfg_.pwmBits) < 0) return false;
            if (inB >= 0 && alloc.allocate(inB, hz, cfg_.pwmBits) < 0) return false;
        }
        channelCount_++;
    }

    if (channelCount_ == 0) {
        log_e("L298N: no channels configured");
        return false;
    }
    // Optional STBY/EN pin (pins[6]) — held HIGH while driver is active.
    // Required by TB6612FNG, DRV8833 nSLEEP, etc.
    if (cfg_.pins[6] >= 0) {
        pinMode(cfg_.pins[6], OUTPUT);
        digitalWrite(cfg_.pins[6], HIGH);
        log_i("L298N: standby pin GPIO%d driven HIGH", cfg_.pins[6]);
    }
    allOff();
    ready_ = true;
    log_i("L298N ready: %u channel(s), mode%s%s",
          channelCount_,
          channelHasPwm_(0) ? " ch0=ENA-PWM" : (cfg_.pins[1] >= 0 || cfg_.pins[2] >= 0 ? " ch0=sign-mag" : ""),
          channelHasPwm_(1) ? " ch1=ENA-PWM" : (cfg_.pins[4] >= 0 || cfg_.pins[5] >= 0 ? " ch1=sign-mag" : ""));
    return true;
}

void L298NDriver::end() {
    if (!ready_) return;
    allOff();
    auto& alloc = LedcAllocator::instance();
    for (int i = 0; i < 6; ++i) alloc.release(cfg_.pins[i]);
    if (cfg_.pins[6] >= 0) digitalWrite(cfg_.pins[6], LOW); // STBY low = sleep
    ready_ = false;
    channelCount_ = 0;
}

void L298NDriver::write(uint8_t ch, float duty01) {
    writeSigned(ch, duty01);
}

void L298NDriver::writeSigned(uint8_t ch, float v) {
    if (!ready_ || ch > 1) return;
    int8_t ena = (ch == 0) ? cfg_.pins[0] : cfg_.pins[3];
    int8_t inA = (ch == 0) ? cfg_.pins[1] : cfg_.pins[4];
    int8_t inB = (ch == 0) ? cfg_.pins[2] : cfg_.pins[5];

    if (v >  1.0f) v =  1.0f;
    if (v < -1.0f) v = -1.0f;
    auto& alloc = LedcAllocator::instance();

    if (ena >= 0) {
        // Separate-PWM: direction pins set polarity, ENA carries the duty.
        if (v > 0) {
            if (inA >= 0) digitalWrite(inA, HIGH);
            if (inB >= 0) digitalWrite(inB, LOW);
        } else if (v < 0) {
            if (inA >= 0) digitalWrite(inA, LOW);
            if (inB >= 0) digitalWrite(inB, HIGH);
            v = -v;
        } else {
            if (inA >= 0) digitalWrite(inA, LOW);
            if (inB >= 0) digitalWrite(inB, LOW);
        }
        alloc.write(ena, v);
    } else {
        // Sign-magnitude: PWM the matching direction pin, hold the other at 0.
        if (v >= 0) {
            if (inB >= 0) alloc.write(inB, 0.0f);
            if (inA >= 0) alloc.write(inA, v);
        } else {
            if (inA >= 0) alloc.write(inA, 0.0f);
            if (inB >= 0) alloc.write(inB, -v);
        }
    }
}

void L298NDriver::allOff() {
    auto& alloc = LedcAllocator::instance();
    for (uint8_t ch = 0; ch < 2; ++ch) {
        int8_t ena = (ch == 0) ? cfg_.pins[0] : cfg_.pins[3];
        int8_t inA = (ch == 0) ? cfg_.pins[1] : cfg_.pins[4];
        int8_t inB = (ch == 0) ? cfg_.pins[2] : cfg_.pins[5];
        if (ena >= 0) {
            if (inA >= 0) digitalWrite(inA, LOW);
            if (inB >= 0) digitalWrite(inB, LOW);
            alloc.write(ena, 0.0f);
        } else {
            if (inA >= 0) alloc.write(inA, 0.0f);
            if (inB >= 0) alloc.write(inB, 0.0f);
        }
    }
}

} // namespace hapticblaze::hal
