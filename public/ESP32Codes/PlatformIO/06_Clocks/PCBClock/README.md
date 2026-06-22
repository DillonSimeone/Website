# PCBClock

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32dev`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `bodmer/TFT_eSPI @ ^2.5.43`
 - `build_flags =`
 - `-DUSER_SETUP_LOADED=1`
 - `-DST7789_DRIVER=1`
 - `-DTFT_WIDTH=170`
 - `-DTFT_HEIGHT=320`
 - `-DTFT_MOSI=19`
 - `-DTFT_SCLK=18`
 - `-DTFT_CS=5`
 - `-DTFT_DC=16`
 - `-DTFT_RST=23`
 - `-DTFT_BL=4`
 - `-DLOAD_GLCD=1`
 - `-DLOAD_FONT2=1`
 - `-DLOAD_FONT4=1`
 - `-DLOAD_FONT6=1`
 - `-DLOAD_FONT7=1`
 - `-DLOAD_FONT8=1`
 - `-DLOAD_GFXFF=1`
 - `-DSPI_FREQUENCY=40000000`

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
