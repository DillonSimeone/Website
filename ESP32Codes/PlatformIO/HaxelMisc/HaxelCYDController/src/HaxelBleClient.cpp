#include "HaxelBleClient.h"
#include <ArduinoJson.h>

struct BleRxMsg {
    uint16_t len;
    char data[512];
};

static HaxelBleClient* gBleInstance = nullptr;

class HaxelClientCallbacks : public NimBLEClientCallbacks {
    void onConnect(NimBLEClient* pClient) override {
        pClient->updateConnParams(12, 24, 0, 100);
    }
    void onDisconnect(NimBLEClient* pClient) override {
        if (gBleInstance) gBleInstance->onClientDisconnect();
    }
};

static HaxelClientCallbacks gClientCallbacks;

static void scanCompleteCB(NimBLEScanResults results) {
    if (gBleInstance) gBleInstance->onScanComplete(results);
}

static void notifyCB(NimBLERemoteCharacteristic* pChar, uint8_t* pData, size_t length, bool isNotify) {
    if (gBleInstance && pData && length > 0) {
        gBleInstance->onNotify(pData, length);
    }
}

void HaxelBleClient::begin() {
    gBleInstance = this;
    rxQueue_ = xQueueCreate(12, sizeof(BleRxMsg));

    NimBLEDevice::init("HaxelCYD");
    NimBLEDevice::setMTU(512);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);

    NimBLEScan* pScan = NimBLEDevice::getScan();
    pScan->setActiveScan(true);
    pScan->setDuplicateFilter(false);
    pScan->setMaxResults(32);
    pScan->setInterval(45);
    pScan->setWindow(30);
}

bool HaxelBleClient::startScan(uint32_t durationSec) {
    if (scanning_) return false;
    NimBLEScan* pScan = NimBLEDevice::getScan();
    pScan->clearResults();
    scanning_ = true;
    scanDirty_ = true;
    if (!pScan->start(durationSec, scanCompleteCB, false)) {
        scanning_ = false;
        scanDirty_ = true;
        return false;
    }
    return true;
}

void HaxelBleClient::onScanComplete(NimBLEScanResults results) {
    unitCount_ = 0;
    const NimBLEUUID svcUuid(kServiceUuid);
    int count = results.getCount();
    Serial.printf("[BLE] Scan complete: %d raw devices\n", count);
    for (int i = 0; i < count && unitCount_ < kMaxUnits; ++i) {
        NimBLEAdvertisedDevice dev = results.getDevice(i);
        std::string name = dev.getName();
        bool isHaxelName = (name.rfind("Haxel", 0) == 0) || (name.rfind("haxel", 0) == 0);
        bool hasHaxelSvc = dev.isAdvertisingService(svcUuid);
        if (!isHaxelName && !hasHaxelSvc) continue;

        // Deduplicate by address in case duplicate filter is off
        NimBLEAddress addr = dev.getAddress();
        bool seen = false;
        for (int j = 0; j < unitCount_; ++j) {
            if (units_[j].address == addr) {
                if (dev.getRSSI() > units_[j].rssi) units_[j].rssi = dev.getRSSI();
                if (!name.empty() && strncmp(units_[j].name, "Haxel (", 7) == 0) {
                    strncpy(units_[j].name, name.c_str(), sizeof(units_[j].name) - 1);
                    units_[j].name[sizeof(units_[j].name) - 1] = '\0';
                }
                seen = true;
                break;
            }
        }
        if (seen) continue;

        HaxelUnit& u = units_[unitCount_];
        if (name.empty()) {
            snprintf(u.name, sizeof(u.name), "Haxel (%s)", addr.toString().c_str());
        } else {
            strncpy(u.name, name.c_str(), sizeof(u.name) - 1);
            u.name[sizeof(u.name) - 1] = '\0';
        }
        u.address = addr;
        u.rssi = dev.getRSSI();
        Serial.printf("[BLE]  -> Found unit %d: %s (%s) RSSI %d\n",
                      unitCount_, u.name, addr.toString().c_str(), u.rssi);
        unitCount_++;
    }
    scanning_ = false;
    scanDirty_ = true;
}

