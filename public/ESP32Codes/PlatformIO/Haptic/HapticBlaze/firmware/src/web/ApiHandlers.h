#pragma once

#include <ESPAsyncWebServer.h>

namespace hapticblaze {
class Config;
namespace core { class Engine; class AudioAnalyzer; }

namespace web {

class ApiHandlers {
public:
    // Mount all /json/* endpoints + /update on the server.
    static void install(AsyncWebServer& server,
                        core::Engine* engine,
                        Config* config,
                        core::AudioAnalyzer* audio);

    // WLED-compat /win?T=...&A=... handler.
    static void handleWlenWin(AsyncWebServerRequest* req, core::Engine* engine);

    static void handleWebSocket(AsyncWebSocket* server,
                                AsyncWebSocketClient* client,
                                AwsEventType type,
                                void* arg, uint8_t* data, size_t len,
                                core::Engine* engine);
};

} // namespace web
} // namespace hapticblaze
