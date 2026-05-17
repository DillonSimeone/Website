// arduino-gfx-demo — ESP-IDF (ESP32-S3) — ST7789 8-bit parallel via esp_lcd.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_ops.h"

#define DC 7
#define RD 9
#define WR 8
#define CS 6
#define RST 5
#define DATA_PINS {39,40,41,42,45,46,47,48}

void app_main(void){
    esp_lcd_i80_bus_handle_t bus = NULL;
    int data_pins[] = DATA_PINS;
    esp_lcd_i80_bus_config_t bus_cfg = {.dc_gpio_num=DC,.wr_gpio_num=WR,.clk_src=LCD_CLK_SRC_DEFAULT,
        .data_gpio_nums={data_pins[0],data_pins[1],data_pins[2],data_pins[3],data_pins[4],data_pins[5],data_pins[6],data_pins[7]},
        .bus_width=8,.max_transfer_bytes=320*170*2+8};
    esp_lcd_new_i80_bus(&bus_cfg, &bus);
    esp_lcd_panel_io_handle_t io = NULL;
    esp_lcd_panel_io_i80_config_t io_cfg = {.cs_gpio_num=CS,.pclk_hz=20*1000*1000,
        .trans_queue_depth=10,.dc_levels={.dc_idle_level=0,.dc_cmd_level=0,.dc_dummy_level=0,.dc_data_level=1},
        .lcd_cmd_bits=8,.lcd_param_bits=8};
    esp_lcd_new_panel_io_i80(bus, &io_cfg, &io);
    esp_lcd_panel_handle_t panel = NULL;
    esp_lcd_panel_dev_config_t pcfg = {.reset_gpio_num=RST,.bits_per_pixel=16};
    esp_lcd_new_panel_st7789(io, &pcfg, &panel);
    esp_lcd_panel_reset(panel); esp_lcd_panel_init(panel); esp_lcd_panel_disp_on_off(panel, true);
    uint16_t fb[320] = {0};
    for(int y = 0; y < 170; y++) {
        for(int x = 0; x < 320; x++) fb[x] = ((x+y) & 0x1F) << 11;
        esp_lcd_panel_draw_bitmap(panel, 0, y, 320, y+1, fb);
    }
    while(1) vTaskDelay(pdMS_TO_TICKS(1000));
}
