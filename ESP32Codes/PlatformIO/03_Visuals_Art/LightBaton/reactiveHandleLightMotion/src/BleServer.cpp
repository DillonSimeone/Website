#include "BleServer.h"
#include <ArduinoJson.h>
#include <cstring>
#include <string>

namespace {
constexpr char kServiceUuid[] = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
constexpr char kRxCharUuid[] = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
constexpr char kTxCharUuid[] = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
} // namespace

bool BleServer::begin(PatternEngine* engine, DeviceConfig* config) {
    engine_ = engine;
    config_ = config;
    if (!engine_ || !config_) return false;

    const String devName = config_->bleDeviceName(engine_->state());

    Serial.println("\n==============================================");
    Serial.println("[System] BLUETOOTH LOW ENERGY (BLE) ENABLED");
    Serial.printf("[System] Advertising as '%s'\n", devName.c_str());
    Serial.println("==============================================\n");

    BLEDevice::init(devName.c_str());
    BLEDevice::setMTU(517);
    pServer_ = BLEDevice::createServer();
    if (!pServer_) return false;
    pServer_->setCallbacks(this);

    BLEService* pService = pServer_->createService(kServiceUuid);
    if (!pService) return false;

    pTxCharacteristic_ = pService->createCharacteristic(
        kTxCharUuid,
        BLECharacteristic::PROPERTY_NOTIFY);
    pTxCharacteristic_->addDescriptor(new BLE2902());

    pRxCharacteristic_ = pService->createCharacteristic(
        kRxCharUuid,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    pRxCharacteristic_->setCallbacks(this);

    pService->start();

    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(kServiceUuid);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();
    return true;
}

void BleServer::onConnect(BLEServer* pServer) {
    (void)pServer;
    deviceConnected_ = true;
    Serial.println("\n[BLE] *** Client CONNECTED ***");
    // Do NOT send any notifications here. Chrome is still performing
    // GATT service/characteristic discovery. The JS client will send
    // a "sync-request" once it has subscribed to notifications.
}

void BleServer::onDisconnect(BLEServer* pServer) {
    (void)pServer;
    deviceConnected_ = false;
    Serial.println("[BLE] *** Client DISCONNECTED ***");
    delay(500);
    if (pServer_) {
        pServer_->startAdvertising();
        Serial.println("[BLE] Re-advertising started.");
    }
}

void BleServer::notifyJson_(const char* json) {
    if (!deviceConnected_ || !pTxCharacteristic_ || !json) return;
    pTxCharacteristic_->setValue(json);
    pTxCharacteristic_->notify();
}

void BleServer::applyStatePatch_(const JsonObjectConst& patch) {
    DeviceState state = engine_->state();

    if (patch["on"].is<bool>()) state.on = patch["on"].as<bool>();
    if (patch["mute"].is<bool>()) state.mute = patch["mute"].as<bool>();
    if (patch["intensity"].is<float>()) state.intensity = patch["intensity"].as<float>();
    if (patch["speed"].is<float>()) state.speed = patch["speed"].as<float>();
    if (patch["startupFloor"].is<float>()) state.startupFloor = patch["startupFloor"].as<float>();
    if (patch["chargeRate"].is<float>()) state.chargeRate = patch["chargeRate"].as<float>();
    if (patch["decayRate"].is<float>()) state.decayRate = patch["decayRate"].as<float>();
    if (patch["pattern"].is<const char*>()) {
        strncpy(state.patternId, patch["pattern"].as<const char*>(), sizeof(state.patternId) - 1);
        state.patternId[sizeof(state.patternId) - 1] = '\0';
    }
    if (patch["numBins"].is<int>()) {
        state.numBins = constrain(patch["numBins"].as<int>(), 1, kMaxBins);
    }
    if (patch["dividers"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["dividers"].as<JsonArrayConst>()) {
            if (i >= kMaxDividers) break;
            state.dividers[i++] = v.as<int>();
        }
    }
    if (patch["binPatterns"].is<JsonArrayConst>()) {
        int i = 0;
        for (JsonVariantConst v : patch["binPatterns"].as<JsonArrayConst>()) {
            if (i >= kMaxBins) break;
            strncpy(state.binPatterns[i], v.as<const char*>(), sizeof(state.binPatterns[i]) - 1);
            state.binPatterns[i][sizeof(state.binPatterns[i]) - 1] = '\0';
            i++;
        }
    }

    engine_->setState(state);
    config_->save(state);
}

void BleServer::applyConfigPatch_(const JsonObjectConst& patch) {
    DeviceState state = engine_->state();
    if (patch["deviceName"].is<const char*>()) {
        strncpy(state.deviceName, patch["deviceName"].as<const char*>(), sizeof(state.deviceName) - 1);
        state.deviceName[sizeof(state.deviceName) - 1] = '\0';
    }
    engine_->setState(state);
    config_->save(state);
}

void BleServer::onWrite(BLECharacteristic* pCharacteristic) {
    (void)pCharacteristic;
    const std::string value = pCharacteristic->getValue();
    if (value.length() == 0) return;

    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, value.c_str(), value.length());
    if (err) {
        Serial.printf("[BLE] JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* type = doc["type"] | "";
    if (strcmp(type, "sync-request") == 0) {
        broadcastConfig();
        broadcastState();
    } else if (strcmp(type, "state") == 0 && doc["patch"].is<JsonObjectConst>()) {
        applyStatePatch_(doc["patch"].as<JsonObjectConst>());
        broadcastState();
    } else if (strcmp(type, "config") == 0 && doc["patch"].is<JsonObjectConst>()) {
        applyConfigPatch_(doc["patch"].as<JsonObjectConst>());
        broadcastConfig();
    }
}

void BleServer::broadcastState() {
    if (!engine_) return;
    const DeviceState& s = engine_->state();

    JsonDocument doc;
    doc["type"] = "state";
    JsonObject data = doc["data"].to<JsonObject>();
    data["on"] = s.on;
    data["mute"] = s.mute;
    data["intensity"] = s.intensity;
    data["speed"] = s.speed;
    data["startupFloor"] = s.startupFloor;
    data["pattern"] = s.patternId;
    data["chargeRate"] = s.chargeRate;
    data["decayRate"] = s.decayRate;
    data["numBins"] = s.numBins;

    JsonArray dividers = data["dividers"].to<JsonArray>();
    for (int i = 0; i < s.numBins - 1 && i < kMaxDividers; ++i) {
        dividers.add(s.dividers[i]);
    }

    JsonArray binPatterns = data["binPatterns"].to<JsonArray>();
    for (int i = 0; i < s.numBins && i < kMaxBins; ++i) {
        binPatterns.add(s.binPatterns[i]);
    }

    char buffer[512];
    const size_t len = serializeJson(doc, buffer, sizeof(buffer));
    if (len > 0 && len < sizeof(buffer)) {
        notifyJson_(buffer);
    }
}

void BleServer::broadcastConfig() {
    if (!engine_ || !config_) return;
    const DeviceState& s = engine_->state();

    notifyJson_("{\"type\":\"config-start\"}");

    JsonDocument doc;
    doc["type"] = "config";
    doc["section"] = "identity";
    JsonObject data = doc["data"].to<JsonObject>();
    data["deviceName"] = config_->bleDeviceName(s);

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));
    notifyJson_(buffer);

    notifyJson_("{\"type\":\"config-complete\"}");
}
