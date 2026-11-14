/**
 * Parametric PCB Suite - Declarative Layout & Silkscreen Loader (layout.json)
 *
 * Bridges declarative `src/layout.json` sidecar files with:
 *  1. Node.js CLI scripts & Express server (fresh disk reads via node:fs, zero stale ESM cache)
 *  2. Static browser deployments (fetch with no-cache) & live in-memory Studio Editor overrides
 *  3. tscircuit React elements (<chip>, <platedhole>, <silkscreentext>, <silkscreenpath>)
 *  4. 1-to-1 synchronized JLCPCB CPL/PNP Pick-and-Place CSV generation
 *  5. 1-click Bootstrap extraction of layout.json from legacy circuit.js projects (02, 04)
 */

import {
  resolveComponentTetheredSilk,
  rotateOffset
} from "./silkscreen-polarity.js";
import { createCplCsv } from "./export-utils.js";

/**
 * Loads a project's `layout.json` in both Node.js (fresh fs read) and Browser (fetch).
 */
export async function loadLayoutJson(importMetaUrl, relativePath = "./layout.json") {
  const resolvedUrl = new URL(relativePath, importMetaUrl);

  if (typeof process !== "undefined" && process.versions?.node && resolvedUrl.protocol === "file:") {
    const fs = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const diskPath = fileURLToPath(resolvedUrl);
    const raw = fs.readFileSync(diskPath, "utf8");
    return JSON.parse(raw);
  }

  const res = await fetch(resolvedUrl.href, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch layout.json from ${resolvedUrl.href} (HTTP ${res.status})`);
  }
  return await res.json();
}

/**
 * Retrieves component placement from layout.json and formats tscircuit props.
 */
export function getComponentProps(layout, name, fallback = {}) {
  const entry = layout?.components?.[name] || {};
  const x = entry.x !== undefined ? Number(entry.x) : (Number(fallback.x) || 0);
  const y = entry.y !== undefined ? Number(entry.y) : (Number(fallback.y) || 0);
  const rotation = entry.rotation !== undefined ? Number(entry.rotation) : (Number(fallback.rotation) || 0);
  const layer = entry.layer || fallback.layer || "top";

  const pcbProps = {
    name,
    key: fallback.key || name.toLowerCase(),
    pcbX: `${x.toFixed(2)}mm`,
    pcbY: `${y.toFixed(2)}mm`
  };
  if (rotation !== 0) {
    pcbProps.pcbRotation = rotation;
  }

  return {
    x,
    y,
    rotation,
    layer,
    entry,
    pcbProps
  };
}

/**
 * Builds all tscircuit React silkscreen elements (<silkscreentext> & <silkscreenpath>)
 * from both tethered component polarity/ref markers AND freeform `layout.silkscreen` items.
 *
 * Returns { elements, textMeta, pathMeta } so compiled circuitJson items can be tagged with editor_id.
 */
export function emitLayoutSilkscreen(React, layout = {}, options = {}) {
  const { silkScale = 1.0 } = options;
  const elements = [];
  const textMeta = [];
  const pathMeta = [];

  const pushText = (meta) => {
    const fsMm = Math.max(0.2, (Number(meta.fontSize) || 0.80) * silkScale);
    const props = {
      key: meta.id,
      text: String(meta.text),
      layer: meta.layer || "top",
      fontSize: `${fsMm.toFixed(2)}mm`,
      anchorAlignment: meta.align || "center",
      pcbX: `${Number(meta.x).toFixed(2)}mm`,
      pcbY: `${Number(meta.y).toFixed(2)}mm`
    };
    const rot = Number(meta.rotation) || 0;
    if (rot !== 0) {
      props.pcbRotation = rot;
      props.ccwRotation = rot;
    }
    elements.push(React.createElement("silkscreentext", props));
    textMeta.push(meta);
  };

  const pushPath = (meta) => {
    if (!Array.isArray(meta.route) || meta.route.length < 2) return;
    const sw = Math.max(0.15, Number(meta.strokeWidth) || 0.18);
    elements.push(React.createElement("silkscreenpath", {
      key: meta.id,
      layer: meta.layer || "top",
      strokeWidth: `${sw.toFixed(3)}mm`,
      route: meta.route.map(pt => ({ x: +Number(pt.x).toFixed(4), y: +Number(pt.y).toFixed(4) }))
    }));
    pathMeta.push(meta);
  };

  // 1. Tethered Component Polarity, Pin-1 Dots & Ref Designators
  const comps = layout?.components || {};
  for (const [compName, compData] of Object.entries(comps)) {
    const { texts, paths } = resolveComponentTetheredSilk(compName, compData);
    texts.forEach(t => pushText(t));
    paths.forEach(p => pushPath(p));
  }

  // 2. Freeform Silkscreen Items
  const freeItems = Array.isArray(layout?.silkscreen) ? layout.silkscreen : [];
  freeItems.forEach((item, idx) => {
    if (!item || item.visible === false) return;
    const id = item.id || `silk_item_${idx}`;
    const type = item.type || "text";
    const layer = item.layer || "top";

    if (type === "text") {
      if (!String(item.text ?? "").trim()) return;
      pushText({
        id,
        freeformId: id,
        text: String(item.text),
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        fontSize: Number(item.fontSize) || 1.00,
        align: item.align || "center",
        rotation: Number(item.rotation) || 0,
        layer
      });
    } else if (type === "dot") {
      const cx = Number(item.x) || 0;
      const cy = Number(item.y) || 0;
      const dia = Math.max(0.20, Number(item.diameter || item.strokeWidth) || 0.45);
      pushPath({
        id,
        freeformId: id,
        isDot: true,
        x: cx,
        y: cy,
        diameter: dia,
        layer,
        strokeWidth: dia,
        route: [
          { x: +(cx - 0.004).toFixed(4), y: cy },
          { x: +(cx + 0.004).toFixed(4), y: cy }
        ]
      });
    } else if (type === "box") {
      const cx = Number(item.x) || 0;
      const cy = Number(item.y) || 0;
      const hw = Math.max(0.2, (Number(item.width) || 2.0) / 2);
      const hh = Math.max(0.2, (Number(item.height) || 2.0) / 2);
      const rot = Number(item.rotation) || 0;
      const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
        { x: -hw, y: -hh }
      ].map(pt => {
        const r = rotateOffset(pt.x, pt.y, rot);
        return { x: cx + r.x, y: cy + r.y };
      });
      pushPath({
        id,
        freeformId: id,
        shapeType: "box",
        x: cx,
        y: cy,
        width: hw * 2,
        height: hh * 2,
        rotation: rot,
        layer,
        strokeWidth: Number(item.strokeWidth) || 0.18,
        route: corners
      });
    } else if (type === "cathode_bar") {
      const cx = Number(item.x) || 0;
      const cy = Number(item.y) || 0;
      const hw = Math.max(0.2, (Number(item.width) || 1.1) / 2);
      const hh = Math.max(0.2, (Number(item.height) || 1.6) / 2);
      const rot = Number(item.rotation) || 0;
      const uPts = [
        { x: hw, y: hh },
        { x: -hw, y: hh },
        { x: -hw, y: -hh },
        { x: hw, y: -hh }
      ].map(pt => {
        const r = rotateOffset(pt.x, pt.y, rot);
        return { x: cx + r.x, y: cy + r.y };
      });
      pushPath({
        id,
        freeformId: id,
        shapeType: "cathode_bar",
        x: cx,
        y: cy,
        width: hw * 2,
        height: hh * 2,
        rotation: rot,
        layer,
        strokeWidth: Number(item.strokeWidth) || 0.22,
        route: uPts
      });
    } else if (type === "line") {
      let route;
      if (item.x1 !== undefined && item.y1 !== undefined && item.x2 !== undefined && item.y2 !== undefined) {
        route = [
          { x: Number(item.x1) || 0, y: Number(item.y1) || 0 },
          { x: Number(item.x2) || 0, y: Number(item.y2) || 0 }
        ];
      } else {
        const cx = Number(item.x) || 0;
        const cy = Number(item.y) || 0;
        const halfLen = Math.max(0.15, (Number(item.length || item.width) || 2.0) / 2);
        const rot = Number(item.rotation) || 0;
        const p1 = rotateOffset(-halfLen, 0, rot);
        const p2 = rotateOffset(halfLen, 0, rot);
        route = [{ x: cx + p1.x, y: cy + p1.y }, { x: cx + p2.x, y: cy + p2.y }];
      }
      pushPath({
        id,
        freeformId: id,
        shapeType: "line",
        layer,
        strokeWidth: Number(item.strokeWidth) || 0.20,
        route
      });
    } else if (type === "path" && Array.isArray(item.route)) {
      pushPath({
        id,
        freeformId: id,
        shapeType: "path",
        layer,
        strokeWidth: Number(item.strokeWidth) || 0.18,
        route: item.route
      });
    }
  });

  return { elements, textMeta, pathMeta };
}

/**
 * Attaches `.editor_id`, `.parent_comp`, and `.marker_key` metadata onto compiled
 * `pcb_silkscreen_text` and `pcb_silkscreen_path` entries inside `circuitJson`.
 */
export function tagCircuitJsonSilkscreenIds(circuitJson, silkMeta, pathStartOffset = 0, textStartOffset = 0) {
  if (!Array.isArray(circuitJson) || !silkMeta) return circuitJson;

  const texts = circuitJson.filter(e => e.type === "pcb_silkscreen_text");
  const paths = circuitJson.filter(e => e.type === "pcb_silkscreen_path");

  (silkMeta.textMeta || []).forEach((meta, i) => {
    const target = texts[textStartOffset + i];
    if (target) {
      target.editor_id = meta.id;
      if (meta.parentComp) target.parent_comp = meta.parentComp;
      if (meta.markerKey) target.marker_key = meta.markerKey;
      if (meta.freeformId) target.freeform_id = meta.freeformId;
    }
  });

  (silkMeta.pathMeta || []).forEach((meta, i) => {
    const target = paths[pathStartOffset + i];
    if (target) {
      target.editor_id = meta.id;
      if (meta.parentComp) target.parent_comp = meta.parentComp;
      if (meta.markerKey) target.marker_key = meta.markerKey;
      if (meta.freeformId) target.freeform_id = meta.freeformId;
      if (meta.isDot) target.is_dot = true;
    }
  });

  return circuitJson;
}

/**
 * Builds 100% layout-synchronized JLCPCB CPL CSV from `layout.components` + SMT part specs.
 * `smtSpecs`: Array of `{ designator, jlcRotOffset = 0, defaultLayer = "Top" }`
 */
export function createSyncedCplCsv(layout, smtSpecs = []) {
  const cplRows = smtSpecs.map(spec => {
    const entry = layout?.components?.[spec.designator] || {};
    const x = Number(entry.x) || 0;
    const y = Number(entry.y) || 0;
    const cadRot = Number(entry.rotation) || 0;
    const rot = (((cadRot + (spec.jlcRotOffset || 0)) % 360) + 360) % 360;
    const rawLayer = String(entry.layer || spec.defaultLayer || "top").toLowerCase();
    const layer = rawLayer === "bottom" ? "Bottom" : "Top";
    return {
      designator: spec.designator,
      x,
      y,
      layer,
      rot
    };
  });
  return createCplCsv(cplRows);
}

/**
 * Infers a best-match footprint type name from component designator & pad count when bootstrapping
 * a legacy `circuitJson` project (like 02 or 04) into a fresh `layout.json`.
 */
function inferFootprintType(name = "", padCount = 2, isTht = false) {
  const u = name.toUpperCase();
  if (u.startsWith("H_") || /^H\d+$/.test(u)) return "MountingHoleM3";
  if (u === "U_MCU" && isTht) return "ESP32C3_SuperMini";
  if (u === "U_IMU" && isTht) return "UniversalIMU_8Pin";
  if (u.includes("CHG")) return "SOT23_5_Charger";
  if (u.includes("LDO")) return "ME6211_SOT23_5";
  if (u.startsWith("Q_")) return u.includes("PWR") ? "SOT23_PMOSFET" : "SOT23_MOSFET";
  if (u.includes("LED") && u.startsWith("D_")) return "Led0603";
  if (u.startsWith("D_")) return "DiodeSOD123";
  if (u.startsWith("R_")) return "Resistor0603";
  if (u.startsWith("C_")) return "Capacitor0603";
  if (u === "J_BAT") return "BatteryPads";
  if (u.startsWith("J_HAP")) return "HapticMotorOutput";
  if (u.startsWith("J_LED")) return "LEDOutputHeader";
  if (u === "SW_EXT") return "ExternalSwitchPads";
  if (u.includes("MAX")) return "MAX4466_Header";
  if (u.includes("INMP")) return "INMP441_DualRow_Header";
  if (padCount === 4 && isTht) return "Header4Pin";
  return "Resistor0603";
}

/**
 * Extracts a declarative `layout.json` structure from any compiled `circuitJson` array.
 * Enables 1-click "Bootstrap layout.json" in `editor.html` for legacy boards (02, 04).
 */
export function bootstrapLayoutFromCircuitJson(circuitJson, options = {}) {
  const boardItem = circuitJson.find(i => i.type === "pcb_board");
  const width = options.boardWidth || boardItem?.width || 38;
  const length = options.boardLength || boardItem?.height || 38;

  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));

  const components = {};

  // 1. Extract PCB Components
  circuitJson.filter(e => e.type === "pcb_component").forEach(pc => {
    const sc = scMap.get(pc.source_component_id);
    const name = sc?.name || pc.name;
    if (!name) return;

    const compPads = circuitJson.filter(p => p.type === "pcb_smtpad" && p.pcb_component_id === pc.pcb_component_id);
    const compHoles = circuitJson.filter(h => h.type === "pcb_plated_hole" && h.pcb_component_id === pc.pcb_component_id);
    const fp = inferFootprintType(name, compPads.length + compHoles.length, compHoles.length > 0);

    components[name] = {
      footprint: fp,
      x: +(pc.center?.x ?? 0).toFixed(2),
      y: +(pc.center?.y ?? 0).toFixed(2),
      rotation: Number(pc.rotation) || 0,
      layer: pc.layer || "top",
      markers: {
        ref: { text: name, fontSize: 0.80, visible: true }
      }
    };
  });

  // 2. Extract Standalone Mounting Holes
  circuitJson.filter(e => e.type === "pcb_plated_hole" && !ppMap.get(e.pcb_port_id)).forEach((h, i) => {
    const hint = h.port_hints?.[0] || h.name || `H_${i + 1}`;
    components[hint] = {
      footprint: "MountingHoleM3",
      x: +(h.x ?? 0).toFixed(2),
      y: +(h.y ?? 0).toFixed(2),
      rotation: 0,
      layer: "top",
      holeDiameter: h.hole_diameter || 3.2,
      outerDiameter: h.outer_diameter || 4.8,
      markers: {}
    };
  });

  // 3. Extract Silkscreen Text Items (auto-clamping micro fonts up to 0.80mm option)
  const silkscreen = [];
  circuitJson.filter(e => e.type === "pcb_silkscreen_text").forEach((st, idx) => {
    silkscreen.push({
      id: st.editor_id || `st_${idx + 1}`,
      type: "text",
      text: st.text,
      x: +(st.anchor_position?.x ?? 0).toFixed(2),
      y: +(st.anchor_position?.y ?? 0).toFixed(2),
      layer: st.layer || "top",
      fontSize: +(st.font_size || 0.80).toFixed(2),
      align: st.anchor_alignment || "center",
      rotation: st.ccw_rotation || 0,
      visible: true
    });
  });

  return {
    version: 1,
    board: { width, length },
    components,
    silkscreen
  };
}
