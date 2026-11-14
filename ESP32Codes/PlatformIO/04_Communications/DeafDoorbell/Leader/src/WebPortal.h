#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <esp_wifi.h>
#include <esp_task_wdt.h>
#include "Config.h"
#include "TelemetryLog.h"
#include "EspNowManager.h"
#include "AudioEngine.h"
#include "PortalHtml.h"
#include "LogHtml.h"
#include "UpdateHtml.h"

inline DNSServer dnsServer;
inline WebServer server(80);
static const byte DNS_PORT = 53;
inline bool wifiRestartPending = false;
inline unsigned long wifiRestartAtMs = 0;

inline int appendPairedFollowersJson(char *buf, size_t bufSize, int offset, unsigned long now) {
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (offset < 0 || (size_t)offset >= bufSize) return offset;
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 pairedFollowers[i].mac[0], pairedFollowers[i].mac[1], pairedFollowers[i].mac[2],
                 pairedFollowers[i].mac[3], pairedFollowers[i].mac[4], pairedFollowers[i].mac[5]);
        bool heard = pairedFollowers[i].lastSeenMs != 0;
        uint32_t ageSec = heard ? (uint32_t)((now - pairedFollowers[i].lastSeenMs) / 1000UL)
                                : (uint32_t)(now / 1000UL);
        bool missing = ageSec >= (FOLLOWER_MISSING_MS / 1000UL);
        size_t remain = bufSize - (size_t)offset;
        int wrote = snprintf(buf + offset, remain,
            "%s{\"mac\":\"%s\",\"ageSec\":%u,\"area\":%u,\"heard\":%s,\"missing\":%s,\"idMismatch\":%s}",
            (i > 0) ? "," : "",
            macStr,
            ageSec,
            pairedFollowers[i].triggerArea,
            heard ? "true" : "false",
            missing ? "true" : "false",
            pairedFollowers[i].idMismatch ? "true" : "false");
        if (wrote < 0 || (size_t)wrote >= remain) return offset;
        offset += wrote;
    }
    return offset;
}

inline void serviceAudioDuringHttp() {
    esp_task_wdt_reset();
    sampleAndProcessAudio(millis());
}

inline void sendProgmemChunked(const char* contentType, const char* progmem) {
    const size_t total = strlen_P(progmem);
    const size_t CHUNK = 1024;
    char buf[CHUNK];
    size_t offset = 0;

    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, contentType, "");
    while (offset < total) {
        size_t n = min(CHUNK, total - offset);
        memcpy_P(buf, progmem + offset, n);
        server.sendContent(buf, n);
        serviceAudioDuringHttp();
        offset += n;
    }
    server.sendContent("", 0);
}

inline void serviceRadioLock(unsigned long now) {
    static unsigned long lastRadioLockMs = 0;
    if (lastRadioLockMs != 0 && (now - lastRadioLockMs) < 30000UL) return;
    lastRadioLockMs = now;

    uint8_t primary = 1;
    wifi_second_chan_t second = WIFI_SECOND_CHAN_NONE;
    if (esp_wifi_get_channel(&primary, &second) == ESP_OK) {
        if (primary != 1 || second != WIFI_SECOND_CHAN_NONE) {
            esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
        }
    }
    wifi_ps_type_t ps = WIFI_PS_NONE;
    if (esp_wifi_get_ps(&ps) == ESP_OK && ps != WIFI_PS_NONE) {
        esp_wifi_set_ps(WIFI_PS_NONE);
    }
}

// ============================================================
//  Web Server Handlers (Batched Zero-Heap Buffer Optimization)
// ============================================================
inline void handleRoot() {
    sendProgmemChunked("text/html; charset=utf-8", PORTAL_HTML);
}

inline void handleLogPage() {
    sendProgmemChunked("text/html; charset=utf-8", LOG_HTML);
}

