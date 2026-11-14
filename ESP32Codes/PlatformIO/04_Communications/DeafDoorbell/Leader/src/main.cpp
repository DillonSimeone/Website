#include <Arduino.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
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
//  - Task Watchdog Timer (WDT) 5-second stall protection
//  - GPIO 9 Boot button 3-second Wi-Fi credential factory reset
// ============================================================

void serviceBootButton(unsigned long now) {
    static unsigned long pressStartMs = 0;
    static bool buttonHeld = false;

    if (digitalRead(BOOT_PIN) == LOW) {
        if (!buttonHeld) {
            buttonHeld = true;
            pressStartMs = now;
        } else if (now - pressStartMs >= BOOT_HOLD_TIME_MS) {
            // Held for 3 seconds -> Rapid flash LED to signal reset, wipe Wi-Fi credentials, and restart
            DEBUG_PRINTLN("BOOT button held 3s! Resetting Wi-Fi credentials to defaults...");
            for (int i = 0; i < 10; i++) {
                ledcWrite(LED_CHANNEL, 0);   // ON
                delay(50);
                ledcWrite(LED_CHANNEL, 255); // OFF
                delay(50);
            }
            resetWifiCredentials();
            ESP.restart();
        }
    } else {
        buttonHeld = false;
    }
}

void setup() {
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0); // Never block loop() if running on a USB wall adapter
    delay(300);

    // Check previous reset reason for watchdog diagnostics
    esp_reset_reason_t reason = esp_reset_reason();
    DEBUG_PRINTF("Boot Reset Reason: %d\n", reason);
    if (reason == ESP_RST_TASK_WDT || reason == ESP_RST_WDT) {
        DEBUG_PRINTLN("[WARNING] Previous boot reset was caused by Task Watchdog Timer!");
    }

    // Configure onboard Boot button (GPIO 9, active LOW)
    pinMode(BOOT_PIN, INPUT_PULLUP);

    loadSettings();
    loadPairedFollowers();
    alertSeqCounter = (esp_random() & 0x7FFFFFFFu) + 100u;

    setupLED();
    setupAudio();
    setupNetworking();
    setupESPNow();

    // Initialize hardware Task Watchdog Timer (5s panic timeout)
    esp_task_wdt_init(5, true);
    esp_task_wdt_add(NULL); // Add current loopTask to WDT monitoring

    DEBUG_PRINTLN("\n=== DeafDoorbell Leader v3.2 Ready (Low-Latency Mode + WDT Active) ===");
}

void loop() {
    // 0. Feed hardware Task Watchdog Timer
    esp_task_wdt_reset();

    unsigned long now = millis();

    // 1. Service onboard Boot button (GPIO 9, 3-sec hold resets Wi-Fi credentials)
    serviceBootButton(now);

    // 2. Capture & process 64-sample audio chunk (~3.2ms) + fast leaky debounce
    sampleAndProcessAudio(now);

    // 3. Service ESP-NOW follow-up burst packets & deferred NVS writes
    serviceEspNow(now);

    // 4. Roll 24-hour audio history buckets & deferred NVS settings persistence
    serviceHistory24h(now, currentMAD);
    serviceSettingsPersistence(now);

    // 5. Service Captive Portal DNS, HTTP WebServer & OTA (skipped if mid-trigger)
    serviceNetworking(now);

    // 6. Non-blocking diagnostic serial output (~4Hz, only when USB host is listening)
    static unsigned long lastLogTime = 0;
    if (now - lastLogTime >= 250) {
        DEBUG_PRINTF("[MAD:%5.0f | LP:%5.0f | Thresh:%d]%s\n",
                     currentMAD, levelLP, threshold,
                     isLeaderAlertActive(now) ? " >>> ALERT ACTIVE <<<" : "");
        lastLogTime = now;
    }
}
