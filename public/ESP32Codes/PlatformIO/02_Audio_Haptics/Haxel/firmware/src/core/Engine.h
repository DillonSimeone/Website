#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/portmacro.h>
#include <freertos/queue.h>
#include "Pattern.h"

namespace haxel {
namespace hal { class IHapticDriver; }
namespace core {

class AudioAnalyzer;

enum class EngineState : uint8_t {
    IDLE = 0,
    PLAYING,
    AUDIO_REACTIVE,
    FAULT,
};

struct ChannelState {
    bool   on        = true;
    float  intensity = 1.0f;
    IPattern* patternOverride = nullptr; // nullptr -> use master pattern
};

struct StagedState {
    bool        on        = false;
    bool        mute      = false;
    float       intensity = 0.5f;
    float       speed     = 1.0f;
    IPattern*   pattern   = nullptr;
    ChannelState channels[8];
    uint8_t     channelCount = 1;
    bool        clearFault = false;
};

struct DiagSnapshot {
    uint32_t tickCount     = 0;
    uint32_t jitterP50_us  = 0;
    uint32_t jitterP99_us  = 0;
    uint32_t jitterMax_us  = 0;
    uint32_t lastTickUs    = 0;
    EngineState state      = EngineState::IDLE;
    const char* faultCode  = nullptr;
};

class Engine {
public:
    bool begin();
    void attachDriver(hal::IHapticDriver* drv);
    void attachAudio(AudioAnalyzer* audio);

    // Called at 1 kHz from engineTask.
    void tick();

    // Thread-safe: enqueue a state mutation; engine commits on next tick.
    bool stageState(const StagedState& s);

    // Direct sample injection for the "External" pattern.
    void pushExternal(uint8_t channel, float value01);

    // Snapshot for /json/diag. Lock-free read; values may be slightly stale.
    DiagSnapshot diag() const;

    // Read-only state for /json/state. Safe from any task.
    void copyState(StagedState& out) const;

    // Thread-safe getter for real-time channel duty values.
    float getChannelValue(uint8_t ch) const;

    EngineState state() const { return state_; }
    void raiseFault(const char* code);

private:
    void writeAllChannels(float masterTime_ms);
    void recordJitter(uint32_t tickUs);

    hal::IHapticDriver* driver_ = nullptr;
    AudioAnalyzer*      audio_  = nullptr;

    StagedState         active_;
    StagedState         staged_;
    bool                hasStaged_ = false;
    portMUX_TYPE        mux_ = portMUX_INITIALIZER_UNLOCKED;

    EngineState         state_ = EngineState::IDLE;
    const char*         faultCode_ = nullptr;
    uint32_t            tickCount_ = 0;
    uint32_t            lastTickUs_ = 0;

    // Per-channel external sample latches (for "External" pseudo-pattern).
    float               externalValues_[8] = {0};

    // Soft-start: per-channel last-written value, ramped toward target.
    float               lastWritten_[8] = {0};
    float               rampStepPerTick_ = 0.05f; // ≈20 ms 0→1

    // Reservoir-ish jitter samples for p50/p99 (last 1024).
    static constexpr size_t kJitterWindow = 256;
    uint16_t            jitter_us_[kJitterWindow] = {0};
    uint16_t            jitterIdx_ = 0;
};

} // namespace core
} // namespace haxel
