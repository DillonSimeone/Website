// microcontroller2pcb-2025 — ESP-IDF port (ESP32-C3)
// Dual motor via DRV8833 + I2S mic + SSD1306 OLED + WS2812×10.

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#include "driver/gpio.h"

#define M1A 0
#define M1B 1
#define M2A 2
#define M2B 3

static void motor_pwm_init(void) {
    ledc_timer_config_t t = {.speed_mode=LEDC_LOW_SPEED_MODE,.duty_resolution=LEDC_TIMER_8_BIT,
        .timer_num=LEDC_TIMER_0,.freq_hz=20000,.clk_cfg=LEDC_AUTO_CLK};
    ledc_timer_config(&t);
    const gpio_num_t pins[] = {M1A,M1B,M2A,M2B};
    for (int i = 0; i < 4; i++) {
        ledc_channel_config_t c = {.gpio_num=pins[i],.speed_mode=LEDC_LOW_SPEED_MODE,
            .channel=i,.timer_sel=LEDC_TIMER_0,.duty=0,.hpoint=0};
        ledc_channel_config(&c);
    }
}
static void motor_set(int ch, uint8_t duty) {
    ledc_set_duty(LEDC_LOW_SPEED_MODE, ch, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, ch);
}

void app_main(void) {
    motor_pwm_init();
    while (1) {
        motor_set(0, 200); motor_set(1, 0);
        motor_set(2, 200); motor_set(3, 0);
        vTaskDelay(pdMS_TO_TICKS(2000));
        motor_set(0, 0); motor_set(1, 200);
        motor_set(2, 0); motor_set(3, 200);
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}
