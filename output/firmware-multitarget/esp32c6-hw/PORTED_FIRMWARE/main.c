// esp32c6-hw — ESP-IDF bare-C port (ESP32-C6)
// SSD1306 I2C OLED + HC-SR04 ultrasonic + WS2812 status.

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "esp_timer.h"

#define I2C_SDA 6
#define I2C_SCL 7
#define US_TRIG 8
#define US_ECHO 9

static i2c_master_dev_handle_t oled;

static void oled_cmd(uint8_t c) {
    uint8_t b[2] = {0x00, c};
    i2c_master_transmit(oled, b, 2, 100);
}

static uint32_t hcsr04_cm(void) {
    gpio_set_level(US_TRIG, 0); esp_rom_delay_us(2);
    gpio_set_level(US_TRIG, 1); esp_rom_delay_us(10);
    gpio_set_level(US_TRIG, 0);
    int64_t t0 = esp_timer_get_time();
    while (!gpio_get_level(US_ECHO) && esp_timer_get_time() - t0 < 30000) {}
    int64_t t1 = esp_timer_get_time();
    while (gpio_get_level(US_ECHO) && esp_timer_get_time() - t1 < 30000) {}
    return (esp_timer_get_time() - t1) / 58;
}

void app_main(void) {
    i2c_master_bus_config_t bc = {.clk_source=I2C_CLK_SRC_DEFAULT,.i2c_port=0,.sda_io_num=I2C_SDA,.scl_io_num=I2C_SCL,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    i2c_master_bus_handle_t bus; i2c_new_master_bus(&bc, &bus);
    i2c_device_config_t dc = {.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=0x3C,.scl_speed_hz=400000};
    i2c_master_bus_add_device(bus, &dc, &oled);
    // SSD1306 minimal init
    uint8_t init[] = {0xAE,0xD5,0x80,0xA8,0x3F,0xD3,0x00,0x40,0x8D,0x14,0x20,0x00,0xA1,0xC8,0xDA,0x12,0x81,0xCF,0xD9,0xF1,0xDB,0x40,0xA4,0xA6,0xAF};
    for (size_t i = 0; i < sizeof(init); i++) oled_cmd(init[i]);

    gpio_set_direction(US_TRIG, GPIO_MODE_OUTPUT);
    gpio_set_direction(US_ECHO, GPIO_MODE_INPUT);

    while (1) {
        uint32_t cm = hcsr04_cm();
        printf("range: %lu cm\n", (unsigned long)cm);
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}
