#include <Arduino.h>
#include <GxEPD2_3C.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <SPI.h>

// ============================================================
//  CONFIG
// ============================================================
// Extra delay between frames in ms. (For slow screens, unnecessary)
#define ANIM_SPEED_MS   0
// Characters typed to screen per frame (cranked up since each frame is 15s)
#define CHARS_PER_FRAME 20

// ============================================================
//  Pins 
// ============================================================
#define EPD_CS   5
#define EPD_DC   6
#define EPD_RST  7
#define EPD_BUSY 8

#define CHAR_W  11
#define CHAR_H  18

// ============================================================
//  Display — GxEPD2_290_C90c (SSD1680 Tri-Color), slow full refresh
// ============================================================
GxEPD2_3C<GxEPD2_290_C90c, GxEPD2_290_C90c::HEIGHT> display(
    GxEPD2_290_C90c(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);

enum State { TYPING, FLICKER_LOOP };
State currentState = TYPING;

const char PHRASE[] = "All work and no play makes Jack a dull boy. ";
const int  PHRASE_LEN = sizeof(PHRASE) - 1;
int charIndex = 0;
int flickerCount = 0;

void charToXY(int idx, int &cx, int &cy) {
  int charsPerRow = (display.width() - 10) / CHAR_W;
  cx = 5 + (idx % charsPerRow) * CHAR_W;
  cy = CHAR_H + (idx / charsPerRow) * CHAR_H;
}

bool screenFull() {
  int charsPerRow = (display.width() - 10) / CHAR_W;
  return ((charIndex / charsPerRow) + 1) * CHAR_H >= display.height();
}

void drawTextBuffer() {
  display.setFont(&FreeMonoBold9pt7b);
  display.setTextColor(GxEPD_BLACK);
  for (int i = 0; i < charIndex; i++) {
    int cx, cy;
    charToXY(i, cx, cy);
    if (cy > display.height() + CHAR_H) continue;
    // Every 5th char is RED just to show the tri-color ability
    if (i % 5 == 0) display.setTextColor(GxEPD_RED);
    else display.setTextColor(GxEPD_BLACK);
    
    display.setCursor(cx, cy);
    display.print(PHRASE[i % PHRASE_LEN]);
  }
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
}

void loop() {
  if (currentState == TYPING) {
    for (int k = 0; k < CHARS_PER_FRAME; k++) {
      charIndex++;
      if (screenFull()) break;
    }

    display.setFullWindow(); // Tri-Color requires full window updates always
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);
      drawTextBuffer();
    } while (display.nextPage());

    if (screenFull()) {
      currentState = FLICKER_LOOP;
      flickerCount = 0;
    }
  }
  else if (currentState == FLICKER_LOOP) {
    display.setFullWindow();
    display.firstPage();
    do {
      if      (flickerCount % 3 == 0) display.fillScreen(GxEPD_WHITE);
      else if (flickerCount % 3 == 1) display.fillScreen(GxEPD_RED);
      else                            display.fillScreen(GxEPD_BLACK);
    } while (display.nextPage());

    flickerCount++;
    if (flickerCount > 6) {
      charIndex    = 0;
      currentState = TYPING;
    }
  }

  if (ANIM_SPEED_MS > 0) delay(ANIM_SPEED_MS);
}
