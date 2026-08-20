#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>

//--- Pin Definitions ---
#define LED_PIN 6
#define NUM_LEDS 74

//--- Global Variables ---
CRGB leds[NUM_LEDS];

volatile float targetCharge = 0.0;
float currentCharge = 0.0;
float easingFactor = 6.0;   // Easing coefficient for delta math. Higher = faster response.
unsigned long lastUpdate = 0;
uint8_t hue = 0;

//--- ESP-NOW Receive Callback ---
void onDataRecv(const esp_now_recv_info_t * recvInfo, const uint8_t *incomingData, int len) {
    if (len == sizeof(float)) {
        float val;
        memcpy(&val, incomingData, sizeof(float));
        
        // Clamp incoming values
        if (val < 0.0) val = 0.0;
        if (val > 1.0) val = 1.0;
        
        targetCharge = val;
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n--- Reactive Follower Debug Start ---");

    // Initialize LEDs
    Serial.printf("Initializing FastLED on Pin %d with %d LEDs...\n", LED_PIN, NUM_LEDS);
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(150);
    FastLED.clear();
    FastLED.show();

    // Initialize WiFi in Station mode for ESP-NOW
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    // Initialize ESP-NOW
    Serial.println("Initializing ESP-NOW...");
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW!");
        return;
    }

    // Register callback function
    esp_now_register_recv_cb(onDataRecv);
    Serial.println("ESP-NOW Callback Registered.");
    
    lastUpdate = millis();
    Serial.println("--- Setup Complete ---\n");
}

void loop() {
    unsigned long now = millis();
    float dt = (now - lastUpdate) / 1000.0;
    lastUpdate = now;

    // Safety check for dt
    if (dt <= 0.0) dt = 0.001;

    // Delta math: smooth transition of currentCharge towards targetCharge
    float diff = targetCharge - currentCharge;
    currentCharge += diff * easingFactor * dt;

    // Snapping logic when very close to target to prevent minor oscillations
    if (abs(diff) < 0.001) {
        currentCharge = targetCharge;
    }

    // Determine how many LEDs to light up
    int ledsToLight = (int)(currentCharge * NUM_LEDS + 0.5); // Rounding
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

    EVERY_N_MILLISECONDS(500) {
        Serial.print("Target Charge: "); Serial.print(targetCharge);
        Serial.print(" | Current Charge: "); Serial.print(currentCharge);
        Serial.print(" | Lit LEDs: "); Serial.print(ledsToLight);
        Serial.println("/" + String(NUM_LEDS));
    }

    FastLED.show();
    delay(10);
}
