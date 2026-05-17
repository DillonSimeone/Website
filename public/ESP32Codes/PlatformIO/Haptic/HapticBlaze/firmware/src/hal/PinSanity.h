#pragma once

#include "IHapticDriver.h"

namespace hapticblaze::hal {

enum class PinRole : uint8_t { OUTPUT_PWM, OUTPUT_DIGITAL, INPUT, I2C };

struct PinIssue {
    int8_t pin;
    const char* message;
};

// Validate a DriverConfig against ESP32 pin rules. Returns true if OK.
// On failure, `firstIssue` is populated.
bool validate(const DriverConfig& cfg, PinIssue* firstIssue = nullptr);

} // namespace hapticblaze::hal
