#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// Define the sensor pins
#define finger1HallwaySensor 17
#define finger2HallwaySensor 16
#define finger3HallwaySensor 6
#define finger4HallwaySensor 4

// Define the motor pins
#define motor1 5
#define motor2 23
#define motor3 22
#define motor4 21

// Sensor states and debounce variables
int finger1HallwaySensorState;
int finger1HallwaySensorPreviousState = LOW;
unsigned long finger1HallwaySensorLastDebounceTime = 0;

int finger2HallwaySensorState;
int finger2HallwaySensorPreviousState = LOW;
unsigned long finger2HallwaySensorLastDebounceTime = 0;

int finger3HallwaySensorState;
int finger3HallwaySensorPreviousState = LOW;
unsigned long finger3HallwaySensorLastDebounceTime = 0;

int finger4HallwaySensorState;
int finger4HallwaySensorPreviousState = LOW;
unsigned long finger4HallwaySensorLastDebounceTime = 0;

const unsigned long debounceDelay = 50;
unsigned long lastUpdateTime = 0;
const unsigned long updateInterval = 10; // Interval for non-blocking loop updates

// Timer variables for each motor
unsigned long motor1StopTime = 0;
unsigned long motor2StopTime = 0;
unsigned long motor3StopTime = 0;
unsigned long motor4StopTime = 0;

const unsigned long motorRunTime = 100; // Motor run time in milliseconds

// Structure to send data
typedef struct struct_message {
  int finger1;
  int finger2;
  int finger3;
  int finger4;
} struct_message;

struct_message myData;

// Peer information
esp_now_peer_info_t peerInfo;

// MAC address of the receiver (Glove 2)
uint8_t broadcastAddress[] = {0x54, 0x32, 0x04, 0x09, 0xEE, 0x10}; // Replace with the MAC address of the receiver

// Function prototypes
void updateSensor(int sensorPin, int &sensorState, int &sensorPreviousState, unsigned long &sensorLastDebounceTime, int &fingerState, int motorPin, unsigned long &motorStopTime);
void runMotor(int motorPin, unsigned long &motorStopTime);
void stopMotor(int motorPin, unsigned long &motorStopTime);

void setup() {
  // Initialize the sensor pins as input
  pinMode(finger1HallwaySensor, INPUT);
  pinMode(finger2HallwaySensor, INPUT);
  pinMode(finger3HallwaySensor, INPUT);
  pinMode(finger4HallwaySensor, INPUT);

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

  // Register peer
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0;  
  peerInfo.encrypt = false;
  
  // Add peer        
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return;
  }
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

  if (currentTime - lastUpdateTime >= updateInterval) {
    lastUpdateTime = currentTime;

    // Update and debounce sensor states
    updateSensor(finger1HallwaySensor, finger1HallwaySensorState, finger1HallwaySensorPreviousState, finger1HallwaySensorLastDebounceTime, myData.finger1, motor1, motor1StopTime);
    updateSensor(finger2HallwaySensor, finger2HallwaySensorState, finger2HallwaySensorPreviousState, finger2HallwaySensorLastDebounceTime, myData.finger2, motor2, motor2StopTime);
    updateSensor(finger3HallwaySensor, finger3HallwaySensorState, finger3HallwaySensorPreviousState, finger3HallwaySensorLastDebounceTime, myData.finger3, motor3, motor3StopTime);
    updateSensor(finger4HallwaySensor, finger4HallwaySensorState, finger4HallwaySensorPreviousState, finger4HallwaySensorLastDebounceTime, myData.finger4, motor4, motor4StopTime);

    // Send message via ESP-NOW
    esp_err_t result = esp_now_send(broadcastAddress, (uint8_t *) &myData, sizeof(myData));
    
    if (result == ESP_OK) {
      Serial.println("Sent with success");
    } else {
      Serial.println("Error sending the data");
    }
  }
}

void updateSensor(int sensorPin, int &sensorState, int &sensorPreviousState, unsigned long &sensorLastDebounceTime, int &fingerState, int motorPin, unsigned long &motorStopTime) {
  int sensorReading = digitalRead(sensorPin);

  if (sensorReading != sensorPreviousState) {
    sensorLastDebounceTime = millis();
  }

  if ((millis() - sensorLastDebounceTime) > debounceDelay) {
    if (sensorReading != sensorState) {
      sensorState = sensorReading;
      fingerState = sensorState;
      if (sensorState == HIGH) {
        runMotor(motorPin, motorStopTime);
      }
    }
  }

  sensorPreviousState = sensorReading;
}

void runMotor(int motorPin, unsigned long &motorStopTime) {
  digitalWrite(motorPin, HIGH);
  motorStopTime = millis() + motorRunTime;
}

void stopMotor(int motorPin, unsigned long &motorStopTime) {
  digitalWrite(motorPin, LOW);
  motorStopTime = 0;
}
