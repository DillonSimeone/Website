#include <arduinoFFT.h>
#include <FastLED.h>

#define LED_PIN 1                  // GPIO pin connected to LED strip
#define NUM_LEDS 30                // Number of LEDs in the strip
CRGB leds[NUM_LEDS];              // LED array

const float FREQ_MIN = 100.0f;     // Minimum sound frequency for color mapping (Hz)
const float FREQ_MAX = 3000.0f;    // Maximum sound frequency for color mapping (Hz)

// Brightness sensitivity knobs
const float LED_LEVEL_GAIN = 1.0f;       // Gain applied to audio level for brightness mapping
const float LED_LEVEL_REF  = 2000.0f;    // Audio level that maps to max LED brightness
const uint8_t LED_BRIGHT_MIN = 0;        // Minimum LED brightness (0-255)
const uint8_t LED_BRIGHT_MAX = 255;      // Maximum LED brightness (0-255)
const float LED_ATTACK = 0.07f;          // Brightness rise speed (0..1)
const float LED_RELEASE = 0.07f;         // Brightness fall speed (0..1)
const float LED_OFF_THRESHOLD = 100.0f;  // Below this audio level, LEDs turn completely off

#define MIC_PIN 2                  // GPIO pin connected to microphone output
#define SAMPLES 256                // Number of audio samples per FFT
#define FS 15000                   // Sampling frequency in Hz

double vReal[SAMPLES], vImag[SAMPLES];   // FFT real and imaginary arrays
ArduinoFFT<double> FFT(vReal, vImag, SAMPLES, FS);

#define MOTOR_PIN 4                // GPIO pin connected to motor driver MOSFET
#define PWM_FREQ 5000              // PWM frequency for motor control
#define PWM_BITS 8                 // PWM resolution in bits

// Motor speed mapping knobs
const float LEVEL_GATE = 900.0f;   // Audio level below which motor is off
const float LEVEL_HIGH = 1000.0f;  // Audio level that maps to max motor speed
const int   DUTY_START = 160;      // Motor duty at just above LEVEL_GATE
const int   DUTY_MAX   = 200;      // Max motor PWM duty (0-255)
const float SMOOTH     = 0.25f;    // Motor speed smoothing factor (0..1)

float levelLP = 0.0f;              // Smoothed audio level for motor
float ledEnv  = 0.0f;              // Smoothed LED brightness envelope (0..1)

static inline int levelToDuty(float lvl) {
  if (lvl <= LEVEL_GATE) return 0;
  float x = lvl; if (x > LEVEL_HIGH) x = LEVEL_HIGH;
  float t = (x - LEVEL_GATE) / (LEVEL_HIGH - LEVEL_GATE);
  return constrain(int(DUTY_START + t * (DUTY_MAX - DUTY_START)), 0, 255);
}

static inline uint8_t mapFreqToHue(double freqHz) {
  float f = constrain((float)freqHz, FREQ_MIN, FREQ_MAX);
  return map((int)f, (int)FREQ_MIN, (int)FREQ_MAX, 0, 160);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(LED_BRIGHT_MIN);

  ledcAttach(MOTOR_PIN, PWM_FREQ, PWM_BITS);
  ledcWrite(MOTOR_PIN, 0);
}

void loop() {
  unsigned long t0;
  uint32_t sum = 0;  // Sum for DC offset calculation
  for (int i = 0; i < SAMPLES; i++) {
    t0 = micros();
    int raw = analogRead(MIC_PIN);
    sum += raw;
    vReal[i] = double(raw);
    vImag[i] = 0;
    while (micros() - t0 < (1000000UL / FS));
  }

  double dc = double(sum) / SAMPLES; // DC offset
  double mad = 0;                    // Mean absolute deviation (audio level)
  for (int i = 0; i < SAMPLES; i++) {
    double centered = vReal[i] - dc;
    mad += fabs(centered);
    vReal[i] = centered;
  }
  mad /= SAMPLES;

  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();
  double maxAmp = 0; int maxIdx = 0; // Peak frequency detection
  for (int i = 1; i < SAMPLES/2; i++) if (vReal[i] > maxAmp) { maxAmp = vReal[i]; maxIdx = i; }
  double peakHz = (maxIdx * 1.0 * FS) / SAMPLES;

  // Motor control
  levelLP += SMOOTH * (float(mad) - levelLP);
  int duty = levelToDuty(levelLP);
  ledcWrite(MOTOR_PIN, duty);

  // LED control with off threshold
  if (mad < LED_OFF_THRESHOLD) {
    FastLED.clear(true);
  } else {
    float ledTarget = (float(mad) * LED_LEVEL_GAIN) / LED_LEVEL_REF;
    ledTarget = constrain(ledTarget, 0.0f, 1.0f);
    float coeff = (ledTarget > ledEnv) ? LED_ATTACK : LED_RELEASE;
    ledEnv += coeff * (ledTarget - ledEnv);

    uint8_t bright = LED_BRIGHT_MIN + (uint8_t)((LED_BRIGHT_MAX - LED_BRIGHT_MIN) * ledEnv);
    uint8_t hue = mapFreqToHue(peakHz);
    fill_solid(leds, NUM_LEDS, CHSV(hue, 255, 255));
    FastLED.setBrightness(bright);
    FastLED.show();
  }

  // Debug output
  int rawSample = analogRead(MIC_PIN);
  Serial.print("Raw: ");
  Serial.print(rawSample);
  Serial.print("  PeakFreq: ");
  Serial.print(peakHz, 1);
  Serial.print(" Hz  Level: ");
  Serial.print(mad, 1);
  Serial.print("  Duty: ");
  Serial.print(duty);
  Serial.print("  LEDlvl: ");
  Serial.print(ledEnv, 2);
  Serial.print("  Bright: ");
  Serial.println((mad < LED_OFF_THRESHOLD) ? 0 : (LED_BRIGHT_MIN + (uint8_t)((LED_BRIGHT_MAX - LED_BRIGHT_MIN) * ledEnv)));

  delay(16);
}
