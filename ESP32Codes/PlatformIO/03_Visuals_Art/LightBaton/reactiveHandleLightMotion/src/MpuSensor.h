#pragma once

#include <Arduino.h>
#include <Wire.h>

enum class SensorType : uint8_t {
    MPU6050,
    MPU6500
};

struct MotionSample {
    float accelX;
    float accelY;
    float accelZ;
    float gyroX;
    float gyroY;
    float gyroZ;
};

class MpuSensor {
public:
    bool begin(TwoWire& wire, SensorType sensorType);
    bool readMotion(MotionSample& sample);
    void setMotionInterrupt(bool enabled);
    const char* sensorName() const;

private:
    static constexpr uint8_t kDefaultAddressLow = 0x68;
    static constexpr uint8_t kDefaultAddressHigh = 0x69;
    static constexpr uint8_t kRegSmplrtDiv = 0x19;
    static constexpr uint8_t kRegConfig = 0x1A;
    static constexpr uint8_t kRegGyroConfig = 0x1B;
    static constexpr uint8_t kRegAccelConfig = 0x1C;
    static constexpr uint8_t kRegAccelConfig2 = 0x1D;
    static constexpr uint8_t kRegMotThr = 0x1F;
    static constexpr uint8_t kRegMotDur = 0x20;
    static constexpr uint8_t kRegIntEnable = 0x38;
    static constexpr uint8_t kRegAccelXoutH = 0x3B;
    static constexpr uint8_t kRegPwrMgmt1 = 0x6B;
    static constexpr uint8_t kRegWhoAmI = 0x75;

    bool detectAndConfigure();
    bool isExpectedWhoAmI(uint8_t whoAmI) const;
    bool writeRegister(uint8_t reg, uint8_t value);
    bool readRegister(uint8_t reg, uint8_t& value);
    bool readRegisters(uint8_t reg, uint8_t* data, uint8_t length);

    TwoWire* wire_ = nullptr;
    SensorType sensorType_ = SensorType::MPU6050;
    uint8_t address_ = kDefaultAddressLow;
};
