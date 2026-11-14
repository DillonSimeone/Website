#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include "FollowerConfig.h"
#include "Animations.h"

// Pulses are clocked from RAM through the CPU pin register. The low gap at the
// end is long enough for the panel to latch before interrupts run again.
void IRAM_ATTR clockMatrixFrame(const uint8_t* data, int nbytes, uint32_t pinMask,
                                uint32_t t0h, uint32_t t1h, uint32_t t0l, uint32_t t1l,
                                uint32_t latchCycles) {
    cpu_ll_write_dedic_gpio_all(0);
    uint32_t warm = cpu_ll_get_cycle_count();
    while ((cpu_ll_get_cycle_count() - warm) < 80) {}

    for (int i = 0; i < nbytes; i++) {
        uint8_t value = data[i];
        for (int bit = 0; bit < 8; bit++) {
            uint32_t high = (value & 0x80) ? t1h : t0h;
            uint32_t low = (value & 0x80) ? t1l : t0l;
            value <<= 1;
            cpu_ll_write_dedic_gpio_all(pinMask);
            uint32_t edge = cpu_ll_get_cycle_count();
            while ((cpu_ll_get_cycle_count() - edge) < high) {}
            cpu_ll_write_dedic_gpio_all(0);
            edge = cpu_ll_get_cycle_count();
            while ((cpu_ll_get_cycle_count() - edge) < low) {}
        }
    }

    cpu_ll_write_dedic_gpio_all(0);
    uint32_t rest = cpu_ll_get_cycle_count();
    while ((cpu_ll_get_cycle_count() - rest) < latchCycles) {}
}

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
// Written on the Wi-Fi task and read on the loop task.
volatile bool relayPending = false;
volatile DoorbellPacket relayPacket;
volatile unsigned long relaySendTimeMs = 0;

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
    // Clear the flag before the copy so a packet that arrives mid-copy is kept for the next loop.
    noInterrupts();
    newAlertPending = false;
    memcpy(&pkt, (const void*)&latchedAlertPkt, sizeof(pkt));
    interrupts();

    uint32_t elapsed = now - alertStartMs;
    bool sameLook = (pkt.patternId == currentPattern && pkt.partyMode == currentPartyMode &&
                     pkt.r == currentColor.r && pkt.g == currentColor.g && pkt.b == currentColor.b);
    bool showStillRunning = isFlashing && elapsed < currentDuration;
    bool showJustEnded = !isFlashing && showEndedMs != 0 && (now - showEndedMs) <= 200;
        if (sameLook && (showStillRunning || showJustEnded)) {
        uint32_t extended = elapsed + pkt.durationMs;
        if (extended < elapsed) extended = 0xFFFFFFFFUL;
        if (extended > currentDuration) currentDuration = extended;
        currentBrightness = constrain(pkt.brightness, 10, 100);
        isFlashing = true;
        showEndedMs = 0;
        matrixBlankPending = false;
        FastLED.setBrightness((uint8_t)(currentBrightness * 255 / 100));
        return;
    }

    currentPattern    = pkt.patternId;
    currentDuration   = pkt.durationMs;
    currentBrightness = constrain(pkt.brightness, 10, 100);
    currentSpeed      = max(0.4f, (float)pkt.speedX10 / 10.0f);
    currentColor      = CRGB(pkt.r, pkt.g, pkt.b);
    currentPartyMode  = pkt.partyMode;
    partyStartHue     = rgb2hsv_approximate(currentColor).hue;
    alertStartMs      = now;
    showEndedMs       = 0;
    isFlashing        = true;

    FastLED.setBrightness((uint8_t)(currentBrightness * 255 / 100));
    digitalWrite(MOTOR_PIN, HIGH);
    digitalWrite(ONBOARD_LED, LOW);

    // Render Frame 0 immediately without waiting for the 16ms frame limiter!
    renderAlertFrame(now, true);

    DEBUG_PRINTF(">>> ALERT START: Pattern=%d, Dur=%lums, Bri=%d%%, Speed=%.1fx, Party=%d, Color=#%02X%02X%02X\n",
                 currentPattern, (unsigned long)currentDuration, currentBrightness, currentSpeed, currentPartyMode,
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
    showEndedMs = millis();
    digitalWrite(MOTOR_PIN, LOW);
    digitalWrite(ONBOARD_LED, HIGH);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    matrixBlankPending = true;
    showMatrix();
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

        // Deduplication check
        if (isDuplicateAlert(pkt.networkId, pkt.leaderId, pkt.seqId)) return;

        recordAlert(pkt.networkId, pkt.leaderId, pkt.seqId);

#ifndef REPEATER_ONLY
        // Area limits what this follower shows. It still repeats the alert for the rest of the house.
        bool playsHere = (myTriggerArea == 0 || pkt.leaderId == 0 || pkt.leaderId == myTriggerArea);
        if (playsHere) {
            digitalWrite(MOTOR_PIN, HIGH);
            digitalWrite(ONBOARD_LED, LOW);
            noInterrupts();
            memcpy((void*)&latchedAlertPkt, &pkt, sizeof(pkt));
            newAlertPending = true;
            interrupts();
        }
#endif

        // Mesh repeating: if TTL > 0, schedule relay with randomized jitter
        if (pkt.ttl > 0) {
            DoorbellPacket outbound = pkt;
            outbound.ttl--;
            unsigned long sendAt = millis() + (unsigned long)random(15, 40);
            noInterrupts();
            memcpy((void*)&relayPacket, &outbound, sizeof(outbound));
            relaySendTimeMs = sendAt;
            relayPending = true;
            interrupts();
        }
    }

    // Case 2: Pair Offer from Leader (deferred to loop() so NVS + animation don't block Wi-Fi task)
    else if (msgType == MSG_PAIR_OFFER && len >= (int)sizeof(PairOfferPacket)) {
        PairOfferPacket offer;
        memcpy(&offer, data, sizeof(offer));

        if (memcmp(offer.targetMac, myMac, 6) == 0) {
            noInterrupts();
            memcpy((void*)&latchedOfferPkt, &offer, sizeof(offer));
            pairOfferPending = true;
            interrupts();
        }
    }
}

