/*
 * CH32V003 Thermal Haptics
 * ------------------------
 * A MAX4466 detects musical onsets. Each beat pulses a coin vibration motor,
 * while estimated BPM slowly changes the cooling power of a TEC1-12706.
 *
 * Pin map:
 *   PC4 - MAX4466 OUT (ADC channel 2)
 *   PD2 - high-current MOSFET module trigger (TIM1_CH1, Peltier PWM)
 *   PD3 - mini L298N channel A IN1 (TIM2_CH2, vibration PWM)
 *   PC3 - mini L298N channel A IN2 (held LOW)
 *   PD1 - WCH-LinkE SWIO; leave reserved
 *
 * The 12 V fan is intentionally not software-controlled. Wire it directly
 * across the 12 V supply so it runs whenever Peltier power is available.
 */

#include "ch32fun.h"
#include <stdint.h>

/* ========================= Audio tuning ========================= */

#define SAMPLE_RATE_HZ             8000u
#define AUDIO_FRAME_SAMPLES        64u
#define BEAT_ABSOLUTE_MARGIN       8u
#define BEAT_RELATIVE_PERCENT      45u
#define BEAT_REFRACTORY_MS         250u
#define BEAT_INTERVAL_MIN_MS       300u  /* 200 BPM */
#define BEAT_INTERVAL_MAX_MS       1333u /* 45 BPM */
#define AUDIO_TIMEOUT_MS           2500u
#define BPM_INTERVAL_COUNT         6u

/* ========================= Output tuning ========================= */

/* 48 MHz / (9 + 1) / (239 + 1) = 20 kHz PWM. */
#define PWM_PSC                    9u
#define PWM_ARR                    239u

#define MOTOR_PULSE_MS             85u
#define MOTOR_DUTY_MIN             105u
#define MOTOR_DUTY_MAX             210u

/*
 * Sensorless thermal guardrails. Forty percent is deliberately conservative,
 * but the TEC still draws its full instantaneous current during each ON pulse.
 * Start lower and verify supply current and heatsink temperature manually.
 */
#define TEC_DUTY_MIN_PERCENT       8u
#define TEC_DUTY_MAX_PERCENT       40u
#define TEC_BPM_MIN                60u
#define TEC_BPM_MAX                180u
#define TEC_ACTIVE_LIMIT_MS        20000u
#define TEC_FORCED_COOLDOWN_MS     40000u
#define TEC_RAMP_STEP              1u

#define TICKS_PER_MS               6000u /* SysTick uses 48 MHz / 8 */

typedef enum {
	TEC_READY = 0,
	TEC_ACTIVE,
	TEC_COOLDOWN
} TecState;

static uint16_t s_noise_floor;
static uint16_t s_volume;
static uint16_t s_previous_volume;
static uint16_t s_bpm;

static uint16_t s_beat_intervals[BPM_INTERVAL_COUNT];
static uint8_t s_interval_count;
static uint8_t s_interval_write;
static uint8_t s_have_beat;
static uint32_t s_last_beat_tick;

static uint8_t s_motor_duty;
static uint8_t s_motor_active;
static uint32_t s_motor_started_tick;

static TecState s_tec_state = TEC_READY;
static uint8_t s_tec_duty;
static uint8_t s_tec_target;
static uint32_t s_tec_state_tick;

static uint32_t ticks_now(void)
{
	return (uint32_t)SysTick->CNT;
}

static uint32_t elapsed_ms(uint32_t started)
{
	return (uint32_t)(ticks_now() - started) / TICKS_PER_MS;
}

static uint8_t percent_to_pwm(uint8_t percent)
{
	return (uint8_t)(((uint32_t)percent * PWM_ARR) / 100u);
}

/* ========================= MAX4466 ADC ========================= */

static void adc_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_ADC1;

	/* PC4 as analog input. */
	GPIOC->CFGLR &= ~(0xFu << (4u * 4u));

	/* ADCCLK = 48 MHz / 2. */
	RCC->CFGR0 &= ~(0x1Fu << 11);
	RCC->APB2PRSTR |= RCC_APB2Periph_ADC1;
	RCC->APB2PRSTR &= ~RCC_APB2Periph_ADC1;

	ADC1->RSQR1 = 0;
	ADC1->RSQR2 = 0;
	ADC1->RSQR3 = 2; /* ADC channel 2 = PC4 */
	ADC1->SAMPTR2 &= ~(7u << (3u * 2u));
	ADC1->SAMPTR2 |=  (7u << (3u * 2u));
	ADC1->CTLR2 |= ADC_ADON | ADC_EXTSEL;

	ADC1->CTLR2 |= ADC_RSTCAL;
	while (ADC1->CTLR2 & ADC_RSTCAL) {}
	ADC1->CTLR2 |= ADC_CAL;
	while (ADC1->CTLR2 & ADC_CAL) {}
}

