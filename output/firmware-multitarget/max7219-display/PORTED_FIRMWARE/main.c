// max7219-display — ESP-IDF (C3) — MAX7219 SPI + WiFi softAP + captive portal.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
#define CS 5
static spi_device_handle_t spi;
static void m7w(uint8_t reg, uint8_t v){
    uint8_t b[2]={reg,v};
    spi_transaction_t t={.length=16,.tx_buffer=b};
    gpio_set_level(CS, 0); spi_device_polling_transmit(spi,&t); gpio_set_level(CS, 1);
}
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t ap={.ap={.ssid="MX7219",.ssid_len=6,.channel=1,.max_connection=2,.authmode=WIFI_AUTH_OPEN}};
    esp_wifi_set_mode(WIFI_MODE_AP); esp_wifi_set_config(WIFI_IF_AP,&ap); esp_wifi_start();
    gpio_set_direction(CS, GPIO_MODE_OUTPUT); gpio_set_level(CS, 1);
    spi_bus_config_t bc={.mosi_io_num=7,.miso_io_num=-1,.sclk_io_num=6,.quadwp_io_num=-1,.quadhd_io_num=-1};
    spi_bus_initialize(SPI2_HOST,&bc,SPI_DMA_CH_AUTO);
    spi_device_interface_config_t dc={.clock_speed_hz=1000000,.mode=0,.spics_io_num=-1,.queue_size=4};
    spi_bus_add_device(SPI2_HOST,&dc,&spi);
    m7w(0x09,0x00); m7w(0x0A,0x08); m7w(0x0B,0x07); m7w(0x0C,0x01); m7w(0x0F,0x00);
    for(int i=1;i<=8;i++) m7w(i,0xFF);
    while(1) vTaskDelay(pdMS_TO_TICKS(1000));
}
