#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <driver/i2s.h>
#include <Preferences.h>

// ============================================================
//  DeafDoorbell — Master Node (Streaming Audio Engine & Security Monitor)
//  Ultra-low latency I2S audio detection (based on WirelessHaptic)
//  Continuous ESP-NOW alert broadcasting while above threshold
//  Over-The-Air (OTA) Updates & Network Discoverability
//  ESP-NOW Traffic Monitoring & Sound History Graph
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

// ===== I2S MIC PIN CONFIGURATION (ESP32-C3 SuperMini) =====
#define I2S_SD          0   // DIN
#define I2S_SCK         1   // BCLK
#define I2S_LR          2   // L/R select (driven LOW = left)
#define I2S_WS          3   // LRC / Word Select
#define MIC_GND_PIN     4   // Soft ground for mic (driven LOW)
#define ONBOARD_LED_PIN 8   // Onboard LED (inverted: 0=MAX, 255=OFF)
#define LED_CHANNEL     0

// ===== I2S & AUDIO SETTINGS =====
#define I2S_PORT        I2S_NUM_0
#define SAMPLE_RATE     16000
#define SAMPLES         128 // 8ms rolling window for ultra-tight sync
#define CHUNK_SIZE      64  // 4ms read window

// ===== ESP-NOW PROTOCOL (Original 6-byte follower compatible struct) =====
uint8_t broadcastAddr[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

typedef struct {
    uint8_t  msgType;       // 0x01 = DOORBELL_ALERT
    uint16_t durationMs;    // Flash duration
    uint8_t  r;             // LED color — Red
    uint8_t  g;             // LED color — Green
    uint8_t  b;             // LED color — Blue
} __attribute__((packed)) DoorbellMsg;

// ===== ESP-NOW TRAFFIC MONITORING LOG =====
struct EspNowLogEntry {
    uint8_t  mac[6];
    uint8_t  len;
    uint8_t  payload[16];
    uint32_t timestampMs;
    bool     isDoorbell;
};

#define MAX_ESPNOW_LOGS 30
EspNowLogEntry espNowLog[MAX_ESPNOW_LOGS];
int espNowLogHead = 0;
int espNowLogCount = 0;
uint32_t totalEspNowPackets = 0;
uint32_t validDoorbellPackets = 0;
uint32_t unknownPackets = 0;

// ===== WIFI & OTA CREDENTIALS =====
const char* STA_SSID     = "Dolphin";
const char* STA_PASS     = "alexander85";
const char* AP_SSID      = "MayanSusanDoorbell";
const char* AP_PASS      = "shrek!1234";
const char* HOSTNAME_MDNS = "deafdoorbell";

// ===== CONFIGURABLE STATE (NVS-backed) =====
Preferences prefs;
int     threshold   = 2500;   // Audio trigger level (MAD)
int     duration    = 3000;   // Flash duration (ms)
int     brightness  = 100;    // Global Brightness (10-100%)
bool    partyMode   = true;   // Party Mode: Randomized vibrant colors per message
uint8_t colorR      = 0;      // Default static color: Cyan (#00D2FF)
uint8_t colorG      = 210;
uint8_t colorB      = 255;
float   micGain     = 1.5f;
float   motorSmooth = 0.35f;

// ===== AUDIO & RUNTIME STATE =====
float rawSamples[SAMPLES] = {0.0f};
float currentMAD  = 0.0f;
float levelLP     = 0.0f;
bool  uiTriggered = false;

// Continuous transmission spamming state
unsigned long sustainUntilMs   = 0;
unsigned long lastPacketSendMs = 0;
#define SPAM_INTERVAL_MS 25   // Broadcast packet every ~25ms while active
#define SUSTAIN_TIME_MS  3000 // 3 second default sustain

// ===== WEB SERVER & DNS =====
DNSServer dnsServer;
WebServer server(80);
const byte DNS_PORT = 53;
unsigned long lastWiFiCheckMs = 0;

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

String colorToHex() {
    char buf[8];
    snprintf(buf, sizeof(buf), "#%02X%02X%02X", colorR, colorG, colorB);
    return String(buf);
}

// ============================================================
//  I2S Audio Setup (WirelessHaptic 32-bit Architecture)
// ============================================================
void setupI2S() {
    pinMode(MIC_GND_PIN, OUTPUT);
    digitalWrite(MIC_GND_PIN, LOW);

    pinMode(I2S_LR, OUTPUT);
    digitalWrite(I2S_LR, LOW);

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // 32-bit alignment
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = (i2s_comm_format_t)I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 2,  // Ultra-low latency DMA buffers
        .dma_buf_len = SAMPLES,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK,
        .ws_io_num = I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_SD
    };

    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_PORT, &pin_config);
    i2s_zero_dma_buffer(I2S_PORT);
}

