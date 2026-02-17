# MAX7219 Bullshit Test

## Overview
A simple test project for the **MAX7219 8x8 LED Dot Matrix** module. It displays the word "Bullshit" character-by-character to verify matrix orientation and refresh rates.

## Hardware Setup
*   **Microcontroller:** ESP32-C3 SuperMini.
*   **Display:** MAX7219 8x8 Matrix.
*   **Connections (C3 SuperMini):**
    *   `VCC` -> 5V
    *   `GND` -> GND
    *   `DIN` -> GPIO 6 (MOSI)
    *   `CS`  -> GPIO 5 (CS)
    *   `CLK` -> GPIO 4 (SCK)

## Key Features
*   **Character Slicing:** Splits a string into individual characters and displays them sequentially.
*   **MD_Parola Integration:** Uses the Parola library for future-proof animation support.
*   **Center Alignment:** Automatically centers characters on the matrix.

## Usage
1. Connect the hardware.
2. Run `upload.bat` to flash the code and monitor serial output.
3. The display will cycle through "B-u-l-l-s-h-i-t" indefinitely.
