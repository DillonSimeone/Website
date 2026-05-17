#pragma once

#include <ESPAsyncWebServer.h>

namespace hapticblaze {

class Config;
namespace core { class Engine; class AudioAnalyzer; }

namespace web {

class WebServer {
public:
    bool begin(core::Engine* engine, Config* config, core::AudioAnalyzer* audio);
    void stop();

private:
    void mountStatic_();
    void mountJsonApi_();
    void mountWlenApi_();
    void mountWebsocket_();
    void mountCaptiveProbes_();

    AsyncWebServer*   server_ = nullptr;
    AsyncWebSocket*   ws_     = nullptr;
    core::Engine*     engine_ = nullptr;
    Config*           config_ = nullptr;
    core::AudioAnalyzer* audio_ = nullptr;
};

} // namespace web
} // namespace hapticblaze
