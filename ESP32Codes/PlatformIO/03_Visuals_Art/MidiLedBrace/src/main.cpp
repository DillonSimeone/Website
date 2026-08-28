#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
#include <Adafruit_NeoPixel.h>
#include <driver/i2s.h>
#include <BLEMIDI_Transport.h>
#include <hardware/BLEMIDI_ESP32.h>
#include <arduinoFFT.h>

#define LED_PIN 7
int brightness = 0;
#define NUM_LEDS 49
Adafruit_NeoPixel strip = Adafruit_NeoPixel(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

#define MOTOR1 5
#define MOTOR2 21

#define I2S_SCK_PIN 6
#define I2S_WS_PIN 4
#define I2S_SD_PIN 16
#define I2S_SEL_PIN 17

// Volume thresholds for motor and LED control
const int minVolume = 50;    // Minimum volume threshold
const int maxVolume = 1000;  // Maximum volume threshold

// FFT constants
const uint16_t samples = 64;  // This value MUST ALWAYS be a power of 2
const double samplingFrequency = 5000;

// FFT buffers
double vReal[samples];
double vImag[samples];
ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, samples, samplingFrequency);

#define SCL_INDEX 0x00
#define SCL_TIME 0x01
#define SCL_FREQUENCY 0x02
#define SCL_PLOT 0x03

BLEMIDI_CREATE_INSTANCE("GeLu2PrototypeMIDI", MIDI);

uint16_t BNO055_SAMPLERATE_DELAY_MS = 100;
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

// Non-blocking timing variables
unsigned long lastMicCheck = 0;
const unsigned long micCheckInterval = 10;  // Check microphone every 10ms
unsigned long lastColorChange = 0;
const unsigned long colorChangeInterval = 10;  // Base interval for color change

// Color transition variables
uint32_t currentColor = strip.Color(0, 0, 255);   // Start with blue
uint32_t targetColor = strip.Color(255, 0, 255);  // End with purple
float colorTransitionProgress = 0.0;              // Progress of color transition
int colorTransitionSpeed = 5;                     // Transition speed (lower is faster, higher is slower)

// LED brightness transition variables
float targetBrightness = 0.0;   // Target brightness for LEDs
float currentBrightness = 0.0;  // Current brightness for LEDs

// Last sent MIDI values to handle Note Off logic
int lastMidiYaw = -1;
int lastMidiRoll = -1;

void setup() {
  Serial.begin(115200);
  strip.begin();
  strip.show();  // Initialize all pixels to 'off'
  pinMode(MOTOR1, OUTPUT);
  pinMode(MOTOR2, OUTPUT);

  // I2S setup
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

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,
    .ws_io_num = I2S_WS_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD_PIN
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);

  // Set SEL pin to LOW to configure the microphone
  pinMode(I2S_SEL_PIN, OUTPUT);
  digitalWrite(I2S_SEL_PIN, LOW);

  while (!Serial) delay(10);  // wait for serial port to open!

  if (!bno.begin()) {
    Serial.println("Ooops, no BNO055 detected ... Check your wiring or I2C ADDR!");
    while (1);
  }
  delay(1000);

  // Initialize Bluetooth MIDI
  MIDI.begin();
}

  float pitch = 0;
  float yaw = 0;
  float roll = 0;

