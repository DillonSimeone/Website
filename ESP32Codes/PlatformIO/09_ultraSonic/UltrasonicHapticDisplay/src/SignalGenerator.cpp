#include "SignalGenerator.h"
#include "Config.h"

SignalGenerator::SignalGenerator()
    : sliceNum(0),
      chanNum(0),
      m_carrierFreqHz(40000.0f),
      m_dutyCyclePercent(10.0f),
      m_lastModToggleMicros(0),
      m_envelopeActive(true) {}

void SignalGenerator::begin() {
    // 1. GPIO drive strength into TPA3118 IN+ (2mA conservative, 12mA bench)
    gpio_set_drive_strength(
        PWM_PIN,
        USE_STRONG_GPIO_DRIVE ? GPIO_DRIVE_STRENGTH_12MA : GPIO_DRIVE_STRENGTH_2MA
    );

    // 2. Set pin function to PWM
    gpio_set_function(PWM_PIN, GPIO_FUNC_PWM);

    // 3. Find PWM slice and channel for GPIO 15
    sliceNum = pwm_gpio_to_slice_num(PWM_PIN);
    chanNum  = pwm_gpio_to_channel(PWM_PIN);

    // 4. Configure PWM slice clock divider to 1 (125 MHz clock)
    pwm_config config = pwm_get_default_config();
    pwm_config_set_clkdiv(&config, 1.0f);
    pwm_init(sliceNum, chanNum, &config, false);

    // 5. Apply initial wrap and duty level
    updatePwmHardware();

    // 6. Enable hardware PWM slice
    pwm_set_enabled(sliceNum, true);
}

void SignalGenerator::setParameters(float carrierFreqHz, float dutyCyclePercent) {
    // Boundary safety limits
    if (carrierFreqHz < 10000.0f) carrierFreqHz = 10000.0f;
    if (carrierFreqHz > 100000.0f) carrierFreqHz = 100000.0f;
    if (dutyCyclePercent < 0.1f) dutyCyclePercent = 0.1f;
    if (dutyCyclePercent > DUTY_HARD_LIMIT_PERCENT) dutyCyclePercent = DUTY_HARD_LIMIT_PERCENT;

    m_carrierFreqHz = carrierFreqHz;
    m_dutyCyclePercent = dutyCyclePercent;

    updatePwmHardware();
}

void SignalGenerator::updatePwmHardware() {
    uint32_t systemClockHz = clock_get_hz(clk_sys);
    
    // Calculate PWM wrap value (TOP) for requested carrier frequency
    uint32_t top = (uint32_t)((float)systemClockHz / m_carrierFreqHz) - 1;
    if (top > 65535) top = 65535;

    // Calculate level for target duty cycle
    uint32_t level = (uint32_t)(((float)(top + 1) * m_dutyCyclePercent) / 100.0f);

    // Glitch-free update of hardware PWM registers
    pwm_set_wrap(sliceNum, (uint16_t)top);
    pwm_set_chan_level(sliceNum, chanNum, (uint16_t)level);
}

void SignalGenerator::processModulation(uint32_t nowMicros, float modFreqHz) {
    if (!AM_MODULATION_ENABLED) {
        if (!m_envelopeActive) {
            m_envelopeActive = true;
            pwm_set_enabled(sliceNum, true);
        }
        return;
    }

    if (modFreqHz <= 0.0f) return;

    // Calculate half-period in microseconds (50% burst duty cycle envelope)
    // Period T = 1.0 / modFreqHz seconds = 1,000,000 / modFreqHz microseconds
    // Half-period = 500,000 / modFreqHz
    uint32_t halfPeriodMicros = (uint32_t)(500000.0f / modFreqHz);

    if ((nowMicros - m_lastModToggleMicros) >= halfPeriodMicros) {
        m_lastModToggleMicros = nowMicros;
        m_envelopeActive = !m_envelopeActive;

        // Toggle PWM slice enable bit cleanly without resetting phase counter
        pwm_set_enabled(sliceNum, m_envelopeActive);
    }
}
