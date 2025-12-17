#include <WiFi.h>
#include <esp_now.h>
#include <SPI.h>
#include <MFRC522.h>
#include <FastLED.h>
#include "esp_wifi.h"

// settings
#define RST_PIN           7
#define SS_PIN            19
#define DATA_PIN          4
#define MAX_LEDS          60
#define LED_BRIGHT        128
#define RESET_INTERVAL    60000UL       // 60 s software reset
#define HW_RESET_INTERVAL 1800000UL     // 30 min hardware reset

MFRC522 rfid(SS_PIN, RST_PIN);
CRGB leds[MAX_LEDS];
uint8_t tagMasterMAC[] = {0x2C, 0xBC, 0xBB, 0x4D, 0x7E, 0x9C};

unsigned long lastReset    = 0;
unsigned long lastHWReset  = 0;
unsigned long lastScanTime = 0;
int fadeIndex              = 0;
int numLeds                = 6;

void printMAC() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  String mac = WiFi.macAddress();
  Serial.print("Add to master list: {");
  int v[6];
  sscanf(mac.c_str(), "%x:%x:%x:%x:%x:%x",
         &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]);
  for (int i = 0; i < 6; i++) {
    Serial.printf("0x%02X", v[i]);
    if (i < 5) Serial.print(", ");
  }
  Serial.println("},");
}

void sendToMaster(const char* msg) {
  esp_err_t res = esp_now_send(tagMasterMAC,
                               (const uint8_t*)msg,
                               strlen(msg));
  Serial.print("Sent to tagMaster: ");
  Serial.print(msg);
  Serial.print(" -> ");
  Serial.println(res == ESP_OK ? "Success" : String(res));
}

void setStripColor(const CRGB& c) {
  for (int i = 0; i < numLeds; i++) leds[i] = c;
  FastLED.show();
}

void setupESPNow() {
  delay(200);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }
  Serial.print("Master MAC: ");
  Serial.println(WiFi.softAPmacAddress());

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, tagMasterMAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  peer.ifidx   = WIFI_IF_AP;

  if (!esp_now_is_peer_exist(tagMasterMAC)) {
    esp_err_t r = esp_now_add_peer(&peer);
    Serial.print("Added tag master peer: ");
    Serial.println(r == ESP_OK ? "Success" : String(r));
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  printMAC();

  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, HIGH);  // ensure RC522 out of reset

  SPI.begin();
  rfid.PCD_Init();

  WiFi.mode(WIFI_AP);
  WiFi.softAP("ESP32RFID1");
  delay(100);
  setupESPNow();

  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, MAX_LEDS);
  FastLED.setBrightness(LED_BRIGHT);
  setStripColor(CRGB::Red);

  Serial.println("System initialized.");
  lastReset   = millis();
  lastHWReset = millis();
}

void loop() {
  unsigned long now = millis();

  // software reset every RESET_INTERVAL
  if (now - lastReset >= RESET_INTERVAL) {
    Serial.println("Rebooting now");
    ESP.restart();
  }

  // hardware reset RC522 every HW_RESET_INTERVAL
  if (now - lastHWReset >= HW_RESET_INTERVAL) {
    digitalWrite(RST_PIN, LOW);
    delay(50);
    digitalWrite(RST_PIN, HIGH);
    lastHWReset = now;
    Serial.println("RC522 hardware reset");
  }

  // check for new card
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));
  bool present = rfid.PICC_IsNewCardPresent();
  if (!present) {
    SPI.endTransaction();
    return;
  }
  bool readok = rfid.PICC_ReadCardSerial();
  if (!readok) {
    SPI.endTransaction();
    return;
  }

  // build UID in fixed buffer
  char uid[32] = {0};
  int  len     = 0;
  for (byte i = 0; i < rfid.uid.size; i++) {
    len += snprintf(uid + len,
                    sizeof(uid) - len,
                    "%02X ",
                    rfid.uid.uidByte[i]);
  }
  SPI.endTransaction();

  // output and send
  Serial.print("Tag Detected: ");
  Serial.println(uid);
  sendToMaster(uid);

  // LED feedback
  setStripColor(CRGB::Green);
  fadeIndex    = 0;
  lastScanTime = now;
  while (fadeIndex < numLeds) {
    if (millis() - lastScanTime >= 100) {
      leds[fadeIndex++] = CRGB::Red;
      FastLED.show();
      lastScanTime = millis();
    }
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