inline void handleData() {
    char colorHex[8];
    colorToHexBuf(colorHex, sizeof(colorHex), colorR, colorG, colorB);

    float reportedMad = max(currentMAD, peakMADSincePoll);
    peakMADSincePoll = currentMAD;

    unsigned long now = millis();
    bool activePair = isPairingActive(now);
    uint32_t pairSec = pairingSecondsLeft(now);
    uint32_t cooldownRemMs = leaderAlertRemainingMs(now);

    static char jsonBuf[2560];
    int offset = snprintf(jsonBuf, sizeof(jsonBuf),
        "{\"mad\":%.1f,\"level\":%.1f,\"threshold\":%d,\"debounce\":%u,\"cooldownMs\":%u,\"duration\":%d,\"brightness\":%d,\"party\":%s,\"color\":\"%s\",\"pattern\":%d,\"speed\":%.1f,\"netId\":\"%04X\",\"leaderId\":%d,\"pairing\":%s,\"pairSec\":%u,\"pairedCount\":%d,\"triggered\":%s,\"diagTotal\":%u,\"micFault\":%s,\"nvsFault\":%s,\"wifiConnected\":false,\"rssi\":0,\"ip\":\"192.168.4.1\",\"ssid\":\"%s\",\"espTotal\":%u,\"espValid\":%u,\"espUnknown\":%u,\"followers\":[",
        reportedMad,
        levelLP,
        threshold,
        debounceChunks,
        cooldownRemMs,
        duration,
        brightness,
        partyMode ? "true" : "false",
        colorHex,
        patternId,
        (float)speedX10 / 10.0f,
        networkId,
        leaderId,
        activePair ? "true" : "false",
        pairSec,
        pairedFollowerCount,
        uiTriggered ? "true" : "false",
        totalDiagEvents,
        micFault ? "true" : "false",
        nvsFault ? "true" : "false",
        apSsid.c_str(),
        totalEspNowPackets,
        validDoorbellPackets,
        unknownPackets
    );

    if (offset > 0 && (size_t)offset < sizeof(jsonBuf)) {
        offset = appendPairedFollowersJson(jsonBuf, sizeof(jsonBuf), offset, now);
    }
    if (offset > 0 && (size_t)offset < sizeof(jsonBuf)) {
        snprintf(jsonBuf + offset, sizeof(jsonBuf) - (size_t)offset, "]}");
    }
    server.send(200, "application/json", jsonBuf);
    uiTriggered = false;
}

// 24-Hour continuous audio history streaming (batched into 1KB chunks to avoid 1440 TCP stalls)
inline void handleHistory() {
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "{\"points\":[");

    int startIdx = (historyHead - historyCount + HISTORY_24H_POINTS) % HISTORY_24H_POINTS;
    char batchBuf[1024];
    int offset = 0;

    for (int i = 0; i < historyCount; i++) {
        int idx = (startIdx + i) % HISTORY_24H_POINTS;
        int minsAgo = historyCount - 1 - i;
        offset += snprintf(batchBuf + offset, sizeof(batchBuf) - offset, "%s[%d,%u,%u]",
                           (i > 0) ? "," : "",
                           minsAgo,
                           history24h[idx].peakMad,
                           history24h[idx].triggers);
        if (offset > 920) {
            server.sendContent(batchBuf);
            serviceAudioDuringHttp();
            offset = 0;
        }
    }
    snprintf(batchBuf + offset, sizeof(batchBuf) - offset, "]}");
    server.sendContent(batchBuf);
    serviceAudioDuringHttp();
}

