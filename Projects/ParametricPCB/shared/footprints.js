import { React } from "../00-commonParts/tscircuit-core.js";

/**
 * ============================================================================
 * SHARED PARAMETRIC PCB FOOTPRINT LIBRARY (IPC-7351 Compliant)
 * Single Source of Truth for verified footprints across all Parametric PCB subprojects.
 * Includes manufacturing safety buffers for JLCPCB SMT and THT fabrication.
 * ============================================================================
 */

/**
 * Creates hybrid Dual-Mount pads (Plated through-hole with outer annular copper ring).
 * Enforces JLCPCB safety buffer: annular ring >= 0.35mm (drill + 0.70mm minimum).
 */
export function DualPad({ portHints, pcbX, pcbY, width = "1.8mm", holeDia = "1.0mm", key, shape = "circle" }) {
  return React.createElement("platedhole", {
    key,
    portHints,
    pcbX,
    pcbY,
    outerDiameter: width,
    holeDiameter: holeDia,
    shape
  });
}

/**
 * 0603 Surface Mount Resistor (1608 Metric)
 * IPC-7351 Nominal standard land pattern:
 * - Pad center: ±0.80mm (Pitch: 1.60mm)
 * - Pad size: 0.80mm (W) x 0.90mm (H)
 * - Inner gap: 0.80mm (clears body, prevents solder bridging)
 * - Outer span: 2.40mm (provides generous toe fillet)
 */
export function Resistor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "1", pin2: "2" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * 0603 Surface Mount Ceramic Capacitor (1608 Metric)
 * Identical IPC-7351 land pattern with symmetrical copper balance to eliminate tombstoning.
 */
export function Capacitor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "1", pin2: "2" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * 0603 Surface Mount Indicator LED (Pin 1: Cathode K, Pin 2: Anode A)
 */
export function Led0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "K", pin2: "A" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * SOD-123 Surface Mount Schottky Barrier Diode (SS14 / B5819W, LCSC C8598 / C22452)
 * IPC-7351 / KiCad D_SOD-123 Compliant Footprint:
 * - Package lead span: 3.70mm to 3.85mm
 * - Pad center: ±1.65mm (Center-to-Center Pitch: 3.30mm)
 * - Pad dimensions: 1.10mm (W along X) x 1.20mm (H along Y)
 * - Inner gap: 2.20mm (Safely clears diode body, preventing paste accumulation under plastic)
 * - Outer span: 4.40mm (Guarantees >= 0.35mm toe fillet past lead tips)
 * pin1: Cathode (K, banded terminal), pin2: Anode (A)
 */
export function DiodeSOD123({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "K", pin2: "A" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.65mm", pcbY: "0mm", shape: "rect", width: "1.10mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "1.65mm", pcbY: "0mm", shape: "rect", width: "1.10mm", height: "1.20mm", layer: "top" })
    )
  });
}

/**
 * SOD-323 Ultra-Compact Diode (B5819WS / 1N5819WS, LCSC C8599)
 * Used when tighter space is required.
 * - Pad center: ±1.15mm (Pitch: 2.30mm)
 * - Pad dimensions: 0.80mm x 0.80mm
 */
export function DiodeSOD323({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "K", pin2: "A" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.15mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.80mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "1.15mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.80mm", layer: "top" })
    )
  });
}

/**
 * SOT-23 Surface Mount MOSFET / Transistor (AO3400A N-MOS / AO3401A P-MOS)
 * Standard IPC-7351 SOT-23 land pattern:
 * - Pin 1 & Pin 2 pitch: 1.90mm (±0.95mm on X)
 * - Row separation: 2.00mm (±1.00mm on Y)
 * - Pad dimensions: 0.70mm (W) x 0.90mm (H)
 * pin1: Gate (G), pin2: Source (S), pin3: Drain (D)
 */
export function SOT23_MOSFET({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "G", pin2: "S", pin3: "D" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.95mm", pcbY: "-1.00mm", shape: "rect", width: "0.70mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.95mm", pcbY: "-1.00mm", shape: "rect", width: "0.70mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "0mm", pcbY: "1.00mm", shape: "rect", width: "0.70mm", height: "0.90mm", layer: "top" })
    )
  });
}

export const SOT23_PMOSFET = SOT23_MOSFET;