static uint16_t adc_read(void)
{
	ADC1->CTLR2 |= ADC_SWSTART;
	while (!(ADC1->STATR & ADC_EOC)) {}
	return (uint16_t)ADC1->RDATAR;
}

/* ========================= PWM outputs ========================= */

static void outputs_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_GPIOD
	               | RCC_APB2Periph_TIM1;
	RCC->APB1PCENR |= RCC_APB1Periph_TIM2;

	/* PD2 = TIM1_CH1 AF push-pull (Peltier MOSFET trigger). */
	GPIOD->CFGLR &= ~(0xFu << (4u * 2u));
	GPIOD->CFGLR |= (GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4u * 2u);

	/* PD3 = TIM2_CH2 AF push-pull (vibration motor IN1). */
	GPIOD->CFGLR &= ~(0xFu << (4u * 3u));
	GPIOD->CFGLR |= (GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4u * 3u);

	/* PC3 = ordinary output (vibration motor IN2, always LOW). */
	GPIOC->CFGLR &= ~(0xFu << (4u * 3u));
	GPIOC->CFGLR |= (GPIO_Speed_10MHz | GPIO_CNF_OUT_PP) << (4u * 3u);
	GPIOC->BCR = 1u << 3;

	RCC->APB2PRSTR |= RCC_APB2Periph_TIM1;
	RCC->APB2PRSTR &= ~RCC_APB2Periph_TIM1;
	TIM1->PSC = PWM_PSC;
	TIM1->ATRLR = PWM_ARR;
	TIM1->CHCTLR1 = TIM_OC1M_2 | TIM_OC1M_1 | TIM_OC1PE;
	TIM1->CCER = TIM_CC1E;
	TIM1->CH1CVR = 0;
	TIM1->BDTR |= TIM_MOE;
	TIM1->SWEVGR |= TIM_UG;
	TIM1->CTLR1 |= TIM_ARPE | TIM_CEN;

	RCC->APB1PRSTR |= RCC_APB1Periph_TIM2;
	RCC->APB1PRSTR &= ~RCC_APB1Periph_TIM2;
	TIM2->PSC = PWM_PSC;
	TIM2->ATRLR = PWM_ARR;
	TIM2->CHCTLR1 = TIM_OC2M_2 | TIM_OC2M_1 | TIM_OC2PE;
	TIM2->CCER = TIM_CC2E;
	TIM2->CH2CVR = 0;
	TIM2->SWEVGR |= TIM_UG;
	TIM2->CTLR1 |= TIM_ARPE | TIM_CEN;
}

static void tec_set(uint8_t duty)
{
	if (duty > PWM_ARR) duty = PWM_ARR;
	TIM1->CH1CVR = duty;
}

static void motor_set(uint8_t duty)
{
	if (duty > PWM_ARR) duty = PWM_ARR;
	TIM2->CH2CVR = duty;
}

/* ========================= Beat estimation ========================= */

static uint16_t capture_volume(void)
{
	uint16_t samples[AUDIO_FRAME_SAMPLES];
	uint8_t i;
	uint32_t sum = 0;
	uint32_t deviation = 0;
	uint16_t period_ticks = (uint16_t)((48000000u / 8u) / SAMPLE_RATE_HZ);

	for (i = 0; i < AUDIO_FRAME_SAMPLES; ++i) {
		uint32_t sample_tick = ticks_now();
		samples[i] = adc_read();
		sum += samples[i];
		while ((uint32_t)(ticks_now() - sample_tick) < period_ticks) {}
	}

	{
		uint16_t mean = (uint16_t)(sum / AUDIO_FRAME_SAMPLES);
		for (i = 0; i < AUDIO_FRAME_SAMPLES; ++i) {
			int16_t centered = (int16_t)samples[i] - (int16_t)mean;
			deviation += (uint16_t)((centered < 0) ? -centered : centered);
		}
	}

	return (uint16_t)(deviation / AUDIO_FRAME_SAMPLES);
}

static void update_bpm(void)
{
	uint8_t i;
	uint32_t total = 0;

	if (s_interval_count == 0) {
		s_bpm = 0;
		return;
	}

	for (i = 0; i < s_interval_count; ++i) {
		total += s_beat_intervals[i];
	}
	total /= s_interval_count;
	s_bpm = (total != 0) ? (uint16_t)(60000u / total) : 0;
}

static void trigger_motor(uint16_t volume)
{
	uint32_t over = (volume > s_noise_floor) ? volume - s_noise_floor : 0;
	if (over > 100u) over = 100u;
	s_motor_duty = (uint8_t)(MOTOR_DUTY_MIN
	               + (over * (MOTOR_DUTY_MAX - MOTOR_DUTY_MIN)) / 100u);
	motor_set(s_motor_duty);
	s_motor_started_tick = ticks_now();
	s_motor_active = 1;
}

