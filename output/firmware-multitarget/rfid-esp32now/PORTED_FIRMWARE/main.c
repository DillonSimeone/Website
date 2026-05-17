// rfid-esp32now — ESP-IDF (C3) — PN532 read UID → ESP-NOW broadcast.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "driver/i2c_master.h"
#include "nvs_flash.h"
static const uint8_t BCAST[]={0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
static i2c_master_dev_handle_t pn;

static void pn_read_uid(uint8_t *uid){
    uint8_t cmd[] = {0x00,0x00,0xFF,0x04,0xFC,0xD4,0x4A,0x01,0x00,0xE1,0x00};
    i2c_master_transmit(pn, cmd, sizeof(cmd), 200);
    uint8_t r[24];
    i2c_master_receive(pn, r, sizeof(r), 200);
    memcpy(uid, &r[19], 4);
}

void app_main(void){
    nvs_flash_init();
    i2c_master_bus_config_t bc={.clk_source=I2C_CLK_SRC_DEFAULT,.i2c_port=0,
        .sda_io_num=5,.scl_io_num=6,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    i2c_master_bus_handle_t bus; i2c_new_master_bus(&bc, &bus);
    i2c_device_config_t dc={.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=0x24,.scl_speed_hz=100000};
    i2c_master_bus_add_device(bus, &dc, &pn);

    esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init();
    esp_now_peer_info_t pr = {.channel=0, .ifidx=WIFI_IF_STA};
    memcpy(pr.peer_addr, BCAST, 6); esp_now_add_peer(&pr);

    uint8_t uid[4];
    while(1){
        pn_read_uid(uid);
        esp_now_send(BCAST, uid, 4);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
