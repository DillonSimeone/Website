// mpu6050-led-pixels — ESP-IDF bare-C port (ESP32-C3)
// MPU6050 → 144-LED WS2812 reactive animation.

#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/rmt_tx.h"
#include "esp_log.h"

#define NUM_LEDS 144
#define LED_PIN 2
static i2c_master_dev_handle_t mpu;
static uint8_t pix[NUM_LEDS*3];

static void mpu_init(void) {
    i2c_master_bus_config_t bc = {.clk_source=I2C_CLK_SRC_DEFAULT,.i2c_port=0,
        .sda_io_num=0,.scl_io_num=1,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    i2c_master_bus_handle_t bus; i2c_new_master_bus(&bc, &bus);
    i2c_device_config_t dc = {.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=0x68,.scl_speed_hz=400000};
    i2c_master_bus_add_device(bus, &dc, &mpu);
    uint8_t wake[] = {0x6B, 0x00}; i2c_master_transmit(mpu, wake, 2, 100);
}

void app_main(void) {
    mpu_init();
    // RMT init for WS2812 omitted for brevity — see carrie-brain-badge port for full encoder.
    while (1) {
        uint8_t r[6], reg = 0x3B;
        i2c_master_transmit_receive(mpu, &reg, 1, r, 6, 100);
        int16_t ax = (r[0]<<8)|r[1];
        float t = (float)ax / 16384.0f;
        for (int i = 0; i < NUM_LEDS; i++) {
            float ph = (float)i / NUM_LEDS + t;
            pix[i*3+0] = (uint8_t)(127.0f + 127.0f * sinf(ph * 6.28f));
            pix[i*3+1] = (uint8_t)(127.0f + 127.0f * sinf(ph * 6.28f + 2.094f));
            pix[i*3+2] = (uint8_t)(127.0f + 127.0f * sinf(ph * 6.28f + 4.188f));
        }
        // ws2812_send(pix, sizeof(pix));
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
