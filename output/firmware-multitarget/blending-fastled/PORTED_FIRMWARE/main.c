// blending-fastled — pico-sdk C (RP2040) — color blend across 32 LEDs.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "ws2812.pio.h"
#define N 32
#define PIN 16
static inline void put(uint32_t p){ pio_sm_put_blocking(pio0, 0, p << 8u); }
int main(void){
    PIO pio = pio0; uint off = pio_add_program(pio, &ws2812_program);
    ws2812_program_init(pio, 0, off, PIN, 800000, false);
    uint8_t t = 0;
    while(1){
        for(int i=0;i<N;i++){
            uint8_t mix = (i*255)/N + t;
            put(((uint32_t)mix<<16) | ((uint32_t)(255-mix)<<8) | 80);
        }
        sleep_ms(30); t++;
    }
}
