#include "PinSanity.h"
#include "../core/Config.h"
#include <Arduino.h>

namespace haxel::hal {

static bool isInputOnly(int8_t pin) {
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(HAXEL_TARGET_C3) || \
    defined(CONFIG_IDF_TARGET_ESP32S3) || defined(HAXEL_TARGET_S3) || \
    defined(CONFIG_IDF_TARGET_ESP32C6) || defined(HAXEL_TARGET_C6)
    (void)pin;
    return false;
#else
    return pin >= 34 && pin <= 39;
#endif
}

static bool isSpiFlashPin(int8_t pin) {
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(HAXEL_TARGET_C3)
    return pin >= 12 && pin <= 17;
#elif defined(CONFIG_IDF_TARGET_ESP32C6) || defined(HAXEL_TARGET_C6)
    return pin >= 24 && pin <= 26;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(HAXEL_TARGET_S3)
    return pin >= 26 && pin <= 32;
#else
    return pin >= 6 && pin <= 11;
#endif
}

static bool isStrappingPin(int8_t pin) {
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(HAXEL_TARGET_C3)
    return pin == 2 || pin == 8 || pin == 9;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(HAXEL_TARGET_S3)
    return pin == 0 || pin == 3 || pin == 45 || pin == 46;
#elif defined(CONFIG_IDF_TARGET_ESP32C6) || defined(HAXEL_TARGET_C6)
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

    // 2. SPI flash and input-only pins cannot drive outputs.
    for (int i = 0; i < 8; ++i) {
        if (cfg.pins[i] >= 0 && isSpiFlashPin(cfg.pins[i])) {
            return fail(cfg.pins[i], "GPIO is reserved for SPI flash");
        }
        if (cfg.pins[i] >= 0 && isInputOnly(cfg.pins[i])) {
            return fail(cfg.pins[i], "GPIO is input-only");
        }
    }

    // 3. Strapping pins are flagged unless explicitly allowed.
    bool allowStrap = (cfg.flags & kFlagAllowStrappingPins) != 0;
    if (!allowStrap) {
        for (int i = 0; i < 8; ++i) {
            if (cfg.pins[i] >= 0 && isStrappingPin(cfg.pins[i])) {
                return fail(cfg.pins[i], "strapping pin (set allowStrappingPins to override)");
            }
        }
    }
    return true;
}

int getChipMaxPin() {
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(HAXEL_TARGET_C3)
    return 21;
#elif defined(CONFIG_IDF_TARGET_ESP32C6) || defined(HAXEL_TARGET_C6)
    return 30;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(HAXEL_TARGET_S3)
    return 48;
#else
    return 39;
#endif
}

const char* getPinConflictReason(int8_t pin, const haxel::Config& cfg) {
    if (pin < 0 || pin > getChipMaxPin()) return "Out of range";
    if (isSpiFlashPin(pin)) return "SPI Flash";
    if (isInputOnly(pin)) return "Input only";

#if (defined(CONFIG_IDF_TARGET_ESP32C3) || defined(HAXEL_TARGET_C3)) && defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
    if (pin == 18 || pin == 19) return "USB Serial/JTAG";
#endif

    const DriverConfig drv = cfg.driverConfig();
    const bool allowStrap = (drv.flags & kFlagAllowStrappingPins) != 0;
    if (!allowStrap && isStrappingPin(pin)) return "Strapping pin";

    if (cfg.driverKind() == DriverKind::DRV2605L) {
        if (pin == drv.sda) return "Driver I2C SDA";
        if (pin == drv.scl) return "Driver I2C SCL";
    }

    const AudioConfig au = cfg.audioConfig();
    if (au.enabled) {
        if (au.source == AudioConfig::ADC && pin == au.adcPin) return "Audio ADC";
        if (au.source == AudioConfig::I2S_MEMS) {
            if (pin == au.i2sBclk) return "Audio I2S BCLK";
            if (pin == au.i2sWs)   return "Audio I2S WS";
            if (pin == au.i2sSd)   return "Audio I2S SD";
        }
    }

    const LedConfig ld = cfg.ledConfig();
    if (ld.enabled && pin == ld.pin) return "Status/LED";

    const OledConfig ol = cfg.oledConfig();
    if (ol.enabled) {
        if (pin == ol.sda) return "OLED SDA";
        if (pin == ol.scl) return "OLED SCL";
    }

    if (cfg.eStopPin() >= 0 && pin == cfg.eStopPin()) return "E-Stop";

    for (size_t i = 0; i < cfg.knobCount(); ++i) {
        const KnobConfig k = cfg.knob(i);
        if (k.enabled && pin == k.pin) return "Knob";
    }

    return nullptr;
}

} // namespace haxel::hal
