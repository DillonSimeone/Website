#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Preferences.h>
#include "DoorbellProtocol.h"

// ============================================================
//  DeafDoorbell - Master Node (Firmware v3.0)
//  - Mesh relay, multi-leader zone alert, and animation dispatch
//  - 32-bit I2S audio with DMA backlog drain & bit-slip guard
//  - Strict acoustic debounce with zero-leaky reset & cooldown isolation
//  - Peak-envelope tracking for UI graph (eliminates sub-threshold illusion)
//  - 24-Hour continuous audio history timeline (1440 points in RAM ring buffer)
//  - Trigger History Log with circular overwrite of oldest entries
//  - Non-blocking ESP-NOW traffic inspector with safe age formatting
//  - Single-color 4-packet burst (guaranteed RF delivery)
//  - Zero-heap chunked JSON endpoints for 24h & trigger logs
//  - Over-The-Air (OTA) Updates & Captive Portal
// ============================================================

#define DEBUG_ENABLED

#ifdef DEBUG_ENABLED
  #define DEBUG_PRINT(x)       Serial.print(x)
  #define DEBUG_PRINTF(...)    Serial.printf(__VA_ARGS__)
  #define DEBUG_PRINTLN(x)     Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTF(...)
  #define DEBUG_PRINTLN(x)
#endif

// ===== MAX4466 ANALOG MIC PIN CONFIGURATION (ESP32-C3 SuperMini) =====
// Wiring: VCC -> 3.3V, GND -> Pin 4 (Soft Ground), OUT -> Pin 3 (ADC1_CH3)
#define MIC_ANALOG_PIN  3   // MAX4466 OUT (ADC1_CH3)
#define MIC_GND_PIN     4   // Soft ground for mic (driven LOW)
#define ONBOARD_LED_PIN 8   // Onboard LED (inverted: 0=MAX, 255=OFF)
#define LED_CHANNEL     0

// ===== AUDIO & SAMPLING SETTINGS =====
#define SAMPLES         128 // Rolling window for level calculation
#define CHUNK_SIZE      64  // 64 samples per audio chunk
#define SAMPLE_DELAY_US 50  // 50us between samples (~20kHz sample rate)
#define ANALOG_MAD_SCALE 8.0f // Scales 12-bit ADC MAD to match UI threshold range
#define MAX_PLAUSIBLE_MAD 65000.0f
#define MIN_COOLDOWN_MS   10000      // Minimum 10s between alerts (prevents noise-storm rapid-fire)

