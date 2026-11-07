# Audio & Motion Reactive Light Baton PCB (02-audioMotionReactiveLedHapticPCB)

## 0. Strict Scoping & Execution Constraints
- **Scoping**: Confine edits to `public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/` and `public/ParametricPCB/00-commonParts/`.
- **Engineering Skill Reference**: Consult [../SKILL.md](../SKILL.md) for master EDA architecture, JLCPCB SMT manufacturing rules, SOT-23 rotation tables, flyback diode polarity rules, trace width clamping, and laser test-fit protocols.
- **Build Guard**: NEVER execute `npm run build` (portfolio builds managed by user).
- **ESM Dependency Pattern**: Load Three.js via `https://esm.sh/three@0.136.0` in browser ES modules. Avoid local `../node_modules/three/...` relative paths because local development servers return 404 or `text/html` MIME types (`X-Content-Type-Options: nosniff`).

---

## 1. Hardware Architecture & Pin Map

### 1.1 Core Components
- **MCU**: ESP32-C3 SuperMini (16 castellated pads along perimeter; dual-mount SMD + 2.54mm THT).
- **IMU**: MPU-6050 / MPU-6500 (GY-521 / GY-6500 standard 8-pin 2.54mm vertical header). Mounted along left edge ($x = -6.8\text{mm}$) so the 15.6mm module body sits inside the 20mm wand tube with zero overhang. AD0 left unrouted to isolate logic from motor ground returns.
- **Microphone 1 (Analog)**: MAX4466 breakout (3-pin single row: `VCC`, `GND`, `OUT` on GPIO 0 ADC1_CH0).
- **Microphone 2 (Digital I2S)**: INMP441 breakout (2x3 dual-row DIP, 2.54mm pin pitch, 7.62mm / 300 mil row spacing).
- **Haptic Driver**: AO3400A N-Channel MOSFET (`Q_FET`, SOT-23, $V_{DS}=30V, I_D=5.7A, R_{DS(on)}<30m\Omega$) driven by GPIO 7 with 10kΩ gate pull-down (`R_GATE`) and SS14 Schottky flyback clamp (`D_HAP`, Cathode to VSYS, Anode to Drain).
- **Haptic Outputs**: 2 lateral 2-pin through-hole headers (`HAP_L` at board left, `HAP_R` at board right).
- **Triple LED Outputs & High-Side Switch**: 3 independent 3-pin headers (`5V_SW`, `DAT`, `GND`):
  - `J_LED1`: Top Tip (GPIO 6)
  - `J_LED2`: Upper Right Aux (GPIO 20 / RX)
  - `J_LED3`: Upper Left Aux (GPIO 21 / TX)
  Switched 5V/VSYS rail driven by AO3401A P-MOSFET (`Q_LED_PWR`) and AO3400A N-MOSFET pre-driver (`Q_LED_EN`) from GPIO 10 with 100kΩ pull-up (`R_LED_PU`) and 10kΩ pull-down (`R_LED_GATE`), eliminating 50–75mA parasitic quiescent sleep drain across all 3 channels without interfering with boot strapping pins.
- **External User Action / Boot Mode Button Header (`J_BTN`)**: 2-pin header (`Pin 1: GPIO 9`, `Pin 2: GND`) at $y = -12.0\text{mm}$. Held HIGH by internal weak pull-up during boot for reliable SPI flash execution; pressed to GND for runtime user interactions or download boot mode.
- **Onboard Pinout Cheat Sheet**: 2-column reference table silkscreened directly on PCB in the open area next to IMU ($x \in [-4\text{mm}, +8\text{mm}]$).
- **Power Subsystem**: MCP73831 / TP4056 SOT-23-5 1S LiPo charger (`U_CHG`), 2-pin J_BAT terminals (`BAT+`, `BAT-`), 2-pin SW_EXT through-hole header (`BAT+`, `VSYS`), AO3401A P-MOSFET power path (`Q_PWR`), SS14 Schottky (`D_PWR`), and 100kΩ pull-up (`R_PWR`).
- **Mounting Holes**: 4× M3 plated mounting holes ($\varnothing 3.2\text{mm}$ drill, $\varnothing 4.8\text{mm}$ annular ring) located at $(\pm 6.5\text{mm}, \pm 53.5\text{mm})$ forming a $13.0\text{mm} \times 107.0\text{mm}$ rectangular bolt pattern.

