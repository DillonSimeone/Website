import { React } from "../tscircuit-core.js";

/**
 * Custom WS2812B-3535 addressable LED component (V6 variant with built-in caps).
 */
export function WS2812B_3535({ name, pcbX, pcbY, pcbRotation = 0 }) {
  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    supplierPartNumber: "C52941388",
    manufacturer: "Worldsemi",
    partNumber: "WS2812B-3535",
    pinLabels: {
      pin1: "VDD",
      pin2: "DOUT",
      pin3: "GND",
      pin4: "DIN"
    },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", {
        portHints: ["pin1"],
        pcbX: "-0.95mm",
        pcbY: "1.6mm",
        shape: "rect",
        width: "0.8mm",
        height: "0.9mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: "0.95mm",
        pcbY: "1.6mm",
        shape: "rect",
        width: "0.8mm",
        height: "0.9mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: "0.95mm",
        pcbY: "-1.6mm",
        shape: "rect",
        width: "0.8mm",
        height: "0.9mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin4"],
        pcbX: "-0.95mm",
        pcbY: "-1.6mm",
        shape: "rect",
        width: "0.8mm",
        height: "0.9mm",
        layer: "top"
      }),
      
      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "0mm", width: "3.2mm", height: "2.2mm" }),
      React.createElement("silkscreencircle", { pcbX: "-1.6mm", pcbY: "1.5mm", radius: "0.2mm" }),
      
      // Pin labels placed clearly off the pads
      React.createElement("silkscreentext", { text: "+", pcbX: "-1.8mm", pcbY: "0.8mm", fontSize: "0.5mm" }),
      React.createElement("silkscreentext", { text: "O", pcbX: "1.8mm", pcbY: "0.8mm", fontSize: "0.5mm" }),
      React.createElement("silkscreentext", { text: "-", pcbX: "1.8mm", pcbY: "-0.8mm", fontSize: "0.5mm" }),
      React.createElement("silkscreentext", { text: "I", pcbX: "-1.8mm", pcbY: "-0.8mm", fontSize: "0.5mm" })
    )
  });
}

/**
 * Vertical 3-pad solder header (V5, DATA, GND) for the beginning/end edges of the strip.
 */
export function VerticalThreePadHeader({ name, pcbX, pcbY, pcbRotation = 0, isEnd = false }) {
  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    pinLabels: {
      pin1: "V5",
      pin2: "DATA",
      pin3: "GND"
    },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", {
        portHints: ["pin1"],
        pcbX: "0mm",
        pcbY: "5.4mm",
        shape: "rect",
        width: "2.0mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: "0mm",
        pcbY: "0mm",
        shape: "rect",
        width: "2.0mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: "0mm",
        pcbY: "-5.4mm",
        shape: "rect",
        width: "2.0mm",
        height: "1.2mm",
        layer: "top"
      }),
      
      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "0mm", width: "2.5mm", height: "9.2mm" })
    )
  });
}

/**
 * Horizontal 6-pad solder header placed between pixels.
 * Silkscreen text moved completely off the pads into the safe inner PCB area.
 */
export function HorizontalEdgeHeader({ name, pcbX, pcbY, pcbRotation = 0 }) {
  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    pinLabels: {
      pin1: "V5_T",
      pin2: "DATA_T",
      pin3: "GND_T",
      pin4: "V5_B",
      pin5: "DATA_B",
      pin6: "GND_B"
    },
    footprint: React.createElement("footprint", null,
      // --- Top 3 Pads ---
      React.createElement("smtpad", {
        portHints: ["pin1"],
        pcbX: "-1.0mm",
        pcbY: "5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: "0mm",
        pcbY: "5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: "1.0mm",
        pcbY: "5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      
      // --- Bottom 3 Pads ---
      React.createElement("smtpad", {
        portHints: ["pin4"],
        pcbX: "-1.0mm",
        pcbY: "-5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin5"],
        pcbX: "0mm",
        pcbY: "-5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin6"],
        pcbX: "1.0mm",
        pcbY: "-5.4mm",
        shape: "rect",
        width: "0.8mm",
        height: "1.2mm",
        layer: "top"
      }),
      
      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "4.4mm", width: "3.0mm", height: "0.2mm" }),
      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "-4.4mm", width: "3.0mm", height: "0.2mm" })
    )
  });
}
