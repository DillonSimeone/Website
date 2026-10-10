#include <Arduino.h>
#include <driver/i2s.h>

// --- PIN DEFINITIONS ---
#define I2S_SD      0
#define I2S_SCK     1
#define I2S_LR      2
#define I2S_WS      3
#define SOFT_GND    4
#define LED_PIN     8

// --- PWM SETTINGS ---
#define PWM_FREQ    5000
#define PWM_RES     8
#define PWM_CHAN    0

// --- I2S SETTINGS ---
#define SAMPLE_SIZE 1024
#define SAMPLE_RATE 16000

void setup_i2s() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 64,
        .use_apll = false
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK,
        .ws_io_num = I2S_WS,
        .data_out_num = -1,
        .data_in_num = I2S_SD
    };

    i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &pin_config);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("INMP441 Sanity Test - Hardcoded");

    // Configure selection/ground pins
    pinMode(I2S_LR, OUTPUT);
    digitalWrite(I2S_LR, LOW); // Select Left channel
    
    pinMode(SOFT_GND, OUTPUT);
    digitalWrite(SOFT_GND, LOW); // Provide ground

    // Setup LED PWM
    ledcSetup(PWM_CHAN, PWM_FREQ, PWM_RES);
    ledcAttachPin(LED_PIN, PWM_CHAN);
    
    // Onboard LED is inverted: 0 = bright, 255 = off
    ledcWrite(PWM_CHAN, 255); // Start OFF

    setup_i2s();
}

void loop() {
    int32_t samples[64];
    size_t bytes_read = 0;
    
    esp_err_t result = i2s_read(I2S_NUM_0, samples, sizeof(samples), &bytes_read, portMAX_DELAY);
    
    if (result == ESP_OK && bytes_read > 0) {
        int samples_count = bytes_read / 4;
        float sum_sq = 0;
        int max_val = 0;

        for (int i = 0; i < samples_count; i++) {
            // INMP441 is 24-bit PCM in 32-bit slot, sign extend if needed
            // But we can just use the raw magnitude for volume
            int32_t val = samples[i] >> 14; // Downscale for easier handling
            if (val < 0) val = -val;
            if (val > max_val) max_val = val;
            sum_sq += (float)val * val;
        }

        float rms = sqrt(sum_sq / samples_count);
        
        // Map RMS to PWM
        // Noise floor is usually around some value, max is around some other.
        // Let's print and adjust if needed, but for now:
        // rms usually ranges from 0 to several thousands with the >> 14 shift.
        // Let's map 0-1000 to 255-0 (inverted)
        
        int brightness = map((int)rms, 0, 1000, 255, 0);
        if (brightness < 0) brightness = 0;
        if (brightness > 255) brightness = 255;
        
        ledcWrite(PWM_CHAN, brightness);

        // Debug output
        static unsigned long last_print = 0;
        if (millis() - last_print > 100) {
            Serial.printf("RMS: %.2f | PWM: %d\n", rms, brightness);
            last_print = millis();
        }
    }
}
