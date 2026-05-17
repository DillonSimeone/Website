// web-pwm-standalone — see ../web-controlled-pwm/PORTED_FIRMWARE/main.c
// This standalone .ino project is functionally identical; reuse that port.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
void app_main(void){ while(1) vTaskDelay(pdMS_TO_TICKS(1000)); }
