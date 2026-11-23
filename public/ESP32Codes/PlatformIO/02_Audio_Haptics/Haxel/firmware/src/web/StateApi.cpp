#include "StateApi.h"
#include "../core/Engine.h"
#include "../core/AudioAnalyzer.h"
#include "../core/Config.h"
#include "../core/PatternRegistry.h"
#include "../core/RuntimeStore.h"
#include "../patterns/CustomPattern.h"
#include "../patterns/Patterns.h"
#include <ArduinoJson.h>
#include <cstring>

namespace haxel::web {

using namespace haxel::core;

static volatile bool     sRebootPending = false;
static volatile uint32_t sRebootAtMs    = 0;

void requestDeferredReboot(uint32_t delayMs) {
    sRebootAtMs = millis() + delayMs;
    sRebootPending = true;
}

bool isDeferredRebootDue() {
    return sRebootPending && (int32_t)(millis() - sRebootAtMs) >= 0;
}

static void logIncomingJson_(const char* source, JsonObjectConst obj) {
    char buf[256];
    serializeJson(obj, buf, sizeof(buf));
    Serial.printf("[CTRL] %s <- %s\n", source, buf);
}

bool upsertCustomPattern(const char* id, const char* name, const char* code, String& errOut,
                         Engine* engine) {
    errOut = "";
    if (!id || !id[0] || !code || !code[0]) {
        errOut = "id and code are required";
        return false;
    }
    patterns::CustomPatternEvaluator evaluator;
    if (!evaluator.compile(code)) {
        errOut = evaluator.getLastError().c_str();
        Serial.printf("[CTRL] custom-pattern compile failed: %s\n", errOut.c_str());
        return false;
    }

    auto& reg = PatternRegistry::instance();
    reg.lockEval();
    IPattern* existing = reg.find(id);
    if (existing && strcmp(existing->meta().category, "custom") != 0) {
        reg.unlockEval();
        errOut = "cannot overwrite built-in pattern";
        Serial.printf("[CTRL] custom-pattern '%s' blocked (built-in)\n", id);
        return false;
    }
    patterns::CustomPattern* cp = new patterns::CustomPattern(
        id, name ? name : "", code);
    if (engine) engine->replacePatternById(id, cp);
    reg.unregisterPattern(id);
    reg.registerCustomPattern(cp);
    reg.unlockEval();

    const bool draft = (strncmp(id, "studio_draft", 12) == 0);
    if (!draft) {
        patterns::saveCustomPatterns(reg);
    }
    Serial.printf("[CTRL] custom-pattern registered id='%s' name='%s' draft=%d len=%u\n",
                  id, name ? name : "", (int)draft, (unsigned)strlen(code));
    return true;
}

bool deleteCustomPattern(const char* id, String& errOut, Engine* engine) {
    errOut = "";
    if (!id || !id[0]) {
        errOut = "id is required";
        return false;
    }
    auto& reg = PatternRegistry::instance();
    reg.lockEval();
    IPattern* existing = reg.find(id);
    if (existing && strcmp(existing->meta().category, "custom") != 0) {
        reg.unlockEval();
        errOut = "cannot delete built-in pattern";
        return false;
    }
    if (engine) engine->detachPatternById(id);
    reg.unregisterPattern(id);
    reg.unlockEval();
    patterns::saveCustomPatterns(reg);
    Serial.printf("[CTRL] custom-pattern deleted id='%s'\n", id);
    return true;
}

static void syncChannelEnablesToConfig_(Config* config, const StagedState& s) {
    if (!config) return;
    bool en[Config::kMaxChannels];
    for (size_t i = 0; i < Config::kMaxChannels; ++i) {
        en[i] = (i < s.channelCount) ? s.channels[i].on : config->channelEnabled(i);
    }
    config->setChannelEnabled(en, Config::kMaxChannels);
}

bool configPatchNeedsReboot(JsonObjectConst patch) {
    return patch["driver"].is<JsonObjectConst>()
        || patch["audio"].is<JsonObjectConst>()
        || patch["led"].is<JsonObjectConst>()
        || patch["oled"].is<JsonObjectConst>()
        || patch["knobs"].is<JsonArrayConst>()
        || patch["apSsid"].is<const char*>()
        || patch["staEnabled"].is<bool>()
        || patch["staSsid"].is<const char*>()
        || patch["meshRole"].is<int>();
}

void serializeState(JsonObject root, Engine* engine) {
    StagedState s;
    engine->copyState(s);
    root["on"] = s.on;
    root["mute"] = s.mute;
    root["intensity"] = s.intensity;
    root["speed"] = s.speed;
    root["freq"] = s.freq;
    char patId[32] = "";
    PatternRegistry::instance().copyIdIfValid(s.pattern, patId, sizeof(patId));
    root["pattern"] = patId;
    root["startupFloor"] = s.startupFloor;
    root["audioReactive"] = s.audioReactive;
    uint8_t nb = (s.numBins < 1) ? 1 : (s.numBins > 5 ? 5 : s.numBins);
    root["numBins"] = nb;

    auto divs = root["dividers"].to<JsonArray>();
    for (int i = 0; i < nb - 1 && i < 4; ++i) {
        divs.add(s.dividers[i]);
    }

    auto binPats = root["binPatterns"].to<JsonArray>();
    for (int i = 0; i < nb && i < 5; ++i) {
        binPats.add(s.binPatterns[i]);
    }

    auto ch = root["channels"].to<JsonArray>();
    for (int i = 0; i < s.channelCount; ++i) {
        auto c = ch.add<JsonObject>();
        c["on"] = s.channels[i].on;
        c["synced"] = s.channels[i].synced;
        c["intensity"] = s.channels[i].intensity;
        c["speed"] = s.channels[i].speed;
        c["startupFloor"] = s.channels[i].startupFloor;
        c["ceiling"] = s.channels[i].ceiling;
        char chPat[32] = "";
        if (s.channels[i].patternOverride) {
            PatternRegistry::instance().copyIdIfValid(s.channels[i].patternOverride, chPat, sizeof(chPat));
        }
        c["patternOverride"] = chPat;
    }
    auto info = root["info"].to<JsonObject>();
    info["version"] = HAXEL_VERSION_STR;
    info["uptime_ms"] = millis();
    info["heap_free"] = ESP.getFreeHeap();
}

void applyStatePatch(JsonObjectConst patch, Engine* engine, Config* config) {
    if (patch["af"].is<const char*>()) {
        const char* hex = patch["af"].as<const char*>();
        core::AudioFrame af{};
        af.valid = true;
        af.rms = patch["r"].is<float>() ? patch["r"].as<float>() : 1.0f;
        for (int i = 0; i < 32 && hex[i * 2] && hex[i * 2 + 1]; ++i) {
            auto hexNibble = [](char c) -> uint8_t {
                if (c >= '0' && c <= '9') return c - '0';
                if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
                if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
                return 0;
            };
            uint8_t byteVal = (hexNibble(hex[i * 2]) << 4) | hexNibble(hex[i * 2 + 1]);
            af.mags[i] = byteVal / 255.0f;
        }
        engine->pushRemoteAudio(af);
        if (patch.size() <= 2) return;
    }
    if (patch["audioFrame"].is<JsonObjectConst>()) {
        JsonObjectConst afObj = patch["audioFrame"].as<JsonObjectConst>();
        core::AudioFrame af{};
        af.valid = true;
        af.rms = afObj["rms"].is<float>() ? afObj["rms"].as<float>() : 1.0f;
        JsonArrayConst arr = afObj["mags"].as<JsonArrayConst>();
        if (arr) {
            int i = 0;
            for (JsonVariantConst v : arr) {
                if (i < 32) {
                    float val = v.as<float>();
                    af.mags[i++] = (val > 1.0f) ? (val / 255.0f) : val;
                }
            }
        }
        engine->pushRemoteAudio(af);
        if (patch.size() == 1) return;
    }
    logIncomingJson_("state", patch);

    if (patch["estop"].is<bool>() && patch["estop"].as<bool>()) {
        engine->requestEStop();
        Serial.println("[CTRL] E-stop requested");
        return;
    }
    if (patch["clear"].is<bool>() && patch["clear"].as<bool>()) {
        engine->requestClearFault();
    }

    StagedState s;
    engine->copyState(s);
    if (patch["on"].is<bool>()) {
        s.on = patch["on"].as<bool>();
        if (s.on && !(patch["mute"].is<bool>() && patch["mute"].as<bool>())) {
            s.mute = false;
            s.clearFault = true;
        }
    }
    if (patch["mute"].is<bool>())      s.mute      = patch["mute"].as<bool>();
    if (patch["intensity"].is<float>())s.intensity = patch["intensity"].as<float>();
    if (patch["speed"].is<float>())    s.speed     = patch["speed"].as<float>();
    if (patch["freq"].is<float>()) {
        float f = patch["freq"].as<float>();
        if (f < 10.0f) f = 10.0f;
        if (f > 500.0f) f = 500.0f;
        s.freq = f;
    }
    if (patch["audioGain"].is<float>()) {
        float g = patch["audioGain"].as<float>();
        if (g < 0.1f) g = 0.1f;
        if (g > 10.0f) g = 10.0f;
        if (config) config->setAudioGain(g);
        if (engine->attachedAudio()) engine->attachedAudio()->setGain(g);
    }
    if (patch["clear"].is<bool>())     s.clearFault = patch["clear"].as<bool>();

    if (patch["startupFloor"].is<float>()) s.startupFloor = patch["startupFloor"].as<float>();
    if (patch["audioReactive"].is<bool>()) s.audioReactive = patch["audioReactive"].as<bool>();
    if (patch["numBins"].is<int>()) {
        int nb = patch["numBins"].as<int>();
        if (nb < 1) nb = 1;
        if (nb > 5) nb = 5;
        s.numBins = (uint8_t)nb;
    }
    if (patch["dividers"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["dividers"].as<JsonArrayConst>()) {
            if (i < 4) {
                int d = v.as<int>();
                if (d < 1) d = 1;
                if (d > 31) d = 31;
                s.dividers[i++] = (uint8_t)d;
            }
        }
    }
    if (patch["binPatterns"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["binPatterns"].as<JsonArrayConst>()) {
            if (i < 5) {
                strncpy(s.binPatterns[i], v.as<const char*>(), sizeof(s.binPatterns[i]) - 1);
                s.binPatterns[i][sizeof(s.binPatterns[i]) - 1] = '\0';
                i++;
            }
        }
    }

    if (patch["bri"].is<int>()) s.intensity = patch["bri"].as<int>() / 255.0f;

    if (patch["pattern"].is<const char*>()) {
        const char* pid = patch["pattern"].as<const char*>();
        IPattern* p = PatternRegistry::instance().find(pid);
        // BLE/UI may select a custom id before the body arrives — accept inline code.
        if (!p && patch["code"].is<const char*>()) {
            const char* pname = patch["name"].is<const char*>()
                ? patch["name"].as<const char*>() : "Custom";
            String err;
            if (upsertCustomPattern(pid, pname, patch["code"].as<const char*>(), err, engine)) {
                p = PatternRegistry::instance().find(pid);
            } else {
                Serial.printf("[CTRL] inline custom-pattern failed: %s\n", err.c_str());
            }
        }
        if (p) {
            s.pattern = p;
            Serial.printf("[CTRL] pattern '%s' -> loaded '%s'\n", pid, pid);
        } else {
            char curId[32] = "";
            PatternRegistry::instance().copyIdIfValid(s.pattern, curId, sizeof(curId));
            Serial.printf("[CTRL] pattern '%s' -> NOT FOUND (keeping '%s')\n",
                          pid, curId[0] ? curId : "(none)");
        }
    }
    if (patch["seg"][0]["fx"].is<int>()) {
        int idx = patch["seg"][0]["fx"].as<int>();
        IPattern* p = PatternRegistry::instance().at((size_t)idx);
        if (p) {
            s.pattern = p;
            Serial.printf("[CTRL] seg.fx=%d -> pattern '%s'\n", idx, p->id());
        }
    }
    if (patch["params"].is<JsonObjectConst>() && s.pattern) {
        PatternRegistry::instance().lockEval();
        if (PatternRegistry::instance().contains(s.pattern)) {
            for (auto kv : patch["params"].as<JsonObjectConst>()) {
                s.pattern->setParam(kv.key().c_str(), kv.value().as<float>());
                Serial.printf("[CTRL] param %s=%g\n", kv.key().c_str(), kv.value().as<float>());
            }
        }
        PatternRegistry::instance().unlockEval();
    }

    if (patch["channels"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["channels"].as<JsonArrayConst>()) {
            if (i >= 8) break;
            if (v.is<bool>()) {
                s.channels[i].on = v.as<bool>();
            } else if (v.is<JsonObjectConst>()) {
                JsonObjectConst o = v.as<JsonObjectConst>();
                if (o["on"].is<bool>()) s.channels[i].on = o["on"].as<bool>();
                if (o["synced"].is<bool>()) s.channels[i].synced = o["synced"].as<bool>();
                if (o["intensity"].is<float>()) {
                    float val = o["intensity"].as<float>();
                    s.channels[i].intensity = val < 0.0f ? 0.0f : (val > 1.0f ? 1.0f : val);
                }
                if (o["speed"].is<float>()) {
                    float val = o["speed"].as<float>();
                    s.channels[i].speed = val < 0.25f ? 0.25f : (val > 4.0f ? 4.0f : val);
                }
                if (o["startupFloor"].is<float>()) {
                    float val = o["startupFloor"].as<float>();
                    s.channels[i].startupFloor = val < 0.0f ? 0.0f : (val > 1.0f ? 1.0f : val);
                }
                if (o["ceiling"].is<float>()) {
                    float val = o["ceiling"].as<float>();
                    s.channels[i].ceiling = val < 0.0f ? 0.0f : (val > 1.0f ? 1.0f : val);
                }
                if (o["patternOverride"].is<const char*>()) {
                    const char* pid = o["patternOverride"].as<const char*>();
                    if (!pid || pid[0] == '\0' || strcmp(pid, "none") == 0 || strcmp(pid, "master") == 0) {
                        s.channels[i].patternOverride = nullptr;
                    } else {
                        IPattern* cp = PatternRegistry::instance().find(pid);
                        if (cp) s.channels[i].patternOverride = cp;
                    }
                }
            }
            ++i;
        }
    }

    engine->stageState(s);
    char stagedPatId[32] = "";
    PatternRegistry::instance().copyIdIfValid(s.pattern, stagedPatId, sizeof(stagedPatId));
    Serial.printf("[CTRL] staged on=%d intensity=%.2f speed=%.2f pattern=%s\n",
                  (int)s.on, s.intensity, s.speed,
                  stagedPatId[0] ? stagedPatId : "(none)");
    if (config && patch["channels"].is<JsonArrayConst>()) {
        syncChannelEnablesToConfig_(config, s);
        config->markDirty();
    }
    markRuntimeDirty(s);
}

void applyConfigPatch(JsonObjectConst patch, Config* config, Engine* engine, bool persist) {
    logIncomingJson_("config", patch);
    if (patch["driver"].is<JsonObjectConst>()) {
        hal::DriverConfig dc = config->driverConfig();
        JsonObjectConst d = patch["driver"].as<JsonObjectConst>();
        if (d["kind"].is<int>()) {
            config->setDriverKind((hal::DriverKind)(int)d["kind"]);
            dc.kind = config->driverKind();
        }
        if (d["pins"].is<JsonArrayConst>()) {
            int i = 0;
            for (JsonVariantConst p : d["pins"].as<JsonArrayConst>()) {
                if (i < 8) dc.pins[i++] = p.as<int>();
            }
        }
        if (d["sda"].is<int>())   dc.sda   = d["sda"];
        if (d["scl"].is<int>())   dc.scl   = d["scl"];
        if (d["pwmHz"].is<int>()) dc.pwmHz = d["pwmHz"];
        if (d["flags"].is<uint32_t>()) dc.flags = d["flags"];
        config->setDriverConfig(dc);
    }
    if (patch["hostname"].is<const char*>()) {
        config->setHostname(patch["hostname"].as<const char*>());
    }
    if (patch["apSsid"].is<const char*>()) {
        config->setApSsid(patch["apSsid"].as<const char*>());
    }
    if (patch["staEnabled"].is<bool>()) {
        config->setStaEnabled(patch["staEnabled"].as<bool>());
    }
    if (patch["staSsid"].is<const char*>() || patch["staPass"].is<const char*>()) {
        String ssid = patch["staSsid"].is<const char*>() ? String(patch["staSsid"].as<const char*>()) : config->staSsid();
        String pass = patch["staPass"].is<const char*>() ? String(patch["staPass"].as<const char*>()) : config->staPass();
        config->setStaCredentials(ssid, pass);
    }
    if (patch["knobs"].is<JsonArrayConst>()) {
        KnobConfig knobs[Config::kMaxKnobs];
        size_t count = 0;
        for (JsonObjectConst k : patch["knobs"].as<JsonArrayConst>()) {
            if (count >= Config::kMaxKnobs) break;
            knobs[count].enabled = k["enabled"] | true;
            knobs[count].pin     = k["pin"]     | -1;
            knobs[count].param   = (const char*)(k["param"] | "none");
            count++;
        }
        config->setKnobs(knobs, count);
    }
    if (patch["oled"].is<JsonObjectConst>()) {
        OledConfig oc = config->oledConfig();
        JsonObjectConst o = patch["oled"].as<JsonObjectConst>();
        if (o["enabled"].is<bool>()) oc.enabled = o["enabled"];
        if (o["sda"].is<int>())      oc.sda     = o["sda"];
        if (o["scl"].is<int>())      oc.scl     = o["scl"];
        if (o["i2cAddr"].is<int>())  oc.i2cAddr = (uint8_t)o["i2cAddr"].as<int>();
        if (o["width"].is<int>())    oc.width   = o["width"];
        if (o["height"].is<int>())   oc.height  = o["height"];
        config->setOledConfig(oc);
    }
    if (patch["eStopPin"].is<int>()) {
        config->setEStopPin((int8_t)patch["eStopPin"].as<int>());
    }
    if (patch["meshRole"].is<int>()) {
        int mr = patch["meshRole"].as<int>();
        if (mr >= 0 && mr <= 2) {
            config->setMeshRole((MeshRole)mr);
        }
    }
    if (patch["channelEnabled"].is<JsonArrayConst>()) {
        bool en[Config::kMaxChannels];
        for (size_t i = 0; i < Config::kMaxChannels; ++i) {
            en[i] = config->channelEnabled(i);
        }
        size_t i = 0;
        for (JsonVariantConst v : patch["channelEnabled"].as<JsonArrayConst>()) {
            if (i >= Config::kMaxChannels) break;
            en[i++] = v.as<bool>();
        }
        config->setChannelEnabled(en, Config::kMaxChannels);
        if (engine) {
            StagedState s;
            engine->copyState(s);
            for (uint8_t c = 0; c < s.channelCount && c < Config::kMaxChannels; ++c) {
                s.channels[c].on = en[c];
            }
            engine->stageState(s);
        }
    }
    if (patch["led"].is<JsonObjectConst>()) {
        LedConfig lc = config->ledConfig();
        JsonObjectConst l = patch["led"].as<JsonObjectConst>();
        if (l["enabled"].is<bool>()) lc.enabled = l["enabled"];
        if (l["pin"].is<int>())      lc.pin     = l["pin"];
        if (l["count"].is<int>())    lc.count   = l["count"];
        config->setLedConfig(lc);
    }
    if (patch["audio"].is<JsonObjectConst>()) {
        AudioConfig ac = config->audioConfig();
        JsonObjectConst a = patch["audio"].as<JsonObjectConst>();
        if (a["enabled"].is<bool>()) ac.enabled = a["enabled"];
        if (a["source"].is<int>())   ac.source  = a["source"];
        if (a["bclk"].is<int>())     ac.i2sBclk = a["bclk"];
        if (a["ws"].is<int>())       ac.i2sWs   = a["ws"];
        if (a["sd"].is<int>())       ac.i2sSd   = a["sd"];
        if (a["adc"].is<int>())      ac.adcPin  = a["adc"];
        if (a["gain"].is<float>()) {
            float g = a["gain"].as<float>();
            if (g < 0.1f) g = 0.1f;
            if (g > 10.0f) g = 10.0f;
            ac.gain = g;
            if (engine && engine->attachedAudio()) engine->attachedAudio()->setGain(g);
        }
        config->setAudioConfig(ac);
    }
    if (persist) {
        config->setFirstRunComplete();
        config->save();
    }
}

} // namespace haxel::web
