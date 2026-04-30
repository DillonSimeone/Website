#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <OSCMessage.h>
#include <OSCBundle.h>
#include <ESPmDNS.h>
#include "secrets.h"

// --- Configuration ---
#define LED_PIN 8
#define SETTINGS_FILE "/settings.json"
#define WIFI_CONFIG_FILE "/wifi_config.json"
#define DNS_PORT 53
#define HTTP_PORT 80
#define DEFAULT_OSC_PORT 8000
#define BOOT_PIN 9
#define MAX_MAPPINGS 16 // Limited to 16 due to ESP32 LEDC Channel limits

// --- State ---
enum DeviceMode { MODE_WEB, MODE_OSC };
volatile DeviceMode currentMode = MODE_WEB;
bool isUdpReady = false; 
bool isApMode = false; 
unsigned long lastLog = 0;

struct PinMapping {
  String address;
  bool wildcard;
  int pin;
  String type; // "toggle", "pulse", "pwm"
  bool invert;
  
  // Custom Params
  int pulseMs;      // 1 to 100
  int toggleVal;    // 0 to 1023 (PWM value when Toggled ON)
  
  // PWM Scaling
  float minIn, maxIn;
  int minOut, maxOut;
  
  // Runtime state
  bool lastHigh;
  bool logicState;
  unsigned long pulseDeadline;
};

PinMapping mappings[MAX_MAPPINGS];
int mappingCount = 0;
int oscPort = DEFAULT_OSC_PORT;

WiFiUDP udp;       
WiFiUDP senderUdp; 
WebServer server(HTTP_PORT);
DNSServer dnsServer;

