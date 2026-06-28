#include "KnobController.h"
#include "AudioAnalyzer.h"
#include "PatternRegistry.h"
#include <cstring>

namespace haxel::core {

bool KnobController::begin(Config* config, Engine* engine, AudioAnalyzer* audio) {
    config_ = config;
    engine_ = engine;
    audio_  = audio;
    ready_  = false;
    if (!config_ || !engine_) return false;

    bool any = false;
    for (size_t i = 0; i < config_->knobCount(); ++i) {
        const auto& k = config_->knob(i);
        if (!k.enabled || k.pin < 0 || k.param == "none") continue;
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(CONFIG_IDF_TARGET_ESP32H2)
        analogSetAttenuation(ADC_11db);
#endif
        pinMode(k.pin, INPUT);
        lastSent_[i] = -1.0f;
        any = true;
    }
    ready_ = any;
    return ready_;
}

float KnobController::readKnob01_(int8_t pin) const {
    int raw = analogRead(pin);
    if (raw < 0) raw = 0;
    if (raw > 4095) raw = 4095;
    return raw / 4095.0f;
}

void KnobController::applyKnob_(const KnobConfig& knob, float v) {
    const char* param = knob.param.c_str();
    if (!strcmp(param, "speed")) {
        StagedState s;
        engine_->copyState(s);
        s.speed = 0.25f + v * 3.75f;
        engine_->stageState(s);
        return;
    }
    if (!strcmp(param, "intensity")) {
        StagedState s;
        engine_->copyState(s);
        s.intensity = v;
        engine_->stageState(s);
        return;
    }
    if (!strcmp(param, "gain")) {
        float gain = 0.1f + v * 9.9f;
        if (audio_) audio_->setGain(gain);
        if (config_) config_->setAudioGain(gain);
        return;
    }
    if (!strcmp(param, "pattern")) {
        const auto& all = PatternRegistry::instance().all();
        const size_t n = all.size();
        if (n == 0) return;
        size_t idx = (n > 1) ? (size_t)(v * (float)(n - 1) + 0.5f) : 0;
        if (idx >= n) idx = n - 1;
        StagedState s;
        engine_->copyState(s);
        s.pattern = all[idx];
        s.on = true;
        engine_->stageState(s);
        return;
    }

    StagedState s;
    engine_->copyState(s);
    if (!s.pattern) return;

    const auto& meta = s.pattern->meta();
    for (uint8_t pi = 0; pi < meta.paramCount; ++pi) {
        if (strcmp(meta.params[pi].id, param) != 0) continue;
        float scaled = meta.params[pi].minV +
                       v * (meta.params[pi].maxV - meta.params[pi].minV);
        if (s.pattern->setParam(param, scaled)) engine_->stageState(s);
        return;
    }
}

void KnobController::tick() {
    if (!ready_ || !config_ || !engine_) return;

    for (size_t i = 0; i < config_->knobCount(); ++i) {
        const auto& k = config_->knob(i);
        if (!k.enabled || k.pin < 0 || k.param == "none") continue;

        float v = readKnob01_(k.pin);
        if (fabsf(v - lastSent_[i]) < 0.008f) continue;
        lastSent_[i] = v;
        applyKnob_(k, v);
    }
}

} // namespace haxel::core