// ============================================================
//  Deferred Services (Mesh Relay, Pair Offer, Boot Button)
// ============================================================
#ifdef REPEATER_ONLY
static unsigned long repeaterLedOffMs = 0;
#endif

void serviceMeshRelay(unsigned long now) {
    DoorbellPacket outbound;
    bool sendNow = false;
    noInterrupts();
    if (relayPending && (long)(now - relaySendTimeMs) >= 0) {
        memcpy(&outbound, (const void*)&relayPacket, sizeof(outbound));
        relayPending = false;
        sendNow = true;
    }
    interrupts();
    if (sendNow) {
        sendEspNowBroadcast((uint8_t*)&outbound, sizeof(outbound));
#ifdef REPEATER_ONLY
        digitalWrite(ONBOARD_LED, LOW);
        repeaterLedOffMs = millis() + 120;
#endif
    }
}

void servicePairOffer() {
    if (!pairOfferPending) return;
    PairOfferPacket offer;
    noInterrupts();
    pairOfferPending = false;
    memcpy(&offer, (const void*)&latchedOfferPkt, sizeof(offer));
    interrupts();

    DEBUG_PRINTF(">>> Received PAIR OFFER! Net:0x%04X, Area:%u\n", offer.networkId, offer.triggerArea);
    saveNetworkId(offer.networkId);
    saveTriggerArea(offer.triggerArea);

    // Send confirmation ACK immediately before playing confirmation animation
    PairBeaconPacket ack;
    ack.magic = DEAF_DOORBELL_MAGIC;
    ack.msgType = MSG_PAIR_CONFIRM;
    memcpy(ack.followerMac, myMac, 6);
    ack.firmwareVer = PROTOCOL_VERSION;
    sendEspNowBroadcast((uint8_t*)&ack, sizeof(ack));

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

#ifdef REPEATER_ONLY
            for (int i = 0; i < 3; i++) {
                digitalWrite(ONBOARD_LED, LOW);
                delay(80);
                digitalWrite(ONBOARD_LED, HIGH);
                delay(80);
            }
#else
            fill_solid(leds, LED_COUNT, CRGB(255, 120, 0));
            FastLED.setBrightness(200);
            showMatrix();
            delay(300);
            fill_solid(leds, LED_COUNT, CRGB::Black);
            showMatrix();
#endif

            bootPressed = false;
        }
    } else {
        bootPressed = false;
    }
}

// ============================================================
//  SETUP & MAIN LOOP
// ============================================================
bool tryInitEspNow();

void setup() {
    Serial.begin(115200);
    Serial.setTxTimeoutMs(0); // Never block if running headless on USB power brick
    delay(300);

    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, HIGH);

    pinMode(BOOT_PIN, INPUT_PULLUP);

