#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>

// === CONFIG ===
bool isMaster = false;       // Set true for master, false for follower
const int ledPin = 2;       // Onboard blue LED
const int dataPin = 13;     // LED strip data pin
const int ledCount = 100;    // Number of LEDs on the strip
int rainbowSpeed = 10;      // Lower = faster animation
float glitchness = 0.3;     // 0.0 to 1.0, how intense the glitch is
unsigned long glitchDuration = 500;  // In milliseconds

// === FASTLED SETUP ===
CRGB leds[ledCount];

// === STATE ===
String incoming = "";
unsigned long lastPing = 0;
unsigned long ledOnTime = 0;
unsigned long lastRainbowUpdate = 0;
bool ledState = false;

bool rainbowPaused = false;
unsigned long rainbowPauseUntil = 0;
uint8_t hueOffset = 0;

uint8_t followerMACs[][6] = {
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
  }
}

void setupESPNow() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed");
    return;
  }
  if (isMaster) {
    for (int i = 0; i < sizeof(followerMACs) / 6; i++) {
      esp_now_peer_info_t peer{};
      memcpy(peer.peer_addr, followerMACs[i], 6);
      peer.channel = 0;
      peer.encrypt = false;
      esp_now_add_peer(&peer);
    }
  } else {
    esp_now_register_recv_cb(onDataRecv);
  }
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

  if (now - lastPing > 2000) {
    Serial.println("Ping!");
    lastPing = now;
  }
}
