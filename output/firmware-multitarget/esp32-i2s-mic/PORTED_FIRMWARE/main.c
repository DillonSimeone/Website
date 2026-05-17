// esp32-i2s-mic — ESP-IDF (C3) — 1024-pt FFT, INMP441, WS2812 bars.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
#include "esp_dsp.h"
#define N 1024
static float in[N*2];
void app_main(void){
    i2s_chan_handle_t rx;
    i2s_chan_config_t cc=I2S_CHANNEL_DEFAULT_CONFIG(0,I2S_ROLE_MASTER);
    i2s_new_channel(&cc,NULL,&rx);
    i2s_std_config_t sc={.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg=I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_MONO),
        .gpio_cfg={.bclk=4,.ws=5,.din=6,.mclk=I2S_GPIO_UNUSED}};
    i2s_channel_init_std_mode(rx,&sc); i2s_channel_enable(rx);
    dsps_fft2r_init_fc32(NULL,N);
    int32_t buf[N]; size_t br;
    while(1){
        i2s_channel_read(rx,buf,sizeof(buf),&br,500);
        for(int i=0;i<N;i++){in[i*2]=(float)(buf[i]>>14);in[i*2+1]=0;}
        dsps_fft2r_fc32(in,N);
        dsps_bit_rev_fc32(in,N);
        // 64 mag bins → LED strip (omitted)
    }
}
