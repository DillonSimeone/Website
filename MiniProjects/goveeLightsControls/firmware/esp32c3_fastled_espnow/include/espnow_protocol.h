#ifndef ESPNOW_PROTOCOL_H
#define ESPNOW_PROTOCOL_H

#include <stdint.h>

// Command Types
#define CMD_POWER       0x01
#define CMD_BRIGHTNESS  0x02
#define CMD_COLOR       0x03
#define CMD_PATTERN     0x04
#define CMD_ALL         0x05

// Built-in FastLED Patterns
enum FastLEDPattern {
    PATTERN_SOLID = 0,
    PATTERN_RAINBOW = 1,
    PATTERN_FIRE = 2,
    PATTERN_BREATHE = 3,
    PATTERN_TWINKLE = 4,
    PATTERN_CHASE = 5
};

// ESP-NOW Payload packet (16 bytes, fast and reliable)
typedef struct __attribute__((packed)) {
    uint8_t magic[2];   // 0xEE, 0x32 ('E', '2')
    uint8_t cmd;        // Command type
    uint8_t node_id;    // 0 = Broadcast to all nodes, or specific node ID (1..254)
    uint8_t power;      // 0 = Off, 1 = On
    uint8_t brightness; // 0 - 255
    uint8_t r;          // Red 0-255
    uint8_t g;          // Green 0-255
    uint8_t b;          // Blue 0-255
    uint8_t pattern;    // Pattern index (0-5)
    uint8_t speed;      // Animation speed (1-255)
    uint8_t reserved[4];// Future expansion (segments, temperature, etc.)
} EspNowLightPacket;

#endif // ESPNOW_PROTOCOL_H
