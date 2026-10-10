#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <Preferences.h>
#include <DNSServer.h>

DNSServer dnsServer;

/**
 * Omni-Wheel Robot Receiver (Configurable)
 * Supported Drivers: L298N Mini / MX1508 (2-pin PWM style)
 * 
 * FAILURE WARNING:
 * User requested pins: 34, 35, 32, 33, 25, 26, 27, 14
 * 
 * CRITICAL ISSUE:
 * Pins 34 and 35 are INPUT ONLY on standard ESP32s. They cannot drive motors.
 * This code defaults to using 12 and 13 instead of 34/35 for the default config.
 * 
 * Features:
 * - ESP-NOW Receiver
 * - SoftAP Web Interface for Pin Assignment
 * - NVS Storage for Pin Config
 */

// --- DATA STRUCTURES ---
// Structure must match the Master (CYD)
typedef struct struct_message {
    char command[16];
} struct_message;

// --- GLOBAL OBJECTS ---
Preferences preferences;
AsyncWebServer server(80);
struct_message incomingData;

// Motor Pin Configuration
struct MotorConfig {
    int rf_fwd; int rf_bwd;
    int lf_fwd; int lf_bwd;
    int rb_fwd; int rb_bwd;
    int lb_fwd; int lb_bwd;
};


MotorConfig currentPins;

// Motor Speed Configuration (0-255)
struct MotorSpeeds {
    int rf;
    int lf;
    int rb;
    int lb;
};

MotorSpeeds currentSpeeds;

// Default "Sanity" Config (Swapped 34/35 for 12/13)
const MotorConfig defaultPins = {
    32, 33, // RF (Was 34/35 -> 32/33 in list, arranged arbitrarily)
    25, 26, // LF
    27, 14, // RB
    12, 13  // LB (Replacements for 34/35)
};

// Default Speeds (Can be tuned in UI)
const MotorSpeeds defaultSpeeds = { 200, 200, 200, 200 };

// PWM Constants
const int FREQ = 15000;

const int RES = 8;
// Channels (0-7 for 8 pins)
enum { CH_RF_F, CH_RF_B, CH_LF_F, CH_LF_B, CH_RB_F, CH_RB_B, CH_LB_F, CH_LB_B };

// Speed
const int SPEED_DEFAULT = 200;

