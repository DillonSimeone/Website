// oled-strip-test — pico-sdk C (RP2040) — SSD1306 I2C + PIO WS2812.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"
#include "hardware/pio.h"
#include "ws2812.pio.h"
#define NUM 30
#define PIN 16
static inline void put(uint32_t p){ pio_sm_put_blocking(pio0, 0, p << 8u); }
static void oled_cmd(uint8_t c){ uint8_t b[2]={0x00,c}; i2c_write_blocking(i2c0, 0x3C, b, 2, false); }
int main(void){
    stdio_init_all();
    i2c_init(i2c0, 400000);
    gpio_set_function(4, GPIO_FUNC_I2C); gpio_set_function(5, GPIO_FUNC_I2C);
    uint8_t init[] = {0xAE,0xD5,0x80,0xA8,0x3F,0xD3,0x00,0x40,0x8D,0x14,0x20,0x00,0xA1,0xC8,0xDA,0x12,0x81,0xCF,0xA4,0xA6,0xAF};
    for(size_t i=0;i<sizeof(init);i++) oled_cmd(init[i]);
    PIO pio = pio0; uint off = pio_add_program(pio, &ws2812_program);
    ws2812_program_init(pio, 0, off, PIN, 800000, false);
    uint8_t t = 0;
    while(1){
        for(int i=0;i<NUM;i++) put(((uint32_t)(t+i*8)<<16)|0x004000);
        sleep_ms(30); t++;
    }
}
