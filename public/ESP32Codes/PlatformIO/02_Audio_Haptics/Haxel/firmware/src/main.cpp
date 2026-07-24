// Haxel — entry point.
//
// Wires together: Config -> HAL (via DriverFactory) -> Engine -> Patterns ->
// AudioAnalyzer -> WebServer. The two real-time tasks (engine + audio) live on
// core 1; web stack lives on core 0. See ARCHITECTURE.md §2.

#include <Arduino.h>
#include <LittleFS.h>
#ifdef HAXEL_WIFI
#include <WiFi.h>
#include <ESPmDNS.h>
#endif

#include "Haxel.h"
#include "core/Engine.h"
#include "core/Config.h"
#include "core/AudioAnalyzer.h"
#include "core/PatternRegistry.h"
#include "core/StatusLed.h"
#include "hal/DriverFactory.h"
#include "patterns/Patterns.h"
#ifdef HAXEL_WIFI
#include "web/WebServer.h"
#include "web/CaptivePortal.h"
#endif
#ifdef HAXEL_BLU
#include "web/BleServer.h"
#endif
#if HAXEL_FEATURE_MESH_MASTER
#include "mesh/MeshMaster.h"
#include "mesh/MeshProtocol.h"
#endif
#if HAXEL_FEATURE_MESH_FOLLOWER
#include "mesh/MeshFollower.h"
#include "mesh/MeshProtocol.h"
#endif
#include "core/LedController.h"
#include "core/RuntimeStore.h"
#if HAXEL_FEATURE_KNOBS
#include "core/KnobController.h"
#endif
#if HAXEL_FEATURE_OLED
#include "core/OledDisplay.h"
#endif
#include <cstring>

using namespace haxel;

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
#if HAXEL_FEATURE_KNOBS
core::KnobController gKnobs;
#endif
#if HAXEL_FEATURE_OLED
core::OledDisplay gOled;
#endif
#ifdef HAXEL_WIFI
web::WebServer   gWeb;
web::CaptivePortal gPortal;
#endif
#ifdef HAXEL_BLU
web::BleServer   gBle;
#endif
hal::IHapticDriver* gDriver = nullptr;

TaskHandle_t hEngine = nullptr;
#if HAXEL_FEATURE_AUDIO
TaskHandle_t hAudio  = nullptr;
#endif
TaskHandle_t hHouse  = nullptr;
#if HAXEL_FEATURE_LED
TaskHandle_t hLed    = nullptr;
#endif

#if HAXEL_FEATURE_LED
void ledTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(33); // ~30 Hz
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        core::LedController::instance().tick();
        vTaskDelayUntil(&last, period);
    }
}
#endif

void engineTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(1);
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        gEngine.tick();
#if HAXEL_FEATURE_OLED
        gOled.sample();
#endif
        vTaskDelayUntil(&last, period);
    }
}

#if HAXEL_FEATURE_AUDIO
void audioTask(void*) {
    for (;;) {
        gAudio.processOneFrame();
    }
}
#endif

void housekeepingTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(100);
    TickType_t last = xTaskGetTickCount();
    uint8_t broadcastDiv = 0;
#ifdef HAXEL_WIFI
#if !HAXEL_FEATURE_MESH_MASTER
    uint32_t lastStaRetryMs = millis();
