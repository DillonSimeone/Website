// haptic-leader — ESP-IDF (C3) — INMP441 amplitude → ESP-NOW broadcast haptic level.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "nvs_flash.h"
static const uint8_t BCAST[]={0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init();
    esp_now_peer_info_t p={.channel=0,.ifidx=WIFI_IF_STA}; memcpy(p.peer_addr,BCAST,6); esp_now_add_peer(&p);
    i2s_chan_handle_t rx;
    i2s_chan_config_t cc=I2S_CHANNEL_DEFAULT_CONFIG(0,I2S_ROLE_MASTER);
    i2s_new_channel(&cc,NULL,&rx);
    i2s_std_config_t sc={.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg=I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_MONO),
        .gpio_cfg={.bclk=4,.ws=5,.din=6,.mclk=I2S_GPIO_UNUSED}};
    i2s_channel_init_std_mode(rx,&sc); i2s_channel_enable(rx);
    int32_t b[128]; size_t br;
    while(1){
        i2s_channel_read(rx,b,sizeof(b),&br,200);
        int64_t s=0; for(int i=0;i<128;i++) s+=abs(b[i]>>14);
        uint8_t lvl = (s/128) > 255 ? 255 : (uint8_t)(s/128);
        esp_now_send(BCAST,&lvl,1);
    }
}
