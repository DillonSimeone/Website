#pragma once

#include "Pattern.h"
#include "Config.h"

namespace haxel::core {

class AudioAnalyzer {
public:
    bool begin(const AudioConfig& cfg);
    void end();

    // Called from audio_task. Reads one DMA window, runs FFT + envelope,
    // updates `latest_`. Blocks on the I2S read.
    void processOneFrame();

    bool ready() const { return ready_; }
    AudioFrame latest() const { return latest_; }   // copy is intentional; single producer
    void setGain(float g) { cfg_.gain = g; }

private:
    bool        ready_ = false;
    AudioConfig cfg_{};
    AudioFrame  latest_{};

    static constexpr size_t kWindow = 512;
    float       samples_[kWindow]{};
    float       fftReal_[kWindow]{};
    float       fftImag_[kWindow]{};
    float       envelope_ = 0.0f;

    // Double buffer and timer for non-blocking ADC sampling
    float       adcBuffers_[2][kWindow]{};
    int32_t     i2sRaw_[kWindow]{};
    int32_t     i2sScratch_[kWindow]{};
    uint16_t    bandLo_[32]{};
    uint16_t    bandHi_[32]{};
    float       activeSampleRate_ = 22050.0f;
    volatile uint8_t activeBuffer_ = 0;
    volatile uint16_t adcWriteIdx_ = 0;
    volatile bool bufferReady_ = false;
    void*       adcTimer_ = nullptr; // esp_timer_handle_t
    void*       rxChan_ = nullptr;   // i2s_chan_handle_t

    static void adcTimerCallback(void* arg);
};

} // namespace haxel::core