#endif
#endif
    bool eStopLatched = false;
    for (;;) {
        gStatusLed.tick();
#if HAXEL_FEATURE_KNOBS
        gKnobs.tick();
#endif
#if HAXEL_FEATURE_OLED
        static uint8_t oledDiv = 0;
        if (++oledDiv >= 2) {
            oledDiv = 0;
            gOled.tick();
        }
#endif
        gConfig.flushIfDirty();
        core::flushRuntimeIfDirty();

        // Optional active-low E-stop GPIO (config.eStopPin, -1 = off).
        if (gConfig.eStopPin() >= 0) {
            pinMode(gConfig.eStopPin(), INPUT_PULLUP);
            const bool pressed = digitalRead(gConfig.eStopPin()) == LOW;
            if (pressed && !eStopLatched) {
                gEngine.requestEStop();
                eStopLatched = true;
                log_w("E-stop GPIO %d asserted", (int)gConfig.eStopPin());
            } else if (!pressed) {
                eStopLatched = false;
            }
        }

#ifdef HAXEL_WIFI
        gPortal.pump();
#if !HAXEL_FEATURE_MESH_MASTER
        if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
            // STA dropped — raise AP fallback alongside.
            WiFi.mode(WIFI_AP_STA);
            IPAddress apIP(192, 168, 4, 1);
            WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
            WiFi.softAP(gConfig.apSsid().c_str());
            gStatusLed.apMode();
            gPortal.begin(WiFi.softAPIP());
            lastStaRetryMs = millis();
        } else if (WiFi.getMode() == WIFI_AP_STA) {
            if (WiFi.status() == WL_CONNECTED) {
                // Successfully reconnected! Go back to pure STA mode.
                WiFi.mode(WIFI_STA);
                WiFi.softAPdisconnect(true);
                gStatusLed.connected();
                gPortal.end();
            } else if (millis() - lastStaRetryMs > 15000) {
                // Retry connecting to STA every 15 seconds
                lastStaRetryMs = millis();
                if (gConfig.staEnabled() && !gConfig.staSsid().isEmpty()) {
                    log_i("Watchdog: Retrying WiFi STA connection...");
                    WiFi.begin(gConfig.staSsid().c_str(), gConfig.staPass().c_str());
                }
            }
        }
#endif
#endif
#if HAXEL_FEATURE_MESH_MASTER
        mesh::MeshMaster::instance().tick();
#endif
#if HAXEL_FEATURE_MESH_FOLLOWER
        mesh::MeshFollower::instance().tick();
#endif
        // Broadcast engine state to WebSocket/BLE clients every ~200ms (every 2nd tick).
        if (++broadcastDiv >= 2) {
            broadcastDiv = 0;
#ifdef HAXEL_WIFI
            gWeb.broadcastState();
#endif
#ifdef HAXEL_BLU
            gBle.broadcastState();
#endif
        }
        vTaskDelayUntil(&last, period);
    }
}

#ifdef HAXEL_WIFI
bool bringUpWifi() {
    WiFi.persistent(false);
    WiFi.setHostname(gConfig.hostname().c_str());
    if (gConfig.staEnabled() && !gConfig.staSsid().isEmpty()) {
        gStatusLed.breathing();
        WiFi.mode(WIFI_STA);
        WiFi.setTxPower(WIFI_POWER_8_5dBm);
        Serial.printf("\n\n>>> Connecting to WiFi SSID: '%s' <<<\n\n", gConfig.staSsid().c_str());
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
#if HAXEL_FEATURE_MESH_MASTER
    // Lock SoftAP to the mesh channel so ESP-NOW peers stay aligned.
    WiFi.softAP(gConfig.apSsid().c_str(), nullptr, mesh::kMeshChannel);
    Serial.printf("\n\n>>> MESH MASTER AP on channel %u. SSID: '%s' <<<\n\n",
                  mesh::kMeshChannel, gConfig.apSsid().c_str());
#else
    WiFi.softAP(gConfig.apSsid().c_str());
    Serial.printf("\n\n>>> Running in AP Mode. SSID: '%s', softAP IP: %s <<<\n\n", gConfig.apSsid().c_str(), WiFi.softAPIP().toString().c_str());
#endif
    gStatusLed.apMode();
    return false;
}
#endif

} // namespace

