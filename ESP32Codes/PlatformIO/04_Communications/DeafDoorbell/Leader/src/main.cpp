#include <Arduino.h>
#include "Config.h"
#include "TelemetryLog.h"
#include "EspNowManager.h"
#include "AudioEngine.h"
#include "WebPortal.h"

// ============================================================
//  DeafDoorbell - Leader Node (Firmware v3.2 Low-Latency)
//  - Shared protocol header via ../shared/DoorbellProtocol.h
//  - Single-pass MAX4466 ADC capture + IIR DC-blocker (~3.2ms/chunk)
//  - Fast 3-chunk (~9.6ms) leaky debounce (1-dip tolerance)
//  - Zero-stall ESP-NOW broadcast bursts with WIFI_PS_NONE
//  - Batched HTTP chunked JSON streaming & non-blocking USB CDC
// ============================================================

void setup() {
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0); // Never block loop() if running on a USB wall adapter
    delay(300);

    loadSettings();
    loadPairedFollowers();

    setupLED();
    setupAudio();
    setupNetworking();
    setupESPNow();

    DEBUG_PRINTLN("\n=== DeafDoorbell Leader v3.2 Ready (Low-Latency Mode) ===");
}

void loop() {
    unsigned long now = millis();

    // 1. Capture & process 64-sample audio chunk (~3.2ms) + fast leaky debounce
    sampleAndProcessAudio(now);

    // 2. Service ESP-NOW follow-up burst packets & deferred NVS writes
    serviceEspNow(now);

    // 3. Roll 24-hour audio history buckets & deferred NVS settings persistence
    serviceHistory24h(now, currentMAD);
    serviceSettingsPersistence(now);

    // 4. Service Captive Portal DNS, HTTP WebServer & OTA (skipped if mid-trigger)
    serviceNetworking(now);

    // 5. Non-blocking diagnostic serial output (~4Hz, only when USB host is listening)
    static unsigned long lastLogTime = 0;
    if (now - lastLogTime >= 250) {
        DEBUG_PRINTF("[MAD:%5.0f | LP:%5.0f | Thresh:%d]%s\n",
                     currentMAD, levelLP, threshold,
                     (now < alertCooldownUntilMs) ? " >>> ALERT ACTIVE <<<" : "");
        lastLogTime = now;
    }
}
