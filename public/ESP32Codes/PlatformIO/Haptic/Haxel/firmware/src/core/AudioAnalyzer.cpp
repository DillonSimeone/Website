#include "AudioAnalyzer.h"
#include <Arduino.h>
#include <arduinoFFT.h>
#include <driver/i2s_std.h>
#include <math.h>
#include <esp_timer.h>

namespace haxel::core {

static constexpr float kSampleRate = 22050.0f;

void AudioAnalyzer::adcTimerCallback(void* arg) {
    AudioAnalyzer* self = (AudioAnalyzer*)arg;
    if (!self || !self->ready_) return;

    uint16_t v = analogRead(self->cfg_.adcPin);
    float sampleVal = ((float)v / 2048.0f - 1.0f) * self->cfg_.gain;

    uint8_t bufIdx = self->activeBuffer_;
    self->adcBuffers_[bufIdx][self->adcWriteIdx_] = sampleVal;
    self->adcWriteIdx_++;

    if (self->adcWriteIdx_ >= kWindow) {
        self->adcWriteIdx_ = 0;
        self->activeBuffer_ = 1 - bufIdx;
        self->bufferReady_ = true;
    }
}

bool AudioAnalyzer::begin(const AudioConfig& cfg) {
    cfg_ = cfg;
    if (!cfg_.enabled) return false;

    if (cfg_.source == AudioConfig::I2S_MEMS) {
        i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
        i2s_chan_handle_t rx_handle = nullptr;
        if (i2s_new_channel(&chan_cfg, nullptr, &rx_handle) != ESP_OK) return false;
        rxChan_ = (void*)rx_handle;

        i2s_std_config_t std_cfg = {
            .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)kSampleRate),
            .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
            .gpio_cfg = {
                .mclk = I2S_GPIO_UNUSED,
                .bclk = (gpio_num_t)cfg_.i2sBclk,
                .ws = (gpio_num_t)cfg_.i2sWs,
                .dout = I2S_GPIO_UNUSED,
                .din = (gpio_num_t)cfg_.i2sSd,
                .invert_flags = {
                    .mclk_inv = false,
                    .bclk_inv = false,
                    .ws_inv = false
                }
            }
        };

        if (i2s_channel_init_std_mode(rx_handle, &std_cfg) != ESP_OK) return false;
        if (i2s_channel_enable(rx_handle) != ESP_OK) return false;
    } else if (cfg_.source == AudioConfig::ADC) {
        analogReadResolution(12);
#if !defined(CONFIG_IDF_TARGET_ESP32C3)
        analogSetPinAttenuation(cfg_.adcPin, ADC_11db);
#endif
        activeBuffer_ = 0;
        adcWriteIdx_ = 0;
        bufferReady_ = false;

        esp_timer_create_args_t timer_args = {};
        timer_args.callback = &adcTimerCallback;
        timer_args.arg = this;
        timer_args.name = "adc_sampler";

        esp_timer_handle_t timerHandle;
        if (esp_timer_create(&timer_args, &timerHandle) == ESP_OK) {
            adcTimer_ = timerHandle;
            uint64_t intervalUs = (uint64_t)(1000000.0f / kSampleRate);
            esp_timer_start_periodic(timerHandle, intervalUs);
        } else {
            return false;
        }
    }

    ready_ = true;
    return true;
}

void AudioAnalyzer::end() {
    if (cfg_.source == AudioConfig::I2S_MEMS) {
        if (rxChan_) {
            i2s_chan_handle_t rx_handle = (i2s_chan_handle_t)rxChan_;
            i2s_channel_disable(rx_handle);
            i2s_del_channel(rx_handle);
            rxChan_ = nullptr;
        }
    } else if (cfg_.source == AudioConfig::ADC) {
        if (adcTimer_) {
            esp_timer_handle_t timerHandle = (esp_timer_handle_t)adcTimer_;
            esp_timer_stop(timerHandle);
            esp_timer_delete(timerHandle);
            adcTimer_ = nullptr;
        }
    }
    ready_ = false;
}

void AudioAnalyzer::processOneFrame() {
    if (!ready_) { delay(50); return; }

    // 1. Read one window's worth of samples.
    if (cfg_.source == AudioConfig::I2S_MEMS) {
        size_t bytesRead = 0;
        int32_t raw[kWindow];
        i2s_chan_handle_t rx_handle = (i2s_chan_handle_t)rxChan_;
        if (i2s_channel_read(rx_handle, raw, sizeof(raw), &bytesRead, portMAX_DELAY) == ESP_OK) {
            size_t n = bytesRead / sizeof(int32_t);
            for (size_t i = 0; i < n; ++i) {
                // 32-bit MEMS samples are left-justified, sign-extended.
                samples_[i] = (raw[i] >> 14) * (1.0f / 131072.0f) * cfg_.gain;
            }
        }
    } else if (cfg_.source == AudioConfig::ADC) {
        while (!bufferReady_ && ready_) {
            vTaskDelay(pdMS_TO_TICKS(2));
        }
        if (!ready_) return;

        uint8_t readBufIdx = 1 - activeBuffer_;
        memcpy(samples_, adcBuffers_[readBufIdx], sizeof(samples_));
        bufferReady_ = false;
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

} // namespace haxel::core