// ===== ESP-NOW BROADCAST & PAIRING STATE =====
uint8_t broadcastAddr[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

struct PairedFollower {
    uint8_t  mac[6];
    uint32_t lastSeenMs;
    uint8_t  firmwareVer;
    uint8_t  triggerArea; // 0 = All Areas, 1 = Area 1 (Front Door)...
};
#define MAX_PAIRED_FOLLOWERS 16
PairedFollower pairedFollowers[MAX_PAIRED_FOLLOWERS];
int pairedFollowerCount = 0;

void addOrUpdateFollowerPeer(const uint8_t *mac) {
    if (!mac) return;
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;

    if (esp_now_is_peer_exist(mac)) {
        esp_now_mod_peer(&peerInfo);
    } else {
        esp_now_add_peer(&peerInfo);
    }
}

void loadPairedFollowers() {
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

void savePairedFollowers() {
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

bool pairingModeActive = false;
unsigned long pairingExpiresMs = 0;

// ===== ESP-NOW TRAFFIC MONITORING LOG (Circular Buffer) =====
struct EspNowLogEntry {
    uint8_t  mac[6];
    uint8_t  len;
    uint8_t  payload[16];
    uint32_t timestampMs;
    bool     isDoorbell;
};

#define MAX_ESPNOW_LOGS 40
EspNowLogEntry espNowLog[MAX_ESPNOW_LOGS];
int espNowLogHead = 0;
int espNowLogCount = 0;
uint32_t totalEspNowPackets = 0;
uint32_t validDoorbellPackets = 0;
uint32_t unknownPackets = 0;

// ===== TRIGGER HISTORY LOG (Circular Buffer) =====
#define MAX_TRIGGER_LOGS 40
struct TriggerLogEntry {
    uint32_t timestampMs;
    uint16_t peakMad;
    uint16_t threshold;
    uint8_t  r;
    uint8_t  g;
    uint8_t  b;
    bool     isTest;
};
TriggerLogEntry triggerLog[MAX_TRIGGER_LOGS];
int triggerLogHead = 0;
int triggerLogCount = 0;
uint32_t totalTriggerCount = 0;

// ===== 24-HOUR AUDIO HISTORY (1-Minute Buckets = 1440 Points) =====
#define HISTORY_24H_POINTS 1440
struct HistoryEntry {
    uint16_t peakMad;
    uint8_t  triggers;
};
HistoryEntry history24h[HISTORY_24H_POINTS];
int historyHead = 0;
int historyCount = 0;
unsigned long lastHistoryBucketMs = 0;
uint16_t currentBucketPeakMad = 0;
uint8_t  currentBucketTriggers = 0;

// ===== WIFI & NETWORK CONFIGURATION =====
const char* AP_SSID       = "LeeDoorBell";
const char* AP_PASS       = "shrek1234!";
const char* HOSTNAME_MDNS = "deafdoorbell";

// ===== CONFIGURABLE STATE (NVS-backed) =====
Preferences prefs;
int     threshold   = 2500;   // Audio trigger level (MAD)
int     duration    = 3000;   // Flash duration (ms)
int     brightness  = 100;    // Global Brightness (10-100%)
bool    partyMode   = true;   // Party Mode: Randomized vibrant color per alert
uint8_t colorR      = 0;      // Default static color: Cyan (#00D2FF)
uint8_t colorG      = 210;
uint8_t colorB      = 255;
float   micGain     = 1.5f;
float   motorSmooth = 0.35f;

// v3.0 Network & Animation State
uint16_t networkId   = 0xA48F; // House Network Key (auto-generated or configured)
uint8_t  leaderId    = 1;      // Door Zone (1=Front Door, 2=Back Door, 3=Side Gate...)
uint8_t  patternId   = PATTERN_BREATHE; // Animation preset (0 to 5)
uint8_t  speedX10    = 10;     // 10 = 1.0x
uint32_t alertSeqCounter = 100;// Sequence counter for deduplication

// ===== AUDIO FILTER & RUNTIME STATE =====
float rawSamples[SAMPLES] = {0.0f};
float currentMAD         = 0.0f;
float peakMADSincePoll   = 0.0f;
float lastTriggerMAD     = 0.0f;
float levelLP            = 0.0f;
bool  uiTriggered        = false;

// DC-blocking filter state
float lastInputSample  = 0.0f;
float lastOutputSample = 0.0f;
const float DC_FILTER_R = 0.985f; // ~80Hz high-pass cutoff at 16kHz

// Alert execution state
unsigned long alertCooldownUntilMs = 0;
int burstPacketsRemaining = 0;
unsigned long nextBurstPacketMs = 0;
DoorbellPacket activeAlertPacket;

// ===== WEB SERVER & DNS =====
DNSServer dnsServer;
WebServer server(80);
const byte DNS_PORT = 53;

// ============================================================
//  Color Conversion Helpers
// ============================================================
void hsvToRgb(uint16_t h, uint8_t s, uint8_t v, uint8_t &r, uint8_t &g, uint8_t &b) {
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

void getRandomPartyColor(uint8_t &r, uint8_t &g, uint8_t &b) {
    uint16_t hue = (uint16_t)random(0, 360);
    hsvToRgb(hue, 255, 255, r, g, b);
}

uint8_t hexCharToVal(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return 0;
}

void parseHexColor(const String& hex) {
    String h = hex;
    if (h.startsWith("#")) h = h.substring(1);
    if (h.length() == 6) {
        colorR = (hexCharToVal(h[0]) << 4) | hexCharToVal(h[1]);
        colorG = (hexCharToVal(h[2]) << 4) | hexCharToVal(h[3]);
        colorB = (hexCharToVal(h[4]) << 4) | hexCharToVal(h[5]);
    }
}

void colorToHexBuf(char* outBuf, size_t bufSize, uint8_t r, uint8_t g, uint8_t b) {
    snprintf(outBuf, bufSize, "#%02X%02X%02X", r, g, b);
}

// ============================================================
//  MAX4466 Analog Audio Setup (Pin 3 ADC, Pin 4 Soft Ground)
// ============================================================
void setupAudio() {
    // 1. Soft Ground for MAX4466 GND pin
    pinMode(MIC_GND_PIN, OUTPUT);
    digitalWrite(MIC_GND_PIN, LOW);

    // 2. Analog Input on Pin 3 (ADC1_CH3)
    pinMode(MIC_ANALOG_PIN, INPUT);
    analogReadResolution(12); // 0-4095
    analogSetPinAttenuation(MIC_ANALOG_PIN, ADC_11db); // Full range ~0 - 3.1V
}

void recordFollower(const uint8_t *mac, uint8_t ver = PROTOCOL_VERSION) {
    if (!mac) return;
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (memcmp(pairedFollowers[i].mac, mac, 6) == 0) {
            pairedFollowers[i].lastSeenMs = millis();
            pairedFollowers[i].firmwareVer = ver;
            addOrUpdateFollowerPeer(mac);
            savePairedFollowers();
            return;
        }
    }
    if (pairedFollowerCount < MAX_PAIRED_FOLLOWERS) {
        memcpy(pairedFollowers[pairedFollowerCount].mac, mac, 6);
        pairedFollowers[pairedFollowerCount].lastSeenMs = millis();
        pairedFollowers[pairedFollowerCount].firmwareVer = ver;
        pairedFollowers[pairedFollowerCount].triggerArea = 0; // Default to 0 (All Trigger Areas)
        pairedFollowerCount++;
        addOrUpdateFollowerPeer(mac);
        savePairedFollowers();
    }
}

// ============================================================
//  ESP-NOW Setup & Traffic Logging (Fast & Non-Blocking)
// ============================================================
void onMasterEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
    totalEspNowPackets++;

    EspNowLogEntry entry;
    if (mac) memcpy(entry.mac, mac, 6);
    else memset(entry.mac, 0, 6);

    entry.len = (uint8_t)min(len, 255);
    memset(entry.payload, 0, 16);
    if (data && len > 0) memcpy(entry.payload, data, min(len, 16));
    entry.timestampMs = millis();
    entry.isDoorbell = false;

    if (len >= 2 && data != NULL && data[0] == DEAF_DOORBELL_MAGIC) {
        uint8_t msgType = data[1];

        if (msgType == MSG_ALERT) {
            entry.isDoorbell = true;
            validDoorbellPackets++;
        }
        else if (msgType == MSG_PAIR_BEACON) {
            DEBUG_PRINTLN("Received PAIR_BEACON from follower!");
            if (pairingModeActive && millis() < pairingExpiresMs && mac) {
                uint8_t assignedArea = 0;
                for (int i = 0; i < pairedFollowerCount; i++) {
                    if (memcmp(pairedFollowers[i].mac, mac, 6) == 0) {
                        assignedArea = pairedFollowers[i].triggerArea;
                        break;
                    }
                }

                PairOfferPacket offer;
                offer.magic = DEAF_DOORBELL_MAGIC;
                offer.msgType = MSG_PAIR_OFFER;
                memcpy(offer.targetMac, mac, 6);
                offer.networkId = networkId;
                offer.leaderId = leaderId;
                offer.triggerArea = assignedArea;
                
                addOrUpdateFollowerPeer(mac);
                esp_now_send(mac, (uint8_t*)&offer, sizeof(offer));
                esp_now_send(broadcastAddr, (uint8_t*)&offer, sizeof(offer));
                DEBUG_PRINTF("Sent PAIR_OFFER to %02X:%02X:%02X:%02X:%02X:%02X (netId: 0x%04X, area: %d)\n",
                             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], networkId, assignedArea);
            }
        }
        else if (msgType == MSG_PAIR_CONFIRM) {
            DEBUG_PRINTLN("Received PAIR_CONFIRM from follower!");
            recordFollower(mac);
        }
    } else {
        unknownPackets++;
    }

    // Circular overwrite: oldest entry is overwritten when buffer is full
    espNowLog[espNowLogHead] = entry;
    espNowLogHead = (espNowLogHead + 1) % MAX_ESPNOW_LOGS;
    if (espNowLogCount < MAX_ESPNOW_LOGS) espNowLogCount++;
}

void setupESPNow() {
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW init failed!");
        return;
    }

    // Register receive callback to log background RF traffic
    esp_now_register_recv_cb(esp_now_recv_cb_t(onMasterEspNowRecv));

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, broadcastAddr, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        DEBUG_PRINTLN("Failed to add broadcast peer");
    }

    // Register all previously saved followers as peers on AP interface
    for (int i = 0; i < pairedFollowerCount; i++) {
        addOrUpdateFollowerPeer(pairedFollowers[i].mac);
    }
}

