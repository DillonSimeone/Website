#include <Arduino.h>
#include <Wire.h>
#include <FastLED.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "MpuSensor.h"
#include "MotionAnalyzer.h"
#include "PatternEngine.h"
#include "DeviceConfig.h"
#include "BleServer.h"

#if defined(SENSOR_MPU6050) && defined(SENSOR_MPU6500)
#error "Define only one of SENSOR_MPU6050 or SENSOR_MPU6500."
#elif !defined(SENSOR_MPU6050) && !defined(SENSOR_MPU6500)
#error "Define SENSOR_MPU6050 or SENSOR_MPU6500 in build_flags."
#endif

#if defined(SENSOR_MPU6500)
constexpr SensorType ACTIVE_SENSOR = SensorType::MPU6500;
#else
constexpr SensorType ACTIVE_SENSOR = SensorType::MPU6050;
#endif

constexpr int SDA_PIN = 2;
constexpr int SCL_PIN = 3;
constexpr int INT_PIN = 5;
constexpr int GND_PIN = 4;
constexpr int MOTOR_PIN = 7;
constexpr int LED_PIN = 6;
constexpr int NUM_LEDS = 76;
constexpr unsigned long INACTIVITY_TIMEOUT_MS = 10000;

constexpr bool CHANNEL_HOPPING = true;
constexpr uint8_t FIXED_CHANNEL = 1;
constexpr uint8_t HOP_CHANNEL_MIN = 1;
constexpr uint8_t HOP_CHANNEL_MAX = 11;

MpuSensor mpu;
MotionAnalyzer motionAnalyzer;
PatternEngine patternEngine;
DeviceConfig deviceConfig;
BleServer bleServer;

CRGB leds[NUM_LEDS];

float energyLevel = 0.0f;
unsigned long lastUpdate = 0;
unsigned long lastMotionTime = 0;
uint8_t hue = 0;

uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint8_t espNowChannel = FIXED_CHANNEL;

void updateEnergy(float motionMag, float dt);
void updateLEDs();
void updateMotor(uint32_t nowMs);
void goToSleep();
void sendMotionEspNow();

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n--- LightBaton Reactive Handle ---");

    pinMode(GND_PIN, OUTPUT);
    digitalWrite(GND_PIN, LOW);
    delay(500);

    pinMode(MOTOR_PIN, OUTPUT);
    analogWrite(MOTOR_PIN, 0);

    Wire.begin(SDA_PIN, SCL_PIN);

    Serial.print("Finding IMU...");
    if (!mpu.begin(Wire, ACTIVE_SENSOR)) {
        Serial.println(" FAILED!");
        while (1) delay(500);
    }
    Serial.printf(" OK (%s)\n", mpu.sensorName());
    mpu.setMotionInterrupt(true);

    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(150);
    FastLED.clear();
    FastLED.show();

    deviceConfig.begin();
    DeviceState state;
    deviceConfig.load(state);
    patternEngine.setState(state);

    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    if (esp_now_init() != ESP_OK) {
        Serial.println("ESP-NOW init failed!");
    } else {
        esp_now_peer_info_t peerInfo = {};
        memcpy(peerInfo.peer_addr, broadcastAddress, 6);
        peerInfo.channel = 0;
        peerInfo.encrypt = false;

        if (esp_now_add_peer(&peerInfo) != ESP_OK) {
            Serial.println("ESP-NOW peer add failed!");
        } else {
            espNowChannel = CHANNEL_HOPPING ? HOP_CHANNEL_MIN : FIXED_CHANNEL;
            esp_wifi_set_channel(espNowChannel, WIFI_SECOND_CHAN_NONE);
            Serial.printf("ESP-NOW ready (%s)\n",
                          CHANNEL_HOPPING ? "channel hopping" : "fixed channel");
        }
    }

    if (!bleServer.begin(&patternEngine, &deviceConfig)) {
        Serial.println("BLE init failed!");
    }

    lastUpdate = millis();
    lastMotionTime = millis();
    Serial.println("--- Setup Complete ---\n");
}

void loop() {
    const unsigned long now = millis();
    const float dt = (now - lastUpdate) / 1000.0f;
    lastUpdate = now;

    MotionSample sample = {};
    mpu.readMotion(sample);
    motionAnalyzer.update(sample, dt);

    const float motionMag = motionAnalyzer.motionMagnitude();
    if (motionMag > 3.0f) {
        lastMotionTime = now;
    }
    if (now - lastMotionTime > INACTIVITY_TIMEOUT_MS) {
        goToSleep();
    }

    updateEnergy(motionMag, dt);
    updateLEDs();
    updateMotor(now);

    EVERY_N_MILLISECONDS(30) {
        sendMotionEspNow();
    }

    EVERY_N_MILLISECONDS(20) {
        hue++;
    }

    EVERY_N_MILLISECONDS(500) {
        const MotionFrame& frame = motionAnalyzer.frame();
        Serial.printf("Motion: %.2f | Energy: %.2f | X: %.2f Y: %.2f | BLE: %s\n",
                      motionMag, energyLevel, frame.speedX, frame.speedY,
                      bleServer.isConnected() ? "connected" : "advertising");
    }

    FastLED.show();
    delay(10);
}

void sendMotionEspNow() {
    if (CHANNEL_HOPPING) {
        esp_wifi_set_channel(espNowChannel, WIFI_SECOND_CHAN_NONE);
    }
    esp_now_send(broadcastAddress, reinterpret_cast<uint8_t*>(&energyLevel), sizeof(energyLevel));
    if (CHANNEL_HOPPING) {
        espNowChannel++;
        if (espNowChannel > HOP_CHANNEL_MAX) espNowChannel = HOP_CHANNEL_MIN;
    }
}

void updateEnergy(float motionMag, float dt) {
    const DeviceState& state = patternEngine.state();
    energyLevel += motionMag * state.chargeRate * dt;
    energyLevel -= state.decayRate * dt;
    if (energyLevel > 1.0f) energyLevel = 1.0f;
    if (energyLevel < 0.0f) energyLevel = 0.0f;
}

void updateLEDs() {
    const int ledsToLight = static_cast<int>(energyLevel * NUM_LEDS);
    for (int i = 0; i < NUM_LEDS; ++i) {
        if (i < ledsToLight) {
            leds[i] = CHSV(hue + (i * 2), 255, 255);
        } else {
            leds[i] = CRGB::Black;
        }
    }
}

void updateMotor(uint32_t nowMs) {
    const float duty = patternEngine.evaluateMotor(motionAnalyzer.frame(), energyLevel, nowMs);
    analogWrite(MOTOR_PIN, static_cast<int>(duty * 255.0f));
}

void goToSleep() {
    Serial.println("Entering Deep Sleep...");
    FastLED.clear();
    FastLED.show();
    analogWrite(MOTOR_PIN, 0);
    delay(100);

    gpio_hold_en(static_cast<gpio_num_t>(GND_PIN));
    gpio_deep_sleep_hold_en();
    esp_deep_sleep_enable_gpio_wakeup(1ULL << INT_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
    esp_deep_sleep_start();
}
