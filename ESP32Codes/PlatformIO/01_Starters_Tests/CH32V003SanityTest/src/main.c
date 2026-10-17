/*
 * TENSTAR CH32V003F4P6 minimum-board sanity test.
 *
 * Expected result:
 *   Three quick flashes, followed by a one-second pause.
 *
 * External LED wiring (use a series resistor):
 *
 *   PC3 ---- 220R to 1kR ---- LED anode (+, long leg)
 *   GND --------------------- LED cathode (-, short leg)
 *
 * Do NOT use PD7 for this test. On CH32V003, PD7 is also NRST.
 * Driving it low to turn the LED off resets the MCU, which makes the
 * LED look stuck on.
 */

#include "ch32fun.h"

#define EXTERNAL_LED PC3

int main(void)
{
	SystemInit();
	funGpioInitAll();

	funPinMode(EXTERNAL_LED, GPIO_Speed_10MHz | GPIO_CNF_OUT_PP);
	funDigitalWrite(EXTERNAL_LED, FUN_LOW);

	while (1) {
		for (int pulse = 0; pulse < 3; ++pulse) {
			funDigitalWrite(EXTERNAL_LED, FUN_HIGH);
			Delay_Ms(120);
			funDigitalWrite(EXTERNAL_LED, FUN_LOW);
			Delay_Ms(120);
		}

		Delay_Ms(1000);
	}
}
