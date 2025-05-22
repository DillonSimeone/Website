#include <WiFi.h>
#include "esp_wifi.h"
#include <esp_now.h>
#include <FastLED.h>

// ----- CONFIG -----
#define DATA_PIN 4
#define MAX_LEDS 60
#define MASTER_CHANNEL 1  // Match this to master's AP channel

CRGB leds[MAX_LEDS];
int numLeds = 6;
uint8_t currentMode = 99; // 99 = searching
CRGB currentColor = CRGB::Red;
unsigned long lastUpdate = 0;
int fadeIndex = 0;

bool connectedToMaster = false;
unsigned long lastPacketTime = 0;
int searchIndex = 0;
int searchDir = 1;

struct LedSyncData {
  uint8_t mode;   // 0 = solid, 1 = fade, 2 = rainbow
  uint8_t r, g, b;
  uint8_t count;
};

void applyLedSync(const LedSyncData &data) {
  numLeds = min((int)data.count, MAX_LEDS);
  currentMode = data.mode;
  currentColor = CRGB(data.r, data.g, data.b);
  fadeIndex = 0;
  connectedToMaster = true;
  lastPacketTime = millis();

  if (currentMode == 0) {
    for (int i = 0; i < numLeds; i++) leds[i] = currentColor;
    FastLED.show();
  } else if (currentMode == 2) {
    for (int i = 0; i < numLeds; i++) leds[i] = CHSV((i * 255) / numLeds, 255, 255);
    FastLED.show();
  }
}

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(LedSyncData)) {
    LedSyncData data;
    memcpy(&data, incomingData, sizeof(data));
    applyLedSync(data);
  }
}

void showSearching() {
  if (millis() - lastUpdate > 80) {
    for (int i = 0; i < MAX_LEDS; i++) {
      leds[i] = CRGB::Black;
    }
    leds[searchIndex] = CRGB::Blue;
    FastLED.show();

    searchIndex += searchDir;
    if (searchIndex >= MAX_LEDS - 1 || searchIndex <= 0) {
      searchDir *= -1;
    }
    lastUpdate = millis();
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);

  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(MASTER_CHANNEL, WIFI_SECOND_CHAN_NONE);  // ✅ Force correct channel

  Serial.print("Follower MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }

  esp_now_register_recv_cb(onDataRecv);

  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, MAX_LEDS);
  FastLED.setBrightness(128);
  FastLED.clear();
  FastLED.show();
}

void loop() {
  if (connectedToMaster && millis() - lastPacketTime > 1000) {
    connectedToMaster = false;
    currentMode = 99;
    fadeIndex = 0;
  }

  if (!connectedToMaster || currentMode == 99) {
    showSearching();
    return;
  }

  if (currentMode == 1) { // Fade
    if (millis() - lastUpdate > 100) {
      if (fadeIndex < numLeds) {
        leds[fadeIndex] = CRGB::Red;
        FastLED.show();
        fadeIndex++;
      }
      lastUpdate = millis();
    }
  }
}
