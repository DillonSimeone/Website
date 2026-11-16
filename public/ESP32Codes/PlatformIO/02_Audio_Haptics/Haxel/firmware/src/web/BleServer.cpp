#include "BleServer.h"
#include "StateApi.h"
#include "../core/Engine.h"
#include "../core/PatternRegistry.h"
#include "../core/RuntimeStore.h"
#include <ArduinoJson.h>

namespace haxel::web {

struct BleRxPacket {
    uint16_t len;
    char data[512];
};

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

    if (!rxQueue_) {
        rxQueue_ = xQueueCreate(8, sizeof(BleRxPacket));
    }
    BLEDevice::init(devName.c_str());
    BLEDevice::setMTU(512);
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
    configSyncPending_ = false;
    stateSyncPending_ = false;
    advRestartPending_ = false;
    if (rxQueue_) {
        vQueueDelete(rxQueue_);
        rxQueue_ = nullptr;
    }
}

void BleServer::onConnect(BLEServer* pServer) {
    deviceConnected_ = true;
    stateSyncPending_ = true;
    log_i("BLE client connected");
    // Broadcast initial state on connection
    // Deferred to housekeepingTask via pump() — never notify() inside Bluedroid callback!
}

void BleServer::onDisconnect(BLEServer* pServer) {
    deviceConnected_ = false;
    configSyncPending_ = false;
    stateSyncPending_ = false;
    advRestartAtMs_ = millis() + 250;
    advRestartPending_ = true;
    log_i("BLE client disconnected");
    // Restart advertising so client can reconnect
    // Deferred to housekeepingTask via pump()


}

void BleServer::onWrite(BLECharacteristic* pCharacteristic) {
    auto value = pCharacteristic->getValue();
    const size_t len = value.length();
    if (len == 0 || !rxQueue_) return;

    // Defer ALL JSON parsing, state/config writes, and Serial logging out of Bluedroid's
    // BTC_TASK (~3KB stack) into housekeepingTask via pump().
    static BleRxPacket sOnWriteScratch;
    const size_t copyLen = len < sizeof(sOnWriteScratch.data) - 1 ? len : sizeof(sOnWriteScratch.data) - 1;
    memcpy(sOnWriteScratch.data, value.c_str(), copyLen);
    sOnWriteScratch.data[copyLen] = '\0';
    sOnWriteScratch.len = (uint16_t)copyLen;
    xQueueSend(rxQueue_, &sOnWriteScratch, 0);
}

