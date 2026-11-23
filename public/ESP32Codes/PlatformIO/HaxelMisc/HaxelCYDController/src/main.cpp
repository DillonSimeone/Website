#include <Arduino.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <math.h>
#include "HaxelBleClient.h"

// --- Touch Screen Pins (CYD ESP32-2432S028R) ---
#define XPT2046_IRQ  36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK  25
#define XPT2046_CS   33

SPIClass touchSPI = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();
HaxelBleClient ble;

// --- Theme Colors ---
#define C_BG        0x0841  // Deep slate
#define C_CARD      0x18E3  // Dark card
#define C_BORDER    0x39E7  // Subtle border
#define C_TEXT      0xFFFF  // White
#define C_MUTED     0x9CD3  // Light grey
#define C_ACCENT    0x05FF  // Cyan
#define C_GREEN     0x1E87  // Emerald green
#define C_RED       0xD186  // Crimson red
#define C_AMBER     0xFD20  // Amber/Orange
#define C_TAB_ACT   0x2145  // Active tab fill

enum TabId {
    TAB_UNITS = 0,
    TAB_CONTROL = 1,
    TAB_PINS = 2,
    TAB_AUDIO = 3,
    TAB_CH_SETTINGS = 4
};

static const char* kBuiltinPatterns[] = {
    "Sine", "Pulse", "Breath", "Heartbeat", "Rumble", "Tap",
    "Ramp", "Staccato", "Ocean", "Metronome", "Cascade",
    "BassPunch", "EnvelopeFollow", "SpectrumPulse", "BeatSync",
    "TrebleSpark", "MidPresence", "AcceleratingBuzz", "BouncingDecay",
    "TimeSwell", "LinearFade", "DeceleratingPulse", "DopplerSweep",
    "FibonacciBeat", "SawTremolo"
};
static constexpr int kPatternCount = sizeof(kBuiltinPatterns) / sizeof(kBuiltinPatterns[0]);

// --- UI State ---
TabId currentTab = TAB_UNITS;
HaxelState uiState;
int selectedChannel = 0; // 0..7 for TAB_PINS / TAB_CH_SETTINGS
bool audioConfigDirty = false;
bool pinsConfigDirty = false;

// Touch tracking
bool wasTouched = false;
// 0=intensity, 1=speed, 2=freq, 3=gain, 4=chInt, 5=chSpd, 6=chFlr, 7=chCeil
int activeSlider = -1;
uint32_t lastTapMs = 0;
uint32_t lastBleSliderSendMs = 0;
uint32_t lastChEditMs = 0;
float pendingSliderVal = 0.0f;

// --- Helpers ---
bool stateEquals(const HaxelState& a, const HaxelState& b) {
    if (a.valid != b.valid || a.on != b.on || a.mute != b.mute) return false;
    if (a.audioReactive != b.audioReactive) return false;
    if (a.audioEnabled != b.audioEnabled || a.audioSource != b.audioSource) return false;
    if (a.i2sBclk != b.i2sBclk || a.i2sWs != b.i2sWs || a.i2sSd != b.i2sSd || a.adcPin != b.adcPin) return false;
    if (a.maxPin != b.maxPin) return false;
    if (fabsf(a.intensity - b.intensity) > 0.002f) return false;
    if (fabsf(a.speed - b.speed) > 0.005f) return false;
    if (fabsf(a.freq - b.freq) > 0.4f) return false;
    if (fabsf(a.audioGain - b.audioGain) > 0.05f) return false;
    if (strcmp(a.pattern, b.pattern) != 0) return false;
    for (int i = 0; i < 8; ++i) {
        if (a.channels[i] != b.channels[i]) return false;
        if (a.driverPins[i] != b.driverPins[i]) return false;
        const ChannelDetail& ca = a.chDetails[i];
        const ChannelDetail& cb = b.chDetails[i];
        if (ca.on != cb.on || ca.synced != cb.synced) return false;
        if (fabsf(ca.intensity - cb.intensity) > 0.005f) return false;
        if (fabsf(ca.speed - cb.speed) > 0.01f) return false;
        if (fabsf(ca.startupFloor - cb.startupFloor) > 0.005f) return false;
        if (fabsf(ca.ceiling - cb.ceiling) > 0.005f) return false;
        if (strcmp(ca.patternOverride, cb.patternOverride) != 0) return false;
    }
    return true;
}

int findPatternIndex(const char* name) {
    for (int i = 0; i < kPatternCount; ++i) {
        if (strcmp(kBuiltinPatterns[i], name) == 0) return i;
    }
    return 0;
}

bool hitRect(int px, int py, int x, int y, int w, int h) {
    return px >= x && px < (x + w) && py >= y && py < (y + h);
}

bool isPinUsedByOtherChannel(int8_t pin, int ignoreCh) {
    if (pin < 0) return false;
    for (int i = 0; i < 8; ++i) {
        if (i != ignoreCh && uiState.driverPins[i] == pin) return true;
    }
    return false;
}

int8_t stepAvailablePin(int8_t cur, int delta, int ignoreCh = -1) {
    const int maxP = (uiState.maxPin >= 0 && uiState.maxPin < 64) ? uiState.maxPin : 21;
    const int total = maxP + 2; // -1 .. maxP
    int dir = (delta >= 0) ? 1 : -1;
    int steps = abs(delta);
    int pos = (int)cur;
    for (int s = 0; s < steps; ++s) {
        for (int tries = 0; tries < total; ++tries) {
            pos += dir;
            if (pos > maxP) pos = -1;
            if (pos < -1) pos = maxP;
            if (pos == -1) break;
            if (!uiState.pinUnavailable[pos] && !isPinUsedByOtherChannel((int8_t)pos, ignoreCh)) {
                break;
            }
        }
    }
    return (int8_t)pos;
}

void formatPin(int8_t pin, char* out, size_t len) {
    if (pin < 0) snprintf(out, len, "OFF");
    else snprintf(out, len, "%d", (int)pin);
}

