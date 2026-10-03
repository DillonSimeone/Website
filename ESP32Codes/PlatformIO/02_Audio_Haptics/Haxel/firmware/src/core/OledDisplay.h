#pragma once

#include <Arduino.h>
#include "Config.h"
#include "Engine.h"

namespace haxel::core {

class OledDisplay {
public:
    bool begin(Config* config, Engine* engine);
    void end();
    void sample();
    void tick();

private:
    void draw_();
    void appendKnobSegment_(char* line, size_t cap, const KnobConfig& k,
                            const StagedState& s) const;

    static constexpr int kWaveW = 128;
    static constexpr int kWaveH = 36;
    static constexpr int kTextH = 18;  // two 8px text rows + divider

    Config*  config_ = nullptr;
    Engine*  engine_ = nullptr;
    void*    display_ = nullptr;  // Adafruit_SSD1306*
    bool     ready_  = false;
    uint8_t  wave_[kWaveW] = {};
    uint8_t  waveIdx_ = 0;
};

} // namespace haxel::core
