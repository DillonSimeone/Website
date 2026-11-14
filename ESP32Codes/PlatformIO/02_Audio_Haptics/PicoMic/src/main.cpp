#include <Arduino.h>
#include <FastLED.h>

#define LED_PIN     4
#define NUM_LEDS    144
#define CHIPSET     WS2812B
#define COLOR_ORDER GRB
#define BRIGHTNESS  128

CRGB leds[NUM_LEDS];
uint8_t hue = 0;

void setup() {
  FastLED.addLeds<CHIPSET, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
         .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  // fill the strip with a moving rainbow
  fill_rainbow(leds, NUM_LEDS, hue, 7);
  FastLED.show();
  
  // advance hue for next frame
  hue++;

  // adjust frame rate (in ms)
  delay(10);
}

