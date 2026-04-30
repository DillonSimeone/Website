#include <Arduino.h>
#include <EEPROM.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <SPI.h>
#include <Bootsel.h>
#include <BTstackLib.h>

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
//  BLE Service & Characteristic UUIDs
// ============================================================
#define BLE_SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define BLE_CHARACTERISTIC_UUID "87654321-4321-4321-4321-cba987654321"

// We use value_handle to keep track of the dynamic characteristic
uint16_t inputCharHandle = 0;

// ============================================================
//  State & Display
// ============================================================
GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);

// 0 = None, 1 = Input 1, 2 = Input 2
int currentInput = 0; 
uint8_t currentBleAck = 0xFF; // Used to track the BLE hex code

// Forward declaration
void flashLED();
void setInput(int inputID);

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

  // 4. Update BLE Value so app stays in sync
  currentBleAck = (currentInput == 0) ? 0xFF : currentInput;
  // Note: we just update the backing variable. BTstack reads this on next read request.

  // 5. UI Update (Fast partial)
  drawUI();
}

void flashLED() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(100);
  digitalWrite(LED_BUILTIN, LOW);
  delay(100);
  digitalWrite(LED_BUILTIN, HIGH);
  delay(100);
  digitalWrite(LED_BUILTIN, LOW);
}

// ---- BTstack Callbacks ----
void deviceConnectedCallback(BLEStatus status, BLEDevice *device) {
  (void) device;
  if (status == BLE_STATUS_OK) {
    Serial.println("BLE Device connected!");
  }
}

void deviceDisconnectedCallback(BLEDevice * device) {
  (void) device;
  Serial.println("BLE Device disconnected.");
}

uint16_t gattReadCallback(uint16_t value_handle, uint8_t * buffer, uint16_t buffer_size) {
  (void) buffer_size;
  if (value_handle == inputCharHandle) {
    if (buffer) {
      buffer[0] = currentBleAck;
    }
    return 1;
  }
  return 0;
}

int gattWriteCallback(uint16_t value_handle, uint8_t *buffer, uint16_t size) {
  if (value_handle == inputCharHandle && size > 0) {
    uint8_t value = buffer[0];
    
    // Flash LED on BLE command receive
    flashLED();
    
    Serial.print("BLE received command: ");
    Serial.println(value, HEX);

    if (value == 0x01) {
      setInput(1);
    } else if (value == 0x02) {
      setInput(2);
    } else if (value == 0xFF) {
      setInput(0);
    }
  }
  return 0;
}

void setup() {
  Serial.begin(115200);
  
  // Initialize EEPROM before we read from it
  EEPROM.begin(256);
  
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  delay(1000);
  Serial.println("\n=== Bioni Input Switcher - Main App (BTstack BLE + EEPROM) ===");

  // Set up output pins
  pinMode(INPUT_1_PIN, OUTPUT);
  pinMode(INPUT_2_PIN, OUTPUT);
  
  // Read saved state from EEPROM
  int savedInput = EEPROM.read(0);
  if (savedInput > 2) savedInput = 0;
  
  currentInput = savedInput;
  digitalWrite(INPUT_1_PIN, (currentInput == 1) ? HIGH : LOW);
  digitalWrite(INPUT_2_PIN, (currentInput == 2) ? HIGH : LOW);

  // Setup BLE via BTstack
  BTstack.setBLEDeviceConnectedCallback(deviceConnectedCallback);
  BTstack.setBLEDeviceDisconnectedCallback(deviceDisconnectedCallback);
  BTstack.setGATTCharacteristicRead(gattReadCallback);
  BTstack.setGATTCharacteristicWrite(gattWriteCallback);

  BTstack.addGATTService(new UUID(BLE_SERVICE_UUID));
  inputCharHandle = BTstack.addGATTCharacteristicDynamic(
      new UUID(BLE_CHARACTERISTIC_UUID), 
      ATT_PROPERTY_READ | ATT_PROPERTY_WRITE | ATT_PROPERTY_NOTIFY, 
      0
  );

  BTstack.setup("BioniBLE");
  BTstack.startAdvertising();
  Serial.println("BTstack BLE Peripheral Advertising...");

  // Display Init
  SPI.setSCK(2);
  SPI.setTX(3);
  SPI.begin();
  
  display.init(115200, false, 2, false); 
  display.setRotation(1);
  
  drawUI();
}

bool lastBootselState = false;

void loop() {
  BTstack.loop();

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
  
  delay(10); // Small delay, poll frequently
}