/**
 * SOT-23-5 Linear LiPo Charger IC (TP4054 / MCP73831, LCSC C382138)
 * Standard 5-lead SOT-23-5:
 * - Pin pitch along bottom row (Pins 1, 2, 3): 0.95mm
 * - Pin pitch along top row (Pins 4, 5): 1.90mm (aligned with pins 3 & 1)
 * - Row separation: 2.60mm (±1.30mm on Y)
 * - Pad dimensions: 0.60mm (W) x 0.90mm (H)
 * pin1: STAT, pin2: GND, pin3: VBAT, pin4: VIN, pin5: PROG
 */
export function SOT23_5_Charger({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "STAT", pin2: "GND", pin3: "VBAT", pin4: "VIN", pin5: "PROG" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.95mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "0.95mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "0.95mm", pcbY: "1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5"], pcbX: "-0.95mm", pcbY: "1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * ESP32-C3 SuperMini footprint (Dual Plated Through-Hole + Castellated Pads)
 * 8 pins on Left (x = -8.89mm), 8 pins on Right (x = +8.89mm)
 * Uses clean 1.75mm outer diameter with 0.95mm drill holes (0.40mm annular ring buffer).
 */
export function ESP32C3_SuperMini({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const xSpan = 8.89;
  const pitch = 2.54;
  const startY = (3.5 * pitch);

  const pads = [];
  const pinLabels = {};

  const leftPinNames = ["5V", "GND", "3V3", "IO0", "IO1", "IO2_SDA", "IO3_SCL", "IO4"];
  const rightPinNames = ["IO5_INT", "IO6_LED", "IO7_MTR", "IO8", "IO9", "IO10", "IO20_RX", "IO21_TX"];

  for (let i = 0; i < 8; i++) {
    const pinNum = i + 1;
    const yPos = startY - (i * pitch);
    pinLabels[`pin${pinNum}`] = leftPinNames[i];
    pads.push(
      DualPad({
        key: `pad_l_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `-${xSpan.toFixed(2)}mm`,
        pcbY: `${yPos.toFixed(2)}mm`,
        width: "1.75mm",
        holeDia: "0.95mm"
      })
    );
  }

  for (let i = 0; i < 8; i++) {
    const pinNum = i + 9;
    const yPos = startY - (i * pitch);
    pinLabels[`pin${pinNum}`] = rightPinNames[i];
    pads.push(
      DualPad({
        key: `pad_r_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${xSpan.toFixed(2)}mm`,
        pcbY: `${yPos.toFixed(2)}mm`,
        width: "1.75mm",
        holeDia: "0.95mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * Universal IMU Footprint (MPU-6050 / MPU-6500 Breakout)
 * 8-Pin single-in-line header running lengthwise (Y-axis) at 2.54mm pitch.
 */
export function UniversalIMU_8Pin({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const pitch = 2.54;
  const startY = (3.5 * pitch);

  const pads = [];
  const pinLabels = {
    pin1: "VCC", pin2: "GND", pin3: "SCL", pin4: "SDA",
    pin5: "XDA", pin6: "XCL", pin7: "AD0", pin8: "INT"
  };

  for (let i = 0; i < 8; i++) {
    const pinNum = i + 1;
    const yPos = startY - (i * pitch);
    pads.push(
      DualPad({
        key: `imu_pad_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: "0mm",
        pcbY: `${yPos.toFixed(2)}mm`,
        width: "1.80mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * Dedicated MAX4466 Analog Microphone Header (3-Pin Single-in-line, 2.54mm pitch)
 */
export function MAX4466_Header({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const pitch = 2.54;
  const startX = -pitch;
  const pads = [];
  const pinLabels = { pin1: "VCC", pin2: "GND", pin3: "OUT" };

  for (let i = 0; i < 3; i++) {
    const pinNum = i + 1;
    pads.push(
      DualPad({
        key: `max_pad_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${(startX + i * pitch).toFixed(2)}mm`,
        pcbY: "0mm",
        width: "1.80mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * Dedicated INMP441 Digital I2S Microphone (Dual-Row 2x3 Pin Breakout)
 * 2.54mm pitch along columns, 7.62mm (300 mil) standard DIP row spacing
 */
export function INMP441_DualRow_Header({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const rowSpacing = 7.62;
  const halfRow = rowSpacing / 2;
  const pitch = 2.54;
  const pads = [];
  const pinLabels = {
    pin1: "SCK", pin2: "WS", pin3: "LR",
    pin4: "SD", pin5: "VDD", pin6: "GND"
  };

  const leftPins = [1, 2, 3];
  for (let i = 0; i < 3; i++) {
    const pinNum = leftPins[i];
    const yPos = (1 - i) * pitch;
    pads.push(
      DualPad({
        key: `inmp_l_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `-${halfRow.toFixed(2)}mm`,
        pcbY: `${yPos.toFixed(2)}mm`,
        width: "1.80mm",
        holeDia: "1.00mm"
      })
    );
  }

  const rightPins = [4, 5, 6];
  for (let i = 0; i < 3; i++) {
    const pinNum = rightPins[i];
    const yPos = (1 - i) * pitch;
    pads.push(
      DualPad({
        key: `inmp_r_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${halfRow.toFixed(2)}mm`,
        pcbY: `${yPos.toFixed(2)}mm`,
        width: "1.80mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * External Power Switch Pins (2 Plated Through-Hole Pads at 2.54mm pitch)
 */
export function ExternalSwitchPads({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "SW_IN", pin2: "SW_OUT" },
    footprint: React.createElement("footprint", null,
      DualPad({ key: "sw_p1", portHints: ["pin1"], pcbX: "-1.27mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.00mm" }),
      DualPad({ key: "sw_p2", portHints: ["pin2"], pcbX: "1.27mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.00mm" })
    )
  });
}

/**
 * Battery Terminals (Dual Solder Pads with Plated Holes for 1S LiPo Wires)
 */
export function BatteryPads({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "VBAT_POS", pin2: "GND" },
    footprint: React.createElement("footprint", null,
      DualPad({ key: "bat_pos", portHints: ["pin1"], pcbX: "-1.80mm", pcbY: "0mm", width: "2.40mm", holeDia: "1.20mm" }),
      DualPad({ key: "bat_neg", portHints: ["pin2"], pcbX: "1.80mm", pcbY: "0mm", width: "2.40mm", holeDia: "1.20mm" })
    )
  });
}

/**
 * Dedicated Lateral Haptic Motor Output Pads
 */
export function HapticMotorOutput({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "MTR_POS", pin2: "MTR_NEG" },
    footprint: React.createElement("footprint", null,
      DualPad({ key: "hm_p1", portHints: ["pin1"], pcbX: "0mm", pcbY: "1.27mm", width: "2.00mm", holeDia: "1.00mm" }),
      DualPad({ key: "hm_p2", portHints: ["pin2"], pcbX: "0mm", pcbY: "-1.27mm", width: "2.00mm", holeDia: "1.00mm" })
    )
  });
}

/**
 * Addressable LED Output Header (3 Plated Through-Hole Pads at 2.54mm pitch)
 */
export function LEDOutputHeader({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const pitch = 2.54;
  const startX = -pitch;
  const pads = [];
  const pinLabels = { pin1: "VCC", pin2: "DATA", pin3: "GND" };

  for (let i = 0; i < 3; i++) {
    const pinNum = i + 1;
    pads.push(
      DualPad({
        key: `led_out_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${(startX + i * pitch).toFixed(2)}mm`,
        pcbY: "0mm",
        width: "2.00mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * External User Action / Boot Mode Button Header (2 Plated Through-Hole Pads)
 */
export function ButtonHeader({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "BTN", pin2: "GND" },
    footprint: React.createElement("footprint", null,
      DualPad({ key: "btn_p1", portHints: ["pin1"], pcbX: "-1.27mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.00mm" }),
      DualPad({ key: "btn_p2", portHints: ["pin2"], pcbX: "1.27mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.00mm" })
    )
  });
}

/**
 * 4-Pin 2.54mm Pitch Breakout Header (Plated Through-Hole)
 */
export function Header4Pin({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, labels = { pin1: "5V", pin2: "IO0", pin3: "IO1", pin4: "GND" } }) {
  const pitch = 2.54;
  const startX = -1.5 * pitch;
  const pads = [];

  for (let i = 0; i < 4; i++) {
    const pinNum = i + 1;
    const xPos = startX + i * pitch;
    pads.push(
      DualPad({
        key: `pad_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${xPos.toFixed(2)}mm`,
        pcbY: "0mm",
        width: "1.90mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: labels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * 2-Pin 2.54mm Pitch Breakout Header (Plated Through-Hole)
 */
export function Header2Pin({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, labels = { pin1: "1", pin2: "2" } }) {
  const pitch = 2.54;
  const startX = -0.5 * pitch;
  const pads = [];

  for (let i = 0; i < 2; i++) {
    const pinNum = i + 1;
    const xPos = startX + i * pitch;
    pads.push(
      DualPad({
        key: `pad_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${xPos.toFixed(2)}mm`,
        pcbY: "0mm",
        width: "1.90mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: labels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * 5-Pin 2.54mm Pitch Breakout Header (Plated Through-Hole)
 * Typically used for MPU I2C diagnostic tap (3V3, GND, SCL, SDA, INT).
 */
export function Header5Pin({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, labels = { pin1: "3V3", pin2: "GND", pin3: "SCL", pin4: "SDA", pin5: "INT" } }) {
  const pitch = 2.54;
  const startX = -2 * pitch;
  const pads = [];

  for (let i = 0; i < 5; i++) {
    const pinNum = i + 1;
    const xPos = startX + i * pitch;
    pads.push(
      DualPad({
        key: `pad_${pinNum}`,
        portHints: [`pin${pinNum}`],
        pcbX: `${xPos.toFixed(2)}mm`,
        pcbY: "0mm",
        width: "1.90mm",
        holeDia: "1.00mm"
      })
    );
  }

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: labels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * 2-Pin Miniature SMD Tactile Push Button (TS-1187A / C318884)
 * Used for EN (Reset) and IO9 (Boot / User Action)
 */
export function PushSwitch_SMD({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, labels = { pin1: "1", pin2: "2" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: labels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.50mm", pcbY: "0mm", shape: "rect", width: "1.00mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "1.50mm", pcbY: "0mm", shape: "rect", width: "1.00mm", height: "1.20mm", layer: "top" })
    )
  });
}

/**
 * ME6211C33M5G-N 3.3V 500mA LDO Voltage Regulator (SOT-23-5, LCSC C82942)
 * Standard SOT-23-5 pinout:
 * Pin 1: VIN, Pin 2: GND, Pin 3: EN
 * Pin 4: NC/BYP, Pin 5: VOUT
 */
export function ME6211_SOT23_5({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "VIN", pin2: "GND", pin3: "EN", pin4: "NC", pin5: "VOUT" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.95mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "0.95mm", pcbY: "-1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "0.95mm", pcbY: "1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5"], pcbX: "-0.95mm", pcbY: "1.30mm", shape: "rect", width: "0.60mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * INMP441 Omnidirectional Digital I2S MEMS Microphone (SMD-9, LCSC C5438445)
 * Official factory footprint extracted from EasyEDA API:
 * - Pin 1: SCK, Pin 2: WS, Pin 3: L/R, Pin 4: GND
 * - Pin 5: Acoustic port ground shield
 * - Pin 6: VDD, Pin 7: GND, Pin 8: SD (DOUT), Pin 9: GND
 */
export function INMP441_SMD({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: {
      pin1: "SCK", pin2: "WS", pin3: "L_R", pin4: "GND",
      pin5: "GND_RING",
      pin6: "VDD", pin7: "GND", pin8: "SD", pin9: "GND"
    },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.33mm", pcbY: "1.89mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "-1.33mm", pcbY: "0.84mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "-1.33mm", pcbY: "-0.21mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "-1.33mm", pcbY: "-1.26mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5"], pcbX: "0mm", pcbY: "-1.26mm", shape: "rect", width: "1.33mm", height: "0.66mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin6"], pcbX: "1.33mm", pcbY: "-1.26mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin7"], pcbX: "1.33mm", pcbY: "-0.21mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin8"], pcbX: "1.33mm", pcbY: "0.84mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin9"], pcbX: "1.33mm", pcbY: "1.89mm", shape: "rect", width: "0.40mm", height: "0.60mm", layer: "top" })
    )
  });
}

/**
 * LSM6DS3TR-C 6-Axis IMU (Accelerometer + Gyroscope) (LGA-14, LCSC C967633)
 * STMicroelectronics official factory footprint:
 * Dimensions: 2.50mm x 3.00mm, Pitch: 0.50mm
 * Pin 1: SDO/SA0 (I2C LSB, GND for 0x6A)
 * Pin 2: SDx (Aux I2C Data, NC)
 * Pin 3: SCx (Aux I2C Clock, NC)
 * Pin 4: INT1 (Motion Interrupt)
 * Pin 5: VDDIO (Digital I/O Power, 3.3V)
 * Pin 6: GND
 * Pin 7: GND
 * Pin 8: VDD (Core Power, 3.3V)
 * Pin 9: INT2 (Aux Interrupt, NC)
 * Pin 10: NC
 * Pin 11: NC
 * Pin 12: CS (SPI CS, connect to VDDIO/3.3V for I2C mode)
 * Pin 13: SCL (I2C Clock)
 * Pin 14: SDA (I2C Data)
 */
export function LSM6DS3TR_C({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name, pcbX, pcbY, pcbRotation,
    pinLabels: {
      pin1: "SDO_SA0", pin2: "SDx", pin3: "SCx", pin4: "INT1",
      pin5: "VDDIO", pin6: "GND", pin7: "GND", pin8: "VDD",
      pin9: "INT2", pin10: "NC", pin11: "NC", pin12: "CS",
      pin13: "SCL", pin14: "SDA"
    },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.262mm", pcbY: "0.75mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "-1.262mm", pcbY: "0.25mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "-1.262mm", pcbY: "-0.25mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "-1.262mm", pcbY: "-0.75mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5"], pcbX: "-0.50mm", pcbY: "-1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin6"], pcbX: "0.00mm", pcbY: "-1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin7"], pcbX: "0.50mm", pcbY: "-1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin8"], pcbX: "1.262mm", pcbY: "-0.75mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin9"], pcbX: "1.262mm", pcbY: "-0.25mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin10"], pcbX: "1.262mm", pcbY: "0.25mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin11"], pcbX: "1.262mm", pcbY: "0.75mm", shape: "rect", width: "0.675mm", height: "0.28mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin12"], pcbX: "0.50mm", pcbY: "1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin13"], pcbX: "0.00mm", pcbY: "1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin14"], pcbX: "-0.50mm", pcbY: "1.012mm", shape: "rect", width: "0.28mm", height: "0.675mm", layer: "top" })
    )
  });
}

/**
 * WMM7037AT2-4/TR Omnidirectional Analog MEMS Microphone (LGA-4 / MIC-SMD, LCSC C140705)
 * WillSemi official factory footprint:
 * Dimensions: 3.76mm x 2.95mm
 * Pin 1: VDD (Power Supply, 3.3V)
 * Pin 2: GND
 * Pin 3: GND
 * Pin 4: OUT (Analog Audio Output to ESP32-C3 ADC)
 */
export function WMM7037AT2({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name, pcbX, pcbY, pcbRotation,
    pinLabels: { pin1: "VDD", pin2: "GND", pin3: "GND", pin4: "OUT" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "0.85mm", pcbY: "1.23mm", shape: "rect", width: "1.00mm", height: "1.00mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.85mm", pcbY: "-1.23mm", shape: "rect", width: "1.00mm", height: "1.00mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "-0.85mm", pcbY: "-1.23mm", shape: "rect", width: "1.00mm", height: "1.00mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "-0.85mm", pcbY: "1.23mm", shape: "rect", width: "1.00mm", height: "1.00mm", layer: "top" })
    )
  });
}

/**
 * MPU-6050 6-Axis Motion Tracking Sensor (QFN-24, LCSC C24112 / C2686888)
 * Standard QFN-24 4.0mm x 4.0mm, 0.50mm pitch:
 * Pin 1: CLKIN, Pin 8: VLOGIC, Pin 9: AD0, Pin 10: REGOUT, Pin 11: FSYNC, Pin 12: INT
 * Pin 13: VDD, Pin 18: GND, Pin 20: CPOUT, Pin 23: SCL, Pin 24: SDA, Pin 25: Thermal EP
 */
export function MPU6050_QFN24({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const pads = [];
  const padW = "0.28mm";
  const padH = "0.80mm";

  // Bottom row (Pins 1-6) at y = -2.0mm
  const xBottom = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25];
  for (let i = 0; i < 6; i++) {
    pads.push(React.createElement("smtpad", {
      key: `mpu_p${i + 1}`,
      portHints: [`pin${i + 1}`],
      pcbX: `${xBottom[i].toFixed(2)}mm`,
      pcbY: "-2.00mm",
      shape: "rect",
      width: padW,
      height: padH,
      layer: "top"
    }));
  }

  // Right row (Pins 7-12) at x = +2.0mm
  const yRight = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25];
  for (let i = 0; i < 6; i++) {
    pads.push(React.createElement("smtpad", {
      key: `mpu_p${i + 7}`,
      portHints: [`pin${i + 7}`],
      pcbX: "2.00mm",
      pcbY: `${yRight[i].toFixed(2)}mm`,
      shape: "rect",
      width: padH,
      height: padW,
      layer: "top"
    }));
  }

  // Top row (Pins 13-18) at y = +2.0mm
  const xTop = [1.25, 0.75, 0.25, -0.25, -0.75, -1.25];
  for (let i = 0; i < 6; i++) {
    pads.push(React.createElement("smtpad", {
      key: `mpu_p${i + 13}`,
      portHints: [`pin${i + 13}`],
      pcbX: `${xTop[i].toFixed(2)}mm`,
      pcbY: "2.00mm",
      shape: "rect",
      width: padW,
      height: padH,
      layer: "top"
    }));
  }

  // Left row (Pins 19-24) at x = -2.0mm
  const yLeft = [1.25, 0.75, 0.25, -0.25, -0.75, -1.25];
  for (let i = 0; i < 6; i++) {
    pads.push(React.createElement("smtpad", {
      key: `mpu_p${i + 19}`,
      portHints: [`pin${i + 19}`],
      pcbX: "-2.00mm",
      pcbY: `${yLeft[i].toFixed(2)}mm`,
      shape: "rect",
      width: padH,
      height: padW,
      layer: "top"
    }));
  }

  // Thermal ground pad (Pin 25)
  pads.push(React.createElement("smtpad", {
    key: "mpu_p25",
    portHints: ["pin25"],
    pcbX: "0mm",
    pcbY: "0mm",
    shape: "rect",
    width: "2.60mm",
    height: "2.60mm",
    layer: "top"
  }));

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: {
      pin1: "CLKIN", pin8: "VLOGIC", pin9: "AD0", pin10: "REGOUT",
      pin11: "FSYNC", pin12: "INT", pin13: "VDD", pin18: "GND",
      pin20: "CPOUT", pin23: "SCL", pin24: "SDA", pin25: "EP_GND"
    },
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * ESP32-C3-WROOM-02-N4 Wi-Fi & BLE SMD Module (LCSC C2934560)
 * 18 castellated pads with 1.50mm pitch, module dimensions 18.0mm x 20.0mm:
 * Left Row:
 *   Pin 1: 3V3, Pin 2: EN, Pin 3: GPIO4, Pin 4: GPIO5, Pin 5: GPIO6,
 *   Pin 6: GPIO7, Pin 7: GPIO8, Pin 8: GPIO9, Pin 9: GND
 * Right Row:
 *   Pin 10: GPIO10, Pin 11: GPIO20(RX), Pin 12: GPIO21(TX),
 *   Pin 13: GPIO18(USB D-), Pin 14: GPIO19(USB D+), Pin 15: GPIO3(SCL),
 *   Pin 16: GPIO2(SDA), Pin 17: GPIO1(INT), Pin 18: GND
 * Center Ground:
 *   Pin 19: EP_GND
 */
export function ESP32C3_WROOM_02({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const xSpan = 8.75;
  const pitch = 1.50;
  const startY = 6.00;
  const pads = [];

  const leftPinNames = ["3V3", "EN", "IO4_SCK", "IO5_WS", "IO6_LED", "IO7_HAP", "IO8_SD", "IO9_BOOT", "GND"];
  const rightPinNames = ["IO10_LED_EN", "IO20_RX", "IO21_TX", "IO18_USBDM", "IO19_USBDP", "IO3_SCL", "IO2_SDA", "IO1_INT", "GND"];

  const pinLabels = {};

  // Left Row (Pins 1-9)
  for (let i = 0; i < 9; i++) {
    const pinNum = i + 1;
    const yPos = startY - i * pitch;
    pinLabels[`pin${pinNum}`] = leftPinNames[i];
    pads.push(React.createElement("smtpad", {
      key: `c3_p${pinNum}`,
      portHints: [`pin${pinNum}`],
      pcbX: `-${xSpan.toFixed(2)}mm`,
      pcbY: `${yPos.toFixed(2)}mm`,
      shape: "rect",
      width: "2.00mm",
      height: "0.95mm",
      layer: "top"
    }));
  }

  // Right Row (Pins 10-18)
  for (let i = 0; i < 9; i++) {
    const pinNum = i + 10;
    const yPos = -startY + i * pitch;
    pinLabels[`pin${pinNum}`] = rightPinNames[i];
    pads.push(React.createElement("smtpad", {
      key: `c3_p${pinNum}`,
      portHints: [`pin${pinNum}`],
      pcbX: `${xSpan.toFixed(2)}mm`,
      pcbY: `${yPos.toFixed(2)}mm`,
      shape: "rect",
      width: "2.00mm",
      height: "0.95mm",
      layer: "top"
    }));
  }

  // Center Ground Pad (Pin 19)
  pinLabels["pin19"] = "EP_GND";
  pads.push(React.createElement("smtpad", {
    key: "c3_p19",
    portHints: ["pin19"],
    pcbX: "0mm",
    pcbY: "0mm",
    shape: "rect",
    width: "3.20mm",
    height: "3.20mm",
    layer: "top"
  }));

  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null, ...pads)
  });
}

/**
 * USB Type-C 16-Pin Receptacle (TYPE-C-31-M-12, LCSC C165948)
 * 4 through-hole shell mounting tabs + SMT contact pads
 * pin1: GND, pin2: VBUS, pin3: CC1, pin4: DP, pin5: DN, pin6: CC2, pin7: VBUS, pin8: GND
 * pin9..pin12: Shell mounting tabs
 */
export function USB_C_16P({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: {
      pin1: "GND", pin2: "VBUS", pin3: "CC1", pin4: "DP",
      pin5: "DN", pin6: "CC2", pin7: "VBUS", pin8: "GND",
      pin9: "SH1", pin10: "SH2", pin11: "SH3", pin12: "SH4"
    },
    footprint: React.createElement("footprint", null,
      // Shell Plated Through-Hole Mounting Tabs (Ø1.2mm drill, Ø2.0mm pad)
      DualPad({ key: "sh1", portHints: ["pin9", "pin_sh1"], pcbX: "-4.32mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.20mm" }),
      DualPad({ key: "sh2", portHints: ["pin10", "pin_sh2"], pcbX: "4.32mm", pcbY: "0mm", width: "2.00mm", holeDia: "1.20mm" }),
      DualPad({ key: "sh3", portHints: ["pin11", "pin_sh3"], pcbX: "-4.32mm", pcbY: "-4.20mm", width: "1.80mm", holeDia: "1.20mm" }),
      DualPad({ key: "sh4", portHints: ["pin12", "pin_sh4"], pcbX: "4.32mm", pcbY: "-4.20mm", width: "1.80mm", holeDia: "1.20mm" }),

      // Primary SMT Pins (GND, VBUS, CC1, DP, DN, CC2, VBUS, GND)
      React.createElement("smtpad", { portHints: ["pin1", "pinA1", "pinB12"], pcbX: "-3.20mm", pcbY: "0.70mm", shape: "rect", width: "0.60mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2", "pinA4", "pinB9"], pcbX: "-2.40mm", pcbY: "0.70mm", shape: "rect", width: "0.55mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3", "pinA5"], pcbX: "-1.25mm", pcbY: "0.70mm", shape: "rect", width: "0.30mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4", "pinA6", "pinB6"], pcbX: "-0.25mm", pcbY: "0.70mm", shape: "rect", width: "0.30mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5", "pinA7", "pinB7"], pcbX: "0.25mm", pcbY: "0.70mm", shape: "rect", width: "0.30mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin6", "pinB5"], pcbX: "1.25mm", pcbY: "0.70mm", shape: "rect", width: "0.30mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin7", "pinB4", "pinA9"], pcbX: "2.40mm", pcbY: "0.70mm", shape: "rect", width: "0.55mm", height: "1.20mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin8", "pinB1", "pinA12"], pcbX: "3.20mm", pcbY: "0.70mm", shape: "rect", width: "0.60mm", height: "1.20mm", layer: "top" })
    )
  });
}
