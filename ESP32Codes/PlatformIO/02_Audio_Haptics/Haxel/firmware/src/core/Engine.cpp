#include "Engine.h"
#include "AudioAnalyzer.h"
#include "PatternRegistry.h"
#include "../hal/IHapticDriver.h"
#include <algorithm>
#include <cmath>
#include <cstring>

namespace haxel::core {

bool Engine::begin() {
    state_ = EngineState::IDLE;
    tickCount_ = 0;
    lastTickUs_ = micros();
    lastTickDeltaUs_ = kTargetTickUs;
    patternTimeMs_ = 0.0;
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

void Engine::pushRemoteAudio(const AudioFrame& frame) {
    portENTER_CRITICAL(&mux_);
    remoteAudio_ = frame;
    remoteAudioMs_ = millis();
    portEXIT_CRITICAL(&mux_);
}

bool Engine::hasRemoteAudio(uint32_t maxAgeMs) const {
    portENTER_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    const bool ok = remoteAudio_.valid && (millis() - remoteAudioMs_) <= maxAgeMs;
    portEXIT_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    return ok;
}

bool Engine::copyRemoteAudio(AudioFrame& out, uint32_t maxAgeMs) const {
    portENTER_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    const bool ok = remoteAudio_.valid && (uint32_t)(millis() - remoteAudioMs_) <= maxAgeMs;
    if (ok) out = remoteAudio_;
    portEXIT_CRITICAL(const_cast<portMUX_TYPE*>(&mux_));
    return ok;
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

void Engine::detachPatternById(const char* id) {
    replacePatternById(id, nullptr);
}

void Engine::replacePatternById(const char* id, IPattern* replacement) {
    if (!id || !id[0]) return;
    portENTER_CRITICAL(&mux_);
    auto replaceIfMatch = [id, replacement](IPattern*& slot) {
        if (slot && strcmp(slot->id(), id) == 0) slot = replacement;
    };
    replaceIfMatch(active_.pattern);
    replaceIfMatch(staged_.pattern);
    for (int i = 0; i < 8; ++i) {
        replaceIfMatch(active_.channels[i].patternOverride);
        replaceIfMatch(staged_.channels[i].patternOverride);
    }
    portEXIT_CRITICAL(&mux_);
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
    lastTickDeltaUs_ = dt;
    int32_t  jitter = (int32_t)dt - (int32_t)kTargetTickUs;
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

    auto& reg = PatternRegistry::instance();
    reg.lockEval();
    if (active_.pattern && !reg.contains(active_.pattern)) {
        active_.pattern = nullptr;
    }

    // 3. Determine engine state.
    if (!active_.on || (!active_.pattern && !active_.audioReactive) || !driver_) {
        reg.unlockEval();
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
    const bool localAudioReady = (audio_ && audio_->ready() && audio_->latest().valid);
    const bool audioOk = active_.audioReactive || ((active_.pattern && active_.pattern->usesAudio()) &&
                         (localAudioReady || hasRemoteAudio(400)));
    state_ = audioOk ? EngineState::AUDIO_REACTIVE : EngineState::PLAYING;

    // 4. Evaluate + write.
    float dtMs = (float)lastTickDeltaUs_ * 0.001f;
    if (dtMs < 0.5f) dtMs = 0.5f;
    if (dtMs > 50.0f) dtMs = 50.0f;
    patternTimeMs_ += (double)dtMs * (double)active_.speed;
    writeAllChannels(patternTimeMs_, dtMs);
    reg.unlockEval();
}

void Engine::writeAllChannels(double tMs, float dtMs) {
    PatternContext ctx;
    ctx.tMs = tMs;
    ctx.intensityMaster = active_.intensity;
    ctx.speed = active_.speed;
    ctx.freq = active_.freq;
    ctx.startupFloor = active_.startupFloor;
    // Prefer active local hardware audio (with a valid FFT frame); fall back to remote audio (mesh / browser).
    if (audio_ && audio_->ready()) {
        AudioFrame af = audio_->latest();
        if (af.valid) {
            ctx.audio = af;
        } else if (!copyRemoteAudio(ctx.audio, 400)) {
            ctx.audio = AudioFrame{};
        }
    } else if (!copyRemoteAudio(ctx.audio, 400)) {
        ctx.audio = AudioFrame{};
    }
    ctx.externalValues = externalValues_;

    float maxDuty = 1.0f;
    float minDuty = 0.0f;
    if (driver_) {
        const auto caps = driver_->capabilities();
        maxDuty = caps.maxRecommendedDuty > 0.0f ? caps.maxRecommendedDuty : 1.0f;
        minDuty = caps.minDuty;
    }

    auto& reg = PatternRegistry::instance();
    reg.lockEval();

    uint8_t n = std::min<uint8_t>(active_.channelCount, driver_->channelCount());
    const uint8_t numBins = std::max<uint8_t>(1, std::min<uint8_t>(5, active_.numBins));

    for (uint8_t ch = 0; ch < n; ++ch) {
        const ChannelState& cs = active_.channels[ch];
        if (!cs.on || active_.mute) {
            // Mute / channel-off snap to zero (bypass soft-start for stop feel).
            lastWritten_[ch] = 0.0f;
            lastPattern_[ch] = 0.0f;
            driver_->write(ch, 0.0f);
            continue;
        }
        const bool synced = cs.synced;
        const float chSpeed = synced ? active_.speed : cs.speed;
        const float chIntensity = synced ? active_.intensity : cs.intensity;
        const float chFloor = synced ? active_.startupFloor : cs.startupFloor;
        const float chCeil = synced ? 1.0f : cs.ceiling;
        if (!synced) {
            channelTimeMs_[ch] += (double)dtMs * (double)chSpeed;
        } else {
            channelTimeMs_[ch] = tMs;
        }

        PatternContext chCtx = ctx;
        chCtx.channelIndex = ch;
        chCtx.tMs = synced ? tMs : channelTimeMs_[ch];
        chCtx.speed = chSpeed;
        chCtx.intensityMaster = chIntensity;
        chCtx.startupFloor = chFloor;

        IPattern* p = (!synced && cs.patternOverride) ? cs.patternOverride
                      : (cs.patternOverride ? cs.patternOverride : active_.pattern);
        if (p && !reg.contains(p)) p = nullptr;

        float v = 0.0f;
        if (active_.audioReactive) {
            if (!chCtx.audio.valid) {
                v = 0.0f;
            } else {
                float maxAmp = 0.0f;
                for (int i = 0; i < numBins; ++i) {
                    int startIdx = (i == 0) ? 0 : active_.dividers[i - 1];
                    int endIdx = (i == numBins - 1) ? 32 : active_.dividers[i];
                    if (startIdx < 0) startIdx = 0;
                    if (startIdx > 31) startIdx = 31;
                    if (endIdx < startIdx + 1) endIdx = startIdx + 1;
                    if (endIdx > 32) endIdx = 32;
                    int len = endIdx - startIdx;

                    float sum = 0.0f;
                    for (int b = startIdx; b < endIdx; ++b) {
                        sum += chCtx.audio.mags[b];
                    }
                    float vol = (sum / (float)len) * (chCtx.audio.rms * 4.0f * 0.45f);

                    const char* patId = active_.binPatterns[i];
                    if (strcmp(patId, "none") != 0 && strlen(patId) > 0) {
                        IPattern* binPat = reg.find(patId);
                        if (binPat) {
                            float sampleVal = binPat->sample(chCtx);
                            if (!std::isfinite(sampleVal)) sampleVal = 0.0f;
                            float out = vol * sampleVal;
                            if (out > maxAmp) maxAmp = out;
                        }
                    }
                }
                v = maxAmp;
            }
        } else if (p) {
            v = p->sample(chCtx);
        }

        v *= chIntensity;
        if (!std::isfinite(v)) v = 0.0f;
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        // Capture pattern envelope before motor-floor / soft-start for LEDs.
        lastPattern_[ch] = v;

        // Apply Motor Startup Floor & Ceiling Calibration (actuator only).
        if (v > 0.001f) {
            float span = chCeil - chFloor;
            if (span < 0.0f) span = 0.0f;
            v = chFloor + v * span;
            if (minDuty > 0.0f && v < minDuty) v = minDuty;
        }

        if (v > chCeil) v = chCeil;
        if (v > maxDuty) v = maxDuty;

        // Soft-start: rate-limit deltas on rising/falling play path.
        float prev = std::isfinite(lastWritten_[ch]) ? lastWritten_[ch] : 0.0f;
        float delta = v - prev;
        float rampStep = rampStepPerTick_ * dtMs;
        if (delta >  rampStep) v = prev + rampStep;
        if (delta < -rampStep) v = prev - rampStep;

        lastWritten_[ch] = v;
        driver_->write(ch, v);
    }

    reg.unlockEval();
}

} // namespace haxel::core
