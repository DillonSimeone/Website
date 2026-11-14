/**
 * Parametric PCB Suite - Silkscreen Typography, Gerber Alphabet & Tethered Polarity Engine
 *
 * Single Source of Truth for:
 *  1. Web-developer friendly "px-feel" -> physical Gerber mm font presets
 *  2. Exact circuit-json-to-gerber glyph bounding-box & supported alphabet tables
 *  3. Footprint-tethered JLCPCB polarity markers (cathode U-bars, +/-, IC Pin-1 dots)
 *     that automatically move & rotate with parent components while supporting per-marker
 *     local nudging (dx, dy, rotation, fontSize, visible) in layout.json.
 */

export const JLCPCB_MIN_FONT_MM = 0.80;
export const JLCPCB_MIN_STROKE_MM = 0.15;

/**
 * Hand-held PCB reading scale mapped to familiar Web CSS px mental models.
 * Note: In circuit-json-to-gerber, centerline glyph cap height = fontSize * 0.70,
 * and we clamp Gerber silkscreen stroke apertures to >= 0.15mm (6 mil).
 */
export const FONT_SIZE_PRESETS = [
  { id: "jlc_min", pxLabel: "JLC Min", label: "JLC Min (0.8mm)", mm: 0.80, hint: "Fab minimum - tight 0603/SOT-23 refs" },
  { id: "px8",     pxLabel: "8px",     label: "8px Tiny (1.0mm)", mm: 1.00, hint: "Crisp pinouts & +/- polarity" },
  { id: "px10",    pxLabel: "10px",    label: "10px Small (1.2mm)", mm: 1.20, hint: "Everyday connector names & notes" },
  { id: "px12",    pxLabel: "12px",    label: "12px Body (1.5mm)", mm: 1.50, hint: "Prominent peripheral headers" },
  { id: "px16",    pxLabel: "16px",    label: "16px Head (2.0mm)", mm: 2.00, hint: "Board title & primary cautions" },
  { id: "px24",    pxLabel: "24px",    label: "24px Hero (3.0mm)", mm: 3.00, hint: "Large splash branding" }
];

/**
 * Exact set of characters supported by @tscircuit/alphabet inside 00-commonParts/circuit-json-to-gerber.js.
 * Characters outside this set (like Unicode bullets '●', colons ':', 'µ', 'Ω') silently drop out of Gerbers!
 */
export const GERBER_SUPPORTED_CHARS = new Set([
  " ", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "!", "#", "'", "(", ")", "*", "+", ",", "-", ".", "/", "<", "=", ">",
  "[", "\\", "]", "^", "_",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
]);

export function findUnsupportedGerberChars(text = "") {
  const bad = new Set();
  for (const ch of String(text)) {
    if (!GERBER_SUPPORTED_CHARS.has(ch)) {
      bad.add(ch);
    }
  }
  return Array.from(bad);
}

/**
 * Computes the exact physical Gerber bounding box (in mm) produced by circuit-json-to-gerber.js
 * for a pcb_silkscreen_text element.
 *
 * Matches circuit-json-to-gerber.js lines 156-165:
 *   glyphH = fontSize * 0.7
 *   letterGap = glyphH * 0.4
 *   spaceW = glyphH * 0.5
 *   strokeW = max(0.15, fontSize / 8)
 */
