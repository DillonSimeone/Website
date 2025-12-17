/*

This is meant to work with SerialMagic.ino from ESP32SeriesReaderNodeJs.

The goal of this is to join ESP32NOW networks to any computers connected to other internets by using
the serial monitor to pass data to the computer.

This sketch sends the RFID tag data over to serialMagic.  

*/

#include <WiFi.h>
#include <esp_now.h>
#include <SPI.h>
#include <MFRC522.h>
#include <FastLED.h>
#include "esp_wifi.h"

// --- Settings ---
#define RST_PIN     7
#define SS_PIN      19
#define DATA_PIN    4
#define MAX_LEDS    60
#define LED_BRIGHT  128
#define RESET_INTERVAL 60000  // Auto reboot every 60 seconds

MFRC522 rfid(SS_PIN, RST_PIN);
CRGB leds[MAX_LEDS];
int numLeds = 6;

unsigned long lastReset = 0;
unsigned long lastScanTime = 0;
int fadeIndex = 0;

uint8_t tagMasterMAC[] = {0x2C, 0xBC, 0xBB, 0x4D, 0x7E, 0x9C};

// --- Utility ---
void printMAC() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  String macStr = WiFi.macAddress();
  Serial.print("Add to master list: {");
  int values[6];
  sscanf(macStr.c_str(), "%x:%x:%x:%x:%x:%x", &values[0], &values[1], &values[2], &values[3], &values[4], &values[5]);
  for (int i = 0; i < 6; i++) {
    Serial.printf("0x%02X", values[i]);
    if (i < 5) Serial.print(", ");
  }
  Serial.println("},");
}

void sendToMaster(const String& msg) {
  esp_err_t result = esp_now_send(tagMasterMAC, (const uint8_t*)msg.c_str(), msg.length());
  Serial.print("Sent to tagMaster: ");
  Serial.print(msg);
  Serial.print(" → ");
  Serial.println(result == ESP_OK ? "Success" : String(result));
}

void setStripColor(const CRGB &color) {
  for (int i = 0; i < numLeds; i++) leds[i] = color;
  FastLED.show();
}

void showRainbow() {
  for (int i = 0; i < numLeds; i++) {
    leds[i] = CHSV((i * 255) / numLeds, 255, 255);
  }
  FastLED.show();
  delay(1000);
  setStripColor(CRGB::Red);
}

// --- ESP-NOW setup ---
void setupESPNow() {
  delay(200);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }

  Serial.print("Master MAC: ");
  Serial.println(WiFi.softAPmacAddress());

  esp_now_peer_info_t peer{};
  memcpy(peer.peer_addr, tagMasterMAC, 6);
  peer.channel = 0;
  peer.encrypt = false;
  peer.ifidx = WIFI_IF_AP;

  if (!esp_now_is_peer_exist(tagMasterMAC)) {
    esp_err_t res = esp_now_add_peer(&peer);
    Serial.print("Added tag master peer: ");
    Serial.println(res == ESP_OK ? "Success" : String(res));
  }
}

// --- Setup ---
void setup() {
  Serial.begin(115200);
  delay(200);
  printMAC();

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
}

// --- Main Loop ---
void loop() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i], HEX) + " ";
  }

  Serial.println("Tag Detected: " + uid);
  sendToMaster("RFIDreader1 " + uid);

  setStripColor(CRGB::Green);
  fadeIndex = 0;
  lastScanTime = millis();

  while (fadeIndex < numLeds) {
    if (millis() - lastScanTime >= 100) {
      leds[fadeIndex] = CRGB::Red;
      FastLED.show();
      fadeIndex++;
      lastScanTime = millis();
    }
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  // Auto reboot after interval
  if (millis() - lastReset >= RESET_INTERVAL) {
    Serial.println("Rebooting...");
    delay(100);
    ESP.restart();
  }
}

