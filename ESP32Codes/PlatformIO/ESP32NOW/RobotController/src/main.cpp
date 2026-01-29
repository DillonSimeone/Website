#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

/*
 * Omni-Wheel Robot Receiver (Freenove ESP32)
 * 
 * Receives ESP-NOW commands and controls 4 motors via 2x L298N 
 * motor drivers using the 6-pin PWM configuration.
 */

// --- PIN DEFINITIONS (from PINS.md) ---
// L298N #1 (Front Motors)
const int FL_ENA = 14; const int FL_IN1 = 12; const int FL_IN2 = 13; // Front Left
const int FR_ENB = 25; const int FR_IN3 = 27; const int FR_IN4 = 26; // Front Right

// L298N #2 (Rear Motors)
const int RL_ENA = 19; const int RL_IN1 = 33; const int RL_IN2 = 32; // Rear Left
const int RR_ENB = 17; const int RR_IN3 = 18; const int RR_IN4 = 5;  // Rear Right

// PWM Settings
const int PWM_FREQ = 5000;
const int PWM_RES = 8;      // 8-bit (0-255)
const int CH_FL = 0;
const int CH_FR = 1;
const int CH_RL = 2;
const int CH_RR = 3;

// Default Speed (0-255)
const int SPEED_DEFAULT = 180; 

// Structure must match the Master (CYD)
typedef struct struct_message {
    char command[16];
} struct_message;

struct_message incomingData;

// Helper function to set individual motor speed and direction
void setMotor(int in1, int in2, int channel, int speed) {
    if (speed > 0) {
        digitalWrite(in1, HIGH);
        digitalWrite(in2, LOW);
        ledcWrite(channel, speed);
    } else if (speed < 0) {
        digitalWrite(in1, LOW);
        digitalWrite(in2, HIGH);
        ledcWrite(channel, abs(speed));
    } else {
        digitalWrite(in1, LOW);
        digitalWrite(in2, LOW);
        ledcWrite(channel, 0);
    }
}

// Master Drive Function (The Omni-wheel Math)
// Positive = Forward, Negative = Backward
void drive(int fl, int fr, int rl, int rr) {
    setMotor(FL_IN1, FL_IN2, CH_FL, fl);
    setMotor(FR_IN3, FR_IN4, CH_FR, fr);
    setMotor(RL_IN1, RL_IN2, CH_RL, rl);
    setMotor(RR_IN3, RR_IN4, CH_RR, rr);
}

// Callback function executed when data is received
void OnDataRecv(const uint8_t * mac, const uint8_t *incomingBytes, int len) {
    memcpy(&incomingData, incomingBytes, sizeof(incomingData));
    
    Serial.print("Cmd: ");
    Serial.println(incomingData.command);

    if (strcmp(incomingData.command, "UP") == 0) {
        drive(SPEED_DEFAULT, SPEED_DEFAULT, SPEED_DEFAULT, SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "DOWN") == 0) {
        drive(-SPEED_DEFAULT, -SPEED_DEFAULT, -SPEED_DEFAULT, -SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "LEFT") == 0) {
        drive(-SPEED_DEFAULT, SPEED_DEFAULT, SPEED_DEFAULT, -SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "RIGHT") == 0) {
        drive(SPEED_DEFAULT, -SPEED_DEFAULT, -SPEED_DEFAULT, SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "SLIDE_L") == 0) {
        drive(0, SPEED_DEFAULT, SPEED_DEFAULT, 0);
    } else if (strcmp(incomingData.command, "SLIDE_R") == 0) {
        drive(SPEED_DEFAULT, 0, 0, SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "ROT_L") == 0) {
        drive(-SPEED_DEFAULT, SPEED_DEFAULT, -SPEED_DEFAULT, SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "ROT_R") == 0) {
        drive(SPEED_DEFAULT, -SPEED_DEFAULT, SPEED_DEFAULT, -SPEED_DEFAULT);
    } else if (strcmp(incomingData.command, "STOP") == 0) {
        drive(0, 0, 0, 0);
    }
}

void setup() {
    Serial.begin(115200);
    
    // Set digital pins to output
    pinMode(FL_IN1, OUTPUT); pinMode(FL_IN2, OUTPUT);
    pinMode(FR_IN3, OUTPUT); pinMode(FR_IN4, OUTPUT);
    pinMode(RL_IN1, OUTPUT); pinMode(RL_IN2, OUTPUT);
    pinMode(RR_IN3, OUTPUT); pinMode(RR_IN4, OUTPUT);

    // Setup LEDC PWM for Speed Control
    ledcSetup(CH_FL, PWM_FREQ, PWM_RES); ledcAttachPin(FL_ENA, CH_FL);
    ledcSetup(CH_FR, PWM_FREQ, PWM_RES); ledcAttachPin(FR_ENB, CH_FR);
    ledcSetup(CH_RL, PWM_FREQ, PWM_RES); ledcAttachPin(RL_ENA, CH_RL);
    ledcSetup(CH_RR, PWM_FREQ, PWM_RES); ledcAttachPin(RR_ENB, CH_RR);

    // Start in Neutral
    drive(0, 0, 0, 0);

    // Set device as a Wi-Fi Station
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    Serial.println("Robot Receiver Initializing...");
    Serial.print("Device MAC: ");
    Serial.println(WiFi.macAddress());

    // Init ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    // Bind Callback
    esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));
    
    Serial.println("System Ready.");
}

void loop() {
    // Handled in callback
    delay(10);
}

