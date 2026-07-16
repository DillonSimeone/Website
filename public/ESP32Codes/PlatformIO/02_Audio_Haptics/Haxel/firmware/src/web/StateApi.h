#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

namespace haxel {
class Config;
namespace core { class Engine; }

namespace web {

// Transport-agnostic JSON state/config helpers shared by WiFi + BLE.
void serializeState(ArduinoJson::JsonObject root, core::Engine* engine);
void applyStatePatch(ArduinoJson::JsonObjectConst patch, core::Engine* engine);
void applyConfigPatch(ArduinoJson::JsonObjectConst patch, Config* config);

// Compile + register a custom / studio pattern. empty errOut => success.
// studio_draft* ids skip LittleFS persistence (ephemeral live draft).
bool upsertCustomPattern(const char* id, const char* name, const char* code, String& errOut);
bool deleteCustomPattern(const char* id, String& errOut);

} // namespace web
} // namespace haxel
