#pragma once

#include "../core/PatternRegistry.h"

namespace haxel::patterns {

// Register every built-in pattern with the registry. Called once at boot.
void registerAll(haxel::core::PatternRegistry& reg);

// Load/save custom patterns from LittleFS.
void loadCustomPatterns(haxel::core::PatternRegistry& reg);
void saveCustomPatterns(const haxel::core::PatternRegistry& reg);

} // namespace haxel::patterns
