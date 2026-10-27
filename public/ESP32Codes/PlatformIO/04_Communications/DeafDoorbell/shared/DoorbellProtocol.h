#pragma once
#include <Arduino.h>

#define DEAF_DOORBELL_MAGIC   0xDB
#define PROTOCOL_VERSION      3

// Broadcast address for zero-pairing ESP-NOW
static const uint8_t ESPNOW_BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

enum MsgType : uint8_t {
    MSG_ALERT         = 0x01, // Doorbell alert trigger (broadcast & relayed)
    MSG_PAIR_BEACON   = 0x02, // Unpaired follower beacon ("Looking for leader")
    MSG_PAIR_OFFER    = 0x03, // Leader offer ("Here is our networkId")
    MSG_PAIR_CONFIRM  = 0x04  // Follower ack ("Pairing saved to NVS")
};

enum PatternId : uint8_t {
    PATTERN_BREATHE     = 0, // Slow sine fade in/out
    PATTERN_RIPPLE      = 1, // Expanding concentric rings
    PATTERN_CRAWL       = 2, // Snaking serpentine channel wave
    PATTERN_BOUNCE      = 3, // Bouncing ping-pong light bar
    PATTERN_SOFT_BEACON = 4, // Rounded lighthouse pulse
    PATTERN_STROBE      = 5  // Classic 100ms emergency strobe
};

typedef struct {
    uint8_t  magic;         // 0xDB
    uint8_t  msgType;       // MSG_ALERT (0x01)
    uint16_t networkId;     // House / System Network Key (0 = Public / Factory Test)
    uint32_t seqId;         // Unique sequence counter (Originator ID)
    uint8_t  leaderId;      // Leader Zone (1=Front Door, 2=Back Door, 3=Side Door...)
    uint8_t  ttl;           // Time-To-Live / Hop count (decremented on each relay)
    
    // Animation Payload
    uint8_t  patternId;     // PatternId enum (0 to 5)
    uint16_t durationMs;    // Alert duration in ms (1000 - 10000)
    uint8_t  brightness;    // 10-100%
    uint8_t  speedX10;      // Speed multiplier * 10 (e.g., 10 = 1.0x, 15 = 1.5x)
    uint8_t  r;             // LED color - Red
    uint8_t  g;             // LED color - Green
    uint8_t  b;             // LED color - Blue
    uint8_t  partyMode;     // 1 = Dynamic rainbow spectrum
} __attribute__((packed)) DoorbellPacket;

typedef struct {
    uint8_t  magic;         // 0xDB
    uint8_t  msgType;       // MSG_PAIR_BEACON (0x02) or MSG_PAIR_CONFIRM (0x04)
    uint8_t  followerMac[6];
    uint8_t  firmwareVer;
} __attribute__((packed)) PairBeaconPacket;

typedef struct {
    uint8_t  magic;         // 0xDB
    uint8_t  msgType;       // MSG_PAIR_OFFER (0x03)
    uint8_t  targetMac[6];  // Intended follower MAC
    uint16_t networkId;     // House network ID
    uint8_t  leaderId;      // Leader ID / Trigger Area
    uint8_t  triggerArea;   // Assigned Trigger Area for follower (0 = All Areas)
} __attribute__((packed)) PairOfferPacket;

// Legacy v1/v2 6-byte open-channel broadcast packet (pre-pairing / pre-0xDB magic header)
typedef struct {
    uint8_t  msgType;       // 0x01 = DOORBELL_ALERT
    uint16_t durationMs;    // Flash duration in ms
    uint8_t  r;             // LED color - Red (brightness pre-scaled)
    uint8_t  g;             // LED color - Green (brightness pre-scaled)
    uint8_t  b;             // LED color - Blue (brightness pre-scaled)
} __attribute__((packed)) LegacyDoorbellMsg;
