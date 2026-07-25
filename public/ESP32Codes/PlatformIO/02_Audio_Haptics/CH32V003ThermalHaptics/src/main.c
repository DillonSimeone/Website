/*
 * CH32V003 Thermal Haptics - Mic (PC4) to MOSFET (PD4)
 * -----------------------------------------------------
 * Reads MAX4466 microphone analog signal on PC4 (ADC Channel 2)
 * Drives MOSFET PWM on PD4 (TIM2_CH1) proportional to audio volume.
 *
 * Pin map:
 *   PC4 - MAX4466 OUT (ADC Channel 2)
 *   PD4 - MOSFET PWM trigger (TIM2_CH1)
 */

#include "ch32fun.h"
#include <stdint.h>

#define SAMPLE_FRAME           64u
#define PWM_PSC                9u
#define PWM_ARR                239u

static void adc_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_ADC1;

	/* PC4 as analog input */
	GPIOC->CFGLR &= ~(0xFu << (4u * 4u));

	/* ADCCLK = 48 MHz / 2 */
	RCC->CFGR0 &= ~(0x1Fu << 11);
	RCC->APB2PRSTR |= RCC_APB2Periph_ADC1;
	RCC->APB2PRSTR &= ~RCC_APB2Periph_ADC1;

	ADC1->RSQR1 = 0;
	ADC1->RSQR2 = 0;
	ADC1->RSQR3 = 2; /* ADC Channel 2 = PC4 */

	/* Long sample time for high-Z mic output */
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

static void pwm_pd4_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOD;
	RCC->APB1PCENR |= RCC_APB1Periph_TIM2;

	/* PD4 = TIM2_CH1 Alternate Function Push-Pull */
	GPIOD->CFGLR &= ~(0xFu << (4u * 4u));
	GPIOD->CFGLR |= (GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4u * 4u);

	/* TIM2 CH1 Setup */
	RCC->APB1PRSTR |= RCC_APB1Periph_TIM2;
	RCC->APB1PRSTR &= ~RCC_APB1Periph_TIM2;

	TIM2->PSC = PWM_PSC;
	TIM2->ATRLR = PWM_ARR;
	TIM2->CHCTLR1 = TIM_OC1M_2 | TIM_OC1M_1 | TIM_OC1PE; /* PWM mode 1 */
	TIM2->CCER = TIM_CC1E;
	TIM2->CH1CVR = 0;
	TIM2->SWEVGR |= TIM_UG;
	TIM2->CTLR1 |= TIM_ARPE | TIM_CEN;
}

static void mosfet_set_pwm(uint8_t duty)
{
	if (duty > PWM_ARR) duty = PWM_ARR;
	TIM2->CH1CVR = duty;
}

static uint16_t get_volume_mad(void)
{
	uint16_t samples[SAMPLE_FRAME];
	uint32_t sum = 0;
	uint32_t deviation = 0;
	uint16_t mean;
	uint8_t i;

	for (i = 0; i < SAMPLE_FRAME; ++i) {
		samples[i] = adc_read();
		sum += samples[i];
		Delay_Us(125); /* ~8kHz sampling */
	}

	mean = (uint16_t)(sum / SAMPLE_FRAME);

	/* Check for floating/disconnected pin (VDD/2 is ~512) */
	if (mean < 250u || mean > 850u) {
		return 0;
	}

	for (i = 0; i < SAMPLE_FRAME; ++i) {
		int16_t centered = (int16_t)samples[i] - (int16_t)mean;
		deviation += (uint16_t)((centered < 0) ? -centered : centered);
	}

	return (uint16_t)(deviation / SAMPLE_FRAME);
}

int main(void)
{
	SystemInit();
	Delay_Ms(50);

	adc_init();
	pwm_pd4_init();
	mosfet_set_pwm(0);

	while (1) {
		uint16_t volume = get_volume_mad();
		uint32_t duty = 0;

		/* Sensitivity scaling */
		if (volume > 2u) {
			duty = (uint32_t)(volume - 2u) * 6u; /* 6x gain multiplier */
			if (duty > PWM_ARR) duty = PWM_ARR;
		}

		mosfet_set_pwm((uint8_t)duty);
	}
}





