// haptic-follower-drv2605l — ESP-IDF (C3) — ESP-NOW recv → DRV2605L waveform play.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "driver/i2c_master.h"
#include "nvs_flash.h"
static i2c_master_dev_handle_t drv;
static void drv_w(uint8_t r,uint8_t v){uint8_t b[2]={r,v};i2c_master_transmit(drv,b,2,50);}
static volatile uint8_t effect = 0;
static void on_recv(const esp_now_recv_info_t*i,const uint8_t*d,int n){ if(n>0) effect = d[0]; }
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    i2c_master_bus_config_t bc={.clk_source=I2C_CLK_SRC_DEFAULT,.i2c_port=0,
        .sda_io_num=5,.scl_io_num=6,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    i2c_master_bus_handle_t bus; i2c_new_master_bus(&bc,&bus);
    i2c_device_config_t dc={.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=0x5A,.scl_speed_hz=400000};
    i2c_master_bus_add_device(bus,&dc,&drv);
    drv_w(0x01,0x00); // out of standby
    drv_w(0x03,0x01); // ERM, lib 1
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init(); esp_now_register_recv_cb(on_recv);
    while(1){
        if(effect){ drv_w(0x04, effect); drv_w(0x0C, 0x01); effect = 0; }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
