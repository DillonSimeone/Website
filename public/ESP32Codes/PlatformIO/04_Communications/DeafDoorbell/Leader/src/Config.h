#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <esp_now.h>
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

// ===== MAX4466 ANALOG MIC PIN CONFIGURATION (ESP32-C3 SuperMini) =====
// Wiring: VCC -> 3.3V, GND -> Pin 4 (Soft Ground), OUT -> Pin 3 (ADC1_CH3)
#define MIC_ANALOG_PIN    3   // MAX4466 OUT (ADC1_CH3)
#define MIC_GND_PIN       4   // Soft ground for mic (driven LOW)
#define ONBOARD_LED_PIN   8   // Onboard LED (inverted: 0=MAX, 255=OFF)
#define LED_CHANNEL       0

// ===== LOW-LATENCY AUDIO & SAMPLING SETTINGS =====
#define CHUNK_SIZE        64      // 64 samples per audio chunk (~3.2ms window)
#define SAMPLE_DELAY_US   25      // 25us delay + ~25us ADC conversion = ~50us/sample (~20kHz)
#define ANALOG_MAD_SCALE  8.0f    // Scales 12-bit ADC MAD to match UI threshold range
#define MAX_PLAUSIBLE_MAD 65000.0f
#define MIN_COOLDOWN_MS   500     // Cooldown matches alert duration (no hidden 10s lockout!)
#define WARMUP_MS         2500    // Startup settling guard (ms)
#define MAX_ALLOWED_DIPS  2       // Leaky debounce: tolerates 2 brief dips without resetting

// ===== WIFI & NETWORK CONFIGURATION =====
static const char* AP_SSID       = "LeeDoorBell";
static const char* AP_PASS       = "shrek1234!";
static const char* HOSTNAME_MDNS = "deafdoorbell";

// ===== CONFIGURABLE STATE (NVS-backed) =====
inline Preferences prefs;
inline int      threshold        = 2500;   // Audio trigger level (MAD)
inline int      duration         = 3000;   // Flash duration (ms)
inline int      brightness       = 100;    // Global Brightness (10-100%)
inline bool     partyMode        = true;   // Party Mode: Randomized vibrant color per alert
inline uint8_t  colorR           = 0;      // Default static color: Cyan (#00D2FF)
inline uint8_t  colorG           = 210;
inline uint8_t  colorB           = 255;
inline float    micGain          = 1.5f;
inline float    motorSmooth      = 0.35f;

// v3.0+ Network & Animation State
inline uint16_t networkId        = 0xA48F; // House Network Key
inline uint8_t  leaderId         = 1;      // Door Zone (1=Front Door, 2=Back Door...)
inline uint8_t  patternId        = PATTERN_BREATHE;
inline uint8_t  speedX10         = 10;     // 10 = 1.0x
inline uint8_t  debounceChunks   = 2;      // Default 2 chunks (~6.4ms) for fast chime & knock response
inline uint32_t alertSeqCounter  = 100;    // Sequence counter for deduplication

// Deferred NVS save state (prevents flash wear during slider dragging)
inline bool          settingsSavePending  = false;
inline unsigned long lastSettingsChangeMs = 0;

// ===== PAIRED FOLLOWERS REGISTRY =====
struct PairedFollower {
    uint8_t  mac[6];
    uint32_t lastSeenMs;
    uint8_t  firmwareVer;
    uint8_t  triggerArea; // 0 = All Areas, 1 = Area 1 (Front Door)...
};
#define MAX_PAIRED_FOLLOWERS 16
inline PairedFollower pairedFollowers[MAX_PAIRED_FOLLOWERS];
inline int pairedFollowerCount = 0;

inline bool pairingModeActive = false;
inline unsigned long pairingExpiresMs = 0;

// ============================================================
//  Color Conversion Helpers
// ============================================================
inline void hsvToRgb(uint16_t h, uint8_t s, uint8_t v, uint8_t &r, uint8_t &g, uint8_t &b) {
    if (s == 0) {
        r = g = b = v;
        return;
    }
    uint8_t region = h / 60;
    uint32_t remainder = (h - (region * 60)) * 6;
    uint8_t p = (v * (255 - s)) >> 8;
    uint8_t q = (v * (255 - ((s * remainder) >> 8))) >> 8;
    uint8_t t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8;

    switch (region) {
        case 0:  r = v; g = t; b = p; break;
        case 1:  r = q; g = v; b = p; break;
        case 2:  r = p; g = v; b = t; break;
        case 3:  r = p; g = q; b = v; break;
        case 4:  r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
    }
}

inline void getRandomPartyColor(uint8_t &r, uint8_t &g, uint8_t &b) {
    uint16_t hue = (uint16_t)random(0, 360);
    hsvToRgb(hue, 255, 255, r, g, b);
}

inline uint8_t hexCharToVal(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return 0;
}

