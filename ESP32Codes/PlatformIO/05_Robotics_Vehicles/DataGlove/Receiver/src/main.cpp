#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// Define the motor pins
#if defined(CONFIG_IDF_TARGET_ESP32C3)
#define motor1 3
#define motor2 4
#define motor3 5
#define motor4 6
#define MOTOR_C3_PINS
#else
#define motor1 5
#endif
#ifndef MOTOR_C3_PINS
#define motor2 23
#endif
#ifndef MOTOR_C3_PINS
#define motor3 22
#endif
#ifndef MOTOR_C3_PINS
#define motor4 21
#endif

// Structure to receive data
typedef struct struct_message {
  int finger1;
  int finger2;
  int finger3;
  int finger4;
} struct_message;

struct_message incomingData;

// Timer variables for each motor
unsigned long motor1StopTime = 0;
unsigned long motor2StopTime = 0;
unsigned long motor3StopTime = 0;
unsigned long motor4StopTime = 0;

const unsigned long motorRunTime = 100; // Motor run time in milliseconds

// Function prototypes
void runMotor(int motorPin, unsigned long &motorStopTime);
void stopMotor(int motorPin, unsigned long &motorStopTime);
#if defined(ESP_IDF_VERSION) && ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *data, int len);
#else
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *data, int len);
#endif

void setup() {
  // Initialize the motor pins as output
  pinMode(motor1, OUTPUT);
  pinMode(motor2, OUTPUT);
  pinMode(motor3, OUTPUT);
  pinMode(motor4, OUTPUT);

  // Start the serial communication
  Serial.begin(9600);

  // Set device as a Wi-Fi Station
  WiFi.mode(WIFI_STA);

  // Init ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }

  // Register receive callback
  esp_now_register_recv_cb(OnDataRecv);
}

void loop() {
  unsigned long currentTime = millis();

  // Check if any motors need to be stopped
  if (motor1StopTime != 0 && currentTime >= motor1StopTime) {
    stopMotor(motor1, motor1StopTime);
  }
  if (motor2StopTime != 0 && currentTime >= motor2StopTime) {
    stopMotor(motor2, motor2StopTime);
  }
  if (motor3StopTime != 0 && currentTime >= motor3StopTime) {
    stopMotor(motor3, motor3StopTime);
  }
  if (motor4StopTime != 0 && currentTime >= motor4StopTime) {
    stopMotor(motor4, motor4StopTime);
  }
}

// Callback function when data is received
#if defined(ESP_IDF_VERSION) && ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *data, int len) {
#else
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *data, int len) {
#endif
  // Copy the received data into the incomingData structure
  memcpy(&incomingData, data, sizeof(incomingData));

  // Trigger motors based on received data
  if (incomingData.finger1 == HIGH) {
    runMotor(motor1, motor1StopTime);
  }
  if (incomingData.finger2 == HIGH) {
    runMotor(motor2, motor2StopTime);
  }
  if (incomingData.finger3 == HIGH) {
    runMotor(motor3, motor3StopTime);
  }
  if (incomingData.finger4 == HIGH) {
    runMotor(motor4, motor4StopTime);
  }
}

void runMotor(int motorPin, unsigned long &motorStopTime) {
  digitalWrite(motorPin, HIGH);
  motorStopTime = millis() + motorRunTime;
}

void stopMotor(int motorPin, unsigned long &motorStopTime) {
  digitalWrite(motorPin, LOW);
  motorStopTime = 0;
}
