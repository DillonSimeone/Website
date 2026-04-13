#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <esp_now.h>
#include <driver/i2s.h>
#include <Preferences.h>

// ============================================================
//  DeafDoorbell — Master Node
//  Listens for a door chime via INMP411 I2S mic, broadcasts
//  an ESP-NOW alert to all Followers in range.
// ============================================================

//#define DEBUG_ENABLED // Comment out to disable serial debug output for production

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
#define I2S_SD      0   // Data
#define I2S_SCK     1   // Clock
#define I2S_LR      2   // L/R channel select (driven LOW = left)
#define I2S_WS      3   // Word Select
#define SOFT_GND    4   // Optional soft ground
#define LED_PIN     8   // Onboard LED (inverted: 0=ON, 255=OFF)

// ===== I2S SETTINGS =====
#define I2S_PORT    I2S_NUM_0
#define SAMPLE_RATE 16000
#define BUFFER_SIZE 256

// ===== LED PWM =====
#define PWM_FREQ    5000
#define PWM_RES     8
#define PWM_CHAN    0

// ===== ESP-NOW =====
uint8_t broadcastAddr[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

typedef struct {
    uint8_t  msgType;       // 0x01 = DOORBELL_ALERT
    uint16_t durationMs;    // Flash duration
    uint8_t  r;             // LED color — Red
    uint8_t  g;             // LED color — Green
    uint8_t  b;             // LED color — Blue
} __attribute__((packed)) DoorbellMsg;

// ===== CONFIGURABLE STATE (NVS-backed) =====
Preferences prefs;
int      threshold   = 3000;    // Audio trigger level
int      duration    = 3000;    // Flash duration (ms)
int      cooldown    = 5000;    // Cooldown between triggers (ms)
uint8_t  colorR      = 255;    // Default: white
uint8_t  colorG      = 255;
uint8_t  colorB      = 255;

// ===== RELIABILITY (Burst Transmit) =====
#define BURST_COUNT        5    // Number of packets per trigger
#define BURST_INTERVAL_MS  200  // Time between burst packets
uint8_t  burstRemaining    = 0;
unsigned long lastBurstSendMs = 0;

// ===== RUNTIME STATE =====
volatile int  currentRMS     = 0;
bool          triggered      = false;
unsigned long lastTriggerMs  = 0;

// ===== WEB SERVER =====
DNSServer dnsServer;
WebServer server(80);
const byte DNS_PORT = 53;

// ============================================================
//  I2S Setup
// ============================================================
void setupI2S() {
    // Channel select — left
    pinMode(I2S_LR, OUTPUT);
    digitalWrite(I2S_LR, LOW);

    // Optional soft ground
    pinMode(SOFT_GND, OUTPUT);
    digitalWrite(SOFT_GND, LOW);

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_SIZE,
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
//  Audio Analysis — returns RMS magnitude
// ============================================================
int readAudioRMS() {
    int16_t samples[BUFFER_SIZE];
    size_t bytesRead;

    i2s_read(I2S_PORT, &samples, sizeof(samples), &bytesRead, 100 / portTICK_PERIOD_MS);
    if (bytesRead == 0) return 0;

    int count = bytesRead / 2;
    long sum = 0;
    for (int i = 0; i < count; i++) {
        sum += abs(samples[i]);
    }
    return sum / count;
}

// ============================================================
//  ESP-NOW Setup
// ============================================================
void setupESPNow() {
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW init failed!");
        return;
    }

    // Register broadcast peer
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, broadcastAddr, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        DEBUG_PRINTLN("Failed to add broadcast peer");
    }
}

void sendEspNowPacket() {
    DoorbellMsg msg;
    msg.msgType    = 0x01;
    msg.durationMs = (uint16_t)duration;
    msg.r = colorR;
    msg.g = colorG;
    msg.b = colorB;

    esp_err_t result = esp_now_send(broadcastAddr, (uint8_t*)&msg, sizeof(msg));
    if (result == ESP_OK) {
        DEBUG_PRINTLN(">>> DOORBELL ALERT BROADCAST!");
    } else {
        DEBUG_PRINTLN("!!! Broadcast failed");
    }
}

void broadcastAlert() {
    burstRemaining = BURST_COUNT;
    sendEspNowPacket();
    burstRemaining--;
    lastBurstSendMs = millis();
}

// ============================================================
//  NVS Load / Save
// ============================================================
void loadSettings() {
    prefs.begin("doorbell", true);
    threshold = prefs.getInt("threshold", 3000);
    duration  = prefs.getInt("duration", 3000);
    cooldown  = prefs.getInt("cooldown", 5000);
    colorR    = prefs.getUChar("colorR", 255);
    colorG    = prefs.getUChar("colorG", 255);
    colorB    = prefs.getUChar("colorB", 255);
    prefs.end();
}

void saveSettings() {
    prefs.begin("doorbell", false);
    prefs.putInt("threshold", threshold);
    prefs.putInt("duration", duration);
    prefs.putInt("cooldown", cooldown);
    prefs.putUChar("colorR", colorR);
    prefs.putUChar("colorG", colorG);
    prefs.putUChar("colorB", colorB);
    prefs.end();
}

