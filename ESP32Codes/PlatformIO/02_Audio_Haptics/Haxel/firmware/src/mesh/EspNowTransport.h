#pragma once

#include "MeshProtocol.h"
#include <functional>

namespace haxel::mesh {

using MeshRecvFn = std::function<void(const uint8_t* mac, const uint8_t* data, int len)>;

class EspNowTransport {
public:
    static EspNowTransport& instance();

    bool begin(uint8_t channel = kMeshChannel);
    void end();
    bool ready() const { return ready_; }

    void setRecvHandler(MeshRecvFn fn) { recv_ = std::move(fn); }

    bool send(const uint8_t* mac, const void* payload, size_t len);
    bool broadcast(const void* payload, size_t len);

    bool ensurePeer(const uint8_t* mac);
    bool removePeer(const uint8_t* mac);

    void getOwnMac(uint8_t out[6]) const;
    uint8_t channel() const { return channel_; }

    // Called from esp_now recv callback (IRAM-safe path queues; pump drains).
    void onRawRecv(const uint8_t* mac, const uint8_t* data, int len);
    void pump(); // call from housekeeping / mesh tick

private:
    EspNowTransport() = default;

    bool ready_ = false;
    uint8_t channel_ = kMeshChannel;
    uint8_t ownMac_[6] = {0};
    MeshRecvFn recv_;

    static constexpr size_t kQueueDepth = 16;
    static constexpr size_t kMaxPacket = 250;
    struct QueuedPacket {
        uint8_t mac[6];
        uint16_t len;
        uint8_t data[kMaxPacket];
    };
    QueuedPacket queue_[kQueueDepth]{};
    volatile uint8_t qHead_ = 0;
    volatile uint8_t qTail_ = 0;
    portMUX_TYPE mux_ = portMUX_INITIALIZER_UNLOCKED;
};

} // namespace haxel::mesh
