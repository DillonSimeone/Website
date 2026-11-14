#pragma once

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "../core/Engine.h"
#include "../core/Config.h"

namespace haxel::web {

class BleServer : public BLEServerCallbacks, public BLECharacteristicCallbacks {
public:
    bool begin(core::Engine* engine, Config* config);
    void stop();
    void pump();
    void broadcastState();
    void broadcastConfig();

    // BLEServerCallbacks
    void onConnect(BLEServer* pServer) override;
    void onDisconnect(BLEServer* pServer) override;

    // BLECharacteristicCallbacks
    void onWrite(BLECharacteristic* pCharacteristic) override;

private:
    core::Engine* engine_ = nullptr;
    Config* config_ = nullptr;
    BLEServer* pServer_ = nullptr;
    BLECharacteristic* pTxCharacteristic_ = nullptr;
    BLECharacteristic* pRxCharacteristic_ = nullptr;
    volatile bool deviceConnected_ = false;
    volatile bool configSyncPending_ = false;
    volatile bool stateSyncPending_ = false;
    volatile bool advRestartPending_ = false;
    uint32_t advRestartAtMs_ = 0;
    volatile bool configSyncInProgress_ = false;
    bool configWriteInProgress_ = false;
    bool configWriteNeedsReboot_ = false;

    QueueHandle_t rxQueue_ = nullptr;

    void processWrite_(const char* data, size_t len);
    void notifyJson_(ArduinoJson::JsonDocument& doc);
};

} // namespace haxel::web
