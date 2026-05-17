#include "DRV2605LDriver.h"
#include <Arduino.h>
#include <Wire.h>

namespace hapticblaze::hal {

// Register map (subset). See TI datasheet.
static constexpr uint8_t REG_STATUS    = 0x00;
static constexpr uint8_t REG_MODE      = 0x01;
static constexpr uint8_t REG_RTP_INPUT = 0x02;
static constexpr uint8_t REG_LIBRARY   = 0x03;
static constexpr uint8_t REG_WAVE_SEQ1 = 0x04;
static constexpr uint8_t REG_GO        = 0x0C;
static constexpr uint8_t REG_FB_CTRL   = 0x1A;

DriverCaps DRV2605LDriver::capabilities() const {
    return DriverCaps{
        1, false, true, true, true,
        0, 0.0f, 1.0f,
    };
}

bool DRV2605LDriver::writeReg(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(cfg_.i2cAddr);
    Wire.write(reg);
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

bool DRV2605LDriver::selectMode(uint8_t mode) {
    if (currentMode_ == mode) return true;
    if (!writeReg(REG_MODE, mode)) return false;
    currentMode_ = mode;
    return true;
}

bool DRV2605LDriver::begin(const DriverConfig& cfg) {
    cfg_ = cfg;
    if (cfg_.sda >= 0 && cfg_.scl >= 0) {
        Wire.begin(cfg_.sda, cfg_.scl, 400000);
    } else {
        Wire.begin();
        Wire.setClock(400000);
    }
    if (cfg_.pins[0] >= 0) {
        pinMode(cfg_.pins[0], OUTPUT);
        digitalWrite(cfg_.pins[0], HIGH); // EN high
        delay(1);
    }
    // Probe.
    Wire.beginTransmission(cfg_.i2cAddr);
    if (Wire.endTransmission() != 0) {
        log_e("DRV2605L: I2C NAK at 0x%02X", cfg_.i2cAddr);
        return false;
    }

    isLra_ = (cfg_.flags & 0x1) != 0;
    // Out of standby into mode 0 (internal trigger / library).
    if (!writeReg(REG_MODE, 0x00)) return false;
    // Pick library: 1 (ERM) or 6 (LRA).
    writeReg(REG_LIBRARY, isLra_ ? 6 : 1);
    // FB_CTRL: bit 7 = LRA mode.
    writeReg(REG_FB_CTRL, isLra_ ? 0xB6 : 0x36);

    currentMode_ = 0;
    ready_ = true;
    allOff();
    return true;
}

void DRV2605LDriver::end() {
    if (!ready_) return;
    allOff();
    if (cfg_.pins[0] >= 0) digitalWrite(cfg_.pins[0], LOW);
    ready_ = false;
}

void DRV2605LDriver::write(uint8_t ch, float duty01) {
    if (!ready_ || ch != 0) return;
    if (duty01 < 0) duty01 = 0;
    if (duty01 > 1) duty01 = 1;
    selectMode(0x05); // RTP mode
    uint8_t amp = isLra_ ? (uint8_t)(duty01 * 127.0f) : (uint8_t)(duty01 * 255.0f);
    writeReg(REG_RTP_INPUT, amp);
}

void DRV2605LDriver::writeSigned(uint8_t ch, float v) {
    if (v < 0) v = -v;
    write(ch, v);
}

void DRV2605LDriver::allOff() {
    if (!ready_) return;
    selectMode(0x05);
    writeReg(REG_RTP_INPUT, 0);
}

bool DRV2605LDriver::triggerLibraryEffect(uint8_t effectId) {
    if (!ready_) return false;
    if (effectId < 1 || effectId > 123) return false;
    selectMode(0x00);
    writeReg(REG_WAVE_SEQ1, effectId);
    writeReg(REG_WAVE_SEQ1 + 1, 0);
    writeReg(REG_GO, 0x01);
    return true;
}

} // namespace hapticblaze::hal