void drawStatusDot() {
    uint16_t col = C_MUTED;
    if (ble.isConnected()) col = C_GREEN;
    else if (ble.isScanning()) col = C_AMBER;
    tft.fillRect(300, 0, 20, 32, C_CARD);
    tft.fillCircle(310, 16, 6, col);
}

void drawTabBar() {
    const char* labels[3] = {"1. UNITS", "2. CTRL", "3. PINS"};
    int activeIdx = (int)currentTab;
    if (currentTab == TAB_AUDIO) activeIdx = 1;
    else if (currentTab == TAB_CH_SETTINGS) activeIdx = 2;

    for (int i = 0; i < 3; ++i) {
        int x = i * 100;
        bool act = (activeIdx == i);
        tft.fillRect(x, 0, 100, 32, act ? C_TAB_ACT : C_CARD);
        tft.drawFastVLine(x + 99, 0, 32, C_BORDER);
        if (act) {
            tft.fillRect(x, 29, 100, 3, C_ACCENT);
        } else {
            tft.drawFastHLine(x, 31, 100, C_BORDER);
        }
        tft.setTextDatum(MC_DATUM);
        tft.setTextColor(act ? C_ACCENT : C_MUTED, act ? C_TAB_ACT : C_CARD);
        tft.drawString(labels[i], x + 50, 15, 2);
    }
    drawStatusDot();
}

void drawSlider(int x, int y, int w, int h, const char* label, const char* valStr, float norm, uint16_t fillCol) {
    norm = constrain(norm, 0.0f, 1.0f);
    tft.fillRoundRect(x, y, w, h, 4, C_CARD);
    tft.drawRoundRect(x, y, w, h, 4, C_BORDER);

    tft.setTextDatum(TL_DATUM);
    tft.setTextColor(C_TEXT, C_CARD);
    tft.drawString(label, x + 8, y + 4, 2);

    tft.setTextDatum(TR_DATUM);
    tft.setTextColor(C_ACCENT, C_CARD);
    tft.drawString(valStr, x + w - 8, y + 4, 2);

    int tx = x + 10;
    int tw = w - 20;
    int ty = y + h - 16;
    int th = 8;
    tft.fillRoundRect(tx, ty, tw, th, 3, C_BG);
    int fw = (int)(norm * tw);
    if (fw > 4) {
        tft.fillRoundRect(tx, ty, fw, th, 3, fillCol);
    }
    int kx = tx + fw;
    kx = constrain(kx, tx + 5, tx + tw - 5);
    tft.fillCircle(kx, ty + th / 2, 6, C_TEXT);
}

// Evaluate normalized 0..1 waveform sample for preview
float samplePatternPreview(const char* pat, float phase01) {
    float p = phase01 - floorf(phase01);
    if (strcmp(pat, "Pulse") == 0 || strcmp(pat, "Metronome") == 0) {
        return (p < 0.35f) ? 1.0f : 0.0f;
    }
    if (strcmp(pat, "Heartbeat") == 0) {
        if (p < 0.12f) return sinf((p / 0.12f) * PI);
        if (p > 0.22f && p < 0.34f) return 0.75f * sinf(((p - 0.22f) / 0.12f) * PI);
        return 0.0f;
    }
    if (strcmp(pat, "Ramp") == 0 || strcmp(pat, "SawTremolo") == 0) {
        return p;
    }
    if (strcmp(pat, "LinearFade") == 0 || strcmp(pat, "Tap") == 0) {
        return 1.0f - p;
    }
    if (strcmp(pat, "Staccato") == 0 || strcmp(pat, "FibonacciBeat") == 0) {
        return (fmodf(p * 4.0f, 1.0f) < 0.45f) ? 1.0f : 0.0f;
    }
    if (strcmp(pat, "Rumble") == 0) {
        return 0.5f + 0.45f * sinf(p * 2.0f * PI * 3.0f) * cosf(p * 2.0f * PI * 1.7f);
    }
    if (strcmp(pat, "Breath") == 0 || strcmp(pat, "Ocean") == 0 || strcmp(pat, "TimeSwell") == 0) {
        return 0.5f - 0.5f * cosf(p * 2.0f * PI);
    }
    // Default smooth Sine
    return 0.5f + 0.5f * sinf(p * 2.0f * PI);
}

void drawWaveformPanel() {
    const int wx = 210, wy = 82, ww = 102, wh = 150;
    tft.fillRoundRect(wx, wy, ww, wh, 5, C_CARD);
    tft.drawRoundRect(wx, wy, ww, wh, 5, C_BORDER);

    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(C_MUTED, C_CARD);
    tft.drawString("WAVEFORM", wx + ww / 2, wy + 5, 2);

    const int gx = wx + 6;
    const int gw = ww - 12;
    const int gy = wy + 26;
    const int gh = wh - 48;
    tft.fillRect(gx, gy, gw, gh, C_BG);
    tft.drawFastHLine(gx, gy + gh / 2, gw, 0x2104);

    float amp = uiState.on ? uiState.intensity : 0.0f;
    float cycles = 1.0f + (uiState.speed - 0.25f) * 0.8f;
    uint16_t lineCol = uiState.on ? C_ACCENT : C_MUTED;

    int prevY = gy + gh - 4;
    for (int i = 0; i < gw; ++i) {
        float phase = ((float)i / (float)gw) * cycles;
        float v = samplePatternPreview(uiState.pattern, phase) * amp;
        int py = (gy + gh - 4) - (int)(v * (gh - 8));
        if (i > 0) {
            tft.drawLine(gx + i - 1, prevY, gx + i, py, lineCol);
        }
        prevY = py;
    }

    char infoBuf[20];
    snprintf(infoBuf, sizeof(infoBuf), "%dHz %.1fx", (int)roundf(uiState.freq), uiState.speed);
    tft.setTextDatum(BC_DATUM);
    tft.setTextColor(uiState.on ? C_GREEN : C_MUTED, C_CARD);
    tft.drawString(infoBuf, wx + ww / 2, wy + wh - 4, 2);
}

