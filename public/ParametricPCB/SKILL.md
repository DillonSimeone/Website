---
name: parametric-pcb-designer
description: Comprehensive guidelines, EDA rules, and design patterns for building browser-based parametric PCBs with tscircuit, Three.js, and JLCPCB turnkey SMT assembly.
---

# Parametric PCB Design & Manufacturing Skill

This skill defines the engineering specifications, EDA design patterns, manufacturing rules, and failure-mode mitigations for designing parametric printed circuit boards within the `public/ParametricPCB/` suite.

---

## 1. Tooling Architecture & Offline Bundling

Browser-based parametric PCB design pairs **React-like JSX/declarative ASTs** (`tscircuit`) with **Three.js** (3D inspection) and **interactive SVGs** (2D layout & schematic).

### 1.1 Local Module Bundling (Bypassing CDN & MIME Hazards)
- **Problem**: Remote CDN imports (`esm.sh`, `unpkg`, `cdnjs`) for heavy EDA compilers fail under strict browser security policies (`X-Content-Type-Options: nosniff`), local offline dev servers, or internet drops.
- **Rule**: Bundle core EDA engines locally inside `public/ParametricPCB/00-commonParts/`:
  - `tscircuit-core.js`: Programmatic AST compiler and rat's nest autorouter.
  - `circuit-json-to-gerber.js`: Gerber RS-274X and Excellon drill generator.
- Load local libraries via explicit relative script tags or browser ESM. For Three.js in standalone submodules, use vetted versioned CDNs (`https://esm.sh/three@0.136.0`) with proper fallbacks.

### 1.2 Dual-Mount Hybrid Footprints (THT + SMD)
For mechanical vibration resistance and prototyping flexibility:
- Breakout headers (MCUs, IMUs, sensors, power terminals) must define dual-mount pads in `src/footprints.js`:
  - **SMD Rectangular Pad**: `width = 1.6mm`, `height = 1.6mm` on top copper layer.
  - **Plated Through-Hole (THT)**: `hole_diameter = 1.0mm`, `outer_diameter = 1.9mm` centered on the pad.
- Modules can be soldered flush against the board as surface-mount castellations, or through-hole soldered with standard 2.54mm square pin headers.

---

## 2. Electrical Design & Circuit Topologies

### 2.1 Low-Side N-FET Flyback Diode Polarity (The Inductive Dead-Short Trap)
- **Inductive Load Physics**: DC motors, solenoids, and coils generate severe inductive kickback spikes ($V = -L \frac{di}{dt}$) upon PWM turn-off.
- **Circuit Rule**:
  - Flyback diode (`D_HAP`, e.g., SS14 Schottky) MUST have its **Cathode on the positive rail ($V_{SYS}$)** and its **Anode on the MOSFET Drain**.
  - During normal operation, the diode is **reverse-biased** (inactive).
  - When the MOSFET turns off, the collapsing magnetic field forces the drain voltage above $V_{SYS}$, forward-biasing the diode and safely circulating the flyback current through the supply rail.
- **CRITICAL REVERSAL HAZARD**:
  - If Cathode is placed on Drain and Anode on $V_{SYS}$, the diode is forward-biased the instant the MOSFET turns on.
  - The moment PWM asserts HIGH, a **dead short** forms from $V_{SYS} \to \text{Diode} \to \text{MOSFET} \to \text{GND}$, immediately destroying the diode or MOSFET.

```
       +--- V_SYS (3.7V - 4.2V) ---+
       |                           |
   +-------+                     [===] D_HAP (Cathode Band to V_SYS)
   | Motor |                       |
   +-------+                       |   (Anode to Drain)
       |                           |
       +------------+--------------+
                    |
                 Drain (D)
  GPIO --[100Ω]-- Gate (G)   AO3400A (N-MOSFET)
                    |
                 Source (S)
                    |
                   GND
```

### 2.2 Addressable LED High-Side Power Isolation (Parasitic Quiescent Drain)
- **Parasitic Drain**: WS2812B / SK6812 smart LEDs draw $0.8\text{mA}$ to $1.2\text{mA}$ per pixel even when turned off in software. A 64-LED baton strip consumes $50\text{--}75\text{mA}$ idle current, draining a 1000mAh LiPo in 13 hours of sleep.
- **High-Side Switching Rule**:
  - Use a high-side P-Channel MOSFET (`AO3401A`) between the power rail ($V_{SYS}$) and the LED `5V` strip rail.
  - Source to $V_{SYS}$, Drain to LED Strip `5V`.
  - Gate pulled HIGH to Source via $100\text{k}\Omega$ resistor (`R_LED_PU`) to keep LEDs OFF by default.
  - Drive P-FET Gate using a small N-Channel MOSFET (`AO3400A`) driven by an ESP32 GPIO.
