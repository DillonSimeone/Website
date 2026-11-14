# audioMotionReactiveLedHapticPCB
## Complete Hardware Architecture, Component Breakdown & DIY Sourcing Guide

---

## 1. Executive Summary & Mechanical Envelope

The **audioMotionReactiveLedHapticPCB** is a versatile generalist carrier board designed for Dillon's reactive haptic and LED projects, wearable tech, pocketable gadgets, dynamic light batons, and interactive installations. It fits inside a standard **22mm Outer Diameter (OD) / 19–20mm Inner Diameter (ID)** cylindrical tube or custom enclosure.

* **Board Dimensions**: 20.0 mm (W) × 115.0 mm (L) × 1.6 mm (FR4 thickness)
* **Side-Mounted IMU Architecture**: The 8-pin universal IMU header is positioned along the **left edge ($x = -6.8\text{mm}$, $y = 28.5\text{mm}$)**. Because standard GY-521 / GY-6500 boards place their connector along one edge, mounting the header at $x = -6.8\text{mm}$ allows the 15.6mm wide IMU board body to sit **inward over the PCB substrate (spanning $x = -8.3\text{mm}$ to $+7.3\text{mm}$)** with **0mm protrusion beyond the 20mm tube perimeter**! Pin 8 (`INT` at $y = 19.61\text{mm}$) has a generous **$5.11\text{mm}$ vertical clearance** above `J_LED3` ($y = 14.5\text{mm}$), eliminating pin proximity crowding.
* **3-Channel Addressable LED Output Architecture**: The board provides **3 independent 3-pin addressable LED ports** (`J_LED1` at Top Tip on GPIO 6, `J_LED2` at Upper Right on GPIO 20/RX, `J_LED3` at Upper Left on GPIO 21/TX). All three headers share the switched 5V rail (`NET_5V_LED_SW`) controlled by `Q_LED_PWR`, completely cutting power during sleep with zero quiescent current.
* **Dedicated User Action / Boot Mode Button Header (`J_BTN`)**: Placed at $y = -12.0\text{mm}$ below the MCU, providing a 2-pin header (`Pin 1: GPIO 9`, `Pin 2: GND`). Connected to the ESP32-C3 BOOT pin with internal pull-up, it guarantees 100% reliable SPI flash booting while giving user firmware a hardware mode/trigger button (or manual download boot if held at power-up).
* **Zero Strapping Pin Conflicts**: Pin mapping strictly complies with ESP32-C3 boot modes (GPIO 2 pulled HIGH via I2C pullup, GPIO 8 pulled HIGH via onboard LED and connected to High-Z INMP441 SD, GPIO 9 held HIGH via internal pull-up on `J_BTN`, and GPIO 10 used for high-side switch enable with 10kΩ pull-down).
* **Safe Charger Center Clearance**: `U_CHG`, `R_PROG`, `C_VIN`, and `C_BAT` are shifted inward towards the board center ($x = -4.5\text{mm}$ and $-5.8\text{mm}$), leaving $> 3.8\text{mm}$ of clearance from the board boundary.
* **Onboard 2-Column Pinout Silkscreen Map**: In the open area adjacent to the side-mounted IMU ($x \in [-4\text{mm}, +8\text{mm}]$), a high-contrast 2-column reference table lists every GPIO and peripheral assignment directly on both the Top and Bottom copper/silkscreen layers.
* **M3 Corner Mounting Holes**: 4× symmetric plated mounting holes with **Ø3.2mm clearance drill** (fits standard M3 screws) and **Ø4.8mm copper annular ring pads**. Centered at $(\pm 6.5\text{mm}, \pm 53.5\text{mm})$ forming a precise **$13.0\text{mm} \times 107.0\text{mm}$** mounting pattern for baton end-caps, chassis rails, or standoffs.
* **Form Factor Architecture**: Split-architecture hybrid design featuring **turnkey pre-assembled SMT active power electronics** (MOSFETs, auto power-path switching, diodes, passive filters, and LiPo charger) paired with **dual-mount (Through-Hole + SMD castellated) sockets** for pluggable off-the-shelf micro-modules (ESP32-C3 SuperMini, GY-521 MPU-6050, INMP441, MAX4466).
* **Power Architecture**: 1S Li-ion / LiPo battery input (3.7V nominal / 4.2V peak) with onboard 500mA USB-C linear charging and instant zero-loss hardware power-path switching.

---

## 2. Component Engineering Breakdown: Why Each Part Was Chosen