void drawNotConnectedPrompt() {
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_MUTED, C_BG);
    tft.drawString("No Haxel Unit Connected", 160, 110, 4);
    tft.fillRoundRect(85, 145, 150, 40, 6, C_ACCENT);
    tft.setTextColor(C_BG, C_ACCENT);
    tft.drawString("GO TO UNITS", 160, 165, 2);
}

void drawUnitsTab(bool clearBg = true) {
    if (clearBg) tft.fillRect(0, 33, 320, 207, C_BG);

    tft.setTextDatum(ML_DATUM);
    tft.setTextColor(C_TEXT, C_BG);
    tft.drawString("HAXEL UNITS", 10, 49, 2);

    uint16_t scanCol = ble.isScanning() ? C_AMBER : C_ACCENT;
    tft.fillRoundRect(222, 37, 90, 24, 4, scanCol);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_BG, scanCol);
    tft.drawString(ble.isScanning() ? "SCANNING" : "RESCAN", 267, 49, 2);

    int count = ble.unitCount();
    if (count == 0) {
        tft.setTextDatum(MC_DATUM);
        tft.setTextColor(C_MUTED, C_BG);
        tft.drawString(ble.isScanning() ? "Searching for Haxel..." : "No Haxel units found", 160, 135, 2);
        return;
    }

    int showCount = count < 5 ? count : 5;
    for (int i = 0; i < showCount; ++i) {
        const HaxelUnit& u = ble.unit(i);
        int ry = 67 + i * 34;
        bool isConn = ble.isConnected() && (u.address == ble.connectedAddress());

        tft.fillRoundRect(8, ry, 304, 30, 5, C_CARD);
        tft.drawRoundRect(8, ry, 304, 30, 5, isConn ? C_GREEN : C_BORDER);

        tft.setTextDatum(ML_DATUM);
        tft.setTextColor(C_TEXT, C_CARD);
        tft.drawString(u.name, 16, ry + 15, 2);

        if (isConn) {
            tft.fillRoundRect(204, ry + 5, 52, 20, 3, C_GREEN);
            tft.setTextDatum(MC_DATUM);
            tft.setTextColor(C_BG, C_GREEN);
            tft.drawString("CONN", 230, ry + 15, 2);
        }

        char rssiBuf[16];
        snprintf(rssiBuf, sizeof(rssiBuf), "%ddBm", u.rssi);
        tft.setTextDatum(MR_DATUM);
        tft.setTextColor(C_MUTED, C_CARD);
        tft.drawString(rssiBuf, 304, ry + 15, 2);
    }
}

void drawControlTab(bool clearBg = true) {
    if (!ble.isConnected()) {
        tft.fillRect(0, 33, 320, 207, C_BG);
        drawNotConnectedPrompt();
        return;
    }
    if (clearBg) tft.fillRect(0, 33, 320, 207, C_BG);

    // Power button
    uint16_t pwrCol = uiState.on ? C_GREEN : C_RED;
    tft.fillRoundRect(8, 38, 84, 36, 5, pwrCol);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_TEXT, pwrCol);
    tft.drawString(uiState.on ? "ON" : "OFF", 50, 56, 4);

    // Audio button (opens TAB_AUDIO)
    bool audioActive = uiState.audioReactive || uiState.audioSource != 0;
    uint16_t audioCol = audioActive ? C_ACCENT : C_CARD;
    tft.fillRoundRect(98, 38, 66, 36, 5, audioCol);
    tft.drawRoundRect(98, 38, 66, 36, 5, audioActive ? C_ACCENT : C_BORDER);
    tft.setTextColor(audioActive ? C_BG : C_TEXT, audioCol);
    tft.drawString("AUDIO", 131, 56, 2);

    // Pattern selector
    tft.fillRoundRect(170, 38, 142, 36, 5, C_CARD);
    tft.drawRoundRect(170, 38, 142, 36, 5, C_BORDER);
    tft.fillRoundRect(172, 40, 26, 32, 4, C_TAB_ACT);
    tft.fillRoundRect(284, 40, 26, 32, 4, C_TAB_ACT);
    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("<", 185, 56, 2);
    tft.drawString(">", 297, 56, 2);

    tft.setTextColor(C_TEXT, C_CARD);
    String patLabel = uiState.pattern;
    if (patLabel.length() > 11) patLabel = patLabel.substring(0, 10) + ".";
    tft.drawString(patLabel, 241, 56, 2);

    // 2/3 width sliders (w = 196)
    char buf[24];
    snprintf(buf, sizeof(buf), "%d%%", (int)roundf(uiState.intensity * 100.0f));
    drawSlider(8, 82, 196, 46, "INTENSITY", buf, uiState.intensity, C_ACCENT);

    snprintf(buf, sizeof(buf), "%.2fx", uiState.speed);
    drawSlider(8, 134, 196, 46, "SPEED", buf, (uiState.speed - 0.25f) / 3.75f, C_GREEN);

    snprintf(buf, sizeof(buf), "%d Hz", (int)roundf(uiState.freq));
    drawSlider(8, 186, 196, 46, "FREQ", buf, (uiState.freq - 10.0f) / 490.0f, C_AMBER);

    // 1/3 width waveform preview
    drawWaveformPanel();
}

void drawPinStepper(int x, int y, int w, int h, const char* label, int8_t pin) {
    tft.fillRoundRect(x, y, w, h, 4, C_CARD);
    tft.drawRoundRect(x, y, w, h, 4, C_BORDER);

    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(C_MUTED, C_CARD);
    tft.drawString(label, x + w / 2, y + 3, 2);

    int btnW = 24;
    tft.fillRoundRect(x + 3, y + h - 24, btnW, 21, 3, C_TAB_ACT);
    tft.fillRoundRect(x + w - btnW - 3, y + h - 24, btnW, 21, 3, C_TAB_ACT);

    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("-", x + 3 + btnW / 2, y + h - 14, 2);
    tft.drawString("+", x + w - 3 - btnW / 2, y + h - 14, 2);

    char pbuf[8];
    formatPin(pin, pbuf, sizeof(pbuf));
    tft.setTextColor(C_TEXT, C_CARD);
    tft.drawString(pbuf, x + w / 2, y + h - 14, 2);
}