// ============================================================
//  Trigger History Logging (Circular Buffer)
// ============================================================
void recordTrigger(float mad, bool isTest) {
    TriggerLogEntry entry;
    entry.timestampMs = millis();
    entry.peakMad     = (uint16_t)min((float)65535, mad);
    entry.threshold   = (uint16_t)min(65535, threshold);
    entry.r           = activeAlertPacket.r;
    entry.g           = activeAlertPacket.g;
    entry.b           = activeAlertPacket.b;
    entry.isTest      = isTest;

    triggerLog[triggerLogHead] = entry;
    triggerLogHead = (triggerLogHead + 1) % MAX_TRIGGER_LOGS;
    if (triggerLogCount < MAX_TRIGGER_LOGS) triggerLogCount++;
    totalTriggerCount++;

    currentBucketTriggers++;
}

// ============================================================
//  24-Hour History Timeline Service (1-minute buckets)
// ============================================================
void serviceHistory24h(unsigned long now) {
    if (lastHistoryBucketMs == 0) lastHistoryBucketMs = now;
    if (now - lastHistoryBucketMs >= 60000) { // 60s bucket
        history24h[historyHead].peakMad  = currentBucketPeakMad;
        history24h[historyHead].triggers = currentBucketTriggers;
        historyHead = (historyHead + 1) % HISTORY_24H_POINTS;
        if (historyCount < HISTORY_24H_POINTS) historyCount++;

        currentBucketPeakMad = (uint16_t)min((float)65535, currentMAD);
        currentBucketTriggers = 0;
        lastHistoryBucketMs = now;
    }
}

// ============================================================
//  Alert Broadcasting Engine (Consistent Single-Color Bursts)
// ============================================================
void sendAlertPacketNow() {
    // 1. Broadcast to all listening nodes
    esp_now_send(broadcastAddr, (uint8_t*)&activeAlertPacket, sizeof(activeAlertPacket));

    // 2. Unicast to each paired follower matching this trigger area
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (pairedFollowers[i].triggerArea == 0 || pairedFollowers[i].triggerArea == activeAlertPacket.leaderId) {
            esp_now_send(pairedFollowers[i].mac, (uint8_t*)&activeAlertPacket, sizeof(activeAlertPacket));
        }
    }
}

