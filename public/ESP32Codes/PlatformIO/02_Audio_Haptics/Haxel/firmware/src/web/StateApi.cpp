#include "StateApi.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/PatternRegistry.h"
#include "../core/RuntimeStore.h"
#include <ArduinoJson.h>
#include <cstring>

namespace haxel::web {

using namespace haxel::core;

static void logIncomingJson_(const char* source, JsonObjectConst obj) {
    String body;
    serializeJson(obj, body);
    Serial.printf("[CTRL] %s <- %s\n", source, body.c_str());
}

void serializeState(JsonObject root, Engine* engine) {
    StagedState s;
    engine->copyState(s);
    root["on"] = s.on;
    root["mute"] = s.mute;
    root["intensity"] = s.intensity;
    root["speed"] = s.speed;
    root["pattern"] = s.pattern ? s.pattern->id() : "";
    root["startupFloor"] = s.startupFloor;
    root["numBins"] = s.numBins;

    auto divs = root["dividers"].to<JsonArray>();
    for (int i = 0; i < s.numBins - 1 && i < 4; ++i) {
        divs.add(s.dividers[i]);
    }

    auto binPats = root["binPatterns"].to<JsonArray>();
    for (int i = 0; i < s.numBins && i < 5; ++i) {
        binPats.add(s.binPatterns[i]);
    }

    auto ch = root["channels"].to<JsonArray>();
    for (int i = 0; i < s.channelCount; ++i) {
        auto c = ch.add<JsonObject>();
        c["on"] = s.channels[i].on;
        c["intensity"] = s.channels[i].intensity;
    }
    auto info = root["info"].to<JsonObject>();
    info["version"] = HAXEL_VERSION_STR;
    info["uptime_ms"] = millis();
    info["heap_free"] = ESP.getFreeHeap();
}

void applyStatePatch(JsonObjectConst patch, Engine* engine) {
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
    if (patch["on"].is<bool>())        s.on        = patch["on"].as<bool>();
    if (patch["mute"].is<bool>())      s.mute      = patch["mute"].as<bool>();
    if (patch["intensity"].is<float>())s.intensity = patch["intensity"].as<float>();
    if (patch["speed"].is<float>())    s.speed     = patch["speed"].as<float>();
    if (patch["clear"].is<bool>())     s.clearFault = patch["clear"].as<bool>();

    if (patch["startupFloor"].is<float>()) s.startupFloor = patch["startupFloor"].as<float>();
    if (patch["numBins"].is<int>())        s.numBins      = patch["numBins"].as<int>();
    if (patch["dividers"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["dividers"].as<JsonArrayConst>()) {
            if (i < 4) s.dividers[i++] = v.as<int>();
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
        if (p) {
            s.pattern = p;
            Serial.printf("[CTRL] pattern '%s' -> loaded '%s'\n", pid, p->id());
        } else {
            Serial.printf("[CTRL] pattern '%s' -> NOT FOUND (keeping '%s')\n",
                          pid, s.pattern ? s.pattern->id() : "(none)");
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
        for (auto kv : patch["params"].as<JsonObjectConst>()) {
            s.pattern->setParam(kv.key().c_str(), kv.value().as<float>());
            Serial.printf("[CTRL] param %s=%g\n", kv.key().c_str(), kv.value().as<float>());
        }
    }
    engine->stageState(s);
    Serial.printf("[CTRL] staged on=%d intensity=%.2f speed=%.2f pattern=%s\n",
                  (int)s.on, s.intensity, s.speed,
                  s.pattern ? s.pattern->id() : "(none)");
    markRuntimeDirty(s);
}

void applyConfigPatch(JsonObjectConst patch, Config* config) {
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
        config->setAudioConfig(ac);
    }
    config->setFirstRunComplete();
    config->save();
}

} // namespace haxel::web
