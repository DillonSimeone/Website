#include <Arduino.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>
#include <WiFi.h>
#include <esp_now.h>
#include <Preferences.h>

// --- TOGGLE WEB UI HERE ---
#define ENABLE_WEB_UI true 
// --------------------------

#if ENABLE_WEB_UI
#include <WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#endif

// I2S Configuration for INMP441 (Custom User Pinout)
#define I2S_SCK 1   // BCLK
#define I2S_LR  2   // L/R select
#define I2S_WS  3   // LRC
#define I2S_SD  0   // DIN
#define MIC_GND_PIN 4 // Soft Ground for mic
#define SAMPLES 128 // 8ms window for ultra-tight sync
#define SAMPLE_RATE 16000

#define ONBOARD_LED_PIN 8
#define LED_CHANNEL 0
#define BOOT_BUTTON_PIN 9 // Built-in Boot button on most C3 DevKits

bool webUiActive = ENABLE_WEB_UI;
unsigned long lastButtonPress = 0;
bool lastButtonState = HIGH;

float vReal[SAMPLES], vImag[SAMPLES];
ArduinoFFT<float> FFT(vReal, vImag, SAMPLES, SAMPLE_RATE);

Preferences preferences;

// ESP-NOW Struct definitions
#define MAX_CHANNELS 4 // 0: Bass, 1: Mid, 2: Treble, 3: Transient

typedef struct {
    uint8_t mode;          // 0: OFF, 1: Forward, 2: Reverse, 3: Alternating
    uint8_t intensity;     // 0-255 for motor speed / haptic amplitude
    uint8_t dayTonPattern; // 1-123 for DRV2605L ROM built-in effects
} HapticCommand;

typedef struct struct_message {
    HapticCommand channels[MAX_CHANNELS];
} struct_message;

struct_message broadcastData;
esp_now_peer_info_t peerInfo;
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Configuration
struct Config {
  float micGain = 1.0f;
  float motorLevelGate = 200.0f; // Lowered significantly to catch quiet humming
  float motorLevelHigh = 2500.0f;
  int motorDutyStart = 40; // Lowered for better quiet-sound sensitivity
  int motorDutyMax = 255;
  float motorSmooth = 0.25f;
  float motorCurve = 1.0f;
  bool useBandSplitter = false;
  
  float bassFreqMax = 250.0f;
  float trebleFreqMin = 2000.0f;

  float transientThreshold = 3.0f;
  int patternDurationMs = 150;
  
  uint8_t bassMode = 1;
  uint8_t bassPattern = 0;
  
  uint8_t midMode = 3;
  uint8_t midPattern = 0;
  
  uint8_t trebleMode = 2;
  uint8_t treblePattern = 0;
  
  uint8_t transientMode = 3;
  uint8_t transientPattern = 1;
  bool forceForward = true; // NEW: Force all haptics to Forward mode for testing
} config;

// State Variables
float levelLP = 0.0f;
float motorLP = 0.0f;
float prevLevel = 0.0f;
unsigned long transientEndTime = 0;
float currentMAD = 0;
float currentFreq = 0;
float bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;

void loadConfig() {
  preferences.begin("hp", true);
  config.micGain = preferences.getFloat("mg", config.micGain);
  config.motorLevelGate = preferences.getFloat("gt", config.motorLevelGate);
  config.motorDutyMax = preferences.getInt("mi", config.motorDutyMax);
  config.motorSmooth = preferences.getFloat("sm", config.motorSmooth);
  config.motorCurve = preferences.getFloat("mc", config.motorCurve);
  config.useBandSplitter = preferences.getBool("mlogic", config.useBandSplitter);
  config.bassMode = preferences.getUChar("bm", config.bassMode);
  config.bassPattern = preferences.getUChar("bp", config.bassPattern);
  config.midMode = preferences.getUChar("mm", config.midMode);
  config.midPattern = preferences.getUChar("mp", config.midPattern);
  config.trebleMode = preferences.getUChar("tm", config.trebleMode);
  config.treblePattern = preferences.getUChar("tp", config.treblePattern);
  config.transientMode = preferences.getUChar("trm", config.transientMode);
  config.transientPattern = preferences.getUChar("trp", config.transientPattern);
  config.forceForward = preferences.getBool("ffwd", config.forceForward);
  preferences.end();
}

