# INMP411 I2S Mic Sanity Test for ESP32-C3

This project helps you identify the correct wiring for an INMP411 (or similar I2S) microphone on an ESP32-C3 SuperMini.

## Features
- **Auto-Pin Detection**: Give it a list of pins you've used, and it will try every permutation until it hears audio.
- **Persistent Configuration**: Once a working configuration is found, it's saved to NVS (flash memory) and loaded automatically on next boot.
- **Real-time Feedback**: Streams a simple ASCII bar graph showing the microphone's volume.

## Wiring
Connect the microphone pins to any available GPIOs on your ESP32-C3:
- **VCC**: 3.3V
- **GND**: GND pin (or a GPIO if using **Soft Ground**)
- **SCK / BCLK**: Any digital GPIO
- **WS / LRCK**: Any digital GPIO
- **SD / DATA**: Any digital GPIO
- **L/R**: Can be connected to GND/VCC or another GPIO (the script will try both states if an extra pin is provided).

### Soft Ground Feature
If you are tight on space or wiring layout, you can connect the Microphone's GND to a regular GPIO pin. In `main.cpp`, set `softGroundPin` to that pin number, and the ESP32 will hold it at `LOW` to act as a ground.

## How to Use
1. Open `src/main.cpp`.
2. Update the `userPins` array with the GPIO numbers you connected the mic to:
   ```cpp
   int userPins[] = {2, 3, 4, 5}; 
   ```
3. Run `upload.bat` or use PlatformIO to upload the code.
4. Open the Serial Monitor (**115200 baud**).
5. Watch the console as it tries different combinations.
6. Once "SUCCESS!" is logged, it will save the config and start showing the volume bar.

### Resetting
To clear the saved configuration and start the scan over, send the character `r` or `R` over the Serial Monitor.

## ESP32-C3 SuperMini Pinout Reference
- **LED**: GPIO 8
- **USB Serial**: Built-in (no external converter needed)
- **GPIOs**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21