// ============================================================
//  Hex color helpers
// ============================================================
uint8_t hexCharToVal(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return 0;
}

void parseHexColor(const String& hex) {
    // Accepts "RRGGBB" or "#RRGGBB"
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
//  Captive Portal — HTML
// ============================================================
const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>DeafDoorbell Master</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { --glass: rgba(255,255,255,0.08); --border: rgba(255,255,255,0.15); --accent: #00d2ff; --text: #eee; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: var(--text); font-family: 'Segoe UI', sans-serif; padding: 16px; min-height: 100vh; }
    h1 { text-align: center; font-size: 1.4em; margin-bottom: 12px; text-shadow: 0 0 12px var(--accent); }
    .card { background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .card h3 { margin-bottom: 10px; font-size: 1em; color: var(--accent); }
    label { display: block; margin-bottom: 4px; font-size: 0.85em; color: #aaa; }
    input[type=range] { width: 100%; margin-bottom: 6px; accent-color: var(--accent); }
    input[type=color] { width: 100%; height: 44px; border: 1px solid var(--border); border-radius: 8px; background: transparent; cursor: pointer; margin-bottom: 6px; }
    .val { font-size: 1.1em; font-weight: bold; color: #fff; text-align: center; }
    .bar-wrap { height: 28px; background: #222; border-radius: 6px; overflow: hidden; position: relative; margin-bottom: 6px; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #00d2ff, #ff4466); transition: width 0.15s; border-radius: 6px; }
    .bar-thresh { position: absolute; top: 0; height: 100%; width: 2px; background: #ff0; z-index: 2; }
    .triggered { animation: flashBorder 0.5s ease; }
    @keyframes flashBorder { 0%,100%{border-color: rgba(255,255,255,0.15);} 50%{border-color: #ff4466; box-shadow: 0 0 20px #ff4466;} }
    .status { font-size: 0.75em; color: #666; text-align: center; margin-top: 8px; }
    button { background: linear-gradient(135deg, var(--accent), #007aff); border: none; padding: 12px; color: #fff; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%; font-size: 1em; transition: 0.15s; }
    button:active { transform: scale(0.97); }
  </style>
</head>
<body>
  <h1>DeafDoorbell</h1>

  <!-- Live Audio -->
  <div class="card" id="liveCard">
    <h3>Live Audio Level</h3>
    <div class="bar-wrap">
      <div class="bar-fill" id="bar" style="width: 0%"></div>
      <div class="bar-thresh" id="threshLine" style="left: 30%"></div>
    </div>
    <div class="val" id="rmsVal">0</div>
  </div>

  <!-- Threshold -->
  <div class="card">
    <h3>Trigger Threshold</h3>
    <label>Low sensitivity &#8592; &#8594; High sensitivity</label>
    <input type="range" id="threshSlider" min="100" max="10000" step="50" value="3000"
           oninput="document.getElementById('threshVal').innerText=this.value; updateThreshLine();">
    <div class="val" id="threshVal">3000</div>
  </div>

  <!-- Flash Duration -->
  <div class="card">
    <h3>Flash Duration (ms)</h3>
    <input type="range" id="durSlider" min="500" max="10000" step="100" value="3000"
           oninput="document.getElementById('durVal').innerText=this.value">
    <div class="val" id="durVal">3000</div>
  </div>

  <!-- Cooldown -->
  <div class="card">
    <h3>Cooldown (ms)</h3>
    <label>Time between re-triggers</label>
    <input type="range" id="cdSlider" min="1000" max="30000" step="500" value="5000"
           oninput="document.getElementById('cdVal').innerText=this.value">
    <div class="val" id="cdVal">5000</div>
  </div>

  <!-- Color -->
  <div class="card">
    <h3>Flash Color</h3>
    <input type="color" id="colorPicker" value="#FFFFFF">
  </div>

  <!-- Save -->
  <div class="card">
    <button onclick="saveSettings()">Save Settings</button>
    <div class="status" id="status">Ready</div>
  </div>

  <script>
    function updateThreshLine() {
      const t = parseInt(document.getElementById('threshSlider').value);
      const pct = Math.min(100, (t / 10000) * 100);
      document.getElementById('threshLine').style.left = pct + '%';
    }

    function pollData() {
      fetch('/data').then(r => r.json()).then(d => {
        document.getElementById('rmsVal').innerText = d.rms;
        const pct = Math.min(100, (d.rms / 10000) * 100);
        document.getElementById('bar').style.width = pct + '%';

        // Update controls from server state (first load)
        if (!window._initialized) {
          document.getElementById('threshSlider').value = d.threshold;
          document.getElementById('threshVal').innerText = d.threshold;
          document.getElementById('durSlider').value = d.duration;
          document.getElementById('durVal').innerText = d.duration;
          document.getElementById('cdSlider').value = d.cooldown;
          document.getElementById('cdVal').innerText = d.cooldown;
          document.getElementById('colorPicker').value = d.color;
          updateThreshLine();
          window._initialized = true;
        }

        if (d.triggered) {
          document.getElementById('liveCard').classList.add('triggered');
          setTimeout(() => document.getElementById('liveCard').classList.remove('triggered'), 600);
        }
      }).catch(() => {});
      setTimeout(pollData, 200);
    }

    function saveSettings() {
      const t = document.getElementById('threshSlider').value;
      const d = document.getElementById('durSlider').value;
      const c = document.getElementById('cdSlider').value;
      const col = document.getElementById('colorPicker').value.substring(1); // strip #
      fetch('/set?threshold=' + t + '&duration=' + d + '&cooldown=' + c + '&color=' + col)
        .then(() => { document.getElementById('status').innerText = 'Saved!'; })
        .catch(() => { document.getElementById('status').innerText = 'Error!'; });
    }

    pollData();
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
    json += "\"rms\":" + String(currentRMS) + ",";
    json += "\"threshold\":" + String(threshold) + ",";
    json += "\"duration\":" + String(duration) + ",";
    json += "\"cooldown\":" + String(cooldown) + ",";
    json += "\"color\":\"" + colorToHex() + "\",";
    json += "\"triggered\":" + String(triggered ? "true" : "false");
    json += "}";
    server.send(200, "application/json", json);

    // Clear triggered flag after it's been read by the UI
    triggered = false;
}

void handleSet() {
    if (server.hasArg("threshold")) threshold = server.arg("threshold").toInt();
    if (server.hasArg("duration"))  duration  = server.arg("duration").toInt();
    if (server.hasArg("cooldown"))  cooldown  = server.arg("cooldown").toInt();
    if (server.hasArg("color"))     parseHexColor(server.arg("color"));

    saveSettings();
    DEBUG_PRINTF("Settings updated: thresh=%d dur=%d cd=%d color=%s\n",
                  threshold, duration, cooldown, colorToHex().c_str());
    server.send(200, "text/plain", "OK");
}

void handleNotFound() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString(), true);
    server.send(302, "text/plain", "");
}

// ============================================================
//  Captive Portal Setup
// ============================================================
void setupCaptivePortal() {
    IPAddress apIP(192, 168, 4, 1);
    IPAddress netMsk(255, 255, 255, 0);

    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP("MayanSusanDoorbell", "shrek!1234");
    delay(100);
    WiFi.softAPConfig(apIP, apIP, netMsk);

    dnsServer.start(DNS_PORT, "*", apIP);

    server.on("/", handleRoot);
    server.on("/data", handleData);
    server.on("/set", handleSet);
    server.onNotFound(handleNotFound);
    server.begin();

    Serial.print("Captive Portal IP: ");
    Serial.println(WiFi.softAPIP());
}

// ============================================================
//  LED PWM — audio-reactive onboard LED
// ============================================================
void setupLED() {
    ledcSetup(PWM_CHAN, PWM_FREQ, PWM_RES);
    ledcAttachPin(LED_PIN, PWM_CHAN);
    ledcWrite(PWM_CHAN, 255); // Start OFF (inverted)
}

void updateLED(int rms) {
    // Map RMS to brightness (inverted for C3 — 0 is full bright, 255 is off)
    int brightness = map(constrain(rms, 100, 8000), 100, 8000, 0, 255);
    ledcWrite(PWM_CHAN, 255 - brightness);
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    DEBUG_PRINTLN("\n=== DeafDoorbell Master ===");

    loadSettings();
    DEBUG_PRINTF("Loaded: thresh=%d dur=%d cd=%d color=%s\n",
                  threshold, duration, cooldown, colorToHex().c_str());

    setupLED();
    setupI2S();
    setupCaptivePortal();
    setupESPNow();

    DEBUG_PRINTLN("System ready. Listening for door chime...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    // 1. Service captive portal
    dnsServer.processNextRequest();
    server.handleClient();

    // 2. Read audio
    currentRMS = readAudioRMS();

    // 3. Update onboard LED with audio level
    updateLED(currentRMS);

    // 4. Check threshold
    unsigned long now = millis();
    if (currentRMS >= threshold && (now - lastTriggerMs > (unsigned long)cooldown)) {
        DEBUG_PRINTF("!!! TRIGGERED — RMS: %d >= Threshold: %d\n", currentRMS, threshold);
        triggered = true;
        lastTriggerMs = now;
        broadcastAlert();
    }

    // 5. Handle burst retransmissions
    if (burstRemaining > 0 && (now - lastBurstSendMs >= BURST_INTERVAL_MS)) {
        sendEspNowPacket();
        burstRemaining--;
        lastBurstSendMs = now;
    }

    // 6. Debug output (throttled)
    static unsigned long lastPrint = 0;
    if (now - lastPrint > 200) {
        #ifdef DEBUG_ENABLED
            DEBUG_PRINTF("[RMS: %5d] ", currentRMS);
            int barLen = map(constrain(currentRMS, 0, 5000), 0, 5000, 0, 40);
            for (int i = 0; i < barLen; i++) DEBUG_PRINT("=");
            if (currentRMS >= threshold) DEBUG_PRINT(" *** OVER THRESHOLD ***");
            DEBUG_PRINTLN("");
        #endif
        lastPrint = now;
    }
}
