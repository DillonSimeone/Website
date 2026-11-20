# DeafDoorbell — Leader Node

Master acoustic detector, ESP-NOW broadcast transmitter, and captive portal studio for the DeafDoorbell system.

## Hardware Specifications

- **Board:** `esp32-c3-devkitm-1` (ESP32-C3 SuperMini)
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`

## Pin Configuration

| Signal Name       | GPIO Pin | Notes                                    |
| :---------------- | :------- | :--------------------------------------- |
| `MIC_ANALOG_PIN`  | `3`      | MAX4466 `OUT` (`ADC1_CH3`)               |
| `MIC_GND_PIN`     | `4`      | Soft ground driven `LOW` for MAX4466 GND |
| `ONBOARD_LED_PIN` | `8`      | Inverted PWM audio/alert feedback LED    |

## Build & Upload

- **USB Flash & Monitor:** Run `upload.bat`
- **Build `.bin` for Web OTA (`http://192.168.4.1/update`):** Run `compile_bin.bat`