// ============================================================
//  ESP-NOW Setup & Traffic Logging
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

    if (len >= (int)sizeof(DoorbellMsg) && data != NULL) {
        DoorbellMsg msg;
        memcpy(&msg, data, sizeof(msg));
        if (msg.msgType == 0x01) {
            entry.isDoorbell = true;
            validDoorbellPackets++;
        } else {
            unknownPackets++;
        }
    } else {
        unknownPackets++;
    }

    espNowLog[espNowLogHead] = entry;
    espNowLogHead = (espNowLogHead + 1) % MAX_ESPNOW_LOGS;
    if (espNowLogCount < MAX_ESPNOW_LOGS) espNowLogCount++;

    #ifdef DEBUG_ENABLED
    DEBUG_PRINTF("[ESP-NOW REC] Len: %d | MAC: %02X:%02X:%02X:%02X:%02X:%02X | %s\n",
        len, entry.mac[0], entry.mac[1], entry.mac[2], entry.mac[3], entry.mac[4], entry.mac[5],
        entry.isDoorbell ? "DOORBELL MSG (0x01)" : "UNKNOWN/OTHER");
    #endif
}

void setupESPNow() {
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW init failed!");
        return;
    }

    // Register receive callback on Master to log incoming traffic
    esp_now_register_recv_cb(esp_now_recv_cb_t(onMasterEspNowRecv));

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, broadcastAddr, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        DEBUG_PRINTLN("Failed to add broadcast peer");
    }
}

void sendEspNowPacket(bool isTest = false) {
    DoorbellMsg msg;
    msg.msgType    = 0x01;
    msg.durationMs = (uint16_t)duration;

    uint8_t r = 0, g = 0, b = 0;
    if (partyMode && !isTest) {
        getRandomPartyColor(r, g, b);
    } else {
        r = colorR;
        g = colorG;
        b = colorB;
    }

    float bScale = constrain(brightness, 10, 100) / 100.0f;
    msg.r = (uint8_t)(r * bScale);
    msg.g = (uint8_t)(g * bScale);
    msg.b = (uint8_t)(b * bScale);

    esp_now_send(broadcastAddr, (uint8_t*)&msg, sizeof(msg));
}

// ============================================================
//  NVS Load / Save
// ============================================================
void loadSettings() {
    prefs.begin("doorbell", true);
    threshold   = prefs.getInt("threshold", 2500);
    duration    = prefs.getInt("duration", 3000);
    brightness  = prefs.getInt("bright", 100);
    partyMode   = prefs.getBool("party", true);
    colorR      = prefs.getUChar("colorR", 0);
    colorG      = prefs.getUChar("colorG", 210);
    colorB      = prefs.getUChar("colorB", 255);
    micGain     = prefs.getFloat("gain", 1.5f);
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
    prefs.end();
}

