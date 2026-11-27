#include <Wire.h>
#include <Adafruit_NeoPixel.h>

// ====================================================================
// PROJECT 03: COMPACT DENSE SQUARE CONTROLLER HARDWARE PINOUT
// ====================================================================
#define PIN_MIC_ADC     0   // MAX4466 Analog Audio Input (ADC1_CH0)
#define PIN_I2C_SDA     2   // MPU-6050 Motion Sensor I2C Data
#define PIN_I2C_SCL     3   // MPU-6050 Motion Sensor I2C Clock
#define PIN_LED_MAIN    6   // Main Addressable LED Channel (WS2812B, 16 LEDs)
#define PIN_HAPTIC_PWM  7   // Haptic Vibration Motor AO3400A Driver (LEDC PWM)
#define PIN_LED_PWR_EN 10   // High-Side LED Power Isolation MOSFET Enable
#define PIN_LED_AUX2   20   // Aux Right LED Channel (WS2812B, 8 LEDs, RX)
#define PIN_LED_AUX3   21   // Aux Left LED Channel (WS2812B, 8 LEDs, TX)

#define MPU_ADDR        0x68
#define NUM_LEDS_MAIN   16
#define NUM_LEDS_AUX     8

// Addressable LED Strips
Adafruit_NeoPixel stripMain(NUM_LEDS_MAIN, PIN_LED_MAIN, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel stripAux2(NUM_LEDS_AUX, PIN_LED_AUX2, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel stripAux3(NUM_LEDS_AUX, PIN_LED_AUX3, NEO_GRB + NEO_KHZ800);

// Sensor Variables
int16_t ax, ay, az, gx, gy, gz;
float pitch = 0, roll = 0;
int audioLevel = 0;
uint16_t hueOffset = 0;

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n========================================================");
  Serial.println("  03: Compact Dense Square Audio/Motion Controller");
  Serial.println("  Hardware Emulation & Interactive Verification");
  Serial.println("========================================================\n");

  // 1. Activate High-Side LED Power MOSFET (Pin 10 HIGH pulls P-MOS Gate LOW)
  pinMode(PIN_LED_PWR_EN, OUTPUT);
  digitalWrite(PIN_LED_PWR_EN, HIGH);
  Serial.println("[Power] High-Side LED Isolation MOSFET enabled (Pin 10 HIGH).");

  // 2. Initialize Haptic PWM Driver (Pin 7)
  ledcAttach(PIN_HAPTIC_PWM, 5000, 8); // 5 kHz PWM, 8-bit resolution (0-255)
  triggerHapticPulse(180, 100); // Startup confirmation buzz
  Serial.println("[Haptic] Tactile motor PWM driver initialized on GPIO 7.");

  // 3. Initialize I2C Bus for MPU-6050 on GPIO 2 (SDA) and GPIO 3 (SCL)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // Power Management 1 register
  Wire.write(0x00); // Wake up MPU-6050 from sleep mode
  byte mpuStatus = Wire.endTransmission();
  if (mpuStatus == 0) {
    Serial.println("[IMU] MPU-6050 6-Axis Motion Sensor detected at 0x68 (SDA:2, SCL:3).");
  } else {
    Serial.print("[IMU WARNING] MPU-6050 not acknowledging at 0x68. Error code: ");
    Serial.println(mpuStatus);
  }

  // 4. Initialize All 3 Addressable LED Channels
  stripMain.begin();
  stripAux2.begin();
  stripAux3.begin();
  stripMain.show();
  stripAux2.show();
  stripAux3.show();
  Serial.println("[LEDs] Initialized 3 Addressable Channels (Main:G6, Aux2:G20, Aux3:G21).");
  Serial.println("[Audio] Analog Audio ADC listening on GPIO 0.");
  Serial.println("\nReady! Drag the MPU-6050 or Audio Potentiometer in Wokwi!\n");
}

void loop() {
  // Read Analog Microphone (Simulated via Potentiometer in Wokwi)
  int rawMic = analogRead(PIN_MIC_ADC); // 0 - 4095
  audioLevel = map(rawMic, 0, 4095, 0, 100);

  // Read MPU-6050 Motion Vectors
  readMPU6050();

  // Calculate Tilt (Pitch & Roll)
  float accelMagnitude = sqrt((float)ax * ax + (float)ay * ay + (float)az * az) / 16384.0;
  pitch = atan2(-ax, sqrt((float)ay * ay + (float)az * az)) * 180.0 / PI;
  roll  = atan2(ay, az) * 180.0 / PI;

  // Sound-Reactive Color Burst on Main Strip
  hueOffset += 300;
  for (int i = 0; i < NUM_LEDS_MAIN; i++) {
    uint32_t color;
    if (i < map(audioLevel, 0, 100, 0, NUM_LEDS_MAIN)) {
      // Audio beat active: bright reactive neon color
      uint16_t pixelHue = hueOffset + (i * 2000) + (int)(roll * 100);
      color = stripMain.ColorHSV(pixelHue, 255, 255);
    } else {
      // Idle ambient glow
      color = stripMain.ColorHSV(hueOffset + (i * 500), 200, 40);
    }
    stripMain.setPixelColor(i, color);
  }
  stripMain.show();

  // Motion-Reactive Aux Strips (Left & Right react to Pitch & Roll)
  uint32_t aux2Color = stripAux2.ColorHSV((uint16_t)(abs(pitch) * 300 + 10000), 255, map(audioLevel, 0, 100, 60, 255));
  uint32_t aux3Color = stripAux3.ColorHSV((uint16_t)(abs(roll) * 300 + 35000), 255, map(audioLevel, 0, 100, 60, 255));
  for (int i = 0; i < NUM_LEDS_AUX; i++) {
    stripAux2.setPixelColor(i, aux2Color);
    stripAux3.setPixelColor(i, aux3Color);
  }
  stripAux2.show();
  stripAux3.show();

  // Trigger Tactile Haptic Vibration on Sharp Motion Shake or Loud Bass Claps
  static unsigned long lastBuzz = 0;
  if ((accelMagnitude > 1.8 || audioLevel > 80) && (millis() - lastBuzz > 300)) {
    triggerHapticPulse(255, 70); // 70ms crisp vibration pulse
    lastBuzz = millis();
    Serial.printf("[Event] Haptic Feedback Fired! (Accel: %.2fg, Audio: %d%%)\n", accelMagnitude, audioLevel);
  }

  // Periodic Serial Telemetry
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 250) {
    lastPrint = millis();
    Serial.printf("Pitch: %6.1f° | Roll: %6.1f° | Accel: %4.2fg | Audio: %3d%% | G10_PWR: ON\n",
                  pitch, roll, accelMagnitude, audioLevel);
  }

  delay(20);
}

void readMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // Starting at ACCEL_XOUT_H
  if (Wire.endTransmission(false) == 0) {
    Wire.requestFrom((uint16_t)MPU_ADDR, (uint8_t)14, true);
    if (Wire.available() >= 14) {
      ax = Wire.read() << 8 | Wire.read();
      ay = Wire.read() << 8 | Wire.read();
      az = Wire.read() << 8 | Wire.read();
      Wire.read(); Wire.read(); // Skip temperature
      gx = Wire.read() << 8 | Wire.read();
      gy = Wire.read() << 8 | Wire.read();
      gz = Wire.read() << 8 | Wire.read();
    }
  }
}

void triggerHapticPulse(uint8_t intensity, uint16_t durationMs) {
  ledcWrite(PIN_HAPTIC_PWM, intensity);
  delay(durationMs);
  ledcWrite(PIN_HAPTIC_PWM, 0);
}
