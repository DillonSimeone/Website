#include <Arduino.h>
#include <FastLED.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

#define LED_PIN 1
#define NUM_LEDS 5
CRGB leds[NUM_LEDS];

// WiFi AP Configuration
const char* ap_ssid = "DillonSimeoneGeLu";
const char* ap_password = "dillion123";
DNSServer dnsServer;
WebServer server(80);
Preferences preferences;

// I2S configuration for INMP441
#define I2S_SCK 20
#define I2S_WS 10
#define I2S_SD 21
#define SAMPLE_RATE 16000
#define SAMPLES 256

double vReal[SAMPLES], vImag[SAMPLES];
ArduinoFFT<double> FFT(vReal, vImag, SAMPLES, SAMPLE_RATE);

// Hardware pins
#define NOODLE_LED_PIN 8
#define MOTOR_PIN_FWD 9
#define MOTOR_PIN_REV 7
#define PWM_FREQ 5000
#define PWM_BITS 8

// Configurable parameters (with defaults)
struct Config {
  float freqMin = 100.0f;
  float freqMax = 3000.0f;
  float ledLevelGain = 1.0f;
  float ledLevelRef = 2000.0f;
  uint8_t ledBrightMin = 0;
  uint8_t ledBrightMax = 50;
  float ledAttack = 0.07f;
  float ledRelease = 0.07f;
  float ledOffThreshold = 100.0f;
  
  float motorLevelGate = 650.0f;
  float motorLevelHigh = 2500.0f;
  int motorDutyStart = 150;
  int motorDutyMax = 255;
  float motorSmooth = 0.25f;
  float motorCurve = 1.0f; // NEW: Motor power curve
  
  float bassFreqMax = 250.0f;
  float trebleFreqMin = 2000.0f;
  float transientThreshold = 3.0f;
  int transientBoostMs = 150;
  int transientBoostDuty = 50;
  int alternateMs = 40;
  
  int bassMode = 1;
  int midMode = 3;
  int trebleMode = 2;
  
  float micGain = 1.0f;

  bool useBandSplitter = false;      // NEW: Toggle for motor logic
  bool useLedBandSplitter = false;  // NEW: Toggle for LED logic
} config;

// Fixed noodle LED settings
const float NOODLE_LEVEL_GATE = 500.0f;
const float NOODLE_LEVEL_HIGH = 15000.0f;
const int NOODLE_DUTY_START = 0;
const int NOODLE_DUTY_MAX = 25;
const float NOODLE_SMOOTH = 0.25f;

// State variables
float levelLP = 0.0f;
float ledEnv = 0.0f;
float noodleLP = 0.0f;
float motorLP = 0.0f;
float prevLevel = 0.0f;
unsigned long transientEndTime = 0;

// Global state for monitor
double currentMAD = 0;
double currentFreq = 0;
int currentMotorDuty = 0;
enum MotorMode { MODE_OFF, MODE_FORWARD, MODE_REVERSE, MODE_ALTERNATING };
MotorMode currentMode = MODE_OFF;

// Global state for band splitting
double bassEnergy = 0, midEnergy = 0, trebleEnergy = 0;
float ledEnvBass = 0.0f, ledEnvMid = 0.0f, ledEnvTreble = 0.0f;

unsigned long lastAlternateTime = 0;
bool alternateState = false;

void saveConfig() {
  preferences.begin("haptic", false);
  preferences.putFloat("micGain", config.micGain);
  preferences.putFloat("motorGate", config.motorLevelGate);
  preferences.putInt("motorMax", config.motorDutyMax);
  preferences.putFloat("motorSmooth", config.motorSmooth);
  preferences.putFloat("motorCurve", config.motorCurve); // NEW
  preferences.putFloat("transThresh", config.transientThreshold);
  preferences.putInt("transMs", config.transientBoostMs);
  preferences.putInt("transBoost", config.transientBoostDuty);
  preferences.putInt("bassMode", config.bassMode);
  preferences.putInt("midMode", config.midMode);
  preferences.putInt("trebleMode", config.trebleMode);
  preferences.putInt("ledMax", config.ledBrightMax);
  preferences.putFloat("ledAttack", config.ledAttack);
  preferences.putFloat("ledRelease", config.ledRelease);
  preferences.putBool("useBandSplit", config.useBandSplitter);      // NEW
  preferences.putBool("useLedBandSplit", config.useLedBandSplitter); // NEW
  preferences.end();
}

