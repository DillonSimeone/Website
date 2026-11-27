/**
 * Parametric PCB Suite - JLCPCB Silkscreen & Polarity DRC Engine
 *
 * Audits silkscreen legibility and manufacturability against real-world JLCPCB CAM rules:
 *  1. Minimum Character Height (>= 0.80mm; flags illegible micro-fonts like 0.42mm-0.60mm)
 *  2. Gerber Alphabet Compatibility (flags Unicode glyphs silently dropped by @tscircuit/alphabet)
 *  3. Silkscreen-over-Copper-Pad Collisions (exact OBB-vs-Rect & OBB-vs-Circle checks per layer)
 *  4. Board Edge Clipping (silkscreen must stay >= 0.25mm inside board outline)
 *  5. Missing Diode / LED / Polarized Connector / IC Pin-1 Markings
 */

import {
  JLCPCB_MIN_FONT_MM,
  FOOTPRINT_POLARITY_SPECS,
  computeGerberTextBox,
  findUnsupportedGerberChars
} from "./silkscreen-polarity.js";

/**
 * Exact distance from a circle (px, py, radius) to an oriented bounding box (box).
 * Negative value = physical overlap; < clearance = mask clearance violation.
 */
function circleToTextObbGap(box, px, py, radius) {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const effectiveRot = box.layer === "bottom" ? -(box.rotation || 0) : (box.rotation || 0);
  const rad = (-effectiveRot * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const clampedX = Math.max(-halfW, Math.min(halfW, lx));
  const clampedY = Math.max(-halfH, Math.min(halfH, ly));
  return Math.hypot(lx - clampedX, ly - clampedY) - radius;
}

/**
 * Exact Separating Axis Theorem (SAT) edge-to-edge gap check between an oriented text box
 * and an axis-aligned rectangular SMT pad expanded by `margin`.
 * Returns true if they intersect within `margin`.
 */
function textObbIntersectsRect(box, rect, margin = 0.10) {
  const rMinX = rect.minX - margin;
  const rMaxX = rect.maxX + margin;
  const rMinY = rect.minY - margin;
  const rMaxY = rect.maxY + margin;

  // Fast AABB reject
  if (box.maxX < rMinX || box.minX > rMaxX || box.maxY < rMinY || box.minY > rMaxY) {
    return false;
  }

  const rectCorners = [
    { x: rMinX, y: rMinY },
    { x: rMaxX, y: rMinY },
    { x: rMaxX, y: rMaxY },
    { x: rMinX, y: rMaxY }
  ];

  const c = box.corners;
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: c[1].x - c[0].x, y: c[1].y - c[0].y },
    { x: c[3].x - c[0].x, y: c[3].y - c[0].y }
  ];

  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.y);
    if (len < 1e-9) continue;
    const ax = axis.x / len;
    const ay = axis.y / len;

    let minA = Infinity, maxA = -Infinity;
    for (const pt of c) {
      const proj = pt.x * ax + pt.y * ay;
      if (proj < minA) minA = proj;
      if (proj > maxA) maxA = proj;
    }

    let minB = Infinity, maxB = -Infinity;
    for (const pt of rectCorners) {
      const proj = pt.x * ax + pt.y * ay;
      if (proj < minB) minB = proj;
      if (proj > maxB) maxB = proj;
    }

    if (maxA < minB || maxB < minA) {
      return false; // Separating axis found!
    }
  }
  return true;
}

/**
 * Shortest distance from line segment AB to point P.
 */
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * Checks if segment AB (expanded by halfStroke + margin) intersects axis-aligned rect.
 */
function segmentIntersectsRect(ax, ay, bx, by, rect, padMargin = 0.10) {
  const minX = rect.minX - padMargin;
  const maxX = rect.maxX + padMargin;
  const minY = rect.minY - padMargin;
  const maxY = rect.maxY + padMargin;

  if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(ay, by) < minY || Math.min(ay, by) > maxY) {
    return false;
  }

  // Sample along segment for robust sub-0.05mm precision
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(dist / 0.15));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
  }
  return false;
}

/**
 * Runs full JLCPCB silkscreen & polarity DRC against compiled circuitJson + optional layout.json.
 */
