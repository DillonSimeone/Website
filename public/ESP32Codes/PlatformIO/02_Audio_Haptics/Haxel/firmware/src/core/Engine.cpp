#include "Engine.h"
#include "AudioAnalyzer.h"
#include "../hal/IHapticDriver.h"
#include <algorithm>

namespace haxel::core {

bool Engine::begin() {
    state_ = EngineState::IDLE;
    tickCount_ = 0;
    lastTickUs_ = micros();
    return true;
}

void Engine::attachDriver(hal::IHapticDriver* drv) {
    driver_ = drv;
    if (driver_) {
        active_.channelCount = driver_->channelCount();
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

DiagSnapshot Engine::diag() const {
    DiagSnapshot d;
    d.tickCount    = tickCount_;
    d.state        = state_;
    d.faultCode    = faultCode_;
    d.lastTickUs   = lastTickUs_;

    // Compute percentiles from window snapshot — cheap O(n log n).
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
    if (driver_) driver_->allOff();
}

void Engine::recordJitter(uint32_t tickUs) {
    uint32_t dt = tickUs - lastTickUs_;
    int32_t  jitter = (int32_t)dt - 1000;
    if (jitter < 0) jitter = -jitter;
    if (jitter > UINT16_MAX) jitter = UINT16_MAX;
    jitter_us_[jitterIdx_++ % kJitterWindow] = (uint16_t)jitter;
    lastTickUs_ = tickUs;
}

void Engine::tick() {
    uint32_t startUs = micros();
    recordJitter(startUs);
    tickCount_++;

    // 1. Commit staged state, if any.
    if (hasStaged_) {
        portENTER_CRITICAL(&mux_);
        if (staged_.clearFault && state_ == EngineState::FAULT) {
            state_ = EngineState::IDLE;
            faultCode_ = nullptr;
        }
        active_ = staged_;
        hasStaged_ = false;
        portEXIT_CRITICAL(&mux_);
    }

    if (state_ == EngineState::FAULT) return;

    // 2. Determine engine state.
    if (!active_.on || !active_.pattern || !driver_) {
        state_ = EngineState::IDLE;
        if (driver_) driver_->allOff();
        return;
    }
    state_ = (active_.pattern && active_.pattern->usesAudio() && audio_ && audio_->ready())
                 ? EngineState::AUDIO_REACTIVE
                 : EngineState::PLAYING;

    // 3. Evaluate + write.
    float patternTimeMs = (tickCount_) * active_.speed;
    writeAllChannels(patternTimeMs);
}

void Engine::writeAllChannels(float tMs) {
    PatternContext ctx;
    ctx.tMs = tMs;
    ctx.intensityMaster = active_.intensity;
    ctx.audio = audio_ ? audio_->latest() : AudioFrame{};
    ctx.externalValues = externalValues_;

    uint8_t n = std::min<uint8_t>(active_.channelCount, driver_->channelCount());
    for (uint8_t ch = 0; ch < n; ++ch) {
        const ChannelState& cs = active_.channels[ch];
        if (!cs.on) {
            driver_->write(ch, 0.0f);
            lastWritten_[ch] = 0.0f;
            continue;
        }
        ctx.channelIndex = ch;
        IPattern* p = cs.patternOverride ? cs.patternOverride : active_.pattern;
        float v = p->sample(ctx);
        v *= cs.intensity * active_.intensity;
        if (active_.mute) v = 0.0f;

        // Soft-start: rate-limit deltas.
        float prev = lastWritten_[ch];
        float delta = v - prev;
        if (delta >  rampStepPerTick_) v = prev + rampStepPerTick_;
        if (delta < -rampStepPerTick_) v = prev - rampStepPerTick_;
        lastWritten_[ch] = v;
        driver_->write(ch, v);
    }
}

} // namespace haxel::core
