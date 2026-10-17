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
unsigned long updateInterval = 500; // Update interval in milliseconds

#define LED_PIN 17
#define LED_COUNT 12
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

#define finger1HallwaySensor 4
int finger1HallwaySensorState;
int finger1HallwaySensorPreviousState = LOW;
unsigned long finger1HallwaySensorlastDebounceTime = 0;
unsigned long debounceDelay = 50;

void setup() {
  // Initialize I2C communication as master
  Wire.begin();
  
  // Initialize OLED display
  if(!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  
  
  
  
    // Clear the display
    display.clearDisplay();
    display.setCursor(0, 0);
     // Set text size
    display.setTextSize(1.5);
    // Set text color to white
    display.setTextColor(SSD1306_WHITE);
    display.print("From the moment I understood the weakness of my flesh, it disgusted me. I craved the strength and certainty of steel. I aspired to the purity of the Blessed Machine. Your kind cling to your flesh, as though it will not decay and fail you. One day the crude biomass you call the temple will wither, and you will beg my kind to save you. But I am already saved, for the Machine is immortal… Even in death I serve the Omnissiah.");
    display.startscrolldiagleft(0x00, 0x0F);
    display.display();

    strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
    strip.show();            // Turn OFF all pixels ASAP
    strip.setBrightness(50); // Set BRIGHTNESS to about 1/5 (max = 255)
}

void loop() {
  display.display();
  // Check if it's time to update the display

  unsigned long currentTime = millis();
  if (currentTime - lastUpdateTime >= updateInterval) { //Nonblocking code loop updates

     int finger1HallwaySensorReading = digitalRead(finger1HallwaySensor);

    if(finger1HallwaySensorReading != finger1HallwaySensorPreviousState)
      finger1HallwaySensorlastDebounceTime = millis();
    
    if((millis() - finger1HallwaySensorlastDebounceTime) > debounceDelay)
      if(finger1HallwaySensorReading != finger1HallwaySensorState)
        finger1HallwaySensorState = finger1HallwaySensorReading;

    finger1HallwaySensorPreviousState = finger1HallwaySensorReading;
    /*
    display.clearDisplay();
    display.setCursor(0, 0);
    display.print("Hallway Sensor 1 reading: ");
    display.println(finger1HallwaySensorReading);
    */

      // Display distance on OLED screen
      /*
      // Send ping, get distance in centimeters and print result (0 = outside set distance range)
      unsigned int distance = sonar.ping_cm();
      display.setCursor(0, 0);
      display.print("Distance:");
      if (distance == 0) {
        display.println("Out of range");
      } else {
        display.print(distance);
        display.println(" cm");
      }
      */

      // Fill along the length of the strip in various colors...
      colorWipe(strip.Color(255,   0,   0), 50); // Red
      colorWipe(strip.Color(  0, 255,   0), 50); // Green
      colorWipe(strip.Color(  0,   0, 255), 50); // Blue

      // Do a theater marquee effect in various colors...
      theaterChase(strip.Color(127, 127, 127), 50); // White, half brightness
      theaterChase(strip.Color(127,   0,   0), 50); // Red, half brightness
      theaterChase(strip.Color(  0,   0, 127), 50); // Blue, half brightness

      rainbow(10);             // Flowing rainbow cycle along the whole strip
      theaterChaseRainbow(100); // Rainbow-enhanced theaterChase variant

    lastUpdateTime = currentTime;
  }
  
  // Other tasks can be performed here
}

// Fill strip pixels one after another with a color. Strip is NOT cleared
// first; anything there will be covered pixel by pixel. Pass in color
// (as a single 'packed' 32-bit value, which you can get by calling
// strip.Color(red, green, blue) as shown in the loop() function above),
// and a delay time (in milliseconds) between pixels.
void colorWipe(uint32_t color, int wait) {
  for(int i=0; i<strip.numPixels(); i++) { // For each pixel in strip...
    strip.setPixelColor(i, color);         //  Set pixel's color (in RAM)
    strip.show();                          //  Update strip to match
    delay(wait);                           //  Pause for a moment
  }
}

// Theater-marquee-style chasing lights. Pass in a color (32-bit value,
// a la strip.Color(r,g,b) as mentioned above), and a delay time (in ms)
// between frames.
void theaterChase(uint32_t color, int wait) {
  for(int a=0; a<10; a++) {  // Repeat 10 times...
    for(int b=0; b<3; b++) { //  'b' counts from 0 to 2...
      strip.clear();         //   Set all pixels in RAM to 0 (off)
      // 'c' counts up from 'b' to end of strip in steps of 3...
      for(int c=b; c<strip.numPixels(); c += 3) {
        strip.setPixelColor(c, color); // Set pixel 'c' to value 'color'
      }
      strip.show(); // Update strip with new contents
      delay(wait);  // Pause for a moment
    }
  }
}

// Rainbow cycle along whole strip. Pass delay time (in ms) between frames.
void rainbow(int wait) {
  // Hue of first pixel runs 5 complete loops through the color wheel.
  // Color wheel has a range of 65536 but it's OK if we roll over, so
  // just count from 0 to 5*65536. Adding 256 to firstPixelHue each time
  // means we'll make 5*65536/256 = 1280 passes through this loop:
  for(long firstPixelHue = 0; firstPixelHue < 5*65536; firstPixelHue += 256) {
    // strip.rainbow() can take a single argument (first pixel hue) or
    // optionally a few extras: number of rainbow repetitions (default 1),
    // saturation and value (brightness) (both 0-255, similar to the
    // ColorHSV() function, default 255), and a true/false flag for whether
    // to apply gamma correction to provide 'truer' colors (default true).
    strip.rainbow(firstPixelHue);
    // Above line is equivalent to:
    // strip.rainbow(firstPixelHue, 1, 255, 255, true);
    strip.show(); // Update strip with new contents
    delay(wait);  // Pause for a moment
  }
}

// Rainbow-enhanced theater marquee. Pass delay time (in ms) between frames.
void theaterChaseRainbow(int wait) {
  int firstPixelHue = 0;     // First pixel starts at red (hue 0)
  for(int a=0; a<30; a++) {  // Repeat 30 times...
    for(int b=0; b<3; b++) { //  'b' counts from 0 to 2...
      strip.clear();         //   Set all pixels in RAM to 0 (off)
      // 'c' counts up from 'b' to end of strip in increments of 3...
      for(int c=b; c<strip.numPixels(); c += 3) {
        // hue of pixel 'c' is offset by an amount to make one full
        // revolution of the color wheel (range 65536) along the length
        // of the strip (strip.numPixels() steps):
        int      hue   = firstPixelHue + c * 65536L / strip.numPixels();
        uint32_t color = strip.gamma32(strip.ColorHSV(hue)); // hue -> RGB
        strip.setPixelColor(c, color); // Set pixel 'c' to value 'color'
      }
      strip.show();                // Update strip with new contents
      delay(wait);                 // Pause for a moment
      firstPixelHue += 65536 / 90; // One cycle of color wheel over 90 frames
    }
  }
}

