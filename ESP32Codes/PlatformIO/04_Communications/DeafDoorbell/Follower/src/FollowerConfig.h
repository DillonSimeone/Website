#pragma once
#include <Arduino.h>
#include <FastLED.h>
#include <Preferences.h>
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

// ===== FASTLED HARDWARE BUFFER =====
inline CRGB leds[LED_COUNT];

// ===== ALERT ANIMATION STATE =====
inline bool          isFlashing        = false;
inline unsigned long alertStartMs      = 0;
inline uint16_t      currentDuration   = 3000;
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
        if (dedupCache[i].networkId == netId &&
            dedupCache[i].leaderId == leaderId &&
            dedupCache[i].seqId == seqId) {
            if (now - dedupCache[i].timestampMs < 15000) {
                return true;
            }
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
