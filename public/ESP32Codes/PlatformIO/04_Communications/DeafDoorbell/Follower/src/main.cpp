#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <FastLED.h>
#include <Preferences.h>
#include "DoorbellProtocol.h"

// ============================================================
//  DeafDoorbell — Follower Node (Firmware v3.0)
//  - Multi-pattern FastLED rendering (Breathe, Ripple, Crawl, Bounce, Beacon, Strobe)
//  - Store-and-forward mesh relay with TTL hop limiting
//  - Anti-storm de-duplication cache
//  - House Network Key isolation
//  - 3-second boot-button long press to re-enter pairing mode
//  - Random multi-shade orange ripples during pairing mode
// ============================================================

#define DEBUG_ENABLED

#ifdef DEBUG_ENABLED
  #define DEBUG_PRINT(x)       Serial.print(x)
  #define DEBUG_PRINTF(...)    Serial.printf(__VA_ARGS__)
  #define DEBUG_PRINTLN(x)     Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTF(...)
  #define DEBUG_PRINTLN(x)
#endif

// ===== HARDWARE PIN CONFIGURATION =====
#define LED_PIN         4       // WS2812B data line
#define LED_COUNT       64      // 8x8 WS2812B matrix (or strip)
#define MOTOR_PIN       3       // Digital vibration motor output
#define ONBOARD_LED     8       // Inverted logic: LOW=ON, HIGH=OFF
#define BOOT_PIN        9       // ESP32-C3 SuperMini onboard Boot button (active LOW)

// ===== NVS PREFERENCES & NETWORK KEY =====
Preferences prefs;
uint16_t myNetworkId = 0;       // 0 = Unpaired / Discovery Mode
bool isPaired = false;
uint8_t myMac[6] = {0};

// ===== BOOT BUTTON LONG PRESS (3 SECONDS) =====
#define BOOT_HOLD_TIME_MS 3000
unsigned long bootButtonDownMs = 0;
bool bootPressed = false;

// ===== FASTLED HARDWARE BUFFER =====
CRGB leds[LED_COUNT];

// ===== DEDUPLICATION CACHE (Anti-Storm Flood Control) =====
struct DedupEntry {
    uint16_t networkId;
    uint8_t  leaderId;
    uint32_t seqId;
    uint32_t timestampMs;
};
#define DEDUP_CACHE_SIZE 24
DedupEntry dedupCache[DEDUP_CACHE_SIZE];
int dedupHead = 0;

// ===== MESH RELAY (STORE-AND-FORWARD) =====
bool relayPending = false;
DoorbellPacket relayPacket;
unsigned long relaySendTimeMs = 0;

// ===== ALERT ANIMATION STATE =====
bool     isFlashing        = false;
unsigned long alertStartMs = 0;
uint16_t currentDuration   = 3000;
uint8_t  currentPattern    = PATTERN_BREATHE;
uint8_t  currentBrightness = 80;
float    currentSpeed      = 1.0f;
CRGB     currentColor      = CRGB::Cyan;
uint8_t  currentPartyMode  = 0;

// ===== PAIRING MODE ORANGE RIPPLE ENGINE =====
struct ActiveOrangeRipple {
    float centerX;
    float centerY;
    float radius;
    float speed;
    CRGB  color;
    bool  active;
};
#define MAX_ORANGE_RIPPLES 4
ActiveOrangeRipple orangeRipples[MAX_ORANGE_RIPPLES];
unsigned long nextOrangeRippleMs = 0;
unsigned long lastBeaconBroadcastMs = 0;

const CRGB ORANGE_SHADES[] = {
    CRGB(255, 120, 0),   // Deep Amber
    CRGB(255, 155, 10),  // Vivid Tangerine
    CRGB(255, 185, 30),  // Sunset Gold
    CRGB(255, 95, 5),    // Fiery Coral Orange
    CRGB(255, 140, 20)   // Warm Honey Orange
};
#define NUM_ORANGE_SHADES (sizeof(ORANGE_SHADES) / sizeof(ORANGE_SHADES[0]))

