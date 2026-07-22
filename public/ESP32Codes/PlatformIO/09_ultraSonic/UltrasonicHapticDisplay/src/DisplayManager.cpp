#include "DisplayManager.h"

DisplayManager::DisplayManager()
    : m_display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET) {}

bool DisplayManager::begin() {
    // Initialize Wire I2C (GPIO 4 SDA, GPIO 5 SCL are standard RP2040 I2C0 pins)
    Wire.begin();

    if (!m_display.begin(SSD1306_SWITCHCAPVCC, I2C_ADDRESS)) {
        return false;
    }

    m_display.clearDisplay();
    m_display.setTextColor(SSD1306_WHITE);
    m_display.setTextSize(1);
    m_display.setCursor(0, 0);
    m_display.println("ULTRASONIC HAPTIC");
    m_display.println("Initializing...");
    m_display.display();
    return true;
}

void DisplayManager::render(float carrierKHz, float modHz, float drivePercent) {
    m_display.clearDisplay();

    // Line 1: Header
    m_display.setTextSize(1);
    m_display.setTextColor(SSD1306_WHITE);
    m_display.setCursor(10, 2);
    m_display.println(F("ULTRASONIC HAPTIC"));

    // Header divider line
    m_display.drawFastHLine(0, 13, SCREEN_WIDTH, SSD1306_WHITE);

    // Line 2: Carrier Frequency
    m_display.setCursor(0, 20);
    m_display.print(F("Carrier:   "));
    m_display.print(carrierKHz, 1);
    m_display.println(F(" kHz"));

    // Line 3: Modulation Rate
    m_display.setCursor(0, 34);
    m_display.print(F("Mod Rate:  "));
    m_display.print((int)round(modHz));
    m_display.println(F(" Hz"));

    // Line 4: Drive Level
    m_display.setCursor(0, 48);
    m_display.print(F("Drive Lvl: "));
    m_display.print((int)round(drivePercent));
    m_display.println(F(" %"));

    // Push buffer to display
    m_display.display();
}