bool HaxelBleClient::connectToUnit(int idx) {
    if (idx < 0 || idx >= unitCount_) return false;

    if (scanning_) {
        NimBLEDevice::getScan()->stop();
        scanning_ = false;
    }
    if (connected_) {
        disconnect();
    }

    const HaxelUnit& target = units_[idx];
    if (!client_) {
        client_ = NimBLEDevice::createClient();
        client_->setClientCallbacks(&gClientCallbacks, false);
        client_->setConnectTimeout(5);
    }

    Serial.printf("[BLE] Connecting to %s (%s)...\n", target.name, target.address.toString().c_str());
    if (!client_->connect(target.address)) {
        Serial.println("[BLE] Connect failed");
        connected_ = false;
        connDirty_ = true;
        return false;
    }

    NimBLERemoteService* svc = client_->getService(kServiceUuid);
    if (!svc) {
        Serial.println("[BLE] Haxel service not found");
        client_->disconnect();
        return false;
    }

    rxChar_ = svc->getCharacteristic(kRxCharUuid);
    txChar_ = svc->getCharacteristic(kTxCharUuid);
    if (!rxChar_ || !txChar_) {
        Serial.println("[BLE] RX/TX characteristics not found");
        client_->disconnect();
        return false;
    }

    if (txChar_->canNotify()) {
        if (!txChar_->subscribe(true, notifyCB)) {
            Serial.println("[BLE] Failed to subscribe to TX notify");
        }
    }

    strncpy(connectedName_, target.name, sizeof(connectedName_) - 1);
    connectedName_[sizeof(connectedName_) - 1] = '\0';
    connectedAddr_ = target.address;
    connected_ = true;
    connDirty_ = true;
    state_.valid = false;
    memset(state_.pinUnavailable, 0, sizeof(state_.pinUnavailable));

    if (rxQueue_) xQueueReset(rxQueue_);
    sendSyncRequest();
    Serial.println("[BLE] Connected & sync-request sent");
    return true;
}

void HaxelBleClient::disconnect() {
    if (client_ && client_->isConnected()) {
        client_->disconnect();
    }
    connected_ = false;
    rxChar_ = nullptr;
    txChar_ = nullptr;
    connectedName_[0] = '\0';
    state_.valid = false;
    connDirty_ = true;
    stateDirty_ = true;
}

void HaxelBleClient::onClientDisconnect() {
    connected_ = false;
    rxChar_ = nullptr;
    txChar_ = nullptr;
    connectedName_[0] = '\0';
    state_.valid = false;
    connDirty_ = true;
    stateDirty_ = true;
    Serial.println("[BLE] Disconnected");
}

void HaxelBleClient::onNotify(const uint8_t* data, size_t len) {
    if (!rxQueue_) return;
    BleRxMsg msg;
    size_t copyLen = len < sizeof(msg.data) - 1 ? len : sizeof(msg.data) - 1;
    memcpy(msg.data, data, copyLen);
    msg.data[copyLen] = '\0';
    msg.len = (uint16_t)copyLen;
    xQueueSend(rxQueue_, &msg, 0);
}

void HaxelBleClient::pump() {
    if (!rxQueue_) return;
    BleRxMsg msg;
    while (xQueueReceive(rxQueue_, &msg, 0) == pdTRUE) {
        handleIncomingJson(msg.data, msg.len);
    }
}

