#include <Arduino.h>
#include <driver/i2s.h>
#include <Preferences.h>
#include <vector>
#include <algorithm>

/**
 * INMP411 Sanity Test with Auto-Pin Detection
 * 
 * Instructions:
 * 1. Connect VCC and GND.
 * 2. Connect SCK, WS, SD (and optionally L/R) to the pins listed in 'userPins'.
 * 3. Power on. The code will cycle through permutations until it finds a working config.
 */

// Onboard LED Configuration (SuperMini c3 is GPIO 8)
#define LED_PIN         8
#define LED_PWM_CHAN    0
#define LED_PWM_FREQ    5000
#define LED_PWM_RES     8  // 8-bit: 0-255

// Edit this list with the pins you have connected to the mic
int userPins[] = {2, 3, 4, 10}; 
const int numUserPins = sizeof(userPins) / sizeof(userPins[0]);

// SOFT GROUND FEATURE: 
// If you've connected the Mic's GND to a GPIO instead of a GND pin, 
// set that pin number here. Set to -1 if not using.
const int softGroundPin = 5; 

// I2S Configuration
#define SAMPLE_RATE     16000
#define BUFFER_SIZE     256
#define I2S_PORT        I2S_NUM_0

// Preferences for saving config
Preferences prefs;

struct I2SConfig {
    int sck;
    int ws;
    int sd;
    bool valid = false;
};

I2SConfig currentConfig;

void uninstallI2S() {
    i2s_stop(I2S_PORT);
    i2s_driver_uninstall(I2S_PORT);
}

bool initI2S(int sck, int ws, int sd) {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_SIZE,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = sck,
        .ws_io_num = ws,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = sd
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK) return false;
    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK) return false;
    
    i2s_zero_dma_buffer(I2S_PORT);
    return true;
}

bool checkAudioSignal() {
    int16_t samples[BUFFER_SIZE];
    size_t bytesRead;
    
    // Read multiple buffers to be sure
    for (int t = 0; t < 4; t++) {
        i2s_read(I2S_PORT, &samples, sizeof(samples), &bytesRead, 100 / portTICK_PERIOD_MS);
        if (bytesRead == 0) continue;

        long minVal = 32767;
        long maxVal = -32768;
        bool allSame = true;
        int16_t first = samples[0];

        for (int i = 0; i < bytesRead / 2; i++) {
            if (samples[i] != first) allSame = false;
            if (samples[i] < minVal) minVal = samples[i];
            if (samples[i] > maxVal) maxVal = samples[i];
        }

        // if we have variance and it's not just random max/min (like floating pins)
        // Usually, a floating pin might show 0 or -1 consistently.
        // A working mic will show some noise even in silence.
        if (!allSame && (maxVal - minVal) > 10) {
            return true; 
        }
    }
    return false;
}

void saveConfig(int sck, int ws, int sd) {
    prefs.begin("mic_cfg", false);
    prefs.putInt("sck", sck);
    prefs.putInt("ws", ws);
    prefs.putInt("sd", sd);
    prefs.putBool("valid", true);
    prefs.end();
    Serial.println("Config saved to NVS.");
}

bool loadConfig() {
    prefs.begin("mic_cfg", true);
    currentConfig.sck = prefs.getInt("sck", -1);
    currentConfig.ws = prefs.getInt("ws", -1);
    currentConfig.sd = prefs.getInt("sd", -1);
    currentConfig.valid = prefs.getBool("valid", false);
    prefs.end();
    return currentConfig.valid;
}

void updateScanningLED() {
    static unsigned long lastToggle = 0;
    static bool state = false;
    if (millis() - lastToggle > 500) {
        lastToggle = millis();
        state = !state;
        // User says HIGH is OFF, LOW is ON. 
        // In Core 2.x, ledcWrite takes CHANNEL, not PIN.
        ledcWrite(LED_PWM_CHAN, state ? 0 : 255); 
    }
}

