#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>

// ===== CHOOSE YOUR LED LIBRARY =====
#define USE_ADAFRUIT
// #define USE_FASTLED

// ===== LED CONFIGURATION =====
#define LED_PIN     13
#define LED_COUNT   64
#define LED_BRIGHTNESS 128

#ifdef USE_FASTLED
  #include <FastLED.h>
  CRGB leds[LED_COUNT];
#else
  #include <Adafruit_NeoPixel.h>
  Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
#endif

// ===== I2S CONFIGURATION =====
#define I2S_SD   16  
#define I2S_SCK  4  
#define I2S_WS   15  
#define I2S_PORT I2S_NUM_0
#define MIC_SEL  2  

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
const int motorPins[] = {9, 10, 20, 21};
// make thresholds one per motor
int motorThresholds[] = {1000, 1000, 1000, 1000};

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

  if (bytesRead < sizeof(samples)) return;

  long sum = 0;
  for (int i = 0; i < BUFFER_SIZE; i++) {
    vReal[i] = (float)samples[i];
    vImag[i] = 0.0;
    sum += abs(samples[i]);
  }
  audioMagnitude = sum / BUFFER_SIZE;
  Serial.println(audioMagnitude);

  FFT.windowing(vReal, BUFFER_SIZE, FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(vReal, vImag, BUFFER_SIZE, FFT_FORWARD);
  FFT.complexToMagnitude(vReal, vImag, BUFFER_SIZE);

  int maxIndex = 1;
  float maxValue = vReal[1];
  for (int i = 2; i < BUFFER_SIZE/2; i++) {
    if (vReal[i] > maxValue) {
      maxValue = vReal[i];
      maxIndex = i;
    }
  }
  audioFrequency = maxIndex * ((float)SAMPLE_RATE / BUFFER_SIZE);
}

// ===== LED + AMPLITUDE =====
void ledFreqAmp() {
  float freq = constrain(audioFrequency, 10.0, 4000.0);
  targetHue = map(freq, 10, 4000, 0, 255);
  currentHue += (targetHue - currentHue) * hueDecayRate;

  uint16_t mag = constrain(audioMagnitude, 30, 500);
  uint8_t brightness = map(mag, 30, 500, 0, LED_BRIGHTNESS);

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
    initializedPins[pin] = true;
  }
  digitalWrite(pin, audioMagnitude > threshold ? HIGH : LOW);
}

// ===== CAPTIVE PORTAL =====
DNSServer dnsServer;
WebServer server(80);
const byte DNS_PORT = 53;

// serve the settings page
void handleRoot() {
  String html = "<html><body><h2>Audio Thresholds</h2>";
  for (int i = 0; i < sizeof(motorPins)/sizeof(motorPins[0]); i++) {
    html += "Pin " + String(motorPins[i]) + ": "
         + "<input type='range' min='100' max='10000' step='50'"
         + " value='" + String(motorThresholds[i]) + "'"
         + " onchange='upd(" + String(i) + ", this.value)'>"
         + "<span id='v" + String(i) + "'>" + String(motorThresholds[i]) + "</span><br>";
  }
  html += R"rawliteral(
    <script>
      function upd(idx,val) {
        document.getElementById('v'+idx).innerText = val;
        fetch(`/set?index=${idx}&value=${val}`);
      }
    </script>
    </body></html>
  )rawliteral";
  server.send(200, "text/html", html);
}

// update thresholds
void handleSet() {
  if (server.hasArg("index") && server.hasArg("value")) {
    int i = server.arg("index").toInt();
    int v = server.arg("value").toInt();
    if (i >= 0 && i < sizeof(motorThresholds)/sizeof(motorThresholds[0]))
      motorThresholds[i] = v;
  }
  server.send(200, "text/plain", "OK");
}

// catch-all to force redirect to root
void handleNotFound(){
  server.sendHeader("Location", "http://"+WiFi.softAPIP().toString(), true);
  server.send(302, "text/plain", "");
}

void setupCaptivePortal() {
  // configure AP IP to avoid clients grabbing random
  IPAddress apIP(192,168,4,1), netMsk(255,255,255,0);
  WiFi.softAP("ESP32-Cogwork-Controller");
  delay(100);
  WiFi.softAPConfig(apIP, apIP, netMsk);

  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", handleRoot);
  server.on("/set", handleSet);
  server.onNotFound(handleNotFound);
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
  //setupCaptivePortal();
}

void loop() {
  analyzeFreq();
  ledFreqAmp();
  // for (int i = 0; i < sizeof(motorPins)/sizeof(motorPins[0]); i++)
  //   motorControl(motorPins[i], motorThresholds[i]);
  // updateWebPortal();
}
