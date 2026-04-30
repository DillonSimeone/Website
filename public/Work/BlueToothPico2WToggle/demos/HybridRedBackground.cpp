#include <Arduino.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <SPI.h>

// ============================================================
//  CONFIG / Pins
// ============================================================
#define EPD_CS   5
#define EPD_DC   6
#define EPD_RST  7
#define EPD_BUSY 8

GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);

void setRedRAM(uint8_t value) {
  digitalWrite(EPD_CS, LOW);
  digitalWrite(EPD_DC, LOW);
  SPI.transfer(0x4E);
  digitalWrite(EPD_DC, HIGH);
  SPI.transfer(0x00);
  digitalWrite(EPD_CS, HIGH);
  delayMicroseconds(20);

  digitalWrite(EPD_CS, LOW);
  digitalWrite(EPD_DC, LOW);
  SPI.transfer(0x4F);
  digitalWrite(EPD_DC, HIGH);
  SPI.transfer(0x00);
  SPI.transfer(0x00);
  digitalWrite(EPD_CS, HIGH);
  delayMicroseconds(20);

  digitalWrite(EPD_CS, LOW);
  digitalWrite(EPD_DC, LOW);
  SPI.transfer(0x26);
  digitalWrite(EPD_DC, HIGH);
  for (int i = 0; i < 4736; i++) SPI.transfer(value);
  digitalWrite(EPD_CS, HIGH);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  SPI.setSCK(2);
  SPI.setTX(3);
  SPI.begin();

  display.init(115200, true, 2, false);
  display.setRotation(1);

  display.setFullWindow();
  display.firstPage();
  do { display.fillScreen(GxEPD_WHITE); } while (display.nextPage());
  delay(500);

  setRedRAM(0x00);
  delay(50);

  display.setFullWindow();
  display.firstPage();
  do { display.fillScreen(GxEPD_WHITE); } while (display.nextPage());
  delay(1000);
}

void loop() {
  display.setPartialWindow(0, 0, display.width(), display.height());
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeSansBold18pt7b);
    display.setCursor(10, 55);
    display.print("HYBRID MODE");
    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(10, 90);
    display.print("Red stays? Or Slows?");
  } while (display.nextPage());
  
  delay(2000); // 2 second pause
}
