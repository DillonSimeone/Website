#pragma once
#include <Arduino.h>
#include <FastLED.h>
#include <Preferences.h>
#include <esp_now.h>
#include "hal/cpu_ll.h"
#include "driver/dedic_gpio.h"
#include "DoorbellProtocol.h"

#define DEBUG_ENABLED

#ifdef DEBUG_ENABLED
  #define DEBUG_PRINT(x)       do { if (Serial.availableForWrite() >= 32) Serial.print(x); } while(0)
  #define DEBUG_PRINTF(...)    do { if (Serial.availableForWrite() >= 64) Serial.printf(__VA_ARGS__); } while(0)
  #define DEBUG_PRINTLN(x)     do { if (Serial.availableForWrite() >= 32) Serial.println(x); } while(0)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTF(...)
  #define DEBUG_PRINTLN(x)
#endif

// ===== HARDWARE PIN CONFIGURATION (ESP32-C3 SuperMini) =====
#define LED_PIN               5       // WS2812B data line (GPIO 5)
#define LED_COUNT             64      // 8x8 WS2812B matrix (or strip)
#define MOTOR_PIN             3       // Digital vibration motor output (GPIO 3)
#define ONBOARD_LED           8       // Inverted logic: LOW=ON, HIGH=OFF (GPIO 8)
#define BOOT_PIN              9       // Onboard Boot button (active LOW, GPIO 9)

// ===== TIMING CONSTANTS =====
#define BOOT_HOLD_TIME_MS     3000    // 3-second hold to reset pairing
#define HEARTBEAT_INTERVAL_MS 2000

// ===== NVS PREFERENCES & NETWORK KEY =====
inline Preferences prefs;
inline uint16_t myNetworkId   = 0;    // 0 = Unpaired / Discovery Mode
inline uint8_t  myTriggerArea = 0;    // 0 = All Trigger Areas, 1 = Area 1 (Front Door)...
inline bool     isPaired      = false;
inline uint8_t  myMac[6]      = {0};
inline bool     espNowReady   = false;
inline unsigned long nextHeartbeatMs = 0;

inline esp_err_t sendEspNowBroadcast(const uint8_t *data, size_t len) {
    if (!espNowReady || data == NULL || len == 0) return ESP_ERR_ESPNOW_NOT_INIT;
    return esp_now_send(ESPNOW_BROADCAST_MAC, data, len);
}

// ===== FASTLED HARDWARE BUFFER =====
inline CRGB leds[LED_COUNT];

// Clock the whole frame with interrupts off. The RMT driver refills from an
// interrupt, and a WiFi interrupt makes it abandon the rest of the panel.
// ESP32-C3 has no standard rdcycle counter. Reading it faults the CPU.
inline bool matrixBlankPending = false;

static inline uint8_t matrixScale(uint8_t value, uint8_t scale) {
    return (uint8_t)(((uint16_t)value * scale) >> 8) + ((value && scale) ? 1 : 0);
}

// The bit loop lives in RAM. A flash stall stretches one pulse, and the panel
// reads that as a green bit on the first or last pixel.
void clockMatrixFrame(const uint8_t* data, int nbytes, uint32_t pinMask,
                      uint32_t t0h, uint32_t t1h, uint32_t t0l, uint32_t t1l,
                      uint32_t latchCycles);

inline dedic_gpio_bundle_handle_t matrixBundle = nullptr;
inline uint32_t matrixPinMask = 0;

inline void ensureMatrixOutput() {
    if (matrixBundle) return;
    int pin = LED_PIN;
    dedic_gpio_bundle_config_t cfg = {};
    cfg.gpio_array = &pin;
    cfg.array_size = 1;
    cfg.flags.out_en = 1;
    if (dedic_gpio_new_bundle(&cfg, &matrixBundle) == ESP_OK) {
        dedic_gpio_get_out_mask(matrixBundle, &matrixPinMask);
    }
}

