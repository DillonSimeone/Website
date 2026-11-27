#pragma once

#include "IHapticDriver.h"

namespace haxel { class Config; }

namespace haxel::hal {

#pragma push_macro("INPUT")
#undef INPUT
enum class PinRole : uint8_t { OUTPUT_PWM, OUTPUT_DIGITAL, INPUT, I2C };
#pragma pop_macro("INPUT")

struct PinIssue {
    int8_t pin;
    const char* message;
};

// Validate a DriverConfig against ESP32 pin rules. Returns true if OK.
// On failure, `firstIssue` is populated.
bool validate(const DriverConfig& cfg, PinIssue* firstIssue = nullptr);

// Highest GPIO index on the compiled ESP32 target (e.g. 21 for C3, 39 for ESP32).
int getChipMaxPin();

// Returns nullptr if `pin` is available for output, or a short human-readable
// conflict/hardware reason if unavailable (checking hardware rules + Config peripherals).
const char* getPinConflictReason(int8_t pin, const haxel::Config& cfg);

} // namespace haxel::hal
