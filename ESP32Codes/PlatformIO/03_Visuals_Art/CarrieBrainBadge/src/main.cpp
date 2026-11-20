#include <Arduino.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <FastLED.h>

// --- Pin Definitions ---
#define MPU_SCL 2
#define MPU_SDA 3
#define MPU_INT 4
#define MOTOR_PWM 1
#define LED_DATA 0

// --- Configuration ---
#define NUM_LEDS 9
#define BRIGHTNESS 96
#define SLEEP_TIMEOUT_MS 10000

// Thresholds for visual stages
#define MOTION_THRESHOLD_X 5.0f  // Low motion starts here
#define MOTION_THRESHOLD_Y 20.0f // High motion peaks here

// Smoothing factors (Values closer to 1.0 are faster)
#define MOTION_DECAY 0.30f
#define HUE_DECAY 0.16f

// --- MPU-6050 Direct Register Access ---
// We bypass the Adafruit library for ALL interrupt config because
// the library's functions don't properly set DHPF, and its
// setMotionInterrupt() can overwrite our manual settings.
#define MPU_ADDR 0x68

void mpuWriteReg(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

uint8_t mpuReadReg(uint8_t reg) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, (uint8_t)1);
    return Wire.read();
}

// --- Global Objects ---
Adafruit_MPU6050 mpu; 
CRGB leds[NUM_LEDS];
float currentLeds = 0;
float currentHue = 0;
float currentBrightness = 0;
unsigned long lastMotionTime = 0;
unsigned long lastButtonPress = 0;
bool currentMode = 1; // 1 = Full Strip (Default), 0 = Bar Graph

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n--- CarrieBrainBadge Boot ---");
    
    // 1. Initialize Pins
    pinMode(MOTOR_PWM, OUTPUT);
    digitalWrite(MOTOR_PWM, HIGH); 
    pinMode(MPU_INT, INPUT_PULLUP);
    pinMode(9, INPUT_PULLUP); // BOOT button for mode toggle

    // 2. Initialize FastLED
    FastLED.addLeds<WS2812B, LED_DATA, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(BRIGHTNESS);

    // 3. Initialize I2C and MPU6050
    Wire.begin(MPU_SDA, MPU_SCL);
    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip");
        fill_solid(leds, NUM_LEDS, CRGB::Red);
        FastLED.show();
        delay(1000);
    }
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

    // 4. Configure motion interrupt via DIRECT REGISTER WRITES
    // Step 1: ACCEL_CONFIG (0x1C) - Enable 5Hz DHPF to filter gravity
    uint8_t accelCfg = mpuReadReg(0x1C);
    mpuWriteReg(0x1C, (accelCfg & 0xF8) | 0x01);

    // Step 2: MOT_THR (0x1F) - Motion threshold (LSB = 2mg)
    mpuWriteReg(0x1F, 15);

    // Step 3: MOT_DUR (0x20) - Duration in ms
    mpuWriteReg(0x20, 1);

    // Step 4: INT_PIN_CFG (0x37) - LATCH enabled
    mpuWriteReg(0x37, 0x20);

    // Step 5: INT_ENABLE (0x38) - Enable motion interrupt (bit 6)
    mpuWriteReg(0x38, 0x40);

    // Step 6: Clear any pending interrupt
    mpuReadReg(0x3A);
    delay(100);
    mpuReadReg(0x3A);

    Serial.printf("Pin 4 after config: %s (should be LOW = idle)\n", 
                  digitalRead(MPU_INT) == HIGH ? "HIGH" : "LOW");

    // 5. Wakeup on HIGH (motion triggers a latched HIGH on pin 4)
    esp_deep_sleep_enable_gpio_wakeup(1ULL << MPU_INT, ESP_GPIO_WAKEUP_GPIO_HIGH);

    lastMotionTime = millis();
    Serial.println("Setup complete!");
}

