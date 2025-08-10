#include <arduinoFFT.h>
#include <FastLED.h>

#define LED_PIN 1
#define NUM_LEDS 30
CRGB leds[NUM_LEDS];

#define MIC_PIN 2
#define SAMPLES 512
#define FS 10000

// PWM on ESP32-C3
#define MOTOR_PIN 4
#define PWM_FREQ 5000
#define PWM_BITS 8   // 0..255

// ===== knobs you actually tweak =====
const float LEVEL_GATE = 900.0f;    // below this, motor off
const float LEVEL_HIGH = 2000.0f;   // at or above this, clamp to DUTY_MAX
const int   DUTY_START = 160;        // duty just above gate; set 15..30 if your motor needs a kick
const int   DUTY_MAX   = 255;      // cap 0 - 255
const float SMOOTH     = 0.2f;     // 0..1 smoothing of level
// ====================================

double vReal[SAMPLES], vImag[SAMPLES];
ArduinoFFT<double> FFT(vReal, vImag, SAMPLES, FS);

float levelLP = 0;

static inline int levelToDuty(float lvl) {
  if (lvl <= LEVEL_GATE) return 0;
  float x = lvl; if (x > LEVEL_HIGH) x = LEVEL_HIGH;
  float t = (x - LEVEL_GATE) / (LEVEL_HIGH - LEVEL_GATE); // 0..1
  int duty = int(DUTY_START + t * (DUTY_MAX - DUTY_START));
  if (duty < 0) duty = 0; if (duty > 255) duty = 255;
  return duty;
}

void updateLEDsFromFreq(double freqHz) {
  // Map 100–3000 Hz to hue 0–160 (red to purple)
  float clamped = constrain(freqHz, 100.0, 3000.0);
  uint8_t hue = map(clamped, 100, 3000, 0, 160);  // red to purple
  fill_solid(leds, NUM_LEDS, CHSV(hue, 255, 255));
  FastLED.show();
}


void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);  // 0..3.3 V on ESP32-C3

  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(64);  // adjust to taste

  ledcAttach(MOTOR_PIN, PWM_FREQ, PWM_BITS);
  ledcWrite(MOTOR_PIN, 0);
}

void loop() {
  // sample block
  unsigned long t0;
  uint32_t sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    t0 = micros();
    int raw = analogRead(MIC_PIN);
    sum += raw;
    vReal[i] = double(raw);   // save for FFT pass
    vImag[i] = 0;
    while (micros() - t0 < (1000000UL / FS));
  }

  // compute DC baseline and time-domain level (mean absolute deviation)
  double dc = double(sum) / SAMPLES;
  double mad = 0;
  for (int i = 0; i < SAMPLES; i++) {
    double centered = vReal[i] - dc;
    mad += fabs(centered);
    vReal[i] = centered;      // also center for FFT
  }
  mad /= SAMPLES;             // this is your audio “level”

  // FFT only for peak frequency display
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();
  double maxAmp = 0; int maxIdx = 0;
  for (int i = 1; i < SAMPLES/2; i++) if (vReal[i] > maxAmp) { maxAmp = vReal[i]; maxIdx = i; }
  double peakHz = (maxIdx * 1.0 * FS) / SAMPLES;

  // smooth level and drive PWM
  levelLP += SMOOTH * (float(mad) - levelLP);
  int duty = levelToDuty(levelLP);
  ledcWrite(MOTOR_PIN, duty);

  // status
  int rawSample = analogRead(MIC_PIN);
  Serial.print("Raw: ");
  Serial.print(rawSample);
  Serial.print("  PeakFreq: ");
  Serial.print(peakHz, 1);
  Serial.print(" Hz  Level: ");
  Serial.print(mad, 1);
  Serial.print("  Duty: ");
  Serial.println(duty);

  updateLEDsFromFreq(peakHz);

  delay(10);
  
}