- **NEVER use Low-Side Ground Switching on LEDs**:
  - Unpowered LEDs sharing a common 3.3V logic line will sink return current through the ESP32 GPIO's internal ESD protection diodes, causing latch-up, overheating, or GPIO pin damage.
- **Firmware Power Sequencing**:
  1. *Power ON*: Assert LED Power Gate HIGH $\to$ wait 5ms for rail settling $\to$ send data pulses.
  2. *Power OFF*: Pull DAT pin LOW (or Hi-Z input) $\to$ de-assert LED Power Gate.

### 2.3 Automatic Power-Path Management
- `AO3401A P-MOS (Q_PWR)` + `SS14 Schottky (D_PWR)` + `100kΩ Resistor (R_PWR)`:
  - When USB 5V (`VBUS`) is connected, Gate is pulled HIGH by VBUS, switching P-MOS OFF. The LiPo battery is completely isolated from the system load and cannot back-feed or overcharge. System runs on USB power through `D_PWR`.
  - When USB 5V is unplugged, Gate is pulled LOW to GND by `R_PWR`, switching P-MOS fully ON ($R_{DS(on)} < 30\text{m}\Omega$). Battery powers system with virtually zero voltage drop.

### 2.4 ESP32-C3 ADC Pin Constraints (GPIO 0–5 Only) & Peripheral Allocation
- **Analog Hardware Limits**:
  - The ESP32-C3 integrates two SAR ADCs:
    - `ADC1`: Channels 0 to 4 correspond strictly to **GPIO 0, GPIO 1, GPIO 2, GPIO 3, GPIO 4**.
    - `ADC2`: Channel 0 corresponds strictly to **GPIO 5**.
  - **GPIO 6 through GPIO 21 DO NOT have ADC hardware.**
- **Routing Rules**:
  - Continuous analog audio sensors (such as the MAX4466 microphone breakout) **must** be allocated to GPIO 0–5. Never route analog audio to GPIO 9, 20 (RX), or 21 (TX).
  - When GPIO 0–5 are occupied by digital peripherals (I2C, I2S), map the analog sensor to the remaining ADC pin (e.g., GPIO 0 / ADC1_CH0).
  - Leftover digital pins (GPIO 9, 20, 21) can be repurposed for additional addressable LED channels, button inputs, or PWM outputs, all multiplexed through high-side power switching.
- **Boot Strapping Pin Rules (Preventing Boot Bricking)**:
  - `GPIO 2`: Must be HIGH during boot for SPI flash execution. Safely held HIGH by external 4.7kΩ I2C pull-ups (e.g. GY-521 SDA).
  - `GPIO 8`: Must be HIGH for serial download boot mode. Never place a pull-down resistor on GPIO 8! (Safe for High-Z inputs like INMP441 SD).
  - `GPIO 9`: Must be HIGH during boot for normal SPI flash boot. Never attach an unpowered LED data line to GPIO 9 because the LED's unpowered ESD protection diode will drag GPIO 9 LOW, triggering bootloader mode. Dedicate GPIO 9 to an external mode / boot button (`J_BTN`) held HIGH by the ESP32-C3's internal weak pull-up.
  - `GPIO 10`: Non-strapping pure GPIO. Safely host high-side MOSFET pre-driver gates with 10kΩ pull-down resistors.

### 2.5 Edge-Connector Breakout Placement on Narrow Enclosures (Tube Nesting)
- **Problem**: Many popular hobby breakout boards (GY-521 MPU-6050, GY-6500, OLED displays) have their pin headers along one perimeter edge rather than on their centerline.
  - Centering the header at $x = 0$ on a narrow PCB (e.g., 20mm wand carrier) causes the module body to hang over the board edge by 4–6mm, colliding with cylindrical enclosure walls.
- **Rule**:
  - Calculate the module overhang: $\text{Width}_{\text{module}} - \text{PadOffset}$.
  - Offset the carrier PCB header towards the opposing board edge so that when the module is plugged in, its body folds inward across the PCB substrate.

### 2.6 Direct-to-SMD ESP32 Integration (Bypassing Dev Boards for Dollar Savings)
- **Problem**: Development boards (like ESP32-C3 SuperMini or DevKitC) cost $4–$6 each, require manual socket header soldering, and add 4–6mm of vertical Z-stack height.
- **Solution**: Surface-mount castellated ESP32 modules directly (e.g. `ESP32-C3-WROOM-02-N4`, LCSC `C2934560`, ~$1.35).
- **Native USB CDC/JTAG Routing**:
  - The ESP32-C3 contains an internal USB Serial/JTAG peripheral connected directly to **GPIO 18 (D-)** and **GPIO 19 (D+)**.
  - Route USB Type-C data lines straight to GPIO 18 and 19. No external FTDI, CP2102, or CH340 converter chip is needed.
  - Connect $5.1\text{k}\Omega$ pull-down resistors to GND on pins `CC1` and `CC2` of the Type-C receptacle to enable USB-C host power delivery.
