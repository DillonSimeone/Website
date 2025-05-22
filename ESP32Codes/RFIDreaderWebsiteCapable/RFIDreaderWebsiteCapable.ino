#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <DNSServer.h>
#include <esp_now.h>
#include <SPI.h>
#include <MFRC522.h>
#include <FastLED.h>

// ----- CONFIG -----
#define RST_PIN 7
#define SS_PIN  19
#define DATA_PIN 4
#define MAX_LEDS 60

// Define followers' MAC addresses here (replace with real MACs from follower output)
uint8_t peerList[][6] = {
  {0xEC, 0x64, 0xC9, 0x5D, 0xC0, 0xF8},
};
const int peerCount = sizeof(peerList) / 6;

// ----- SYNC STRUCT -----
struct LedSyncData {
  uint8_t mode;   // 0 = solid, 1 = fade, 2 = rainbow
  uint8_t r, g, b;
  uint8_t count;
};

// ----- GLOBALS -----
MFRC522 rfid(SS_PIN, RST_PIN);
CRGB leds[MAX_LEDS];

WebServer server(80);
DNSServer dnsServer;
String logBuffer = "";

const char *ap_ssid = "ESP32RFID1";
const byte DNS_PORT = 53;
const char *mdnsName = "ESP32RFID1";

unsigned long lastScanTime = 0;
int fadeIndex = 0;

bool writeMode = false;
String writePayload = "";
int targetBlock = 4;
int numLeds = 6;
uint8_t currentMode = 0;
CRGB currentColor = CRGB::Red;

// ----- HELPERS -----
void logMessage(const String &msg) {
  Serial.println(msg);
  logBuffer += msg + "<br>";
  if (logBuffer.length() > 8000) logBuffer = logBuffer.substring(logBuffer.length() - 8000);
}

void sendLedSync(uint8_t mode, CRGB color) {
  LedSyncData data;
  data.mode = mode;
  data.r = color.r;
  data.g = color.g;
  data.b = color.b;
  data.count = numLeds;

  for (int i = 0; i < peerCount; i++) {
    esp_now_send(peerList[i], (uint8_t*)&data, sizeof(data));
  }
}

void setStripColor(const CRGB &color) {
  currentMode = 0;
  currentColor = color;
  for (int i = 0; i < numLeds; i++) leds[i] = color;
  FastLED.show();
  sendLedSync(currentMode, color);
}

void showRainbow() {
  currentMode = 2;
  for (int i = 0; i < numLeds; i++) {
    leds[i] = CHSV((i * 255) / numLeds, 255, 255);
  }
  FastLED.show();
  sendLedSync(currentMode, CRGB::Black);  // Rainbow mode, color ignored
  delay(1000);
  setStripColor(CRGB::Red);
}

void setupWiFiAndCaptive() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid);
  delay(100);  // Allow AP to fully initialize
  IPAddress myIP = WiFi.softAPIP();
  logMessage("AP started. IP: " + myIP.toString());

  dnsServer.start(DNS_PORT, "*", myIP);

  if (MDNS.begin(mdnsName)) {
    logMessage("mDNS responder started: http://" + String(mdnsName) + ".local/");
  } else {
    logMessage("Error starting mDNS.");
  }
}

void setupESPNow() {
  delay(200);  // let AP stabilize

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }

  Serial.print("Master MAC: ");
  Serial.println(WiFi.softAPmacAddress());

  for (int i = 0; i < peerCount; i++) {
    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));  // zero out the struct

    memcpy(peer.peer_addr, peerList[i], 6);
    peer.channel = 0;                // auto-match AP channel
    peer.encrypt = false;
    peer.ifidx = WIFI_IF_AP;         // REQUIRED

    if (esp_now_is_peer_exist(peer.peer_addr)) {
      Serial.println("Peer already exists, removing...");
      esp_now_del_peer(peer.peer_addr);
    }

    esp_err_t result = esp_now_add_peer(&peer);
    if (result != ESP_OK) {
      Serial.print("❌ Failed to add peer [");
      for (int j = 0; j < 6; j++) {
        Serial.printf("%02X", peer.peer_addr[j]);
        if (j < 5) Serial.print(":");
      }
      Serial.print("] → Error: ");
      Serial.println(result);
    } else {
      Serial.println("✅ Peer added successfully.");
    }
  }

  delay(100);

  // Test ping
  esp_err_t ping = esp_now_send(peerList[0], NULL, 0);
  Serial.print("Initial peer ping result: ");
  Serial.println(ping == ESP_OK ? "Success" : String(ping));
}