void HaxelBleClient::handleIncomingJson(const char* data, size_t len) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, data, len);
    if (err) return;

    const char* type = doc["type"] | "";
    if (strcmp(type, "state") == 0 && doc["data"].is<JsonObjectConst>()) {
        JsonObjectConst d = doc["data"].as<JsonObjectConst>();
        if (d["on"].is<bool>()) state_.on = d["on"].as<bool>();
        if (d["mute"].is<bool>()) state_.mute = d["mute"].as<bool>();
        if (d["intensity"].is<float>()) state_.intensity = d["intensity"].as<float>();
        if (d["speed"].is<float>()) state_.speed = d["speed"].as<float>();
        if (d["freq"].is<float>()) state_.freq = d["freq"].as<float>();
        if (d["startupFloor"].is<float>()) state_.startupFloor = d["startupFloor"].as<float>();
        if (d["audioReactive"].is<bool>()) state_.audioReactive = d["audioReactive"].as<bool>();
        if (d["pattern"].is<const char*>()) {
            strncpy(state_.pattern, d["pattern"].as<const char*>(), sizeof(state_.pattern) - 1);
            state_.pattern[sizeof(state_.pattern) - 1] = '\0';
        }
        if (d["channels"].is<JsonArrayConst>()) {
            int i = 0;
            for (JsonVariantConst v : d["channels"].as<JsonArrayConst>()) {
                if (i < 8) {
                    state_.channels[i] = v.as<bool>();
                    state_.chDetails[i].on = state_.channels[i];
                    i++;
                }
            }
            if (i > 0) state_.channelCount = (uint8_t)i;
        }
        state_.valid = true;
        stateDirty_ = true;
    } else if (strcmp(type, "ch") == 0 && doc["data"].is<JsonArrayConst>()) {
        int off = doc["offset"] | 0;
        int idx = 0;
        for (JsonVariantConst v : doc["data"].as<JsonArrayConst>()) {
            int ch = off + idx;
            idx++;
            if (ch < 0 || ch >= 8 || !v.is<JsonObjectConst>()) continue;
            JsonObjectConst o = v.as<JsonObjectConst>();
            ChannelDetail& cd = state_.chDetails[ch];
            if (o["on"].is<bool>()) {
                cd.on = o["on"].as<bool>();
                state_.channels[ch] = cd.on;
            }
            if (o["sy"].is<bool>()) cd.synced = o["sy"].as<bool>();
            if (o["in"].is<float>()) cd.intensity = o["in"].as<float>();
            if (o["sp"].is<float>()) cd.speed = o["sp"].as<float>();
            if (o["fl"].is<float>()) cd.startupFloor = o["fl"].as<float>();
            if (o["ce"].is<float>()) cd.ceiling = o["ce"].as<float>();
            if (o["pa"].is<const char*>()) {
                strncpy(cd.patternOverride, o["pa"].as<const char*>(), sizeof(cd.patternOverride) - 1);
                cd.patternOverride[sizeof(cd.patternOverride) - 1] = '\0';
            }
        }
        stateDirty_ = true;
    } else if (strcmp(type, "config") == 0) {
        const char* section = doc["section"] | "";
        if (strcmp(section, "audio") == 0 && doc["data"].is<JsonObjectConst>()) {
            JsonObjectConst d = doc["data"].as<JsonObjectConst>();
            if (d["enabled"].is<bool>()) state_.audioEnabled = d["enabled"].as<bool>();
            if (d["source"].is<int>()) state_.audioSource = (uint8_t)d["source"].as<int>();
            if (d["bclk"].is<int>()) state_.i2sBclk = (int8_t)d["bclk"].as<int>();
            if (d["ws"].is<int>()) state_.i2sWs = (int8_t)d["ws"].as<int>();
            if (d["sd"].is<int>()) state_.i2sSd = (int8_t)d["sd"].as<int>();
            if (d["adc"].is<int>()) state_.adcPin = (int8_t)d["adc"].as<int>();
            if (d["gain"].is<float>()) state_.audioGain = d["gain"].as<float>();
            stateDirty_ = true;
        } else if (strcmp(section, "driver") == 0 && doc["data"].is<JsonObjectConst>()) {
            JsonObjectConst d = doc["data"].as<JsonObjectConst>();
            if (d["pins"].is<JsonArrayConst>()) {
                int i = 0;
                for (JsonVariantConst v : d["pins"].as<JsonArrayConst>()) {
                    if (i < 8) {
                        state_.driverPins[i] = (int8_t)v.as<int>();
                        i++;
                    }
                }
                stateDirty_ = true;
            }
        } else if (strcmp(section, "pins") == 0 && doc["data"].is<JsonObjectConst>()) {
            JsonObjectConst d = doc["data"].as<JsonObjectConst>();
            if (d["maxPin"].is<int>()) {
                int mp = d["maxPin"].as<int>();
                state_.maxPin = (mp >= 0 && mp < 64) ? mp : 21;
            }
            memset(state_.pinUnavailable, 0, sizeof(state_.pinUnavailable));
            if (d["unavail"].is<JsonArrayConst>()) {
                for (JsonVariantConst v : d["unavail"].as<JsonArrayConst>()) {
                    int p = v["p"] | -1;
                    if (p >= 0 && p < 64) state_.pinUnavailable[p] = true;
                }
            }
            stateDirty_ = true;
        }
    }
}