// ===== HEARTBEAT TIMING =====
#define HEARTBEAT_INTERVAL_MS 2000
unsigned long lastHeartbeatMs = 0;
bool heartbeatState = false;

// ============================================================
//  NVS Storage Helpers
// ============================================================
void loadSettings() {
    prefs.begin("doorbell", false);
    myNetworkId = prefs.getUShort("netId", 0);
    prefs.end();

    isPaired = (myNetworkId != 0);
    DEBUG_PRINTF("Loaded NVS: networkId=0x%04X, isPaired=%d\n", myNetworkId, isPaired);
}

void saveNetworkId(uint16_t id) {
    myNetworkId = id;
    isPaired = (id != 0);
    prefs.begin("doorbell", false);
    prefs.putUShort("netId", myNetworkId);
    prefs.end();
    DEBUG_PRINTF("Saved NVS: networkId=0x%04X\n", myNetworkId);
}

// ============================================================
//  Deduplication Check
// ============================================================
bool isDuplicateAlert(uint16_t netId, uint8_t leaderId, uint32_t seqId) {
    unsigned long now = millis();
    for (int i = 0; i < DEDUP_CACHE_SIZE; i++) {
        if (dedupCache[i].networkId == netId &&
            dedupCache[i].leaderId == leaderId &&
            dedupCache[i].seqId == seqId) {
            // Check if seen within 15 seconds
            if (now - dedupCache[i].timestampMs < 15000) {
                return true;
            }
        }
    }
    return false;
}

void recordAlert(uint16_t netId, uint8_t leaderId, uint32_t seqId) {
    dedupCache[dedupHead].networkId = netId;
    dedupCache[dedupHead].leaderId = leaderId;
    dedupCache[dedupHead].seqId = seqId;
    dedupCache[dedupHead].timestampMs = millis();
    dedupHead = (dedupHead + 1) % DEDUP_CACHE_SIZE;
}

// ============================================================
//  Start Alert Animation
// ============================================================
void startAlert(const DoorbellPacket &pkt) {
    currentPattern    = pkt.patternId;
    currentDuration   = pkt.durationMs;
    currentBrightness = constrain(pkt.brightness, 10, 100);
    currentSpeed      = max(0.4f, (float)pkt.speedX10 / 10.0f);
    currentColor      = CRGB(pkt.r, pkt.g, pkt.b);
    currentPartyMode  = pkt.partyMode;
    alertStartMs      = millis();
    isFlashing        = true;

    FastLED.setBrightness((uint8_t)(currentBrightness * 255 / 100));
    digitalWrite(MOTOR_PIN, HIGH);
    digitalWrite(ONBOARD_LED, LOW); // ON during alert

    DEBUG_PRINTF(">>> ALERT START: Pattern=%d, Dur=%dms, Bri=%d%%, Speed=%.1fx, Color=#%02X%02X%02X\n",
                 currentPattern, currentDuration, currentBrightness, currentSpeed,
                 currentColor.r, currentColor.g, currentColor.b);
}

void stopAlert() {
    isFlashing = false;
    digitalWrite(MOTOR_PIN, LOW);
    digitalWrite(ONBOARD_LED, HIGH); // OFF
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();
    DEBUG_PRINTLN("Alert ended.");
}

// ============================================================
//  Visual Pairing Confirmation (Green Flashes)
// ============================================================
void playPairConfirmation() {
    for (int k = 0; k < 3; k++) {
        fill_solid(leds, LED_COUNT, CRGB::Green);
        FastLED.setBrightness(180);
        FastLED.show();
        delay(120);
        fill_solid(leds, LED_COUNT, CRGB::Black);
        FastLED.show();
        delay(100);
    }
}