void saveConfig() {
  preferences.begin("hp", false);
  preferences.putFloat("mg", config.micGain);
  preferences.putFloat("gt", config.motorLevelGate);
  preferences.putInt("mi", config.motorDutyMax);
  preferences.putFloat("sm", config.motorSmooth);
  preferences.putFloat("mc", config.motorCurve);
  preferences.putBool("mlogic", config.useBandSplitter);
  preferences.putUChar("bm", config.bassMode);
  preferences.putUChar("bp", config.bassPattern);
  preferences.putUChar("mm", config.midMode);
  preferences.putUChar("mp", config.midPattern);
  preferences.putUChar("tm", config.trebleMode);
  preferences.putUChar("tp", config.treblePattern);
  preferences.putUChar("trm", config.transientMode);
  preferences.putUChar("trp", config.transientPattern);
  preferences.putBool("ffwd", config.forceForward);
  preferences.end();
}

#if ENABLE_WEB_UI
DNSServer dnsServer;
WebServer server(80);
const char* ap_ssid = "DillonSimeoneHaptics";
const char* ap_password = "dillionhaptics";

String buildDataPanelHTML() {
  String html = "<div class='mon'>";
  html += "<div class='mi'><div class='ml'>Audio (MAD)</div><div class='mv'>" + String((int)currentMAD) + "</div></div>";
  html += "<div class='mi'><div class='ml'>Peak Freq (Hz)</div><div class='mv'>" + String((int)currentFreq) + "</div></div>";
  html += "<div class='mi'><div class='ml'>Bass Energy</div><div class='mv'>" + String((int)bassEnergy) + "</div></div>";
  html += "<div class='mi'><div class='ml'>Treble Energy</div><div class='mv'>" + String((int)trebleEnergy) + "</div></div>";
  html += "</div>";
  return html;
}

