// doorbell-follower — ESP-IDF (C3) — receive ESP-NOW, blink LEDs + buzz motor.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#define LED_PIN 7
#define MOTOR_PIN 8
static volatile int alert = 0;
static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len){
    if(len > 0 && data[0] == 'R') alert = 1;
}
void app_main(void){
    nvs_flash_init();
    esp_netif_init(); esp_event_loop_create_default();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
    esp_now_init(); esp_now_register_recv_cb(on_recv);
    gpio_set_direction(MOTOR_PIN, GPIO_MODE_OUTPUT);
    while(1){
        if(alert){
            for(int i=0;i<10;i++){gpio_set_level(MOTOR_PIN,1); vTaskDelay(pdMS_TO_TICKS(150));
                                  gpio_set_level(MOTOR_PIN,0); vTaskDelay(pdMS_TO_TICKS(150));}
            alert = 0;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
