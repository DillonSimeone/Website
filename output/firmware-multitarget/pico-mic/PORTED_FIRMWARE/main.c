// pico-mic — pico-sdk C (RP2040) — FastLED→PIO WS2812 rainbow.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "ws2812.pio.h" // standard pico-examples
#define NUM 10
#define PIN 16
static inline void put(uint32_t p){ pio_sm_put_blocking(pio0, 0, p << 8u); }
int main(void){
    PIO pio = pio0; uint off = pio_add_program(pio, &ws2812_program);
    ws2812_program_init(pio, 0, off, PIN, 800000, false);
    uint8_t hue = 0;
    while(1){
        for(int i=0;i<NUM;i++){
            uint8_t h = hue + i*25;
            put(((uint32_t)h<<16) | ((uint32_t)(255-h)<<8) | 128);
        }
        sleep_ms(30); hue++;
    }
}
