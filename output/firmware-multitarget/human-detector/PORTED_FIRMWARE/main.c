// human-detector — ESP-IDF bare-C port (ESP32-C3)
// LD2410 radar over UART + HC-SR04 + SSD1306 OLED.

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include "driver/gpio.h"

#define RADAR_UART UART_NUM_1
#define RADAR_RX 4
#define RADAR_TX 5
#define US_TRIG 8
#define US_ECHO 9

static void radar_init(void) {
    uart_config_t c = {.baud_rate=256000,.data_bits=UART_DATA_8_BITS,.parity=UART_PARITY_DISABLE,
        .stop_bits=UART_STOP_BITS_1,.flow_ctrl=UART_HW_FLOWCTRL_DISABLE,.source_clk=UART_SCLK_DEFAULT};
    uart_driver_install(RADAR_UART, 256, 0, 0, NULL, 0);
    uart_param_config(RADAR_UART, &c);
    uart_set_pin(RADAR_UART, RADAR_TX, RADAR_RX, -1, -1);
}

void app_main(void) {
    radar_init();
    gpio_set_direction(US_TRIG, GPIO_MODE_OUTPUT);
    gpio_set_direction(US_ECHO, GPIO_MODE_INPUT);
    uint8_t buf[64];
    while (1) {
        int n = uart_read_bytes(RADAR_UART, buf, sizeof(buf), pdMS_TO_TICKS(100));
        for (int i = 0; i + 6 < n; i++) {
            // LD2410 target frame: F4 F3 F2 F1 ... F8 F7 F6 F5
            if (buf[i]==0xF4 && buf[i+1]==0xF3 && buf[i+2]==0xF2 && buf[i+3]==0xF1) {
                uint8_t state = buf[i+8];
                uint16_t mov_dist = buf[i+9] | (buf[i+10]<<8);
                printf("state=%u mov_dist=%u\n", state, mov_dist);
            }
        }
    }
}