void drawAudioTab(bool clearBg = true) {
    if (!ble.isConnected()) {
        tft.fillRect(0, 33, 320, 207, C_BG);
        drawNotConnectedPrompt();
        return;
    }
    if (clearBg) tft.fillRect(0, 33, 320, 207, C_BG);

    tft.fillRoundRect(8, 37, 74, 26, 4, C_TAB_ACT);
    tft.drawRoundRect(8, 37, 74, 26, 4, C_BORDER);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("< BACK", 45, 50, 2);

    tft.setTextColor(C_TEXT, C_BG);
    tft.drawString("AUDIO", 142, 50, 2);

    uint16_t arCol = uiState.audioReactive ? C_GREEN : C_CARD;
    tft.fillRoundRect(198, 37, 114, 26, 4, arCol);
    tft.drawRoundRect(198, 37, 114, 26, 4, uiState.audioReactive ? C_GREEN : C_BORDER);
    tft.setTextColor(uiState.audioReactive ? C_BG : C_TEXT, arCol);
    tft.drawString(uiState.audioReactive ? "REACT: ON" : "REACT: OFF", 255, 50, 2);

    const char* srcLabels[3] = {"NONE", "ANALOG", "I2S / SPI"};
    for (int i = 0; i < 3; ++i) {
        int sx = 8 + i * 103;
        bool act = (uiState.audioSource == i);
        uint16_t col = act ? C_ACCENT : C_CARD;
        tft.fillRoundRect(sx, 68, 98, 28, 4, col);
        tft.drawRoundRect(sx, 68, 98, 28, 4, act ? C_ACCENT : C_BORDER);
        tft.setTextColor(act ? C_BG : C_TEXT, col);
        tft.drawString(srcLabels[i], sx + 49, 82, 2);
    }

    tft.fillRect(8, 101, 304, 45, C_BG);
    if (uiState.audioSource == 1) {
        drawPinStepper(8, 101, 304, 44, "ANALOG ADC PIN", uiState.adcPin);
    } else if (uiState.audioSource == 2) {
        drawPinStepper(8, 101, 98, 44, "BCLK", uiState.i2sBclk);
        drawPinStepper(111, 101, 98, 44, "WS / LRC", uiState.i2sWs);
        drawPinStepper(214, 101, 98, 44, "SD / DIN", uiState.i2sSd);
    } else {
        tft.fillRoundRect(8, 101, 304, 44, 4, C_CARD);
        tft.drawRoundRect(8, 101, 304, 44, 4, C_BORDER);
        tft.setTextColor(C_MUTED, C_CARD);
        tft.drawString("Audio Input Disabled", 160, 123, 2);
    }

    char gbuf[16];
    snprintf(gbuf, sizeof(gbuf), "%.1fx", uiState.audioGain);
    drawSlider(8, 150, 304, 42, "GAIN", gbuf, (uiState.audioGain - 0.1f) / 9.9f, C_AMBER);

    uint16_t appCol = audioConfigDirty ? C_GREEN : C_TAB_ACT;
    tft.fillRoundRect(8, 197, 304, 35, 5, appCol);
    tft.drawRoundRect(8, 197, 304, 35, 5, audioConfigDirty ? C_GREEN : C_ACCENT);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(audioConfigDirty ? C_BG : C_ACCENT, appCol);
    tft.drawString("APPLY AUDIO & REBOOT", 160, 214, 2);
}

