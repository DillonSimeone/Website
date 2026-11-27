/**
 * The Haptic Petting Zoo — Swamp Biome BLE Controller
 * 
 * Hardware:
 *   - Microcontroller: ESP32-C3 SuperMini
 *   - Motor Driver: L298N Mini Dual H-Bridge Module (24x22x8mm)
 *   - Actuators: 3x 5V Coin Vibration Motors (10mm / 12mm)
 * 
 * Pinout:
 *   - GPIO 0: Alligator Motor PWM (L298N IN1)
 *   - GPIO 1: Fish Motor PWM      (L298N IN2)
 *   - GPIO 2: Turtle Motor PWM    (L298N IN3)
 *   - GPIO 8: Built-in Blue LED   (Active LOW on SuperMini)
 * 
 * Web Bluetooth Protocol:
 *   - Service UUID:        4fafc201-1fb5-459e-8fcc-c5c9c331914b
 *   - Characteristic UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8
 * 
 * Command Packet (4 Bytes):
 *   [0]: Channel (0=Alligator, 1=Fish, 2=Turtle, 255=All)
 *   [1]: Mode    (0=Intensity, 1=Burst, 2=Heartbeat, 3=Flutter, 4=Stop)
 *   [2]: Value   (0-255 intensity or speed)
 *   [3]: Param   (Duration ms / 10, or period)
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Pin Definitions
static const int PIN_MOTOR_GATOR  = 0;
static const int PIN_MOTOR_FISH   = 1;
static const int PIN_MOTOR_TURTLE = 2;
static const int PIN_LED_STATUS   = 8;

// PWM Channels & Parameters
static const int CH_GATOR   = 0;
static const int CH_FISH    = 1;
static const int CH_TURTLE  = 2;
static const int PWM_FREQ   = 5000; // 5 kHz smooth silent PWM
static const int PWM_RES    = 8;    // 8-bit (0-255)

// State structures
struct CreatureState {
    uint8_t mode;       // 0=manual, 1=burst, 2=heartbeat, 3=flutter
    uint8_t targetPwm;  // Target PWM
    uint8_t currentPwm; // Current applied PWM
    uint32_t timer;     // Millis timer for effects
    uint16_t duration;  // Effect duration
    uint8_t phase;      // Pattern phase tracker
};

static CreatureState stateGator  = {0, 0, 0, 0, 0, 0};
static CreatureState stateFish   = {0, 0, 0, 0, 0, 0};
static CreatureState stateTurtle = {0, 0, 0, 0, 0, 0};

static BLEServer* pServer = nullptr;
static BLECharacteristic* pCharacteristic = nullptr;
static bool deviceConnected = false;
static bool oldDeviceConnected = false;

// Forward Declarations
void setMotorPWM(int channel, uint8_t duty);
void updateCreature(int channel, CreatureState &state);

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
        deviceConnected = true;
        digitalWrite(PIN_LED_STATUS, LOW); // LED ON
        Serial.println("[BLE] Web client connected!");
    }

    void onDisconnect(BLEServer* pServer) override {
        deviceConnected = false;
        digitalWrite(PIN_LED_STATUS, HIGH); // LED OFF
        // Failsafe: silence all motors
        setMotorPWM(CH_GATOR, 0);
        setMotorPWM(CH_FISH, 0);
        setMotorPWM(CH_TURTLE, 0);
        stateGator.mode = stateFish.mode = stateTurtle.mode = 0;
        Serial.println("[BLE] Client disconnected. Motors silenced.");
    }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pChar) override {
        std::string rxValue = pChar->getValue();
        if (rxValue.length() >= 3) {
            uint8_t channel = (uint8_t)rxValue[0];
            uint8_t mode    = (uint8_t)rxValue[1];
            uint8_t val     = (uint8_t)rxValue[2];
            uint8_t param   = (rxValue.length() >= 4) ? (uint8_t)rxValue[3] : 50;

            Serial.printf("[CMD] Ch:%d Mode:%d Val:%d Param:%d\n", channel, mode, val, param);

            auto applyCmd = [&](int ch, CreatureState &s) {
                s.mode = mode;
                s.targetPwm = val;
                s.duration = param * 10;
                s.timer = millis();
                s.phase = 0;

                if (mode == 0) { // Direct intensity
                    setMotorPWM(ch, val);
                } else if (mode == 4) { // Stop
                    s.mode = 0;
                    s.targetPwm = 0;
                    setMotorPWM(ch, 0);
                }
            };

            if (channel == 0 || channel == 255) applyCmd(CH_GATOR, stateGator);
            if (channel == 1 || channel == 255) applyCmd(CH_FISH, stateFish);
            if (channel == 2 || channel == 255) applyCmd(CH_TURTLE, stateTurtle);
        }
    }
};

void setMotorPWM(int channel, uint8_t duty) {
    ledcWrite(channel, duty);
}

void updateCreature(int channel, CreatureState &s) {
    uint32_t now = millis();

    switch (s.mode) {
        case 1: { // Burst pulse (runs for s.duration then turns off)
            if (now - s.timer < s.duration) {
                setMotorPWM(channel, s.targetPwm);
            } else {
                setMotorPWM(channel, 0);
                s.mode = 0;
            }
            break;
        }

        case 2: { // Heartbeat (double pulse per cycle)
            uint32_t elapsed = (now - s.timer) % 900; // 900ms ~ 66 BPM
            if (elapsed < 120) {
                setMotorPWM(channel, s.targetPwm);
            } else if (elapsed < 220) {
                setMotorPWM(channel, 0);
            } else if (elapsed < 340) {
                setMotorPWM(channel, (uint8_t)(s.targetPwm * 0.75f));
            } else {
                setMotorPWM(channel, 0);
            }
            break;
        }

        case 3: { // Flutter / Water Wave (sine modulated PWM)
            float t = (now - s.timer) / 1000.0f * 6.28318f * 3.5f; // 3.5 Hz modulation
            float sineMod = (sinf(t) + 1.0f) * 0.5f; // 0.0 to 1.0
            uint8_t outPwm = (uint8_t)(s.targetPwm * (0.3f + 0.7f * sineMod));
            setMotorPWM(channel, outPwm);
            break;
        }

        default:
            // Mode 0: Manual intensity held steady
            break;
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n=== Haptic Petting Zoo: Swamp Biome ESP32-C3 Controller ===");

    // Status LED
    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, HIGH); // Off initially

    // Configure LEDC PWM Channels
    ledcSetup(CH_GATOR, PWM_FREQ, PWM_RES);
    ledcAttachPin(PIN_MOTOR_GATOR, CH_GATOR);

    ledcSetup(CH_FISH, PWM_FREQ, PWM_RES);
    ledcAttachPin(PIN_MOTOR_FISH, CH_FISH);

    ledcSetup(CH_TURTLE, PWM_FREQ, PWM_RES);
    ledcAttachPin(PIN_MOTOR_TURTLE, CH_TURTLE);

    // Initial safe state
    setMotorPWM(CH_GATOR, 0);
    setMotorPWM(CH_FISH, 0);
    setMotorPWM(CH_TURTLE, 0);

    // Initialize BLE
    BLEDevice::init("HapticZoo-Swamp");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);

    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ   |
        BLECharacteristic::PROPERTY_WRITE  |
        BLECharacteristic::PROPERTY_NOTIFY
    );

    pCharacteristic->setCallbacks(new CommandCallbacks());
    pCharacteristic->addDescriptor(new BLE2902());

    pService->start();

    // Start advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] Advertising 'HapticZoo-Swamp'. Ready for Web Bluetooth pairing.");
}

void loop() {
    // Update active creature haptic states
    updateCreature(CH_GATOR, stateGator);
    updateCreature(CH_FISH, stateFish);
    updateCreature(CH_TURTLE, stateTurtle);

    // Advertising reconnect handler
    if (!deviceConnected && oldDeviceConnected) {
        delay(500);
        pServer->startAdvertising();
        Serial.println("[BLE] Advertising restarted.");
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    delay(10); // Loop cadence
}