- **Power Architecture for 1S LiPo + USB-C**:
  - Low-Dropout Linear Regulator (e.g. `ME6211C33M5G-N` SOT-23-5, LCSC `C82942`) provides 500mA at 3.3V with <200mV dropout.
  - Automatically supplied by 5V USB or 3.7V–4.2V LiPo via the automatic P-MOSFET power-path circuit (`Q_PWR`).
- **Turnkey SMT Benefit**:
  - All sensors (MPU-6050, INMP441), MCU, power switches, and passives are pick-and-placed simultaneously by JLCPCB SMT, delivering a fully tested, ready-to-flash controller in a single factory order.
  - For a 15.6mm GY-521 on a 20mm carrier: place header at $x = -6.8\text{mm}$. The inward-facing module spans $x \in [-8.3\text{mm}, +7.3\text{mm}]$, nesting 100% within the 20mm tubular profile with comfortable clearance on both sides.

---

## 3. JLCPCB SMT Manufacturing & Assembly Rules

### 3.1 Strict BOM & CPL 1-to-1 Parity
JLCPCB automated assembly validates every designator across both files:
- **Rule**: If a designator exists in the BOM, it MUST exist in the CPL. If a designator exists in the CPL, it MUST exist in the BOM.
- Breakout sockets, manual through-hole pin headers (`J_BAT`, `J_LED`, `U_MCU`, `U_IMU`), and mounting holes must NOT be in the factory SMT BOM or CPL files.
- Filter both files using an explicit whitelist array:
  ```javascript
  const smdDesignators = [
    "U_CHG", "Q_PWR", "Q_FET", "Q_LED_PWR", "Q_LED_EN",
    "D_PWR", "D_HAP", "R_PROG", "R_PWR", "R_GATE",
    "R_LED_PU", "R_LED_GATE", "C_VIN", "C_BAT"
  ];
  ```

### 3.2 JLCPCB SOT-23 & Diode CPL Pick & Place Rotations
JLCPCB tape-and-reel feeders use standard pocket orientations that often differ from CAD footprints by 90° or 180°:

| Component Type | Package | Nominal Pin 1 Location | Required JLCPCB CPL Rotation | Rationale / Verification |
|---|---|---|---|---|
| **AO3400A / AO3401A** | SOT-23 | Pin 1 = Gate (Bottom-Left) | **270° CCW** (`rotation = 270`) | Aligns Pin 1 (G) to bottom-left pad, Pin 2 (S) to bottom-right pad, and Pin 3 (D) to top pad in standard vertical orientation. |
| **SS14 / 1N5819** (Standard) | SOD-123 | Pin 1 = Cathode (Band) | **0°** | Cathode on right pad, Anode on left pad. |
| **SS14 Flyback (D_HAP)** | SOD-123 | Pin 1 = Cathode (Band) | **180°** | Cathode on left pad ($V_{SYS}$ rail), Anode on right pad (FET Drain). |
| **MCP73831** | SOT-23-5 | Pin 1 = STAT | **0°** or **180°** | Verify pin 1 notch aligns with PCB silkscreen dot in JLCPCB 3D DFM viewer. |
| **0603 / 0805 Passives** | SMD 0603 | Symmetrical | **0°** (Horizontal) / **90°** (Vertical) | Pin 1 on left (0°) or top (90°). |

*Always verify orientation in the JLCPCB 3D DFM viewer before submitting orders.*

### 3.3 Factory Basic / Preferred Part Sourcing (LCSC Part Numbers)
Prefer JLCPCB Basic and Extended parts with high reel stock to avoid reel setup surcharges:
- **AO3400A** (N-FET SOT-23, 30V 5.7A): `C20917`
- **AO3401A** (P-FET SOT-23, -30V -4.2A): `C15127`
- **SS14** (Schottky Diode SOD-123, 40V 1A): `C22452`
- **MCP73831T-2ACI/OT** (LiPo Charger SOT-23-5, 4.2V 500mA): `C14878`
- **10kΩ 0603 1%** (Gate Pulldown, Uniroyal): `C25804`
- **100kΩ 0603 1%** (Power Path Pullup, Uniroyal): `C25803`
- **2kΩ 0603 1%** (Prog Current 500mA, Uniroyal): `C17975`
- **4.7µF 0603 10V / 25V X5R** (Decoupling Caps): `C15849`

