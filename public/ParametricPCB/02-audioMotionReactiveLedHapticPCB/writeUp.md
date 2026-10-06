# Audio & Motion Reactive Light Baton PCB (V2.0)
## Complete Hardware Architecture, Component Breakdown & DIY Sourcing Guide

---

## 1. Executive Summary & Mechanical Envelope

The **0-2 Audio & Motion Reactive Light Baton PCB** is a specialized carrier board designed to fit inside a standard **22mm Outer Diameter (OD) / 19–20mm Inner Diameter (ID)** clear acrylic or polycarbonate baton tube. 

* **Board Dimensions**: 20.0 mm (W) × 115.0 mm (L) × 1.6 mm (FR4 thickness)
* **M3 Corner Mounting Holes**: 4× symmetric plated mounting holes with **Ø3.2mm clearance drill** (fits standard M3 screws) and **Ø4.8mm copper annular ring pads**. Centered at $(\pm 6.5\text{mm}, \pm 53.5\text{mm})$ forming a precise **$13.0\text{mm} \times 107.0\text{mm}$** mounting pattern for baton end-caps, chassis rails, or standoffs.
* **Form Factor Architecture**: Split-architecture hybrid design featuring **turnkey pre-assembled SMT active power electronics** (MOSFETs, auto power-path switching, diodes, passive filters, and LiPo charger) paired with **dual-mount (Through-Hole + SMD castellated) sockets** for pluggable off-the-shelf micro-modules (ESP32-C3 SuperMini, GY-521 MPU-6050, INMP441, MAX4466).
* **Power Architecture**: 1S Li-ion / LiPo battery input (3.7V nominal / 4.2V peak) with onboard 500mA USB-C linear charging and instant zero-loss hardware power-path switching.

---

## 2. Component Engineering Breakdown: Why Each Part Was Chosen

```
+----------------------------------------------------------------------------------------------------------------+
|                                        BATON HARDWARE BLOCK DIAGRAM                                            |
|                                                                                                                |
|   [ USB 5V In ] ----> [ D_PWR (B5819W) ] ----------------------------+                                         |
|         |                     |                                      |                                         |
|         v                     v                                      v                                         |
|  [ U_CHG: TP4054 ]      [ Q_PWR Gate ]                        [ NET_VSYS Rail ]                                |
|         |                     |                                      |                                         |
|         | (500mA)             v                                      +----> [ ESP32-C3 MCU ]                   |
|         v             [ Q_PWR (AO3401A) ]                            |       (GPIO 0,1,2,3,4,5,6,7,8,10)       |
|   [ J_BAT (3.7V) ] --------> Source -> Drain ------------------------+       |                                 |
|         |                                                            |       |                                 |
|   [ SW_EXT Switch ]                                                  |       | [ GPIO 8 (LED Enable) ]         |
|                                                                      |       |        |                        |
|                                                                      |       |        v                        |
|   [ Q_LED_PWR (AO3401A P-FET) ] <--- Source [ NET_VSYS ]             |       |  [ Q_LED_EN: AO3400A N-FET ]    |
|         | Drain                                                      |       |  [ R_LED_GATE: 10k Pull-Down ]  |
|         v                                                            |       |        |                        |
|   [ J_LED (WS2812B Strip) ] <--- DAT [ GPIO 6 ]                      |       +--------+ (P-FET Gate Driver)    |
|   (Eliminates 50-75mA sleep drain!)                                  |       |  [ R_LED_PU: 100k Pull-Up ]     |
|                                                                      |                                         |
|   [ Haptic PWM GPIO 7 ] ----> [ Q_FET: AO3400A ] <----+----+---------+----> [ J_HAP_L / J_HAP_R ] (Motors)     |
|                               [ R_GATE: 10k Pull ]     |    |        |                                         |
|                               [ D_HAP: B5819W Flyback ]+----+        +----> [ MPU-6050 IMU ]                   |
|                                                                      +----> [ INMP441 / MAX4466 Mics ]         |
+----------------------------------------------------------------------------------------------------------------+
```

---

### A. Digital Core & Motion Sensors

#### 1. `U_MCU` — ESP32-C3 SuperMini Microcontroller
* **Footprint**: 16-Pin Dual-Mount (1.0mm Plated Through-Hole + 1.2mm SMD Castellated Solder Pads, 2.54mm pitch)
* **Operating Voltage**: 3.3V Logic (Accepts 3.3V – 5.5V on VBUS/5V pin via onboard LDO)
* **Processor**: 32-bit RISC-V Single-Core processor clocked at up to 160 MHz, 400 KB SRAM, 384 KB ROM, 4 MB Flash.
* **Why this part was chosen**:
  * **Dimensions**: The standard ESP32 NodeMCU is ~28mm wide (too wide for a 20mm tube). The SuperMini measures only **18mm × 22.5mm**, fitting inside the 20mm baton profile.
  * **Wireless**: Integrated 2.4 GHz Wi-Fi and Bluetooth 5.0 (BLE) allow wireless synchronization between multiple batons, OTA (Over-The-Air) firmware updates, and web/app control.
  * **I/O Capabilities**: Built-in USB Type-C controller, hardware I2S peripheral (for microphone audio streaming), high-resolution hardware LEDC PWM timers (for haptics), and high-speed RMT peripheral (for cycle-accurate WS2812B timing).

