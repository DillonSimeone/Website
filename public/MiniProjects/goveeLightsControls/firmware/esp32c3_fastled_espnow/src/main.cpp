#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>
#include "espnow_protocol.h"

// ==========================================
// User Configuration
// ==========================================
#define LED_PIN         8       // GPIO Pin connected to WS2812B Data (Default GPIO 8 for ESP32-C3 SuperMini)
#define NUM_LEDS        30      // Number of LEDs in your strip / matrix
#define LED_TYPE        WS2812B // LED strip chipset
#define COLOR_ORDER     GRB     // Common color order for WS2812B
#define NODE_ID         0       // 0 accepts all broadcast packets, or assign 1, 2, 3...

// LED Array
CRGB leds[NUM_LEDS];

// Live State
bool is_on = true;
uint8_t current_brightness = 180;
uint8_t current_pattern = PATTERN_RAINBOW;
uint8_t current_speed = 30;
CRGB solid_color = CRGB(255, 180, 50); // Warm default

// Animation variables
uint8_t gHue = 0;

// ==========================================
// Pattern Implementations
// ==========================================
void runPatternSolid() {
    fill_solid(leds, NUM_LEDS, solid_color);
}

void runPatternRainbow() {
    fill_rainbow(leds, NUM_LEDS, gHue, 7);
}

void runPatternFire() {
    // Basic Fire2012 simulation
    static byte heat[NUM_LEDS];
    for (int i = 0; i < NUM_LEDS; i++) {
        heat[i] = qsub8(heat[i], random8(0, ((55 * 10) / NUM_LEDS) + 2));
    }
    for (int k = NUM_LEDS - 1; k >= 2; k--) {
        heat[k] = (heat[k - 1] + heat[k - 2] + heat[k - 2]) / 3;
    }
    if (random8() < 160) {
        int y = random8(7);
        if (y < NUM_LEDS) heat[y] = qadd8(heat[y], random8(160, 255));
    }
    for (int j = 0; j < NUM_LEDS; j++) {
        CRGB color = HeatColor(heat[j]);
        leds[j] = color;
    }
}

void runPatternBreathe() {
    float val = (exp(sin(millis() / 2000.0 * PI)) - 0.36787944) * 108.0;
    CRGB dimmed = solid_color;
    dimmed.nscale8_video(val);
    fill_solid(leds, NUM_LEDS, dimmed);
}

void runPatternTwinkle() {
    fadeToBlackBy(leds, NUM_LEDS, 10);
    if (random8() < 60) {
        int pos = random16(NUM_LEDS);
        leds[pos] += solid_color;
    }
}

void runPatternChase() {
    fadeToBlackBy(leds, NUM_LEDS, 20);
    int pos = (millis() / 40) % NUM_LEDS;
    leds[pos] = solid_color;
}

// ==========================================
// ESP-NOW Receive Callback
// ==========================================
void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (len < sizeof(EspNowLightPacket)) {
        Serial.printf("[ESP-NOW] Packet too small (%d bytes)\n", len);
        return;
    }

    EspNowLightPacket packet;
    memcpy(&packet, incomingData, sizeof(packet));

    // Verify magic bytes
    if (packet.magic[0] != 0xEE || packet.magic[1] != 0x32) {
        Serial.println("[ESP-NOW] Invalid magic bytes");
        return;
    }

    // Check node targeting (0 = broadcast to all, or match this node ID)
    if (packet.node_id != 0 && packet.node_id != NODE_ID) {
        return;
    }

    Serial.printf("[ESP-NOW] Recv Cmd: 0x%02X, Power: %d, Bri: %d, RGB: (%d,%d,%d), Pattern: %d\n",
                  packet.cmd, packet.power, packet.brightness, packet.r, packet.g, packet.b, packet.pattern);

    // Apply payload
    is_on = (packet.power != 0);
    current_brightness = packet.brightness;
    solid_color = CRGB(packet.r, packet.g, packet.b);
    current_pattern = packet.pattern;
    if (packet.speed > 0) {
        current_speed = packet.speed;
    }

    FastLED.setBrightness(is_on ? current_brightness : 0);
}

// ==========================================
// Setup & Main Loop
// ==========================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n======================================");
    Serial.println("  ESP32-C3 FastLED + ESP-NOW Receiver ");
    Serial.println("======================================");

    // Initialize FastLED
    FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(current_brightness);
    FastLED.clear(true);

    // Initialize Wi-Fi in Station Mode (Required for ESP-NOW)
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    Serial.print("ESP32 MAC Address: ");
    Serial.println(WiFi.macAddress());

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW!");
        return;
    }

    esp_now_register_recv_cb(OnDataRecv);
    Serial.println("ESP-NOW Ready and listening!");
}

void loop() {
    if (!is_on) {
        FastLED.clear(true);
        delay(20);
        return;
    }

    // Cycle global hue for rainbow
    EVERY_N_MILLISECONDS(20) {
        gHue++;
    }

    // Render active pattern
    switch (current_pattern) {
        case PATTERN_SOLID:
            runPatternSolid();
            break;
        case PATTERN_RAINBOW:
            runPatternRainbow();
            break;
        case PATTERN_FIRE:
            runPatternFire();
            break;
        case PATTERN_BREATHE:
            runPatternBreathe();
            break;
        case PATTERN_TWINKLE:
            runPatternTwinkle();
            break;
        case PATTERN_CHASE:
            runPatternChase();
            break;
        default:
            runPatternSolid();
            break;
    }

    FastLED.show();
    delay(10);
}
