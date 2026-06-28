#pragma once

#include <Arduino.h>
#include "../hal/IHapticDriver.h"

namespace haxel {

struct AudioConfig {
    bool    enabled = false;
    enum Source : uint8_t { NONE = 0, ADC = 1, I2S_MEMS = 2 } source = NONE;
    int8_t  i2sBclk = -1, i2sWs = -1, i2sSd = -1;
    int8_t  adcPin  = -1;
    float   gain = 1.0f;
};

struct LedConfig {
    bool     enabled = false;
    int8_t   pin = 2;
    uint16_t count = 60;
};

struct KnobConfig {
    bool   enabled = false;
    int8_t pin     = -1;
    String param   = "none";  // speed | intensity | gain | pattern param id | none
};

struct OledConfig {
    bool     enabled  = false;
    int8_t   sda      = 8;
    int8_t   scl      = 9;
    uint8_t  i2cAddr  = 0x3C;
    uint16_t width    = 128;
    uint16_t height   = 64;
};

class Config {
public:
    static constexpr size_t kMaxKnobs = 8;

    bool load();   // From /config.json; falls back to defaults on missing/invalid.
    bool save();   // Atomic write via tmp + rename.
    void flushIfDirty();
    void markDirty() { dirty_ = true; }

    bool firstRun() const { return firstRun_; }
    bool staEnabled() const { return staEnabled_; }
    String hostname() const { return hostname_; }
    String apSsid()  const { return apSsid_; }
    String staSsid() const { return staSsid_; }
    String staPass() const { return staPass_; }

    hal::DriverKind   driverKind()   const { return driverKind_; }
    const hal::DriverConfig& driverConfig() const { return driverConfig_; }

    bool         audioEnabled() const { return audio_.enabled; }
    const AudioConfig& audioConfig() const { return audio_; }

    bool         ledEnabled() const { return led_.enabled; }
    const LedConfig& ledConfig() const { return led_; }

    size_t knobCount() const { return knobCount_; }
    const KnobConfig& knob(size_t i) const { return knobs_[i]; }
    const KnobConfig* knobs() const { return knobs_; }
    bool         oledEnabled() const { return oled_.enabled; }
    const OledConfig& oledConfig() const { return oled_; }

    void setDriverKind(hal::DriverKind k) { driverKind_ = k; markDirty(); }
    void setDriverConfig(const hal::DriverConfig& c) { driverConfig_ = c; markDirty(); }
    void setStaEnabled(bool e) { staEnabled_ = e; markDirty(); }
    void setStaCredentials(const String& ssid, const String& pass) {
        staSsid_ = ssid; staPass_ = pass; markDirty();
    }
    void setHostname(const String& h) { hostname_ = h; markDirty(); }
    void setFirstRunComplete()        { firstRun_ = false; markDirty(); }
    void setAudioConfig(const AudioConfig& c) { audio_ = c; markDirty(); }
    void setLedConfig(const LedConfig& c) { led_ = c; markDirty(); }
    void setKnobs(const KnobConfig* knobs, size_t count);
    void setOledConfig(const OledConfig& c) { oled_ = c; markDirty(); }
    void setAudioGain(float g) { audio_.gain = g; markDirty(); }

private:
    bool firstRun_ = true;
    bool staEnabled_ = false;
    String hostname_ = "haxel";
    String apSsid_;
    String staSsid_;
    String staPass_;

    hal::DriverKind   driverKind_   = hal::DriverKind::L298N;
    hal::DriverConfig driverConfig_;

    AudioConfig audio_;
    LedConfig   led_;
    KnobConfig  knobs_[kMaxKnobs];
    size_t      knobCount_ = 0;
    OledConfig  oled_;

    bool   dirty_ = false;
    uint32_t lastDirtyMs_ = 0;

    void applyDefaults_();
    String generateApSsid_();
};

} // namespace haxel