bool HaxelBleClient::consumeStateDirty() {
    if (!stateDirty_) return false;
    stateDirty_ = false;
    return true;
}

bool HaxelBleClient::consumeScanDirty() {
    if (!scanDirty_) return false;
    scanDirty_ = false;
    return true;
}

bool HaxelBleClient::consumeConnDirty() {
    if (!connDirty_) return false;
    connDirty_ = false;
    return true;
}

void HaxelBleClient::writeJson(const char* json) {
    if (!connected_ || !rxChar_) return;
    rxChar_->writeValue((const uint8_t*)json, strlen(json), false);
}

void HaxelBleClient::sendSyncRequest() {
    writeJson("{\"type\":\"sync-request\"}");
}

void HaxelBleClient::sendBoolPatch(const char* key, bool val) {
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"type\":\"state\",\"patch\":{\"%s\":%s}}", key, val ? "true" : "false");
    writeJson(buf);
}

void HaxelBleClient::sendFloatPatch(const char* key, float val) {
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"type\":\"state\",\"patch\":{\"%s\":%.3f}}", key, val);
    writeJson(buf);
}

void HaxelBleClient::sendStringPatch(const char* key, const char* val) {
    char buf[128];
    snprintf(buf, sizeof(buf), "{\"type\":\"state\",\"patch\":{\"%s\":\"%s\"}}", key, val);
    writeJson(buf);
}

void HaxelBleClient::sendChannelsPatch(const bool* channels, int count) {
    JsonDocument doc;
    doc["type"] = "state";
    JsonArray arr = doc["patch"]["channels"].to<JsonArray>();
    for (int i = 0; i < count && i < 8; ++i) {
        arr.add(channels[i]);
    }
    String out;
    serializeJson(doc, out);
    writeJson(out.c_str());
}

void HaxelBleClient::sendChannelDetailPatch(int chIdx, const ChannelDetail& detail) {
    if (chIdx < 0 || chIdx >= 8) return;
    state_.chDetails[chIdx] = detail;
    state_.channels[chIdx] = detail.on;
    JsonDocument doc;
    doc["type"] = "state";
    JsonArray arr = doc["patch"]["channels"].to<JsonArray>();
    for (int i = 0; i < 8; ++i) {
        JsonObject o = arr.add<JsonObject>();
        if (i == chIdx) {
            o["on"] = detail.on;
            o["synced"] = detail.synced;
            o["intensity"] = detail.intensity;
            o["speed"] = detail.speed;
            o["startupFloor"] = detail.startupFloor;
            o["ceiling"] = detail.ceiling;
            o["patternOverride"] = detail.patternOverride;
        }
    }
    String out;
    serializeJson(doc, out);
    writeJson(out.c_str());
}

void HaxelBleClient::sendDriverPinsConfig(const int8_t* pins, int count) {
    JsonDocument doc;
    doc["type"] = "config";
    JsonArray arr = doc["patch"]["driver"]["pins"].to<JsonArray>();
    for (int i = 0; i < count && i < 8; ++i) {
        arr.add((int)pins[i]);
    }
    String out;
    serializeJson(doc, out);
    writeJson(out.c_str());
}

void HaxelBleClient::sendAudioConfig(bool enabled, uint8_t source, int8_t bclk, int8_t ws, int8_t sd, int8_t adc, float gain) {
    JsonDocument doc;
    doc["type"] = "config";
    JsonObject au = doc["patch"]["audio"].to<JsonObject>();
    au["enabled"] = enabled;
    au["source"] = (int)source;
    au["bclk"] = (int)bclk;
    au["ws"] = (int)ws;
    au["sd"] = (int)sd;
    au["adc"] = (int)adc;
    au["gain"] = gain;
    String out;
    serializeJson(doc, out);
    writeJson(out.c_str());
}

void HaxelBleClient::sendReboot() {
    writeJson("{\"type\":\"config\",\"patch\":{\"led\":{}}}");
}
