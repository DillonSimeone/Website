#include "Config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <WiFi.h>

namespace hapticblaze {

static constexpr const char* kPath    = "/config.json";
static constexpr const char* kTmpPath = "/config.json.tmp";

void Config::applyDefaults_() {
    firstRun_ = true;
    staEnabled_ = false;
    hostname_ = "hapticblaze";
    apSsid_   = generateApSsid_();
    staSsid_  = "Cumzone - FishyZone";
    staPass_  = "7414stinky$$$";

    driverKind_ = hal::DriverKind::L298N;
    driverConfig_ = {};
    driverConfig_.kind = driverKind_;
    // Default L298N config: ESP32-C3 + Mini L298N on pins 21 (ENA/PWM), 20 (IN1 dir)
    for (int i = 0; i < 8; ++i) driverConfig_.pins[i] = -1;
    #ifdef HAPTICBLAZE_TARGET_C3
    driverConfig_.pins[0] = -1;  // No ENA (using mini L298N sign-magnitude mode)
    driverConfig_.pins[1] = 20;  // Motor 1 IN1 (Forward)
    driverConfig_.pins[2] = 21;  // Motor 1 IN2 (Backward)
    #endif
    driverConfig_.pwmHz = 20000;
    driverConfig_.pwmBits = 10;

    audio_ = {};
}

String Config::generateApSsid_() {
    uint64_t mac = ESP.getEfuseMac();
    char buf[32];
    snprintf(buf, sizeof(buf), "HapticBlaze-%04X",
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
    hostname_ = (const char*)(doc["hostname"] | "hapticblaze");
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

} // namespace hapticblaze