void loadConfig() {
  preferences.begin("haptic", true);
  config.micGain = preferences.getFloat("micGain", 1.0f);
  config.motorLevelGate = preferences.getFloat("motorGate", 650.0f);
  config.motorDutyMax = preferences.getInt("motorMax", 255);
  config.motorSmooth = preferences.getFloat("motorSmooth", 0.25f);
  config.motorCurve = preferences.getFloat("motorCurve", 1.0f); // NEW
  config.transientThreshold = preferences.getFloat("transThresh", 3.0f);
  config.transientBoostMs = preferences.getInt("transMs", 150);
  config.transientBoostDuty = preferences.getInt("transBoost", 50);
  config.bassMode = preferences.getInt("bassMode", 1);
  config.midMode = preferences.getInt("midMode", 3);
  config.trebleMode = preferences.getInt("trebleMode", 2); //3 (reverse can lock the mic into a loop)
  config.ledBrightMax = preferences.getInt("ledMax", 25);
  config.ledAttack = preferences.getFloat("ledAttack", 0.07f);
  config.ledRelease = preferences.getFloat("ledRelease", 0.07f);
  config.useBandSplitter = preferences.getBool("useBandSplit", false);      // NEW
  config.useLedBandSplitter = preferences.getBool("useLedBandSplit", false); // NEW
  preferences.end();
}

void resetConfig() {
  preferences.begin("haptic", false);
  preferences.clear();
  preferences.end();
  config = Config(); // Resets to default struct values
}

// Function to generate ONLY the dynamic monitor panel HTML for AJAX
String buildDataPanelHTML() {
  const char* modeStr[] = {"OFF", "FWD", "REV", "ALT"};
  String html = "<div class='mon'>";
  html += "<div class='mi'><div class='ml'>Audio</div><div class='mv'>" + String((int)currentMAD) + "</div></div>";
  html += "<div class='mi'><div class='ml'>Freq (Hz)</div><div class='mv'>" + String((int)currentFreq) + "</div></div>";
  html += "<div class='mi'><div class='ml'>Motor</div><div class='mv'>" + String((currentMotorDuty * 100) / 255) + "%</div></div>";
  html += "<div class='mi'><div class='ml'>Mode</div><div class='mv'>" + String(modeStr[currentMode]) + "</div></div>";
  html += "</div>";
  return html;
}