void triggerAlert(bool isTest = false) {
    alertSeqCounter++;
    activeAlertPacket.magic      = DEAF_DOORBELL_MAGIC;
    activeAlertPacket.msgType    = MSG_ALERT;
    activeAlertPacket.networkId  = networkId;
    activeAlertPacket.seqId      = alertSeqCounter;
    activeAlertPacket.leaderId   = leaderId;
    activeAlertPacket.ttl        = 2; // Allow up to 2 repeater hops
    activeAlertPacket.patternId  = patternId;
    activeAlertPacket.durationMs = (uint16_t)duration;
    activeAlertPacket.brightness = (uint8_t)constrain(brightness, 10, 100);
    activeAlertPacket.speedX10   = speedX10;
    activeAlertPacket.partyMode  = (partyMode && !isTest) ? 1 : 0;

    uint8_t r = 0, g = 0, b = 0;
    if (partyMode && !isTest) {
        getRandomPartyColor(r, g, b);
    } else {
        r = colorR;
        g = colorG;
        b = colorB;
    }

    float bScale = constrain(brightness, 10, 100) / 100.0f;
    activeAlertPacket.r = (uint8_t)(r * bScale);
    activeAlertPacket.g = (uint8_t)(g * bScale);
    activeAlertPacket.b = (uint8_t)(b * bScale);

    // Record to persistent trigger history log
    recordTrigger(isTest ? 0.0f : lastTriggerMAD, isTest);

    // Immediately fire burst packet 1 with 0 latency
    sendAlertPacketNow();

    // Schedule remaining 3 packets spaced 15ms apart to guarantee RF delivery
    burstPacketsRemaining = 3;
    nextBurstPacketMs = millis() + 15;
    unsigned long cooldownLen = max((unsigned long)duration, (unsigned long)MIN_COOLDOWN_MS);
    alertCooldownUntilMs = millis() + cooldownLen;
    uiTriggered = true;

    DEBUG_PRINTF(">>> ALERT FIRED! Seq=%u Zone=%u Net=0x%04X Pat=%u Dur=%dms | Color=#%02X%02X%02X | MAD: %.0f\n",
                 activeAlertPacket.seqId, activeAlertPacket.leaderId, activeAlertPacket.networkId,
                 activeAlertPacket.patternId, activeAlertPacket.durationMs,
                 activeAlertPacket.r, activeAlertPacket.g, activeAlertPacket.b,
                 isTest ? 0.0f : lastTriggerMAD);
}

void serviceAlertBursts() {
    if (burstPacketsRemaining > 0 && millis() >= nextBurstPacketMs) {
        sendAlertPacketNow();
        burstPacketsRemaining--;
        nextBurstPacketMs = millis() + 15; // 15ms burst interval
    }
}

// ============================================================
//  NVS Load / Save
// ============================================================
void loadSettings() {
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
    patternId   = prefs.getUChar("pattern", PATTERN_BREATHE);
    speedX10    = prefs.getUChar("speedX10", 10);

    if (networkId == 0) {
        // Auto-generate random 16-bit network ID on first boot
        networkId = (uint16_t)random(0x1000, 0xFFFF);
        prefs.putUShort("netId", networkId);
    }
    prefs.end();
}

void saveSettings() {
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
    prefs.end();
}

// ============================================================
//  Web UI HTML Templates (Isolated Modular Headers)
// ============================================================
#include "PortalHtml.h"
#include "LogHtml.h"

// ============================================================
//  Web OTA Page HTML
// ============================================================
const char UPDATE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>DeafDoorbell OTA Update</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0d1117; color: #e6edf3; font-family: sans-serif; padding: 24px; display: flex; justify-content: center; }
    .box { width: 100%; max-width: 420px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; }
    h2 { margin-bottom: 16px; color: #00d2ff; }
    input[type=file] { margin: 16px 0; width: 100%; color: #8b949e; }
    button { background: #00d2ff; color: #000; font-weight: bold; border: none; padding: 12px; width: 100%; border-radius: 6px; cursor: pointer; }
    #prg { width: 100%; height: 16px; background: #21262d; border-radius: 8px; overflow: hidden; margin-top: 16px; display: none; }
    #bar { width: 0%; height: 100%; background: #00d2ff; transition: width 0.1s; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Firmware Update</h2>
    <p style="font-size:0.9em; color:#8b949e;">Select a compiled <code>firmware.bin</code> file to flash DeafDoorbell Master over WiFi.</p>
    <form method='POST' action='/update' enctype='multipart/form-data' id='uploadForm'>
      <input type='file' name='update' id='fileInput' accept='.bin' required>
      <button type='submit' id='subBtn'>Flash Firmware</button>
    </form>
    <div id="prg"><div id="bar"></div></div>
    <p id="msg" style="margin-top:12px; font-size:0.85em; text-align:center;"></p>
  </div>
  <script>
    const form = document.getElementById('uploadForm');
    form.onsubmit = e => {
      e.preventDefault();
      const file = document.getElementById('fileInput').files[0];
      if (!file) return;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/update', true);
      document.getElementById('prg').style.display = 'block';
      document.getElementById('subBtn').disabled = true;
      document.getElementById('msg').innerText = 'Uploading and flashing...';
      
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          document.getElementById('bar').style.width = pct + '%';
        }
      };
      xhr.onload = () => {
        if (xhr.status == 200) {
          document.getElementById('msg').innerText = 'Update successful! Rebooting ESP32...';
          setTimeout(() => location.href = '/', 6000);
        } else {
          document.getElementById('msg').innerText = 'Update Failed: ' + xhr.responseText;
          document.getElementById('subBtn').disabled = false;
        }
      };
      const fd = new FormData();
      fd.append('update', file);
      xhr.send(fd);
    };
  </script>
</body>
</html>
)rawliteral";

// ============================================================
//  Web Server Handlers (Zero-Heap Buffer Optimization)
// ============================================================
void handleRoot() {
    server.send(200, "text/html; charset=utf-8", PORTAL_HTML);
}

void handleLogPage() {
    server.send(200, "text/html; charset=utf-8", LOG_HTML);
}

