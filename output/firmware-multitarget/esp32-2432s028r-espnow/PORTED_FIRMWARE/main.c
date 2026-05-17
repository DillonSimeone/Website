// esp32-2432s028r-espnow — ESP-IDF (classic ESP32) — TFT + ESP-NOW.
// Keeps original WROOM-32 target since the dev board has it integrated.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "nvs_flash.h"
static const uint8_t BCAST[]={0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init();
    esp_now_peer_info_t p={.channel=0,.ifidx=WIFI_IF_STA}; memcpy(p.peer_addr,BCAST,6); esp_now_add_peer(&p);
    // ILI9341 SPI setup omitted (see pcb-clock for the pattern).
    uint32_t n=0;
    while(1){ esp_now_send(BCAST,(uint8_t*)&n,sizeof(n)); n++; vTaskDelay(pdMS_TO_TICKS(500)); }
}
