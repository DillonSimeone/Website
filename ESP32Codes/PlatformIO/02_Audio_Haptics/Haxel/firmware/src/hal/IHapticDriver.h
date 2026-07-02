#pragma once

#include <stdint.h>

namespace haxel::hal {

enum class DriverKind : uint8_t {
    NONE         = 0,
    L298N        = 1,
    DRV8833      = 2,
    DRV2605L     = 3,
    MOSFET       = 4,
    MINI_HBRIDGE = 5,   // generic 2-pin H-bridge: MX1508, L9110S, DRV8833 mini, TB6612FNG
};

struct DriverCaps {
    uint8_t  channels;
    bool     bidirectional;
    bool     brake;
    bool     onChipLibrary;
    bool     closedLoop;
    uint32_t maxPwmHzPerChannel;
    float    minDuty;
    float    maxRecommendedDuty;
};

struct DriverConfig {
    DriverKind kind = DriverKind::NONE;
    int8_t  pins[8] = {-1,-1,-1,-1,-1,-1,-1,-1};
    int8_t  sda = -1, scl = -1;
    uint8_t i2cAddr = 0x5A;
    uint32_t pwmHz = 20000;
    uint8_t pwmBits = 10;
    // Driver-specific scratch flags (e.g., DRV8833 decay mode, DRV2605L
    // actuator type). Drivers ignore unknown bits.
    uint32_t flags = 0;
};

class IHapticDriver {
public:
    virtual ~IHapticDriver() = default;
    virtual bool       begin(const DriverConfig& cfg) = 0;
    virtual void       end() = 0;
    virtual void       write(uint8_t ch, float duty01) = 0;
    virtual void       writeSigned(uint8_t ch, float signed11) = 0;
    virtual void       allOff() = 0;
    virtual uint8_t    channelCount() const = 0;
    virtual DriverCaps capabilities() const = 0;
    virtual const char* name() const = 0;
};

} // namespace haxel::hal