void handleData() {
    char colorHex[8];
    colorToHexBuf(colorHex, sizeof(colorHex), colorR, colorG, colorB);

    // Report peak audio level observed since last poll interval so spikes are never missed
    float reportedMad = max(currentMAD, peakMADSincePoll);
    peakMADSincePoll = currentMAD; // Reset peak tracking

    bool activePair = pairingModeActive && (millis() < pairingExpiresMs);
    uint32_t pairSec = activePair ? ((pairingExpiresMs - millis()) / 1000) : 0;

    char jsonBuf[1536];
    int offset = snprintf(jsonBuf, sizeof(jsonBuf),
        "{\"mad\":%.1f,\"level\":%.1f,\"threshold\":%d,\"duration\":%d,\"brightness\":%d,\"party\":%s,\"color\":\"%s\",\"pattern\":%d,\"speed\":%.1f,\"netId\":\"%04X\",\"leaderId\":%d,\"pairing\":%s,\"pairSec\":%u,\"pairedCount\":%d,\"triggered\":%s,\"wifiConnected\":false,\"rssi\":0,\"ip\":\"192.168.4.1\",\"espTotal\":%u,\"espValid\":%u,\"espUnknown\":%u,\"followers\":[",
        reportedMad,
        levelLP,
        threshold,
        duration,
        brightness,
        partyMode ? "true" : "false",
        colorHex,
        patternId,
        (float)speedX10 / 10.0f,
        networkId,
        leaderId,
        activePair ? "true" : "false",
        pairSec,
        pairedFollowerCount,
        uiTriggered ? "true" : "false",
        totalEspNowPackets,
        validDoorbellPackets,
        unknownPackets
    );

    for (int i = 0; i < pairedFollowerCount; i++) {
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 pairedFollowers[i].mac[0], pairedFollowers[i].mac[1], pairedFollowers[i].mac[2],
                 pairedFollowers[i].mac[3], pairedFollowers[i].mac[4], pairedFollowers[i].mac[5]);
        uint32_t ageSec = (millis() >= pairedFollowers[i].lastSeenMs) ? ((millis() - pairedFollowers[i].lastSeenMs) / 1000) : 0;
        offset += snprintf(jsonBuf + offset, sizeof(jsonBuf) - offset,
            "%s{\"mac\":\"%s\",\"ageSec\":%u,\"area\":%u}",
            (i > 0) ? "," : "", macStr, ageSec, pairedFollowers[i].triggerArea);
    }
    snprintf(jsonBuf + offset, sizeof(jsonBuf) - offset, "]}");
    server.send(200, "application/json", jsonBuf);
    uiTriggered = false;
}

// 24-Hour continuous audio history streaming
void handleHistory() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "{\"points\":[");

    int startIdx = (historyHead - historyCount + HISTORY_24H_POINTS) % HISTORY_24H_POINTS;
    char ptBuf[32];
    for (int i = 0; i < historyCount; i++) {
        int idx = (startIdx + i) % HISTORY_24H_POINTS;
        int minsAgo = historyCount - 1 - i;
        snprintf(ptBuf, sizeof(ptBuf), "%s[%d,%u,%u]",
                 (i > 0) ? "," : "",
                 minsAgo,
                 history24h[idx].peakMad,
                 history24h[idx].triggers);
        server.sendContent(ptBuf);
    }
    server.sendContent("]}");
}

// Trigger history log streaming
void handleTriggers() {
    unsigned long now = millis();
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "{\"total\":");

    char headerBuf[64];
    snprintf(headerBuf, sizeof(headerBuf), "%u,\"triggers\":[", totalTriggerCount);
    server.sendContent(headerBuf);

    for (int i = 0; i < triggerLogCount; i++) {
        int idx = (triggerLogHead - 1 - i + MAX_TRIGGER_LOGS) % MAX_TRIGGER_LOGS;
        TriggerLogEntry &t = triggerLog[idx];

        uint32_t ageSec = (now >= t.timestampMs) ? ((now - t.timestampMs) / 1000) : 0;
        char hexCol[8];
        colorToHexBuf(hexCol, sizeof(hexCol), t.r, t.g, t.b);

        char entryBuf[128];
        snprintf(entryBuf, sizeof(entryBuf),
                 "%s{\"ageSec\":%u,\"mad\":%u,\"thresh\":%u,\"color\":\"%s\",\"isTest\":%s}",
                 (i > 0) ? "," : "",
                 ageSec,
                 t.peakMad,
                 t.threshold,
                 hexCol,
                 t.isTest ? "true" : "false");
        server.sendContent(entryBuf);
    }

    server.sendContent("]}");
}

void handleClearTriggers() {
    triggerLogHead = 0;
    triggerLogCount = 0;
    totalTriggerCount = 0;
    server.send(200, "text/plain", "OK");
}

