#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "index_html.h"
#include "secrets.h"

// Camera Pin Definitions for Freenove ESP32 Wrover V1.6
// Official Freenove pinout from documentation
#define PWDN_GPIO_NUM    -1
#define RESET_GPIO_NUM   -1
#define XCLK_GPIO_NUM    21
#define SIOD_GPIO_NUM    26
#define SIOC_GPIO_NUM    27

#define Y9_GPIO_NUM      39
#define Y8_GPIO_NUM      35
#define Y7_GPIO_NUM      34
#define Y6_GPIO_NUM      19
#define Y5_GPIO_NUM      18
#define Y4_GPIO_NUM       5
#define Y3_GPIO_NUM       4
#define Y2_GPIO_NUM       2   // Changed from 4 to 2
#define VSYNC_GPIO_NUM   25
#define HREF_GPIO_NUM    23
#define PCLK_GPIO_NUM    22

// HTTP Server instance
httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// Stream handler
esp_err_t stream_handler(httpd_req_t *req) {
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    size_t _jpg_buf_len = 0;
    uint8_t *_jpg_buf = NULL;
    char *part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if (res != ESP_OK) return res;

    while (true) {
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("Camera capture failed");
            res = ESP_FAIL;
        } else {
            if (fb->format != PIXFORMAT_JPEG) {
                bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
                esp_camera_fb_return(fb);
                fb = NULL;
                if (!jpeg_converted) {
                    Serial.println("JPEG compression failed");
                    res = ESP_FAIL;
                }
            } else {
                _jpg_buf_len = fb->len;
                _jpg_buf = fb->buf;
            }
        }
        if (res == ESP_OK) {
            size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
            res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
        }
        if (res == ESP_OK) {
            res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
        }
        if (res == ESP_OK) {
            res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
        }
        if (fb) {
            esp_camera_fb_return(fb);
            fb = NULL;
            _jpg_buf = NULL;
        } else if (_jpg_buf) {
            free(_jpg_buf);
            _jpg_buf = NULL;
        }
        if (res != ESP_OK) break;
    }
    return res;
}

// Index page handler
esp_err_t index_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, index_html, strlen(index_html));
}

// Capture frame handler
esp_err_t capture_handler(httpd_req_t *req) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
    esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    return res;
}

void startCameraServer() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;

    httpd_uri_t index_uri = {
        .uri       = "/",
        .method    = HTTP_GET,
        .handler   = index_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t capture_uri = {
        .uri       = "/capture",
        .method    = HTTP_GET,
        .handler   = capture_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t stream_uri = {
        .uri       = "/stream",
        .method    = HTTP_GET,
        .handler   = stream_handler,
        .user_ctx  = NULL
    };

    if (httpd_start(&camera_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(camera_httpd, &index_uri);
        httpd_register_uri_handler(camera_httpd, &capture_uri);
        httpd_register_uri_handler(camera_httpd, &stream_uri);
    }
}

void setup() {
    Serial.begin(115200);
    Serial.setDebugOutput(true);
    Serial.println();

    // Camera Configuration
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
    config.pin_sccb_sda = SIOD_GPIO_NUM;  // Updated from deprecated pin_sscb_sda
    config.pin_sccb_scl = SIOC_GPIO_NUM;  // Updated from deprecated pin_sscb_scl
    config.sccb_i2c_port = 0;             // Use I2C port 0 for SCCB (V1.6 compatibility)
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 10000000;       // 10MHz for better stability
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

    // Use higher resolution if PSRAM is available
    if(psramFound()){
        Serial.println("PSRAM found and initialized!");
        config.frame_size = FRAMESIZE_VGA;
        config.jpeg_quality = 12;
        config.fb_count = 2;
        config.fb_location = CAMERA_FB_IN_PSRAM;
    } else {
        Serial.println("PSRAM NOT FOUND! Using internal RAM (Limited resolution)");
        config.frame_size = FRAMESIZE_QVGA;
        config.jpeg_quality = 12;
        config.fb_count = 1;
        config.fb_location = CAMERA_FB_IN_DRAM;
    }

    // Camera Init with power cycle workaround
    Serial.println("Initializing camera clock (XCLK)...");
    
    // Generate XCLK to wake up camera before init
    pinMode(XCLK_GPIO_NUM, OUTPUT);
    for(int i = 0; i < 100; i++) {
        digitalWrite(XCLK_GPIO_NUM, HIGH);
        delayMicroseconds(1);
        digitalWrite(XCLK_GPIO_NUM, LOW);
        delayMicroseconds(1);
    }
    pinMode(XCLK_GPIO_NUM, INPUT); // Release pin for camera driver
    
    delay(100); // Give camera time to stabilize
    
    // I2C Scan to check if camera is responding
    Serial.println("\n--- I2C Bus Scan ---");
    Serial.printf("SDA: GPIO%d, SCL: GPIO%d\n", SIOD_GPIO_NUM, SIOC_GPIO_NUM);
    Wire.begin(SIOD_GPIO_NUM, SIOC_GPIO_NUM);
    int devicesFound = 0;
    for(byte address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        byte error = Wire.endTransmission();
        if (error == 0) {
            Serial.printf("I2C device found at 0x%02X", address);
            if (address == 0x30 || address == 0x21) {
                Serial.print(" <-- OV2640 Camera!");
            }
            Serial.println();
            devicesFound++;
        }
    }
    if (devicesFound == 0) {
        Serial.println("NO I2C devices found! Camera may be dead or disconnected.");
    } else {
        Serial.printf("Found %d I2C device(s)\n", devicesFound);
    }
    Serial.println("--- End I2C Scan ---\n");
    Wire.end(); // Release I2C for camera driver
    
    Serial.println("Starting camera probe...");
    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("Camera init failed with error 0x%x\n", err);
        Serial.println("Troubleshooting Tips:");
        Serial.println("1. Check if the camera ribbon cable is fully inserted.");
        Serial.println("2. Ensure the gold contacts face the board's PCB.");
        Serial.println("3. Try a different USB cable/port (Needs 5V 500mA+).");
        return;
    }
    Serial.println("Camera probe successful!");

    // WiFi Init
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("");
    Serial.println("WiFi connected");

    // mDNS Init
    if (!MDNS.begin("esp32cam")) {
        Serial.println("Error setting up MDNS responder!");
    } else {
        Serial.println("mDNS responder started: http://esp32cam.local");
    }

    // Start Server
    startCameraServer();

    Serial.print("Camera Ready! Use 'http://");
    Serial.print(WiFi.localIP());
    Serial.println("' or 'http://esp32cam.local' to connect");
}

void loop() {
    // Nothing here, server runs in background
    delay(10000);
}
