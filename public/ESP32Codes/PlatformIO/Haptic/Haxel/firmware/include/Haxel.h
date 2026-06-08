#pragma once

// Umbrella header — pulls in the public-facing pieces of Haxel
// for consumers that just want one #include.

#include "../src/core/Engine.h"
#include "../src/core/Config.h"
#include "../src/core/Pattern.h"
#include "../src/core/PatternRegistry.h"
#include "../src/core/AudioAnalyzer.h"
#include "../src/hal/IHapticDriver.h"
#include "../src/hal/DriverFactory.h"
#include "../src/patterns/Patterns.h"
#include "../src/web/WebServer.h"

#ifndef HAXEL_VERSION_STR
#define HAXEL_VERSION_STR "1.0.0-dev"
#endif

namespace haxel {
constexpr const char* kVersion = HAXEL_VERSION_STR;
constexpr uint16_t    kMaxChannels = 4;
constexpr uint16_t    kEngineTickHz = 1000;
constexpr uint16_t    kMaxPresets = 16;
} // namespace haxel
