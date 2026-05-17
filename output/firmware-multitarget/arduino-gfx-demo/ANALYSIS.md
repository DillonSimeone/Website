# arduino-gfx-demo — Cost-Down Analysis
8-bit parallel LCD interface requires ESP32-S3's LCD_CAM peripheral or a wide-GPIO part. ESP32-C3 SPI-only would force re-routing display to an SPI TFT (slower). Cost-down is achieved by collapsing the LilyGo dev board (~$15) to a custom PCB with bare S3-WROOM-1 module.
## Library Substitutions
Arduino_GFX → `esp_lcd_panel_io_i80.h` + `esp_lcd_panel_st7789.h` (IDF native).
