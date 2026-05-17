// doorbell-leader — ESP-IDF (C3) — send ESP-NOW broadcast on button press, then deep-sleep.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "esp_sleep.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#define BTN 9
static const uint8_t BCAST[] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
void app_main(void){
    nvs_flash_init();
    esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init();
    esp_now_peer_info_t peer = {.channel=0, .ifidx=WIFI_IF_STA};
    memcpy(peer.peer_addr, BCAST, 6); esp_now_add_peer(&peer);
    esp_now_send(BCAST, (uint8_t*)"R", 1);
    vTaskDelay(pdMS_TO_TICKS(50));
    esp_sleep_enable_ext1_wakeup_io(1ULL << BTN, ESP_EXT1_WAKEUP_ANY_LOW);
    esp_deep_sleep_start();
}
