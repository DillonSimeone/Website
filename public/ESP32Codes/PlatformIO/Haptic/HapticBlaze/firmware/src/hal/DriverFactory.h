#pragma once

#include "IHapticDriver.h"

namespace hapticblaze::hal {

class DriverFactory {
public:
    // Returns a fresh driver instance owned by the factory's static cache.
    // Calling create() again with a different kind tears down the previous one.
    static IHapticDriver* create(DriverKind kind);
};

} // namespace hapticblaze::hal