void enterDeepSleep() {
    Serial.println("Entering deep sleep...");
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    FastLED.show();
    digitalWrite(MOTOR_PWM, LOW);
    delay(100);

    // Clear interrupt latch so Pin 4 returns to LOW (idle)
    mpuReadReg(0x3A);
    delay(50);

    // Wait for Pin 4 to actually go LOW
    unsigned long timeout = millis();
    while (digitalRead(MPU_INT) == HIGH) {
        mpuReadReg(0x3A);
        delay(10);
        if (millis() - timeout > 2000) {
            Serial.println("WARNING: Pin 4 stuck HIGH");
            break;
        }
    }
    
    Serial.printf("Pin 4 before sleep: %s\n", 
                  digitalRead(MPU_INT) == HIGH ? "HIGH" : "LOW");
    Serial.flush();
    esp_deep_sleep_start();
}

void loop() {
    // Mode Toggle Check (BOOT Button - Pin 9)
    if (digitalRead(9) == LOW && (millis() - lastButtonPress > 400)) {
        currentMode = !currentMode;
        lastButtonPress = millis();
        Serial.printf("Switched to Mode: %s\n", currentMode ? "FULL STRIP" : "BAR GRAPH");
        // Flash white to confirm toggle
        fill_solid(leds, NUM_LEDS, CRGB::White);
        FastLED.show();
        delay(100);
    }

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // INT pin is Active HIGH + Latched. HIGH = motion was detected.
    bool intTriggered = (digitalRead(MPU_INT) == HIGH);
    if (intTriggered) {
        mpuReadReg(0x3A); // Clear the latch so pin returns to LOW
    }

    // Calculate motion magnitude (Accel + Gyro)
    float gyroMag = sqrt(pow(g.gyro.x, 2) + pow(g.gyro.y, 2) + pow(g.gyro.z, 2));
    float accelMag = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2)) - 9.81f; 
    float motionMag = gyroMag + abs(accelMag);

    // Reset sleep timer on significant motion OR hardware interrupt
    if (motionMag > 2.0f || intTriggered) {
        lastMotionTime = millis();
    }

    // --- Target Calculation ---
    float targetLeds = 0;
    float targetHue = 0;
    float targetBrightness = 0;

    if (motionMag > 0.6f) {
        targetLeds = map(min(motionMag, MOTION_THRESHOLD_Y), 0, MOTION_THRESHOLD_Y, 0, NUM_LEDS);
        targetHue = map(min(motionMag, MOTION_THRESHOLD_Y), 0, MOTION_THRESHOLD_Y, 0, 255);
        targetBrightness = map(min(motionMag, MOTION_THRESHOLD_Y), 0, MOTION_THRESHOLD_Y, 20, 255);
        if (targetLeds < 1.0f) targetLeds = 1.0f;
    }

    // --- Decay / Chase Logic ---
    currentLeds = (currentLeds * (1.0f - MOTION_DECAY)) + (targetLeds * MOTION_DECAY);
    currentHue = (currentHue * (1.0f - HUE_DECAY)) + (targetHue * HUE_DECAY);
    currentBrightness = (currentBrightness * (1.0f - MOTION_DECAY)) + (targetBrightness * MOTION_DECAY);
    
    if (currentLeds < 0.1f) currentLeds = 0;
    if (currentBrightness < 2.0f) currentBrightness = 0;

    // --- Rendering ---
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    
    if (currentMode == 1) {
        // Mode 1: Full Strip Intensity/Color Mapping
        fill_solid(leds, NUM_LEDS, CHSV((uint8_t)currentHue, 255, (uint8_t)currentBrightness));
    } 
    else {
        // Mode 0: Bar Graph Mode
        int litCount = (int)ceil(currentLeds);
        for(int i = 0; i < litCount; i++) {
            uint8_t pb = 255;
            if (i == litCount - 1) pb = (uint8_t)((currentLeds - (float)i) * 255.0f);
            leds[i] = CHSV((uint8_t)currentHue + (i * 8), 255, pb);
        }
    }
    
    FastLED.show();
    delay(10); 

    // Check for sleep timeout
    if (millis() - lastMotionTime > SLEEP_TIMEOUT_MS) {
        enterDeepSleep();
    }
}
