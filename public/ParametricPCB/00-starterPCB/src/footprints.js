import { React } from "../../00-commonParts/tscircuit-core.js";

/**
 * Creates hybrid Dual-Mount pads (Plated through-hole with outer annular copper ring)
 */
export function DualPad({ portHints, pcbX, pcbY, width = "1.8mm", holeDia = "1.0mm", key }) {
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
 */
export function ESP32C3_SuperMini({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  const xSpan = 8.89;
  const pitch = 2.54;
  const startY = 3.5 * pitch;

  const pads = [];
  const pinLabels = {};

  const leftPinNames = ["5V", "GND", "3V3", "IO0", "IO1", "IO2", "IO3", "IO4"];
  const rightPinNames = ["IO5", "IO6", "IO7", "IO8", "IO9", "IO10", "RX", "TX"];

  for (let i = 0; i < 8; i++) {
    const pinNum = i + 1;
    const yPos = startY - i * pitch;
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
    const yPos = startY - i * pitch;
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
 * 0603 Surface Mount Resistor
 */
export function Resistor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "1", pin2: "2" },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", { portHints: ["pin1"], pcbX: "-0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" }),
      React.createElement("smtpad", { portHints: ["pin2"], pcbX: "0.80mm", pcbY: "0mm", shape: "rect", width: "0.80mm", height: "0.90mm", layer: "top" })
    )
  });
}

/**
 * 0603 Surface Mount Capacitor
 */
export function Capacitor0603({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {
  return React.createElement("chip", {
    name,
    pcbX,
    pcbY,
    pcbRotation,
    pinLabels: { pin1: "1", pin2: "2" },
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
        width: "1.9mm",
        holeDia: "1.0mm"
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