#### 2. `U_IMU` — MPU-6050 / MPU-6500 6-Axis Motion Sensor Breakout (GY-521)
* **Footprint**: 8-Pin Lengthwise Header (2.54mm pitch)
* **I2C Address**: `0x68` (Standard default)
* **Pinout Used**: Pin 1 (`VCC` = 3.3V), Pin 2 (`GND`), Pin 3 (`SCL` = GPIO 3), Pin 4 (`SDA` = GPIO 2), Pin 8 (`INT` = GPIO 5).
* **Why this part was chosen**:
  * **Motion Sensing**: Combines a 3-axis gyroscope ($\pm 250^\circ / \text{s}$ to $\pm 2000^\circ / \text{s}$) and 3-axis accelerometer ($\pm 2g$ to $\pm 16g$).
  * **Applications**: Jerk detection, twirl speed tracking, gesture recognition, orientation-aware LED light trails (POV persistence-of-vision effects), and tilt-controlled color palettes.
* **Critical Design Detail (AD0 Ground Separation)**:
  * GY-521 breakouts feature an onboard $4.7\text{k}\Omega$ pull-down resistor from `AD0` to `GND`, establishing the default I2C address `0x68`.
  * In our carrier PCB, **`AD0` is left unconnected**. This prevents the automated router from daisy-chaining sensor ground through high-current motor return paths, preventing motor inductive noise from corrupting delicate motion sensor readings.

---

### B. Audio Sensing Subsystems (Dual Acoustic Architecture)

The PCB provides dedicated headers for **both** analog and digital microphone modules, allowing you to choose based on software requirements:

#### 3. `J_MIC_MAX` — MAX4466 Analog Electret Microphone Header
* **Footprint**: 3-Pin Header (2.54mm pitch): `VCC` (3.3V), `GND`, `OUT`
* **Signal Pin**: Routed to **GPIO 0** (ESP32-C3 ADC1 Channel 0)
* **Why this part was chosen**:
  * **Simplicity & Latency**: Ultra-low-latency envelope detection. Provides an amplified analog voltage centered around a 1.65V DC bias with an adjustable gain potentiometer.
  * **Use Case**: Fast beat detection, sudden percussion hits, instantaneous sound-reactive flash triggering with zero CPU audio processing overhead.

#### 4. `J_MIC_INMP` — INMP441 Digital I2S MEMS Microphone Header
* **Footprint**: Dual-Row 2×3 Header (2.54mm pitch): `SCK` (GPIO 4), `WS` (GPIO 1), `SD` (GPIO 10), `L/R` (GND), `VDD` (3.3V), `GND`
* **Protocol**: Direct Digital I2S (Inter-IC Sound), 24-bit PCM audio stream
* **Why this part was chosen**:
  * **Signal Integrity**: By converting sound to digital bits inside the MEMS sensor silicon, audio is immune to analog EMI noise radiating from motor PWM and switching regulators.
  * **DSP Capabilities**: Supplies uncompressed 16kHz–44.1kHz audio samples directly to ESP32-C3 hardware DMA buffers. Enables real-time Fast Fourier Transform (FFT) 16-band spectrum visualizers, pitch tracking, and musical frequency separation (bass/mids/treble).

---

### C. Output Drivers & Actuation
 
