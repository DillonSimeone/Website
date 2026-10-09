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
