#pragma once

#include "IHapticDriver.h"

namespace hapticblaze::hal {

class DRV2605LDriver : public IHapticDriver {
public:
    bool begin(const DriverConfig& cfg) override;
    void end() override;
    void write(uint8_t ch, float duty01) override;
    void writeSigned(uint8_t ch, float signed11) override;
    void allOff() override;
    uint8_t channelCount() const override { return 1; }
    DriverCaps capabilities() const override;
    const char* name() const override { return "DRV2605L"; }

    // Fire one of the 1..123 ROM effects. Switches to library mode internally.
    bool triggerLibraryEffect(uint8_t effectId);

private:
    bool selectMode(uint8_t mode);
    bool writeReg(uint8_t reg, uint8_t val);

    DriverConfig cfg_{};
    bool   ready_ = false;
    bool   isLra_ = false;
    uint8_t currentMode_ = 0xFF;
};

} // namespace hapticblaze::hal
