#include <Wire.h> // Include the Wire library for I2C communication

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

void setup() {
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
    //Wire.begin(); // SDA and SCL are set up automatically
    
    // Initialize microphone pins (typically as inputs, but check your microphone datasheet)
    pinMode(SD_PIN, INPUT);
    pinMode(SCK_PIN, INPUT);
    pinMode(LR_PIN, INPUT);
    pinMode(WS_PIN, INPUT);
}

void loop() {
    // Nothing needs to be done in the loop as per your request
}
