#include "DisplayManager.h"

DisplayManager::DisplayManager()
    : m_wire0(p0, p1),
      m_display(SCREEN_WIDTH, SCREEN_HEIGHT, &m_wire0, OLED_RESET),
      m_initialized(false),
      m_detectedAddress(0) {}

void DisplayManager::scanI2CBus() {
    Serial.println(F("\n--- Scanning I2C Bus on Wire0 (SDA=GP0, SCL=GP1) ---"));
    uint8_t count = 0;
    for (uint8_t address = 1; address < 127; address++) {
        m_wire0.beginTransmission(address);
        uint8_t error = m_wire0.endTransmission();
        if (error == 0) {
            Serial.print(F("[I2C FOUND] Device detected at 0x"));
            if (address < 16) Serial.print(F("0"));
            Serial.println(address, HEX);
            count++;
        }
    }
    if (count == 0) {
        Serial.println(F("[I2C WARNING] No devices found on Wire0 (GP0/GP1)."));
    }
    Serial.println(F("---------------------------------------------------\n"));
}

bool DisplayManager::begin() {
    // Initialize MbedI2C on GPIO 0 (SDA) and GPIO 1 (SCL)
    m_wire0.begin();

    // Scan bus and report detected addresses to Serial
    scanI2CBus();

    // Try primary address 0x3C
    if (m_display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        m_initialized = true;
        m_detectedAddress = 0x3C;
    } 
    // Fallback to secondary address 0x3D
    else if (m_display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
        m_initialized = true;
        m_detectedAddress = 0x3D;
    } else {
        m_initialized = false;
        m_detectedAddress = 0;
        return false;
    }

    m_display.clearDisplay();
    m_display.setTextColor(SSD1306_WHITE);
    m_display.setTextSize(1);
    m_display.setCursor(0, 0);
    m_display.println(F("ULTRASONIC HAPTIC"));
    m_display.println(F("Initializing..."));
    m_display.display();
    return true;
}

void DisplayManager::render(float carrierKHz, float modHz, float drivePercent) {
    if (!m_initialized) return;

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
