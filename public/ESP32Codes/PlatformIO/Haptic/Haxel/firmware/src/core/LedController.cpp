#include "LedController.h"
#include <FastLED.h>

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

    // FastLED template pin initialization helper
    switch (pin_) {
#if defined(CONFIG_IDF_TARGET_ESP32C3)
        // ESP32-C3 valid pins
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
#else
        // Classic ESP32 & ESP32-S3 valid pins
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
            // Fallback to GPIO 2
            FastLED.addLeds<WS2812B, 2, GRB>(crgbLeds, count_);
            pin_ = 2;
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
}

void LedController::tick() {
    if (!enabled_ || !leds_ || !engine_) return;

    CRGB* crgbLeds = (CRGB*)leds_;

    // 1. Get haptic engine state & check if pattern changed
    StagedState s;
    engine_->copyState(s);

    IPattern* currentPattern = s.pattern;
    if (currentPattern != lastPattern_) {
        lastPattern_ = currentPattern;
        if (currentPattern) {
            // Check if pattern defines its own custom color
            if (!currentPattern->getColor(r_, g_, b_)) {
                // Otherwise randomize color using vibrant CHSV
                CHSV randomHsv(random8(), 255, 255);
                CRGB randomRgb;
                hsv2rgb_rainbow(randomHsv, randomRgb);
                r_ = randomRgb.r;
                g_ = randomRgb.g;
                b_ = randomRgb.b;
            }
        } else {
            // No pattern -> default accent color #ff6a3d
            r_ = 255;
            g_ = 106;
            b_ = 61;
        }
    }

    // 2. Scale amount of pixels lit up based on current motor PWM values
    float maxVal = 0.0f;
    if (s.on && !s.mute) {
        for (uint8_t i = 0; i < s.channelCount; ++i) {
            float val = engine_->getChannelValue(i);
            if (val > maxVal) maxVal = val;
        }
    }

    uint16_t litCount = (uint16_t)(maxVal * count_);
    if (litCount > count_) litCount = count_;

    // 3. Update pixels
    for (uint16_t i = 0; i < count_; ++i) {
        if (i < litCount) {
            crgbLeds[i] = CRGB(r_, g_, b_);
        } else {
            crgbLeds[i] = CRGB(0, 0, 0);
        }
    }

    FastLED.show();
}

} // namespace haxel::core
