#pragma once

#include <Arduino.h>
#include "Config.h"
#include "Engine.h"

namespace haxel::core {

class AudioAnalyzer;

class KnobController {
public:
    bool begin(Config* config, Engine* engine, AudioAnalyzer* audio = nullptr);
    void tick();

private:
    float readKnob01_(int8_t pin) const;
    void applyKnob_(const KnobConfig& knob, float value01);

    Config*         config_ = nullptr;
    Engine*         engine_ = nullptr;
    AudioAnalyzer*  audio_  = nullptr;
    bool            ready_  = false;
    float           lastSent_[Config::kMaxKnobs] = {};
};

} // namespace haxel::core
