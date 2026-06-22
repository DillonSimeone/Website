#include "ApiHandlers.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/AudioAnalyzer.h"
#include "../core/PatternRegistry.h"
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <Update.h>

namespace haxel::web {

using namespace haxel::core;

namespace {

void serializeState(JsonObject root, Engine* engine) {
    StagedState s;
    engine->copyState(s);
    root["on"] = s.on;
    root["mute"] = s.mute;
    root["intensity"] = s.intensity;
    root["speed"] = s.speed;
    root["pattern"] = s.pattern ? s.pattern->id() : "";
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
    StagedState s;
    engine->copyState(s);
    if (patch["on"].is<bool>())        s.on        = patch["on"].as<bool>();
    if (patch["mute"].is<bool>())      s.mute      = patch["mute"].as<bool>();
    if (patch["intensity"].is<float>())s.intensity = patch["intensity"].as<float>();
    if (patch["speed"].is<float>())    s.speed     = patch["speed"].as<float>();
    if (patch["clear"].is<bool>())     s.clearFault = patch["clear"].as<bool>();

    if (patch["bri"].is<int>()) s.intensity = patch["bri"].as<int>() / 255.0f;

    if (patch["pattern"].is<const char*>()) {
        const char* pid = patch["pattern"].as<const char*>();
        IPattern* p = PatternRegistry::instance().find(pid);
        if (p) s.pattern = p;
    }
    if (patch["seg"][0]["fx"].is<int>()) {
        int idx = patch["seg"][0]["fx"].as<int>();
        IPattern* p = PatternRegistry::instance().at((size_t)idx);
        if (p) s.pattern = p;
    }
    if (patch["params"].is<JsonObjectConst>() && s.pattern) {
        for (auto kv : patch["params"].as<JsonObjectConst>()) {
            s.pattern->setParam(kv.key().c_str(), kv.value().as<float>());
        }
    }
    engine->stageState(s);
}

void applyConfigPatch(JsonObjectConst patch, Config* config) {
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
    config->setFirstRunComplete();
    config->save();
}

} // anon

void ApiHandlers::install(AsyncWebServer& server, Engine* engine, Config* config, AudioAnalyzer* audio) {

    // ----- GET endpoints -----

    server.on("/json/gpios", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
#if defined(CONFIG_IDF_TARGET_ESP32C3)
        doc["target"] = "esp32-c3";
        int safe[] = {0,1,3,4,5,6,7,10,20,21};
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
        doc["target"] = "esp32-s3";
        int safe[] = {1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,33,34,35,36,37,38,39,40,41,42,47,48};
#else
        doc["target"] = "esp32";
        int safe[] = {4,13,14,16,17,18,19,21,22,23,25,26,27,32,33};
#endif
        auto arr = doc["available"].to<JsonArray>();
        for (int p : safe) arr.add(p);
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    server.on("/json/config", HTTP_GET, [config](AsyncWebServerRequest* req) {
        JsonDocument doc;
        doc["firstRun"] = config->firstRun();
        doc["hostname"] = config->hostname();
        auto drv = doc["driver"].to<JsonObject>();
        drv["kind"]  = (int)config->driverKind();
        const auto& dc = config->driverConfig();
        auto pins = drv["pins"].to<JsonArray>();
        for (int i = 0; i < 8; ++i) pins.add(dc.pins[i]);
        drv["sda"] = dc.sda;
        drv["scl"] = dc.scl;
        drv["pwmHz"] = dc.pwmHz;
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    server.on("/json", HTTP_GET, [engine](AsyncWebServerRequest* req) {
        JsonDocument doc;
        serializeState(doc["state"].to<JsonObject>(), engine);
        auto pats = doc["patterns"].to<JsonArray>();
        for (auto* p : PatternRegistry::instance().all()) {
            auto m = pats.add<JsonObject>();
            const auto& meta = p->meta();
            m["id"] = meta.id;
            m["category"] = meta.category;
            m["tags"] = meta.tags;
            m["description"] = meta.description;
            m["multiChannel"] = meta.multiChannel;
            m["usesAudio"] = meta.usesAudio;
            auto params = m["params"].to<JsonArray>();
            for (int i = 0; i < meta.paramCount; ++i) {
                const auto& pm = meta.params[i];
                auto pe = params.add<JsonObject>();
                pe["id"] = pm.id;
                pe["label"] = pm.label;
                pe["type"] = (int)pm.type;
                pe["min"] = pm.minV;
                pe["max"] = pm.maxV;
                pe["default"] = pm.defaultV;
            }
        }
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    server.on("/json/state", HTTP_GET, [engine](AsyncWebServerRequest* req) {
        JsonDocument doc;
        serializeState(doc.to<JsonObject>(), engine);
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    server.on("/json/diag", HTTP_GET, [engine, audio](AsyncWebServerRequest* req) {
        JsonDocument doc;
        auto d = engine->diag();
        doc["uptime_ms"] = millis();
        doc["heap_free"] = ESP.getFreeHeap();
        doc["tick_count"] = d.tickCount;
        auto j = doc["jitter_us"].to<JsonObject>();
        j["p50"] = d.jitterP50_us;
        j["p99"] = d.jitterP99_us;
        j["max"] = d.jitterMax_us;
        doc["state"] = (int)d.state;
        doc["fault"] = d.faultCode ? d.faultCode : (const char*)nullptr;
        doc["audio_ready"] = audio && audio->ready();
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    // ----- JSON POST/PUT endpoints via AsyncCallbackJsonWebHandler -----
    // This is the canonical pattern: the framework owns body buffering,
    // content-type check, and JSON parse. Our callback gets a parsed
    // JsonVariant and is responsible only for the response.

    auto* stateJson = new AsyncCallbackJsonWebHandler("/json/state",
        [engine](AsyncWebServerRequest* req, JsonVariant& json) {
            JsonObjectConst patch = json.as<JsonObjectConst>();
            if (patch["reboot"].is<bool>() && patch["reboot"].as<bool>()) {
                req->send(200, "application/json", "{\"ok\":true,\"reboot\":true}");
                delay(800);
                ESP.restart();
                return;
            }
            applyStatePatch(patch, engine);
            JsonDocument out;
            serializeState(out.to<JsonObject>(), engine);
            String body; serializeJson(out, body);
            req->send(200, "application/json", body);
        });
    stateJson->setMethod(HTTP_POST | HTTP_PUT);
    server.addHandler(stateJson);

    auto* configJson = new AsyncCallbackJsonWebHandler("/json/config",
        [config](AsyncWebServerRequest* req, JsonVariant& json) {
            applyConfigPatch(json.as<JsonObjectConst>(), config);
            req->send(200, "application/json", "{\"ok\":true,\"reboot\":true}");
            // Generous flush window before reboot — async send queues the
            // response into AsyncTCP and we need the socket to drain.
            delay(800);
            ESP.restart();
        });
    configJson->setMethod(HTTP_POST | HTTP_PUT);
    server.addHandler(configJson);

    // ----- Query-param POSTs -----

    auto buzzHandler = [engine](AsyncWebServerRequest* req) {
        float intensity = 0.7f;
        uint32_t ms     = 600;
        if (req->hasParam("intensity")) intensity = req->getParam("intensity")->value().toFloat();
        if (req->hasParam("ms"))        ms        = req->getParam("ms")->value().toInt();

        StagedState s;
        engine->copyState(s);
        s.on = true;
        s.intensity = intensity;
        IPattern* p = PatternRegistry::instance().find("Pulse");
        if (p) {
            p->setParam("period_ms", (float)(ms * 2));
            p->setParam("duty",      0.5f);
            p->setParam("intensity", 1.0f);
            s.pattern = p;
        }
        engine->stageState(s);
        req->send(200, "application/json", String("{\"ok\":true,\"ms\":") + ms + "}");
    };
    server.on("/json/buzz", HTTP_GET,  buzzHandler);
    server.on("/json/buzz", HTTP_POST, buzzHandler);

    // ----- OTA -----

    server.on("/update", HTTP_POST,
        [](AsyncWebServerRequest* req) {
            bool ok = !Update.hasError();
            req->send(ok ? 200 : 400, "text/plain", ok ? "OK" : Update.errorString());
            if (ok) ESP.restart();
        },
        [](AsyncWebServerRequest* /*req*/, String /*filename*/, size_t index,
           uint8_t* data, size_t len, bool final) {
            if (index == 0) Update.begin(UPDATE_SIZE_UNKNOWN);
            Update.write(data, len);
            if (final) Update.end(true);
        });
}

void ApiHandlers::handleWlenWin(AsyncWebServerRequest* req, Engine* engine) {
    StagedState s;
    engine->copyState(s);
    if (req->hasParam("T")) {
        int t = req->getParam("T")->value().toInt();
        if (t == 0) s.on = false;
        else if (t == 1) s.on = true;
        else if (t == 2) s.on = !s.on;
    }
    if (req->hasParam("A")) {
        int a = req->getParam("A")->value().toInt();
        s.intensity = (a < 0 ? 0 : a > 255 ? 255 : a) / 255.0f;
    }
    if (req->hasParam("FX")) {
        int fx = req->getParam("FX")->value().toInt();
        IPattern* p = PatternRegistry::instance().at((size_t)fx);
        if (p) s.pattern = p;
    }
    if (req->hasParam("SX")) {
        int sx = req->getParam("SX")->value().toInt();
        s.speed = 0.25f + (sx / 255.0f) * 3.75f;
    }
    if (req->hasParam("RB")) { req->send(200, "text/plain", "OK"); ESP.restart(); return; }
    engine->stageState(s);
    req->send(200, "text/plain", "OK");
}

void ApiHandlers::handleWebSocket(AsyncWebSocket* /*server*/,
                                  AsyncWebSocketClient* client,
                                  AwsEventType type,
                                  void* arg, uint8_t* data, size_t len,
                                  Engine* engine) {
    if (type != WS_EVT_DATA) return;
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (!info->final || info->index != 0 || info->len != len) return;

    JsonDocument doc;
    if (deserializeJson(doc, data, len)) return;
    const char* msgType = doc["type"] | "";
    if (!strcmp(msgType, "state")) {
        applyStatePatch(doc["patch"].as<JsonObjectConst>(), engine);
    } else if (!strcmp(msgType, "external")) {
        uint8_t ch = doc["channel"] | 0;
        float v   = doc["value"]   | 0.0f;
        engine->pushExternal(ch, v);
    } else if (!strcmp(msgType, "ping")) {
        client->text("{\"type\":\"pong\"}");
    }
}

} // namespace haxel::web