void BleServer::processWrite_(const char* data, size_t len) {
    if (!data || len == 0) return;

    if (strstr(data, "\"af\"") == nullptr && strstr(data, "\"audioFrame\"") == nullptr) {
        Serial.printf("[CTRL] BLE <- (%u bytes) %s\n", (unsigned)len, data);
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, data, len);
    if (err) {
        log_e("BLE JSON parse error: %s", err.c_str());
        Serial.printf("[CTRL] BLE JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* type = doc["type"] | "";
    if (strcmp(type, "sync-request") == 0) {
        Serial.println("[CTRL] BLE sync requested (config + state)");
        configSyncPending_ = true;
        stateSyncPending_ = true;
        // Deferred to housekeepingTask via pump() — never notify() inside Bluedroid callback!
        return;
    } else if (strcmp(type, "config-start") == 0) {
        configWriteInProgress_ = true;
        configWriteNeedsReboot_ = false;
        Serial.println("[CTRL] BLE config upload started");
        return;
    } else if (strcmp(type, "config-complete") == 0) {
        if (configWriteInProgress_) {
            config_->setFirstRunComplete();
            config_->save();
            Serial.println("[CTRL] BLE config upload complete");
            if (configWriteNeedsReboot_) {
                requestDeferredReboot(300);

            }
            configWriteInProgress_ = false;
        }
        return;
    } else if (strcmp(type, "config") == 0 && doc["section"].is<const char*>()) {
        const char* section = doc["section"];
        JsonDocument patchDoc;
        JsonObject patch = patchDoc.to<JsonObject>();

        if (strcmp(section, "identity") == 0 && doc["data"].is<JsonObjectConst>()) {
            JsonObjectConst data = doc["data"].as<JsonObjectConst>();
            if (data["apSsid"].is<const char*>()) patch["apSsid"] = data["apSsid"];
            if (data["hostname"].is<const char*>()) patch["hostname"] = data["hostname"];
        } else if (strcmp(section, "driver") == 0 && doc["data"].is<JsonObjectConst>()) {
            JsonObjectConst data = doc["data"].as<JsonObjectConst>();
            JsonObject d = patch["driver"].to<JsonObject>();
            if (data["kind"].is<int>()) d["kind"] = data["kind"];
            if (data["pins"].is<JsonArrayConst>()) d["pins"] = data["pins"];
            if (data["sda"].is<int>()) d["sda"] = data["sda"];
            if (data["scl"].is<int>()) d["scl"] = data["scl"];
            if (data["pwmHz"].is<int>()) d["pwmHz"] = data["pwmHz"];
            if (data["channelEnabled"].is<JsonArrayConst>()) {
                patch["channelEnabled"] = data["channelEnabled"];
            }
        } else if (strcmp(section, "knobs") == 0 && doc["data"].is<JsonArrayConst>()) {
            patch["knobs"] = doc["data"];
        } else if (doc["data"].is<JsonObjectConst>()) {
            patch[section] = doc["data"];
        } else {
            Serial.printf("[CTRL] BLE config section '%s' rejected: bad data\n", section);
            return;
        }

        if (!configWriteInProgress_) configWriteInProgress_ = true;
        JsonObjectConst patchConst = patch;
        applyConfigPatch(patchConst, config_, engine_, false);
        if (configPatchNeedsReboot(patchConst)) {
            configWriteNeedsReboot_ = true;
        }
        Serial.printf("[CTRL] BLE config section '%s' applied\n", section);
        return;
    } else if (strcmp(type, "state") == 0) {
        if (doc["patch"].is<JsonObjectConst>()) {
            applyStatePatch(doc["patch"].as<JsonObjectConst>(), engine_, config_);
        }
    } else if (strcmp(type, "config") == 0) {
        if (doc["patch"].is<JsonObjectConst>()) {
            JsonObjectConst patch = doc["patch"].as<JsonObjectConst>();
            applyConfigPatch(patch, config_, engine_, true);
            if (configPatchNeedsReboot(patch)) {
                requestDeferredReboot(300);

            }
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
        if (!upsertCustomPattern(cpId.c_str(), cpName.c_str(), cpCode.c_str(), upsertErr, engine_)) {
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
        if (!deleteCustomPattern(id, delErr, engine_)) {
            Serial.printf("[CTRL] BLE custom-pattern-delete failed: %s\n", delErr.c_str());
        }
    } else {
        Serial.printf("[CTRL] BLE unknown type '%s'\n", type);
    }

    // Deferred to housekeepingTask via pump() — never notify() inside Bluedroid callback!
}

void BleServer::pump() {
    if (advRestartPending_ && (int32_t)(millis() - advRestartAtMs_) >= 0) {
        advRestartPending_ = false;
        if (rxQueue_) {
            xQueueReset(rxQueue_);
        }
        if (pServer_ && !deviceConnected_) {
            pServer_->startAdvertising();
            log_i("BLE restarted advertising");
        }
    }
    if (!deviceConnected_) return;
    if (rxQueue_) {
        BleRxPacket pkt;
        while (xQueueReceive(rxQueue_, &pkt, 0) == pdTRUE) {
            processWrite_(pkt.data, pkt.len);
        }
    }
    if (configSyncPending_) {
        configSyncPending_ = false;
        broadcastConfig();
    }
    if (stateSyncPending_) {
        stateSyncPending_ = false;
        broadcastState();
    }
}

void BleServer::broadcastState() {
    if (!deviceConnected_ || !pTxCharacteristic_ || !engine_ || configSyncInProgress_) return;

    JsonDocument doc;
    doc["type"] = "state";
    auto data = doc["data"].to<JsonObject>();
    serializeState(data, engine_);
    data.remove("info"); // Remove verbose info structure to stay under 253 bytes

    notifyJson_(doc);
}

void BleServer::notifyJson_(JsonDocument& doc) {
    if (!deviceConnected_ || !pTxCharacteristic_) return;

    String body;
    serializeJson(doc, body);
    pTxCharacteristic_->setValue(body.c_str());
    pTxCharacteristic_->notify();
    const char* type = doc["type"] | "";
    if (strncmp(type, "config", 6) == 0) {
        delay(60); // Keep the multi-part config burst from overrunning BLE queues.
    }
}

void BleServer::broadcastConfig() {
    if (!deviceConnected_ || !pTxCharacteristic_ || !config_) return;
    configSyncInProgress_ = true;

    {
        JsonDocument doc;
        doc["type"] = "config-start";
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "identity";
        auto data = doc["data"].to<JsonObject>();
        data["apSsid"] = config_->apSsid();
        data["hostname"] = config_->hostname();
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "driver";
        auto data = doc["data"].to<JsonObject>();
        config_->driverToJson(data, false);
        auto chEn = data["channelEnabled"].to<JsonArray>();
        for (size_t i = 0; i < Config::kMaxChannels; ++i) chEn.add(config_->channelEnabled(i));
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "audio";
        config_->audioToJson(doc["data"].to<JsonObject>());
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "led";
        config_->ledToJson(doc["data"].to<JsonObject>());
        notifyJson_(doc);
    }
    for (size_t i = 0; i < config_->knobCount(); ++i) {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "knob";
        auto data = doc["data"].to<JsonObject>();
        const auto& knob = config_->knob(i);
        data["enabled"] = knob.enabled;
        data["pin"] = knob.pin;
        data["param"] = knob.param;
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config";
        doc["section"] = "oled";
        auto data = doc["data"].to<JsonObject>();
        config_->oledToJson(data);
        data["eStopPin"] = config_->eStopPin();
        notifyJson_(doc);
    }
    {
        JsonDocument doc;
        doc["type"] = "config-complete";
        notifyJson_(doc);
    }
    configSyncInProgress_ = false;
}

} // namespace haxel::web
