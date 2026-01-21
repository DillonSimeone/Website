#include <Arduino.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <FastLED.h>

//--- Pin Definitions ---
#define LED_PIN 20
#define SCL_PIN 10
#define SDA_PIN 9
#define INT_PIN 5

//--- LED Strip Configuration ---
#define NUM_LEDS 144  // Define the number of LEDs in your strip
CRGB leds[NUM_LEDS];
int currentLedsLit = 0;

//--- MPU6050 Sensor Setup ---
Adafruit_MPU6050 mpu;

//--- Adjustable Variables ---
// Higher sensitivity = more pixels light up for less motion
float motionSensitivity = 10;
// Pixels to decay per second
float decayRate = 10.0; 
// Milliseconds between color changes
unsigned long colorChangeInterval = 1000;
// Threshold for motion magnitude. Under this value, no LEDs will light up.
float motionThreshold = 20; 

//--- Internal Variables ---
unsigned long lastColorChange = 0;
int hue = 0;
float targetLedsLit = 0.0;
unsigned long previousMillis = 0;

void setup() {
    Serial.begin(115200);

    // Initialize MPU6050
    Wire.begin(SDA_PIN, SCL_PIN);
    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip");
        while (1) {
            delay(10);
        }
    }
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    
    // Initialize FastLED strip
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.clear();
    FastLED.show();
}

void loop() {
    // Read sensor data
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Calculate motion magnitude from accelerometer data
    float motionMagnitude = sqrt(
        pow(a.acceleration.x, 2) + 
        pow(a.acceleration.y, 2) + 
        pow(a.acceleration.z, 2)
    );

    // Apply motion threshold
    if (motionMagnitude < motionThreshold) {
        targetLedsLit = 0;
    } else {
        // Map motion to a target number of LEDs
        targetLedsLit = constrain(motionMagnitude * motionSensitivity, 0, NUM_LEDS);
    }
    
    // Decay OR increase the number of lit LEDs
    unsigned long currentMillis = millis();
    float deltaTime = (currentMillis - previousMillis) / 1000.0; // seconds
    previousMillis = currentMillis;

    if (currentLedsLit > targetLedsLit) {
        // Decay logic
        currentLedsLit -= decayRate * deltaTime;
        if (currentLedsLit < targetLedsLit) {
            currentLedsLit = targetLedsLit;
        }
    } else if (currentLedsLit < targetLedsLit) {
        // Gradual increase logic
        currentLedsLit += (targetLedsLit - currentLedsLit) * 5 * deltaTime; // The `5` is an increase speed multiplier
        if (currentLedsLit > targetLedsLit) {
            currentLedsLit = targetLedsLit;
        }
    }

    if (currentLedsLit < 0) {
        currentLedsLit = 0;
    }

    // Change color over time
    if (currentMillis - lastColorChange >= colorChangeInterval) {
        lastColorChange = currentMillis;
        hue += 10;
        if (hue > 255) {
            hue = 0;
        }
    }

    // Update LED strip
    for (int i = 0; i < NUM_LEDS; i++) {
        if (i < currentLedsLit) {
            // Set pixel to a specific color and max brightness
            leds[i] = CHSV(hue, 255, 255); 
        } else {
            // Turn off the remaining pixels
            leds[i] = CRGB::Black;
        }
    }
    FastLED.show();

    // Print motion data for tuning only when above threshold
    if (motionMagnitude >= motionThreshold) {
        Serial.print("Accel X: "); Serial.print(a.acceleration.x);
        Serial.print(" | Y: "); Serial.print(a.acceleration.y);
        Serial.print(" | Z: "); Serial.print(a.acceleration.z);
        Serial.print(" | Motion Magnitude: "); Serial.print(motionMagnitude);
        Serial.print(" | Lit Pixels: "); Serial.println((int)currentLedsLit);
    }
    
    delay(10); // Small delay to prevent flooding the serial port
}