### 3.4 IPC-7351 Footprint Standards & Anti-Tombstoning Safety Buffers (`shared/footprints.js`)
All project footprints are centralized in `shared/footprints.js` as the Single Source of Truth to eliminate package mismatch risks:
- **SOD-123 Diodes (SS14 / B5819W, LCSC `C8598`)**:
  - **Required Pitch**: `3.30mm` (`pcbX: ±1.65mm`). *Never use 2.6mm pitch!*
  - **Pad Dimensions**: `1.10mm (W) x 1.20mm (H)`.
  - **Inner Clearance Gap**: `2.20mm` (safely clears the 2.7mm plastic diode belly, preventing melted solder paste pooling underneath from causing tombstoning).
  - **Outer Land Span**: `4.40mm` (guarantees >= 0.35mm outer toe fillet past the 3.85mm lead tips).
- **0603 Passives (1608 Metric)**:
  - **Pitch**: `1.60mm` (`pcbX: ±0.80mm`), `0.80mm (W) x 0.90mm (H)`.
  - Inner gap `0.80mm`, outer span `2.40mm`.
- **SOT-23 / SOT-23-5**:
  - SOT-23: Pin 1-2 pitch `1.90mm`, row pitch `2.00mm`, pad size `0.70mm x 0.90mm`.
  - SOT-23-5: Pin pitch `0.95mm`, row pitch `2.60mm`, pad size `0.60mm x 0.90mm`.
- **THT Annular Ring Safety Buffer**:
  - Enforce `annular ring >= 0.35mm` across all plated through-holes (`outer_diameter >= drill + 0.70mm`).
- **Automated Validation**:
  - Always run `npm test` or `node shared/audit-footprints.mjs` before committing or generating production exports.

### 3.5 Live EasyEDA Footprint Extraction (`shared/fetch-easyeda-footprint.mjs`)
Rather than squinting at datasheet mechanical drawings and converting imperial units manually, query JLCPCB / EasyEDA's internal CAD API directly by LCSC part number:
```bash
# Query any LCSC part number (e.g. C8598, C20917, C382138)
node shared/fetch-easyeda-footprint.mjs C8598
npm run fetch-footprint C20917
```
This utility:
1. Calls EasyEDA's component registry (`https://easyeda.com/api/products/{LCSC_ID}/components`).
2. Extracts the exact factory pad geometry (`PAD~...`) used by JLCPCB's CAM pick-and-place system.
3. Converts the 10 mil units to millimeters with zero rounding error.
4. Outputs the exact pitch, inner clearance gap, outer land span, and a drop-in tscircuit React component template.

### 3.6 Component Sourcing & JLCPCB Cost Defense (The $400 Sensor Trap)
- **The Obsolescence Trap**: Never blindly assign classic hobbyist part numbers (like MPU-6050 `C24112` or raw INMP441 `C5438445`). MPU-6050 has been out of production for years, and brokers on JLCPCB scalp it at **$18/chip** ($180 for 10 boards!). Similarly, out-of-stock MEMS mics incur global broker fees of **$25/chip** ($250 for 10 boards!).
- **Modern JLCPCB-Stocked Alternatives**:
  - **6-Axis IMU**: Use **STMicroelectronics LSM6DS3TR-C (`C967633`)**. Modern 6-axis IMU (3-axis gyro + 3-axis accel, 16-bit, hardware I2C/SPI, 4KB FIFO), tens of thousands in stock, costs **~$1.32** ($13.20 for 10 boards, saving $166!).
  - **Microphone**:
    - For 100% turnkey SMT: Use **WillSemi WMM7037AT2-4/TR (`C140705`)** analog MEMS mic ($0.25/ea, $2.50 for 10 boards, saving $247!). Feeds directly into ESP32-C3 internal 12-bit ADC (GPIO 4 / ADC1_CH4) with 40kHz DMA sampling.
    - If digital I2S is preferred: Use a 5-pin breakout socket header and plug in a $0.70 pre-assembled AliExpress INMP441 module. This avoids the risk of factory ultrasonic wash cycles rupturing the delicate MEMS silicon membrane.
- **BOM Passive UTF-8 Formatting**:
  - Never use Greek letters (`µ`, `Ω`) in BOM comments or values. JLCPCB's parser garbles them into Chinese characters (`微F`, `欧`), preventing auto-matching and displaying orange exclamation marks.
  - Use pure ASCII: `100nF`, `10uF`, `1k`, `4.7k`, `10k`, `100k`.
  - Always assign verified **JLCPCB Basic Library** LCSC part numbers (`C14663` 100nF 50V, `C19702` 10uF 10V, `C21190` 1k, `C25804` 10k, `C25803` 100k, `C23162` 4.7k, `C23186` 5.1k, `C22975` 2k) so passives incur $0 in feeder setup fees and cost pennies total.
