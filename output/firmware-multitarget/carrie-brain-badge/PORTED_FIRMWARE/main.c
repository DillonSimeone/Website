// carrie-brain-badge — ESP-IDF bare-C port
// Target: ESP32-C3 (esp32c3)
// Reads MPU6050 over I2C, drives 9 WS2812 LEDs reactive to motion magnitude,
// pulses ERM motor on shake, deep-sleeps on inactivity, wakes on BOOT button.

#include <stdio.h>
#include <string.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "driver/rmt_tx.h"
#include "driver/ledc.h"
#include "esp_sleep.h"
#include "esp_log.h"

#define TAG "badge"
#define I2C_SDA 5
#define I2C_SCL 6
#define LED_DIN 4
#define MOTOR_PWM 7
#define WAKE_BTN 9
#define NUM_LEDS 9
#define MPU6050_ADDR 0x68

static i2c_master_dev_handle_t mpu_dev;
static rmt_channel_handle_t rmt_chan;
static rmt_encoder_handle_t rmt_enc;

static esp_err_t mpu_read(uint8_t reg, uint8_t *buf, size_t n) {
    return i2c_master_transmit_receive(mpu_dev, &reg, 1, buf, n, 100);
}
static esp_err_t mpu_write(uint8_t reg, uint8_t val) {
    uint8_t b[2] = {reg, val};
    return i2c_master_transmit(mpu_dev, b, 2, 100);
}

static void mpu_init(void) {
    i2c_master_bus_config_t bus_cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT, .i2c_port = 0,
        .sda_io_num = I2C_SDA, .scl_io_num = I2C_SCL,
        .glitch_ignore_cnt = 7, .flags.enable_internal_pullup = true,
    };
    i2c_master_bus_handle_t bus;
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &bus));
    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = MPU6050_ADDR, .scl_speed_hz = 400000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus, &dev_cfg, &mpu_dev));
    mpu_write(0x6B, 0x00); // wake
}

// WS2812 over RMT (GRB, 800 kHz)
static size_t ws2812_encode(rmt_encoder_t *e, rmt_channel_handle_t ch,
    const void *data, size_t data_size, rmt_encode_state_t *state);

typedef struct { rmt_encoder_t base; rmt_encoder_t *bytes; rmt_symbol_word_t reset; } ws_enc_t;
static ws_enc_t ws_enc_obj;

static esp_err_t ws_enc_del(rmt_encoder_t *e) { return ESP_OK; }
static esp_err_t ws_enc_reset(rmt_encoder_t *e) { return ESP_OK; }

static void rmt_init(void) {
    rmt_tx_channel_config_t cfg = {
        .clk_src = RMT_CLK_SRC_DEFAULT, .gpio_num = LED_DIN,
        .mem_block_symbols = 64, .resolution_hz = 10000000, .trans_queue_depth = 4,
    };
    ESP_ERROR_CHECK(rmt_new_tx_channel(&cfg, &rmt_chan));
    rmt_bytes_encoder_config_t bytes_cfg = {
        .bit0 = {.level0 = 1, .duration0 = 3, .level1 = 0, .duration1 = 9},
        .bit1 = {.level0 = 1, .duration0 = 9, .level1 = 0, .duration1 = 3},
        .flags.msb_first = 1,
    };
    rmt_encoder_handle_t bytes_enc;
    ESP_ERROR_CHECK(rmt_new_bytes_encoder(&bytes_cfg, &bytes_enc));
    ws_enc_obj.base.encode = ws2812_encode;
    ws_enc_obj.base.del = ws_enc_del;
    ws_enc_obj.base.reset = ws_enc_reset;
    ws_enc_obj.bytes = bytes_enc;
    ws_enc_obj.reset = (rmt_symbol_word_t){.level0=0,.duration0=4000,.level1=0,.duration1=4000};
    rmt_enc = &ws_enc_obj.base;
    ESP_ERROR_CHECK(rmt_enable(rmt_chan));
}

static size_t ws2812_encode(rmt_encoder_t *e, rmt_channel_handle_t ch,
    const void *data, size_t sz, rmt_encode_state_t *state) {
    ws_enc_t *me = (ws_enc_t*)e;
    rmt_encode_state_t s = RMT_ENCODING_RESET;
    size_t n = me->bytes->encode(me->bytes, ch, data, sz, &s);
    *state = s;
    return n;
}

static void leds_show(uint8_t *grb_buf) {
    rmt_transmit_config_t tx_cfg = {.loop_count = 0};
    rmt_transmit(rmt_chan, rmt_enc, grb_buf, NUM_LEDS*3, &tx_cfg);
    rmt_tx_wait_all_done(rmt_chan, 100);
}

static void motor_init(void) {
    ledc_timer_config_t t = { .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_8_BIT, .timer_num = LEDC_TIMER_0,
        .freq_hz = 20000, .clk_cfg = LEDC_AUTO_CLK };
    ledc_timer_config(&t);
    ledc_channel_config_t c = { .gpio_num = MOTOR_PWM, .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0, .timer_sel = LEDC_TIMER_0, .duty = 0, .hpoint = 0 };
    ledc_channel_config(&c);
}
static void motor_set(uint8_t duty) {
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

void app_main(void) {
    gpio_set_direction(WAKE_BTN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(WAKE_BTN, GPIO_PULLUP_ONLY);
    mpu_init();
    rmt_init();
    motor_init();

    uint8_t leds[NUM_LEDS*3] = {0};
    int idle_ticks = 0;

    while (1) {
        uint8_t raw[6];
        if (mpu_read(0x3B, raw, 6) == ESP_OK) {
            int16_t ax = (raw[0]<<8)|raw[1];
            int16_t ay = (raw[2]<<8)|raw[3];
            int16_t az = (raw[4]<<8)|raw[5];
            float mag = sqrtf((float)ax*ax + (float)ay*ay + (float)az*az);
            float shake = fabsf(mag - 16384.0f) / 16384.0f;
            if (shake > 0.3f) idle_ticks = 0; else idle_ticks++;

            uint8_t v = (uint8_t)fminf(shake * 255.0f, 255.0f);
            for (int i = 0; i < NUM_LEDS; i++) {
                leds[i*3+0] = v;        // G
                leds[i*3+1] = v / 2;    // R
                leds[i*3+2] = 255 - v;  // B
            }
            leds_show(leds);
            motor_set(shake > 0.5f ? 180 : 0);
        }
        if (idle_ticks > 600) { // 60 s idle
            ESP_LOGI(TAG, "deep sleep");
            esp_sleep_enable_ext1_wakeup_io(1ULL << WAKE_BTN, ESP_EXT1_WAKEUP_ANY_LOW);
            esp_deep_sleep_start();
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
