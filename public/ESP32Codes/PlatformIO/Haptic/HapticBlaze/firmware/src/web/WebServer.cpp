#include "WebServer.h"
#include "ApiHandlers.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/AudioAnalyzer.h"
#include <LittleFS.h>
#include <WiFi.h>
#include <ArduinoJson.h>

namespace hapticblaze::web {

bool WebServer::begin(core::Engine* engine, Config* config, core::AudioAnalyzer* audio) {
    engine_ = engine;
    config_ = config;
    audio_  = audio;
    server_ = new AsyncWebServer(80);
    ws_     = new AsyncWebSocket("/ws");

    // Order matters: AsyncWebServer iterates handlers in registration order.
    // API + WebSocket + captive probes register FIRST so they match before the
    // static-file fallback (which would otherwise serve index.html for
    // anything that wasn't an existing file).
    mountWebsocket_();
    mountJsonApi_();
    mountWlenApi_();
    mountCaptiveProbes_();
    mountStatic_();   // fallback / SPA shell

    server_->begin();
    return true;
}

void WebServer::stop() {
    if (server_) { server_->end(); delete server_; server_ = nullptr; }
    if (ws_)     { delete ws_; ws_ = nullptr; }
}

void WebServer::mountStatic_() {
    // No-store so reflashing the LittleFS image always serves the latest UI on
    // next page load. Bandwidth on a captive portal is irrelevant.
    server_->serveStatic("/", LittleFS, "/")
        .setDefaultFile("index.html")
        .setCacheControl("no-store, max-age=0");
}

void WebServer::mountJsonApi_() {
    ApiHandlers::install(*server_, engine_, config_, audio_);
}

void WebServer::mountWlenApi_() {
    server_->on("/win", HTTP_GET, [this](AsyncWebServerRequest* req) {
        ApiHandlers::handleWlenWin(req, engine_);
    });
}

void WebServer::mountWebsocket_() {
    ws_->onEvent([this](AsyncWebSocket* server, AsyncWebSocketClient* client,
                        AwsEventType type, void* arg, uint8_t* data, size_t len) {
        ApiHandlers::handleWebSocket(server, client, type, arg, data, len, engine_);
    });
    server_->addHandler(ws_);
}

void WebServer::mountCaptiveProbes_() {
    auto redirect = [](AsyncWebServerRequest* req) {
        AsyncWebServerResponse* r = req->beginResponse(302, "text/plain", "");
        r->addHeader("Location", "/");
        req->send(r);
    };
    for (const char* path : {
        "/generate_204","/gen_204","/hotspot-detect.html",
        "/library/test/success.html","/connectivity-check.html",
        "/connectivity-check.txt","/ncsi.txt"
    }) {
        server_->on(path, HTTP_GET, redirect);
    }
    server_->onNotFound([](AsyncWebServerRequest* req) {
        const String& url = req->url();
        // API paths must NEVER receive an HTML redirect — clients expect JSON
        // (or 404 text). Returning HTML here is what makes fetch().json() blow up.
        if (url.startsWith("/json") || url.startsWith("/win") || url == "/ws") {
            req->send(404, "application/json",
                      String("{\"error\":\"no route\",\"path\":\"") + url + "\"}");
            return;
        }
        // For everything else (captive portal probes, unknown SPA paths),
        // redirect to root so the SPA can handle it client-side.
        AsyncWebServerResponse* r = req->beginResponse(302, "text/plain", "");
        r->addHeader("Location", "/");
        req->send(r);
    });
}

} // namespace hapticblaze::web
