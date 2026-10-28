#pragma once
#include <esp_now.h>
#include "FollowerConfig.h"

// ===== PAIRING MODE ORANGE RIPPLE STATE =====
inline unsigned long pairingModeStartMs = 0;
inline unsigned long lastPairingFrameMs = 0;
inline unsigned long lastBeaconBroadcastMs = 0;

static const CRGB ORANGE_SHADES[] = {
    CRGB(255, 120, 0),   // Deep Amber
    CRGB(255, 155, 10),  // Vivid Tangerine
    CRGB(255, 185, 30),  // Sunset Gold
    CRGB(255, 95, 5),    // Fiery Coral Orange
    CRGB(255, 140, 20)   // Warm Honey Orange
};
#define NUM_ORANGE_SHADES (sizeof(ORANGE_SHADES) / sizeof(ORANGE_SHADES[0]))
#define PAIRING_RIPPLE_PERIOD_MS 3000

// ============================================================
//  FastLED Alert Animation Renderers
//  - Phase-aligned so Frame 0 (t=0) produces an instant 100% flash
//  - Built-in temporal + spatial rainbow hue engine for Party Mode
// ============================================================
inline void renderAlertFrame(unsigned long now, bool forceImmediate = false) {
    static unsigned long lastAlertFrameMs = 0;
    if (!forceImmediate && (now - lastAlertFrameMs < 16)) return; // ~60 FPS smooth limiter
    lastAlertFrameMs = now;

    float elapsedSec = (float)(now - alertStartMs) / 1000.0f;
    float t = elapsedSec * currentSpeed;

    // Continuous rainbow hue rotation when Party Mode is active
    uint8_t baseHue = partyStartHue + (uint8_t)(t * 140.0f);

    switch (currentPattern) {

        // Pattern 0: Breathe (Starts at 100% peak brightness at t=0 via cosf)
        case PATTERN_BREATHE: {
            float rawCos = cosf(t * 3.14159f * 1.5f);
            float norm = (rawCos + 1.0f) * 0.5f;
            float intensity = powf(norm, 1.8f);
            uint8_t scale = (uint8_t)(intensity * 255.0f);

            if (currentPartyMode) {
                for (int y = 0; y < 8; y++) {
                    for (int x = 0; x < 8; x++) {
                        float dx = (float)x - 3.5f;
                        float dy = (float)y - 3.5f;
                        float dist = sqrtf(dx * dx + dy * dy);
                        CRGB c = CHSV(baseHue + (uint8_t)(dist * 14.0f), 240, 255);
                        c.nscale8_video(scale);
                        leds[getMatrixIndex(x, y)] = c;
                    }
                }
            } else {
                CRGB c = currentColor;
                c.nscale8_video(scale);
                fill_solid(leds, LED_COUNT, c);
            }
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
                    CRGB c = currentPartyMode
                        ? CRGB(CHSV(baseHue - (uint8_t)(dist * 28.0f), 240, 255))
                        : currentColor;
                    c.nscale8_video((uint8_t)(intensity * 255.0f));
                    leds[getMatrixIndex(x, y)] = c;
                }
            }
            break;
        }

        // Pattern 2: Snaking Crawl (Serpentine WS2812B wire tracing with comet tail)
        case PATTERN_CRAWL: {
            fill_solid(leds, LED_COUNT, CRGB::Black);
            float cometPos = fmodf(t * 28.0f + 14.0f, 64.0f);
            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    int serpentineIndex = (y % 2 == 0) ? (y * 8 + x) : (y * 8 + (7 - x));
                    float diff = fmodf(cometPos - (float)serpentineIndex + 64.0f, 64.0f);
                    if (diff < 14.0f) {
                        float intensity = powf(1.0f - (diff / 14.0f), 2.0f);
                        CRGB c = currentPartyMode
                            ? CRGB(CHSV(baseHue - (uint8_t)(diff * 12.0f), 240, 255))
                            : currentColor;
                        c.nscale8_video((uint8_t)(intensity * 255.0f));
                        leds[getMatrixIndex(x, y)] = c;
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
                uint8_t scale = (uint8_t)(intensity * 255.0f);
                for (int x = 0; x < 8; x++) {
                    CRGB c = currentPartyMode
                        ? CRGB(CHSV(baseHue + (x * 16) + (y * 10), 240, 255))
                        : currentColor;
                    c.nscale8_video(scale);
                    leds[getMatrixIndex(x, y)] = c;
                }
            }
            break;
        }

        // Pattern 4: Soft Beacon (Starts at peak pulse at t=0, smooth decay and re-attack)
        case PATTERN_SOFT_BEACON: {
            float cycle = fmodf(t * 1.6f + 0.25f, 1.0f);
            float intensity = 0.0f;
            if (cycle < 0.25f) {
                intensity = sinf((cycle / 0.25f) * (3.14159f / 2.0f));
            } else {
                intensity = cosf(((cycle - 0.25f) / 0.75f) * (3.14159f / 2.0f));
            }
            intensity = powf(max(0.0f, intensity), 1.5f);
            uint8_t scale = (uint8_t)(intensity * 255.0f);

            if (currentPartyMode) {
                for (int y = 0; y < 8; y++) {
                    for (int x = 0; x < 8; x++) {
                        float dx = (float)x - 3.5f;
                        float dy = (float)y - 3.5f;
                        float dist = sqrtf(dx * dx + dy * dy);
                        CRGB c = CHSV(baseHue + (uint8_t)(dist * 16.0f), 240, 255);
                        c.nscale8_video(scale);
                        leds[getMatrixIndex(x, y)] = c;
                    }
                }
            } else {
                CRGB c = currentColor;
                c.nscale8_video(scale);
                fill_solid(leds, LED_COUNT, c);
            }
            break;
        }

        // Pattern 5: Classic Strobe (100ms on / 100ms off)
        case PATTERN_STROBE:
        default: {
            unsigned long elapsedMs = now - alertStartMs;
            unsigned long cycleMs = elapsedMs % 200;
            if (cycleMs < 100) {
                if (currentPartyMode) {
                    uint8_t strobeHue = partyStartHue + (uint8_t)((elapsedMs / 200) * 73);
                    for (int y = 0; y < 8; y++) {
                        for (int x = 0; x < 8; x++) {
                            leds[getMatrixIndex(x, y)] = CHSV(strobeHue + ((x + y) * 6), 240, 255);
                        }
                    }
                } else {
                    fill_solid(leds, LED_COUNT, currentColor);
                }
            } else {
                fill_solid(leds, LED_COUNT, CRGB::Black);
            }
            break;
        }
    }

    FastLED.show();
}

