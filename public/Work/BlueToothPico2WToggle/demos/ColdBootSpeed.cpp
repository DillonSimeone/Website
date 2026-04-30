#include <Arduino.h>
#include <EEPROM.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <SPI.h>
#include <Bootsel.h>

// ============================================================
//  Hardware Pins
// ============================================================
// E-Ink SPI Control (SPI0 defaults mapped to GP2(SCK), GP3(MOSI))
#define EPD_CS   5
#define EPD_DC   6
#define EPD_RST  7
#define EPD_BUSY 8

// Outputs
#define INPUT_1_PIN 10
#define INPUT_2_PIN 11

// ============================================================
//  State & Display
// ============================================================
GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);

// 0 = None, 1 = Input 1, 2 = Input 2
int currentInput = 0; 

// ============================================================
//  E-Ink Drawing Helpers
// ============================================================
void drawUI() {
  // We use fast partial refresh exclusively for the UI.
  display.setPartialWindow(0, 0, display.width(), display.height());
  display.firstPage();
  do {
    if (currentInput == 1) {
      // INPUT 1: Black text on White background
      display.fillScreen(GxEPD_WHITE);
      display.setTextColor(GxEPD_BLACK);
      
      display.setFont(&FreeSansBold18pt7b);
      display.setCursor(30, 80);
      display.print("INPUT 1");
      
      // Optional: Draw a nice border
      display.drawRect(4, 4, display.width() - 8, display.height() - 8, GxEPD_BLACK);
      display.drawRect(5, 5, display.width() - 10, display.height() - 10, GxEPD_BLACK);
      
    } else if (currentInput == 2) {
      // INPUT 2: White text on Solid Black background (Inverted)
      display.fillScreen(GxEPD_BLACK);
      display.setTextColor(GxEPD_WHITE);
      
      display.setFont(&FreeSansBold18pt7b);
      display.setCursor(30, 80);
      display.print("INPUT 2");
      
      // Optional: Inverted border
      display.drawRect(4, 4, display.width() - 8, display.height() - 8, GxEPD_WHITE);
      display.drawRect(5, 5, display.width() - 10, display.height() - 10, GxEPD_WHITE);
      
    } else {
      // NONE: Clean white screen with "---"
      display.fillScreen(GxEPD_WHITE);
      display.setTextColor(GxEPD_BLACK);
      
      display.setFont(&FreeSansBold18pt7b);
      display.setCursor(120, 80);
      display.print("---");
    }
  } while (display.nextPage());
}

// ============================================================
//  Core Logic
// ============================================================
void setInput(int inputID) {
  if (currentInput == inputID) return; // No change
  
  // 1. Update State
  currentInput = inputID;
  Serial.print("Input selected: ");
  Serial.println(currentInput);

  // 2. Hardware toggles
  digitalWrite(INPUT_1_PIN, (currentInput == 1) ? HIGH : LOW);
  digitalWrite(INPUT_2_PIN, (currentInput == 2) ? HIGH : LOW);

  // 3. Save state to EEPROM
  EEPROM.write(0, currentInput);
  EEPROM.commit();
  Serial.println("Saved state to EEPROM.");

  // 4. UI Update (Fast partial)
  drawUI();
}

void setup() {
  Serial.begin(115200);
  
  // Initialize EEPROM before we read from it
  EEPROM.begin(256);
  
  delay(1000);
  Serial.println("\n=== Bioni Input Switcher - Cold Boot Test ===");

  // Set up output pins
  pinMode(INPUT_1_PIN, OUTPUT);
  pinMode(INPUT_2_PIN, OUTPUT);
  
  // Read saved state from EEPROM
  int savedInput = EEPROM.read(0);
  
  // Address uninitialized EEPROM
  if (savedInput > 2) {
    savedInput = 0;
  }
  
  currentInput = savedInput;
  Serial.print("Restored state from EEPROM: ");
  Serial.println(currentInput);

  // Directly set the proper hardware pins upon restoration
  digitalWrite(INPUT_1_PIN, (currentInput == 1) ? HIGH : LOW);
  digitalWrite(INPUT_2_PIN, (currentInput == 2) ? HIGH : LOW);

  // Display Init (notice the 'false' bypasses the primingWipe software lock)
  SPI.setSCK(2);
  SPI.setTX(3);
  SPI.begin();
  
  display.init(115200, false, 2, false); 
  display.setRotation(1);
  
  // Draw initial state directly utilizing partial refresh 
  // It effectively puts the RAM into the identical state that the physical screen is already holding
  drawUI();
}

bool lastBootselState = false;

void loop() {
  bool currentBootsel = BOOTSEL;
  if (currentBootsel && !lastBootselState) {
    int nextInput = (currentInput + 1) % 3;
    setInput(nextInput);
  }
  lastBootselState = currentBootsel;

  if (Serial.available()) {
    char c = Serial.read();
    if (c == '1') setInput(1);
    if (c == '2') setInput(2);
    if (c == '0') setInput(0);
  }
  
  delay(50); 
}