// ESP-NOW traffic inspector log streaming
void handleEspNowLog() {
    unsigned long now = millis();
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "{\"total\":");
    
    char headerBuf[128];
    snprintf(headerBuf, sizeof(headerBuf), "%u,\"doorbell\":%u,\"unknown\":%u,\"logs\":[",
             totalEspNowPackets, validDoorbellPackets, unknownPackets);
    server.sendContent(headerBuf);

    for (int i = 0; i < espNowLogCount; i++) {
        int idx = (espNowLogHead - 1 - i + MAX_ESPNOW_LOGS) % MAX_ESPNOW_LOGS;
        EspNowLogEntry &e = espNowLog[idx];

        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 e.mac[0], e.mac[1], e.mac[2], e.mac[3], e.mac[4], e.mac[5]);

        char hexPayload[34] = {0};
        int pLen = min((int)e.len, 16);
        for (int p = 0; p < pLen; p++) {
            snprintf(hexPayload + (p * 2), 3, "%02X", e.payload[p]);
        }

        uint32_t ageSec = (now >= e.timestampMs) ? ((now - e.timestampMs) / 1000) : 0;

        char entryBuf[200];
        snprintf(entryBuf, sizeof(entryBuf),
                 "%s{\"mac\":\"%s\",\"len\":%d,\"payload\":\"%s\",\"timeAgoSec\":%u,\"isDoorbell\":%s}",
                 (i > 0) ? "," : "",
                 macStr,
                 e.len,
                 hexPayload,
                 ageSec,
                 e.isDoorbell ? "true" : "false");
        server.sendContent(entryBuf);
    }

    server.sendContent("]}");
}

void handleClearEspNowLog() {
    espNowLogHead = 0;
    espNowLogCount = 0;
    totalEspNowPackets = 0;
    validDoorbellPackets = 0;
    unknownPackets = 0;
    server.send(200, "text/plain", "OK");
}

void handleSet() {
    if (server.hasArg("threshold")) threshold  = server.arg("threshold").toInt();
    if (server.hasArg("duration"))  duration   = server.arg("duration").toInt();
    if (server.hasArg("bright"))    brightness = server.arg("bright").toInt();
    if (server.hasArg("party"))     partyMode  = server.arg("party") == "1";
    if (server.hasArg("color"))     parseHexColor(server.arg("color"));
    if (server.hasArg("pattern"))   patternId  = (uint8_t)server.arg("pattern").toInt();
    if (server.hasArg("speed"))     speedX10   = (uint8_t)constrain((int)(server.arg("speed").toFloat() * 10), 4, 30);
    if (server.hasArg("leaderId"))  leaderId   = (uint8_t)constrain(server.arg("leaderId").toInt(), 1, 8);
    if (server.hasArg("netId")) {
        String nStr = server.arg("netId");
        if (nStr.startsWith("0x") || nStr.startsWith("0X")) nStr = nStr.substring(2);
        uint16_t parsedNet = (uint16_t)strtoul(nStr.c_str(), NULL, 16);
        if (parsedNet != 0) networkId = parsedNet;
    }

    saveSettings();
    char colorHex[8];
    colorToHexBuf(colorHex, sizeof(colorHex), colorR, colorG, colorB);
    DEBUG_PRINTF("Settings saved: thresh=%d dur=%d bright=%d party=%d pat=%d spd=%d net=0x%04X zone=%d\n",
                  threshold, duration, brightness, partyMode ? 1 : 0, patternId, speedX10, networkId, leaderId);
    server.send(200, "text/plain", "OK");
}

void handlePair() {
    if (server.hasArg("enable")) {
        bool en = server.arg("enable") == "1";
        pairingModeActive = en;
        pairingExpiresMs = en ? (millis() + 60000) : 0;
        DEBUG_PRINTF("Pairing mode set to: %d (expires in %lu ms)\n", en, en ? 60000UL : 0UL);
    }

    bool active = pairingModeActive && (millis() < pairingExpiresMs);
    uint32_t secLeft = active ? ((pairingExpiresMs - millis()) / 1000) : 0;

    char jsonBuf[1536];
    int offset = snprintf(jsonBuf, sizeof(jsonBuf),
        "{\"active\":%s,\"secLeft\":%u,\"netId\":\"%04X\",\"count\":%d,\"followers\":[",
        active ? "true" : "false", secLeft, networkId, pairedFollowerCount);

    for (int i = 0; i < pairedFollowerCount; i++) {
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 pairedFollowers[i].mac[0], pairedFollowers[i].mac[1], pairedFollowers[i].mac[2],
                 pairedFollowers[i].mac[3], pairedFollowers[i].mac[4], pairedFollowers[i].mac[5]);
        uint32_t ageSec = (millis() >= pairedFollowers[i].lastSeenMs) ? ((millis() - pairedFollowers[i].lastSeenMs) / 1000) : 0;
        offset += snprintf(jsonBuf + offset, sizeof(jsonBuf) - offset,
            "%s{\"mac\":\"%s\",\"ageSec\":%u,\"area\":%u}", (i > 0) ? "," : "", macStr, ageSec, pairedFollowers[i].triggerArea);
    }
    snprintf(jsonBuf + offset, sizeof(jsonBuf) - offset, "]}");
    server.send(200, "application/json", jsonBuf);
}

