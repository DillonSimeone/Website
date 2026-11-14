#include "MeshFollower.h"
#include "EspNowTransport.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/PatternRegistry.h"
#include "../web/StateApi.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <cstddef>

#ifndef HAXEL_VERSION_STR
#define HAXEL_VERSION_STR "1.2.0-dev"
#endif

namespace haxel::mesh {

using namespace haxel::core;

MeshFollower& MeshFollower::instance() {
    static MeshFollower f;
    return f;
}

bool MeshFollower::begin(Engine* engine, Config* config) {
    engine_ = engine;
    config_ = config;
    if (!engine_ || !config_) return false;

    WiFi.mode(WIFI_STA);
    WiFi.disconnect(false, true);
    delay(50);
    esp_wifi_set_channel(kMeshChannel, WIFI_SECOND_CHAN_NONE);

    auto& transport = EspNowTransport::instance();
    if (!transport.begin(kMeshChannel)) return false;
    transport.setRecvHandler([this](const uint8_t* mac, const uint8_t* data, int len) {
        onRecv_(mac, data, len);
    });

    Serial.println("[MESH] Follower role active — advertising HELLO");
    sendHello_();
    return true;
}

void MeshFollower::tick() {
    EspNowTransport::instance().pump();
    failsafeIfNeeded_();

    const uint32_t now = millis();
    if (!claimed_) {
        if (now - lastHelloMs_ >= kHelloIntervalMs) sendHello_();
    } else {
        if (now - lastTelemetryMs_ >= kTelemetryIntervalMs) sendTelemetry_();
        // Keep a quiet heartbeat HELLO at low rate so Master leases stay warm
        // even if telemetry is delayed.
        if (now - lastHelloMs_ >= (kHelloIntervalMs * 3)) sendHello_();
    }
}

bool MeshFollower::sendPacket_(MsgType type, const uint8_t* mac, const void* payload, size_t payloadLen) {
    uint8_t buf[250];
    if (sizeof(Header) + payloadLen > sizeof(buf)) return false;
    Header* h = reinterpret_cast<Header*>(buf);
    h->magic = kMagic;
    h->version = kVersion;
    h->type = (uint8_t)type;
    h->seq = ++seq_;
    EspNowTransport::instance().getOwnMac(h->senderMac);
    h->payloadLen = (uint16_t)payloadLen;
    if (payloadLen && payload) memcpy(buf + sizeof(Header), payload, payloadLen);
    if (!mac || macIsBroadcast(mac)) {
        return EspNowTransport::instance().broadcast(buf, sizeof(Header) + payloadLen);
    }
    return EspNowTransport::instance().send(mac, buf, sizeof(Header) + payloadLen);
}

void MeshFollower::sendHello_() {
    HelloPayload p{};
    copyName(p.name, sizeof(p.name), config_->apSsid().c_str());
    copyName(p.fw, sizeof(p.fw), HAXEL_VERSION_STR);
    p.configEpoch = configEpoch_;
    p.stateEpoch = stateEpoch_;
    p.capabilities = 0;
#if HAXEL_FEATURE_LED
    p.capabilities |= 0x01;
#endif
#if HAXEL_FEATURE_AUDIO
    p.capabilities |= 0x02;
#endif
    p.claimed = claimed_ ? 1 : 0;
    p.duty = engine_ ? engine_->getChannelValue(0) : 0.0f;
    lastHelloMs_ = millis();
    sendPacket_(MsgType::Hello, nullptr, &p, sizeof(p));
}

void MeshFollower::sendTelemetry_() {
    if (!engine_) return;
    StagedState s;
    engine_->copyState(s);
    TelemetryPayload p{};
    copyName(p.name, sizeof(p.name), config_->apSsid().c_str());
    if (s.pattern) copyName(p.patternId, sizeof(p.patternId), s.pattern->id());
    p.configEpoch = configEpoch_;
    p.stateEpoch = stateEpoch_;
    p.intensity = s.intensity;
    p.duty = engine_->getChannelValue(0);
    p.wave = engine_->getPatternValue(0);
    p.on = s.on ? 1 : 0;
    p.mute = s.mute ? 1 : 0;
    p.claimed = claimed_ ? 1 : 0;
    lastTelemetryMs_ = millis();
    if (claimed_) {
        sendPacket_(MsgType::Telemetry, masterMac_, &p, sizeof(p));
    } else {
        sendPacket_(MsgType::Telemetry, nullptr, &p, sizeof(p));
    }
}

void MeshFollower::sendClaimAck_() {
    ClaimPayload p{};
    copyName(p.masterName, sizeof(p.masterName), config_->apSsid().c_str());
    p.channel = kMeshChannel;
    p.masterConfigEpoch = configEpoch_;
    sendPacket_(MsgType::ClaimAck, masterMac_, &p, sizeof(p));
}

void MeshFollower::sendConfigAck_(uint32_t epoch, bool ok) {
    ConfigAckPayload p{};
    p.epoch = epoch;
    p.ok = ok ? 1 : 0;
    sendPacket_(MsgType::ConfigAck, masterMac_, &p, sizeof(p));
}

void MeshFollower::onRecv_(const uint8_t* mac, const uint8_t* data, int len) {
    if (!mac || !data || len < (int)sizeof(Header)) return;
    const Header* h = reinterpret_cast<const Header*>(data);
    if (h->magic != kMagic || h->version != kVersion) return;
    if (len < (int)(sizeof(Header) + h->payloadLen)) return;
    const uint8_t* payload = data + sizeof(Header);

    switch ((MsgType)h->type) {
        case MsgType::Claim:
            if (h->payloadLen >= sizeof(ClaimPayload)) {
                ClaimPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleClaim_(mac, p);
            }
            break;
        case MsgType::Release:
            handleRelease_(mac);
            break;
        case MsgType::State:
            if (h->payloadLen >= sizeof(StatePayload)) {
                StatePayload p{};
                memcpy(&p, payload, sizeof(p));
                handleState_(p);
            }
            break;
        case MsgType::Audio:
            if (h->payloadLen >= sizeof(AudioPayload)) {
                AudioPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleAudio_(p);
            }
            break;
        case MsgType::Estop:
            if (h->payloadLen >= sizeof(EstopPayload)) {
                EstopPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleEstop_(p);
            }
            break;
        case MsgType::ConfigChunk:
            if (h->payloadLen >= offsetof(ConfigChunkPayload, data)) {
                ConfigChunkPayload p{};
                size_t copyLen = h->payloadLen;
                if (copyLen > sizeof(p)) copyLen = sizeof(p);
                memcpy(&p, payload, copyLen);
                handleConfigChunk_(mac, p);
            }
            break;
        default:
            break;
    }
}

void MeshFollower::handleClaim_(const uint8_t* mac, const ClaimPayload& p) {
    macCopy(masterMac_, mac);
    EspNowTransport::instance().ensurePeer(mac);
    claimed_ = true;
    lastMasterMs_ = millis();
    Serial.printf("[MESH] claimed by %s\n", p.masterName);
    sendClaimAck_();
}

void MeshFollower::handleRelease_(const uint8_t* mac) {
    if (claimed_ && !macEqual(mac, masterMac_)) return;
    claimed_ = false;
    memset(masterMac_, 0, 6);
    Serial.println("[MESH] released — resuming public HELLO");
}

bool MeshFollower::isForMe_(const uint8_t* targetMac) const {
    if (!targetMac || macIsBroadcast(targetMac)) return true;
    uint8_t own[6];
    EspNowTransport::instance().getOwnMac(own);
    return macEqual(targetMac, own);
}

void MeshFollower::handleState_(const StatePayload& p) {
    if (!claimed_ || !engine_) return;
    if (!isForMe_(p.targetMac)) return;

    lastMasterMs_ = millis();
    ++stateEpoch_;

    StagedState s;
    engine_->copyState(s);
    s.on = (p.flags & kFlagOn) != 0;
    s.mute = (p.flags & kFlagMute) != 0;
    s.intensity = p.intensity;
    s.speed = p.speed;
    s.startupFloor = p.startupFloor;
    if (p.flags & kFlagZero) {
        s.on = false;
        s.mute = true;
    }
    if (p.patternId[0]) {
        IPattern* pat = PatternRegistry::instance().find(p.patternId);
        if (pat) s.pattern = pat;
    }
    engine_->stageState(s);
}

void MeshFollower::handleAudio_(const AudioPayload& p) {
    if (!claimed_ || !engine_) return;
    lastMasterMs_ = millis();
    AudioFrame frame{};
    frame.valid = p.valid != 0;
    frame.onset = p.onset != 0;
    frame.rms = p.rms;
    frame.peakDb = p.peakDb;
    for (int i = 0; i < 32; ++i) frame.mags[i] = dequantize01(p.mags[i]);
    engine_->pushRemoteAudio(frame);
}

void MeshFollower::handleEstop_(const EstopPayload&) {
    if (!engine_) return;
    lastMasterMs_ = millis();
    engine_->requestEStop();
    StagedState s;
    engine_->copyState(s);
    s.on = false;
    s.mute = true;
    engine_->stageState(s);
}

void MeshFollower::handleConfigChunk_(const uint8_t* mac, const ConfigChunkPayload& p) {
    if (!claimed_ || !macEqual(mac, masterMac_)) return;
    lastMasterMs_ = millis();

    if (p.seq == 0 || cfgEpoch_ != p.epoch) {
        cfgEpoch_ = p.epoch;
        cfgTotal_ = p.total;
        cfgGot_ = 0;
        cfgAccum_ = "";
    }
    if (p.seq != cfgGot_) {
        // Out of order — reset and wait for retry.
        cfgAccum_ = "";
        cfgGot_ = 0;
        cfgEpoch_ = 0;
        sendConfigAck_(p.epoch, false);
        return;
    }
    cfgAccum_ += String(p.data).substring(0, p.dataLen);
    cfgGot_++;

    if (cfgGot_ < cfgTotal_) return;

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, cfgAccum_);
    if (err) {
        sendConfigAck_(p.epoch, false);
        return;
    }
    web::applyConfigPatch(doc.as<JsonObjectConst>(), config_);
    configEpoch_ = p.epoch;
    cfgAccum_ = "";
    cfgGot_ = 0;
    sendConfigAck_(p.epoch, true);
    // Persist + reboot so driver pins take effect.
    config_->save();
    delay(300);
    ESP.restart();
}

void MeshFollower::failsafeIfNeeded_() {
    if (!claimed_ || !engine_) return;
    if (millis() - lastMasterMs_ < kLinkFailsafeMs) return;
    // Link lost — stop motors, unclaim, resume HELLO advertising.
    StagedState s;
    engine_->copyState(s);
    if (s.on || !s.mute) {
        s.on = false;
        s.mute = true;
        engine_->stageState(s);
        Serial.println("[MESH] link failsafe — motors off");
    }
    claimed_ = false;
    memset(masterMac_, 0, 6);
}

} // namespace haxel::mesh
