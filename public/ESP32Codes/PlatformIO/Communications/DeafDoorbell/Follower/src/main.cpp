#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>

// ============================================================
//  DeafDoorbell — Follower Node
//  Receives ESP-NOW broadcast from Master, flashes LED strip
//  and activates vibration motor for the specified duration.
// ============================================================

//#define DEBUG_ENABLED // Comment out to disable serial debug output for production

#ifdef DEBUG_ENABLED
  #define DEBUG_PRINT(x)       Serial.print(x)
  #define DEBUG_PRINTF(...)    Serial.printf(__VA_ARGS__)
  #define DEBUG_PRINTLN(x)     Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTF(...)
  #define DEBUG_PRINTLN(x)
#endif

// ===== LED STRIP CONFIG =====
#define LED_PIN         4       // WS2812B data line
#define LED_COUNT       64      // Number of LEDs on strip
#define LED_BRIGHTNESS  255     // Max brightness for alert
#define FLASH_ON_MS     200     // On period per flash cycle
#define FLASH_OFF_MS    200     // Off period per flash cycle

// ===== VIBRATION MOTOR =====
#define MOTOR_PIN       3       // Digital output — wire via transistor/MOSFET

// ===== ONBOARD LED (heartbeat) =====
#define ONBOARD_LED     8       // Inverted logic: LOW=ON, HIGH=OFF
#define HEARTBEAT_MS    2000    // Blink period

// ===== ESP-NOW PROTOCOL (must match Master) =====
typedef struct {
    uint8_t  msgType;       // 0x01 = DOORBELL_ALERT
    uint16_t durationMs;    // Flash duration
    uint8_t  r;             // LED color — Red
    uint8_t  g;             // LED color — Green
    uint8_t  b;             // LED color — Blue
} __attribute__((packed)) DoorbellMsg;

// ===== DEDUPLICATION =====
#define FOLLOWER_COOLDOWN_MS  1000  // Ignore repeats for 1s
unsigned long lastAlertAcceptedMs = 0;

// ===== FASTLED =====
CRGB leds[LED_COUNT];

// ===== ANIMATION STATE =====
volatile bool     newAlert        = false;
volatile uint16_t alertDuration   = 3000;
volatile uint8_t  alertR          = 255;
volatile uint8_t  alertG          = 255;
volatile uint8_t  alertB          = 255;

bool              flashing        = false;
unsigned long     flashStartMs    = 0;
unsigned long     lastToggleMs    = 0;
bool              ledsOn          = false;
uint16_t          currentDuration = 0;
CRGB              currentColor    = CRGB::White;

// ===== HEARTBEAT STATE =====
unsigned long lastHeartbeat = 0;
bool heartbeatState = false;

// ============================================================
//  ESP-NOW Receive Callback
// ============================================================
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len < (int)sizeof(DoorbellMsg)) return;

    DoorbellMsg msg;
    memcpy(&msg, data, sizeof(msg));

    if (msg.msgType != 0x01) return;

    // Deduplication: ignore repeat packets within cooldown window
    if (millis() - lastAlertAcceptedMs < FOLLOWER_COOLDOWN_MS) {
        return; 
    }
    lastAlertAcceptedMs = millis();

    // Store alert parameters (accessed from loop)
    alertDuration = msg.durationMs;
    alertR = msg.r;
    alertG = msg.g;
    alertB = msg.b;
    newAlert = true;

    DEBUG_PRINTF(">>> ALERT received! Duration: %dms  Color: #%02X%02X%02X\n",
                  msg.durationMs, msg.r, msg.g, msg.b);
}

// ============================================================
//  Start / restart flash animation
// ============================================================
void startFlash() {
    currentDuration = alertDuration;
    currentColor = CRGB(alertR, alertG, alertB);
    flashStartMs = millis();
    lastToggleMs = millis();
    ledsOn = true;
    flashing = true;
    newAlert = false;

    // Turn on LEDs + motor immediately
    fill_solid(leds, LED_COUNT, currentColor);
    FastLED.show();
    digitalWrite(MOTOR_PIN, HIGH);

    DEBUG_PRINTF("Flashing: %dms in #%02X%02X%02X\n",
                  currentDuration, currentColor.r, currentColor.g, currentColor.b);
}

// ============================================================
//  Stop flash animation
// ============================================================
void stopFlash() {
    flashing = false;
    ledsOn = false;
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();
    digitalWrite(MOTOR_PIN, LOW);
    DEBUG_PRINTLN("Flash ended.");
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== DeafDoorbell Follower ===");

    // Motor pin
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    // Onboard LED (heartbeat)
    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, HIGH); // OFF (inverted)

    // FastLED
    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, LED_COUNT);
    FastLED.setBrightness(LED_BRIGHTNESS);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();

    // WiFi — Station mode for ESP-NOW
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    Serial.print("MAC: ");
    Serial.println(WiFi.macAddress());

    // ESP-NOW
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW init failed!");
        return;
    }
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));

    DEBUG_PRINTLN("Listening for doorbell alerts...");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // --- Handle new alert (cancel current + restart) ---
    if (newAlert) {
        startFlash();
    }

    // --- Handle ongoing flash animation ---
    if (flashing) {
        // Check if duration expired
        if (now - flashStartMs >= currentDuration) {
            stopFlash();
        }
        // Toggle LEDs on/off
        else if (ledsOn && (now - lastToggleMs >= FLASH_ON_MS)) {
            fill_solid(leds, LED_COUNT, CRGB::Black);
            FastLED.show();
            digitalWrite(MOTOR_PIN, LOW);
            ledsOn = false;
            lastToggleMs = now;
        }
        else if (!ledsOn && (now - lastToggleMs >= FLASH_OFF_MS)) {
            fill_solid(leds, LED_COUNT, currentColor);
            FastLED.show();
            digitalWrite(MOTOR_PIN, HIGH);
            ledsOn = true;
            lastToggleMs = now;
        }
    }

    // --- Heartbeat (only when not flashing) ---
    if (!flashing && (now - lastHeartbeat >= HEARTBEAT_MS)) {
        heartbeatState = !heartbeatState;
        // Inverted logic: LOW = ON, HIGH = OFF
        digitalWrite(ONBOARD_LED, heartbeatState ? LOW : HIGH);
        lastHeartbeat = now;
    }
    // During flashing, keep heartbeat LED off so it doesn't confuse the user
    if (flashing) {
        digitalWrite(ONBOARD_LED, HIGH); // OFF
    }
}
