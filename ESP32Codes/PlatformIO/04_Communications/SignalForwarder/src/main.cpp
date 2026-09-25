#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <Preferences.h>

#define SERVICE_UUID             "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID_CFG   "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHARACTERISTIC_UUID_CTRL  "d6a4c282-36c1-468a-b851-9e7f61c3127a"

Preferences preferences;
String currentConfigJson = "";

struct DeviceConfig {
    int pin;
    bool active;
};

DeviceConfig devices[8];

struct NoteOffEvent {
    int pin;
    uint32_t offTime;
    bool active;
};

NoteOffEvent noteOffEvents[8];

void resetDevices() {
    for (int i = 0; i < 8; i++) {
        if (devices[i].active) {
            ledcWrite(devices[i].pin, 0);
            ledcDetach(devices[i].pin);
        }
        devices[i].pin = -1;
        devices[i].active = false;
        noteOffEvents[i].active = false;
    }
}

void applyConfig(const String& jsonStr) {
    resetDevices();
    
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    
    if (error) {
        Serial.print("Failed to parse config JSON: ");
        Serial.println(error.c_str());
        
        // Fallback to default configuration: Noodle on GPIO 1
        Serial.println("Falling back to default config: GPIO 1 (LEDC PWM)");
        devices[0].pin = 1;
        devices[0].active = true;
        ledcAttach(1, 5000, 8);
        ledcWrite(1, 0);
        return;
    }
    
    JsonArray devs = doc["devices"].as<JsonArray>();
    int count = 0;
    for (JsonObject dev : devs) {
        if (count >= 8) break;
        int pin = dev["pin"] | -1;
        String type = dev["type"] | "pwm";
        
        if (pin >= 0 && type == "pwm") {
            devices[count].pin = pin;
            devices[count].active = true;
            
            int freq = dev["freq"] | 5000;
            int res = dev["res"] | 8;
            
            ledcAttach(pin, freq, res);
            ledcWrite(pin, 0);
            
            Serial.printf("Configured GPIO %d (freq: %d, res: %d)\n", pin, freq, res);
            count++;
        }
    }
}

void setPinPWM(int pin, int value) {
    for (int i = 0; i < 8; i++) {
        if (devices[i].active && devices[i].pin == pin) {
            ledcWrite(pin, value);
            return;
        }
    }
}

void handleMIDIEvent(int pin, int note, int velocity, int durationMs) {
    int pwmValue = map(velocity, 0, 127, 0, 255);
    setPinPWM(pin, pwmValue);
    
    // Clear any existing note-off event for this pin
    for (int i = 0; i < 8; i++) {
        if (noteOffEvents[i].active && noteOffEvents[i].pin == pin) {
            noteOffEvents[i].active = false;
        }
    }
    
    // Schedule a note-off event if velocity is not zero
    if (velocity > 0 && durationMs > 0) {
        for (int i = 0; i < 8; i++) {
            if (!noteOffEvents[i].active) {
                noteOffEvents[i].pin = pin;
                noteOffEvents[i].offTime = millis() + durationMs;
                noteOffEvents[i].active = true;
                break;
            }
        }
    }
}

class ConfigCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
        String value = pCharacteristic->getValue();
        if (value.length() > 0) {
            String newConfig = value;
            Serial.print("Received new config: ");
            Serial.println(newConfig);
            
            applyConfig(newConfig);
            
            preferences.begin("forwarder", false);
            preferences.putString("config", newConfig);
            preferences.end();
            
            currentConfigJson = newConfig;
        }
    }
    
    void onRead(BLECharacteristic* pCharacteristic) override {
        pCharacteristic->setValue(currentConfigJson.c_str());
    }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
        String value = pCharacteristic->getValue();
        if (value.length() == 0) return;
        
        uint8_t* data = (uint8_t*)value.c_str();
        size_t len = value.length();
        
        // 1. JSON command check
        if (data[0] == '{') {
            JsonDocument doc;
            DeserializationError error = deserializeJson(doc, value.c_str());
            if (!error) {
                int pin = doc["pin"] | 1;
                if (doc["val"].is<JsonVariant>()) {
                    int val = doc["val"] | 0;
                    setPinPWM(pin, val);
                } else if (doc["note"].is<JsonVariant>() || doc["vel"].is<JsonVariant>()) {
                    int note = doc["note"] | 60;
                    int vel = doc["vel"] | 0;
                    int dur = doc["dur"] | 0;
                    handleMIDIEvent(pin, note, vel, dur);
                }
            }
            return;
        }
        
        // 2. Binary command check
        if (len >= 3 && data[0] == 0x01) {
            int pin = data[1];
            int val = data[2];
            setPinPWM(pin, val);
        } else if (len >= 4 && data[0] == 0x02) {
            int pin = data[1];
            int note = data[2];
            int vel = data[3];
            int dur = 0;
            if (len >= 6) {
                dur = (data[4] << 8) | data[5];
            }
            handleMIDIEvent(pin, note, vel, dur);
        }
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("SignalForwarder ESP32 Starting...");
    
    // Load config from preferences
    preferences.begin("forwarder", false);
    currentConfigJson = preferences.getString("config", "");
    preferences.end();
    
    if (currentConfigJson == "") {
        currentConfigJson = "{\"devices\":[{\"pin\":1,\"type\":\"pwm\",\"freq\":5000,\"res\":8}]}";
    }
    
    Serial.print("Active config: ");
    Serial.println(currentConfigJson);
    
    applyConfig(currentConfigJson);
    
    // Initialize BLE
    BLEDevice::init("SignalForwarderESP32");
    
    BLEServer* pServer = BLEDevice::createServer();
    BLEService* pService = pServer->createService(SERVICE_UUID);
    
    // Config characteristic (Read & Write)
    BLECharacteristic* pConfigChar = pService->createCharacteristic(
        CHARACTERISTIC_UUID_CFG,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
    );
    pConfigChar->setCallbacks(new ConfigCallbacks());
    pConfigChar->setValue(currentConfigJson.c_str());
    
    // Control characteristic (Write without response for performance)
    BLECharacteristic* pControlChar = pService->createCharacteristic(
        CHARACTERISTIC_UUID_CTRL,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    pControlChar->setCallbacks(new ControlCallbacks());
    
    pService->start();
    
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    
    BLEAdvertisementData advData;
    advData.setFlags(0x06); // General Discoverable Mode & BR/EDR Not Supported
    advData.setCompleteServices(BLEUUID(SERVICE_UUID));
    pAdvertising->setAdvertisementData(advData);
    
    BLEAdvertisementData scanResponseData;
    scanResponseData.setName("SignalForwarderESP32");
    pAdvertising->setScanResponseData(scanResponseData);
    
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  // helper for iPhone/Windows
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();
    
    Serial.println("BLE Server Advertising...");
}

void loop() {
    // Non-blocking Note-off check
    uint32_t now = millis();
    for (int i = 0; i < 8; i++) {
        if (noteOffEvents[i].active && now >= noteOffEvents[i].offTime) {
            setPinPWM(noteOffEvents[i].pin, 0);
            noteOffEvents[i].active = false;
            Serial.printf("Note-off triggered for GPIO %d\n", noteOffEvents[i].pin);
        }
    }
    delay(1);
}
