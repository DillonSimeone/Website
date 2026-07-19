#include "ApiHandlers.h"

#ifdef HAXEL_WIFI

#include "StateApi.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/AudioAnalyzer.h"
#include "../core/PatternRegistry.h"
#include "../core/RuntimeStore.h"
#include "../patterns/CustomPattern.h"
#include "../patterns/Patterns.h"
#if HAXEL_FEATURE_MESH_MASTER
#include "../mesh/MeshMaster.h"
#endif
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <Update.h>

namespace haxel::web {

using namespace haxel::core;

void ApiHandlers::install(AsyncWebServer& server, Engine* engine, Config* config, AudioAnalyzer* audio) {

    // ----- GET endpoints -----

    server.on("/json/gpios", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
#if defined(CONFIG_IDF_TARGET_ESP32C3)
        doc["target"] = "esp32-c3";
        int safe[] = {0,1,2,3,4,5,6,7,8,9,10,20,21};
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
        doc["target"] = "esp32-s3";
        int safe[] = {1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,21,33,34,35,36,37,38,39,40,41,42,47,48};
#else
        doc["target"] = "esp32";
        int safe[] = {4,13,14,16,17,18,19,21,22,23,25,26,27,32,33};
#endif
        auto arr = doc["available"].to<JsonArray>();
        for (int p : safe) arr.add(p);
        auto adc = doc["adc"].to<JsonArray>();
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(CONFIG_IDF_TARGET_ESP32H2)
        int adcPins[] = {0, 1, 2, 3, 4};
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
        int adcPins[] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20};
#else
        int adcPins[] = {32,33,34,35,36,37,38,39};
#endif
        for (int p : adcPins) adc.add(p);
        String body; serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    server.on("/json/config", HTTP_GET, [config](AsyncWebServerRequest* req) {
        JsonDocument doc;
        doc["firstRun"] = config->firstRun();
        doc["hostname"] = config->hostname();
        doc["apSsid"] = config->apSsid();
        auto drv = doc["driver"].to<JsonObject>();
        drv["kind"]  = (int)config->driverKind();
        const auto& dc = config->driverConfig();
        auto pins = drv["pins"].to<JsonArray>();
        for (int i = 0; i < 8; ++i) pins.add(dc.pins[i]);
        drv["sda"] = dc.sda;
        drv["scl"] = dc.scl;
        drv["pwmHz"] = dc.pwmHz;

        auto au = doc["audio"].to<JsonObject>();
        const auto& ac = config->audioConfig();
        au["enabled"] = config->audioEnabled();
        au["source"]  = (int)ac.source;
        au["bclk"]    = ac.i2sBclk;
        au["ws"]      = ac.i2sWs;
        au["sd"]      = ac.i2sSd;
        au["adc"]     = ac.adcPin;
        au["gain"]    = ac.gain;

        auto ld = doc["led"].to<JsonObject>();
        ld["enabled"] = config->ledEnabled();
        ld["pin"]     = config->ledConfig().pin;
        ld["count"]   = config->ledConfig().count;

        auto knobs = doc["knobs"].to<JsonArray>();
        for (size_t i = 0; i < config->knobCount(); ++i) {
            const auto& k = config->knob(i);
            auto ko = knobs.add<JsonObject>();
            ko["enabled"] = k.enabled;
            ko["pin"]     = k.pin;
            ko["param"]   = k.param;
        }

        const auto& oc = config->oledConfig();
        auto ol = doc["oled"].to<JsonObject>();
        ol["enabled"] = config->oledEnabled();
        ol["sda"]     = oc.sda;
        ol["scl"]     = oc.scl;
        ol["i2cAddr"]  = oc.i2cAddr;
        ol["width"]    = oc.width;
        ol["height"]   = oc.height;
        doc["eStopPin"] = config->eStopPin();

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
        doc["queue_depth"] = d.queueDepth;
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
            Serial.printf("[CTRL] HTTP %s %s from %s\n",
                          req->methodToString(), req->url().c_str(),
                          req->client() ? req->client()->remoteIP().toString().c_str() : "?");
            JsonObjectConst patch = json.as<JsonObjectConst>();
            if (patch["reboot"].is<bool>() && patch["reboot"].as<bool>()) {
                Serial.println("[CTRL] reboot requested");
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
            Serial.printf("[CTRL] HTTP %s %s from %s\n",
                          req->methodToString(), req->url().c_str(),
                          req->client() ? req->client()->remoteIP().toString().c_str() : "?");
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

    // ----- Custom Patterns Studio API -----

    server.on("/json/custom-patterns", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        for (auto* p : PatternRegistry::instance().all()) {
            if (strcmp(p->meta().category, "custom") == 0) {
                patterns::CustomPattern* cp = static_cast<patterns::CustomPattern*>(p);
                if (cp) {
                    JsonObject obj = arr.add<JsonObject>();
                    obj["id"] = cp->meta().id;
                    obj["name"] = cp->getName();
                    obj["code"] = cp->getCode();
                }
            }
        }
        String body;
        serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    auto* customPatternPost = new AsyncCallbackJsonWebHandler("/json/custom-patterns",
        [engine](AsyncWebServerRequest* req, JsonVariant& json) {
            Serial.printf("[CTRL] HTTP %s %s from %s\n",
                          req->methodToString(), req->url().c_str(),
                          req->client() ? req->client()->remoteIP().toString().c_str() : "?");
            JsonObjectConst obj = json.as<JsonObjectConst>();
            {
                String body;
                serializeJson(obj, body);
                Serial.printf("[CTRL] custom-pattern <- %s\n", body.c_str());
            }
            std::string id = obj["id"] | "";
            std::string name = obj["name"] | "";
            std::string code = obj["code"] | "";
            String err;
            if (!upsertCustomPattern(id.c_str(), name.c_str(), code.c_str(), err, engine)) {
                req->send(400, "application/json",
                          String("{\"ok\":false,\"error\":\"") + err + "\"}");
                return;
            }
            req->send(200, "application/json", "{\"ok\":true}");
        });
    customPatternPost->setMethod(HTTP_POST | HTTP_PUT);
    server.addHandler(customPatternPost);

    server.on("/json/custom-patterns", HTTP_DELETE, [engine](AsyncWebServerRequest* req) {
        String id = "";
        if (req->hasParam("id")) {
            id = req->getParam("id")->value();
        }
        if (id.length() == 0) {
            req->send(400, "application/json", "{\"ok\":false,\"error\":\"id parameter is required\"}");
            return;
        }

        String err;
        if (!deleteCustomPattern(id.c_str(), err, engine)) {
            req->send(400, "application/json",
                      String("{\"ok\":false,\"error\":\"") + err + "\"}");
            return;
        }

        req->send(200, "application/json", "{\"ok\":true}");
    });

#if HAXEL_FEATURE_MESH_MASTER
    server.on("/json/fleet", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
        mesh::MeshMaster::instance().serializeFleet(doc.to<JsonObject>());
        String body;
        serializeJson(doc, body);
        req->send(200, "application/json", body);
    });

    auto* fleetJson = new AsyncCallbackJsonWebHandler("/json/fleet",
        [](AsyncWebServerRequest* req, JsonVariant& json) {
            JsonObjectConst obj = json.as<JsonObjectConst>();
            const char* action = obj["action"] | "";
            auto& master = mesh::MeshMaster::instance();
            bool ok = false;

            auto parseMac = [](const char* s, uint8_t out[6]) -> bool {
                if (!s) return false;
                unsigned int b[6];
                if (sscanf(s, "%02x:%02x:%02x:%02x:%02x:%02x",
                           &b[0], &b[1], &b[2], &b[3], &b[4], &b[5]) != 6) return false;
                for (int i = 0; i < 6; ++i) out[i] = (uint8_t)b[i];
                return true;
            };

            if (!strcmp(action, "claim")) {
                uint8_t mac[6];
                if (obj["mac"].is<const char*>() && parseMac(obj["mac"], mac)) ok = master.claimMac(mac);
                else ok = master.claimAll();
            } else if (!strcmp(action, "release")) {
                uint8_t mac[6];
                if (obj["mac"].is<const char*>() && parseMac(obj["mac"], mac)) ok = master.releaseMac(mac);
                else ok = master.releaseAll();
            } else if (!strcmp(action, "estop")) {
                ok = master.sendEstop();
            } else if (!strcmp(action, "state")) {
                uint8_t mac[6];
                const uint8_t* target = nullptr;
                if (obj["mac"].is<const char*>() && parseMac(obj["mac"], mac)) target = mac;
                JsonObjectConst patch = obj["patch"].as<JsonObjectConst>();
                ok = master.applyFleetStatePatch(patch, target);
            } else if (!strcmp(action, "pushConfig")) {
                uint8_t mac[6];
                if (obj["mac"].is<const char*>() && parseMac(obj["mac"], mac)) {
                    ok = master.pushConfigToNode(mac);
                }
            } else {
                req->send(400, "application/json", "{\"ok\":false,\"error\":\"unknown action\"}");
                return;
            }
            JsonDocument out;
            out["ok"] = ok;
            master.serializeFleet(out["fleet"].to<JsonObject>());
            String body;
            serializeJson(out, body);
            req->send(200, "application/json", body);
        });
    fleetJson->setMethod(HTTP_POST | HTTP_PUT);
    server.addHandler(fleetJson);
#endif

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

    Serial.printf("[CTRL] WS #%lu <- %.*s\n", (unsigned long)client->id(), (int)len, (const char*)data);

    JsonDocument doc;
    if (deserializeJson(doc, data, len)) {
        Serial.println("[CTRL] WS JSON parse error");
        return;
    }
    const char* msgType = doc["type"] | "";
    if (!strcmp(msgType, "state")) {
        applyStatePatch(doc["patch"].as<JsonObjectConst>(), engine);
    } else if (!strcmp(msgType, "external")) {
        uint8_t ch = doc["channel"] | 0;
        float v   = doc["value"]   | 0.0f;
        Serial.printf("[CTRL] external ch=%u value=%.3f\n", ch, v);
        engine->pushExternal(ch, v);
    } else if (!strcmp(msgType, "ping")) {
        client->text("{\"type\":\"pong\"}");
    } else {
        Serial.printf("[CTRL] WS unknown type '%s'\n", msgType);
    }
}

} // namespace haxel::web

#endif // HAXEL_WIFI
