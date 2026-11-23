#pragma once

#include <Arduino.h>
#if __has_include(<BLEDevice.h>)
#define HAXEL_BLE_V4 0
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#elif __has_include(<BLE.h>)
#define HAXEL_BLE_V4 1
#include <BLE.h>
#endif
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "../core/Engine.h"
#include "../core/Config.h"

namespace haxel { class StatusLed; }

namespace haxel::web {

#if HAXEL_BLE_V4
class BleServer {
public:
    bool begin(core::Engine* engine, Config* config, StatusLed* statusLed = nullptr);
    void stop();
    void pump();
    void broadcastState();
    void broadcastChannels();
    void broadcastBins();
    void broadcastConfig();

private:
    void handleConnect_();
    void handleDisconnect_();
    void handleWrite_(BLECharacteristic chr);

    core::Engine* engine_ = nullptr;
    Config* config_ = nullptr;
    StatusLed* statusLed_ = nullptr;
    BLEServer server_;
    BLECharacteristic txChar_;
    BLECharacteristic rxChar_;
#else
class BleServer : public BLEServerCallbacks, public BLECharacteristicCallbacks {
public:
    bool begin(core::Engine* engine, Config* config, StatusLed* statusLed = nullptr);
    void stop();
    void pump();
    void broadcastState();
    void broadcastChannels();
    void broadcastBins();
    void broadcastConfig();

    // BLEServerCallbacks
    void onConnect(BLEServer* pServer) override;
    void onDisconnect(BLEServer* pServer) override;

    // BLECharacteristicCallbacks
    void onWrite(BLECharacteristic* pCharacteristic) override;

private:
    core::Engine* engine_ = nullptr;
    Config* config_ = nullptr;
    StatusLed* statusLed_ = nullptr;
    BLEServer* pServer_ = nullptr;
    BLECharacteristic* pTxCharacteristic_ = nullptr;
    BLECharacteristic* pRxCharacteristic_ = nullptr;
#endif
    volatile bool deviceConnected_ = false;
    volatile bool configSyncPending_ = false;
    volatile bool stateSyncPending_ = false;
    volatile bool binsSyncPending_ = false;
    volatile bool advRestartPending_ = false;
    volatile bool disconnectCleanupPending_ = false;
    uint32_t advRestartAtMs_ = 0;
    volatile bool configSyncInProgress_ = false;
    bool configWriteInProgress_ = false;
    bool configWriteNeedsReboot_ = false;

    // Chunked custom pattern upload state (cleared on disconnect).
    String cpId_;
    String cpName_;
    String cpCode_;
    int cpTotal_ = 0;
    int cpNext_ = 0;

    KnobConfig pendingKnobs_[Config::kMaxKnobs];
    size_t pendingKnobCount_ = 0;
    bool pendingKnobsUpdated_ = false;

    QueueHandle_t rxQueue_ = nullptr;

    void processWrite_(const char* data, size_t len);
    void notifyJson_(ArduinoJson::JsonDocument& doc);
};

} // namespace haxel::web
