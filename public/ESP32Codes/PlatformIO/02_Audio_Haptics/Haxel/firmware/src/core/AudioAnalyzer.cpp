#include "AudioAnalyzer.h"
#include <Arduino.h>

#ifndef HAXEL_FEATURE_AUDIO
#define HAXEL_FEATURE_AUDIO 0
#endif

#if HAXEL_FEATURE_AUDIO

#include <arduinoFFT.h>
#include <esp_idf_version.h>
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
#include <driver/i2s_std.h>
#else
#include <driver/i2s.h>
#endif
#include <math.h>
#include <esp_timer.h>
#include <cstring>

namespace haxel::core {

static constexpr float kI2sSampleRate = 22050.0f;
static constexpr float kAdcSampleRate = 10000.0f;
void AudioAnalyzer::adcTimerCallback(void* arg) {
    AudioAnalyzer* self = (AudioAnalyzer*)arg;
    if (!self || !self->ready_) return;

    uint16_t v = analogRead(self->cfg_.adcPin);
    float sampleVal = ((float)v / 2048.0f - 1.0f) * self->cfg_.gain;

    uint8_t bufIdx = self->activeBuffer_;
    uint16_t writeIdx = self->adcWriteIdx_;
    self->adcBuffers_[bufIdx][writeIdx] = sampleVal;
    writeIdx++;
    self->adcWriteIdx_ = writeIdx;

    if (writeIdx >= kWindow) {
        self->adcWriteIdx_ = 0;
        self->activeBuffer_ = 1 - bufIdx;
        self->bufferReady_ = true;
    }
}

bool AudioAnalyzer::begin(const AudioConfig& cfg) {
    cfg_ = cfg;
    ready_ = false;
    if (!cfg_.enabled) return false;

    if (cfg_.source == AudioConfig::I2S_MEMS) {
        if (cfg_.i2sBclk < 0 || cfg_.i2sWs < 0 || cfg_.i2sSd < 0) {
            log_w("Audio I2S enabled without valid pins (bclk=%d ws=%d sd=%d)",
                  (int)cfg_.i2sBclk, (int)cfg_.i2sWs, (int)cfg_.i2sSd);
            return false;
        }
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
        i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
        i2s_chan_handle_t rx_handle = nullptr;
        if (i2s_new_channel(&chan_cfg, nullptr, &rx_handle) != ESP_OK) return false;

        i2s_std_config_t std_cfg = {
            .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)kI2sSampleRate),
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

        if (i2s_channel_init_std_mode(rx_handle, &std_cfg) != ESP_OK ||
            i2s_channel_enable(rx_handle) != ESP_OK) {
            i2s_del_channel(rx_handle);
            rxChan_ = nullptr;
            return false;
        }
        rxChan_ = (void*)rx_handle;
#else
        i2s_config_t i2s_cfg = {};
        i2s_cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
        i2s_cfg.sample_rate = (uint32_t)kI2sSampleRate;
        i2s_cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
        i2s_cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
        i2s_cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
        i2s_cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
        i2s_cfg.dma_buf_count = 4;
        i2s_cfg.dma_buf_len = (int)kWindow;
        i2s_cfg.use_apll = false;
        if (i2s_driver_install(I2S_NUM_0, &i2s_cfg, 0, nullptr) != ESP_OK) return false;

        i2s_pin_config_t pin_cfg = {};
        pin_cfg.bck_io_num = cfg_.i2sBclk;
        pin_cfg.ws_io_num = cfg_.i2sWs;
        pin_cfg.data_out_num = I2S_PIN_NO_CHANGE;
        pin_cfg.data_in_num = cfg_.i2sSd;
        if (i2s_set_pin(I2S_NUM_0, &pin_cfg) != ESP_OK) {
            i2s_driver_uninstall(I2S_NUM_0);
            return false;
        }
        rxChan_ = (void*)(uintptr_t)1;
#endif
    } else if (cfg_.source == AudioConfig::ADC) {
        if (cfg_.adcPin < 0) {
            log_w("Audio ADC enabled without valid pin (%d)", (int)cfg_.adcPin);
            return false;
        }
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
            uint64_t intervalUs = (uint64_t)(1000000.0f / kAdcSampleRate);
            esp_timer_start_periodic(timerHandle, intervalUs);
        } else {
            return false;
        }
    } else {
        // AudioConfig::NONE (Simulated / Browser stream): do not claim local hardware audio readiness.
        return false;
    }

    activeSampleRate_ = (cfg_.source == AudioConfig::ADC) ? kAdcSampleRate : kI2sSampleRate;
    const float nyquist = activeSampleRate_ / 2.0f;
    const float minFreq = 40.0f;
    for (int b = 0; b < 32; ++b) {
        float lo = minFreq * powf(nyquist / minFreq, b / 32.0f);
        float hi = minFreq * powf(nyquist / minFreq, (b + 1) / 32.0f);
        int loBin = (int)(lo * kWindow / activeSampleRate_);
        int hiBin = (int)(hi * kWindow / activeSampleRate_);
        if (loBin < 1) loBin = 1;
        if (hiBin <= loBin) hiBin = loBin + 1;

        if (hiBin > (int)(kWindow / 2)) hiBin = (int)(kWindow / 2);
        bandLo_[b] = (uint16_t)loBin;
        bandHi_[b] = (uint16_t)hiBin;
    }

    ready_ = true;
    return true;
}