// --- UDP Lifecycle ---
void startUdp() {
  if (WiFi.status() != WL_CONNECTED && !isApMode) return;
  
  isUdpReady = false;
  udp.stop();
  delay(50); 
  
  if (udp.begin(oscPort)) {
    isUdpReady = true;
    Serial.printf(">>> UDP LISTENER STARTED on Port %d <<<\n", oscPort);
    Serial.print("Listening at IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("!!! UDP START FAILED !!!");
  }
}

void stopUdp() {
  isUdpReady = false;
  udp.stop();
  Serial.println("UDP Listener stopped");
}

// --- Hardware Management ---
void setPinDigital(PinMapping& m, bool state) {
  // Direct digital write for Pulse (unless we want PWM pulse later)
  bool physVal = (state && !m.invert) || (!state && m.invert);
  digitalWrite(m.pin, physVal ? HIGH : LOW);
  Serial.printf("PIN %d -> %s\n", m.pin, physVal ? "HIGH" : "LOW");
}

void setPinPWM(int index, int duty) {
  // Wrapper for LEDC write
  ledcWrite(index, duty);
}

void initHardware() {
  for (int i = 0; i < mappingCount; i++) {
    PinMapping& m = mappings[i];
    
    // Safety check for Serial pins
    if (m.pin == 1 || m.pin == 3) {
      Serial.printf("!!! WARNING !!! Mapping uses Pin %d which is shared with Serial.\n", m.pin);
    }

    pinMode(m.pin, OUTPUT);
    
    // Attach LEDC for PWM *AND* Toggle (so we can control brightness)
    if (m.type == "pwm" || m.type == "toggle") {
      ledcSetup(i, 1000, 10); // 1kHz, 10-bit resolution (0-1023)
      ledcAttachPin(m.pin, i);
      ledcWrite(i, 0); // Start off
    } else {
      // Pulse uses standard digital IO
      digitalWrite(m.pin, m.invert ? HIGH : LOW);
    }
    
    m.lastHigh = false;
    m.logicState = false;
    m.pulseDeadline = 0;
  }
}

void handleOSCAction(PinMapping& m, float val, bool hasArg) {
  // Find index for LEDC
  int ch = -1;
  for(int i=0; i<mappingCount; i++) { if(&mappings[i] == &m) { ch = i; break; } }

  Serial.printf("ACTION: Pin %d [%s] Val: %.2f\n", m.pin, m.type.c_str(), val);
  
  if (m.type == "pwm") {
    if (!hasArg) return;
    val = constrain(val, m.minIn, m.maxIn);
    float normalized = (val - m.minIn) / (m.maxIn - m.minIn);
    int duty = m.minOut + (int)(normalized * (m.maxOut - m.minOut));
    duty = constrain(duty, 0, 1023);
    if (m.invert) duty = 1023 - duty;
    if(ch >= 0) ledcWrite(ch, duty);

  } else if (m.type == "toggle") {
    // Toggle state on ANY packet
    m.logicState = !m.logicState; 
    
    int outputVal = m.logicState ? m.toggleVal : 0; // Use user-defined brightness
    if (m.invert) outputVal = 1023 - outputVal;
    
    if(ch >= 0) ledcWrite(ch, outputVal);
    Serial.printf("Toggle -> %s (PWM %d)\n", m.logicState ? "ON" : "OFF", outputVal);

  } else if (m.type == "pulse") {
    // Pulse on ANY packet
    setPinDigital(m, true); 
    // Use user-defined duration
    m.pulseDeadline = millis() + m.pulseMs; 
  }
}

// Logic to match a single OSC Message against our mappings
void matchAndTrigger(String address, float val, bool hasArg) {
  Serial.printf("PROCESSING: %s | Arg: %.2f\n", address.c_str(), val);
  
  bool matched = false;
  for (int i = 0; i < mappingCount; i++) {
    if (mappings[i].wildcard || mappings[i].address == address) {
      Serial.println("MATCHED!");
      handleOSCAction(mappings[i], val, hasArg);
      matched = true;
      if (!mappings[i].wildcard) break;
    } 
  }
  if (!matched) Serial.println("No matching address found.");
}

// --- Manual Parsing Fallback ---
void parseRawOSC(uint8_t* buffer, int size) {
  Serial.println(">>> Starting Manual Parser <<<");
  
  String address = "";
  int idx = 0;
  while(idx < size && buffer[idx] != 0) { address += (char)buffer[idx]; idx++; }
  idx = (idx + 4) & ~3;
  
  if (idx >= size || buffer[idx] != ',') return; 
  
  String types = "";
  idx++; 
  while(idx < size && buffer[idx] != 0) { types += (char)buffer[idx]; idx++; }
  idx = (idx + 4) & ~3;
  
  float val = 0.0;
  bool hasArg = false;
  
  if (types.length() > 0) {
    char type = types.charAt(0);
    if (type == 'f') { 
      uint32_t u;
      u = (buffer[idx] << 24) | (buffer[idx+1] << 16) | (buffer[idx+2] << 8) | buffer[idx+3];
      memcpy(&val, &u, 4);
      hasArg = true;
    } else if (type == 'i') {
      int32_t i;
      i = (buffer[idx] << 24) | (buffer[idx+1] << 16) | (buffer[idx+2] << 8) | buffer[idx+3];
      val = (float)i;
      hasArg = true;
    } else if (type == 'm') { 
      uint8_t b1 = buffer[idx];
      uint8_t b3 = buffer[idx+2]; 
      // Note OFF or Note ON with 0 velocity
      if ((b1 & 0xF0) == 0x80) val = 0.0;
      else if ((b1 & 0xF0) == 0x90) { val = (b3 == 0) ? 0.0 : ((float)b3 / 127.0); }
      else val = (float)b3 / 127.0;
      hasArg = true;
    }
  }
  matchAndTrigger(address, val, hasArg);
}

void processOSCPacket(uint8_t* buffer, int size) {
  // Serial.print("Raw Hex: ");
  // for(int i=0; i<size; i++) Serial.printf("%02X ", buffer[i]);
  // Serial.println();

  if (size >= 8 && strncmp((char*)buffer, "#bundle", 7) == 0) {
    OSCBundle bundle;
    bundle.fill(buffer, size);
    if (!bundle.hasError()) {
      for (int i = 0; i < bundle.size(); i++) {
        OSCMessage *msg = bundle.getOSCMessage(i);
        float val = 0.0;
        bool has = false;
        if (msg->size() > 0) {
           if (msg->isFloat(0)) { val = msg->getFloat(0); has = true; }
           else if (msg->isInt(0)) { val = (float)msg->getInt(0); has = true; }
        }
        char addr[64];
        msg->getAddress(addr, 0, 64);
        matchAndTrigger(String(addr), val, has);
      }
      return;
    }
  }

  OSCMessage msg;
  msg.fill(buffer, size);
  
  if (!msg.hasError()) {
    float val = 0.0;
    bool hasArg = msg.size() > 0;
    if (hasArg) {
      if (msg.isFloat(0)) val = msg.getFloat(0);
      else if (msg.isInt(0)) val = (float)msg.getInt(0);
    }
    char addr[64];
    msg.getAddress(addr, 0, 64);
    matchAndTrigger(String(addr), val, hasArg);
  } else {
    parseRawOSC(buffer, size);
  }
}

void handlePulses() {
  unsigned long now = millis();
  for (int i = 0; i < mappingCount; i++) {
    if (mappings[i].pulseDeadline > 0 && now >= mappings[i].pulseDeadline) {
      setPinDigital(mappings[i], false);
      mappings[i].pulseDeadline = 0;
    }
  }
}

// --- Settings I/O ---
void loadSettings() {
  File file = LittleFS.open(SETTINGS_FILE, "r");
  if (!file) return;
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, file);
  file.close();
  if (error) return;
  
  oscPort = doc["osc_port"] | DEFAULT_OSC_PORT;
  JsonArray maps = doc["mappings"].as<JsonArray>();
  mappingCount = 0;
  for (JsonObject m : maps) {
    if (mappingCount >= MAX_MAPPINGS) break;
    PinMapping& pm = mappings[mappingCount++];
    pm.address = m["address"] | "/led";
    pm.wildcard = m["wildcard"] | false;
    pm.pin = m["pin"] | 2;
    pm.type = m["type"] | "toggle"; // Default changed
    pm.invert = m["invert"] | false;
    
    // New Params
    pm.pulseMs = m["pulse_ms"] | 50;
    pm.toggleVal = m["toggle_val"] | 1023;
    
    pm.minIn = m["min_in"] | 0.0;
    pm.maxIn = m["max_in"] | 1.0;
    pm.minOut = m["min_out"] | 0;
    pm.maxOut = m["max_out"] | 1023;
  }
  initHardware();
}