// ============================================================
//  Web UI HTML (Modern Responsive Dark Glassmorphism)
// ============================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>DeafDoorbell Master</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #0d1117;
      --card: rgba(22, 27, 34, 0.85);
      --border: rgba(255, 255, 255, 0.12);
      --accent: #00d2ff;
      --party-neon: #ff007f;
      --text: #e6edf3;
      --text-dim: #8b949e;
      --warn: #ff4d4d;
      --success: #3fb950;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 10%, #161b22, #0d1117 80%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }
    .container { width: 100%; max-width: 520px; }
    header { text-align: center; margin-bottom: 16px; }
    h1 {
      font-size: 1.6em;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #00d2ff, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
    }
    .subtitle { font-size: 0.85em; color: var(--text-dim); }
    .card {
      background: var(--card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card-title {
      font-size: 0.95em;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    label { display: block; margin-bottom: 6px; font-size: 0.85em; color: var(--text-dim); }
    input[type=range] {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: #30363d;
      outline: none;
      margin: 8px 0;
      accent-color: var(--accent);
    }
    .val-display {
      font-size: 1.15em;
      font-weight: 700;
      color: #fff;
      text-align: right;
    }
    .flex-row { display: flex; align-items: center; justify-content: space-between; }
    .bar-wrap {
      height: 22px;
      background: #21262d;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      margin: 8px 0;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00d2ff 0%, #a855f7 60%, #ff007f 100%);
      width: 0%;
      transition: width 0.08s ease;
      border-radius: 8px;
    }
    .bar-thresh {
      position: absolute;
      top: 0;
      height: 100%;
      width: 3px;
      background: #eab308;
      box-shadow: 0 0 8px #eab308;
      z-index: 2;
    }
    .triggered-flash {
      border-color: #ff007f !important;
      box-shadow: 0 0 24px rgba(255, 0, 127, 0.45) !important;
    }
    
    /* Toggle switch */
    .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #30363d;
      transition: .3s;
      border-radius: 26px;
    }
    .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    input:checked + .slider {
      background: linear-gradient(135deg, #ff007f, #a855f7);
      box-shadow: 0 0 12px rgba(255,0,127,0.5);
    }
    input:checked + .slider:before { transform: translateX(22px); }

    .party-card {
      border: 1px solid rgba(255, 0, 127, 0.3);
      background: linear-gradient(145deg, rgba(255,0,127,0.06), rgba(168,85,247,0.06));
    }
    .party-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.75em;
      font-weight: 700;
      background: rgba(255,0,127,0.2);
      color: #ff409f;
    }
    input[type=color] {
      width: 100%;
      height: 44px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #21262d;
      cursor: pointer;
      margin-top: 4px;
    }
    .btn-group { display: flex; gap: 10px; margin-top: 10px; }
    button {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.95em;
      cursor: pointer;
      border: none;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:active { transform: scale(0.97); }
    .btn-primary {
      background: linear-gradient(135deg, #00d2ff, #007aff);
      color: #fff;
      box-shadow: 0 4px 14px rgba(0, 210, 255, 0.3);
    }
    .btn-test {
      background: #21262d;
      color: #e6edf3;
      border: 1px solid var(--border);
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.75em;
      border-radius: 6px;
    }
    .net-info {
      font-size: 0.8em;
      color: var(--text-dim);
      line-height: 1.6;
      margin-top: 4px;
    }
    .net-info a { color: var(--accent); text-decoration: none; font-weight: 600; }
    .net-info a:hover { text-decoration: underline; }
    .status-msg {
      text-align: center;
      font-size: 0.85em;
      margin-top: 8px;
      color: #3fb950;
      min-height: 20px;
    }

    /* Sound Graph Styling */
    .graph-container {
      position: relative;
      width: 100%;
      margin-top: 10px;
    }
    canvas#soundCanvas {
      width: 100%;
      height: 190px;
      background: #0f141c;
      border-radius: 10px;
      border: 1px solid var(--border);
      display: block;
    }

    /* ESP-NOW Monitor Table */
    .log-table-wrap {
      max-height: 200px;
      overflow-y: auto;
      margin-top: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0f141c;
    }
    table.log-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.75em;
    }
    table.log-table th, table.log-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    table.log-table th {
      background: #161b22;
      color: var(--text-dim);
      position: sticky;
      top: 0;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 700;
    }
    .badge-ok { background: rgba(63,185,80,0.2); color: var(--success); }
    .badge-warn { background: rgba(255,77,77,0.2); color: var(--warn); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>DeafDoorbell</h1>
      <div class="subtitle">Ultra-Responsive Master Node & Traffic Monitor</div>
    </header>

    <!-- Sound History Graph -->
    <div class="card" id="graphCard">
      <div class="card-title">
        <span>Sound History Graph</span>
        <span class="val-display" id="graphCurrentMad">MAD: 0</span>
      </div>
      <div class="graph-container">
        <canvas id="soundCanvas" width="480" height="190"></canvas>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-dim); margin-top: 6px;">
        <span>X: Time Stamps</span>
        <span>Y: MAD Level | Gold Line: Threshold</span>
      </div>
    </div>

    <!-- Live Audio Level Bar -->
    <div class="card" id="liveCard">
      <div class="card-title">
        <span>Live Instant Audio (MAD)</span>
        <span class="val-display" id="rmsVal">0</span>
      </div>
      <div class="bar-wrap">
        <div class="bar-fill" id="bar"></div>
        <div class="bar-thresh" id="threshLine"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-dim);">
        <span>Silence</span>
        <span>Peak / Chime</span>
      </div>
    </div>

    <!-- ESP-NOW Traffic & Security Monitor -->
    <div class="card" id="espnowCard">
      <div class="card-title">
        <span>ESP-NOW Traffic Inspector</span>
        <button class="btn-test btn-sm" onclick="fetchEspNowLog()" style="flex:0; width:auto;">Refresh</button>
      </div>
      <div class="flex-row" style="font-size:0.8em; color:var(--text-dim);">
        <div>Total Packets: <strong id="espTotal" style="color:#fff;">0</strong></div>
        <div>Doorbell Msg: <strong id="espValid" style="color:var(--success);">0</strong></div>
        <div>Other Traffic: <strong id="espUnknown" style="color:var(--warn);">0</strong></div>
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>MAC Address</th>
              <th>Bytes</th>
              <th>Payload Snippet</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody id="espLogBody">
            <tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No ESP-NOW packets logged yet</td></tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button class="btn-test btn-sm" onclick="clearEspNowLog()" style="flex:0; width:auto;">Clear Log</button>
      </div>
    </div>

    <!-- Party Mode Toggle -->
    <div class="card party-card">
      <div class="card-title">
        <span>Party Mode</span>
        <span class="party-badge">STREAM RANDOM COLORS</span>
      </div>
      <div class="flex-row">
        <label style="margin:0;">Randomize follower colors on every broadcasted message</label>
        <label class="switch">
          <input type="checkbox" id="partyToggle" onchange="togglePartyMode(this.checked)">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- Threshold & Sensitivity -->
    <div class="card">
      <div class="card-title">
        <span>Trigger Threshold</span>
        <span class="val-display" id="threshVal">2500</span>
      </div>
      <label>Audio intensity required to trigger alert</label>
      <input type="range" id="threshSlider" min="200" max="30000" step="100" value="2500"
             oninput="document.getElementById('threshVal').innerText=this.value; updateThreshLine();">
    </div>

    <!-- Global Brightness -->
    <div class="card">
      <div class="card-title">
        <span>Global Brightness</span>
        <span class="val-display" id="brightVal">100%</span>
      </div>
      <label>Scale overall brightness of all follower alerts</label>
      <input type="range" id="brightSlider" min="10" max="100" step="5" value="100"
             oninput="document.getElementById('brightVal').innerText=this.value + '%';">
    </div>

    <!-- Flash Duration -->
    <div class="card">
      <div class="card-title">
        <span>Follower Duration (ms)</span>
        <span class="val-display" id="durVal">3000</span>
      </div>
      <label>How long followers sustain their flash</label>
      <input type="range" id="durSlider" min="500" max="15000" step="100" value="3000"
             oninput="document.getElementById('durVal').innerText=this.value;">
    </div>

    <!-- Static Color (When Party Mode is OFF) -->
    <div class="card" id="colorCard">
      <div class="card-title">
        <span>Custom Color (Party Mode Off)</span>
      </div>
      <label>Used when Party Mode is disabled</label>
      <input type="color" id="colorPicker" value="#00D2FF">
    </div>

    <!-- Actions -->
    <div class="card">
      <div class="btn-group">
        <button class="btn-primary" onclick="saveSettings()">Save Settings</button>
        <button class="btn-test" onclick="sendTestAlert()">Test Followers</button>
      </div>
      <div class="status-msg" id="status"></div>
    </div>

    <!-- Network & Discoverability -->
    <div class="card">
      <div class="card-title">
        <span>Network & Discoverability</span>
      </div>
      <div class="net-info">
        <div><strong>WiFi:</strong> <span id="wifiStatus">Connecting...</span></div>
        <div><strong>Local IP:</strong> <span id="localIp">---</span></div>
        <div><strong>mDNS URL:</strong> <a id="mdnsLink" href="http://deafdoorbell.local" target="_blank">http://deafdoorbell.local</a></div>
        <div><strong>OTA Update:</strong> <a href="/update" target="_blank">Web Firmware Update (/update)</a></div>
      </div>
    </div>
  </div>

  <script>
    let initialized = false;

    // --- Sound History Graph Data & Engine ---
    const MAX_GRAPH_POINTS = 50;
    const historyBuffer = []; // [{time: 'HH:MM:SS', mad: number, threshold: number, triggered: boolean}]

    function getTimeStamp() {
      const now = new Date();
      return now.toTimeString().split(' ')[0]; // "HH:MM:SS"
    }

    function renderSoundGraph() {
      const cvs = document.getElementById('soundCanvas');
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const w = cvs.width;
      const h = cvs.height;

      const pLeft = 45;
      const pRight = 15;
      const pTop = 15;
      const pBottom = 30;
      const plotW = w - pLeft - pRight;
      const plotH = h - pTop - pBottom;

      // Clear background
      ctx.fillStyle = '#0f141c';
      ctx.fillRect(0, 0, w, h);

      if (historyBuffer.length === 0) return;

      // Calculate Y max scale
      let maxMad = 10000;
      for (const p of historyBuffer) {
        if (p.mad > maxMad) maxMad = p.mad;
        if (p.threshold > maxMad) maxMad = p.threshold;
      }
      maxMad = Math.ceil(maxMad / 5000) * 5000; // Round to 5k steps

      // Grid lines & Y Axis Labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';

      const ySteps = 4;
      for (let i = 0; i <= ySteps; i++) {
        const val = (maxMad / ySteps) * i;
        const y = h - pBottom - (plotH * (i / ySteps));
        
        ctx.beginPath();
        ctx.moveTo(pLeft, y);
        ctx.lineTo(w - pRight, y);
        ctx.stroke();

        let label = val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val;
        ctx.fillText(label, pLeft - 6, y + 3);
      }

      // X Axis Labels (Timestamps)
      ctx.textAlign = 'center';
      const pointCount = historyBuffer.length;
      const stepX = plotW / Math.max(1, pointCount - 1);
      
      const labelInterval = Math.max(1, Math.floor(pointCount / 5));
      for (let i = 0; i < pointCount; i += labelInterval) {
        const x = pLeft + (i * stepX);
        ctx.fillText(historyBuffer[i].time, x, h - 10);
      }

      // Draw Threshold Line (Dashed Gold)
      const currentThresh = historyBuffer[historyBuffer.length - 1].threshold;
      const threshY = h - pBottom - (plotH * Math.min(1.0, currentThresh / maxMad));
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pLeft, threshY);
      ctx.lineTo(w - pRight, threshY);
      ctx.stroke();
      ctx.restore();

      // Draw MAD Filled Gradient Area & Curve
      const fillGrad = ctx.createLinearGradient(0, pTop, 0, h - pBottom);
      fillGrad.addColorStop(0, 'rgba(0, 210, 255, 0.45)');
      fillGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.25)');
      fillGrad.addColorStop(1, 'rgba(15, 20, 28, 0.0)');

      ctx.beginPath();
      ctx.moveTo(pLeft, h - pBottom);

      for (let i = 0; i < pointCount; i++) {
        const x = pLeft + (i * stepX);
        const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
        const y = h - pBottom - (plotH * yRatio);
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineTo(pLeft + ((pointCount - 1) * stepX), h - pBottom);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Draw Line Path
      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const x = pLeft + (i * stepX);
        const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
        const y = h - pBottom - (plotH * yRatio);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#00d2ff';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Draw Trigger Glow Markers
      for (let i = 0; i < pointCount; i++) {
        if (historyBuffer[i].triggered || historyBuffer[i].mad >= historyBuffer[i].threshold) {
          const x = pLeft + (i * stepX);
          const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
          const y = h - pBottom - (plotH * yRatio);

          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ff007f';
          ctx.shadowColor = '#ff007f';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    function updateThreshLine() {
      const t = parseInt(document.getElementById('threshSlider').value);
      const pct = Math.min(100, (t / 30000) * 100);
      document.getElementById('threshLine').style.left = pct + '%';
    }

    function pollData() {
      fetch('/data').then(r => r.json()).then(d => {
        const madVal = Math.round(d.mad);
        document.getElementById('rmsVal').innerText = madVal;
        document.getElementById('graphCurrentMad').innerText = 'MAD: ' + madVal;

        const pct = Math.min(100, (d.mad / 30000) * 100);
        document.getElementById('bar').style.width = pct + '%';

        // Push to sound history buffer
        historyBuffer.push({
          time: getTimeStamp(),
          mad: d.mad,
          threshold: d.threshold,
          triggered: d.triggered
        });
        if (historyBuffer.length > MAX_GRAPH_POINTS) {
          historyBuffer.shift();
        }
        renderSoundGraph();

        // Update ESP-NOW counters
        if (d.espTotal !== undefined) {
          document.getElementById('espTotal').innerText = d.espTotal;
          document.getElementById('espValid').innerText = d.espValid;
          document.getElementById('espUnknown').innerText = d.espUnknown;
        }

        if (!initialized) {
          document.getElementById('threshSlider').value = d.threshold;
          document.getElementById('threshVal').innerText = d.threshold;
          document.getElementById('brightSlider').value = d.brightness;
          document.getElementById('brightVal').innerText = d.brightness + '%';
          document.getElementById('durSlider').value = d.duration;
          document.getElementById('durVal').innerText = d.duration;
          document.getElementById('partyToggle').checked = d.party;
          document.getElementById('colorPicker').value = d.color;
          updateThreshLine();
          fetchEspNowLog();
          initialized = true;
        }

        document.getElementById('wifiStatus').innerText = d.wifiConnected ? ('Connected (' + d.rssi + ' dBm)') : 'AP Mode Only';
        document.getElementById('localIp').innerText = d.ip;

        if (d.triggered) {
          document.getElementById('liveCard').classList.add('triggered-flash');
          setTimeout(() => document.getElementById('liveCard').classList.remove('triggered-flash'), 400);
        }
      }).catch(() => {});
      setTimeout(pollData, 120);
    }

    function fetchEspNowLog() {
      fetch('/espnow').then(r => r.json()).then(d => {
        document.getElementById('espTotal').innerText = d.total;
        document.getElementById('espValid').innerText = d.doorbell;
        document.getElementById('espUnknown').innerText = d.unknown;

        const tbody = document.getElementById('espLogBody');
        if (!d.logs || d.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No ESP-NOW packets logged yet</td></tr>';
          return;
        }

        let html = '';
        d.logs.forEach(l => {
          const badgeClass = l.isDoorbell ? 'badge-ok' : 'badge-warn';
          const badgeText = l.isDoorbell ? 'DOORBELL 0x01' : 'OTHER ESPNOW';
          html += `<tr>
            <td>${l.timeAgoSec}s ago</td>
            <td><code>${l.mac}</code></td>
            <td>${l.len} B</td>
            <td><code>${l.payload}</code></td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          </tr>`;
        });
        tbody.innerHTML = html;
      }).catch(() => {});
    }

    function clearEspNowLog() {
      fetch('/espnow/clear').then(() => fetchEspNowLog());
    }

    function togglePartyMode(checked) {
      saveSettings();
    }

    function saveSettings() {
      const t = document.getElementById('threshSlider').value;
      const b = document.getElementById('brightSlider').value;
      const d = document.getElementById('durSlider').value;
      const p = document.getElementById('partyToggle').checked ? '1' : '0';
      const col = document.getElementById('colorPicker').value.substring(1);

      fetch('/set?threshold=' + t + '&bright=' + b + '&duration=' + d + '&party=' + p + '&color=' + col)
        .then(() => {
          document.getElementById('status').innerText = 'Settings saved successfully!';
          setTimeout(() => { document.getElementById('status').innerText = ''; }, 3000);
        })
        .catch(() => {
          document.getElementById('status').innerText = 'Error saving settings!';
        });
    }

    function sendTestAlert() {
      fetch('/test')
        .then(() => {
          document.getElementById('status').innerText = 'Test broadcast sent!';
          setTimeout(() => { document.getElementById('status').innerText = ''; }, 2500);
        });
    }

    pollData();
  </script>
</body>
</html>
)rawliteral";

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
//  Web Server Handlers
// ============================================================
void handleRoot() {
    server.send(200, "text/html", PORTAL_HTML);
}

void handleData() {
    String json = "{";
    json += "\"mad\":" + String(currentMAD) + ",";
    json += "\"level\":" + String(levelLP) + ",";
    json += "\"threshold\":" + String(threshold) + ",";
    json += "\"duration\":" + String(duration) + ",";
    json += "\"brightness\":" + String(brightness) + ",";
    json += "\"party\":" + String(partyMode ? "true" : "false") + ",";
    json += "\"color\":\"" + colorToHex() + "\",";
    json += "\"triggered\":" + String(uiTriggered ? "true" : "false") + ",";
    json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\",";
    json += "\"espTotal\":" + String(totalEspNowPackets) + ",";
    json += "\"espValid\":" + String(validDoorbellPackets) + ",";
    json += "\"espUnknown\":" + String(unknownPackets);
    json += "}";
    server.send(200, "application/json", json);
    uiTriggered = false;
}

void handleEspNowLog() {
    unsigned long now = millis();
    String json = "{";
    json += "\"total\":" + String(totalEspNowPackets) + ",";
    json += "\"doorbell\":" + String(validDoorbellPackets) + ",";
    json += "\"unknown\":" + String(unknownPackets) + ",";
    json += "\"logs\":[";

    for (int i = 0; i < espNowLogCount; i++) {
        int idx = (espNowLogHead - 1 - i + MAX_ESPNOW_LOGS) % MAX_ESPNOW_LOGS;
        EspNowLogEntry &e = espNowLog[idx];

        if (i > 0) json += ",";
        json += "{";
        
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 e.mac[0], e.mac[1], e.mac[2], e.mac[3], e.mac[4], e.mac[5]);
        json += "\"mac\":\"" + String(macStr) + "\",";
        json += "\"len\":" + String(e.len) + ",";

        String hexPayload = "";
        for (int p = 0; p < min((int)e.len, 16); p++) {
            char bHex[3];
            snprintf(bHex, sizeof(bHex), "%02X", e.payload[p]);
            hexPayload += String(bHex);
        }
        json += "\"payload\":\"" + hexPayload + "\",";
        json += "\"timeAgoSec\":" + String((now - e.timestampMs) / 1000) + ",";
        json += "\"isDoorbell\":" + String(e.isDoorbell ? "true" : "false");
        json += "}";
    }

    json += "]}";
    server.send(200, "application/json", json);
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

    saveSettings();
    DEBUG_PRINTF("Settings saved: thresh=%d dur=%d bright=%d party=%d color=%s\n",
                  threshold, duration, brightness, partyMode ? 1 : 0, colorToHex().c_str());
    server.send(200, "text/plain", "OK");
}

void handleTest() {
    sustainUntilMs = millis() + (unsigned long)duration;
    uiTriggered = true;
    for (int i = 0; i < 5; i++) {
        sendEspNowPacket(true);
        delay(15);
    }
    server.send(200, "text/plain", "TEST_SENT");
}

void handleUpdatePage() {
    server.send(200, "text/html", UPDATE_HTML);
}

void handleNotFound() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString(), true);
    server.send(302, "text/plain", "");
}

