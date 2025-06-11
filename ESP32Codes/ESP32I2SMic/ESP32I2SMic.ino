#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>

// ===== CHOOSE YOUR LED LIBRARY =====
#define USE_ADAFRUIT
// #define USE_FASTLED

// ===== LED CONFIGURATION =====
#define LED_PIN     21
#define LED_COUNT   60
#define LED_BRIGHTNESS 128

#ifdef USE_FASTLED
  #include <FastLED.h>
  CRGB leds[LED_COUNT];
#else
  #include <Adafruit_NeoPixel.h>
  Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
#endif

// ===== I2S CONFIGURATION =====
/* Dillon's notes: 
  Most I2S MEMS microphones (especially cheap or mid-range ones) drop off heavily above 4kHz or even 3.5kHz.
  Nyquist limit: Sample rate / 2 = max detectable frequency rates
  Resolutions: Sample rate / buffer size IE; 16,000 / 1024 = ~15.6 Hz per bin

  It happens that human speech energy is between 85 Hz and 4,000 Hz. This is what most I2S MEMS mics are aimed at. 
  So 8,000hz sample rate is ideal. 
*/ 
#define I2S_SD   22  // DO
#define I2S_SCK  23  // SCK
#define I2S_WS   4   // WS
#define I2S_PORT I2S_NUM_0
#define MIC_SEL  5   // SEL (LOW = left channel)

#define SAMPLE_RATE     16000
#define BUFFER_SIZE     1024

// ===== AUDIO STATE =====
float vReal[BUFFER_SIZE];
float vImag[BUFFER_SIZE];
ArduinoFFT<float> FFT(vReal, vImag, BUFFER_SIZE, SAMPLE_RATE);

uint16_t audioMagnitude = 0;
float audioFrequency = 0;

// ===== COLOR STATE =====
float currentHue = 0;
float targetHue = 0;
float hueDecayRate = 0.2;

// ===== MOTOR CONTROL =====
const int motorPins[] = {17};
int motorThresholds[] = {1000};

// ===== I2S SETUP =====
void setupI2SMic() {
  pinMode(MIC_SEL, OUTPUT);
  digitalWrite(MIC_SEL, LOW);

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = BUFFER_SIZE,
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

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);
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

// ===== LED APPLY COLOR =====
void ledApplyHue(float hue) {
#ifdef USE_FASTLED
  for (int i = 0; i < LED_COUNT; i++) {
    leds[i] = CHSV((uint8_t)hue, 255, 255);
  }
  FastLED.show();
#else
  uint32_t color = strip.ColorHSV((uint16_t)(hue * 182));
  color = strip.gamma32(color);
  for (int i = 0; i < LED_COUNT; i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
#endif
}

// ===== AUDIO ANALYSIS =====
void analyzeFreq() {
  int16_t samples[BUFFER_SIZE];
  size_t bytesRead;

  i2s_read(I2S_PORT, &samples, sizeof(samples), &bytesRead, portMAX_DELAY);
  int numSamples = bytesRead / sizeof(int16_t);
  if (numSamples < BUFFER_SIZE) return;

  long sum = 0;
  for (int i = 0; i < BUFFER_SIZE; i++) {
    vReal[i] = (float)samples[i];
    vImag[i] = 0.0;
    sum += abs(samples[i]);
  }
  audioMagnitude = sum / BUFFER_SIZE;

  FFT.windowing(vReal, BUFFER_SIZE, FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(vReal, vImag, BUFFER_SIZE, FFT_FORWARD);
  FFT.complexToMagnitude(vReal, vImag, BUFFER_SIZE);

  int maxIndex = 1;
  float maxValue = vReal[1];
  for (int i = 2; i < BUFFER_SIZE / 2; i++) {
    if (vReal[i] > maxValue) {
      maxValue = vReal[i];
      maxIndex = i;
    }
  }

  audioFrequency = maxIndex * ((float)SAMPLE_RATE / BUFFER_SIZE);
}

// ===== LED FROM FREQUENCY + AMPLITUDE =====
void ledFreqAmp() {
  float freq = audioFrequency;
  if (freq < 10.0) freq = 10.0;
  if (freq > 4000.0) freq = 4000.0;
  targetHue = map(freq, 10.0, 4000.0, 0, 255);
  currentHue += (targetHue - currentHue) * hueDecayRate;

  const uint16_t minMag = 30;
  const uint16_t maxMag = 500;
  uint16_t mag = audioMagnitude;
  if (mag < minMag) mag = minMag;
  if (mag > maxMag) mag = maxMag;

  uint8_t brightness = map(mag, minMag, maxMag, 0, LED_BRIGHTNESS);

#ifdef USE_FASTLED
  FastLED.setBrightness(brightness);
#else
  strip.setBrightness(brightness);
#endif

  ledApplyHue(currentHue);
}

// ===== MOTOR CONTROL =====
void motorControl(uint8_t pin, uint16_t threshold) {
  static bool initializedPins[40] = { false };
  if (!initializedPins[pin]) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
    initializedPins[pin] = true;
  }
  if (audioMagnitude > threshold) {
    digitalWrite(pin, HIGH);
    Serial.printf("MOTOR %d IS ON\n", pin);
  } else {
    digitalWrite(pin, LOW);
  }
}

// ===== WiFi Captive Portal Setup =====
DNSServer dnsServer;
WebServer server(80);
const byte DNS_PORT = 53;

void handleRoot() {
  String html = "<html><body><h2>Audio Thresholds</h2>";
  for (int i = 0; i < sizeof(motorPins)/sizeof(motorPins[0]); i++) {
    html += "Ouput Pin" + String(motorPins[i]) + ": <input type='range' min='100' max='10000' step='50' value='" + String(motorThresholds[i]) + "' onchange='update(" + String(i) + ", this.value)'><span id='val" + String(i) + "'>" + String(motorThresholds[i]) + "</span><br>";
  }
  html += R"rawliteral(
    <script>
      function update(index, value) {
        document.getElementById('val'+index).innerText = value;
        fetch(`/set?index=${index}&value=${value}`);
      }
    </script>
    </body></html>
  )rawliteral";
  server.send(200, "text/html", html);
}

void handleSet() {
  if (server.hasArg("index") && server.hasArg("value")) {
    int i = server.arg("index").toInt();
    int v = server.arg("value").toInt();
    if (i >= 0 && i < sizeof(motorThresholds)/sizeof(motorThresholds[0])) {
      motorThresholds[i] = v;
    }
  }
  server.send(200, "text/plain", "OK");
}

void setupCaptivePortal() {
  WiFi.softAP("ESP32-InfinityMirror-Controller");
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/set", handleSet);
  server.begin();
}

void updateWebPortal() {
  dnsServer.processNextRequest();
  server.handleClient();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  setupI2SMic();
  ledSetup();
  setupCaptivePortal();
}

void loop() {
  analyzeFreq();
  ledFreqAmp();
  for (int i = 0; i < sizeof(motorPins)/sizeof(motorPins[0]); i++) {
    motorControl(motorPins[i], motorThresholds[i]);
  }
  updateWebPortal();
}
