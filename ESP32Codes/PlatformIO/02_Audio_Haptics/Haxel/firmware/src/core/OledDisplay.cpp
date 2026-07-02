#include "OledDisplay.h"
#include "PatternRegistry.h"
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <cstring>

namespace haxel::core {

namespace {

const char* paramAbbrev(const String& p) {
    if (p == "speed")     return "S";
    if (p == "intensity") return "I";
    if (p == "gain")      return "G";
    if (p == "pattern")   return "P";
    if (p.length() == 0)  return "?";
    static char one[2];
    one[0] = (char)tolower(p.charAt(0));
    one[1] = '\0';
    return one;
}

void truncateCopy(char* dst, size_t cap, const char* src, size_t maxChars) {
    if (cap == 0) return;
    size_t n = strlen(src);
    if (n > maxChars) n = maxChars;
    memcpy(dst, src, n);
    dst[n] = '\0';
}

size_t patternIndex(IPattern* p) {
    if (!p) return 0;
    const auto& all = PatternRegistry::instance().all();
    for (size_t i = 0; i < all.size(); ++i) {
        if (all[i] == p) return i;
    }
    return 0;
}

} // anon

bool OledDisplay::begin(Config* config, Engine* engine) {
    end();
    config_ = config;
    engine_ = engine;
    if (!config_ || !engine_ || !config_->oledEnabled()) return false;

    const auto& oc = config_->oledConfig();
    if (oc.sda < 0 || oc.scl < 0) return false;

    Wire.begin(oc.sda, oc.scl);
    auto* disp = new Adafruit_SSD1306(
        (int)oc.width, (int)oc.height, &Wire, -1);
    if (!disp->begin(SSD1306_SWITCHCAPVCC, oc.i2cAddr)) {
        delete disp;
        return false;
    }
    disp->clearDisplay();
    disp->setTextColor(SSD1306_WHITE);
    disp->display();
    display_ = disp;
    memset(wave_, 0, sizeof(wave_));
    waveIdx_ = 0;
    ready_ = true;
    return true;
}

void OledDisplay::end() {
    if (display_) {
        delete static_cast<Adafruit_SSD1306*>(display_);
        display_ = nullptr;
    }
    ready_ = false;
}

void OledDisplay::sample() {
    if (!ready_ || !engine_) return;
    float v = engine_->getChannelValue(0);
    if (v < 0.0f) v = -v;
    if (v > 1.0f) v = 1.0f;
    uint8_t h = (uint8_t)(v * (float)(kWaveH - 2) + 0.5f);
    wave_[waveIdx_ % kWaveW] = h;
    waveIdx_++;
}

void OledDisplay::appendKnobSegment_(char* line, size_t cap, const KnobConfig& k,
                                     const StagedState& s) const {
    if (cap < 2 || !k.enabled || k.pin < 0 || k.param == "none") return;

    char seg[10];
    const char* ab = paramAbbrev(k.param);

    if (k.param == "speed") {
        snprintf(seg, sizeof(seg), "%s%.1f", ab, s.speed);
    } else if (k.param == "intensity") {
        snprintf(seg, sizeof(seg), "%s%u", ab, (unsigned)(s.intensity * 100.0f + 0.5f));
    } else if (k.param == "gain") {
        snprintf(seg, sizeof(seg), "%s%.1f", ab, config_->audioConfig().gain);
    } else if (k.param == "pattern") {
        snprintf(seg, sizeof(seg), "%s%u", ab, (unsigned)patternIndex(s.pattern));
    } else {
        int raw = analogRead(k.pin);
        unsigned pct = (unsigned)((raw * 100) / 4095);
        snprintf(seg, sizeof(seg), "%s%u", ab, pct);
    }

    size_t used = strlen(line);
    if (used > 0 && used + 1 < cap) {
        line[used++] = ' ';
        line[used] = '\0';
    }
    strncat(line, seg, cap - strlen(line) - 1);
}

void OledDisplay::draw_() {
    auto* disp = static_cast<Adafruit_SSD1306*>(display_);
    const int w = (int)config_->oledConfig().width;
    StagedState s;
    engine_->copyState(s);

    disp->clearDisplay();
    disp->setTextSize(1);

    // Row 0: current pattern (max ~21 chars at 6px/char on 128px).
    disp->setCursor(0, 0);
    if (s.pattern) {
        char pname[22];
        truncateCopy(pname, sizeof(pname), s.pattern->id(), 21);
        disp->print(pname);
    } else {
        disp->print(F("---"));
    }

    // Row 1: knob assignments — e.g. "S1.2 I72 G3.1 P5"
    char knobLine[24] = "";
    for (size_t i = 0; i < config_->knobCount(); ++i) {
        appendKnobSegment_(knobLine, sizeof(knobLine), config_->knob(i), s);
    }
    disp->setCursor(0, 8);
    if (knobLine[0]) disp->print(knobLine);
    else disp->print(F("no knobs"));

    // Divider above waveform area.
    const int waveTop = kTextH + 2;
    disp->drawFastHLine(0, kTextH, w, SSD1306_WHITE);

    // Scrolling waveform (newest sample at write head).
    const int baseY = waveTop + kWaveH - 1;
    const uint8_t start = waveIdx_ % kWaveW;
    for (int x = 0; x < kWaveW - 1; ++x) {
        uint8_t i0 = (start + (uint8_t)x) % kWaveW;
        uint8_t i1 = (start + (uint8_t)x + 1) % kWaveW;
        int y0 = baseY - (int)wave_[i0];
        int y1 = baseY - (int)wave_[i1];
        disp->drawLine(x, y0, x + 1, y1, SSD1306_WHITE);
    }

    disp->display();
}

void OledDisplay::tick() {
    if (!ready_) return;
    draw_();
}

} // namespace haxel::core