// ============================================================
//  Network & OTA Setup  (AP-Only on Channel 1)
// ============================================================
void setupNetworking() {
    WiFi.disconnect(true, true);
    delay(100);

    WiFi.mode(WIFI_AP_STA);

    IPAddress apIP(192, 168, 4, 1);
    IPAddress netMsk(255, 255, 255, 0);
    WiFi.softAP(AP_SSID, AP_PASS, 1);
    WiFi.softAPConfig(apIP, apIP, netMsk);
    dnsServer.start(DNS_PORT, "*", apIP);

    uint8_t actualCh = 0;
    wifi_second_chan_t secondCh;
    esp_wifi_get_channel(&actualCh, &secondCh);
    DEBUG_PRINTF("AP started: %s on Channel %d\n", AP_SSID, actualCh);
    DEBUG_PRINTF("Dashboard: http://%s\n", apIP.toString().c_str());

    // Web Server endpoints
    server.on("/", handleRoot);
    server.on("/data", handleData);
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
//  LED PWM Setup & Audio Reactivity
// ============================================================
void setupLED() {
    ledcSetup(LED_CHANNEL, 5000, 8);
    ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
    ledcWrite(LED_CHANNEL, 255); // Start OFF (inverted logic: 255=OFF)
}

void updateLED(float mad) {
    int brightness = map(constrain((int)mad, 100, 5000), 100, 5000, 0, 255);
    ledcWrite(LED_CHANNEL, 255 - brightness);
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    DEBUG_PRINTLN("\n==============================================");
    DEBUG_PRINTLN("   DeafDoorbell Master Node (Audio & Monitor)");
    DEBUG_PRINTLN("==============================================");

    loadSettings();
    DEBUG_PRINTF("Loaded Settings: Threshold=%d, Duration=%dms, Party=%d, Color=%s\n",
                  threshold, duration, partyMode ? 1 : 0, colorToHex().c_str());

    setupLED();
    setupI2S();
    setupNetworking();
    setupESPNow();

    DEBUG_PRINTLN("Master ready. Audio engine streaming & listening for ESP-NOW...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // 1. Handle Network Requests (Gated for low latency audio)
    static unsigned long lastNetHandle = 0;
    if (now - lastNetHandle >= 20) {
        dnsServer.processNextRequest();
        server.handleClient();
        ArduinoOTA.handle();
        lastNetHandle = now;
    }

    // 2. Audio Capture & Processing (32-bit I2S)
    int32_t samples[CHUNK_SIZE];
    size_t bytesRead = 0;
    i2s_read(I2S_PORT, samples, sizeof(samples), &bytesRead, portMAX_DELAY);

    if (bytesRead > 0) {
        // Shift raw history buffer
        for (int i = 0; i < SAMPLES - CHUNK_SIZE; i++) {
            rawSamples[i] = rawSamples[i + CHUNK_SIZE];
        }
        // Downscale and append new 64 samples
        for (int i = 0; i < CHUNK_SIZE; i++) {
            rawSamples[SAMPLES - CHUNK_SIZE + i] = (float)(samples[i] >> 14);
        }

        // Compute DC offset over 128-sample rolling window
        float dcSum = 0;
        for (int i = 0; i < SAMPLES; i++) {
            dcSum += rawSamples[i];
        }
        float dc = dcSum / SAMPLES;

        // Compute MAD (Mean Absolute Deviation)
        float mad = 0;
        for (int i = 0; i < SAMPLES; i++) {
            mad += fabsf(rawSamples[i] - dc);
        }
        mad /= SAMPLES;
        mad *= micGain;
        currentMAD = mad;

        // Exponential smoothing envelope
        levelLP += motorSmooth * (currentMAD - levelLP);

        // 3. Noise Glitch & Warmup Protection (Master side fix for random follower triggers)
        // Warmup: Ignore audio triggers for 2000ms after power-on while I2S DMA stabilizes.
        // Multi-chunk debounce: Require MAD >= threshold for at least 2 consecutive 4ms chunks.
        static int consecutiveOverThresh = 0;
        #define WARMUP_MS 2000
        #define MIN_TRIGGER_CHUNKS 2

        if (now > WARMUP_MS) {
            if (currentMAD >= threshold) {
                consecutiveOverThresh++;
                if (consecutiveOverThresh >= MIN_TRIGGER_CHUNKS) {
                    sustainUntilMs = now + (unsigned long)duration;
                    uiTriggered = true;
                }
            } else {
                consecutiveOverThresh = 0;
            }
        }

        bool isSustained = (now < sustainUntilMs);

        // Update onboard LED (ON during active alert sustain, OFF when silent)
        ledcWrite(LED_CHANNEL, isSustained ? 0 : 255);

        // 4. Doorbell Alert Protocol (Spammed continuously ONLY during active sustain)
        if (isSustained) {
            if (now - lastPacketSendMs >= SPAM_INTERVAL_MS) {
                sendEspNowPacket();
                lastPacketSendMs = now;
            }
        }

        // 5. Diagnostic Serial Log (~5Hz)
        static unsigned long lastLogTime = 0;
        if (now - lastLogTime > 200) {
            #ifdef DEBUG_ENABLED
                DEBUG_PRINTF("[MAD: %5.0f | LP: %5.0f | Thresh: %d] ", currentMAD, levelLP, threshold);
                int barLen = map(constrain((int)currentMAD, 0, 4000), 0, 4000, 0, 30);
                for (int i = 0; i < barLen; i++) DEBUG_PRINT("=");
                if (now < sustainUntilMs) DEBUG_PRINT(" >>> BROADCASTING ALERTS <<<");
                DEBUG_PRINTLN("");
            #endif
            lastLogTime = now;
        }
    }
}
