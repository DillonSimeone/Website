import { Circuit, React } from "../../00-commonParts/tscircuit-core.js";
import {
  createGerberZipBlob,
  createBomCsv
} from "../../shared/export-utils.js";
import {
  loadLayoutJson,
  getComponentProps,
  emitLayoutSilkscreen,
  tagCircuitJsonSilkscreenIds,
  createSyncedCplCsv
} from "../../shared/layout-loader.js";
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

/**
 * Programmatically builds the Compact Dense Square Audio & Motion Reactive Controller PCB (03).
 * Physical component coordinates, tethered JLCPCB polarity markers, and >= 0.80mm legible silkscreen
 * are driven by declarative `src/layout.json`.
 */
export async function compileCircuit(params = {}) {
  const layout = params.layout || await loadLayoutJson(import.meta.url, "./layout.json");
  const {
    boardWidth = layout?.board?.width || 38,
    boardLength = layout?.board?.length || 38,
    routing = {},
    skipRouting = true,
    silkScale = 1.0
  } = params;

  normalizeRouting(routing);
  const PWR = "0.22mm";
  const SIG = "0.16mm";

  const circuit = new Circuit({
    platform: {
      routingDisabled: skipRouting
    }
  });
  circuit.__layout = layout;

  const children = [];
  const halfL = boardLength / 2;
  const halfW = boardWidth / 2;

  // ============================================================
  // 0. M3 CORNER MOUNTING HOLES (Driven by layout.json)
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
    const p = getComponentProps(layout, h.name, { x: h.x, y: h.y, key: h.key });
    const holeDia = p.entry.holeDiameter || 3.2;
    const outerDia = p.entry.outerDiameter || 4.8;
    children.push(React.createElement("platedhole", {
      key: h.key,
      name: h.name,
      portHints: [h.name],
      pcbX: `${p.x.toFixed(2)}mm`,
      pcbY: `${p.y.toFixed(2)}mm`,
      holeDiameter: `${holeDia}mm`,
      outerDiameter: `${outerDia}mm`,
      shape: "circle"
    }));
  });

  // ============================================================
  // 1-7. MODULES & PERIPHERAL HEADERS (Driven by layout.json)
  // ============================================================
  children.push(React.createElement(ESP32C3_SuperMini, getComponentProps(layout, "U_MCU", { x: -2.5, y: 1.5, key: "u_mcu" }).pcbProps));
  children.push(React.createElement(UniversalIMU_8Pin, getComponentProps(layout, "U_IMU", { x: 9.0, y: 1.5, key: "u_imu" }).pcbProps));

  children.push(React.createElement(LEDOutputHeader, getComponentProps(layout, "J_LED", { x: 0.0, y: halfL - 3.5, key: "j_led" }).pcbProps));
  children.push(React.createElement(LEDOutputHeader, getComponentProps(layout, "J_LED2", { x: halfW - 3.5, y: 6.5, rotation: 90, key: "j_led2" }).pcbProps));
  children.push(React.createElement(LEDOutputHeader, getComponentProps(layout, "J_LED3", { x: -(halfW - 3.5), y: 6.5, rotation: 90, key: "j_led3" }).pcbProps));

  children.push(React.createElement(HapticMotorOutput, getComponentProps(layout, "J_HAP_L", { x: -(halfW - 3.5), y: -2.5, key: "j_hap_l" }).pcbProps));
  children.push(React.createElement(HapticMotorOutput, getComponentProps(layout, "J_HAP_R", { x: halfW - 3.5, y: -2.5, key: "j_hap_r" }).pcbProps));

  children.push(React.createElement(MAX4466_Header, getComponentProps(layout, "J_MIC_MAX", { x: -8.5, y: -13.5, key: "j_mic_max" }).pcbProps));
  children.push(React.createElement(INMP441_DualRow_Header, getComponentProps(layout, "J_MIC_INMP", { x: 7.0, y: -11.5, key: "j_mic_inmp" }).pcbProps));

  children.push(React.createElement(ExternalSwitchPads, getComponentProps(layout, "SW_EXT", { x: 14.8, y: -10.0, rotation: 90, key: "sw_ext" }).pcbProps));
  children.push(React.createElement(BatteryPads, getComponentProps(layout, "J_BAT", { x: -2.0, y: -16.0, key: "j_bat" }).pcbProps));

  // ============================================================
  // 8. FACTORY-ASSEMBLED TURNKEY SMT COMPONENTS (14 PARTS)
  // ============================================================
  children.push(React.createElement(SOT23_5_Charger, getComponentProps(layout, "U_CHG", { x: -7.5, y: 14.6, key: "u_chg" }).pcbProps));
  children.push(React.createElement(Resistor0603, getComponentProps(layout, "R_PROG", { x: -10.2, y: 14.6, key: "r_prog" }).pcbProps));
  children.push(React.createElement(Capacitor0603, getComponentProps(layout, "C_VIN", { x: -7.5, y: 17.1, key: "c_vin" }).pcbProps));
  children.push(React.createElement(Capacitor0603, getComponentProps(layout, "C_BAT", { x: -7.5, y: 11.8, key: "c_bat" }).pcbProps));

  children.push(React.createElement(SOT23_PMOSFET, getComponentProps(layout, "Q_PWR", { x: 5.2, y: 13.5, key: "q_pwr" }).pcbProps));
  children.push(React.createElement(DiodeSOD123, getComponentProps(layout, "D_PWR", { x: 9.8, y: 13.5, key: "d_pwr" }).pcbProps));
  children.push(React.createElement(Resistor0603, getComponentProps(layout, "R_PWR", { x: 5.2, y: 16.5, key: "r_pwr" }).pcbProps));

  children.push(React.createElement(SOT23_MOSFET, getComponentProps(layout, "Q_FET", { x: -(halfW - 3.5), y: -7.0, key: "q_fet" }).pcbProps));
  children.push(React.createElement(Resistor0603, getComponentProps(layout, "R_GATE", { x: -(halfW - 3.5), y: -10.0, key: "r_gate" }).pcbProps));
  children.push(React.createElement(DiodeSOD123, getComponentProps(layout, "D_HAP", { x: halfW - 3.5, y: -6.0, rotation: 180, key: "d_hap" }).pcbProps));

  children.push(React.createElement(SOT23_PMOSFET, getComponentProps(layout, "Q_LED_PWR", { x: -4.5, y: -7.5, key: "q_led_pwr" }).pcbProps));
  children.push(React.createElement(SOT23_MOSFET, getComponentProps(layout, "Q_LED_EN", { x: 0.0, y: -7.5, key: "q_led_en" }).pcbProps));
  children.push(React.createElement(Resistor0603, getComponentProps(layout, "R_LED_PU", { x: -4.5, y: -4.5, key: "r_led_pu" }).pcbProps));
  children.push(React.createElement(Resistor0603, getComponentProps(layout, "R_LED_GATE", { x: 0.0, y: -4.5, key: "r_led_gate" }).pcbProps));

  // ============================================================
  // 9. SILKSCREEN & TETHERED POLARITY MARKERS (Driven by layout.json)
  // ============================================================
  const silkMeta = emitLayoutSilkscreen(React, layout, { silkScale });
  children.push(...silkMeta.elements);

  // ============================================================
  // 10. VECTOR QR CODE ON BOTTOM SILKSCREEN
  // Centered in backside cavity at (-2.5, 0.8) with full clearance from U_MCU pins
  // ============================================================
  const qrModSize = 0.28; // 33 * 0.28 = 9.24mm square
  const qrCenterX = layout?.qr?.x ?? -2.5;
  const qrCenterY = layout?.qr?.y ?? 0.8;
  const N_QR = 33;
  const halfN = (N_QR - 1) / 2;

  let qrPathIdx = 0;
  const qrIds = [];
  if (layout?.qr?.visible !== false) {
    for (let r = 0; r < N_QR; r++) {
      const y = +(qrCenterY + (halfN - r) * qrModSize).toFixed(3);
      const rowStr = QR_MATRIX_33[r];
      let c = 0;
      while (c < N_QR) {
        if (rowStr[c] === "1") {
          const startC = c;
          while (c < N_QR && rowStr[c] === "1") c++;
          const endC = c - 1;
          const x1 = +(qrCenterX + (startC - halfN) * qrModSize).toFixed(3);
          const x2 = +(qrCenterX + (endC - halfN) * qrModSize).toFixed(3);
          const qId = `qr_p_${qrPathIdx++}`;
          qrIds.push(qId);
          children.push(React.createElement("silkscreenpath", {
            key: qId,
            layer: "bottom",
            route: [{ x: x1, y }, { x: x2, y }],
            strokeWidth: `${qrModSize}mm`
          }));
        } else {
          c++;
        }
      }
    }
  }

  // ============================================================
  // 11. RAT'S NEST LOGICAL NETS & TRACE ROUTING
  // ============================================================
  const addTrace = (from, to, key, net, width) => {
    children.push(React.createElement("trace", {
      from,
      to,
      key,
      name: `${net}__${key}`,
      width
    }));
  };

  // IMU I2C & Interrupt
  addTrace(".U_MCU > .pin7", ".U_IMU > .pin3", "tr_scl", "NET_I2C_SCL", SIG);
  addTrace(".U_MCU > .pin6", ".U_IMU > .pin4", "tr_sda", "NET_I2C_SDA", SIG);
  addTrace(".U_MCU > .pin9", ".U_IMU > .pin8", "tr_imu_int", "NET_IMU_INT", SIG);
  addTrace(".U_MCU > .pin3", ".U_IMU > .pin1", "tr_imu_vcc", "NET_3V3", PWR);
  addTrace(".U_MCU > .pin2", ".U_IMU > .pin2", "tr_imu_gnd", "NET_GND", PWR);

  // Addressable LEDs (Main GPIO 6, Aux 2 GPIO 20, Aux 3 GPIO 21)
  addTrace(".U_MCU > .pin10", ".J_LED > .pin2", "tr_led_dat", "NET_LED_DATA", SIG);
  addTrace(".U_MCU > .pin15", ".J_LED2 > .pin2", "tr_led2_dat", "NET_LED2_DATA", SIG);
  addTrace(".U_MCU > .pin16", ".J_LED3 > .pin2", "tr_led3_dat", "NET_LED3_DATA", SIG);

  // High-Side LED Power Rail (Q_LED_PWR Drain -> LED Headers Pin 1)
  addTrace(".Q_LED_PWR > .pin3", ".J_LED > .pin1", "tr_led_pwr_1", "NET_5V_SW", PWR);
  addTrace(".Q_LED_PWR > .pin3", ".J_LED2 > .pin1", "tr_led_pwr_2", "NET_5V_SW", PWR);
  addTrace(".Q_LED_PWR > .pin3", ".J_LED3 > .pin1", "tr_led_pwr_3", "NET_5V_SW", PWR);

  // LED Ground Return Rails (J_LED Headers Pin 3 -> System GND)
  addTrace(".U_MCU > .pin2", ".J_LED > .pin3", "tr_led_gnd_1", "NET_GND", PWR);
  addTrace(".U_MCU > .pin2", ".J_LED2 > .pin3", "tr_led_gnd_2", "NET_GND", PWR);
  addTrace(".U_MCU > .pin2", ".J_LED3 > .pin3", "tr_led_gnd_3", "NET_GND", PWR);

  // High-Side LED Switch Control (GPIO 10 -> Q_LED_EN Gate via R_LED_GATE)
  addTrace(".U_MCU > .pin14", ".Q_LED_EN > .pin1", "tr_led_en_gate", "NET_LED_PWR_EN", SIG);
  addTrace(".Q_LED_EN > .pin1", ".R_LED_GATE > .pin1", "tr_led_rgate", "NET_LED_PWR_EN", SIG);
  addTrace(".R_LED_GATE > .pin2", ".U_MCU > .pin2", "tr_led_rgate_gnd", "NET_GND", PWR);
  addTrace(".Q_LED_EN > .pin2", ".U_MCU > .pin2", "tr_led_en_src", "NET_GND", PWR);

  // Q_LED_EN Drain pulls Q_LED_PWR Gate LOW to turn on LEDs
  addTrace(".Q_LED_EN > .pin3", ".Q_LED_PWR > .pin1", "tr_led_pmos_gate", "NET_LED_GATE_CTRL", SIG);
  addTrace(".Q_LED_PWR > .pin1", ".R_LED_PU > .pin1", "tr_led_rpu_gate", "NET_LED_GATE_CTRL", SIG);
  addTrace(".R_LED_PU > .pin2", ".Q_LED_PWR > .pin2", "tr_led_rpu_src", "NET_VSYS", PWR);

  // Haptic Driver (GPIO 7 PWM -> Q_FET Gate)
  addTrace(".U_MCU > .pin11", ".Q_FET > .pin1", "tr_hap_pwm", "NET_HAPTIC_PWM", SIG);
  addTrace(".Q_FET > .pin1", ".R_GATE > .pin1", "tr_r_gate_pin1", "NET_HAPTIC_PWM", SIG);
  addTrace(".R_GATE > .pin2", ".U_MCU > .pin2", "tr_r_gate_pin2", "NET_GND", PWR);
  addTrace(".Q_FET > .pin2", ".U_MCU > .pin2", "tr_fet_src_gnd", "NET_GND", PWR);

  // Q_FET Drain to Haptic Outputs (Pin 2: MTR_NEG) and Flyback Diode Anode (Pin 2)
  addTrace(".Q_FET > .pin3", ".J_HAP_L > .pin2", "tr_fet_drain_hap_l", "NET_HAP_DRIVE", PWR);
  addTrace(".Q_FET > .pin3", ".J_HAP_R > .pin2", "tr_fet_drain_hap_r", "NET_HAP_DRIVE", PWR);
  addTrace(".Q_FET > .pin3", ".D_HAP > .pin2", "tr_fet_drain_diode", "NET_HAP_DRIVE", PWR);

  // Inductive Flyback Diode Cathode (Pin 1) clamped to VSYS rail
  addTrace(".D_HAP > .pin1", ".J_HAP_L > .pin1", "tr_diode_cath_hap_l", "NET_VSYS", PWR);
  addTrace(".D_HAP > .pin1", ".J_HAP_R > .pin1", "tr_diode_cath_hap_r", "NET_VSYS", PWR);

  // Microphones
  addTrace(".U_MCU > .pin4", ".J_MIC_MAX > .pin3", "tr_mic_adc", "NET_MIC_ADC", SIG);
  addTrace(".U_MCU > .pin3", ".J_MIC_MAX > .pin1", "tr_mic_3v3", "NET_3V3", PWR);
  addTrace(".U_MCU > .pin2", ".J_MIC_MAX > .pin2", "tr_mic_gnd", "NET_GND", PWR);

  addTrace(".U_MCU > .pin5", ".J_MIC_INMP > .pin2", "tr_i2s_ws", "NET_I2S_WS", SIG);
  addTrace(".U_MCU > .pin8", ".J_MIC_INMP > .pin1", "tr_i2s_sck", "NET_I2S_SCK", SIG);
  addTrace(".U_MCU > .pin12", ".J_MIC_INMP > .pin4", "tr_i2s_sd", "NET_MIC_SD", SIG);
  addTrace(".U_MCU > .pin3", ".J_MIC_INMP > .pin5", "tr_i2s_vcc", "NET_3V3", PWR);
  addTrace(".U_MCU > .pin2", ".J_MIC_INMP > .pin6", "tr_i2s_gnd", "NET_GND", PWR);
  addTrace(".J_MIC_INMP > .pin6", ".J_MIC_INMP > .pin3", "tr_i2s_lr_gnd", "NET_GND", SIG);

  // LiPo Charger Subsystem
  addTrace(".U_MCU > .pin1", ".U_CHG > .pin4", "tr_chg_vin", "NET_VBUS", PWR);
  addTrace(".U_CHG > .pin4", ".C_VIN > .pin1", "tr_cvin_pos", "NET_VBUS", PWR);
  addTrace(".C_VIN > .pin2", ".U_CHG > .pin2", "tr_cvin_gnd", "NET_GND", PWR);
  addTrace(".U_CHG > .pin5", ".R_PROG > .pin1", "tr_prog_r", "NET_CHG_PROG", SIG);
  addTrace(".R_PROG > .pin2", ".U_CHG > .pin2", "tr_prog_gnd", "NET_GND", PWR);
  addTrace(".U_CHG > .pin3", ".C_BAT > .pin1", "tr_cbat_pos", "NET_VBAT", PWR);
  addTrace(".C_BAT > .pin2", ".U_CHG > .pin2", "tr_cbat_gnd", "NET_GND", PWR);
  addTrace(".U_CHG > .pin3", ".J_BAT > .pin1", "tr_vbat_trace", "NET_VBAT", PWR);
  addTrace(".U_CHG > .pin2", ".J_BAT > .pin2", "tr_gnd_trace", "NET_GND", PWR);

  // Power Path & External Switch
  addTrace(".J_BAT > .pin1", ".SW_EXT > .pin1", "tr_sw_in", "NET_VBAT", PWR);
  addTrace(".SW_EXT > .pin2", ".Q_PWR > .pin3", "tr_pwr_pmos_d", "NET_VBAT_SW", PWR);
  addTrace(".Q_PWR > .pin2", ".D_HAP > .pin1", "tr_pwr_pmos_s", "NET_VSYS", PWR);
  addTrace(".U_CHG > .pin4", ".D_PWR > .pin2", "tr_d_pwr_a", "NET_VBUS", PWR);
  addTrace(".D_PWR > .pin1", ".Q_PWR > .pin2", "tr_d_pwr_k", "NET_VSYS", PWR);
  addTrace(".Q_PWR > .pin1", ".R_PWR > .pin1", "tr_r_pwr_g", "NET_VBUS", SIG);
  addTrace(".R_PWR > .pin2", ".U_CHG > .pin2", "tr_r_pwr_gnd", "NET_GND", PWR);
  addTrace(".D_PWR > .pin2", ".Q_PWR > .pin1", "tr_pwr_gate_vbus", "NET_VBUS", SIG);

  const boardConfig = boardProps(boardWidth, boardLength, routing, { skipRouting });
  const boardElement = React.createElement("board", {
    name: "main_board",
    key: "board",
    ...boardConfig
  }, ...children);

  circuit.add(boardElement);

  try {
    await circuit.renderUntilSettled();
  } catch (err) {
    console.warn("[Circuit 03 Warning] renderUntilSettled encountered non-fatal autorouting notice:", err?.message || err);
  }

  const margin = 0.5;
  const maxBoardX = halfW - margin;
  const minBoardX = -halfW + margin;
  const maxBoardY = halfL - margin;
  const minBoardY = -halfL + margin;

  const circuitJson = circuit.getCircuitJson();
  tagCircuitJsonSilkscreenIds(circuitJson, silkMeta);
  const allPaths = circuitJson.filter(e => e.type === "pcb_silkscreen_path");
  qrIds.forEach((qId, idx) => {
    const p = allPaths[silkMeta.pathMeta.length + idx];
    if (p) p.editor_id = qId;
  });

  circuitJson.forEach(item => {
    if (item.type === "pcb_via") {
      if (typeof item.hole_diameter !== "number" || item.hole_diameter < 0.20) item.hole_diameter = 0.20;
      if (typeof item.outer_diameter !== "number" || item.outer_diameter < 0.45) item.outer_diameter = 0.45;
    }
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
 * Builds Gerber, Excellon drill files, and 1-to-1 BOM/CPL exports synchronized directly from layout.json.
 */
export async function generateManufacturingArtifacts(circuit, boardParams = {}) {
  let circuitJson = circuit.getCircuitJson();
  const layout = boardParams.layout || circuit.__layout || await loadLayoutJson(import.meta.url, "./layout.json");
  const silkScale = boardParams.silkScale || 1.0;

  if (silkScale !== 1.0) {
    circuitJson = circuitJson.map(item => {
      if (item.type === "pcb_silkscreen_text" && typeof item.font_size === "number") {
        return { ...item, font_size: +(item.font_size * silkScale).toFixed(2) };
      }
      return item;
    });
  }

  const drc = runManufacturingDrc(circuitJson, boardParams.routing, {
    boardWidth: boardParams.boardWidth || layout?.board?.width || 38,
    boardHeight: boardParams.boardLength || layout?.board?.length || 38,
    layout,
    auditSilkscreen: true
  });

  let gerberZipBlob = null;
  try {
    gerberZipBlob = await createGerberZipBlob(circuitJson, {
      projectName: "03_compactSquareLedHapticPCB",
      prefix: "compactSquare"
    });
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
  // SOT-23 MOSFETs (AO3400A/AO3401A) have jlcRotOffset = 270 per SKILL.md Section 3.2
  const smtComponents = [
    { designator: "U_CHG", comment: "TP4054", footprint: "SOT-23-5", lcsc: "C382138", qty: 1, jlcRotOffset: 0 },
    { designator: "Q_FET", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1, jlcRotOffset: 270 },
    { designator: "Q_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1, jlcRotOffset: 270 },
    { designator: "D_PWR", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1, jlcRotOffset: 0 },
    { designator: "D_HAP", comment: "B5819W", footprint: "SOD-123", lcsc: "C8598", qty: 1, jlcRotOffset: 0 },
    { designator: "R_PROG", comment: "2k", footprint: "0603", lcsc: "C22975", qty: 1, jlcRotOffset: 0 },
    { designator: "R_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1, jlcRotOffset: 0 },
    { designator: "R_PWR", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1, jlcRotOffset: 0 },
    { designator: "C_VIN", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1, jlcRotOffset: 0 },
    { designator: "C_BAT", comment: "4.7uF", footprint: "0603", lcsc: "C19666", qty: 1, jlcRotOffset: 0 },
    { designator: "Q_LED_PWR", comment: "AO3401A", footprint: "SOT-23", lcsc: "C15127", qty: 1, jlcRotOffset: 270 },
    { designator: "R_LED_PU", comment: "100k", footprint: "0603", lcsc: "C25803", qty: 1, jlcRotOffset: 0 },
    { designator: "Q_LED_EN", comment: "AO3400A", footprint: "SOT-23", lcsc: "C20917", qty: 1, jlcRotOffset: 270 },
    { designator: "R_LED_GATE", comment: "10k", footprint: "0603", lcsc: "C25804", qty: 1, jlcRotOffset: 0 }
  ];

  const bomCsv = createBomCsv(smtComponents);
  const pnpCsv = createSyncedCplCsv(layout, smtComponents);

  return {
    drc,
    circuitJson,
    layout,
    gerberZipBlob,
    easyEdaZipBlob,
    bomCsv,
    pnpCsv
  };
}
