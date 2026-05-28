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
#include "core/StatusLed.h"
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
StatusLed        gStatusLed;
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
    uint8_t broadcastDiv = 0;
    for (;;) {
        gStatusLed.tick();
        gConfig.flushIfDirty();
        gPortal.pump();
        if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
            // STA dropped — raise AP fallback alongside.
            WiFi.mode(WIFI_AP_STA);
            IPAddress apIP(192, 168, 4, 1);
            WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
            WiFi.softAP(gConfig.apSsid().c_str());
            gStatusLed.apMode();
            gPortal.begin(WiFi.softAPIP());
        }
        // Broadcast engine state to WebSocket clients every ~200ms (every 2nd tick).
        if (++broadcastDiv >= 2) {
            broadcastDiv = 0;
            gWeb.broadcastState();
        }
        vTaskDelayUntil(&last, period);
    }
}

bool bringUpWifi() {
    WiFi.persistent(false);
    WiFi.setHostname(gConfig.hostname().c_str());
    if (gConfig.staEnabled() && !gConfig.staSsid().isEmpty()) {
        gStatusLed.breathing();
        WiFi.mode(WIFI_STA);
        WiFi.setTxPower(WIFI_POWER_8_5dBm);
        Serial.printf("\n\n>>> Connecting to WiFi SSID: '%s', Password: '%s' <<<\n\n", gConfig.staSsid().c_str(), gConfig.staPass().c_str());
        WiFi.begin(gConfig.staSsid().c_str(), gConfig.staPass().c_str());
        uint32_t until = millis() + 8000; // 8 seconds connection timeout
        while (WiFi.status() != WL_CONNECTED && millis() < until) {
            delay(50);
        }
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("\n\n>>> WiFi CONNECTED! Local IP: %s <<<\n\n", WiFi.localIP().toString().c_str());
            gStatusLed.connected();
            return true;
        }
    }
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);
    delay(100);
    WiFi.mode(WIFI_AP);
    WiFi.setTxPower(WIFI_POWER_19_5dBm); // Restoring standard Tx Power so the AP signal is strong/visible
    IPAddress apIP(192, 168, 4, 1);
    WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
    WiFi.softAP(gConfig.apSsid().c_str());
    Serial.printf("\n\n>>> Running in AP Mode. SSID: '%s', softAP IP: %s <<<\n\n", gConfig.apSsid().c_str(), WiFi.softAPIP().toString().c_str());
    gStatusLed.apMode();
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
    Serial.printf("\n[DEBUG] Loaded Config SSID: '%s', Password: '%s'\n\n", gConfig.staSsid().c_str(), gConfig.staPass().c_str());

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

    // Initialize status LED on GPIO 8 (ESP32-C3 onboard LED), LEDC channel 5.
    #ifdef HAPTICBLAZE_TARGET_C3
    gStatusLed.begin(8, 5);
    #endif

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
