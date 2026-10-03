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
export function VerticalThreePadHeader({ name, pcbX, pcbY, pcbRotation = 0, isEnd = false, boardHeight = 12 }) {
  const padH = Math.min(1.2, boardHeight / 4.5);
  const padW = Math.min(2.0, boardHeight * 0.6); // Scale width to maintain aesthetic proportions
  const padSpacing = boardHeight / 2 - padH / 2;

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
        pcbY: `${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: "0mm",
        pcbY: "0mm",
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: "0mm",
        pcbY: `-${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),

      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: "0mm", width: `${padW + 0.5}mm`, height: `${Math.max(1.0, boardHeight - 2.8)}mm` }),

      boardHeight >= 2.5 && React.createElement("silkscreentext", {
        text: "V5",
        pcbX: isEnd ? `-${padW / 2 + 1.2}mm` : `${padW / 2 + 1.2}mm`,
        pcbY: `${padSpacing}mm`,
        fontSize: `${Math.min(0.6, boardHeight * 0.15)}mm`
      }),
      boardHeight >= 2.5 && React.createElement("silkscreentext", {
        text: "DATA",
        pcbX: isEnd ? `-${padW / 2 + 1.2}mm` : `${padW / 2 + 1.2}mm`,
        pcbY: "0mm",
        fontSize: `${Math.min(0.6, boardHeight * 0.15)}mm`
      }),
      boardHeight >= 2.5 && React.createElement("silkscreentext", {
        text: "GND",
        pcbX: isEnd ? `-${padW / 2 + 1.2}mm` : `${padW / 2 + 1.2}mm`,
        pcbY: `-${padSpacing}mm`,
        fontSize: `${Math.min(0.6, boardHeight * 0.15)}mm`
      })
    )
  });
}

/**
 * Horizontal 6-pad solder header placed between pixels.
 * Silkscreen text moved completely off the pads into the safe inner PCB area.
 */
export function HorizontalEdgeHeader({ name, pcbX, pcbY, pcbRotation = 0, boardHeight = 12 }) {
  const padH = Math.min(1.2, boardHeight / 4.5);
  const padW = Math.min(0.8, boardHeight * 0.25);
  const padSpacing = boardHeight / 2 - padH / 2;
  const pin13Offset = Math.min(1.0, boardHeight * 0.3); // spacing in X direction between the three pads

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
        pcbX: `-${pin13Offset}mm`,
        pcbY: `${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin2"],
        pcbX: "0mm",
        pcbY: `${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin3"],
        pcbX: `${pin13Offset}mm`,
        pcbY: `${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),

      React.createElement("smtpad", {
        portHints: ["pin4"],
        pcbX: `-${pin13Offset}mm`,
        pcbY: `-${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin5"],
        pcbX: "0mm",
        pcbY: `-${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),
      React.createElement("smtpad", {
        portHints: ["pin6"],
        pcbX: `${pin13Offset}mm`,
        pcbY: `-${padSpacing}mm`,
        shape: "rect",
        width: `${padW}mm`,
        height: `${padH}mm`,
        layer: "top"
      }),

      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: `${boardHeight / 2 - padH - 0.2}mm`, width: `${pin13Offset * 3}mm`, height: "0.2mm" }),
      React.createElement("silkscreenrect", { pcbX: "0mm", pcbY: `-${boardHeight / 2 - padH - 0.2}mm`, width: `${pin13Offset * 3}mm`, height: "0.2mm" }),

      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "V5", pcbX: `-${pin13Offset}mm`, pcbY: `${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" }),
      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "DATA", pcbX: "0mm", pcbY: `${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" }),
      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "GND", pcbX: `${pin13Offset}mm`, pcbY: `${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" }),

      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "V5", pcbX: `-${pin13Offset}mm`, pcbY: `-${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" }),
      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "DATA", pcbX: "0mm", pcbY: `-${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" }),
      boardHeight >= 6.0 && React.createElement("silkscreentext", { text: "GND", pcbX: `${pin13Offset}mm`, pcbY: `-${boardHeight/2 - 2.2}mm`, pcbRotation: 90, fontSize: "0.5mm" })
    )
  });
}
