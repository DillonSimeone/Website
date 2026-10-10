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
