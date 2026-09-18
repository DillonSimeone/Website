/*
  ESP32-C3 SuperMini - Basic Blink Test
  
  This sketch verifies:
  1. The board is booting (Serial output).
  2. The onboard LED (GPIO 8) is functional.
  
  Setup:
  - Board: ESP32C3 Dev Module
  - USB CDC On Boot: Enabled
*/

const int ledPin = 8; // Onboard Blue LED

void setup() {
  // Initialize Serial for debug (requires USB CDC On Boot: Enabled)
  Serial.begin(115200);
  delay(1000);
  Serial.println("Boot complete. Starting blink loop...");

  pinMode(ledPin, OUTPUT);
}

void loop() {
  Serial.println("LED ON");
  digitalWrite(ledPin, HIGH);
  delay(1000);
  
  Serial.println("LED OFF");
  digitalWrite(ledPin, LOW);
  delay(1000);
}
