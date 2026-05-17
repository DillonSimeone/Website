// max4466-motor-control — pico-sdk C (RP2040) — ADC → magnitude → motor PWM.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/adc.h"
#include "hardware/pwm.h"
int main(void){
    stdio_init_all();
    adc_init(); adc_gpio_init(26); adc_select_input(0);
    gpio_set_function(15, GPIO_FUNC_PWM);
    uint slc = pwm_gpio_to_slice_num(15);
    pwm_config c = pwm_get_default_config();
    pwm_config_set_clkdiv(&c, 4.f);
    pwm_init(slc, &c, true);
    while(1){
        uint32_t s = 0;
        for(int i=0;i<256;i++) s += abs((int)adc_read() - 2048);
        pwm_set_chan_level(slc, PWM_CHAN_A, (s/256) * 8);
        sleep_ms(20);
    }
}