void drawPinsTab(bool clearBg = true) {
    if (!ble.isConnected()) {
        tft.fillRect(0, 33, 320, 207, C_BG);
        drawNotConnectedPrompt();
        return;
    }
    if (clearBg) tft.fillRect(0, 33, 320, 207, C_BG);

    // Channel selector 1..8 (y: 38..76)
    for (int i = 0; i < 8; ++i) {
        int cx = 8 + i * 38;
        bool sel = (selectedChannel == i);
        bool en = uiState.channels[i];
        bool indep = !uiState.chDetails[i].synced;
        uint16_t bg = sel ? C_ACCENT : C_CARD;
        uint16_t border = sel ? C_TEXT : (en ? C_GREEN : C_BORDER);
        tft.fillRoundRect(cx, 38, 34, 38, 4, bg);
        tft.drawRoundRect(cx, 38, 34, 38, 4, border);

        tft.setTextDatum(MC_DATUM);
        tft.setTextColor(sel ? C_BG : C_TEXT, bg);
        char chStr[6];
        snprintf(chStr, sizeof(chStr), "%d%s", i + 1, indep ? "*" : "");
        tft.drawString(chStr, cx + 17, 51, 2);

        char pbuf[6];
        formatPin(uiState.driverPins[i], pbuf, sizeof(pbuf));
        tft.setTextColor(sel ? C_BG : (en ? C_GREEN : C_MUTED), bg);
        tft.drawString(pbuf, cx + 17, 67, 1);
    }

    // Selected channel detail card (y: 84..184)
    tft.fillRoundRect(8, 84, 304, 100, 5, C_CARD);
    tft.drawRoundRect(8, 84, 304, 100, 5, C_BORDER);

    char titleBuf[24];
    snprintf(titleBuf, sizeof(titleBuf), "CH %d PIN", selectedChannel + 1);
    tft.setTextDatum(ML_DATUM);
    tft.setTextColor(C_TEXT, C_CARD);
    tft.drawString(titleBuf, 16, 104, 2);

    // [SET] button next to [CH: ON/OFF]
    bool indep = !uiState.chDetails[selectedChannel].synced;
    uint16_t setCol = indep ? C_AMBER : C_TAB_ACT;
    tft.fillRoundRect(130, 91, 74, 26, 4, setCol);
    tft.drawRoundRect(130, 91, 74, 26, 4, indep ? C_AMBER : C_ACCENT);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(indep ? C_BG : C_ACCENT, setCol);
    tft.drawString("SET", 167, 104, 2);

    bool chOn = uiState.channels[selectedChannel];
    uint16_t enCol = chOn ? C_GREEN : C_RED;
    tft.fillRoundRect(210, 91, 92, 26, 4, enCol);
    tft.setTextColor(C_TEXT, enCol);
    tft.drawString(chOn ? "CH: ON" : "CH: OFF", 256, 104, 2);

    // Pin stepper row: [-5] [-1] [GPIO XX] [+1] [+5]
    tft.fillRoundRect(18, 130, 44, 42, 4, C_TAB_ACT);
    tft.fillRoundRect(68, 130, 44, 42, 4, C_TAB_ACT);
    tft.fillRoundRect(208, 130, 44, 42, 4, C_TAB_ACT);
    tft.fillRoundRect(258, 130, 44, 42, 4, C_TAB_ACT);

    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("-5", 40, 151, 2);
    tft.drawString("-1", 90, 151, 2);
    tft.drawString("+1", 230, 151, 2);
    tft.drawString("+5", 280, 151, 2);

    char gpioBuf[12];
    int8_t curPin = uiState.driverPins[selectedChannel];
    if (curPin < 0) snprintf(gpioBuf, sizeof(gpioBuf), "NONE");
    else snprintf(gpioBuf, sizeof(gpioBuf), "GPIO %d", (int)curPin);
    tft.setTextColor(C_TEXT, C_CARD);
    tft.drawString(gpioBuf, 160, 151, 4);

    // Bottom row: [APPLY PINS & REBOOT] + [DISCONN]
    uint16_t appCol = pinsConfigDirty ? C_GREEN : C_TAB_ACT;
    tft.fillRoundRect(8, 194, 200, 38, 5, appCol);
    tft.drawRoundRect(8, 194, 200, 38, 5, pinsConfigDirty ? C_GREEN : C_ACCENT);
    tft.setTextColor(pinsConfigDirty ? C_BG : C_ACCENT, appCol);
    tft.drawString("APPLY PINS & REBOOT", 108, 213, 2);

    tft.fillRoundRect(216, 194, 96, 38, 5, C_CARD);
    tft.drawRoundRect(216, 194, 96, 38, 5, C_AMBER);
    tft.setTextColor(C_AMBER, C_CARD);
    tft.drawString("DISCONN", 264, 213, 2);
}

void drawChSettingsTab(bool clearBg = true) {
    if (!ble.isConnected()) {
        tft.fillRect(0, 33, 320, 207, C_BG);
        drawNotConnectedPrompt();
        return;
    }
    if (clearBg) tft.fillRect(0, 33, 320, 207, C_BG);

    const ChannelDetail& cd = uiState.chDetails[selectedChannel];

    // Header: [< BACK], CH X, [SYNCED / INDEP]
    tft.fillRoundRect(8, 37, 74, 26, 4, C_TAB_ACT);
    tft.drawRoundRect(8, 37, 74, 26, 4, C_BORDER);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("< BACK", 45, 50, 2);

    char title[16];
    snprintf(title, sizeof(title), "CH %d SET", selectedChannel + 1);
    tft.setTextColor(C_TEXT, C_BG);
    tft.drawString(title, 138, 50, 2);

    uint16_t syCol = cd.synced ? C_CARD : C_AMBER;
    tft.fillRoundRect(194, 37, 118, 26, 4, syCol);
    tft.drawRoundRect(194, 37, 118, 26, 4, cd.synced ? C_BORDER : C_AMBER);
    tft.setTextColor(cd.synced ? C_TEXT : C_BG, syCol);
    tft.drawString(cd.synced ? "SYNC: MASTER" : "INDEPENDENT", 253, 50, 2);

    // 4 compact sliders in 2x2 grid (y: 68..182)
    char buf[16];
    snprintf(buf, sizeof(buf), "%d%%", (int)roundf(cd.intensity * 100.0f));
    drawSlider(8, 68, 148, 54, "INTENS", buf, cd.intensity, C_ACCENT);

    snprintf(buf, sizeof(buf), "%.2fx", cd.speed);
    drawSlider(164, 68, 148, 54, "SPEED", buf, (cd.speed - 0.25f) / 3.75f, C_GREEN);

    snprintf(buf, sizeof(buf), "%d%%", (int)roundf(cd.startupFloor * 100.0f));
    drawSlider(8, 128, 148, 54, "FLOOR", buf, cd.startupFloor, C_AMBER);

    snprintf(buf, sizeof(buf), "%d%%", (int)roundf(cd.ceiling * 100.0f));
    drawSlider(164, 128, 148, 54, "CEIL", buf, cd.ceiling, C_RED);

    // Pattern override selector (y: 189..232)
    tft.fillRoundRect(8, 189, 304, 42, 5, C_CARD);
    tft.drawRoundRect(8, 189, 304, 42, 5, C_BORDER);
    tft.fillRoundRect(12, 193, 38, 34, 4, C_TAB_ACT);
    tft.fillRoundRect(270, 193, 38, 34, 4, C_TAB_ACT);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(C_ACCENT, C_TAB_ACT);
    tft.drawString("<", 31, 210, 2);
    tft.drawString(">", 289, 210, 2);

    const char* patStr = (cd.patternOverride[0] == '\0') ? "Pattern: Follow Master" : cd.patternOverride;
    tft.setTextColor(C_TEXT, C_CARD);
    tft.drawString(patStr, 160, 210, 2);
}

void drawCurrentTab(bool clearBg = true) {
    if (clearBg) drawTabBar();
    if (currentTab == TAB_UNITS) drawUnitsTab(clearBg);
    else if (currentTab == TAB_CONTROL) drawControlTab(clearBg);
    else if (currentTab == TAB_PINS) drawPinsTab(clearBg);
    else if (currentTab == TAB_AUDIO) drawAudioTab(clearBg);
    else drawChSettingsTab(clearBg);
}

