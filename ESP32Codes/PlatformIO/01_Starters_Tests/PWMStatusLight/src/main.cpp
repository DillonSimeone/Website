/*
 * PWMStatusLight - ESP32-C3 SuperMini
 * 
 * Smoothly fades the onboard status LED (GPIO 8) using PWM.
 * The LED fades from 0% to 100% brightness over 1.5 seconds,
 * then back from 100% to 0% over 1.5 seconds (3 seconds total cycle).
 * 
 * Board: ESP32C3 Dev Module
 * USB CDC On Boot: Enabled
 */

#include <Arduino.h>

// --- Hardware Configuration ---
const int LED_PIN = 8;              // Onboard Blue LED

// --- PWM Configuration ---
const int PWM_CHANNEL = 0;          // LEDC channel (0-5 on ESP32-C3)
const int PWM_FREQUENCY = 5000;     // PWM frequency in Hz
const int PWM_RESOLUTION = 8;       // 8-bit resolution (0-255)
const int PWM_MAX_DUTY = 255;       // Maximum duty cycle (2^8 - 1)

// --- Timing Configuration ---
const unsigned long FADE_DURATION_MS = 3000;  // Time to fade in OR out (ms)
const unsigned long TOTAL_CYCLE_MS = FADE_DURATION_MS * 2;  // Full cycle = 3000ms

void setup() {
  Serial.begin(115200);
  delay(500);  // Allow USB CDC to initialize
  
  Serial.println("=================================");
  Serial.println("PWM Status Light - ESP32-C3");
  Serial.println("=================================");
  Serial.println("LED Pin: GPIO 8");
  Serial.println("Fade cycle: 3 seconds (1.5s in, 1.5s out)");
  Serial.println();

  // Configure LEDC PWM (legacy API for compatibility)
  ledcSetup(PWM_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttachPin(LED_PIN, PWM_CHANNEL);
  
  Serial.println("PWM initialized. Starting fade cycle...");
}

void loop() {
  // Calculate where we are in the 3-second cycle
  unsigned long elapsedTime = millis() % TOTAL_CYCLE_MS;
  
  int dutyCycle;
  
  if (elapsedTime < FADE_DURATION_MS) {
    // --- FADE IN PHASE (0 to 1.5 seconds) ---
    // Map elapsed time (0 to 1500) to duty cycle (0 to 255)
    dutyCycle = map(elapsedTime, 0, FADE_DURATION_MS, 0, PWM_MAX_DUTY);
  } else {
    // --- FADE OUT PHASE (1.5 to 3 seconds) ---
    // Map elapsed time (1500 to 3000) to duty cycle (255 to 0)
    unsigned long fadeOutTime = elapsedTime - FADE_DURATION_MS;
    dutyCycle = map(fadeOutTime, 0, FADE_DURATION_MS, PWM_MAX_DUTY, 0);
  }
  
  // Apply the PWM duty cycle to the LED (use channel, not pin)
  ledcWrite(PWM_CHANNEL, dutyCycle);
  
  // Small delay for smooth animation (~60 updates per second)
  delay(16);
}