void setupWebUI() {
  if (!LittleFS.begin()) {
    Serial.println("LittleFS Mount Failed");
    return;
  }
  WiFi.softAP(ap_ssid, ap_password, 1);
  IPAddress IP = WiFi.softAPIP();
  dnsServer.start(53, "*", IP);

  server.on("/data", HTTP_GET, []() {
    server.send(200, "text/html", buildDataPanelHTML());
  });

  server.on("/config", HTTP_GET, []() {
    String json = "{";
    json += "\"mg\":" + String(config.micGain) + ",";
    json += "\"mi\":" + String(config.motorDutyMax) + ",";
    json += "\"gt\":" + String(config.motorLevelGate) + ",";
    json += "\"sm\":" + String(config.motorSmooth) + ",";
    json += "\"mc\":" + String(config.motorCurve) + ",";
    json += "\"mlogic\":" + String(config.useBandSplitter ? 1 : 0) + ",";
    json += "\"bm\":" + String(config.bassMode) + ",\"bp\":" + String(config.bassPattern) + ",";
    json += "\"mm\":" + String(config.midMode) + ",\"mp\":" + String(config.midPattern) + ",";
    json += "\"tm\":" + String(config.trebleMode) + ",\"tp\":" + String(config.treblePattern) + ",";
    json += "\"tt\":" + String(config.transientThreshold) + ",";
    json += "\"trp\":" + String(config.transientPattern) + ",";
    json += "\"trm\":" + String(config.transientMode) + ",";
    json += "\"ffwd\":" + String(config.forceForward ? 1 : 0);
    json += "}";
    server.send(200, "application/json", json);
  });

  server.on("/save", HTTP_POST, []() {
    if (server.hasArg("mg")) config.micGain = server.arg("mg").toFloat();
    if (server.hasArg("mi")) config.motorDutyMax = server.arg("mi").toInt();
    if (server.hasArg("gt")) config.motorLevelGate = server.arg("gt").toFloat();
    if (server.hasArg("sm")) config.motorSmooth = server.arg("sm").toFloat();
    if (server.hasArg("mc")) config.motorCurve = server.arg("mc").toFloat();
    if (server.hasArg("mlogic")) config.useBandSplitter = server.arg("mlogic").toInt() == 1;
    if (server.hasArg("bm")) config.bassMode = server.arg("bm").toInt();
    if (server.hasArg("bp")) config.bassPattern = server.arg("bp").toInt();
    if (server.hasArg("mm")) config.midMode = server.arg("mm").toInt();
    if (server.hasArg("mp")) config.midPattern = server.arg("mp").toInt();
    if (server.hasArg("tm")) config.trebleMode = server.arg("tm").toInt();
    if (server.hasArg("tp")) config.treblePattern = server.arg("tp").toInt();
    if (server.hasArg("tt")) config.transientThreshold = server.arg("tt").toFloat();
    if (server.hasArg("trp")) config.transientPattern = server.arg("trp").toInt();
    if (server.hasArg("trm")) config.transientMode = server.arg("trm").toInt();
    if (server.hasArg("ffwd")) config.forceForward = server.arg("ffwd").toInt() == 1;
    saveConfig();
    server.send(200, "text/html", "<html><body><h1>Saved! Haptics Updated.</h1><script>setTimeout(function(){location.href='/'},1500)</script></body></html>");
  });

  server.on("/generate_204", []() { server.send(204); });
  server.on("/favicon.ico", []() { server.send(404); });
  server.serveStatic("/", LittleFS, "/index.html");
  
  server.on("/kill", HTTP_GET, []() {
    server.send(200, "text/plain", "Going Dark...");
    webUiActive = false;
    server.stop();
    dnsServer.stop();
    Serial.println("Performance Mode Active. Services Stopped.");
  });

  server.onNotFound([]() {
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();
}
#endif

// 1:1 Reference mapping for punchy start
static inline uint8_t levelToDuty(float lvl, float gate, float high, int start, int maxDuty) {
    if (lvl <= gate) return 0;
    float x = constrain(lvl, gate, high);
    float t = (x - gate) / (high - gate);
    return constrain(int(start + t * (maxDuty - start)), 0, maxDuty);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize Soft Ground for INMP441
  pinMode(MIC_GND_PIN, OUTPUT);
  digitalWrite(MIC_GND_PIN, LOW);
  
  // Set L/R pin to LOW for Left channel
  pinMode(I2S_LR, OUTPUT);
  digitalWrite(I2S_LR, LOW);

  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);

  loadConfig();

  ledcSetup(LED_CHANNEL, 5000, 8);
  ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
  ledcWrite(LED_CHANNEL, 255); // Inverse logic: 255 is completely off.

  // Initialize ESP-NOW. Requires WiFi to be STA mode or AP_STA.
  WiFi.mode(WIFI_AP_STA);
  
#if ENABLE_WEB_UI
  setupWebUI();
#endif

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add broadcast peer");
    return;
  }

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // Use 32-bit for alignment, downscale in loop
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = (i2s_comm_format_t)I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 2,  // MINIMUM buffers to prevent queuing/lag
    .dma_buf_len = 128,  // Match SAMPLES
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

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

void loop() {
  // --- 1. PERFORMANCE MODE TOGGLE (BOOT BUTTON) ---
  bool currentButtonState = digitalRead(BOOT_BUTTON_PIN);
  if (currentButtonState == LOW && lastButtonState == HIGH && (millis() - lastButtonPress > 200)) {
    webUiActive = !webUiActive;
    lastButtonPress = millis();
    if (webUiActive) {
      server.begin();
      dnsServer.start(53, "*", WiFi.softAPIP());
      Serial.println("Web UI Enabled.");
    } else {
      server.stop();
      dnsServer.stop();
      Serial.println("Performance Mode Enabled.");
    }
  }
  lastButtonState = currentButtonState;

  // --- 2. WEB UI HANDLING (GATED TO 10Hz) ---
#if ENABLE_WEB_UI
  if (webUiActive) {
    static uint32_t lastWebCheck = 0;
    if (millis() - lastWebCheck > 100) { 
      dnsServer.processNextRequest();
      server.handleClient();
      lastWebCheck = millis();
    }
  }
#endif

  int32_t samples[SAMPLES]; 
  size_t bytesRead = 0;
  
  // Read exactly 'SAMPLES' (128) - this takes exactly 8ms and keeps the hum continuous
  i2s_read(I2S_NUM_0, samples, sizeof(samples), &bytesRead, portMAX_DELAY);

  if (bytesRead > 0) {
      int32_t sum = 0;
      for (int i = 0; i < SAMPLES; i++) {
          int32_t val = samples[i] >> 14;
          sum += val;
          vReal[i] = (float)val;
          vImag[i] = 0;
      }
      
      float dc = (float)sum / (float)SAMPLES;
      float mad = 0;
      for (int i = 0; i < SAMPLES; i++) {
          float centered = vReal[i] - dc;
          mad += fabsf(centered);
          vReal[i] = centered;
      }
      mad /= SAMPLES;
      mad *= config.micGain;
      currentMAD = mad;

    // FFT Calculation (Float is hardware accelerated or much faster on C3)
    FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    FFT.compute(FFT_FORWARD);
    FFT.complexToMagnitude();

    bassEnergy = 0; midEnergy = 0; trebleEnergy = 0;
    int bBC = 0, mBC = 0, tBC = 0;
    float maxAmp = 0;
    int maxIdx = 0;
    
    float freqPerBin = (SAMPLE_RATE / (float)SAMPLES);
    int bassBinMax = (int)(config.bassFreqMax / freqPerBin);
    int trebleBinMin = (int)(config.trebleFreqMin / freqPerBin);

    for (int i = 1; i < SAMPLES / 2; i++) {
      float binEnergy = vReal[i];
      if (i <= bassBinMax) { bassEnergy += binEnergy; bBC++; }
      else if (i >= trebleBinMin) { trebleEnergy += binEnergy; tBC++; }
      else { midEnergy += binEnergy; mBC++; }
      
      if (binEnergy > maxAmp) {
        maxAmp = binEnergy;
        maxIdx = i;
      }
    }
    
    // Normalize energy for UI readability
    if (bBC > 0) bassEnergy /= bBC;
    if (mBC > 0) midEnergy /= mBC;
    if (tBC > 0) trebleEnergy /= tBC;

    currentFreq = (maxIdx * freqPerBin);

    // Filter/Smooth Audio Envelope
    levelLP += config.motorSmooth * (float(mad) - levelLP);
    float activeLevel = levelLP;
    if (activeLevel < config.motorLevelGate) activeLevel = 0;

    // Default Haptic Command clear
    for (int i = 0; i < MAX_CHANNELS; i++) {
      broadcastData.channels[i].mode = 0;
      broadcastData.channels[i].intensity = 0;
      broadcastData.channels[i].dayTonPattern = 0;
    }

    // Determine target modes based on Band Splitter or Peak Freq
    uint8_t targetBassMode = 0, targetMidMode = 0, targetTrebleMode = 0;
    
    if (activeLevel > 0) {
      if (config.useBandSplitter) {
        if (bassEnergy > midEnergy && bassEnergy > trebleEnergy) targetBassMode = config.bassMode;
        else if (midEnergy > trebleEnergy) targetMidMode = config.midMode;
        else targetTrebleMode = config.trebleMode;
      } else {
        if (currentFreq < config.bassFreqMax) targetBassMode = config.bassMode;
        else if (currentFreq > config.trebleFreqMin) targetTrebleMode = config.trebleMode;
        else targetMidMode = config.midMode;
      }
    }

    // 4. Smooth and Pack (Match reference project exactly)
    motorLP += config.motorSmooth * (float(mad) - motorLP);
    uint8_t finalDuty = levelToDuty(motorLP, config.motorLevelGate, config.motorLevelHigh, 
                                     config.motorDutyStart, config.motorDutyMax);

    if (millis() < transientEndTime) {
      finalDuty = constrain(finalDuty + 50, 0, config.motorDutyMax);
    }

    // ALL channels get the full intensity (mirrors reference project behavior).
    // The 'mode' field differentiates directional behavior per band.
    // Each follower picks its channel for the MODE, but the motor always gets full audio energy.
    // Channel 0: Master (Always on if sound is present)
    broadcastData.channels[0].mode = 1; 
    broadcastData.channels[0].intensity = finalDuty;
    broadcastData.channels[0].dayTonPattern = config.bassPattern;

    // Channel 1: Mid (Isolated)
    broadcastData.channels[1].mode = config.forceForward ? 1 : targetMidMode;
    broadcastData.channels[1].intensity = targetMidMode ? finalDuty : 0;
    broadcastData.channels[1].dayTonPattern = config.midPattern;

    // Channel 2: Treble (Isolated)
    broadcastData.channels[2].mode = config.forceForward ? 1 : targetTrebleMode;
    broadcastData.channels[2].intensity = targetTrebleMode ? finalDuty : 0;
    broadcastData.channels[2].dayTonPattern = config.treblePattern;

    // Channel 3: Transient (Isolated)
    broadcastData.channels[3].mode = config.forceForward ? 1 : config.transientMode;
    broadcastData.channels[3].intensity = (millis() < transientEndTime) ? config.motorDutyMax : 0;
    broadcastData.channels[3].dayTonPattern = config.transientPattern;

    // 5. Broadcast over ESP-NOW
    esp_now_send(broadcastAddress, (uint8_t *) &broadcastData, sizeof(broadcastData));

    // 6. Visual Feedback
    ledcWrite(LED_CHANNEL, 255 - finalDuty);
  }
}
