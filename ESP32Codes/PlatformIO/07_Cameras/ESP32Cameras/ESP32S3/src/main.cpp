/**
 * 3D Printer Camera - ESP32-S3 WROOM N16R8
 * 
 * Features:
 * - MJPEG video streaming with FPS counter
 * - mDNS discovery (3DprinterCam.local)
 * - Glassmorphism web interface
 * - FastLED strip control on GPIO 14
 * - Async web server for responsive controls
 * 
 * Author: Generated for 3D Printer monitoring
 */

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <esp_camera.h>
#include <FastLED.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>

#include "config.h"
#include "camera_pins.h"
#include "web_content.h"

// ==================== FastLED Setup ====================
CRGB* leds = nullptr;
uint16_t ledCount = DEFAULT_LED_COUNT;
uint8_t ledBrightness = DEFAULT_BRIGHTNESS;
CRGB currentColor = CRGB(99, 102, 241);  // Default purple-blue
bool ledsOn = false;

// ==================== FPS Counter ====================
volatile float currentFPS = 0.0f;
volatile unsigned long frameCount = 0;
unsigned long lastFPSUpdate = 0;

// ==================== Async Web Server ====================
AsyncWebServer server(WEB_SERVER_PORT);

// ==================== Function Declarations ====================
void initCamera();
void initWiFi();
void initMDNS();
void initLEDs();
void initWebServer();
void updateLEDs();

// ==================== MJPEG Stream Handler ====================
class MjpegStreamHandler : public AsyncWebHandler {
public:
    MjpegStreamHandler() {}
    virtual ~MjpegStreamHandler() {}

    bool canHandle(AsyncWebServerRequest *request) {
        return request->url() == "/stream";
    }

    void handleRequest(AsyncWebServerRequest *request) {
        // Create a chunked response for streaming
        AsyncWebServerResponse* response = request->beginChunkedResponse(
            "multipart/x-mixed-replace; boundary=frame",
            [](uint8_t* buffer, size_t maxLen, size_t index) -> size_t {
                // Static variables for state
                static camera_fb_t* fb = nullptr;
                static size_t fb_pos = 0;
                static bool sending_header = true;
                static char header[64];
                static size_t header_len = 0;
                static size_t header_pos = 0;
                static unsigned long lastFrameTime = 0;
                
                // FPS calculation
                unsigned long now = millis();
                if (lastFrameTime > 0 && fb == nullptr) {
                    float frameDelta = (now - lastFrameTime) / 1000.0f;
                    if (frameDelta > 0) {
                        currentFPS = currentFPS * 0.9f + (1.0f / frameDelta) * 0.1f;
                    }
                }
                
                // Need new frame?
                if (fb == nullptr) {
                    fb = esp_camera_fb_get();
                    if (fb == nullptr) {
                        return 0;  // No frame available
                    }
                    lastFrameTime = now;
                    frameCount++;
                    fb_pos = 0;
                    sending_header = true;
                    header_len = snprintf(header, sizeof(header),
                        "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
                        fb->len);
                    header_pos = 0;
                }
                
                size_t written = 0;
                
                // Send header first
                if (sending_header) {
                    size_t to_copy = min(header_len - header_pos, maxLen);
                    memcpy(buffer, header + header_pos, to_copy);
                    header_pos += to_copy;
                    written += to_copy;
                    if (header_pos >= header_len) {
                        sending_header = false;
                    }
                    return written;
                }
                
                // Send frame data
                size_t remaining = fb->len - fb_pos;
                size_t to_copy = min(remaining, maxLen);
                memcpy(buffer, fb->buf + fb_pos, to_copy);
                fb_pos += to_copy;
                written = to_copy;
                
                // Frame complete?
                if (fb_pos >= fb->len) {
                    esp_camera_fb_return(fb);
                    fb = nullptr;
                }
                
                return written;
            }
        );
        
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    }
};

// ==================== Setup ====================
void setup() {
    Serial.begin(115200);
    Serial.setDebugOutput(true);
    Serial.println();
    Serial.println("========================================");
    Serial.println("   3D Printer Camera - ESP32-S3");
    Serial.println("========================================");
    
    // Initialize camera
    initCamera();
    
    // Initialize WiFi
    initWiFi();
    
    // Initialize mDNS
    initMDNS();
    
    // Initialize FastLED
    initLEDs();
    
    // Initialize web server
    initWebServer();
    
    Serial.println("========================================");
    Serial.println("   System Ready!");
    Serial.println("========================================");
    Serial.printf("   Access: http://%s.local\n", MDNS_HOSTNAME);
    Serial.printf("   IP: http://%s\n", WiFi.localIP().toString().c_str());
    Serial.println("========================================");
}

