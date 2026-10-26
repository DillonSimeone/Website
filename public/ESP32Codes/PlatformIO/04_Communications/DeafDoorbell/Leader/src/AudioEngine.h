#pragma once
#include "Config.h"
#include "TelemetryLog.h"
#include "EspNowManager.h"

// ===== AUDIO FILTER & RUNTIME STATE =====
inline float currentMAD       = 0.0f;
inline float peakMADSincePoll = 0.0f;
inline float levelLP          = 0.0f;

// DC-blocking IIR high-pass filter state (~80Hz cutoff at ~20kHz)
inline float lastInputSample  = 2048.0f;
inline float lastOutputSample = 0.0f;
static const float DC_FILTER_R = 0.985f;

// Fast 3-chunk (~9.6ms) leaky debounce state
inline int chunksAbove     = 0;
inline int consecutiveDips = 0;

inline bool isAudioMidTrigger() {
    return chunksAbove > 0;
}

// ============================================================
//  MAX4466 Analog Audio & Onboard LED Setup
// ============================================================
inline void setupAudio() {
    // 1. Soft Ground for MAX4466 GND pin
    pinMode(MIC_GND_PIN, OUTPUT);
    digitalWrite(MIC_GND_PIN, LOW);

    // 2. Analog Input on Pin 3 (ADC1_CH3)
    pinMode(MIC_ANALOG_PIN, INPUT);
    analogReadResolution(12); // 0-4095
    analogSetPinAttenuation(MIC_ANALOG_PIN, ADC_11db); // Full range ~0 - 3.1V

    // Prime initial sample to prevent startup DC step
    lastInputSample = (float)analogRead(MIC_ANALOG_PIN);
}

inline void setupLED() {
    ledcSetup(LED_CHANNEL, 5000, 8);
    ledcAttachPin(ONBOARD_LED_PIN, LED_CHANNEL);
    ledcWrite(LED_CHANNEL, 255); // Start OFF (inverted: 255=OFF, 0=MAX)
}

inline void updateLED(float madLevel, bool alertActive) {
    if (alertActive) {
        ledcWrite(LED_CHANNEL, 0); // Solid ON during active alert
    } else {
        int brightnessVal = map(constrain((int)madLevel, 200, 4000), 200, 4000, 0, 255);
        ledcWrite(LED_CHANNEL, 255 - brightnessVal); // Inverted logic
    }
}

// ============================================================
//  Single-Pass Low-Latency Audio Capture & Leaky Debounce
// ============================================================
inline void sampleAndProcessAudio(unsigned long now) {
    float madSum = 0.0f;

    // Single-pass capture + IIR DC-blocking filter + MAD accumulation
    for (int i = 0; i < CHUNK_SIZE; i++) {
        float inSample = (float)analogRead(MIC_ANALOG_PIN);
        float outSample = inSample - lastInputSample + (DC_FILTER_R * lastOutputSample);
        lastInputSample = inSample;
        lastOutputSample = outSample;
        madSum += fabsf(outSample);
        delayMicroseconds(SAMPLE_DELAY_US);
    }

    currentMAD = (madSum / (float)CHUNK_SIZE) * ANALOG_MAD_SCALE * micGain;

    // Peak tracking for UI graph and 24-hour bucket
    if (currentMAD > peakMADSincePoll) {
        peakMADSincePoll = currentMAD;
    }
    if ((uint16_t)currentMAD > currentBucketPeakMad) {
        currentBucketPeakMad = (uint16_t)min(65535.0f, currentMAD);
    }

    // Exponential smoothing envelope for LED feedback
    levelLP += motorSmooth * (currentMAD - levelLP);

    // Fast 3-chunk (~9.6ms) leaky debounce with 1-dip tolerance
    bool alertActive = (now < alertCooldownUntilMs);

    if (now > WARMUP_MS && !alertActive) {
        if (currentMAD > MAX_PLAUSIBLE_MAD) {
            chunksAbove = 0;
            consecutiveDips = 0;
        } else if (currentMAD >= threshold) {
            chunksAbove++;
            consecutiveDips = 0;
            if (chunksAbove >= MIN_TRIGGER_CHUNKS) {
                lastTriggerMAD = currentMAD;
                chunksAbove = 0;
                consecutiveDips = 0;
                triggerAlert(false);
            }
        } else if (chunksAbove > 0) {
            consecutiveDips++;
            if (consecutiveDips > MAX_ALLOWED_DIPS) {
                chunksAbove = 0;
                consecutiveDips = 0;
            }
        }
    } else {
        chunksAbove = 0;
        consecutiveDips = 0;
    }

    updateLED(levelLP, now < alertCooldownUntilMs);
}