// Trigger history log streaming (batched)
inline void handleTriggers() {
    unsigned long now = millis();
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "");

    char batchBuf[1024];
    int offset = snprintf(batchBuf, sizeof(batchBuf), "{\"total\":%u,\"triggers\":[", totalTriggerCount);

    for (int i = 0; i < triggerLogCount; i++) {
        int idx = (triggerLogHead - 1 - i + MAX_TRIGGER_LOGS) % MAX_TRIGGER_LOGS;
        TriggerLogEntry &t = triggerLog[idx];

        uint32_t ageSec = (now >= t.timestampMs) ? ((now - t.timestampMs) / 1000) : 0;
        char hexCol[8];
        colorToHexBuf(hexCol, sizeof(hexCol), t.r, t.g, t.b);

        offset += snprintf(batchBuf + offset, sizeof(batchBuf) - offset,
                           "%s{\"ageSec\":%u,\"mad\":%u,\"thresh\":%u,\"color\":\"%s\",\"isTest\":%s}",
                           (i > 0) ? "," : "",
                           ageSec,
                           t.peakMad,
                           t.threshold,
                           hexCol,
                           t.isTest ? "true" : "false");
        if (offset > 860) {
            server.sendContent(batchBuf);
            serviceAudioDuringHttp();
            offset = 0;
        }
    }

    snprintf(batchBuf + offset, sizeof(batchBuf) - offset, "]}");
    server.sendContent(batchBuf);
    serviceAudioDuringHttp();
}

inline void handleClearTriggers() {
    triggerLogHead = 0;
    triggerLogCount = 0;
    totalTriggerCount = 0;
    server.send(200, "text/plain", "OK");
}

// ESP-NOW traffic inspector log streaming (batched)
inline void handleEspNowLog() {
    unsigned long now = millis();
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "");

    char batchBuf[1024];
    int offset = snprintf(batchBuf, sizeof(batchBuf),
                          "{\"total\":%u,\"doorbell\":%u,\"unknown\":%u,\"logs\":[",
                          totalEspNowPackets, validDoorbellPackets, unknownPackets);

    for (int i = 0; i < espNowLogCount; i++) {
        int idx = (espNowLogHead - 1 - i + MAX_ESPNOW_LOGS) % MAX_ESPNOW_LOGS;
        EspNowLogEntry &e = espNowLog[idx];

        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 e.mac[0], e.mac[1], e.mac[2], e.mac[3], e.mac[4], e.mac[5]);

        char hexPayload[34] = {0};
        int pLen = min((int)e.len, 16);
        for (int p = 0; p < pLen; p++) {
            snprintf(hexPayload + (p * 2), 3, "%02X", e.payload[p]);
        }

        uint32_t ageSec = (now >= e.timestampMs) ? ((now - e.timestampMs) / 1000) : 0;

        offset += snprintf(batchBuf + offset, sizeof(batchBuf) - offset,
                           "%s{\"mac\":\"%s\",\"len\":%d,\"payload\":\"%s\",\"timeAgoSec\":%u,\"isDoorbell\":%s}",
                           (i > 0) ? "," : "",
                           macStr,
                           e.len,
                           hexPayload,
                           ageSec,
                           e.isDoorbell ? "true" : "false");
        if (offset > 800) {
            server.sendContent(batchBuf);
            serviceAudioDuringHttp();
            offset = 0;
        }
    }

    snprintf(batchBuf + offset, sizeof(batchBuf) - offset, "]}");
    server.sendContent(batchBuf);
    serviceAudioDuringHttp();
}

inline void handleClearEspNowLog() {
    espNowLogHead = 0;
    espNowLogCount = 0;
    totalEspNowPackets = 0;
    validDoorbellPackets = 0;
    unknownPackets = 0;
    server.send(200, "text/plain", "OK");
}