// ============================================================
//  ESP-NOW Receive Callback
// ============================================================
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len < 2) return;
    if (data[0] != DEAF_DOORBELL_MAGIC) return;

    uint8_t msgType = data[1];

    // Case 1: Doorbell Alert Packet
    if (msgType == MSG_ALERT && len >= (int)sizeof(DoorbellPacket)) {
        DoorbellPacket pkt;
        memcpy(&pkt, data, sizeof(pkt));

        // Network ID isolation check:
        // Accept if matching networkId, or if node is unpaired (0)
        if (isPaired && pkt.networkId != myNetworkId) {
            DEBUG_PRINTF("Ignored alert: Network ID mismatch (pkt:0x%04X, my:0x%04X)\n",
                         pkt.networkId, myNetworkId);
            return;
        }

        // Deduplication check
        if (isDuplicateAlert(pkt.networkId, pkt.leaderId, pkt.seqId)) {
            DEBUG_PRINTF("Deduplicated: Already saw Seq %u from Leader %u\n", pkt.seqId, pkt.leaderId);
            return;
        }

        // Fresh alert: record and trigger
        recordAlert(pkt.networkId, pkt.leaderId, pkt.seqId);
        startAlert(pkt);

        // Mesh repeating: if TTL > 0, schedule relay with randomized jitter
        if (pkt.ttl > 0) {
            relayPacket = pkt;
            relayPacket.ttl--;
            relaySendTimeMs = millis() + random(15, 45); // 15-45ms random CSMA-like backoff
            relayPending = true;
            DEBUG_PRINTF("Queued mesh relay for Seq %u (ttl left: %u, delay: %lu ms)\n",
                         pkt.seqId, relayPacket.ttl, relaySendTimeMs - millis());
        }
    }

    // Case 2: Pair Offer from Leader
    else if (msgType == MSG_PAIR_OFFER && len >= (int)sizeof(PairOfferPacket)) {
        PairOfferPacket offer;
        memcpy(&offer, data, sizeof(offer));

        // Check if targeted to our MAC address
        if (memcmp(offer.targetMac, myMac, 6) == 0) {
            DEBUG_PRINTF(">>> Received PAIR OFFER! Network ID: 0x%04X\n", offer.networkId);
            saveNetworkId(offer.networkId);
            playPairConfirmation();

            // Send confirmation back
            PairBeaconPacket ack;
            ack.magic = DEAF_DOORBELL_MAGIC;
            ack.msgType = MSG_PAIR_CONFIRM;
            memcpy(ack.followerMac, myMac, 6);
            ack.firmwareVer = PROTOCOL_VERSION;
            esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&ack, sizeof(ack));
        }
    }
}

// ============================================================
//  Mesh Relay Service (executed in loop)
// ============================================================
void serviceMeshRelay() {
    if (relayPending && millis() >= relaySendTimeMs) {
        esp_err_t res = esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&relayPacket, sizeof(relayPacket));
        relayPending = false;
        DEBUG_PRINTF("Mesh relay sent for Seq %u (res=%d)\n", relayPacket.seqId, res);
    }
}

// ============================================================
//  Pairing Mode Service (Random Multi-Shade Orange Ripples)
// ============================================================
void servicePairingMode(unsigned long now) {
    // 1. Broadcast hello beacon every 1500ms
    if (now - lastBeaconBroadcastMs >= 1500) {
        PairBeaconPacket beacon;
        beacon.magic = DEAF_DOORBELL_MAGIC;
        beacon.msgType = MSG_PAIR_BEACON;
        memcpy(beacon.followerMac, myMac, 6);
        beacon.firmwareVer = PROTOCOL_VERSION;
        esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&beacon, sizeof(beacon));
        lastBeaconBroadcastMs = now;
        DEBUG_PRINTLN("Pair beacon broadcast sent...");
    }

    // 2. Launch random orange ripples at staggered intervals
    if (now >= nextOrangeRippleMs) {
        for (int i = 0; i < MAX_ORANGE_RIPPLES; i++) {
            if (!orangeRipples[i].active) {
                orangeRipples[i].active = true;
                // Vary origin point slightly around center
                orangeRipples[i].centerX = (float)random(22, 48) / 10.0f;
                orangeRipples[i].centerY = (float)random(22, 48) / 10.0f;
                orangeRipples[i].radius = 0.0f;
                orangeRipples[i].speed = (float)random(32, 55) / 10.0f; // 3.2 to 5.5 units/sec
                orangeRipples[i].color = ORANGE_SHADES[random(0, NUM_ORANGE_SHADES)];
                break;
            }
        }
        nextOrangeRippleMs = now + random(550, 1300);
    }

    // 3. Render active ripples to the matrix
    FastLED.setBrightness(160);
    fadeToBlackBy(leds, LED_COUNT, 55);

    float dt = 0.03f; // ~33 FPS step
    for (int i = 0; i < MAX_ORANGE_RIPPLES; i++) {
        if (orangeRipples[i].active) {
            orangeRipples[i].radius += orangeRipples[i].speed * dt;
            if (orangeRipples[i].radius > 7.5f) {
                orangeRipples[i].active = false;
                continue;
            }

            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    float dx = (float)x - orangeRipples[i].centerX;
                    float dy = (float)y - orangeRipples[i].centerY;
                    float dist = sqrtf(dx * dx + dy * dy);
                    float diff = fabsf(dist - orangeRipples[i].radius);

                    if (diff < 1.25f) {
                        float ringBri = 1.0f - (diff / 1.25f);
                        float edgeFade = 1.0f - (orangeRipples[i].radius / 7.5f);
                        float finalVal = ringBri * edgeFade;

                        CRGB c = orangeRipples[i].color;
                        c.nscale8_video((uint8_t)(finalVal * 255.0f));

                        int idx = y * 8 + x;
                        leds[idx] += c;
                    }
                }
            }
        }
    }
    FastLED.show();
}

