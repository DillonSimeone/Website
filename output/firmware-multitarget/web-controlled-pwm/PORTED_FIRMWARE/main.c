// web-controlled-pwm — ESP-IDF (C3) — softAP + slider → LEDC duty.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "driver/ledc.h"
#include "nvs_flash.h"
static esp_err_t root(httpd_req_t*r){
    httpd_resp_sendstr(r,"<input type=range min=0 max=255 onchange=fetch('/p?v='+this.value)>");
    return ESP_OK;
}
static esp_err_t setp(httpd_req_t*r){
    char q[16]; httpd_req_get_url_query_str(r,q,sizeof(q));
    char v[4]; httpd_query_key_value(q,"v",v,sizeof(v));
    ledc_set_duty(LEDC_LOW_SPEED_MODE,0,atoi(v)); ledc_update_duty(LEDC_LOW_SPEED_MODE,0);
    httpd_resp_sendstr(r,"ok"); return ESP_OK;
}
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t ap={.ap={.ssid="PWM",.ssid_len=3,.channel=1,.max_connection=2,.authmode=WIFI_AUTH_OPEN}};
    esp_wifi_set_mode(WIFI_MODE_AP); esp_wifi_set_config(WIFI_IF_AP,&ap); esp_wifi_start();
    ledc_timer_config_t t={.speed_mode=LEDC_LOW_SPEED_MODE,.duty_resolution=LEDC_TIMER_8_BIT,
        .timer_num=LEDC_TIMER_0,.freq_hz=20000,.clk_cfg=LEDC_AUTO_CLK};
    ledc_timer_config(&t);
    ledc_channel_config_t ch={.gpio_num=8,.speed_mode=LEDC_LOW_SPEED_MODE,.channel=0,.timer_sel=LEDC_TIMER_0,.duty=0,.hpoint=0};
    ledc_channel_config(&ch);
    httpd_handle_t s=NULL; httpd_config_t cfg=HTTPD_DEFAULT_CONFIG(); httpd_start(&s,&cfg);
    httpd_uri_t u1={.uri="/",.method=HTTP_GET,.handler=root}; httpd_register_uri_handler(s,&u1);
    httpd_uri_t u2={.uri="/p",.method=HTTP_GET,.handler=setp}; httpd_register_uri_handler(s,&u2);
    while(1) vTaskDelay(pdMS_TO_TICKS(100));
}