### 1.2 ESP32-C3 SuperMini Pin Allocation & Strapping Map
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
| Pin 9 | GPIO 5 | `NET_IMU_INT` | IMU Motion Interrupt Input | MPU6050/6500 `INT` (Pin 8) | Non-strapping |
| Pin 10 | GPIO 6 | `NET_LED_DATA` | Addressable LED 1 Data | `J_LED` (Top Tip) Pin 2 (`DAT`) | Non-strapping |
| Pin 11 | GPIO 7 | `NET_HAPTIC_PWM` | LEDC PWM (Gate drive) | AO3400A Gate (`Q_FET`) via 100Ω | Non-strapping |
| Pin 12 | GPIO 8 | `NET_MIC_SD` | I2S Serial Data In (`DOUT`) | INMP441 `SD` (Pin 4) | **Strapping: Must be HIGH (High-Z on boot + SuperMini LED pull-up)** |
| Pin 13 | GPIO 9 | `NET_BTN_MODE` | User Action / Boot Mode Input | `J_BTN` Pin 1 (`BTN`) | **Strapping: Must be HIGH for flash boot (Internal pull-up)** |
| Pin 14 | GPIO 10 | `NET_LED_PWR_EN`| High-Side LED Power Enable | AO3400A Pre-Driver Gate (`Q_LED_EN`) | **Non-strapping (10kΩ pull-down completely safe)** |
| Pin 15 | RX (GPIO 20) | `NET_LED2_DATA` | Addressable LED 2 Data | `J_LED2` (Upper Right) Pin 2 (`DAT`)| Non-strapping |
| Pin 16 | TX (GPIO 21) | `NET_LED3_DATA` | Addressable LED 3 Data | `J_LED3` (Upper Left) Pin 2 (`DAT`) | Non-strapping |

### 1.3 MPU6050 vs MPU6500 Breakout Compatibility
- **Physical Header**: Universal 1x8 2.54mm pitch single row.
- **Pin Sequence (1 to 8)**: `VCC`, `GND`, `SCL`, `SDA`, `XDA`, `XCL`, `AD0`, `INT`.
- **Modules Verified**: GY-521 (MPU-6050), GY-6500 (MPU-6500), GY-9250 (MPU-9250), ICM-20600 series.
- **I2C Address**: Default `0x68` when AD0 is connected to GND via onboard 4.7kΩ pulldown. Left intentionally unrouted on the carrier PCB to eliminate ground bounce from motor pulses.
- **Firmware Interchangeability**: Accelerometer (`0x3B`-`0x40`), Gyroscope (`0x43`-`0x48`), and Power Management (`0x6B`) register addresses are identical.

### 1.4 Dual Footprint Rule (THT + SMD)
Every header (MCU 16-pin, IMU 8-pin, LEDs, Microphones, Haptics) MUST feature dual-mount pads:
- **Plated Through-Hole (THT)**: `hole_diameter = 1.0mm`, `outer_diameter = 1.9mm` for pin headers and mechanical vibration resistance.
- **Surface Mount (SMD)**: Overlapping rectangular solder pad (`width = 1.6mm`, `height = 1.6mm`) for flush surface soldering without through-hole pins.

---

## 2. Three.js & 2D Vector Rendering Patterns

### 2.1 Z-Fighting & Mesh Layering
Board substrate thickness is 1.6mm, centered at $z = 0$:
- Top Substrate Surface: $z = 0.80\text{mm}$
- Bottom Substrate Surface: $z = -0.80\text{mm}$
- Plated Annular Rings (`THREE.RingGeometry`): $z = \pm 0.81\text{mm}$
- Plated Drill Barrel (`THREE.CylinderGeometry`): $z = 0.0\text{mm}$, height $1.64\text{mm}$
- SMT Copper Pads (`THREE.BoxGeometry`): $z = \pm 0.815\text{mm}$, depth $0.03\text{mm}$
- Copper Traces (`THREE.TubeGeometry`): $z = \pm 0.82\text{mm}$
- Silkscreen Canvas Decal (`THREE.PlaneGeometry`): $z = 0.825\text{mm}$
  - Material config: `depthWrite: false`, `polygonOffset: true`, `polygonOffsetFactor: -1`.
  - NEVER place solid component 3D boxes over through-holes (causes severe interior Z-fighting and mesh clipping).

