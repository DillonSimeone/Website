// midi-led-brace — pico-sdk C (RP2040) — TinyUSB MIDI → PIO WS2812.
#include <stdio.h>
#include "pico/stdlib.h"
#include "tusb.h"
#include "hardware/pio.h"
#include "ws2812.pio.h"
#define NUM 21
#define PIN 16
static uint8_t leds[NUM*3];
static inline void put(uint32_t p){ pio_sm_put_blocking(pio0, 0, p << 8u); }
int main(void){
    stdio_init_all(); tusb_init();
    PIO pio = pio0; uint off = pio_add_program(pio, &ws2812_program);
    ws2812_program_init(pio, 0, off, PIN, 800000, false);
    while(1){
        tud_task();
        uint8_t pkt[4];
        while(tud_midi_n_packet_read(0, pkt)){
            uint8_t note = pkt[2];
            if(note < NUM){ leds[note*3]=pkt[3]; leds[note*3+1]=128; leds[note*3+2]=64; }
        }
        for(int i=0;i<NUM;i++) put(((uint32_t)leds[i*3]<<16)|((uint32_t)leds[i*3+1]<<8)|leds[i*3+2]);
        sleep_us(500);
    }
}