void updateSliderFromTouch(int sliderId, int px, bool sendNow) {
    char buf[24];
    float norm = 0.0f;
    if (sliderId == 0) {
        norm = constrain((float)(px - 18) / 176.0f, 0.0f, 1.0f);
        uiState.intensity = norm;
        snprintf(buf, sizeof(buf), "%d%%", (int)roundf(norm * 100.0f));
        drawSlider(8, 82, 196, 46, "INTENSITY", buf, norm, C_ACCENT);
        drawWaveformPanel();
        pendingSliderVal = norm;
    } else if (sliderId == 1) {
        norm = constrain((float)(px - 18) / 176.0f, 0.0f, 1.0f);
        uiState.speed = 0.25f + norm * 3.75f;
        snprintf(buf, sizeof(buf), "%.2fx", uiState.speed);
        drawSlider(8, 134, 196, 46, "SPEED", buf, norm, C_GREEN);
        drawWaveformPanel();
        pendingSliderVal = uiState.speed;
    } else if (sliderId == 2) {
        norm = constrain((float)(px - 18) / 176.0f, 0.0f, 1.0f);
        uiState.freq = 10.0f + norm * 490.0f;
        snprintf(buf, sizeof(buf), "%d Hz", (int)roundf(uiState.freq));
        drawSlider(8, 186, 196, 46, "FREQ", buf, norm, C_AMBER);
        drawWaveformPanel();
        pendingSliderVal = uiState.freq;
    } else if (sliderId == 3) {
        norm = constrain((float)(px - 18) / 284.0f, 0.0f, 1.0f);
        uiState.audioGain = 0.1f + norm * 9.9f;
        snprintf(buf, sizeof(buf), "%.1fx", uiState.audioGain);
        drawSlider(8, 150, 304, 42, "GAIN", buf, norm, C_AMBER);
        pendingSliderVal = uiState.audioGain;
    } else if (sliderId >= 4 && sliderId <= 7) {
        lastChEditMs = millis();
        ChannelDetail& cd = uiState.chDetails[selectedChannel];
        cd.synced = false;
        if (sliderId == 4) {
            norm = constrain((float)(px - 18) / 128.0f, 0.0f, 1.0f);
            cd.intensity = norm;
            snprintf(buf, sizeof(buf), "%d%%", (int)roundf(norm * 100.0f));
            drawSlider(8, 68, 148, 54, "INTENS", buf, norm, C_ACCENT);
        } else if (sliderId == 5) {
            norm = constrain((float)(px - 174) / 128.0f, 0.0f, 1.0f);
            cd.speed = 0.25f + norm * 3.75f;
            snprintf(buf, sizeof(buf), "%.2fx", cd.speed);
            drawSlider(164, 68, 148, 54, "SPEED", buf, norm, C_GREEN);
        } else if (sliderId == 6) {
            norm = constrain((float)(px - 18) / 128.0f, 0.0f, 1.0f);
            cd.startupFloor = norm;
            snprintf(buf, sizeof(buf), "%d%%", (int)roundf(norm * 100.0f));
            drawSlider(8, 128, 148, 54, "FLOOR", buf, norm, C_AMBER);
        } else if (sliderId == 7) {
            norm = constrain((float)(px - 174) / 128.0f, 0.0f, 1.0f);
            cd.ceiling = norm;
            snprintf(buf, sizeof(buf), "%d%%", (int)roundf(norm * 100.0f));
            drawSlider(164, 128, 148, 54, "CEIL", buf, norm, C_RED);
        }
    }

    uint32_t now = millis();
    if (sendNow || (now - lastBleSliderSendMs >= 70)) {
        lastBleSliderSendMs = now;
        if (sliderId == 0) ble.sendFloatPatch("intensity", pendingSliderVal);
        else if (sliderId == 1) ble.sendFloatPatch("speed", pendingSliderVal);
        else if (sliderId == 2) ble.sendFloatPatch("freq", pendingSliderVal);
        else if (sliderId == 3) ble.sendFloatPatch("audioGain", pendingSliderVal);
        else if (sliderId >= 4 && sliderId <= 7) ble.sendChannelDetailPatch(selectedChannel, uiState.chDetails[selectedChannel]);
    }
}