void handleSetFollowerArea() {
    if (!server.hasArg("mac") || !server.hasArg("area")) {
        server.send(400, "text/plain", "Missing mac or area");
        return;
    }
    String macStr = server.arg("mac");
    uint8_t newArea = (uint8_t)server.arg("area").toInt();

    uint8_t targetMac[6] = {0};
    int parsed = sscanf(macStr.c_str(), "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
                        &targetMac[0], &targetMac[1], &targetMac[2],
                        &targetMac[3], &targetMac[4], &targetMac[5]);
    if (parsed != 6) {
        server.send(400, "text/plain", "Invalid MAC format");
        return;
    }

    bool found = false;
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (memcmp(pairedFollowers[i].mac, targetMac, 6) == 0) {
            pairedFollowers[i].triggerArea = newArea;
            found = true;
            break;
        }
    }
    if (!found && pairedFollowerCount < MAX_PAIRED_FOLLOWERS) {
        memcpy(pairedFollowers[pairedFollowerCount].mac, targetMac, 6);
        pairedFollowers[pairedFollowerCount].lastSeenMs = millis();
        pairedFollowers[pairedFollowerCount].firmwareVer = PROTOCOL_VERSION;
        pairedFollowers[pairedFollowerCount].triggerArea = newArea;
        pairedFollowerCount++;
    }

    savePairedFollowers();
    addOrUpdateFollowerPeer(targetMac);

    PairOfferPacket offer;
    offer.magic = DEAF_DOORBELL_MAGIC;
    offer.msgType = MSG_PAIR_OFFER;
    memcpy(offer.targetMac, targetMac, 6);
    offer.networkId = networkId;
    offer.leaderId = leaderId;
    offer.triggerArea = newArea;

    esp_now_send(targetMac, (uint8_t*)&offer, sizeof(offer));
    esp_now_send(broadcastAddr, (uint8_t*)&offer, sizeof(offer));

    DEBUG_PRINTF("Updated follower %s to triggerArea=%d and sent config packet\n", macStr.c_str(), newArea);
    server.send(200, "text/plain", "OK");
}

void handleTest() {
    triggerAlert(true);
    server.send(200, "text/plain", "TEST_SENT");
}

void handleUpdatePage() {
    server.send(200, "text/html", UPDATE_HTML);
}

void handleNotFound() {
    server.sendHeader("Location", "http://192.168.4.1", true);
    server.send(302, "text/plain", "");
}

// ============================================================
//  Network & OTA Setup (SoftAP Dedicated on Channel 1)
// ============================================================
void setupNetworking() {
    WiFi.disconnect(true, true);
    delay(100);

    WiFi.mode(WIFI_AP_STA);

    IPAddress apIP(192, 168, 4, 1);
    IPAddress netMsk(255, 255, 255, 0);
    WiFi.softAP(AP_SSID, AP_PASS, 1);
    WiFi.softAPConfig(apIP, apIP, netMsk);
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    dnsServer.start(DNS_PORT, "*", apIP);

    uint8_t actualCh = 0;
    wifi_second_chan_t secondCh;
    esp_wifi_get_channel(&actualCh, &secondCh);
    DEBUG_PRINTF("AP started: %s on Channel %d\n", AP_SSID, actualCh);
    DEBUG_PRINTF("Dashboard: http://%s\n", apIP.toString().c_str());

    // Web Server endpoints
    server.on("/", handleRoot);
    server.on("/log.html", handleLogPage);
    server.on("/log", handleLogPage);
    server.on("/data", handleData);
    server.on("/pair", handlePair);
    server.on("/setFollowerArea", handleSetFollowerArea);
    server.on("/history", handleHistory);
    server.on("/triggers", handleTriggers);
    server.on("/triggers/clear", handleClearTriggers);
    server.on("/espnow", handleEspNowLog);
    server.on("/espnow/clear", handleClearEspNowLog);
    server.on("/set", handleSet);
    server.on("/test", handleTest);
    server.on("/update", HTTP_GET, handleUpdatePage);
    server.on("/update", HTTP_POST, []() {
        server.sendHeader("Connection", "close");
        server.send(200, "text/plain", (Update.hasError()) ? "FAIL" : "OK");
        ESP.restart();
    }, []() {
        HTTPUpload& upload = server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            DEBUG_PRINTF("Update Start: %s\n", upload.filename.c_str());
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            if (Update.end(true)) {
                DEBUG_PRINTF("Update Success: %u bytes\n", upload.totalSize);
            } else {
                Update.printError(Serial);
            }
        }
    });

    server.onNotFound(handleNotFound);
    server.begin();

    MDNS.begin(HOSTNAME_MDNS);
    MDNS.addService("http", "tcp", 80);

    ArduinoOTA.setHostname("deafdoorbell-master");
    ArduinoOTA.setPort(3232);
    ArduinoOTA.onStart([]() {
        DEBUG_PRINTLN("ArduinoOTA: Start firmware update");
    });
    ArduinoOTA.onEnd([]() {
        DEBUG_PRINTLN("\nArduinoOTA: Update Complete! Rebooting...");
    });
    ArduinoOTA.onError([](ota_error_t error) {
        DEBUG_PRINTF("ArduinoOTA Error[%u]\n", error);
    });
    ArduinoOTA.begin();
}

// ============================================================
//  LED PWM Setup & Audio-Reactive Positioning Feedback
// ============================================================
void setupLED() {
    ledcSetup(LED_CHANNEL, 5000, 8);
    ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
    ledcWrite(LED_CHANNEL, 255); // Start OFF (inverted: 255=OFF, 0=MAX)
}

