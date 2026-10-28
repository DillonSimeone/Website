#include <Arduino.h>
#include <FastLED.h>

// --- Pin Definitions ---
#define LED_DATA 0
#define MOTOR_PWM 1
#define NUM_LEDS 9

CRGB leds[NUM_LEDS];

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("--- Sanity Test: Motor & Orange LEDs ---");

    // 1. Motor / Power Pin
    pinMode(MOTOR_PWM, OUTPUT);
    digitalWrite(MOTOR_PWM, HIGH); // Drive motor / Enable power
    Serial.println("Motor/Power Pin (1) set to HIGH");

    // 2. LED Strip
    FastLED.addLeds<WS2812B, LED_DATA, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(128);
    
    // Set all LEDs to Orange
    fill_solid(leds, NUM_LEDS, CRGB::Orange);
    FastLED.show();
    Serial.println("LEDs set to ORANGE");
}

void loop() {
    // Keep it simple - just pulse the orange slightly to show it's alive
    static uint8_t b = 128;
    static int8_t dir = 1;
    
    b += dir;
    if (b == 255 || b == 100) dir *= -1;
    
    FastLED.setBrightness(b);
    FastLED.show();
    delay(10);
}