- **Feeder Sharing**: Share the same part number across indicators (e.g. Red 0603 `C84267` for both `D_CHG` and `D_PWR_LED`) to eliminate an extra $3.00 extended component feeder fee.

### 3.7 Live JLCPCB Supply & SMT Cost Auditor (`shared/check-jlc-supply.mjs`)
To audit real-time warehouse inventory, pricing breaks, and total assembly fees before uploading files to JLCPCB:
```bash
# Audit active project (Project 04)
npm run check-supply
node shared/check-jlc-supply.mjs 04

# Audit with custom quantity (e.g. 30 boards)
node shared/check-jlc-supply.mjs 04 --qty=30

# Search or check any individual part code
node shared/check-jlc-supply.mjs C2934560
node shared/check-jlc-supply.mjs --search="ESP32-C3"
```
**Audited JLCPCB Supply Metrics**:
1. **Real-time Warehouse Stock**: Flags zero-stock components (shortfalls) and low-inventory warnings (< 100 units).
2. **Library Classification**: Distinguishes between Basic ($0 feeder setup) and Extended ($3.00 feeder setup) parts.
3. **Assembly Mode Constraints**: Detects `[Standard Only]` packages (LGA, BGA) that require automated X-ray inspection (AXI) and trigger Standard PCBA ($24 setup) vs. Economic PCBA ($8 setup).
4. **Complete Quote Estimation**: Tallies component costs, feeder setup fees, engineering base setup fees, stencil costs, and solder joint fees.

### 3.8 The Dev Board Paradox: Carrier PCB vs. All-SMD Assembly
- **The $1 Dev Board vs. $2.90 Bare Module**:
  - Pre-assembled Chinese dev boards (like the **ESP32-C3 SuperMini**) sell on AliExpress for **$1.00 – $1.20**. They include the ESP32-C3 SoC, 40MHz crystal, 4MB flash, 3.3V LDO, USB-C socket, reset/boot buttons, ceramic antenna, and passives.
  - On JLCPCB/LCSC, the bare FCC-certified module (`ESP32-C3-WROOM-02-N4`) alone costs **$2.90** at 10-qty wholesale, plus separate costs for USB-C, LDO, switches, and SMT feeder fees.
- **Rule of Thumb**:
  - **For Small Batches (5–20 units)**: A **Carrier PCB** (Projects 00, 02, 03) with plated through-holes to accept a $1 SuperMini + $0.80 MPU-6050 module + $0.70 mic module costs **~$3.00 – $3.50 per baton** with **$0 SMT setup fees** and $2 bare PCB manufacturing.
  - **For Production Batches (100+ units)**: An **All-SMD PCB** (Project 04) eliminates manual soldering labor entirely, where the $24 SMT setup fee amortizes to pennies per board.

### 3.9 The JLCPCB BOM Review Screen: "Qty 0" vs. "Stock 0" & BOM Unrolling
- **The "Qty 0" UI Trap**:
  - On the JLCPCB BOM review table, there is **NO warehouse stock column**.
  - The column labeled **`Qty`** indicates *the number of units JLCPCB will place on your boards*.
  - When a component is unchecked (or flagged with an orange warning `(!)` in the `[Select]` column), JLCPCB displays **`Qty: 0`**.
  - **Never mistake `Qty: 0` for out-of-stock.** Most passives have tens of millions of units in warehouse stock (`C14663` has 51M+, `C25804` has 30M+).
- **Mandatory BOM Unrolling**:
  - Never group designators using commas (e.g. `C_IN, C_OUT` or `R_EN, R_BOOT`).
  - JLCPCB's auto-matcher flags comma-grouped rows with warning icons and unchecks them by default, showing `Qty: 0`.
  - Always export BOMs with **one individual row per designator** (33 rows for 33 components). All 33 rows will then check green automatically with zero user intervention.

### 3.10 Economic PCBA ($8) vs. Standard PCBA ($24) & Package Constraints (`componentProductType`)
- **API Classification**:
  - In JLCPCB's API, every part has a `componentProductType`:
    - `ProductType: 0`: **Economic PCBA eligible** ($8 base engineering fee). Compatible with Automated Optical Inspection (AOI).
    - `ProductType: 2`: **Standard PCBA required** ($24 base engineering fee). Requires Automated X-Ray Inspection (AXI).
- **The MCU is NOT the Culprit**:
  - The `ESP32-C3-WROOM-02` is `ProductType: 0` (100% Economic PCBA approved!).
  - It is the **LGA packages** (`LSM6DS3TR-C` LGA-14 and `WMM7037AT2` LGA-4) that are `ProductType: 2` because their solder pads are tucked invisibly beneath the package belly.