// Acoustic Diagnostic Flight Recorder JSON endpoint (batched)
inline void handleDiagnostics() {
    unsigned long now = millis();
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "");

    char batchBuf[1024];
    int offset = snprintf(batchBuf, sizeof(batchBuf),
                          "{\"total\":%u,\"debounce\":%u,\"events\":[",
                          totalDiagEvents, debounceChunks);

    for (int i = 0; i < diagLogCount; i++) {
        int idx = (diagLogHead - 1 - i + MAX_DIAG_LOGS) % MAX_DIAG_LOGS;
        DiagEventEntry &e = diagLog[idx];
        uint32_t ageSec = (now >= e.timestampMs) ? ((now - e.timestampMs) / 1000) : 0;

        char traceStr[128] = {0};
        int tOff = 0;
        for (int c = 0; c < e.traceCount; c++) {
            tOff += snprintf(traceStr + tOff, sizeof(traceStr) - tOff, "%s%u", (c > 0) ? "," : "", e.trace[c]);
        }

        offset += snprintf(batchBuf + offset, sizeof(batchBuf) - offset,
                           "%s{\"ageSec\":%u,\"ms\":%u,\"type\":\"%s\",\"peak\":%u,\"thresh\":%u,\"above\":%u,\"req\":%u,\"durMs\":%u,\"coolMs\":%u,\"trace\":[%s]}",
                           (i > 0) ? "," : "",
                           ageSec,
                           e.timestampMs,
                           diagTypeToStr(e.eventType),
                           e.peakMad,
                           e.threshold,
                           e.chunksAbove,
                           e.requiredChunks,
                           e.durationMs,
                           e.cooldownRemMs,
                           traceStr);
        if (offset > 780) {
            server.sendContent(batchBuf);
            serviceAudioDuringHttp();
            offset = 0;
        }
    }

    snprintf(batchBuf + offset, sizeof(batchBuf) - offset, "]}");
    server.sendContent(batchBuf);
    serviceAudioDuringHttp();
}

// Downloadable CSV export of Acoustic Flight Recorder + Trigger History
inline void handleDiagnosticsCsv() {
    unsigned long now = millis();
    server.sendHeader("Content-Disposition", "attachment; filename=\"deafdoorbell_diagnostics.csv\"");
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/csv", "");

    char batchBuf[1024];
    int offset = snprintf(batchBuf, sizeof(batchBuf),
        "Event_Index,Age_Sec,Uptime_Ms,Decision,Peak_MAD,Threshold_MAD,Chunks_Above,Required_Chunks,Duration_Ms,Cooldown_Rem_Ms,Chunk_Trace_3.2ms\r\n");

    for (int i = 0; i < diagLogCount; i++) {
        int idx = (diagLogHead - 1 - i + MAX_DIAG_LOGS) % MAX_DIAG_LOGS;
        DiagEventEntry &e = diagLog[idx];
        uint32_t ageSec = (now >= e.timestampMs) ? ((now - e.timestampMs) / 1000) : 0;

        char traceStr[128] = {0};
        int tOff = 0;
        for (int c = 0; c < e.traceCount; c++) {
            tOff += snprintf(traceStr + tOff, sizeof(traceStr) - tOff, "%s%u", (c > 0) ? " -> " : "", e.trace[c]);
        }

        offset += snprintf(batchBuf + offset, sizeof(batchBuf) - offset,
                           "%d,%u,%u,%s,%u,%u,%u,%u,%u,%u,\"%s\"\r\n",
                           i + 1,
                           ageSec,
                           e.timestampMs,
                           diagTypeToStr(e.eventType),
                           e.peakMad,
                           e.threshold,
                           e.chunksAbove,
                           e.requiredChunks,
                           e.durationMs,
                           e.cooldownRemMs,
                           traceStr);
        if (offset > 780) {
            server.sendContent(batchBuf);
            serviceAudioDuringHttp();
            offset = 0;
        }
    }
    if (offset > 0) {
        server.sendContent(batchBuf);
        serviceAudioDuringHttp();
    }
}

inline void handleClearDiagnostics() {
    diagLogHead = 0;
    diagLogCount = 0;
    totalDiagEvents = 0;
    server.send(200, "text/plain", "OK");
}