static void process_audio(void)
{
	uint16_t threshold;
	uint8_t is_rising;
	uint8_t refractory_over;

	s_volume = capture_volume();

	if (s_noise_floor == 0) {
		s_noise_floor = s_volume;
	}

	/* Slow adaptive background level; use signed math when the room quiets. */
	s_noise_floor = (uint16_t)((int32_t)s_noise_floor
	                + (((int32_t)s_volume - (int32_t)s_noise_floor) >> 5));

	threshold = (uint16_t)(s_noise_floor + BEAT_ABSOLUTE_MARGIN
	            + ((uint32_t)s_noise_floor * BEAT_RELATIVE_PERCENT) / 100u);
	is_rising = s_volume > s_previous_volume;
	refractory_over = !s_have_beat
	               || elapsed_ms(s_last_beat_tick) >= BEAT_REFRACTORY_MS;

	if (s_volume > threshold && is_rising && refractory_over) {
		uint32_t now = ticks_now();

		if (s_have_beat) {
			uint32_t interval = (uint32_t)(now - s_last_beat_tick) / TICKS_PER_MS;
			if (interval >= BEAT_INTERVAL_MIN_MS
			    && interval <= BEAT_INTERVAL_MAX_MS) {
				s_beat_intervals[s_interval_write] = (uint16_t)interval;
				s_interval_write = (uint8_t)((s_interval_write + 1u)
				                   % BPM_INTERVAL_COUNT);
				if (s_interval_count < BPM_INTERVAL_COUNT) {
					++s_interval_count;
				}
				update_bpm();
			}
		}

		s_last_beat_tick = now;
		s_have_beat = 1;
		trigger_motor(s_volume);
	}

	s_previous_volume = s_volume;

	if (s_have_beat && elapsed_ms(s_last_beat_tick) >= AUDIO_TIMEOUT_MS) {
		s_bpm = 0;
		s_interval_count = 0;
		s_interval_write = 0;
		s_have_beat = 0;
	}
}

/* ========================= Thermal guard ========================= */

static uint8_t bpm_to_tec_target(uint16_t bpm)
{
	uint8_t percent;

	if (bpm < TEC_BPM_MIN) return 0;
	if (bpm >= TEC_BPM_MAX) return percent_to_pwm(TEC_DUTY_MAX_PERCENT);

	percent = (uint8_t)(TEC_DUTY_MIN_PERCENT
	          + ((uint32_t)(bpm - TEC_BPM_MIN)
	             * (TEC_DUTY_MAX_PERCENT - TEC_DUTY_MIN_PERCENT))
	            / (TEC_BPM_MAX - TEC_BPM_MIN));
	return percent_to_pwm(percent);
}

static void thermal_tick(void)
{
	if (s_tec_state == TEC_READY) {
		s_tec_target = 0;
		if (s_bpm >= TEC_BPM_MIN) {
			s_tec_state = TEC_ACTIVE;
			s_tec_state_tick = ticks_now();
		}
	} else if (s_tec_state == TEC_ACTIVE) {
		s_tec_target = bpm_to_tec_target(s_bpm);
		if (elapsed_ms(s_tec_state_tick) >= TEC_ACTIVE_LIMIT_MS) {
			s_tec_state = TEC_COOLDOWN;
			s_tec_state_tick = ticks_now();
			s_tec_target = 0;
		}
	} else {
		s_tec_target = 0;
		if (elapsed_ms(s_tec_state_tick) >= TEC_FORCED_COOLDOWN_MS) {
			s_tec_state = TEC_READY;
		}
	}

	/* Slew both directions to avoid abrupt electrical and tactile changes. */
	if (s_tec_duty < s_tec_target) {
		uint16_t next = (uint16_t)s_tec_duty + TEC_RAMP_STEP;
		s_tec_duty = (next > s_tec_target) ? s_tec_target : (uint8_t)next;
	} else if (s_tec_duty > s_tec_target) {
		uint8_t step = (s_tec_duty > TEC_RAMP_STEP)
		             ? (uint8_t)(s_tec_duty - TEC_RAMP_STEP) : 0;
		s_tec_duty = (step < s_tec_target) ? s_tec_target : step;
	}
	tec_set(s_tec_duty);
}

static void motor_tick(void)
{
	if (s_motor_active && elapsed_ms(s_motor_started_tick) >= MOTOR_PULSE_MS) {
		motor_set(0);
		s_motor_active = 0;
	}
}

int main(void)
{
	SystemInit();
	Delay_Ms(50);

	adc_init();
	outputs_init();
	tec_set(0);
	motor_set(0);

	while (1) {
		process_audio();
		motor_tick();
		thermal_tick();
	}
}
