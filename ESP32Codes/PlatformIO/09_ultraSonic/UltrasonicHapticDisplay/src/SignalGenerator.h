#ifndef SIGNAL_GENERATOR_H
#define SIGNAL_GENERATOR_H

#include <Arduino.h>
#include "hardware/pwm.h"
#include "hardware/gpio.h"
#include "hardware/clocks.h"

/**
 * @brief Manages RP2040 hardware PWM output on GPIO 15 driving TPA3118.
 * Provides carrier generation (38-42 kHz), AM envelope modulation (50-300 Hz),
 * and 2mA drive strength configuration.
 */
class SignalGenerator {
public:
    static constexpr uint8_t PWM_PIN = 15;

    SignalGenerator();

    void begin();
    void setParameters(float carrierFreqHz, float dutyCyclePercent);
    void processModulation(uint32_t nowMicros, float modFreqHz);

    bool isEnvelopeActive() const { return m_envelopeActive; }

private:
    uint sliceNum;
    uint chanNum;

    float m_carrierFreqHz;
    float m_dutyCyclePercent;

    uint32_t m_lastModToggleMicros;
    bool m_envelopeActive;

    void updatePwmHardware();
};

#endif // SIGNAL_GENERATOR_H
