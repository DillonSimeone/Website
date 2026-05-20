#pragma once

#include "../core/PatternRegistry.h"

namespace hapticblaze::patterns {

// Register every built-in pattern with the registry. Called once at boot.
void registerAll(hapticblaze::core::PatternRegistry& reg);

} // namespace hapticblaze::patterns
