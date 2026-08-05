#include <Arduino.h>
#include "Config.h"
#include "AdcControls.h"
#include "SignalGenerator.h"
#include "DisplayManager.h"

// Hardware Interface Objects
AdcControls adcControls;
SignalGenerator signalGen;
DisplayManager displayMgr;

// Non-blocking loop timing tracking
unsigned long lastAdcUpdateMs = 0;
unsigned long lastDisplayUpdateMs = 0;
unsigned long lastSerialLogMs = 0;

const unsigned long ADC_INTERVAL_MS = 10;       // Sample ADC & update PWM every 10ms (100 Hz)
const unsigned long DISPLAY_INTERVAL_MS = 100;   // Update OLED telemetry every 100ms (10 Hz)
const unsigned long SERIAL_LOG_INTERVAL_MS = 500; // Print Serial Telemetry every 500ms (2 Hz)

void setup() {
    Serial.begin(115200);

    // Give USB Serial terminal 2 seconds to attach after boot
    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 2000)) {
        delay(10);
    }

    Serial.println(F("\n======================================================="));
    Serial.println(F("  RP2040-Zero Ultrasonic Haptic Display Demo Array"));
    Serial.println(F("======================================================="));
#if BENCH_TEST
    Serial.println(F("[MODE] BENCH_TEST — continuous carrier, 25-50% duty, 12mA drive"));
#else
    Serial.println(F("[MODE] Normal — AM envelope, 1-20% duty, 2mA drive"));
#endif
    Serial.println();

    // Initialize ADC controls (GPIO 26, 27, 28)
    adcControls.begin();
    Serial.println(F("[INFO] ADC Potentiometers initialized on GP26, GP27, GP28."));

    // Initialize Hardware PWM on GPIO 15 (40 kHz default carrier)
    signalGen.begin();
    signalGen.setParameters(adcControls.getCarrierFreqHz(), adcControls.getDriveLevelPercent());
    Serial.println(F("[INFO] Hardware PWM initialized on GPIO 15."));

    // Initialize OLED Display (GPIO 0 SDA, GPIO 1 SCL) with I2C Scanner
    if (!displayMgr.begin()) {
        Serial.println(F("[WARNING] SSD1306 OLED display NOT found on I2C bus!"));
        Serial.println(F("[INFO] System running in Serial Telemetry mode. Signal generation is ACTIVE."));
    } else {
        Serial.print(F("[SUCCESS] SSD1306 OLED initialized at address 0x"));
        Serial.println(displayMgr.getDetectedAddress(), HEX);
    }

    Serial.println(F("\n[READY] Firmware active! Signal generator running.\n"));
}

void loop() {
    unsigned long currentMs = millis();
    uint32_t currentMicros = micros();

    // 1. AM envelope chopper (disabled in BENCH_TEST — carrier runs continuously)
    signalGen.processModulation(currentMicros, adcControls.getModFreqHz());

    // 2. Periodic ADC sampling & smooth PWM parameter updates (100 Hz)
    if (currentMs - lastAdcUpdateMs >= ADC_INTERVAL_MS) {
        lastAdcUpdateMs = currentMs;

        adcControls.update();
        signalGen.setParameters(adcControls.getCarrierFreqHz(), adcControls.getDriveLevelPercent());
    }

    // 3. Periodic OLED Telemetry Rendering (10 Hz)
    if (currentMs - lastDisplayUpdateMs >= DISPLAY_INTERVAL_MS) {
        lastDisplayUpdateMs = currentMs;

        if (displayMgr.isConnected()) {
            displayMgr.render(
                adcControls.getCarrierFreqKHz(),
                adcControls.getModFreqHz(),
                adcControls.getDriveLevelPercent()
            );
        }
    }

    // 4. Periodic USB Serial Telemetry Logging (2 Hz)
    if (currentMs - lastSerialLogMs >= SERIAL_LOG_INTERVAL_MS) {
        lastSerialLogMs = currentMs;

        Serial.print(F("[TELEMETRY] Carrier: "));
        Serial.print(adcControls.getCarrierFreqKHz(), 2);
        Serial.print(F(" kHz | Mod Rate: "));
        Serial.print(adcControls.getModFreqHz(), 1);
        Serial.print(F(" Hz | Drive Level: "));
        Serial.print(adcControls.getDriveLevelPercent(), 1);
        Serial.print(F(" %"));
#if BENCH_TEST
        Serial.print(F(" | AM: OFF (bench)"));
#endif
        Serial.print(F(" | OLED: "));
        if (displayMgr.isConnected()) {
            Serial.print(F("OK (0x"));
            Serial.print(displayMgr.getDetectedAddress(), HEX);
            Serial.println(F(")"));
        } else {
            Serial.println(F("NOT CONNECTED"));
        }
    }
}
