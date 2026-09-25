#include <Arduino.h>
#include <FastLED.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>

// Pin definitions for I2S microphone
#define MIC_WS_PIN 4
#define MIC_SEL_PIN 5
#define MIC_SCK_PIN 23
#define MIC_DO_PIN 22

// LED setup
#define STRIP_LENGTH 150
#define LED_PIN 6
#define BRIGHTNESS 255


// Sampling and FFT setup
#define SAMPLING_RATE 10000
#define FFT_SIZE 512

// Debug flags
#define PRINT_RAW_MIC_DATA 0
#define PRINT_FREQUENCY_DATA 1
#define PRINT_COLOR_VALUES 1

// FFT buffers
double vReal[FFT_SIZE];
double vImag[FFT_SIZE];
ArduinoFFT<double> FFT(vReal, vImag, FFT_SIZE, SAMPLING_RATE);

// I2S configuration
i2s_config_t i2s_config = {
  .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = SAMPLING_RATE,
  .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
  .channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT,
  .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S),
  .intr_alloc_flags = 0,
  .dma_buf_count = 4,
  .dma_buf_len = FFT_SIZE,
  .use_apll = false,
  .tx_desc_auto_clear = true,
  .fixed_mclk = 0
};

i2s_pin_config_t pin_config = {
  .bck_io_num = MIC_SCK_PIN,
  .ws_io_num = MIC_WS_PIN,
  .data_out_num = I2S_PIN_NO_CHANGE,
  .data_in_num = MIC_DO_PIN
};

int hue;
int brightness;
void audioFFT() {
  size_t bytesRead;
  int16_t buffer[FFT_SIZE];

  // Read I2S data into buffer
  i2s_read(I2S_NUM_0, (void *)buffer, sizeof(buffer), &bytesRead, portMAX_DELAY);

  // Convert buffer to real part and set imaginary part to 0
  for (int i = 0; i < FFT_SIZE; i++) {
    vReal[i] = (double)buffer[i];
    vImag[i] = 0.0;
  }

  // Apply FFT windowing and compute FFT
  FFT.windowing(FFTWindow::Blackman_Nuttall, FFTDirection::Forward);
  FFT.compute(FFTDirection::Forward);
  FFT.complexToMagnitude();

  // Find peak frequency
  double maxMagnitude = 0;
  int maxIndex = 0;
  for (int i = 0; i < FFT_SIZE / 2; i++) {
    if (vReal[i] > maxMagnitude) {
      maxMagnitude = vReal[i];
      maxIndex = i;
    }
  }

  // Calculate frequency and amplitude
  float freq = (float)maxIndex * (SAMPLING_RATE / FFT_SIZE);
  float amp = maxMagnitude / 6000.0;

  // Debug: Print raw microphone data
  if (PRINT_RAW_MIC_DATA) {
    for (int i = 0; i < FFT_SIZE; i++) {
      Serial.print(buffer[i]);
      Serial.print(" ");
    }
    Serial.println();
  }

  // Debug: Print frequency and amplitude
  if (PRINT_FREQUENCY_DATA) {
    Serial.print("Frequency: ");
    Serial.print(freq);
    Serial.print(" Hz, Amplitude: ");
    Serial.println(amp);
  }

  // Map frequency and amplitude to hue and brightness
  hue = map(freq, 0, 5000, 0, 255);
  brightness = map(amp, 0, 1, 0, 255);

  // Debug: Print color values
  if (PRINT_COLOR_VALUES) {
    Serial.print("Hue: ");
    Serial.print(hue);
    Serial.print(", Brightness: ");
    Serial.println(brightness);
  }
}


// LED strip setup
CRGB leds[STRIP_LENGTH];

void setup() {
  Serial.begin(115200);

  // I2S initialization
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  i2s_start(I2S_NUM_0);

  // LED setup
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, STRIP_LENGTH);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  // Perform FFT analysis and process microphone data
  for (int i = 0; i < STRIP_LENGTH; i++) {
    audioFFT();
    leds[i] = CHSV(hue, 255, brightness);
  }

  // Update the LEDs with new hue and brightness values
  FastLED.show();
  delay(10);
}