void handleTap(int x, int y) {
    if (y < 33 && x < 300) {
        TabId next = (TabId)(x / 100);
        if (next != currentTab) {
            currentTab = next;
            drawCurrentTab(true);
        }
        return;
    }

    if (currentTab == TAB_UNITS) {
        if (hitRect(x, y, 222, 37, 90, 24)) {
            ble.startScan(4);
            drawCurrentTab(true);
            return;
        }
        int count = ble.unitCount();
        int showCount = count < 5 ? count : 5;
        for (int i = 0; i < showCount; ++i) {
            int ry = 67 + i * 34;
            if (hitRect(x, y, 8, ry, 304, 30)) {
                tft.fillRoundRect(60, 100, 200, 40, 6, C_TAB_ACT);
                tft.drawRoundRect(60, 100, 200, 40, 6, C_ACCENT);
                tft.setTextDatum(MC_DATUM);
                tft.setTextColor(C_TEXT, C_TAB_ACT);
                tft.drawString("Connecting...", 160, 120, 2);

                if (ble.connectToUnit(i)) {
                    audioConfigDirty = false;
                    pinsConfigDirty = false;
                    currentTab = TAB_CONTROL;
                }
                drawCurrentTab(true);
                return;
            }
        }
        return;
    }

    if (!ble.isConnected()) {
        if (hitRect(x, y, 85, 145, 150, 40)) {
            currentTab = TAB_UNITS;
            drawCurrentTab(true);
        }
        return;
    }

    if (currentTab == TAB_CONTROL) {
        if (hitRect(x, y, 8, 38, 84, 36)) {
            uiState.on = !uiState.on;
            ble.sendBoolPatch("on", uiState.on);
            drawControlTab(false);
        } else if (hitRect(x, y, 98, 38, 66, 36)) {
            currentTab = TAB_AUDIO;
            drawCurrentTab(true);
        } else if (hitRect(x, y, 170, 38, 32, 36)) {
            int idx = findPatternIndex(uiState.pattern);
            idx = (idx - 1 + kPatternCount) % kPatternCount;
            strncpy(uiState.pattern, kBuiltinPatterns[idx], sizeof(uiState.pattern) - 1);
            ble.sendStringPatch("pattern", uiState.pattern);
            drawControlTab(false);
        } else if (hitRect(x, y, 280, 38, 32, 36)) {
            int idx = findPatternIndex(uiState.pattern);
            idx = (idx + 1) % kPatternCount;
            strncpy(uiState.pattern, kBuiltinPatterns[idx], sizeof(uiState.pattern) - 1);
            ble.sendStringPatch("pattern", uiState.pattern);
            drawControlTab(false);
        } else if (hitRect(x, y, 8, 82, 196, 46)) {
            activeSlider = 0;
            updateSliderFromTouch(0, x, false);
        } else if (hitRect(x, y, 8, 134, 196, 46)) {
            activeSlider = 1;
            updateSliderFromTouch(1, x, false);
        } else if (hitRect(x, y, 8, 186, 196, 46)) {
            activeSlider = 2;
            updateSliderFromTouch(2, x, false);
        }
        return;
    }

    if (currentTab == TAB_AUDIO) {
        if (hitRect(x, y, 8, 37, 74, 26)) {
            currentTab = TAB_CONTROL;
            drawCurrentTab(true);
        } else if (hitRect(x, y, 198, 37, 114, 26)) {
            uiState.audioReactive = !uiState.audioReactive;
            ble.sendBoolPatch("audioReactive", uiState.audioReactive);
            drawAudioTab(false);
        } else if (y >= 68 && y < 96) {
            for (int i = 0; i < 3; ++i) {
                int sx = 8 + i * 103;
                if (hitRect(x, y, sx, 68, 98, 28)) {
                    uiState.audioSource = (uint8_t)i;
                    uiState.audioEnabled = (i != 0);
                    audioConfigDirty = true;
                    drawAudioTab(false);
                    return;
                }
            }
        } else if (y >= 101 && y < 146) {
            if (uiState.audioSource == 1) {
                if (x < 60) uiState.adcPin = stepAvailablePin(uiState.adcPin, -1);
                else if (x > 260) uiState.adcPin = stepAvailablePin(uiState.adcPin, 1);
                audioConfigDirty = true;
                drawAudioTab(false);
            } else if (uiState.audioSource == 2) {
                if (hitRect(x, y, 8, 101, 40, 44)) uiState.i2sBclk = stepAvailablePin(uiState.i2sBclk, -1);
                else if (hitRect(x, y, 66, 101, 40, 44)) uiState.i2sBclk = stepAvailablePin(uiState.i2sBclk, 1);
                else if (hitRect(x, y, 111, 101, 40, 44)) uiState.i2sWs = stepAvailablePin(uiState.i2sWs, -1);
                else if (hitRect(x, y, 169, 101, 40, 44)) uiState.i2sWs = stepAvailablePin(uiState.i2sWs, 1);
                else if (hitRect(x, y, 214, 101, 40, 44)) uiState.i2sSd = stepAvailablePin(uiState.i2sSd, -1);
                else if (hitRect(x, y, 272, 101, 40, 44)) uiState.i2sSd = stepAvailablePin(uiState.i2sSd, 1);
                audioConfigDirty = true;
                drawAudioTab(false);
            }
        } else if (hitRect(x, y, 8, 150, 304, 42)) {
            activeSlider = 3;
            updateSliderFromTouch(3, x, false);
        } else if (hitRect(x, y, 8, 197, 304, 35)) {
            ble.sendAudioConfig(uiState.audioEnabled, uiState.audioSource,
                                uiState.i2sBclk, uiState.i2sWs, uiState.i2sSd,
                                uiState.adcPin, uiState.audioGain);
            audioConfigDirty = false;
            delay(200);
            ble.disconnect();
            currentTab = TAB_UNITS;
            drawCurrentTab(true);
        }
        return;
    }

    if (currentTab == TAB_PINS) {
        if (y >= 38 && y < 76) {
            for (int i = 0; i < 8; ++i) {
                int cx = 8 + i * 38;
                if (hitRect(x, y, cx, 38, 34, 38)) {
                    selectedChannel = i;
                    drawPinsTab(false);
                    return;
                }
            }
        } else if (hitRect(x, y, 130, 91, 74, 26)) {
            currentTab = TAB_CH_SETTINGS;
            drawCurrentTab(true);
        } else if (hitRect(x, y, 210, 91, 92, 26)) {
            uiState.channels[selectedChannel] = !uiState.channels[selectedChannel];
            uiState.chDetails[selectedChannel].on = uiState.channels[selectedChannel];
            ble.sendChannelsPatch(uiState.channels, 8);
            drawPinsTab(false);
        } else if (hitRect(x, y, 18, 130, 44, 42)) {
            uiState.driverPins[selectedChannel] = stepAvailablePin(uiState.driverPins[selectedChannel], -5, selectedChannel);
            pinsConfigDirty = true;
            drawPinsTab(false);
        } else if (hitRect(x, y, 68, 130, 44, 42)) {
            uiState.driverPins[selectedChannel] = stepAvailablePin(uiState.driverPins[selectedChannel], -1, selectedChannel);
            pinsConfigDirty = true;
            drawPinsTab(false);
        } else if (hitRect(x, y, 208, 130, 44, 42)) {
            uiState.driverPins[selectedChannel] = stepAvailablePin(uiState.driverPins[selectedChannel], 1, selectedChannel);
            pinsConfigDirty = true;
            drawPinsTab(false);
        } else if (hitRect(x, y, 258, 130, 44, 42)) {
            uiState.driverPins[selectedChannel] = stepAvailablePin(uiState.driverPins[selectedChannel], 5, selectedChannel);
            pinsConfigDirty = true;
            drawPinsTab(false);
        } else if (hitRect(x, y, 8, 194, 200, 38)) {
            ble.sendDriverPinsConfig(uiState.driverPins, 8);
            pinsConfigDirty = false;
            delay(200);
            ble.disconnect();
            currentTab = TAB_UNITS;
            drawCurrentTab(true);
        } else if (hitRect(x, y, 216, 194, 96, 38)) {
            ble.disconnect();
            currentTab = TAB_UNITS;
            drawCurrentTab(true);
        }
        return;
    }

    if (currentTab == TAB_CH_SETTINGS) {
        ChannelDetail& cd = uiState.chDetails[selectedChannel];
        if (hitRect(x, y, 8, 37, 74, 26)) {
            currentTab = TAB_PINS;
            drawCurrentTab(true);
        } else if (hitRect(x, y, 194, 37, 118, 26)) {
            lastChEditMs = millis();
            cd.synced = !cd.synced;
            ble.sendChannelDetailPatch(selectedChannel, cd);
            drawChSettingsTab(false);
        } else if (hitRect(x, y, 8, 68, 148, 54)) {
            activeSlider = 4;
            updateSliderFromTouch(4, x, false);
        } else if (hitRect(x, y, 164, 68, 148, 54)) {
            activeSlider = 5;
            updateSliderFromTouch(5, x, false);
        } else if (hitRect(x, y, 8, 128, 148, 54)) {
            activeSlider = 6;
            updateSliderFromTouch(6, x, false);
        } else if (hitRect(x, y, 164, 128, 148, 54)) {
            activeSlider = 7;
            updateSliderFromTouch(7, x, false);
        } else if (hitRect(x, y, 12, 193, 44, 34)) {
            lastChEditMs = millis();
            // Cycle pattern override backwards ("" = Follow Master, then 0..kPatternCount-1)
            if (cd.patternOverride[0] == '\0') {
                strncpy(cd.patternOverride, kBuiltinPatterns[kPatternCount - 1], sizeof(cd.patternOverride) - 1);
            } else {
                int idx = findPatternIndex(cd.patternOverride);
                if (idx == 0) cd.patternOverride[0] = '\0';
                else strncpy(cd.patternOverride, kBuiltinPatterns[idx - 1], sizeof(cd.patternOverride) - 1);
            }
            cd.synced = false;
            ble.sendChannelDetailPatch(selectedChannel, cd);
            drawChSettingsTab(false);
        } else if (hitRect(x, y, 264, 193, 44, 34)) {
            lastChEditMs = millis();
            if (cd.patternOverride[0] == '\0') {
                strncpy(cd.patternOverride, kBuiltinPatterns[0], sizeof(cd.patternOverride) - 1);
            } else {
                int idx = findPatternIndex(cd.patternOverride);
                if (idx >= kPatternCount - 1) cd.patternOverride[0] = '\0';
                else strncpy(cd.patternOverride, kBuiltinPatterns[idx + 1], sizeof(cd.patternOverride) - 1);
            }
            cd.synced = false;
            ble.sendChannelDetailPatch(selectedChannel, cd);
            drawChSettingsTab(false);
        }
    }
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n[CYD] Haxel BLE Controller booting...");

    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);

    tft.init();
    tft.setRotation(1);
    tft.fillScreen(C_BG);

    touchSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
    touch.begin(touchSPI);
    touch.setRotation(1);

    ble.begin();
    ble.startScan(4);
    drawCurrentTab(true);
}

