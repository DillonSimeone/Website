#include "MOSFETDriver.h"
#include "LedcAllocator.h"
#include "PinSanity.h"
#include <Arduino.h>

namespace hapticblaze::hal {

DriverCaps MOSFETDriver::capabilities() const {
    return DriverCaps{
        channelCount_, false, false, false, false,
        40000, 0.05f, 1.0f,
    };
}

bool MOSFETDriver::begin(const DriverConfig& cfg) {
    cfg_ = cfg;
    PinIssue issue{};
    if (!validate(cfg_, &issue)) {
        log_e("MOSFET pin sanity failed: pin=%d %s", issue.pin,
              issue.message ? issue.message : "");
        return false;
    }
    auto& alloc = LedcAllocator::instance();
    channelCount_ = 0;
    for (int i = 0; i < 4; ++i) {
        if (cfg_.pins[i] < 0) continue;
        if (alloc.allocate(cfg_.pins[i], cfg_.pwmHz ? cfg_.pwmHz : 20000, cfg_.pwmBits) < 0) {
            return false;
        }
        channelCount_++;
    }
    if (channelCount_ == 0) {
        log_e("MOSFET: no channels configured");
        return false;
    }
    allOff();
    ready_ = true;
    return true;
}

void MOSFETDriver::end() {
    if (!ready_) return;
    allOff();
    auto& alloc = LedcAllocator::instance();
    for (int i = 0; i < 4; ++i) alloc.release(cfg_.pins[i]);
    ready_ = false;
    channelCount_ = 0;
}

void MOSFETDriver::write(uint8_t ch, float duty01) {
    if (!ready_ || ch >= channelCount_) return;
    if (duty01 < 0) duty01 = 0;
    if (duty01 > 1) duty01 = 1;
    LedcAllocator::instance().write(cfg_.pins[ch], duty01);
}

void MOSFETDriver::writeSigned(uint8_t ch, float v) {
    write(ch, v < 0 ? -v : v);
}

void MOSFETDriver::allOff() {
    auto& alloc = LedcAllocator::instance();
    for (int i = 0; i < 4; ++i) {
        if (cfg_.pins[i] >= 0) alloc.write(cfg_.pins[i], 0.0f);
    }
}

} // namespace hapticblaze::hal