String buildHTML() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>Haptic Control</title><style>";
  html += "*{margin:0;padding:0;box-sizing:border-box}";
  html += "body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:15px}";
  html += ".card{background:rgba(255,255,255,0.15);border-radius:10px;padding:15px;margin:10px 0}";
  html += "h1{text-align:center;font-size:1.5em;margin-bottom:20px}";
  html += "h2{font-size:1.1em;margin:10px 0;border-bottom:1px solid rgba(255,255,255,0.3);padding-bottom:5px}";
  html += ".mon{display:grid;grid-template-columns:1fr 1fr;gap:10px}";
  html += ".mi{background:rgba(0,0,0,0.2);padding:10px;border-radius:8px;text-align:center}";
  html += ".mv{font-size:1.5em;font-weight:bold;font-family:monospace;margin-top:5px}";
  html += ".ml{font-size:0.8em;opacity:0.8}";
  html += "label{display:block;margin:10px 0 5px;font-size:0.9em}";
  html += ".vd{float:right;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:5px;font-family:monospace}";
  html += "input[type=range]{width:100%;height:6px;border-radius:5px;background:rgba(255,255,255,0.2)}";
  html += "select{width:100%;padding:8px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);color:#333}";
  html += "button{width:100%;padding:12px;border:none;border-radius:8px;font-size:1em;font-weight:bold;margin:5px 0;cursor:pointer}";
  html += ".bs{background:#667eea;color:#fff}.br{background:#f5576c;color:#fff}";
  
  // End of CSS/Head, start of JavaScript for AJAX refresh
  html += "</style></head><body><script>";
  html += "function updateData() {";
  html += "  var xhttp = new XMLHttpRequest();";
  html += "  xhttp.onreadystatechange = function() {";
  html += "    if (this.readyState == 4 && this.status == 200) {";
  html += "      document.getElementById('monitor-data').innerHTML = this.responseText;";
  html += "    }";
  html += "  };";
  html += "  xhttp.open('GET', '/data', true);";
  html += "  xhttp.send();";
  html += "}";
  html += "setInterval(updateData, 1000);"; // Poll every 1 second
  html += "window.onload = updateData;";     // Initial call
  html += "</script>";

  // Start Body HTML
  html += "<h1>Haptic Control</h1>";
  html += "<h1>By Dillon Simeone</h1>";
  
  // Monitor card - NOW USES PLACEHOLDER DIV
  html += "<div class='card'><h2>Monitor</h2><div id='monitor-data'>Loading...</div></div>";
  
  // Settings form
  html += "<form action='/save' method='POST'><div class='card'><h2>Motor</h2>";
  html += "<label>Mic Gain <span class='vd'>" + String(config.micGain, 1) + "x</span></label>";
  html += "<input type='range' name='mg' min='0.1' max='3' step='0.1' value='" + String(config.micGain, 1) + "'>";
  html += "<label>Intensity <span class='vd'>" + String(config.motorDutyMax) + "</span></label>";
  html += "<input type='range' name='mi' min='100' max='255' step='5' value='" + String(config.motorDutyMax) + "'>";
  html += "<label>Gate <span class='vd'>" + String((int)config.motorLevelGate) + "</span></label>";
  html += "<input type='range' name='gt' min='50' max='1000' step='10' value='" + String((int)config.motorLevelGate) + "'>";
  html += "<label>Smooth <span class='vd'>" + String(config.motorSmooth, 2) + "</span></label>";
  html += "<input type='range' name='sm' min='0.05' max='0.5' step='0.05' value='" + String(config.motorSmooth, 2) + "'>";
  html += "<label>Power Curve <span class='vd'>" + String(config.motorCurve, 2) + "</span></label>"; // NEW
  html += "<input type='range' name='mc' min='0.25' max='2.0' step='0.05' value='" + String(config.motorCurve, 2) + "'>"; // NEW
  html += "</div>";
  
  // Frequency modes
  html += "<div class='card'><h2>Haptic Logic</h2>"; // RENAMED
  html += "<label>Motor Logic</label><select name='mlogic'>"; // NEW
  html += "<option value='0'" + String(!config.useBandSplitter ?" selected":"") + ">Peak Frequency</option>"; // NEW
  html += "<option value='1'" + String(config.useBandSplitter ?" selected":"") + ">Band Energy</option>"; // NEW
  html += "</select>";
  html += "<label>Bass (&lt;250Hz) Mode</label><select name='bm'>";
  html += "<option value='0'" + String(config.bassMode==0?" selected":"") + ">Off</option>";
  html += "<option value='1'" + String(config.bassMode==1?" selected":"") + ">Forward</option>";
  html += "<option value='2'" + String(config.bassMode==2?" selected":"") + ">Reverse</option>";
  html += "<option value='3'" + String(config.bassMode==3?" selected":"") + ">Alternating</option></select>";
  html += "<label>Mid (250-2000Hz) Mode</label><select name='mm'>";
  html += "<option value='0'" + String(config.midMode==0?" selected":"") + ">Off</option>";
  html += "<option value='1'" + String(config.midMode==1?" selected":"") + ">Forward</option>";
  html += "<option value='2'" + String(config.midMode==2?" selected":"") + ">Reverse</option>";
  html += "<option value='3'" + String(config.midMode==3?" selected":"") + ">Alternating</option></select>";
  html += "<label>Treble (&gt;2000Hz) Mode</label><select name='tm'>";
  html += "<option value='0'" + String(config.trebleMode==0?" selected":"") + ">Off</option>";
  html += "<option value='1'" + String(config.trebleMode==1?" selected":"") + ">Forward</option>";
  html += "<option value='2'" + String(config.trebleMode==2?" selected":"") + ">Reverse</option>";
  html += "<option value='3'" + String(config.trebleMode==3?" selected":"") + ">Alternating</option></select>";
  html += "</div>";
  
  // Transients
  html += "<div class='card'><h2>Transient</h2>";
  html += "<label>Threshold <span class='vd'>" + String(config.transientThreshold, 1) + "x</span></label>";
  html += "<input type='range' name='tt' min='1.5' max='5' step='0.1' value='" + String(config.transientThreshold, 1) + "'>";
  html += "<label>Boost <span class='vd'>" + String(config.transientBoostDuty) + "</span></label>";
  html += "<input type='range' name='tb' min='20' max='100' step='5' value='" + String(config.transientBoostDuty) + "'>";
  html += "<label>Duration <span class='vd'>" + String(config.transientBoostMs) + "ms</span></label>";
  html += "<input type='range' name='td' min='50' max='300' step='10' value='" + String(config.transientBoostMs) + "'>";
  html += "</div>";
  
  // LEDs
  html += "<div class='card'><h2>LED</h2>";
  html += "<label>LED Mode</label><select name='llogic'>"; // NEW
  html += "<option value='0'" + String(!config.useLedBandSplitter ?" selected":"") + ">Peak Frequency</option>"; // NEW
  html += "<option value='1'" + String(config.useLedBandSplitter ?" selected":"") + ">3-Band Splitter</option>"; // NEW
  html += "</select>";
  html += "<label>Max Brightness <span class='vd'>" + String(config.ledBrightMax) + "</span></label>";
  html += "<input type='range' name='lb' min='50' max='25' step='5' value='" + String(config.ledBrightMax) + "'>";
  html += "<label>Attack (Fade-In) <span class='vd'>" + String(config.ledAttack, 2) + "s</span></label>";
  html += "<input type='range' name='la' min='0.01' max='1.0' step='0.01' value='" + String(config.ledAttack, 2) + "'>"; // UPDATED RANGE
  html += "<label>Release (Fade-Out) <span class='vd'>" + String(config.ledRelease, 2) + "s</span></label>";
  html += "<input type='range' name='lr' min='0.01' max='1.0' step='0.01' value='" + String(config.ledRelease, 2) + "'>"; // UPDATED RANGE
  html += "</div>";
  
  html += "<button type='submit' class='bs'>Save</button></form>";
  html += "<button onclick='location.href=\"/reset\"' class='br'>Reset</button>";
  html += "</body></html>";
  
  return html;
}

