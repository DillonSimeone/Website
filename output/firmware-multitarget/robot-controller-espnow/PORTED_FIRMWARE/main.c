// robot-controller-espnow — ESP-IDF (C3) — joystick ADC → ESP-NOW packet.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "esp_adc/adc_oneshot.h"
#include "nvs_flash.h"
static const uint8_t BCAST[]={0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};

void app_main(void){
    nvs_flash_init();
    esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init();
    esp_now_peer_info_t p={.channel=0,.ifidx=WIFI_IF_STA}; memcpy(p.peer_addr,BCAST,6); esp_now_add_peer(&p);
    adc_oneshot_unit_handle_t adc;
    adc_oneshot_unit_init_cfg_t uc={.unit_id=ADC_UNIT_1};
    adc_oneshot_new_unit(&uc,&adc);
    adc_oneshot_chan_cfg_t cc={.atten=ADC_ATTEN_DB_12,.bitwidth=ADC_BITWIDTH_DEFAULT};
    adc_oneshot_config_channel(adc,ADC_CHANNEL_0,&cc);
    adc_oneshot_config_channel(adc,ADC_CHANNEL_1,&cc);
    while(1){
        int x,y; adc_oneshot_read(adc,ADC_CHANNEL_0,&x); adc_oneshot_read(adc,ADC_CHANNEL_1,&y);
        int16_t pkt[2] = {x,y};
        esp_now_send(BCAST,(uint8_t*)pkt,sizeof(pkt));
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