void loop() {
    ble.pump();

    if (ble.consumeConnDirty()) {
        drawCurrentTab(true);
    }
    if (ble.consumeScanDirty() && currentTab == TAB_UNITS) {
        drawCurrentTab(true);
    }
    if (ble.consumeStateDirty()) {
        if (activeSlider == -1 && !stateEquals(uiState, ble.state())) {
            HaxelState incoming = ble.state();
            if (audioConfigDirty) {
                incoming.audioEnabled = uiState.audioEnabled;
                incoming.audioSource = uiState.audioSource;
                incoming.i2sBclk = uiState.i2sBclk;
                incoming.i2sWs = uiState.i2sWs;
                incoming.i2sSd = uiState.i2sSd;
                incoming.adcPin = uiState.adcPin;
            }
            if (pinsConfigDirty) {
                memcpy(incoming.driverPins, uiState.driverPins, sizeof(uiState.driverPins));
            }
            if (millis() - lastChEditMs < 600) {
                memcpy(incoming.chDetails, uiState.chDetails, sizeof(uiState.chDetails));
            }
            uiState = incoming;
            if (currentTab != TAB_UNITS) {
                drawCurrentTab(false);
            }
        }
    }

    if (touch.touched()) {
        TS_Point p = touch.getPoint();
        int x = constrain(map(p.x, 200, 3800, 0, 320), 0, 319);
        int y = constrain(map(p.y, 200, 3800, 0, 240), 0, 239);

        if (!wasTouched) {
            uint32_t now = millis();
            if (now - lastTapMs > 120) {
                lastTapMs = now;
                handleTap(x, y);
            }
            wasTouched = true;
        } else if (activeSlider != -1) {
            updateSliderFromTouch(activeSlider, x, false);
        }
    } else {
        if (wasTouched) {
            if (activeSlider != -1) {
                if (activeSlider == 0) ble.sendFloatPatch("intensity", uiState.intensity);
                else if (activeSlider == 1) ble.sendFloatPatch("speed", uiState.speed);
                else if (activeSlider == 2) ble.sendFloatPatch("freq", uiState.freq);
                else if (activeSlider == 3) ble.sendFloatPatch("audioGain", uiState.audioGain);
                else if (activeSlider >= 4 && activeSlider <= 7) {
                    ble.sendChannelDetailPatch(selectedChannel, uiState.chDetails[selectedChannel]);
                }
                activeSlider = -1;
            }
            wasTouched = false;
        }
    }

    delay(20);
}
