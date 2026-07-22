#include "RuntimeStore.h"
#include "PatternRegistry.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <cstring>

namespace haxel::core {

static constexpr const char* kRuntimePath    = "/runtime.json";
static constexpr const char* kRuntimeTmpPath = "/runtime.json.tmp";

static bool            sDirty = false;
static uint32_t        sDirtyMs = 0;
static RuntimeSnapshot sPending{};

static void snapshotFromState_(const StagedState& s, RuntimeSnapshot& out) {
    out.on = s.on;
    out.mute = s.mute;
    out.intensity = s.intensity;
    out.speed = s.speed;
    out.startupFloor = s.startupFloor;
    out.numBins = s.numBins;
    for (int i = 0; i < 4; ++i) out.dividers[i] = s.dividers[i];
    for (int i = 0; i < 5; ++i) {
        strncpy(out.binPatterns[i], s.binPatterns[i], sizeof(out.binPatterns[i]) - 1);
        out.binPatterns[i][sizeof(out.binPatterns[i]) - 1] = '\0';
    }
    const char* pid = (s.pattern && s.pattern->id()) ? s.pattern->id() : "Breath";
    strncpy(out.patternId, pid, sizeof(out.patternId) - 1);
    out.patternId[sizeof(out.patternId) - 1] = '\0';
}

bool loadRuntime(RuntimeSnapshot& out) {
    File f = LittleFS.open(kRuntimePath, "r");
    if (!f) return false;
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        log_e("runtime.json parse failed: %s", err.c_str());
        return false;
    }

    out.on = doc["on"] | true;
    out.mute = doc["mute"] | false;
    out.intensity = doc["intensity"] | 0.6f;
    out.speed = doc["speed"] | 1.0f;
    out.startupFloor = doc["startupFloor"] | 0.35f;
    out.numBins = (uint8_t)(doc["numBins"] | 3);
    const char* pid = doc["pattern"] | "Breath";
    strncpy(out.patternId, pid, sizeof(out.patternId) - 1);
    out.patternId[sizeof(out.patternId) - 1] = '\0';

    if (JsonArrayConst divs = doc["dividers"].as<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : divs) {
            if (i < 4) out.dividers[i++] = (uint8_t)v.as<int>();
        }
    }
    if (JsonArrayConst bins = doc["binPatterns"].as<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : bins) {
            if (i < 5) {
                const char* b = v.as<const char*>();
                if (!b) b = "none";
                strncpy(out.binPatterns[i], b, sizeof(out.binPatterns[i]) - 1);
                out.binPatterns[i][sizeof(out.binPatterns[i]) - 1] = '\0';
                i++;
            }
        }
    }
    return true;
}

bool saveRuntime(const RuntimeSnapshot& in) {
    JsonDocument doc;
    doc["on"] = in.on;
    doc["mute"] = in.mute;
    doc["intensity"] = in.intensity;
    doc["speed"] = in.speed;
    doc["startupFloor"] = in.startupFloor;
    doc["pattern"] = in.patternId;
    doc["numBins"] = in.numBins;
    auto divs = doc["dividers"].to<JsonArray>();
    for (int i = 0; i < in.numBins - 1 && i < 4; ++i) divs.add(in.dividers[i]);
    auto bins = doc["binPatterns"].to<JsonArray>();
    for (int i = 0; i < in.numBins && i < 5; ++i) bins.add(in.binPatterns[i]);

    String serialized;
    serializeJson(doc, serialized);
    static String sLastSaved;
    if (serialized == sLastSaved) return true;

    File f = LittleFS.open(kRuntimeTmpPath, "w");
    if (!f) return false;
    if (f.print(serialized) == 0) { f.close(); return false; }
    f.close();
    LittleFS.remove(kRuntimePath);
    LittleFS.rename(kRuntimeTmpPath, kRuntimePath);
    sLastSaved = serialized;
    return true;
}

void markRuntimeDirty(const StagedState& s) {
    snapshotFromState_(s, sPending);
    sDirty = true;
    if (sDirtyMs == 0) sDirtyMs = millis();
}

void flushRuntimeIfDirty() {
    if (!sDirty) return;
    if (sDirtyMs == 0) { sDirtyMs = millis(); return; }
    if (millis() - sDirtyMs < 1000) return;
    if (saveRuntime(sPending)) {
        log_i("runtime.json saved (pattern=%s on=%d)", sPending.patternId, (int)sPending.on);
    } else {
        log_e("runtime.json save failed");
    }
    sDirty = false;
    sDirtyMs = 0;
}

} // namespace haxel::core
