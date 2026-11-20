#pragma once

#include "PatternEngine.h"

class DeviceConfig {
public:
    bool begin();
    void load(DeviceState& state);
    void save(const DeviceState& state);

    String bleDeviceName(const DeviceState& state) const;

private:
    bool ready_ = false;
};
