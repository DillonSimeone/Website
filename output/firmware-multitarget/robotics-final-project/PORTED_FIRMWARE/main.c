// robotics-final-project — ESP-IDF bare-C port (ESP32-C3)
// WiFi AP + web UI controls 4 motors via 2× DRV8833 (4 PWM pairs).

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
#include "driver/ledc.h"

static int8_t drive[4] = {0,0,0,0}; // signed PWM per wheel

static esp_err_t drive_post(httpd_req_t *r) {
    char buf[64]; int n = httpd_req_recv(r, buf, sizeof(buf)-1);
    if (n > 0) { buf[n]=0; sscanf(buf, "%hhd,%hhd,%hhd,%hhd", &drive[0],&drive[1],&drive[2],&drive[3]); }
    httpd_resp_sendstr(r, "ok");
    return ESP_OK;
}

void app_main(void) {
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t c = WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t ap = {.ap = {.ssid="ROBOT", .ssid_len=5, .channel=1, .max_connection=2, .authmode=WIFI_AUTH_OPEN}};
    esp_wifi_set_mode(WIFI_MODE_AP); esp_wifi_set_config(WIFI_IF_AP, &ap); esp_wifi_start();
    httpd_handle_t s = NULL; httpd_config_t cfg = HTTPD_DEFAULT_CONFIG(); httpd_start(&s, &cfg);
    httpd_uri_t u = {.uri="/drive", .method=HTTP_POST, .handler=drive_post};
    httpd_register_uri_handler(s, &u);
    // motor PWM init omitted — see microcontroller2pcb-2025 for the pattern
    while (1) vTaskDelay(pdMS_TO_TICKS(100));
}