- **The Component Cost Paradox**:
  - Trying to avoid Standard PCBA by replacing the LGA-14 IMU ($1.32) with an older perimeter-pad QFN sensor like `MPU-6500` ($4.63) costs **+$33.10 more in chip costs for 10 boards**, completely erasing the $16 setup fee savings.
  - Modern LGA sensors are produced in such massive volume that their low silicon price makes **Standard PCBA cheaper overall**.

### 3.11 Microcontroller Selection Matrix for Turnkey Hardware
| MCU | JLCPCB Part # | Unit Price (10-qty) | Flash / SRAM | Native USB? | Wireless | Turnkey Assessment |
|---|---|---|---|---|---|---|
| **CH32V003** | `C5187096` | **$0.25** | 16 KB / 2 KB | ❌ No (requires $3 WCH-LinkE dongle) | ❌ None | **Ultra-budget offline**: Flashed once via pogo pins/jig. 2KB RAM limits FFT audio. |
| **CH32V203** | `C3040880` | **$0.65** | 64 KB / 20 KB | ✔ Yes (Built-in D+/D- bootloader) | ❌ None | **Budget USB-C**: Direct USB flashing without an external programmer. |
| **RP2040** | `C2040` | **$0.99** (+ $0.20 flash) | Ext. 4 MB / 264 KB | ✔ Yes (UF2 USB Flash Drive) | ❌ None | **The Offline Champion**: Dual-core 133MHz, PIO drives WS2812B with 0% CPU. |
| **RP2350A** | `C42411118` | **$1.20** (+ $0.20 flash) | Ext. 4 MB / **520 KB** | ✔ Yes (UF2 USB Flash Drive) | ❌ None | **The Ultimate Offline Engine**: Dual Cortex-M33 / Hazard3 RISC-V @ 150MHz with **Hardware FPU** for instant 3D quaternion math. |
| **CH592F** | `C39831287` | **$0.85** | 448 KB / 26 KB | ✔ Yes (Built-in D+/D- bootloader) | ✔ **BLE 5.4** | **Sub-$1 Wireless**: Built-in Bluetooth Low Energy for mobile app or baton-to-baton sync. |
| **ESP32-C3-WROOM** | `C2934560` | **$2.90** | 4 MB / 400 KB | ✔ Yes (Native USB CDC/JTAG) | ✔ **Wi-Fi + BLE + ESP-NOW** | **Full IoT Baton**: Pre-certified FCC module, WLED support, browser-based WebSerial flashing. |

### 3.12 Automated Suite Verification Pipeline
Before submitting files or ordering PCBs, run the 4 automated audit scripts in `shared/`:
1. **`npm test`**: Triple-check verification:
   - Footprint IPC-7351 pitch and annular ring buffers (`audit-footprints.mjs`).
   - Physical copper pad/hole collision overlay detector (`check-overlays.mjs`).
   - 100% netlist trace connectivity and 1-to-1 BOM $\leftrightarrow$ CPL parity (`audit-netlist.mjs`).
2. **`npm run check-supply`**: Live queries JLCPCB's real-time API for warehouse stock, library tier, package inspection modes, and computes the complete PCBA invoice for any batch size (`check-jlc-supply.mjs`).
3. **`npm run test:browser`**: Headless Chrome runner testing WebGL Three.js 3D and 2D vector layouts for 0 runtime console errors.
4. **`npm run fetch-footprint`**: Direct CAD extractor pulling manufacturer millimeter pad coordinates from EasyEDA (`fetch-easyeda-footprint.mjs`).

### 3.13 Real-World Carrier PCB Production Economics (Projects 02 & 03)
Projects 02 (22×100mm Baton) and 03 (38×38mm Dense Square) share the **exact same circuit and BOM**. The only difference is the physical footprint.

Real JLCPCB factory production invoice for **50 boards** (Project 03):
- **Bare PCB Fabrication (50 pcs)**: `$13.80` ($0.28 / board)
- **JLCPCB Economic SMT Assembly (50 pcs)**: `$41.66` ($0.83 / board)
  - Base Setup Fee: `$8.24` (Economic PCBA mode)
  - Laser Stencil: `$1.55`
  - SMT Components (MOSFETs, charger, diodes, passives): `$24.12` ($0.48 / board)
  - Extended Feeder Fee (1 part): `$3.09`
  - SMT Solder Placement: `$3.01`
- **Total JLCPCB Pre-Assembled Carrier**: **`$55.46` ($1.11 / board)**
- **Global Air Shipping (DHL/FedEx)**: `$26.03`
- **Total Order Delivered**: **`$81.49` ($1.63 / delivered carrier)**
- **Completed Unit Cost**: Adding $1.00 ESP32-C3 SuperMini + $0.80 MPU-6050 + $0.70 MEMS mic from AliExpress yields a **fully operational reactive controller for ~$3.61 / unit** with zero hand soldering of discrete SMT passives.

