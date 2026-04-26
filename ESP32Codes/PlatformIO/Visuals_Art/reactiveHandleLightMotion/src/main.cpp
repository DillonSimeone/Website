#include <Arduino.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <FastLED.h>

//--- Pin Definitions ---
#define SDA_PIN 2
#define SCL_PIN 3
#define INT_PIN 5
#define GND_PIN 4      // Soft Ground
#define MOTOR_PIN 7
#define LED_PIN 6

//--- Configuration ---
#define NUM_LEDS 74    // Approx 4 feet @ 60 LEDs/m
#define INACTIVITY_TIMEOUT_MS 10000 

//--- Global Variables ---
Adafruit_MPU6050 mpu;
CRGB leds[NUM_LEDS];

float energyLevel = 0.0;
float chargeRate = 0.1;    // Adjust this for "charging speed"
float decayRate = 0.6;     // Energy lost per second
unsigned long lastUpdate = 0;
unsigned long lastMotionTime = 0;
uint8_t hue = 0;

// Motor Pattern Variables
unsigned long motorTimer = 0;
int motorState = 0;

//--- Function Prototypes ---
void updateEnergy(float motionMag, float dt);
void updateLEDs();
void updateMotor(float dt);
void goToSleep();

void setup() {
    Serial.begin(115200);
    delay(1000); // Give serial monitor time to connect
    Serial.println("\n--- Reactive Handle Debug Start ---");

    // Initialize Soft Ground
    Serial.println("Initializing Soft Ground (Pin 4)...");
    pinMode(GND_PIN, OUTPUT);
    digitalWrite(GND_PIN, LOW);
    delay(500); // Give MPU6050 time to power up after grounding

    // Initialize Motor
    Serial.println("Initializing Motor (Pin 6)...");
    pinMode(MOTOR_PIN, OUTPUT);
    analogWrite(MOTOR_PIN, 0);

    // Initialize I2C
    Serial.println("Initializing I2C (SDA:2, SCL:3)...");
    Wire.begin(SDA_PIN, SCL_PIN);

    // Initialize MPU6050
    Serial.print("Finding MPU6050...");
    if (!mpu.begin()) {
        Serial.println(" FAILED!");
        Serial.println("Check wiring: VCC/GND, SDA(2), SCL(3). Is the ground pin 4 low?");
        while (1) { 
            // Blink onboard LED or something? 
            delay(500); 
            Serial.print(".");
        }
    }
    Serial.println(" FOUND!");

    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

    // Configure MPU6050 Interrupt
    Serial.println("Configuring MPU6050 Interrupt...");
    mpu.setMotionInterrupt(true);

    // Initialize LEDs
    Serial.println("Initializing FastLED (Pin 7)...");
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(150);
    FastLED.clear();
    FastLED.show();

    lastUpdate = millis();
    lastMotionTime = millis();
    Serial.println("--- Setup Complete ---\n");
}

void loop() {
    unsigned long now = millis();
    float dt = (now - lastUpdate) / 1000.0;
    lastUpdate = now;

    sensors_event_t a, g, temp;
    if (!mpu.getEvent(&a, &g, &temp)) {
        // Serial.println("Event read failed!"); // Too noisy
    }

    // Calculate motion magnitude (Gyro + Accel)
    float gyroMag = sqrt(pow(g.gyro.x, 2) + pow(g.gyro.y, 2) + pow(g.gyro.z, 2));
    float accelMag = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2)) - 9.81; 
    float motionMag = gyroMag + abs(accelMag);

    // Reset inactivity timer if there is significant motion (Deadzone: 3.0)
    if (motionMag > 3.0) {
        lastMotionTime = now;
    }

    // Check for Sleep
    if (now - lastMotionTime > INACTIVITY_TIMEOUT_MS) {
        goToSleep();
    }

    // Update Energy System
    updateEnergy(motionMag, dt);

    // Update Visuals and Haptics
    updateLEDs();
    updateMotor(dt);

    EVERY_N_MILLISECONDS(20) {
        hue++;
    }

    EVERY_N_MILLISECONDS(500) {
        Serial.print("Motion: "); Serial.print(motionMag);
        Serial.print(" | Energy: "); Serial.print(energyLevel);
        Serial.print(" | Timeout In: "); Serial.print((INACTIVITY_TIMEOUT_MS - (now - lastMotionTime)) / 1000.0);
        Serial.println("s");
    }

    FastLED.show();
    delay(10); 
}

void updateEnergy(float motionMag, float dt) {
    // Charge based on motion
    energyLevel += motionMag * chargeRate * dt;
    
    // Dissipate over time
    energyLevel -= decayRate * dt;

    // Clamp
    if (energyLevel > 1.0) energyLevel = 1.0;
    if (energyLevel < 0.0) energyLevel = 0.0;
}

void updateLEDs() {
    int ledsToLight = (int)(energyLevel * NUM_LEDS);
    
    for (int i = 0; i < NUM_LEDS; i++) {
        if (i < ledsToLight) {
            leds[i] = CHSV(hue + (i * 2), 255, 255);
        } else {
            leds[i] = CRGB::Black;
        }
    }
}

void updateMotor(float dt) {
    unsigned long now = millis();
    
    if (energyLevel < 0.05) {
        analogWrite(MOTOR_PIN, 0);
        return;
    }

    // Pattern state machine
    if (energyLevel < 0.3) {
        // --- Low Energy: Heartbeat ---
        // Cycle: 1500ms (On 100, Off 200, On 100, Off 1100)
        unsigned long cycle = now % 1500;
        if (cycle < 100 || (cycle > 300 && cycle < 400)) {
            analogWrite(MOTOR_PIN, 180);
        } else {
            analogWrite(MOTOR_PIN, 0);
        }
    } 
    else if (energyLevel < 0.7) {
        // --- Medium Energy: Gallop ---
        // Cycle: 600ms (On 80, Off 80, On 80, Off 360)
        unsigned long cycle = now % 600;
        if (cycle < 80 || (cycle > 160 && cycle < 240)) {
            analogWrite(MOTOR_PIN, 220);
        } else {
            analogWrite(MOTOR_PIN, 0);
        }
    } 
    else {
        // --- High Energy: Shimmer/Buzz ---
        // Fast intensity modulation
        int shimmer = 200 + (sin(now / 15.0) * 55);
        analogWrite(MOTOR_PIN, shimmer);
    }
}

void goToSleep() {
    Serial.println("Entering Deep Sleep...");
    FastLED.clear();
    FastLED.show();
    analogWrite(MOTOR_PIN, 0);
    delay(100);

    // Ensure the Soft Ground pin stays LOW during sleep
    gpio_hold_en((gpio_num_t)GND_PIN);
    gpio_deep_sleep_hold_en();

    // Configure wakeup from Pin 5 (MPU6050 INT)
    // Most MPU6050 interrupts are ACTIVE LOW
    esp_deep_sleep_enable_gpio_wakeup(1ULL << INT_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
    
    esp_deep_sleep_start();
}
