#pragma once
#include <esp_now.h>
#include <esp_wifi.h>
#include "Config.h"
#include "TelemetryLog.h"

// ===== ALERT EXECUTION & BURST STATE =====
inline unsigned long alertCooldownUntilMs = 0;
inline int burstPacketsRemaining = 0;
inline unsigned long nextBurstPacketMs = 0;
inline DoorbellPacket activeAlertPacket;
inline bool uiTriggered = false;
inline float lastTriggerMAD = 0.0f;
inline volatile bool nvsSaveFollowersPending = false;

inline void addOrUpdateFollowerPeer(const uint8_t *mac) {
    if (!mac) return;
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;

    if (esp_now_is_peer_exist(mac)) {
        esp_now_mod_peer(&peerInfo);
    } else {
        esp_now_add_peer(&peerInfo);
    }
}

inline void recordFollowerInMemory(const uint8_t *mac, uint8_t ver = PROTOCOL_VERSION) {
    if (!mac) return;
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (memcmp(pairedFollowers[i].mac, mac, 6) == 0) {
            pairedFollowers[i].lastSeenMs = millis();
            pairedFollowers[i].firmwareVer = ver;
            nvsSaveFollowersPending = true;
            return;
        }
    }
    if (pairedFollowerCount < MAX_PAIRED_FOLLOWERS) {
        memcpy(pairedFollowers[pairedFollowerCount].mac, mac, 6);
        pairedFollowers[pairedFollowerCount].lastSeenMs = millis();
        pairedFollowers[pairedFollowerCount].firmwareVer = ver;
        pairedFollowers[pairedFollowerCount].triggerArea = 0;
        pairedFollowerCount++;
        nvsSaveFollowersPending = true;
    }
}

// ============================================================
//  ESP-NOW Receive Callback (Fast & Non-Blocking)
// ============================================================
inline void onMasterEspNowRecv(const uint8_t *mac, const uint8_t *data, int len) {
    totalEspNowPackets++;

    EspNowLogEntry entry;
    if (mac) memcpy(entry.mac, mac, 6);
    else memset(entry.mac, 0, 6);

    entry.len = (uint8_t)min(len, 255);
    memset(entry.payload, 0, 16);
    if (data && len > 0) memcpy(entry.payload, data, min(len, 16));
    entry.timestampMs = millis();
    entry.isDoorbell = false;

    if (len >= 2 && data != NULL && data[0] == DEAF_DOORBELL_MAGIC) {
        uint8_t msgType = data[1];

        if (msgType == MSG_ALERT) {
            entry.isDoorbell = true;
            validDoorbellPackets++;
        }
        else if (msgType == MSG_PAIR_BEACON) {
            if (pairingModeActive && millis() < pairingExpiresMs && mac) {
                uint8_t assignedArea = 0;
                for (int i = 0; i < pairedFollowerCount; i++) {
                    if (memcmp(pairedFollowers[i].mac, mac, 6) == 0) {
                        assignedArea = pairedFollowers[i].triggerArea;
                        break;
                    }
                }

                PairOfferPacket offer;
                offer.magic = DEAF_DOORBELL_MAGIC;
                offer.msgType = MSG_PAIR_OFFER;
                memcpy(offer.targetMac, mac, 6);
                offer.networkId = networkId;
                offer.leaderId = leaderId;
                offer.triggerArea = assignedArea;

                addOrUpdateFollowerPeer(mac);
                esp_now_send(mac, (uint8_t*)&offer, sizeof(offer));
                esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&offer, sizeof(offer));
            }
        }
        else if (msgType == MSG_PAIR_CONFIRM) {
            uint8_t ver = (len >= (int)sizeof(PairBeaconPacket)) ? ((const PairBeaconPacket*)data)->firmwareVer : PROTOCOL_VERSION;
            recordFollowerInMemory(mac, ver);
        }
    } else {
        unknownPackets++;
    }

    espNowLog[espNowLogHead] = entry;
    espNowLogHead = (espNowLogHead + 1) % MAX_ESPNOW_LOGS;
    if (espNowLogCount < MAX_ESPNOW_LOGS) espNowLogCount++;
}

