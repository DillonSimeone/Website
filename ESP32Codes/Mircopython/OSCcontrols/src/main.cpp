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
#define MAX_MAPPINGS 16 

// --- State ---
enum DeviceMode { MODE_WEB, MODE_OSC };
volatile DeviceMode currentMode = MODE_WEB;
bool isUdpReady = false; 
bool isApMode = false; 

struct PinMapping {
  String address;
  bool wildcard;
  int pin;
  String type; // "toggle", "pulse", "pwm"
  bool invert;
  int pulseMs;
  int toggleVal;
  float minIn, maxIn;
  int minOut, maxOut;
  
  // Runtime
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

// --- Hardware ---
void initHardware() {
  for (int i = 0; i < mappingCount; i++) {
    PinMapping& m = mappings[i];
    pinMode(m.pin, OUTPUT);
    if (m.type == "pwm" || m.type == "toggle") {
      ledcSetup(i, 1000, 10);
      ledcAttachPin(m.pin, i);
      ledcWrite(i, 0);
    } else {
      digitalWrite(m.pin, m.invert ? HIGH : LOW);
    }
    m.logicState = false;
    m.pulseDeadline = 0;
  }
}

void setPinDigital(PinMapping& m, bool state) {
  bool physVal = (state && !m.invert) || (!state && m.invert);
  digitalWrite(m.pin, physVal ? HIGH : LOW);
}

void handleOSCAction(PinMapping& m, float val, bool hasArg) {
  int ch = -1;
  // Fast lookup for LEDC channel
  for(int i=0; i<mappingCount; i++) { if(&mappings[i] == &m) { ch = i; break; } }

  if (m.type == "pwm") {
    if (!hasArg) return;
    val = constrain(val, m.minIn, m.maxIn);
    float normalized = (val - m.minIn) / (m.maxIn - m.minIn);
    int duty = m.minOut + (int)(normalized * (m.maxOut - m.minOut));
    duty = constrain(duty, 0, 1023);
    if (m.invert) duty = 1023 - duty;
    if(ch >= 0) ledcWrite(ch, duty);

  } else if (m.type == "toggle") {
    m.logicState = !m.logicState; 
    int outputVal = m.logicState ? m.toggleVal : 0;
    if (m.invert) outputVal = 1023 - outputVal;
    if(ch >= 0) ledcWrite(ch, outputVal);

  } else if (m.type == "pulse") {
    setPinDigital(m, true); 
    m.pulseDeadline = millis() + m.pulseMs; 
  }
}

void matchAndTrigger(String address, float val, bool hasArg) {
  for (int i = 0; i < mappingCount; i++) {
    if (mappings[i].wildcard || mappings[i].address == address) {
      handleOSCAction(mappings[i], val, hasArg);
      if (!mappings[i].wildcard) break;
    } 
  }
}

// --- OSC Parsing ---
void parseRawOSC(uint8_t* buffer, int size) {
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
      if ((b1 & 0xF0) == 0x80) val = 0.0;
      else if ((b1 & 0xF0) == 0x90) { val = (b3 == 0) ? 0.0 : ((float)b3 / 127.0); }
      else val = (float)b3 / 127.0;
      hasArg = true;
    }
  }
  matchAndTrigger(address, val, hasArg);
}

