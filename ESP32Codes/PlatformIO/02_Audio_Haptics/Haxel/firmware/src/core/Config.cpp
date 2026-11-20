#include "Config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#ifndef HAXEL_HOST_TEST
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#endif

namespace haxel {

static constexpr const char* kPath    = "/config.json";
static constexpr const char* kTmpPath = "/config.json.tmp";

Config::Config() {
#ifndef HAXEL_HOST_TEST
    mux_ = xSemaphoreCreateRecursiveMutex();
#endif
}

void Config::lock_() const {
#ifndef HAXEL_HOST_TEST
    if (!mux_) {
        static portMUX_TYPE initMux = portMUX_INITIALIZER_UNLOCKED;
        portENTER_CRITICAL(&initMux);
        if (!mux_) mux_ = xSemaphoreCreateRecursiveMutex();
        portEXIT_CRITICAL(&initMux);
    }
    if (mux_) xSemaphoreTakeRecursive(static_cast<SemaphoreHandle_t>(mux_), portMAX_DELAY);
#endif
}

void Config::unlock_() const {
#ifndef HAXEL_HOST_TEST
    if (mux_) xSemaphoreGiveRecursive(static_cast<SemaphoreHandle_t>(mux_));
#endif
}

void Config::applyDefaults_() {
    firstRun_ = true;
    staEnabled_ = false;
    hostname_ = "haxel";
    apSsid_   = generateApSsid_();
    staSsid_  = "";
    staPass_  = "";

    driverKind_ = hal::DriverKind::MOSFET;
    driverConfig_ = {};
    driverConfig_.kind = driverKind_;
    for (int i = 0; i < 8; ++i) driverConfig_.pins[i] = -1;
#ifdef HAXEL_TARGET_C6
    // Mini L298N (sign-magnitude): coin pair on MOTOR-A, M1N10 on MOTOR-B.
    // Jumper ENA/ENB to +5V on the module — speed PWM on INT pins.
    driverKind_ = hal::DriverKind::L298N;
    driverConfig_.kind = driverKind_;
    driverConfig_.pins[0] = -1;   // ENA (jumpered high on module)
    driverConfig_.pins[1] = 16;   // INT1
    driverConfig_.pins[2] = 17;   // INT2  → MOTOR-A (both coin cells in parallel)
    driverConfig_.pins[3] = -1;   // ENB (jumpered high)
    driverConfig_.pins[4] = 19;   // INT3
    driverConfig_.pins[5] = 20;   // INT4  → MOTOR-B (M1N10FB11G)
#elif defined(HAXEL_DEFAULT_MOTOR_PIN)
    driverConfig_.pins[0] = HAXEL_DEFAULT_MOTOR_PIN;
#elif defined(HAXEL_TARGET_CLASSIC) || (defined(CONFIG_IDF_TARGET_ESP32) && !defined(HAXEL_TARGET_S3))
    driverConfig_.pins[0] = 4;  // Safe PWM pin on Classic ESP32 (GPIO 6..11 are SPI flash)
#else
    driverConfig_.pins[0] = 6;  // MOSFET Motor Pin (ESP32-C3 SuperMini default)
#endif
    driverConfig_.pwmHz = 20000;
    driverConfig_.pwmBits = 10;

    audio_ = {};

    led_ = {};
#if HAXEL_FEATURE_LED && !defined(HAXEL_TARGET_C6)
    led_.enabled = true;
#ifdef HAXEL_DEFAULT_LED_PIN
    led_.pin = HAXEL_DEFAULT_LED_PIN;
#else
    led_.pin = 5;
#endif
    led_.count = 20;
#else
    led_.enabled = false;
    led_.pin = -1;
    led_.count = 0;
#endif

    knobCount_ = 0;
    for (size_t i = 0; i < kMaxKnobs; ++i) {
        knobs_[i] = { false, -1, "none" };
    }

    oled_ = {};
    oled_.enabled = false;
#ifdef HAXEL_TARGET_C6
    oled_.sda = -1;
    oled_.scl = -1;
#elif defined(HAXEL_TARGET_CLASSIC) || (defined(CONFIG_IDF_TARGET_ESP32) && !defined(HAXEL_TARGET_S3))
    oled_.sda = 21;
    oled_.scl = 22;
#else
    oled_.sda = 8;
    oled_.scl = 9;
#endif
    oled_.i2cAddr = 0x3C;
    oled_.width = 128;
    oled_.height = 64;

    eStopPin_ = -1;
#if HAXEL_FEATURE_MESH_MASTER
    meshRole_ = MeshRole::MASTER;
#elif HAXEL_FEATURE_MESH_FOLLOWER
    meshRole_ = MeshRole::FOLLOWER;
#else
    meshRole_ = MeshRole::STANDALONE;
#endif
}

void Config::setChannelEnabled(const bool* enabled, size_t count) {
    if (!enabled) return;
    Lock lk(this);
    size_t n = count > kMaxChannels ? kMaxChannels : count;
    for (size_t i = 0; i < n; ++i) channelEnabled_[i] = enabled[i];
    markDirty();
}

void Config::setKnobs(const KnobConfig* knobs, size_t count) {
    Lock lk(this);
    knobCount_ = count > kMaxKnobs ? kMaxKnobs : count;
    for (size_t i = 0; i < knobCount_; ++i) knobs_[i] = knobs[i];
    for (size_t i = knobCount_; i < kMaxKnobs; ++i) {
        knobs_[i] = { false, -1, "none" };
    }
    markDirty();
}

String Config::generateApSsid_() {
    uint64_t mac = ESP.getEfuseMac();
    char buf[32];
    snprintf(buf, sizeof(buf), "Haxel-%04X",
             (uint16_t)((mac >> 32) & 0xFFFF));
    return String(buf);
}

void Config::setApSsid(const String& requested) {
    String value;
    value.reserve(32);
    for (size_t i = 0; i < requested.length() && value.length() < 31; ++i) {
        const char c = requested.charAt(i);
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') || c == '-' || c == '_' || c == ' ') {
            value += c;
        }
    }
    value.trim();
    if (value.isEmpty()) value = generateApSsid_();
    if (!value.startsWith("Haxel")) value = "Haxel-" + value;
    if (value.length() > 31) value.remove(31);
    Lock lk(this);
    apSsid_ = value;
    markDirty();
}

