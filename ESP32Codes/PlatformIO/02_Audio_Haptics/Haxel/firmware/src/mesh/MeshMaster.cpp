#include "MeshMaster.h"
#include "EspNowTransport.h"
#include "../core/Engine.h"
#include "../core/Config.h"
#include "../core/AudioAnalyzer.h"
#include "../core/PatternRegistry.h"
#include "../web/StateApi.h"
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <cstddef>

namespace haxel::mesh {

using namespace haxel::core;

MeshMaster& MeshMaster::instance() {
    static MeshMaster m;
    return m;
}

bool MeshMaster::begin(Engine* engine, Config* config, AudioAnalyzer* audio) {
    engine_ = engine;
    config_ = config;
    audio_ = audio;
    if (!engine_ || !config_) return false;

    // SoftAP should already be on kMeshChannel (main.cpp). Lock again for safety.
    esp_wifi_set_channel(kMeshChannel, WIFI_SECOND_CHAN_NONE);

    auto& transport = EspNowTransport::instance();
    if (!transport.begin(kMeshChannel)) return false;

    transport.setRecvHandler([this](const uint8_t* mac, const uint8_t* data, int len) {
        onRecv_(mac, data, len);
    });

    // Seed fleet pattern from local engine.
    StagedState s;
    engine_->copyState(s);
    fleetOn_ = s.on;
    fleetMute_ = s.mute;
    fleetIntensity_ = s.intensity;
    fleetSpeed_ = s.speed;
    fleetFloor_ = s.startupFloor;
    if (s.pattern) copyName(fleetPattern_, sizeof(fleetPattern_), s.pattern->id());

    lastEngineOn_ = fleetOn_;
    lastEngineMute_ = fleetMute_;
    lastEngineFaulted_ = (engine_->state() == EngineState::FAULT);
    lastEngineIntensity_ = fleetIntensity_;
    lastEngineSpeed_ = fleetSpeed_;
    lastEngineFloor_ = fleetFloor_;
    copyName(lastEnginePattern_, sizeof(lastEnginePattern_), fleetPattern_);
    engineSyncHoldUntilMs_ = 0;

    Serial.println("[MESH] Master role active");
    return true;
}

void MeshMaster::tick() {
    EspNowTransport::instance().pump();
    expireLeases_();
    syncFromEngineIfChanged_();
    broadcastAudioIfDue_();
    broadcastStateIfDue_();
}

void MeshMaster::syncFromEngineIfChanged_() {
    if (!engine_) return;
    const uint32_t now = millis();
    if ((int32_t)(now - engineSyncHoldUntilMs_) < 0) return;

    const bool faulted = (engine_->state() == EngineState::FAULT);
    if (faulted && !lastEngineFaulted_) {
        lastEngineFaulted_ = true;
        sendEstop();
        return;
    }
    if (!faulted) {
        lastEngineFaulted_ = false;
    }

    StagedState s;
    engine_->copyState(s);
    char pid[kPatternIdLen] = "";
    PatternRegistry::instance().copyIdIfValid(s.pattern, pid, sizeof(pid));
    const bool changed =
        (s.on != lastEngineOn_) ||
        (s.mute != lastEngineMute_) ||
        fabsf(s.intensity - lastEngineIntensity_) > 0.001f ||
        fabsf(s.speed - lastEngineSpeed_) > 0.001f ||
        fabsf(s.startupFloor - lastEngineFloor_) > 0.001f ||
        strcmp(pid, lastEnginePattern_) != 0;

    if (!changed) return;

    lastEngineOn_ = s.on;
    lastEngineMute_ = s.mute;
    lastEngineIntensity_ = s.intensity;
    lastEngineSpeed_ = s.speed;
    lastEngineFloor_ = s.startupFloor;
    copyName(lastEnginePattern_, sizeof(lastEnginePattern_), pid);

    fleetOn_ = s.on;
    fleetMute_ = s.mute;
    fleetIntensity_ = s.intensity;
    fleetSpeed_ = s.speed;
    fleetFloor_ = s.startupFloor;
    if (pid[0]) copyName(fleetPattern_, sizeof(fleetPattern_), pid);
    for (size_t i = 0; i < nodeCount_; ++i) {
        nodes_[i].hasOverride = false;
    }
    ++stateEpoch_;
    sendStateToFleet(nullptr);
}

size_t MeshMaster::nodeCount() const { return nodeCount_; }

const FleetNode* MeshMaster::nodeAt(size_t i) const {
    return i < nodeCount_ ? &nodes_[i] : nullptr;
}

FleetNode* MeshMaster::findNode(const uint8_t* mac) {
    if (!mac) return nullptr;
    for (size_t i = 0; i < nodeCount_; ++i) {
        if (macEqual(nodes_[i].mac, mac)) return &nodes_[i];
    }
    return nullptr;
}

FleetNode* MeshMaster::upsertNode_(const uint8_t* mac) {
    FleetNode* n = findNode(mac);
    if (n) return n;
    if (nodeCount_ >= kMaxFleet) return nullptr;
    n = &nodes_[nodeCount_++];
    *n = FleetNode{};
    macCopy(n->mac, mac);
    return n;
}

void MeshMaster::expireLeases_() {
    const uint32_t now = millis();
    for (size_t i = 0; i < nodeCount_; ++i) {
        if (nodes_[i].online && (now - nodes_[i].lastSeenMs) > kLeaseTimeoutMs) {
            nodes_[i].online = false;
            Serial.printf("[MESH] lease expired %s\n", nodes_[i].name);
        }
    }
}

bool MeshMaster::sendPacket_(MsgType type, const uint8_t* mac, const void* payload, size_t payloadLen) {
    uint8_t buf[250];
    if (sizeof(Header) + payloadLen > sizeof(buf)) return false;
    Header* h = reinterpret_cast<Header*>(buf);
    h->magic = kMagic;
    h->version = kVersion;
    h->type = (uint8_t)type;
    h->seq = ++seq_;
    EspNowTransport::instance().getOwnMac(h->senderMac);
    h->payloadLen = (uint16_t)payloadLen;
    if (payloadLen && payload) {
        memcpy(buf + sizeof(Header), payload, payloadLen);
    }
    if (!mac || macIsBroadcast(mac)) {
        return EspNowTransport::instance().broadcast(buf, sizeof(Header) + payloadLen);
    }
    return EspNowTransport::instance().send(mac, buf, sizeof(Header) + payloadLen);
}

void MeshMaster::onRecv_(const uint8_t* mac, const uint8_t* data, int len) {
    if (!mac || !data || len < (int)sizeof(Header)) return;
    const Header* h = reinterpret_cast<const Header*>(data);
    if (h->magic != kMagic || h->version != kVersion) return;
    if (len < (int)(sizeof(Header) + h->payloadLen)) return;
    const uint8_t* payload = data + sizeof(Header);

    // RSSI not available from queued path; leave 0 unless we extend later.
    const int8_t rssi = 0;

    switch ((MsgType)h->type) {
        case MsgType::Hello:
            if (h->payloadLen >= sizeof(HelloPayload)) {
                HelloPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleHello_(mac, p, rssi);
            }
            break;
        case MsgType::Telemetry:
            if (h->payloadLen >= sizeof(TelemetryPayload)) {
                TelemetryPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleTelemetry_(mac, p, rssi);
            }
            break;
        case MsgType::ClaimAck:
            if (h->payloadLen >= sizeof(ClaimPayload)) {
                ClaimPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleClaimAck_(mac, p);
            }
            break;
        case MsgType::ConfigAck:
            if (h->payloadLen >= sizeof(ConfigAckPayload)) {
                ConfigAckPayload p{};
                memcpy(&p, payload, sizeof(p));
                handleConfigAck_(mac, p);
            }
            break;
        default:
            break;
    }
}

void MeshMaster::handleHello_(const uint8_t* mac, const HelloPayload& p, int8_t rssi) {
    FleetNode* n = upsertNode_(mac);
    if (!n) {
        Serial.println("[MESH] fleet full, ignoring HELLO");
        return;
    }
    copyName(n->name, sizeof(n->name), p.name);
    n->configEpoch = p.configEpoch;
    n->stateEpoch = p.stateEpoch;
    n->duty = p.duty;
    n->rssi = rssi;
    n->online = true;
    n->lastSeenMs = millis();
    EspNowTransport::instance().ensurePeer(mac);

    // Auto-claim unclaimed HELLO so Master owns the pool without a click.
    if (!n->claimed && !p.claimed) {
        claimMac(mac);
    }
}

void MeshMaster::handleTelemetry_(const uint8_t* mac, const TelemetryPayload& p, int8_t rssi) {
    FleetNode* n = upsertNode_(mac);
    if (!n) return;
    copyName(n->name, sizeof(n->name), p.name);
    copyName(n->patternId, sizeof(n->patternId), p.patternId);
    n->configEpoch = p.configEpoch;
    n->stateEpoch = p.stateEpoch;
    n->intensity = p.intensity;
    n->duty = p.duty;
    n->wave = p.wave;
    n->on = p.on;
    n->mute = p.mute;
    n->claimed = p.claimed;
    n->rssi = rssi;
    n->online = true;
    n->lastSeenMs = millis();
    n->waveHistory[n->waveIdx % 32] = p.wave;
    n->waveIdx++;
}

void MeshMaster::handleClaimAck_(const uint8_t* mac, const ClaimPayload&) {
    FleetNode* n = findNode(mac);
    if (!n) return;
    n->claimed = true;
    n->online = true;
    n->lastSeenMs = millis();
    Serial.printf("[MESH] claimed ACK from %s\n", n->name);
}

void MeshMaster::handleConfigAck_(const uint8_t* mac, const ConfigAckPayload& p) {
    FleetNode* n = findNode(mac);
    if (!n) return;
    if (p.ok) n->configEpoch = p.epoch;
    Serial.printf("[MESH] config ACK from %s ok=%d epoch=%u\n",
                  n->name, (int)p.ok, (unsigned)p.epoch);
}

bool MeshMaster::claimMac(const uint8_t* mac) {
    if (!mac) return false;
    FleetNode* n = upsertNode_(mac);
    if (!n) return false;
    ClaimPayload p{};
    copyName(p.masterName, sizeof(p.masterName), config_->apSsid().c_str());
    p.channel = kMeshChannel;
    p.masterConfigEpoch = configEpoch_;
    bool ok = sendPacket_(MsgType::Claim, mac, &p, sizeof(p));
    if (ok) n->claimed = true;
    return ok;
}

bool MeshMaster::releaseMac(const uint8_t* mac) {
    if (!mac) return false;
    FleetNode* n = findNode(mac);
    ClaimPayload p{};
    copyName(p.masterName, sizeof(p.masterName), config_->apSsid().c_str());
    p.channel = kMeshChannel;
    bool ok = sendPacket_(MsgType::Release, mac, &p, sizeof(p));
    if (n) n->claimed = false;
    return ok;
}

bool MeshMaster::claimAll() {
    bool any = false;
    for (size_t i = 0; i < nodeCount_; ++i) {
        if (nodes_[i].online) any |= claimMac(nodes_[i].mac);
    }
    return any;
}

bool MeshMaster::releaseAll() {
    bool any = false;
    for (size_t i = 0; i < nodeCount_; ++i) {
        if (nodes_[i].claimed) any |= releaseMac(nodes_[i].mac);
    }
    return any;
}

bool MeshMaster::sendStateToFleet(const uint8_t* targetMac) {
    const bool isBroadcast = (!targetMac || macIsBroadcast(targetMac));
    FleetNode* node = isBroadcast ? nullptr : findNode(targetMac);

    bool  useOn        = fleetOn_;
    bool  useMute      = fleetMute_;
    float useIntensity = fleetIntensity_;
    float useSpeed     = fleetSpeed_;
    float useFloor     = fleetFloor_;
    const char* usePat = fleetPattern_;

    if (node && node->hasOverride) {
        useOn        = node->targetOn;
        useMute      = node->targetMute;
        useIntensity = node->targetIntensity;
        useSpeed     = node->targetSpeed;
        useFloor     = node->targetFloor;
        usePat       = node->targetPattern;
    }

    StatePayload p{};
    p.flags = 0;
    if (useOn) p.flags |= kFlagOn;
    if (useMute) p.flags |= kFlagMute;
    if (!useOn || useMute || useIntensity <= 0.001f) p.flags |= kFlagZero;
    p.stateEpochLo = (uint16_t)(stateEpoch_ & 0xFFFF);
    p.intensity = useIntensity;
    p.speed = useSpeed;
    p.startupFloor = useFloor;
    copyName(p.patternId, sizeof(p.patternId), usePat);
    if (!isBroadcast) macCopy(p.targetMac, targetMac);
    else macSetBroadcast(p.targetMac);

    if (isBroadcast) {
        lastStateMs_ = millis();
    }
    return sendPacket_(MsgType::State, nullptr, &p, sizeof(p));
}

bool MeshMaster::sendEstop() {
    lastEngineFaulted_ = true;
    EstopPayload p{};
    p.reason = 0;
    bool ok = true;
    for (uint8_t i = 0; i < kEstopBurstCount; ++i) {
        ok &= sendPacket_(MsgType::Estop, nullptr, &p, sizeof(p));
        delay(5);
    }
    fleetOn_ = false;
    fleetMute_ = false;
    lastEngineOn_ = false;
    lastEngineMute_ = false;
    for (size_t i = 0; i < nodeCount_; ++i) {
        if (nodes_[i].hasOverride) {
            nodes_[i].targetOn = false;
            nodes_[i].targetMute = false;
        }
    }
    if (engine_) {
        StagedState s;
        engine_->copyState(s);
        s.on = false;
        s.mute = false;
        engine_->stageState(s);
        engineSyncHoldUntilMs_ = millis() + 40;
    }
    ++stateEpoch_;
    return ok;
}

bool MeshMaster::applyFleetStatePatch(JsonObjectConst patch, const uint8_t* targetMac) {
    const bool isTargeted = (targetMac && !macIsBroadcast(targetMac));
    if (isTargeted) {
        FleetNode* n = findNode(targetMac);
        if (!n) return false;
        if (!n->hasOverride) {
            n->targetOn = fleetOn_;
            n->targetMute = fleetMute_;
            n->targetIntensity = fleetIntensity_;
            n->targetSpeed = fleetSpeed_;
            n->targetFloor = fleetFloor_;
            copyName(n->targetPattern, sizeof(n->targetPattern), fleetPattern_);
            n->hasOverride = true;
        }
        if (patch["on"].is<bool>()) n->targetOn = patch["on"].as<bool>();
        if (patch["mute"].is<bool>()) n->targetMute = patch["mute"].as<bool>();
        if (patch["intensity"].is<float>()) n->targetIntensity = patch["intensity"].as<float>();
        if (patch["speed"].is<float>()) n->targetSpeed = patch["speed"].as<float>();
        if (patch["startupFloor"].is<float>()) n->targetFloor = patch["startupFloor"].as<float>();
        if (patch["pattern"].is<const char*>()) {
            copyName(n->targetPattern, sizeof(n->targetPattern), patch["pattern"].as<const char*>());
        }
        ++stateEpoch_;
        return sendStateToFleet(targetMac);
    }

    if (patch["on"].is<bool>()) fleetOn_ = patch["on"].as<bool>();
    if (patch["mute"].is<bool>()) fleetMute_ = patch["mute"].as<bool>();
    if (patch["intensity"].is<float>()) fleetIntensity_ = patch["intensity"].as<float>();
    if (patch["speed"].is<float>()) fleetSpeed_ = patch["speed"].as<float>();
    if (patch["startupFloor"].is<float>()) fleetFloor_ = patch["startupFloor"].as<float>();
    if (patch["pattern"].is<const char*>()) {
        copyName(fleetPattern_, sizeof(fleetPattern_), patch["pattern"].as<const char*>());
    }
    for (size_t i = 0; i < nodeCount_; ++i) {
        nodes_[i].hasOverride = false;
    }
    ++stateEpoch_;

    // Mirror onto Master locally so the portal and fleet stay aligned.
    if (engine_) {
        lastEngineOn_ = fleetOn_;
        lastEngineMute_ = fleetMute_;
        lastEngineIntensity_ = fleetIntensity_;
        lastEngineSpeed_ = fleetSpeed_;
        lastEngineFloor_ = fleetFloor_;
        copyName(lastEnginePattern_, sizeof(lastEnginePattern_), fleetPattern_);
        engineSyncHoldUntilMs_ = millis() + 40;
        web::applyStatePatch(patch, engine_);
    }
    return sendStateToFleet(nullptr);
}

void MeshMaster::broadcastStateIfDue_() {
    const uint32_t now = millis();
    if (now - lastStateMs_ < kStateBroadcastMs) return;

    bool anyOverride = false;
    for (size_t i = 0; i < nodeCount_; ++i) {
        if ((nodes_[i].online || nodes_[i].claimed) && nodes_[i].hasOverride) {
            anyOverride = true;
            break;
        }
    }

    if (!anyOverride) {
        // Keep followers alive with periodic broadcast STATE.
        sendStateToFleet(nullptr);
    } else {
        lastStateMs_ = now;
        for (size_t i = 0; i < nodeCount_; ++i) {
            if (nodes_[i].online || nodes_[i].claimed) {
                sendStateToFleet(nodes_[i].mac);
            }
        }
    }
    if ((fleetMute_ || !fleetOn_) && (now - lastZeroMs_ > 200)) {
        lastZeroMs_ = now;
    }
}

void MeshMaster::broadcastAudioIfDue_() {
    const uint32_t now = millis();
    if (now - lastAudioMs_ < kAudioBroadcastMs) return;

    AudioFrame frame{};
    bool haveAudio = false;
    if (audio_ && audio_->ready()) {
        frame = audio_->latest();
        haveAudio = frame.valid;
    }
    if (!haveAudio && engine_) {
        haveAudio = engine_->copyRemoteAudio(frame, 400);
    }
    if (!haveAudio || !frame.valid) return;
    lastAudioMs_ = now;

    AudioPayload p{};
    p.valid = 1;
    p.onset = frame.onset ? 1 : 0;
    p.rms = frame.rms;
    p.peakDb = frame.peakDb;
    for (int i = 0; i < 32; ++i) p.mags[i] = quantize01(frame.mags[i]);
    sendPacket_(MsgType::Audio, nullptr, &p, sizeof(p));
}

bool MeshMaster::pushConfigToNode(const uint8_t* mac, JsonObjectConst cfg) {
    if (!mac || !config_ || cfg.isNull() || cfg.size() == 0) return false;
    JsonDocument doc;
    JsonObject dst = doc.to<JsonObject>();
    for (JsonPairConst kv : cfg) {
        dst[kv.key()] = kv.value();
    }

    String body;
    serializeJson(doc, body);
    ++configEpoch_;

    const size_t chunkSize = 160;
    const uint16_t total = (uint16_t)((body.length() + chunkSize - 1) / chunkSize);
    for (uint16_t seq = 0; seq < total; ++seq) {
        ConfigChunkPayload p{};
        p.epoch = configEpoch_;
        p.seq = seq;
        p.total = total;
        p.section = 0;
        size_t off = seq * chunkSize;
        size_t n = body.length() - off;
        if (n > chunkSize) n = chunkSize;
        p.dataLen = (uint8_t)n;
        memcpy(p.data, body.c_str() + off, n);
        p.data[n] = '\0';
        size_t pktPayload = offsetof(ConfigChunkPayload, data) + n;
        if (!sendPacket_(MsgType::ConfigChunk, mac, &p, pktPayload)) {
            return false;
        }
        delay(8);
    }
    return true;
}

void MeshMaster::serializeFleet(JsonObject root) const {
    root["role"] = "master";
    root["channel"] = kMeshChannel;
    root["stateEpoch"] = stateEpoch_;
    root["configEpoch"] = configEpoch_;
    root["fleetOn"] = fleetOn_;
    root["fleetMute"] = fleetMute_;
    root["fleetIntensity"] = fleetIntensity_;
    root["fleetSpeed"] = fleetSpeed_;
    root["fleetPattern"] = fleetPattern_;
    root["connected"] = 0;
    auto arr = root["nodes"].to<JsonArray>();
    int connected = 0;
    for (size_t i = 0; i < nodeCount_; ++i) {
        const FleetNode& n = nodes_[i];
        auto o = arr.add<JsonObject>();
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 n.mac[0], n.mac[1], n.mac[2], n.mac[3], n.mac[4], n.mac[5]);
        o["mac"] = macStr;
        o["name"] = n.name;
        o["pattern"] = n.patternId;
        o["intensity"] = n.intensity;
        o["duty"] = n.duty;
        o["wave"] = n.wave;
        o["on"] = n.on;
        o["mute"] = n.mute;
        o["claimed"] = n.claimed;
        o["online"] = n.online;
        o["rssi"] = n.rssi;
        o["configEpoch"] = n.configEpoch;
        o["stateEpoch"] = n.stateEpoch;
        auto wh = o["waveHistory"].to<JsonArray>();
        // Emit in chronological order.
        for (int k = 0; k < 32; ++k) {
            wh.add(n.waveHistory[(n.waveIdx + k) % 32]);
        }
        if (n.online) connected++;
    }
    root["connected"] = connected;
}

} // namespace haxel::mesh