export function computeGerberTextBox(item, silkScale = 1.0) {
  const text = String(item.text ?? "");
  const fontSize = (typeof item.font_size === "number" ? item.font_size : (parseFloat(item.fontSize) || 0.8)) * silkScale;
  const ax = item.anchor_position?.x ?? item.x ?? 0;
  const ay = item.anchor_position?.y ?? item.y ?? 0;
  const align = item.anchor_alignment || item.align || "center";
  const rotDeg = item.ccw_rotation ?? item.rotation ?? 0;
  const layer = item.layer || "top";

  const glyphH = fontSize * 0.7;
  const letterGap = glyphH * 0.4;
  const spaceW = glyphH * 0.5;
  const strokeW = Math.max(JLCPCB_MIN_STROKE_MM, fontSize / 8);

  let rawW = 0;
  if (text.length > 0) {
    rawW = text.split("").reduce((acc, ch) => (ch === " " ? acc + spaceW + letterGap : acc + glyphH + letterGap), 0) - letterGap;
  }
  const width = Math.max(0.2, rawW);
  const height = glyphH;

  let minLocalX = ax;
  let minLocalY = ay;

  switch (align) {
    case "top_left":
      break;
    case "top_center":
      minLocalX -= width / 2;
      break;
    case "top_right":
      minLocalX -= width;
      break;
    case "center_right":
      // Extends to the right of anchor (textAnchor="start")
      minLocalY -= height / 2;
      break;
    case "center_left":
      // Extends to the left of anchor (textAnchor="end")
      minLocalX -= width;
      minLocalY -= height / 2;
      break;
    case "bottom_left":
      minLocalY -= height;
      break;
    case "bottom_center":
      minLocalX -= width / 2;
      minLocalY -= height;
      break;
    case "bottom_right":
      minLocalX -= width;
      minLocalY -= height;
      break;
    default: // "center"
      minLocalX -= width / 2;
      minLocalY -= height / 2;
      break;
  }

  // Note: On bottom layer, circuit-json-to-gerber mirrors around the box center (cx, cy),
  // which leaves an un-offset centered box in the same place, or for side-aligned text mirrors around (cx, cy).
  const cx = minLocalX + width / 2;
  const cy = minLocalY + height / 2;
  const halfW = width / 2 + strokeW / 2;
  const halfH = height / 2 + strokeW / 2;

  const effectiveRot = layer === "bottom" ? -rotDeg : rotDeg;
  const rad = (effectiveRot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localCorners = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH }
  ];

  const corners = localCorners.map(pt => ({
    x: cx + pt.x * cos - pt.y * sin,
    y: cy + pt.x * sin + pt.y * cos
  }));

  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);

  return {
    cx,
    cy,
    anchorX: ax,
    anchorY: ay,
    width: halfW * 2,
    height: halfH * 2,
    fontSize,
    strokeW,
    rotation: rotDeg,
    layer,
    corners,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

/**
 * Rotates a local 2D offset (lx, ly) by CCW angle `deg` around (0, 0).
 */
export function rotateOffset(lx, ly, deg = 0) {
  if (!deg) return { x: lx, y: ly };
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: lx * c - ly * s,
    y: lx * s + ly * c
  };
}

/**
 * Converts a world-space drag delta (dwx, dwy) back into a component's local frame (-deg).
 */
export function worldDeltaToLocal(dwx, dwy, compRotDeg = 0) {
  return rotateOffset(dwx, dwy, -compRotDeg);
}

/**
 * Keeps text upright (0° or 90°) regardless of 180°/270° parent component flips.
 */
export function normalizeReadableTextRotation(deg = 0) {
  let a = ((deg % 360) + 360) % 360;
  if (a > 90 && a <= 270) {
    a = (a + 180) % 360;
  }
  return a;
}

/**
 * Footprint-level Courtyard & Tethered Polarity Specifications (all units in mm, local unrotated frame).
 * Every silkscreen stroke & label is pre-positioned outside bare copper pads + 0.20mm solder mask clearance!
 */
