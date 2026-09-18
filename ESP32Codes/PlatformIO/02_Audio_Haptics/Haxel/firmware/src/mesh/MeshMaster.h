#pragma once

#include "MeshProtocol.h"
#include "../core/Pattern.h"
#include <ArduinoJson.h>

namespace haxel {
class Config;
namespace core { class Engine; class AudioAnalyzer; }
}

namespace haxel::mesh {

struct FleetNode {
    uint8_t  mac[6]{};
    char     name[kNameLen]{};
    char     patternId[kPatternIdLen]{};
    uint32_t configEpoch = 0;
    uint32_t stateEpoch = 0;
    float    intensity = 0.0f;
    float    duty = 0.0f;
    float    wave = 0.0f;
    int8_t   rssi = 0;
    bool     on = false;
    bool     mute = false;
    bool     claimed = false;
    bool     online = false;
    uint32_t lastSeenMs = 0;
    float    waveHistory[32]{};
    uint8_t  waveIdx = 0;
};

class MeshMaster {
public:
    static MeshMaster& instance();

    bool begin(core::Engine* engine, Config* config, core::AudioAnalyzer* audio);
    void tick(); // housekeeping (~10–50 Hz)

    size_t nodeCount() const;
    const FleetNode* nodeAt(size_t i) const;
    FleetNode* findNode(const uint8_t* mac);

    void serializeFleet(ArduinoJson::JsonObject root) const;

    bool claimMac(const uint8_t* mac);
    bool releaseMac(const uint8_t* mac);
    bool claimAll();
    bool releaseAll();

    // Broadcast / targeted state to fleet (targetMac null or broadcast = all claimed).
    bool sendStateToFleet(const uint8_t* targetMac = nullptr);
    bool sendEstop();
    bool applyFleetStatePatch(ArduinoJson::JsonObjectConst patch, const uint8_t* targetMac = nullptr);

    // Push a compact config section to one follower (JSON string chunked).
    bool pushConfigToNode(const uint8_t* mac);

    uint32_t stateEpoch() const { return stateEpoch_; }
    uint32_t configEpoch() const { return configEpoch_; }
    void bumpConfigEpoch() { ++configEpoch_; }

private:
    MeshMaster() = default;

    void onRecv_(const uint8_t* mac, const uint8_t* data, int len);
    void handleHello_(const uint8_t* mac, const HelloPayload& p, int8_t rssi);
    void handleTelemetry_(const uint8_t* mac, const TelemetryPayload& p, int8_t rssi);
    void handleClaimAck_(const uint8_t* mac, const ClaimPayload& p);
    void handleConfigAck_(const uint8_t* mac, const ConfigAckPayload& p);

    bool sendPacket_(MsgType type, const uint8_t* mac, const void* payload, size_t payloadLen);
    FleetNode* upsertNode_(const uint8_t* mac);
    void expireLeases_();
    void broadcastAudioIfDue_();
    void broadcastStateIfDue_();

    core::Engine* engine_ = nullptr;
    Config* config_ = nullptr;
    core::AudioAnalyzer* audio_ = nullptr;

    FleetNode nodes_[kMaxFleet]{};
    size_t nodeCount_ = 0;

    uint16_t seq_ = 0;
    uint32_t stateEpoch_ = 1;
    uint32_t configEpoch_ = 1;
    uint32_t lastStateMs_ = 0;
    uint32_t lastAudioMs_ = 0;
    uint32_t lastZeroMs_ = 0;

    // Pending fleet override (what Master wants followers to play).
    bool  fleetOn_ = true;
    bool  fleetMute_ = false;
    float fleetIntensity_ = 0.6f;
    float fleetSpeed_ = 1.0f;
    float fleetFloor_ = 0.15f;
    char  fleetPattern_[kPatternIdLen] = "Breath";
};

} // namespace haxel::mesh
