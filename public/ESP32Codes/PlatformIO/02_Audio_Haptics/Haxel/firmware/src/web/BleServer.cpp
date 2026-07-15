#include "BleServer.h"
#include "StateApi.h"
#include <ArduinoJson.h>
#include <esp_mac.h>

namespace haxel::web {

static const char* HAXEL_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* RX_CHAR_UUID       = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* TX_CHAR_UUID       = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

bool BleServer::begin(core::Engine* engine, Config* config) {
    engine_ = engine;
    config_ = config;

    String devName = config->hostname();
    if (devName.isEmpty()) {
        devName = "Haxel";
    }
    
    // Web Bluetooth UI filters on namePrefix: 'Haxel' (case-sensitive).
    // Ensure the advertised name starts with 'Haxel'.
    if (devName == "haxel") {
        devName = "Haxel";
    } else if (!devName.startsWith("Haxel")) {
        devName = "Haxel-" + devName;
    }

    // Append ESP32 MAC address suffix for uniqueness
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char macSuffix[8];
    snprintf(macSuffix, sizeof(macSuffix), "-%02X%02X", mac[4], mac[5]);
    devName += macSuffix;

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
    if (value.length() > 0) {
        Serial.printf("[CTRL] BLE <- %s\n", value.c_str());
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
                // Apply config updates over BLE
                JsonObjectConst patch = doc["patch"].as<JsonObjectConst>();
                applyConfigPatch(patch, config_);

                config_->setFirstRunComplete();
                config_->save();
                
                // Reboot if requested or required for config change
                delay(800);
                ESP.restart();
            }
        } else {
            Serial.printf("[CTRL] BLE unknown type '%s'\n", type);
        }
        // Force state update broadcast back to client
        broadcastState();
    }
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
