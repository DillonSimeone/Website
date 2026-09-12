/*
 * CH32V003Haptics
 * ---------------
 * Sample a MAX4466 analog mic, run a tiny fixed-point 64-point FFT,
 * pick the dominant band (low / mid / high), and drive a bidirectional
 * H-bridge with band-specific haptic patterns.
 *
 * Pin map (TENSTAR CH32V003F4P6 / generic TSSOP-20):
 *   PD1  - WCH-LinkE SWIO (do NOT use as GPIO)
 *   PC4  - MAX4466 OUT  (ADC channel 2)
 *   PC3  - External LED (TIM1_CH3 PWM, volume brightness)
 *   PD2  - H-bridge IN1 (TIM1_CH1 PWM, forward)
 *   PD3  - H-bridge IN2 (TIM2_CH2 PWM, reverse)
 *
 * Power: motor supply should be separate from the MCU V rail when possible.
 * Share GND with the driver. Never drive a motor from a GPIO.
 */

#include "ch32fun.h"
#include <stdint.h>

/* ========================= Tunables ========================= */

#define SAMPLE_RATE_HZ      8000
#define FFT_N               64          /* must be power of 2 */
#define FFT_LOG2N           6

/* Bin edges at Fs/N ≈ 125 Hz/bin (bin 0 = DC, ignored) */
#define BIN_LOW_START       1           /* ~125 Hz  */
#define BIN_LOW_END         3           /* ~375 Hz  */
#define BIN_MID_START       4           /* ~500 Hz  */
#define BIN_MID_END         9           /* ~1125 Hz */
#define BIN_HIGH_START      10          /* ~1250 Hz */
#define BIN_HIGH_END        24          /* ~3000 Hz */

#define ENERGY_GATE         80          /* ignore quieter frames (Q-ish units) */
#define BAND_MARGIN         12          /* dominant must beat others by this */
#define ENERGY_SMOOTH_SHIFT 2           /* EMA: new = old + (x-old)>>shift */

/* PWM: 48 MHz / (PSC+1) / (ARR+1) ≈ 20 kHz with values below */
#define PWM_PSC             9
#define PWM_ARR             239
#define PWM_DUTY_FLOOR      70          /* motor startup floor */
#define PWM_DUTY_MAX        200

/* LED brightness follows mean absolute microphone amplitude. */
#define LED_VOLUME_GATE     3           /* below this, LED is fully off */
#define LED_VOLUME_MAX      140         /* amplitude mapped to full brightness */
#define VOLUME_SMOOTH_SHIFT 2           /* 1/4 update per audio frame */

/* Pattern timings (ms) */
#define TAP_SHORT_ON_MS     40
#define TAP_SHORT_OFF_MS    60
#define TAP_LONG_ON_MS      160
#define TAP_LONG_OFF_MS     80
#define PATTERN_GAP_MS      180

/* ========================= Types ========================= */

typedef enum {
	BAND_NONE = 0,
	BAND_LOW,
	BAND_MID,
	BAND_HIGH
} BandId;

typedef enum {
	DIR_COAST = 0,
	DIR_FWD,
	DIR_REV
} DriveDir;

/* ========================= State ========================= */

static int16_t  s_re[FFT_N];
static int16_t  s_im[FFT_N];

static uint16_t s_energy_low;
static uint16_t s_energy_mid;
static uint16_t s_energy_high;
static uint16_t s_volume;

static BandId   s_band = BAND_NONE;
static uint8_t  s_duty = 0;

static uint32_t s_pat_t0;
static uint8_t  s_pat_step;
static uint8_t  s_pat_active;

/* ========================= Tiny helpers ========================= */

static uint32_t millis(void)
{
	/* SysTick @ HCLK/8 = 6 MHz when FUNCONF_SYSTICK_USE_HCLK=0 (default) */
	return (uint32_t)(SysTick->CNT / 6000u);
}

static uint16_t u16_clamp(uint32_t v, uint16_t lo, uint16_t hi)
{
	if (v < lo) return lo;
	if (v > hi) return hi;
	return (uint16_t)v;
}

static uint16_t isqrt32(uint32_t x)
{
	uint32_t op = x, res = 0, one = 1u << 30;
	while (one > op) one >>= 2;
	while (one) {
		if (op >= res + one) {
			op -= res + one;
			res = (res >> 1) + one;
		} else {
			res >>= 1;
		}
		one >>= 2;
	}
	return (uint16_t)res;
}

