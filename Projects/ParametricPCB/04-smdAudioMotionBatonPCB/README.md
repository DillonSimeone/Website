# 04: All-in-One SMD Audio & Motion Reactive Baton Controller PCB

A turnkey, 100% factory-assembled single-order controller PCB in a wand/baton form factor (default 22mm × 110mm). Eliminates socketed development boards and hand soldering by mounting an **ESP32-C3-WROOM-02-N4** SMD module, an **MPU-6050** 6-axis motion sensor, an **INMP441** digital I2S microphone, a **Type-C USB receptacle with native CDC/JTAG**, and an **auto power-path LiPo charging circuit** directly on the PCB.

---

## 1. Hardware Architecture & Pin Map

### 1.1 Microcontroller & Core Peripherals
- **MCU**: Espressif ESP32-C3-WROOM-02-N4 (LCSC `C2934560`). Single-core 32-bit RISC-V at 160MHz, 4MB embedded Flash, 400KB SRAM, 2.4GHz Wi-Fi + Bluetooth 5 (LE).
- **USB Interface**: USB Type-C 16-Pin Receptacle (LCSC `C165948`). USB D- connected to GPIO 18 and USB D+ connected to GPIO 19 for native USB CDC serial console and JTAG programming without external USB-UART bridges. 5.1kΩ pull-downs on CC1 / CC2 for Type-C host negotiation.
- **Motion Sensor**: InvenSense MPU-6050 6-Axis Gyroscope & Accelerometer (QFN-24, LCSC `C24112`). Connected via hardware I2C (`SCL` on GPIO 3, `SDA` on GPIO 2 with 4.7kΩ pull-ups, `INT` on GPIO 1).
- **Audio Sensor**: InvenSense INMP441 Omnidirectional Digital MEMS Microphone (SMD-9, LCSC `C5438445`). Direct 24-bit I2S digital audio output (`SCK` on GPIO 4, `WS` on GPIO 5, `SD` on GPIO 8).
- **Power System**:
  - Linear 1S LiPo Charger: TP4054 / MCP73831 (SOT-23-5, LCSC `C382138`) with 2kΩ PROG resistor (500mA charge rate) and charge indicator LED.
  - Automatic Power-Path: AO3401A P-MOSFET (`Q_PWR`, LCSC `C15127`) and SS14 Schottky diode (`D_PWR`, LCSC `C8598`) seamlessly powers system from USB when plugged in while charging LiPo, and switches instantly to battery when unplugged.
  - 3.3V Low-Dropout Regulator: ME6211C33M5G-N (SOT-23-5, LCSC `C82942`) providing 500mA regulated output from 3.7V LiPo or 5V USB.
- **Actuators & Outputs**:
  - Switched 5V Addressable LED Header: 3-pin dual-mount header (`5V_SW`, `DAT`, `GND`) gated by an AO3401A P-MOSFET high-side switch controlled by GPIO 10 to eliminate parasitic sleep current.
  - Haptic Motor Driver: AO3400A N-MOSFET (`Q_HAP`, LCSC `C20917`) PWM driven by GPIO 7 with SS14 flyback diode clamp across motor terminals.
- **Diagnostic & Expansion**:
  - 5-Pin MPU Diagnostic Header: Plated through-holes (`3V3`, `GND`, `SCL`, `SDA`, `INT`) for logic analyzer capture or external sensor attachment.
  - Hardware Buttons: Miniature tactile SMD switches for hardware Reset (`EN`) and Bootloader/User Action (`IO9`).
  - Battery Terminal Pads: Dual-mount pads for soldering battery leads or JST-PH 2.0mm connector.

---

## 2. ESP32-C3-WROOM-02 Pin Allocation & Strapping Table

| Pin # | Pad Name | Net Name | Peripheral / Destination | Strapping & Boot Considerations |
|---|---|---|---|---|
| Pin 1 | 3V3 | `NET_3V3` | 3.3V Regulated System Rail | Power Input |
| Pin 2 | EN | `NET_EN` | Hardware Reset Button (`SW_EN`) | Pulled HIGH via 10kΩ + 0.1µF |
| Pin 3 | GPIO 4 | `NET_I2S_SCK` | INMP441 I2S Bit Clock (`SCK`) | Safe GPIO |
| Pin 4 | GPIO 5 | `NET_I2S_WS` | INMP441 I2S Word Select (`WS`) | Safe GPIO |
| Pin 5 | GPIO 6 | `NET_LED_DATA` | Addressable LED Strip Data (`J_LED`) | Safe GPIO |
| Pin 6 | GPIO 7 | `NET_HAPTIC_PWM`| AO3400A Haptic MOSFET Gate | Safe GPIO |
| Pin 7 | GPIO 8 | `NET_I2S_SD` | INMP441 I2S Serial Data In (`SD`) | Strapping: High-Z on boot |
| Pin 8 | GPIO 9 | `NET_BOOT` | Bootloader / Action Button (`SW_BOOT`) | **Strapping: Pulled HIGH (10kΩ) for SPI Flash Boot** |
| Pin 9 | GND | `GND` | Common Ground Return | Power Ground |
| Pin 10 | GPIO 10 | `NET_LED_PWR_EN`| High-Side LED Switch Pre-Driver Gate | Safe GPIO (10kΩ pull-down) |
| Pin 11 | GPIO 20 | `NET_UART_RX` | Auxiliary UART Console RX | Non-strapping |
| Pin 12 | GPIO 21 | `NET_UART_TX` | Auxiliary UART Console TX | Non-strapping |
| Pin 13 | GPIO 18 | `NET_USB_DM` | USB Type-C Pin A7/B7 (USB D-) | Native USB JTAG/CDC |
| Pin 14 | GPIO 19 | `NET_USB_DP` | USB Type-C Pin A6/B6 (USB D+) | Native USB JTAG/CDC |
| Pin 15 | GPIO 3 | `NET_I2C_SCL` | MPU-6050 I2C Clock (`SCL`) | Safe GPIO (4.7kΩ pull-up) |
| Pin 16 | GPIO 2 | `NET_I2C_SDA` | MPU-6050 I2C Data (`SDA`) | **Strapping: Must be HIGH (Held HIGH by 4.7kΩ pull-up)** |
| Pin 17 | GPIO 1 | `NET_IMU_INT` | MPU-6050 Motion Interrupt (`INT`) | Safe GPIO / ADC1 |
| Pin 18 | GND | `GND` | Common Ground Return | Power Ground |
| Pin 19 | EP_GND | `GND` | Center Thermal Ground Pad | RF & Thermal Dissipation |

---

## 3. Manufacturing & Ordering Guide (JLCPCB SMT Turnkey)

To order this PCB fully assembled without any manual soldering:
1. Open `04-smdAudioMotionBatonPCB/index.html` in browser.
2. Click **Download Gerbers (.zip)** -> Upload ZIP to [JLCPCB](https://jlcpcb.com/quote).
3. Select **2-Layer PCB**, thickness **1.6mm**, color of choice (Green/Black/Blue/Purple).
4. Check **SMT Assembly** (Top Layer assembly).
5. Click **Download BOM (.csv)** and upload as the Bill of Materials file.
6. Click **Download PNP (.csv)** and upload as the Pick and Place (CPL) file.
7. Confirm component rotations on the JLCPCB 3D alignment viewer and place order!