### 2.2 Decoupled High-Speed Texture Scaling (60 FPS Performance Pattern)
- **Problem**: Recompiling tscircuit AST (`compileCircuit()`) on slider input freezes the UI for 300–800ms and resets camera/orbit controls.
- **Solution**:
  - Keep circuit geometry static during visual styling changes.
  - Draw silkscreen onto an offscreen 2048px HTML5 canvas (`drawSilkscreenDecal(canvas, width, height, scale)`).
  - Call `silkTexture.needsUpdate = true` on slider input.
  - Sync 2D SVG vector font sizes via `document.querySelectorAll("#svg-silkscreen-pins text")` reading `data-base-size`.
  - Latency: < 2ms, zero AST re-computation, perfectly smooth slider response.

### 2.3 Exact Silkscreen Pin Placement Offsets
- **J_LED (WS2812B)**: Pins at $y = \text{halfL} - 7.0\text{mm}$. Pin labels (`5V`, `DAT`, `GND`) placed snug at $y = \text{halfL} - 8.9\text{mm}$ (1.9mm offset, directly below the 0.95mm pad ring radius).
- **MPU6050/6500**: Pins at $x = 0$, $y = (\text{halfL} - 32) \pm (3.5 \times 2.54)\text{mm}$. Pin names placed at $x = +2.4\text{mm}$ with left alignment. No bullet points (`•`) to ensure concise, un-occluded text.
- **Q1 AO3400A (SOT-23)**: Labels `Q1: AO3400A` centered above at $y + 3.2\text{mm}$; Drain `D` centered above top pad at $y + 1.0\text{mm} - 4\text{px}$; Gate `G` to the left of bottom-left pad; Source `S` to the right of bottom-right pad.
- **INMP441 (2x3 Dual Row)**: Do NOT draw horizontal lines across the rows. Label pins row-by-row on the outer margins:
  - Left row ($x = -3.81\text{mm}$): `SCK` ($y+2.54$), `WS` ($y$), `L/R` ($y-2.54$) placed with `text-anchor="end"` to the left of the holes.
  - Right row ($x = +3.81\text{mm}$): `SD` ($y+2.54$), `VDD` ($y$), `GND` ($y-2.54$) placed with `text-anchor="start"` to the right of the holes.
  - Center title `INMP441` placed above at $y + 4.8\text{mm}$.
- **LiPo Charger MCP73831 (SOT-23-5)**: Do NOT render single horizontal string across board edge. Position pads individually:
  - Top pads ($y + 1.3\text{mm}$): `PROG` (pin 5) at $x = -0.95\text{mm}$, `VIN` (pin 4) at $x = +0.95\text{mm}$ above pads.
  - Bottom pads ($y - 1.3\text{mm}$): `STAT` (pin 1) at $x = -0.95\text{mm}$, `GND` (pin 2) at $x = 0$, `VBAT` (pin 3) at $x = +0.95\text{mm}$ below pads.
  - Title `U_CHG` placed towards board center ($x + 4.5\text{mm}$), comfortably clear of the green board boundary.
- **Switch & Battery**: Switch pins (`BAT+`, `VSYS`) at $y - 2.6\text{mm}$; Battery pads (`BAT+`, `BAT-`) at $y = -\text{halfL} + 7\text{mm}$.

### 2.4 Trace Perimeter Clamping Pattern & through_pad NaN Bug
- **The NaN Vector Trap**: In tscircuit, `pcb_trace` route points are not always `{ x, y }`. Elements with `route_type: "through_pad"` store `{ start: { x, y }, end: { x, y } }` without top-level `.x` or `.y`.
  - Naive evaluation `p.x` returns `undefined`.
  - Math operations or clamps `Math.max(min, undefined)` evaluate to `NaN`.
  - In SVG, `<line x1="NaN" y1="NaN" ...>` causes browser SVG parsers to fallback `(x1, y1)` to `(0, 0)`, drawing a stray line from the top-left viewport origin straight into the pad!
  - **Resolution**: Always extract coordinates via `p.x ?? p.start?.x ?? p.end?.x` and verify `Number.isFinite()` before generating SVG `<line>` or Three.js vectors.
