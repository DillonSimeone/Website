#include <Arduino.h>
#include <FastLED.h>
#include <driver/i2s.h>
#include <arduinoFFT.h>

//I2S mic
#define CLOCK_PIN 13
#define MIC_WS_PIN 4
#define MIC_SEL_PIN 5
#define MIC_SCK_PIN 23
#define MIC_DO_PIN 22
#define SAMPLING_RATE 10000
#define FFT_SIZE 512
i2s_config_t i2s_config = {
  .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
  .sample_rate = SAMPLING_RATE,
  .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
  .channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT,
  .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S),
  .intr_alloc_flags = 0,
  .dma_buf_count = 6,
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

//Debug
#define PRINT_RAW_MIC_DATA 0
#define PRINT_FREQUENCY_DATA 1
#define PRINT_COLOR_VALUES 1

//FFT
double vReal[FFT_SIZE];
double vImag[FFT_SIZE];
ArduinoFFT<double> FFT(vReal, vImag, FFT_SIZE, SAMPLING_RATE);
int FFThue;
int FFTbrightness;
float freq; 
float amp;

//LEDs
#define DATA_PIN 6
#define NUM_LEDS 100
#define LED_PIN 6
#define COLOR_ORDER BRG
#define BRIGHTNESS 255
CRGB leds[NUM_LEDS];

//Animation
#define MAX_ACTIVE_PIXELS 100
struct ActivePixel {
  int position;
  int hue;
  int brightness;
  bool active;
};

ActivePixel activePixels[MAX_ACTIVE_PIXELS];

void initActivePixels() {
  for (int i = 0; i < MAX_ACTIVE_PIXELS; i++) {
    activePixels[i].active = false;
  }
}

void spawnPixel(int hue, int brightness) {
  for (int i = 0; i < MAX_ACTIVE_PIXELS; i++) {
    if (!activePixels[i].active) {
      activePixels[i].position = 0;
      activePixels[i].hue = hue;
      activePixels[i].brightness = brightness;
      activePixels[i].active = true;
      break;
    }
  }
}

void moveAndDespawnPixels() {
  for (int i = 0; i < MAX_ACTIVE_PIXELS; i++) {
    if (activePixels[i].active) {
      leds[activePixels[i].position].nscale8_video(2000000); // Smooth fade
      leds[activePixels[i].position] += CHSV(activePixels[i].hue, 255, activePixels[i].brightness);
      activePixels[i].position++;

      if (activePixels[i].position >= NUM_LEDS) {
        activePixels[i].active = false;
      }
    }
  }
}

void clearInactivePixels() {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
  }
}

void audioFFT() {
  size_t bytesRead;
  int16_t buffer[FFT_SIZE];
  i2s_read(I2S_NUM_0, (void *)buffer, sizeof(buffer), &bytesRead, portMAX_DELAY);

  for (int i = 0; i < FFT_SIZE; i++) {
    vReal[i] = (double)buffer[i];
    vImag[i] = 0.0;
  }

  FFT.windowing(FFTWindow::Blackman_Nuttall, FFTDirection::Forward);
  FFT.compute(FFTDirection::Forward);
  FFT.complexToMagnitude();

  double maxMagnitude = 0;
  int maxIndex = 0;
  for (int i = 0; i < FFT_SIZE / 2; i++) {
    if (vReal[i] > maxMagnitude) {
      maxMagnitude = vReal[i];
      maxIndex = i;
    }
  }

  freq = (float)maxIndex * (SAMPLING_RATE / FFT_SIZE);
  amp = maxMagnitude;

  FFThue = map(constrain(freq, 0, 1000), 0, 1000, 0, 255);
  float constrainedAmp = constrain(amp, 0.0, 4000000.0);
  FFTbrightness = map(constrainedAmp, 0, 4000000, 0, 255);  

  if (FFTbrightness > 30) {
    if (freq < 50) { // Seems to hovers around 19~ hz normally, with a bunch of random signals from there up to 50hz. Easier to just zero them out than to figure out why for now.
      return; 
    }else{

      if (PRINT_COLOR_VALUES) {
        Serial.print("FFTHue: ");
        Serial.print(FFThue);
        Serial.print(", Brightness: ");
        Serial.println(FFTbrightness);
      }

      if (PRINT_FREQUENCY_DATA) {
            Serial.print("Frequency: ");
            Serial.print(freq);
            Serial.print(" Hz, Amplitude: ");
            Serial.println(amp);
      }
      spawnPixel(FFThue, FFTbrightness);
    }
    
  }
}

void setup() { 
  Serial.begin(57600);
  Serial.println("resetting");

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  i2s_start(I2S_NUM_0);

  FastLED.addLeds<WS2812,DATA_PIN,COLOR_ORDER>(leds,NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);

  initActivePixels();
}

void loop() { 
  audioFFT();
  clearInactivePixels();
  moveAndDespawnPixels();
  FastLED.show();
}

