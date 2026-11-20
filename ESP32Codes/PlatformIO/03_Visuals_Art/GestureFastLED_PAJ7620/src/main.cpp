#include <Arduino.h>
#include <Wire.h>
#include <FastLED.h>
#include <RevEng_PAJ7620.h>

// =============================================================================
// HARDWARE PIN DEFINITIONS (Zero-Wire ESP32-C3 SuperMini Edge Header)
// =============================================================================
#define PIN_SOFT_GND   4
#define PIN_LED_DATA   5
#define PIN_STATUS_LED 8
#define PIN_INT        1

int pin_sda = 2;
int pin_scl = 3;

// =============================================================================
// 8x8 LED MATRIX CONFIGURATION
// =============================================================================
#define MATRIX_WIDTH   8
#define MATRIX_HEIGHT  8
#define MAX_LEDS       (MATRIX_WIDTH * MATRIX_HEIGHT) // 64 LEDs
#define LED_TYPE       WS2812B
#define COLOR_ORDER    GRB

// Most 8x8 rigid PCBs (like CJMCU-64) are Progressive (Non-Serpentine).
#define MATRIX_SERPENTINE false

CRGB leds[MAX_LEDS];
CRGB matrixOverlay[MAX_LEDS];

// Helper function to map (x, y) to matrix strip index
uint16_t XY(uint8_t x, uint8_t y) {
  if (x >= MATRIX_WIDTH || y >= MATRIX_HEIGHT) return 0;
  if (MATRIX_SERPENTINE) {
    if (y & 0x01) {
      // Odd row: right to left
      return (y * MATRIX_WIDTH) + (MATRIX_WIDTH - 1 - x);
    } else {
      // Even row: left to right
      return (y * MATRIX_WIDTH) + x;
    }
  } else {
    // Progressive left-to-right on all rows
    return (y * MATRIX_WIDTH) + x;
  }
}

// =============================================================================
// RUNTIME PARAMETERS & SMOOTH TRANSITION TARGETS
// =============================================================================
uint16_t gestureFeedbackSpeed = 1000; // Feedback symbol animation duration in ms

// Smooth decayed targets
float targetLitLeds       = 64.0f;
float currentLitLeds      = 64.0f;

float targetBrightness    = 100.0f;
float currentBrightness   = 100.0f;

uint8_t targetPattern     = 0;
uint8_t currentPattern    = 0;

uint8_t targetPaletteIdx  = 0;
CRGBPalette16 currentPalette16;
CRGBPalette16 targetPalette16;

bool powerOn              = true;
bool sensorInitialized    = false;
bool firstGestureReceived = false;

// Feedback animation state
Gesture activeGestureAnim   = GES_NONE;
uint32_t gestureAnimStart   = 0;
uint32_t gestureCooldownUntil = 0;
uint32_t oppositeLockoutUntil = 0;
Gesture  lockedOutGesture   = GES_NONE;

#define DEBOUNCE_COOLDOWN_MS 350
#define REBOUND_LOCKOUT_MS   800

RevEng_PAJ7620 sensor = RevEng_PAJ7620();

// =============================================================================
// COLOR PALETTES
// =============================================================================
DEFINE_GRADIENT_PALETTE(Cyberpunk_gp) {
    0,   255,   0, 128,   // Hot Magenta
   85,     0, 230, 255,   // Electric Cyan
  170,   150,   0, 255,   // Neon Purple
  255,   255,   0, 128
};

DEFINE_GRADIENT_PALETTE(Sunset_gp) {
    0,   255,  40,   0,   // Deep Orange
   85,   255,   0,  80,   // Rose Pink
  170,    80,   0, 120,   // Twilight Violet
  255,   255,  40,   0
};

DEFINE_GRADIENT_PALETTE(IceFrost_gp) {
    0,   180, 220, 255,   // Pale Ice Blue
  128,   255, 255, 255,   // Pure White Spark
  200,    80, 160, 240,   // Crystal Azure
  255,   180, 220, 255
};

