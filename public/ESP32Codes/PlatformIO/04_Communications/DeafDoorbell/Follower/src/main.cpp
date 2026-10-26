#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include "FollowerConfig.h"
#include "Animations.h"

// ============================================================
//  DeafDoorbell - Follower Node (Firmware v3.2 Low-Latency)
//  - Shared protocol header via ../shared/DoorbellProtocol.h
//  - WIFI_PS_NONE (zero modem sleep) for ~1ms ESP-NOW wake time
//  - Non-blocking onDataRecv callback (0ms haptic trigger + Frame 0 render)
//  - Phase-aligned FastLED patterns (100% immediate initial flash)
//  - Store-and-forward mesh relay with TTL hop limiting
// ============================================================

// ===== VOLATILE ISR/CALLBACK LATCHES =====
volatile bool newAlertPending  = false;
DoorbellPacket latchedAlertPkt;

volatile bool pairOfferPending = false;
PairOfferPacket latchedOfferPkt;

// ===== MESH RELAY (STORE-AND-FORWARD) =====
bool relayPending = false;
DoorbellPacket relayPacket;
unsigned long relaySendTimeMs = 0;

// ===== BOOT BUTTON & HEARTBEAT STATE =====
unsigned long bootButtonDownMs = 0;
bool bootPressed = false;
unsigned long lastHeartbeatMs = 0;
bool heartbeatState = false;

// ============================================================
//  Alert Start / Stop (Immediate Frame 0 Execution)
// ============================================================
void applyLatchedAlert(unsigned long now) {
    DoorbellPacket pkt;
    memcpy(&pkt, (const void*)&latchedAlertPkt, sizeof(pkt));
    newAlertPending = false;

    currentPattern    = pkt.patternId;
    currentDuration   = pkt.durationMs;
    currentBrightness = constrain(pkt.brightness, 10, 100);
    currentSpeed      = max(0.4f, (float)pkt.speedX10 / 10.0f);
    currentColor      = CRGB(pkt.r, pkt.g, pkt.b);
    currentPartyMode  = pkt.partyMode;
    partyStartHue     = rgb2hsv_approximate(currentColor).hue;
    alertStartMs      = now;
    isFlashing        = true;

    FastLED.setBrightness((uint8_t)(currentBrightness * 255 / 100));
    digitalWrite(MOTOR_PIN, HIGH);
    digitalWrite(ONBOARD_LED, LOW);

    // Render Frame 0 immediately without waiting for the 16ms frame limiter!
    renderAlertFrame(now, true);

    DEBUG_PRINTF(">>> ALERT START: Pattern=%d, Dur=%dms, Bri=%d%%, Speed=%.1fx, Party=%d, Color=#%02X%02X%02X\n",
                 currentPattern, currentDuration, currentBrightness, currentSpeed, currentPartyMode,
                 currentColor.r, currentColor.g, currentColor.b);
}

// Rhythmic double-pulse haptic motor cadence (250ms ON, 120ms OFF, 250ms ON, 380ms OFF)
void serviceHapticMotor(unsigned long now) {
    unsigned long phaseMs = (now - alertStartMs) % 1000;
    bool motorOn = (phaseMs < 250) || (phaseMs >= 370 && phaseMs < 620);
    digitalWrite(MOTOR_PIN, motorOn ? HIGH : LOW);
}

void stopAlert() {
    isFlashing = false;
    digitalWrite(MOTOR_PIN, LOW);
    digitalWrite(ONBOARD_LED, HIGH);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();
    DEBUG_PRINTLN("Alert ended.");
}