// ============================================================
//  Visual Pairing Confirmation (Gentle Emerald Green Ripple)
//  Executed in loop() rather than blocking the Wi-Fi callback
// ============================================================
inline void playPairConfirmation() {
    FastLED.setBrightness(100);
    const float cx = 3.5f;
    const float cy = 3.5f;
    const float ringThickness = 1.35f;
    unsigned long startMs = millis();
    const unsigned long durMs = 1500;

    while (millis() - startMs < durMs) {
        float progress = (float)(millis() - startMs) / (float)durMs;
        float radius = progress * 5.2f;

        float envelope = 1.0f;
        if (progress < 0.15f) {
            envelope = sinf((progress / 0.15f) * (3.14159f / 2.0f));
        } else if (progress > 0.60f) {
            envelope = cosf(((progress - 0.60f) / 0.40f) * (3.14159f / 2.0f));
        }
        envelope = max(0.0f, envelope);

        fill_solid(leds, LED_COUNT, CRGB::Black);

        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                float dx = (float)x - cx;
                float dy = (float)y - cy;
                float dist = sqrtf(dx * dx + dy * dy);

                float diff = fabsf(dist - radius);
                if (diff < ringThickness) {
                    float normDiff = diff / ringThickness;
                    float bell = 0.5f * (1.0f + cosf(normDiff * 3.14159265f));
                    float intensity = powf(bell, 1.4f) * envelope;

                    CRGB c = CRGB(0, 255, 60);
                    c.nscale8_video((uint8_t)(intensity * 255.0f));
                    leds[getMatrixIndex(x, y)] = c;
                }
            }
        }
        FastLED.show();
        delay(16);
    }

    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();
}

// ============================================================
//  Pairing Mode Service (Slow 3-Second Gentle Center Orange Ripple)
// ============================================================
inline void servicePairingMode(unsigned long now) {
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

    if (now - lastPairingFrameMs < 20) return;
    lastPairingFrameMs = now;

    if (pairingModeStartMs == 0) pairingModeStartMs = now;
    unsigned long elapsed = now - pairingModeStartMs;

    uint32_t cycleNumber = elapsed / PAIRING_RIPPLE_PERIOD_MS;
    float cycleTime = (float)(elapsed % PAIRING_RIPPLE_PERIOD_MS);
    float progress = cycleTime / (float)PAIRING_RIPPLE_PERIOD_MS;

    int shadeIdx = cycleNumber % NUM_ORANGE_SHADES;
    int nextShadeIdx = (shadeIdx + 1) % NUM_ORANGE_SHADES;
    CRGB waveColor = blend(ORANGE_SHADES[shadeIdx], ORANGE_SHADES[nextShadeIdx], (uint8_t)(progress * 180));

    float radius = progress * 5.2f;

    float envelope = 1.0f;
    if (progress < 0.15f) {
        envelope = sinf((progress / 0.15f) * (3.14159f / 2.0f));
    } else if (progress > 0.65f) {
        float decayProgress = (progress - 0.65f) / 0.35f;
        envelope = cosf(decayProgress * (3.14159f / 2.0f));
    }
    envelope = max(0.0f, envelope);

    FastLED.setBrightness(75);
    fill_solid(leds, LED_COUNT, CRGB::Black);

    const float cx = 3.5f;
    const float cy = 3.5f;
    const float ringThickness = 1.35f;

    for (int y = 0; y < 8; y++) {
        for (int x = 0; x < 8; x++) {
            float dx = (float)x - cx;
            float dy = (float)y - cy;
            float dist = sqrtf(dx * dx + dy * dy);

            float diff = fabsf(dist - radius);
            if (diff < ringThickness) {
                float normDiff = diff / ringThickness;
                float bell = 0.5f * (1.0f + cosf(normDiff * 3.14159265f));
                float intensity = powf(bell, 1.4f) * envelope;

                CRGB pixelColor = waveColor;
                pixelColor.nscale8_video((uint8_t)(intensity * 255.0f));
                leds[getMatrixIndex(x, y)] = pixelColor;
            }
        }
    }

    FastLED.show();
}
