#pragma once
#include "Config.h"

// ===== ESP-NOW TRAFFIC MONITORING LOG (Circular Buffer) =====
struct EspNowLogEntry {
    uint8_t  mac[6];
    uint8_t  len;
    uint8_t  payload[16];
    uint32_t timestampMs;
    bool     isDoorbell;
};

#define MAX_ESPNOW_LOGS 40
inline EspNowLogEntry espNowLog[MAX_ESPNOW_LOGS];
inline int espNowLogHead = 0;
inline int espNowLogCount = 0;
inline uint32_t totalEspNowPackets = 0;
inline uint32_t validDoorbellPackets = 0;
inline uint32_t unknownPackets = 0;

// ===== TRIGGER HISTORY LOG (Circular Buffer) =====
#define MAX_TRIGGER_LOGS 40
struct TriggerLogEntry {
    uint32_t timestampMs;
    uint16_t peakMad;
    uint16_t threshold;
    uint8_t  r;
    uint8_t  g;
    uint8_t  b;
    bool     isTest;
};
inline TriggerLogEntry triggerLog[MAX_TRIGGER_LOGS];
inline int triggerLogHead = 0;
inline int triggerLogCount = 0;
inline uint32_t totalTriggerCount = 0;

// ===== 24-HOUR AUDIO HISTORY (1-Minute Buckets = 1440 Points) =====
#define HISTORY_24H_POINTS 1440
struct HistoryEntry {
    uint16_t peakMad;
    uint8_t  triggers;
};
inline HistoryEntry history24h[HISTORY_24H_POINTS];
inline int historyHead = 0;
inline int historyCount = 0;
inline unsigned long lastHistoryBucketMs = 0;
inline uint16_t currentBucketPeakMad = 0;
inline uint8_t  currentBucketTriggers = 0;

// ============================================================
//  Trigger History & 24h Bucket Services
// ============================================================
inline void recordTrigger(float mad, uint8_t r, uint8_t g, uint8_t b, bool isTest) {
    TriggerLogEntry entry;
    entry.timestampMs = millis();
    entry.peakMad     = (uint16_t)min(65535.0f, mad);
    entry.threshold   = (uint16_t)min(65535, threshold);
    entry.r           = r;
    entry.g           = g;
    entry.b           = b;
    entry.isTest      = isTest;

    triggerLog[triggerLogHead] = entry;
    triggerLogHead = (triggerLogHead + 1) % MAX_TRIGGER_LOGS;
    if (triggerLogCount < MAX_TRIGGER_LOGS) triggerLogCount++;
    totalTriggerCount++;

    currentBucketTriggers++;
}

inline void serviceHistory24h(unsigned long now, float currentMAD) {
    if (lastHistoryBucketMs == 0) lastHistoryBucketMs = now;
    if (now - lastHistoryBucketMs >= 60000) {
        history24h[historyHead].peakMad  = currentBucketPeakMad;
        history24h[historyHead].triggers = currentBucketTriggers;
        historyHead = (historyHead + 1) % HISTORY_24H_POINTS;
        if (historyCount < HISTORY_24H_POINTS) historyCount++;

        currentBucketPeakMad = (uint16_t)min(65535.0f, currentMAD);
        currentBucketTriggers = 0;
        lastHistoryBucketMs = now;
    }
}
