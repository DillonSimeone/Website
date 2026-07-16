#include "BleServer.h"
#include "StateApi.h"
#include "../core/Engine.h"
#include "../core/PatternRegistry.h"
#include "../core/RuntimeStore.h"
#include <ArduinoJson.h>

namespace haxel::web {

static const char* HAXEL_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* RX_CHAR_UUID       = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* TX_CHAR_UUID       = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

bool BleServer::begin(core::Engine* engine, Config* config) {
    engine_ = engine;
    config_ = config;

    // Same identity as the WiFi SoftAP SSID (Config::generateApSsid_ / apSsid).
    String devName = config->apSsid();
    if (devName.isEmpty()) {
        devName = "Haxel";
    }

    // Web Bluetooth UI filters on namePrefix: 'Haxel' (case-sensitive).
    if (devName == "haxel") {
        devName = "Haxel";
    } else if (!devName.startsWith("Haxel")) {
        devName = "Haxel-" + devName;
    }

    Serial.println("\n==============================================");
    Serial.println("[System] BLUETOOTH LOW ENERGY (BLE) MODE ENABLED");
    Serial.printf("[System] Advertising BLE Device Name: '%s'\n", devName.c_str());
    Serial.println("==============================================\n");

    BLEDevice::init(devName.c_str());
    pServer_ = BLEDevice::createServer();
    if (!pServer_) return false;
    pServer_->setCallbacks(this);

    BLEService* pService = pServer_->createService(HAXEL_SERVICE_UUID);
    if (!pService) return false;

    pTxCharacteristic_ = pService->createCharacteristic(
        TX_CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pTxCharacteristic_->addDescriptor(new BLE2902());

    pRxCharacteristic_ = pService->createCharacteristic(
        RX_CHAR_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    pRxCharacteristic_->setCallbacks(this);

    pService->start();

    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(HAXEL_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  // helper for iPhone connections
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    log_i("BLE Server started. Advertising as '%s'", devName.c_str());
    return true;
}

void BleServer::stop() {
    // BLE stop procedures if needed.
    BLEDevice::deinit(true);
    pServer_ = nullptr;
    pTxCharacteristic_ = nullptr;
    pRxCharacteristic_ = nullptr;
    deviceConnected_ = false;
}

void BleServer::onConnect(BLEServer* pServer) {
    deviceConnected_ = true;
    log_i("BLE client connected");
    // Broadcast initial state on connection
    broadcastState();
}

void BleServer::onDisconnect(BLEServer* pServer) {
    deviceConnected_ = false;
    log_i("BLE client disconnected");
    // Restart advertising so client can reconnect
    delay(500); // give the bluetooth stack the chance to get ready
    pServer->startAdvertising();
    log_i("BLE restarted advertising");
}

void BleServer::onWrite(BLECharacteristic* pCharacteristic) {
    String value = pCharacteristic->getValue();
    if (value.length() == 0) return;

    Serial.printf("[CTRL] BLE <- (%u bytes) %s\n", (unsigned)value.length(), value.c_str());
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, value.c_str(), value.length());
    if (err) {
        log_e("BLE JSON parse error: %s", err.c_str());
        Serial.printf("[CTRL] BLE JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* type = doc["type"] | "";
    if (strcmp(type, "state") == 0) {
        if (doc["patch"].is<JsonObjectConst>()) {
            applyStatePatch(doc["patch"].as<JsonObjectConst>(), engine_);
        }
    } else if (strcmp(type, "config") == 0) {
        if (doc["patch"].is<JsonObjectConst>()) {
            JsonObjectConst patch = doc["patch"].as<JsonObjectConst>();
            applyConfigPatch(patch, config_);
            config_->setFirstRunComplete();
            config_->save();
            delay(800);
            ESP.restart();
        }
    } else if (strcmp(type, "custom-pattern") == 0) {
        // Supports single-shot or chunked uploads:
        // {type,id,name,code,seq,total}  seq=0..total-1
        static String cpId;
        static String cpName;
        static String cpCode;
        static int cpTotal = 0;
        static int cpNext = 0;

        const char* id = doc["id"] | "";
        const char* name = doc["name"] | "";
        const char* codeChunk = doc["code"] | "";
        const int seq = doc["seq"] | 0;
        const int total = doc["total"] | 1;

        if (total < 1 || seq < 0 || seq >= total) {
            Serial.println("[CTRL] BLE custom-pattern rejected: bad seq/total");
            return;
        }

        if (seq == 0) {
            cpId = id;
            cpName = name;
            cpCode = codeChunk;
            cpTotal = total;
            cpNext = 1;
        } else if (seq == cpNext && cpId == id) {
            cpCode += codeChunk;
            cpNext++;
        } else {
            Serial.printf("[CTRL] BLE custom-pattern chunk desync (got seq=%d expect=%d)\n",
                          seq, cpNext);
            cpId = "";
            cpCode = "";
            cpTotal = 0;
            cpNext = 0;
            return;
        }

        if (cpNext < cpTotal) {
            Serial.printf("[CTRL] BLE custom-pattern chunk %d/%d (%u chars so far)\n",
                          cpNext, cpTotal, (unsigned)cpCode.length());
            return; // wait for remaining chunks before broadcasting
        }

        String upsertErr;
        if (!upsertCustomPattern(cpId.c_str(), cpName.c_str(), cpCode.c_str(), upsertErr)) {
            Serial.printf("[CTRL] BLE custom-pattern failed: %s\n", upsertErr.c_str());
        } else if (engine_) {
            // Activate the pattern we just uploaded (studio draft or saved custom_*).
            core::StagedState s;
            engine_->copyState(s);
            core::IPattern* p = core::PatternRegistry::instance().find(cpId.c_str());
            if (p) {
                s.pattern = p;
                s.on = true;
                engine_->stageState(s);
                core::markRuntimeDirty(s);
                Serial.printf("[CTRL] BLE auto-selected pattern '%s'\n", cpId.c_str());
            }
        }
        cpId = "";
        cpName = "";
        cpCode = "";
        cpTotal = 0;
        cpNext = 0;
    } else if (strcmp(type, "custom-pattern-delete") == 0) {
        const char* id = doc["id"] | "";
        String delErr;
        if (!deleteCustomPattern(id, delErr)) {
            Serial.printf("[CTRL] BLE custom-pattern-delete failed: %s\n", delErr.c_str());
        }
    } else {
        Serial.printf("[CTRL] BLE unknown type '%s'\n", type);
    }

    broadcastState();
}

void BleServer::broadcastState() {
    if (!deviceConnected_ || !pTxCharacteristic_ || !engine_) return;

    JsonDocument doc;
    doc["type"] = "state";
    auto data = doc["data"].to<JsonObject>();
    serializeState(data, engine_);
    data.remove("info"); // Remove verbose info structure to stay under 253 bytes

    String body;
    serializeJson(doc, body);

    pTxCharacteristic_->setValue(body.c_str());
    pTxCharacteristic_->notify();
}

} // namespace haxel::web
