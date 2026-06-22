#include "PinSanity.h"

namespace haxel::hal {

static bool isInputOnly(int8_t pin) {
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C6)
    (void)pin;
    return false;
#else
    return pin >= 34 && pin <= 39;
#endif
}

static bool isStrappingPin(int8_t pin) {
#if defined(CONFIG_IDF_TARGET_ESP32C3)
    return pin == 2 || pin == 8 || pin == 9;
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
    return pin == 0 || pin == 3 || pin == 45 || pin == 46;
#elif defined(CONFIG_IDF_TARGET_ESP32C6)
    return pin == 8 || pin == 9 || pin == 15;
#else
    return pin == 0 || pin == 2 || pin == 5 || pin == 12 || pin == 15;
#endif
}

bool validate(const DriverConfig& cfg, PinIssue* firstIssue) {
    auto fail = [&](int8_t p, const char* m) {
        if (firstIssue) { firstIssue->pin = p; firstIssue->message = m; }
        return false;
    };

    // 1. No duplicate non-negative pins across all slots.
    for (int i = 0; i < 8; ++i) {
        if (cfg.pins[i] < 0) continue;
        for (int j = i + 1; j < 8; ++j) {
            if (cfg.pins[j] == cfg.pins[i]) {
                return fail(cfg.pins[i], "pin used twice");
            }
        }
    }

    // 2. Input-only pins (34-39) cannot drive outputs.
    for (int i = 0; i < 8; ++i) {
        if (cfg.pins[i] >= 0 && isInputOnly(cfg.pins[i])) {
            return fail(cfg.pins[i], "GPIO is input-only");
        }
    }

    // 3. Strapping pins are flagged unless explicitly allowed.
    bool allowStrap = (cfg.flags & 0x1) != 0;
    if (!allowStrap) {
        for (int i = 0; i < 8; ++i) {
            if (cfg.pins[i] >= 0 && isStrappingPin(cfg.pins[i])) {
                return fail(cfg.pins[i], "strapping pin (set allowStrappingPins to override)");
            }
        }
    }
    return true;
}

} // namespace haxel::hal