---

## 4. tscircuit Routing Engine & DRC Enforcements

### 4.1 Trace Width Clamping (JLCPCB 6 mil / 0.15mm DRC Rule)
- **Problem**: The `tscircuit` autorouter generates 0.100mm terminal stubs by default, triggering hard DRC rejection at JLCPCB (minimum width is 0.15mm / 6 mil).
- **Rule**: Run a post-processing clamp pass over `circuitJson` before generating Gerbers:
  ```javascript
  for (const item of circuitJson) {
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      if (typeof item.width === "number" && item.width < 0.15) {
        item.width = 0.20;
      }
      for (const pt of item.route) {
        if (typeof pt.width === "number" && pt.width < 0.15) {
          pt.width = 0.20;
        }
      }
    }
  }
  ```

### 4.2 The `through_pad` (0,0) NaN Vector Bug
- In tscircuit, route points for plated through-holes use `{ start: { x, y }, end: { x, y }, route_type: "through_pad" }` without top-level `.x` or `.y`.
- Reading `p.x` produces `undefined`, and math expressions like `Math.max(min, p.x)` evaluate to `NaN`.
- In browser SVG, `<line x1="NaN" y1="NaN" ...>` causes browsers to fallback to `(0, 0)`, rendering wild diagonal artifact lines across the entire canvas.
- **Rule**: Always extract coordinates via:
  ```javascript
  function extractPoint(p) {
    if (!p) return null;
    const x = typeof p.x === "number" ? p.x : (p.start?.x ?? p.end?.x ?? null);
    const y = typeof p.y === "number" ? p.y : (p.start?.y ?? p.end?.y ?? null);
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, layer: p.layer || p.start_layer || "top" };
  }
  ```

### 4.3 Plated Mounting Holes (M3 Fasteners)
- Place plated holes using `React.createElement("platedhole", { holeDiameter: "3.2mm", outerDiameter: "4.8mm", shape: "circle" })`.
- This ensures Tool 10 drill commands are output to Excellon `.drl` files and annular copper rings are rendered on both Top Copper (`.gtl`) and Bottom Copper (`.gbl`).
- Maintain $\ge 1.0\text{mm}$ web between hole pad edge and board outline to avoid mechanical fracture.

---

## 5. Silkscreen Generation & Gerber Export Rules

### 5.1 Gerber Legend Generation (The Blank Silkscreen Trap)
- **Problem**: Fabricators report `audioMotionBaton_TopSilkscreen.gbr` is completely blank.
- **Root Cause**: Silkscreen text rendered onto Three.js decals or 2D SVG canvas only exists in the browser DOM. `circuit-json-to-gerber.js` generates silkscreen layers strictly from `{ type: "pcb_silkscreen_text" }` objects inside `circuitJson`.
- **Rule**: All silkscreen text, pin labels, and branding must be defined as `<silkscreentext>` React elements inside `circuit.js`:
  ```javascript
  React.createElement("silkscreentext", {
    text: "5V",
    pcbX: `${x}mm`,
    pcbY: `${y}mm`,
    layer: "top", // or "bottom"
    fontSize: "0.85mm",
    anchorAlignment: "center"
  })
  ```

### 5.2 Bottom Layer Silkscreen Mirroring
- In Gerber RS-274X (`.gbo`), CAD coordinates share the same $(X, Y)$ plane as top layer.
- `circuit-json-to-gerber.js` automatically mirrors glyph strokes horizontally for the bottom layer.
- Pin labels placed at $(X, Y)$ on the bottom layer will naturally align with through-hole pins when viewed from the underside of the PCB.

### 5.3 Vector QR Code Silk Generation
- Do not attempt to import raster PNG decals into Gerbers.
- Generate high-resolution vector QR codes directly in silkscreen using run-length horizontal `silkscreenpath` strokes:
  ```javascript
  React.createElement("silkscreenpath", {
    layer: "bottom",
    route: [{ x: xStart, y: yPos }, { x: xEnd, y: yPos }],
    strokeWidth: `${moduleSize}mm`
  });
  ```
- Isolated single modules ($x_1 = x_2$) flash a solid circular aperture of diameter `strokeWidth`.
- Scans cleanly with 100% optical decode fidelity on physical boards.