inline void setupESPNow() {
    if (esp_now_init() != ESP_OK) {
        DEBUG_PRINTLN("ESP-NOW init failed!");
        return;
    }

    esp_now_register_recv_cb(esp_now_recv_cb_t(onMasterEspNowRecv));

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, ESPNOW_BROADCAST_MAC, 6);
    peerInfo.channel = 1;
    peerInfo.ifidx = WIFI_IF_AP;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        DEBUG_PRINTLN("Failed to add broadcast peer");
    }

    for (int i = 0; i < pairedFollowerCount; i++) {
        addOrUpdateFollowerPeer(pairedFollowers[i].mac);
    }
}

// ============================================================
//  Zero-Stall Broadcast Alert Engine
//  Uses pure broadcast (FF:FF:FF:FF:FF:FF) so offline followers
//  never stall the ESP32-C3 Wi-Fi TX queue with 802.11 MAC retries.
// ============================================================
inline void sendAlertPacketNow() {
    esp_now_send(ESPNOW_BROADCAST_MAC, (uint8_t*)&activeAlertPacket, sizeof(activeAlertPacket));
}

inline void triggerAlert(bool isTest = false) {
    alertSeqCounter++;
    activeAlertPacket.magic      = DEAF_DOORBELL_MAGIC;
    activeAlertPacket.msgType    = MSG_ALERT;
    activeAlertPacket.networkId  = networkId;
    activeAlertPacket.seqId      = alertSeqCounter;
    activeAlertPacket.leaderId   = leaderId;
    activeAlertPacket.ttl        = 2; // Allow up to 2 repeater hops
    activeAlertPacket.patternId  = patternId;
    activeAlertPacket.durationMs = (uint16_t)duration;
    activeAlertPacket.brightness = (uint8_t)constrain(brightness, 10, 100);
    activeAlertPacket.speedX10   = speedX10;
    activeAlertPacket.partyMode  = partyMode ? 1 : 0;

    uint8_t r = 0, g = 0, b = 0;
    if (partyMode) {
        getRandomPartyColor(r, g, b);
    } else {
        r = colorR;
        g = colorG;
        b = colorB;
    }

    // Send unscaled RGB seed/color; Follower applies global brightness once via FastLED.setBrightness()
    activeAlertPacket.r = r;
    activeAlertPacket.g = g;
    activeAlertPacket.b = b;

    // Immediately fire burst packet 1 BEFORE logging or serial print (0 latency!)
    sendAlertPacketNow();

    // Schedule 3 follow-up broadcast packets spaced 12ms apart
    unsigned long now = millis();
    burstPacketsRemaining = 3;
    nextBurstPacketMs = now + 12;
    unsigned long cooldownLen = max((unsigned long)duration, (unsigned long)MIN_COOLDOWN_MS);
    alertCooldownUntilMs = now + cooldownLen;
    uiTriggered = true;

    // Record to trigger history log after Packet 1 is already on the air
    recordTrigger(isTest ? 0.0f : lastTriggerMAD, activeAlertPacket.r, activeAlertPacket.g, activeAlertPacket.b, isTest);

    DEBUG_PRINTF(">>> ALERT FIRED! Seq=%u Zone=%u Net=0x%04X Pat=%u Dur=%dms | Color=#%02X%02X%02X | MAD: %.0f\n",
                 activeAlertPacket.seqId, activeAlertPacket.leaderId, activeAlertPacket.networkId,
                 activeAlertPacket.patternId, activeAlertPacket.durationMs,
                 activeAlertPacket.r, activeAlertPacket.g, activeAlertPacket.b,
                 isTest ? 0.0f : lastTriggerMAD);
}

inline void serviceEspNow(unsigned long now) {
    if (burstPacketsRemaining > 0 && now >= nextBurstPacketMs) {
        sendAlertPacketNow();
        burstPacketsRemaining--;
        nextBurstPacketMs = now + 12;
    }

    if (nvsSaveFollowersPending) {
        nvsSaveFollowersPending = false;
        for (int i = 0; i < pairedFollowerCount; i++) {
            addOrUpdateFollowerPeer(pairedFollowers[i].mac);
        }
        savePairedFollowers();
    }
}
