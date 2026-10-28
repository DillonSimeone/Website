# 03: Compact Dense Square Audio & Motion Reactive Controller PCB
## Complete Hardware Architecture, Spatial Density Breakdown & Turnkey Assembly Guide

---

## 1. Executive Summary & Mechanical Envelope

The **03-compactAudioMotionSquarePCB** is an ultra-dense, parametric square carrier board designed for compact interactive devices, wearable medallions, pocketable audio-visual gadgets, dynamic robotics, and enclosed props where an elongated baton cannot fit.

* **Board Dimensions**: $38.0\,\text{mm} \times 38.0\,\text{mm} \times 1.6\,\text{mm}$ (FR4 standard 2-layer).
* **Footprint Area**: $1444\,\text{mm}^2$ (~37% smaller footprint than Project 02's $2300\,\text{mm}^2$ baton, and a ~67% reduction in maximum bounding dimension from 115mm to 38mm).
* **Back-to-Back 3D Component Stacking**:
  * **Top Surface**: ESP32-C3 SuperMini mounted slightly offset from center ($x = -2.5\,\text{mm}, y = 1.5\,\text{mm}$).
  * **Backside (Bottom Surface)**: Universal MPU-6050 / GY-521 8-pin vertical header mounted at $x = +9.0\,\text{mm}, y = 1.5\,\text{mm}$.
  * **Physical Clearance Math**: The distance between ESP32 right pin row ($+6.39\,\text{mm}$) and the IMU pin row ($+9.0\,\text{mm}$) is $2.61\,\text{mm}$ (> 100 mil). When plugged into the bottom header, the $15.6\,\text{mm} \times 20.5\,\text{mm}$ GY-521 board body extends across the backside toward the left ($x = +9.0$ to $-6.6\,\text{mm}$), resting directly underneath the ESP32 substrate with **zero pin collision**.
* **Perimeter Ring Distribution**:
  * All user-accessible headers (3× addressable LED outputs, 2× haptic vibration motor outputs, MAX4466 analog microphone, INMP441 digital I2S microphone, boot mode button, battery dual solder pads, and external power switch) are arranged along the 4 outer edges of the square board.
* **Standard 4-Corner M3 Mounting Pattern**:
  * 4× symmetric plated mounting holes with **Ø3.2mm clearance drill** and **Ø4.8mm copper annular ring pads**. Centered at $(\pm 15.5\,\text{mm}, \pm 15.5\,\text{mm})$, creating a standardized **$31.0\,\text{mm} \times 31.0\,\text{mm}$** mounting pattern compatible with electronics stacks, quadcopter frames, and 3D printed enclosures.
* **Turnkey Factory Assembly (JLCPCB 1-to-1 BOM & CPL Parity)**:
  * Factory SMT pre-assembly of all 14 active & passive discrete parts: MCP73831 LiPo charger, auto power-path switching (AO3401A + SS14), inductive flyback haptic driver (AO3400A + SS14), and quiescent drain high-side LED cutoff (AO3401A + AO3400A pre-driver).

---

## 2. Hardware Architecture Block Diagram

```
+----------------------------------------------------------------------------------------------------------------+
|                                    PROJECT 03 HARDWARE BLOCK DIAGRAM                                           |
|                                                                                                                |
|   [ USB 5V In ] ----> [ D_PWR (SS14) ] ------------------------------+                                         |
|         |                    |                                       |                                         |
|         v                    v                                       v                                         |
|  [ U_CHG: MCP73831 ]   [ Q_PWR Gate ]                         [ NET_VSYS Rail ]                                |
|         |                    |                                       |                                         |
|         | (500mA)            v                                       +----> [ ESP32-C3 MCU (Top Side) ]        |
|         v            [ Q_PWR (AO3401A) ]                             |       (13 GPIO Channels Active)         |
|   [ J_BAT (Dual) ] ----> Source -> Drain ----------------------------+       |                                 |
|         |                                                            |       | [ GPIO 10 (LED Power Enable) ]  |
|   [ SW_EXT Switch ]                                                  |       |        |                        |
|                                                                      |       |        v                        |
|   [ Q_LED_PWR (AO3401A P-FET) ] <--- Source [ NET_VSYS ]             |       |  [ Q_LED_EN: AO3400A N-FET ]    |
|         | Drain                                                      |       |  [ R_LED_GATE: 10k Pull-Down ]  |
|         v [ NET_5V_SW ] (Zero Quiescent Sleep)                       |       |        |                        |
|         +---------------------------------------------+              |       +--------+ (P-FET Gate Driver)    |
|         |                      |                      |              |       |  [ R_LED_PU: 100k Pull-Up ]     |
|         v                      v                      v              |                                         |
|   [ J_LED1 (Top) ]       [ J_LED2 (Right) ]     [ J_LED3 (Left) ]    |   [ J_BTN (Mode / Boot Pin) ]           |
|     DATA: GPIO 6           DATA: GPIO 20          DATA: GPIO 21      |     Pin 1: GPIO 9 (Internal Pull-Up)    |
|                                                                      |     Pin 2: GND                          |
|   [ Haptic PWM GPIO 7 ] ----> [ Q_FET: AO3400A ] <----+----+---------+----> [ J_HAP_L / J_HAP_R ] (Motors)     |
|                               [ R_GATE: 10k Pull ]     |    |        |                                         |
|                               [ D_HAP: SS14 Flyback ]  +----+        +----> [ MPU-6050 IMU (Backside) ]        |
|                                                                      +----> [ INMP441 / MAX4466 Mics ]         |
+----------------------------------------------------------------------------------------------------------------+
```

---

## 3. Spatial Density & Nesting Math

### 3.1 Back-to-Back Layer Separation
By mounting the ESP32-C3 SuperMini on the **top surface** and the GY-521 MPU-6050 breakout on the **backside**:
1. **Vertical Footprint Compression**: The two largest micro-modules occupy the **exact same $X/Y$ board area** on opposing faces of the 1.6mm FR4 core.
2. **Pin Clearance Without Overlap**:
   - ESP32-C3 SuperMini right row of pins is at $x = -2.5 + 8.89 = +6.39\,\text{mm}$.
   - MPU-6050 8-pin header is at $x = +9.0\,\text{mm}$.
   - Distance between rows: $9.0 - 6.39 = 2.61\,\text{mm}$.
   - Even if through-hole pins are trimmed to standard 1.5mm protrusion, there is zero risk of electrical short-circuit or physical pin collision.

### 3.2 Dual-Mount Hybrid Footprints
Every connector (MCU 16-pin, IMU 8-pin, LEDs, Microphones, Haptics, and Battery Pads) features dual-mount pads:
- **Plated Through-Hole (THT)**: $\varnothing 1.0\,\text{mm}$ drill with $\varnothing 1.8\,\text{mm}$ annular ring for high-vibration pin headers.
- **Surface Mount (SMD)**: Overlapping rectangular solder pads ($1.6\,\text{mm} \times 1.6\,\text{mm}$) for flush surface soldering.

---

## 4. Turnkey SMT Bill of Materials (JLCPCB 1-to-1 Parity)

| Item # | Designator | Component Description | Footprint | LCSC Part # | Qty |
|---|---|---|---|---|---|
| 1 | `U_CHG` | MCP73831T-2ACI/OT 500mA Linear Charger | SOT-23-5 | `C14878` | 1 |
| 2 | `R_PROG` | 2.0 kΩ 1% 0603 Thick Film Resistor | 0603 | `C17975` | 1 |
| 3 | `C_VIN` | 4.7 µF 10V X5R 0603 Ceramic Capacitor | 0603 | `C15849` | 1 |
| 4 | `C_BAT` | 4.7 µF 10V X5R 0603 Ceramic Capacitor | 0603 | `C15849` | 1 |
| 5 | `Q_PWR` | AO3401A -30V -4.0A P-Channel MOSFET | SOT-23 | `C15127` | 1 |
| 6 | `D_PWR` | SS14 40V 1A Schottky Barrier Diode | SOD-123 | `C22452` | 1 |
| 7 | `R_PWR` | 100 kΩ 5% 0603 Thick Film Resistor | 0603 | `C25803` | 1 |
| 8 | `Q_FET` | AO3400A 30V 5.7A N-Channel MOSFET | SOT-23 | `C20917` | 1 |
| 9 | `R_GATE` | 10 kΩ 5% 0603 Thick Film Resistor | 0603 | `C25804` | 1 |
| 10 | `D_HAP` | SS14 40V 1A Schottky Flyback Diode | SOD-123 | `C22452` | 1 |
| 11 | `Q_LED_PWR` | AO3401A -30V -4.0A P-Channel MOSFET | SOT-23 | `C15127` | 1 |
| 12 | `Q_LED_EN` | AO3400A 30V 5.7A N-Channel MOSFET | SOT-23 | `C20917` | 1 |
| 13 | `R_LED_PU` | 100 kΩ 5% 0603 Thick Film Resistor | 0603 | `C25803` | 1 |
| 14 | `R_LED_GATE` | 10 kΩ 5% 0603 Thick Film Resistor | 0603 | `C25804` | 1 |

---

## 5. Summary of Key Achievements
1. Successfully compressed the circuit from 115mm down to 38mm.
2. Solved spatial collision by back-to-back 3D stacking of the ESP32 and MPU.
3. Preserved all 3 independent addressable LED channels, dual haptic drivers, dual microphones, and LiPo charging with automatic power-path switching.
4. Maintained 100% manufacturing parity with JLCPCB SMT guidelines.