inline void showMatrix() {
    cpu_ll_enable_cycle_count();
    ensureMatrixOutput();
    if (matrixPinMask == 0) return;

    uint8_t frame[LED_COUNT * 3];
    uint8_t scale = FastLED.getBrightness();
    bool dark = true;
    for (int i = 0; i < LED_COUNT; i++) {
        uint8_t g = matrixScale(leds[i].g, scale);
        uint8_t r = matrixScale(leds[i].r, scale);
        uint8_t b = matrixScale(leds[i].b, scale);
        frame[i * 3]     = g;
        frame[i * 3 + 1] = r;
        frame[i * 3 + 2] = b;
        if (g | r | b) dark = false;
    }

    const uint32_t hz = ESP.getCpuFreqMHz() * 1000000UL;
    auto ticks = [hz](uint32_t ns) -> uint32_t {
        return (uint32_t)((uint64_t)hz * ns / 1000000000UL);
    };
    // Low times are a little short on purpose. The loop between bits adds the rest.
    const uint32_t t0h = ticks(400);
    const uint32_t t1h = ticks(800);
    const uint32_t t0l = ticks(700);
    const uint32_t t1l = ticks(350);
    const uint32_t latch = ticks(80000);

    noInterrupts();
    clockMatrixFrame(frame, LED_COUNT * 3, matrixPinMask, t0h, t1h, t0l, t1l, latch);
    interrupts();
    if (dark) matrixBlankPending = false;
}

// ===== ALERT ANIMATION STATE =====
inline bool          isFlashing        = false;
inline unsigned long alertStartMs      = 0;
inline unsigned long showEndedMs       = 0;
inline uint32_t      currentDuration   = 3000;
inline uint8_t       currentPattern    = PATTERN_BREATHE;
inline uint8_t       currentBrightness = 80;
inline float         currentSpeed      = 1.0f;
inline CRGB          currentColor      = CRGB::Cyan;
inline uint8_t       currentPartyMode  = 0;
inline uint8_t       partyStartHue     = 0;

// ===== MATRIX COORDINATE HELPER (Standard 8x8 Serpentine Panel) =====
inline uint16_t getMatrixIndex(uint8_t x, uint8_t y) {
    if (x >= 8 || y >= 8) return 0;
    return (y & 0x01) ? ((y * 8) + (7 - x)) : ((y * 8) + x);
}

// ============================================================
//  NVS Storage Helpers
// ============================================================
inline void loadSettings() {
    prefs.begin("doorbell", false);
    myNetworkId   = prefs.getUShort("netId", 0);
    myTriggerArea = prefs.getUChar("trigArea", 0);
    prefs.end();

    isPaired = (myNetworkId != 0);
    DEBUG_PRINTF("Loaded NVS: networkId=0x%04X, triggerArea=%d, isPaired=%d\n", myNetworkId, myTriggerArea, isPaired);
}

inline void saveNetworkId(uint16_t id) {
    myNetworkId = id;
    isPaired = (id != 0);
    prefs.begin("doorbell", false);
    prefs.putUShort("netId", myNetworkId);
    prefs.end();
    DEBUG_PRINTF("Saved NVS: networkId=0x%04X\n", myNetworkId);
}

inline void saveTriggerArea(uint8_t area) {
    myTriggerArea = area;
    prefs.begin("doorbell", false);
    prefs.putUChar("trigArea", myTriggerArea);
    prefs.end();
    DEBUG_PRINTF("Saved NVS: triggerArea=%d\n", myTriggerArea);
}

// ============================================================
//  Deduplication Cache (Anti-Storm Flood Control)
// ============================================================
struct DedupEntry {
    uint16_t networkId;
    uint8_t  leaderId;
    uint32_t seqId;
    uint32_t timestampMs;
};
#define DEDUP_CACHE_SIZE 24
inline DedupEntry dedupCache[DEDUP_CACHE_SIZE];
inline int dedupHead = 0;

inline bool isDuplicateAlert(uint16_t netId, uint8_t leaderId, uint32_t seqId) {
    unsigned long now = millis();
    for (int i = 0; i < DEDUP_CACHE_SIZE; i++) {
        if (dedupCache[i].timestampMs != 0 &&
            dedupCache[i].networkId == netId &&
            dedupCache[i].leaderId == leaderId &&
            dedupCache[i].seqId == seqId &&
            (now - dedupCache[i].timestampMs) < 15000) {
            return true;
        }
    }
    return false;
}

inline void recordAlert(uint16_t netId, uint8_t leaderId, uint32_t seqId) {
    dedupCache[dedupHead].networkId = netId;
    dedupCache[dedupHead].leaderId = leaderId;
    dedupCache[dedupHead].seqId = seqId;
    dedupCache[dedupHead].timestampMs = millis();
    dedupHead = (dedupHead + 1) % DEDUP_CACHE_SIZE;
}
