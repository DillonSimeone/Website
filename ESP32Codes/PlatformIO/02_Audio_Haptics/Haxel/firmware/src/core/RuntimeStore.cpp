#include "RuntimeStore.h"
#include "PatternRegistry.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <cstring>
#ifndef HAXEL_HOST_TEST
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#endif

namespace haxel::core {

static constexpr const char* kRuntimePath    = "/runtime.json";
static constexpr const char* kRuntimeTmpPath = "/runtime.json.tmp";

static bool            sDirty = false;
static uint32_t        sDirtyMs = 0;
static RuntimeSnapshot sPending{};
#ifndef HAXEL_HOST_TEST
static SemaphoreHandle_t sRuntimeMux = nullptr;
static void lockRuntime_() {
    if (!sRuntimeMux) {
        static portMUX_TYPE initMux = portMUX_INITIALIZER_UNLOCKED;
        portENTER_CRITICAL(&initMux);
        if (!sRuntimeMux) sRuntimeMux = xSemaphoreCreateMutex();
        portEXIT_CRITICAL(&initMux);
    }
    if (sRuntimeMux) xSemaphoreTake(sRuntimeMux, portMAX_DELAY);
}
static void unlockRuntime_() {
    if (sRuntimeMux) xSemaphoreGive(sRuntimeMux);
}
#else
static inline void lockRuntime_() {}
static inline void unlockRuntime_() {}
#endif

static void snapshotFromState_(const StagedState& s, RuntimeSnapshot& out) {
    out.on = s.on;
    out.mute = s.mute;
    out.intensity = s.intensity;
    out.speed = s.speed;
    out.freq = s.freq;
    out.startupFloor = s.startupFloor;
    out.audioReactive = s.audioReactive;
    out.numBins = (s.numBins < 1) ? 1 : (s.numBins > 5 ? 5 : s.numBins);
    for (int i = 0; i < 4; ++i) {
        uint8_t d = s.dividers[i];
        if (d < 1) d = 1;
        if (d > 31) d = 31;
        out.dividers[i] = d;
    }
    for (int i = 0; i < 5; ++i) {
        strncpy(out.binPatterns[i], s.binPatterns[i], sizeof(out.binPatterns[i]) - 1);
        out.binPatterns[i][sizeof(out.binPatterns[i]) - 1] = '\0';
    }
    if (!PatternRegistry::instance().copyIdIfValid(s.pattern, out.patternId, sizeof(out.patternId))) {
        strncpy(out.patternId, "Heartbeat", sizeof(out.patternId) - 1);
        out.patternId[sizeof(out.patternId) - 1] = '\0';
    }
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
    out.freq = doc["freq"] | 150.0f;
    out.startupFloor = doc["startupFloor"] | 0.35f;
    out.audioReactive = doc["audioReactive"] | false;
    int nb = doc["numBins"] | 3;
    if (nb < 1) nb = 1;
    if (nb > 5) nb = 5;
    out.numBins = (uint8_t)nb;
    const char* pid = doc["pattern"] | "Heartbeat";
    strncpy(out.patternId, pid, sizeof(out.patternId) - 1);
    out.patternId[sizeof(out.patternId) - 1] = '\0';

    if (JsonArrayConst divs = doc["dividers"].as<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : divs) {
            if (i < 4) {
                int d = v.as<int>();
                if (d < 1) d = 1;
                if (d > 31) d = 31;
                out.dividers[i++] = (uint8_t)d;
            }
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
    doc["freq"] = in.freq;
    doc["startupFloor"] = in.startupFloor;
    doc["audioReactive"] = in.audioReactive;
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
    lockRuntime_();
    snapshotFromState_(s, sPending);
    sDirty = true;
    sDirtyMs = millis();
    unlockRuntime_();
}

void flushRuntimeIfDirty() {
    RuntimeSnapshot snap;
    lockRuntime_();
    if (!sDirty) { unlockRuntime_(); return; }
    if (sDirtyMs == 0) { sDirtyMs = millis(); unlockRuntime_(); return; }
    if (millis() - sDirtyMs < 1000) { unlockRuntime_(); return; }
    snap = sPending;
    sDirty = false;
    sDirtyMs = 0;
    unlockRuntime_();

    if (saveRuntime(snap)) {
        log_i("runtime.json saved (pattern=%s on=%d)", snap.patternId, (int)snap.on);
    } else {
        log_e("runtime.json save failed");
    }
}

void flushRuntimeNow() {
    RuntimeSnapshot snap;
    lockRuntime_();
    if (!sDirty) { unlockRuntime_(); return; }
    snap = sPending;
    sDirty = false;
    sDirtyMs = 0;
    unlockRuntime_();

    if (saveRuntime(snap)) {
        log_i("runtime.json flushed (pattern=%s on=%d)", snap.patternId, (int)snap.on);
    } else {
        log_e("runtime.json flush failed");
    }
}

} // namespace haxel::core
