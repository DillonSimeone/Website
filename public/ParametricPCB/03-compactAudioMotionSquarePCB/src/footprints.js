import { React } from "../../00-commonParts/tscircuit-core.js";

/**
 * Creates hybrid Dual-Mount pads (Plated through-hole with outer annular copper ring)
 */
function DualPad({ portHints, pcbX, pcbY, width = "1.8mm", holeDia = "1.0mm", key }) {
  return React.createElement("platedhole", {
    key,
    portHints,
    pcbX,
    pcbY,
    outerDiameter: width,
    holeDiameter: holeDia,
    shape: "circle"
  });
}

/**
 * ESP32-C3 SuperMini footprint (Dual Plated Through-Hole + Castellated Pads)
 * 8 pins on Left (x = -8.89mm), 8 pins on Right (x = +8.89mm)
 * Uses clean 1.75mm outer diameter with 0.95mm drill holes.
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
 * 8-Pin single-in-line header running lengthwise (Y-axis):
 *   pin1: VCC (Top)
 *   pin2: GND
 *   pin3: SCL
 *   pin4: SDA
 *   pin5: XDA
 *   pin6: XCL
 *   pin7: AD0
 *   pin8: INT (Bottom)
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
        width: "1.8mm",
        holeDia: "1.0mm"
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
 * Dedicated MAX4466 Analog Microphone Header (3-Pin Single-in-line)
 * pin1: VCC, pin2: GND, pin3: OUT
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
        width: "1.8mm",
        holeDia: "1.0mm"
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
 * Left Row: pin1: SCK, pin2: WS, pin3: L/R
 * Right Row: pin4: SD, pin5: VDD, pin6: GND
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
        width: "1.8mm",
        holeDia: "1.0mm"
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
        width: "1.8mm",
        holeDia: "1.0mm"
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
 * SOT-23 N-Channel Power MOSFET (AO3400A)
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
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.95mm", pcbY: "-1.0mm", shape: "rect", width: "0.6mm", height: "0.8mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.95mm", pcbY: "-1.0mm", shape: "rect", width: "0.6mm", height: "0.8mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "0mm", pcbY: "1.0mm", shape: "rect", width: "0.6mm", height: "0.8mm", layer: "top" })
    )
  });
}

/**
 * SOT-23 P-Channel Power MOSFET (AO3401A)
 */
export const SOT23_PMOSFET = SOT23_MOSFET;

/**
 * SOT-23-5 Linear LiPo Charger IC (MCP73831 / TP4054)
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
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.95mm", pcbY: "-1.3mm", shape: "rect", width: "0.6mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0mm", pcbY: "-1.3mm", shape: "rect", width: "0.6mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin3"], pcbX: "0.95mm", pcbY: "-1.3mm", shape: "rect", width: "0.6mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin4"], pcbX: "0.95mm", pcbY: "1.3mm", shape: "rect", width: "0.6mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin5"], pcbX: "-0.95mm", pcbY: "1.3mm", shape: "rect", width: "0.6mm", height: "0.9mm", layer: "top" })
    )
  });
}

/**
 * External Power Switch Pins (2 Plated Through-Hole Pads)
 */
export function ExternalSwitchPads({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "SW_IN", pin2: "SW_OUT" },
    footprint: React.createElement("footprint", null,
      DualPad({ key: "sw_p1", portHints: ["pin1"], pcbX: "-1.27mm", pcbY: "0mm", width: "2.0mm", holeDia: "1.0mm" }),
      DualPad({ key: "sw_p2", portHints: ["pin2"], pcbX: "1.27mm", pcbY: "0mm", width: "2.0mm", holeDia: "1.0mm" })
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
      DualPad({ key: "bat_pos", portHints: ["pin1"], pcbX: "-1.8mm", pcbY: "0mm", width: "2.4mm", holeDia: "1.2mm" }),
      DualPad({ key: "bat_neg", portHints: ["pin2"], pcbX: "1.8mm", pcbY: "0mm", width: "2.4mm", holeDia: "1.2mm" })
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
      DualPad({ key: "hm_p1", portHints: ["pin1"], pcbX: "0mm", pcbY: "1.27mm", width: "2.0mm", holeDia: "1.0mm" }),
      DualPad({ key: "hm_p2", portHints: ["pin2"], pcbX: "0mm", pcbY: "-1.27mm", width: "2.0mm", holeDia: "1.0mm" })
    )
  });
}

/**
 * Addressable LED Output Header (3 Plated Through-Hole Pads)
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
        width: "2.0mm",
        holeDia: "1.0mm"
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
 * 0603 SMD Resistor
 */
export function Resistor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "1", pin2: "2" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.75mm", pcbY: "0mm", shape: "rect", width: "0.8mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.75mm", pcbY: "0mm", shape: "rect", width: "0.8mm", height: "0.9mm", layer: "top" })
    )
  });
}

/**
 * 0603 SMD Ceramic Capacitor
 */
export function Capacitor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "1", pin2: "2" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.75mm", pcbY: "0mm", shape: "rect", width: "0.8mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.75mm", pcbY: "0mm", shape: "rect", width: "0.8mm", height: "0.9mm", layer: "top" })
    )
  });
}

/**
 * SOD-123 Schottky Barrier Diode (SS14)
 * pin1: Cathode (K), pin2: Anode (A)
 */
export function DiodeSOD123({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0, pinLabels = { pin1: "K", pin2: "A" } }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels,
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-1.3mm", pcbY: "0mm", shape: "rect", width: "1.0mm", height: "0.9mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "1.3mm", pcbY: "0mm", shape: "rect", width: "1.0mm", height: "0.9mm", layer: "top" })
    )
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
      DualPad({ key: "btn_p1", portHints: ["pin1"], pcbX: "-1.27mm", pcbY: "0mm", width: "2.0mm", holeDia: "1.0mm" }),
      DualPad({ key: "btn_p2", portHints: ["pin2"], pcbX: "1.27mm", pcbY: "0mm", width: "2.0mm", holeDia: "1.0mm" })
    )
  });
}
