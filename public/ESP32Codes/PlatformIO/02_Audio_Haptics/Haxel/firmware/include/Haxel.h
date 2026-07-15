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

#ifdef HAXEL_WIFI
#include "../src/web/WebServer.h"
#endif

#ifndef HAXEL_VERSION_STR
#define HAXEL_VERSION_STR "1.2.0-dev"
#endif

// Optional hardware modules — overridden per PlatformIO env.
//   LED    : FastLED strip mirrors pattern envelope (pre motor-floor)
//   AUDIO  : I2S/ADC FFT analyzer + reactive patterns
//   KNOBS  : ADC knobs → intensity/speed/pattern
//   OLED   : SSD1306 status + waveform HUD
#ifndef HAXEL_FEATURE_LED
#define HAXEL_FEATURE_LED 0
#endif
#ifndef HAXEL_FEATURE_AUDIO
#define HAXEL_FEATURE_AUDIO 0
#endif
#ifndef HAXEL_FEATURE_KNOBS
#define HAXEL_FEATURE_KNOBS 0
#endif
#ifndef HAXEL_FEATURE_OLED
#define HAXEL_FEATURE_OLED 0
#endif

namespace haxel {
constexpr const char* kVersion = HAXEL_VERSION_STR;
constexpr uint16_t    kMaxChannels = 4;
constexpr uint16_t    kEngineTickHz = 1000;
constexpr uint16_t    kMaxPresets = 16;
} // namespace haxel
