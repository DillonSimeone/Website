// deaf-clock — ESP-IDF bare-C port (ESP32-C3)
// 9 status LEDs + INMP441 I2S mic for ambient audio detection.

#include <stdio.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2s_std.h"
#include "esp_log.h"

static const gpio_num_t LED_PINS[] = {3,4,5,6,7,8,10,18,19};
#define N_LEDS (sizeof(LED_PINS)/sizeof(LED_PINS[0]))
#define I2S_SCK 0
#define I2S_WS  1
#define I2S_SD  2

static i2s_chan_handle_t rx;

static void mic_init(void) {
    i2s_chan_config_t ch_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s_new_channel(&ch_cfg, NULL, &rx);
    i2s_std_config_t std = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {.bclk = I2S_SCK, .ws = I2S_WS, .din = I2S_SD, .mclk = I2S_GPIO_UNUSED},
    };
    i2s_channel_init_std_mode(rx, &std);
    i2s_channel_enable(rx);
}

static void leds_init(void) {
    for (size_t i = 0; i < N_LEDS; i++) {
        gpio_set_direction(LED_PINS[i], GPIO_MODE_OUTPUT);
        gpio_set_level(LED_PINS[i], 0);
    }
}
static void show_time(int hh, int mm) {
    // simple binary-ish display: LEDs 0-4 = hour mod 12 (LSB-MSB), LEDs 5-8 = minute / 12
    for (size_t i = 0; i < N_LEDS; i++)
        gpio_set_level(LED_PINS[i], i < 5 ? (hh >> i) & 1 : (mm / 12) > (int)(i - 5));
}

void app_main(void) {
    leds_init();
    mic_init();
    int32_t buf[256];
    size_t br;
    time_t t = 0;
    while (1) {
        time(&t);
        struct tm tm; localtime_r(&t, &tm);
        show_time(tm.tm_hour % 12, tm.tm_min);
        if (i2s_channel_read(rx, buf, sizeof(buf), &br, 100) == ESP_OK) {
            int64_t sum = 0;
            for (int i = 0; i < 256; i++) sum += abs(buf[i] >> 14);
            if (sum / 256 > 200) ESP_LOGI("clk", "loud!");
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