inline void handleSet() {
    if (server.hasArg("threshold")) threshold = clampThreshold(server.arg("threshold").toInt());
    if (server.hasArg("duration"))  duration   = server.arg("duration").toInt();
    if (server.hasArg("bright"))    brightness = server.arg("bright").toInt();
    if (server.hasArg("party"))     partyMode  = server.arg("party") == "1";
    if (server.hasArg("color"))     parseHexColor(server.arg("color"));
    if (server.hasArg("pattern"))   patternId      = (uint8_t)server.arg("pattern").toInt();
    if (server.hasArg("speed"))     speedX10       = (uint8_t)constrain((int)(server.arg("speed").toFloat() * 10), 4, 30);
    if (server.hasArg("debounce"))  debounceChunks = (uint8_t)constrain(server.arg("debounce").toInt(), 1, 8);
    if (server.hasArg("leaderId"))  leaderId       = (uint8_t)constrain(server.arg("leaderId").toInt(), 1, 8);
    if (server.hasArg("netId")) {
        String nStr = server.arg("netId");
        if (nStr.startsWith("0x") || nStr.startsWith("0X")) nStr = nStr.substring(2);
        uint16_t parsedNet = (uint16_t)strtoul(nStr.c_str(), NULL, 16);
        if (parsedNet != 0) networkId = parsedNet;
    }

    bool wifiChanged = false;
    if (server.hasArg("ap_ssid")) {
        String s = server.arg("ap_ssid");
        s.trim();
        if (s.length() > 0 && s.length() <= 32) {
            apSsid = s;
            wifiChanged = true;
        }
    }
    if (server.hasArg("ap_pass")) {
        String p = server.arg("ap_pass");
        p.trim();
        if (p.length() >= 8 && p.length() <= 64) {
            apPass = p;
            wifiChanged = true;
        }
    }

    if (wifiChanged) {
        saveSettings();
        wifiRestartPending = true;
        wifiRestartAtMs = millis() + 600;
        DEBUG_PRINTF("Wi-Fi credentials updated: SSID='%s', rebooting...\n", apSsid.c_str());
    } else {
        markSettingsDirty();
    }
    server.send(200, "text/plain", "OK");
}

inline void handlePair() {
    if (server.hasArg("enable")) {
        bool en = server.arg("enable") == "1";
        pairingModeActive = en;
        if (en) pairingStartMs = millis();
    }

    unsigned long now = millis();
    bool active = isPairingActive(now);
    uint32_t secLeft = pairingSecondsLeft(now);

    static char jsonBuf[2560];
    int offset = snprintf(jsonBuf, sizeof(jsonBuf),
        "{\"active\":%s,\"secLeft\":%u,\"netId\":\"%04X\",\"count\":%d,\"followers\":[",
        active ? "true" : "false", secLeft, networkId, pairedFollowerCount);

    if (offset > 0 && (size_t)offset < sizeof(jsonBuf)) {
        offset = appendPairedFollowersJson(jsonBuf, sizeof(jsonBuf), offset, now);
    }
    if (offset > 0 && (size_t)offset < sizeof(jsonBuf)) {
        snprintf(jsonBuf + offset, sizeof(jsonBuf) - (size_t)offset, "]}");
    }
    server.send(200, "application/json", jsonBuf);
}

inline void handleSetFollowerArea() {
    if (!server.hasArg("mac") || !server.hasArg("area")) {
        server.send(400, "text/plain", "Missing mac or area");
        return;
    }
    String macStr = server.arg("mac");
    uint8_t newArea = (uint8_t)server.arg("area").toInt();

    uint8_t targetMac[6] = {0};
    int parsed = sscanf(macStr.c_str(), "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
                        &targetMac[0], &targetMac[1], &targetMac[2],
                        &targetMac[3], &targetMac[4], &targetMac[5]);
    if (parsed != 6) {
        server.send(400, "text/plain", "Invalid MAC format");
        return;
    }

    bool found = false;
    for (int i = 0; i < pairedFollowerCount; i++) {
        if (memcmp(pairedFollowers[i].mac, targetMac, 6) == 0) {
            pairedFollowers[i].triggerArea = newArea;
            found = true;
            break;
        }
    }
    if (!found && pairedFollowerCount < MAX_PAIRED_FOLLOWERS) {
        memcpy(pairedFollowers[pairedFollowerCount].mac, targetMac, 6);
        pairedFollowers[pairedFollowerCount].lastSeenMs = 0;
        pairedFollowers[pairedFollowerCount].firmwareVer = PROTOCOL_VERSION;
        pairedFollowers[pairedFollowerCount].idMismatch = false;
        pairedFollowers[pairedFollowerCount].triggerArea = newArea;
        pairedFollowerCount++;
    }

    savePairedFollowers();
    addOrUpdateFollowerPeer(targetMac);

    PairOfferPacket offer;
    offer.magic = DEAF_DOORBELL_MAGIC;
    offer.msgType = MSG_PAIR_OFFER;
    memcpy(offer.targetMac, targetMac, 6);
    offer.networkId = networkId;
    offer.leaderId = leaderId;
    offer.triggerArea = newArea;

    sendEspNow(ESPNOW_BROADCAST_MAC, (uint8_t*)&offer, sizeof(offer));

    server.send(200, "text/plain", "OK");
}

