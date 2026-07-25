#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

namespace haxel {
class Config;
namespace core { class Engine; }

namespace web {

// Transport-agnostic JSON state/config helpers shared by WiFi + BLE.
void serializeState(ArduinoJson::JsonObject root, core::Engine* engine);
void applyStatePatch(JsonObjectConst patch, core::Engine* engine, Config* config = nullptr);
void applyConfigPatch(ArduinoJson::JsonObjectConst patch, Config* config, core::Engine* engine = nullptr,
                      bool persist = true);

bool configPatchNeedsReboot(ArduinoJson::JsonObjectConst patch);

// Compile + register a custom / studio pattern. empty errOut => success.
// studio_draft* ids skip LittleFS persistence (ephemeral live draft).
bool upsertCustomPattern(const char* id, const char* name, const char* code, String& errOut,
                         core::Engine* engine = nullptr);
bool deleteCustomPattern(const char* id, String& errOut, core::Engine* engine = nullptr);

} // namespace web
} // namespace haxel