// ==================== Loop ====================
void loop() {
    // Update FPS calculation every second
    if (millis() - lastFPSUpdate > 1000) {
        lastFPSUpdate = millis();
        // FPS is calculated in the stream handler
    }
    
    delay(10);  // Yield to other tasks
}

// ==================== Camera Initialization ====================
void initCamera() {
    Serial.println("[Camera] Initializing...");
    Serial.println("[Camera] Pin Configuration:");
    Serial.printf("  XCLK=%d, PCLK=%d, VSYNC=%d, HREF=%d\n", XCLK_GPIO_NUM, PCLK_GPIO_NUM, VSYNC_GPIO_NUM, HREF_GPIO_NUM);
    Serial.printf("  SIOD=%d, SIOC=%d\n", SIOD_GPIO_NUM, SIOC_GPIO_NUM);
    Serial.printf("  D0-D7: %d, %d, %d, %d, %d, %d, %d, %d\n", 
                  Y2_GPIO_NUM, Y3_GPIO_NUM, Y4_GPIO_NUM, Y5_GPIO_NUM,
                  Y6_GPIO_NUM, Y7_GPIO_NUM, Y8_GPIO_NUM, Y9_GPIO_NUM);
    
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 24000000;  // 24MHz for OV5640 (use 20MHz for OV2640)
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    
    // Use PSRAM for better frame buffer performance
    if (psramFound()) {
        Serial.printf("[Camera] PSRAM found: %d bytes\n", ESP.getPsramSize());
        config.frame_size = FRAMESIZE_XGA;  // 1024x768
        config.jpeg_quality = 10;
        config.fb_count = 2;
    } else {
        Serial.println("[Camera] No PSRAM, using lower quality settings");
        config.frame_size = FRAMESIZE_VGA;
        config.jpeg_quality = 12;
        config.fb_count = 1;
        config.fb_location = CAMERA_FB_IN_DRAM;
    }
    
    // Initialize camera
    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[Camera] Init failed with error 0x%x\n", err);
        Serial.println("[Camera] Common errors:");
        Serial.println("  0x105 = No camera detected (check ribbon cable)");
        Serial.println("  0x20004 = SCCB communication error (wrong I2C pins)");
        Serial.println("  0x20005 = Pixel data error (wrong data pins)");
        Serial.println("[Camera] Check pin definitions in camera_pins.h");
        return;
    }
    
    // Get camera sensor for adjustments
    sensor_t* s = esp_camera_sensor_get();
    if (s) {
        // Print detailed sensor info
        Serial.println("[Camera] ========== SENSOR INFO ==========");
        Serial.printf("[Camera] Sensor PID: 0x%02X\n", s->id.PID);
        Serial.printf("[Camera] Sensor VER: 0x%02X\n", s->id.VER);
        Serial.printf("[Camera] Sensor MIDL: 0x%02X\n", s->id.MIDL);
        Serial.printf("[Camera] Sensor MIDH: 0x%02X\n", s->id.MIDH);
        
        // Identify sensor type
        bool isOV5640 = (s->id.PID == 0x56);
        bool isOV2640 = (s->id.PID == 0x26);
        
        if (isOV5640) {
            Serial.println("[Camera] Detected: OV5640 (5MP sensor)");
            Serial.println("[Camera] Applying OV5640-specific settings...");
            
            // OV5640 specific - only adjust white balance, keep auto exposure/gain
            s->set_whitebal(s, 1);       // Enable white balance
            s->set_awb_gain(s, 1);       // Enable AWB gain (needed for exposure)
            s->set_wb_mode(s, 0);        // Auto WB mode first
            
            // KEEP auto exposure and gain - needed for proper brightness
            s->set_exposure_ctrl(s, 1);  // Auto exposure ON
            s->set_gain_ctrl(s, 1);      // Auto gain ON
            s->set_aec2(s, 1);           // DSP auto exposure ON
            s->set_ae_level(s, 1);       // Slightly boost AE level
            s->set_gainceiling(s, (gainceiling_t)4);  // Higher gain ceiling for low light
            
            // Boost image quality settings
            s->set_brightness(s, 1);     // Slight brightness boost
            s->set_contrast(s, 1);       // Slight contrast boost
            s->set_saturation(s, 1);     // Boost saturation for more vivid colors
            s->set_sharpness(s, 1);      // Slight sharpness
            
            // Enable all image processing
            s->set_denoise(s, 1);
            s->set_bpc(s, 1);            // Bad pixel correction (helps with that white pixel)
            s->set_wpc(s, 1);            // White pixel correction
            s->set_raw_gma(s, 1);        // Gamma correction
            s->set_lenc(s, 1);           // Lens correction
            
        } else if (isOV2640) {
            Serial.println("[Camera] Detected: OV2640 (2MP sensor)");
            
            s->set_whitebal(s, 1);
            s->set_awb_gain(s, 1);
            s->set_wb_mode(s, 0);
            s->set_exposure_ctrl(s, 1);
            s->set_gain_ctrl(s, 1);
            s->set_brightness(s, 0);
            s->set_contrast(s, 0);
            s->set_saturation(s, 0);
            
        } else {
            Serial.printf("[Camera] Detected: Unknown sensor (PID=0x%04X)\n", s->id.PID);
            // Assume OV5640-like (since 0x5640 is two bytes)
            if (s->id.PID == 0x5640) {
                Serial.println("[Camera] Treating as OV5640...");
                // Keep defaults - auto exposure and gain
                s->set_whitebal(s, 1);
                s->set_awb_gain(s, 1);
                s->set_wb_mode(s, 0);
                s->set_exposure_ctrl(s, 1);
                s->set_gain_ctrl(s, 1);
            }
        }
        Serial.println("[Camera] ===================================");
        
        // Basic orientation
        s->set_vflip(s, 0);
        s->set_hmirror(s, 0);
        
        // Common settings
        s->set_special_effect(s, 0);     // No special effect
        s->set_colorbar(s, 0);           // No test pattern
        s->set_dcw(s, 1);                // Enable DCW (downsize)
        s->set_aec2(s, 0);               // Disable AEC DSP
        s->set_ae_level(s, 0);
        s->set_gainceiling(s, (gainceiling_t)2);
        
        Serial.println("[Camera] Sensor configured");
    }
    
    Serial.println("[Camera] Initialized successfully!");
}

