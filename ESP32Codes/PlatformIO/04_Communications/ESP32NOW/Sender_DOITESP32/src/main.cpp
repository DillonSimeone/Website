#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// Receiver's MAC address
uint8_t receiverMac[] = {0xC8, 0xF0, 0x9E, 0xF2, 0xCA, 0x44};

// Pin where the piezo sensor is connected
const int piezoPin = 4;
const int threshold = 50;  // Define the threshold for significant change
int lastPiezoValue = 0;    // Store the last piezo value
unsigned long previousMillis = 0;  // Store the last time a message was sent
const long interval = 100;  // Interval at which to read the sensor (2 seconds)

// Function prototypes
void sendMessage(int value);

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  Serial.println("ESPNow Sender");

  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }

  // Register peer
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, receiverMac, 6);
  peerInfo.channel = 0;  
  peerInfo.encrypt = false;
  
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return;
  }

  // Initialize the piezo sensor pin
  pinMode(piezoPin, INPUT);
}

void sendMessage(int value) {
  esp_err_t result = esp_now_send(receiverMac, (uint8_t *)&value, sizeof(value));
  
  if (result == ESP_OK) {
    Serial.println("Message sent successfully");
  } else {
    Serial.println("Error sending message");
  }
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;

    int piezoValue = analogRead(piezoPin);
    Serial.print("Piezo Value: ");
    Serial.println(piezoValue);

    if (abs(piezoValue - lastPiezoValue) >= threshold) {
      sendMessage(piezoValue); //Idea here: Have a color for each thresold of piezoValue? 10-20 = red, 20-30 = ...
      Serial.println("Piezo Value sent!");
      lastPiezoValue = piezoValue;  // Update the last piezo value
    }
  }
}
