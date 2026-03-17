#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <Adafruit_DRV2605.h>

// --- CHANNEL CONFIGURATION ---
// 0: Bass, 1: Mid, 2: Treble, 3: Transients
#define MY_CHANNEL_ID 0 
// -----------------------------

#define ONBOARD_LED_PIN 8 // Standard C3 onboard LED. Adjust if your board differs.
#define LED_CHANNEL 0

Adafruit_DRV2605 drv;

// ESP-NOW Struct definitions (Must match Leader)
#define MAX_CHANNELS 4

typedef struct {
    uint8_t mode;          // 0: OFF, 1: Forward, 2: Reverse, 3: Alternating
    uint8_t intensity;     // 0-255 for motor speed / haptic amplitude
    uint8_t dayTonPattern; // 1-123 for DRV2605L ROM built-in effects
} HapticCommand;

typedef struct struct_message {
    HapticCommand channels[MAX_CHANNELS];
} struct_message;

struct_message myData;
float smoothIntensity = 0;

// Handle incoming data
void OnDataRecv(const uint8_t * mac, const uint8_t *incomingData, int len) {
    if (len < sizeof(myData)) return;
    memcpy(&myData, incomingData, sizeof(myData));
}

void setup() {
    Serial.begin(115200);
    
    // Status LED Setup
    ledcSetup(LED_CHANNEL, 5000, 8);
    ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
    ledcWrite(LED_CHANNEL, 255); // Off initially

    // DRV2605L Setup
    if (!drv.begin()) {
        Serial.println("Could not find DRV2605");
        while (1) delay(10);
    }
    
    // CRITICAL: Configure for LRA mode to Safely drive the Dayton Puck (AC drive)
    drv.useLRA();
    
    // Default to Real-Time Playback mode for low latency
    drv.setMode(DRV2605_MODE_REALTIME);
    
    // ESP-NOW Setup
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    esp_now_register_recv_cb(OnDataRecv);
    
    Serial.println("Follower (DRV2605L) Ready.");
    Serial.printf("Listening on Channel: %d\n", MY_CHANNEL_ID);
}

void loop() {
    HapticCommand cmd = myData.channels[MY_CHANNEL_ID];
    
    // ASYMMETRIC ENVELOPE: Instant Attack, Slow Decay
    float target = (cmd.mode == 0) ? 0 : (float)cmd.intensity;
    
    if (target > smoothIntensity) {
        smoothIntensity = target; // Snap up
    } else {
        smoothIntensity *= 0.85f; // Bleed down
    }
    
    uint8_t finalDuty = (uint8_t)smoothIntensity;
    if (finalDuty < 5) finalDuty = 0;

    // --- 1. Visual Status (Inverted Logic) ---
    ledcWrite(LED_CHANNEL, 255 - finalDuty);
    
    // --- 2. Haptic Drive ---
    if (finalDuty == 0) {
        drv.setRealtimeValue(0);
    } else {
        drv.setRealtimeValue(finalDuty / 2);
    }

    if (cmd.dayTonPattern > 0) {
        drv.setMode(DRV2605_MODE_INTTRIG);
        drv.setWaveform(0, cmd.dayTonPattern);
        drv.setWaveform(1, 0); 
        drv.go();
        drv.setMode(DRV2605_MODE_REALTIME);
    }
    
    delay(1);
}