- **Board Envelope Enforcement**:
  - Always pass components as children of `<board>` wrapped with `boardProps(boardWidth, boardLength, routing, { skipRouting })` so layer keepouts and board bounds are registered by the compiler.
  - In `compileCircuit()`, execute a post-settle clamp pass over `circuit.getCircuitJson()` constraining every `pcb_trace` route point to $[\pm(\text{halfW} - 0.5\text{mm}), \pm(\text{halfL} - 0.5\text{mm})]$.
  - In `ui.js` (both 2D SVG `<line>` rendering and 3D Three.js `THREE.LineCurve3` generation), clamp all segment endpoints to $[\pm(\text{halfW} - 0.4\text{mm}), \pm(\text{halfL} - 0.4\text{mm})]$. No trace can ever escape the board profile.

---

## 3. Parametric Design Rules for Future PCB Modules

1. **Keep Substrate Parametric**:
   All component $y$-coordinates must be relative to $\pm \text{halfL}$ ($\text{boardLength} / 2$) or $\pm \text{halfW}$ ($\text{boardWidth} / 2$) so changing length/width automatically reflows components into correct mechanical zones.
2. **Net Routing Rules**:
   - `Power traces` (`5V`, `3V3`, `VBAT`, `GND`): Width $\ge 0.6\text{mm}$ to $0.8\text{mm}$ (low impedance, high transient currents for LEDs and haptic burst motors).
   - `Signal traces` (`I2C`, `I2S`, `PWM`, `ADC`, `UART`): Width $0.25\text{mm}$ to $0.3\text{mm}$.
   - Layer transitions: Top layer solid Neon Pink (`0xff007f`), Bottom layer dashed Neon Cyan (`0x00f0ff`). Vias placed at layer crossovers.
3. **Artifact Bundling**:
   Generate production standard RS-274X Gerbers (GTL, GBL, GTS, GBS, GTO, GBO, GML) and Excellon Drills (TXT/DRL) bundled in a single `.zip` using JSZip.

---

### 4. Turnkey Carrier PCB Architecture (Factory Pre-Assembled SMD Parts)

To minimize manual soldering while preserving modularity, the carrier PCB integrates all 14 discrete active and passive SMD components factory-assembled (JLCPCB SMT assembly):
- **User-Pluggable Modular Breakouts**:
  - ESP32-C3 SuperMini (16-Pin Dual THT + SMD socket)
  - MPU-6050 / MPU-6500 (8-Pin vertical header)
  - INMP441 / MAX4466 Microphones (Dual-mount headers)
  - Addressable LEDs (3-Pin header) & Vibration Motors (Dual 2-Pin headers)
  - 4× M3 Corner Mounting Holes (Plated Ø3.2mm drill / Ø4.8mm copper pad)