// --- HTML PAGE ---
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>Omni-Bot Config</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { --glass: rgba(255, 255, 255, 0.1); --border: rgba(255, 255, 255, 0.2); --text: #fff; --accent: #00d2ff; }
    body { background: #1a1a1a; color: var(--text); font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; text-align: center; }
    h1 { margin-bottom: 20px; text-shadow: 0 0 10px var(--accent); }
    .container { max-width: 600px; margin: 0 auto; display: grid; gap: 15px; }
    .card { background: var(--glass); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; color: #ccc; }
    select, input[type=range] { width: 100%; padding: 10px; margin-bottom: 15px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--border); border-radius: 6px; }
    button { background: linear-gradient(135deg, var(--accent), #007aff); border: none; padding: 12px 24px; color: white; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; width: 100%; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
    button:hover { transform: scale(1.02); box-shadow: 0 0 15px var(--accent); }
    button:active { transform: scale(0.98); }
    .warning { color: #ff4d4d; font-size: 0.8em; margin-top: -10px; margin-bottom: 10px; }
    .ctrl-btn { min-height: 60px; font-size: 1em; }
  </style>
</head>
<body>
  <h1>OmniBot Config</h1>
  <div class="container">
  <form id="configForm">
      <div class="card">
        <h3>Right Front</h3>
        <label>Forward Pin</label>
        <select name="rf_fwd" id="rf_fwd">%OPTIONS%</select>
        <label>Backward Pin</label>
        <select name="rf_bwd" id="rf_bwd">%OPTIONS%</select>
      </div>
      <div class="card">
        <h3>Left Front</h3>
        <label>Forward Pin</label>
        <select name="lf_fwd" id="lf_fwd">%OPTIONS%</select>
        <label>Backward Pin</label>
        <select name="lf_bwd" id="lf_bwd">%OPTIONS%</select>
      </div>
      <div class="card">
        <h3>Right Rear</h3>
        <label>Forward Pin</label>
        <select name="rb_fwd" id="rb_fwd">%OPTIONS%</select>
        <label>Backward Pin</label>
        <select name="rb_bwd" id="rb_bwd">%OPTIONS%</select>
      </div>
      <div class="card">
        <h3>Left Rear</h3>
        <label>Forward Pin</label>
        <select name="lb_fwd" id="lb_fwd">%OPTIONS%</select>
        <label>Backward Pin</label>
        <select name="lb_bwd" id="lb_bwd">%OPTIONS%</select>
      </div>
      <div class="card">
         <h3>Speed Calibration (0-255)</h3>
         <label>RF Speed: <span id="val_rf"></span></label>
         <input type="range" min="0" max="255" name="rf_spd" id="rf_spd" oninput="document.getElementById('val_rf').innerText = this.value">
         
         <label>LF Speed: <span id="val_lf"></span></label>
         <input type="range" min="0" max="255" name="lf_spd" id="lf_spd" oninput="document.getElementById('val_lf').innerText = this.value">
         
         <label>RB Speed: <span id="val_rb"></span></label>
         <input type="range" min="0" max="255" name="rb_spd" id="rb_spd" oninput="document.getElementById('val_rb').innerText = this.value">
         
         <label>LB Speed: <span id="val_lb"></span></label>
         <input type="range" min="0" max="255" name="lb_spd" id="lb_spd" oninput="document.getElementById('val_lb').innerText = this.value">
      </div>
      <div class="card">
         <p class="warning">Warning: GPIO 34, 35, 36, 39 are INPUT ONLY.</p>
         <button type="button" onclick="saveConfig()">Save Config</button>
      </div>
  </form>
  
  <!-- Control Buttons OUTSIDE the form -->
  <div class="card">
     <h3>Manual Control</h3>
     <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('ROT_L')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('ROT_L')" onmouseup="sendCmd('STOP')">ROT L</button>
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('UP')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('UP')" onmouseup="sendCmd('STOP')">UP</button>
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('ROT_R')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('ROT_R')" onmouseup="sendCmd('STOP')">ROT R</button>
         
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('LEFT')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('LEFT')" onmouseup="sendCmd('STOP')">SLIDE L</button>
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('DOWN')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('DOWN')" onmouseup="sendCmd('STOP')">DOWN</button>
         <button type="button" class="ctrl-btn" ontouchstart="sendCmd('RIGHT')" ontouchend="sendCmd('STOP')" onmousedown="sendCmd('RIGHT')" onmouseup="sendCmd('STOP')">SLIDE R</button>
     </div>
  </div>
  </div>
  
  <script>
  function sendCmd(c) { fetch('/cmd?go=' + c); }
  function saveConfig() {
      const form = document.getElementById('configForm');
      const data = new FormData(form);
      fetch('/save', { method: 'POST', body: data })
        .then(r => r.text())
        .then(t => alert('Saved! Settings applied.'))
        .catch(e => alert('Error saving.'));
  }
  </script>
</body>
</html>
)rawliteral";

// --- HELPER FUNCTIONS ---
// ... (Keep existing helpers) ...




// --- HELPER FUNCTIONS ---

// Generates the <option> list, marking the 'selected' pin
String processor(const String& var) {
    if(var == "OPTIONS") return ""; // Handled dynamically in specific route? No, let's just dump all options.
    return String();
}

String generateOptions(int selectedPin) {
    String html = "";
    int pins[] = {2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
    for (int p : pins) {
        html += "<option value='" + String(p) + "'";
        if (p == selectedPin) html += " selected";
        html += ">GPIO " + String(p) + "</option>";
    }
    return html;
}

// Replaces placeholders in the HTML
String templateProcessor(const String& var) {
    if (var == "OPTIONS") return ""; // Should not happen directly, we'll replace per-ID if possible, or just bulk
    return "";
}

// Drive Motor function for L298N Mini (PWM/LOW logic)
void setMotor(int ch_fwd, int ch_bwd, int speed) {
    // Debug output to verify PWM values
    // Serial.printf("Setting Motor: ChA=%d ChB=%d Spd=%d\n", ch_fwd, ch_bwd, speed);
    
    if (speed > 0) {
        ledcWrite(ch_fwd, speed);
        ledcWrite(ch_bwd, 0);
    } else if (speed < 0) {
        ledcWrite(ch_fwd, 0);
        ledcWrite(ch_bwd, abs(speed));
    } else {
        ledcWrite(ch_fwd, 0);
        ledcWrite(ch_bwd, 0);
    }
}

// Main Drive Math
void drive(int x, int y, int z) {
    // Basic implementation - Customize mixing as needed
    // Assuming x=Strafing, y=Forward/Back, z=Rotation
    // This is simple tank/mecanum logic
    
    // For now, let's just stick to the specific commands the user had in the old code
}

void executeCommand(const char* cmd) {
    // Motor order: RF, LF, RB, LB (Adjust mixing based on your specific robot chasis)
    // Standard Mecanum Mixing:
    // LF = y + x + z
    // RF = y - x - z
    // LB = y - x + z
    // RB = y + x - z
    
    // But sticking to the hardcoded specific blocks the user is comfortable with
    
    // Use configured speeds
    int rf = currentSpeeds.rf;
    int lf = currentSpeeds.lf;
    int rb = currentSpeeds.rb;
    int lb = currentSpeeds.lb;

    if (strcmp(cmd, "UP") == 0) {
        setMotor(CH_RF_F, CH_RF_B, rf); setMotor(CH_LF_F, CH_LF_B, lf);
        setMotor(CH_RB_F, CH_RB_B, rb); setMotor(CH_LB_F, CH_LB_B, lb);
    } else if (strcmp(cmd, "DOWN") == 0) {
        setMotor(CH_RF_F, CH_RF_B, -rf); setMotor(CH_LF_F, CH_LF_B, -lf);
        setMotor(CH_RB_F, CH_RB_B, -rb); setMotor(CH_LB_F, CH_LB_B, -lb);
    } else if (strcmp(cmd, "LEFT") == 0) { // Strafe Left
        setMotor(CH_RF_F, CH_RF_B, rf); setMotor(CH_LF_F, CH_LF_B, -lf);
        setMotor(CH_RB_F, CH_RB_B, -rb); setMotor(CH_LB_F, CH_LB_B, lb);
    } else if (strcmp(cmd, "RIGHT") == 0) { // Strafe Right
        setMotor(CH_RF_F, CH_RF_B, -rf); setMotor(CH_LF_F, CH_LF_B, lf);
        setMotor(CH_RB_F, CH_RB_B, rb); setMotor(CH_LB_F, CH_LB_B, -lb);
    } else if (strcmp(cmd, "STOP") == 0) {
        setMotor(CH_RF_F, CH_RF_B, 0); setMotor(CH_LF_F, CH_LF_B, 0);
        setMotor(CH_RB_F, CH_RB_B, 0); setMotor(CH_LB_F, CH_LB_B, 0);
    } else if (strcmp(cmd, "ROT_L") == 0) { // Rotate Left
        setMotor(CH_RF_F, CH_RF_B, rf); setMotor(CH_LF_F, CH_LF_B, -lf);
        setMotor(CH_RB_F, CH_RB_B, rb); setMotor(CH_LB_F, CH_LB_B, -lb);
    } else if (strcmp(cmd, "ROT_R") == 0) { // Rotate Right
        setMotor(CH_RF_F, CH_RF_B, -rf); setMotor(CH_LF_F, CH_LF_B, lf);
        setMotor(CH_RB_F, CH_RB_B, -rb); setMotor(CH_LB_F, CH_LB_B, lb);
    }
    // Add rotations etc as needed
}

void OnDataRecv(const uint8_t * mac, const uint8_t *incomingBytes, int len) {
    memcpy(&incomingData, incomingBytes, sizeof(incomingData));
    Serial.print("Rx: "); Serial.println(incomingData.command);
    executeCommand(incomingData.command);
}

void setup() {
    Serial.begin(115200);
    
    // 1. Load Preferences
    preferences.begin("robot-config", false);
    currentPins.rf_fwd = preferences.getInt("rf_fwd", defaultPins.rf_fwd);
    currentPins.rf_bwd = preferences.getInt("rf_bwd", defaultPins.rf_bwd);
    currentPins.lf_fwd = preferences.getInt("lf_fwd", defaultPins.lf_fwd);
    currentPins.lf_bwd = preferences.getInt("lf_bwd", defaultPins.lf_bwd);
    currentPins.rb_fwd = preferences.getInt("rb_fwd", defaultPins.rb_fwd);
    currentPins.rb_bwd = preferences.getInt("rb_bwd", defaultPins.rb_bwd);
    currentPins.lb_fwd = preferences.getInt("lb_fwd", defaultPins.lb_fwd);
    currentPins.lb_bwd = preferences.getInt("lb_bwd", defaultPins.lb_bwd);
    
    // Load Speeds
    currentSpeeds.rf = preferences.getInt("rf_spd", defaultSpeeds.rf);
    currentSpeeds.lf = preferences.getInt("lf_spd", defaultSpeeds.lf);
    currentSpeeds.rb = preferences.getInt("rb_spd", defaultSpeeds.rb);
    currentSpeeds.lb = preferences.getInt("lb_spd", defaultSpeeds.lb);

    Serial.println("Configured Pins:");
    Serial.printf("RF: %d/%d, LF: %d/%d\n", currentPins.rf_fwd, currentPins.rf_bwd, currentPins.lf_fwd, currentPins.lf_bwd);
    Serial.printf("RB: %d/%d, LB: %d/%d\n", currentPins.rb_fwd, currentPins.rb_bwd, currentPins.lb_fwd, currentPins.lb_bwd);

    // 2. Setup Motors (PWM attachment)
    ledcSetup(CH_RF_F, FREQ, RES); ledcAttachPin(currentPins.rf_fwd, CH_RF_F);
    ledcSetup(CH_RF_B, FREQ, RES); ledcAttachPin(currentPins.rf_bwd, CH_RF_B);
    
    ledcSetup(CH_LF_F, FREQ, RES); ledcAttachPin(currentPins.lf_fwd, CH_LF_F);
    ledcSetup(CH_LF_B, FREQ, RES); ledcAttachPin(currentPins.lf_bwd, CH_LF_B);
    
    ledcSetup(CH_RB_F, FREQ, RES); ledcAttachPin(currentPins.rb_fwd, CH_RB_F);
    ledcSetup(CH_RB_B, FREQ, RES); ledcAttachPin(currentPins.rb_bwd, CH_RB_B);
    
    ledcSetup(CH_LB_F, FREQ, RES); ledcAttachPin(currentPins.lb_fwd, CH_LB_F);
    ledcSetup(CH_LB_B, FREQ, RES); ledcAttachPin(currentPins.lb_bwd, CH_LB_B);

    // FORCE STOP ALL MOTORS
    for(int i=0; i<8; i++) {
        ledcWrite(i, 0);
    }
    Serial.println("Motors Initialized to 0.");

    // 3. Setup WiFi (AP + STATION for ESP-NOW)
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP("OmniBot_Setup", "12345678");
    Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
    Serial.print("Mac: "); Serial.println(WiFi.macAddress());

    // Start DNS server for captive portal (redirect all domains to AP IP)
    dnsServer.start(53, "*", WiFi.softAPIP());

    // 4. Web Server
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        String html = index_html;
        // Simple manual replacement since we need 8 different selected states
        // This acts as a poor-man's template engine
        // Note: This is verbose but safe.
        // We replace the specific ID blocks.
        
        auto replaceOpts = [](String& content, String id, int val) {
             String opts = generateOptions(val);
             // We need to target the SPECIFIC select.
             // The HTML provided above uses %OPTIONS% globally which is bad.
             // Let's rely on regex or just client-side JS?
             // Actually, simplest way with constraints:
             // Let's just inject the values into JS variables and let JS set the selects.
        };
        
        // Revised Strategy: Inject JSON config and let client-side JS set the values.
        String json = "{";
        json += "\"rf_fwd\":" + String(currentPins.rf_fwd) + ",";
        json += "\"rf_bwd\":" + String(currentPins.rf_bwd) + ",";
        json += "\"lf_fwd\":" + String(currentPins.lf_fwd) + ",";
        json += "\"lf_bwd\":" + String(currentPins.lf_bwd) + ",";
        json += "\"rb_fwd\":" + String(currentPins.rb_fwd) + ",";
        json += "\"rb_bwd\":" + String(currentPins.rb_bwd) + ",";
        json += "\"lb_fwd\":" + String(currentPins.lb_fwd) + ",";
        json += "\"lb_bwd\":" + String(currentPins.lb_bwd) + ",";
        json += "\"rf_spd\":" + String(currentSpeeds.rf) + ",";
        json += "\"lf_spd\":" + String(currentSpeeds.lf) + ",";
        json += "\"rb_spd\":" + String(currentSpeeds.rb) + ",";
        json += "\"lb_spd\":" + String(currentSpeeds.lb);
        json += "}";
        
        String script = "<script>const config = " + json + "; "
        "document.querySelectorAll('select').forEach(s => { if(config[s.name]) s.value = config[s.name]; });"
        "document.querySelectorAll('input[type=range]').forEach(s => { if(config[s.name]) { s.value = config[s.name]; document.getElementById('val_'+s.name.split('_')[0]).innerText = s.value; } });"
        "</script>";
        
        // Remove the %OPTIONS% placeholder with standard options, then append script
        String opts = generateOptions(-1); // No pre-selection
        html.replace("%OPTIONS%", opts);
        html += script;
        
        request->send(200, "text/html", html);
    });

    server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request){
        // Save and apply speeds (no restart needed)
        if (request->hasParam("rf_spd", true)) {
            int val = request->getParam("rf_spd", true)->value().toInt();
            preferences.putInt("rf_spd", val);
            currentSpeeds.rf = val;
        }
        if (request->hasParam("lf_spd", true)) {
            int val = request->getParam("lf_spd", true)->value().toInt();
            preferences.putInt("lf_spd", val);
            currentSpeeds.lf = val;
        }
        if (request->hasParam("rb_spd", true)) {
            int val = request->getParam("rb_spd", true)->value().toInt();
            preferences.putInt("rb_spd", val);
            currentSpeeds.rb = val;
        }
        if (request->hasParam("lb_spd", true)) {
            int val = request->getParam("lb_spd", true)->value().toInt();
            preferences.putInt("lb_spd", val);
            currentSpeeds.lb = val;
        }
        
        // Save and apply pin changes (requires re-attaching PWM)
        bool pinsChanged = false;
        if (request->hasParam("rf_fwd", true)) {
            int val = request->getParam("rf_fwd", true)->value().toInt();
            if (val != currentPins.rf_fwd) { preferences.putInt("rf_fwd", val); currentPins.rf_fwd = val; pinsChanged = true; }
        }
        if (request->hasParam("rf_bwd", true)) {
            int val = request->getParam("rf_bwd", true)->value().toInt();
            if (val != currentPins.rf_bwd) { preferences.putInt("rf_bwd", val); currentPins.rf_bwd = val; pinsChanged = true; }
        }
        if (request->hasParam("lf_fwd", true)) {
            int val = request->getParam("lf_fwd", true)->value().toInt();
            if (val != currentPins.lf_fwd) { preferences.putInt("lf_fwd", val); currentPins.lf_fwd = val; pinsChanged = true; }
        }
        if (request->hasParam("lf_bwd", true)) {
            int val = request->getParam("lf_bwd", true)->value().toInt();
            if (val != currentPins.lf_bwd) { preferences.putInt("lf_bwd", val); currentPins.lf_bwd = val; pinsChanged = true; }
        }
        if (request->hasParam("rb_fwd", true)) {
            int val = request->getParam("rb_fwd", true)->value().toInt();
            if (val != currentPins.rb_fwd) { preferences.putInt("rb_fwd", val); currentPins.rb_fwd = val; pinsChanged = true; }
        }
        if (request->hasParam("rb_bwd", true)) {
            int val = request->getParam("rb_bwd", true)->value().toInt();
            if (val != currentPins.rb_bwd) { preferences.putInt("rb_bwd", val); currentPins.rb_bwd = val; pinsChanged = true; }
        }
        if (request->hasParam("lb_fwd", true)) {
            int val = request->getParam("lb_fwd", true)->value().toInt();
            if (val != currentPins.lb_fwd) { preferences.putInt("lb_fwd", val); currentPins.lb_fwd = val; pinsChanged = true; }
        }
        if (request->hasParam("lb_bwd", true)) {
            int val = request->getParam("lb_bwd", true)->value().toInt();
            if (val != currentPins.lb_bwd) { preferences.putInt("lb_bwd", val); currentPins.lb_bwd = val; pinsChanged = true; }
        }
        
        // Re-attach PWM if pins changed
        if (pinsChanged) {
            ledcDetachPin(currentPins.rf_fwd); ledcDetachPin(currentPins.rf_bwd);
            ledcDetachPin(currentPins.lf_fwd); ledcDetachPin(currentPins.lf_bwd);
            ledcDetachPin(currentPins.rb_fwd); ledcDetachPin(currentPins.rb_bwd);
            ledcDetachPin(currentPins.lb_fwd); ledcDetachPin(currentPins.lb_bwd);
            
            ledcAttachPin(currentPins.rf_fwd, CH_RF_F); ledcAttachPin(currentPins.rf_bwd, CH_RF_B);
            ledcAttachPin(currentPins.lf_fwd, CH_LF_F); ledcAttachPin(currentPins.lf_bwd, CH_LF_B);
            ledcAttachPin(currentPins.rb_fwd, CH_RB_F); ledcAttachPin(currentPins.rb_bwd, CH_RB_B);
            ledcAttachPin(currentPins.lb_fwd, CH_LB_F); ledcAttachPin(currentPins.lb_bwd, CH_LB_B);
            
            // Force stop after re-attach
            for(int i=0; i<8; i++) ledcWrite(i, 0);
        }

        request->send(200, "text/plain", "OK");
    });



    server.on("/cmd", HTTP_GET, [](AsyncWebServerRequest *request){
        if (request->hasParam("go")) {
            String cmd = request->getParam("go")->value();
            executeCommand(cmd.c_str()); 
        }
        request->send(200, "text/plain", "OK");
    });

    // Captive portal: redirect all unknown requests to main page
    server.onNotFound([](AsyncWebServerRequest *request){
        request->redirect("/");
    });

    server.begin();

    // 5. ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW Init Failed");
        return;
    }
    esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));
}

void loop() {
    dnsServer.processNextRequest(); // Captive portal DNS handling
    delay(10);
}
