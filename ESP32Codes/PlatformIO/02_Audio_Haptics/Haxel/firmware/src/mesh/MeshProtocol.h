#pragma once

#include <Arduino.h>
#include <cstring>

namespace haxel::mesh {

// Compact ESP-NOW protocol for Haxel Command Mode.
// Realtime frames are broadcast; discovery/config/ACK are unicast.
// Keep payloads well under ESP-NOW's ~250-byte practical limit.

static constexpr uint32_t kMagic = 0x48584C4Du; // 'HXLM'
static constexpr uint8_t  kVersion = 1;
static constexpr uint8_t  kMeshChannel = 1;
static constexpr size_t   kMaxFleet = 10;
static constexpr size_t   kNameLen = 24;
static constexpr size_t   kPatternIdLen = 24;
static constexpr size_t   kFwLen = 12;
static constexpr uint32_t kHelloIntervalMs = 1000;
static constexpr uint32_t kLeaseTimeoutMs = 3500;
static constexpr uint32_t kLinkFailsafeMs = 200;
static constexpr uint32_t kStateBroadcastMs = 50;
static constexpr uint32_t kAudioBroadcastMs = 40;
static constexpr uint32_t kTelemetryIntervalMs = 80;
static constexpr uint8_t  kEstopBurstCount = 5;

enum class MsgType : uint8_t {
    Hello = 1,
    Claim = 2,
    ClaimAck = 3,
    Release = 4,
    State = 5,
    Audio = 6,
    Telemetry = 7,
    Estop = 8,
    ConfigChunk = 9,
    ConfigAck = 10,
};

enum StateFlags : uint8_t {
    kFlagOn   = 1 << 0,
    kFlagMute = 1 << 1,
    kFlagZero = 1 << 2, // explicit silence frame
};

struct Header {
    uint32_t magic;
    uint8_t  version;
    uint8_t  type;
    uint16_t seq;
    uint8_t  senderMac[6];
    uint16_t payloadLen;
} __attribute__((packed));

struct HelloPayload {
    char     name[kNameLen];
    char     fw[kFwLen];
    uint32_t configEpoch;
    uint32_t stateEpoch;
    uint8_t  capabilities; // bit0=led bit1=audio
    uint8_t  claimed;
    uint8_t  reserved[2];
    float    duty;
} __attribute__((packed));

struct ClaimPayload {
    char     masterName[kNameLen];
    uint8_t  channel;
    uint8_t  reserved[3];
    uint32_t masterConfigEpoch;
} __attribute__((packed));

struct StatePayload {
    uint8_t  flags;
    uint8_t  reserved;
    uint16_t stateEpochLo; // low 16 of master's state epoch
    float    intensity;
    float    speed;
    float    startupFloor;
    char     patternId[kPatternIdLen];
    uint8_t  targetMac[6]; // FF:FF:FF:FF:FF:FF = all claimed
} __attribute__((packed));

struct AudioPayload {
    uint8_t  valid;
    uint8_t  onset;
    uint16_t reserved;
    float    rms;
    float    peakDb;
    uint8_t  mags[32]; // quantized 0..255
} __attribute__((packed));

struct TelemetryPayload {
    char     name[kNameLen];
    char     patternId[kPatternIdLen];
    uint32_t configEpoch;
    uint32_t stateEpoch;
    float    intensity;
    float    duty;
    float    wave;
    uint8_t  on;
    uint8_t  mute;
    uint8_t  claimed;
    uint8_t  reserved;
} __attribute__((packed));

struct EstopPayload {
    uint8_t reason; // 0=user 1=failsafe
    uint8_t reserved[3];
} __attribute__((packed));

struct ConfigChunkPayload {
    uint32_t epoch;
    uint16_t seq;
    uint16_t total;
    uint8_t  section; // 0=identity 1=driver 2=audio 3=led
    uint8_t  reserved[3];
    uint8_t  dataLen;
    char     data[180];
} __attribute__((packed));

struct ConfigAckPayload {
    uint32_t epoch;
    uint8_t  ok;
    uint8_t  reserved[3];
} __attribute__((packed));

inline void macCopy(uint8_t* dst, const uint8_t* src) {
    memcpy(dst, src, 6);
}

inline bool macEqual(const uint8_t* a, const uint8_t* b) {
    return memcmp(a, b, 6) == 0;
}

inline bool macIsBroadcast(const uint8_t* m) {
    return m[0] == 0xFF && m[1] == 0xFF && m[2] == 0xFF &&
           m[3] == 0xFF && m[4] == 0xFF && m[5] == 0xFF;
}

inline void macSetBroadcast(uint8_t* m) {
    memset(m, 0xFF, 6);
}

inline void copyName(char* dst, size_t dstLen, const char* src) {
    if (!dst || dstLen == 0) return;
    if (!src) { dst[0] = '\0'; return; }
    strncpy(dst, src, dstLen - 1);
    dst[dstLen - 1] = '\0';
}

inline uint8_t quantize01(float v) {
    if (v <= 0.0f) return 0;
    if (v >= 1.0f) return 255;
    return (uint8_t)(v * 255.0f + 0.5f);
}

inline float dequantize01(uint8_t v) {
    return v / 255.0f;
}

} // namespace haxel::mesh