void loop() {
  unsigned long currentMillis = millis();

  // Check if it's time to update microphone data
  if (currentMillis - lastMicCheck >= micCheckInterval) {
    lastMicCheck = currentMillis;

    sensors_event_t orientationData;
    bno.getEvent(&orientationData, Adafruit_BNO055::VECTOR_EULER);

    pitch = orientationData.orientation.x;
    yaw = orientationData.orientation.y;
    roll = orientationData.orientation.z;  // Halve the roll to make the arm movement more sensitive

    int midiRoll = map(roll, 0, 360, 0, 127);
    brightness = map(roll, 0, 360, 0, 255); //For leds

    int midiPitch = map(pitch, 0, 360, 0, 127);
    MIDI.sendControlChange(60, abs(midiPitch), 1);

    int midiYaw = map(yaw, 0, 360, 0, 127);

    // MIDI Note Off/On Logic for Yaw
    if (midiYaw != lastMidiYaw) {
      if (lastMidiYaw != -1) {
        MIDI.sendNoteOff(abs(lastMidiYaw), 0, 2); // Note Off for the last Yaw value
      }
      MIDI.sendNoteOn(abs(midiYaw), 100, 2); // Note On for new Yaw value
      lastMidiYaw = midiYaw; // Update lastMidiYaw
    }

    // MIDI Note Off/On Logic for Roll
    if (midiRoll != lastMidiRoll) {
      if (lastMidiRoll != -1) {
        MIDI.sendNoteOff(abs(lastMidiRoll), 0, 1); // Note Off for the last Roll value
      }
      MIDI.sendNoteOn(abs(midiRoll), 100, 1); // Note On for new Roll value
      lastMidiRoll = midiRoll; // Update lastMidiRoll
    }

    // Read the mic_value here
    int16_t i2s_buffer[64];
    size_t bytes_read;

    // Read data from the microphone into the buffer
    i2s_read(I2S_NUM_0, (void *)i2s_buffer, sizeof(i2s_buffer), &bytes_read, portMAX_DELAY);

    // Perform FFT on the mic data
    for (uint16_t i = 0; i < samples; i++) {
      vReal[i] = i2s_buffer[i];
      vImag[i] = 0.0;  // Imaginary part must be zeroed in case of looping
    }

    FFT.windowing(FFTWindow::Hamming, FFTDirection::Forward);  // Weigh data
    FFT.compute(FFTDirection::Forward);                        // Compute FFT
    FFT.complexToMagnitude();                                  // Compute magnitudes

    double peakFrequency = FFT.majorPeak();  // Get the frequency with the highest peak

    // Scale peak frequency to hue
    float hue = map(peakFrequency, 0, 5000, 0, 255);  // Scale frequency to hue range (0-255)
    hue = constrain(hue, 0, 255);                     // Ensure hue is within bounds

    // Convert hue to RGB
    uint32_t color = strip.ColorHSV(hue * 65536L / 255);  // Convert hue to RGB for LED strip

    // If the mic_value is above minVolume, engage motors and LEDs with increasing intensity
    int micValue = abs(i2s_buffer[0]);
    if (micValue > minVolume) {
      int intensity = map(micValue, minVolume, maxVolume, 0, 255);  // Map mic_value to PWM range
      intensity = constrain(intensity, 0, 255);                     // Ensure the intensity is within bounds

      // Control motors based on mic intensity, pitch, and yaw
      int motorFrequency1 = map(pitch, -180, 180, 0, 255);
      int motorFrequency2 = map(yaw, -180, 180, 0, 255);
      motorFrequency1 = constrain(motorFrequency1, 0, 255);
      motorFrequency2 = constrain(motorFrequency2, 0, 255);

      // Combine with mic intensity for overall motor control
      int combinedIntensity1 = constrain(motorFrequency1 + intensity, 0, 255);
      int combinedIntensity2 = constrain(motorFrequency2 + intensity, 0, 255);

      analogWrite(MOTOR1, combinedIntensity1);  // Control motor 1 with pitch and mic intensity
      analogWrite(MOTOR2, combinedIntensity2);  // Control motor 2 with yaw and mic intensity

      // Calculate the number of LEDs to light up based on intensity
      targetBrightness = map(intensity, 0, 255, 0, NUM_LEDS);
    } else {
      // Turn off motors if below threshold
      analogWrite(MOTOR1, 0);
      analogWrite(MOTOR2, 0);
      targetBrightness = 0;  // Turn off LEDs if intensity is below threshold
    }
  }

  // Handle LED color transitions
  if (currentMillis - lastColorChange >= colorChangeInterval) {
    lastColorChange = currentMillis;

    // Interpolate between current and target colors
    uint32_t newColor = strip.Color(
      (uint8_t)((targetColor >> 16 & 0xFF) * colorTransitionProgress + (currentColor >> 16 & 0xFF) * (1.0 - colorTransitionProgress)),
      (uint8_t)((targetColor >> 8 & 0xFF) * colorTransitionProgress + (currentColor >> 8 & 0xFF) * (1.0 - colorTransitionProgress)),
      (uint8_t)((targetColor & 0xFF) * colorTransitionProgress + (currentColor & 0xFF) * (1.0 - colorTransitionProgress)));

    // Update LED color and brightness
    for (int i = 0; i < strip.numPixels(); i++) {
      uint32_t colorToSet = strip.Color(
        (uint8_t)((newColor >> 16 & 0xFF) * currentBrightness / 255),
        (uint8_t)((newColor >> 8 & 0xFF) * currentBrightness / 255),
        (uint8_t)((newColor & 0xFF) * currentBrightness / 255));
      strip.setPixelColor(i, colorToSet);
    }
    strip.show();

    // Update color transition progress
    colorTransitionProgress += 1.0 / colorTransitionSpeed;  // Increment progress based on transition speed
    if (colorTransitionProgress >= 1.0) {
      colorTransitionProgress = 0.0;
      currentColor = targetColor;
      targetColor = (targetColor == strip.Color(255, 0, 255)) ? strip.Color(0, 0, 255) : strip.Color(255, 0, 255);  // Swap between two colors
    }
  }

  // Handle LED brightness transitions
  static unsigned long lastBrightnessUpdate = 0;
  const unsigned long brightnessUpdateInterval = 10;  // Update interval for LED brightness

  if (currentMillis - lastBrightnessUpdate >= brightnessUpdateInterval) {
    lastBrightnessUpdate = currentMillis;

    // Interpolate between current and target brightness
    currentBrightness += (targetBrightness - currentBrightness) / colorTransitionSpeed;
    if (abs(currentBrightness - targetBrightness) < 1) {
      currentBrightness = targetBrightness;
    }
  }
}

