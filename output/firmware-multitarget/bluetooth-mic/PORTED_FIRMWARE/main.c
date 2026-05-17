// bluetooth-mic — ESP-IDF bare-C (ESP32 classic). HFP-HF mic sink (skeleton).
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_hf_client_api.h"
#include "nvs_flash.h"

static void hf_cb(esp_hf_client_cb_event_t e, esp_hf_client_cb_param_t *p) {}

void app_main(void) {
    nvs_flash_init();
    esp_bt_controller_config_t bcfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_bt_controller_init(&bcfg);
    esp_bt_controller_enable(ESP_BT_MODE_CLASSIC_BT);
    esp_bluedroid_init(); esp_bluedroid_enable();
    esp_hf_client_register_callback(hf_cb);
    esp_hf_client_init();
    // Pairing/discovery handled via SDP API — omitted for brevity.
}
