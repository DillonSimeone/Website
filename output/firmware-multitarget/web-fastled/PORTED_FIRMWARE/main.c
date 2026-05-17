// web-fastled — ESP-IDF (C3) — softAP + HTTP UI controlling LED mode.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
static volatile int mode = 0;
static esp_err_t root(httpd_req_t*r){
    httpd_resp_sendstr(r,"<a href=/m?n=0>off</a> <a href=/m?n=1>rainbow</a> <a href=/m?n=2>pulse</a>");
    return ESP_OK;
}
static esp_err_t set(httpd_req_t*r){
    char q[16]; httpd_req_get_url_query_str(r,q,sizeof(q));
    char v[4]; httpd_query_key_value(q,"n",v,sizeof(v)); mode = atoi(v);
    httpd_resp_sendstr(r,"ok"); return ESP_OK;
}
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t ap={.ap={.ssid="LEDs",.ssid_len=4,.channel=1,.max_connection=2,.authmode=WIFI_AUTH_OPEN}};
    esp_wifi_set_mode(WIFI_MODE_AP); esp_wifi_set_config(WIFI_IF_AP,&ap); esp_wifi_start();
    httpd_handle_t s=NULL; httpd_config_t cfg=HTTPD_DEFAULT_CONFIG(); httpd_start(&s,&cfg);
    httpd_uri_t u1={.uri="/",.method=HTTP_GET,.handler=root}; httpd_register_uri_handler(s,&u1);
    httpd_uri_t u2={.uri="/m",.method=HTTP_GET,.handler=set}; httpd_register_uri_handler(s,&u2);
    while(1) vTaskDelay(pdMS_TO_TICKS(100));
}