/* ========================= ADC (PC4 / ch2) ========================= */

static void adc_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_ADC1;

	/* PC4 analog */
	GPIOC->CFGLR &= ~(0xFu << (4 * 4));

	/* ADCCLK = 48 MHz / 2 = 24 MHz */
	RCC->CFGR0 &= ~(0x1Fu << 11);

	RCC->APB2PRSTR |= RCC_APB2Periph_ADC1;
	RCC->APB2PRSTR &= ~RCC_APB2Periph_ADC1;

	ADC1->RSQR1 = 0;
	ADC1->RSQR2 = 0;
	ADC1->RSQR3 = 2; /* channel 2 = PC4 */

	/* Long sample time for high-Z mic amp */
	ADC1->SAMPTR2 &= ~(7u << (3 * 2));
	ADC1->SAMPTR2 |=  (7u << (3 * 2)); /* 241 cycles */

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

/* ========================= PWM: H-bridge + volume LED ========================= */

static void pwm_init(void)
{
	RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_GPIOD
	               | RCC_APB2Periph_TIM1;
	RCC->APB1PCENR |= RCC_APB1Periph_TIM2;

	/* PC3 = TIM1_CH3 AF PP (LED) */
	GPIOC->CFGLR &= ~(0xFu << (4 * 3));
	GPIOC->CFGLR |= (GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4 * 3);

	/* PD2 = TIM1_CH1 AF PP, PD3 = TIM2_CH2 AF PP */
	GPIOD->CFGLR &= ~((0xFu << (4 * 2)) | (0xFu << (4 * 3)));
	GPIOD->CFGLR |= ((GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4 * 2))
	              |  ((GPIO_Speed_10MHz | GPIO_CNF_OUT_PP_AF) << (4 * 3));

	/* ---- TIM1 CH1 on PD2 (forward), CH3 on PC3 (LED) ---- */
	RCC->APB2PRSTR |= RCC_APB2Periph_TIM1;
	RCC->APB2PRSTR &= ~RCC_APB2Periph_TIM1;
	TIM1->PSC = PWM_PSC;
	TIM1->ATRLR = PWM_ARR;
	TIM1->CHCTLR1 = TIM_OC1M_2 | TIM_OC1M_1 | TIM_OC1PE; /* PWM1 + preload */
	TIM1->CHCTLR2 = TIM_OC3M_2 | TIM_OC3M_1 | TIM_OC3PE; /* PWM1 + preload */
	TIM1->CCER = TIM_CC1E | TIM_CC3E;
	TIM1->CH1CVR = 0;
	TIM1->CH3CVR = 0;
	TIM1->BDTR |= TIM_MOE;
	TIM1->SWEVGR |= TIM_UG;
	TIM1->CTLR1 |= TIM_ARPE | TIM_CEN;

	/* ---- TIM2 CH2 on PD3 (reverse) ---- */
	RCC->APB1PRSTR |= RCC_APB1Periph_TIM2;
	RCC->APB1PRSTR &= ~RCC_APB1Periph_TIM2;
	TIM2->PSC = PWM_PSC;
	TIM2->ATRLR = PWM_ARR;
	TIM2->CHCTLR1 = (TIM_OC2M_2 | TIM_OC2M_1 | TIM_OC2PE); /* CH2 in upper half */
	TIM2->CCER = TIM_CC2E;
	TIM2->CH2CVR = 0;
	TIM2->SWEVGR |= TIM_UG;
	TIM2->CTLR1 |= TIM_ARPE | TIM_CEN;
}

static void drive_set(DriveDir dir, uint8_t duty)
{
	if (duty > PWM_ARR) duty = (uint8_t)PWM_ARR;

	/* Always clear both first so we never shoot-through with both high */
	TIM1->CH1CVR = 0;
	TIM2->CH2CVR = 0;

	if (dir == DIR_FWD) {
		TIM1->CH1CVR = duty;
	} else if (dir == DIR_REV) {
		TIM2->CH2CVR = duty;
	}
	/* DIR_COAST: both already 0 */
}

static void drive_coast(void)
{
	drive_set(DIR_COAST, 0);
}

static void led_set_volume(uint16_t volume)
{
	uint32_t duty;

	if (volume <= LED_VOLUME_GATE) {
		TIM1->CH3CVR = 0;
		return;
	}

	if (volume >= LED_VOLUME_MAX) {
		TIM1->CH3CVR = PWM_ARR;
		return;
	}

	duty = (uint32_t)(volume - LED_VOLUME_GATE) * PWM_ARR;
	duty /= (LED_VOLUME_MAX - LED_VOLUME_GATE);
	TIM1->CH3CVR = (uint16_t)duty;
}

