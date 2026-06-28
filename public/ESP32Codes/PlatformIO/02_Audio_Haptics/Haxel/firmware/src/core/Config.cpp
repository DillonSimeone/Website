#include "Config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <WiFi.h>

namespace haxel {

static constexpr const char* kPath    = "/config.json";
static constexpr const char* kTmpPath = "/config.json.tmp";

void Config::applyDefaults_() {
    firstRun_ = true;
    staEnabled_ = false;
    hostname_ = "haxel";
    apSsid_   = generateApSsid_();
    staSsid_  = "Cumzone - FishyZone";
    staPass_  = "7414stinky$$$";

    driverKind_ = hal::DriverKind::MOSFET;
    driverConfig_ = {};
    driverConfig_.kind = driverKind_;
    for (int i = 0; i < 8; ++i) driverConfig_.pins[i] = -1;
    driverConfig_.pins[0] = 6;  // MOSFET Motor Pin
    driverConfig_.pwmHz = 20000;
    driverConfig_.pwmBits = 10;

    audio_ = {};

    led_ = {};
    led_.enabled = true;
    led_.pin = 5;
    led_.count = 60;

    knobCount_ = 4;
    knobs_[0] = { true, 0, "speed" };
    knobs_[1] = { true, 1, "intensity" };
    knobs_[2] = { true, 3, "gain" };
    knobs_[3] = { true, 4, "pattern" };
    for (size_t i = 4; i < kMaxKnobs; ++i) {
        knobs_[i] = { false, -1, "none" };
    }

    oled_ = {};
    oled_.enabled = true;
    oled_.sda = 8;
    oled_.scl = 9;
    oled_.i2cAddr = 0x3C;
    oled_.width = 128;
    oled_.height = 64;
}

void Config::setKnobs(const KnobConfig* knobs, size_t count) {
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

bool Config::load() {
    applyDefaults_();
    File f = LittleFS.open(kPath, "r");
    if (!f) return false;

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        log_e("config.json parse failed: %s", err.c_str());
        return false;
    }

    firstRun_ = doc["firstRun"] | true;
    staEnabled_ = doc["staEnabled"] | false;
    hostname_ = (const char*)(doc["hostname"] | "haxel");
    apSsid_   = (const char*)(doc["apSsid"]   | generateApSsid_().c_str());
    staSsid_  = (const char*)(doc["staSsid"]  | "");
    staPass_  = (const char*)(doc["staPass"]  | "");

    driverKind_ = (hal::DriverKind)(uint8_t)(doc["driver"]["kind"] | (int)hal::DriverKind::L298N);
    driverConfig_.kind = driverKind_;
    JsonArrayConst pins = doc["driver"]["pins"].as<JsonArrayConst>();
    for (size_t i = 0; i < 8 && i < pins.size(); ++i) {
        driverConfig_.pins[i] = pins[i] | -1;
    }
    driverConfig_.sda     = doc["driver"]["sda"]     | -1;
    driverConfig_.scl     = doc["driver"]["scl"]     | -1;
    driverConfig_.i2cAddr = doc["driver"]["i2cAddr"] | 0x5A;
    driverConfig_.pwmHz   = doc["driver"]["pwmHz"]   | 20000;
    driverConfig_.pwmBits = doc["driver"]["pwmBits"] | 10;

    audio_.enabled = doc["audio"]["enabled"] | false;
    audio_.source  = (AudioConfig::Source)(int)(doc["audio"]["source"] | 0);
    audio_.i2sBclk = doc["audio"]["bclk"] | -1;
    audio_.i2sWs   = doc["audio"]["ws"]   | -1;
    audio_.i2sSd   = doc["audio"]["sd"]   | -1;
    audio_.adcPin  = doc["audio"]["adc"]  | -1;
    audio_.gain    = doc["audio"]["gain"] | 1.0f;

    led_.enabled = doc["led"]["enabled"] | false;
    led_.pin     = doc["led"]["pin"]     | 2;
    led_.count   = doc["led"]["count"]   | 60;

    knobCount_ = 0;
    if (JsonArrayConst ka = doc["knobs"].as<JsonArrayConst>()) {
        for (JsonObjectConst k : ka) {
            if (knobCount_ >= kMaxKnobs) break;
            knobs_[knobCount_].enabled = k["enabled"] | true;
            knobs_[knobCount_].pin     = k["pin"]     | -1;
            knobs_[knobCount_].param   = (const char*)(k["param"] | "none");
            knobCount_++;
        }
    }
    if (knobCount_ == 0) {
        knobCount_ = 4;
        knobs_[0] = { true, 0, "speed" };
        knobs_[1] = { true, 1, "intensity" };
        knobs_[2] = { true, 3, "gain" };
        knobs_[3] = { true, 4, "pattern" };
    }

    oled_.enabled  = doc["oled"]["enabled"]  | true;
    oled_.sda      = doc["oled"]["sda"]      | 8;
    oled_.scl      = doc["oled"]["scl"]      | 9;
    oled_.i2cAddr  = doc["oled"]["i2cAddr"]  | 0x3C;
    oled_.width    = doc["oled"]["width"]    | 128;
    oled_.height   = doc["oled"]["height"]   | 64;
    if (!doc["oled"].is<JsonObjectConst>()) {
        oled_.enabled = true;
        oled_.sda = 8;
        oled_.scl = 9;
        oled_.i2cAddr = 0x3C;
    }
    return true;
}

bool Config::save() {
    JsonDocument doc;
    doc["firstRun"] = firstRun_;
    doc["staEnabled"] = staEnabled_;
    doc["hostname"] = hostname_;
    doc["apSsid"]   = apSsid_;
    doc["staSsid"]  = staSsid_;
    doc["staPass"]  = staPass_;

    auto drv = doc["driver"].to<JsonObject>();
    drv["kind"]    = (int)driverKind_;
    auto pins = drv["pins"].to<JsonArray>();
    for (int i = 0; i < 8; ++i) pins.add(driverConfig_.pins[i]);
    drv["sda"]     = driverConfig_.sda;
    drv["scl"]     = driverConfig_.scl;
    drv["i2cAddr"] = driverConfig_.i2cAddr;
    drv["pwmHz"]   = driverConfig_.pwmHz;
    drv["pwmBits"] = driverConfig_.pwmBits;

    auto au = doc["audio"].to<JsonObject>();
    au["enabled"] = audio_.enabled;
    au["source"]  = (int)audio_.source;
    au["bclk"]    = audio_.i2sBclk;
    au["ws"]      = audio_.i2sWs;
    au["sd"]      = audio_.i2sSd;
    au["adc"]     = audio_.adcPin;
    au["gain"]    = audio_.gain;

    auto ld = doc["led"].to<JsonObject>();
    ld["enabled"] = led_.enabled;
    ld["pin"]     = led_.pin;
    ld["count"]   = led_.count;

    auto knobs = doc["knobs"].to<JsonArray>();
    for (size_t i = 0; i < knobCount_; ++i) {
        auto k = knobs.add<JsonObject>();
        k["enabled"] = knobs_[i].enabled;
        k["pin"]     = knobs_[i].pin;
        k["param"]   = knobs_[i].param;
    }

    auto ol = doc["oled"].to<JsonObject>();
    ol["enabled"] = oled_.enabled;
    ol["sda"]     = oled_.sda;
    ol["scl"]     = oled_.scl;
    ol["i2cAddr"]  = oled_.i2cAddr;
    ol["width"]    = oled_.width;
    ol["height"]   = oled_.height;

    File f = LittleFS.open(kTmpPath, "w");
    if (!f) return false;
    if (serializeJson(doc, f) == 0) { f.close(); return false; }
    f.close();
    LittleFS.remove(kPath);
    LittleFS.rename(kTmpPath, kPath);
    dirty_ = false;
    return true;
}

void Config::flushIfDirty() {
    if (!dirty_) return;
    // Debounce writes to spare flash. Hold for 1 s of quiet first.
    if (lastDirtyMs_ == 0) { lastDirtyMs_ = millis(); return; }
    if (millis() - lastDirtyMs_ < 1000) return;
    save();
    lastDirtyMs_ = 0;
}

} // namespace haxel
