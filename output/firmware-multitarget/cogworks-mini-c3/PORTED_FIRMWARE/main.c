// cogworks-mini-c3 — ESP-IDF bare-C port (ESP32-C3)
// I2S mic capture, FFT via esp-dsp, WS2812 LED strip via RMT, captive AP for config.

#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
#include "driver/gpio.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
#include "esp_dsp.h"

#define FFT_N 512
#define NUM_LEDS 60
#define LED_PIN 10
#define I2S_SCK 4
#define I2S_WS  5
#define I2S_SD  6

static float fft_in[FFT_N*2], fft_w[FFT_N];
static i2s_chan_handle_t mic_rx;

static esp_err_t root_get(httpd_req_t *r) {
    httpd_resp_sendstr(r, "<form method=POST><input name=ssid><input name=pw type=password><button>save</button></form>");
    return ESP_OK;
}
static void start_ap(void) {
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t c = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&c);
    wifi_config_t ap = {.ap = {.ssid="Cogworks", .ssid_len=8, .channel=1, .max_connection=2, .authmode=WIFI_AUTH_OPEN}};
    esp_wifi_set_mode(WIFI_MODE_AP);
    esp_wifi_set_config(WIFI_IF_AP, &ap);
    esp_wifi_start();
    httpd_handle_t s = NULL;
    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    httpd_start(&s, &cfg);
    httpd_uri_t u = {.uri="/", .method=HTTP_GET, .handler=root_get};
    httpd_register_uri_handler(s, &u);
}

void app_main(void) {
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    start_ap();

    i2s_chan_config_t cc = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s_new_channel(&cc, NULL, &mic_rx);
    i2s_std_config_t sc = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {.bclk=I2S_SCK, .ws=I2S_WS, .din=I2S_SD, .mclk=I2S_GPIO_UNUSED}};
    i2s_channel_init_std_mode(mic_rx, &sc); i2s_channel_enable(mic_rx);

    dsps_fft2r_init_fc32(NULL, FFT_N);
    int32_t buf[FFT_N]; size_t br;
    while (1) {
        i2s_channel_read(mic_rx, buf, sizeof(buf), &br, 200);
        for (int i = 0; i < FFT_N; i++) {
            fft_in[i*2] = (float)(buf[i] >> 14);
            fft_in[i*2+1] = 0;
        }
        dsps_fft2r_fc32(fft_in, FFT_N);
        dsps_bit_rev_fc32(fft_in, FFT_N);
        // TODO: drive WS2812 with magnitude bins via RMT
    }
}