CRGBPalette16 palettes[] = {
  RainbowColors_p,
  OceanColors_p,
  LavaColors_p,
  ForestColors_p,
  PartyColors_p,
  Cyberpunk_gp,
  Sunset_gp,
  IceFrost_gp
};
const uint8_t NUM_PALETTES = sizeof(palettes) / sizeof(palettes[0]);

const char* paletteNames[] = {
  "Rainbow", "Ocean Blue", "Lava Fire", "Emerald Forest",
  "Party Punch", "Cyberpunk Neon", "Sunset Glow", "Ice Frost"
};

const char* patternNames[] = {
  "Rainbow Wave", "Plasma Matrix", "Radial Pulse", "Diagonal Comet",
  "Star Field", "Matrix Rain", "Fire Glow", "Solid Tone"
};
const uint8_t NUM_PATTERNS = sizeof(patternNames) / sizeof(patternNames[0]);

// =============================================================================
// SOLID 8x8 GESTURE BITMAPS (Centered, Static, No Blurring Movement)
// =============================================================================
// MSB = x=0, LSB = x=7
const uint8_t SYMBOL_UP[8] = {
  0b00011000, // ...11... (Tip)
  0b00111100, // ..1111..
  0b01111110, // .111111.
  0b11011011, // 11.11.11
  0b00011000, // ...11... (Shaft)
  0b00011000, // ...11...
  0b00011000, // ...11...
  0b00000000  // ........
};

const uint8_t SYMBOL_DOWN[8] = {
  0b00000000, // ........
  0b00011000, // ...11... (Shaft)
  0b00011000, // ...11...
  0b00011000, // ...11...
  0b11011011, // 11.11.11
  0b01111110, // .111111.
  0b00111100, // ..1111..
  0b00011000  // ...11... (Tip)
};

const uint8_t SYMBOL_LEFT[8] = {
  0b00000000, // ........
  0b00010000, // ...1....
  0b00110000, // ..11....
  0b01111111, // .1111111 (Barbs & Shaft)
  0b01111111, // .1111111
  0b00110000, // ..11....
  0b00010000, // ...1....
  0b00000000  // ........
};

const uint8_t SYMBOL_RIGHT[8] = {
  0b00000000, // ........
  0b00001000, // ....1...
  0b00001100, // ....11..
  0b11111110, // 1111111. (Shaft & Barbs)
  0b11111110, // 1111111.
  0b00001100, // ....11..
  0b00001000, // ....1...
  0b00000000  // ........
};

const uint8_t SYMBOL_CW[8] = {
  0b00111100, // ..1111.. (Top arc)
  0b01000010, // .1....1.
  0b10000001, // 1......1
  0b10000111, // 1....111 (Arrowhead pointing down-right)
  0b10000010, // 1.....1.
  0b01000100, // .1...1..
  0b00111000, // ..111... (Bottom arc)
  0b00000000  // ........
};

const uint8_t SYMBOL_CCW[8] = {
  0b00111100, // ..1111.. (Top arc)
  0b01000010, // .1....1.
  0b10000001, // 1......1
  0b11100001, // 111....1 (Arrowhead pointing down-left)
  0b01000001, // .1.....1
  0b00100010, // ..1...1.
  0b00011100, // ...111.. (Bottom arc)
  0b00000000  // ........
};

const uint8_t SYMBOL_WAVE[8] = {
  0b00000000, // ........
  0b01100011, // .11...11
  0b10010100, // 1..1.1..
  0b00001000, // ....1...
  0b00010000, // ...1....
  0b00101001, // ..1.1..1
  0b11000110, // 11...11.
  0b00000000  // ........
};

// Render solid bitmap onto matrixOverlay
void drawSolidSymbol(const uint8_t bitmap[8], CRGB color) {
  for (int y = 0; y < 8; y++) {
    uint8_t row = bitmap[y];
    for (int x = 0; x < 8; x++) {
      if (row & (0x80 >> x)) {
        matrixOverlay[XY(x, y)] = color;
      }
    }
  }
}

