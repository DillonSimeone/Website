#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

// --- CHANNEL CONFIGURATION ---
// 0: Bass, 1: Mid, 2: Treble, 3: Transients
#define MY_CHANNEL_ID 0 
// -----------------------------

#define MOTOR_PIN_FWD 0
#define MOTOR_PIN_REV 1
#define ONBOARD_LED_PIN 8 
#define LED_CHANNEL 0
#define MOTOR_CH_FWD 1
#define MOTOR_CH_REV 2

#define PWM_FREQ 5000
#define PWM_BITS 8

// ESP-NOW Struct definitions (Must match Leader)
#define MAX_CHANNELS 4

typedef struct {
    uint8_t mode;          // 0: OFF, 1: Forward, 2: Reverse, 3: Alternating
    uint8_t intensity;     // 0-255 for motor speed / haptic amplitude
    uint8_t dayTonPattern; // 1-123 for DRV2605L (Ignored here)
} HapticCommand;

typedef struct struct_message {
    HapticCommand channels[MAX_CHANNELS];
} struct_message;

struct_message myData;
float smoothIntensity = 0;
unsigned long lastAltTime = 0;
bool altState = false;
int globalAltMs = 40;

void setMotor(uint8_t mode, uint8_t duty) {
    switch (mode) {
        case 0: // OFF
            ledcWrite(MOTOR_CH_FWD, 0);
            ledcWrite(MOTOR_CH_REV, 0);
            break;
        case 1: // FWD
            ledcWrite(MOTOR_CH_FWD, duty);
            ledcWrite(MOTOR_CH_REV, 0);
            break;
        case 2: // REV
            ledcWrite(MOTOR_CH_FWD, 0);
            ledcWrite(MOTOR_CH_REV, duty);
            break;
        case 3: // ALT
            if (millis() - lastAltTime > globalAltMs) {
                altState = !altState;
                lastAltTime = millis();
            }
            if (altState) {
                ledcWrite(MOTOR_CH_FWD, duty);
                ledcWrite(MOTOR_CH_REV, 0);
            } else {
                ledcWrite(MOTOR_CH_FWD, 0);
                ledcWrite(MOTOR_CH_REV, duty);
            }
            break;
    }
}

void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
    if (len < sizeof(myData)) return;
    memcpy(&myData, incomingData, sizeof(myData));
}

void setup() {
    Serial.begin(115200);
    
    // PWM Setup
    ledcSetup(LED_CHANNEL, 5000, 8);
    ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
    ledcWrite(LED_CHANNEL, 255); // Off

    ledcSetup(MOTOR_CH_FWD, PWM_FREQ, PWM_BITS);
    ledcAttachPin(MOTOR_PIN_FWD, MOTOR_CH_FWD);
    
    ledcSetup(MOTOR_CH_REV, PWM_FREQ, PWM_BITS);
    ledcAttachPin(MOTOR_PIN_REV, MOTOR_CH_REV);

    // ESP-NOW Setup
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    esp_now_register_recv_cb(OnDataRecv);
    
    Serial.println("Follower (Simple) Ready.");
}

void loop() {
    HapticCommand cmd = myData.channels[MY_CHANNEL_ID];
    
    // ASYMMETRIC ENVELOPE: Instant Attack, Slow Decay
    float target = (cmd.mode == 0) ? 0 : (float)cmd.intensity;
    
    if (target > smoothIntensity) {
        smoothIntensity = target; // Instant snap up (sync)
    } else {
        smoothIntensity *= 0.85f; // Slow bleed down (bridges gaps/missed frames)
    }
    
    uint8_t finalDuty = (uint8_t)smoothIntensity;
    if (finalDuty < 5) finalDuty = 0;

    // Status LED (Inverted)
    ledcWrite(LED_CHANNEL, 255 - finalDuty);
    
    // Drive Motor
    setMotor(cmd.mode, finalDuty);
    
    delay(1);
}
