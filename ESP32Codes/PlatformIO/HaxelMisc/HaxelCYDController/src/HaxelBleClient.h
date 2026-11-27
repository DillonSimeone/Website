#pragma once

#include <Arduino.h>
#include <NimBLEDevice.h>

struct HaxelUnit {
    char name[32];
    NimBLEAddress address;
    int rssi;
};

struct ChannelDetail {
    bool on = true;
    bool synced = true;
    float intensity = 1.0f;
    float speed = 1.0f;
    float startupFloor = 0.35f;
    float ceiling = 1.0f;
    char patternOverride[32] = "";
};

struct HaxelState {
    bool valid = false;
    bool on = false;
    bool mute = false;
    float intensity = 0.7f;     // 0.0 .. 1.0
    float speed = 1.0f;         // 0.25 .. 4.0
    float freq = 150.0f;        // 10 .. 500 Hz
    char pattern[32] = "Sine";
    float startupFloor = 0.0f;  // 0.0 .. 1.0
    bool audioReactive = false;
    float audioGain = 1.0f;     // 0.1 .. 10.0
    uint8_t channelCount = 8;
    bool channels[8] = {true, true, true, true, true, true, true, true};
    ChannelDetail chDetails[8];
    int8_t driverPins[8] = {-1, -1, -1, -1, -1, -1, -1, -1};
    bool audioEnabled = false;
    uint8_t audioSource = 0;    // 0=NONE, 1=ADC(Analog), 2=I2S(SPI)
    int8_t i2sBclk = -1;
    int8_t i2sWs = -1;
    int8_t i2sSd = -1;
    int8_t adcPin = -1;
    int maxPin = 21;
    bool pinUnavailable[64] = {false};
};

class HaxelBleClient {
public:
    static constexpr int kMaxUnits = 8;

    void begin();
    void pump();

    // Scanning
    bool startScan(uint32_t durationSec = 4);
    bool isScanning() const { return scanning_; }
    int unitCount() const { return unitCount_; }
    const HaxelUnit& unit(int idx) const { return units_[idx]; }

    // Connection
    bool connectToUnit(int idx);
    void disconnect();
    bool isConnected() const { return connected_; }
    const char* connectedName() const { return connectedName_; }
    const NimBLEAddress& connectedAddress() const { return connectedAddr_; }

    // State access & commands
    const HaxelState& state() const { return state_; }
    bool consumeStateDirty();
    bool consumeScanDirty();
    bool consumeConnDirty();

    void sendSyncRequest();
    void sendBoolPatch(const char* key, bool val);
    void sendFloatPatch(const char* key, float val);
    void sendStringPatch(const char* key, const char* val);
    void sendChannelsPatch(const bool* channels, int count);
    void sendChannelDetailPatch(int chIdx, const ChannelDetail& detail);
    void sendDriverPinsConfig(const int8_t* pins, int count);
    void sendAudioConfig(bool enabled, uint8_t source, int8_t bclk, int8_t ws, int8_t sd, int8_t adc, float gain);
    void sendReboot();

    // Internal callbacks
    void onScanComplete(NimBLEScanResults results);
    void onNotify(const uint8_t* data, size_t len);
    void onClientDisconnect();

private:
    static constexpr const char* kServiceUuid = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
    static constexpr const char* kRxCharUuid  = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
    static constexpr const char* kTxCharUuid  = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

    HaxelUnit units_[kMaxUnits];
    int unitCount_ = 0;
    volatile bool scanning_ = false;
    volatile bool scanDirty_ = false;

    NimBLEClient* client_ = nullptr;
    NimBLERemoteCharacteristic* rxChar_ = nullptr;
    NimBLERemoteCharacteristic* txChar_ = nullptr;
    volatile bool connected_ = false;
    volatile bool connDirty_ = false;
    char connectedName_[32] = "";
    NimBLEAddress connectedAddr_;

    HaxelState state_;
    volatile bool stateDirty_ = false;

    QueueHandle_t rxQueue_ = nullptr;

    void writeJson(const char* json);
    void handleIncomingJson(const char* data, size_t len);
};