inline void handleTest() {
    triggerAlert(true);
    server.send(200, "text/plain", "TEST_SENT");
}

inline void handleUpdatePage() {
    sendProgmemChunked("text/html; charset=utf-8", UPDATE_HTML);
}

inline void handleNotFound() {
    server.sendHeader("Location", "http://192.168.4.1", true);
    server.send(302, "text/plain", "");
}

// ============================================================
//  Network & OTA Setup (SoftAP Dedicated on Channel 1, Zero Power-Save)
// ============================================================
inline void setupNetworking() {
    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);

    IPAddress apIP(192, 168, 4, 1);
    IPAddress netMsk(255, 255, 255, 0);
    WiFi.softAPConfig(apIP, apIP, netMsk);
    WiFi.softAP(apSsid.c_str(), apPass.c_str(), 1);
    esp_wifi_set_ps(WIFI_PS_NONE);

    uint8_t primary = 0;
    wifi_second_chan_t second = WIFI_SECOND_CHAN_NONE;
    if (esp_wifi_get_channel(&primary, &second) != ESP_OK || primary != 1 || second != WIFI_SECOND_CHAN_NONE) {
        esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    }
    wifi_ps_type_t ps = WIFI_PS_MIN_MODEM;
    if (esp_wifi_get_ps(&ps) != ESP_OK || ps != WIFI_PS_NONE) {
        esp_wifi_set_ps(WIFI_PS_NONE);
    }
    dnsServer.start(DNS_PORT, "*", apIP);

    server.on("/", handleRoot);
    server.on("/log.html", handleLogPage);
    server.on("/log", handleLogPage);
    server.on("/data", handleData);
    server.on("/pair", handlePair);
    server.on("/setFollowerArea", handleSetFollowerArea);
    server.on("/history", handleHistory);
    server.on("/triggers", handleTriggers);
    server.on("/triggers/clear", handleClearTriggers);
    server.on("/espnow", handleEspNowLog);
    server.on("/espnow/clear", handleClearEspNowLog);
    server.on("/diagnostics", handleDiagnostics);
    server.on("/diagnostics.csv", handleDiagnosticsCsv);
    server.on("/diagnostics/clear", handleClearDiagnostics);
    server.on("/set", handleSet);
    server.on("/test", handleTest);
    server.on("/update", HTTP_GET, handleUpdatePage);
    server.on("/update", HTTP_POST, []() {
        server.sendHeader("Connection", "close");
        server.send(200, "text/plain", (Update.hasError()) ? "FAIL" : "OK");
        ESP.restart();
    }, []() {
        HTTPUpload& upload = server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            Update.end(true);
        }
    });

    server.onNotFound(handleNotFound);
    server.begin();

    MDNS.begin(HOSTNAME_MDNS);
    MDNS.addService("http", "tcp", 80);

    ArduinoOTA.setHostname("deafdoorbell-master");
    ArduinoOTA.setPort(3232);
    ArduinoOTA.begin();
}

inline void serviceNetworking(unsigned long now) {
    serviceRadioLock(now);
    if (wifiRestartPending && (long)(now - wifiRestartAtMs) >= 0) {
        ESP.restart();
    }
    static unsigned long lastNetHandle = 0;
    // Never interrupt an active 3-chunk (~9.6ms) chime confirmation window with HTTP work
    if (!isAudioMidTrigger() && (now - lastNetHandle >= 20)) {
        dnsServer.processNextRequest();
        server.handleClient();
        ArduinoOTA.handle();
        lastNetHandle = now;
    }
}
