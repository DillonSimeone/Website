#include <Arduino.h>
#include <Arduino.h>
#include <driver/i2s.h>
#include <Adafruit_NeoPixel.h>
#include <arduinoFFT.h>

#define MIC_WS_PIN 4
#define MIC_SEL_PIN 5
#define MIC_SCK_PIN 23
#define MIC_DO_PIN 22
#define LED_PIN 6
#define NUM_LEDS 70
#define samplingRate 10000
#define FFT_SIZE 512 // Increased FFT size

//booleanFlags
#define printRawMicData 0
#define debug 0

Adafruit_NeoPixel strip = Adafruit_NeoPixel(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

double vReal[FFT_SIZE];
double vImag[FFT_SIZE];
ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, FFT_SIZE, samplingRate); // Updated sample rate

i2s_config_t i2s_config = {
  .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = samplingRate, // Increased sample rate
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

unsigned long previousMillis = 0;
const long interval = 10; // For other pieces of code that should run in intervals instead of fast as possible.

void setup() {
  strip.begin();
  strip.show();
  
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  i2s_start(I2S_NUM_0);

  Serial.begin(115200);
}

void loop() {
  unsigned long startMillis = millis(); // Start timing

  size_t bytesRead;
  int16_t buffer[FFT_SIZE];
  i2s_read(I2S_NUM_0, (void *)buffer, sizeof(buffer), &bytesRead, portMAX_DELAY);

  // Convert int16_t buffer to double for FFT
  for (int i = 0; i < FFT_SIZE; i++) {
    vReal[i] = (double)buffer[i];
    vImag[i] = 0.0;
  }

  // Perform FFT
  FFT.windowing(FFTWindow::Blackman_Nuttall, FFTDirection::Forward);
  FFT.compute(FFTDirection::Forward);
  FFT.complexToMagnitude();

  // Find the index with the maximum magnitude
  double maxMagnitude = 0;
  int maxIndex = 0;
  for (int i = 0; i < FFT_SIZE / 2; i++) {
    if (vReal[i] > maxMagnitude) {
      maxMagnitude = vReal[i];
      maxIndex = i;
    }
  }

  // Normalize frequency and amplitude
  float freq = (float)maxIndex * (samplingRate / FFT_SIZE); // Update sample rate here
  float amp = maxMagnitude / 6000.0; // Normalize amplitude

  // Print raw microphone data
  if(printRawMicData){
    for (int i = 0; i < FFT_SIZE; i++) {
      Serial.print(buffer[i]);
      Serial.print(" ");
    }
    Serial.println();
  }

  // Print values to Serial Monitor
  if(debug){
    Serial.print("Frequency: ");
    Serial.print(freq);
    Serial.print(" Hz, Amplitude: ");
    Serial.println(amp);
  }

  // Convert frequency to hue and amplitude to brightness
  int hue = map(freq, 0, 5000, 0, 255); // Adjust frequency range
  int brightness = map(amp, 0, 1, 0, 255); // Map amplitude to brightness
  if(brightness < 10)
    brightness = 10;

  // Print color values
  Serial.print("Hue: ");
  Serial.print(hue);
  Serial.print(", Brightness: ");
  Serial.println(brightness);

  // Update LED strip colors
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.ColorHSV(hue * 256, 255, brightness));
  }
  //strip.show();

  unsigned long endMillis = millis(); // End timing
  unsigned long loopDuration = endMillis - startMillis; // Calculate loop duration

  Serial.print("Loop Duration: ");
  Serial.print(loopDuration);
  Serial.println(" ms");

  // Wait for the next interval
  while (millis() - previousMillis < interval) {
    // Non-blocking wait
  }
  Serial.print("Free Heap: ");
  Serial.println(ESP.getFreeHeap());

  previousMillis = millis(); // Update previousMillis
}

