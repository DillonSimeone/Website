#include "EspNowTransport.h"

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

namespace haxel::mesh {

namespace {
void onDataRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
    if (!info || !data || len <= 0) return;
    EspNowTransport::instance().onRawRecv(info->src_addr, data, len);
}
} // namespace

EspNowTransport& EspNowTransport::instance() {
    static EspNowTransport t;
    return t;
}

bool EspNowTransport::begin(uint8_t channel) {
    channel_ = channel ? channel : kMeshChannel;

    // ESP-NOW requires the WiFi radio up. Prefer STA (no SoftAP) for followers;
    // Master brings SoftAP first then calls begin() so channel already matches.
    wifi_mode_t mode = WIFI_MODE_NULL;
    esp_wifi_get_mode(&mode);
    if (mode == WIFI_MODE_NULL) {
        WiFi.mode(WIFI_STA);
        WiFi.disconnect(false, true);
        delay(50);
    }

    esp_wifi_set_channel(channel_, WIFI_SECOND_CHAN_NONE);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[MESH] esp_now_init failed");
        return false;
    }
    esp_now_register_recv_cb(onDataRecv);

    // Always register broadcast peer (unencrypted).
    uint8_t bcast[6];
    macSetBroadcast(bcast);
    ensurePeer(bcast);

    WiFi.macAddress(ownMac_);
    wifi_mode_t curMode = WIFI_MODE_NULL;
    esp_wifi_get_mode(&curMode);
    if (curMode == WIFI_MODE_AP || curMode == WIFI_MODE_APSTA) {
        esp_wifi_get_mac(WIFI_IF_AP, ownMac_);
    }
    ready_ = true;
    Serial.printf("[MESH] ESP-NOW ready ch=%u mac=%02X:%02X:%02X:%02X:%02X:%02X\n",
                  channel_,
                  ownMac_[0], ownMac_[1], ownMac_[2],
                  ownMac_[3], ownMac_[4], ownMac_[5]);
    return true;
}

void EspNowTransport::end() {
    if (!ready_) return;
    esp_now_deinit();
    ready_ = false;
}

void EspNowTransport::getOwnMac(uint8_t out[6]) const {
    macCopy(out, ownMac_);
}

bool EspNowTransport::ensurePeer(const uint8_t* mac) {
    if (!mac) return false;
    if (esp_now_is_peer_exist(mac)) return true;
    esp_now_peer_info_t peer{};
    macCopy(peer.peer_addr, mac);
    peer.channel = channel_;
    peer.encrypt = false;
    peer.ifidx = WIFI_IF_STA;
    // SoftAP masters may send on AP iface; channel-0 peers use current channel.
    wifi_mode_t mode = WIFI_MODE_NULL;
    esp_wifi_get_mode(&mode);
    if (mode == WIFI_MODE_AP || mode == WIFI_MODE_APSTA) {
        peer.ifidx = WIFI_IF_AP;
    }
    esp_err_t err = esp_now_add_peer(&peer);
    if (err != ESP_OK) {
        Serial.printf("[MESH] add_peer failed %d\n", (int)err);
        return false;
    }
    return true;
}

bool EspNowTransport::removePeer(const uint8_t* mac) {
    if (!mac || !esp_now_is_peer_exist(mac)) return false;
    return esp_now_del_peer(mac) == ESP_OK;
}

bool EspNowTransport::send(const uint8_t* mac, const void* payload, size_t len) {
    if (!ready_ || !mac || !payload || len == 0 || len > kMaxPacket) return false;
    ensurePeer(mac);
    return esp_now_send(mac, reinterpret_cast<const uint8_t*>(payload), len) == ESP_OK;
}

bool EspNowTransport::broadcast(const void* payload, size_t len) {
    uint8_t bcast[6];
    macSetBroadcast(bcast);
    return send(bcast, payload, len);
}

void EspNowTransport::onRawRecv(const uint8_t* mac, const uint8_t* data, int len) {
    if (!mac || !data || len <= 0 || len > (int)kMaxPacket) return;
    portENTER_CRITICAL(&mux_);
    uint8_t next = (uint8_t)((qHead_ + 1) % kQueueDepth);
    if (next == qTail_) {
        // Drop oldest.
        qTail_ = (uint8_t)((qTail_ + 1) % kQueueDepth);
    }
    QueuedPacket& slot = queue_[qHead_];
    macCopy(slot.mac, mac);
    slot.len = (uint16_t)len;
    memcpy(slot.data, data, len);
    qHead_ = next;
    portEXIT_CRITICAL(&mux_);
}

void EspNowTransport::pump() {
    if (!recv_) return;
    for (;;) {
        QueuedPacket pkt;
        bool have = false;
        portENTER_CRITICAL(&mux_);
        if (qTail_ != qHead_) {
            pkt = queue_[qTail_];
            qTail_ = (uint8_t)((qTail_ + 1) % kQueueDepth);
            have = true;
        }
        portEXIT_CRITICAL(&mux_);
        if (!have) break;
        recv_(pkt.mac, pkt.data, pkt.len);
    }
}

} // namespace haxel::mesh
