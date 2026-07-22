#include <Arduino.h>
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

const unsigned long ADC_INTERVAL_MS = 10;     // Sample ADC & update PWM every 10ms (100 Hz)
const unsigned long DISPLAY_INTERVAL_MS = 100; // Update OLED telemetry every 100ms (10 Hz)

void setup() {
    Serial.begin(115200);

    // Initialize ADC controls (GPIO 26, 27, 28)
    adcControls.begin();

    // Initialize OLED Display (GPIO 4 SDA, GPIO 5 SCL)
    if (!displayMgr.begin()) {
        Serial.println(F("[ERROR] SSD1306 OLED initialization failed!"));
    } else {
        Serial.println(F("[INFO] SSD1306 OLED initialized successfully."));
    }

    // Initialize Hardware PWM on GPIO 15 (2mA drive strength, 40kHz default)
    signalGen.begin();
    signalGen.setParameters(adcControls.getCarrierFreqHz(), adcControls.getDriveLevelPercent());

    Serial.println(F("[READY] Ultrasonic Haptic Display Array Firmware active."));
}

void loop() {
    unsigned long currentMs = millis();
    uint32_t currentMicros = micros();

    // 1. High-frequency non-blocking modulation chopper (Microsecond timing)
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

        displayMgr.render(
            adcControls.getCarrierFreqKHz(),
            adcControls.getModFreqHz(),
            adcControls.getDriveLevelPercent()
        );
    }
}
