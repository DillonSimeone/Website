// image-scroll — ESP-IDF (ESP32-S3) — image stored in PSRAM, scrolled on TFT.
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_ops.h"
#define W 320
#define H 170
static uint16_t *img_psram;
void app_main(void){
    img_psram = heap_caps_malloc(W*H*2, MALLOC_CAP_SPIRAM);
    if(!img_psram){ printf("no PSRAM\n"); return; }
    for(int i = 0; i < W*H; i++) img_psram[i] = (i&0xFF) << 8;
    // panel init omitted (see arduino-gfx-demo for the i80 pattern)
    int scroll = 0;
    while(1){
        // esp_lcd_panel_draw_bitmap(panel, 0, 0, W, H, &img_psram[(scroll%H)*W]);
        scroll++; vTaskDelay(pdMS_TO_TICKS(30));
    }
}
