# Compact Dense Square Audio & Motion Reactive Controller PCB (03-compactAudioMotionSquarePCB)

## 0. Strict Scoping & Execution Constraints
- **Scoping**: Confine edits to `public/ParametricPCB/03-compactAudioMotionSquarePCB/` and `public/ParametricPCB/00-commonParts/`.
- **Engineering Skill Reference**: Consult [../SKILL.md](../SKILL.md) for master EDA architecture, JLCPCB SMT manufacturing rules, SOT-23 rotation tables, flyback diode polarity rules, trace width clamping, and laser test-fit protocols.
- **Build Guard**: NEVER execute `npm run build` (portfolio builds managed by user).
- **ESM Dependency Pattern**: Load Three.js via `https://esm.sh/three@0.136.0` in browser ES modules.

---

## 1. Hardware Architecture & Spatial Layout

### 1.1 Form Factor & Mechanical Envelope
- **Dimensions**: Parametric square profile. Default $38.0\,\text{mm} \times 38.0\,\text{mm} \times 1.6\,\text{mm}$ FR4.
- **Area Efficiency**: $1444\,\text{mm}^2$ (~37% smaller footprint than Project 02's $2300\,\text{mm}^2$ baton).
- **Bolt Pattern**: 4× M3 corner plated holes ($\varnothing 3.2\,\text{mm}$ drill / $\varnothing 6.0\,\text{mm}$ copper annular ring) located at $(\pm 15.5\,\text{mm}, \pm 15.5\,\text{mm})$, producing a standard $31.0\,\text{mm} \times 31.0\,\text{mm}$ bolt pattern with full screw-head clearance.

### 1.2 Back-to-Back 3D Component Stacking
- **Top Layer**:
  - **ESP32-C3 SuperMini (`U_MCU`)**: Mounted on top surface, slightly offset from center ($x = -2.5\,\text{mm}, y = 1.5\,\text{mm}$). Left pin row at $x = -11.39\,\text{mm}$, right pin row at $x = +6.39\,\text{mm}$. USB-C port faces outward toward the top edge for easy cable access.
- **Backside (Bottom Layer)**:
  - **Universal IMU (`U_IMU`, MPU-6050 / GY-521)**: 8-pin vertical header mounted on the bottom side at $x = +9.0\,\text{mm}, y = 1.5\,\text{mm}$.
  - **Mechanical Clearance & Insulation**: The ESP32 right pin row ($+6.39\,\text{mm}$) sits beneath the GY-521 board body ($x = +9.0$ to $-6.6\,\text{mm}$). The bottom silkscreen features an explicit caution label (`INSULATE / FLUSH CUT PINS UNDER IMU MODULE`). Solder tails should be flush-trimmed and covered with Kapton tape before seating the GY-521.

### 1.3 Perimeter Peripheral Map
- **Addressable LED Outputs**:
  - `J_LED` (Main, GPIO 6): Centered at top edge ($x = 0\,\text{mm}, y = 15.5\,\text{mm}$).
  - `J_LED2` (Aux Right, GPIO 20 / RX): Right edge ($x = 15.5\,\text{mm}, y = 6.5\,\text{mm}$).
  - `J_LED3` (Aux Left, GPIO 21 / TX): Left edge ($x = -15.5\,\text{mm}, y = 6.5\,\text{mm}$). Matches Project 02 architecture (brief 115.2k bootloader blip on power-up, completely avoids GPIO 9 strapping pin).
- **Haptic Vibration Motors**:
  - `J_HAP_L`: Left edge ($x = -15.5\,\text{mm}, y = -2.5\,\text{mm}$).
  - `J_HAP_R`: Right edge ($x = 15.5\,\text{mm}, y = -2.5\,\text{mm}$).
- **Microphones**:
  - `J_MIC_MAX` (Analog MAX4466): Bottom-left ($x = -8.5\,\text{mm}, y = -13.5\,\text{mm}$) on GPIO 0 (ADC1_CH0). Full clearance from M3 corner hole.
  - `J_MIC_INMP` (Digital I2S INMP441): Bottom-right ($x = 7.0\,\text{mm}, y = -11.5\,\text{mm}$) on GPIO 1, 4, 8.
- **Power & Controls**:
  - `J_BAT`: Dual solder pads along bottom edge ($x = 0\,\text{mm}, y = -16.0\,\text{mm}$) for 1S LiPo wires.
  - `SW_EXT`: 2-pin power switch along right edge ($x = 14.8\,\text{mm}, y = -10.0\,\text{mm}$). Dedicated hardware power isolation.

---

## 2. Factory-Assembled SMT Turnkey Components (14 Parts, 1-to-1 Match with Project 02)

1. `AO3401A P-MOSFET (Q_PWR, C15127)` + `B5819W Schottky Diode (D_PWR, C8598)` + `100kΩ Resistor (R_PWR, C25803)`:
   - **Automatic Power-Path Management**: Isolates LiPo when USB 5V VBUS is connected. When USB is disconnected, gate pulls low via 100kΩ, enabling battery power through ultra-low resistance P-MOS ($R_{DS(on)} < 30\text{m}\Omega$).
2. `TP4054 600mA Li-ion Charger (U_CHG, C382138)` + `2kΩ PROG Resistor (R_PROG, C22975)` + `C_VIN / C_BAT (4.7µF 16V 0603, C19666)`:
   - **Safe Fast Charging**: Sets charging current to 500mA. In-stock JLCPCB Basic Part with pin-compatible SOT-23-5 footprint.
3. `AO3400A N-MOSFET (Q_FET, C20917)` + `10kΩ Gate Pull-Down (R_GATE, C25804)` + `B5819W Flyback Diode (D_HAP, C8598)`:
   - **Haptic Inductive Clamp**: Flyback diode `D_HAP` placed with **Cathode on VSYS (+) and Anode on Drain**, clamping inductive kickback spikes while preventing catastrophic dead shorts. `R_GATE` silences haptic motors during boot.
4. `AO3401A P-MOSFET (Q_LED_PWR, C15127)` + `AO3400A N-MOSFET Pre-Driver (Q_LED_EN, C20917)` + `100kΩ Gate Pull-Up (R_LED_PU, C25803)` + `10kΩ Gate Pull-Down (R_LED_GATE, C25804)`:
   - **LED High-Side Power Isolation**: Driven by GPIO 10. Completely cuts power to WS2812B strips during sleep mode, eliminating 50–75mA of parasitic quiescent draw without conflicting with boot strapping pins.

---

## 3. ESP32-C3 Pin Allocation & Boot Strapping Table

| Pin # | Physical Pad | Net Name | Function / Peripheral | Destination | Boot Strapping Status |
|---|---|---|---|---|---|
| Pin 1 | 5V | `5V` | Primary USB 5V / VBUS Rail | Charge IC `VIN`, Power-path Gate | Power Rail |
| Pin 2 | GND | `GND` | Common Ground Return | System Ground plane | Power Rail |
| Pin 3 | 3V3 | `3V3` | Regulated 3.3V System Rail | IMU, MAX4466, INMP441 | Power Rail |
| Pin 4 | GPIO 0 | `NET_MIC_ADC` | ADC1_CH0 Analog Audio Input | MAX4466 Analog `OUT` | Non-strapping (Requires ADC1) |
| Pin 5 | GPIO 1 | `NET_I2S_WS` | I2S Word Select (`LRCLK`) | INMP441 `WS` | Non-strapping |
| Pin 6 | GPIO 2 | `NET_I2C_SDA` | I2C Data (default 0x68) | MPU6050/6500 `SDA` | **Strapping: Must be HIGH (Held HIGH by 4.7kΩ pull-up)** |
| Pin 7 | GPIO 3 | `NET_I2C_SCL` | I2C Clock | MPU6050/6500 `SCL` | Non-strapping |
| Pin 8 | GPIO 4 | `NET_I2S_SCK` | I2S Serial Clock (`BCLK`) | INMP441 `SCK` | Non-strapping |
| Pin 9 | GPIO 5 | `NET_IMU_INT` | IMU Motion Interrupt Input | MPU6050/6500 `INT` | Non-strapping |
| Pin 10 | GPIO 6 | `NET_LED_DATA` | Addressable LED 1 Data | `J_LED` (Main Top) Pin 2 (`DAT`) | Non-strapping |
| Pin 11 | GPIO 7 | `NET_HAPTIC_PWM` | LEDC PWM (Gate drive) | AO3400A Gate (`Q_FET`) via 100Ω | Non-strapping |
| Pin 12 | GPIO 8 | `NET_MIC_SD` | I2S Serial Data In (`DOUT`) | INMP441 `SD` | **Strapping: Must be HIGH (High-Z on boot + SuperMini LED pull-up)** |
| Pin 13 | GPIO 9 | `NET_GPIO9_NC` | Unused / Spare Header Pin | ESP32 SuperMini Pin 13 | **Strapping: Held HIGH by internal pull-up (Clean flash boot)** |
| Pin 14 | GPIO 10 | `NET_LED_PWR_EN`| High-Side LED Power Enable | AO3400A Pre-Driver Gate (`Q_LED_EN`) | **Non-strapping (10kΩ pull-down safe)** |
| Pin 15 | RX (GPIO 20) | `NET_LED2_DATA` | Addressable LED 2 Data | `J_LED2` (Right Aux) Pin 2 (`DAT`) | Non-strapping |
| Pin 16 | TX (GPIO 21) | `NET_LED3_DATA` | Addressable LED 3 Data | `J_LED3` (Left Aux) Pin 2 (`DAT`) | Non-strapping (Outputs 115.2k boot messages on reset) |

---

## 4. Silkscreen, Vector QR & Decoupled Rendering
- **Silkscreen Scale**: Decoupled 2048px canvas decal update (`drawSilkscreenDecal()`) executes in < 2ms without re-compiling tscircuit AST.
- **Bottom Silkscreen Vector QR Code**: Links to `https://dillonsimeone.com/?reason=compactAudioMotionSquarePCB`.
- **Japanese Seigaiha Ripples**: Semicircular concentric wave arches fill open perimeter spaces.