// ==================== WiFi Initialization ====================
void initWiFi() {
    Serial.println("[WiFi] Connecting...");
    Serial.printf("[WiFi] SSID: %s\n", WIFI_SSID);
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("[WiFi] Connected!");
        Serial.printf("[WiFi] IP Address: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println();
        Serial.println("[WiFi] Connection failed!");
    }
}

// ==================== mDNS Initialization ====================
void initMDNS() {
    Serial.printf("[mDNS] Starting as %s.local\n", MDNS_HOSTNAME);
    
    if (MDNS.begin(MDNS_HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.println("[mDNS] Started successfully!");
    } else {
        Serial.println("[mDNS] Failed to start!");
    }
}

// ==================== FastLED Initialization ====================
void initLEDs() {
    Serial.printf("[LED] Initializing %d LEDs on GPIO %d\n", ledCount, LED_PIN);
    
    // Allocate LED array
    leds = new CRGB[MAX_LED_COUNT];
    
    // Initialize FastLED
    FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, MAX_LED_COUNT);
    FastLED.setBrightness(ledBrightness);
    FastLED.clear();
    FastLED.show();
    
    Serial.println("[LED] Initialized successfully!");
}

// ==================== Update LEDs ====================
void updateLEDs() {
    if (ledsOn) {
        for (uint16_t i = 0; i < ledCount && i < MAX_LED_COUNT; i++) {
            leds[i] = currentColor;
        }
        // Clear any LEDs beyond the count
        for (uint16_t i = ledCount; i < MAX_LED_COUNT; i++) {
            leds[i] = CRGB::Black;
        }
    } else {
        FastLED.clear();
    }
    FastLED.setBrightness(ledBrightness);
    FastLED.show();
}

