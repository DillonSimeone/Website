#pragma once

#include "Engine.h"

namespace haxel::core {

// Persists play/runtime settings across reboots (/runtime.json).
struct RuntimeSnapshot {
    bool        on = true;
    bool        mute = false;
    float       intensity = 0.6f;
    float       speed = 1.0f;
    float       startupFloor = 0.35f;
    char        patternId[32] = "Breath";
    uint8_t     numBins = 3;
    uint8_t     dividers[4] = {8, 18, 24, 28};
    char        binPatterns[5][32] = {"none", "Pulse", "Rumble", "none", "none"};
};

bool loadRuntime(RuntimeSnapshot& out);
bool saveRuntime(const RuntimeSnapshot& in);
void markRuntimeDirty(const StagedState& s);
void flushRuntimeIfDirty();

} // namespace haxel::core