export const FOOTPRINT_POLARITY_SPECS = {
  DiodeSOD123: {
    courtyard: { width: 4.80, height: 2.00 },
    requiresPolarity: true,
    // Pads at x = ±1.65 (1.10 x 1.20mm) -> copper x in [-2.20..-1.10] and [+1.10..+2.20], y in [-0.60..+0.60]
    // Cathode is Pin 1 (left side, -X). U-bracket wraps outside Pin 1 pad + inner belly stripe at x = -0.68mm.
    polarityPaths: [
      {
        strokeWidth: 0.22,
        points: [
          { x: -1.45, y: 0.92 },
          { x: -2.55, y: 0.92 },
          { x: -2.55, y: -0.92 },
          { x: -1.45, y: -0.92 }
        ]
      },
      {
        strokeWidth: 0.25,
        points: [
          { x: -0.68, y: -0.78 },
          { x: -0.68, y: 0.78 }
        ]
      }
    ],
    defaultMarkers: {
      ref:   { text: "",  lx: 0.00,  ly: 1.45,  fontSize: 0.80, rotOffset: 0, visible: true },
      minus: { text: "-", lx: -1.65, ly: -1.42, fontSize: 1.00, rotOffset: 0, visible: true },
      plus:  { text: "+", lx: 1.65,  ly: -1.42, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  DiodeSOD323: {
    courtyard: { width: 3.40, height: 1.50 },
    requiresPolarity: true,
    polarityPaths: [
      {
        strokeWidth: 0.20,
        points: [
          { x: -1.05, y: 0.75 },
          { x: -1.90, y: 0.75 },
          { x: -1.90, y: -0.75 },
          { x: -1.05, y: -0.75 }
        ]
      }
    ],
    defaultMarkers: {
      ref:   { text: "",  lx: 0.00,  ly: 1.25,  fontSize: 0.80, rotOffset: 0, visible: true },
      minus: { text: "-", lx: -1.15, ly: -1.25, fontSize: 1.00, rotOffset: 0, visible: true },
      plus:  { text: "+", lx: 1.15,  ly: -1.25, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  Led0603: {
    courtyard: { width: 2.70, height: 1.30 },
    requiresPolarity: true,
    // Pads at x = ±0.80 (0.80 x 0.90mm) -> copper x in [-1.20..-0.40] and [+0.40..+1.20], y in [-0.45..+0.45]
    // Pin 1 Cathode (-X): U-bracket cleanly outside Pin 1 pad
    polarityPaths: [
      {
        strokeWidth: 0.20,
        points: [
          { x: -0.70, y: 0.80 },
          { x: -1.55, y: 0.80 },
          { x: -1.55, y: -0.80 },
          { x: -0.70, y: -0.80 }
        ]
      }
    ],
    defaultMarkers: {
      ref:   { text: "",  lx: 0.00,  ly: 1.35,  fontSize: 0.80, rotOffset: 0, visible: true },
      minus: { text: "-", lx: -1.35, ly: -1.30, fontSize: 1.00, rotOffset: 0, visible: true },
      plus:  { text: "+", lx: 1.35,  ly: -1.30, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  SOT23_5_Charger: {
    courtyard: { width: 3.10, height: 3.60 },
    requiresPin1: true,
    // Pin 1 STAT at (-0.95, -1.30), pad width 0.60 -> left copper edge at -1.25mm.
    // Place solid 0.42mm Pin-1 dot at (-1.72, -1.30) -> 0.47mm clear of copper!
    pin1Dot: { lx: -1.72, ly: -1.30, diameter: 0.42 },
    polarityPaths: [
      { strokeWidth: 0.18, points: [{ x: -1.22, y: -0.38 }, { x: -1.22, y: 0.38 }] },
      { strokeWidth: 0.18, points: [{ x: 1.22, y: -0.38 }, { x: 1.22, y: 0.38 }] }
    ],
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 2.35, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  ME6211_SOT23_5: {
    courtyard: { width: 3.10, height: 3.60 },
    requiresPin1: true,
    pin1Dot: { lx: -1.72, ly: -1.30, diameter: 0.42 },
    polarityPaths: [
      { strokeWidth: 0.18, points: [{ x: -1.22, y: -0.38 }, { x: -1.22, y: 0.38 }] },
      { strokeWidth: 0.18, points: [{ x: 1.22, y: -0.38 }, { x: 1.22, y: 0.38 }] }
    ],
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 2.35, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  SOT23_MOSFET: {
    courtyard: { width: 3.10, height: 3.00 },
    requiresPin1: true,
    // Pin 1 Gate at (-0.95, -1.00), pad width 0.70 -> left copper edge at -1.30mm.
    pin1Dot: { lx: -1.72, ly: -1.00, diameter: 0.38 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: -2.05, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  SOT23_PMOSFET: {
    courtyard: { width: 3.10, height: 3.00 },
    requiresPin1: true,
    pin1Dot: { lx: -1.72, ly: -1.00, diameter: 0.38 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: -2.05, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  Resistor0603: {
    courtyard: { width: 2.60, height: 1.15 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 1.15, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  Capacitor0603: {
    courtyard: { width: 2.60, height: 1.15 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 1.15, fontSize: 0.80, rotOffset: 0, visible: true }
    }
  },

  BatteryPads: {
    courtyard: { width: 6.40, height: 2.80 },
    requiresPolarity: true,
    // Pads at x = ±1.80, outerDiameter = 2.40mm -> copper spans x in [-3.00..-0.60] and [+0.60..+3.00]
    // Pin 1 is VBAT_POS (-1.80), Pin 2 is GND (+1.80)
    defaultMarkers: {
      ref:   { text: "",  lx: 0.00,  ly: 2.05, fontSize: 1.00, rotOffset: 0, visible: true },
      plus:  { text: "+", lx: -3.75, ly: 0.00, fontSize: 1.20, rotOffset: 0, visible: true },
      minus: { text: "-", lx: 3.75,  ly: 0.00, fontSize: 1.20, rotOffset: 0, visible: true }
    }
  },

  HapticMotorOutput: {
    courtyard: { width: 2.40, height: 4.90 },
    requiresPolarity: true,
    // Pads at (0, +1.27) = MTR_POS, (0, -1.27) = MTR_NEG, outerDiameter = 2.00mm (radius 1.00mm)
    defaultMarkers: {
      ref:   { text: "",  lx: -1.95, ly: 0.00,  fontSize: 1.00, rotOffset: 90, visible: true },
      plus:  { text: "+", lx: 1.65,  ly: 1.27,  fontSize: 1.00, rotOffset: 0,  visible: true },
      minus: { text: "-", lx: 1.65,  ly: -1.27, fontSize: 1.00, rotOffset: 0,  visible: true }
    }
  },

  ExternalSwitchPads: {
    courtyard: { width: 4.90, height: 2.40 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: -1.95, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  LEDOutputHeader: {
    courtyard: { width: 7.50, height: 2.40 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: -2.05, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  MAX4466_Header: {
    courtyard: { width: 7.40, height: 2.30 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 1.85, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  INMP441_DualRow_Header: {
    courtyard: { width: 9.80, height: 7.40 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 0.00, fontSize: 0.90, rotOffset: 90, visible: true }
    }
  },

  Header4Pin: {
    courtyard: { width: 10.10, height: 2.30 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 1.95, fontSize: 1.00, rotOffset: 0, visible: true }
    }
  },

  ESP32C3_SuperMini: {
    courtyard: { width: 18.00, height: 22.50 },
    requiresPin1: true,
    // Pin 1 (5V) is at (-8.89, +8.89), pad radius 0.875 -> top edge +9.765
    pin1Dot: { lx: -8.89, ly: 10.45, diameter: 0.50 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 10.60, fontSize: 1.00, rotOffset: 0, visible: false }
    }
  },

  UniversalIMU_8Pin: {
    courtyard: { width: 2.40, height: 20.20 },
    requiresPin1: true,
    // Pin 1 (VCC) is at (0, +8.89), pad radius 0.90 -> top edge +9.79
    pin1Dot: { lx: 0.00, ly: 10.50, diameter: 0.50 },
    defaultMarkers: {
      ref: { text: "", lx: 0.00, ly: 11.40, fontSize: 1.00, rotOffset: 0, visible: false }
    }
  },

  MountingHoleM3: {
    courtyard: { width: 5.00, height: 5.00 },
    defaultMarkers: {}
  }
};

/**
 * Resolves all tethered silkscreen primitives (text labels, cathode U-bars, Pin-1 dots)
 * in world board coordinates (mm) for a given component entry in layout.json.
 */
export function resolveComponentTetheredSilk(compName, compData = {}) {
  const fpType = compData.footprint || "Resistor0603";
  const spec = FOOTPRINT_POLARITY_SPECS[fpType];
  if (!spec) return { texts: [], paths: [] };

  const cx = Number(compData.x) || 0;
  const cy = Number(compData.y) || 0;
  const cRot = Number(compData.rotation) || 0;
  const cLayer = compData.layer || "top";
  const markersCfg = compData.markers || {};

  const texts = [];
  const paths = [];

  // 1. Polarity vector paths (e.g. Diode / LED cathode U-bracket & stripe)
  const showPolarityBar = markersCfg.polarityBar?.visible !== false;
  if (showPolarityBar && Array.isArray(spec.polarityPaths)) {
    const barDx = Number(markersCfg.polarityBar?.dx) || 0;
    const barDy = Number(markersCfg.polarityBar?.dy) || 0;
    spec.polarityPaths.forEach((pDef, idx) => {
      const worldPts = pDef.points.map(pt => {
        const r = rotateOffset(pt.x + barDx, pt.y + barDy, cRot);
        return { x: +(cx + r.x).toFixed(3), y: +(cy + r.y).toFixed(3) };
      });
      paths.push({
        id: `tether__${compName}__bar_${idx}`,
        parentComp: compName,
        markerKey: "polarityBar",
        layer: markersCfg.polarityBar?.layer || cLayer,
        strokeWidth: pDef.strokeWidth || 0.20,
        route: worldPts
      });
    });
  }

  // 2. Pin-1 solid circular flash dot (rendered via silkscreenpath so Gerber RS-274X flashes a true round aperture!)
  const showPin1Dot = markersCfg.pin1Dot?.visible !== false;
  if (showPin1Dot && spec.pin1Dot) {
    const dotLx = spec.pin1Dot.lx + (Number(markersCfg.pin1Dot?.dx) || 0);
    const dotLy = spec.pin1Dot.ly + (Number(markersCfg.pin1Dot?.dy) || 0);
    const r = rotateOffset(dotLx, dotLy, cRot);
    const wx = +(cx + r.x).toFixed(3);
    const wy = +(cy + r.y).toFixed(3);
    const dia = Number(markersCfg.pin1Dot?.diameter) || spec.pin1Dot.diameter || 0.42;
    paths.push({
      id: `tether__${compName}__pin1Dot`,
      parentComp: compName,
      markerKey: "pin1Dot",
      isDot: true,
      x: wx,
      y: wy,
      diameter: dia,
      layer: markersCfg.pin1Dot?.layer || cLayer,
      strokeWidth: dia,
      route: [
        { x: +(wx - 0.004).toFixed(4), y: wy },
        { x: +(wx + 0.004).toFixed(4), y: wy }
      ]
    });
  }

  // 3. Tethered text markers (ref, plus, minus, or custom child markers)
  const defaultMarkers = spec.defaultMarkers || {};
  const allMarkerKeys = new Set([...Object.keys(defaultMarkers), ...Object.keys(markersCfg)]);

  for (const mKey of allMarkerKeys) {
    if (mKey === "polarityBar" || mKey === "pin1Dot") continue;
    const def = defaultMarkers[mKey] || { text: "", lx: 0, ly: 1.5, fontSize: 0.80, rotOffset: 0, visible: true };
    const usr = markersCfg[mKey] || {};

    const visible = usr.visible !== undefined ? Boolean(usr.visible) : Boolean(def.visible);
    if (!visible) continue;

    const rawText = usr.text !== undefined ? String(usr.text) : (mKey === "ref" ? compName : String(def.text || ""));
    if (!rawText.trim()) continue;

    const lx = (def.lx || 0) + (Number(usr.dx) || 0);
    const ly = (def.ly || 0) + (Number(usr.dy) || 0);
    const r = rotateOffset(lx, ly, cRot);
    const wx = +(cx + r.x).toFixed(2);
    const wy = +(cy + r.y).toFixed(2);

    const fontSize = Number(usr.fontSize) || def.fontSize || 0.80;
    const align = usr.align || def.align || "center";
    const layer = usr.layer || cLayer;
    const finalRot = usr.rotation !== undefined
      ? Number(usr.rotation)
      : normalizeReadableTextRotation(cRot + (def.rotOffset || 0));

    texts.push({
      id: `tether__${compName}__${mKey}`,
      parentComp: compName,
      markerKey: mKey,
      text: rawText,
      x: wx,
      y: wy,
      baseLx: def.lx || 0,
      baseLy: def.ly || 0,
      dx: Number(usr.dx) || 0,
      dy: Number(usr.dy) || 0,
      fontSize,
      align,
      rotation: finalRot,
      layer
    });
  }

  return { texts, paths };
}