- **14 Factory-Assembled Turnkey SMT Components (1-to-1 BOM & CPL Parity)**:
  1. `AO3401A P-MOSFET (Q_PWR, C15127)` + `SS14 Schottky Diode (D_PWR, C22452)` + `100kΩ Resistor (R_PWR, C25803)`:
     - **Automatic Power-Path Management**: Isolates LiPo when USB 5V VBUS is connected. When USB is disconnected, gate pulls low via 100kΩ, enabling battery power through ultra-low resistance P-MOS ($R_{DS(on)} < 30\text{m}\Omega$).
  2. `MCP73831T-2ACI/OT (U_CHG, C14878)` + `2kΩ PROG Resistor (R_PROG, C17975)` + `C_VIN / C_BAT (4.7µF 0603, C15849)`:
     - **Safe Fast Charging**: Sets charging current to 500mA. 4.7µF decoupling capacitors ensure charge controller stability.
  3. `AO3400A N-MOSFET (Q_FET, C20917)` + `10kΩ Gate Pull-Down (R_GATE, C25804)` + `SS14 Flyback Diode (D_HAP, C22452)`:
     - **Haptic Inductive Clamp**: Flyback diode `D_HAP` placed with **Cathode on VSYS (+) and Anode on Drain**, clamping inductive kickback spikes while preventing catastrophic dead shorts. `R_GATE` silences haptic motors during boot.
  4. `AO3401A P-MOSFET (Q_LED_PWR, C15127)` + `AO3400A N-MOSFET Pre-Driver (Q_LED_EN, C20917)` + `100kΩ Gate Pull-Up (R_LED_PU, C25803)` + `10kΩ Gate Pull-Down (R_LED_GATE, C25804)`:
     - **LED High-Side Power Isolation**: Driven by GPIO 10. Completely cuts power to WS2812B strip during sleep mode, eliminating 50–75mA of parasitic quiescent draw without conflicting with boot strapping pins.
- **Automated Manufacturing Deliverables**:
  - Gerbers: Top/Bottom Copper, Solder Mask, Silkscreen, Edge Cuts, and Excellon Drills.
  - BOM: CSV table with 14 SMT factory line items matching CPL 1-to-1.
  - CPL: Pick & Place Centroid CSV with exact SOT-23 CCW rotations (270° for AO3400A/AO3401A) and diode polarities (180° for D_HAP).

---

## 5. Silkscreen Legend, Backside Mirroring, Vector QR Code & Seigaiha Ripples
- **Dual-Side Silkscreen Mirroring & Layer Isolation**:
  - Compact header pinout labels and power points are mirrored across Top (`.gto`) and Bottom (`.gbo`) layers so all pins can be debugged and probed from either side of the PCB.
  - Multi-line descriptive purpose blocks ("Generalist Carrier PCB for Dillon's...") are placed **strictly on the top layer**, ensuring the underside remains clean and uncluttered for the vector QR code.
  - Bottom silkscreen includes author attribution ("By Dillon Simeone"), the URL `dillonsimeone.com`, and a crisp vector QR code.
- **Vector QR Code Implementation**:
  - Links to: `https://dillonsimeone.com/?reason=audioMotionReactiveLedHapticPCB`
  - Encoded directly as horizontal run-length `silkscreenpath` strokes in tscircuit AST ($0.32\text{mm}$ module stroke).
  - Maintained with a $7.0\text{mm}$ radial keepout to ensure zero scanning interference.
  - Decodes reliably with 100% optical fidelity.
- **Traditional Japanese Ocean Wave (Seigaiha) Ripples / Scales**:
  - Decorative concentric wave arches generated algorithmically on open PCB areas across both layers.
  - Configured with $\Delta X = 5.5\text{mm}$, $\Delta Y = 3.0\text{mm}$, radii $[1.4\text{mm}, 2.4\text{mm}, 3.3\text{mm}]$, and $0.18\text{mm}$ stroke width.
  - Enforces a $5.0\text{mm}$ breathing room clearance around major text blocks and $1.2\text{mm}$ around pin labels and solder pads.
  - Incurs **$0 extra manufacturing cost** at JLCPCB and standard fabs (top & bottom silkscreen are included in standard 2-layer FR4 base pricing).

---

## 6. Laser Test-Fit Protocols (1:1 Extracts at 600 DPI)
Before ordering physical boards from JLCPCB:
- Generate 1:1 scale laser extracts in `public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/`:
  - `audioMotionBaton_laser_combined_testfit.png` (600 DPI)
  - `audioMotionBaton_laser_outline_pads.svg` & `.png`
  - `audioMotionBaton_laser_silkscreen.svg` & `.png`
  - `audioMotionBaton_laser_silkscreen_bottom.svg` & `.png`
- Laser-cut the test fit into 1.6mm acrylic or plywood to test:
  1. Outer dimension fit inside 22mm OD / 19–20mm ID polycarbonate wand tubing.
  2. Header pin spacing for ESP32-C3 SuperMini and GY-521 IMU breakouts.
  3. M3 corner mounting hole alignment with wand end-cap hardware.
