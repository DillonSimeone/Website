// rat-vehicle — pico-sdk bare-C port (RP2040)
// Capacitive sensing on GP4/GP5 + 4 motor GPIOs via DRV8833.

#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/timer.h"

#define CAP_PIN_L 4
#define CAP_PIN_R 5
#define M_LF 10
#define M_LR 11
#define M_RF 12
#define M_RR 13

static uint32_t cap_sense(uint pin) {
    gpio_set_dir(pin, GPIO_OUT); gpio_put(pin, 0); sleep_us(20);
    gpio_set_dir(pin, GPIO_IN); gpio_pull_up(pin);
    uint32_t t = time_us_32();
    while (!gpio_get(pin) && time_us_32() - t < 2000) {}
    return time_us_32() - t;
}

int main(void) {
    stdio_init_all();
    const uint pins[] = {M_LF,M_LR,M_RF,M_RR};
    for (int i = 0; i < 4; i++) { gpio_init(pins[i]); gpio_set_dir(pins[i], GPIO_OUT); }
    gpio_init(CAP_PIN_L); gpio_init(CAP_PIN_R);
    while (1) {
        uint32_t l = cap_sense(CAP_PIN_L), r = cap_sense(CAP_PIN_R);
        gpio_put(M_LF, l < 100); gpio_put(M_LR, 0);
        gpio_put(M_RF, r < 100); gpio_put(M_RR, 0);
        sleep_ms(50);
    }
}