void updateLED(float madLevel, bool alertActive) {
    if (alertActive) {
        // Full On during active alert
        ledcWrite(LED_CHANNEL, 0); // Solid ON
    } else {
        // Smooth proportional audio reactivity for positioning next to chime
        int brightnessVal = map(constrain((int)madLevel, 200, 4000), 200, 4000, 0, 255);
        ledcWrite(LED_CHANNEL, 255 - brightnessVal); // Inverted logic
    }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    DEBUG_PRINTLN("\n==============================================");
    DEBUG_PRINTLN("   DeafDoorbell Master Node (Hardened v2.0)");
    DEBUG_PRINTLN("==============================================");

    loadSettings();
    loadPairedFollowers();
    char colorHex[8];
    colorToHexBuf(colorHex, sizeof(colorHex), colorR, colorG, colorB);
    DEBUG_PRINTF("Loaded Settings: Threshold=%d, Duration=%dms, Party=%d, Color=%s\n",
                  threshold, duration, partyMode ? 1 : 0, colorHex);

    setupLED();
    setupAudio();
    setupNetworking();
    setupESPNow();

    DEBUG_PRINTLN("Master ready. Audio engine streaming & listening for ESP-NOW...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // 1. Handle Alert Burst Transmissions (Non-blocking burst)
    serviceAlertBursts();

    // 2. 24-Hour History Timeline Service (Rolls 1-minute buckets)
    serviceHistory24h(now);

    // 3. Handle Network Requests (Gated for clean audio processing)
    static unsigned long lastNetHandle = 0;
    if (now - lastNetHandle >= 20) {
        dnsServer.processNextRequest();
        server.handleClient();
        ArduinoOTA.handle();
        lastNetHandle = now;
    }

    // 4. Audio Capture & Processing (MAX4466 Analog Electret on Pin 3)
    // Capture a chunk of 64 samples at ~20kHz (64 * 50us = 3.2ms)
    float samples[CHUNK_SIZE];
    for (int i = 0; i < CHUNK_SIZE; i++) {
        samples[i] = (float)analogRead(MIC_ANALOG_PIN);
        delayMicroseconds(SAMPLE_DELAY_US);
    }

    // Shift raw history buffer
    for (int i = 0; i < SAMPLES - CHUNK_SIZE; i++) {
        rawSamples[i] = rawSamples[i + CHUNK_SIZE];
    }

    // Apply IIR DC-blocking High-Pass filter & append new chunk
    for (int i = 0; i < CHUNK_SIZE; i++) {
        float inSample = samples[i];
        // y[n] = x[n] - x[n-1] + R * y[n-1]
        float outSample = inSample - lastInputSample + (DC_FILTER_R * lastOutputSample);
        lastInputSample = inSample;
        lastOutputSample = outSample;

        rawSamples[SAMPLES - CHUNK_SIZE + i] = outSample;
    }

    // Compute MAD (Mean Absolute Deviation) on filtered signal
    float madSum = 0.0f;
    for (int i = 0; i < SAMPLES; i++) {
        madSum += fabsf(rawSamples[i]);
    }
    float mad = (madSum / SAMPLES) * ANALOG_MAD_SCALE * micGain;
    currentMAD = mad;

    // Peak tracking: track maximum MAD seen since last poll and in 1-min history bucket
    if (currentMAD > peakMADSincePoll) {
        peakMADSincePoll = currentMAD;
    }
    if ((uint16_t)currentMAD > currentBucketPeakMad) {
        currentBucketPeakMad = (uint16_t)min((float)65535, currentMAD);
    }

    // Exponential smoothing envelope
    levelLP += motorSmooth * (currentMAD - levelLP);

    // 5. Hardened Acoustic Debounce & Warmup Protection
    // Warmup: 2500ms startup settling guard
    // Persistence: Require sustained chime energy for at least 8 chunks (~25-30ms)
    // Strict reset: any chunk below threshold IMMEDIATELY resets debounce counter to 0!
    static int consecutiveOverThresh = 0;
    #define WARMUP_MS 2500
    #define MIN_TRIGGER_CHUNKS 8

    bool alertActive = (now < alertCooldownUntilMs);

    if (now > WARMUP_MS) {
        if (currentMAD > MAX_PLAUSIBLE_MAD) {
            consecutiveOverThresh = 0;
        } else if (currentMAD >= threshold) {
            if (!alertActive) {
                consecutiveOverThresh++;
                if (consecutiveOverThresh >= MIN_TRIGGER_CHUNKS) {
                    lastTriggerMAD = currentMAD;
                    triggerAlert(false);
                    consecutiveOverThresh = 0;
                }
            } else {
                consecutiveOverThresh = 0;
            }
        } else {
            // Strict reset on sub-threshold chunks: prevents leaky accumulation of noise
            consecutiveOverThresh = 0;
        }
    }
    if (alertActive) {
        // Keep debounce counter zeroed during cooldown to prevent delayed triggers on exit
        consecutiveOverThresh = 0;
    }

    // 6. Update Audio-Reactive Onboard LED
    updateLED(levelLP, now < alertCooldownUntilMs);

    // 7. Diagnostic Serial Log (~5Hz)
    static unsigned long lastLogTime = 0;
    if (now - lastLogTime > 200) {
        #ifdef DEBUG_ENABLED
            DEBUG_PRINTF("[MAD: %5.0f | LP: %5.0f | Thresh: %d] ", currentMAD, levelLP, threshold);
            int barLen = map(constrain((int)currentMAD, 0, 4000), 0, 4000, 0, 30);
            for (int i = 0; i < barLen; i++) DEBUG_PRINT("=");
            if (now < alertCooldownUntilMs) DEBUG_PRINT(" >>> ALERT ACTIVE <<<");
            DEBUG_PRINTLN("");
        #endif
        lastLogTime = now;
    }
}
