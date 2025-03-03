#include <SPI.h>
#include <Wire.h>
#include <FastLED.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h> 
#include <driver/i2s.h>

// Define motor control pins
#define MOTOR1A 17
#define MOTOR1B 16
#define MOTOR2A 7
#define MOTOR2B 6

// Define I2C pins
#define SDA_PIN 19
#define SCL_PIN 20

// Define microphone pins
#define SD_PIN 22
#define SCK_PIN 23
#define LR_PIN 5
#define WS_PIN 4

// Led data pin
#define LED_PIN 21
#define NUM_LEDS 10  // Number of LEDs to control
#define BRIGHTNESS 100
CRGB leds[NUM_LEDS];

// OLED display settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1  // Some screens require a reset pin (-1 if not used)
#define SCREEN_ADDRESS 0x3C  // Common I2C address for 0.96" OLED
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// I2S Configuration
#define SAMPLE_BUFFER_SIZE 512
#define SAMPLE_RATE 8000

i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

i2s_pin_config_t i2s_mic_pins = {
.bck_io_num = SCK_PIN,
.ws_io_num = WS_PIN,
.data_out_num = I2S_PIN_NO_CHANGE,
.data_in_num = SD_PIN
};

int32_t raw_samples[SAMPLE_BUFFER_SIZE];

void setup() {
    Serial.begin(115200);

    // Print known default SDA & SCL
    Serial.print("Default SDA pin: ");
    Serial.println(SDA);  // Should return the default pin number
    Serial.print("Default SCL pin: ");
    Serial.println(SCL);  // Should return the default pin number

    // Set motor control pins as outputs
    pinMode(MOTOR1A, OUTPUT);
    pinMode(MOTOR1B, OUTPUT);
    pinMode(MOTOR2A, OUTPUT);
    pinMode(MOTOR2B, OUTPUT);

    digitalWrite(MOTOR1A, LOW);
    digitalWrite(MOTOR1B, LOW);
    digitalWrite(MOTOR2A, LOW);
    digitalWrite(MOTOR2B, LOW);
    
    // Initialize I2C communication
    Wire.begin(); // Flip SDA/SCL due to Dillon fucking up the traces on the PCB.--
    
    // Initialize microphone pins (typically as inputs, but check your microphone datasheet)
    pinMode(SD_PIN, INPUT);
    pinMode(SCK_PIN, INPUT);
    pinMode(LR_PIN, INPUT);
    pinMode(WS_PIN, INPUT);

    // Initialize FastLED
    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(BRIGHTNESS);

     // Initialize OLED display
    if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
        Serial.println(F("SSD1306 allocation failed"));
        // If screen initialization fails, loop forever
        for (;;);
    }
    Serial.println("OLED SSD1306 Initialized!");

    // start up the I2S peripheral
    i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &i2s_mic_pins);
    Serial.println("I2S Microphone Initialized!");

    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 10);
    display.println("Mic Initialized");
    display.display();
    delay(1000);
}

void loop() {
     size_t bytes_read = 0;
     i2s_read(I2S_NUM_0, raw_samples, sizeof(int32_t) * SAMPLE_BUFFER_SIZE, &bytes_read, portMAX_DELAY);
     int samples_read = bytes_read / sizeof(int32_t);
     for (int i = 0; i < samples_read; i++){
      Serial.printf("%ld\n", raw_samples[i]);
      }

      display.clearDisplay();
      display.setTextSize(1);
      display.setTextColor(SSD1306_WHITE);
      display.setCursor(10, 10);
      display.println("Hello World");
      display.display();
}
