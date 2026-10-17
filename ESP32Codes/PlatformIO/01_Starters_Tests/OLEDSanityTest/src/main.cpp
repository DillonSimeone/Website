#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1

struct PinPair {
    int sda;
    int scl;
    const char* label;
};

// Candidate pin pairs to test
PinPair testPairs[] = {
    {0, 1, "GP0=SDA, GP1=SCL (Normal)"},
    {1, 0, "GP1=SDA, GP0=SCL (Swapped)"},
    {4, 5, "GP4=SDA, GP5=SCL (Standard Pico)"},
    {5, 4, "GP5=SDA, GP4=SCL (Standard Pico Swapped)"},
    {2, 3, "GP2=SDA, GP3=SCL"},
    {3, 2, "GP3=SDA, GP2=SCL (Swapped)"}
};

const int NUM_PAIRS = sizeof(testPairs) / sizeof(testPairs[0]);

PinName getPinName(int gpio) {
    switch (gpio) {
        case 0: return p0;
        case 1: return p1;
        case 2: return p2;
        case 3: return p3;
        case 4: return p4;
        case 5: return p5;
        default: return digitalPinToPinName(gpio);
    }
}

Adafruit_SSD1306* activeDisplay = nullptr;
int winningSDA = -1;
int winningSCL = -1;
uint8_t winningAddr = 0;
uint32_t frameCount = 0;

void setup() {
    Serial.begin(115200);

    unsigned long start = millis();
    while (!Serial && (millis() - start < 2500)) {
        delay(10);
    }

    Serial.println(F("\n==============================================="));
    Serial.println(F("  RP2040 OLED SWAP & PIN PROBER SANITY TEST"));
    Serial.println(F("===============================================\n"));

    Serial.println(F("Testing all candidate pin pairs for I2C ACK...\n"));

    for (int i = 0; i < NUM_PAIRS; i++) {
        int sda = testPairs[i].sda;
        int scl = testPairs[i].scl;

        Serial.print(F("--> Testing Pin Pair ["));
        Serial.print(testPairs[i].label);
        Serial.print(F("]... "));

        // Instantiate MbedI2C dynamically for this pin pair
        arduino::MbedI2C tempWire(getPinName(sda), getPinName(scl));
        tempWire.begin();

        // Probe 0x3C and 0x3D
        uint8_t targetAddr = 0;
        
        tempWire.beginTransmission(0x3C);
        if (tempWire.endTransmission() == 0) {
            targetAddr = 0x3C;
        } else {
            tempWire.beginTransmission(0x3D);
            if (tempWire.endTransmission() == 0) {
                targetAddr = 0x3D;
            }
        }

        if (targetAddr != 0) {
            Serial.print(F(">>> ACK FOUND at 0x"));
            Serial.println(targetAddr, HEX);

            // Attempt SSD1306 init
            arduino::MbedI2C* winWire = new arduino::MbedI2C(getPinName(sda), getPinName(scl));
            winWire->begin();

            Adafruit_SSD1306* disp = new Adafruit_SSD1306(SCREEN_WIDTH, SCREEN_HEIGHT, winWire, OLED_RESET);
            if (disp->begin(SSD1306_SWITCHCAPVCC, targetAddr)) {
                activeDisplay = disp;
                winningSDA = sda;
                winningSCL = scl;
                winningAddr = targetAddr;
                Serial.println(F("    >>> SUCCESS! SSD1306 Initialized!"));
                break;
            } else {
                Serial.println(F("    >>> ACK received but SSD1306 init failed."));
            }
        } else {
            Serial.println(F("No ACK."));
        }
    }

    Serial.println(F("\n==============================================="));
    if (activeDisplay != nullptr) {
        Serial.print(F("WINNING CONFIG: SDA=GP"));
        Serial.print(winningSDA);
        Serial.print(F(", SCL=GP"));
        Serial.print(winningSCL);
        Serial.print(F(" @ 0x"));
        Serial.println(winningAddr, HEX);
        Serial.println(F("===============================================\n"));

        activeDisplay->clearDisplay();
        activeDisplay->setTextColor(SSD1306_WHITE);
        activeDisplay->setTextSize(1);
        activeDisplay->setCursor(0, 0);
        activeDisplay->println(F("OLED FOUND!"));
        activeDisplay->println(F("=================="));
        activeDisplay->print(F("SDA: GP"));
        activeDisplay->println(winningSDA);
        activeDisplay->print(F("SCL: GP"));
        activeDisplay->println(winningSCL);
        activeDisplay->print(F("ADDR: 0x"));
        activeDisplay->println(winningAddr, HEX);
        activeDisplay->display();
    } else {
        Serial.println(F("RESULT: NO OLED DISPLAY DETECTED ON ANY TESTED PINS!"));
        Serial.println(F("Troubleshooting Checklist:"));
        Serial.println(F("1. Is OLED VCC connected to 3.3V (or 5V if 5V-only module)?"));
        Serial.println(F("2. Is OLED GND connected to RP2040 GND?"));
        Serial.println(F("3. Are SDA/SCL wires plugged into Pads 0 & 1 or Pads 4 & 5?"));
        Serial.println(F("===============================================\n"));
    }
}

void loop() {
    frameCount++;

    if (activeDisplay != nullptr) {
        activeDisplay->clearDisplay();

        activeDisplay->setTextSize(1);
        activeDisplay->setTextColor(SSD1306_WHITE);
        activeDisplay->setCursor(10, 2);
        activeDisplay->println(F("OLED SANITY TEST"));

        activeDisplay->drawFastHLine(0, 12, 128, SSD1306_WHITE);

        activeDisplay->setCursor(0, 18);
        activeDisplay->print(F("Working: "));
        activeDisplay->println(F("YES!"));

        activeDisplay->setCursor(0, 30);
        activeDisplay->print(F("SDA=GP"));
        activeDisplay->print(winningSDA);
        activeDisplay->print(F("  SCL=GP"));
        activeDisplay->println(winningSCL);

        activeDisplay->setCursor(0, 42);
        activeDisplay->print(F("Frame:   "));
        activeDisplay->println(frameCount);

        int boxX = (frameCount * 4) % 110;
        activeDisplay->drawRect(boxX, 54, 18, 8, SSD1306_WHITE);

        activeDisplay->display();
    }

    if (frameCount % 10 == 0) {
        Serial.print(F("[SANITY MONITOR] Frame: "));
        Serial.print(frameCount);
        Serial.print(F(" | Active OLED: "));
        if (activeDisplay != nullptr) {
            Serial.print(F("YES (SDA=GP"));
            Serial.print(winningSDA);
            Serial.print(F(", SCL=GP"));
            Serial.print(winningSCL);
            Serial.println(F(")"));
        } else {
            Serial.println(F("NO (Check Power & Wiring)"));
        }
    }

    delay(100);
}
