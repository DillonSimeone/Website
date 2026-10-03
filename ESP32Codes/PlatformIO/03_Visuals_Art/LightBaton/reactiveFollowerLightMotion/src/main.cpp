#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <FastLED.h>

//--- Pin Definitions ---
#define LED_PIN 6
#define NUM_LEDS 74

//--- Global Variables ---
CRGB leds[NUM_LEDS];

volatile float targetCharge = 0.0f;
float currentCharge = 0.0f;
float easingFactor = 6.0f;   // Easing coefficient for delta math. Higher = faster response.
unsigned long lastUpdate = 0;
uint8_t hue = 0;

// Telemetry & Diagnostics
volatile uint32_t packetCount = 0;
volatile unsigned long lastPacketTime = 0;
volatile float lastRawVal = 0.0f;
uint32_t lastReportedPacketCount = 0;
unsigned long lastStatsTime = 0;

//--- ESP-NOW Receive Callback ---
#if defined(ESP_ARDUINO_VERSION) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
void onDataRecv(const esp_now_recv_info_t * recvInfo, const uint8_t *incomingData, int len) {
#else
void onDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
#endif
    if (len == sizeof(float)) {
        float val;
        memcpy(&val, incomingData, sizeof(float));
        
        lastRawVal = val;
        packetCount++;
        lastPacketTime = millis();

        // Clamp incoming values
        if (val < 0.0f) val = 0.0f;
        if (val > 1.0f) val = 1.0f;
        
        targetCharge = val;
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("   LightBaton Reactive Follower");
    Serial.println("========================================");

    // Initialize LEDs
    Serial.printf("Initializing FastLED on Pin %d with %d LEDs...\n", LED_PIN, NUM_LEDS);
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(150);
    FastLED.clear();
    FastLED.show();

    // Initialize WiFi in Station mode for ESP-NOW
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    
    // Explicitly lock to Channel 1 (default ESP-NOW channel)
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);

    uint8_t primaryChan = 0;
    wifi_second_chan_t secondChan;
    esp_wifi_get_channel(&primaryChan, &secondChan);
    Serial.printf("Wi-Fi STA configured. Listening on Channel: %d (MAC: %s)\n", primaryChan, WiFi.macAddress().c_str());

    // Initialize ESP-NOW
    Serial.println("Initializing ESP-NOW...");
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ERROR] Failed to initialize ESP-NOW!");
        return;
    }

    // Register callback function
    esp_now_register_recv_cb(onDataRecv);
    Serial.println("ESP-NOW Callback Registered successfully.");
    
    lastUpdate = millis();
    lastStatsTime = millis();
    Serial.println("--- Setup Complete. Waiting for Baton Broadcasts ---\n");
}

void loop() {
    unsigned long now = millis();
    float dt = (now - lastUpdate) / 1000.0f;
    lastUpdate = now;

    // Safety check for dt
    if (dt <= 0.0f) dt = 0.001f;

    // Delta math: smooth transition of currentCharge towards targetCharge
    float diff = targetCharge - currentCharge;
    currentCharge += diff * easingFactor * dt;

    // Snapping logic when very close to target to prevent minor oscillations
    if (abs(diff) < 0.001f) {
        currentCharge = targetCharge;
    }

    // Determine how many LEDs to light up
    int ledsToLight = (int)(currentCharge * NUM_LEDS + 0.5f); // Rounding
    if (ledsToLight > NUM_LEDS) ledsToLight = NUM_LEDS;
    if (ledsToLight < 0) ledsToLight = 0;

    // Update LED strip
    for (int i = 0; i < NUM_LEDS; i++) {
        if (i < ledsToLight) {
            leds[i] = CHSV(hue + (i * 2), 255, 255);
        } else {
            leds[i] = CRGB::Black;
        }
    }

    EVERY_N_MILLISECONDS(20) {
        hue++;
    }

    // Periodic telemetry & diagnostics every 250ms
    EVERY_N_MILLISECONDS(250) {
        float elapsedSec = (now - lastStatsTime) / 1000.0f;
        uint32_t packetsDelta = packetCount - lastReportedPacketCount;
        float pps = (elapsedSec > 0.0f) ? (packetsDelta / elapsedSec) : 0.0f;
        lastReportedPacketCount = packetCount;
        lastStatsTime = now;

        long msSinceLastPacket = (lastPacketTime > 0) ? (long)(now - lastPacketTime) : -1;

        Serial.printf("[Follower] Pkts: %lu (%.1f pps) | Age: %ld ms | Target: %.2f | Curr: %.2f | LEDs: %2d/%d\n",
                      packetCount, pps, msSinceLastPacket, targetCharge, currentCharge, ledsToLight, NUM_LEDS);

        if (msSinceLastPacket > 1500 && packetCount > 0) {
            Serial.println("  [!] Warning: Signal lost / No packets for > 1.5s");
        }
    }

    FastLED.show();
    delay(10);
}