// =============================================================================
// AMBIENT BACKGROUND MATRIX PATTERNS
// =============================================================================
void patternRainbowWave() {
  static uint16_t phase = 0;
  phase += 3;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      uint8_t index = (x * 16) + (y * 16) + phase;
      leds[XY(x, y)] = ColorFromPalette(currentPalette16, index, 255, LINEARBLEND);
    }
  }
}

void patternPlasma() {
  static uint16_t timeVal = 0;
  timeVal += 2;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      uint8_t v = sin8((x * 24) + timeVal) + cos8((y * 24) + timeVal) + sin8((x + y) * 16 + (timeVal / 2));
      leds[XY(x, y)] = ColorFromPalette(currentPalette16, v, 255, LINEARBLEND);
    }
  }
}

void patternRadialPulse() {
  static uint8_t pulsePhase = 0;
  pulsePhase += 3;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      float dist = sqrtf((x - 3.5f) * (x - 3.5f) + (y - 3.5f) * (y - 3.5f));
      uint8_t col = (uint8_t)(dist * 35) - pulsePhase;
      leds[XY(x, y)] = ColorFromPalette(currentPalette16, col, 255, LINEARBLEND);
    }
  }
}

void patternDiagonalComet() {
  static int16_t pos = 0;
  EVERY_N_MILLISECONDS(40) {
    fadeToBlackBy(leds, MAX_LEDS, 45);
    int px = pos % 8;
    int py = (pos / 8) % 8;
    leds[XY(px, py)] = ColorFromPalette(currentPalette16, pos * 15, 255, LINEARBLEND);
    pos = (pos + 1) % 64;
  }
}

void patternStarField() {
  EVERY_N_MILLISECONDS(30) {
    fadeToBlackBy(leds, MAX_LEDS, 20);
    if (random8(100) < 35) {
      uint8_t rx = random8(8);
      uint8_t ry = random8(8);
      leds[XY(rx, ry)] = ColorFromPalette(currentPalette16, random8(), 255, NOBLEND);
    }
  }
}

void patternMatrixRain() {
  static uint8_t dropY[8] = {0, 3, 6, 1, 4, 7, 2, 5};
  EVERY_N_MILLISECONDS(50) {
    fadeToBlackBy(leds, MAX_LEDS, 60);
    for (int x = 0; x < 8; x++) {
      dropY[x] = (dropY[x] + 1) % 8;
      leds[XY(x, dropY[x])] = ColorFromPalette(currentPalette16, x * 32, 255, LINEARBLEND);
    }
  }
}

void patternFireGlow() {
  static uint8_t heat[8][8] = {0};
  EVERY_N_MILLISECONDS(35) {
    for (int x = 0; x < 8; x++) {
      for (int y = 0; y < 8; y++) {
        heat[y][x] = qsub8(heat[y][x], random8(15, 35));
      }
    }
    for (int y = 0; y < 7; y++) {
      for (int x = 0; x < 8; x++) {
        heat[y][x] = (heat[y + 1][(x + 7) % 8] + heat[y + 1][x] + heat[y + 1][(x + 1) % 8]) / 3;
      }
    }
    for (int x = 0; x < 8; x++) {
      if (random8() < 140) {
        heat[7][x] = qadd8(heat[7][x], random8(160, 255));
      }
    }
    for (int y = 0; y < 8; y++) {
      for (int x = 0; x < 8; x++) {
        leds[XY(x, y)] = ColorFromPalette(currentPalette16, scale8(heat[y][x], 240), heat[y][x], LINEARBLEND);
      }
    }
  }
}

void patternSolidTone() {
  static uint8_t phase = 0;
  EVERY_N_MILLISECONDS(40) { phase++; }
  CRGB col = ColorFromPalette(currentPalette16, phase, 255, LINEARBLEND);
  fill_solid(leds, MAX_LEDS, col);
}

