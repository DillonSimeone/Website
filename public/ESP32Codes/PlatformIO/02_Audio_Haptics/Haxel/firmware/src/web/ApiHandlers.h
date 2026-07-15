#pragma once

#include "StateApi.h"

#ifdef HAXEL_WIFI
#include <ESPAsyncWebServer.h>

namespace haxel {
class Config;
namespace core { class Engine; class AudioAnalyzer; }

namespace web {

// WiFi/HTTP transport only — not linked on BLE builds.
class ApiHandlers {
public:
    static void install(AsyncWebServer& server,
                        core::Engine* engine,
                        Config* config,
                        core::AudioAnalyzer* audio);

    static void handleWlenWin(AsyncWebServerRequest* req, core::Engine* engine);

    static void handleWebSocket(AsyncWebSocket* server,
                                AsyncWebSocketClient* client,
                                AwsEventType type,
                                void* arg, uint8_t* data, size_t len,
                                core::Engine* engine);

    static void applyStatePatch(ArduinoJson::JsonObjectConst patch, core::Engine* engine) {
        haxel::web::applyStatePatch(patch, engine);
    }
    static void serializeState(ArduinoJson::JsonObject root, core::Engine* engine) {
        haxel::web::serializeState(root, engine);
    }
    static void applyConfigPatch(ArduinoJson::JsonObjectConst patch, Config* config) {
        haxel::web::applyConfigPatch(patch, config);
    }
};

} // namespace web
} // namespace haxel

#endif // HAXEL_WIFI