bool Config::load() {
    Lock lk(this);
    applyDefaults_();
    File f = LittleFS.open(kPath, "r");
    if (!f) {
        log_i("No config.json — writing factory defaults");
        save();
        return false;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        log_e("config.json parse failed: %s", err.c_str());
        save(); // rewrite known-good defaults
        return false;
    }

    bool migrated = false;

    firstRun_ = doc["firstRun"] | true;
    staEnabled_ = doc["staEnabled"] | false;
    hostname_ = (const char*)(doc["hostname"] | "haxel");
    apSsid_   = (const char*)(doc["apSsid"]   | generateApSsid_().c_str());
    staSsid_  = (const char*)(doc["staSsid"]  | "");
    staPass_  = (const char*)(doc["staPass"]  | "");

    // Fallbacks must match applyDefaults_() (MOSFET on GPIO 6, LEDs on GPIO 5 / count 20).
    if (doc["driver"]["kind"].is<int>()) {
        driverKind_ = (hal::DriverKind)(uint8_t)doc["driver"]["kind"].as<int>();
    } else {
        driverKind_ = hal::DriverKind::MOSFET;
    }
    // Old portal bug saved MOSFET as kind 0 (NONE). Recover.
    if (driverKind_ == hal::DriverKind::NONE) {
        driverKind_ = hal::DriverKind::MOSFET;
        migrated = true;
        log_w("Migrated driver kind NONE → MOSFET");
    }
    driverConfig_.kind = driverKind_;
    JsonArrayConst pins = doc["driver"]["pins"].as<JsonArrayConst>();
    if (pins.size() > 0) {
        for (int i = 0; i < 8; ++i) driverConfig_.pins[i] = -1;
        for (size_t i = 0; i < 8 && i < pins.size(); ++i) {
            driverConfig_.pins[i] = pins[i] | -1;
        }
    }
    // If pins were omitted, keep target-safe MOSFET pin.
    if (driverKind_ == hal::DriverKind::MOSFET && driverConfig_.pins[0] < 0) {
#if defined(HAXEL_TARGET_CLASSIC) || (defined(CONFIG_IDF_TARGET_ESP32) && !defined(HAXEL_TARGET_S3))
        driverConfig_.pins[0] = 4;
#else
        driverConfig_.pins[0] = 6;
#endif
        migrated = true;
    }
    // Migrate boards that inherited the old L298N fallback with a single
    // gate pin — that layout is MOSFET, not an H-bridge.
    if (driverKind_ == hal::DriverKind::L298N && driverConfig_.pins[0] >= 0) {
        bool onlyPin0 = true;
        for (int i = 1; i < 8; ++i) {
            if (driverConfig_.pins[i] >= 0) { onlyPin0 = false; break; }
        }
        if (onlyPin0) {
            driverKind_ = hal::DriverKind::MOSFET;
            driverConfig_.kind = driverKind_;
            migrated = true;
            log_w("Migrated single-pin L298N config to MOSFET (GPIO %d)",
                  (int)driverConfig_.pins[0]);
        }
    }
    driverConfig_.sda     = doc["driver"]["sda"]     | -1;
    driverConfig_.scl     = doc["driver"]["scl"]     | -1;
    driverConfig_.i2cAddr = doc["driver"]["i2cAddr"] | 0x5A;
    driverConfig_.pwmHz   = doc["driver"]["pwmHz"]   | 20000;
    driverConfig_.pwmBits = doc["driver"]["pwmBits"] | 10;
    driverConfig_.flags   = doc["driver"]["flags"]   | 0u;

    if (doc["audio"].is<JsonObjectConst>()) {
        audio_.enabled = doc["audio"]["enabled"] | false;
        audio_.source  = (AudioConfig::Source)(int)(doc["audio"]["source"] | 0);
        audio_.i2sBclk = doc["audio"]["bclk"] | -1;
        audio_.i2sWs   = doc["audio"]["ws"]   | -1;
        audio_.i2sSd   = doc["audio"]["sd"]   | -1;
        audio_.adcPin  = doc["audio"]["adc"]  | -1;
        audio_.gain    = doc["audio"]["gain"] | 1.0f;
    }

    if (doc["led"].is<JsonObjectConst>()) {
        led_.enabled = doc["led"]["enabled"] | led_.enabled;
        if (doc["led"]["pin"].is<int>())   led_.pin   = doc["led"]["pin"].as<int>();
        if (doc["led"]["count"].is<int>()) led_.count = doc["led"]["count"].as<int>();
        if (led_.enabled) {
            if (led_.pin < 0) { led_.pin = 5; migrated = true; }
            if (led_.count == 0) { led_.count = 20; migrated = true; }
        }
    }
    // else keep applyDefaults_() (enabled, pin 5, count 20)

    knobCount_ = 0;
    if (JsonArrayConst ka = doc["knobs"].as<JsonArrayConst>()) {
        for (JsonObjectConst k : ka) {
            if (knobCount_ >= kMaxKnobs) break;
            knobs_[knobCount_].enabled = k["enabled"] | false;
            knobs_[knobCount_].pin     = k["pin"]     | -1;
            knobs_[knobCount_].param   = (const char*)(k["param"] | "none");
            knobCount_++;
        }
    }
    // No default knobs — leave empty unless the portal / another project enables them.

    if (doc["oled"].is<JsonObjectConst>()) {
        oled_.enabled  = doc["oled"]["enabled"]  | false;
#if defined(HAXEL_TARGET_CLASSIC) || (defined(CONFIG_IDF_TARGET_ESP32) && !defined(HAXEL_TARGET_S3))
        oled_.sda      = doc["oled"]["sda"]      | 21;
        oled_.scl      = doc["oled"]["scl"]      | 22;
#else
        oled_.sda      = doc["oled"]["sda"]      | 8;
        oled_.scl      = doc["oled"]["scl"]      | 9;
#endif
        oled_.i2cAddr  = doc["oled"]["i2cAddr"]  | 0x3C;
        oled_.width    = doc["oled"]["width"]    | 128;
        oled_.height   = doc["oled"]["height"]   | 64;
    }
    // else keep applyDefaults_() (oled disabled)

    eStopPin_ = (int8_t)(doc["eStopPin"] | -1);
    if (doc["meshRole"].is<int>()) {
        int mr = doc["meshRole"].as<int>();
        if (mr >= 0 && mr <= 2) meshRole_ = (MeshRole)mr;
    }

    if (JsonArrayConst chEn = doc["channelEnabled"].as<JsonArrayConst>()) {
        for (size_t i = 0; i < kMaxChannels; ++i) channelEnabled_[i] = true;
        size_t i = 0;
        for (JsonVariantConst v : chEn) {
            if (i >= kMaxChannels) break;
            channelEnabled_[i++] = v.as<bool>();
        }
    }

    // Persist migrated corrections so the portal sees them next load.
    if (migrated) save();
    return true;
}

