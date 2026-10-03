#pragma once

#include "IHapticDriver.h"

namespace haxel::hal {

class MOSFETDriver : public IHapticDriver {
public:
    bool begin(const DriverConfig& cfg) override;
    void end() override;
    void write(uint8_t ch, float duty01) override;
    void writeSigned(uint8_t ch, float signed11) override;
    void allOff() override;
    uint8_t channelCount() const override { return channelCount_; }
    DriverCaps capabilities() const override;
    const char* name() const override { return "MOSFET"; }

private:
    DriverConfig cfg_{};
    // Dense map: logical channel index → GPIO. Sparse cfg_.pins[] are collapsed here.
    int8_t  chPins_[4] = {-1, -1, -1, -1};
    uint8_t channelCount_ = 0;
    bool ready_ = false;
};

} // namespace haxel::hal