// =============================================================================
// MAIN COMPOSITOR & DECAY ENGINE
// =============================================================================
void renderFrame() {
  // Hold initial 20% orange sanity check until first gesture
  if (!firstGestureReceived) {
    fill_solid(leds, MAX_LEDS, CRGB(255, 80, 0));
    return;
  }

  if (!powerOn) {
    // Fade out to black smoothly
    fadeToBlackBy(leds, MAX_LEDS, 25);
    return;
  }

  // 1. SMOOTH DECAYS / TRANSITIONS
  // Smoothly decay/glide lit LED count toward target
  currentLitLeds += (targetLitLeds - currentLitLeds) * 0.08f;
  
  // Smoothly decay brightness toward target
  currentBrightness += (targetBrightness - currentBrightness) * 0.08f;
  FastLED.setBrightness((uint8_t)currentBrightness);

  // Smoothly blend color palette toward target palette
  nblendPaletteTowardPalette(currentPalette16, targetPalette16, 12);

  // 2. RENDER AMBIENT PATTERN
  switch (currentPattern) {
    case 0: patternRainbowWave();   break;
    case 1: patternPlasma();        break;
    case 2: patternRadialPulse();   break;
    case 3: patternDiagonalComet();  break;
    case 4: patternStarField();     break;
    case 5: patternMatrixRain();    break;
    case 6: patternFireGlow();      break;
    case 7: patternSolidTone();     break;
    default: patternRainbowWave();  break;
  }

  // Apply active lit pixel mask (mask off pixels beyond currentLitLeds smoothly)
  int activeMax = (int)currentLitLeds;
  for (int i = activeMax; i < MAX_LEDS; i++) {
    leds[i].fadeToBlackBy(40);
  }

  // 3. RENDER 8x8 GESTURE SYMBOL OVERLAY
  uint32_t now = millis();
  if (activeGestureAnim != GES_NONE && (now - gestureAnimStart < gestureFeedbackSpeed)) {
    float progress = (float)(now - gestureAnimStart) / (float)gestureFeedbackSpeed;

    // INSTANT CONTRAST: Crush background down to 1% immediately so the symbol is 100% readable!
    // In the last 300ms, smoothly ramp the background back up from 1% to 100%
    uint8_t bgScale = 2; // ~1% brightness
    if (progress > 0.70f) {
      float factor = (progress - 0.70f) / 0.30f; // 0.0 -> 1.0
      bgScale = 2 + (uint8_t)(253.0f * factor);
    }

    for (int i = 0; i < MAX_LEDS; i++) {
      leds[i].nscale8(bgScale);
    }

    // Clear overlay buffer
    fill_solid(matrixOverlay, MAX_LEDS, CRGB::Black);

    // Draw solid, non-moving, centered 8x8 symbol
    switch (activeGestureAnim) {
      case GES_UP:              drawSolidSymbol(SYMBOL_UP, CRGB::Cyan);         break;
      case GES_DOWN:            drawSolidSymbol(SYMBOL_DOWN, CRGB::Gold);       break;
      case GES_LEFT:            drawSolidSymbol(SYMBOL_LEFT, CRGB::Magenta);    break;
      case GES_RIGHT:           drawSolidSymbol(SYMBOL_RIGHT, CRGB::Green);     break;
      case GES_CLOCKWISE:       drawSolidSymbol(SYMBOL_CW, CRGB(255, 140, 0));  break; // Orange Amber
      case GES_ANTICLOCKWISE:   drawSolidSymbol(SYMBOL_CCW, CRGB(0, 180, 255)); break; // Azure Cyan
      case GES_WAVE:            drawSolidSymbol(SYMBOL_WAVE, CRGB::White);      break;
      default: break;
    }

    // Overlay symbol at 100% solid brightness, gentle fade-out in last 150ms
    uint8_t symBrightness = 255;
    if (progress > 0.85f) {
      symBrightness = (uint8_t)(255 * (1.0f - ((progress - 0.85f) / 0.15f)));
    }

    for (int i = 0; i < MAX_LEDS; i++) {
      if (matrixOverlay[i]) {
        CRGB symbolColor = matrixOverlay[i];
        if (symBrightness < 255) {
          symbolColor.nscale8(symBrightness);
        }
        leds[i] = symbolColor; // 100% bright symbol stands out over 1% dimmed bg
      }
    }
  } else {
    activeGestureAnim = GES_NONE;
  }
}

