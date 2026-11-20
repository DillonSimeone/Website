#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
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
    bool     enabled = true;
    int8_t   pin = 5;
    uint16_t count = 20;
};

struct KnobConfig {
    bool   enabled = false;
    int8_t pin     = -1;
    String param   = "none";  // speed | intensity | gain | pattern param id | none
    KnobConfig() = default;
    KnobConfig(bool e, int8_t p, const String& pr) : enabled(e), pin(p), param(pr) {}
};

struct OledConfig {
    bool     enabled  = false;
    int8_t   sda      = 8;
    int8_t   scl      = 9;
    uint8_t  i2cAddr  = 0x3C;
    uint16_t width    = 128;
    uint16_t height   = 64;
};

enum class MeshRole : uint8_t {
    STANDALONE = 0,
    MASTER     = 1,
    FOLLOWER   = 2,
};

class Config {
public:
    static constexpr size_t kMaxKnobs = 8;
    static constexpr size_t kMaxChannels = 8;

    Config();

    bool load();   // From /config.json; falls back to defaults on missing/invalid.
    bool save();   // Atomic write via tmp + rename.
    void flushIfDirty();
    void markDirty() { Lock lk(this); dirty_ = true; lastDirtyMs_ = millis(); }

    bool firstRun() const { Lock lk(this); return firstRun_; }
    bool staEnabled() const { Lock lk(this); return staEnabled_; }
    String hostname() const { Lock lk(this); return hostname_; }
    String apSsid()  const { Lock lk(this); return apSsid_; }
    String staSsid() const { Lock lk(this); return staSsid_; }
    String staPass() const { Lock lk(this); return staPass_; }

    hal::DriverKind   driverKind()   const { Lock lk(this); return driverKind_; }
    hal::DriverConfig driverConfig() const { Lock lk(this); return driverConfig_; }

    bool        audioEnabled() const { Lock lk(this); return audio_.enabled; }
    AudioConfig audioConfig()  const { Lock lk(this); return audio_; }

    bool      ledEnabled() const { Lock lk(this); return led_.enabled; }
    LedConfig ledConfig()  const { Lock lk(this); return led_; }

    size_t     knobCount() const { Lock lk(this); return knobCount_; }
    KnobConfig knob(size_t i) const { Lock lk(this); return i < kMaxKnobs ? knobs_[i] : KnobConfig{}; }
    bool       oledEnabled() const { Lock lk(this); return oled_.enabled; }
    OledConfig oledConfig()  const { Lock lk(this); return oled_; }

    // Optional active-low E-stop GPIO. -1 = disabled.
    int8_t eStopPin() const { Lock lk(this); return eStopPin_; }
    void setEStopPin(int8_t pin) { Lock lk(this); eStopPin_ = pin; markDirty(); }

    MeshRole meshRole() const { Lock lk(this); return meshRole_; }
    void setMeshRole(MeshRole r) { Lock lk(this); meshRole_ = r; markDirty(); }

    bool channelEnabled(size_t i) const {
        Lock lk(this);
        return i < kMaxChannels ? channelEnabled_[i] : true;
    }
    void setChannelEnabled(const bool* enabled, size_t count);

    void setDriverKind(hal::DriverKind k) { Lock lk(this); driverKind_ = k; markDirty(); }
    void setDriverConfig(const hal::DriverConfig& c) { Lock lk(this); driverConfig_ = c; markDirty(); }
    void setStaEnabled(bool e) { Lock lk(this); staEnabled_ = e; markDirty(); }
    void setStaCredentials(const String& ssid, const String& pass) {
        Lock lk(this);
        staSsid_ = ssid; staPass_ = pass; markDirty();
    }
    void setHostname(const String& h) { Lock lk(this); hostname_ = h; markDirty(); }
    void setApSsid(const String& ssid);
    void setFirstRunComplete()        { Lock lk(this); firstRun_ = false; markDirty(); }
    void setAudioConfig(const AudioConfig& c) { Lock lk(this); audio_ = c; markDirty(); }
    void setLedConfig(const LedConfig& c) { Lock lk(this); led_ = c; markDirty(); }
    void setKnobs(const KnobConfig* knobs, size_t count);
    void setOledConfig(const OledConfig& c) { Lock lk(this); oled_ = c; markDirty(); }
    void setAudioGain(float g) { Lock lk(this); audio_.gain = g; markDirty(); }

    // Single source of truth for Config JSON serialization.
    void driverToJson(JsonObject drv, bool includeDriverExtra = true) const;
    void audioToJson(JsonObject au) const;
    void ledToJson(JsonObject ld) const;
    void oledToJson(JsonObject ol) const;
    void toJson(JsonObject root, bool includeSecrets = false) const;

private:
    struct Lock {
        const Config* cfg;
        explicit Lock(const Config* c) : cfg(c) { cfg->lock_(); }
        ~Lock() { cfg->unlock_(); }
    };
    void lock_() const;
    void unlock_() const;
    mutable void* mux_ = nullptr;
    bool firstRun_ = true;
    bool staEnabled_ = false;
    String hostname_ = "haxel";
    String apSsid_;
    String staSsid_;
    String staPass_;

    hal::DriverKind   driverKind_   = hal::DriverKind::MOSFET;
    hal::DriverConfig driverConfig_;

    AudioConfig audio_;
    LedConfig   led_;
    KnobConfig  knobs_[kMaxKnobs];
    size_t      knobCount_ = 0;
    OledConfig  oled_;
    int8_t      eStopPin_ = -1;
    MeshRole    meshRole_ = MeshRole::STANDALONE;
    bool        channelEnabled_[kMaxChannels] = {
        true, true, true, true, true, true, true, true
    };

    bool   dirty_ = false;
    uint32_t lastDirtyMs_ = 0;
    String lastSavedJson_;

    void applyDefaults_();
    String generateApSsid_();
};

} // namespace haxel
