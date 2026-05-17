// fuel-rods-redesign — ESP-IDF (C3) — INA219 + MQTT + 3 WS2812.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "mqtt_client.h"
#include "driver/i2c_master.h"
#include "nvs_flash.h"
static esp_mqtt_client_handle_t mqtt;
void app_main(void){
    nvs_flash_init(); esp_netif_init(); esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT(); esp_wifi_init(&c);
    wifi_config_t wc={.sta={.ssid="ssid",.password="pw"}};
    esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_set_config(WIFI_IF_STA,&wc);
    esp_wifi_start(); esp_wifi_connect();
    esp_mqtt_client_config_t mc = {.broker.address.uri = "mqtt://broker"};
    mqtt = esp_mqtt_client_init(&mc); esp_mqtt_client_start(mqtt);
    while(1){
        // i2c read INA219 voltage/current, mqtt publish
        esp_mqtt_client_publish(mqtt, "fuelrods/v", "12.0", 0, 1, 0);
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}