void processOSCPacket(uint8_t* buffer, int size) {
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

// --- Lifecycle ---
void startUdp() {
  if (WiFi.status() != WL_CONNECTED && !isApMode) return;
  isUdpReady = false;
  udp.stop();
  delay(50); 
  if (udp.begin(oscPort)) isUdpReady = true;
}

void stopUdp() {
  isUdpReady = false;
  udp.stop();
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

// --- Settings & Web ---
void loadSettings() {
  File file = LittleFS.open(SETTINGS_FILE, "r");
  if (!file) return;
  StaticJsonDocument<4096> doc;
  deserializeJson(doc, file);
  file.close();
  
  oscPort = doc["osc_port"] | DEFAULT_OSC_PORT;
  JsonArray maps = doc["mappings"].as<JsonArray>();
  mappingCount = 0;
  for (JsonObject m : maps) {
    if (mappingCount >= MAX_MAPPINGS) break;
    PinMapping& pm = mappings[mappingCount++];
    pm.address = m["address"] | "/led";
    pm.wildcard = m["wildcard"] | false;
    pm.pin = m["pin"] | 2;
    pm.type = m["type"] | "toggle";
    pm.invert = m["invert"] | false;
    pm.pulseMs = m["pulse_ms"] | 50;
    pm.toggleVal = m["toggle_val"] | 1023;
    pm.minIn = m["min_in"] | 0.0;
    pm.maxIn = m["max_in"] | 1.0;
    pm.minOut = m["min_out"] | 0;
    pm.maxOut = m["max_out"] | 1023;
  }
  initHardware();
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  
  LittleFS.begin(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(SECRET_SSID, SECRET_PASSWORD);
  
  // Connection Loop with LED Flash
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) { // 20 seconds
    digitalWrite(LED_PIN, (attempts % 2 == 0) ? HIGH : LOW); // Flash
    delay(500); 
    attempts++; 
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    // Fail -> AP Mode -> LED OFF
    digitalWrite(LED_PIN, LOW); 
    WiFi.softAP("OSCdevice");
    dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
    isApMode = true;
  } else {
    // Success -> LED SOLID ON
    digitalWrite(LED_PIN, HIGH);
    MDNS.begin("oscdevice");
    MDNS.addService("http", "tcp", 80);
  }
  
  loadSettings();
  
  // Web Routes
  server.on("/api/status", [](){
    String ip = (WiFi.getMode() == WIFI_AP) ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
    String json = "{\"ip\":\"" + ip + "\",\"port\":" + String(oscPort) + ",\"mode\":\"" + (currentMode == MODE_WEB ? "WEB" : "OSC") + "\"}";
    server.send(200, "application/json", json);
  });
  
  server.on("/api/mode/osc", [](){
    server.send(200, "application/json", "{\"status\":\"switching\"}");
    delay(100);
    currentMode = MODE_OSC;
  });

  server.on("/api/settings", HTTP_GET, [](){
    File file = LittleFS.open(SETTINGS_FILE, "r");
    if (!file) { server.send(200, "application/json", "{\"osc_port\":8000,\"mappings\":[]}"); return; }
    server.streamFile(file, "application/json");
    file.close();
  });

  server.on("/api/settings", HTTP_POST, [](){
    if (!server.hasArg("plain")) { server.send(400, "application/json", "{\"error\":\"no body\"}"); return; }
    File file = LittleFS.open(SETTINGS_FILE, "w");
    if (file) { file.print(server.arg("plain")); file.close(); }
    loadSettings();
    if (currentMode == MODE_OSC) stopUdp();
    server.send(200, "application/json", "{\"status\":\"ok\"}");
  });

  server.on("/api/ping", HTTP_POST, [](){
     if (!server.hasArg("plain")) return;
     StaticJsonDocument<512> doc;
     deserializeJson(doc, server.arg("plain"));
     OSCMessage msg((const char*)doc["address"]);
     if (doc["args"].size() > 0) msg.add((float)doc["args"][0]);
     senderUdp.beginPacket((const char*)doc["ip"], (int)doc["port"]);
     msg.send(senderUdp);
     senderUdp.endPacket();
     server.send(200, "application/json", "{\"status\":\"sent\"}");
  });

  server.on("/api/trigger", HTTP_POST, [](){
     if (!server.hasArg("plain")) return;
     StaticJsonDocument<128> doc;
     deserializeJson(doc, server.arg("plain"));
     int idx = doc["index"] | -1;
     if (idx >= 0 && idx < mappingCount) {
       handleOSCAction(mappings[idx], 1.0, false);
       server.send(200, "application/json", "{\"status\":\"triggered\"}");
     }
  });
  
  server.on("/api/wifi/scan", [](){
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; i++) {
      if (i > 0) json += ",";
      json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"auth\":" + String(WiFi.encryptionType(i)) + "}";
    }
    json += "]";
    server.send(200, "application/json", json);
  });

  server.on("/api/wifi/save", HTTP_POST, [](){
    if (!server.hasArg("plain")) return;
    File file = LittleFS.open(WIFI_CONFIG_FILE, "w");
    if (file) { file.print(server.arg("plain")); file.close(); }
    server.send(200, "application/json", "{\"status\":\"saved\"}");
  });
  
  server.onNotFound([]() {
    File file = LittleFS.open("/index.html", "r");
    if (file) { server.streamFile(file, "text/html"); file.close(); }
    else server.send(404, "text/plain", "Not Found");
  });

  server.begin();
}

void loop() {
  server.handleClient();
  if (isApMode) dnsServer.processNextRequest();
  handlePulses();
  
  if (digitalRead(BOOT_PIN) == LOW) {
    if (currentMode == MODE_OSC) {
      currentMode = MODE_WEB;
      stopUdp();
      delay(500);
    }
  }

  if (currentMode == MODE_OSC) {
    if (!isApMode && WiFi.status() != WL_CONNECTED) {
      if (isUdpReady) stopUdp();
      return; 
    }
    if (!isUdpReady) {
      static unsigned long lastStart = 0;
      if (millis() - lastStart > 2000) { startUdp(); lastStart = millis(); }
    } else {
      int packetSize = udp.parsePacket();
      if (packetSize > 0) {
        uint8_t buffer[512];
        int len = udp.read(buffer, sizeof(buffer));
        if (len > 0) processOSCPacket(buffer, len);
      }
    }
  }
  
  delay(1);
}