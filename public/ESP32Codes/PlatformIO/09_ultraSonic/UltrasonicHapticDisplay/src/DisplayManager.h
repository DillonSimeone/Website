#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

/**
 * @brief Manages 0.96" SSD1306 OLED display updates at 10 Hz over I2C0.
 */
class DisplayManager {
public:
    static constexpr uint8_t PIN_SDA = 4; // GPIO 4 (I2C0 SDA)
    static constexpr uint8_t PIN_SCL = 5; // GPIO 5 (I2C0 SCL)
    static constexpr uint8_t SCREEN_WIDTH = 128;
    static constexpr uint8_t SCREEN_HEIGHT = 64;
    static constexpr uint8_t OLED_RESET = -1;
    static constexpr uint8_t I2C_ADDRESS = 0x3C;

    DisplayManager();

    bool begin();
    void render(float carrierKHz, float modHz, float drivePercent);

private:
    Adafruit_SSD1306 m_display;
};

#endif // DISPLAY_MANAGER_H
