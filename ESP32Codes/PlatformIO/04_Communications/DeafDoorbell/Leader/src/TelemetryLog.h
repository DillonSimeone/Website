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

// ===== ACOUSTIC DIAGNOSTIC FLIGHT RECORDER (Captures Triggers, Rejections & Cooldown Blocks) =====
enum DiagEventType : uint8_t {
    DIAG_TRIGGERED        = 0, // Passed debounce and fired ESP-NOW alert
    DIAG_REJECTED_SHORT   = 1, // Crossed threshold, but dropped below before reaching debounceChunks
    DIAG_BLOCKED_COOLDOWN = 2, // Crossed threshold while previous alert was still active/cooling down
    DIAG_NEAR_MISS        = 3  // Peaked between 80% and 99% of threshold without crossing
};

#define MAX_DIAG_LOGS     40
#define DIAG_TRACE_CHUNKS 12
struct DiagEventEntry {
    uint32_t timestampMs;
    uint8_t  eventType;                  // DiagEventType
    uint8_t  chunksAbove;                // Chunks that exceeded threshold
    uint8_t  requiredChunks;             // debounceChunks setting at that moment
    uint8_t  traceCount;                 // Number of valid chunks in trace[]
    uint16_t peakMad;                    // Highest 3.2ms chunk MAD during event
    uint16_t threshold;                  // Active threshold
    uint16_t durationMs;                 // Total duration of acoustic event in ms
    uint16_t cooldownRemMs;              // Remaining cooldown ms (if DIAG_BLOCKED_COOLDOWN)
    uint16_t trace[DIAG_TRACE_CHUNKS];   // High-speed 3.2ms chunk-by-chunk oscilloscope trace
};
inline DiagEventEntry diagLog[MAX_DIAG_LOGS];
inline int diagLogHead = 0;
inline int diagLogCount = 0;
inline uint32_t totalDiagEvents = 0;

inline const char* diagTypeToStr(uint8_t type) {
    switch (type) {
        case DIAG_TRIGGERED:        return "TRIGGERED";
        case DIAG_REJECTED_SHORT:   return "TOO_SHORT";
        case DIAG_BLOCKED_COOLDOWN: return "IN_COOLDOWN";
        case DIAG_NEAR_MISS:        return "NEAR_MISS";
        default:                    return "UNKNOWN";
    }
}

inline void recordDiagEvent(uint8_t type, uint16_t peakMad, uint8_t chunksAbove, uint8_t reqChunks,
                            uint16_t durMs, uint16_t cooldownRemMs, const uint16_t* traceBuf, uint8_t traceLen) {
    DiagEventEntry &e = diagLog[diagLogHead];
    e.timestampMs    = millis();
    e.eventType      = type;
    e.chunksAbove    = chunksAbove;
    e.requiredChunks = reqChunks;
    e.traceCount     = min((uint8_t)DIAG_TRACE_CHUNKS, traceLen);
    e.peakMad        = peakMad;
    e.threshold      = (uint16_t)min(65535, threshold);
    e.durationMs     = durMs;
    e.cooldownRemMs  = cooldownRemMs;
    for (int i = 0; i < DIAG_TRACE_CHUNKS; i++) {
        e.trace[i] = (i < e.traceCount && traceBuf) ? traceBuf[i] : 0;
    }

    diagLogHead = (diagLogHead + 1) % MAX_DIAG_LOGS;
    if (diagLogCount < MAX_DIAG_LOGS) diagLogCount++;
    totalDiagEvents++;
}

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
