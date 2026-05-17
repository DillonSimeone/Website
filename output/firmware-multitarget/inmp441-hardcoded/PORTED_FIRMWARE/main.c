// inmp441-hardcoded — pico-sdk C (RP2040) — PIO I2S RX, print RMS.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "i2s.pio.h" // generated from pico-examples i2s rx PIO program
int main(void){
    stdio_init_all();
    PIO pio = pio0;
    uint offset = pio_add_program(pio, &i2s_rx_program);
    i2s_rx_program_init(pio, 0, offset, 2 /*SCK*/, 3 /*WS*/, 4 /*SD*/);
    while(1){
        int32_t s=0;
        for(int i=0;i<256;i++){
            int32_t v = (int32_t)pio_sm_get_blocking(pio, 0);
            s += abs(v >> 14);
        }
        printf("rms=%ld\n",(long)(s/256));
    }
}