void setup() {
    Serial.begin(115200);
    log_i("Haxel %s — booting", kVersion);

    if (!LittleFS.begin(true)) {
        log_e("LittleFS mount failed; running with defaults");
    }

    gConfig.load();
    Serial.printf("\n[DEBUG] Loaded Config SSID: '%s' (pass %s)\n\n",
                  gConfig.staSsid().c_str(),
                  gConfig.staPass().isEmpty() ? "empty" : "set");

    Serial.printf("[DEBUG] Driver kind=%d pin0=%d LED enabled=%d pin=%d\n",
                  (int)gConfig.driverKind(),
                  (int)gConfig.driverConfig().pins[0],
                  (int)gConfig.ledEnabled(),
                  (int)gConfig.ledConfig().pin);

    if (!gEngine.begin()) {
        log_e("Engine begin failed (cmd queue alloc)");
    }

    gDriver = hal::DriverFactory::create(gConfig.driverKind());
    if (gDriver && gDriver->begin(gConfig.driverConfig())) {
        gEngine.attachDriver(gDriver);
        log_i("Driver %s initialized (%u channels)", gDriver->name(), gDriver->channelCount());
    } else {
        log_e("Driver init failed — engine will stay IDLE; configure via portal.");
        // DriverFactory owns the pointer — do not delete here.
        gDriver = nullptr;
        gEngine.attachDriver(nullptr);
        gEngine.raiseFault("driver_init");
    }

    patterns::registerAll(core::PatternRegistry::instance());
    patterns::loadCustomPatterns(core::PatternRegistry::instance());

    // Restore last play state, or fall back to Breath calibration pattern.
    if (gDriver) {
        core::StagedState boot;
        boot.on = true;
        boot.intensity = 0.6f;
        boot.speed = 1.0f;
        boot.channelCount = gDriver->channelCount();
        for (uint8_t i = 0; i < boot.channelCount && i < 8; ++i) {
            boot.channels[i].on = gConfig.channelEnabled(i);
            boot.channels[i].intensity = 1.0f;
        }
        boot.startupFloor = 0.35f;

        core::RuntimeSnapshot rt;
        if (core::loadRuntime(rt)) {
            boot.on = rt.on;
            boot.mute = rt.mute;
            boot.intensity = rt.intensity;
            boot.speed = rt.speed;
            boot.startupFloor = rt.startupFloor;
            boot.numBins = rt.numBins;
            for (int i = 0; i < 4; ++i) boot.dividers[i] = rt.dividers[i];
            for (int i = 0; i < 5; ++i) {
                strncpy(boot.binPatterns[i], rt.binPatterns[i], sizeof(boot.binPatterns[i]) - 1);
                boot.binPatterns[i][sizeof(boot.binPatterns[i]) - 1] = '\0';
            }
            core::IPattern* p = core::PatternRegistry::instance().find(rt.patternId);
            if (!p) p = core::PatternRegistry::instance().find("Heartbeat");
            if (!p) p = core::PatternRegistry::instance().at(0);
            boot.pattern = p;
            log_i("Restored runtime: %s on=%d", p ? p->id() : "(none)", (int)boot.on);
        } else {
            core::IPattern* p = core::PatternRegistry::instance().find("Heartbeat");
            if (!p) p = core::PatternRegistry::instance().at(0);
            boot.pattern = p;
            log_i("Boot autoplay: %s", p ? p->id() : "(none)");
        }
        gEngine.stageState(boot);
        core::markRuntimeDirty(boot);
    }

    if (gConfig.audioEnabled()) {
#if HAXEL_FEATURE_AUDIO
        gAudio.begin(gConfig.audioConfig());
        gEngine.attachAudio(&gAudio);
#else
        log_w("Audio enabled in config but this build has HAXEL_FEATURE_AUDIO=0");
#endif
    }

#if HAXEL_FEATURE_KNOBS
    if (gKnobs.begin(&gConfig, &gEngine, gConfig.audioEnabled() ? &gAudio : nullptr)) {
        log_i("KnobController active");
    }
#endif
#if HAXEL_FEATURE_OLED
    if (gOled.begin(&gConfig, &gEngine)) {
        log_i("OLED display active");
    }
#endif

    // Onboard status LED (C3/C6 FireBeetle: GPIO8, Classic/S3: GPIO2/GPIO8), LEDC channel 5.
#ifdef HAXEL_DEFAULT_STATUS_LED_PIN
    gStatusLed.begin(HAXEL_DEFAULT_STATUS_LED_PIN, 5);
#elif defined(HAXEL_TARGET_C3) || defined(HAXEL_TARGET_C6)
    gStatusLed.begin(8, 5);
#else
    gStatusLed.begin(2, 5);
#endif
    gStatusLed.attachEngine(&gEngine);

#ifdef HAXEL_BLU
    gBle.begin(&gEngine, &gConfig);
#endif
#ifdef HAXEL_WIFI
    bool staConnected = bringUpWifi();
#if HAXEL_FEATURE_MESH_MASTER
    // Command Mode Master must stay on SoftAP channel — skip STA for mesh.
    if (staConnected) {
        Serial.println("[MESH] STA connected; forcing SoftAP mesh channel for ESP-NOW");
        WiFi.disconnect(true, true);
        WiFi.mode(WIFI_AP);
        IPAddress apIP(192, 168, 4, 1);
        WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
        WiFi.softAP(gConfig.apSsid().c_str(), nullptr, mesh::kMeshChannel);
        staConnected = false;
        gStatusLed.apMode();
    }
    mesh::MeshMaster::instance().begin(&gEngine, &gConfig,
                                       gConfig.audioEnabled() ? &gAudio : nullptr);
#endif
    gWeb.begin(&gEngine, &gConfig, &gAudio);
    if (!staConnected) {
        gPortal.begin(WiFi.softAPIP());
    }

    if (MDNS.begin(gConfig.hostname().c_str())) {
        MDNS.addService("haxel", "tcp", 80);
        MDNS.addService("wled", "tcp", 80);        // WLED-compat discovery
        MDNS.addServiceTxt("haxel", "tcp", "version", kVersion);
        MDNS.addServiceTxt("haxel", "tcp", "driver",
                           gDriver ? gDriver->name() : "none");
#if HAXEL_FEATURE_MESH_MASTER
        MDNS.addServiceTxt("haxel", "tcp", "role", "master");
#endif
    }
#endif

#if HAXEL_FEATURE_MESH_FOLLOWER
    mesh::MeshFollower::instance().begin(&gEngine, &gConfig);
#endif

    xTaskCreatePinnedToCore(engineTask, "engine", 4096, nullptr, 5, &hEngine, HB_CORE_RT);
#if HAXEL_FEATURE_AUDIO
    if (gConfig.audioEnabled()) {
        xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 4, &hAudio, HB_CORE_RT);
    }
