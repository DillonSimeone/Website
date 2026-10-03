#include <Arduino.h>
#include <I2S.h>
#include <arduinoFFT.h>

// ===== CHOOSE YOUR LED LIBRARY =====
#define USE_ADAFRUIT
// #define USE_FASTLED

#ifdef USE_FASTLED
  #include <FastLED.h>
#else
  #include <Adafruit_NeoPixel.h>
#endif

// ===== LED CONFIGURATION =====
#define LED_PIN        4
#define LED_COUNT      60
#define LED_BRIGHTNESS 128

// ===== I2S + MIC CONFIGURATION =====n// Pico pins:
//   SD (DIN)   → GP0
//   WS (LRCLK) → GP1
//   SCK (BCLK) → GP2
//   SEL (L/R)  → GP3
#define I2S_SD         0
#define I2S_WS         2
#define I2S_SCK        1
#define MIC_SEL        3

#define SAMPLE_RATE    16000
#define BUFFER_SIZE    1024

// ===== AUDIO STATE =====
float vReal[BUFFER_SIZE];
float vImag[BUFFER_SIZE];
ArduinoFFT<float> FFT(vReal, vImag, BUFFER_SIZE, SAMPLE_RATE);

uint16_t audioMagnitude = 0;
float   audioFrequency = 0;

// ===== COLOR STATE =====n// (for LEDs)
float currentHue   = 0;
float targetHue    = 0;
float hueDecayRate = 0.2;

// Onboard LED
const int LED_ONBOARD = 25;
unsigned long lastBlink = 0;
const unsigned long blinkInterval = 200; // ms

// I2S port
I2S i2s = I2S(INPUT);

#ifdef USE_FASTLED
CRGB leds[LED_COUNT];
#else
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
#endif

// ===== I2S SETUP =====
void setupI2SMic() {
  pinMode(MIC_SEL, OUTPUT);
  digitalWrite(MIC_SEL, LOW);

  i2s.setBCLK(I2S_WS);
  i2s.swapClocks();
  i2s.setDATA(I2S_SD);
  i2s.setBitsPerSample(16);
  i2s.setFrequency(SAMPLE_RATE);
  i2s.setSysClk(SAMPLE_RATE);
  i2s.begin();
}

// ===== LED SETUP =====
void ledSetup() {
#ifdef USE_FASTLED
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, LED_COUNT);
  FastLED.setBrightness(LED_BRIGHTNESS);
#else
  strip.begin();
  strip.setBrightness(LED_BRIGHTNESS);
  strip.show();
#endif
}

// ===== APPLY SOLID HUE =====
void ledApplyHue(float hue) {
#ifdef USE_FASTLED
  for (int i = 0; i < LED_COUNT; i++)
    leds[i] = CHSV((uint8_t)hue, 255, 255);
  FastLED.show();
#else
  uint32_t color = strip.ColorHSV((uint16_t)(hue * 182));
  color = strip.gamma32(color);
  for (int i = 0; i < LED_COUNT; i++)
    strip.setPixelColor(i, color);
  strip.show();
#endif
}

// ===== AUDIO ANALYSIS =====
void analyzeFreq() {
  int16_t left, right;
  uint32_t sum = 0;

  for (int i = 0; i < BUFFER_SIZE; i++) {
    if (i2s.read16(&left, &right)) {
      vReal[i] = left;
      vImag[i] = 0.0;
      sum += abs(left);
    } else {
      vReal[i] = vImag[i] = 0.0;
    }
  }
  audioMagnitude = sum / BUFFER_SIZE;

  FFT.windowing(vReal, BUFFER_SIZE, FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(vReal, vImag, BUFFER_SIZE, FFT_FORWARD);
  FFT.complexToMagnitude(vReal, vImag, BUFFER_SIZE);

  int   maxIndex = 1;
  float maxValue = vReal[1];
  for (int i = 2; i < BUFFER_SIZE/2; i++) {
    if (vReal[i] > maxValue) {
      maxValue = vReal[i];
      maxIndex = i;
    }
  }
  audioFrequency = maxIndex * ((float)SAMPLE_RATE / BUFFER_SIZE);
}

// ===== MAP FREQ + AMP → HUE/BRIGHTNESS =====
void ledFreqAmp() {
  float freq = constrain(audioFrequency, 10.0, 4000.0);
  targetHue   = map(freq, 10.0, 4000.0, 0, 255);
  currentHue += (targetHue - currentHue) * hueDecayRate;

  const uint16_t minMag = 30, maxMag = 500;
  uint16_t mag = constrain(audioMagnitude, minMag, maxMag);
  uint8_t  br  = map(mag, minMag, maxMag, 0, LED_BRIGHTNESS);

#ifdef USE_FASTLED
  FastLED.setBrightness(br);
#else
  strip.setBrightness(br);
#endif

  ledApplyHue(currentHue);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(LED_ONBOARD, OUTPUT);
  digitalWrite(LED_ONBOARD, LOW);

  setupI2SMic();
  ledSetup();
}

void loop() {
  analyzeFreq();

  // —— Blink onboard LED if no input ——
  unsigned long now = millis();
  if (audioMagnitude == 0) {
    if (now - lastBlink >= blinkInterval) {
      digitalWrite(LED_ONBOARD, !digitalRead(LED_ONBOARD));
      lastBlink = now;
    }
  } else {
    digitalWrite(LED_ONBOARD, LOW);
  }

  // —— Serial output ——
  Serial.print("Magnitude: ");
  Serial.print(audioMagnitude);
  Serial.print("    Frequency: ");
  Serial.println(audioFrequency, 1);

  ledFreqAmp();
}