/* ========================= Fixed-point FFT ========================= */

/* Q15 sine table for 64-pt (N/4 + 1 = 17 entries: 0..90°) */
static const int16_t kSinQ15[17] = {
	0, 3212, 6393, 9512, 12540, 15447, 18205, 20788,
	23170, 25330, 27246, 28899, 30274, 31357, 32138, 32610, 32767
};

static int16_t sin_q15(uint8_t k)
{
	/* k = 0..63 corresponding to 0..360° in 64ths of a turn for twiddles */
	k &= 63;
	if (k <= 16) return kSinQ15[k];
	if (k <= 32) return kSinQ15[32 - k];
	if (k <= 48) return (int16_t)(-kSinQ15[k - 32]);
	return (int16_t)(-kSinQ15[64 - k]);
}

static int16_t cos_q15(uint8_t k)
{
	return sin_q15((uint8_t)(k + 16));
}

static int16_t q15_mul(int16_t a, int16_t b)
{
	return (int16_t)(((int32_t)a * (int32_t)b) >> 15);
}

static uint8_t bitrev6(uint8_t x)
{
	x = (uint8_t)(((x & 0x55) << 1) | ((x & 0xAA) >> 1));
	x = (uint8_t)(((x & 0x33) << 2) | ((x & 0xCC) >> 2));
	return (uint8_t)((x << 4) | (x >> 4)) >> 2; /* keep low 6 bits of 8-bit rev */
}

static void fft64(void)
{
	uint8_t i, s, m, mh, k, j;
	int16_t tr, ti, ur, ui, wr, wi;

	/* Bit-reverse permute */
	for (i = 0; i < FFT_N; i++) {
		uint8_t r = bitrev6(i);
		if (r > i) {
			int16_t tmp = s_re[i];
			s_re[i] = s_re[r];
			s_re[r] = tmp;
			tmp = s_im[i];
			s_im[i] = s_im[r];
			s_im[r] = tmp;
		}
	}

	for (s = 1; s <= FFT_LOG2N; s++) {
		m = (uint8_t)(1u << s);
		mh = (uint8_t)(m >> 1);
		for (k = 0; k < mh; k++) {
			/* twiddle W = exp(-j*2π*k/m); index in 64ths = k * (64/m) */
			uint8_t tw = (uint8_t)(k * (FFT_N / m));
			wr = cos_q15(tw);
			wi = (int16_t)(-sin_q15(tw));
			for (j = k; j < FFT_N; j = (uint8_t)(j + m)) {
				uint8_t t = (uint8_t)(j + mh);
				tr = (int16_t)(q15_mul(wr, s_re[t]) - q15_mul(wi, s_im[t]));
				ti = (int16_t)(q15_mul(wr, s_im[t]) + q15_mul(wi, s_re[t]));
				ur = s_re[j];
				ui = s_im[j];
				s_re[j] = (int16_t)(ur + tr);
				s_im[j] = (int16_t)(ui + ti);
				s_re[t] = (int16_t)(ur - tr);
				s_im[t] = (int16_t)(ui - ti);
			}
		}
	}
}

static int16_t triangle_window(uint8_t i, int16_t x)
{
	/* Compact triangular window (saves flash vs a full Hann table). */
	uint8_t w;
	if (i < 32) w = (uint8_t)(i * 8);       /* 0..248 */
	else        w = (uint8_t)((63 - i) * 8); /* 248..0 */
	return (int16_t)(((int32_t)x * w) >> 8);
}

/* ========================= Capture + analyse ========================= */

