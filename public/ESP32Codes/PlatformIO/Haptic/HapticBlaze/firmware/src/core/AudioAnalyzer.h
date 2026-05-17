#pragma once

#include "Pattern.h"
#include "Config.h"

namespace hapticblaze::core {

class AudioAnalyzer {
public:
    bool begin(const AudioConfig& cfg);
    void end();

    // Called from audio_task. Reads one DMA window, runs FFT + envelope,
    // updates `latest_`. Blocks on the I2S read.
    void processOneFrame();

    bool ready() const { return ready_; }
    AudioFrame latest() const { return latest_; }   // copy is intentional; single producer

private:
    bool        ready_ = false;
    AudioConfig cfg_{};
    AudioFrame  latest_{};

    static constexpr size_t kWindow = 1024;
    float       samples_[kWindow]{};
    float       fftReal_[kWindow]{};
    float       fftImag_[kWindow]{};
    float       envelope_ = 0.0f;
};

} // namespace hapticblaze::core
