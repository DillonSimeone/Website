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
 * - 6-button touch interface (3x2 grid)
 * - ESP-NOW Broadcast control
 * - Stop on release (no dedicated STOP button)
 * - Visual feedback on touch
 * 
 * Button Layout:
 * [ROT_L]  [UP]    [ROT_R]
 * [SLIDE_L][DOWN]  [SLIDE_R]
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
#define BUTTON_COUNT 6
#define COL_COUNT 3
#define ROW_COUNT 2

// Color Palette (Glassmorphism-inspired)
#define COLOR_ROT   0x780F   // Purple
#define COLOR_MOVE  0x03E0   // Green
#define COLOR_SLIDE 0x001F   // Blue

struct Button {
    int x, y, w, h;
    const char* label;
    const char* cmd;
    uint16_t color;
};

// Matching RobotController's web UI layout:
// Top Row:    ROT_L,  UP,    ROT_R
// Bottom Row: SLIDE_L, DOWN, SLIDE_R
Button buttons[BUTTON_COUNT] = {
    {0, 0, 0, 0, "ROT L",   "ROT_L", COLOR_ROT},     // [0,0]
    {0, 0, 0, 0, "UP",      "UP",    COLOR_MOVE},    // [1,0]
    {0, 0, 0, 0, "ROT R",   "ROT_R", COLOR_ROT},     // [2,0]
    {0, 0, 0, 0, "SLIDE L", "LEFT",  COLOR_SLIDE},   // [0,1] - Sends LEFT (strafe)
    {0, 0, 0, 0, "DOWN",    "DOWN",  COLOR_MOVE},    // [1,1]
    {0, 0, 0, 0, "SLIDE R", "RIGHT", COLOR_SLIDE}    // [2,1] - Sends RIGHT (strafe)
};

void drawButton(int i, bool pressed) {
    uint16_t color = pressed ? TFT_WHITE : buttons[i].color;
    uint16_t txtColor = pressed ? TFT_BLACK : TFT_WHITE;
    
    // Draw filled button with rounded-ish look (small inset)
    tft.fillRect(buttons[i].x + 3, buttons[i].y + 3, buttons[i].w - 6, buttons[i].h - 6, color);
    
    // Border
    tft.drawRect(buttons[i].x + 1, buttons[i].y + 1, buttons[i].w - 2, buttons[i].h - 2, TFT_LIGHTGREY);
    
    // Label
    tft.setTextColor(txtColor);
    tft.setTextSize(2);
    tft.setTextDatum(MC_DATUM);
    tft.drawString(buttons[i].label, buttons[i].x + buttons[i].w/2, buttons[i].y + buttons[i].h/2);
}

void initUI() {
    // 3 columns, 2 rows
    int bw = tft.width() / COL_COUNT;
    int bh = tft.height() / ROW_COUNT;
    
    for (int i = 0; i < BUTTON_COUNT; i++) {
        int col = i % COL_COUNT;
        int row = i / COL_COUNT;
        buttons[i].x = col * bw;
        buttons[i].y = row * bh;
        buttons[i].w = bw;
        buttons[i].h = bh;
        drawButton(i, false);
    }
}

void sendCommand(const char* cmd) {
    strcpy(controlData.command, cmd);
    esp_now_send(broadcastAddress, (uint8_t *) &controlData, sizeof(controlData));
    Serial.printf("Sent: %s\n", cmd);
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
    Serial.println("Robot Controller Ready (Stop-on-Release Mode)");
    Serial.print("MAC: "); Serial.println(WiFi.macAddress());
}

int lastButtonPressed = -1;

void loop() {
    if (touch.touched()) {
        TS_Point p = touch.getPoint();
        
        // Map touch to screen coordinates (Landscape, Rotation 1)
        int x = map(p.x, 200, 3800, 0, 320); 
        int y = map(p.y, 200, 3800, 0, 240);

        // Constrain to screen bounds
        x = constrain(x, 0, 319);
        y = constrain(y, 0, 239);

        // Calculate button index (3 cols x 2 rows)
        int col = x / (320 / COL_COUNT);
        int row = y / (240 / ROW_COUNT);
        int buttonIndex = row * COL_COUNT + col;

        if (buttonIndex >= 0 && buttonIndex < BUTTON_COUNT) {
            if (buttonIndex != lastButtonPressed) {
                // Release old button visually
                if (lastButtonPressed != -1) {
                    drawButton(lastButtonPressed, false);
                }
                
                // Press new button
                drawButton(buttonIndex, true);
                sendCommand(buttons[buttonIndex].cmd);
                
                lastButtonPressed = buttonIndex;
            }
        }
    } else {
        // Touch released - STOP the robot
        if (lastButtonPressed != -1) {
            drawButton(lastButtonPressed, false);
            sendCommand("STOP");
            lastButtonPressed = -1;
        }
    }
    delay(30); // 30ms for responsive control
}
