// HapticBlaze — entry point.
//
// Wires together: Config -> HAL (via DriverFactory) -> Engine -> Patterns ->
// AudioAnalyzer -> WebServer. The two real-time tasks (engine + audio) live on
// core 1; web stack lives on core 0. See ARCHITECTURE.md §2.

#include <Arduino.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <ESPmDNS.h>

#include "HapticBlaze.h"
#include "core/Engine.h"
#include "core/Config.h"
#include "core/AudioAnalyzer.h"
#include "core/PatternRegistry.h"
#include "hal/DriverFactory.h"
#include "patterns/Patterns.h"
#include "web/WebServer.h"
#include "web/CaptivePortal.h"

using namespace hapticblaze;

#if CONFIG_FREERTOS_UNICORE || defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(CONFIG_IDF_TARGET_ESP32H2)
  #define HB_CORE_RT   0
  #define HB_CORE_NET  0
#else
  #define HB_CORE_RT   1
  #define HB_CORE_NET  0
#endif

namespace {

Config           gConfig;
core::Engine     gEngine;
core::AudioAnalyzer gAudio;
web::WebServer   gWeb;
web::CaptivePortal gPortal;
hal::IHapticDriver* gDriver = nullptr;

TaskHandle_t hEngine = nullptr;
TaskHandle_t hAudio  = nullptr;
TaskHandle_t hHouse  = nullptr;

void engineTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(1);
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        gEngine.tick();
        vTaskDelayUntil(&last, period);
    }
}

void audioTask(void*) {
    for (;;) {
        gAudio.processOneFrame();
        // processOneFrame() blocks on the I2S DMA; no explicit delay needed.
    }
}

void housekeepingTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(100);
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        gConfig.flushIfDirty();
        gPortal.pump();
        if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
            // STA dropped — raise AP fallback alongside.
            WiFi.mode(WIFI_AP_STA);
            WiFi.softAP(gConfig.apSsid().c_str());
        }
        vTaskDelayUntil(&last, period);
    }
}

bool bringUpWifi() {
    WiFi.persistent(false);
    WiFi.setHostname(gConfig.hostname().c_str());
    if (!gConfig.staSsid().isEmpty()) {
        WiFi.mode(WIFI_STA);
        WiFi.begin(gConfig.staSsid().c_str(), gConfig.staPass().c_str());
        uint32_t until = millis() + 3000;
        while (WiFi.status() != WL_CONNECTED && millis() < until) {
            delay(50);
        }
        if (WiFi.status() == WL_CONNECTED) {
            log_i("STA connected, IP=%s", WiFi.localIP().toString().c_str());
            return true;
        }
    }
    WiFi.mode(WIFI_AP);
    WiFi.softAP(gConfig.apSsid().c_str());
    log_i("AP up, IP=%s", WiFi.softAPIP().toString().c_str());
    return false;
}

} // namespace

void setup() {
    Serial.begin(115200);
    log_i("HapticBlaze %s — booting", kVersion);

    if (!LittleFS.begin(true)) {
        log_e("LittleFS mount failed; running with defaults");
    }

    gConfig.load();

    gDriver = hal::DriverFactory::create(gConfig.driverKind());
    if (gDriver && gDriver->begin(gConfig.driverConfig())) {
        gEngine.attachDriver(gDriver);
        log_i("Driver %s initialized (%u channels)", gDriver->name(), gDriver->channelCount());
    } else {
        log_e("Driver init failed — engine will stay IDLE; configure via portal.");
        gEngine.attachDriver(nullptr);
        gDriver = nullptr;
    }

    patterns::registerAll(core::PatternRegistry::instance());
    gEngine.begin();

    if (gConfig.audioEnabled()) {
        gAudio.begin(gConfig.audioConfig());
        gEngine.attachAudio(&gAudio);
    }

    bool staConnected = bringUpWifi();
    gWeb.begin(&gEngine, &gConfig, &gAudio);
    if (!staConnected) {
        gPortal.begin(WiFi.softAPIP());
    }

    if (MDNS.begin(gConfig.hostname().c_str())) {
        MDNS.addService("hapticblaze", "tcp", 80);
        MDNS.addService("wled", "tcp", 80);        // WLED-compat discovery
        MDNS.addServiceTxt("hapticblaze", "tcp", "version", kVersion);
        MDNS.addServiceTxt("hapticblaze", "tcp", "driver",
                           gDriver ? gDriver->name() : "none");
    }

    xTaskCreatePinnedToCore(engineTask, "engine", 4096, nullptr, 5, &hEngine, HB_CORE_RT);
    if (gConfig.audioEnabled()) {
        xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 4, &hAudio, HB_CORE_RT);
    }
    xTaskCreatePinnedToCore(housekeepingTask, "house", 4096, nullptr, 1, &hHouse, HB_CORE_NET);

    log_i("Boot complete; engine running");
}

void loop() {
    // Arduino loop is the WebServer's own thread by default; we just keep it
    // alive at low priority. Real work is in the FreeRTOS tasks above.
    delay(1000);
}