// --- Web Handlers ---
void handleStatus() {
  String ip = (WiFi.getMode() == WIFI_AP) ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  String json = "{\"ip\":\"" + ip + "\",\"port\":" + String(oscPort) + ",\"mode\":\"" + (currentMode == MODE_WEB ? "WEB" : "OSC") + "\"}";
  server.send(200, "application/json", json);
}

void handleModeOSC() {
  server.send(200, "application/json", "{\"status\":\"switching\"}");
  delay(100);
  currentMode = MODE_OSC;
}

void handleGetSettings() {
  File file = LittleFS.open(SETTINGS_FILE, "r");
  if (!file) { server.send(200, "application/json", "{\"osc_port\":8000,\"mappings\":[]}"); return; }
  server.streamFile(file, "application/json");
  file.close();
}

void handlePostSettings() {
  if (!server.hasArg("plain")) { server.send(400, "application/json", "{\"error\":\"no body\"}"); return; }
  File file = LittleFS.open(SETTINGS_FILE, "w");
  if (file) { file.print(server.arg("plain")); file.close(); }
  loadSettings();
  
  if (currentMode == MODE_OSC) {
    stopUdp();
  }
  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void handlePing() {
  if (!server.hasArg("plain")) { server.send(400, "application/json", "{\"error\":\"no body\"}"); return; }
  StaticJsonDocument<512> doc;
  deserializeJson(doc, server.arg("plain"));
  String ip = doc["ip"];
  int port = doc["port"];
  String address = doc["address"];
  OSCMessage msg(address.c_str());
  if (doc["args"].size() > 0) msg.add((float)doc["args"][0]);
  
  senderUdp.beginPacket(ip.c_str(), port);
  msg.send(senderUdp);
  senderUdp.endPacket();
  
  server.send(200, "application/json", "{\"status\":\"sent\"}");
}

void handleTrigger() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  StaticJsonDocument<128> doc;
  deserializeJson(doc, server.arg("plain"));
  int idx = doc["index"] | -1;
  if (idx >= 0 && idx < mappingCount) {
    handleOSCAction(mappings[idx], 1.0, false); 
    server.send(200, "application/json", "{\"status\":\"triggered\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"invalid index\"}");
  }
}

void handleWiFiScan() {
  Serial.println("Scanning WiFi...");
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + 
            ",\"auth\":" + String(WiFi.encryptionType(i)) + "}";
  }
  json += "]";
  server.send(200, "application/json", json);
  Serial.println("Scan complete");
}

