# All-in-One SMD Audio & Motion Reactive Baton PCB (04-smdAudioMotionBatonPCB)

Developer & AI agent reference manual for the all-SMD integrated baton controller.

---

## 0. Strict Scoping & Execution Constraints
- **Scoping**: Confine edits to `public/ParametricPCB/04-smdAudioMotionBatonPCB/` and `public/ParametricPCB/shared/`.
- **Engineering Skill Reference**: Consult [../SKILL.md](../SKILL.md) for master EDA architecture, JLCPCB SMT manufacturing rules, SOT-23 rotation tables, flyback diode polarity rules, trace width clamping, and laser test-fit protocols.
- **Build Guard**: NEVER execute `npm run build` (portfolio builds managed by user).
- **ESM Dependency Pattern**: Load Three.js via `https://esm.sh/three@0.136.0` in browser ES modules.

---

## 1. Key Architecture & Design Decisions

### 1.1 ESP32-C3 Native USB-C Programming
Unlike earlier revisions that required socketed dev boards or external USB-UART converter ICs (like CP2102/CH340), the ESP32-C3 SoC embeds a full USB Serial/JTAG controller directly on pins:
- **GPIO 18**: USB D- (`DN1`, `DN2` on Type-C receptacle `J_USB`)
- **GPIO 19**: USB D+ (`DP1`, `DP2` on Type-C receptacle `J_USB`)
The CC1 and CC2 pins on the USB-C receptacle are pulled down to GND using 5.1kΩ resistors (`R_CC1`, `R_CC2`). This instructs USB-C hosts to deliver standard 5V VBUS power without complex PD controllers.

### 1.2 Boot Strapping Pin Management
ESP32-C3 samples strapping pins during chip power-up (`EN` transition from LOW to HIGH):
- **GPIO 2 (I2C SDA)**: Must be HIGH on boot. Connected to 3.3V via 4.7kΩ pull-up resistor `R_SDA`, perfectly satisfying both I2C bus specs and boot strapping.
- **GPIO 8 (I2S SD)**: Must be HIGH during boot. In high-impedance mode on reset.
- **GPIO 9 (Boot Button)**: Sampled on reset. Driven HIGH by internal and external 10kΩ pull-up `R_BOOT` to boot normally into SPI flash. Pressing `SW_BOOT` pulls it to GND during power-up to force ROM download/flashing mode.

### 1.3 High-Side LED Isolation & Parasitic Sleep Current
Addressable LEDs (WS2812B, SK6812) draw 1–2mA quiescent current *per pixel* even when commanded off. An array of 50 LEDs wastes 50–100mA, rapidly draining a 1S LiPo battery in standby.
- **Circuit**: An AO3401A P-MOSFET (`Q_LED_PWR`) gates the +5V/VSYS rail feeding `J_LED`.
- **Pre-Driver**: An AO3400A N-MOSFET (`Q_LED_EN`) driven by GPIO 10 pulls the P-MOSFET gate to GND when active.
- **Safety**: 100kΩ pull-up on P-MOSFET gate and 10kΩ pull-down on N-MOSFET gate guarantee the LED power rail remains 100% OFF during deep sleep or bootloader execution.

### 1.4 Haptic PWM Inductive Kickback Clamping
Driving ERM or LRA vibration motors directly with a MOSFET causes large inductive voltage spikes when switched off. An SS14 Schottky diode (`D_HAP`) is placed directly across the motor header terminals (Cathode to VSYS, Anode to MOSFET Drain), clamping inductive spikes to < 0.4V and preventing MOSFET drain breakdown.

---

## 2. Component Designator Lookup & BOM Parity

All components in this design correspond 1-to-1 with active JLCPCB / LCSC basic or preferred parts:

| Designator | Component / Value | Footprint | LCSC Part # | Function |
|---|---|---|---|---|
| `U_MCU` | ESP32-C3-WROOM-02-N4 | MODULE_18x20mm | `C2934560` | Main Controller (Wi-Fi, BLE, USB) |
| `U_IMU` | LSM6DS3TR-C (STMicro) | LGA-14_2.5x3mm | `C967633` | 6-Axis Motion Sensor (I2C, ~$1.32, in-stock) |
| `U_MIC` | WMM7037AT2-4/TR (WillSemi) | LGA-4_3.8x3mm | `C140705` | Analog MEMS Mic to ESP32 ADC (~$0.25, in-stock) |
| `U_LDO` | ME6211C33M5G-N | SOT-23-5 | `C82942` | 3.3V 500mA Low Dropout Regulator |
| `U_CHG` | TP4054 | SOT-23-5 | `C382138` | Linear 1S LiPo Battery Charger |
| `J_USB` | TYPE-C-31-M-12 | USB-C-16P | `C165948` | 5V Power & Native USB CDC/JTAG |
| `Q_PWR` | AO3401A (-30V, -4.2A) | SOT-23 | `C15127` | Battery Auto Power-Path Switch |
| `Q_LED_PWR` | AO3401A (-30V, -4.2A) | SOT-23 | `C15127` | High-Side LED Power Isolator |
| `Q_LED_EN` | AO3400A (30V, 5.7A) | SOT-23 | `C20917` | LED Power Pre-Driver |
| `Q_HAP` | AO3400A (30V, 5.7A) | SOT-23 | `C20917` | Haptic Motor Low-Side PWM Driver |
| `D_PWR` | SS14 (40V, 1A) | SOD-123 | `C8598` | USB Power-Path Schottky Diode |
| `D_HAP` | SS14 (40V, 1A) | SOD-123 | `C8598` | Haptic Flyback Clamp Diode |
| `D_PWR_LED` | Red LED | 0603 | `C84267` | 3.3V Power Rail Indicator (Shares feeder with D_CHG) |
| `D_CHG` | Red LED | 0603 | `C84267` | LiPo Charging Status Indicator |
| `SW_EN` | TS-1187A | SMD_PUSH_SWITCH | `C318884` | Hardware Reset Button |
| `SW_BOOT` | TS-1187A | SMD_PUSH_SWITCH | `C318884` | Bootloader / User Action Button |
| `R_CC1, R_CC2` | 5.1k | 0603 | `C23186` | USB-C Host PD Pull-downs (Basic Library) |
| `R_SDA, R_SCL` | 4.7k | 0603 | `C23162` | I2C Bus Pull-ups (Basic Library) |
| `R_PROG` | 2k | 0603 | `C22975` | Charger Current Set (500mA) (Basic Library) |
| `R_CHG, R_PWR_LED` | 1k | 0603 | `C21190` | LED Current Limiters (Basic Library) |
| `R_EN, R_BOOT, R_HAP_G, R_LED_G` | 10k | 0603 | `C25804` | Reset, Boot, & Gate Pull-downs (Basic Library) |
| `R_PWR, R_LED_PU` | 100k | 0603 | `C25803` | Power-Path & LED Gate Pull-ups (Basic Library) |
| `C_IN, C_OUT` | 10uF | 0603 | `C19702` | LDO Input/Output Ceramic Filters (10V Basic Library) |
| `C_IMU, C_MIC` | 0.1uF | 0603 | `C14663` | Sensor High-Frequency Decoupling (Basic Library) |
| `J_LED` | 3-Pin Header | Dual-Mount THT+SMD | N/A | Output to Addressable LED Strips |
| `J_HAP` | 2-Pin Header | Dual-Mount THT+SMD | N/A | Output to Haptic Vibration Motor |
| `J_MPU` | 5-Pin Header | Dual-Mount THT+SMD | N/A | I2C Logic Analyzer / Expansion Tap |
| `J_BAT` | 2-Pin Pads | Dual-Mount THT+SMD | N/A | 3.7V 1S LiPo Battery Terminals |
| `SW_EXT` | 2-Pin Header | Dual-Mount THT+SMD | N/A | External Battery Power Switch |

> **BOM Unrolling**: In the exported manufacturing files, all 33 SMT components are unrolled to distinct 1-per-designator rows to eliminate JLCPCB auto-matcher grouping warnings.

---

## 3. Automated Validation Suite

Always execute the automated test suite after modifying footprints, circuits, or exports:

```bash
# 1. Full static pre-flight check (footprints + collision audit + netlist audit)
npm test

# 2. Live warehouse stock, tiered pricing, and PCBA quote auditor
npm run check-supply
node shared/check-jlc-supply.mjs 04

# 3. Headless Chrome browser visualizer & WebGL validation
npm run test:browser
node shared/test-headless.mjs 04

# 4. Target custom quantity quote (e.g. 50 boards)
node shared/check-jlc-supply.mjs 04 --qty=50
```

---

## 4. JLCPCB Assembly Constraints & PCBA Mode

1. **Standard PCBA Required**:
   - The LGA sensors (`LSM6DS3TR-C` LGA-14 and `WMM7037AT2` LGA-4) have concealed bottom pads requiring Automated X-Ray Inspection (AXI). Select **Standard PCBA ($24 base fee)** in JLCPCB checkout.
   - The MCU (`ESP32-C3-WROOM-02`) is `ProductType: 0` (Economic PCBA eligible). It does NOT trigger Standard PCBA.
2. **"Qty 0" Screen Misunderstanding**:
   - On the JLCPCB BOM review table, `Qty` indicates parts to place on your order, not warehouse stock. Unchecked or warning rows show `Qty: 0`. Unrolling to 33 distinct rows ensures 100% auto-checked rows with 0 warnings.
3. **Volume Scaling**:
   - At 10 boards: ~$10.28 / assembled board.
   - At 50 boards: ~$7.01 / assembled board.
   - At 100 boards: ~$6.54 / assembled board.
   - For small batches (<20 units), Carrier PCBs ([Project 02](../02-audioMotionReactiveLedHapticPCB/)) are the most cost-effective alternative at ~$2.70/baton using $1 AliExpress dev boards.
