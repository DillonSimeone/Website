#include <Arduino.h>
#include <MD_Parola.h>
#include <MD_MAX72xx.h>

/**
 * Project: MAX7219_Bullshit
 * Hardware: ESP32-C3 SuperMini + 4x MAX7219 8x8 Dot Matrix
 * 
 * Wiring (ESP32-C3 SuperMini):
 *   DIN  -> GPIO 6 (Data / MOSI)
 *   CLK  -> GPIO 4 (Clock / SCK)
 *   CS   -> GPIO 5 (Chip Select)
 *   VCC  -> 5V
 *   GND  -> GND
 * 
 * IMPORTANT: Using SOFTWARE SPI (bit-banged) because the ESP32-C3's
 * hardware SPI has pin conflicts (GPIO 5 = default MISO). Software SPI
 * avoids this entirely and gives reliable control of all 4 modules.
 */

// Hardware type - FC16_HW is for the common blue 4-in-1 modules
#define HARDWARE_TYPE MD_MAX72XX::FC16_HW

// Number of daisy-chained MAX7219 modules
#define MAX_DEVICES 4

// Pin definitions for SOFTWARE SPI
#define DATA_PIN  6   // DIN
#define CLK_PIN   4   // CLK
#define CS_PIN    5   // CS

// SOFTWARE SPI constructor: (type, dataPin, clkPin, csPin, maxDevices)
MD_Parola P = MD_Parola(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);

// Animation definitions
struct animation_t {
  textEffect_t effectIn;
  textEffect_t effectOut;
  const char* name;
};

animation_t animations[] = {
  { PA_SCROLL_LEFT,    PA_SCROLL_LEFT,    "Scroll Left"  },
  { PA_SCROLL_RIGHT,   PA_SCROLL_RIGHT,   "Scroll Right" },
  { PA_SCROLL_UP,      PA_SCROLL_UP,      "Scroll Up"    },
  { PA_SCROLL_DOWN,    PA_SCROLL_DOWN,    "Scroll Down"  },
  { PA_FADE,           PA_FADE,           "Fade"         },
  { PA_WIPE,           PA_WIPE,           "Wipe"         },
  { PA_GROW_UP,        PA_GROW_DOWN,      "Grow"         },
  { PA_SCAN_HORIZ,     PA_SCAN_HORIZ,     "Scan"         },
  { PA_OPENING_CURSOR, PA_CLOSING_CURSOR, "Cursor"       },
  { PA_SLICE,          PA_DISSOLVE,       "Slice"        },
};

int animIndex = 0;
const int animCount = sizeof(animations) / sizeof(animations[0]);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("MAX7219 Bullshit - Software SPI Mode");

  P.begin();
  
  // Robust init: clear multiple times with delays to ensure
  // all 4 modules in the daisy chain get properly initialized
  for (int i = 0; i < 3; i++) {
    P.displayClear();
    delay(100);
  }
  
  P.setIntensity(2);
  P.displayClear();
  delay(200);

  Serial.println("Init complete. Starting animations...");
  Serial.print("Animation: ");
  Serial.println(animations[animIndex].name);

  P.displayText("Bullshit", PA_CENTER, 50, 1500, 
                animations[animIndex].effectIn, 
                animations[animIndex].effectOut);
}

void loop() {
  if (P.displayAnimate()) {
    // Cycle to next animation
    animIndex = (animIndex + 1) % animCount;

    Serial.print("Animation: ");
    Serial.println(animations[animIndex].name);

    P.setTextEffect(animations[animIndex].effectIn, 
                    animations[animIndex].effectOut);
    P.displayReset();
  }
}
