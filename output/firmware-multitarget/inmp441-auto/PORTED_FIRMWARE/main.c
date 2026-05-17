// inmp441-auto — ESP-IDF (C3) — auto-detect I2S pin permutation.
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
static const int PINS[] = {0,1,2,3,4,5,6,7};
static int try_pins(int bclk,int ws,int din){
    i2s_chan_handle_t rx;
    i2s_chan_config_t cc=I2S_CHANNEL_DEFAULT_CONFIG(0,I2S_ROLE_MASTER);
    i2s_new_channel(&cc,NULL,&rx);
    i2s_std_config_t sc={.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg=I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_MONO),
        .gpio_cfg={.bclk=bclk,.ws=ws,.din=din,.mclk=I2S_GPIO_UNUSED}};
    if(i2s_channel_init_std_mode(rx,&sc)!=ESP_OK){i2s_del_channel(rx); return 0;}
    i2s_channel_enable(rx);
    int32_t b[64]; size_t br; int64_t s=0;
    i2s_channel_read(rx,b,sizeof(b),&br,500);
    for(int i=0;i<64;i++) s+=abs(b[i]>>14);
    i2s_channel_disable(rx); i2s_del_channel(rx);
    return s > 100;
}
void app_main(void){
    for(int a=0;a<8;a++)for(int b=0;b<8;b++)for(int c=0;c<8;c++){
        if(a==b||a==c||b==c)continue;
        if(try_pins(PINS[a],PINS[b],PINS[c]))
            printf("FOUND bclk=%d ws=%d din=%d\n",PINS[a],PINS[b],PINS[c]);
    }
}