// =============================================================================
// GESTURE PROCESSING
// =============================================================================
void processGesture(Gesture gesture) {
  if (gesture == GES_NONE) return;

  // Ignore Forward and Backward (Push/Pull) per user request to eliminate false triggers
  if (gesture == GES_FORWARD || gesture == GES_BACKWARD) {
    return;
  }

  uint32_t now = millis();

  // Cooldown check
  if (now < gestureCooldownUntil) return;

  // Rebound lockout check
  if (gesture == lockedOutGesture && now < oppositeLockoutUntil) {
    Serial.printf("[DEBOUNCE] Suppressed rebound gesture (%d)\n", gesture);
    return;
  }

  // First gesture unlock
  if (!firstGestureReceived) {
    firstGestureReceived = true;
    Serial.println("\n>>> FIRST GESTURE DETECTED! Starting 8x8 Interactive Visuals <<<");
  }

  gestureCooldownUntil = now + DEBOUNCE_COOLDOWN_MS;

  // Trigger feedback animation on 8x8 matrix
  activeGestureAnim = gesture;
  gestureAnimStart  = now;
  digitalWrite(PIN_STATUS_LED, HIGH);

  // Directional rebound lockout
  switch (gesture) {
    case GES_FORWARD:
      lockedOutGesture = GES_BACKWARD;
      oppositeLockoutUntil = now + REBOUND_LOCKOUT_MS;
      targetLitLeds = min(64.0f, targetLitLeds + 16.0f); // Expand lit area
      Serial.printf("[GESTURE] FORWARD -> Expand Lit LEDs to %.0f / 64\n", targetLitLeds);
      break;

    case GES_BACKWARD:
      lockedOutGesture = GES_FORWARD;
      oppositeLockoutUntil = now + REBOUND_LOCKOUT_MS;
      targetLitLeds = max(8.0f, targetLitLeds - 16.0f);  // Shrink lit area
      Serial.printf("[GESTURE] BACKWARD -> Shrink Lit LEDs to %.0f / 64\n", targetLitLeds);
      break;

    case GES_UP:
      lockedOutGesture = GES_DOWN;
      oppositeLockoutUntil = now + 500;
      currentPattern = (currentPattern + 1) % NUM_PATTERNS;
      Serial.printf("[GESTURE] UP -> Pattern: %s\n", patternNames[currentPattern]);
      break;

    case GES_DOWN:
      lockedOutGesture = GES_UP;
      oppositeLockoutUntil = now + 500;
      currentPattern = (currentPattern == 0) ? NUM_PATTERNS - 1 : currentPattern - 1;
      Serial.printf("[GESTURE] DOWN -> Pattern: %s\n", patternNames[currentPattern]);
      break;

    case GES_LEFT:
      lockedOutGesture = GES_RIGHT;
      oppositeLockoutUntil = now + 500;
      targetPaletteIdx = (targetPaletteIdx == 0) ? NUM_PALETTES - 1 : targetPaletteIdx - 1;
      targetPalette16 = palettes[targetPaletteIdx];
      Serial.printf("[GESTURE] LEFT -> Palette: %s\n", paletteNames[targetPaletteIdx]);
      break;

    case GES_RIGHT:
      lockedOutGesture = GES_LEFT;
      oppositeLockoutUntil = now + 500;
      targetPaletteIdx = (targetPaletteIdx + 1) % NUM_PALETTES;
      targetPalette16 = palettes[targetPaletteIdx];
      Serial.printf("[GESTURE] RIGHT -> Palette: %s\n", paletteNames[targetPaletteIdx]);
      break;

    case GES_CLOCKWISE:
      targetBrightness = min(255.0f, targetBrightness + 35.0f);
      Serial.printf("[GESTURE] CLOCKWISE -> Brightness: %.0f / 255\n", targetBrightness);
      break;

    case GES_ANTICLOCKWISE:
      targetBrightness = max(15.0f, targetBrightness - 35.0f);
      Serial.printf("[GESTURE] COUNTER-CW -> Brightness: %.0f / 255\n", targetBrightness);
      break;

    case GES_WAVE:
      powerOn = !powerOn;
      Serial.printf("[GESTURE] WAVE -> Power Toggle: %s\n", powerOn ? "ON" : "OFF");
      break;

    default:
      break;
  }
}

