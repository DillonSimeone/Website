# MAX7219 Captive Portal Display

## Overview
A dynamic, web-controlled project for the **MAX7219 8x8 LED Dot Matrix** module. The ESP32 acts as a Wi-Fi Access Point and Captive Portal. Upon connecting to the AP, devices are redirected to a Cyberpunk-styled web interface where users can change the scroll text, preview it in JS, toggle active animations, and apply changes in real-time.

## Hardware Setup
*   **Microcontroller:** ESP32-C3 SuperMini.
*   **Display:** MAX7219 8x8 Matrix (5 chained modules).
*   **Connections (C3 SuperMini):**
    *   `VCC` -> 5V
    *   `GND` -> GND
    *   `DIN` -> GPIO 6 (MOSI)
    *   `CS`  -> GPIO 5 (CS)
    *   `CLK` -> GPIO 4 (SCK)

## Key Features
*   **Captive Portal & Web UI:** Connect to the `MAX7219-LINK` Wi-Fi to auto-launch the controller. No app required.
*   **Cyberpunk Styling:** Dark mode, neon typography, and a live web canvas preview of the pixel text.
*   **Live Updates:** Sends changes via AJAX endpoints to avoid rebooting the ESP32. Updates appear immediately on the LED matrices.
*   **Animation Cycling:** Toggle which MD_Parola text effects are active; the matrix will cycle only through selections.

## Usage
1. Connect the hardware.
2. Run `upload.bat` to flash the code and monitor serial output.
3. Connect any device to the `MAX7219-LINK` Wi-Fi network.
4. The captive portal will open the control UI automatically (or navigate to `http://192.168.4.1` manually).
5. Modify the display text and selected animations, then hit **COMMIT CHANGES**.
