#pragma once

#include "IHapticDriver.h"

namespace haxel::hal {

class DRV8833Driver : public IHapticDriver {
public:
    bool begin(const DriverConfig& cfg) override;
    void end() override;
    void write(uint8_t ch, float duty01) override;
    void writeSigned(uint8_t ch, float signed11) override;
    void allOff() override;
    uint8_t channelCount() const override { return 2; }
    DriverCaps capabilities() const override;
    const char* name() const override { return "DRV8833"; }

private:
    DriverConfig cfg_{};
    bool ready_ = false;
    bool slowDecay_ = true;
};

} // namespace haxel::hal