// ============================================================
//  ESP-NOW Receive Callback (Ultra-Fast & Non-Blocking)
// ============================================================
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len < 2 || !data) return;
    if (data[0] != DEAF_DOORBELL_MAGIC) return;

    uint8_t msgType = data[1];

    // Case 1: Doorbell Alert Packet
    if (msgType == MSG_ALERT && len >= (int)sizeof(DoorbellPacket)) {
        DoorbellPacket pkt;
        memcpy(&pkt, data, sizeof(pkt));

        // Network ID isolation check (accept if matching networkId or unpaired)
        if (isPaired && pkt.networkId != myNetworkId) return;

        // Trigger Area check (accept if All Areas=0 or matches assigned area)
        if (myTriggerArea != 0 && pkt.leaderId != 0 && pkt.leaderId != myTriggerArea) return;

        // Deduplication check
        if (isDuplicateAlert(pkt.networkId, pkt.leaderId, pkt.seqId)) return;

        recordAlert(pkt.networkId, pkt.leaderId, pkt.seqId);

        // Engage physical motor & LED at 0ms inside callback, latch LED matrix for loop()
        digitalWrite(MOTOR_PIN, HIGH);
        digitalWrite(ONBOARD_LED, LOW);
        memcpy((void*)&latchedAlertPkt, &pkt, sizeof(pkt));
        newAlertPending = true;

        // Mesh repeating: if TTL > 0, schedule relay with randomized jitter
        if (pkt.ttl > 0) {
            relayPacket = pkt;
            relayPacket.ttl--;
            relaySendTimeMs = millis() + random(15, 40);
            relayPending = true;
        }
    }

    // Case 2: Pair Offer from Leader (deferred to loop() so NVS + animation don't block Wi-Fi task)
    else if (msgType == MSG_PAIR_OFFER && len >= (int)sizeof(PairOfferPacket)) {
        PairOfferPacket offer;
        memcpy(&offer, data, sizeof(offer));

        if (memcmp(offer.targetMac, myMac, 6) == 0) {
            memcpy((void*)&latchedOfferPkt, &offer, sizeof(offer));
            pairOfferPending = true;
        }
    }
}

// ============================================================
//  Deferred Services (Mesh Relay, Pair Offer, Boot Button)
// ============================================================
void serviceMeshRelay(unsigned long now) {
    if (relayPending && now >= relaySendTimeMs) {
        esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&relayPacket, sizeof(relayPacket));
        relayPending = false;
    }
}

void servicePairOffer() {
    if (!pairOfferPending) return;
    PairOfferPacket offer;
    memcpy(&offer, (const void*)&latchedOfferPkt, sizeof(offer));
    pairOfferPending = false;

    DEBUG_PRINTF(">>> Received PAIR OFFER! Net:0x%04X, Area:%u\n", offer.networkId, offer.triggerArea);
    saveNetworkId(offer.networkId);
    saveTriggerArea(offer.triggerArea);

    // Send confirmation ACK immediately before playing confirmation animation
    PairBeaconPacket ack;
    ack.magic = DEAF_DOORBELL_MAGIC;
    ack.msgType = MSG_PAIR_CONFIRM;
    memcpy(ack.followerMac, myMac, 6);
    ack.firmwareVer = PROTOCOL_VERSION;
    esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&ack, sizeof(ack));

    playPairConfirmation();
}

void serviceBootButton(unsigned long now) {
    if (digitalRead(BOOT_PIN) == LOW) {
        if (!bootPressed) {
            bootPressed = true;
            bootButtonDownMs = now;
        } else if (now - bootButtonDownMs >= BOOT_HOLD_TIME_MS) {
            DEBUG_PRINTLN(">>> BOOT BUTTON HELD 3S: Resetting Network ID to Unpaired Mode!");
            saveNetworkId(0);
            pairingModeStartMs = millis();

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
//  SETUP & MAIN LOOP
// ============================================================
void setup() {
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0); // Never block if running headless on USB power brick
    delay(300);

    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, HIGH);

    pinMode(BOOT_PIN, INPUT_PULLUP);

    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, LED_COUNT);
    FastLED.setBrightness(160);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();

    // Wi-Fi Station mode locked to Channel 1 with Modem Sleep DISABLED for ~1ms RX wake
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    WiFi.macAddress(myMac);

    loadSettings();
    pairingModeStartMs = millis();

    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW initialization failed!");
        return;
    }
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, ESPNOW_BROADCAST_MAC, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);

    DEBUG_PRINTLN("\n=== DeafDoorbell Follower v3.2 Online (Low-Latency Mode, Channel 1) ===");
}

void loop() {
    unsigned long now = millis();

    // 1. Immediately apply any newly arrived ESP-NOW alert (Frame 0 rendered at 0ms!)
    if (newAlertPending) {
        applyLatchedAlert(now);
    }

    // 2. Service pending mesh relays
    serviceMeshRelay(now);

    // 3. Service deferred pairing offers
    servicePairOffer();

    // 4. Check Boot Button for 3-second hold (Reset pairing)
    serviceBootButton(now);

    // 5. Render ongoing Doorbell Alert, Pairing Mode, or Idle Heartbeat
    if (isFlashing) {
        if (now - alertStartMs >= currentDuration) {
            stopAlert();
        } else {
            serviceHapticMotor(now);
            renderAlertFrame(now, false);
        }
    } else if (!isPaired) {
        servicePairingMode(now);
    } else if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        heartbeatState = !heartbeatState;
        digitalWrite(ONBOARD_LED, heartbeatState ? LOW : HIGH);
        lastHeartbeatMs = now;
    }
}