// ============================================================
//  FastLED Animation Renderers
// ============================================================
void renderAlertFrame(unsigned long now) {
    float elapsedSec = (float)(now - alertStartMs) / 1000.0f;
    float t = elapsedSec * currentSpeed;

    CRGB activeColor = currentColor;
    if (currentPartyMode) {
        uint8_t hue = (uint8_t)(elapsedSec * 50.0f * currentSpeed);
        activeColor = CHSV(hue, 240, 255);
    }

    switch (currentPattern) {

        // Pattern 0: Slow Breathe (Smooth sinusoidal rise and fall)
        case PATTERN_BREATHE: {
            float rawSine = sinf(t * 3.14159f * 1.5f);
            float norm = (rawSine + 1.0f) * 0.5f;
            float intensity = powf(norm, 1.8f);
            CRGB c = activeColor;
            c.nscale8_video((uint8_t)(intensity * 255.0f));
            fill_solid(leds, LED_COUNT, c);
            break;
        }

        // Pattern 1: Expanding Ripple (Concentric waves from center outward)
        case PATTERN_RIPPLE: {
            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    float dx = (float)x - 3.5f;
                    float dy = (float)y - 3.5f;
                    float dist = sqrtf(dx * dx + dy * dy);
                    float wave = cosf((dist * 1.5f) - (t * 5.5f));
                    if (wave < 0.0f) wave = 0.0f;
                    float intensity = powf(wave, 2.2f);
                    CRGB c = activeColor;
                    c.nscale8_video((uint8_t)(intensity * 255.0f));
                    leds[y * 8 + x] = c;
                }
            }
            break;
        }

        // Pattern 2: Snaking Crawl (Serpentine WS2812B wire tracing with comet tail)
        case PATTERN_CRAWL: {
            fill_solid(leds, LED_COUNT, CRGB::Black);
            float cometPos = fmodf(t * 28.0f, 64.0f);
            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    int serpentineIndex = (y % 2 == 0) ? (y * 8 + x) : (y * 8 + (7 - x));
                    float diff = fmodf(cometPos - (float)serpentineIndex + 64.0f, 64.0f);
                    if (diff < 14.0f) {
                        float intensity = powf(1.0f - (diff / 14.0f), 2.0f);
                        CRGB c = activeColor;
                        c.nscale8_video((uint8_t)(intensity * 255.0f));
                        leds[y * 8 + x] = c;
                    }
                }
            }
            break;
        }

        // Pattern 3: Bouncing Bar (Horizontal oscillating light beam)
        case PATTERN_BOUNCE: {
            fill_solid(leds, LED_COUNT, CRGB::Black);
            float barY = 3.5f + 3.2f * sinf(t * 3.14159f * 1.8f);
            for (int y = 0; y < 8; y++) {
                float distY = fabsf((float)y - barY);
                float intensity = expf(-powf(distY, 2.0f) / 1.5f);
                CRGB c = activeColor;
                c.nscale8_video((uint8_t)(intensity * 255.0f));
                for (int x = 0; x < 8; x++) {
                    leds[y * 8 + x] = c;
                }
            }
            break;
        }

        // Pattern 4: Soft Beacon (Lighthouse pulse with smooth attack and decay)
        case PATTERN_SOFT_BEACON: {
            float cycle = fmodf(t * 1.6f, 1.0f);
            float intensity = 0.0f;
            if (cycle < 0.25f) {
                intensity = sinf((cycle / 0.25f) * (3.14159f / 2.0f));
            } else {
                intensity = cosf(((cycle - 0.25f) / 0.75f) * (3.14159f / 2.0f));
            }
            intensity = powf(max(0.0f, intensity), 1.5f);
            CRGB c = activeColor;
            c.nscale8_video((uint8_t)(intensity * 255.0f));
            fill_solid(leds, LED_COUNT, c);
            break;
        }

        // Pattern 5: Classic Strobe (100ms on / 100ms off)
        case PATTERN_STROBE:
        default: {
            unsigned long cycleMs = (now - alertStartMs) % 200;
            if (cycleMs < 100) {
                fill_solid(leds, LED_COUNT, activeColor);
            } else {
                fill_solid(leds, LED_COUNT, CRGB::Black);
            }
            break;
        }
    }

    FastLED.show();
}

