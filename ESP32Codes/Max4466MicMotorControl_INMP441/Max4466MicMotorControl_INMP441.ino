#include <Arduino.h>
#include <FastLED.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>

#define LED_PIN 1                   
#define NUM_LEDS 30 
CRGB leds[NUM_LEDS];

const float FREQ_MIN = 100.0f;      // Minimum sound frequency for color mapping (Hz)
const float FREQ_MAX = 3000.0f;     // Maximum sound frequency for color mapping (Hz)

// Brightness sensitivity knobs
const float LED_LEVEL_GAIN = 1.0f;        // Gain applied to audio level for brightness mapping
const float LED_LEVEL_REF  = 2000.0f;     // Audio level that maps to max LED brightness
const uint8_t LED_BRIGHT_MIN = 0;         // Minimum LED brightness (0-255)
const uint8_t LED_BRIGHT_MAX = 255;       // Maximum LED brightness (0-255)
const float LED_ATTACK = 0.07f;           // Brightness rise speed (0..1)
const float LED_RELEASE = 0.07f;          // Brightness fall speed (0..1)
const float LED_OFF_THRESHOLD = 100.0f;   // Below this audio level, LEDs turn completely off

// I2S configuration for INMP441
#define I2S_SCK 20                  // I2S Serial Clock
#define I2S_WS 10                   // I2S Word Select (Left/Right Channel)
#define I2S_SD 21                   // I2S Serial Data
#define SAMPLE_RATE 16000           // Sampling frequency in Hz (slightly higher than original for better quality)
#define SAMPLES 256                 // Number of audio samples per FFT

double vReal[SAMPLES], vImag[SAMPLES];  // FFT real and imaginary arrays
ArduinoFFT<double> FFT(vReal, vImag, SAMPLES, SAMPLE_RATE);

#define MOTOR_PIN_1 8               // GPIO pin connected to motor 1 driver MOSFET
#define MOTOR_PIN_2 9               // GPIO pin connected to motor 2 driver MOSFET
#define PWM_FREQ 5000               // PWM frequency for motor control
#define PWM_BITS 8                  // PWM resolution in bits

// Motor speed mapping knobs
const float LEVEL_GATE = 500.0f;  // Audio level below which motor is off
const float LEVEL_HIGH = 7500.0f; // Audio level that maps to max motor speed
const int   DUTY_START = 100;     // Motor duty at just above LEVEL_GATE
const int   DUTY_MAX   = 255;     // Max motor PWM duty (0-255)
const float SMOOTH     = 0.25f;   // Motor speed smoothing factor (0..1)

float levelLP = 0.0f;               // Smoothed audio level for motor
float ledEnv  = 0.0f;               // Smoothed LED brightness envelope (0..1)

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
  delay(1000);  // Give serial time to initialize

  // ESP-IDF style I2S configuration for ESP32-C3
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);

  // Initialize LEDs
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(LED_BRIGHT_MIN);

  // Initialize both motors to OFF
  ledcAttach(MOTOR_PIN_1, PWM_FREQ, PWM_BITS);
  ledcWrite(MOTOR_PIN_1, 0);
  ledcAttach(MOTOR_PIN_2, PWM_FREQ, PWM_BITS);
  ledcWrite(MOTOR_PIN_2, 0);
  
  Serial.println("\n=== ESP32-C3 Audio Reactive System ===");
  Serial.println("Setup complete. Motors initialized to OFF (duty=0).");
  Serial.println("Listening for audio...\n");
}

void loop() {
  int32_t samples[SAMPLES];
  size_t bytesRead = 0;
  
  // ESP-IDF style read
  i2s_read(I2S_NUM_0, samples, sizeof(samples), &bytesRead, portMAX_DELAY);
  
  if (bytesRead > 0) {
    int32_t sum = 0;
    
    for (int i = 0; i < SAMPLES; i++) {
      // For ESP32-C3, the I2S data needs different handling
      // Extract the actual 16-bit audio data from the 32-bit word
      // The data is in the upper 16 bits, then normalize to signed 16-bit range
      int32_t sample32 = samples[i];
      // Right shift to get 16-bit value, then scale down
      int16_t sample = (int16_t)(sample32 >> 14);  // Shift by 14 instead of 16 for proper scaling
      sum += sample;
      vReal[i] = double(sample);
      vImag[i] = 0;
    }

    double dc = double(sum) / double(SAMPLES);
    double mad = 0;
    for (int i = 0; i < SAMPLES; i++) {
      double centered = vReal[i] - dc;
      mad += fabs(centered);
      vReal[i] = centered;
    }
    mad /= SAMPLES;

    FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    FFT.compute(FFT_FORWARD);
    FFT.complexToMagnitude();

    double maxAmp = 0;
    int maxIdx = 0;
    for (int i = 1; i < SAMPLES / 2; i++) {
      if (vReal[i] > maxAmp) {
        maxAmp = vReal[i];
        maxIdx = i;
      }
    }
    double peakHz = (maxIdx * 1.0 * SAMPLE_RATE) / SAMPLES;

    // Motor control
    levelLP += SMOOTH * (float(mad) - levelLP);
    int duty = levelToDuty(levelLP);
    ledcWrite(MOTOR_PIN_1, duty);
    ledcWrite(MOTOR_PIN_2, duty);

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

    // Clean, readable debug output for tuning motor parameters
    Serial.println("┌─────────────────────────────────────────────────────────────┐");
    Serial.print("│ Audio Level (MAD): ");
    Serial.print(mad, 1);
    Serial.print("  →  Smoothed: ");
    Serial.print(levelLP, 1);
    Serial.println();
    
    Serial.print("│ Motor Status: ");
    if (duty == 0) {
      Serial.print("OFF (below gate threshold)");
    } else {
      Serial.print("ON - Duty: ");
      Serial.print(duty);
      Serial.print("/255 (");
      Serial.print((duty * 100) / 255);
      Serial.print("%)");
    }
    Serial.println();
    
    Serial.print("│ Thresholds: Gate=");
    Serial.print(LEVEL_GATE, 0);
    Serial.print("  High=");
    Serial.print(LEVEL_HIGH, 0);
    Serial.print("  Current=");
    Serial.print(levelLP, 1);
    Serial.println();
    
    Serial.print("│ LED: Brightness=");
    int currentBright = (mad < LED_OFF_THRESHOLD) ? 0 : (LED_BRIGHT_MIN + (uint8_t)((LED_BRIGHT_MAX - LED_BRIGHT_MIN) * ledEnv));
    Serial.print(currentBright);
    Serial.print("/255  Freq=");
    Serial.print(peakHz, 0);
    Serial.print("Hz  Hue=");
    Serial.print(mapFreqToHue(peakHz));
    Serial.println();
    Serial.println("└─────────────────────────────────────────────────────────────┘");
    Serial.println();
  } else {
    Serial.println("WARNING: No bytes read from I2S!");
  }
}