bool testI2CAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

// =============================================================================
// ARDUINO SETUP & LOOP
// =============================================================================
void setup() {
  pinMode(PIN_SOFT_GND, OUTPUT);
  digitalWrite(PIN_SOFT_GND, LOW);

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  pinMode(PIN_INT, INPUT_PULLUP);

  // FastLED Setup for 8x8 Matrix
  FastLED.addLeds<LED_TYPE, PIN_LED_DATA, COLOR_ORDER>(leds, MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness((uint8_t)currentBrightness);
  fill_solid(leds, MAX_LEDS, CRGB(255, 80, 0)); // 20% Orange Sanity Check
  FastLED.show();

  currentPalette16 = palettes[0];
  targetPalette16  = palettes[0];

  // Serial CDC setup
  Serial.begin(115200);
  delay(500);

  Serial.println("\n==================================================");
  Serial.println("  ESP32-C3 SuperMini + GY-PAJ7620 8x8 MATRIX      ");
  Serial.println("  Visual Gesture Feedback & Smooth Transitions    ");
  Serial.println("==================================================");

  // Allow sensor power rail & internal oscillator (POR) to fully stabilize
  delay(300);

  // Set default hardware pins for TwoWire so any internal Wire.begin() uses them
  Wire.setPins(pin_sda, pin_scl);
  Wire.begin(pin_sda, pin_scl, 100000);
  delay(50);

  Serial.printf("Connecting to PAJ7620 on SDA=GPIO %d, SCL=GPIO %d... ", pin_sda, pin_scl);
  if (sensor.begin()) {
    sensorInitialized = true;
    Wire.begin(pin_sda, pin_scl, 100000); // Re-enforce pinout
    sensor.setGestureExitTime(0);
    Serial.println("SUCCESS!");
  } else {
    Serial.println("FAILED! Trying swapped pins (SDA=3, SCL=2)...");
    Wire.end();
    pin_sda = 3;
    pin_scl = 2;
    Wire.setPins(pin_sda, pin_scl);
    Wire.begin(pin_sda, pin_scl, 100000);
    delay(50);

    if (sensor.begin()) {
      sensorInitialized = true;
      Wire.begin(pin_sda, pin_scl, 100000);
      sensor.setGestureExitTime(0);
      Serial.println("[PAJ7620] SUCCESS on swapped pins!");
    } else {
      Serial.println("[PAJ7620] FAILED! Will retry periodically in loop.");
      // Revert back to primary
      Wire.end();
      pin_sda = 2;
      pin_scl = 3;
      Wire.setPins(pin_sda, pin_scl);
      Wire.begin(pin_sda, pin_scl, 100000);
    }
  }
}

void loop() {
  if (sensorInitialized) {
    if (digitalRead(PIN_INT) == LOW) {
      Gesture gesture = sensor.readGesture();
      processGesture(gesture);
    } else {
      EVERY_N_MILLISECONDS(35) {
        Gesture gesture = sensor.readGesture();
        processGesture(gesture);
      }
    }
  } else {
    EVERY_N_MILLISECONDS(2000) {
      if (sensor.begin()) {
        sensorInitialized = true;
        sensor.setGestureExitTime(0);
        Serial.println("[PAJ7620] Reconnected!");
      }
    }
  }

  // Clear hardware status LED when animation finishes
  if (millis() - gestureAnimStart >= gestureFeedbackSpeed) {
    digitalWrite(PIN_STATUS_LED, LOW);
  }

  // Smooth render loop (~60 FPS)
  EVERY_N_MILLISECONDS(16) {
    renderFrame();
    FastLED.show();
  }
}
