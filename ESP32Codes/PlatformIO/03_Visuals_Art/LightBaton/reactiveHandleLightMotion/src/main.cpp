#include <Arduino.h>
#include <Wire.h>
#include <FastLED.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

//--- Pin Definitions ---
#define SDA_PIN 2
#define SCL_PIN 3
#define INT_PIN 5
#define GND_PIN 4      // Soft Ground
#define MOTOR_PIN 7
#define LED_PIN 6

//--- Configuration ---
#define NUM_LEDS 76    // Approx 4 feet @ 60 LEDs/m
#define INACTIVITY_TIMEOUT_MS 10000

// ESP-NOW: when true, rotate through Wi-Fi channels 1–11 so receivers on any
// channel (AP mode or home router) can hear motion packets. See ESP-NOW.md.
constexpr bool CHANNEL_HOPPING = true;
constexpr uint8_t FIXED_CHANNEL = 1;       // used when CHANNEL_HOPPING is false
constexpr uint8_t HOP_CHANNEL_MIN = 1;
constexpr uint8_t HOP_CHANNEL_MAX = 11;

#if defined(SENSOR_MPU6050) && defined(SENSOR_MPU6500)
#error "Define only one of SENSOR_MPU6050 or SENSOR_MPU6500."
#elif !defined(SENSOR_MPU6050) && !defined(SENSOR_MPU6500)
#error "Define SENSOR_MPU6050 or SENSOR_MPU6500 in build_flags."
#endif

enum class SensorType : uint8_t {
    MPU6050,
    MPU6500
};

#if defined(SENSOR_MPU6500)
constexpr SensorType ACTIVE_SENSOR = SensorType::MPU6500;
#else
constexpr SensorType ACTIVE_SENSOR = SensorType::MPU6050;
#endif

struct MotionSample {
    float accelX;
    float accelY;
    float accelZ;
    float gyroX;
    float gyroY;
    float gyroZ;
};

class MpuSensor {
public:
    bool begin(TwoWire& wire, SensorType sensorType) {
        wire_ = &wire;
        sensorType_ = sensorType;
        address_ = kDefaultAddressLow;

        if (!detectAndConfigure()) {
            address_ = kDefaultAddressHigh;
            if (!detectAndConfigure()) {
                return false;
            }
        }
        return true;
    }

    bool readMotion(MotionSample& sample) {
        uint8_t raw[14];
        if (!readRegisters(kRegAccelXoutH, raw, sizeof(raw))) {
            return false;
        }

        const int16_t ax = (static_cast<int16_t>(raw[0]) << 8) | raw[1];
        const int16_t ay = (static_cast<int16_t>(raw[2]) << 8) | raw[3];
        const int16_t az = (static_cast<int16_t>(raw[4]) << 8) | raw[5];
        const int16_t gx = (static_cast<int16_t>(raw[8]) << 8) | raw[9];
        const int16_t gy = (static_cast<int16_t>(raw[10]) << 8) | raw[11];
        const int16_t gz = (static_cast<int16_t>(raw[12]) << 8) | raw[13];

        // Fixed to +/-8g and +/-500 dps to match previous behavior.
        constexpr float accelScale = 9.80665f / 4096.0f;                      // m/s^2 per LSB
        constexpr float gyroScale = (PI / 180.0f) / 65.5f;                    // rad/s per LSB
        sample.accelX = ax * accelScale;
        sample.accelY = ay * accelScale;
        sample.accelZ = az * accelScale;
        sample.gyroX = gx * gyroScale;
        sample.gyroY = gy * gyroScale;
        sample.gyroZ = gz * gyroScale;
        return true;
    }

    void setMotionInterrupt(bool enabled) {
        if (enabled) {
            // Conservative thresholds so deep-sleep wake remains reliable.
            writeRegister(kRegMotThr, 10);
            writeRegister(kRegMotDur, 1);
            writeRegister(kRegIntEnable, 0x40); // MOT_INT_EN bit
        } else {
            writeRegister(kRegIntEnable, 0x00);
        }
    }

