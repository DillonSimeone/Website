#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// Replace these with your Wi-Fi network credentials
const char* ssid = "shrek";
const char* password = "shrekIsTheGreatest123";

// Motor control pins (adjust as per your hardware configuration)
#define MOTOR_FRONT_LEFT_PIN 12
#define MOTOR_FRONT_RIGHT_PIN 13
#define MOTOR_BACK_LEFT_PIN 14
#define MOTOR_BACK_RIGHT_PIN 15

WebServer server(80);

// Function prototypes
void handleRoot();
void handleMotorControl();
void handleCameraStream();

void setup() {
  Serial.begin(115200);

  // Initialize motor control pins
  pinMode(MOTOR_FRONT_LEFT_PIN, OUTPUT);
  pinMode(MOTOR_FRONT_RIGHT_PIN, OUTPUT);
  pinMode(MOTOR_BACK_LEFT_PIN, OUTPUT);
  pinMode(MOTOR_BACK_RIGHT_PIN, OUTPUT);

  // Initialize the camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = 5;
  config.pin_d1       = 18;
  config.pin_d2       = 19;
  config.pin_d3       = 21;
  config.pin_d4       = 36;
  config.pin_d5       = 39;
  config.pin_d6       = 34;
  config.pin_d7       = 35;
  config.pin_xclk     = 0;
  config.pin_pclk     = 22;
  config.pin_vsync    = 25;
  config.pin_href     = 23;
  config.pin_sscb_sda = 26;
  config.pin_sscb_scl = 27;
  config.pin_reset    = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Initialize with high specs to pre-allocate larger buffers
  if(psramFound()){
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  } else {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }
  
  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected");

  // Start the server
  server.on("/", handleRoot);
  server.on("/control", handleMotorControl);
  server.on("/stream", HTTP_GET, handleCameraStream);
  server.begin();
  Serial.println("HTTP server started");
  Serial.print("Server IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  server.handleClient();
}

void handleRoot() {
  String html = R"rawliteral(
  <!DOCTYPE html>
  <html>
  <head>
    <title>ESP32 Control</title>
    <style>
      body { text-align: center; font-family: Arial; }
      button { padding: 15px; font-size: 16px; margin: 5px; }
      img { width: 100%; max-width: 600px; }
    </style>
  </head>
  <body>
    <h1>ESP32 Motor Control and Camera</h1>
    <img src="/stream" id="cameraStream">
    <h2>Motor Controls</h2>
    <button onclick="controlMotor('front_left_on')">Front Left On</button>
    <button onclick="controlMotor('front_left_off')">Front Left Off</button><br>
    <button onclick="controlMotor('front_right_on')">Front Right On</button>
    <button onclick="controlMotor('front_right_off')">Front Right Off</button><br>
    <button onclick="controlMotor('back_left_on')">Back Left On</button>
    <button onclick="controlMotor('back_left_off')">Back Left Off</button><br>
    <button onclick="controlMotor('back_right_on')">Back Right On</button>
    <button onclick="controlMotor('back_right_off')">Back Right Off</button>
    <script>
      function controlMotor(action) {
        var xhttp = new XMLHttpRequest();
        xhttp.open('GET', '/control?action=' + action, true);
        xhttp.send();
      }
    </script>
  </body>
  </html>
  )rawliteral";

  server.send(200, "text/html", html);
}

void handleMotorControl() {
  String action = server.arg("action");
  if (action == "front_left_on") {
    digitalWrite(MOTOR_FRONT_LEFT_PIN, HIGH);
  } else if (action == "front_left_off") {
    digitalWrite(MOTOR_FRONT_LEFT_PIN, LOW);
  } else if (action == "front_right_on") {
    digitalWrite(MOTOR_FRONT_RIGHT_PIN, HIGH);
  } else if (action == "front_right_off") {
    digitalWrite(MOTOR_FRONT_RIGHT_PIN, LOW);
  } else if (action == "back_left_on") {
    digitalWrite(MOTOR_BACK_LEFT_PIN, HIGH);
  } else if (action == "back_left_off") {
    digitalWrite(MOTOR_BACK_LEFT_PIN, LOW);
  } else if (action == "back_right_on") {
    digitalWrite(MOTOR_BACK_RIGHT_PIN, HIGH);
  } else if (action == "back_right_off") {
    digitalWrite(MOTOR_BACK_RIGHT_PIN, LOW);
  }
  server.send(200, "text/plain", "OK");
}

void handleCameraStream() {
  WiFiClient client = server.client();

  String response = "HTTP/1.1 200 OK\r\n";
  response += "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n";
  server.sendContent(response);

  while (client.connected()) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      server.send(500);
      return;
    }

    response = "--frame\r\n";
    response += "Content-Type: image/jpeg\r\n\r\n";
    server.sendContent(response);
    server.client().write((const char *)fb->buf, fb->len);
    server.sendContent("\r\n");
    esp_camera_fb_return(fb);

    // Adjust the delay to control the frame rate
    delay(50);
  }
}