static inline int levelToDuty(float lvl, float gate, float high, int start, int maxDuty) {
  if (lvl <= gate) return 0;
  float x = constrain(lvl, gate, high);
  float t = (x - gate) / (high - gate);
  t = pow(t, config.motorCurve);
  return constrain(int(start + t * (maxDuty - start)), 0, maxDuty);
}

static inline uint8_t mapFreqToHue(double freqHz) {
  float f = constrain((float)freqHz, config.freqMin, config.freqMax);
  return map((int)f, (int)config.freqMin, (int)config.freqMax, 0, 160);
}

void setMotorDirection(MotorMode mode, int duty) {
  switch (mode) {
    case MODE_OFF:
      ledcWrite(1, 0); // FWD Channel
      ledcWrite(2, 0); // REV Channel
      break;
    case MODE_FORWARD:
      ledcWrite(1, duty);
      ledcWrite(2, 0);
      break;
    case MODE_REVERSE:
      ledcWrite(1, 0);
      ledcWrite(2, duty);
      break;
    case MODE_ALTERNATING:
      if (millis() - lastAlternateTime > config.alternateMs) {
        alternateState = !alternateState;
        lastAlternateTime = millis();
      }
      if (alternateState) {
        ledcWrite(1, duty);
        ledcWrite(2, 0);
      } else {
        ledcWrite(1, 0);
        ledcWrite(2, duty);
      }
      break;
  }
}

