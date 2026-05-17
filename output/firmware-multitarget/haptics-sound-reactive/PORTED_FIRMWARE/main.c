// haptics-sound-reactive — ESP-IDF (C3) — amplitude → 2 LED blink.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
#include "driver/gpio.h"
#define L1 7
#define L2 8
void app_main(void){
    gpio_set_direction(L1,GPIO_MODE_OUTPUT); gpio_set_direction(L2,GPIO_MODE_OUTPUT);
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
        int loud = (s/128) > 300;
        gpio_set_level(L1,loud); gpio_set_level(L2,!loud);
    }
}