void handleWiFiSave() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"no body\"}");
    return;
  }
  File file = LittleFS.open(WIFI_CONFIG_FILE, "w");
  if (file) {
    file.print(server.arg("plain"));
    file.close();
  }
  server.send(200, "application/json", "{\"status\":\"saved\"}");
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Wait for serial
  
  Serial.println("\n\n--- BOOT START ---");
  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  
  if (LittleFS.begin(true)) {
    Serial.println("LittleFS Mounted");
  } else {
    Serial.println("LittleFS Mount FAILED");
  }
  
  WiFi.mode(WIFI_STA);
  
  Serial.printf("Connecting to SSID: %s ", SECRET_SSID);
  WiFi.begin(SECRET_SSID, SECRET_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) { 
    delay(500); 
    Serial.print("."); 
    attempts++; 
  }
  Serial.println("");
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Connection Failed! Starting AP Mode.");
    WiFi.softAP("OSCdevice");
    Serial.print("AP IP Address: ");
    Serial.println(WiFi.softAPIP());
    
    dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
    isApMode = true;
  } else {
    Serial.println("WiFi Connected!");
    Serial.print("Device IP: ");
    Serial.println(WiFi.localIP());
  }
  
  if (MDNS.begin("oscdevice")) {
    Serial.println("mDNS started: http://oscdevice.local");
    MDNS.addService("http", "tcp", 80);
  } else {
    Serial.println("mDNS failed");
  }
  
  loadSettings();
  
  server.on("/api/status", handleStatus);
  server.on("/api/mode/osc", handleModeOSC);
  server.on("/api/settings", HTTP_GET, handleGetSettings);
  server.on("/api/settings", HTTP_POST, handlePostSettings);
  server.on("/api/ping", HTTP_POST, handlePing);
  server.on("/api/trigger", HTTP_POST, handleTrigger);
  server.on("/api/wifi/scan", handleWiFiScan);
  server.on("/api/wifi/save", HTTP_POST, handleWiFiSave);
  
  server.on("/index.html", []() {
    File file = LittleFS.open("/index.html", "r");
    if (!file) { server.send(404, "text/plain", "Index missing"); return; }
    server.streamFile(file, "text/html");
    file.close();
  });
  
  server.on("/", []() {
    File file = LittleFS.open("/index.html", "r");
    if (!file) { server.send(404, "text/plain", "Index missing"); return; }
    server.streamFile(file, "text/html");
    file.close();
  });

  server.onNotFound([]() {
    Serial.printf("404: %s\n", server.uri().c_str());
    if (server.uri().endsWith(".ico")) {
      server.send(404, "text/plain", "");
    } else {
      server.sendHeader("Location", "/", true);
      server.send(302, "text/plain", "");
    }
  });

  server.begin();
  Serial.println("Web Server Started");
  Serial.println("System Ready");
}

void loop() {
  server.handleClient();
  
  if (isApMode) {
    dnsServer.processNextRequest();
  }
  
  handlePulses();
  
  if (digitalRead(BOOT_PIN) == LOW) {
    if (currentMode == MODE_OSC) {
      currentMode = MODE_WEB;
      stopUdp();
      Serial.println("Switched to WEB Mode");
      delay(500);
    }
  }

  if (currentMode == MODE_OSC) {
    if (!isApMode && WiFi.status() != WL_CONNECTED) {
      if (isUdpReady) stopUdp();
      return; 
    }

    if (!isUdpReady) {
      if (millis() - lastLog > 2000) {
        startUdp();
        lastLog = millis();
      }
    } else {
      int packetSize = udp.parsePacket();
      if (packetSize > 0) {
        Serial.printf("RX Size: %d\n", packetSize);
        uint8_t buffer[512];
        int len = udp.read(buffer, sizeof(buffer));
        if (len > 0) processOSCPacket(buffer, len);
      }
    }
    
    if (millis() - lastLog > 5000) {
      Serial.println("[OSC] Heartbeat");
      lastLog = millis();
    }
  } else {
    if (millis() - lastLog > 5000) {
       if (WiFi.status() != WL_CONNECTED && !isApMode) Serial.println("WiFi Lost...");
       lastLog = millis();
    }
  }
  
  delay(2);
}