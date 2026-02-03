#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <NewPing.h>
#include <Adafruit_NeoPixel.h>

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels

// Declaration for an SSD1306 display connected to I2C (SDA, SCL pins)
#define OLED_RESET -1
#define OLED_ADDR 0x3C // Change this to your actual I2C address if different
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define TRIGGER_PIN 5 // Ultrasonic sensor trigger pin
#define ECHO_PIN 4    // Ultrasonic sensor echo pin
#define MAX_DISTANCE 200 // Maximum distance we want to ping for (in centimeters)

NewPing sonar(TRIGGER_PIN, ECHO_PIN, MAX_DISTANCE); // NewPing setup of pins and maximum distance

unsigned long lastUpdateTime = 0;
unsigned long updateInterval = 100; // Update interval in milliseconds

unsigned int wipeCounter = 0;
unsigned long wipeLastUpdateTime = 0;


#define LED_PIN2 17
#define LED_COUNT2 12
Adafruit_NeoPixel strip2(LED_COUNT2, LED_PIN2, NEO_GRB + NEO_KHZ800);

int counter = 0;

// Fill strip pixels one after another with a color. Strip is NOT cleared
// first; anything there will be covered pixel by pixel. Pass in color
// (as a single 'packed' 32-bit value, which you can get by calling
// strip.Color(red, green, blue) as shown in the loop() function above),
// and a delay time (in milliseconds) between pixels.
void colorWipe(uint32_t color, int wait, unsigned int &counter, unsigned long &lastUpdateTime) {
  unsigned long currentTime = millis();
  if (currentTime - lastUpdateTime >= wait) {
    // Set pixel's color (in RAM)
    strip2.setPixelColor(counter, color);
    
    // Update strip to match
    strip2.show();
    
    // Increment counter
    counter++;
    if (counter >= strip2.numPixels()) {
      counter = 0; // Reset counter if it exceeds the number of pixels
    }
    
    // Update last update time
    lastUpdateTime = currentTime;
  }
}

void setup() {
  // Initialize I2C communication as master
  Wire.begin();
  
  // Initialize OLED display
  if(!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  
  // Display initialization
  display.display();
  delay(2000); // Pause for 2 seconds
  
  // Clear the buffer
  display.clearDisplay();
  
  // Set text size
  display.setTextSize(1);
  
  // Set text color to white
  display.setTextColor(SSD1306_WHITE);

  strip2.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip2.show();            // Turn OFF all pixels ASAP
  strip2.setBrightness(50); // Set BRIGHTNESS to about 1/5 (max = 255)
}

void loop() {
  // Check if it's time to update the display
  unsigned long currentTime = millis();
  if (currentTime - lastUpdateTime >= updateInterval) {
    // Send ping, get distance in centimeters and print result (0 = outside set distance range)
    unsigned int distance = sonar.ping_cm();
    
    // Clear the display
    display.clearDisplay();
    
    // Display distance on OLED screen
    display.setCursor(0, 0);
    display.print("Sanity Counter: ");
    display.println(counter);
    counter+=1;
    display.print("Distance: ");
    if (distance == 0) {
      display.print("Out of range:");
      display.print(distance);
      display.println("cm");
      colorWipe(strip2.Color(255, 0, 0), 10, wipeCounter, wipeLastUpdateTime);
    } else {
      display.print(distance);
      display.println(" cm");
      colorWipe(strip2.Color(0, 255, 0), 10, wipeCounter, wipeLastUpdateTime);
    }
    
    // Display to OLED
    display.display();
    
    // Update last update time
    lastUpdateTime = currentTime;
  }
  
  // Other tasks can be performed here
}