void Config::driverToJson(JsonObject drv, bool includeDriverExtra) const {
    Lock lk(this);
    drv["kind"] = (int)driverKind_;
    auto pins = drv["pins"].to<JsonArray>();
    for (int i = 0; i < 8; ++i) pins.add(driverConfig_.pins[i]);
    drv["sda"] = driverConfig_.sda;
    drv["scl"] = driverConfig_.scl;
    if (includeDriverExtra) {
        drv["i2cAddr"] = driverConfig_.i2cAddr;
        drv["pwmBits"] = driverConfig_.pwmBits;
    }
    drv["pwmHz"] = driverConfig_.pwmHz;
    drv["flags"] = driverConfig_.flags;
}

void Config::audioToJson(JsonObject au) const {
    Lock lk(this);
    au["enabled"] = audio_.enabled;
    au["source"]  = (int)audio_.source;
    au["bclk"]    = audio_.i2sBclk;
    au["ws"]      = audio_.i2sWs;
    au["sd"]      = audio_.i2sSd;
    au["adc"]     = audio_.adcPin;
    au["gain"]    = audio_.gain;
}

void Config::ledToJson(JsonObject ld) const {
    Lock lk(this);
    ld["enabled"] = led_.enabled;
    ld["pin"]     = led_.pin;
    ld["count"]   = led_.count;
}

