#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>

// === CONFIG ===
bool isMaster = true;       // Set true for master, false for follower
const int ledPin = 2;       // Onboard blue LED
const int dataPin = 13;     // LED strip data pin
const int ledCount = 60;    // Number of LEDs on the strip
int rainbowSpeed = 10;      // Lower = faster animation
float glitchness = 0.5;     // 0.0 to 1.0, how intense the glitch is
unsigned long glitchDuration = 1000;  // In milliseconds
unsigned long glitchIntervalMin = 5000; // Random glitch every 5–15 sec
unsigned long glitchIntervalMax = 35000;

// === FASTLED SETUP ===
CRGB leds[ledCount];

// === STATE ===
String incoming = "";
unsigned long lastPing = 0;
unsigned long ledOnTime = 0;
unsigned long lastRainbowUpdate = 0;
bool ledState = false;
bool rainbowPaused = false;
uint8_t hueOffset = 0;

unsigned long nextRandomGlitch = 0;

uint8_t followerMACs[][6] = {
  {0x2C, 0xBC, 0xBB, 0x4D, 0x7E, 0x9C}, // Master ESP32 (1)
  {0x08, 0xA6, 0xF7, 0xB0, 0x77, 0x84}, // Follower (2)
  {0x08, 0xA6, 0xF7, 0xB0, 0x7B, 0xCC}, // Follower (3)
  {0x78, 0x42, 0x1C, 0x66, 0x8C, 0xAC}, // Follower (4)
  {0xF4, 0x65, 0x0B, 0x41, 0x28, 0x0C}, // Follower (5)
  {0xF4, 0x65, 0x0B, 0x41, 0x22, 0xD8}, // Follower (6)
  {0x5C, 0x01, 0x3B, 0x9D, 0x43, 0xA8}, // Follower (7)
  {0xEC, 0x64, 0xC9, 0x5D, 0xC0, 0xF8}, // Follower (8)
  {0xF4, 0x65, 0x0B, 0x40, 0x8D, 0xE4}, // Follower (9)
  {0xF0, 0xF5, 0xBD, 0x07, 0x82, 0xF8}  // RFID Reader 1
  {0x2C, 0xBC, 0xBB, 0x4D, 0x7E, 0x9C},
  {0x08, 0xA6, 0xF7, 0xB0, 0x77, 0x84},
  {0x08, 0xA6, 0xF7, 0xB0, 0x7B, 0xCC}
};

// === UTIL ===
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

void triggerLED() {
  digitalWrite(ledPin, HIGH);
  ledOnTime = millis();
}

// === ANIMATION ===
void rainbowAnimation() {
  if (!rainbowPaused) {
    if (millis() - lastRainbowUpdate < rainbowSpeed) return;
    lastRainbowUpdate = millis();
    for (int i = 0; i < ledCount; i++) {
      leds[i] = CHSV(hueOffset + i * 2, 255, 255);
    }
    hueOffset++;
    FastLED.show();
  }
}

void glitchAnimation() {
  int flickerRate = map(glitchness * 100, 0, 100, 0, 10);
  for (int i = 0; i < ledCount; i++) {
    if (random(100) < glitchness * 100) {
      if (random(2) == 0) {
        leds[i] = CRGB::Black;
      } else {
        leds[i] = CHSV(random8(), 255, 255);
      }
    } else {
      leds[i] = CRGB::Black;
    }
  }
  FastLED.show();
  delay(20);
}

void triggerAnimation(void (*fx)(), unsigned long duration) {
  rainbowPaused = true;
  unsigned long start = millis();
  while (millis() - start < duration) {
    fx();
  }
  rainbowPaused = false;
}

// === ESP-NOW CALLBACK ===
void onDataRecv(const esp_now_recv_info_t *recvInfo, const uint8_t *data, int len) {
  if (!isMaster && len >= 1 && data[0] == 42) {
    triggerLED();
    triggerAnimation(glitchAnimation, glitchDuration);
  } else if (isMaster && len > 0) {
    Serial.print("[ESP-NOW] From: ");
    for (int i = 0; i < 6; i++) {
      Serial.printf("%02X", recvInfo->src_addr[i]);
      if (i < 5) Serial.print(":");
    }
    Serial.print(" | Message: ");
    for (int i = 0; i < len; i++) {
      Serial.print((char)data[i]);
    }
    Serial.println();

    // Master reacts and broadcasts glitch
    triggerLED();
    triggerAnimation(glitchAnimation, glitchDuration);
    uint8_t signal[1] = {42};
    for (int i = 0; i < sizeof(followerMACs) / 6; i++) {
      esp_now_send(followerMACs[i], signal, 1);
    }
  }
}

void setupESPNow() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }
  for (int i = 0; i < sizeof(followerMACs) / 6; i++) {
    esp_now_peer_info_t peer{};
    memcpy(peer.peer_addr, followerMACs[i], 6);
    peer.channel = 0;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  esp_now_register_recv_cb(onDataRecv);
}

// === SETUP ===
void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);

  FastLED.addLeds<WS2812B, dataPin, GRB>(leds, ledCount);
  FastLED.clear(); FastLED.show();

  printMAC();
  setupESPNow();
  nextRandomGlitch = millis() + random(glitchIntervalMin, glitchIntervalMax);
}

// === LOOP ===
void loop() {
  unsigned long now = millis();

  if (digitalRead(ledPin) == HIGH && now - ledOnTime > 100) {
    digitalWrite(ledPin, LOW);
  }

  rainbowAnimation();

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      incoming.trim();
      if (isMaster && incoming == "Pong!") {
        triggerLED();
        triggerAnimation(glitchAnimation, glitchDuration);
        uint8_t signal[1] = {42};
        for (int i = 0; i < sizeof(followerMACs) / 6; i++) {
          esp_now_send(followerMACs[i], signal, 1);
        }
      }
      incoming = "";
    } else {
      incoming += c;
    }
  }

  if (now > nextRandomGlitch) {
    triggerLED();
    triggerAnimation(glitchAnimation, glitchDuration);
    nextRandomGlitch = now + random(glitchIntervalMin, glitchIntervalMax);
    uint8_t signal[1] = {42};
    for (int i = 0; i < sizeof(followerMACs) / 6; i++) {
      esp_now_send(followerMACs[i], signal, 1);
    }
  }

  if (now - lastPing > 2000) {
    Serial.println("Ping!");
    lastPing = now;
  }
}
