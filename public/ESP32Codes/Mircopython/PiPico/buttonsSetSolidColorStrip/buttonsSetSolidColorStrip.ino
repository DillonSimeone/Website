#include <FastLED.h>

#define DATA_PIN    2    // GP2 for LED data
#define NUM_LEDS    200
#define BRIGHTNESS  128
#define LED_TYPE    WS2812B
#define COLOR_ORDER GRB

CRGB leds[NUM_LEDS];

// all usable GPIOs on Pico, excluding DATA_PIN
const uint8_t buttonPins[] = {
  0,1, 3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,
  26,27,28
};
const uint8_t numButtons = sizeof(buttonPins) / sizeof(buttonPins[0]);

// precomputed solid colors for each button
CRGB buttonColors[numButtons];
uint8_t lastIndex = 255;

void setup() {
  Serial.begin(115200);
  // wait for USB Serial to initialize (optional)
  while(!Serial) {}

  // print diagnostics
  Serial.print("sizeof(buttonPins): ");
  Serial.println(sizeof(buttonPins));
  Serial.print("sizeof(buttonPins[0]): ");
  Serial.println(sizeof(buttonPins[0]));
  Serial.print("numButtons: ");
  Serial.println(numButtons);

  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);

  for (uint8_t i = 0; i < numButtons; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
    uint8_t hue = map(i, 0, numButtons - 1, 0, 160);
    buttonColors[i] = CHSV(hue, 255, 255);
    Serial.print("Color added to pin ");
    Serial.print(i);
    Serial.print(": ");
    Serial.print(buttonColors[i].r);
    Serial.print(",");
    Serial.print(buttonColors[i].g);
    Serial.print(",");
    Serial.println(buttonColors[i].b);
  }

  fill_solid(leds, NUM_LEDS, buttonColors[0]);
  FastLED.show();
  lastIndex = 0;
}

void loop() {
  for (uint8_t i = 0; i < numButtons; i++) {
    if (digitalRead(buttonPins[i]) == LOW) {
      if (i != lastIndex) {
        lastIndex = i;
        fill_solid(leds, NUM_LEDS, buttonColors[i]);
        FastLED.show();
      }
      break;
    }
  }
}
