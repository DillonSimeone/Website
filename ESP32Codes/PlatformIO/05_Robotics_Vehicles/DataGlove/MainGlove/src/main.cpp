#include <Arduino.h>

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
const unsigned long motorRunTime = 100;

unsigned long lastUpdateTime = 0;
const unsigned long updateInterval = 10; // Interval for non-blocking loop updates

unsigned long motor1StopTime = 0;
unsigned long motor2StopTime = 0;
unsigned long motor3StopTime = 0;
unsigned long motor4StopTime = 0;

// Function prototypes
void updateSensor(int sensorPin, int &sensorState, int &sensorPreviousState, unsigned long &sensorLastDebounceTime, const char* sensorName, int motorPin, unsigned long &motorStopTime);
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
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastUpdateTime >= updateInterval) {
    lastUpdateTime = currentTime;

    // Check and update sensor states
    updateSensor(finger1HallwaySensor, finger1HallwaySensorState, finger1HallwaySensorPreviousState, finger1HallwaySensorLastDebounceTime, "Hallway Sensor 1", motor1, motor1StopTime);
    updateSensor(finger2HallwaySensor, finger2HallwaySensorState, finger2HallwaySensorPreviousState, finger2HallwaySensorLastDebounceTime, "Hallway Sensor 2", motor2, motor2StopTime);
    updateSensor(finger3HallwaySensor, finger3HallwaySensorState, finger3HallwaySensorPreviousState, finger3HallwaySensorLastDebounceTime, "Hallway Sensor 3", motor3, motor3StopTime);
    updateSensor(finger4HallwaySensor, finger4HallwaySensorState, finger4HallwaySensorPreviousState, finger4HallwaySensorLastDebounceTime, "Hallway Sensor 4", motor4, motor4StopTime);
  }

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

void updateSensor(int sensorPin, int &sensorState, int &sensorPreviousState, unsigned long &sensorLastDebounceTime, const char* sensorName, int motorPin, unsigned long &motorStopTime) {
  int sensorReading = digitalRead(sensorPin);

  if (sensorReading != sensorPreviousState) {
    sensorLastDebounceTime = millis();
  }

  if ((millis() - sensorLastDebounceTime) > debounceDelay) {
    if (sensorReading != sensorState) {
      sensorState = sensorReading;
      Serial.print(sensorName);
      Serial.print(" state changed to: ");
      Serial.println(sensorState);

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