```
+----------------------------------------------------------------------------------------------------------------+
|                                  HARDWARE ARCHITECTURE BLOCK DIAGRAM                                           |
|                                                                                                                |
|   [ USB 5V In ] ----> [ D_PWR (B5819W) ] ----------------------------+                                         |
|         |                     |                                      |                                         |
|         v                     v                                      v                                         |
|  [ U_CHG: TP4054 ]      [ Q_PWR Gate ]                        [ NET_VSYS Rail ]                                |
|         |                     |                                      |                                         |
|         | (500mA)             v                                      +----> [ ESP32-C3 MCU ]                   |
|         v             [ Q_PWR (AO3401A) ]                            |       (13 GPIO Channels Active)         |
|   [ J_BAT (3.7V) ] --------> Source -> Drain ------------------------+       |                                 |
|         |                                                            |       | [ GPIO 10 (LED Power Enable) ]  |
|   [ SW_EXT Switch ]                                                  |       |        |                        |
|                                                                      |       |        v                        |
|   [ Q_LED_PWR (AO3401A P-FET) ] <--- Source [ NET_VSYS ]             |       |  [ Q_LED_EN: AO3400A N-FET ]    |
|         | Drain                                                      |       |  [ R_LED_GATE: 10k Pull-Down ]  |
|         v [ NET_5V_LED_SW ] (Zero Quiescent Sleep)                   |       |        |                        |
|         +---------------------------------------------+              |       +--------+ (P-FET Gate Driver)    |
|         |                      |                      |              |       |  [ R_LED_PU: 100k Pull-Up ]     |
|         v                      v                      v              |                                         |
|   [ J_LED1 (Top) ]       [ J_LED2 (Mid R) ]     [ J_LED3 (Mid L) ]   |   [ J_BTN (Mode / Boot Pin) ]           |
|     DATA: GPIO 6           DATA: GPIO 20          DATA: GPIO 21      |     Pin 1: GPIO 9 (Internal Pull-Up)    |
|                                                                      |     Pin 2: GND                          |
|   [ Haptic PWM GPIO 7 ] ----> [ Q_FET: AO3400A ] <----+----+---------+----> [ J_HAP_L / J_HAP_R ] (Motors)     |
|                               [ R_GATE: 10k Pull ]     |    |        |                                         |
|                               [ D_HAP: B5819W Flyback ]+----+        +----> [ MPU-6050 IMU (Side Mount) ]      |
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
* **Placement**: Mounted along the **left edge ($x = -6.8\text{mm}$, center $y = 25.5\text{mm}$)**.
* **Mechanical Clearance**: When a standard GY-521 breakout (15.6mm wide) is plugged into the header, its board body extends inward across the baton carrier from $x = -8.3\text{mm}$ to $+7.3\text{mm}$. It sits completely inside the 20mm tube ID with 1.7mm left clearance and 2.7mm right clearance. (Previously centered at $x = 0$, the sensor poked out past the edge by ~5mm).
* **I2C Address**: `0x68` (Standard default)
* **Pinout Used**: Pin 1 (`VCC` = 3.3V), Pin 2 (`GND`), Pin 3 (`SCL` = GPIO 3), Pin 4 (`SDA` = GPIO 2), Pin 8 (`INT` = GPIO 5).
* **Critical Design Detail (AD0 Ground Separation)**:
  * GY-521 breakouts feature an onboard $4.7\text{k}\Omega$ pull-down resistor from `AD0` to `GND`, establishing the default I2C address `0x68`.
  * In our carrier PCB, **`AD0` is left unconnected**. This prevents the router from daisy-chaining sensor ground through high-current motor return paths, protecting motion sensor readings from inductive motor noise.

---

### B. Audio Sensing Subsystems & GPIO Allocation Rationale

#### 3. `J_MIC_MAX` — MAX4466 Analog Electret Microphone Header
* **Footprint**: 3-Pin Header (2.54mm pitch): `VCC` (3.3V), `GND`, `OUT`
* **Signal Pin**: Routed to **GPIO 0** (ESP32-C3 ADC1 Channel 0)
* **Why MAX4466 Must Remain on GPIO 0 (ADC Constraint)**:
  * The MAX4466 outputs a continuous analog audio waveform ($0\text{V} - 3.3\text{V}$) requiring an internal Analog-to-Digital Converter (ADC).
  * On the ESP32-C3, only GPIO 0 through GPIO 5 have ADC hardware. The remaining pins (GPIO 9, GPIO 20, GPIO 21) are strictly digital. Routing MAX4466 to GPIO 9, 20, or 21 would completely break analog microphone functionality.
  * GPIO 0 provides the lowest-noise ADC1 channel, ensuring clean analog sound sampling.

#### 4. `J_MIC_INMP` — INMP441 Digital I2S MEMS Microphone Header
* **Footprint**: Dual-Row 2×3 Header (2.54mm pitch): `SCK` (GPIO 4), `WS` (GPIO 1), `SD` (GPIO 8), `L/R` (GND), `VDD` (3.3V), `GND`
* **Protocol**: Direct Digital I2S (Inter-IC Sound), 24-bit PCM audio stream
* **Why GPIO 8 is Safe for INMP441 SD (Strapping Compliance)**:
  * At power-on reset, before I2S clocks begin, the INMP441's `SD` pin is in high-impedance (tri-state) mode.
  * On the ESP32-C3 SuperMini, GPIO 8 has an onboard user LED with a pull-up resistor to 3.3V. This naturally pulls GPIO 8 HIGH during boot, satisfying the ESP32-C3 boot mode requirement (`GPIO 8 = 1`).
  * Immunity to motor PWM and switching power noise. Supplies uncompressed 16kHz–44.1kHz audio samples directly to ESP32-C3 hardware DMA buffers.

---

### C. 3-Channel Addressable LED Output Architecture & User Button

#### 5. `J_LED1`, `J_LED2`, `J_LED3` — Triple Addressable LED Headers
* **`J_LED1` (Main Top Tip)**: Pin 1 = 5V_SW, Pin 2 = DATA (GPIO 6), Pin 3 = GND ($y = 50.5\text{mm}$, $x = 0$)
* **`J_LED2` (Aux Right Upper)**: Pin 1 = 5V_SW, Pin 2 = DATA (GPIO 20 / RX), Pin 3 = GND ($y = 14.5\text{mm}$, $x = +4.5\text{mm}$)
* **`J_LED3` (Aux Left Upper)**: Pin 1 = 5V_SW, Pin 2 = DATA (GPIO 21 / TX), Pin 3 = GND ($y = 14.5\text{mm}$, $x = -4.5\text{mm}$)
* **Unified High-Side Power Control**:
  * All 3 LED ports have their VCC pins connected to `NET_5V_LED_SW`, driven by `Q_LED_PWR`.
  * When entering deep sleep, firmware de-asserts GPIO 10, completely shutting off power to all connected LED strips across all 3 headers, eliminating 50–75mA parasitic quiescent drain!

#### 5b. `J_BTN` — External User Action / Boot Mode Button Header
* **Footprint**: 2-Pin Header (2.54mm pitch): Pin 1 = `BTN` (GPIO 9), Pin 2 = `GND` ($y = -12.0\text{mm}$, $x = 0$)
* **Why GPIO 9 is Reserved for a Button (Strapping Compliance)**:
  * On the ESP32-C3, GPIO 9 is the primary BOOT strapping pin. Pulling GPIO 9 LOW during power-on triggers the serial download bootloader, while leaving it HIGH executes normal SPI flash boot.
  * If an unpowered LED strip were attached to GPIO 9, its unpowered ESD clamp diode would drag GPIO 9 LOW on startup, bricking normal boot!
  * By dedicating GPIO 9 to an open pushbutton (`J_BTN`), the chip's internal weak pull-up holds GPIO 9 HIGH, ensuring 100% reliable booting from flash.
  * During runtime, firmware uses `J_BTN` as a multi-function user button (single click, double click, hold) for switching animation modes, color palettes, or sensitivity profiles.

#### 6. High-Side WS2812B Power Switch Architecture
* **The Parasitic Quiescent Drain Problem**:
  * Each WS2812B integrated driver IC contains an internal oscillator, shift register, and constant-current drive circuitry. Even when commanded to turn all LEDs "off" (RGB `0, 0, 0`), each pixel draws **0.8mA to 1.2mA** of continuous quiescent supply current.
  * For a typical 64-LED strip, that is a constant **50mA to 75mA parasitic leak** while sitting idle.
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
* **Control**: Driven by **GPIO 10** (ESP32-C3)
* **Why Driven by GPIO 10 Instead of GPIO 8 (Strapping Isolation)**:
  * GPIO 10 is a non-strapping, pure digital GPIO on the ESP32-C3.
  * Connecting `Q_LED_EN`'s gate (and its essential 10kΩ pull-down resistor `R_LED_GATE`) to GPIO 10 ensures that the pull-down **never pulls a boot strapping pin to ground**.
  * Using the AO3400A N-FET pre-driver completely decouples logic level from rail voltage: when GPIO 10 is HIGH (3.3V), the N-FET turns ON and pulls the P-FET gate cleanly to 0V (GND), driving $V_{GS}$ to a full $-3.7\text{V}$ to $-5.0\text{V}$ for hard saturation.

#### 10. `R_LED_GATE` — 10kΩ 1% 0603 Pre-Driver Pull-Down Resistor
* **Connection**: Connected between `Q_LED_EN` Gate (Pin 1) and `GND` (Pin 2) on GPIO 10.
* **Function**: Ensures the pre-driver gate stays solidly at 0V during microcontroller power-up resets and deep sleep modes when GPIO 10 floats high-impedance.

#### 11. Recommended Firmware Power Sequencing Protocol
To avoid phantom-powering the LED strip through the data line, firmware should execute this sequence:
* **Power-On Sequence**:
  1. Configure `DATA` pin (GPIO 6) as `OUTPUT` and drive `LOW`.
  2. Wait $1\text{ms}$.
  3. Assert `LED_PWR_EN` (GPIO 10) `HIGH` to engage the high-side switch.
  4. Wait $2\text{ms}$ for supply rail decoupling capacitors to charge and stabilize.
  5. Begin transmitting WS2812B RMT pulse stream.
* **Standby / Power-Down Sequence**:
  1. Write RGB `(0, 0, 0)` to all pixels and latch.
  2. Drive `DATA` pin (GPIO 6) firmly `LOW`.
  3. De-assert `LED_PWR_EN` (GPIO 10) `LOW` to cut the 5V rail.
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

