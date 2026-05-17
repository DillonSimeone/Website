// haptic-control-inmp441 — ESP-IDF (C3) — mic→FFT→motor PWM + WS2812 + WiFi AP.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_std.h"
#include "driver/ledc.h"
#include "esp_dsp.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#define FFT_N 256
static float in[FFT_N*2];
void app_main(void){
    nvs_flash_init();
    i2s_chan_handle_t rx; i2s_chan_config_t cc=I2S_CHANNEL_DEFAULT_CONFIG(0,I2S_ROLE_MASTER);
    i2s_new_channel(&cc,NULL,&rx);
    i2s_std_config_t sc={.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg=I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_MONO),
        .gpio_cfg={.bclk=4,.ws=5,.din=6,.mclk=I2S_GPIO_UNUSED}};
    i2s_channel_init_std_mode(rx,&sc); i2s_channel_enable(rx);
    dsps_fft2r_init_fc32(NULL,FFT_N);
    int32_t buf[FFT_N]; size_t br;
    while(1){
        i2s_channel_read(rx,buf,sizeof(buf),&br,200);
        for(int i=0;i<FFT_N;i++){in[i*2]=(float)(buf[i]>>14);in[i*2+1]=0;}
        dsps_fft2r_fc32(in,FFT_N);
        // Drive LEDC duty proportional to low-band magnitude (omitted for brevity)
    }
}
