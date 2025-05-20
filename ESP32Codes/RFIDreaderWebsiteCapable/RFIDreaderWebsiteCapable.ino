#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <SPI.h>
#include <MFRC522.h>
#include <FastLED.h>

// captive portal DNS
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);

// AP settings
const char* apSSID     = "ESP32_RFID";
const char* apPassword = "12345678";
IPAddress apIP(192,168,4,1);
IPAddress netM(255,255,255,0);

// RFID pins
#define SS_PIN   19
#define RST_PIN  7
MFRC522 mfrc522(SS_PIN, RST_PIN);

// LED strip (FastLED)
#define LED_PIN     4
#define NUM_LEDS    8  // adjust to your strip's length
CRGB leds[NUM_LEDS];

// operation flags & timing
bool readMode = false;
bool writeMode = false;
unsigned long opStart = 0;
const unsigned long OP_TIMEOUT = 15000; // ms
unsigned long lastScanTime = 0;

String lastUID  = "";
String lastData = "";
String writeData= "";

// HTML page
const char page[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RFID READER</title>
<style>
  body{background:black;color:yellow;margin:0;padding:20px;font-family:monospace}
  .box{display:flex;flex-direction:column;border:4px solid yellow;padding:20px;width:100%;max-width:400px;margin:20px auto}
  .box>*{margin:8px 0}
  input,button{background:black;color:yellow;border:2px solid yellow;padding:12px;font-size:1em}
</style>
</head><body>
  <div class="box">
    <h1>RFID READER</h1>
    <div>Mode: <span id="mode">Idle</span></div>
    <div>Scanned RFID DATA: <span id="value">--</span></div>
    <input id="writeData" type="text" placeholder="Data to write (max 16 chars)">
    <button id="btnRead">Single Read</button>
    <button id="btnWrite">Single Write</button>
  </div>
  <script>
    document.getElementById('btnRead').onclick = ()=>fetch('/toggleRead');
    document.getElementById('btnWrite').onclick = ()=>{
      let d = encodeURIComponent(document.getElementById('writeData').value);
      fetch('/toggleWrite?data='+d);
    };
    setInterval(()=>{
      fetch('/status').then(r=>r.json()).then(j=>{
        document.getElementById('mode').textContent = j.mode;
        document.getElementById('value').textContent = j.data || '--';
      });
    },300);
  </script>
</body></html>
)rawliteral";

void handleRoot() {
  server.send_P(200, "text/html", page);
}

void handleToggleRead() {
  readMode  = true;
  writeMode = false;
  opStart   = millis();
  lastData  = "";
  lastScanTime = millis();
  server.send(200, "text/plain", "OK");
}

void handleToggleWrite() {
  if (server.hasArg("data")) {
    writeData = server.arg("data");
    if (writeData.length()>16) writeData = writeData.substring(0,16);
  }
  writeMode = true;
  readMode  = false;
  opStart   = millis();
  lastScanTime = millis();
  server.send(200, "text/plain", "OK");
}

void handleStatus() {
  String m = writeMode ? "Writing" : readMode ? "Reading" : "Idle";
  server.send(200, "application/json",
    "{\"mode\":\""+m+"\",\"uid\":\""+lastUID+"\",\"data\":\""+lastData+"\"}"
  );
}

void setup(){
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

  // init LEDs
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  for(int i=0;i<NUM_LEDS;i++) leds[i] = CRGB::Red;
  FastLED.show();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSSID, apPassword);
  WiFi.softAPConfig(apIP, apIP, netM);
  dnsServer.start(DNS_PORT, "*", apIP);

  // captive-portal probes
  server.on("/generate_204", HTTP_GET, [](){ server.send(204, "text/plain", ""); });
  server.on("/hotspot-detect.html", HTTP_GET, [](){ server.send(204, "text/plain", ""); });

  server.on("/",          HTTP_GET, handleRoot);
  server.on("/toggleRead", HTTP_GET, handleToggleRead);
  server.on("/toggleWrite",HTTP_GET, handleToggleWrite);
  server.on("/status",     HTTP_GET, handleStatus);
  server.onNotFound([](){
    IPAddress ip = WiFi.softAPIP();
    server.sendHeader("Location", String("http://")+ip.toString(), true);
    server.send(302, "text/plain", "");
  });

  server.begin();
  Serial.println("AP up. Connect to ESP32_RFID (pwd: 12345678) and browse any URL.");
}

void loop(){
  dnsServer.processNextRequest();
  server.handleClient();

  unsigned long now = millis();
  // LED state: green for 500ms after a scan, else red
  if(now - lastScanTime < 500) {
    for(int i=0;i<NUM_LEDS;i++) leds[i] = CRGB::Green;
  } else {
    for(int i=0;i<NUM_LEDS;i++) leds[i] = CRGB::Red;
  }
  FastLED.show();

  if (!(readMode||writeMode)) return;
  if (now - opStart > OP_TIMEOUT) { readMode=writeMode=false; return; }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) { yield(); return; }

  // got tag
  lastUID="";
  for(byte i=0;i<mfrc522.uid.size;i++){ if(mfrc522.uid.uidByte[i]<0x10) lastUID+='0'; lastUID+=String(mfrc522.uid.uidByte[i],HEX); }
  lastUID.toUpperCase();

  // read data block
  if(readMode) {
    MFRC522::MIFARE_Key key;
    for(byte i=0;i<6;i++) key.keyByte[i]=0xFF;
    byte block=4, buf[18]; byte sz=sizeof(buf);
    if(mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &key, &mfrc522.uid)==MFRC522::STATUS_OK) {
      if(mfrc522.MIFARE_Read(block, buf, &sz)==MFRC522::STATUS_OK) {
        lastData="";
        for(byte i=0;i<sz;i++){ if(buf[i]==0) break; lastData+=char(buf[i]); }
      }
      mfrc522.PICC_HaltA(); mfrc522.PCD_StopCrypto1();
    }
  }

  // write data block
  if(writeMode) {
    MFRC522::MIFARE_Key key;
    for(byte i=0;i<6;i++) key.keyByte[i]=0xFF;
    byte block=4, buf[16]={0};
    for(byte i=0;i<writeData.length();i++) buf[i]=writeData[i];
    if(mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &key, &mfrc522.uid)==MFRC522::STATUS_OK) {
      mfrc522.MIFARE_Write(block, buf, 16);
      mfrc522.PICC_HaltA(); mfrc522.PCD_StopCrypto1();
    }
  }

  // one-shot
  readMode = writeMode = false;
}
