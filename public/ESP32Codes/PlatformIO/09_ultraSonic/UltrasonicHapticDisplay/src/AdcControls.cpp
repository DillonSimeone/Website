#include "AdcControls.h"

AdcControls::AdcControls(float alpha)
    : m_alpha(alpha),
      m_emaCarrierNormalized(0.5f),
      m_emaModNormalized(0.4f),
      m_emaDriveNormalized(0.0f),
      m_carrierFreqHz(40000.0f),
      m_modFreqHz(150.0f),
      m_driveLevelPercent(10.0f) {}

void AdcControls::begin() {
    analogReadResolution(12); // RP2040 native 12-bit ADC (0 to 4095)
    pinMode(PIN_POT_CARRIER, INPUT);
    pinMode(PIN_POT_MOD, INPUT);
    pinMode(PIN_POT_DRIVE, INPUT);

    // Initial read to seed filters
    float raw0 = analogRead(PIN_POT_CARRIER) / 4095.0f;
    float raw1 = analogRead(PIN_POT_MOD) / 4095.0f;
    float raw2 = analogRead(PIN_POT_DRIVE) / 4095.0f;

    m_emaCarrierNormalized = raw0;
    m_emaModNormalized     = raw1;
    m_emaDriveNormalized   = raw2;

    update();
}

void AdcControls::update() {
    // Read raw ADC values (0.0 to 1.0)
    float rawCarrier = analogRead(PIN_POT_CARRIER) / 4095.0f;
    float rawMod     = analogRead(PIN_POT_MOD) / 4095.0f;
    float rawDrive   = analogRead(PIN_POT_DRIVE) / 4095.0f;

    // Apply EMA filter
    m_emaCarrierNormalized = (m_alpha * rawCarrier) + ((1.0f - m_alpha) * m_emaCarrierNormalized);
    m_emaModNormalized     = (m_alpha * rawMod)     + ((1.0f - m_alpha) * m_emaModNormalized);
    m_emaDriveNormalized   = (m_alpha * rawDrive)   + ((1.0f - m_alpha) * m_emaDriveNormalized);

    // Map to target ranges:
    // 1. Carrier Frequency: 38.0 kHz to 42.0 kHz (38000 Hz to 42000 Hz)
    m_carrierFreqHz = 38000.0f + (m_emaCarrierNormalized * 4000.0f);

    // 2. Modulation Frequency: 50 Hz to 300 Hz
    m_modFreqHz = 50.0f + (m_emaModNormalized * 250.0f);

    // 3. Drive Level Duty Cycle: 1.0% to 20.0%
    m_driveLevelPercent = 1.0f + (m_emaDriveNormalized * 19.0f);
}