#endif
    xTaskCreatePinnedToCore(housekeepingTask, "house", 4096, nullptr, 1, &hHouse, HB_CORE_NET);

#if HAXEL_FEATURE_LED
    if (gConfig.ledEnabled()) {
        if (core::LedController::instance().begin(&gConfig, &gEngine)) {
            xTaskCreatePinnedToCore(ledTask, "leds", 4096, nullptr, 2, &hLed, HB_CORE_NET);
            log_i("FastLED Controller started successfully");
        }
    }
#else
    if (gConfig.ledEnabled()) {
        log_w("LEDs enabled in config but this build has HAXEL_FEATURE_LED=0");
    }
#endif

    log_i("Boot complete; features LED=%d AUDIO=%d KNOBS=%d OLED=%d MESH_M=%d MESH_F=%d",
          HAXEL_FEATURE_LED, HAXEL_FEATURE_AUDIO, HAXEL_FEATURE_KNOBS, HAXEL_FEATURE_OLED,
          HAXEL_FEATURE_MESH_MASTER, HAXEL_FEATURE_MESH_FOLLOWER);
}

void loop() {
    // Arduino loop is the WebServer's own thread by default; we just keep it
    // alive at low priority. Real work is in the FreeRTOS tasks above.
    delay(1000);
}
