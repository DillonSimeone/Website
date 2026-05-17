// pcb-clock — ESP-IDF bare-C port (ESP32-C3)
// WiFi STA + SNTP + ST7789 SPI TFT display.

#include <stdio.h>
#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "nvs_flash.h"

#define TFT_MOSI 7
#define TFT_SCLK 6
#define TFT_CS   5
#define TFT_DC   4
#define TFT_RST  3
#define TFT_BL   8

#ifndef WIFI_SSID
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-pass"
#endif

static spi_device_handle_t tft;

static void tft_cmd(uint8_t c) {
    gpio_set_level(TFT_DC, 0);
    spi_transaction_t t = {.length = 8, .tx_buffer = &c};
    spi_device_polling_transmit(tft, &t);
}
static void tft_data(const uint8_t *d, int n) {
    gpio_set_level(TFT_DC, 1);
    spi_transaction_t t = {.length = n*8, .tx_buffer = d};
    spi_device_polling_transmit(tft, &t);
}
static void tft_init(void) {
    gpio_set_direction(TFT_DC, GPIO_MODE_OUTPUT);
    gpio_set_direction(TFT_RST, GPIO_MODE_OUTPUT);
    gpio_set_direction(TFT_BL, GPIO_MODE_OUTPUT);
    gpio_set_level(TFT_RST, 0); vTaskDelay(pdMS_TO_TICKS(20));
    gpio_set_level(TFT_RST, 1); vTaskDelay(pdMS_TO_TICKS(150));
    spi_bus_config_t buscfg = {.mosi_io_num=TFT_MOSI,.miso_io_num=-1,.sclk_io_num=TFT_SCLK,
        .quadwp_io_num=-1,.quadhd_io_num=-1,.max_transfer_sz=4096};
    spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO);
    spi_device_interface_config_t devcfg = {.clock_speed_hz=26*1000*1000,.mode=0,
        .spics_io_num=TFT_CS,.queue_size=4};
    spi_bus_add_device(SPI2_HOST, &devcfg, &tft);
    tft_cmd(0x11); vTaskDelay(pdMS_TO_TICKS(120));         // SLPOUT
    tft_cmd(0x3A); uint8_t b=0x05; tft_data(&b,1);         // 16bpp
    tft_cmd(0x29);                                          // DISPON
    gpio_set_level(TFT_BL, 1);
}

static void wifi_init(void) {
    nvs_flash_init();
    esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t c = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&c);
    wifi_config_t wc = { .sta = { .ssid = WIFI_SSID, .password = WIFI_PASS } };
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wc);
    esp_wifi_start(); esp_wifi_connect();
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();
}

void app_main(void) {
    tft_init();
    wifi_init();
    while (1) {
        time_t t; time(&t);
        struct tm tm; localtime_r(&t, &tm);
        printf("%02d:%02d:%02d\n", tm.tm_hour, tm.tm_min, tm.tm_sec);
        // TODO: render HH:MM as scaled framebuffer block to TFT
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