    const char* sensorName() const {
        return sensorType_ == SensorType::MPU6500 ? "MPU6500" : "MPU6050";
    }

private:
    static constexpr uint8_t kDefaultAddressLow = 0x68;
    static constexpr uint8_t kDefaultAddressHigh = 0x69;
    static constexpr uint8_t kRegSmplrtDiv = 0x19;
    static constexpr uint8_t kRegConfig = 0x1A;
    static constexpr uint8_t kRegGyroConfig = 0x1B;
    static constexpr uint8_t kRegAccelConfig = 0x1C;
    static constexpr uint8_t kRegAccelConfig2 = 0x1D;
    static constexpr uint8_t kRegMotThr = 0x1F;
    static constexpr uint8_t kRegMotDur = 0x20;
    static constexpr uint8_t kRegIntEnable = 0x38;
    static constexpr uint8_t kRegAccelXoutH = 0x3B;
    static constexpr uint8_t kRegPwrMgmt1 = 0x6B;
    static constexpr uint8_t kRegWhoAmI = 0x75;

    bool detectAndConfigure() {
        uint8_t whoAmI = 0;
        if (!readRegister(kRegWhoAmI, whoAmI)) {
            return false;
        }

        if (!isExpectedWhoAmI(whoAmI)) {
            return false;
        }

        delay(10);
        if (!writeRegister(kRegPwrMgmt1, 0x00)) return false;     // wake up
        delay(50);
        if (!writeRegister(kRegSmplrtDiv, 0x07)) return false;    // ~125 Hz
        if (!writeRegister(kRegConfig, 0x04)) return false;       // DLPF ~20 Hz
        if (!writeRegister(kRegGyroConfig, 0x08)) return false;   // +/-500 dps
        if (!writeRegister(kRegAccelConfig, 0x10)) return false;  // +/-8g
        if (!writeRegister(kRegAccelConfig2, 0x04)) return false; // accel DLPF

        return true;
    }

    bool isExpectedWhoAmI(uint8_t whoAmI) const {
        if (sensorType_ == SensorType::MPU6050) {
            return whoAmI == 0x68 || whoAmI == 0x69;
        }
        return whoAmI == 0x70 || whoAmI == 0x71;
    }

    bool writeRegister(uint8_t reg, uint8_t value) {
        wire_->beginTransmission(address_);
        wire_->write(reg);
        wire_->write(value);
        return wire_->endTransmission() == 0;
    }

    bool readRegister(uint8_t reg, uint8_t& value) {
        if (!readRegisters(reg, &value, 1)) {
            return false;
        }
        return true;
    }

    bool readRegisters(uint8_t reg, uint8_t* data, uint8_t length) {
        wire_->beginTransmission(address_);
        wire_->write(reg);
        if (wire_->endTransmission(false) != 0) {
            return false;
        }
        if (wire_->requestFrom(static_cast<int>(address_), static_cast<int>(length)) != length) {
            return false;
        }
        for (uint8_t i = 0; i < length; ++i) {
            data[i] = wire_->read();
        }
        return true;
    }

    TwoWire* wire_ = nullptr;
    SensorType sensorType_ = SensorType::MPU6050;
    uint8_t address_ = kDefaultAddressLow;
};

//--- Global Variables ---
MpuSensor mpu;
CRGB leds[NUM_LEDS];

float energyLevel = 0.0;
float chargeRate = 0.1;    // Adjust this for "charging speed"
float decayRate = 0.6;     // Energy lost per second
unsigned long lastUpdate = 0;
unsigned long lastMotionTime = 0;
uint8_t hue = 0;

// ESP-NOW Broadcast Setup
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint8_t espNowChannel = FIXED_CHANNEL;

//--- Function Prototypes ---
void updateEnergy(float motionMag, float dt);
void updateLEDs();
void updateMotor(float dt);
void goToSleep();
void sendMotionEspNow();