void AudioAnalyzer::end() {
    if (cfg_.source == AudioConfig::I2S_MEMS) {
        if (rxChan_) {
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
            i2s_chan_handle_t rx_handle = (i2s_chan_handle_t)rxChan_;
            i2s_channel_disable(rx_handle);
            i2s_del_channel(rx_handle);
#else
            i2s_driver_uninstall(I2S_NUM_0);
#endif
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

    // 1. Read one window's worth of samples (I2S: purge DMA backlog so we
    //    analyze "now", not a Wi-Fi-delayed past).
    if (cfg_.source == AudioConfig::I2S_MEMS) {
        size_t bytesRead = 0;

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
        i2s_chan_handle_t rx_handle = (i2s_chan_handle_t)rxChan_;
        if (i2s_channel_read(rx_handle, i2sRaw_, sizeof(i2sRaw_), &bytesRead, portMAX_DELAY) != ESP_OK) {
            return;
        }
        // Non-blocking drain: keep overwriting with newer full windows.
        for (;;) {
            size_t more = 0;
            esp_err_t e = i2s_channel_read(rx_handle, i2sScratch_, sizeof(i2sScratch_), &more, 0);
            if (e != ESP_OK || more < sizeof(i2sScratch_)) break;
            memcpy(i2sRaw_, i2sScratch_, sizeof(i2sScratch_));
            bytesRead = more;
        }
#else
        if (i2s_read(I2S_NUM_0, i2sRaw_, sizeof(i2sRaw_), &bytesRead, portMAX_DELAY) != ESP_OK) {
            return;
        }
        for (;;) {
            size_t more = 0;
            esp_err_t e = i2s_read(I2S_NUM_0, i2sScratch_, sizeof(i2sScratch_), &more, 0);
            if (e != ESP_OK || more < sizeof(i2sScratch_)) break;
            memcpy(i2sRaw_, i2sScratch_, sizeof(i2sScratch_));
            bytesRead = more;
        }
#endif
        size_t n = bytesRead / sizeof(int32_t);
        if (n > kWindow) n = kWindow;
        for (size_t i = 0; i < n; ++i) {
            // 32-bit MEMS samples are left-justified, sign-extended.
            samples_[i] = (i2sRaw_[i] >> 14) * (1.0f / 131072.0f) * cfg_.gain;
        }
        for (size_t i = n; i < kWindow; ++i) samples_[i] = 0.0f;
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
    ArduinoFFT<float> fft(fftReal_, fftImag_, kWindow, activeSampleRate_);
    fft.windowing(FFTWindow::Hann, FFTDirection::Forward);
    fft.compute(FFTDirection::Forward);
    fft.complexToMagnitude();

    // 5. Group magnitudes into 32 log-spaced bands.
    AudioFrame f{};
    f.valid = true;
    f.rms = envelope_;
    f.peakDb = peakDb;


    float maxMag = 1e-9f;
    for (int b = 0; b < 32; ++b) {
        int loBin = bandLo_[b];
        int hiBin = bandHi_[b];




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

#else // !HAXEL_FEATURE_AUDIO

namespace haxel::core {

bool AudioAnalyzer::begin(const AudioConfig&) { return false; }
void AudioAnalyzer::end() { ready_ = false; }
void AudioAnalyzer::processOneFrame() { delay(50); }
void AudioAnalyzer::adcTimerCallback(void*) {}

} // namespace haxel::core

#endif