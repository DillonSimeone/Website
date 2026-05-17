// audio-sanity-test — ESP-IDF (ESP32-C3) — INMP441 I2S RMS log.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"

void app_main(void) {
    i2s_chan_handle_t rx;
    i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s_new_channel(&cc, NULL, &rx);
    i2s_std_config_t sc = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {.bclk=4, .ws=5, .din=6, .mclk=I2S_GPIO_UNUSED}};
    i2s_channel_init_std_mode(rx, &sc); i2s_channel_enable(rx);
    int32_t buf[256]; size_t br;
    while (1) {
        i2s_channel_read(rx, buf, sizeof(buf), &br, 200);
        int64_t s = 0;
        for (int i = 0; i < 256; i++) s += abs(buf[i] >> 14);
        printf("rms=%lld\n", (long long)(s / 256));
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