void Config::oledToJson(JsonObject ol) const {
    Lock lk(this);
    ol["enabled"] = oled_.enabled;
    ol["sda"]     = oled_.sda;
    ol["scl"]     = oled_.scl;
    ol["i2cAddr"] = oled_.i2cAddr;
    ol["width"]   = oled_.width;
    ol["height"]  = oled_.height;
}

void Config::toJson(JsonObject root, bool includeSecrets) const {
    Lock lk(this);
    root["firstRun"] = firstRun_;
    if (includeSecrets) {
        root["staEnabled"] = staEnabled_;
        root["staSsid"] = staSsid_;
        root["staPass"] = staPass_;
    }
    root["hostname"] = hostname_;
    root["apSsid"]   = apSsid_;

    driverToJson(root["driver"].to<JsonObject>(), includeSecrets);
    audioToJson(root["audio"].to<JsonObject>());
    ledToJson(root["led"].to<JsonObject>());

    auto knobs = root["knobs"].to<JsonArray>();
    for (size_t i = 0; i < knobCount_; ++i) {
        auto k = knobs.add<JsonObject>();
        k["enabled"] = knobs_[i].enabled;
        k["pin"]     = knobs_[i].pin;
        k["param"]   = knobs_[i].param;
    }

    oledToJson(root["oled"].to<JsonObject>());
    root["eStopPin"] = eStopPin_;
    root["meshRole"] = (int)meshRole_;

    auto chEn = root["channelEnabled"].to<JsonArray>();
    for (size_t i = 0; i < kMaxChannels; ++i) chEn.add(channelEnabled_[i]);
}

bool Config::save() {
    Lock lk(this);
    JsonDocument doc;
    toJson(doc.to<JsonObject>(), true);

    String serialized;
    serializeJson(doc, serialized);
    if (serialized == lastSavedJson_) {
        dirty_ = false;
        lastDirtyMs_ = 0;
        return true; // Dedup identical writes to spare flash.
    }

    File f = LittleFS.open(kTmpPath, "w");
    if (!f) return false;
    if (f.print(serialized) == 0) { f.close(); return false; }
    f.close();
    LittleFS.remove(kPath);
    LittleFS.rename(kTmpPath, kPath);
    lastSavedJson_ = serialized;
    dirty_ = false;
    lastDirtyMs_ = 0;
    return true;
}

void Config::flushIfDirty() {
    Lock lk(this);
    if (!dirty_) return;
    // Debounce writes to spare flash. Hold for 1 s of quiet first.
    if (lastDirtyMs_ == 0) { lastDirtyMs_ = millis(); return; }
    if (millis() - lastDirtyMs_ < 1000) return;
    save();
    lastDirtyMs_ = 0;
}

} // namespace haxel
