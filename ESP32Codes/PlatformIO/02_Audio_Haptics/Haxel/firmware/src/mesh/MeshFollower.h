#pragma once

#include "MeshProtocol.h"
#include "../core/Pattern.h"

namespace haxel {
class Config;
namespace core { class Engine; }
}

namespace haxel::mesh {

class MeshFollower {
public:
    static MeshFollower& instance();

    bool begin(core::Engine* engine, Config* config);
    void tick();

    bool claimed() const { return claimed_; }
    void getMasterMac(uint8_t out[6]) const { macCopy(out, masterMac_); }

private:
    MeshFollower() = default;

    void onRecv_(const uint8_t* mac, const uint8_t* data, int len);
    void handleClaim_(const uint8_t* mac, const ClaimPayload& p);
    void handleRelease_(const uint8_t* mac);
    void handleState_(const StatePayload& p);
    void handleAudio_(const AudioPayload& p);
    void handleEstop_(const EstopPayload& p);
    void handleConfigChunk_(const uint8_t* mac, const ConfigChunkPayload& p);

    void sendHello_();
    void sendTelemetry_();
    void sendClaimAck_();
    void sendConfigAck_(uint32_t epoch, bool ok);
    bool sendPacket_(MsgType type, const uint8_t* mac, const void* payload, size_t payloadLen);
    void failsafeIfNeeded_();
    bool isForMe_(const uint8_t* targetMac) const;

    core::Engine* engine_ = nullptr;
    Config* config_ = nullptr;

    bool claimed_ = false;
    uint8_t masterMac_[6]{};
    uint32_t lastMasterMs_ = 0;
    uint32_t lastHelloMs_ = 0;
    uint32_t lastTelemetryMs_ = 0;
    uint16_t seq_ = 0;
    uint16_t lastStateSeq_ = 0;
    uint32_t configEpoch_ = 1;
    uint32_t stateEpoch_ = 1;

    // Config chunk reassembly
    uint32_t cfgEpoch_ = 0;
    uint16_t cfgTotal_ = 0;
    uint16_t cfgGot_ = 0;
    String cfgAccum_;
};

} // namespace haxel::mesh
