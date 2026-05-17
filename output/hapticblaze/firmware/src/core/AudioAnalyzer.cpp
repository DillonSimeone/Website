#include "AudioAnalyzer.h"
#include <Arduino.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>
#include <math.h>

namespace hapticblaze::core {

static constexpr float kSampleRate = 22050.0f;

bool AudioAnalyzer::begin(const AudioConfig& cfg) {
    cfg_ = cfg;
    if (!cfg_.enabled) return false;

    if (cfg_.source == AudioConfig::I2S_MEMS) {
        i2s_config_t i2sCfg = {};
        i2sCfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
        i2sCfg.sample_rate = (uint32_t)kSampleRate;
        i2sCfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
        i2sCfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
        i2sCfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
        i2sCfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
        i2sCfg.dma_buf_count = 4;
        i2sCfg.dma_buf_len = 256;
        if (i2s_driver_install(I2S_NUM_0, &i2sCfg, 0, nullptr) != ESP_OK) return false;
        i2s_pin_config_t pins = {};
        pins.bck_io_num = cfg_.i2sBclk;
        pins.ws_io_num  = cfg_.i2sWs;
        pins.data_in_num = cfg_.i2sSd;
        pins.data_out_num = I2S_PIN_NO_CHANGE;
        if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) return false;
    } else if (cfg_.source == AudioConfig::ADC) {
        analogReadResolution(12);
#if !defined(CONFIG_IDF_TARGET_ESP32C3)
        analogSetPinAttenuation(cfg_.adcPin, ADC_11db);
#endif
    }

    ready_ = true;
    return true;
}

void AudioAnalyzer::end() {
    if (cfg_.source == AudioConfig::I2S_MEMS) i2s_driver_uninstall(I2S_NUM_0);
    ready_ = false;
}

void AudioAnalyzer::processOneFrame() {
    if (!ready_) { delay(50); return; }

    // 1. Read one window's worth of samples.
    if (cfg_.source == AudioConfig::I2S_MEMS) {
        size_t bytesRead = 0;
        int32_t raw[kWindow];
        i2s_read(I2S_NUM_0, raw, sizeof(raw), &bytesRead, portMAX_DELAY);
        size_t n = bytesRead / sizeof(int32_t);
        for (size_t i = 0; i < n; ++i) {
            // 32-bit MEMS samples are left-justified, sign-extended.
            samples_[i] = (raw[i] >> 14) * (1.0f / 131072.0f) * cfg_.gain;
        }
    } else if (cfg_.source == AudioConfig::ADC) {
        for (size_t i = 0; i < kWindow; ++i) {
            uint16_t v = analogRead(cfg_.adcPin);
            samples_[i] = ((float)v / 2048.0f - 1.0f) * cfg_.gain;
            delayMicroseconds((uint32_t)(1000000.0f / kSampleRate));
        }
    } else {
        latest_.valid = false;
        delay(50);
        return;
    }

    // 2. RMS + peak.
    float sumSq = 0, peak = 0;
    for (size_t i = 0; i < kWindow; ++i) {
        float s = samples_[i];
        sumSq += s * s;
        if (fabsf(s) > peak) peak = fabsf(s);
    }
    float rms = sqrtf(sumSq / kWindow);
    float peakDb = 20.0f * log10f(peak + 1e-9f);

    // 3. Envelope follower with fast attack, slow release.
    const float attack = 0.35f, release = 0.05f;
    float coef = (rms > envelope_) ? attack : release;
    envelope_ = envelope_ + coef * (rms - envelope_);

    // 4. FFT.
    for (size_t i = 0; i < kWindow; ++i) {
        fftReal_[i] = samples_[i];
        fftImag_[i] = 0.0f;
    }
    ArduinoFFT<float> fft(fftReal_, fftImag_, kWindow, kSampleRate);
    fft.windowing(FFTWindow::Hann, FFTDirection::Forward);
    fft.compute(FFTDirection::Forward);
    fft.complexToMagnitude();

    // 5. Group magnitudes into 32 log-spaced bands.
    AudioFrame f{};
    f.valid = true;
    f.rms = envelope_;
    f.peakDb = peakDb;
    const float nyquist = kSampleRate / 2.0f;
    const float minFreq = 40.0f, maxFreq = nyquist;
    float maxMag = 1e-9f;
    for (int b = 0; b < 32; ++b) {
        float lo = minFreq * powf(maxFreq / minFreq, b / 32.0f);
        float hi = minFreq * powf(maxFreq / minFreq, (b + 1) / 32.0f);
        int   loBin = (int)(lo * kWindow / kSampleRate);
        int   hiBin = (int)(hi * kWindow / kSampleRate);
        if (hiBin <= loBin) hiBin = loBin + 1;
        float s = 0;
        for (int k = loBin; k < hiBin && k < (int)(kWindow / 2); ++k) s += fftReal_[k];
        f.mags[b] = s / (hiBin - loBin);
        if (f.mags[b] > maxMag) maxMag = f.mags[b];
    }
    for (int b = 0; b < 32; ++b) f.mags[b] = fminf(1.0f, f.mags[b] / (maxMag * 1.2f));

    // 6. Crude onset detection: rising envelope > threshold.
    static float prevEnv = 0;
    f.onset = (envelope_ - prevEnv) > 0.06f;
    prevEnv = envelope_;

    latest_ = f;
}

} // namespace hapticblaze::core
