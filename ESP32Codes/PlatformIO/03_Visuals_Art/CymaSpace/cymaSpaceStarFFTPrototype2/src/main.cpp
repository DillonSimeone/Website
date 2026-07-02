#include <Arduino.h>
#include <FastLED.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>


// For led chips like Neopixels, which have a data line, ground, and power, you just
// need to define DATA_PIN.  For led chipsets that are SPI based (four wires - data, clock,
// ground, and power), like the LPD8806, define both DATA_PIN and CLOCK_PIN
#define DATA_PIN 6
#define CLOCK_PIN 13

// Pin definitions for I2S microphone
#define MIC_WS_PIN 4
#define MIC_SEL_PIN 5
#define MIC_SCK_PIN 23
#define MIC_DO_PIN 22

// LED setup
#define NUM_LEDS 300
#define LED_PIN 6
#define COLOR_ORDER  GRB
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

int FFThue;
int FFTbrightness;
float freq; 
float amp;

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
  freq = (float)maxIndex * (SAMPLING_RATE / FFT_SIZE);
  amp = maxMagnitude / 10000.0;

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
  FFThue = map(freq, 0, 2500, 0, 255);
  float constrainedAmp = constrain(amp, 0.0, 1.0);
  FFTbrightness = map(constrainedAmp * 100, 0, 100, 0, 255);  // Scale amp to 0 E00 before mapping

  // Debug: Print color values
  if (PRINT_COLOR_VALUES) {
    Serial.print("FFTHue: ");
    Serial.print(FFThue);
    Serial.print(", Brightness: ");
    Serial.println(FFTbrightness);
  }
}


// Define the array of leds
CRGB leds[NUM_LEDS];



void setup() { 
	Serial.begin(57600);
	Serial.println("resetting");

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  i2s_start(I2S_NUM_0);

	FastLED.addLeds<WS2812,DATA_PIN,COLOR_ORDER>(leds,NUM_LEDS);
	FastLED.setBrightness(50);
}

void fadeall() { for(int i = 0; i < NUM_LEDS; i++) { leds[i].nscale8(250); } }

int animate = 1;
void loop() { 
  audioFFT();
  if(FFTbrightness > 100){
    Serial.print("Shrek");
    static uint8_t hue = FFThue;

    
    fill_solid(leds, NUM_LEDS, CHSV(FFThue, 255, 255));
    FastLED.show();
  }else{
    Serial.print("Not Shrek");
    fadeToBlackBy(leds, NUM_LEDS, 20);
    FastLED.show();
    delay(1);
  }
}

