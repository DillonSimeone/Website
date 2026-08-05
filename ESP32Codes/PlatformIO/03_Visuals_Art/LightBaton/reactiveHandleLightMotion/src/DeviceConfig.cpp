#include "DeviceConfig.h"
#include <Preferences.h>

namespace {
Preferences prefs;

void copyString(char* dst, size_t dstLen, const char* src) {
    if (!dst || dstLen == 0) return;
    if (!src) {
        dst[0] = '\0';
        return;
    }
    strncpy(dst, src, dstLen - 1);
    dst[dstLen - 1] = '\0';
}
} // namespace

bool DeviceConfig::begin() {
    ready_ = prefs.begin("lightbaton", false);
    return ready_;
}

void DeviceConfig::load(DeviceState& state) {
    if (!ready_) return;

    state.on = prefs.getBool("on", state.on);
    state.mute = prefs.getBool("mute", state.mute);
    state.intensity = prefs.getFloat("intensity", state.intensity);
    state.speed = prefs.getFloat("speed", state.speed);
    state.startupFloor = prefs.getFloat("startupFloor", state.startupFloor);
    state.chargeRate = prefs.getFloat("chargeRate", state.chargeRate);
    state.decayRate = prefs.getFloat("decayRate", state.decayRate);
    state.numBins = prefs.getInt("numBins", state.numBins);

    copyString(state.patternId, sizeof(state.patternId), prefs.getString("pattern", state.patternId).c_str());
    copyString(state.deviceName, sizeof(state.deviceName), prefs.getString("deviceName", state.deviceName).c_str());

    String divStr = prefs.getString("dividers", "8,16,24");
    int divCount = 0;
    int start = 0;
    while (start <= divStr.length() && divCount < kMaxDividers) {
        const int comma = divStr.indexOf(',', start);
        const String token = (comma >= 0) ? divStr.substring(start, comma) : divStr.substring(start);
        state.dividers[divCount++] = token.toInt();
        if (comma < 0) break;
        start = comma + 1;
    }

    String binStr = prefs.getString("binPatterns", "Heartbeat,Gallop,Shimmer,SwingKick");
    int binCount = 0;
    start = 0;
    while (start <= binStr.length() && binCount < kMaxBins) {
        const int comma = binStr.indexOf(',', start);
        const String token = (comma >= 0) ? binStr.substring(start, comma) : binStr.substring(start);
        copyString(state.binPatterns[binCount], sizeof(state.binPatterns[binCount]), token.c_str());
        binCount++;
        if (comma < 0) break;
        start = comma + 1;
    }
}

void DeviceConfig::save(const DeviceState& state) {
    if (!ready_) return;

    prefs.putBool("on", state.on);
    prefs.putBool("mute", state.mute);
    prefs.putFloat("intensity", state.intensity);
    prefs.putFloat("speed", state.speed);
    prefs.putFloat("startupFloor", state.startupFloor);
    prefs.putFloat("chargeRate", state.chargeRate);
    prefs.putFloat("decayRate", state.decayRate);
    prefs.putInt("numBins", state.numBins);
    prefs.putString("pattern", state.patternId);
    prefs.putString("deviceName", state.deviceName);

    String divStr;
    for (int i = 0; i < state.numBins - 1 && i < kMaxDividers; ++i) {
        if (i > 0) divStr += ",";
        divStr += String(state.dividers[i]);
    }
    prefs.putString("dividers", divStr);

    String binStr;
    for (int i = 0; i < state.numBins && i < kMaxBins; ++i) {
        if (i > 0) binStr += ",";
        binStr += state.binPatterns[i];
    }
    prefs.putString("binPatterns", binStr);
}

String DeviceConfig::bleDeviceName(const DeviceState& state) const {
    String name = state.deviceName;
    name.trim();
    if (name.isEmpty()) name = "LightBaton";
    if (name.startsWith("lightbaton")) {
        name.setCharAt(0, 'L');
        name.setCharAt(5, 'B');
    }
    if (!name.startsWith("LightBaton")) {
        name = "LightBaton-" + name;
    }
    return name;
}