void startAutoScan() {
    Serial.println("--- Starting Auto-Pin Scan ---");
    Serial.printf("Candidate pins: ");
    for(int i=0; i<numUserPins; i++) Serial.printf("%d ", userPins[i]);
    Serial.println();

    std::vector<int> p;
    for(int i=0; i<numUserPins; i++) p.push_back(userPins[i]);
    std::sort(p.begin(), p.end());

    int attempt = 0;
    do {
        updateScanningLED();
        // We pick first 3 pins for SCK, WS, SD
        int sck = p[0];
        int ws = p[1];
        int sd = p[2];
        
        // If we have a 4th pin, maybe it's L/R. Let's try driving it LOW then HIGH
        int extra = (numUserPins > 3) ? p[3] : -1;

        int driveLR[] = {0, 1}; // Try LOW then HIGH if extra pin exists
        int driveStates = (extra != -1) ? 2 : 1;

        for (int d = 0; d < driveStates; d++) {
            if (extra != -1) {
                pinMode(extra, OUTPUT);
                digitalWrite(extra, driveLR[d]);
                Serial.printf("Attempt %d: SCK=%d, WS=%d, SD=%d (L/R pin %d = %s)\n", 
                    ++attempt, sck, ws, sd, extra, driveLR[d] ? "HIGH" : "LOW");
            } else {
                Serial.printf("Attempt %d: SCK=%d, WS=%d, SD=%d\n", ++attempt, sck, ws, sd);
            }

            if (initI2S(sck, ws, sd)) {
                delay(100); // Wait for settle
                if (checkAudioSignal()) {
                    Serial.println(">>> SUCCESS! Mic detected.");
                    ledcWrite(LED_PWM_CHAN, 255); // Turn OFF (Inverted logic)
                    saveConfig(sck, ws, sd);
                    currentConfig.sck = sck;
                    currentConfig.ws = ws;
                    currentConfig.sd = sd;
                    currentConfig.valid = true;
                    return;
                }
                uninstallI2S();
            }
            updateScanningLED();
        }

    } while (std::next_permutation(p.begin(), p.end()));

    Serial.println("!!! Auto-scan failed. Check connections and pin list.");
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Give serial monitor time
    Serial.println("\n\nINMP411 Sanity Test");

    // Initialize LED PWM (Core 2.x legacy style)
    ledcSetup(LED_PWM_CHAN, LED_PWM_FREQ, LED_PWM_RES);
    ledcAttachPin(LED_PIN, LED_PWM_CHAN);
    ledcWrite(LED_PWM_CHAN, 255); // Start with LED OFF (Inverted)

    // Handle Soft Ground
    if (softGroundPin != -1) {
        pinMode(softGroundPin, OUTPUT);
        digitalWrite(softGroundPin, LOW);
        Serial.printf("Soft Ground initialized on Pin %d\n", softGroundPin);
    }

    if (loadConfig()) {
        Serial.printf("Loaded config: SCK=%d, WS=%d, SD=%d\n", currentConfig.sck, currentConfig.ws, currentConfig.sd);
        if (initI2S(currentConfig.sck, currentConfig.ws, currentConfig.sd)) {
            delay(100);
            if (checkAudioSignal()) {
                Serial.println("Mic verified working with saved config.");
            } else {
                Serial.println("Saved config failed verification. Retrying scan...");
                uninstallI2S();
                startAutoScan();
            }
        }
    } else {
        startAutoScan();
    }
    
    if (currentConfig.valid) {
        Serial.println("System Ready. Streaming magnitude...");
    }
}

void loop() {
    if (!currentConfig.valid) {
        delay(1000);
        return;
    }

    int16_t samples[BUFFER_SIZE];
    size_t bytesRead;
    i2s_read(I2S_PORT, &samples, sizeof(samples), &bytesRead, portMAX_DELAY);

    if (bytesRead > 0) {
        long sum = 0;
        int count = bytesRead / 2;
        for (int i = 0; i < count; i++) {
            sum += abs(samples[i]);
        }
        int avgMagnitude = sum / count;
        
        // Map magnitude to LED Brightness
        // High magnitude -> Low PWM value (On), Low magnitude -> High PWM value (Off)
        // Adjust range based on your "screaming" requirements
        int brightness = map(constrain(avgMagnitude, 100, 8000), 100, 8000, 0, 255);
        ledcWrite(LED_PWM_CHAN, 255 - brightness); 

        // Print a simple bar for visual feedback
        Serial.printf("[%5d] ", avgMagnitude);
        int barLen = map(constrain(avgMagnitude, 0, 5000), 0, 5000, 0, 50);
        for(int i=0; i<barLen; i++) Serial.print("=");
        Serial.println();
    }
    
    // Check if user wants to reset config via Serial
    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'r' || c == 'R') {
            Serial.println("Resetting config...");
            prefs.begin("mic_cfg", false);
            prefs.clear();
            prefs.end();
            ESP.restart();
        }
    }
}