static void capture_and_analyse(void)
{
	uint8_t i;
	uint32_t sum = 0;
	uint32_t volume_sum = 0;
	int32_t mean;
	uint32_t low = 0, mid = 0, high = 0;
	uint16_t period_us = (uint16_t)(1000000u / SAMPLE_RATE_HZ);

	for (i = 0; i < FFT_N; i++) {
		uint32_t t0 = SysTick->CNT;
		uint16_t raw = adc_read();
		s_re[i] = (int16_t)raw;
		s_im[i] = 0;
		sum += raw;
		while ((uint32_t)(SysTick->CNT - t0) < (uint32_t)period_us * 6u) {}
	}

	mean = (int32_t)(sum / FFT_N);
	for (i = 0; i < FFT_N; i++) {
		int16_t c = (int16_t)((int32_t)s_re[i] - mean);
		volume_sum += (uint16_t)((c < 0) ? -c : c);
		/* Scale down a bit so FFT butterflies don't overflow int16 */
		c = (int16_t)(c >> 2);
		s_re[i] = triangle_window(i, c);
		s_im[i] = 0;
	}

	fft64();

	for (i = BIN_LOW_START; i <= BIN_LOW_END; i++) {
		int32_t re = s_re[i], im = s_im[i];
		low += (uint32_t)isqrt32((uint32_t)(re * re + im * im));
	}
	for (i = BIN_MID_START; i <= BIN_MID_END; i++) {
		int32_t re = s_re[i], im = s_im[i];
		mid += (uint32_t)isqrt32((uint32_t)(re * re + im * im));
	}
	for (i = BIN_HIGH_START; i <= BIN_HIGH_END; i++) {
		int32_t re = s_re[i], im = s_im[i];
		high += (uint32_t)isqrt32((uint32_t)(re * re + im * im));
	}

	/* Normalize by bin count roughly */
	low  /= (BIN_LOW_END  - BIN_LOW_START  + 1);
	mid  /= (BIN_MID_END  - BIN_MID_START  + 1);
	high /= (BIN_HIGH_END - BIN_HIGH_START + 1);

	s_energy_low  = (uint16_t)((int32_t)s_energy_low
	                + (((int32_t)low  - (int32_t)s_energy_low)  >> ENERGY_SMOOTH_SHIFT));
	s_energy_mid  = (uint16_t)((int32_t)s_energy_mid
	                + (((int32_t)mid  - (int32_t)s_energy_mid)  >> ENERGY_SMOOTH_SHIFT));
	s_energy_high = (uint16_t)((int32_t)s_energy_high
	                + (((int32_t)high - (int32_t)s_energy_high) >> ENERGY_SMOOTH_SHIFT));

	{
		uint16_t frame_volume = (uint16_t)(volume_sum / FFT_N);
		s_volume = (uint16_t)((int32_t)s_volume
		           + (((int32_t)frame_volume - (int32_t)s_volume)
		              >> VOLUME_SMOOTH_SHIFT));
		led_set_volume(s_volume);
	}
}

static BandId pick_band(void)
{
	uint16_t lo = s_energy_low, mi = s_energy_mid, hi = s_energy_high;
	uint16_t best = lo;
	BandId band = BAND_LOW;

	if (mi > best) { best = mi; band = BAND_MID; }
	if (hi > best) { best = hi; band = BAND_HIGH; }

	if (best < ENERGY_GATE) return BAND_NONE;

	/* Require clear winner */
	if (band == BAND_LOW  && (lo < mi + BAND_MARGIN) && (lo < hi + BAND_MARGIN)) return BAND_NONE;
	if (band == BAND_MID  && (mi < lo + BAND_MARGIN) && (mi < hi + BAND_MARGIN)) return BAND_NONE;
	if (band == BAND_HIGH && (hi < lo + BAND_MARGIN) && (hi < mi + BAND_MARGIN)) return BAND_NONE;

	return band;
}

static uint8_t energy_to_duty(uint16_t e)
{
	uint32_t t;
	if (e <= ENERGY_GATE) return 0;
	t = e - ENERGY_GATE;
	if (t > 400) t = 400;
	t = PWM_DUTY_FLOOR + (t * (PWM_DUTY_MAX - PWM_DUTY_FLOOR)) / 400;
	return (uint8_t)u16_clamp(t, PWM_DUTY_FLOOR, PWM_DUTY_MAX);
}

/* ========================= Haptic patterns ========================= */
/*
 * LOW  : tap  tap                 (two short pulses, forward)
 * MID  : continuous spin          (sustained forward PWM)
 * HIGH : tap  taaaap  tap  taaaap (short/long alternating, reverse dir)
 */

static void pattern_start(BandId band)
{
	s_band = band;
	s_pat_step = 0;
	s_pat_t0 = millis();
	s_pat_active = 1;

	if (band == BAND_MID) {
		s_duty = energy_to_duty(s_energy_mid);
		drive_set(DIR_FWD, s_duty);
	} else if (band == BAND_LOW) {
		s_duty = energy_to_duty(s_energy_low);
		if (s_duty < PWM_DUTY_FLOOR) s_duty = PWM_DUTY_FLOOR;
		drive_set(DIR_FWD, s_duty); /* first tap on */
	} else if (band == BAND_HIGH) {
		s_duty = energy_to_duty(s_energy_high);
		if (s_duty < PWM_DUTY_FLOOR) s_duty = PWM_DUTY_FLOOR;
		drive_set(DIR_REV, s_duty); /* short tap on */
	} else {
		drive_coast();
		s_pat_active = 0;
	}
}

