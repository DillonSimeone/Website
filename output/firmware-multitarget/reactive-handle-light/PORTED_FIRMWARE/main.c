// reactive-handle-light — ESP-IDF (C3) — MPU6050 + WS2812 + WiFi STA.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "nvs_flash.h"
static i2c_master_dev_handle_t mpu;
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t wc={.sta={.ssid="net",.password="pw"}};
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_set_config(WIFI_IF_STA,&wc);
    esp_wifi_start(); esp_wifi_connect();
    i2c_master_bus_config_t bc={.clk_source=I2C_CLK_SRC_DEFAULT,.i2c_port=0,
        .sda_io_num=5,.scl_io_num=6,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    i2c_master_bus_handle_t bus; i2c_new_master_bus(&bc,&bus);
    i2c_device_config_t dc={.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=0x68,.scl_speed_hz=400000};
    i2c_master_bus_add_device(bus,&dc,&mpu);
    uint8_t wake[]={0x6B,0x00}; i2c_master_transmit(mpu,wake,2,100);
    while(1){
        uint8_t r[6], reg=0x3B;
        i2c_master_transmit_receive(mpu,&reg,1,r,6,100);
        // tilt → drive WS2812 (omitted)
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
