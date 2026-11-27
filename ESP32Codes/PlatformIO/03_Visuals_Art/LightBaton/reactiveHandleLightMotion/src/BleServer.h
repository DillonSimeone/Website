#pragma once

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include "PatternEngine.h"
#include "DeviceConfig.h"

class BleServer : public BLEServerCallbacks, public BLECharacteristicCallbacks {
public:
    bool begin(PatternEngine* engine, DeviceConfig* config);
    void broadcastState();
    void broadcastConfig();
    bool isConnected() const { return deviceConnected_; }

    void onConnect(BLEServer* pServer) override;
    void onDisconnect(BLEServer* pServer) override;
    void onWrite(BLECharacteristic* pCharacteristic) override;

private:
    PatternEngine* engine_ = nullptr;
    DeviceConfig* config_ = nullptr;
    BLEServer* pServer_ = nullptr;
    BLECharacteristic* pTxCharacteristic_ = nullptr;
    BLECharacteristic* pRxCharacteristic_ = nullptr;
    bool deviceConnected_ = false;

    void notifyJson_(const char* json);
    void applyStatePatch_(const JsonObjectConst& patch);
    void applyConfigPatch_(const JsonObjectConst& patch);
};
