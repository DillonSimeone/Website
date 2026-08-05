#include <Arduino.h>
#include <Arduino.h> //FFT, and other basic stuff
#include <driver/i2s.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <Adafruit_Sensor.h> //Movement Sensor
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
#include <BLEMIDI_Transport.h> //Ble-Midi
#include <hardware/BLEMIDI_ESP32.h>

// Pin definitions for your microphone
#define I2S_SCK_PIN 6
#define I2S_WS_PIN  4
#define I2S_SD_PIN  16
#define I2S_SEL_PIN 17

// Pin definitions for the motors and LEDs
#define MOTOR1 5
#define MOTOR2 21
#define LED_PIN 7
#define NUM_PIXELS 21 //Prototype 1 has 49 pixels, prototype 2 and 3 has 21 pixels.

// Volume thresholds for motor and LED control
const int minVolume = 5;     // Minimum volume threshold
const int maxVolume = 1000;  // Maximum volume threshold

// Transition settings for LEDs
const int transitionSpeed = 1;  // Speed of LED transition (lower is slower)
int ledBrightness[NUM_PIXELS];  // Array to store current brightness of each LED
int targetBrightness[NUM_PIXELS];  // Array to store target brightness of each LED

// I2S configuration
i2s_config_t i2s_config = {
    .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 44100,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
};

// I2S pin configuration
i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,
    .ws_io_num = I2S_WS_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD_PIN
};

// Initialize the NeoPixel strip
Adafruit_NeoPixel strip = Adafruit_NeoPixel(NUM_PIXELS, LED_PIN, NEO_GRB + NEO_KHZ800);

//Initialize Bluetooth
BLEMIDI_CREATE_INSTANCE("GeLu2PrototypeMIDI", MIDI);

//Initialize movement sensor
uint16_t BNO055_SAMPLERATE_DELAY_MS = 100;
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

void setup() {
  // Initialize I2S with the specified configuration and pins
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);

  // Set SEL pin to LOW to configure the microphone
  pinMode(I2S_SEL_PIN, OUTPUT);
  digitalWrite(I2S_SEL_PIN, LOW);

  // Set motor pins as outputs
  pinMode(MOTOR1, OUTPUT);
  pinMode(MOTOR2, OUTPUT);

  // Initialize the NeoPixel strip
  strip.begin();
  strip.show();  // Initialize all pixels to 'off'

  // Initialize brightness arrays
  memset(ledBrightness, 0, sizeof(ledBrightness));
  memset(targetBrightness, 0, sizeof(targetBrightness));

  Serial.println("I2S and NeoPixel initialized successfully.");
}

void loop() {
  static unsigned long lastMicCheck = 0; //Static makes this to presistent across iterations.
  const unsigned long micCheckInterval = 10;  // Check microphone every 10ms

  if (millis() - lastMicCheck >= micCheckInterval) { //
    lastMicCheck = millis(); //Millis is always counting up across the loops from when the ESP32 started. 

    int16_t i2s_buffer[64];
    size_t bytes_read;

    // Read data from the microphone into the buffer
    i2s_read(I2S_NUM_0, (void *)i2s_buffer, sizeof(i2s_buffer), &bytes_read, portMAX_DELAY);

    // Get the first value from the buffer
    int16_t mic_value = i2s_buffer[0];
    Serial.println(mic_value);

    // If the mic_value is above minVolume, engage motors and LEDs with increasing intensity
    if (abs(mic_value) > minVolume) {
      int intensity = map(abs(mic_value), minVolume, maxVolume, 0, 255);  // Map mic_value to PWM range
      intensity = constrain(intensity, 0, 255);  // Ensure the intensity is within bounds

      analogWrite(MOTOR1, intensity);  // Set PWM value for motor 1
      analogWrite(MOTOR2, intensity);  // Set PWM value for motor 2

      // Calculate the number of LEDs to light up based on intensity
      int numLedsToLight = map(intensity, 0, 255, 0, NUM_PIXELS);

      // Update target brightness for each LED
      for (int i = 0; i < NUM_PIXELS; i++) {
        if (i < numLedsToLight) {
          targetBrightness[i] = random(100, 255);  // Set a random brightness for a rainbow effect
        } else {
          targetBrightness[i] = 0;  // Turn off remaining LEDs
        }
      }
    } else {
      // If the mic_value is below minVolume, turn off the motors and LEDs
      analogWrite(MOTOR1, 0);
      analogWrite(MOTOR2, 0);

      // Set all LEDs to turn off
      for (int i = 0; i < NUM_PIXELS; i++) {
        targetBrightness[i] = 0;
      }
    }

    // Adjust LED brightness towards target brightness
    for (int i = 0; i < NUM_PIXELS; i++) {
      if (ledBrightness[i] < targetBrightness[i]) {
        ledBrightness[i] += transitionSpeed;  // Increase brightness
        if (ledBrightness[i] > targetBrightness[i]) {
          ledBrightness[i] = targetBrightness[i];  // Cap at target brightness
        }
      } else if (ledBrightness[i] > targetBrightness[i]) {
        ledBrightness[i] -= transitionSpeed;  // Decrease brightness
        if (ledBrightness[i] < targetBrightness[i]) {
          ledBrightness[i] = targetBrightness[i];  // Cap at target brightness
        }
      }

      // Set the LED color based on the adjusted brightness
      uint32_t color = strip.Color(
        map(ledBrightness[i], 0, 255, 0, random(0, 255)),
        map(ledBrightness[i], 0, 255, 0, random(0, 255)),
        map(ledBrightness[i], 0, 255, 0, random(0, 255))
      );
      strip.setPixelColor(i, color);
    }
    strip.show();  // Update the LED strip with the new brightness values
  }
}