// ==================== Web Server Initialization ====================
void initWebServer() {
    Serial.println("[Server] Setting up routes...");
    
    // Main page
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send_P(200, "text/html", index_html);
    });
    
    // FPS endpoint
    server.on("/fps", HTTP_GET, [](AsyncWebServerRequest *request) {
        char fpsStr[16];
        snprintf(fpsStr, sizeof(fpsStr), "%.1f", currentFPS);
        request->send(200, "text/plain", fpsStr);
    });
    
    // Camera control
    server.on("/control", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("var") || !request->hasParam("val")) {
            request->send(400, "text/plain", "Missing var or val");
            return;
        }
        
        String var = request->getParam("var")->value();
        int value = request->getParam("val")->value().toInt();
        
        sensor_t* s = esp_camera_sensor_get();
        if (!s) {
            request->send(500, "text/plain", "Camera sensor not found");
            return;
        }
        
        int res = -1;
        
        if (var == "framesize") {
            res = s->set_framesize(s, (framesize_t)value);
            Serial.printf("[Camera] Resolution set to %d\n", value);
        } else if (var == "quality") {
            res = s->set_quality(s, value);
            Serial.printf("[Camera] Quality set to %d\n", value);
        } else if (var == "brightness") {
            res = s->set_brightness(s, value);
        } else if (var == "contrast") {
            res = s->set_contrast(s, value);
        } else if (var == "saturation") {
            res = s->set_saturation(s, value);
        } else if (var == "sharpness") {
            res = s->set_sharpness(s, value);
        } else if (var == "special_effect") {
            res = s->set_special_effect(s, value);
            Serial.printf("[Camera] Special effect set to %d\n", value);
        } else if (var == "hmirror") {
            res = s->set_hmirror(s, value);
        } else if (var == "vflip") {
            res = s->set_vflip(s, value);
        } else if (var == "awb") {
            res = s->set_whitebal(s, value);
        } else if (var == "awb_gain") {
            res = s->set_awb_gain(s, value);
        } else if (var == "wb_mode") {
            res = s->set_wb_mode(s, value);
        } else if (var == "aec") {
            res = s->set_exposure_ctrl(s, value);
        } else if (var == "aec_value") {
            res = s->set_aec_value(s, value);
        } else if (var == "ae_level") {
            res = s->set_ae_level(s, value);
        } else if (var == "agc") {
            res = s->set_gain_ctrl(s, value);
        } else if (var == "agc_gain") {
            res = s->set_agc_gain(s, value);
        } else if (var == "gainceiling") {
            res = s->set_gainceiling(s, (gainceiling_t)value);
        } else if (var == "bpc") {
            res = s->set_bpc(s, value);
        } else if (var == "wpc") {
            res = s->set_wpc(s, value);
        } else if (var == "raw_gma") {
            res = s->set_raw_gma(s, value);
        } else if (var == "lenc") {
            res = s->set_lenc(s, value);
        } else if (var == "dcw") {
            res = s->set_dcw(s, value);
        } else {
            request->send(400, "text/plain", "Unknown variable: " + var);
            return;
        }
        
        if (res == 0) {
            request->send(200, "text/plain", "OK");
        } else {
            request->send(500, "text/plain", "Failed to set " + var);
        }
    });
    
    // Get current camera status
    server.on("/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        sensor_t* s = esp_camera_sensor_get();
        if (!s) {
            request->send(500, "text/plain", "Camera sensor not found");
            return;
        }
        
        char json[512];
        snprintf(json, sizeof(json),
            "{\"framesize\":%d,\"quality\":%d,\"brightness\":%d,\"contrast\":%d,"
            "\"saturation\":%d,\"special_effect\":%d,\"vflip\":%d,\"hmirror\":%d,"
            "\"fps\":%.1f}",
            s->status.framesize, s->status.quality, s->status.brightness,
            s->status.contrast, s->status.saturation, s->status.special_effect,
            s->status.vflip, s->status.hmirror, currentFPS);
        
        request->send(200, "application/json", json);
    });
    
    // LED power control
    server.on("/led/power", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (request->hasParam("state")) {
            String state = request->getParam("state")->value();
            ledsOn = (state == "1");
            Serial.printf("[LED] Power %s\n", ledsOn ? "ON" : "OFF");
            updateLEDs();
        }
        request->send(200, "text/plain", ledsOn ? "ON" : "OFF");
    });
    
    // LED settings
    server.on("/led/settings", HTTP_GET, [](AsyncWebServerRequest *request) {
        // Get LED count
        if (request->hasParam("count")) {
            int count = request->getParam("count")->value().toInt();
            if (count > 0 && count <= MAX_LED_COUNT) {
                ledCount = count;
                Serial.printf("[LED] Count set to %d\n", ledCount);
            }
        }
        
        // Get color (hex without #)
        if (request->hasParam("color")) {
            String hexColor = request->getParam("color")->value();
            if (hexColor.length() == 6) {
                long colorValue = strtol(hexColor.c_str(), NULL, 16);
                uint8_t r = (colorValue >> 16) & 0xFF;
                uint8_t g = (colorValue >> 8) & 0xFF;
                uint8_t b = colorValue & 0xFF;
                currentColor = CRGB(r, g, b);
                Serial.printf("[LED] Color set to #%s (R:%d G:%d B:%d)\n", hexColor.c_str(), r, g, b);
            }
        }
        
        // Get brightness
        if (request->hasParam("brightness")) {
            int brightness = request->getParam("brightness")->value().toInt();
            if (brightness >= 0 && brightness <= 255) {
                ledBrightness = brightness;
                Serial.printf("[LED] Brightness set to %d\n", ledBrightness);
            }
        }
        
        updateLEDs();
        request->send(200, "text/plain", "Settings applied");
    });
    
    // Add MJPEG stream handler
    server.addHandler(new MjpegStreamHandler());
    
    // 404 handler
    server.onNotFound([](AsyncWebServerRequest *request) {
        request->send(404, "text/plain", "Not found");
    });
    
    server.begin();
    Serial.println("[Server] Started on port 80");
}
