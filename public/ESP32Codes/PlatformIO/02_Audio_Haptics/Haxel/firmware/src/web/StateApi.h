#pragma once

#include <ArduinoJson.h>

namespace haxel {
class Config;
namespace core { class Engine; }

namespace web {

// Transport-agnostic JSON state/config helpers shared by WiFi + BLE.
void serializeState(ArduinoJson::JsonObject root, core::Engine* engine);
void applyStatePatch(ArduinoJson::JsonObjectConst patch, core::Engine* engine);
void applyConfigPatch(ArduinoJson::JsonObjectConst patch, Config* config);

} // namespace web
} // namespace haxel
