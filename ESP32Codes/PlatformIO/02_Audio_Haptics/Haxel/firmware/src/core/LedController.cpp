#include "LedController.h"

#if HAXEL_FEATURE_LED

#include <FastLED.h>
#include <math.h>

namespace haxel::core {

LedController& LedController::instance() {
    static LedController inst;
    return inst;
}

bool LedController::begin(Config* config, Engine* engine) {
    config_ = config;
    engine_ = engine;

    const auto& lc = config_->ledConfig();
    enabled_ = lc.enabled;
    pin_ = lc.pin;
    count_ = lc.count;

    if (!enabled_ || pin_ < 0 || count_ == 0) {
        return false;
    }

    CRGB* crgbLeds = new CRGB[count_];
    memset(crgbLeds, 0, count_ * sizeof(CRGB));
    leds_ = (void*)crgbLeds;
    smoothIntensity_ = 0.0f;

    switch (pin_) {
#if defined(CONFIG_IDF_TARGET_ESP32C3)
        case 2:  FastLED.addLeds<WS2812B, 2,  GRB>(crgbLeds, count_); break;
        case 3:  FastLED.addLeds<WS2812B, 3,  GRB>(crgbLeds, count_); break;
        case 4:  FastLED.addLeds<WS2812B, 4,  GRB>(crgbLeds, count_); break;
        case 5:  FastLED.addLeds<WS2812B, 5,  GRB>(crgbLeds, count_); break;
        case 6:  FastLED.addLeds<WS2812B, 6,  GRB>(crgbLeds, count_); break;
        case 7:  FastLED.addLeds<WS2812B, 7,  GRB>(crgbLeds, count_); break;
        case 8:  FastLED.addLeds<WS2812B, 8,  GRB>(crgbLeds, count_); break;
        case 9:  FastLED.addLeds<WS2812B, 9,  GRB>(crgbLeds, count_); break;
        case 10: FastLED.addLeds<WS2812B, 10, GRB>(crgbLeds, count_); break;
        case 18: FastLED.addLeds<WS2812B, 18, GRB>(crgbLeds, count_); break;
        case 19: FastLED.addLeds<WS2812B, 19, GRB>(crgbLeds, count_); break;
        case 21: FastLED.addLeds<WS2812B, 21, GRB>(crgbLeds, count_); break;
#elif defined(CONFIG_IDF_TARGET_ESP32C6)
        // FireBeetle 2 ESP32-C6 — avoid flash/UART pins (24–26 per FastLED mask)
        case 8:  FastLED.addLeds<WS2812B, 8,  GRB>(crgbLeds, count_); break;
        case 16: FastLED.addLeds<WS2812B, 16, GRB>(crgbLeds, count_); break;
        case 17: FastLED.addLeds<WS2812B, 17, GRB>(crgbLeds, count_); break;
        case 19: FastLED.addLeds<WS2812B, 19, GRB>(crgbLeds, count_); break;
        case 20: FastLED.addLeds<WS2812B, 20, GRB>(crgbLeds, count_); break;
#else
        case 2:  FastLED.addLeds<WS2812B, 2,  GRB>(crgbLeds, count_); break;
        case 4:  FastLED.addLeds<WS2812B, 4,  GRB>(crgbLeds, count_); break;
        case 5:  FastLED.addLeds<WS2812B, 5,  GRB>(crgbLeds, count_); break;
        case 12: FastLED.addLeds<WS2812B, 12, GRB>(crgbLeds, count_); break;
        case 13: FastLED.addLeds<WS2812B, 13, GRB>(crgbLeds, count_); break;
        case 14: FastLED.addLeds<WS2812B, 14, GRB>(crgbLeds, count_); break;
        case 15: FastLED.addLeds<WS2812B, 15, GRB>(crgbLeds, count_); break;
        case 16: FastLED.addLeds<WS2812B, 16, GRB>(crgbLeds, count_); break;
        case 17: FastLED.addLeds<WS2812B, 17, GRB>(crgbLeds, count_); break;
        case 18: FastLED.addLeds<WS2812B, 18, GRB>(crgbLeds, count_); break;
        case 19: FastLED.addLeds<WS2812B, 19, GRB>(crgbLeds, count_); break;
        case 21: FastLED.addLeds<WS2812B, 21, GRB>(crgbLeds, count_); break;
        case 22: FastLED.addLeds<WS2812B, 22, GRB>(crgbLeds, count_); break;
        case 23: FastLED.addLeds<WS2812B, 23, GRB>(crgbLeds, count_); break;
        case 25: FastLED.addLeds<WS2812B, 25, GRB>(crgbLeds, count_); break;
        case 26: FastLED.addLeds<WS2812B, 26, GRB>(crgbLeds, count_); break;
        case 27: FastLED.addLeds<WS2812B, 27, GRB>(crgbLeds, count_); break;
        case 32: FastLED.addLeds<WS2812B, 32, GRB>(crgbLeds, count_); break;
        case 33: FastLED.addLeds<WS2812B, 33, GRB>(crgbLeds, count_); break;
#endif
        default:
#if defined(CONFIG_IDF_TARGET_ESP32C6)
            FastLED.addLeds<WS2812B, 17, GRB>(crgbLeds, count_);
            pin_ = 17;
#elif defined(CONFIG_IDF_TARGET_ESP32C3)
            FastLED.addLeds<WS2812B, 5, GRB>(crgbLeds, count_);
            pin_ = 5;
#else
            FastLED.addLeds<WS2812B, 2, GRB>(crgbLeds, count_);
            pin_ = 2;
#endif
            break;
    }

    FastLED.show();
    return true;
}

void LedController::end() {
    if (leds_) {
        CRGB* crgbLeds = (CRGB*)leds_;
        memset(crgbLeds, 0, count_ * sizeof(CRGB));
        FastLED.show();
        delete[] crgbLeds;
        leds_ = nullptr;
    }
    enabled_ = false;
    smoothIntensity_ = 0.0f;
}

void LedController::tick() {
    if (!enabled_ || !leds_ || !engine_) return;

    CRGB* crgbLeds = (CRGB*)leds_;

    StagedState s;
    engine_->copyState(s);

    IPattern* currentPattern = s.pattern;
    if (currentPattern != lastPattern_) {
        lastPattern_ = currentPattern;
        if (currentPattern) {
            if (!currentPattern->getColor(r_, g_, b_)) {
                CHSV randomHsv(random8(), 255, 255);
                CRGB randomRgb;
                hsv2rgb_rainbow(randomHsv, randomRgb);
                r_ = randomRgb.r;
                g_ = randomRgb.g;
                b_ = randomRgb.b;
            }
        } else {
            r_ = 255;
            g_ = 106;
            b_ = 61;
        }
    }

    // Pattern envelope BEFORE motor floor / soft-start.
    float target = 0.0f;
    if (s.on && !s.mute) {
        for (uint8_t i = 0; i < s.channelCount; ++i) {
            float val = engine_->getPatternValue(i);
            if (val > target) target = val;
        }
    }

    if (target > smoothIntensity_) {
        smoothIntensity_ += (target - smoothIntensity_) * kAttack;
    } else {
        smoothIntensity_ += (target - smoothIntensity_) * kRelease;
    }
    if (smoothIntensity_ < 0.002f) smoothIntensity_ = 0.0f;
    if (smoothIntensity_ > 1.0f) smoothIntensity_ = 1.0f;

    float fill = smoothIntensity_ * (float)count_;
    uint8_t bri = (uint8_t)lroundf(smoothIntensity_ * 255.0f);

    for (uint16_t i = 0; i < count_; ++i) {
        float edge = fill - (float)i;
        if (edge <= 0.0f || bri == 0) {
            crgbLeds[i] = CRGB(0, 0, 0);
            continue;
        }
        float edgeScale = edge >= 1.0f ? 1.0f : edge;
        uint8_t pixelBri = (uint8_t)lroundf(bri * edgeScale);
        crgbLeds[i] = CRGB(
            scale8(r_, pixelBri),
            scale8(g_, pixelBri),
            scale8(b_, pixelBri)
        );
    }

    FastLED.show();
}

} // namespace haxel::core

#else // !HAXEL_FEATURE_LED

namespace haxel::core {

LedController& LedController::instance() {
    static LedController inst;
    return inst;
}
bool LedController::begin(Config*, Engine*) { return false; }
void LedController::end() {}
void LedController::tick() {}

} // namespace haxel::core

#endif
