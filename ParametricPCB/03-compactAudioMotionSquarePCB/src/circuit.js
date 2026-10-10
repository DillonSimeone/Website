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
  SOT23_PMOSFET
} from "./footprints.js";
import { boardProps, normalizeRouting } from "./pcb-rules.js";
import { runManufacturingDrc } from "./drc.js";

/**
 * Programmatically builds the Compact Dense Square Audio & Motion Reactive Controller PCB (03).
 */
export async function compileCircuit(params = {}) {
  const { 
    boardWidth = 38, 
    boardLength = 38, 
    routing = {}, 
    skipRouting = true,
    silkScale = 1.0 
  } = params;

  const R = normalizeRouting(routing);
  const PWR = "0.22mm";
  const SIG = "0.16mm";

  console.log(`[Circuit 03 Profiling] new Circuit() ...`);
  const t0 = performance.now();
  const circuit = new Circuit({
    platform: {
      routingDisabled: skipRouting
    }
  });

  const children = [];

  const halfL = boardLength / 2;
  const halfW = boardWidth / 2;

  // ============================================================
  // 0. M3 CORNER MOUNTING HOLES (3.2mm Clearance Drill, 4.8mm Annular Ring Pad)
  // Standard 31mm x 31mm bolt pattern on 38mm x 38mm board
  // ============================================================
  const mountX = halfW - 3.5;
  const mountY = halfL - 3.5;

  const cornerHoles = [
    { key: "H_TL", name: "H_TL", x: -mountX, y: mountY },
    { key: "H_TR", name: "H_TR", x: mountX, y: mountY },
    { key: "H_BL", name: "H_BL", x: -mountX, y: -mountY },
    { key: "H_BR", name: "H_BR", x: mountX, y: -mountY }
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

  // ============================================================
  // 1. TOP LAYER: ESP32-C3 SUPERMINI MCU (16 Pins)
  // Slightly offset in X (x = -2.5mm) to align USB-C and leave room for backside IMU header
  // ============================================================
  const mcuX = -2.5;
  const mcuY = 1.5;
  children.push(React.createElement(ESP32C3_SuperMini, {
    name: "U_MCU",
    key: "u_mcu",
    pcbX: `${mcuX.toFixed(2)}mm`,
    pcbY: `${mcuY.toFixed(2)}mm`
  }));

  // ============================================================
  // 2. BACKSIDE (BOTTOM LAYER): UNIVERSAL IMU (MPU-6050 / MPU-6500)
  // 8-pin vertical header at x = +9.0mm on bottom layer.
  // The 15.6mm GY-521 body folds to the left across the bottom, directly underneath the ESP32!
  // ============================================================
  const imuX = 9.0;
  const imuY = 1.5;
  children.push(React.createElement(UniversalIMU_8Pin, {
    name: "U_IMU",
    key: "u_imu",
    pcbX: `${imuX.toFixed(2)}mm`,
    pcbY: `${imuY.toFixed(2)}mm`
  }));

  // ============================================================
  // 3. ADDRESSABLE LED OUTPUT HEADERS (3 INDEPENDENT CHANNELS)
  // J_LED (Main, GPIO 6) at top perimeter
  // J_LED2 (Aux, GPIO 20 / RX) at right perimeter
  // J_LED3 (Aux, GPIO 21 / TX) at left perimeter
  // ============================================================
  // ============================================================
  // 3. ADDRESSABLE LED OUTPUT HEADERS (3 INDEPENDENT CHANNELS)
  // J_LED (Main, GPIO 6) centered at top perimeter (x = 0.0mm, y = 15.5mm)
  // J_LED2 (Aux, GPIO 20 / RX) at right perimeter
  // J_LED3 (Aux, GPIO 21 / TX) at left perimeter
  // ============================================================
  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED",
    key: "j_led",
    pcbX: "0.0mm",
    pcbY: `${(halfL - 3.5).toFixed(2)}mm`
  }));

  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED2",
    key: "j_led2",
    pcbX: `${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "6.5mm",
    pcbRotation: 90
  }));

  children.push(React.createElement(LEDOutputHeader, {
    name: "J_LED3",
    key: "j_led3",
    pcbX: `-${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "6.5mm",
    pcbRotation: 90
  }));

  // ============================================================
  // 4. HAPTIC VIBRATION MOTOR OUTPUTS (LEFT & RIGHT)
  // ============================================================
  children.push(React.createElement(HapticMotorOutput, {
    name: "J_HAP_L",
    key: "j_hap_l",
    pcbX: `-${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "-2.5mm"
  }));

  children.push(React.createElement(HapticMotorOutput, {
    name: "J_HAP_R",
    key: "j_hap_r",
    pcbX: `${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "-2.5mm"
  }));

  // ============================================================
  // 5. MICROPHONE HEADERS: MAX4466 (ANALOG) & INMP441 (DIGITAL I2S)
  // ============================================================
  children.push(React.createElement(MAX4466_Header, {
    name: "J_MIC_MAX",
    key: "j_mic_max",
    pcbX: "-8.5mm",
    pcbY: "-13.5mm"
  }));

  children.push(React.createElement(INMP441_DualRow_Header, {
    name: "J_MIC_INMP",
    key: "j_mic_inmp",
    pcbX: "7.0mm",
    pcbY: "-11.5mm"
  }));

  // ============================================================
  // 6. EXTERNAL POWER SWITCH HEADER
  // ============================================================
  children.push(React.createElement(ExternalSwitchPads, {
    name: "SW_EXT",
    key: "sw_ext",
    pcbX: "14.8mm",
    pcbY: "-10.0mm",
    pcbRotation: 90
  }));

  // ============================================================
  // 7. BATTERY DUAL SOLDER PADS (VBAT+, GND)
  // Dual-mount heavy pads for direct wire soldering or 2.54mm pin headers
  // ============================================================
  children.push(React.createElement(BatteryPads, {
    name: "J_BAT",
    key: "j_bat",
    pcbX: "0mm",
    pcbY: "-16.0mm"
  }));

  // ============================================================
  // 8. FACTORY-ASSEMBLED TURNKEY SMT COMPONENTS (14 PARTS)
  // ============================================================
  // 8a. LiPo Charger IC & Passives (MCP73831, R_PROG, C_VIN, C_BAT)
  children.push(React.createElement(SOT23_5_Charger, {
    name: "U_CHG",
    key: "u_chg",
    pcbX: "-7.5mm",
    pcbY: "14.6mm"
  }));

  children.push(React.createElement(Resistor0603, {
    name: "R_PROG",
    key: "r_prog",
    pcbX: "-10.2mm",
    pcbY: "14.6mm"
  }));

  children.push(React.createElement(Capacitor0603, {
    name: "C_VIN",
    key: "c_vin",
    pcbX: "-7.5mm",
    pcbY: "17.1mm"
  }));

  children.push(React.createElement(Capacitor0603, {
    name: "C_BAT",
    key: "c_bat",
    pcbX: "-7.5mm",
    pcbY: "11.8mm"
  }));

  // 8b. Auto Power-Path Management (AO3401A P-MOS, B5819W Schottky, 100k Resistor)
  children.push(React.createElement(SOT23_PMOSFET, {
    name: "Q_PWR",
    key: "q_pwr",
    pcbX: "5.2mm",
    pcbY: "13.5mm"
  }));

  children.push(React.createElement(DiodeSOD123, {
    name: "D_PWR",
    key: "d_pwr",
    pcbX: "9.8mm",
    pcbY: "13.5mm"
  }));

  children.push(React.createElement(Resistor0603, {
    name: "R_PWR",
    key: "r_pwr",
    pcbX: "5.2mm",
    pcbY: "16.5mm"
  }));

  // 8c. Haptic Inductive Driver & Flyback Clamp (AO3400A N-MOS, 10k Gate Pull-Down, B5819W Diode)
  // Rotated 180° so Cathode is on VSYS and Anode is on Drain (preventing dead shorts)
  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_FET",
    key: "q_fet",
    pcbX: `-${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "-7.0mm"
  }));

  children.push(React.createElement(Resistor0603, {
    name: "R_GATE",
    key: "r_gate",
    pcbX: `-${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "-10.0mm"
  }));

  children.push(React.createElement(DiodeSOD123, {
    name: "D_HAP",
    key: "d_hap",
    pcbX: `${(halfW - 3.5).toFixed(2)}mm`,
    pcbY: "-6.0mm",
    pcbRotation: 180
  }));

  // 8d. High-Side LED Power Isolation (AO3401A P-MOS, AO3400A Pre-Driver, 100k Pull-Up, 10k Pull-Down)
  // Spaced with 4.5mm center-to-center distance, ensuring >1.6mm body clearance between MOSFETs
  children.push(React.createElement(SOT23_PMOSFET, {
    name: "Q_LED_PWR",
    key: "q_led_pwr",
    pcbX: "-4.5mm",
    pcbY: "-7.5mm"
  }));

  children.push(React.createElement(SOT23_MOSFET, {
    name: "Q_LED_EN",
    key: "q_led_en",
    pcbX: "0.0mm",
    pcbY: "-7.5mm"
  }));

  children.push(React.createElement(Resistor0603, {
    name: "R_LED_PU",
    key: "r_led_pu",
    pcbX: "-4.5mm",
    pcbY: "-4.5mm"
  }));

  children.push(React.createElement(Resistor0603, {
    name: "R_LED_GATE",
    key: "r_led_gate",
    pcbX: "0.0mm",
    pcbY: "-4.5mm"
  }));

  // ============================================================
  // 9. SILKSCREEN TEXT LABELS (TOP & BOTTOM LAYERS)
  // ============================================================
  const makeSilk = (key, text, x, y, layer = "top", fontSize = 0.75, align = "center", rot = 0) => {
    const props = {
      key,
      text,
      layer,
      fontSize: `${(fontSize * silkScale).toFixed(2)}mm`,
      anchorAlignment: align,
      pcbX: `${x.toFixed(2)}mm`,
      pcbY: `${y.toFixed(2)}mm`
    };
    if (rot !== 0) props.pcbRotation = rot;
    return React.createElement("silkscreentext", props);
  };

  const addSilkBoth = (id, text, x, y, fs = 0.75, align = "center", rot = 0) => {
    children.push(makeSilk(`${id}_t`, text, x, y, "top", fs, align, rot));
    children.push(makeSilk(`${id}_b`, text, x, y, "bottom", fs, align, rot));
  };

  // Top Board Identity
  children.push(makeSilk("st_title_1", "03 COMPACT AUDIO/MOTION", 0, halfL - 1.2, "top", 0.65, "center"));
  children.push(makeSilk("st_title_2", "REACTIVE CONTROLLER", 0, halfL - 2.2, "top", 0.55, "center"));
  children.push(makeSilk("st_author_t", "By Dillon Simeone", 0, -halfL + 1.2, "top", 0.65, "center"));

  // Top Main LED Header (WS2812B)
  // Pin labels placed south of pads (y = 13.9mm) to prevent collision with top title text
  addSilkBoth("st_led_name", "WS2812B (G6)", 0, 12.6, 0.55, "center");
  children.push(makeSilk("st_led_p1", "+5V", -2.54, 13.9, "top", 0.48, "center"));
  children.push(makeSilk("st_led_p2", "D", 0.0, 13.9, "top", 0.48, "center"));
  children.push(makeSilk("st_led_p3", "GND", 2.54, 13.9, "top", 0.48, "center"));

  // Left Edge Headers (Rotated 90° parallel to edge, zero pin collision)
  addSilkBoth("st_led3", "LED3 (G21)", -17.5, 6.5, 0.60, "center", 90);
  addSilkBoth("st_hap_l", "HAP_L", -17.5, -2.5, 0.60, "center", 90);

  // Right Edge Headers (Rotated 90° parallel to edge, zero pin collision)
  addSilkBoth("st_led2", "LED2 (G20)", 17.5, 6.5, 0.60, "center", 90);
  addSilkBoth("st_hap_r", "HAP_R", 17.5, -2.5, 0.60, "center", 90);
  addSilkBoth("st_sw", "POWER SW", 17.5, -10.0, 0.60, "center", 90);

  // Bottom Edge Connectors
  addSilkBoth("st_bat_name", "1S LiPo (3.7V)", 0, -14.2, 0.60, "center");
  children.push(makeSilk("st_bat_p1", "+", -1.8, -17.6, "top", 0.60, "center"));
  children.push(makeSilk("st_bat_p2", "-", 1.8, -17.6, "top", 0.60, "center"));

  // MAX4466 Analog Mic
  addSilkBoth("st_max_name", "MAX4466 (G0)", -8.5, -11.6, 0.60, "center");
  children.push(makeSilk("st_max_p1", "VCC", -11.04, -15.2, "top", 0.45, "center"));
  children.push(makeSilk("st_max_p2", "GND", -8.50, -15.2, "top", 0.45, "center"));
  children.push(makeSilk("st_max_p3", "OUT", -5.96, -15.2, "top", 0.45, "center"));

  addSilkBoth("st_inmp_name", "INMP441 (I2S)", 7.0, -8.8, 0.60, "center");

  // ============================================================
  // ALL 14 FACTORY-ASSEMBLED SMT COMPONENTS (LABELED WITH DESIGNATORS & VALUES)
  // ============================================================
  // Charger Group (Top-Left)
  children.push(makeSilk("lbl_chg", "U_CHG", -7.5, 15.9, "top", 0.55, "center"));
  children.push(makeSilk("lbl_rprog", "R_PROG 2k", -10.2, 13.4, "top", 0.50, "center"));
  children.push(makeSilk("lbl_cvin", "C_VIN 4.7u", -10.2, 17.1, "top", 0.50, "center"));
  children.push(makeSilk("lbl_cbat", "C_BAT 4.7u", -10.2, 11.8, "top", 0.50, "center"));

  // Auto Power-Path Group (Top-Right)
  // lbl_rpwr placed south of R_PWR (y = 15.1mm) to eliminate title overlay
  children.push(makeSilk("lbl_qpwr", "Q_PWR", 5.2, 11.7, "top", 0.55, "center"));
  children.push(makeSilk("lbl_rpwr", "R_PWR 100k", 5.2, 15.1, "top", 0.50, "center"));
  children.push(makeSilk("lbl_dpwr", "D_PWR", 9.8, 11.7, "top", 0.50, "center"));

  // Haptic MOSFET Driver & Flyback Clamp
  children.push(makeSilk("lbl_qfet", "Q_FET", -17.5, -7.0, "top", 0.50, "center", 90));
  children.push(makeSilk("lbl_rgate", "R_GATE 10k", -17.5, -10.0, "top", 0.45, "center", 90));
  children.push(makeSilk("lbl_dhap", "D_HAP", 17.5, -6.0, "top", 0.45, "center", 90));

  // High-Side LED Isolation Switch Cluster (Center-Bottom)
  children.push(makeSilk("lbl_qledpwr", "Q_LED_PWR", -4.5, -9.0, "top", 0.50, "center"));
  children.push(makeSilk("lbl_rledpu", "R_PU 100k", -4.5, -3.3, "top", 0.45, "center"));
  children.push(makeSilk("lbl_qleden", "Q_LED_EN", 0.0, -9.0, "top", 0.50, "center"));
  children.push(makeSilk("lbl_rledgate", "R_GATE 10k", 0.0, -3.3, "top", 0.45, "center"));

  // ESP32 Pin Labels (Top Silkscreen inside body margin)
  const c3LeftPins = ["5V", "GND", "3V3", "IO0", "IO1", "IO2", "IO3", "IO4"];
  const c3RightPins = ["IO5", "IO6", "IO7", "IO8", "IO9", "IO10", "RX", "TX"];
  for (let i = 0; i < 8; i++) {
    const yPos = mcuY + (3.5 - i) * 2.54;
    children.push(makeSilk(`st_c3_l_${i}`, c3LeftPins[i], mcuX - 7.0, yPos, "top", 0.60, "center_right"));
    children.push(makeSilk(`st_c3_r_${i}`, c3RightPins[i], mcuX + 7.0, yPos, "top", 0.60, "center_left"));
  }

  // Serious Swamp-Core Easter Egg: Shrek Long-Range Optical Programming Cavity
  const shrekStory = [
    "DEEP WITHIN THE SWAMP,",
    "SHREK EXTENDED HIS LONG,",
    "CRANIALLY-MOUNTED STALKS",
    "HIGH ABOVE THE MIRE.",
    "WITH SUB-MICRON SIGHT,",
    "COHERENT OPTICAL PULSES",
    "FLASHED THE ESP32 FIRMWARE",
    "FROM AN IMMENSE DISTANCE.",
    "SILENT. METHODICAL.",
    "SWAMP-CORE RTOS v1.0"
  ];
  shrekStory.forEach((line, idx) => {
    children.push(makeSilk(`st_shrek_${idx}`, line, -2.5, 6.2 - idx * 0.85, "top", 0.42, "center"));
  });

  // Universal IMU Pin Labels (Bottom Silkscreen)
  const imuPins = ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"];
  children.push(makeSilk("st_imu_title", "MPU-6050 / GY-521", imuX, imuY + 10.5, "bottom", 0.75, "center"));
  for (let i = 0; i < 8; i++) {
    const yPos = imuY + (3.5 - i) * 2.54;
    children.push(makeSilk(`st_imu_p_${i}`, imuPins[i], imuX + 2.4, yPos, "bottom", 0.60, "center_left"));
  }

  // Backside IMU Header Tail Insulation Caution
  children.push(makeSilk("st_imu_warn1", "INSULATE / FLUSH CUT", 0, 8.5, "bottom", 0.55, "center"));
  children.push(makeSilk("st_imu_warn2", "PINS UNDER IMU MODULE", 0, 7.3, "bottom", 0.48, "center"));

  // Bottom Silkscreen Attribution & Vector QR Code
  children.push(makeSilk("st_author_b", "By Dillon Simeone", 0, -halfL + 1.2, "bottom", 0.75, "center"));
  children.push(makeSilk("st_url_b", "dillonsimeone.com", 0, -6.5, "bottom", 0.75, "center"));

  // ============================================================
  // 10. VECTOR QR CODE ON BOTTOM SILKSCREEN
  // Links to https://dillonsimeone.com/?reason=compactAudioMotionSquarePCB
  // ============================================================
  const QR_MATRIX_33 = [
    "111111100010010111111010101111111",
    "100000101100010100101000101000001",
    "101110100101011001111010101011101",
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
    "111111101111000110001011101010010"
  ];
  const qrModSize = 0.28; // mm per module -> 33 * 0.28 = 9.24mm wide
  const qrCenterX = 0;
  const qrCenterY = 0;
  const N_QR = 33;
  const halfN = (N_QR - 1) / 2;

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

  // ============================================================
  // 11. RAT'S NEST LOGICAL NETS & TRACE ROUTING
  // ============================================================
  if (!skipRouting) {
    // IMU I2C & Interrupt
    children.push(React.createElement("trace", { from: ".U_MCU > .pin7", to: ".U_IMU > .pin3", key: "tr_scl", name: "NET_I2C_SCL", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin6", to: ".U_IMU > .pin4", key: "tr_sda", name: "NET_I2C_SDA", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin9", to: ".U_IMU > .pin8", key: "tr_imu_int", name: "NET_IMU_INT", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin3", to: ".U_IMU > .pin1", key: "tr_imu_vcc", name: "NET_3V3", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".U_IMU > .pin2", key: "tr_imu_gnd", name: "NET_GND", width: PWR }));

    // Addressable LEDs (Main GPIO 6, Aux 2 GPIO 20, Aux 3 GPIO 21)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin10", to: ".J_LED > .pin2", key: "tr_led_dat", name: "NET_LED_DATA", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin15", to: ".J_LED2 > .pin2", key: "tr_led2_dat", name: "NET_LED2_DATA", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin16", to: ".J_LED3 > .pin2", key: "tr_led3_dat", name: "NET_LED3_DATA", width: SIG }));

    // High-Side LED Power Rail (Q_LED_PWR Drain -> LED Headers Pin 1)
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED > .pin1", key: "tr_led_pwr_1", name: "NET_5V_SW", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED2 > .pin1", key: "tr_led_pwr_2", name: "NET_5V_SW", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin3", to: ".J_LED3 > .pin1", key: "tr_led_pwr_3", name: "NET_5V_SW", width: PWR }));

    // High-Side LED Switch Control (GPIO 10 -> Q_LED_EN Gate via R_LED_GATE)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin14", to: ".Q_LED_EN > .pin1", key: "tr_led_en_gate", name: "NET_LED_PWR_EN", width: SIG }));
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin1", to: ".R_LED_GATE > .pin1", key: "tr_led_rgate", name: "NET_LED_PWR_EN", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_LED_GATE > .pin2", to: ".U_MCU > .pin2", key: "tr_led_rgate_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin2", to: ".U_MCU > .pin2", key: "tr_led_en_src", name: "NET_GND", width: PWR }));

    // Q_LED_EN Drain pulls Q_LED_PWR Gate LOW to turn on LEDs
    children.push(React.createElement("trace", { from: ".Q_LED_EN > .pin3", to: ".Q_LED_PWR > .pin1", key: "tr_led_pmos_gate", name: "NET_LED_GATE_CTRL", width: SIG }));
    children.push(React.createElement("trace", { from: ".Q_LED_PWR > .pin1", to: ".R_LED_PU > .pin1", key: "tr_led_rpu_gate", name: "NET_LED_GATE_CTRL", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_LED_PU > .pin2", to: ".Q_LED_PWR > .pin2", key: "tr_led_rpu_src", name: "NET_VSYS", width: PWR }));

    // Haptic Driver (GPIO 7 PWM -> Q_FET Gate)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin11", to: ".Q_FET > .pin1", key: "tr_hap_pwm", name: "NET_HAPTIC_PWM", width: SIG }));
    children.push(React.createElement("trace", { from: ".Q_FET > .pin1", to: ".R_GATE > .pin1", key: "tr_r_gate_pin1", name: "NET_HAPTIC_PWM", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_GATE > .pin2", to: ".U_MCU > .pin2", key: "tr_r_gate_pin2", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_FET > .pin2", to: ".U_MCU > .pin2", key: "tr_fet_src_gnd", name: "NET_GND", width: PWR }));

    // Q_FET Drain to Haptic Outputs (Pin 2: MTR_NEG) and Flyback Diode Anode (Pin 2)
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".J_HAP_L > .pin2", key: "tr_fet_drain_hap_l", name: "NET_HAP_DRIVE", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".J_HAP_R > .pin2", key: "tr_fet_drain_hap_r", name: "NET_HAP_DRIVE", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_FET > .pin3", to: ".D_HAP > .pin2", key: "tr_fet_drain_diode", name: "NET_HAP_DRIVE", width: PWR }));

    // Inductive Flyback Diode Cathode (Pin 1) clamped to VSYS rail
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".J_HAP_L > .pin1", key: "tr_diode_cath_hap_l", name: "NET_VSYS", width: PWR }));
    children.push(React.createElement("trace", { from: ".D_HAP > .pin1", to: ".J_HAP_R > .pin1", key: "tr_diode_cath_hap_r", name: "NET_VSYS", width: PWR }));

    // Microphones
    // MAX4466 Analog Mic (GPIO 0 ADC1_CH0 -> OUT pin3)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin4", to: ".J_MIC_MAX > .pin3", key: "tr_mic_adc", name: "NET_MIC_ADC", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin3", to: ".J_MIC_MAX > .pin1", key: "tr_mic_3v3", name: "NET_3V3", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_MIC_MAX > .pin2", key: "tr_mic_gnd", name: "NET_GND", width: PWR }));

    // INMP441 Digital I2S Mic (GPIO 1: WS, GPIO 4: SCK, GPIO 8: SD)
    children.push(React.createElement("trace", { from: ".U_MCU > .pin5", to: ".J_MIC_INMP > .pin2", key: "tr_i2s_ws", name: "NET_I2S_WS", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin8", to: ".J_MIC_INMP > .pin1", key: "tr_i2s_sck", name: "NET_I2S_SCK", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin12", to: ".J_MIC_INMP > .pin4", key: "tr_i2s_sd", name: "NET_MIC_SD", width: SIG }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin3", to: ".J_MIC_INMP > .pin5", key: "tr_i2s_vcc", name: "NET_3V3", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_MCU > .pin2", to: ".J_MIC_INMP > .pin6", key: "tr_i2s_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".J_MIC_INMP > .pin6", to: ".J_MIC_INMP > .pin3", key: "tr_i2s_lr_gnd", name: "NET_GND", width: SIG }));

    // LiPo Charger Subsystem
    children.push(React.createElement("trace", { from: ".U_MCU > .pin1", to: ".U_CHG > .pin4", key: "tr_chg_vin", name: "NET_VBUS", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin4", to: ".C_VIN > .pin1", key: "tr_cvin_pos", name: "NET_VBUS", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_VIN > .pin2", to: ".U_CHG > .pin2", key: "tr_cvin_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin5", to: ".R_PROG > .pin1", key: "tr_prog_r", name: "NET_CHG_PROG", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_PROG > .pin2", to: ".U_CHG > .pin2", key: "tr_prog_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin3", to: ".C_BAT > .pin1", key: "tr_cbat_pos", name: "NET_VBAT", width: PWR }));
    children.push(React.createElement("trace", { from: ".C_BAT > .pin2", to: ".U_CHG > .pin2", key: "tr_cbat_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin3", to: ".J_BAT > .pin1", key: "tr_vbat_trace", name: "NET_VBAT", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin2", to: ".J_BAT > .pin2", key: "tr_gnd_trace", name: "NET_GND", width: PWR }));

    // Power Path & External Switch
    children.push(React.createElement("trace", { from: ".J_BAT > .pin1", to: ".SW_EXT > .pin1", key: "tr_sw_in", name: "NET_VBAT", width: PWR }));
    children.push(React.createElement("trace", { from: ".SW_EXT > .pin2", to: ".Q_PWR > .pin3", key: "tr_pwr_pmos_d", name: "NET_VBAT_SW", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_PWR > .pin2", to: ".D_HAP > .pin1", key: "tr_pwr_pmos_s", name: "NET_VSYS", width: PWR }));
    children.push(React.createElement("trace", { from: ".U_CHG > .pin4", to: ".D_PWR > .pin2", key: "tr_d_pwr_a", name: "NET_VBUS", width: PWR }));
    children.push(React.createElement("trace", { from: ".D_PWR > .pin1", to: ".Q_PWR > .pin2", key: "tr_d_pwr_k", name: "NET_VSYS", width: PWR }));
    children.push(React.createElement("trace", { from: ".Q_PWR > .pin1", to: ".R_PWR > .pin1", key: "tr_r_pwr_g", name: "NET_VBUS", width: SIG }));
    children.push(React.createElement("trace", { from: ".R_PWR > .pin2", to: ".U_CHG > .pin2", key: "tr_r_pwr_gnd", name: "NET_GND", width: PWR }));
    children.push(React.createElement("trace", { from: ".D_PWR > .pin2", to: ".Q_PWR > .pin1", key: "tr_pwr_gate_vbus", name: "NET_VBUS", width: SIG }));
  }

  const boardConfig = boardProps(boardWidth, boardLength, routing, { skipRouting });
  const boardElement = React.createElement("board", {
    name: "main_board",
    key: "board",
    ...boardConfig
  }, ...children);

  circuit.add(boardElement);
  console.log(`[Circuit 03 Profiling] circuit.add() finished in ${(performance.now() - t0).toFixed(1)}ms`);

  const tRender = performance.now();
  try {
    await circuit.renderUntilSettled();
    console.log(`[Circuit 03 Profiling] renderUntilSettled() took ${(performance.now() - tRender).toFixed(1)}ms`);
  } catch (err) {
    console.warn(`[Circuit 03 Warning] renderUntilSettled encountered non-fatal autorouting notice:`, err?.message || err);
  }

  // Trace Boundary Guard: Clamp all trace routes strictly within board outline and populate x/y for through_pad
  const margin = 0.5;
  const maxBoardX = halfW - margin;
  const minBoardX = -halfW + margin;
  const maxBoardY = halfL - margin;
  const minBoardY = -halfL + margin;

  const circuitJson = circuit.getCircuitJson();
  circuitJson.forEach(item => {
    if (item.type === "pcb_via") {
      if (typeof item.hole_diameter !== "number" || item.hole_diameter < 0.20) item.hole_diameter = 0.20;
      if (typeof item.outer_diameter !== "number" || item.outer_diameter < 0.45) item.outer_diameter = 0.45;
    }
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      item.route.forEach(pt => {
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
      } catch (err) {
        console.warn("[Gerber Export] Could not dynamically load JSZip:", err);
      }
    }

    if (JSZipClass) {
      const zip = new JSZipClass();
      Object.entries(layers).forEach(([layerName, content]) => {
        let filename = `compactAudioMotionSquare_${layerName}.gbr`;
        if (layerName.includes("F_Cu")) filename = "compactAudioMotionSquare_TopCopper.gtl";
        else if (layerName.includes("B_Cu")) filename = "compactAudioMotionSquare_BottomCopper.gbl";
        else if (layerName.includes("F_SilkScreen")) filename = "compactAudioMotionSquare_TopSilkscreen.gto";
        else if (layerName.includes("B_SilkScreen")) filename = "compactAudioMotionSquare_BottomSilkscreen.gbo";
        else if (layerName.includes("F_Mask")) filename = "compactAudioMotionSquare_TopSolderMask.gts";
        else if (layerName.includes("B_Mask")) filename = "compactAudioMotionSquare_BottomSolderMask.gbs";
        else if (layerName.includes("F_Paste")) filename = "compactAudioMotionSquare_TopPaste.gtp";
        else if (layerName.includes("B_Paste")) filename = "compactAudioMotionSquare_BottomPaste.gbp";
        else if (layerName.includes("Edge_Cuts")) {
          filename = "compactAudioMotionSquare_EdgeCuts.gko";
          zip.file("compactAudioMotionSquare_BoardOutline.gml", content);
        }
        zip.file(filename, content);
      });
      if (drill) zip.file("compactAudioMotionSquare_Drill.drl", drill);
      gerberZipBlob = await zip.generateAsync({ type: "blob" });
    }
  } catch (err) {
    console.warn("[Gerber Export Warning]:", err);
  }

  let easyEdaZipBlob = null;
  try {
    const { createEasyEdaZipBlob } = await import("../../shared/export-utils.js");
    easyEdaZipBlob = await createEasyEdaZipBlob(circuitJson, { projectName: "03_compactSquareLedHapticPCB" });
  } catch (err) {
    console.warn("[EasyEDA Export Warning]:", err);
  }

  // 1-to-1 BOM & CPL Parity: Exactly 14 factory-assembled SMT parts
  // Comments use standard concise electrical values (10k, 100k, 4.7uF) for 1-click JLCPCB replacement searching
  const smtComponents = [
    { designator: "U_CHG", comment: "TP4054", footprint: "SOT-23-5", lcsc: "C382138", qty: 1 },
    { designator: "Q_FET", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "Q_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "D_PWR", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "D_HAP", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1 },
    { designator: "R_PROG", comment: "2k", footprint: "0603", lcsc: "C22975", qty: 1 },
    { designator: "R_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 },
    { designator: "R_PWR", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "C_VIN", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1 },
    { designator: "C_BAT", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1 },
    { designator: "Q_LED_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1 },
    { designator: "R_LED_PU", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1 },
    { designator: "Q_LED_EN", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1 },
    { designator: "R_LED_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1 }
  ];

  bomCsv = "Designator,Comment,Footprint,LCSC Part #,Quantity\n" +
    smtComponents.map(c => `"${c.designator}","${c.comment}","${c.footprint}","${c.lcsc}",${c.qty}`).join("\n");

  const cplRows = [];
  cplRows.push("Designator,Mid X,Mid Y,Layer,Rotation");
  const bWidth = boardParams.boardWidth || 38;
  const smtPosMap = {
    U_CHG: { x: -7.5, y: 14.6, rot: 0, layer: "Top" },
    R_PROG: { x: -10.2, y: 14.6, rot: 0, layer: "Top" },
    C_VIN: { x: -7.5, y: 17.1, rot: 0, layer: "Top" },
    C_BAT: { x: -7.5, y: 11.8, rot: 0, layer: "Top" },
    Q_PWR: { x: 5.2, y: 13.5, rot: 270, layer: "Top" },
    D_PWR: { x: 9.8, y: 13.5, rot: 0, layer: "Top" },
    R_PWR: { x: 5.2, y: 16.5, rot: 0, layer: "Top" },
    Q_FET: { x: -(bWidth / 2 - 3.5), y: -7.0, rot: 270, layer: "Top" },
    R_GATE: { x: -(bWidth / 2 - 3.5), y: -10.0, rot: 0, layer: "Top" },
    D_HAP: { x: (bWidth / 2 - 3.5), y: -6.0, rot: 180, layer: "Top" },
    Q_LED_PWR: { x: -4.5, y: -7.5, rot: 270, layer: "Top" },
    Q_LED_EN: { x: 0.0, y: -7.5, rot: 270, layer: "Top" },
    R_LED_PU: { x: -4.5, y: -4.5, rot: 0, layer: "Top" },
    R_LED_GATE: { x: 0.0, y: -4.5, rot: 0, layer: "Top" }
  };

  smtComponents.forEach(c => {
    const pos = smtPosMap[c.designator] || { x: 0, y: 0, rot: 0, layer: "Top" };
    cplRows.push(`"${c.designator}","${pos.x.toFixed(2)}mm","${pos.y.toFixed(2)}mm","${pos.layer}",${pos.rot}`);
  });
  pnpCsv = cplRows.join("\n");

  return {
    drc,
    gerberZipBlob,
    easyEdaZipBlob,
    bomCsv,
    pnpCsv
  };
}
