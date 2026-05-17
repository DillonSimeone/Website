// haptic-follower-simple — ESP-IDF (C3) — ESP-NOW recv → motor PWM.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "driver/ledc.h"
#include "nvs_flash.h"
#define MOTOR_PIN 8
static volatile uint8_t duty = 0;
static void on_recv(const esp_now_recv_info_t*i,const uint8_t*d,int n){ if(n>0) duty = d[0]; }
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init(); esp_now_register_recv_cb(on_recv);
    ledc_timer_config_t t={.speed_mode=LEDC_LOW_SPEED_MODE,.duty_resolution=LEDC_TIMER_8_BIT,
        .timer_num=LEDC_TIMER_0,.freq_hz=20000,.clk_cfg=LEDC_AUTO_CLK};
    ledc_timer_config(&t);
    ledc_channel_config_t ch={.gpio_num=MOTOR_PIN,.speed_mode=LEDC_LOW_SPEED_MODE,
        .channel=0,.timer_sel=LEDC_TIMER_0,.duty=0,.hpoint=0};
    ledc_channel_config(&ch);
    while(1){
        ledc_set_duty(LEDC_LOW_SPEED_MODE,0,duty);
        ledc_update_duty(LEDC_LOW_SPEED_MODE,0);
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