void setup() {
    Serial.begin(115200);
    delay(1000); // Give serial monitor time to connect
    Serial.println("\n--- Reactive Handle Debug Start ---");

    // Initialize Soft Ground
    Serial.println("Initializing Soft Ground (Pin 4)...");
    pinMode(GND_PIN, OUTPUT);
    digitalWrite(GND_PIN, LOW);
    delay(500); // Give IMU time to power up after grounding

    // Initialize Motor
    Serial.println("Initializing Motor (Pin 6)...");
    pinMode(MOTOR_PIN, OUTPUT);
    analogWrite(MOTOR_PIN, 0);

    // Initialize I2C
    Serial.println("Initializing I2C (SDA:2, SCL:3)...");
    Wire.begin(SDA_PIN, SCL_PIN);

    // Initialize selected IMU type (MPU6050 or MPU6500).
    Serial.print("Finding ");
    Serial.print(ACTIVE_SENSOR == SensorType::MPU6500 ? "MPU6500" : "MPU6050");
    Serial.print("...");
    if (!mpu.begin(Wire, ACTIVE_SENSOR)) {
        Serial.println(" FAILED!");
        Serial.println("Check wiring: VCC/GND, SDA(2), SCL(3). Is ground pin 4 low?");
        while (1) { 
            delay(500); 
            Serial.print(".");
        }
    }
    Serial.println(" FOUND!");
    Serial.print("Detected sensor: ");
    Serial.println(mpu.sensorName());

    // Configure IMU motion interrupt for sleep wake-up.
    Serial.print("Configuring ");
    Serial.print(mpu.sensorName());
    Serial.println(" interrupt...");
    mpu.setMotionInterrupt(true);

    // Initialize LEDs
    Serial.println("Initializing FastLED (Pin 7)...");
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    FastLED.setBrightness(150);
    FastLED.clear();
    FastLED.show();

    // Initialize WiFi in STA mode for ESP-NOW
    Serial.println("Initializing WiFi for ESP-NOW...");
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    // Initialize ESP-NOW
    Serial.println("Initializing ESP-NOW...");
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW!");
    } else {
        // Register peer
        esp_now_peer_info_t peerInfo;
        memset(&peerInfo, 0, sizeof(peerInfo));
        memcpy(peerInfo.peer_addr, broadcastAddress, 6);
        peerInfo.channel = 0; // Same channel
        peerInfo.encrypt = false;
        
        if (esp_now_add_peer(&peerInfo) != ESP_OK) {
            Serial.println("Failed to add peer!");
        } else {
            if (CHANNEL_HOPPING) {
                espNowChannel = HOP_CHANNEL_MIN;
                esp_wifi_set_channel(espNowChannel, WIFI_SECOND_CHAN_NONE);
                Serial.printf("ESP-NOW: channel hopping ON (channels %u–%u)\n",
                              HOP_CHANNEL_MIN, HOP_CHANNEL_MAX);
            } else {
                espNowChannel = FIXED_CHANNEL;
                esp_wifi_set_channel(espNowChannel, WIFI_SECOND_CHAN_NONE);
                Serial.printf("ESP-NOW: fixed channel %u\n", espNowChannel);
            }
            Serial.println("ESP-NOW broadcast peer added.");
        }
    }

    lastUpdate = millis();
    lastMotionTime = millis();
    Serial.println("--- Setup Complete ---\n");
}

void loop() {
    unsigned long now = millis();
    float dt = (now - lastUpdate) / 1000.0;
    lastUpdate = now;

    MotionSample motion;
    if (!mpu.readMotion(motion)) {
        // Serial.println("Event read failed!"); // Too noisy
    }

    // Calculate motion magnitude (Gyro + Accel)
    float gyroMag = sqrt(pow(motion.gyroX, 2) + pow(motion.gyroY, 2) + pow(motion.gyroZ, 2));
    float accelMag = sqrt(pow(motion.accelX, 2) + pow(motion.accelY, 2) + pow(motion.accelZ, 2)) - 9.81; 
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

    EVERY_N_MILLISECONDS(30) {
        sendMotionEspNow();
    }

    EVERY_N_MILLISECONDS(20) {
        hue++;
    }

    EVERY_N_MILLISECONDS(500) {
        Serial.print("Motion: "); Serial.print(motionMag);
        Serial.print(" | Energy: "); Serial.print(energyLevel);
        if (CHANNEL_HOPPING) {
            Serial.print(" | ESP-NOW ch: "); Serial.print(espNowChannel);
        }
        Serial.print(" | Timeout In: "); Serial.print((INACTIVITY_TIMEOUT_MS - (now - lastMotionTime)) / 1000.0);
        Serial.println("s");
    }

    FastLED.show();
    delay(10); 
}

void sendMotionEspNow() {
    if (CHANNEL_HOPPING) {
        esp_wifi_set_channel(espNowChannel, WIFI_SECOND_CHAN_NONE);
    }
    esp_now_send(broadcastAddress, (uint8_t*)&energyLevel, sizeof(energyLevel));
    if (CHANNEL_HOPPING) {
        espNowChannel++;
        if (espNowChannel > HOP_CHANNEL_MAX) espNowChannel = HOP_CHANNEL_MIN;
    }
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

    // Configure wakeup from Pin 5 (MPU interrupt).
    // MPU6050/MPU6500 breakout boards commonly drive motion INT active-low.
    esp_deep_sleep_enable_gpio_wakeup(1ULL << INT_PIN, ESP_GPIO_WAKEUP_GPIO_LOW);
    
    esp_deep_sleep_start();
}