### 5.4 Japanese Ocean Wave (Seigaiha) Ripple Silkscreen Patterns
- **Zero Added Cost**: Standard PCB fabs (e.g., JLCPCB) include 2-layer silkscreen in the standard base pricing. Vector art paths on Top Silkscreen (`.gto`) and Bottom Silkscreen (`.gbo`) incur **$0 extra cost** as long as line widths satisfy minimum rules ($\ge 0.15\text{mm}$ / 6 mil).
- **Geometric Construction**:
  - Staggered grid centers ($\Delta X \approx 5.5\text{mm}$, $\Delta Y \approx 3.0\text{mm}$) with concentric semicircular arcs ($r \in [1.4\text{mm}, 2.4\text{mm}, 3.3\text{mm}]$).
  - Trace stroke width: $0.18\text{mm}$.
- **Clearance & Keepout Constraints**:
  - Maintain $\ge 5.0\text{mm}$ clearance around major text blocks (mission statement, pinout tables, designer attribution).
  - Maintain $\ge 1.2\text{mm}$ clearance around pin labels and through-hole annular rings.
  - Maintain $\ge 7.0\text{mm}$ radial keepout around vector QR codes to avoid scanning interference.
- **Layer Isolation Rule**:
  - Long multi-line descriptive text blocks (e.g. mission statements) must remain strictly on the primary layer (`top`). Never mirror dense multi-line text blocks onto the bottom layer over the vector QR code.

---

## 6. Physical Verification: Laser Fit Testing (1:1 Extracts)

Before placing PCB production orders, generate 1:1 scale extracts for laser cutting test jigs:
1. **`outline_pads.svg` / `.png`**: Cut lines for board profile, drill holes, and SMD pad locations.
2. **`silkscreen.svg` / `.png`**: Top silkscreen layer for visual alignment.
3. **`silkscreen_bottom.svg` / `.png`**: Underside silkscreen layer.
4. **`laser_combined_testfit.png`**: Composite sheet rendered at 600 DPI.
- Laser cut onto 1.6mm acrylic, chipboard, or wood. Physically test fit into wand/baton tubing, check component socket clearance, and verify battery fit.

---

## 7. Turnkey Deliverables Checklist

When completing a Parametric PCB project, verify the presence of all five artifacts:
- [ ] **`Gerbers (.zip)`**: GTL, GBL, GTS, GBS, GTO, GBO, GML, and DRL/TXT.
- [ ] **`BOM (.csv)`**: Designator, Quantity, Value, Footprint, LCSC Part Number.
- [ ] **`CPL (.csv)`**: Designator, Mid X, Mid Y, Layer, Rotation.
- [ ] **`writeUp.md`**: Complete circuit explanation, bill of materials, and iron pan DIY soldering guide.
- [ ] **`Laser Extracts`**: 600 DPI PNGs and SVGs for physical test fits.

---

## 8. Subproject Directory Index & Architecture
- **`00-starterPCB/`**: Turnkey Starter Template with 3D/2D visualizers, live trace & pad hover tooltips, real-time JLCPCB manufacturing DRC (`pcb-rules.js` & `drc.js`), Architecture/Pinout schematic panel, component callouts, decoupled silkscreen scaling, and instant exports powered by `shared/`.
- **`01-V6Led/`**: Parametric 6-LED strip configurator with mousebite panelization.
- **`02-audioMotionReactiveLedHapticPCB/`**: Turnkey Baton Carrier PCB with ESP32-C3 SuperMini, MPU6050/6500 IMU, INMP441/MAX4466 microphones, AO3400A/AO3401A power and haptic drivers, dual silkscreen mirroring, vector QR code, M3 mounting holes, and 600 DPI laser test fits.
- **`03-compactAudioMotionSquarePCB/`**: Compact Dense Square Reactive Controller PCB (38×38mm) with back-to-back 3D stacking (ESP32 on top, MPU on backside), 3× addressable LED outputs, dual haptic PWM drivers, dual microphones, LiPo charger with auto power-path, and standard 31×31mm M3 bolt pattern.
- **`04-smdAudioMotionBatonPCB/`**: All-in-One Turnkey SMD Baton Controller PCB (22×110mm). Eliminates socketed dev boards with a directly soldered ESP32-C3-WROOM-02-N4 module, onboard MPU-6050 IMU, INMP441 digital I2S microphone, USB Type-C native CDC/JTAG flashing, ME6211 3.3V LDO, TP4054 LiPo charger with auto power-path, high-side LED power gate, and haptic PWM driver. 100% factory assembled by JLCPCB SMT in a single order.
- **`shared/`**: Single Source of Truth (`pcb-configurator.css`, `three-pcb-viewer.js`, `svg-viewer.js`, `svg-pcb-renderer.js`, `pcb-rules.js`, `drc.js`, `export-utils.js`, `footprints.js`, `check-overlays.mjs`, `audit-footprints.mjs`, `audit-netlist.mjs`, `fetch-easyeda-footprint.mjs`, `test-headless.mjs`).
