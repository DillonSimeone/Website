import { React } from "../tscircuit-core.js";

/**
 * WS2812B-1313-V6 addressable LED (1.3×1.3 mm, built-in decoupling caps).
 * Pad layout per Worldsemi datasheet — bottom view:
 *   Pin1 VDD (top-left)    Pin4 DIN (top-right)
 *   Pin2 DOUT (bottom-left) Pin3 GND (bottom-right)
 */
export function WS2812B_1313({ name, pcbX, pcbY, pcbRotation = 0 }) {
  const pad = "0.40mm";
  const pitch = "0.40mm";

  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    supplierPartNumber: "C52941388",
    manufacturer: "Worldsemi",
    partNumber: "WS2812B-1313-V6",
    pinLabels: {
      pin1: "VDD",
      pin2: "DOUT",
      pin3: "GND",
      pin4: "DIN"
    },
    footprint: React.createElement("footprint", null,
      React.createElement("smtpad", {
        portHints: ["pin1"],
        pcbX: `-${pitch}`,
        pcbY: pitch,
        shape: "rect",
        width: pad,
        height: pad,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: `-${pitch}`,
        pcbY: `-${pitch}`,
        shape: "rect",
        width: pad,
        height: pad,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: pitch,
        pcbY: `-${pitch}`,
        shape: "rect",
        width: pad,
        height: pad,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin4"],
        pcbX: pitch,
        pcbY: pitch,
        shape: "rect",
        width: pad,
        height: pad,
        layer: "top"
      }),

      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "0mm", width: "1.30mm", height: "1.30mm" }),
      React.createElement("silkscreencircle", { pcbX: "-0.55mm", pcbY: "0.55mm", radius: "0.08mm" }),

      React.createElement("silkscreentext", { text: "+", pcbX: "-0.72mm", pcbY: "0.40mm", fontSize: "0.30mm" }),
      React.createElement("silkscreentext", { text: "O", pcbX: "-0.72mm", pcbY: "-0.40mm", fontSize: "0.30mm" }),
      React.createElement("silkscreentext", { text: "-", pcbX: "0.72mm", pcbY: "-0.40mm", fontSize: "0.30mm" }),
      React.createElement("silkscreentext", { text: "I", pcbX: "0.72mm", pcbY: "0.40mm", fontSize: "0.30mm" })
    )
  });
}

/** @deprecated Use WS2812B_1313 — kept for older imports */
export const WS2812B_3535 = WS2812B_1313;

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