#### 5. `J_LED` — WS2812B Addressable RGB LED Output Header
* **Footprint**: 3-Pin Header (2.54mm pitch): `5V` (Switched `NET_5V_LED_SW`), `DAT` (GPIO 6), `GND`
* **Why this part was chosen**:
  * Directly drives addressable digital LED strips (Neopixel / WS2812B / SK6812) along the baton spine.
  * Powered from the dedicated high-side switched rail `NET_5V_LED_SW` (isolated from the ESP32's sensitive 3.3V LDO).

#### 6. High-Side WS2812B Power Switch Architecture
* **The Parasitic Quiescent Drain Problem**:
  * Each WS2812B integrated driver IC contains an internal oscillator, shift register, and constant-current drive circuitry. Even when commanded to turn all LEDs "off" (RGB `0, 0, 0`), each pixel draws **0.8mA to 1.2mA** of continuous quiescent supply current.
  * For a typical 64-LED baton strip, that is a constant **50mA to 75mA parasitic leak** while sitting idle.
  * On a typical 500mAh–1000mAh single-cell LiPo battery, that parasitic drain alone depletes the battery from 100% to dead in **8 to 15 hours**, rendering battery sleep modes useless.
* **Why Low-Side N-FET Switching Is Dangerous (CMOS Latchup Risk)**:
  * Switching the LED strip's ground line with a low-side N-FET leaves the LED strip 5V rail connected while disconnecting ground.
  * When unpowered, the strip's ground floats up toward 5V. When the ESP32's data pin drives LOW (0V), the LED IC attempts to sink its internal current backwards through the ESP32 GPIO pin via internal electrostatic discharge (ESD) clamp diodes.
  * This causes **parasitic back-powering, CMOS latchup, corrupted communication, or catastrophic GPIO destruction**.
  * Therefore, **high-side switching on the positive rail is strictly required**.

#### 7. `Q_LED_PWR` — AO3401A P-Channel SOT-23 Power MOSFET
* **Footprint**: SOT-23 (Surface Mount)
* **Ratings**: $V_{DS} = -30\text{V}$, $I_D = -4.2\text{A}$, $R_{DS(on)} < 45\text{m}\Omega$ @ $V_{GS} = -4.5\text{V}$, $R_{DS(on)} < 70\text{m}\Omega$ @ $V_{GS} = -2.5\text{V}$
* **Placement**: Placed on the high side between the main system rail (`NET_VSYS`, Pin 2 Source) and the LED header (`J_LED`, Pin 3 Drain).
* **Why this part was chosen**:
  * Ultra-low on-resistance ensures negligible voltage drop ($\Delta V < 0.05\text{V}$ at 1A strip current), delivering maximum battery voltage to the WS2812B LEDs for accurate blue/white color rendering.
  * Shares the same JLCPCB **Basic Part** feeder as `Q_PWR` (`C15127`), adding $0 in assembly setup fees.

#### 8. `R_LED_PU` — 100kΩ 1% 0603 Gate Pull-Up Resistor
* **Connection**: Connected between `Q_LED_PWR` Gate (Pin 1) and Source / `NET_VSYS` (Pin 2).
* **Function**: Keeps $V_{GS} = 0\text{V}$ when the pre-driver is disabled, guaranteeing the P-MOSFET is firmly turned **OFF** with zero leakage current during standby.

#### 9. `Q_LED_EN` — AO3400A N-Channel SOT-23 Pre-Driver MOSFET
* **Footprint**: SOT-23 (Surface Mount)
* **Ratings**: $V_{DS} = 30\text{V}$, $I_D = 5.7\text{A}$, $V_{GS(th)} \approx 0.9\text{V} - 1.4\text{V}$
* **Control**: Driven by **GPIO 8** (ESP32-C3)
* **Why the N-Channel Pre-Driver is Essential**:
  * The baton rail voltage ranges from 3.7V to 4.2V on battery, and up to 5.0V on USB.
  * If the ESP32-C3's 3.3V GPIO were connected directly to the P-MOSFET gate:
    $$V_{GS} = 3.3\text{V} - 5.0\text{V} = -1.7\text{V} \quad (\text{or } 3.3\text{V} - 4.2\text{V} = -0.9\text{V})$$
    Because the AO3401A threshold voltage is $-0.6\text{V}$ to $-1.3\text{V}$, a 3.3V logic high would **leave the P-FET partially conducting or severely leaking**!
  * Using the AO3400A N-FET pre-driver completely decouples logic level from rail voltage: when GPIO 8 is HIGH (3.3V), the N-FET turns ON and pulls the P-FET gate cleanly to 0V (GND), driving $V_{GS}$ to a full $-3.7\text{V}$ to $-5.0\text{V}$ for hard saturation.

#### 10. `R_LED_GATE` — 10kΩ 1% 0603 Pre-Driver Pull-Down Resistor
* **Connection**: Connected between `Q_LED_EN` Gate (Pin 1) and `GND` (Pin 2).
* **Function**: Ensures the pre-driver gate stays solidly at 0V during microcontroller power-up resets and deep sleep modes when GPIO 8 floats high-impedance.

#### 11. Recommended Firmware Power Sequencing Protocol
To avoid phantom-powering the LED strip through the data line, firmware should execute this sequence:
* **Power-On Sequence**:
  1. Configure `DATA` pin (GPIO 6) as `OUTPUT` and drive `LOW`.
  2. Wait $1\text{ms}$.
  3. Assert `LED_PWR_EN` (GPIO 8) `HIGH` to engage the high-side switch.
  4. Wait $2\text{ms}$ for supply rail decoupling capacitors to charge and stabilize.
  5. Begin transmitting WS2812B RMT pulse stream.
* **Standby / Power-Down Sequence**:
  1. Write RGB `(0, 0, 0)` to all pixels and latch.
  2. Drive `DATA` pin (GPIO 6) firmly `LOW`.
  3. De-assert `LED_PWR_EN` (GPIO 8) `LOW` to cut the 5V rail.
  4. Configure `DATA` pin as `INPUT` with internal pull-down (or hold LOW) before entering ESP32 deep sleep.

---

#### 12. `J_HAP_L` & `J_HAP_R` — Left and Right Lateral Haptic Motor Headers
* **Footprint**: Two 2-Pin Polarized Headers (2.54mm pitch), located on opposite sides of the board.
* **Why this part was chosen**:
  * Placing vibration actuators at opposing lateral edges creates tactile sensations (rumble, rhythm taps, acceleration feedback) that resonate through the baton handle.

#### 13. `Q_FET` — AO3400A N-Channel SOT-23 Power MOSFET (Haptics)
* **Footprint**: SOT-23 (Surface Mount)
* **Ratings**: $V_{DS} = 30\text{V}$, $I_D = 5.7\text{A}$, $R_{DS(on)} < 28\text{m}\Omega$ @ $V_{GS} = 2.5\text{V}$
* **Control**: Driven by **GPIO 7** (ESP32-C3 hardware PWM)
* **Why this part was chosen**:
  * Low Gate Threshold Voltage ($V_{GS(th)} \approx 0.9\text{V} - 1.4\text{V}$) means it achieves full saturation directly from the ESP32-C3's 3.3V logic level without needing an external gate driver IC.
  * The ultra-low $28\text{m}\Omega$ on-resistance ensures virtually zero voltage drop or heat generation even during stall current spikes from dual vibration motors.

#### 14. `R_GATE` — 10kΩ 1% 0603 Resistor (Haptic Gate Pull-Down)
* **Connection**: Connected between `Q_FET` Gate and `GND`
* **Why this part was chosen**:
  * **Fail-Safe Gate Pull-Down**: Microcontroller GPIOs float (high-impedance tristate) during bootloader execution, power-up resets, or deep sleep. `R_GATE` holds the MOSFET gate at 0V, preventing uncommanded motor buzzing, phantom vibrations, or accidental battery discharge.

#### 15. `D_HAP` — B5819W 1A 40V SOD-123 Schottky Diode (Haptic Flyback)
* **Connection**: Placed in anti-parallel across the motor terminals (Cathode to motor positive `NET_VSYS` on the right pad, Anode to motor negative / `Q_FET` Drain on the left pad).
* **Physical Orientation & Layout**: Rotated 180° with Cathode band facing RIGHT (`K`) and Anode facing LEFT (`A`). Positioned at $x = 5.0\text{mm}, y = 38.5\text{mm}$ to give **2.75mm** physical clearance from `Q_FET`, eliminating component collision risks.
* **Why this part was chosen**:
  * **Inductive Flyback Suppression**: DC vibration motors contain inductive coils. When the MOSFET abruptly turns off high-frequency PWM current, the collapsing magnetic field generates high-voltage inductive spikes ($L \cdot \frac{di}{dt}$) that can reach 30V–60V.
  * The fast switching speed ($< 10\text{ns}$) and low forward drop ($V_F \approx 0.45\text{V}$) of the Schottky diode safely recirculates this inductive energy back into the power rail, protecting the MOSFET and ESP32 silicon.
  * **Critical Circuit Rule**: The flyback diode MUST be reverse-biased during motor conduction ($V_{Anode} \le V_{Cathode}$). Having Cathode on `NET_VSYS` and Anode on Drain ensures zero current through the diode when `Q_FET` turns ON, and catches inductive flyback overshoot when `Q_FET` turns OFF. If reversed, turning on `Q_FET` would create a dead short from the battery to ground through the diode!

---

### D. Power Management & Auto Power-Path System

#### 10. `U_CHG` — TP4054 Linear Li-ion Charger IC
* **Footprint**: SOT-23-5
* **Input Voltage**: 4.5V – 6.5V (USB 5V)
* **Regulation**: Constant-Current / Constant-Voltage (CC/CV), 4.2V termination $\pm 1\%$
* **Why this part was chosen**:
  * Standalone single-cell linear charging controller in a compact 5-pin package.
  * Internal power MOSFET and current sensing circuitry eliminate the need for external sense resistors or blocking diodes.
  * Includes internal thermal feedback to automatically regulate charge current during high ambient temperatures.

#### 11. `R_PROG` — 2kΩ 1% 0603 Resistor
* **Connection**: Connected between `U_CHG` Pin 5 (`PROG`) and `GND`
* **Charge Current Formula**:
  $$I_{CHG} = \frac{1000\text{V}}{R_{PROG}} = \frac{1000\text{V}}{2000\Omega} = 0.500\text{A} = 500\text{mA}$$
* **Why this part was chosen**:
  * 500mA is the standard USB 2.0 port power delivery limit. It recharges a 14500 (800mAh) or 18650 (2200mAh) cylindrical Li-ion cell safely without overheating the compact baton enclosure.

#### 12. `C_VIN` & `C_BAT` — 4.7µF 16V X5R 0603 Ceramic Capacitors
* **Placement**: Placed close to `VIN` and `VBAT` pins of `U_CHG`.
* **Why this part was chosen**:
  * Stabilizes the internal charging feedback amplifier loop and filters out switching noise and voltage transients caused by long USB charging cables.

#### 13. `Q_PWR` (AO3401A P-MOSFET) + `D_PWR` (B5819W Diode) + `R_PWR` (100kΩ Resistor) — Automatic Power-Path Switching
* **The Problem It Solves**: In naive designs, the battery is hardwired directly to the system load. If you use the device while charging via USB, the charger IC cannot detect when the battery reaches full charge because the system load is constantly siphoning current, leading to battery degradation or thermal issues.
* **How This Circuit Works**:
  1. **Running on Battery (USB Unplugged)**:
     * USB 5V is 0V. `D_PWR` is reverse-biased.
     * The Gate of P-MOSFET `Q_PWR` is pulled down to `GND` through `R_PWR` ($100\text{k}\Omega$).
     * Because $V_{GS} = -V_{BAT} \approx -3.7\text{V}$, `Q_PWR` turns **fully ON**.
     * Battery current flows through `Q_PWR` into the system with virtually zero voltage loss ($R_{DS(on)} < 45\text{m}\Omega \rightarrow \Delta V < 0.02\text{V}$), preserving maximum battery runtime.
  2. **Plugged into USB (Charging Mode)**:
     * USB 5V forward-biases `D_PWR`, raising the system rail to $\approx 4.6\text{V}$.
     * USB 5V is applied directly to the Gate of `Q_PWR`.
     * Because the Gate voltage ($5\text{V}$) is higher than the Source voltage ($V_{BAT} \approx 3.7\text{V} - 4.2\text{V}$), $V_{GS}$ is positive, which **turns `Q_PWR` completely OFF**.
     * The battery is cleanly disconnected from the system load. The system runs 100% on USB power, while the `TP4054` charges the battery uninterrupted according to its standard CC/CV profile.
* **Physical Orientation & Layout**: `D_PWR` is positioned at $x = 6.4\text{mm}, y = -35.5\text{mm}$, providing **2.15mm** of clearance from `Q_PWR` (SOT-23) to eliminate solder bridging. Its Cathode band faces LEFT (`K` at $x = 4.75\text{mm}$, connecting to `NET_VSYS`), and its Anode faces RIGHT (`A` at $x = 8.05\text{mm}$, connecting to USB 5V).

#### 14. `SW_EXT` & `J_BAT` — Power Switch & Battery Terminals
* **Footprint**: 2.0mm solder pads with 1.0mm plated through-holes.
* **Why this part was chosen**:
  * Accommodates heavy 22–26 AWG silicon battery wires or standard JST-PH 2.0mm connectors.
  * `SW_EXT` breaks the battery line mechanically, allowing a mechanical toggle switch on the baton end-cap to guarantee 0µA parasitic battery drain during long-term storage.

---

## 3. Bill of Materials & Purchasing Guide

If you wish to assemble the board yourself (e.g., via the hot plate / iron pan reflow method) or order spare parts, here is the exact component manifest:

### A. Factory Surface-Mount Components (SMT)

| Designator | Component / Value | Footprint | LCSC Part # | JLCPCB Tier | Typical Cost (10 pcs) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`U_CHG`** | TP4054 600mA Li-ion Charger IC | SOT-23-5 | [`C382138`](https://www.lcsc.com/product-detail/Battery-Management-ICs_TPOWER-TP4054_C382138.html) | Extended | $0.60 |
| **`Q_FET`** | AO3400A N-Channel MOSFET 30V 5.7A (Haptics) | SOT-23 | [`C20917`](https://www.lcsc.com/product-detail/MOSFETs_Alpha-Omega-Semicon-AO3400A_C20917.html) | **Basic** | $0.44 |
| **`Q_PWR`** | AO3401A P-Channel MOSFET -30V -4.2A (Power-Path) | SOT-23 | [`C15127`](https://www.lcsc.com/product-detail/MOSFETs_Alpha-Omega-Semicon-AO3401A_C15127.html) | **Basic** | $0.50 |
| **`D_PWR`** | B5819W 1A 40V Schottky Diode (Power-Path) | SOD-123 | [`C8598`](https://www.lcsc.com/product-detail/Schottky-Barrier-Diodes-SBD_MDD-Microdiode-Semiconductor-B5819W-SL_C8598.html) | **Basic** | $0.28 |
| **`D_HAP`** | B5819W 1A 40V Schottky Diode (Haptic Flyback) | SOD-123 | [`C8598`](https://www.lcsc.com/product-detail/Schottky-Barrier-Diodes-SBD_MDD-Microdiode-Semiconductor-B5819W-SL_C8598.html) | **Basic** | $0.28 |
| **`R_PROG`** | 2kΩ 1% 100mW Resistor (500mA Charge Set) | 0603 | [`C22975`](https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF2001T5E_C22975.html) | **Basic** | $0.02 |
| **`R_GATE`** | 10kΩ 1% 100mW Resistor (Haptic Gate Pull-Down) | 0603 | [`C25804`](https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF1002T5E_C25804.html) | **Basic** | $0.02 |
| **`R_PWR`** | 100kΩ 1% 100mW Resistor (Power-Path Pull-Down) | 0603 | [`C25803`](https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF1003T5E_C25803.html) | **Basic** | $0.03 |
| **`C_VIN`** | 4.7µF 16V X5R Ceramic Cap (USB In Filter) | 0603 | [`C19666`](https://www.lcsc.com/product-detail/Multilayer-Ceramic-Capacitors-MLCC-SMD-SMT_Samsung-Electro-Mechanics-CL10A475KO8NNNC_C19666.html) | **Basic** | $0.30 |
| **`C_BAT`** | 4.7µF 16V X5R Ceramic Cap (Battery Decoupling) | 0603 | [`C19666`](https://www.lcsc.com/product-detail/Multilayer-Ceramic-Capacitors-MLCC-SMD-SMT_Samsung-Electro-Mechanics-CL10A475KO8NNNC_C19666.html) | **Basic** | $0.30 |
| **`Q_LED_PWR`** | AO3401A P-Channel MOSFET -30V -4.2A (LED Power Switch) | SOT-23 | [`C15127`](https://www.lcsc.com/product-detail/MOSFETs_Alpha-Omega-Semicon-AO3401A_C15127.html) | **Basic** | $0.50 |
| **`R_LED_PU`** | 100kΩ 1% 100mW Resistor (LED P-FET Gate Pull-Up) | 0603 | [`C25803`](https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF1003T5E_C25803.html) | **Basic** | $0.03 |
| **`Q_LED_EN`** | AO3400A N-Channel MOSFET 30V 5.7A (Pre-Driver) | SOT-23 | [`C20917`](https://www.lcsc.com/product-detail/MOSFETs_Alpha-Omega-Semicon-AO3400A_C20917.html) | **Basic** | $0.44 |
| **`R_LED_GATE`** | 10kΩ 1% 100mW Resistor (Pre-Driver Gate Pull-Down) | 0603 | [`C25804`](https://www.lcsc.com/product-detail/Chip-Resistor-Surface-Mount_UNI-ROYAL-Uniroyal-Elec-0603WAF1002T5E_C25804.html) | **Basic** | $0.02 |

### B. Modular Pluggable Components (Amazon / AliExpress / Local)

| Module / Component | Description | Recommended Sourcing Search Term |
| :--- | :--- | :--- |
| **ESP32-C3 SuperMini** | Compact 16-pin RISC-V Wi-Fi/BLE MCU board | *"ESP32-C3 SuperMini development board Type-C"* |
| **GY-521 (MPU-6050)** | 6-DOF 3-axis gyro + 3-axis accelerometer breakout | *"GY-521 MPU-6050 3 axis accelerometer gyroscope"* |
| **INMP441** | Omnidirectional I2S digital MEMS microphone module | *"INMP441 I2S microphone module"* |
| **MAX4466** | Electret microphone with adjustable gain op-amp | *"MAX4466 adjustable gain electret microphone"* |
| **WS2812B LED Strip** | 5V Addressable RGB LED strip (60–144 LEDs/m, IP30/bare) | *"WS2812B 5V LED strip 144 led black PCB"* |
| **Haptic Motors** | 1027 or 1030 3V coin vibration motors (ERM) or linear (LRA) | *"1027 coin vibration motor 3V flat disc"* |
| **1S LiPo Battery** | 3.7V cylindrical cell (14500 800mAh or 18650 2500mAh) | *"14500 3.7V Li-ion battery button top / wired"* |
| **Slide Switch** | Miniature SPDT slide switch for baton end-cap | *"Mini SPDT slide switch 2.54mm pitch"* |
| **Pin Headers & Sockets** | 2.54mm single/dual-row female socket strips (machined round pin) | *"2.54mm female pin header round hole socket strip"* |

---

## 4. DIY Assembly: The "Iron Pan" / Hot Plate Reflow Method

Soldering small 0603 resistors, SOD-123 diodes, and SOT-23 transistors by hand with a soldering iron tip can be challenging. The **hot plate / iron pan reflow technique** uses surface tension to automatically align every component into place simultaneously.

### Required Materials & Tools
1. **Heat Source**:
   * Flat cast iron skillet / clean electric pancake skillet, OR
   * A dedicated $15–$30 mini SMT hot plate (e.g., MHP30 or an aluminum PTC heating plate from AliExpress/Amazon).
2. **Solder Paste**:
   * **Low-Temperature Paste (Recommended)**: **Sn42Bi58 (Tin-Bismuth)**. Melting point is **138°C (280°F)**. Because it melts at low temperature, it is very forgiving and will not scorch the FR4 board or overheat silicon chips.
   * **Standard Paste**: **Sn63Pb37 (Leaded)**. Melting point is **183°C (361°F)**. Flows easily with shiny joint finishes.
3. **Application Tool**:
   * Solder paste syringe with a 22G or 24G blunt needle dispenser, or a fine wooden toothpick.
4. **Tools**:
   * Fine anti-static ESD tweezers (curved tip).
   * Rubbing alcohol (99% Isopropyl Alcohol / IPA) and an old soft toothbrush for flux cleanup.
   * Digital infrared (IR) thermometer or thermocouple.

---

### Step-by-Step Reflow Recipe

```
+-----------------------------------------------------------------------------------------------+
|                               REFLOW THERMAL PROFILE CURVE                                    |
|                                                                                               |
|  Temp (°C)                                                                                    |
|   180 |                                             [ Peak Reflow ]                           |
|       |                                                /-------\                              |
|   140 |                             [ Soak Zone ]     /         \   [ Rapid Cool ]            |
|       |                           /------------------/           \-----\                      |
|   100 |           [ Ramp Up ]    /                                      \                     |
|       |          /--------------/                                        \                    |
|    25 | --------/                                                         \--------- Room     |
|       +-------------------------------------------------------------------------------+---->  |
|       0        30              60                  90           120       150       180 Sec   |
+-----------------------------------------------------------------------------------------------+
```

#### Step 1: Board Inspection & Cleaning
* Clean the bare PCB using 99% Isopropyl Alcohol to remove fingerprints and copper oxidation. Let it air dry completely.

#### Step 2: Solder Paste Dispensing
* Apply a small dot of solder paste to each SMT pad.
* **Golden Rule**: **Less is more.** A small bead the size of a pinhead on each pad is plenty. Excess solder paste will cause solder bridges between adjacent SOT-23 leads.

#### Step 3: Component Placement
* Using your fine tweezers, place each component onto its pasted pads according to the silkscreen labels:
  * **`Q_FET`, `Q_PWR`, `Q_LED_PWR`, `Q_LED_EN` (SOT-23)**: Single Drain pin faces UP (towards Pad `D`); the two Gate/Source pins face DOWN (towards `G` and `S`).
  * **`U_CHG` (SOT-23-5)**: 3 pins on the bottom, 2 pins on the top.
  * **`D_PWR` (SOD-123, Power-Path)**: Cathode band (white stripe) MUST face **LEFT** (matching silkscreen `K`). The Anode faces **RIGHT** (silkscreen `A`).
  * **`D_HAP` (SOD-123, Haptic Flyback)**: Cathode band (white stripe) MUST face **RIGHT** (matching silkscreen `K`, connecting to `NET_VSYS` positive rail). The Anode faces **LEFT** (matching silkscreen `A`, connecting to `Q_FET` switched ground / Drain). *Do not reverse: mounting backwards creates a dead short when haptics activate!*
  * **`R_PROG` (2kΩ), `R_GATE` / `R_LED_GATE` (10kΩ), `R_PWR` / `R_LED_PU` (100kΩ)**: 0603 resistors are non-polarized.
  * **`C_VIN` & `C_BAT` (4.7µF)**: 0603 ceramic capacitors are non-polarized.
* Lightly press down on each component so it sits flat in the paste. Do not smash the paste flat.

#### Step 4: The Pan Reflow Phase
1. Place the populated PCB onto your **cold** iron skillet or hot plate.
2. Turn on the heat source to medium-low:
   * **If using Sn42Bi58 paste**: Set target temperature to **150°C – 165°C**.
   * **If using Sn63Pb37 paste**: Set target temperature to **190°C – 210°C**.
3. **Observe the transformation**:
   * Around 100°C–120°C, the flux will melt into a clear liquid pool around the pads.
   * Around 138°C (or 183°C), the dull grey paste will transition into bright, shiny liquid silver metal.
   * **Surface Tension Magic**: As the solder liquefies, surface tension will pull slightly misaligned resistors and IC leads into alignment with their pads.
4. Once all pads have flowed into shiny silver joints, allow the board to soak at reflow temperature for **10 to 15 seconds**, then turn off the heat source or carefully slide the skillet off the burner onto a heat-resistant surface.
5. **DO NOT touch or vibrate the board** until the solder solidifies (approx. 30–45 seconds).

#### Step 5: Post-Reflow Inspection & Cleanup
* Inspect the solder joints under good lighting or a magnifying glass:
  * Check for solder bridges between the SOT-23 and SOT-23-5 pins. If any leads are bridged, apply a drop of flux and wipe across the pins with a clean, dry soldering iron tip to pull away excess solder.
* Clean off tacky flux residue using an old toothbrush dipped in 99% Isopropyl Alcohol.

#### Step 6: Hand-Soldering Headers & Sockets
* Once the SMT components are cooled and verified, hand-solder the through-hole pin header sockets for the ESP32-C3 SuperMini, GY-521 MPU, microphone, and wire leads for the battery and switch.

---

## 5. Electrical Sanity & Bring-Up Checklist

Before inserting your ESP32-C3 or plugging in a LiPo battery:

1. **Multimeter Continuity Check (Resistance / Diode mode)**:
   * Test between `VCC (3.3V)` and `GND`: Must read open-circuit ($> 10\text{k}\Omega$). If it beeps (0Ω short), check `C_VIN` and `C_BAT` for solder bridging.
   * Test between `BAT+` and `BAT-`: Must read open-circuit or very high resistance.
2. **USB Power Verification**:
   * Plug USB-C into the ESP32-C3 SuperMini (or apply 5V across `VBUS` and `GND`).
   * Measure voltage between `J_BAT (+)` and `GND`: Should read approximately **4.20V** (TP4054 output in charging regulation).
   * Measure `Q_PWR` Drain: Should read $\approx 4.6\text{V}$ (powered from USB via `D_PWR`).
3. **Battery Power Verification**:
   * Unplug USB. Connect a 3.7V LiPo cell across `J_BAT` and close `SW_EXT`.
   * Measure `Q_PWR` Drain: Should read battery voltage ($\approx 3.7\text{V} - 4.1\text{V}$) with less than a $0.03\text{V}$ drop across the P-MOSFET.
4. **Haptic Motor Test**:
   * Temporarily bridge `Q_FET` Gate to `3.3V`: The connected haptic vibration motors should activate. When disconnected, they should stop instantly.
5. **WS2812B High-Side Switch Test**:
   * With GPIO 8 disconnected / at 0V, measure voltage at `J_LED` Pin 1 (`5V`): Must read **0.00V** (switched completely off with zero quiescent parasitic leak).
   * Temporarily connect `Q_LED_EN` Gate (or GPIO 8 socket) to `3.3V`: `J_LED` Pin 1 should instantly jump to full system rail voltage ($\approx 3.7\text{V} - 4.2\text{V}$ on battery, or $\approx 4.6\text{V}$ on USB).

---

## 6. Laser Cutting & Physical Fit-Check Files

To verify mechanical fit inside your baton tube and check component clearances before having PCBs fabricated, high-resolution vector and raster extracts have been generated directly from the circuit CAD database:

| File Name | Format | Primary Use Case |
| :--- | :--- | :--- |
| **`audioMotionBaton_laser_outline_pads.svg`** | Vector SVG (1:1 mm scale) | Direct vector cut in LightBurn / Inkscape / Glowforge (cuts perimeter & pierces pad holes). |
| **`audioMotionBaton_laser_outline_pads.png`** | 600 DPI Raster PNG | High-contrast black cut lines, drill holes, and SMT pads for raster or laser engravers. |
| **`audioMotionBaton_laser_silkscreen.svg`** | Vector SVG (1:1 mm scale) | Vector score or raster text engraving for pin labels and alignment guides. |
| **`audioMotionBaton_laser_silkscreen.png`** | 600 DPI Raster PNG | 600 DPI raster engraving of all component labels, polarity marks, and pin functions. |
| **`audioMotionBaton_laser_combined_testfit.png`** | 600 DPI Full-Color PNG | 1:1 scale composite preview (green solder mask, gold pads, white silkscreen) suitable for paper test printouts. |

* **Paper Printout Tip**: When printing `audioMotionBaton_laser_combined_testfit.png` on standard paper, ensure your printer dialog is set to **"Actual Size" / 100% scale (no fit-to-page)**. Cut it out with scissors and test-fit it inside your polycarbonate baton tube!

---

## 7. Dual-Side Silkscreen Mirroring & Interactive QR Code

* **Silkscreen Mirroring**:
  * Every pin label (`5V`, `GND`, `3V3`, `IO0`–`IO10`, `I2C`, `I2S`, `ADC`), actuator port (`HAP_L`, `HAP_R`), battery terminal (`BAT+`, `BAT-`), and power-path component designator is duplicated across both the **Top Silkscreen (`.gto`)** and **Bottom Silkscreen (`.gbo`)** layers.
  * This allows complete pinout identification and multimeter probe testing from either side of the PCB, simplifying troubleshooting once modules are soldered in place.
* **Designer Attribution**:
  * Silkscreen prominently credits the author: **`By Dillon Simeone`** on both the front face (above the ESP32) and the reverse face (above the QR code).
* **Machine-Scannable Web QR Code**:
  * A 33×33 module (Version 4, Level L) vector QR code is etched into the bottom silkscreen layer, centered between the ESP32 socket headers at $x = 0, y = 1.0\text{mm}$ ($10.56\text{mm} \times 10.56\text{mm}$).
  * Scannable by any smartphone camera, directly linking to:
    `https://dillonsimeone.com/?reason=audioMotionReactiveLedHapticPCB`

