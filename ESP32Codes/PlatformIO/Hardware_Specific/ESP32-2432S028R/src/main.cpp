#include <Arduino.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <esp_now.h>

/*
 * Omni-Wheel Robot Controller for ESP32-2432S028R (CYD)
 * 
 * Features:
 * - 9-button touch interface
 * - ESP-NOW Broadcast control
 * - Visual feedback on touch
 */

// --- Touch Screen Settings ---
#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33

SPIClass touchSPI = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- ESP-NOW Settings ---
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

typedef struct struct_message {
    char command[16];
} struct_message;

struct_message controlData;
esp_now_peer_info_t peerInfo;

// --- UI Constants ---
#define BUTTON_COUNT 9
#define COL_COUNT 3
#define ROW_COUNT 3

struct Button {
    int x, y, w, h;
    const char* label;
    const char* cmd;
    uint16_t color;
};

Button buttons[BUTTON_COUNT] = {
    {0, 0, 0, 0, "SLIDE L", "SLIDE_L", TFT_BLUE},    // [0,0]
    {0, 0, 0, 0, "UP", "UP", TFT_DARKGREEN},        // [1,0]
    {0, 0, 0, 0, "SLIDE R", "SLIDE_R", TFT_BLUE},    // [2,0]
    {0, 0, 0, 0, "LEFT", "LEFT", TFT_DARKGREEN},    // [0,1]
    {0, 0, 0, 0, "STOP (X)", "STOP", TFT_RED},       // [1,1]
    {0, 0, 0, 0, "RIGHT", "RIGHT", TFT_DARKGREEN},  // [2,1]
    {0, 0, 0, 0, "ROT L", "ROT_L", TFT_PURPLE},     // [0,2]
    {0, 0, 0, 0, "DOWN", "DOWN", TFT_DARKGREEN},    // [1,2]
    {0, 0, 0, 0, "ROT R", "ROT_R", TFT_PURPLE}      // [2,2]
};

void drawButton(int i, bool pressed) {
    uint16_t color = pressed ? TFT_WHITE : buttons[i].color;
    uint16_t txtColor = pressed ? TFT_BLACK : TFT_WHITE;
    
    tft.fillRect(buttons[i].x + 2, buttons[i].y + 2, buttons[i].w - 4, buttons[i].h - 4, color);
    tft.drawRect(buttons[i].x, buttons[i].y, buttons[i].w, buttons[i].h, TFT_LIGHTGREY);
    
    tft.setTextColor(txtColor);
    tft.setTextSize(2);
    tft.setTextDatum(MC_DATUM);
    tft.drawString(buttons[i].label, buttons[i].x + buttons[i].w/2, buttons[i].y + buttons[i].h/2);
}

void initUI() {
    int bw = tft.width() / 3;
    int bh = tft.height() / 3;
    
    for (int i = 0; i < BUTTON_COUNT; i++) {
        int col = i % 3;
        int row = i / 3;
        buttons[i].x = col * bw;
        buttons[i].y = row * bh;
        buttons[i].w = bw;
        buttons[i].h = bh;
        drawButton(i, false);
    }
}

void setup() {
    Serial.begin(115200);
    
    // Backlight on
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);

    // Initialize Display
    tft.init();
    tft.setRotation(1); // Landscape
    tft.fillScreen(TFT_BLACK);
    
    // Initialize Touch
    touchSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
    touch.begin(touchSPI);
    touch.setRotation(1);

    // Initialize ESP-NOW
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }

    memcpy(peerInfo.peer_addr, broadcastAddress, 6);
    peerInfo.channel = 0;  
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
        return;
    }

    initUI();
    Serial.println("Robot Controller Ready");
}

int lastButtonPressed = -1;

void loop() {
    if (touch.touched()) {
        TS_Point p = touch.getPoint();
        
        // Map touch to screen coordinates
        // Re-calibrated for Typical CYD Rotation 1 (Landscape)
        // Adjust these if buttons are still swapped:
        int x = map(p.x, 200, 3800, 0, 320); 
        int y = map(p.y, 200, 3800, 0, 240);

        // DEBUG: Uncomment to see raw vs mapped values if it's still wrong
        // Serial.printf("Raw X:%d Y:%d | Mapped X:%d Y:%d\n", p.x, p.y, x, y);

        int col = x / (320 / 3);
        int row = y / (240 / 3);
        int buttonIndex = row * 3 + col;

        if (buttonIndex >= 0 && buttonIndex < BUTTON_COUNT) {
            if (buttonIndex != lastButtonPressed) {
                // Release old button
                if (lastButtonPressed != -1) drawButton(lastButtonPressed, false);
                
                // Press new button
                drawButton(buttonIndex, true);
                strcpy(controlData.command, buttons[buttonIndex].cmd);
                
                esp_now_send(broadcastAddress, (uint8_t *) &controlData, sizeof(controlData));
                Serial.printf("Sent Command: %s\n", controlData.command);
                
                lastButtonPressed = buttonIndex;
            }
        }
    } else {
        if (lastButtonPressed != -1) {
            drawButton(lastButtonPressed, false);
            
            // Send STOP when released (or we can just let it be)
            // strcpy(controlData.command, "STOP");
            // esp_now_send(broadcastAddress, (uint8_t *) &controlData, sizeof(controlData));
            
            lastButtonPressed = -1;
        }
    }
    delay(50);
}
