import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import { 
  convertSoupToGerberCommands, 
  stringifyGerberCommandLayers,
  convertSoupToExcellonDrillCommands,
  stringifyExcellonDrill 
} from "../../00-commonParts/circuit-json-to-gerber.js";
import { 
  ESP32C3_SuperMini, 
  UniversalIMU_8Pin, 
  MAX4466_Header,
  INMP441_DualRow_Header, 
  SOT23_MOSFET, 
  SOT23_5_Charger, 
  BatteryPads, 
  ExternalSwitchPads, 
  LEDOutputHeader,
  HapticMotorOutput,
  Resistor0603,
  DiodeSOD123,
  Capacitor0603,
  SOT23_PMOSFET,
  ButtonHeader
} from "./footprints.js";
import { boardProps, normalizeRouting } from "./pcb-rules.js";
import { runManufacturingDrc } from "./drc.js";

/**
 * Programmatically builds the Audio & Motion Reactive Light Baton PCB.
 */
export async function compileCircuit(params) {
  const { 
    boardWidth = 20, 
    boardLength = 115, 
    routing = {}, 
    skipRouting = true,
    silkScale = 1.0 
  } = params;

  const R = normalizeRouting(routing);
  const PWR = `${R.powerTraceWidth}mm`;
  const SIG = `${R.nominalTraceWidth}mm`;

  console.log(`[Circuit Profiling] new Circuit() ...`);
  const t0 = performance.now();
  const circuit = new Circuit({
    platform: {
      routingDisabled: skipRouting
    }
  });

  const children = [];

  const halfL = boardLength / 2;
  const halfW = boardWidth / 2;

  // 0. M3 Corner Mounting Holes (3.2mm Clearance Drill, 4.8mm Annular Ring Pad)
  const mountX = halfW - 3.5;       // 6.5mm on standard 20mm board (3.5mm from lateral edge)
  const mountY_top = halfL - 4.0;   // 53.5mm on standard 115mm board (4.0mm from top edge)
  const mountY_bot = halfL - 4.0;   // 53.5mm on standard 115mm board (4.0mm from bottom edge)

  const cornerHoles = [
    { key: "H_TL", name: "H_TL", x: -mountX, y: mountY_top },
    { key: "H_TR", name: "H_TR", x: mountX, y: mountY_top },
    { key: "H_BL", name: "H_BL", x: -mountX, y: -mountY_bot },
    { key: "H_BR", name: "H_BR", x: mountX, y: -mountY_bot }
  ];

  cornerHoles.forEach(h => {
    children.push(React.createElement("platedhole", {
      key: h.key,
      name: h.name,
      portHints: [h.name],
      pcbX: `${h.x.toFixed(2)}mm`,
      pcbY: `${h.y.toFixed(2)}mm`,
      holeDiameter: "3.2mm",
      outerDiameter: "4.8mm",
      shape: "circle"
    }));
  });

  // 1. J_BAT: Battery Terminals
  children.push(React.createElement(BatteryPads, {
    name: "J_BAT",
    key: "j_bat",
    pcbX: "0mm",
    pcbY: `${(-halfL + 7).toFixed(2)}mm`
  }));

  // 2. SW_EXT: External Power Switch 2-Pin Through-Hole Header
  children.push(React.createElement(ExternalSwitchPads, {
    name: "SW_EXT",
    key: "sw_ext",
    pcbX: `${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: `${(-halfL + 18).toFixed(2)}mm`
  }));

  // 3. U_CHG: LiPo Charger IC (SOT-23-5)
  // Shifted inward towards center (x = -4.5mm) for generous board-edge clearance (> 4mm)
  const chgX = -4.5;
  children.push(React.createElement(SOT23_5_Charger, {
    name: "U_CHG",
    key: "u_chg",
    pcbX: `${chgX.toFixed(2)}mm`,
    pcbY: `${(-halfL + 18).toFixed(2)}mm`
  }));

  // 3b. R_PROG: 2kΩ Charge Current Setting Resistor (Sets safe 500mA charge rate)
  children.push(React.createElement(Resistor0603, {
    name: "R_PROG",
    key: "r_prog",
    pcbX: `${chgX.toFixed(2)}mm`,
    pcbY: `${(-halfL + 22.5).toFixed(2)}mm`
  }));

  // 3c. C_VIN & C_BAT: LiPo Charger Ceramic Decoupling Capacitors (4.7µF 0603)
  // Safely positioned inward at x = -3.2mm and x = -5.8mm, comfortably away from board boundary
  children.push(React.createElement(Capacitor0603, {
    name: "C_VIN",
    key: "c_vin",
    pcbX: "-3.2mm",
    pcbY: `${(-halfL + 14).toFixed(2)}mm`
  }));
  children.push(React.createElement(Capacitor0603, {
    name: "C_BAT",
    key: "c_bat",
    pcbX: "-5.8mm",
    pcbY: `${(-halfL + 14).toFixed(2)}mm`
  }));

  // 3d. Auto Power-Path: AO3401A P-MOSFET, SS14 Schottky Diode, and 100kΩ Gate Pull-Down
  children.push(React.createElement(SOT23_PMOSFET, {
    name: "Q_PWR",
    key: "q_pwr",
    pcbX: "2.0mm",
    pcbY: `${(-halfL + 21.5).toFixed(2)}mm`
  }));
  children.push(React.createElement(DiodeSOD123, {
    name: "D_PWR",
    key: "d_pwr",
    pcbX: "6.4mm",
    pcbY: `${(-halfL + 22.0).toFixed(2)}mm`
  }));
  children.push(React.createElement(Resistor0603, {
    name: "R_PWR",
    key: "r_pwr",
    pcbX: "-1.5mm",
    pcbY: `${(-halfL + 21.5).toFixed(2)}mm`
  }));

  // 4. J_MIC_MAX: Dedicated MAX4466 Analog Mic (3-Pin)
  children.push(React.createElement(MAX4466_Header, {
    name: "J_MIC_MAX",
    key: "j_mic_max",
    pcbX: "0mm",
    pcbY: `${(-halfL + 29).toFixed(2)}mm`
  }));

  // 5. J_MIC_INMP: Dedicated INMP441 Digital I2S Mic (Dual-Row 2x3 Pin)
  children.push(React.createElement(INMP441_DualRow_Header, {
    name: "J_MIC_INMP",
    key: "j_mic_inmp",
    pcbX: "0mm",
    pcbY: `${(-halfL + 38).toFixed(2)}mm`
  }));

  // 6. U_MCU: ESP32-C3 SuperMini (16 Pins)
  children.push(React.createElement(ESP32C3_SuperMini, {
    name: "U_MCU",
    key: "u_mcu",
    pcbX: "0mm",
    pcbY: "2.0mm"
  }));

  // 7. U_IMU: Universal IMU (MPU-6050 / MPU-6500)
  // Moved to side (x = -6.8mm) so standard 15.6mm GY-521 board body mounts inward over the board (span -8.3mm to +7.3mm) with 0mm protrusion beyond the 20mm wand tube
  // Lifted up to halfL - 29.0 (pcbY = 28.5mm) so Pin 8 (INT at y = 19.61mm) has generous 5.1mm clearance above J_LED3 (y = 14.5mm)
  children.push(React.createElement(UniversalIMU_8Pin, {
    name: "U_IMU",
    key: "u_imu",
    pcbX: "-6.8mm",
    pcbY: `${(halfL - 29.0).toFixed(2)}mm`
  }));

  // 8. Q_FET: AO3400A N-Channel MOSFET for Haptics
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_FET",
    key: "q_fet",
    pcbX: "0mm",
    pcbY: `${(halfL - 19).toFixed(2)}mm`
  }));

  // 8b. R_GATE: 10kΩ Gate Pull-Down Resistor (prevents motor chatter during MCU boot)
  children.push(React.createElement(Resistor0603, {
    name: "R_GATE",
    key: "r_gate",
    pcbX: "-3.2mm",
    pcbY: `${(halfL - 19).toFixed(2)}mm`
  }));

  // 8c. D_HAP: Flyback Schottky Diode (clamps motor inductive kickback voltage spikes)
  // Rotated 180° so Anode (left) connects to Q_FET Drain and Cathode (right, stripe) connects to VSYS (+)
  children.push(React.createElement(DiodeSOD123, {
    name: "D_HAP",
    key: "d_hap",
    pcbX: "5.0mm",
    pcbY: `${(halfL - 19).toFixed(2)}mm`,
    pcbRotation: 180
  }));

  // 9. J_HAP_L & J_HAP_R: Lateral Haptic Motor Output Pins
  const hapticX = halfW - 2.0;
  children.push(React.createElement(HapticMotorOutput, {
    name: "J_HAP_L",
    key: "j_hap_l",
    pcbX: `-${hapticX.toFixed(2)}mm`,
    pcbY: `${(halfL - 10).toFixed(2)}mm`
  }));

  children.push(React.createElement(HapticMotorOutput, {
    name: "J_HAP_R",
    key: "j_hap_r",
    pcbX: `${hapticX.toFixed(2)}mm`,
    pcbY: `${(halfL - 10).toFixed(2)}mm`
  }));

  // 10a. J_LED (J_LED1): Primary Addressable LED Output Header (3-Pin Top Tip, GPIO 6)
  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED",
    key: "j_led",
    pcbX: "0mm",
    pcbY: `${(halfL - 7).toFixed(2)}mm`
  }));

  // 10b. J_LED2: Aux Addressable LED Output Header 2 (3-Pin Right Upper, GPIO 20 / RX)
  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED2",
    key: "j_led2",
    pcbX: "4.5mm",
    pcbY: "14.5mm"
  }));

  // 10c. J_LED3: Aux Addressable LED Output Header 3 (3-Pin Left Upper, GPIO 21 / TX)
  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED3",
    key: "j_led3",
    pcbX: "-4.5mm",
    pcbY: "14.5mm"
  }));

  // 10d. J_BTN: External User Action / Boot Mode Button Header (2-Pin, GPIO 9 / BOOT)
  children.push(React.createElement(ButtonHeader, {
    name: "J_BTN",
    key: "j_btn",
    pcbX: "0mm",
    pcbY: "-12.0mm"
  }));

  // 11. High-Side WS2812B Power Switch (Eliminates ~50-75mA parasitic quiescent sleep drain)
  // 11a. Q_LED_PWR: AO3401A P-Channel MOSFET (Switches 5V/VSYS rail to WS2812B)
  const ledSwY = halfL - 13.5;
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_LED_PWR",
    key: "q_led_pwr",
    pcbX: "-2.6mm",
    pcbY: `${ledSwY.toFixed(2)}mm`
  }));

  // 11b. R_LED_PU: 100kΩ 0603 Pull-Up Resistor (Gate to Source keeps P-FET off by default)
  children.push(React.createElement(Resistor0603, {
    name: "R_LED_PU",
    key: "r_led_pu",
    pcbX: "-5.8mm",
    pcbY: `${ledSwY.toFixed(2)}mm`
  }));

  // 11c. Q_LED_EN: AO3400A N-Channel MOSFET Pre-Driver (GPIO 10 pulls P-FET Gate cleanly to GND)
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_LED_EN",
    key: "q_led_en",
    pcbX: "2.6mm",
    pcbY: `${ledSwY.toFixed(2)}mm`
  }));

  // 11d. R_LED_GATE: 10kΩ 0603 Pull-Down Resistor (Keeps Pre-Driver Gate at 0V during boot/sleep)
  children.push(React.createElement(Resistor0603, {
    name: "R_LED_GATE",
    key: "r_led_gate",
    pcbX: "5.8mm",
    pcbY: `${ledSwY.toFixed(2)}mm`
  }));

  // ============================================================
  // COMPLETE SILKSCREEN TEXT & PIN LABELS (Top & Bottom Layers)
  // Front silkscreen is mirrored to the backside for dual-side inspection
  // ============================================================
  const makeSilk = (key, text, x, y, layer = "top", baseFsz = 0.85, align = "center", rot = 0) => {
    return React.createElement("silkscreentext", {
      key,
      text,
      pcbX: typeof x === "number" ? `${x.toFixed(2)}mm` : x,
      pcbY: typeof y === "number" ? `${y.toFixed(2)}mm` : y,
      fontSize: `${baseFsz.toFixed(2)}mm`,
      layer,
      anchorAlignment: align,
      pcbRotation: rot
    });
  };

  const addSilkBoth = (key, text, x, y, baseFsz = 0.85, align = "center", rot = 0) => {
    children.push(makeSilk(key, text, x, y, "top", baseFsz, align, rot));
    children.push(makeSilk(`${key}_b`, text, x, y, "bottom", baseFsz, align, rot));
  };

  // --- A. J_LED (WS2812B 3-Pin Header 1 - Main Top Tip, GPIO 6) ---
  addSilkBoth("st_led_t", "LED1 (G6)", 0, halfL - 4.2, 0.8, "center");
  addSilkBoth("st_led_5v", "5V", -2.54, halfL - 9.3, 0.75, "center");
  addSilkBoth("st_led_dat", "D1", 0, halfL - 9.3, 0.75, "center");
  addSilkBoth("st_led_gnd", "GND", 2.54, halfL - 9.3, 0.75, "center");

  // --- A2. J_LED2 & J_LED3 (Aux Addressable LED Headers, GPIO 20 & 21) ---
  addSilkBoth("st_led2_t", "LED2 (G20)", 4.5, 17.5, 0.7, "center");
  addSilkBoth("st_led2_5v", "5V", 4.5 - 2.54, 12.5, 0.65, "center");
  addSilkBoth("st_led2_dat", "D2", 4.5, 12.5, 0.65, "center");
  addSilkBoth("st_led2_gnd", "GND", 4.5 + 2.54, 12.5, 0.65, "center");

  addSilkBoth("st_led3_t", "LED3 (G21)", -3.5, 18.2, 0.7, "center");
  addSilkBoth("st_led3_5v", "5V", -4.5 - 2.54, 12.5, 0.65, "center");
  addSilkBoth("st_led3_dat", "D3", -4.5, 12.5, 0.65, "center");
  addSilkBoth("st_led3_gnd", "GND", -4.5 + 2.54, 12.5, 0.65, "center");

  // --- A3. J_BTN (External User Action / Boot Mode Button Header, GPIO 9) ---
  addSilkBoth("st_btn_t", "BTN (G9)", 0, -9.6, 0.75, "center");
  addSilkBoth("st_btn_p1", "G9", -1.27, -14.4, 0.65, "center");
  addSilkBoth("st_btn_p2", "GND", 1.27, -14.4, 0.65, "center");

  // --- B. Lateral Haptic Motor Ports (HAP-L & HAP-R) ---
  addSilkBoth("st_hap_l_t", "HAP_L", -hapticX + 3.8, halfL - 10, 0.8, "center");
  addSilkBoth("st_hap_l_p", "+", -hapticX + 2.2, halfL - 10 + 1.27, 0.75, "center");
  addSilkBoth("st_hap_l_m", "-", -hapticX + 2.2, halfL - 10 - 1.27, 0.75, "center");

  addSilkBoth("st_hap_r_t", "HAP_R", hapticX - 3.8, halfL - 10, 0.8, "center");
  addSilkBoth("st_hap_r_p", "+", hapticX - 2.2, halfL - 10 + 1.27, 0.75, "center");
  addSilkBoth("st_hap_r_m", "-", hapticX - 2.2, halfL - 10 - 1.27, 0.75, "center");

  // --- B2. High-Side WS2812B Power Switch ---
  addSilkBoth("st_q_lpwr_t", "Q_LPWR", -2.6, ledSwY + 2.5, 0.7, "center");
  addSilkBoth("st_q_lpwr_d", "D", -2.6, ledSwY + 1.7, 0.6, "center");
  addSilkBoth("st_q_lpwr_g", "G", -3.55, ledSwY - 1.8, 0.6, "center");
  addSilkBoth("st_q_lpwr_s", "S", -1.65, ledSwY - 1.8, 0.6, "center");
  addSilkBoth("st_r_lpu_t", "100k", -5.8, ledSwY + 1.7, 0.65, "center");

  addSilkBoth("st_q_len_t", "Q_LEN", 2.6, ledSwY + 2.5, 0.7, "center");
  addSilkBoth("st_q_len_d", "D", 2.6, ledSwY + 1.7, 0.6, "center");
  addSilkBoth("st_q_len_g", "G", 1.65, ledSwY - 1.8, 0.6, "center");
  addSilkBoth("st_q_len_s", "S", 3.55, ledSwY - 1.8, 0.6, "center");
  addSilkBoth("st_r_lgate_t", "10k(G10)", 5.8, ledSwY + 1.7, 0.60, "center");

  // --- C. Q1: AO3400A Haptic MOSFET & Turnkey Flyback Protection ---
  addSilkBoth("st_q1_t", "Q1 AO3400A", 0, halfL - 16.4, 0.8, "center");
  addSilkBoth("st_q1_d", "D", 0, halfL - 17.2, 0.65, "center");
  addSilkBoth("st_q1_g", "G", -1.0, halfL - 20.6, 0.65, "center");
  addSilkBoth("st_q1_s", "S", 1.0, halfL - 20.6, 0.65, "center");

  addSilkBoth("st_rg_t", "10k", -3.2, halfL - 17.2, 0.75, "center");
  addSilkBoth("st_dh_t", "D_HAP", 5.0, halfL - 17.2, 0.75, "center");
  addSilkBoth("st_dh_a", "A", 5.0 - 1.8, halfL - 20.6, 0.65, "center");
  addSilkBoth("st_dh_k", "K", 5.0 + 1.8, halfL - 20.6, 0.65, "center");

  // --- D. MPU6050 / MPU6500 Universal IMU 8-Pin Header (Side-Mounted at x = -6.8mm) ---
  const imuY = halfL - 29.0;
  addSilkBoth("st_imu_t", "IMU", -6.8, imuY + 10.5, 0.75, "center");
  const imuPins = ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"];
  for (let i = 0; i < 8; i++) {
    const yPos = imuY + (3.5 - i) * 2.54;
    addSilkBoth(`st_imu_${i}`, imuPins[i], -4.8, yPos, 0.65, "center_left");
  }

  // --- D2. Comprehensive 2-Column Pinout Silkscreen Reference Table ---
  // Positioned in the expansive blank area next to the side-mounted IMU (x in [-4, +8]mm, y in [24, 38]mm)
  const pinoutHdrY = 36.6;
  addSilkBoth("st_pinout_hdr1", "audioMotionReactive", 1.8, pinoutHdrY, 0.62, "center");
  addSilkBoth("st_pinout_hdr2", "LedHapticPCB PINOUT", 1.8, pinoutHdrY - 1.25, 0.62, "center");
  addSilkBoth("st_pinout_div", "---------------------", 1.8, pinoutHdrY - 2.3, 0.55, "center");

  const pinoutColLeft = [
    "G0: ADC MIC",
    "G1: I2S WS",
    "G2: IMU SDA",
    "G3: IMU SCL",
    "G4: I2S SCK",
    "G5: IMU INT",
    "1S LIPO/USB"
  ];

  const pinoutColRight = [
    "G6: LED1 TOP",
    "G7: HAPTIC",
    "G8: I2S SD",
    "G9: BTN/BOOT",
    "G10: LED PWR",
    "G20: LED2 RX",
    "G21: LED3 TX"
  ];

  const pinoutStartY = pinoutHdrY - 3.5;
  for (let r = 0; r < 7; r++) {
    const rowY = pinoutStartY - (r * 1.35);
    addSilkBoth(`st_pinout_l_${r}`, pinoutColLeft[r], -1.2, rowY, 0.62, "center");
    addSilkBoth(`st_pinout_r_${r}`, pinoutColRight[r], 4.8, rowY, 0.62, "center");
  }

  // --- E. Designer Attribution "By Dillon Simeone" ---
  children.push(makeSilk("st_author_t", "By Dillon Simeone", 0, -23.5, "top", 0.8, "center"));
  children.push(makeSilk("st_author_b", "By Dillon Simeone", 0, 8.6, "bottom", 0.85, "center"));

  // --- F. ESP32-C3 SuperMini 16-Pin Headers & Purpose Description ---
  // Note: Purpose text is ONLY on the top layer so the backside remains clean for the vector QR code
  addSilkBoth("st_mcu_hdr", "ESP32-C3 SUPERMINI", 0, 7.8, 0.82, "center");
  children.push(makeSilk("st_mcu_desc_1", "Generalist Carrier PCB for", 0, 5.8, "top", 0.58, "center"));
  children.push(makeSilk("st_mcu_desc_2", "Dillon's Reactive Haptic &", 0, 4.4, "top", 0.58, "center"));
  children.push(makeSilk("st_mcu_desc_3", "LED Projects: Wearables,", 0, 3.0, "top", 0.58, "center"));
  children.push(makeSilk("st_mcu_desc_4", "Pocketables, Installations,", 0, 1.6, "top", 0.58, "center"));
  children.push(makeSilk("st_mcu_desc_5", "& Interactive Props", 0, 0.2, "top", 0.58, "center"));
  const c3LeftPins = ["5V", "GND", "3V3", "IO0", "IO1", "IO2", "IO3", "IO4"];
  const c3RightPins = ["IO5", "IO6", "IO7", "IO8", "IO9", "IO10", "RX", "TX"];
  for (let i = 0; i < 8; i++) {
    const yPos = 2.0 + (3.5 - i) * 2.54;
    const xL = (i === 0) ? -6.2 : -7.0;
    const xR = (i === 0) ? 6.2 : 7.0;
    const yAdj = (i === 0) ? yPos - 0.4 : yPos;
    addSilkBoth(`st_c3_l_${i}`, c3LeftPins[i], xL, yAdj, 0.75, "center_right");
    addSilkBoth(`st_c3_r_${i}`, c3RightPins[i], xR, yAdj, 0.75, "center_left");
  }

  // --- G. INMP441 I2S Digital Mic ---
  addSilkBoth("st_inmp_t", "INMP441 I2S", 0, -16.0, 0.85, "center");
  const inmpY = -halfL + 38;
  addSilkBoth("st_inmp_sck", "SCK", -5.4, inmpY + 2.54, 0.8, "center_left");
  addSilkBoth("st_inmp_ws", "WS", -5.4, inmpY, 0.8, "center_left");
  addSilkBoth("st_inmp_lr", "L/R", -5.4, inmpY - 2.54, 0.8, "center_left");

  addSilkBoth("st_inmp_sd", "SD", 5.4, inmpY + 2.54, 0.8, "center_right");
  addSilkBoth("st_inmp_vdd", "VDD", 5.4, inmpY, 0.8, "center_right");
  addSilkBoth("st_inmp_gnd", "GND", 5.4, inmpY - 2.54, 0.8, "center_right");

  // --- H. MAX4466 Analog Mic ---
  addSilkBoth("st_max_t", "MAX4466", 0, -halfL + 32.5, 0.9, "center");
  const maxY = -halfL + 29;
  addSilkBoth("st_max_vcc", "VCC", -2.54, -halfL + 27.4, 0.75, "center");
  addSilkBoth("st_max_gnd", "GND", 0, -halfL + 27.4, 0.75, "center");
  addSilkBoth("st_max_out", "OUT", 2.54, -halfL + 27.4, 0.75, "center");

  // --- I. Turnkey Auto Power-Path ---
  const pwrY = -halfL + 21.5;
  addSilkBoth("st_rpwr_t", "100k", -1.5, pwrY + 2.5, 0.7, "center");

  addSilkBoth("st_qpwr_t", "Q_PWR", 2.0, pwrY + 2.5, 0.75, "center");
  addSilkBoth("st_qpwr_d", "D", 0.8, pwrY + 1.0, 0.65, "center");
  addSilkBoth("st_qpwr_g", "G", 1.05, pwrY - 2.4, 0.65, "center");
  addSilkBoth("st_qpwr_s", "S", 2.95, pwrY - 2.4, 0.65, "center");

  addSilkBoth("st_dpwr_t", "D_PWR", 6.4, pwrY + 3.0, 0.75, "center");
  addSilkBoth("st_dpwr_k", "K", 6.4 - 1.65, pwrY - 1.2, 0.65, "center");
  addSilkBoth("st_dpwr_a", "A", 6.4 + 1.65, pwrY - 1.2, 0.65, "center");

  // --- J. LiPo Charger MCP73831 & Passives ---
  const chgSilkX = -4.5;
  const chgY = -halfL + 18;
  addSilkBoth("st_chg_t", "U_CHG", chgSilkX + 2.8, chgY, 0.75, "center");
  addSilkBoth("st_chg_prog", "PROG", chgSilkX - 0.95, chgY + 2.4, 0.65, "center");
  addSilkBoth("st_chg_vin", "VIN", chgSilkX + 0.95, chgY + 2.4, 0.65, "center");
  addSilkBoth("st_chg_stat", "STAT", chgSilkX - 0.95, chgY - 2.4, 0.65, "center");
  addSilkBoth("st_chg_gnd", "GND", chgSilkX, chgY - 2.4, 0.65, "center");
  addSilkBoth("st_chg_vbat", "VBAT", chgSilkX + 0.95, chgY - 2.4, 0.65, "center");

  addSilkBoth("st_rprog_t", "2k PROG", chgSilkX, -halfL + 24.2, 0.7, "center");
  addSilkBoth("st_cvin_t", "C_VIN", -3.2, -halfL + 12.2, 0.6, "center");
  addSilkBoth("st_cbat_t", "C_BAT", -5.8, -halfL + 12.2, 0.6, "center");

  // --- K. External Switch SW_EXT ---
  const swX = halfW - 3.5;
  const swY = -halfL + 18;
  addSilkBoth("st_sw_bat", "BAT+", swX - 1.27, swY - 2.5, 0.7, "center");
  addSilkBoth("st_sw_vsys", "VSYS", swX + 1.27, swY - 2.5, 0.7, "center");
  addSilkBoth("st_sw_t", "SW_EXT", swX, swY - 4.2, 0.75, "center");

  // --- L. Battery Terminals J_BAT ---
  const batY = -halfL + 7.0;
  addSilkBoth("st_bat_t", "1S LiPo", 0, batY + 3.2, 0.85, "center");
  addSilkBoth("st_bat_p", "BAT+", -2.0, batY - 3.2, 0.8, "center");
  addSilkBoth("st_bat_m", "BAT-", 2.0, batY - 3.2, 0.8, "center");

  // --- M. QR Code on Bottom Silkscreen to Website ---
  // https://dillonsimeone.com/?reason=audioMotionReactiveLedHapticPCB
  const QR_MATRIX_33 = [
    "111111100010101011111111001111111",
    "100000101010001101001000001000001",
    "101110100000100100000101001011101",
    "101110101110111111010011001011101",
    "101110100100010011111101101011101",
    "100000101101100111000110001000001",
    "111111101010101010101010101111111",
    "000000000111001100101111000000000",
    "111110111101011100001011110101010",
    "110011010010100010011101101000111",
    "110110100010010101101100001011010",
    "010111001000101100111110010100100",
    "111110101110101001010011110011000",
    "011101011000001110111111001000011",
    "100011110001100100001000011110010",
    "001101011111000110001111010010100",
    "110110100011001101010011110110010",
    "101111000000100010101001001001011",
    "010100100000010110101010010011010",
    "000000011000101110011111110010100",
    "100111111110101101010010110110010",
    "110100011100000010111001001001011",
    "100011110111110101101010111101010",
    "100100011001000110000101011011100",
    "101111110111000001010001111110001",
    "000000001010110110011010100011101",
    "111111101000011110000111101010110",
    "100000100100110110101110100011110",
    "101110101110101101000010111110000",
    "101110101010000011111101110110000",
    "101110101111100100101101101001110",
    "100000101001001010001110011101100",
    "111111101111000111001011101010010"
  ];
  const qrModSize = 0.32; // mm per module -> 33 * 0.32 = 10.56mm wide
  const qrCenterX = 0;
  const qrCenterY = 1.0;
  const N_QR = 33;
  const halfN = (N_QR - 1) / 2; // 16

  let qrPathIdx = 0;
  for (let r = 0; r < N_QR; r++) {
    const y = +(qrCenterY + (halfN - r) * qrModSize).toFixed(3);
    const rowStr = QR_MATRIX_33[r];
    let c = 0;
    while (c < N_QR) {
      if (rowStr[c] === '1') {
        const startC = c;
        while (c < N_QR && rowStr[c] === '1') c++;
        const endC = c - 1;
        const x1 = +(qrCenterX + (startC - halfN) * qrModSize).toFixed(3);
        const x2 = +(qrCenterX + (endC - halfN) * qrModSize).toFixed(3);
        children.push(React.createElement("silkscreenpath", {
          key: `qr_p_${qrPathIdx++}`,
          layer: "bottom",
          route: [{ x: x1, y: y }, { x: x2, y: y }],
          strokeWidth: `${qrModSize}mm`
        }));
      } else {
        c++;
      }
    }
  }

  children.push(makeSilk("st_url_b", "dillonsimeone.com", 0, -6.2, "bottom", 0.75, "center"));

  // ============================================================
  // N. TRADITIONAL JAPANESE SEIGAIHA OCEAN RIPPLE / SCALE SILKSCREEN
  // Generates concentric wave arches across open PCB areas on both sides
  // Respects 5mm clearance to major text blocks and 1.2mm to pin labels/pads
  // Adds $0 manufacturing cost on standard 2-layer FR4 fabrication (JLCPCB)
  // ============================================================
  const generateRippleSilkscreen = (layer) => {
    // Collect all silkscreen texts active on this layer
    const layerTexts = [];
    children.forEach(c => {
      if (c && c.type === "silkscreentext") {
        const itemLayer = c.props.layer || "top";
        if (itemLayer === layer) {
          const px = parseFloat(c.props.pcbX) || 0;
          const py = parseFloat(c.props.pcbY) || 0;
          const fs = parseFloat(c.props.fontSize) || 0.8;
          const text = c.props.text || "";
          layerTexts.push({ text, x: px, y: py, fs });
        }
      }
    });

    // Clearance bounding boxes for texts
    const textObstacles = layerTexts.map(t => {
      // Major mission/attribution/purpose texts get the full 5mm clearance
      const isMajorBlock = t.text.includes("Generalist") || t.text.includes("Dillon") ||
                          t.text.includes("LED Projects") || t.text.includes("Pocketables") ||
                          t.text.includes("Props") || t.text.includes("audioMotion") ||
                          t.text.includes("PINOUT") || t.text.includes("By Dillon");
      const cl = isMajorBlock ? 5.0 : 1.2;
      const hw = (t.text.length * t.fs * 0.6) / 2 + cl;
      const hh = t.fs / 2 + cl;
      return {
        x1: t.x - hw,
        x2: t.x + hw,
        y1: t.y - hh,
        y2: t.y + hh
      };
    });

    // Copper & component keepouts
    const keepouts = [];
    // M3 corner holes
    cornerHoles.forEach(h => keepouts.push({ x: h.x, y: h.y, r: 3.2 }));

    if (layer === "top") {
      // SMT component bodies on top layer
      keepouts.push({ x: chgX, y: -halfL + 18, r: 2.2 }); // U_CHG
      keepouts.push({ x: 2.0, y: -halfL + 21.5, r: 2.2 }); // Q_PWR
      keepouts.push({ x: 6.4, y: -halfL + 22.0, r: 2.2 }); // D_PWR
      keepouts.push({ x: 0, y: halfL - 19, r: 2.2 });       // Q_FET
      keepouts.push({ x: 5.0, y: halfL - 19, r: 2.2 });     // D_HAP
      keepouts.push({ x: -2.6, y: ledSwY, r: 2.2 });        // Q_LED_PWR
      keepouts.push({ x: 2.6, y: ledSwY, r: 2.2 });         // Q_LED_EN
    }

    if (layer === "bottom") {
      // Backside keepout for QR code (center y=1.0, width ~10.6mm + margin)
      keepouts.push({ x: 0, y: 1.0, r: 6.8 });
    }

    // Keepout around ESP32-C3 SuperMini header pins (-8.89 and +8.89)
    for (let i = 0; i < 8; i++) {
      const py = 2.0 + (3.5 - i) * 2.54;
      keepouts.push({ x: -8.89, y: py, r: 1.5 });
      keepouts.push({ x: 8.89, y: py, r: 1.5 });
    }

    // Keepouts for top tip LED, haptic, button, and mic headers
    keepouts.push({ x: 0, y: halfL - 7, r: 3.5 });        // J_LED
    keepouts.push({ x: -hapticX, y: halfL - 10, r: 2.0 }); // J_HAP_L
    keepouts.push({ x: hapticX, y: halfL - 10, r: 2.0 });  // J_HAP_R
    keepouts.push({ x: 4.5, y: 14.5, r: 3.5 });           // J_LED2
    keepouts.push({ x: -4.5, y: 14.5, r: 3.5 });          // J_LED3
    keepouts.push({ x: -6.8, y: halfL - 29.0, r: 4.5 });  // U_IMU
    keepouts.push({ x: 0, y: -12.0, r: 2.5 });            // J_BTN
    keepouts.push({ x: 0, y: -halfL + 38, r: 3.5 });      // J_MIC_INMP
    keepouts.push({ x: 0, y: -halfL + 29, r: 3.5 });      // J_MIC_MAX
    keepouts.push({ x: halfW - 3.5, y: -halfL + 18, r: 2.5 }); // SW_EXT
    keepouts.push({ x: 0, y: -halfL + 7, r: 3.5 });       // J_BAT

    // Safe board boundary
    const minX = -halfW + 1.8;
    const maxX = halfW - 1.8;
    const minY = -halfL + 5.5;
    const maxY = halfL - 5.5;

    // Seigaiha ripple parameters:
    // Staggered grid centers, concentric semicircles
    const dX = 5.5;
    const dY = 3.0;
    const radii = [1.4, 2.4, 3.3];
    const strokeW = 0.18; // mm (well above JLCPCB 0.15mm / 6mil silkscreen min limit)

    let rippleIdx = 0;
    let row = 0;
    for (let cy = minY; cy <= maxY; cy += dY) {
      const xOffset = (row % 2 === 0) ? 0 : dX / 2;
      row++;

      for (let cx = minX - dX; cx <= maxX + dX; cx += dX) {
        const centerX = cx + xOffset;

        for (const r of radii) {
          const steps = 8;
          let currentSeg = [];

          for (let s = 0; s <= steps; s++) {
            const th = (s / steps) * Math.PI;
            const px = centerX + r * Math.cos(th);
            const py = cy + r * Math.sin(th);

            // Boundary clamp
            if (px < minX || px > maxX || py < minY || py > maxY) {
              if (currentSeg.length >= 2) {
                addRipplePath(layer, currentSeg, strokeW, rippleIdx++);
              }
              currentSeg = [];
              continue;
            }

            // Check 5mm / 1.2mm text clearance
            const inText = textObstacles.some(b => px >= b.x1 && px <= b.x2 && py >= b.y1 && py <= b.y2);
            if (inText) {
              if (currentSeg.length >= 2) {
                addRipplePath(layer, currentSeg, strokeW, rippleIdx++);
              }
              currentSeg = [];
              continue;
            }

            // Check keepout clearance
            const inKeepout = keepouts.some(k => Math.hypot(px - k.x, py - k.y) < k.r);
            if (inKeepout) {
              if (currentSeg.length >= 2) {
                addRipplePath(layer, currentSeg, strokeW, rippleIdx++);
              }
              currentSeg = [];
              continue;
            }

            currentSeg.push({ x: +px.toFixed(2), y: +py.toFixed(2) });
          }

          if (currentSeg.length >= 2) {
            addRipplePath(layer, currentSeg, strokeW, rippleIdx++);
          }
        }
      }
    }
  };

  const addRipplePath = (layer, points, strokeW, idx) => {
    // Convert points array into consecutive silkscreen lines
    for (let i = 0; i < points.length - 1; i++) {
      children.push(React.createElement("silkscreenpath", {
        key: `rip_${layer}_${idx}_${i}`,
        layer,
        route: [points[i], points[i + 1]],
        strokeWidth: `${strokeW}mm`
      }));
    }
  };

  generateRippleSilkscreen("top");
  generateRippleSilkscreen("bottom");

  // ============================================================
  // COMPLETE COPPER TRACES & RAT'S NEST ROUTING
  // ============================================================
  if (!skipRouting) {
    // --- 1. IMU Full Net Connections ---
    // SCL (GPIO 3 = pin7 -> IMU SCL = pin3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin7", to: ".U_IMU > .pin3", key: "tr_scl", name: "NET_I2C_SCL", width: SIG }));
    // SDA (GPIO 2 = pin6 -> IMU SDA = pin4)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin6", to: ".U_IMU > .pin4", key: "tr_sda", name: "NET_I2C_SDA", width: SIG }));
    // INT (GPIO 5 = pin9 -> IMU INT = pin8)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin9", to: ".U_IMU > .pin8", key: "tr_imu_int", name: "NET_IMU_INT", width: SIG }));
    // VCC 3.3V (ESP32 3V3 = pin3 -> IMU VCC = pin1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin3", to: ".U_IMU > .pin1", key: "tr_imu_vcc", name: "NET_3V3_IMU", width: PWR }));
    // GND (ESP32 GND = pin2 -> IMU GND = pin2)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".U_IMU > .pin2", key: "tr_imu_gnd", name: "NET_GND_IMU", width: PWR }));
    // AD0: Standard MPU-6050/6500 breakouts (e.g. GY-521) include an onboard 4.7k pulldown to GND (0x68).
    // Leaving AD0 unrouted on carrier board prevents high-current MOSFET motor ground from daisy-chaining through this logic pin.

    // --- 2. Addressable LED Outputs (4 Channels) & High-Side Power Switch ---
    // LED 1 Data (GPIO 6 = pin10 -> J_LED DATA = pin2) [Main Top Tip]
    children.push(React.createElement("trace", { from: ".U_MCU > .pin10", to: ".J_LED > .pin2", key: "tr_led_dat", name: "NET_LED_DATA", width: SIG }));
    // Switched LED 5V Rail (P-MOSFET Drain = pin3 -> J_LED VCC = pin1)
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED > .pin1", key: "tr_led_sw_vcc", name: "NET_5V_LED_SW", width: PWR }));
    // LED 1 GND (ESP32 GND = pin2 -> J_LED GND = pin3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_LED > .pin3", key: "tr_led_gnd", name: "NET_GND_LED", width: PWR }));

    // LED 2 Data (GPIO 20 / RX = pin15 -> J_LED2 DATA = pin2) [Aux Right Upper]
    children.push(React.createElement("trace", { from: ".U_MCU > .pin15", to: ".J_LED2 > .pin2", key: "tr_led2_dat", name: "NET_LED2_DATA", width: SIG }));
    // Switched LED 5V Rail to J_LED2 VCC = pin1
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED2 > .pin1", key: "tr_led2_sw_vcc", name: "NET_5V_LED_SW", width: PWR }));
    // LED 2 GND (ESP32 GND = pin2 -> J_LED2 GND = pin3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_LED2 > .pin3", key: "tr_led2_gnd", name: "NET_GND_SYS", width: PWR }));

    // LED 3 Data (GPIO 21 / TX = pin16 -> J_LED3 DATA = pin2) [Aux Left Upper]
    children.push(React.createElement("trace", { from: ".U_MCU > .pin16", to: ".J_LED3 > .pin2", key: "tr_led3_dat", name: "NET_LED3_DATA", width: SIG }));
    // Switched LED 5V Rail to J_LED3 VCC = pin1
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED3 > .pin1", key: "tr_led3_sw_vcc", name: "NET_5V_LED_SW", width: PWR }));
    // LED 3 GND (ESP32 GND = pin2 -> J_LED3 GND = pin3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_LED3 > .pin3", key: "tr_led3_gnd", name: "NET_GND_SYS", width: PWR }));

    // --- 2b. External User Action / Boot Mode Button Header (GPIO 9 / BOOT = pin13 -> J_BTN BTN = pin1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin13", to: ".J_BTN > .pin1", key: "tr_btn_dat", name: "NET_BTN_MODE", width: SIG }));
    // J_BTN Ground (ESP32 GND = pin2 -> J_BTN GND = pin2)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_BTN > .pin2", key: "tr_btn_gnd", name: "NET_GND_SYS", width: PWR }));

    // High-Side P-MOSFET Source to Main System Rail VSYS
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".Q_LED_PWR > .pin2", key: "tr_pmos_src_vsys", name: "NET_VSYS", width: PWR }));
    // High-Side P-MOSFET Gate Pull-Up Resistor (100kΩ from Gate to Source / VSYS)
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin1", to: ".R_LED_PU > .pin1", key: "tr_r_lpu_g", name: "NET_LED_P_GATE", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_LED_PU > .pin2", to: ".Q_LED_PWR > .pin2", key: "tr_r_lpu_s", name: "NET_VSYS", width: PWR }));
    // Pre-Driver N-MOSFET Drain pulls P-MOSFET Gate to GND when enabled
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin3", to: ".Q_LED_PWR > .pin1", key: "tr_en_drain_gate", name: "NET_LED_P_GATE", width: SIG }));
    // Pre-Driver Gate from ESP32-C3 GPIO 10 (pin14) [Pure GPIO, avoids strapping conflict on GPIO 8]
    children.push(React.createElement("trace", { from: ".U_MCU > .pin14", to: ".Q_LED_EN > .pin1", key: "tr_led_en_gate", name: "NET_LED_PWR_EN", width: SIG }));
    // Pre-Driver Gate Pull-Down Resistor (10kΩ from Gate to GND)
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin1", to: ".R_LED_GATE > .pin1", key: "tr_r_lgate_g", name: "NET_LED_PWR_EN", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_LED_GATE > .pin2", to: ".Q_LED_EN > .pin2", key: "tr_r_lgate_s", name: "NET_GND_SYS", width: PWR }));
    // Pre-Driver Source to System GND
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin2", to: ".U_MCU > .pin2", key: "tr_led_en_gnd", name: "NET_GND_SYS", width: PWR }));

    // --- 3. Haptic MOSFET Circuit & Turnkey Protection ---
    // Gate (GPIO 7 = pin11 -> MOSFET Gate = pin1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin11", to: ".Q_FET > .pin1", key: "tr_fet_gate", name: "NET_MTR_GATE", width: SIG }));
    // Gate Pull-Down Resistor (10kΩ from Gate to Source/GND)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin1", to: ".R_GATE > .pin1", key: "tr_r_gate_g", name: "NET_MTR_GATE", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_GATE > .pin2", to: ".Q_FET > .pin2", key: "tr_r_gate_s", name: "NET_GND_FET", width: PWR }));
    // Source to GND (MOSFET Source = pin2 -> ESP32 GND = pin2)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin2", to: ".U_MCU > .pin2", key: "tr_fet_src", name: "NET_GND_FET", width: PWR }));
    // Switched Drain to Left Motor Neg (MOSFET Drain = pin3 -> J_HAP_L pin2)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".J_HAP_L > .pin2", key: "tr_hap_l_neg", name: "NET_HAP_L_NEG", width: PWR }));
    // Switched Drain to Right Motor Neg (MOSFET Drain = pin3 -> J_HAP_R pin2)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".J_HAP_R > .pin2", key: "tr_hap_r_neg", name: "NET_HAP_R_NEG", width: PWR }));
    // Flyback Schottky Diode (Anode to Drain/Switched Neg, Cathode to Power Pos VSYS)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".D_HAP > .pin2", key: "tr_d_hap_a", name: "NET_HAP_L_NEG", width: PWR }));
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".Q_PWR > .pin2", key: "tr_d_hap_k", name: "NET_VSYS", width: PWR }));
    // Power to Left Motor Pos (VSYS -> J_HAP_L pin1)
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".J_HAP_L > .pin1", key: "tr_hap_l_pos", name: "NET_HAP_L_POS", width: PWR }));
    // Power to Right Motor Pos (VSYS -> J_HAP_R pin1)
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".J_HAP_R > .pin1", key: "tr_hap_r_pos", name: "NET_HAP_R_POS", width: PWR }));

    // --- 4. MAX4466 Analog Mic ---
    // Mic Analog Out (J_MIC_MAX pin3 -> ESP32 GPIO 0 = pin4)
    children.push(React.createElement("trace", { from: ".J_MIC_MAX > .pin3", to: ".U_MCU > .pin4", key: "tr_max_out", name: "NET_MIC_ADC", width: SIG }));
    // Mic 3.3V (ESP32 3V3 = pin3 -> J_MIC_MAX pin1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin3", to: ".J_MIC_MAX > .pin1", key: "tr_max_vcc", name: "NET_3V3_MAX", width: PWR }));
    // Mic GND (ESP32 GND = pin2 -> J_MIC_MAX pin2)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_MIC_MAX > .pin2", key: "tr_max_gnd", name: "NET_GND_MAX", width: PWR }));

    // --- 5. INMP441 Digital I2S Mic ---
    // SCK (GPIO 4 = pin8 -> INMP pin1)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin8", to: ".J_MIC_INMP > .pin1", key: "tr_inmp_sck", name: "NET_MIC_SCK", width: SIG }));
    // WS (GPIO 1 = pin5 -> INMP pin2)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin5", to: ".J_MIC_INMP > .pin2", key: "tr_inmp_ws", name: "NET_MIC_WS", width: SIG }));
    // SD (GPIO 8 = pin12 -> INMP pin4) [High-Z at reset, pulled HIGH by SuperMini onboard LED; strapping safe]
    children.push(React.createElement("trace", { from: ".U_MCU > .pin12", to: ".J_MIC_INMP > .pin4", key: "tr_inmp_sd", name: "NET_MIC_SD", width: SIG }));
    // L/R to GND for mono left channel (INMP pin3 -> INMP GND pin6)
    children.push(React.createElement("trace", { from: ".J_MIC_INMP > .pin3", to: ".J_MIC_INMP > .pin6", key: "tr_inmp_lr", name: "NET_INMP_LR", width: SIG }));
    // VDD 3.3V (J_MIC_MAX pin1 -> INMP VDD pin5)
    children.push(React.createElement("trace", { from: ".J_MIC_MAX > .pin1", to: ".J_MIC_INMP > .pin5", key: "tr_inmp_vdd", name: "NET_3V3_INMP", width: PWR }));
    // GND (J_MIC_MAX pin2 -> INMP GND pin6)
    children.push(React.createElement("trace", { from: ".J_MIC_MAX > .pin2", to: ".J_MIC_INMP > .pin6", key: "tr_inmp_gnd", name: "NET_GND_INMP", width: PWR }));

    // --- 6. Power Supply, Charger, and Auto Power-Path ---
    // Battery Positive to Charger VBAT (J_BAT pin1 -> U_CHG pin3)
    children.push(React.createElement("trace", { from: ".J_BAT > .pin1", to: ".U_CHG > .pin3", key: "tr_bat_chg", name: "NET_VBAT", width: PWR }));
    // Battery Decoupling Cap C_BAT
    children.push(React.createElement("trace", { from: ".U_CHG > .pin3", to: ".C_BAT > .pin1", key: "tr_c_bat_pos", name: "NET_VBAT", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_BAT > .pin2", to: ".U_CHG > .pin2", key: "tr_c_bat_gnd", name: "NET_GND_SYS", width: PWR }));
    // Battery Negative to System Ground (J_BAT pin2 -> U_CHG pin2)
    children.push(React.createElement("trace", { from: ".J_BAT > .pin2", to: ".U_CHG > .pin2", key: "tr_bat_gnd", name: "NET_GND_BAT", width: PWR }));
    // Charger GND to ESP32 GND (U_CHG pin2 -> U_MCU pin2)
    children.push(React.createElement("trace", { from: ".U_CHG > .pin2", to: ".U_MCU > .pin2", key: "tr_chg_gnd", name: "NET_GND_SYS", width: PWR }));
    // Charger 2kΩ PROG Resistor to GND (Sets safe 500mA charge rate)
    children.push(React.createElement("trace", { from: ".U_CHG > .pin5", to: ".R_PROG > .pin1", key: "tr_chg_prog", name: "NET_CHG_PROG", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_PROG > .pin2", to: ".U_CHG > .pin2", key: "tr_prog_gnd", name: "NET_GND_SYS", width: PWR }));
    // USB 5V VBUS Decoupling Cap C_VIN
    children.push(React.createElement("trace", { from: ".U_MCU > .pin1", to: ".C_VIN > .pin1", key: "tr_c_vin_pos", name: "NET_VBUS", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_VIN > .pin2", to: ".U_CHG > .pin2", key: "tr_c_vin_gnd", name: "NET_GND_SYS", width: PWR }));
    // USB 5V to Charger VIN (U_MCU 5V pin1 -> U_CHG pin4)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin1", to: ".U_CHG > .pin4", key: "tr_usb_vin", name: "NET_VBUS", width: PWR }));
    // External Switch between Battery and Power-Path (J_BAT pin1 -> SW_EXT pin1)
    children.push(React.createElement("trace", { from: ".J_BAT > .pin1", to: ".SW_EXT > .pin1", key: "tr_sw_in", name: "NET_SW_IN", width: PWR }));
    // Switched Battery Output to P-MOSFET Drain (SW_EXT pin2 -> Q_PWR pin3)
    children.push(React.createElement("trace", { from: ".SW_EXT > .pin2", to: ".Q_PWR > .pin3", key: "tr_pwr_pmos_d", name: "NET_VBAT_SW", width: PWR }));
    // Auto Power-Path: P-MOSFET Source to System Rail VSYS (tied to D_HAP pin1 and D_PWR cathode)
    children.push(React.createElement("trace", { from: ".Q_PWR > .pin2", to: ".D_HAP > .pin1", key: "tr_pwr_pmos_s", name: "NET_VSYS", width: PWR }));
    // Auto Power-Path: USB 5V Schottky Diode Anode (VBUS -> D_PWR pin2)
    children.push(React.createElement("trace", { from: ".U_CHG > .pin4", to: ".D_PWR > .pin2", key: "tr_d_pwr_a", name: "NET_VBUS", width: PWR }));
    // Auto Power-Path: Schottky Diode Cathode to System Rail VSYS (D_PWR pin1 -> Q_PWR pin2)
    children.push(React.createElement("trace", { from: ".D_PWR > .pin1", to: ".Q_PWR > .pin2", key: "tr_d_pwr_k", name: "NET_VSYS", width: PWR }));
    // P-MOSFET Gate Control: 100kΩ Pull-Down to GND (Q_PWR pin1 -> R_PWR pin1)
    children.push(React.createElement("trace", { from: ".Q_PWR > .pin1", to: ".R_PWR > .pin1", key: "tr_r_pwr_g", name: "NET_PWR_GATE", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_PWR > .pin2", to: ".U_CHG > .pin2", key: "tr_r_pwr_gnd", name: "NET_GND_SYS", width: PWR }));
    // P-MOSFET Gate Tied to VBUS (When USB connected, VBUS turns P-MOS OFF isolating battery)
    children.push(React.createElement("trace", { from: ".D_PWR > .pin2", to: ".Q_PWR > .pin1", key: "tr_pwr_gate_vbus", name: "NET_VBUS", width: SIG }));
  }

  const boardConfig = boardProps(boardWidth, boardLength, routing, { skipRouting });
  const boardElement = React.createElement("board", {
    name: "main_board",
    key: "board",
    ...boardConfig
  }, ...children);

  circuit.add(boardElement);

  console.log(`[Circuit Profiling] circuit.add() finished in ${(performance.now() - t0).toFixed(1)}ms`);

  const tRender = performance.now();
  await circuit.renderUntilSettled();
  console.log(`[Circuit Profiling] renderUntilSettled() took ${(performance.now() - tRender).toFixed(1)}ms`);

  // Trace Boundary Guard: Clamp all trace routes strictly within board outline and populate x/y for through_pad
  const margin = 0.5; // mm from board perimeter
  const maxBoardX = halfW - margin;
  const minBoardX = -halfW + margin;
  const maxBoardY = halfL - margin;
  const minBoardY = -halfL + margin;

  const circuitJson = circuit.getCircuitJson();
  circuitJson.forEach(item => {
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      if (typeof item.width === "number" && item.width < 0.15) {
        item.width = 0.20;
      }
      item.route.forEach(pt => {
        if (typeof pt.width === "number" && pt.width < 0.15) {
          pt.width = 0.20;
        }
        if (typeof pt.x !== "number") {
          if (pt.start && typeof pt.start.x === "number") pt.x = pt.start.x;
          else if (pt.end && typeof pt.end.x === "number") pt.x = pt.end.x;
        }
        if (typeof pt.y !== "number") {
          if (pt.start && typeof pt.start.y === "number") pt.y = pt.start.y;
          else if (pt.end && typeof pt.end.y === "number") pt.y = pt.end.y;
        }
        if (typeof pt.x === "number" && Number.isFinite(pt.x)) {
          pt.x = Math.max(minBoardX, Math.min(maxBoardX, pt.x));
        }
        if (typeof pt.y === "number" && Number.isFinite(pt.y)) {
          pt.y = Math.max(minBoardY, Math.min(maxBoardY, pt.y));
        }
      });
    }
  });

  return circuit;
}

/**
 * Builds Gerber, Excellon drill files, and BOM/PNP assembly exports.
 */
export async function generateManufacturingArtifacts(circuit, boardParams = {}) {
  let circuitJson = circuit.getCircuitJson();
  const silkScale = boardParams.silkScale || 1.0;
  if (silkScale !== 1.0) {
    circuitJson = circuitJson.map(item => {
      if (item.type === "pcb_silkscreen_text" && typeof item.font_size === "number") {
        return { ...item, font_size: +(item.font_size * silkScale).toFixed(2) };
      }
      return item;
    });
  }
  const drc = runManufacturingDrc(circuitJson);

  let gerberZipBlob = null;
  let bomCsv = "";
  let pnpCsv = "";

  try {
    const gerberCommands = convertSoupToGerberCommands(circuitJson);
    const layers = stringifyGerberCommandLayers(gerberCommands);
    const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson, is_plated: true });
    const drill = stringifyExcellonDrill(drillCommands);

    let JSZipClass = (typeof window !== "undefined" && window.JSZip) || (typeof global !== "undefined" && global.JSZip) || null;
    if (!JSZipClass && typeof window !== "undefined") {
      try {
        const mod = await import("https://esm.sh/jszip");
        JSZipClass = mod.default || mod;
      } catch {}
    }
    if (JSZipClass) {
      const zip = new JSZipClass();
      Object.entries(layers).forEach(([layerName, content]) => {
        let filename = `audioMotionBaton_${layerName}.gbr`;
        if (layerName.includes("F_Cu")) filename = "audioMotionBaton_TopCopper.gtl";
        else if (layerName.includes("B_Cu")) filename = "audioMotionBaton_BottomCopper.gbl";
        else if (layerName.includes("F_SilkScreen")) filename = "audioMotionBaton_TopSilkscreen.gto";
        else if (layerName.includes("B_SilkScreen")) filename = "audioMotionBaton_BottomSilkscreen.gbo";
        else if (layerName.includes("F_Mask")) filename = "audioMotionBaton_TopSolderMask.gts";
        else if (layerName.includes("B_Mask")) filename = "audioMotionBaton_BottomSolderMask.gbs";
        else if (layerName.includes("F_Paste")) filename = "audioMotionBaton_TopPaste.gtp";
        else if (layerName.includes("B_Paste")) filename = "audioMotionBaton_BottomPaste.gbp";
        else if (layerName.includes("Edge_Cuts")) filename = "audioMotionBaton_EdgeCuts.gko";
        zip.file(filename, content);
      });
      zip.file("audioMotionBaton_Drill.drl", drill);
      gerberZipBlob = await zip.generateAsync({ type: "blob" });
    }
  } catch (err) {
    console.warn("[Gerber generation]", err);
  }

  // Turnkey SMT Assembly BOM (Only components placed by factory SMT pick-and-place)
  // Formatted strictly for JLCPCB: Designator, Comment, Footprint, LCSC Part #
  // Exactly matches the CPL file 1-to-1 so JLCPCB flags 0 missing designator errors
  const bomRows = [
    ["Designator", "Comment", "Footprint", "LCSC Part #"],
    ["U_CHG", "TP4054 600mA Li-ion Charger", "SOT-23-5", "C382138"],
    ["Q_FET", "AO3400A N-Channel MOSFET 30V 5.7A", "SOT-23", "C20917"],
    ["Q_PWR", "AO3401A P-Channel MOSFET -30V -4.2A", "SOT-23", "C15127"],
    ["D_PWR", "B5819W 1A 40V Schottky Diode", "SOD-123", "C8598"],
    ["D_HAP", "B5819W 1A 40V Schottky Diode", "SOD-123", "C8598"],
    ["R_PROG", "2k 1% 0603 Resistor (500mA Charge)", "0603", "C22975"],
    ["R_GATE", "10k 1% 0603 Resistor (Gate Pull-Down)", "0603", "C25804"],
    ["R_PWR", "100k 1% 0603 Resistor (P-MOS Pull-Down)", "0603", "C25803"],
    ["C_VIN", "4.7uF 16V X5R 0603 Ceramic Cap", "0603", "C19666"],
    ["C_BAT", "4.7uF 16V X5R 0603 Ceramic Cap", "0603", "C19666"],
    ["Q_LED_PWR", "AO3401A P-Channel MOSFET -30V -4.2A", "SOT-23", "C15127"],
    ["R_LED_PU", "100k 1% 0603 Resistor (P-MOS Pull-Up)", "0603", "C25803"],
    ["Q_LED_EN", "AO3400A N-Channel MOSFET 30V 5.7A", "SOT-23", "C20917"],
    ["R_LED_GATE", "10k 1% 0603 Resistor (Pre-Driver Pull-Down)", "0603", "C25804"]
  ];
  bomCsv = bomRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");

  // CPL (Component Placement List) in exact JLCPCB format: Designator, Mid X, Mid Y, Layer, Rotation
  // Only factory-placed SMT components are routed to the pick-and-place coordinate table
  const smdDesignators = [
    "U_CHG", "Q_FET", "Q_PWR", "D_PWR", "D_HAP", "R_PROG", "R_GATE", "R_PWR", "C_VIN", "C_BAT",
    "Q_LED_PWR", "R_LED_PU", "Q_LED_EN", "R_LED_GATE"
  ];
  const pnpRows = [
    ["Designator", "Mid X", "Mid Y", "Layer", "Rotation"]
  ];
  const pcbComps = circuitJson.filter(e => e.type === "pcb_component");
  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  pcbComps.forEach(comp => {
    const name = scMap.get(comp.source_component_id) || comp.name || "";
    if (smdDesignators.includes(name)) {
      // SOT-23 parts in JLCPCB feeder library require 270° CCW rotation (or 90° CW)
      // to align Pin 1 (Gate) with Pad G, Pin 2 (Source) with Pad S, and Pin 3 (Drain) with Pad D
      let rotation = comp.rotation || 0;
      if (name === "Q_FET" || name === "Q_PWR" || name === "Q_LED_PWR" || name === "Q_LED_EN") {
        rotation = 270;
      }
      if (name === "D_HAP") {
        rotation = 180;
      }
      pnpRows.push([
        name,
        (comp.center?.x || 0).toFixed(2),
        (comp.center?.y || 0).toFixed(2),
        "Top",
        rotation
      ]);
    }
  });
  pnpCsv = pnpRows.map(r => r.join(",")).join("\n");

  return {
    drc,
    gerberZipBlob,
    bomCsv,
    pnpCsv
  };
}