// ============================================================
//  Boot Button Monitor (3-Second Long Press to Unpair)
// ============================================================
void serviceBootButton(unsigned long now) {
    if (digitalRead(BOOT_PIN) == LOW) {
        if (!bootPressed) {
            bootPressed = true;
            bootButtonDownMs = now;
        } else if (now - bootButtonDownMs >= BOOT_HOLD_TIME_MS) {
            DEBUG_PRINTLN(">>> BOOT BUTTON HELD 3S: Resetting Network ID to Unpaired Mode!");
            saveNetworkId(0);

            // Amber flash feedback
            fill_solid(leds, LED_COUNT, CRGB(255, 120, 0));
            FastLED.setBrightness(200);
            FastLED.show();
            delay(300);
            fill_solid(leds, LED_COUNT, CRGB::Black);
            FastLED.show();

            bootPressed = false;
        }
    } else {
        bootPressed = false;
    }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== DeafDoorbell Follower v3.0 ===");

    // Motor pin
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    // Onboard LED (inverted logic: LOW=ON, HIGH=OFF)
    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, HIGH);

    // Boot pin (pull-up enabled)
    pinMode(BOOT_PIN, INPUT_PULLUP);

    // FastLED Setup
    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, LED_COUNT);
    FastLED.setBrightness(160);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();

    // WiFi Station mode for ESP-NOW
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    WiFi.macAddress(myMac);
    Serial.printf("MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  myMac[0], myMac[1], myMac[2], myMac[3], myMac[4], myMac[5]);

    // Load persistent Network ID
    loadSettings();

    // Init ESP-NOW
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW initialization failed!");
        return;
    }
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));

    // Register broadcast peer
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, ESPNOW_BROADCAST_MAC, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);

    DEBUG_PRINTLN("Follower v3.0 online. Listening for doorbell alerts...");
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // 1. Check Boot Button for 3-second hold (Reset pairing)
    serviceBootButton(now);

    // 2. Service pending mesh relays
    serviceMeshRelay();

    // 3. Ongoing Doorbell Alert
    if (isFlashing) {
        if (now - alertStartMs >= currentDuration) {
            stopAlert();
        } else {
            renderAlertFrame(now);
        }
    }
    // 4. Pairing Mode (When Unpaired)
    else if (!isPaired) {
        servicePairingMode(now);
    }
    // 5. Idle / Paired Resting State
    else {
        // Gentle Heartbeat Pulse on Pin 8 every 2 seconds
        if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
            heartbeatState = !heartbeatState;
            digitalWrite(ONBOARD_LED, heartbeatState ? LOW : HIGH);
            lastHeartbeatMs = now;
        }
    }
}
