#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

/**
 * @brief Manages 0.96" SSD1306 OLED display updates over I2C0 using GPIO 0 (SDA) and GPIO 1 (SCL).
 */
class DisplayManager {
public:
    static constexpr uint8_t PIN_SDA = 0; // GPIO 0 (Pad 0)
    static constexpr uint8_t PIN_SCL = 1; // GPIO 1 (Pad 1)
    static constexpr uint8_t SCREEN_WIDTH = 128;
    static constexpr uint8_t SCREEN_HEIGHT = 64;
    static constexpr uint8_t OLED_RESET = -1;

    DisplayManager();

    bool begin();
    void scanI2CBus();
    void render(float carrierKHz, float modHz, float drivePercent);

    bool isConnected() const { return m_initialized; }
    uint8_t getDetectedAddress() const { return m_detectedAddress; }

private:
    arduino::MbedI2C m_wire0;
    Adafruit_SSD1306 m_display;
    bool m_initialized;
    uint8_t m_detectedAddress;
};

#endif // DISPLAY_MANAGER_H
