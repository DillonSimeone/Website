// led-brace — ESP-IDF (C3) — BLE-MIDI + IMU + mic + LEDs + motors (skeleton).
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nimble/nimble_port.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "nvs_flash.h"
static const ble_uuid128_t midi_svc = BLE_UUID128_INIT(0x00,0xC7,0xC4,0x4E,0xE3,0x6C,0x51,0xA7,0x33,0x4B,0xE8,0xED,0x5A,0x0E,0xB8,0x03);
static int dummy(uint16_t h,uint16_t a,struct ble_gatt_access_ctxt*c,void*v){return 0;}
static const struct ble_gatt_chr_def chrs[] = {
    {.uuid = &(ble_uuid_any_t){.u128 = BLE_UUID128_INIT(0xF3,0x6B,0x10,0x9D,0x66,0xF2,0xA9,0xA1,0x12,0x41,0x68,0x38,0xDB,0xE5,0x72,0x77)}.u,
     .access_cb = dummy, .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE_NO_RSP | BLE_GATT_CHR_F_NOTIFY},
    {0}};
static const struct ble_gatt_svc_def svcs[] = {{.type=BLE_GATT_SVC_TYPE_PRIMARY, .uuid=&midi_svc.u, .characteristics=chrs},{0}};
void app_main(void){
    nvs_flash_init();
    nimble_port_init();
    ble_svc_gap_init(); ble_svc_gatt_init();
    ble_gatts_count_cfg(svcs); ble_gatts_add_svcs(svcs);
    ble_svc_gap_device_name_set("LEDBrace");
    nimble_port_run();
}
