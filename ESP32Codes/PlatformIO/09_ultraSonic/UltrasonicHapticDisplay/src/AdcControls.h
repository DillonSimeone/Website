#ifndef ADC_CONTROLS_H
#define ADC_CONTROLS_H

#include <Arduino.h>

/**
 * @brief Class handling ADC inputs with EMA (Exponential Moving Average) filtering.
 * Maps potentiometer values to Carrier Freq (kHz), Modulation Rate (Hz), and Drive Level (%).
 */
class AdcControls {
public:
    static constexpr uint8_t PIN_POT_CARRIER = 26; // ADC0
    static constexpr uint8_t PIN_POT_MOD     = 27; // ADC1
    static constexpr uint8_t PIN_POT_DRIVE   = 28; // ADC2

    AdcControls(float alpha = 0.15f);

    void begin();
    void update();

    float getCarrierFreqHz() const { return m_carrierFreqHz; }
    float getCarrierFreqKHz() const { return m_carrierFreqHz / 1000.0f; }
    float getModFreqHz() const { return m_modFreqHz; }
    float getDriveLevelPercent() const { return m_driveLevelPercent; }

private:
    float m_alpha;

    // Filtered ADC values (0.0 to 1.0)
    float m_emaCarrierNormalized;
    float m_emaModNormalized;
    float m_emaDriveNormalized;

    // Physical engineering values
    float m_carrierFreqHz;
    float m_modFreqHz;
    float m_driveLevelPercent;
};

#endif // ADC_CONTROLS_H