export function runSilkscreenDrc(circuitJson, options = {}) {
  const {
    boardWidth: optW,
    boardHeight: optH,
    silkScale = 1.0,
    padClearance = 0.10,
    edgeMargin = 0.25,
    layout = null
  } = options;

  if (!Array.isArray(circuitJson)) {
    return { ok: true, errors: [], warnings: [], violationsById: {}, textBoxes: [] };
  }

  const boardItem = circuitJson.find(i => i.type === "pcb_board");
  const boardW = optW || boardItem?.width || 38;
  const boardH = optH || boardItem?.height || 38;
  const halfW = boardW / 2;
  const halfH = boardH / 2;

  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));

  // Exposed copper pads per layer
  const smtPads = circuitJson.filter(e => e.type === "pcb_smtpad").map(p => {
    const cx = p.x ?? p.center?.x ?? 0;
    const cy = p.y ?? p.center?.y ?? 0;
    const w = p.width ?? (p.radius ? p.radius * 2 : 0.6);
    const h = p.height ?? w;
    const sp = ppMap.get(p.pcb_port_id);
    const comp = sp ? (scMap.get(sp.source_component_id) || "SMD") : "SMD";
    return {
      label: `${comp}${sp ? "." + sp.name : ""}`,
      layer: p.layer || "top",
      shape: p.shape === "circle" ? "circle" : "rect",
      cx,
      cy,
      radius: w / 2,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: cy - h / 2,
      maxY: cy + h / 2
    };
  });

  // Plated through-holes & unplated mechanical holes penetrate BOTH top and bottom layers
  const throughHoles = [
    ...circuitJson.filter(e => e.type === "pcb_plated_hole").map(h => {
      const sp = ppMap.get(h.pcb_port_id);
      const comp = sp ? (scMap.get(sp.source_component_id) || "Hole") : (h.port_hints?.[0] || "Hole");
      return {
        label: `${comp}${sp ? "." + sp.name : ""}`,
        cx: h.x ?? 0,
        cy: h.y ?? 0,
        radius: (h.outer_diameter || h.hole_diameter || 1.8) / 2
      };
    }),
    ...circuitJson.filter(e => e.type === "pcb_hole").map(h => ({
      label: "DrillHole",
      cx: h.x ?? 0,
      cy: h.y ?? 0,
      radius: (h.hole_diameter || 1.0) / 2
    }))
  ];

  const errors = [];
  const warnings = [];
  const violationsById = {};
  const textBoxes = [];

  const recordViolation = (id, severity, kind, message) => {
    if (!id) return;
    if (!violationsById[id]) violationsById[id] = [];
    violationsById[id].push({ severity, kind, message });
  };

  // 1. Audit Silkscreen Text Items
  const silkTexts = circuitJson.filter(e => e.type === "pcb_silkscreen_text");
  silkTexts.forEach((item, idx) => {
    const id = item.editor_id || item.pcb_silkscreen_text_id || `silk_text_${idx}`;
    const box = computeGerberTextBox(item, silkScale);
    box.id = id;
    box.text = item.text;
    textBoxes.push(box);

    // 1a. Minimum JLCPCB Font Size Check (0.80mm)
    if (box.fontSize < JLCPCB_MIN_FONT_MM - 0.005) {
      const msg = `Silkscreen "${item.text}" (${box.layer}): font ${box.fontSize.toFixed(2)}mm < ${JLCPCB_MIN_FONT_MM.toFixed(2)}mm JLCPCB legible minimum`;
      warnings.push({ text: msg, id, kind: "tiny_font" });
      recordViolation(id, "warn", "tiny_font", msg);
    }

    // 1b. Gerber Alphabet Support Check
    const badChars = findUnsupportedGerberChars(item.text);
    if (badChars.length > 0) {
      const msg = `Silkscreen "${item.text}": unsupported Gerber glyph(s) [${badChars.join(" ")}] will vanish in .gto/.gbo`;
      errors.push({ text: msg, id, kind: "unsupported_char" });
      recordViolation(id, "error", "unsupported_char", msg);
    }

    // 1c. Board Outline Clipping Check
    if (
      box.minX < -halfW + edgeMargin ||
      box.maxX > halfW - edgeMargin ||
      box.minY < -halfH + edgeMargin ||
      box.maxY > halfH - edgeMargin
    ) {
      const msg = `Silkscreen "${item.text}" (${box.layer}): extends within ${edgeMargin}mm of board cut edge`;
      warnings.push({ text: msg, id, kind: "board_edge" });
      recordViolation(id, "error", "board_edge", msg);
    }

    // 1d. Exposed Copper Pad Overlap Check (same layer SMT pads)
    let hitPadLabel = null;
    for (const pad of smtPads) {
      if (pad.layer !== box.layer) continue;
      const hit = pad.shape === "circle"
        ? circleToTextObbGap(box, pad.cx, pad.cy, pad.radius) < padClearance
        : textObbIntersectsRect(box, pad, padClearance);
      if (hit) {
        hitPadLabel = pad.label;
        break;
      }
    }

    // 1e. Plated / Unplated Through-Hole Overlap Check (both layers)
    if (!hitPadLabel) {
      for (const hole of throughHoles) {
        if (circleToTextObbGap(box, hole.cx, hole.cy, hole.radius) < padClearance) {
          hitPadLabel = hole.label;
          break;
        }
      }
    }

    if (hitPadLabel) {
      const msg = `Silkscreen "${item.text}" (${box.layer}): overlaps exposed copper pad/hole ${hitPadLabel} (JLCPCB will clip letters)`;
      warnings.push({ text: msg, id, kind: "pad_overlap" });
      recordViolation(id, "error", "pad_overlap", msg);
    }
  });

  // 2. Audit Non-QR Silkscreen Paths (Cathode bars, Pin-1 dots, custom boxes/lines)
  const silkPaths = circuitJson.filter(e => e.type === "pcb_silkscreen_path");
  silkPaths.forEach((p, idx) => {
    const id = p.editor_id || p.pcb_silkscreen_path_id || `silk_path_${idx}`;
    // Skip dense QR raster scanlines from individual stroke warnings if already inside keepout
    if (String(id).startsWith("qr_p_")) return;

    const route = p.route || [];
    if (route.length < 2) return;
    const layer = p.layer || "top";
    const halfStroke = (p.stroke_width || 0.18) / 2;

    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      if (
        Math.min(a.x, b.x) - halfStroke < -halfW + 0.10 ||
        Math.max(a.x, b.x) + halfStroke > halfW - 0.10 ||
        Math.min(a.y, b.y) - halfStroke < -halfH + 0.10 ||
        Math.max(a.y, b.y) + halfStroke > halfH - 0.10
      ) {
        const msg = `Silkscreen graphic (${id}, ${layer}): extends outside board edge`;
        warnings.push({ text: msg, id, kind: "board_edge" });
        recordViolation(id, "error", "board_edge", msg);
        break;
      }

      let hitPad = null;
      for (const pad of smtPads) {
        if (pad.layer !== layer) continue;
        if (segmentIntersectsRect(a.x, a.y, b.x, b.y, pad, halfStroke + padClearance * 0.6)) {
          hitPad = pad.label;
          break;
        }
      }
      if (!hitPad) {
        for (const hole of throughHoles) {
          if (pointToSegmentDist(hole.cx, hole.cy, a.x, a.y, b.x, b.y) < hole.radius + halfStroke + padClearance * 0.6) {
            hitPad = hole.label;
            break;
          }
        }
      }
      if (hitPad) {
        const msg = `Silkscreen graphic (${id}, ${layer}): overlaps copper pad/hole ${hitPad}`;
        warnings.push({ text: msg, id, kind: "pad_overlap" });
        recordViolation(id, "error", "pad_overlap", msg);
        break;
      }
    }
  });

  // 3. Audit Polarity & Pin-1 Presence when layout.json is supplied
  if (layout && layout.components) {
    for (const [compName, compData] of Object.entries(layout.components)) {
      const spec = FOOTPRINT_POLARITY_SPECS[compData.footprint];
      if (!spec) continue;
      const m = compData.markers || {};

      if (spec.requiresPolarity) {
        const hasBar = Array.isArray(spec.polarityPaths) && m.polarityBar?.visible !== false;
        const hasPlusMinus = (spec.defaultMarkers?.plus && m.plus?.visible !== false) ||
                             (spec.defaultMarkers?.minus && m.minus?.visible !== false);
        if (!hasBar && !hasPlusMinus) {
          const msg = `Component ${compName} (${compData.footprint}): missing +/- and cathode polarity silkscreen (JLCPCB DFM requirement)`;
          warnings.push({ text: msg, id: `comp__${compName}`, kind: "missing_polarity" });
          recordViolation(`comp__${compName}`, "warn", "missing_polarity", msg);
        }
      }

      if (spec.requiresPin1 && spec.pin1Dot && m.pin1Dot?.visible === false) {
        const msg = `IC ${compName} (${compData.footprint}): Pin-1 indicator dot is hidden (JLCPCB SMT orientation risk)`;
        warnings.push({ text: msg, id: `comp__${compName}`, kind: "missing_pin1" });
        recordViolation(`comp__${compName}`, "warn", "missing_pin1", msg);
      }
    }
  }

  return {
    ok: errors.length === 0 && warnings.length === 0,
    errors,
    warnings,
    violationsById,
    textBoxes
  };
}
