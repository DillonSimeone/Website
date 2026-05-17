// max4466-sanity — pico-sdk C (RP2040) — print ADC RMS.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/adc.h"
int main(void){
    stdio_init_all();
    adc_init(); adc_gpio_init(26); adc_select_input(0);
    while(1){
        uint32_t s=0;
        for(int i=0;i<512;i++) s += abs((int)adc_read() - 2048);
        printf("rms=%lu\n",(unsigned long)(s/512));
        sleep_ms(100);
    }
}