void setupWebServer() {
  server.on("/", []() {
    String dropdown = "<select id='block'>";
    for (int i = 1; i < 64; i++) {
      if ((i + 1) % 4 == 0) continue;
      dropdown += "<option value='" + String(i) + "'>" + String(i) + "</option>";
    }
    dropdown += "</select>";

    server.send(200, "text/html", R"rawliteral(
      <!DOCTYPE html><html><head><meta charset='UTF-8'><title>RFID Log</title>
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;padding:20px}
      #log{height:50vh;width:90vw;overflow:auto;border:1px solid #aaa;background:#eee;padding:10px;margin-top:10px}
      input,select,button{margin:5px;padding:5px}</style>
      <script>
      setInterval(()=>{fetch('/log').then(r=>r.text()).then(t=>{
        let log=document.getElementById('log');
        let atBottom=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
        log.innerHTML=t;if(atBottom)log.scrollTop=log.scrollHeight;
      })},1000);
      function writeOnce(){
        fetch('/write',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'text='+encodeURIComponent(writedata.value)+'&block='+block.value});
      }
      function updateLeds(){
        fetch('/leds',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'length='+ledlength.value});
      }
      </script></head><body><h1>RFID READER LOG</h1>
      LED Count: <input type="number" id="ledlength" value="6" min="1" max="60">
      <button onclick="updateLeds()">Set LED Count</button><br>
      Target Block: )rawliteral" + dropdown + R"rawliteral(<br>
      <div id="log"></div>
      <form onsubmit="event.preventDefault();writeOnce();">
        <input type="text" id="writedata" maxlength="16">
        <button>WRITE ONCE</button>
      </form>
      </body></html>
    )rawliteral");
  });

  server.on("/log", []() {
    server.send(200, "text/html", logBuffer);
  });

  server.on("/write", HTTP_POST, []() {
    if (server.hasArg("text") && server.hasArg("block")) {
      writePayload = server.arg("text");
      targetBlock = server.arg("block").toInt();
      writeMode = true;
      logMessage("Write mode armed for block " + String(targetBlock) + " with: " + writePayload);
      setStripColor(CRGB::Orange);
      server.send(200, "text/plain", "Ready to write.");
    }
  });

  server.on("/leds", HTTP_POST, []() {
    if (server.hasArg("length")) {
      int len = server.arg("length").toInt();
      if (len > 0 && len <= MAX_LEDS) {
        numLeds = len;
        FastLED.clear(); FastLED.setBrightness(128); FastLED.show();
        logMessage("LED count set to " + String(numLeds));
        sendLedSync(currentMode, currentColor);
        server.send(200, "text/plain", "LED updated.");
      }
    }
  });

  server.begin();
  logMessage("Web server started.");
}

void writeToCard(byte blockAddr, const String &data) {
  byte buffer[16];
  for (int i = 0; i < 16; i++) buffer[i] = (i < data.length()) ? data[i] : 0x20;
  if (rfid.MIFARE_Write(blockAddr, buffer, 16) == MFRC522::STATUS_OK) {
    logMessage("Wrote to block " + String(blockAddr) + ": " + data);
    showRainbow();
  } else {
    logMessage("Write failed.");
    setStripColor(CRGB::Red);
  }
}

String readFromBlock(byte blockAddr) {
  byte buffer[18];
  byte size = sizeof(buffer);
  if (rfid.MIFARE_Read(blockAddr, buffer, &size) != MFRC522::STATUS_OK) return "Read failed.";
  String result = "";
  for (byte i = 0; i < 16; i++) result += (buffer[i] >= 32 && buffer[i] <= 126) ? (char)buffer[i] : '.';
  return result;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  SPI.begin();
  rfid.PCD_Init();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid);
  delay(100); // <-- ✅ Ensure AP MAC is ready
  setupESPNow();

  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, MAX_LEDS);
  FastLED.setBrightness(128);
  setStripColor(CRGB::Red);

  setupWiFiAndCaptive();
  setupWebServer();
  logMessage("System initialized.");
}

void loop() {
  server.handleClient();
  dnsServer.processNextRequest();

  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) uid += String(rfid.uid.uidByte[i], HEX) + " ";
  logMessage("Tag Detected: " + uid);

  if (writeMode) {
    MFRC522::MIFARE_Key key;
    for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;
    if (rfid.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, targetBlock, &key, &(rfid.uid)) == MFRC522::STATUS_OK) {
      writeToCard(targetBlock, writePayload);
    } else {
      logMessage("Auth failed.");
      setStripColor(CRGB::Red);
    }
    writeMode = false;
    writePayload = "";
  }

  String blockContent = readFromBlock(targetBlock);
  logMessage("Block " + String(targetBlock) + ": " + blockContent);

  lastScanTime = millis();
  fadeIndex = 0;
  currentMode = 1; // fade
  sendLedSync(currentMode, currentColor);
  setStripColor(CRGB::Green);

  while (fadeIndex < numLeds) {
    if (millis() - lastScanTime >= 100) {
      leds[fadeIndex] = CRGB::Red;
      FastLED.show();
      fadeIndex++;
      lastScanTime = millis();
    }
    server.handleClient();
    dnsServer.processNextRequest();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
