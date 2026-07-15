#include "Engine.h"
#include "AudioAnalyzer.h"
#include "PatternRegistry.h"
#include "../hal/IHapticDriver.h"
#include <algorithm>
#include <cstring>

namespace haxel::core {

bool Engine::begin() {
    state_ = EngineState::IDLE;
    tickCount_ = 0;
    lastTickUs_ = micros();
    wasIdle_ = true;
    if (!cmdQ_) {
        cmdQ_ = xQueueCreate(16, sizeof(EngineCmd));
    }
    return cmdQ_ != nullptr;
}

void Engine::attachDriver(hal::IHapticDriver* drv) {
    driver_ = drv;
    if (driver_) {
        active_.channelCount = driver_->channelCount();
        if (state_ == EngineState::FAULT && faultCode_ && strcmp(faultCode_, "no_driver") == 0) {
            state_ = EngineState::IDLE;
            faultCode_ = nullptr;
        }
    } else {
        raiseFault("no_driver");
    }
}

void Engine::attachAudio(AudioAnalyzer* audio) { audio_ = audio; }

bool Engine::stageState(const StagedState& s) {
    portENTER_CRITICAL(&mux_);
    staged_ = s;
    hasStaged_ = true;
    portEXIT_CRITICAL(&mux_);
    return true;
}

bool Engine::requestEStop() {
    if (!cmdQ_) return false;
    EngineCmd c{EngineCmdType::Estop};
    if (xQueueSend(cmdQ_, &c, 0) == pdTRUE) return true;
    // Queue full: drop oldest and retry so Estop always lands.
    EngineCmd discarded;
    xQueueReceive(cmdQ_, &discarded, 0);
    return xQueueSend(cmdQ_, &c, 0) == pdTRUE;
}

bool Engine::requestClearFault() {
    if (!cmdQ_) return false;
    EngineCmd c{EngineCmdType::ClearFault};
    return xQueueSend(cmdQ_, &c, 0) == pdTRUE;
}

void Engine::pushExternal(uint8_t channel, float value01) {
    if (channel >= 8) return;
    if (value01 < 0) value01 = 0;
    if (value01 > 1) value01 = 1;
    externalValues_[channel] = value01;
}

void Engine::copyState(StagedState& out) const {
    portENTER_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    out = active_;
    portEXIT_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
}

float Engine::getChannelValue(uint8_t ch) const {
    if (ch >= 8) return 0.0f;
    portENTER_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    float v = lastWritten_[ch];
    portEXIT_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    return v < 0.0f ? -v : v;
}

float Engine::getPatternValue(uint8_t ch) const {
    if (ch >= 8) return 0.0f;
    portENTER_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    float v = lastPattern_[ch];
    portEXIT_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    return v < 0.0f ? -v : v;
}

DiagSnapshot Engine::diag() const {
    DiagSnapshot d;
    d.tickCount    = tickCount_;
    d.state        = state_;
    d.faultCode    = faultCode_;
    d.lastTickUs   = lastTickUs_;
    d.queueDepth   = cmdQ_ ? (uint32_t)uxQueueMessagesWaiting(cmdQ_) : 0;

    uint16_t tmp[kJitterWindow];
    memcpy(tmp, jitter_us_, sizeof(tmp));
    std::sort(tmp, tmp + kJitterWindow);
    d.jitterP50_us = tmp[kJitterWindow / 2];
    d.jitterP99_us = tmp[(kJitterWindow * 99) / 100];
    d.jitterMax_us = tmp[kJitterWindow - 1];
    return d;
}

void Engine::raiseFault(const char* code) {
    state_ = EngineState::FAULT;
    faultCode_ = code;
    hardAllOff_();
}

void Engine::hardAllOff_() {
    if (driver_) driver_->allOff();
    for (int i = 0; i < 8; ++i) {
        lastWritten_[i] = 0.0f;
        lastPattern_[i] = 0.0f;
    }
}

void Engine::recordJitter(uint32_t tickUs) {
    uint32_t dt = tickUs - lastTickUs_;
    int32_t  jitter = (int32_t)dt - 1000;
    if (jitter < 0) jitter = -jitter;
    if (jitter > UINT16_MAX) jitter = UINT16_MAX;
    jitter_us_[jitterIdx_++ % kJitterWindow] = (uint16_t)jitter;
    lastTickUs_ = tickUs;
}

void Engine::drainCommands_() {
    if (!cmdQ_) return;
    EngineCmd cmd;
    while (xQueueReceive(cmdQ_, &cmd, 0) == pdTRUE) {
        switch (cmd.type) {
            case EngineCmdType::Estop:
                portENTER_CRITICAL(&mux_);
                active_.on = false;
                active_.mute = true;
                staged_.on = false;
                staged_.mute = true;
                portEXIT_CRITICAL(&mux_);
                raiseFault("estop");
                wasIdle_ = true;
                break;
            case EngineCmdType::ClearFault:
                if (state_ == EngineState::FAULT) {
                    state_ = EngineState::IDLE;
                    faultCode_ = nullptr;
                    wasIdle_ = true;
                }
                break;
        }
    }
}

void Engine::tick() {
    uint32_t startUs = micros();
    recordJitter(startUs);
    tickCount_++;

    // 1. Discrete FreeRTOS commands (estop / clear) — never dropped silently.
    drainCommands_();

    // 2. Commit staged state, if any.
    if (hasStaged_) {
        portENTER_CRITICAL(&mux_);
        if (staged_.clearFault && state_ == EngineState::FAULT) {
            state_ = EngineState::IDLE;
            faultCode_ = nullptr;
            staged_.clearFault = false;
        }
        active_ = staged_;
        hasStaged_ = false;
        portEXIT_CRITICAL(&mux_);
    }

    if (state_ == EngineState::FAULT) return;

    // 3. Determine engine state.
    if (!active_.on || !active_.pattern || !driver_) {
        if (!wasIdle_) {
            if (driver_) driver_->allOff();
            for (int i = 0; i < 8; ++i) {
                lastWritten_[i] = 0.0f;
                lastPattern_[i] = 0.0f;
            }
            wasIdle_ = true;
        }
        state_ = EngineState::IDLE;
        return;
    }
    wasIdle_ = false;
    state_ = (active_.pattern && active_.pattern->usesAudio() && audio_ && audio_->ready())
                 ? EngineState::AUDIO_REACTIVE
                 : EngineState::PLAYING;

    // 4. Evaluate + write.
    float patternTimeMs = (tickCount_) * active_.speed;
    writeAllChannels(patternTimeMs);
}

void Engine::writeAllChannels(float tMs) {
    PatternContext ctx;
    ctx.tMs = tMs;
    ctx.intensityMaster = active_.intensity;
    ctx.speed = active_.speed;
    ctx.startupFloor = active_.startupFloor;
    ctx.audio = audio_ ? audio_->latest() : AudioFrame{};
    ctx.externalValues = externalValues_;

    float maxDuty = 1.0f;
    float minDuty = 0.0f;
    if (driver_) {
        const auto caps = driver_->capabilities();
        maxDuty = caps.maxRecommendedDuty > 0.0f ? caps.maxRecommendedDuty : 1.0f;
        minDuty = caps.minDuty;
    }

    uint8_t n = std::min<uint8_t>(active_.channelCount, driver_->channelCount());
    for (uint8_t ch = 0; ch < n; ++ch) {
        const ChannelState& cs = active_.channels[ch];
        if (!cs.on || active_.mute) {
            // Mute / channel-off snap to zero (bypass soft-start for stop feel).
            lastWritten_[ch] = 0.0f;
            lastPattern_[ch] = 0.0f;
            driver_->write(ch, 0.0f);
            continue;
        }
        ctx.channelIndex = ch;
        IPattern* p = cs.patternOverride ? cs.patternOverride : active_.pattern;

        float v = 0.0f;
        if (state_ == EngineState::AUDIO_REACTIVE && p && p->usesAudio()) {
            float maxAmp = 0.0f;
            for (int i = 0; i < active_.numBins; ++i) {
                int startIdx = (i == 0) ? 0 : active_.dividers[i - 1];
                int endIdx = (i == active_.numBins - 1) ? 32 : active_.dividers[i];
                int len = endIdx - startIdx;
                if (len < 1) len = 1;

                float sum = 0.0f;
                for (int b = startIdx; b < endIdx && b < 32; ++b) {
                    sum += ctx.audio.mags[b];
                }
                float vol = (sum / len) * (ctx.audio.rms * 4.0f * 0.45f);

                const char* patId = active_.binPatterns[i];
                if (strcmp(patId, "none") != 0 && strlen(patId) > 0) {
                    IPattern* binPat = PatternRegistry::instance().find(patId);
                    if (binPat) {
                        float out = vol * binPat->sample(ctx);
                        if (out > maxAmp) maxAmp = out;
                    }
                }
            }
            v = maxAmp;
        } else if (p) {
            v = p->sample(ctx);
        }

        v *= cs.intensity * active_.intensity;
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        // Capture pattern envelope before motor-floor / soft-start for LEDs.
        lastPattern_[ch] = v;

        // Apply Motor Startup Floor Calibration (actuator only).
        if (v > 0.001f) {
            v = active_.startupFloor + v * (1.0f - active_.startupFloor);
            if (minDuty > 0.0f && v < minDuty) v = minDuty;
        }

        if (v > maxDuty) v = maxDuty;

        // Soft-start: rate-limit deltas on rising/falling play path.
        float prev = lastWritten_[ch];
        float delta = v - prev;
        if (delta >  rampStepPerTick_) v = prev + rampStepPerTick_;
        if (delta < -rampStepPerTick_) v = prev - rampStepPerTick_;
        lastWritten_[ch] = v;
        driver_->write(ch, v);
    }
}

} // namespace haxel::core