inline void parseHexColor(const String& hex) {
    String h = hex;
    if (h.startsWith("#")) h = h.substring(1);
    if (h.length() == 6) {
        colorR = (hexCharToVal(h[0]) << 4) | hexCharToVal(h[1]);
        colorG = (hexCharToVal(h[2]) << 4) | hexCharToVal(h[3]);
        colorB = (hexCharToVal(h[4]) << 4) | hexCharToVal(h[5]);
    }
}

inline void colorToHexBuf(char* outBuf, size_t bufSize, uint8_t r, uint8_t g, uint8_t b) {
    snprintf(outBuf, bufSize, "#%02X%02X%02X", r, g, b);
}

// ============================================================
//  NVS Settings & Paired Follower Persistence
// ============================================================
inline void loadSettings() {
    prefs.begin("doorbell", false);
    threshold   = prefs.getInt("threshold", 2500);
    duration    = prefs.getInt("duration", 3000);
    brightness  = prefs.getInt("bright", 100);
    partyMode   = prefs.getBool("party", true);
    colorR      = prefs.getUChar("colorR", 0);
    colorG      = prefs.getUChar("colorG", 210);
    colorB      = prefs.getUChar("colorB", 255);
    micGain     = prefs.getFloat("gain", 1.5f);
    networkId   = prefs.getUShort("netId", 0);
    leaderId    = prefs.getUChar("leaderId", 1);
    patternId      = prefs.getUChar("pattern", PATTERN_BREATHE);
    speedX10       = prefs.getUChar("speedX10", 10);
    debounceChunks = constrain(prefs.getUChar("debounce", 2), 1, 8);

    if (networkId == 0) {
        networkId = (uint16_t)random(0x1000, 0xFFFF);
        prefs.putUShort("netId", networkId);
    }
    prefs.end();
}

inline void saveSettings() {
    prefs.begin("doorbell", false);
    prefs.putInt("threshold", threshold);
    prefs.putInt("duration", duration);
    prefs.putInt("bright", brightness);
    prefs.putBool("party", partyMode);
    prefs.putUChar("colorR", colorR);
    prefs.putUChar("colorG", colorG);
    prefs.putUChar("colorB", colorB);
    prefs.putFloat("gain", micGain);
    prefs.putUShort("netId", networkId);
    prefs.putUChar("leaderId", leaderId);
    prefs.putUChar("pattern", patternId);
    prefs.putUChar("speedX10", speedX10);
    prefs.putUChar("debounce", debounceChunks);
    prefs.end();
    settingsSavePending = false;
    DEBUG_PRINTF("Committed settings to NVS: thresh=%d dur=%d bright=%d party=%d pat=%d spd=%d net=0x%04X zone=%d\n",
                 threshold, duration, brightness, partyMode ? 1 : 0, patternId, speedX10, networkId, leaderId);
}

inline void markSettingsDirty() {
    settingsSavePending  = true;
    lastSettingsChangeMs = millis();
}

inline void serviceSettingsPersistence(unsigned long now) {
    if (settingsSavePending && (now - lastSettingsChangeMs >= 1500)) {
        saveSettings();
    }
}

inline void loadPairedFollowers() {
    Preferences pPrefs;
    if (pPrefs.begin("db_peers", true)) {
        pairedFollowerCount = pPrefs.getInt("count", 0);
        if (pairedFollowerCount > MAX_PAIRED_FOLLOWERS) pairedFollowerCount = MAX_PAIRED_FOLLOWERS;
        for (int i = 0; i < pairedFollowerCount; i++) {
            char kMac[16], kVer[16], kArea[16];
            snprintf(kMac, sizeof(kMac), "m%d", i);
            snprintf(kVer, sizeof(kVer), "v%d", i);
            snprintf(kArea, sizeof(kArea), "a%d", i);

            pPrefs.getBytes(kMac, pairedFollowers[i].mac, 6);
            pairedFollowers[i].firmwareVer = pPrefs.getUChar(kVer, PROTOCOL_VERSION);
            pairedFollowers[i].triggerArea = pPrefs.getUChar(kArea, 0);
            pairedFollowers[i].lastSeenMs = millis();
        }
        pPrefs.end();
        DEBUG_PRINTF("Loaded %d paired followers from NVS\n", pairedFollowerCount);
    }
}

inline void savePairedFollowers() {
    Preferences pPrefs;
    if (pPrefs.begin("db_peers", false)) {
        pPrefs.putInt("count", pairedFollowerCount);
        for (int i = 0; i < pairedFollowerCount; i++) {
            char kMac[16], kVer[16], kArea[16];
            snprintf(kMac, sizeof(kMac), "m%d", i);
            snprintf(kVer, sizeof(kVer), "v%d", i);
            snprintf(kArea, sizeof(kArea), "a%d", i);

            pPrefs.putBytes(kMac, pairedFollowers[i].mac, 6);
            pPrefs.putUChar(kVer, pairedFollowers[i].firmwareVer);
            pPrefs.putUChar(kArea, pairedFollowers[i].triggerArea);
        }
        pPrefs.end();
        DEBUG_PRINTF("Saved %d paired followers to NVS\n", pairedFollowerCount);
    }
}
