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

// Fast leaky debounce state
inline int chunksAbove     = 0;
inline int consecutiveDips = 0;

// High-speed Diagnostic Flight Recorder capture state
inline bool          diagCaptureActive    = false;
inline unsigned long diagEventStartMs     = 0;
inline unsigned long lastDiagNonTriggerMs = 0;
inline uint16_t      diagEventPeakMad     = 0;
inline uint8_t       diagEventChunksAbove = 0;
inline uint8_t       diagQuietChunks      = 0;
inline bool          diagHitCooldown      = false;
inline uint16_t      diagCooldownRemMs    = 0;
inline uint16_t      diagTraceBuf[DIAG_TRACE_CHUNKS] = {0};
inline uint8_t       diagTraceLen         = 0;

inline bool isAudioMidTrigger() {
    return chunksAbove > 0;
}

// ============================================================
//  MAX4466 Analog Audio & Onboard LED Setup
// ============================================================
inline void setupAudio() {
    pinMode(MIC_GND_PIN, OUTPUT);
    digitalWrite(MIC_GND_PIN, LOW);

    pinMode(MIC_ANALOG_PIN, INPUT);
    analogReadResolution(12); // 0-4095
    analogSetPinAttenuation(MIC_ANALOG_PIN, ADC_11db); // Full range ~0 - 3.1V

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
//  Single-Pass Low-Latency Audio Capture, Leaky Debounce & Flight Recorder
// ============================================================
inline void sampleAndProcessAudio(unsigned long now) {
    float madSum = 0.0f;

    // Single-pass capture + IIR DC-blocking filter + MAD accumulation (~3.2ms)
    for (int i = 0; i < CHUNK_SIZE; i++) {
        float inSample = (float)analogRead(MIC_ANALOG_PIN);
        float outSample = inSample - lastInputSample + (DC_FILTER_R * lastOutputSample);
        lastInputSample = inSample;
        lastOutputSample = outSample;
        madSum += fabsf(outSample);
        delayMicroseconds(SAMPLE_DELAY_US);
    }

    currentMAD = (madSum / (float)CHUNK_SIZE) * ANALOG_MAD_SCALE * micGain;
    uint16_t clampedMad = (uint16_t)min(65535.0f, currentMAD);

    // Peak tracking for UI graph and 24-hour bucket
    if (currentMAD > peakMADSincePoll) {
        peakMADSincePoll = currentMAD;
    }
    if (clampedMad > currentBucketPeakMad) {
        currentBucketPeakMad = clampedMad;
    }

    // Exponential smoothing envelope for LED feedback
    levelLP += motorSmooth * (currentMAD - levelLP);

    bool alertActive = (now < alertCooldownUntilMs);
    uint8_t reqChunks = constrain(debounceChunks, 1, 8);
    float nearMissFloor = (float)threshold * 0.78f;

    if (now > WARMUP_MS && currentMAD <= MAX_PLAUSIBLE_MAD) {
        // 1. Track high-speed diagnostic trace whenever signal approaches/crosses threshold
        if (currentMAD >= nearMissFloor) {
            if (!diagCaptureActive) {
                diagCaptureActive    = true;
                diagEventStartMs     = now;
                diagEventPeakMad     = clampedMad;
                diagEventChunksAbove = 0;
                diagQuietChunks      = 0;
                diagHitCooldown      = false;
                diagCooldownRemMs    = 0;
                diagTraceLen         = 0;
            }
            if (clampedMad > diagEventPeakMad) diagEventPeakMad = clampedMad;
            if (diagTraceLen < DIAG_TRACE_CHUNKS) {
                diagTraceBuf[diagTraceLen++] = clampedMad;
            }
            if (currentMAD >= threshold) {
                diagEventChunksAbove++;
                if (alertActive && !diagHitCooldown) {
                    diagHitCooldown   = true;
                    diagCooldownRemMs = (uint16_t)min(65535UL, alertCooldownUntilMs - now);
                }
            }
            diagQuietChunks = 0;
        } else if (diagCaptureActive) {
            if (diagTraceLen < DIAG_TRACE_CHUNKS) {
                diagTraceBuf[diagTraceLen++] = clampedMad;
            }
            diagQuietChunks++;
        }

        // 2. Active Trigger Evaluation (when not in cooldown)
        if (!alertActive) {
            if (currentMAD >= threshold) {
                chunksAbove++;
                consecutiveDips = 0;
                if (chunksAbove >= reqChunks) {
                    lastTriggerMAD = currentMAD;
                    uint16_t evtDur = (uint16_t)max(3UL, now - diagEventStartMs + 3);
                    recordDiagEvent(DIAG_TRIGGERED, max(clampedMad, diagEventPeakMad),
                                    chunksAbove, reqChunks, evtDur, 0, diagTraceBuf, diagTraceLen);
                    chunksAbove = 0;
                    consecutiveDips = 0;
                    diagCaptureActive = false;
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

        // 3. Finalize non-trigger diagnostic event once signal settles (or trace fills)
        if (diagCaptureActive && (diagQuietChunks >= 3 || (now - diagEventStartMs >= 80))) {
            if (now - lastDiagNonTriggerMs >= 350) {
                uint16_t evtDur = (uint16_t)min(65535UL, max(3UL, now - diagEventStartMs));
                if (diagHitCooldown && diagEventChunksAbove > 0) {
                    recordDiagEvent(DIAG_BLOCKED_COOLDOWN, diagEventPeakMad,
                                    diagEventChunksAbove, reqChunks, evtDur, diagCooldownRemMs,
                                    diagTraceBuf, diagTraceLen);
                    lastDiagNonTriggerMs = now;
                } else if (diagEventChunksAbove > 0) {
                    recordDiagEvent(DIAG_REJECTED_SHORT, diagEventPeakMad,
                                    diagEventChunksAbove, reqChunks, evtDur, 0,
                                    diagTraceBuf, diagTraceLen);
                    lastDiagNonTriggerMs = now;
                } else if (diagEventPeakMad >= (uint16_t)(threshold * 0.82f)) {
                    recordDiagEvent(DIAG_NEAR_MISS, diagEventPeakMad,
                                    0, reqChunks, evtDur, 0,
                                    diagTraceBuf, diagTraceLen);
                    lastDiagNonTriggerMs = now;
                }
            }
            diagCaptureActive = false;
        }
    } else {
        chunksAbove = 0;
        consecutiveDips = 0;
        diagCaptureActive = false;
    }

    updateLED(levelLP, now < alertCooldownUntilMs);
}