void setup() {
  // --- NEW: Pin Initialization ---
  // Set motor and noodle pins to OUTPUT and LOW immediately
  // to prevent them from floating and activating drivers on boot.
  pinMode(MOTOR_PIN_FWD, OUTPUT);
  pinMode(MOTOR_PIN_REV, OUTPUT);
  pinMode(NOODLE_LED_PIN, OUTPUT);
  
  digitalWrite(MOTOR_PIN_FWD, LOW);
  digitalWrite(MOTOR_PIN_REV, LOW);
  digitalWrite(NOODLE_LED_PIN, LOW);
  // --- End of NEW ---

  //Serial.begin(115200);
  delay(1000);
  //Serial.println("Starting...");

  loadConfig();
  //Serial.println("Config loaded");

  int wifi_channel = 1;
  WiFi.softAP(ap_ssid, ap_password, wifi_channel);
  IPAddress IP = WiFi.softAPIP();
  //Serial.print("AP IP: ");
  //Serial.println(IP);

  dnsServer.start(53, "*", IP);

  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", buildHTML());
  });

  server.on("/data", HTTP_GET, []() {
    server.send(200, "text/html", buildDataPanelHTML());
  });

  server.on("/save", HTTP_POST, []() {
    if (server.hasArg("mg")) config.micGain = server.arg("mg").toFloat();
    if (server.hasArg("mi")) config.motorDutyMax = server.arg("mi").toInt();
    if (server.hasArg("gt")) config.motorLevelGate = server.arg("gt").toFloat();
    if (server.hasArg("sm")) config.motorSmooth = server.arg("sm").toFloat();
    if (server.hasArg("mc")) config.motorCurve = server.arg("mc").toFloat(); // NEW
    if (server.hasArg("mlogic")) config.useBandSplitter = server.arg("mlogic").toInt() == 1; // NEW
    if (server.hasArg("bm")) config.bassMode = server.arg("bm").toInt();
    if (server.hasArg("mm")) config.midMode = server.arg("mm").toInt();
    if (server.hasArg("tm")) config.trebleMode = server.arg("tm").toInt();
    if (server.hasArg("tt")) config.transientThreshold = server.arg("tt").toFloat();
    if (server.hasArg("tb")) config.transientBoostDuty = server.arg("tb").toInt();
    if (server.hasArg("td")) config.transientBoostMs = server.arg("td").toInt();
    if (server.hasArg("llogic")) config.useLedBandSplitter = server.arg("llogic").toInt() == 1; // NEW
    if (server.hasArg("lb")) config.ledBrightMax = server.arg("lb").toInt();
    if (server.hasArg("la")) config.ledAttack = server.arg("la").toFloat();
    if (server.hasArg("lr")) config.ledRelease = server.arg("lr").toFloat();
    saveConfig();
    server.send(200, "text/html", "<html><body><h1>Saved!</h1><script>setTimeout(function(){location.href='/'},1500)</script></body></html>");
  });

  server.on("/reset", HTTP_GET, []() {
    resetConfig();
    server.send(200, "text/html", "<html><body><h1>Reset!</h1><script>setTimeout(function(){location.href='/'},1500)</script></body></html>");
  });

  server.onNotFound([]() {
    server.send(200, "text/html", buildHTML());
  });

  server.begin();
  //Serial.println("Server started");

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
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
  //Serial.println("I2S initialized");

  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(config.ledBrightMin);

  // Legacy LEDC Setup
  ledcSetup(0, PWM_FREQ, PWM_BITS); // Channel 0 for Noodle
  ledcAttachPin(NOODLE_LED_PIN, 0);
  ledcWrite(0, 0);

  ledcSetup(1, PWM_FREQ, PWM_BITS); // Channel 1 for Motor Fwd
  ledcAttachPin(MOTOR_PIN_FWD, 1);
  ledcWrite(1, 0);

  ledcSetup(2, PWM_FREQ, PWM_BITS); // Channel 2 for Motor Rev
  ledcAttachPin(MOTOR_PIN_REV, 2);
  ledcWrite(2, 0);
  
  //Serial.println("=== Ready ===");
  //Serial.printf("WiFi: %s / %s\n", ap_ssid, ap_password);
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  int32_t samples[SAMPLES];
  size_t bytesRead = 0;
  
  i2s_read(I2S_NUM_0, samples, sizeof(samples), &bytesRead, portMAX_DELAY);
  
  if (bytesRead > 0) {
    int32_t sum = 0;
    for (int i = 0; i < SAMPLES; i++) {
      int16_t sample = (int16_t)(samples[i] >> 14);
      sum += sample;
      vReal[i] = double(sample);
      vImag[i] = 0;
    }

    double dc = double(sum) / double(SAMPLES);
    double mad = 0;
    for (int i = 0; i < SAMPLES; i++) {
      double centered = vReal[i] - dc;
      mad += fabs(centered);
      vReal[i] = centered;
    }
    mad /= SAMPLES;
    mad *= config.micGain;

    FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    FFT.compute(FFT_FORWARD);
    FFT.complexToMagnitude();

    // --- Band Energy Calculation ---
    bassEnergy = 0; midEnergy = 0; trebleEnergy = 0;
    double maxAmp = 0;
    int maxIdx = 0;
    
    // Calculate frequency resolution per FFT bin
    double freqPerBin = (SAMPLE_RATE / (double)SAMPLES);
    int bassBinMax = (int)(config.bassFreqMax / freqPerBin);
    int trebleBinMin = (int)(config.trebleFreqMin / freqPerBin);

    for (int i = 1; i < SAMPLES / 2; i++) {
      double binEnergy = vReal[i];
      
      // Accumulate energy for bands
      if (i <= bassBinMax) {
        bassEnergy += binEnergy;
      } else if (i >= trebleBinMin) {
        trebleEnergy += binEnergy;
      } else {
        midEnergy += binEnergy;
      }
      
      // Find peak frequency (for old logic and monitor)
      if (binEnergy > maxAmp) {
        maxAmp = binEnergy;
        maxIdx = i;
      }
    }
    double peakHz = (maxIdx * freqPerBin);
    // --- End of Band Energy Calculation ---


    bool isTransient = false;
    if (mad > prevLevel * config.transientThreshold && mad > config.motorLevelGate * 1.5f) {
      isTransient = true;
      transientEndTime = millis() + config.transientBoostMs;
    }
    prevLevel = mad;

    MotorMode targetMode = MODE_OFF;
    if (mad > config.motorLevelGate) {
      if (config.useBandSplitter) {
        // --- NEW: Motor logic based on Band Energy ---
        if (bassEnergy > midEnergy && bassEnergy > trebleEnergy) {
          targetMode = (MotorMode)config.bassMode;
        } else if (midEnergy > trebleEnergy) {
          targetMode = (MotorMode)config.midMode;
        } else {
          targetMode = (MotorMode)config.trebleMode;
        }
      } else {
        // --- OLD: Motor logic based on Peak Frequency ---
        if (peakHz < config.bassFreqMax) {
          targetMode = (MotorMode)config.bassMode;
        } else if (peakHz > config.trebleFreqMin) {
          targetMode = (MotorMode)config.trebleMode;
        } else {
          targetMode = (MotorMode)config.midMode;
        }
      }
    }
    currentMode = targetMode;

    motorLP += config.motorSmooth * (float(mad) - motorLP);
    int baseDuty = levelToDuty(motorLP, config.motorLevelGate, config.motorLevelHigh, 
                              config.motorDutyStart, config.motorDutyMax);
    
    int motorDuty = baseDuty;
    if (millis() < transientEndTime) {
      motorDuty = constrain(baseDuty + config.transientBoostDuty, 0, config.motorDutyMax);
    }
    
    setMotorDirection(currentMode, motorDuty);

    noodleLP += NOODLE_SMOOTH * (float(mad) - noodleLP);
    int noodleDuty = levelToDuty(noodleLP, NOODLE_LEVEL_GATE, NOODLE_LEVEL_HIGH,
                                  NOODLE_DUTY_START, NOODLE_DUTY_MAX);
    ledcWrite(0, noodleDuty); // Noodle Channel 0


    // --- LED Logic ---
    if (mad < config.ledOffThreshold) {
      FastLED.clear(true);
    } else {
      if (config.useLedBandSplitter) {
        // --- 3-Band Splitter Logic ---
        // Note: These reference levels are guesses. May need to tune ledLevelRef and ledLevelGain
        // in the UI to get a good response, as band energy is different from 'mad'.
        float ref = config.ledLevelRef;
        float gain = config.ledLevelGain;
        float ledTargetBass = constrain((float(bassEnergy) * gain) / (ref * 10.0f), 0.0f, 1.0f);
        float ledTargetMid  = constrain((float(midEnergy) * gain) / (ref * 10.0f), 0.0f, 1.0f);
        float ledTargetTreble = constrain((float(trebleEnergy) * gain) / (ref * 5.0f), 0.0f, 1.0f);

        // Apply Attack/Release smoothing (fade)
        float attack = config.ledAttack;
        float release = config.ledRelease;
        ledEnvBass += ((ledTargetBass > ledEnvBass) ? attack : release) * (ledTargetBass - ledEnvBass);
        ledEnvMid  += ((ledTargetMid > ledEnvMid)   ? attack : release) * (ledTargetMid - ledEnvMid);
        ledEnvTreble += ((ledTargetTreble > ledEnvTreble) ? attack : release) * (ledTargetTreble - ledEnvTreble);

        uint8_t brightBass = config.ledBrightMin + (uint8_t)((config.ledBrightMax - config.ledBrightMin) * ledEnvBass);
        uint8_t brightMid  = config.ledBrightMin + (uint8_t)((config.ledBrightMax - config.ledBrightMin) * ledEnvMid);
        uint8_t brightTreble = config.ledBrightMin + (uint8_t)((config.ledBrightMax - config.ledBrightMin) * ledEnvTreble);

        // Divide strip into 3 sections
        int bassLedEnd = NUM_LEDS / 3;
        int midLedEnd = (NUM_LEDS * 2) / 3;

        fill_solid(&leds[0], bassLedEnd, CHSV(0, 255, brightBass)); // Bass = Red
        fill_solid(&leds[bassLedEnd], midLedEnd - bassLedEnd, CHSV(85, 255, brightMid)); // Mid = Green
        fill_solid(&leds[midLedEnd], NUM_LEDS - midLedEnd, CHSV(160, 255, brightTreble)); // Treble = Blue
        
        FastLED.show(); // Show all LEDs at once

      } else {
        // --- Peak Frequency Logic ---
        float ledTarget = (float(mad) * config.ledLevelGain) / config.ledLevelRef;
        ledTarget = constrain(ledTarget, 0.0f, 1.0f);
        float coeff = (ledTarget > ledEnv) ? config.ledAttack : config.ledRelease;
        ledEnv += coeff * (ledTarget - ledEnv);

        uint8_t bright = config.ledBrightMin + (uint8_t)((config.ledBrightMax - config.ledBrightMin) * ledEnv);
        uint8_t hue = mapFreqToHue(peakHz);
        fill_solid(leds, NUM_LEDS, CHSV(hue, 255, 255));
        FastLED.setBrightness(bright);
        FastLED.show();
      }
    }
    // --- End of LED Logic ---

    // Update global monitor variables
    currentMAD = mad;
    currentFreq = peakHz;
    currentMotorDuty = motorDuty;

    // static unsigned long lastPrint = 0;
    // if (millis() - lastPrint > 1000) {
    //   const char* modeStr[] = {"OFF", "FWD", "REV", "ALT"};
    //   Serial.printf("A:%.0f F:%.0f M:%s %d%% N:%d%%\n", mad, peakHz, modeStr[currentMode],(motorDuty * 100) / 255, (noodleDuty * 100) / 255);
    //   lastPrint = millis();
    // }
  }
}