static int pattern_elapsed(uint16_t ms)
{
	return (uint32_t)(millis() - s_pat_t0) >= ms;
}

static void pattern_tick(void)
{
	if (!s_pat_active) return;

	if (s_band == BAND_MID) {
		/* Keep spinning; refresh duty from latest energy */
		s_duty = energy_to_duty(s_energy_mid);
		if (s_duty == 0) {
			drive_coast();
			s_pat_active = 0;
			s_band = BAND_NONE;
		} else {
			drive_set(DIR_FWD, s_duty);
		}
		return;
	}

	if (s_band == BAND_LOW) {
		/* steps: 0 on, 1 off, 2 on, 3 off, 4 gap done */
		switch (s_pat_step) {
		case 0:
			if (pattern_elapsed(TAP_SHORT_ON_MS)) {
				drive_coast();
				s_pat_step = 1;
				s_pat_t0 = millis();
			}
			break;
		case 1:
			if (pattern_elapsed(TAP_SHORT_OFF_MS)) {
				drive_set(DIR_FWD, s_duty);
				s_pat_step = 2;
				s_pat_t0 = millis();
			}
			break;
		case 2:
			if (pattern_elapsed(TAP_SHORT_ON_MS)) {
				drive_coast();
				s_pat_step = 3;
				s_pat_t0 = millis();
			}
			break;
		case 3:
			if (pattern_elapsed(PATTERN_GAP_MS)) {
				s_pat_active = 0;
				s_band = BAND_NONE;
			}
			break;
		default:
			s_pat_active = 0;
			break;
		}
		return;
	}

	if (s_band == BAND_HIGH) {
		/* short on, off, long on, off, short on, off, long on, gap */
		switch (s_pat_step) {
		case 0: /* short on (rev) */
			if (pattern_elapsed(TAP_SHORT_ON_MS)) {
				drive_coast();
				s_pat_step = 1;
				s_pat_t0 = millis();
			}
			break;
		case 1:
			if (pattern_elapsed(TAP_SHORT_OFF_MS)) {
				drive_set(DIR_FWD, s_duty); /* long, opposite dir */
				s_pat_step = 2;
				s_pat_t0 = millis();
			}
			break;
		case 2: /* long on */
			if (pattern_elapsed(TAP_LONG_ON_MS)) {
				drive_coast();
				s_pat_step = 3;
				s_pat_t0 = millis();
			}
			break;
		case 3:
			if (pattern_elapsed(TAP_LONG_OFF_MS)) {
				drive_set(DIR_REV, s_duty);
				s_pat_step = 4;
				s_pat_t0 = millis();
			}
			break;
		case 4: /* short on */
			if (pattern_elapsed(TAP_SHORT_ON_MS)) {
				drive_coast();
				s_pat_step = 5;
				s_pat_t0 = millis();
			}
			break;
		case 5:
			if (pattern_elapsed(TAP_SHORT_OFF_MS)) {
				drive_set(DIR_FWD, s_duty);
				s_pat_step = 6;
				s_pat_t0 = millis();
			}
			break;
		case 6: /* long on */
			if (pattern_elapsed(TAP_LONG_ON_MS)) {
				drive_coast();
				s_pat_step = 7;
				s_pat_t0 = millis();
			}
			break;
		case 7:
			if (pattern_elapsed(PATTERN_GAP_MS)) {
				s_pat_active = 0;
				s_band = BAND_NONE;
			}
			break;
		default:
			s_pat_active = 0;
			break;
		}
	}
}

/* ========================= Main ========================= */

int main(void)
{
	SystemInit();
	Delay_Ms(50);

	adc_init();
	pwm_init();
	drive_coast();

	while (1) {
		capture_and_analyse();

		if (!s_pat_active) {
			BandId b = pick_band();
			if (b != BAND_NONE) {
				pattern_start(b);
			} else {
				drive_coast();
			}
		} else {
			pattern_tick();
			/* Mid patterns track live audio; re-analyse already done above.
			 * For one-shot tap patterns, ignore new bands until finished. */
		}
	}
}
