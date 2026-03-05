#include <Arduino.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <SPI.h>

// ============================================================
//  CONFIG
// ============================================================
// Extra delay between frames in ms (0 = full hardware speed)
#define ANIM_SPEED_MS   0
// Characters typed to screen per frame
#define CHARS_PER_FRAME 5

// ============================================================
//  Pins  (SCK=GP2, MOSI=GP3 set below in setup)
// ============================================================
#define EPD_CS   5
#define EPD_DC   6
#define EPD_RST  7
#define EPD_BUSY 8

// Fixed cell size for FreeMonoBold9pt7b (true monospace)
#define CHAR_W  11
#define CHAR_H  18

// ============================================================
//  Display — GxEPD2_290_BS (SSD1680), fast partial refresh
// ============================================================
GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);

// ============================================================
//  State Machine
// ============================================================
enum State { TYPING, SLIDING_TEXT, BOUNCING_SHAPES, FLICKER_LOOP };
State currentState = TYPING;

// --- TYPING ---
const char PHRASE[] = "All work and no play makes Jack a dull boy. ";
const int  PHRASE_LEN = sizeof(PHRASE) - 1;
int charIndex = 0;

// --- SLIDING ---
int slideOffset = 0;

// --- BOUNCING ---
struct Shape { float x, y, vx, vy; bool isCircle; };
#define NUM_SHAPES 6
Shape shapes[NUM_SHAPES];
int bounceFrames = 0;

// --- FLICKER ---
int flickerCount = 0;

// ============================================================
//  Helpers
// ============================================================
void charToXY(int idx, int &cx, int &cy) {
  int charsPerRow = (display.width() - 10) / CHAR_W;
  cx = 5 + (idx % charsPerRow) * CHAR_W;
  cy = CHAR_H + (idx / charsPerRow) * CHAR_H;
}

bool screenFull() {
  int charsPerRow = (display.width() - 10) / CHAR_W;
  return ((charIndex / charsPerRow) + 1) * CHAR_H >= display.height();
}

void drawTextBuffer(int yOffset = 0) {
  display.setFont(&FreeMonoBold9pt7b);
  display.setTextColor(GxEPD_BLACK);
  for (int i = 0; i < charIndex; i++) {
    int cx, cy;
    charToXY(i, cx, cy);
    cy += yOffset;
    if (cy < 0 || cy > display.height() + CHAR_H) continue;
    display.setCursor(cx, cy);
    display.print(PHRASE[i % PHRASE_LEN]);
  }
}

void setupShapes() {
  for (int i = 0; i < NUM_SHAPES; i++) {
    shapes[i].x  = random(20, display.width()  - 20);
    shapes[i].y  = random(20, display.height() - 20);
    shapes[i].vx = (random(4, 10)) * (random(0,2) ? 1 : -1);
    shapes[i].vy = (random(4, 10)) * (random(0,2) ? 1 : -1);
    shapes[i].isCircle = random(0, 2);
  }
}

// Full-screen partial wipe — fast, no red-ink waveform triggered.
void partialWipe() {
  display.setPartialWindow(0, 0, display.width(), display.height());
  display.firstPage();
  do { display.fillScreen(GxEPD_WHITE); } while (display.nextPage());
}

// One-time startup full wipe — mandatory to prime SSD1680 for partial refresh.
// Without this, every setPartialWindow() call falls back to full-refresh speed.
void primingWipe() {
  display.setFullWindow();
  display.firstPage();
  do { display.fillScreen(GxEPD_WHITE); } while (display.nextPage());
}

// ============================================================
//  Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  SPI.setSCK(2);
  SPI.setTX(3);
  SPI.begin();

  display.init(115200, true, 2, false);
  display.setRotation(1);

  primingWipe();
  delay(500);
}

// ============================================================
//  Loop
// ============================================================
void loop() {

  // ===== TYPING =====
  if (currentState == TYPING) {
    for (int k = 0; k < CHARS_PER_FRAME; k++) {
      charIndex++;
      if (screenFull()) break;
    }

    display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);
      drawTextBuffer();
    } while (display.nextPage());

    if (screenFull()) {
      currentState = SLIDING_TEXT;
      slideOffset  = 0;
    }
  }

  // ===== SLIDING TEXT =====
  else if (currentState == SLIDING_TEXT) {
    slideOffset += 12;

    display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);
      drawTextBuffer(slideOffset);
    } while (display.nextPage());

    if (slideOffset > display.height() + 20) {
      setupShapes();
      bounceFrames = 0;
      currentState = BOUNCING_SHAPES;
      partialWipe();
      delay(300);
    }
  }

  // ===== BOUNCING SHAPES =====
  else if (currentState == BOUNCING_SHAPES) {
    for (int i = 0; i < NUM_SHAPES; i++) {
      shapes[i].x += shapes[i].vx;
      shapes[i].y += shapes[i].vy;
      if (shapes[i].x < 12 || shapes[i].x > display.width()  - 12) shapes[i].vx *= -1;
      if (shapes[i].y < 12 || shapes[i].y > display.height() - 12) shapes[i].vy *= -1;
    }

    display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);

      for (int i = 0; i < NUM_SHAPES; i++) {
        if (shapes[i].isCircle)
          display.fillCircle((int)shapes[i].x, (int)shapes[i].y, 14, GxEPD_BLACK);
        else
          display.fillRect((int)shapes[i].x - 10, (int)shapes[i].y - 10, 20, 20, GxEPD_BLACK);
      }

      // White dot where shapes overlap
      for (int i = 0; i < NUM_SHAPES; i++) {
        for (int j = i + 1; j < NUM_SHAPES; j++) {
          float dx = shapes[i].x - shapes[j].x;
          float dy = shapes[i].y - shapes[j].y;
          if ((dx*dx + dy*dy) < 900.0f) {
            int mx = (int)((shapes[i].x + shapes[j].x) * 0.5f);
            int my = (int)((shapes[i].y + shapes[j].y) * 0.5f);
            display.fillCircle(mx, my, 7, GxEPD_WHITE);
          }
        }
      }
    } while (display.nextPage());

    // Periodic ghosting clear (partial — no red waveform)
    if (bounceFrames > 0 && bounceFrames % 80 == 0) partialWipe();

    bounceFrames++;
    if (bounceFrames > 200) {
      currentState = FLICKER_LOOP;
      flickerCount = 0;
    }
  }

  // ===== FLICKER LOOP =====
  else if (currentState == FLICKER_LOOP) {
    display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(flickerCount % 2 == 0 ? GxEPD_WHITE : GxEPD_BLACK);
    } while (display.nextPage());

    flickerCount++;
    if (flickerCount > 8) {
      charIndex    = 0;
      currentState = TYPING;
      partialWipe();
      delay(500);
    }
  }

  if (ANIM_SPEED_MS > 0) delay(ANIM_SPEED_MS);
}