#ifndef REPEATER_ONLY
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    FastLED.setBrightness(160);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    showMatrix();
#endif

    // Wi-Fi Station mode locked to Channel 1. No stored network, so the radio does not scan.
    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(false, true);
    esp_wifi_scan_stop();
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_ps(WIFI_PS_NONE);
    WiFi.macAddress(myMac);

    loadSettings();
    pairingModeStartMs = millis();

    tryInitEspNow();

#ifdef REPEATER_ONLY
    DEBUG_PRINTLN("\n=== DeafDoorbell Repeater Online (Channel 1, no matrix) ===");
#else
    DEBUG_PRINTLN("\n=== DeafDoorbell Follower v3.2 Online (Low-Latency Mode, Channel 1) ===");
#endif
}

bool tryInitEspNow() {
    if (esp_now_init() != ESP_OK) {
        espNowReady = false;
        DEBUG_PRINTLN("ESP-NOW initialization failed!");
        return false;
    }
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, ESPNOW_BROADCAST_MAC, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_STA;
    peerInfo.encrypt = false;
    if (!esp_now_is_peer_exist(ESPNOW_BROADCAST_MAC)) {
        esp_now_add_peer(&peerInfo);
    }
    espNowReady = true;
    if (nextHeartbeatMs == 0) {
        nextHeartbeatMs = millis() + 1000UL + (unsigned long)random(0, 4000);
    }
    return true;
}

void serviceRadioLock(unsigned long now) {
    static unsigned long lastRadioLockMs = 0;
    if (lastRadioLockMs != 0 && (now - lastRadioLockMs) < 30000UL) return;
    lastRadioLockMs = now;

    esp_wifi_scan_stop();

    uint8_t primary = 1;
    wifi_second_chan_t second = WIFI_SECOND_CHAN_NONE;
    if (esp_wifi_get_channel(&primary, &second) == ESP_OK) {
        if (primary != 1 || second != WIFI_SECOND_CHAN_NONE) {
            esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
        }
    }
    wifi_ps_type_t ps = WIFI_PS_NONE;
    if (esp_wifi_get_ps(&ps) == ESP_OK && ps != WIFI_PS_NONE) {
        esp_wifi_set_ps(WIFI_PS_NONE);
    }
}

void serviceEspNowLink(unsigned long now) {
    if (espNowReady) return;
    static unsigned long lastEspNowAttemptMs = 0;
    if (lastEspNowAttemptMs != 0 && (now - lastEspNowAttemptMs) < 3000UL) return;
    lastEspNowAttemptMs = now;
    tryInitEspNow();
}

void serviceHeartbeat(unsigned long now) {
    if (!isPaired || isFlashing || !espNowReady) return;
    if (nextHeartbeatMs != 0 && (long)(now - nextHeartbeatMs) < 0) return;

    HeartbeatPacket hb = {};
    hb.magic = DEAF_DOORBELL_MAGIC;
    hb.msgType = MSG_HEARTBEAT;
    hb.networkId = myNetworkId;
    memcpy(hb.followerMac, myMac, 6);
    hb.firmwareVer = PROTOCOL_VERSION;
    sendEspNowBroadcast((uint8_t *)&hb, sizeof(hb));
    nextHeartbeatMs = now + 60000UL + (unsigned long)random(0, 8000);
}

void loop() {
    unsigned long now = millis();

    serviceRadioLock(now);
    serviceEspNowLink(now);

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

    // 5. Paired presence beat. One broadcast, no retry, skipped during an alert.
    serviceHeartbeat(now);

#ifdef REPEATER_ONLY
    if (repeaterLedOffMs != 0 && (long)(now - repeaterLedOffMs) >= 0) {
        repeaterLedOffMs = 0;
        if (isPaired) digitalWrite(ONBOARD_LED, HIGH);
    }
#endif

    // 6. Render ongoing Doorbell Alert, Pairing Mode, or Idle Heartbeat
    if (isFlashing) {
        if (now - alertStartMs >= currentDuration) {
            stopAlert();
        } else {
            serviceHapticMotor(now);
            renderAlertFrame(now, false);
        }
    } else if (matrixBlankPending) {
        fill_solid(leds, LED_COUNT, CRGB::Black);
        showMatrix();
    } else if (!isPaired) {
        servicePairingMode(now);
    } else if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        heartbeatState = !heartbeatState;
        digitalWrite(ONBOARD_LED, heartbeatState ? LOW : HIGH);
        lastHeartbeatMs = now;
    }
}
