#include "MpuSensor.h"

bool MpuSensor::begin(TwoWire& wire, SensorType sensorType) {
    wire_ = &wire;
    sensorType_ = sensorType;
    address_ = kDefaultAddressLow;

    if (!detectAndConfigure()) {
        address_ = kDefaultAddressHigh;
        if (!detectAndConfigure()) {
            return false;
        }
    }
    return true;
}

bool MpuSensor::readMotion(MotionSample& sample) {
    uint8_t raw[14];
    if (!readRegisters(kRegAccelXoutH, raw, sizeof(raw))) {
        return false;
    }

    const int16_t ax = (static_cast<int16_t>(raw[0]) << 8) | raw[1];
    const int16_t ay = (static_cast<int16_t>(raw[2]) << 8) | raw[3];
    const int16_t az = (static_cast<int16_t>(raw[4]) << 8) | raw[5];
    const int16_t gx = (static_cast<int16_t>(raw[8]) << 8) | raw[9];
    const int16_t gy = (static_cast<int16_t>(raw[10]) << 8) | raw[11];
    const int16_t gz = (static_cast<int16_t>(raw[12]) << 8) | raw[13];

    constexpr float accelScale = 9.80665f / 4096.0f;
    constexpr float gyroScale = (PI / 180.0f) / 65.5f;
    sample.accelX = ax * accelScale;
    sample.accelY = ay * accelScale;
    sample.accelZ = az * accelScale;
    sample.gyroX = gx * gyroScale;
    sample.gyroY = gy * gyroScale;
    sample.gyroZ = gz * gyroScale;
    return true;
}

void MpuSensor::setMotionInterrupt(bool enabled) {
    if (enabled) {
        writeRegister(kRegMotThr, 10);
        writeRegister(kRegMotDur, 1);
        writeRegister(kRegIntEnable, 0x40);
    } else {
        writeRegister(kRegIntEnable, 0x00);
    }
}

const char* MpuSensor::sensorName() const {
    return sensorType_ == SensorType::MPU6500 ? "MPU6500" : "MPU6050";
}

bool MpuSensor::detectAndConfigure() {
    uint8_t whoAmI = 0;
    if (!readRegister(kRegWhoAmI, whoAmI)) {
        return false;
    }
    Serial.printf(" [IMU @ 0x%02X responded with WHO_AM_I: 0x%02X]\n", address_, whoAmI);
    if (!isExpectedWhoAmI(whoAmI)) {
        Serial.printf(" [WARNING] Expected WHO_AM_I for %s, but got 0x%02X\n", sensorName(), whoAmI);
        return false;
    }

    delay(10);
    if (!writeRegister(kRegPwrMgmt1, 0x00)) return false;
    delay(50);
    if (!writeRegister(kRegSmplrtDiv, 0x07)) return false;
    if (!writeRegister(kRegConfig, 0x04)) return false;
    if (!writeRegister(kRegGyroConfig, 0x08)) return false;
    if (!writeRegister(kRegAccelConfig, 0x10)) return false;
    if (!writeRegister(kRegAccelConfig2, 0x04)) return false;
    return true;
}

bool MpuSensor::isExpectedWhoAmI(uint8_t whoAmI) const {
    if (sensorType_ == SensorType::MPU6050) {
        return whoAmI == 0x68 || whoAmI == 0x69;
    }
    return whoAmI == 0x70 || whoAmI == 0x71;
}

bool MpuSensor::writeRegister(uint8_t reg, uint8_t value) {
    wire_->beginTransmission(address_);
    wire_->write(reg);
    wire_->write(value);
    return wire_->endTransmission() == 0;
}

bool MpuSensor::readRegister(uint8_t reg, uint8_t& value) {
    return readRegisters(reg, &value, 1);
}

bool MpuSensor::readRegisters(uint8_t reg, uint8_t* data, uint8_t length) {
    wire_->beginTransmission(address_);
    wire_->write(reg);
    if (wire_->endTransmission(false) != 0) {
        return false;
    }
    if (wire_->requestFrom(static_cast<int>(address_), static_cast<int>(length)) != length) {
        return false;
    }
    for (uint8_t i = 0; i < length; ++i) {
        data[i] = wire_->read();
    }
    return true;
}
