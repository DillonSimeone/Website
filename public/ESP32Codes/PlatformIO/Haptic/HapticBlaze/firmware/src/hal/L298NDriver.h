#pragma once

#include "IHapticDriver.h"

namespace hapticblaze::hal {

class L298NDriver : public IHapticDriver {
public:
    bool begin(const DriverConfig& cfg) override;
    void end() override;
    void write(uint8_t ch, float duty01) override;
    void writeSigned(uint8_t ch, float signed11) override;
    void allOff() override;
    uint8_t channelCount() const override { return channelCount_; }
    DriverCaps capabilities() const override;
    const char* name() const override { return "L298N"; }

private:
    bool channelHasPwm_(uint8_t ch) const;  // true = ENA pin is set; false = sign-mag (PWM on direction pins)

    DriverConfig cfg_{};
    uint8_t channelCount_ = 0;
    bool ready_ = false;
};

} // namespace hapticblaze::hal
