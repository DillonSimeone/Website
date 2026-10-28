/**
 * ============================================================================
 * Parametric PCB & Silkscreen Studio Workbench (editor.html)
 * ============================================================================
 * - Compiles the project's circuit.js ONCE for copper geometry (pads, holes, traces).
 * - Re-derives ALL editable silkscreen (tethered polarity/ref markers + freeform items)
 *   live from the in-memory layout.json at 60 FPS — no tscircuit recompile while dragging.
 * - Components drag/rotate with their pads transformed live; traces go "stale" (dimmed)
 *   until you hit 🔀 Route.
 * - Live JLCPCB silkscreen DRC via shared/silkscreen-drc.js on a synthetic circuitJson.
 * - Saves to <project>/src/layout.json through shared/studio-server.mjs (or downloads
 *   layout.json when running on a static host).
 * ============================================================================
 */

import {
  FONT_SIZE_PRESETS,
  JLCPCB_MIN_FONT_MM,
  findUnsupportedGerberChars,
  computeGerberTextBox,
  rotateOffset,
  worldDeltaToLocal,
  FOOTPRINT_POLARITY_SPECS
} from "./silkscreen-polarity.js";
import { runSilkscreenDrc } from "./silkscreen-drc.js";
import { emitLayoutSilkscreen, bootstrapLayoutFromCircuitJson } from "./layout-loader.js";

// ---------------------------------------------------------------------------
// Project registry (mirrors shared/studio-server.mjs)
// ---------------------------------------------------------------------------
const PROJECTS = [
  { id: "03", slug: "03-compactAudioMotionSquarePCB", width: 38, length: 38 },
  { id: "00", slug: "00-starterPCB", width: 40, length: 40 },
  { id: "02", slug: "02-audioMotionReactiveLedHapticPCB", width: 20, length: 120 },
  { id: "04", slug: "04-smdAudioMotionBatonPCB", width: 22, length: 110 }
];

const PPI_STORAGE_KEY = "pcbStudio.cssPxPerInch";
const fakeReact = { createElement: (type, props) => ({ type, props }) };

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const svg = $("cad-svg");
const wrap = $("cad-canvas-wrap");
const rulerTop = $("ruler-top");
const rulerLeft = $("ruler-left");
const inspectorRoot = $("inspector-root");
const treeList = $("object-tree-list");
const drcBadge = $("drc-summary-badge");
const drcList = $("drc-violation-list");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const S = {
  project: null,
  mod: null,
  circuit: null,
  compiled: [],
  compiledPose: {},
  layout: null,
  layoutExistsOnDisk: false,
  legacy: false,
  copper: [],
  traces: [],
  staticSilk: [],
  qrPaths: [],
  qrOrigin: null,
  silkTexts: [],
  silkPaths: [],
  silkIndex: new Map(),
  drc: { errors: [], warnings: [], violationsById: {} },
  drcSignature: "",
  view: { tx: 0, ty: 0, s: 12, flipped: false },
  tool: "select",
  snap: 0.1,
  stampSide: "top",
  layers: { topSilk: true, bottomSilk: true, pads: true, topCopper: true, bottomCopper: true, courtyards: true, textBoxes: true },
  selection: null,
  drag: null,
  spaceHeld: false,
  cursor: { x: 0, y: 0 },
  measures: [],
  measureStart: null,
  measureHover: null,
  undo: [],
  redo: [],
  dirty: false,
  tracesStale: false,
  apiBase: null,
  cssPxPerInch: parseFloat(localStorage.getItem(PPI_STORAGE_KEY)) || 96,
  treeTab: "all",
  treeFilter: "",
  inspUndoArmed: false,
  viewer3D: null,
  renderQueued: false,
  busy: false
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const r3 = (v) => +(+v).toFixed(3);
const clone = (o) => JSON.parse(JSON.stringify(o));

function snapV(v, ev) {
  const g = S.snap;
  if (!g || ev?.altKey) return r3(v);
  return r3(Math.round(v / g) * g);
}

function boardSize() {
  return {
    w: num(S.layout?.board?.width, S.project?.width || 38),
    l: num(S.layout?.board?.length, S.project?.length || 38)
  };
}

function pxFeel(mm) {
  let best = FONT_SIZE_PRESETS[0];
  for (const p of FONT_SIZE_PRESETS) {
    if (Math.abs(p.mm - mm) < Math.abs(best.mm - mm)) best = p;
  }
  return Math.abs(best.mm - mm) < 0.06 ? best.pxLabel : `~${best.pxLabel}`;
}

let toastTimer = null;
function toast(msg, kind = "", ms = 2600) {
  const el = $("studio-toast");
  el.textContent = msg;
  el.className = `studio-toast ${kind ? "toast-" + kind : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function setBusy(on, msg = "⚡ Compiling PCB…") {
  S.busy = on;
  const pill = $("compile-pill");
  pill.textContent = msg;
  pill.hidden = !on;
}

// World <-> Screen
const X = (x) => S.view.tx + (S.view.flipped ? -x : x) * S.view.s;
const Y = (y) => S.view.ty - y * S.view.s;
function toWorld(sx, sy) {
  return {
    x: ((sx - S.view.tx) / S.view.s) * (S.view.flipped ? -1 : 1),
    y: (S.view.ty - sy) / S.view.s
  };
}
function eventScreen(ev) {
  const r = svg.getBoundingClientRect();
  return { sx: ev.clientX - r.left, sy: ev.clientY - r.top };
}

// ---------------------------------------------------------------------------
// Server detection
// ---------------------------------------------------------------------------
async function probeServer() {
  const pill = $("server-status-pill");
  const candidates = [""];
  if (location.port !== "3457") candidates.push("http://localhost:3457");
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 700);
      const res = await fetch(`${base}/api/health`, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json();
        if (j?.studio) {
          S.apiBase = base;
          pill.className = "status-pill status-live";
          pill.textContent = "● Disk Save Live";
          pill.title = "Connected to shared/studio-server.mjs — Ctrl+S writes src/layout.json directly";
          return;
        }
      }
    } catch { /* try next */ }
  }
  S.apiBase = null;
  pill.className = "status-pill status-static";
  pill.textContent = "● Static (Download Mode)";
  pill.title = "Run `npm run studio` or LaunchStudio.bat for direct disk save & Publish Fab";
  $("btn-publish-fab").disabled = true;
}

// ---------------------------------------------------------------------------
// Project loading & compilation
// ---------------------------------------------------------------------------
async function loadProject(id) {
  const proj = PROJECTS.find(p => p.id === id) || PROJECTS[0];
  S.project = proj;
  S.selection = null;
  S.measures = [];
  S.measureStart = null;
  S.undo = [];
  S.redo = [];
  S.dirty = false;
  updateDirtyUi();
  $("select-project").value = proj.id;
  $("link-showcase").href = `./${proj.slug}/index.html`;
  const url = new URL(location.href);
  url.searchParams.set("project", proj.id);
  history.replaceState(null, "", url);
  document.title = `PCB Studio — ${proj.slug}`;

  setBusy(true, `⚡ Loading ${proj.slug}…`);
  try {
    // 1. layout.json
    let layout = null;
    let exists = false;
    if (S.apiBase !== null) {
      const res = await fetch(`${S.apiBase}/api/layout/${proj.id}`, { cache: "no-store" });
      const j = await res.json();
      exists = !!j.exists;
      layout = j.layout || null;
    } else {
      try {
        const res = await fetch(`./${proj.slug}/src/layout.json`, { cache: "no-cache" });
        if (res.ok) { layout = await res.json(); exists = true; }
      } catch { /* none */ }
    }
    S.layoutExistsOnDisk = exists;

    // 2. circuit module
    S.mod = await import(`../${proj.slug}/src/circuit.js`);
    S.layout = layout;
    await compileProject(false);

    // 3. Bootstrap in-memory layout for legacy boards
    if (!S.layout) {
      S.layout = bootstrapLayoutFromCircuitJson(S.compiled, { boardWidth: proj.width, boardLength: proj.length });
      snapshotCompiledPose();
    }
    normalizeLayout();
    S.legacy = !S.circuit?.__layout && !S.compiled.some(e => e.editor_id && !String(e.editor_id).startsWith("qr_"));
    $("bootstrap-banner").hidden = S.layoutExistsOnDisk;

    buildCopperIndex();
    deriveSilk();
    fitView();
    renderTree();
    renderInspector();
    scheduleRender();
    if (S.legacy && S.layoutExistsOnDisk) {
      toast(`${proj.slug}: circuit.js doesn't read layout.json yet. Edits save, but the fab export won't change until circuit.js is wired up (see 00/03).`, "error", 7000);
    }
  } catch (err) {
    console.error(err);
    toast(`Failed to load ${proj.slug}: ${err.message}`, "error", 6000);
  } finally {
    setBusy(false);
  }
}

function normalizeLayout() {
  const L = S.layout;
  L.version ||= 1;
  L.board ||= { width: S.project.width, length: S.project.length };
  L.components ||= {};
  if (!Array.isArray(L.silkscreen)) L.silkscreen = [];
  L.silkscreen.forEach((it, i) => { if (!it.id) it.id = `silk_item_${i}`; });
}

function snapshotCompiledPose() {
  S.compiledPose = {};
  for (const [name, c] of Object.entries(S.layout?.components || {})) {
    S.compiledPose[name] = { x: num(c.x), y: num(c.y), rotation: num(c.rotation) };
  }
}

async function compileProject(route) {
  const { w, l } = boardSize();
  const circuit = await S.mod.compileCircuit({
    layout: S.layout || undefined,
    boardWidth: w,
    boardLength: l,
    skipRouting: !route
  });
  S.circuit = circuit;
  S.compiled = circuit.getCircuitJson();
  snapshotCompiledPose();
  S.tracesStale = false;
}

function buildCopperIndex() {
  const cj = S.compiled;
  const scName = new Map(cj.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const pcName = new Map(cj.filter(e => e.type === "pcb_component").map(c => [c.pcb_component_id, scName.get(c.source_component_id) || c.name]));
  const spMap = new Map(cj.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const ppName = new Map(cj.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)?.name]));
  const holeComps = Object.entries(S.layout?.components || {}).filter(([, c]) => c.footprint === "MountingHoleM3");

  S.copper = [];
  for (const it of cj) {
    if (it.type !== "pcb_smtpad" && it.type !== "pcb_plated_hole" && it.type !== "pcb_hole") continue;
    const x0 = it.x ?? it.center?.x ?? 0;
    const y0 = it.y ?? it.center?.y ?? 0;
    let comp = pcName.get(it.pcb_component_id) || null;
    if (!comp) {
      const m = holeComps.find(([n]) => {
        const p = S.compiledPose[n];
        return p && Math.hypot(p.x - x0, p.y - y0) < 0.06;
      });
      if (m) comp = m[0];
    }
    const isSmt = it.type === "pcb_smtpad";
    const w = isSmt ? (it.width ?? (it.radius ? it.radius * 2 : 0.6)) : (it.outer_diameter || it.hole_diameter || 1);
    const h = isSmt ? (it.height ?? w) : w;
    S.copper.push({
      src: it,
      kind: isSmt ? "smt" : (it.type === "pcb_hole" ? "npth" : "hole"),
      comp,
      pin: ppName.get(it.pcb_port_id) || "",
      shape: isSmt ? (it.shape === "circle" ? "circle" : "rect") : "circle",
      layer: it.layer || "top",
      x0, y0, w, h,
      holeR: (it.hole_diameter || 0) / 2,
      x: x0, y: y0, cw: w, ch: h
    });
  }

  S.traces = cj.filter(e => e.type === "pcb_trace");
  const compiledSilk = cj.filter(e => e.type === "pcb_silkscreen_text" || e.type === "pcb_silkscreen_path");
  S.qrPaths = compiledSilk.filter(e => String(e.editor_id || "").startsWith("qr_"));
  S.staticSilk = compiledSilk.filter(e => !e.editor_id);
  if (S.qrPaths.length) {
    const xs = S.qrPaths.flatMap(p => p.route.map(pt => pt.x));
    const ys = S.qrPaths.flatMap(p => p.route.map(pt => pt.y));
    S.qrOrigin = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    S.qrCompiledAt = { x: num(S.layout?.qr?.x, S.qrOrigin.x), y: num(S.layout?.qr?.y, S.qrOrigin.y) };
  } else {
    S.qrOrigin = null;
  }
  updateCopperPositions();
}

function updateCopperPositions() {
  let stale = false;
  for (const c of S.copper) {
    const p0 = c.comp && S.compiledPose[c.comp];
    const cur = c.comp && S.layout?.components?.[c.comp];
    if (!p0 || !cur) { c.x = c.x0; c.y = c.y0; c.cw = c.w; c.ch = c.h; continue; }
    const dRot = num(cur.rotation) - p0.rotation;
    if (dRot !== 0 || num(cur.x) !== p0.x || num(cur.y) !== p0.y) stale = true;
    const r = rotateOffset(c.x0 - p0.x, c.y0 - p0.y, dRot);
    c.x = num(cur.x) + r.x;
    c.y = num(cur.y) + r.y;
    const swap = Math.abs((((dRot % 180) + 180) % 180) - 90) < 1;
    c.cw = swap ? c.h : c.w;
    c.ch = swap ? c.w : c.h;
  }
  S.tracesStale = stale;
}

function qrOffset() {
  if (!S.qrOrigin || !S.layout?.qr) return { dx: 0, dy: 0 };
  return { dx: num(S.layout.qr.x, S.qrCompiledAt.x) - S.qrCompiledAt.x, dy: num(S.layout.qr.y, S.qrCompiledAt.y) - S.qrCompiledAt.y };
}

// ---------------------------------------------------------------------------
// Silkscreen derivation & DRC
// ---------------------------------------------------------------------------
function deriveSilk() {
  const meta = emitLayoutSilkscreen(fakeReact, S.layout, { silkScale: 1 });
  S.silkTexts = meta.textMeta;
  S.silkPaths = meta.pathMeta;
  S.silkIndex = new Map();
  S.silkTexts.forEach(t => S.silkIndex.set(t.id, { kind: "text", meta: t }));
  S.silkPaths.forEach(p => S.silkIndex.set(p.id, { kind: "path", meta: p }));
  updateCopperPositions();
}

function buildSyntheticCircuitJson() {
  const { w, l } = boardSize();
  const copperBySrc = new Map(S.copper.map(c => [c.src, c]));
  const { dx: qdx, dy: qdy } = qrOffset();
  const out = [];
  for (const it of S.compiled) {
    if (it.type === "pcb_silkscreen_text" || it.type === "pcb_silkscreen_path") {
      if (String(it.editor_id || "").startsWith("qr_")) {
        out.push({ ...it, route: it.route.map(p => ({ ...p, x: p.x + qdx, y: p.y + qdy })) });
      } else if (!it.editor_id && !S.legacy) {
        out.push(it);
      } else if (!it.editor_id && S.legacy && it.type === "pcb_silkscreen_path") {
        out.push(it);
      }
      continue;
    }
    if (it.type === "pcb_board") { out.push({ ...it, width: w, height: l }); continue; }
    if (it.type === "pcb_trace" && S.tracesStale) continue;
    const c = copperBySrc.get(it);
    if (c) {
      const moved = { ...it, x: c.x, y: c.y };
      if (c.kind === "smt") { moved.width = c.cw; moved.height = c.ch; }
      out.push(moved);
      continue;
    }
    out.push(it);
  }
  for (const t of S.silkTexts) {
    out.push({
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: t.id,
      editor_id: t.id,
      text: t.text,
      font_size: num(t.fontSize, 0.8),
      anchor_position: { x: num(t.x), y: num(t.y) },
      anchor_alignment: t.align || "center",
      ccw_rotation: num(t.rotation),
      layer: t.layer || "top"
    });
  }
  for (const p of S.silkPaths) {
    out.push({
      type: "pcb_silkscreen_path",
      pcb_silkscreen_path_id: p.id,
      editor_id: p.id,
      route: p.route,
      stroke_width: Math.max(0.15, num(p.strokeWidth, 0.18)),
      layer: p.layer || "top",
      is_dot: !!p.isDot
    });
  }
  return out;
}

function runDrc() {
  const { w, l } = boardSize();
  try {
    S.drc = runSilkscreenDrc(buildSyntheticCircuitJson(), { boardWidth: w, boardHeight: l, layout: S.layout });
  } catch (err) {
    console.warn("DRC error", err);
    S.drc = { errors: [], warnings: [], violationsById: {} };
  }
  const items = [...S.drc.errors.map(e => ({ ...e, sev: "error" })), ...S.drc.warnings.map(e => ({ ...e, sev: "warn" }))];
  const sig = items.map(i => i.text).join("|");
  if (sig === S.drcSignature) return;
  S.drcSignature = sig;
  if (items.length === 0) {
    drcBadge.className = "drc-badge pass";
    drcBadge.textContent = "✔ 0 Violations — fab ready";
  } else {
    drcBadge.className = "drc-badge warn";
    drcBadge.textContent = `⚠ ${items.length} Violation(s)`;
  }
  drcList.innerHTML = items.map(i => `
    <div class="drc-item ${i.sev === "warn" && i.kind === "tiny_font" ? "warn-only" : ""}" data-drc-id="${esc(i.id)}">${esc(i.text)}</div>
  `).join("");
  renderTree();
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------
function selInfo(sel = S.selection) {
  if (!sel) return null;
  if (sel.type === "comp") {
    const c = S.layout.components[sel.name];
    return c ? { type: "comp", name: sel.name, comp: c } : null;
  }
  if (sel.type === "qr") return { type: "qr" };
  const entry = S.silkIndex.get(sel.id);
  const meta = entry?.meta;
  if (meta?.parentComp) {
    return { type: "tether", id: sel.id, kind: entry.kind, meta, comp: meta.parentComp, key: meta.markerKey };
  }
  const item = S.layout.silkscreen.find(i => i.id === sel.id);
  if (item) return { type: "free", id: sel.id, kind: entry?.kind || (item.type === "text" ? "text" : "path"), meta, item };
  return null;
}

function markerCfg(compName, key) {
  const c = S.layout.components[compName];
  c.markers ||= {};
  c.markers[key] ||= {};
  return c.markers[key];
}

function select(sel) {
  S.selection = sel;
  renderInspector();
  renderTree();
  scheduleRender();
}

// ---------------------------------------------------------------------------
// Undo / Dirty
// ---------------------------------------------------------------------------
function pushUndo() {
  S.undo.push(JSON.stringify(S.layout));
  if (S.undo.length > 200) S.undo.shift();
  S.redo = [];
  updateDirtyUi();
}
function applySnapshot(json) {
  S.layout = JSON.parse(json);
  normalizeLayout();
  deriveSilk();
  markDirty();
  if (S.selection && !selInfo()) S.selection = null;
  renderInspector();
  renderTree();
  scheduleRender();
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.layout));
  applySnapshot(S.undo.pop());
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.layout));
  applySnapshot(S.redo.pop());
}
function markDirty() {
  S.dirty = true;
  updateDirtyUi();
  schedule3D();
}
function updateDirtyUi() {
  $("dirty-indicator").hidden = !S.dirty;
  $("btn-undo").disabled = S.undo.length === 0;
  $("btn-redo").disabled = S.redo.length === 0;
}
function changed() {
  deriveSilk();
  markDirty();
  scheduleRender();
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
function fitView() {
  const { w, l } = boardSize();
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 600;
  S.view.s = Math.max(1, Math.min((W - 70) / w, (H - 70) / l));
  S.view.tx = W / 2;
  S.view.ty = H / 2;
  $("btn-zoom-physical").classList.remove("active");
  scheduleRender();
}

function zoomPhysical() {
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 600;
  const center = toWorld(W / 2, H / 2);
  S.view.s = S.cssPxPerInch / 25.4;
  S.view.tx = W / 2 - (S.view.flipped ? -center.x : center.x) * S.view.s;
  S.view.ty = H / 2 + center.y * S.view.s;
  $("btn-zoom-physical").classList.add("active");
  scheduleRender();
  toast(`1:1 real size @ ${S.cssPxPerInch} px/in — hold the board next to your screen. Calibrate with 💳 if needed.`);
}

function zoomAt(sx, sy, factor) {
  const w = toWorld(sx, sy);
  S.view.s = Math.min(400, Math.max(0.8, S.view.s * factor));
  S.view.tx = sx - (S.view.flipped ? -w.x : w.x) * S.view.s;
  S.view.ty = sy + w.y * S.view.s;
  $("btn-zoom-physical").classList.remove("active");
  scheduleRender();
}

function toggleFlip() {
  const W = wrap.clientWidth;
  S.view.flipped = !S.view.flipped;
  S.view.tx = W - S.view.tx;
  $("btn-flip-board").classList.toggle("active", S.view.flipped);
  $("status-view-side").textContent = S.view.flipped ? "Bottom-Up (mirrored)" : "Top-Down";
  scheduleRender();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function scheduleRender() {
  if (S.renderQueued) return;
  S.renderQueued = true;
  requestAnimationFrame(() => {
    S.renderQueued = false;
    render();
  });
}

function textMatrix(box, layer) {
  const e = ((layer === "bottom" ? -box.rotation : box.rotation) * Math.PI) / 180;
  const f = S.view.flipped ? -1 : 1;
  const m = layer === "bottom" ? -1 : 1;
  const c = Math.cos(e);
  const s = Math.sin(e);
  return `matrix(${(f * m * c).toFixed(5)},${(-m * s).toFixed(5)},${(f * s).toFixed(5)},${c.toFixed(5)},${X(box.cx).toFixed(2)},${Y(box.cy).toFixed(2)})`;
}

function polyPts(corners) {
  return corners.map(p => `${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`).join(" ");
}

function compBounds(name) {
  const pads = S.copper.filter(c => c.comp === name);
  if (pads.length) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pads) {
      minX = Math.min(minX, p.x - p.cw / 2); maxX = Math.max(maxX, p.x + p.cw / 2);
      minY = Math.min(minY, p.y - p.ch / 2); maxY = Math.max(maxY, p.y + p.ch / 2);
    }
    return { minX: minX - 0.35, maxX: maxX + 0.35, minY: minY - 0.35, maxY: maxY + 0.35 };
  }
  const c = S.layout.components[name];
  const spec = FOOTPRINT_POLARITY_SPECS[c?.footprint];
  const hw = (spec?.courtyard?.width || 2) / 2;
  const hh = (spec?.courtyard?.height || 2) / 2;
  const swap = Math.abs(((num(c?.rotation) % 180) + 180) % 180 - 90) < 1;
  const ax = swap ? hh : hw, ay = swap ? hw : hh;
  return { minX: num(c?.x) - ax, maxX: num(c?.x) + ax, minY: num(c?.y) - ay, maxY: num(c?.y) + ay };
}

function rectFromBounds(b) {
  const x1 = X(b.minX), x2 = X(b.maxX);
  return { x: Math.min(x1, x2), y: Y(b.maxY), w: Math.abs(x2 - x1), h: Y(b.minY) - Y(b.maxY) };
}

function extractPt(pt) {
  const x = pt?.x ?? pt?.start?.x ?? pt?.end?.x;
  const y = pt?.y ?? pt?.start?.y ?? pt?.end?.y;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, layer: pt.layer || "top" } : null;
}

function render() {
  if (!S.layout) return;
  runDrc();
  const s = S.view.s;
  const { w, l } = boardSize();
  const L = S.layers;
  const flipped = S.view.flipped;
  const parts = [];
  const sel = selInfo();
  const viol = S.drc.violationsById || {};

  // Board
  const br = rectFromBounds({ minX: -w / 2, maxX: w / 2, minY: -l / 2, maxY: l / 2 });
  parts.push(`<rect x="${br.x}" y="${br.y}" width="${br.w}" height="${br.h}" rx="${(1.5 * s).toFixed(1)}" fill="#0b2416" stroke="#34d399" stroke-width="1.5" data-hit="board"/>`);
  // Origin cross
  parts.push(`<path d="M${X(-0.8)},${Y(0)} L${X(0.8)},${Y(0)} M${X(0)},${Y(-0.8)} L${X(0)},${Y(0.8)}" stroke="#1f6b47" stroke-width="1" pointer-events="none"/>`);

  // Traces (bottom first when viewing top; reversed when flipped)
  const traceLayers = flipped ? ["top", "bottom"] : ["bottom", "top"];
  for (const lay of traceLayers) {
    if (lay === "top" && !L.topCopper) continue;
    if (lay === "bottom" && !L.bottomCopper) continue;
    const color = lay === "top" ? "#ec4899" : "#06b6d4";
    const op = S.tracesStale ? 0.18 : (lay === (flipped ? "bottom" : "top") ? 0.85 : 0.45);
    let d = "";
    let wsum = 0, n = 0;
    for (const t of S.traces) {
      const pts = (t.route || []).map(extractPt);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!a || !b || a.layer !== lay) continue;
        d += `M${X(a.x).toFixed(1)},${Y(a.y).toFixed(1)}L${X(b.x).toFixed(1)},${Y(b.y).toFixed(1)}`;
        wsum += t.route[i].width || t.width || 0.25; n++;
      }
    }
    if (d) parts.push(`<path d="${d}" stroke="${color}" stroke-width="${Math.max(1, (n ? wsum / n : 0.25) * s).toFixed(2)}" stroke-linecap="round" fill="none" opacity="${op}" pointer-events="none" ${S.tracesStale ? 'stroke-dasharray="4,4"' : ""}/>`);
  }

  // Courtyards (component hit targets)
  for (const name of Object.keys(S.layout.components)) {
    const r = rectFromBounds(compBounds(name));
    const isSel = sel?.type === "comp" && sel.name === name;
    const isParent = sel?.type === "tether" && sel.comp === name;
    const hasViol = !!viol[`comp__${name}`];
    const stroke = isSel ? "#38bdf8" : (hasViol ? "#ef4444" : (isParent ? "#7dd3fc" : "#a78bfa"));
    const vis = L.courtyards || isSel || isParent;
    parts.push(`<rect class="cad-draggable" data-hit="comp" data-comp="${esc(name)}" x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${isSel ? "rgba(56,189,248,0.10)" : "rgba(167,139,250,0.03)"}" stroke="${vis ? stroke : "transparent"}" stroke-width="${isSel ? 1.6 : 0.8}" stroke-dasharray="${isSel ? "" : "3,2"}" opacity="${vis ? 0.9 : 1}"/>`);
  }

  // Pads & holes
  if (L.pads) {
    for (const c of S.copper) {
      const viewSideTop = !flipped;
      const onViewSide = c.kind !== "smt" || (c.layer === "top") === viewSideTop;
      const op = onViewSide ? 0.95 : 0.35;
      const attrs = `data-hit="comp" data-comp="${esc(c.comp || "")}" data-pin="${esc(c.pin)}" class="cad-draggable" opacity="${op}"`;
      if (c.kind === "smt") {
        if (c.shape === "circle") {
          parts.push(`<circle ${attrs} cx="${X(c.x).toFixed(1)}" cy="${Y(c.y).toFixed(1)}" r="${(c.cw / 2 * s).toFixed(1)}" fill="#d4af37"/>`);
        } else {
          const r = rectFromBounds({ minX: c.x - c.cw / 2, maxX: c.x + c.cw / 2, minY: c.y - c.ch / 2, maxY: c.y + c.ch / 2 });
          parts.push(`<rect ${attrs} x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" rx="${Math.min(2, 0.08 * s).toFixed(1)}" fill="${c.layer === "top" ? "#d4af37" : "#b88a2a"}"/>`);
        }
      } else {
        if (c.kind === "hole") parts.push(`<circle ${attrs} cx="${X(c.x).toFixed(1)}" cy="${Y(c.y).toFixed(1)}" r="${(c.cw / 2 * s).toFixed(1)}" fill="#d4af37"/>`);
        parts.push(`<circle ${attrs} cx="${X(c.x).toFixed(1)}" cy="${Y(c.y).toFixed(1)}" r="${Math.max(0.5, (c.holeR || c.cw / 2) * s).toFixed(1)}" fill="#05070a"/>`);
      }
    }
  }

  const silkColor = (layer) => layer === "bottom" ? "#38bdf8" : "#ffffff";
  const silkOpacity = (layer) => {
    const front = flipped ? "bottom" : "top";
    return layer === front ? 0.96 : 0.55;
  };
  const layerVisible = (layer) => (layer === "bottom" ? L.bottomSilk : L.topSilk);

  // Static compiled silk (QR codes, legacy art)
  const { dx: qdx, dy: qdy } = qrOffset();
  const qrSel = sel?.type === "qr";
  for (const p of [...S.qrPaths, ...S.staticSilk.filter(i => i.type === "pcb_silkscreen_path")]) {
    const layer = p.layer || "top";
    if (!layerVisible(layer)) continue;
    const isQr = String(p.editor_id || "").startsWith("qr_");
    const ox = isQr ? qdx : 0, oy = isQr ? qdy : 0;
    const pts = (p.route || []).map(pt => `${X(pt.x + ox).toFixed(1)},${Y(pt.y + oy).toFixed(1)}`).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${silkColor(layer)}" stroke-width="${Math.max(0.6, (p.stroke_width || 0.15) * s).toFixed(2)}" stroke-linecap="butt" opacity="${silkOpacity(layer)}" ${isQr ? 'data-hit="qr" class="cad-draggable"' : 'pointer-events="none"'}/>`);
  }
  if (S.legacy && !S.layoutExistsOnDisk) {
    // Show original compiled texts only as faint reference before bootstrapping
  }
  if (qrSel && S.qrPaths.length) {
    const xs = S.qrPaths.flatMap(p => p.route.map(pt => pt.x + qdx));
    const ys = S.qrPaths.flatMap(p => p.route.map(pt => pt.y + qdy));
    const r = rectFromBounds({ minX: Math.min(...xs) - 0.3, maxX: Math.max(...xs) + 0.3, minY: Math.min(...ys) - 0.3, maxY: Math.max(...ys) + 0.3 });
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#38bdf8" stroke-width="1.4" pointer-events="none"/>`);
  }

  // Editable silk paths
  for (const p of S.silkPaths) {
    const layer = p.layer || "top";
    if (!layerVisible(layer)) continue;
    const isSel = S.selection?.id === p.id;
    const hasViol = !!viol[p.id];
    const color = hasViol ? "#f87171" : silkColor(layer);
    const sw = Math.max(0.8, num(p.strokeWidth, 0.18) * s);
    if (p.isDot) {
      const cx = X(num(p.x, (p.route[0].x + p.route[1].x) / 2)), cy = Y(num(p.y, p.route[0].y));
      const rr = Math.max(1.2, num(p.diameter, 0.42) / 2 * s);
      parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${color}" opacity="${silkOpacity(layer)}" pointer-events="none"/>`);
      parts.push(`<circle class="cad-draggable ${hasViol ? "obb-violation" : ""}" data-hit="silk" data-id="${esc(p.id)}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(6, rr + 3).toFixed(1)}" fill="transparent" stroke="${isSel ? "#38bdf8" : (hasViol ? "#ef4444" : "transparent")}" stroke-width="1.2"/>`);
    } else {
      const pts = p.route.map(pt => `${X(pt.x).toFixed(1)},${Y(pt.y).toFixed(1)}`).join(" ");
      parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${silkOpacity(layer)}" pointer-events="none"/>`);
      parts.push(`<polyline class="cad-draggable" data-hit="silk" data-id="${esc(p.id)}" points="${pts}" fill="none" stroke="${isSel ? "rgba(56,189,248,0.55)" : (hasViol ? "rgba(239,68,68,0.45)" : "transparent")}" stroke-width="${Math.max(9, sw + 6).toFixed(1)}" stroke-linecap="round"/>`);
    }
  }

  // Editable silk texts
  let selBox = null;
  for (const t of S.silkTexts) {
    const layer = t.layer || "top";
    if (!layerVisible(layer)) continue;
    const box = computeGerberTextBox({
      text: t.text,
      font_size: num(t.fontSize, 0.8),
      anchor_position: { x: num(t.x), y: num(t.y) },
      anchor_alignment: t.align || "center",
      ccw_rotation: num(t.rotation),
      layer
    });
    const isSel = S.selection?.id === t.id;
    const hasViol = !!viol[t.id];
    const tooSmall = box.fontSize < JLCPCB_MIN_FONT_MM - 0.005;
    const color = hasViol ? "#fca5a5" : silkColor(layer);
    const textW = Math.max(0.1, box.width - box.strokeW) * s;
    parts.push(`<g transform="${textMatrix(box, layer)}" opacity="${silkOpacity(layer)}" pointer-events="none">
      <text x="0" y="0" fill="${color}" font-family="Consolas, 'Courier New', monospace" font-weight="700" font-size="${(box.fontSize * s).toFixed(2)}" text-anchor="middle" dominant-baseline="central" textLength="${textW.toFixed(2)}" lengthAdjust="spacingAndGlyphs">${esc(t.text)}</text>
    </g>`);
    const boxStroke = isSel ? "#38bdf8" : (hasViol ? "#ef4444" : (tooSmall ? "#f59e0b" : (L.textBoxes ? "rgba(56,189,248,0.35)" : "transparent")));
    const boxFill = hasViol ? "rgba(239,68,68,0.16)" : (isSel ? "rgba(56,189,248,0.10)" : "transparent");
    parts.push(`<polygon class="cad-draggable ${hasViol ? "obb-violation" : ""}" data-hit="silk" data-id="${esc(t.id)}" points="${polyPts(box.corners)}" fill="${boxFill}" stroke="${boxStroke}" stroke-width="${isSel ? 1.4 : 0.8}" stroke-dasharray="${isSel || hasViol ? "" : "2,2"}"/>`);
    if (isSel) selBox = box;
  }

  // Selection handles
  if (selBox) {
    const corner = selBox.corners.reduce((best, c) => (X(c.x) + Y(c.y) > X(best.x) + Y(best.y) ? c : best), selBox.corners[0]);
    parts.push(`<rect class="cad-resize-handle" data-hit="resize" x="${(X(corner.x) - 5).toFixed(1)}" y="${(Y(corner.y) - 5).toFixed(1)}" width="10" height="10" rx="2" fill="#0b1220" stroke="#38bdf8" stroke-width="1.6"/>`);
    parts.push(`<text x="${(X(corner.x) + 9).toFixed(1)}" y="${(Y(corner.y) + 14).toFixed(1)}" fill="#7dd3fc" font-family="Consolas, monospace" font-size="10.5" pointer-events="none">${selBox.fontSize.toFixed(2)}mm · ${pxFeel(selBox.fontSize)}</text>`);
  }
  if (sel?.type === "comp") {
    const b = compBounds(sel.name);
    const r = rectFromBounds(b);
    parts.push(`<text x="${r.x.toFixed(1)}" y="${(r.y - 5).toFixed(1)}" fill="#7dd3fc" font-family="Consolas, monospace" font-size="11" font-weight="700" pointer-events="none">${esc(sel.name)} (${num(sel.comp.x).toFixed(2)}, ${num(sel.comp.y).toFixed(2)}) ${num(sel.comp.rotation)}°</text>`);
  }

  // Measurements
  const drawMeasure = (a, b, live) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y);
    const label = `${d.toFixed(3)} mm   ΔX ${dx.toFixed(2)}  ΔY ${dy.toFixed(2)}  ${ang.toFixed(1)}°`;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const lw = label.length * 6.3 + 12;
    parts.push(`<g pointer-events="none">
      <line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#f59e0b" stroke-width="1.4" ${live ? 'stroke-dasharray="5,3"' : ""}/>
      <circle cx="${ax}" cy="${ay}" r="3" fill="#f59e0b"/><circle cx="${bx}" cy="${by}" r="3" fill="#f59e0b"/>
      <rect x="${(mx - lw / 2).toFixed(1)}" y="${(my - 22).toFixed(1)}" width="${lw.toFixed(1)}" height="17" rx="4" fill="rgba(10,12,18,0.92)" stroke="#f59e0b" stroke-width="1"/>
      <text x="${mx.toFixed(1)}" y="${(my - 10).toFixed(1)}" fill="#fde68a" font-family="Consolas, monospace" font-size="11" text-anchor="middle">${label}</text>
    </g>`);
  };
  S.measures.forEach(m => drawMeasure(m.a, m.b, false));
  if (S.tool === "measure" && S.measureStart && S.measureHover) drawMeasure(S.measureStart, S.measureHover.p, true);
  if (S.tool === "measure" && S.measureHover) {
    const p = S.measureHover.p;
    parts.push(`<g pointer-events="none"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="6" fill="none" stroke="${S.measureHover.snapped ? "#22d3ee" : "#f59e0b"}" stroke-width="1.5"/>
      <path d="M${X(p.x) - 10},${Y(p.y)}h20M${X(p.x)},${Y(p.y) - 10}v20" stroke="#f59e0b" stroke-width="0.8"/></g>`);
  }
  $("btn-clear-rulers").hidden = S.measures.length === 0;

  svg.innerHTML = parts.join("");
  drawRulers();
  const realPct = (S.view.s / (S.cssPxPerInch / 25.4)) * 100;
  $("status-zoom").textContent = `${S.view.s.toFixed(1)} px/mm · ${realPct.toFixed(0)}% of real size`;
  $("btn-route-traces").textContent = S.tracesStale ? "🔀 Re-Route*" : "🔀 Route";
}

function drawRulers() {
  const dpr = window.devicePixelRatio || 1;
  const s = S.view.s;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const minor = steps.find(st => st * s >= 7) || 100;
  const major = steps.find(st => st * s >= 60 && st >= minor) || 100;

  const drawAxis = (canvas, horizontal) => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.strokeStyle = "#3a4560";
    ctx.fillStyle = "#8b95ab";
    ctx.font = "9px Consolas, monospace";
    const len = horizontal ? cw : ch;
    const w0 = horizontal ? toWorld(0, 0).x : toWorld(0, len).y;
    const w1 = horizontal ? toWorld(len, 0).x : toWorld(0, 0).y;
    const lo = Math.min(w0, w1), hi = Math.max(w0, w1);
    const start = Math.floor(lo / minor) * minor;
    ctx.beginPath();
    for (let v = start; v <= hi + 1e-9; v += minor) {
      const vv = +v.toFixed(4);
      const isMajor = Math.abs(vv / major - Math.round(vv / major)) < 1e-6;
      const p = horizontal ? X(vv) : Y(vv);
      const tick = isMajor ? 10 : 4;
      if (horizontal) { ctx.moveTo(p + 0.5, ch); ctx.lineTo(p + 0.5, ch - tick); }
      else { ctx.moveTo(cw, p + 0.5); ctx.lineTo(cw - tick, p + 0.5); }
      if (isMajor) {
        const label = Number.isInteger(vv) ? String(vv) : vv.toFixed(1);
        if (horizontal) ctx.fillText(label, p + 2, 9);
        else { ctx.save(); ctx.translate(9, p - 2); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
      }
    }
    ctx.stroke();
    // Cursor marker
    ctx.strokeStyle = "#f59e0b";
    ctx.beginPath();
    const cp = horizontal ? X(S.cursor.x) : Y(S.cursor.y);
    if (horizontal) { ctx.moveTo(cp, 0); ctx.lineTo(cp, ch); } else { ctx.moveTo(0, cp); ctx.lineTo(cw, cp); }
    ctx.stroke();
  };
  drawAxis(rulerTop, true);
  drawAxis(rulerLeft, false);
}

// ---------------------------------------------------------------------------
// Object tree
// ---------------------------------------------------------------------------
function renderTree() {
  if (!S.layout) return;
  const q = S.treeFilter.trim().toLowerCase();
  const viol = S.drc.violationsById || {};
  const rows = [];
  if (S.treeTab !== "silkscreen") {
    for (const [name, c] of Object.entries(S.layout.components)) {
      if (q && !`${name} ${c.footprint}`.toLowerCase().includes(q)) continue;
      const isSel = S.selection?.type === "comp" && S.selection.name === name;
      const hasViol = !!viol[`comp__${name}`];
      rows.push(`<div class="tree-row ${isSel ? "selected" : ""} ${hasViol ? "has-violation" : ""}" data-tree-comp="${esc(name)}">
        <div class="tree-row-left"><span class="tree-tag comp">CMP</span><span class="tree-label">${esc(name)}</span></div>
        <span class="tree-meta">${esc(c.footprint || "")}</span></div>`);
    }
  }
  if (S.treeTab !== "components") {
    const items = [
      ...S.silkTexts.map(t => ({ id: t.id, label: t.text, layer: t.layer, meta: `${num(t.fontSize, 0.8).toFixed(2)}mm` })),
      ...S.silkPaths.map(p => ({ id: p.id, label: p.parentComp ? `${p.parentComp} ${p.markerKey}` : (p.shapeType || (p.isDot ? "dot" : "path")), layer: p.layer, meta: p.isDot ? "dot" : "path" })),
      ...S.layout.silkscreen.filter(i => i.visible === false).map(i => ({ id: i.id, label: `${i.text || i.type} (hidden)`, layer: i.layer, meta: "hidden" }))
    ];
    for (const it of items) {
      if (q && !`${it.id} ${it.label}`.toLowerCase().includes(q)) continue;
      const isSel = S.selection?.id === it.id;
      const hasViol = !!viol[it.id];
      rows.push(`<div class="tree-row ${isSel ? "selected" : ""} ${hasViol ? "has-violation" : ""}" data-tree-silk="${esc(it.id)}">
        <div class="tree-row-left"><span class="tree-tag ${it.layer === "bottom" ? "bot" : "top"}">${it.layer === "bottom" ? "BOT" : "TOP"}</span><span class="tree-label">${esc(it.label)}</span></div>
        <span class="tree-meta">${esc(it.meta)}</span></div>`);
    }
  }
  treeList.innerHTML = rows.join("");
  $("object-count-label").textContent = `${rows.length} items`;
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function presetChips(current) {
  return `<div class="preset-grid">${FONT_SIZE_PRESETS.map(p => `
    <button class="preset-pill ${Math.abs(current - p.mm) < 0.005 ? "active" : ""}" data-action="preset" data-mm="${p.mm}" title="${esc(p.hint)}">
      <span class="preset-top"><span>${esc(p.pxLabel)}</span><span class="preset-mm">${p.mm.toFixed(2)}mm</span></span>
      <span class="preset-desc">${esc(p.hint)}</span>
    </button>`).join("")}</div>`;
}

function rotChips(current, action = "rot") {
  const c = ((num(current) % 360) + 360) % 360;
  return `<div class="rot-quick-bar">${[0, 90, 180, 270].map(d => `<button class="rot-chip ${c === d ? "active" : ""}" data-action="${action}" data-deg="${d}">${d}°</button>`).join("")}</div>`;
}

function field(label, f, value, attrs = "") {
  return `<div class="field-col"><label>${label}</label><input class="studio-input" data-f="${f}" value="${esc(value)}" ${attrs}></div>`;
}

function renderInspector() {
  const info = selInfo();
  if (!S.layout) { inspectorRoot.innerHTML = ""; return; }
  if (!info) {
    const { w, l } = boardSize();
    inspectorRoot.innerHTML = `
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">${esc(S.project.slug)}</span></div>
        <div class="insp-subtitle">Board ${w} × ${l} mm · ${Object.keys(S.layout.components).length} components · ${S.silkTexts.length} silk texts</div>
        <div class="insp-subtitle">${S.layoutExistsOnDisk ? `Editing <code>${esc(S.project.slug)}/src/layout.json</code>` : "In-memory bootstrap (not saved yet)"}</div>
      </div>
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">Font Size Cheat Sheet</span></div>
        <div class="insp-subtitle">Hand-held PCB reading distance ≈ web px feel. JLCPCB minimum is 0.80 mm.</div>
        <div class="kbd-list">${FONT_SIZE_PRESETS.map(p => `<div class="kbd-row"><span>${esc(p.label)}</span><kbd>${p.mm.toFixed(2)} mm</kbd></div>`).join("")}</div>
      </div>
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">Shortcuts</span></div>
        <div class="kbd-list">
          <div class="kbd-row"><span>Select / Ruler</span><kbd>V / M</kbd></div>
          <div class="kbd-row"><span>Nudge (Shift ×5, Alt fine)</span><kbd>Arrows</kbd></div>
          <div class="kbd-row"><span>Rotate +90° / −90°</span><kbd>R / Shift+R</kbd></div>
          <div class="kbd-row"><span>Bypass snap while dragging</span><kbd>Alt</kbd></div>
          <div class="kbd-row"><span>Edit text</span><kbd>Double-click</kbd></div>
          <div class="kbd-row"><span>Duplicate / Delete</span><kbd>Ctrl+D / Del</kbd></div>
          <div class="kbd-row"><span>Save / Undo / Redo</span><kbd>Ctrl+S/Z/Y</kbd></div>
          <div class="kbd-row"><span>Fit / Flip bottom</span><kbd>F / B</kbd></div>
          <div class="kbd-row"><span>Pan</span><kbd>Space+Drag / Empty drag</kbd></div>
        </div>
      </div>`;
    return;
  }

  if (info.type === "qr") {
    const q = S.layout.qr || {};
    inspectorRoot.innerHTML = `<div class="insp-card">
      <div class="insp-header"><span class="insp-title">QR Code</span><span class="insp-subtitle">bottom silk</span></div>
      <div class="field-grid-2">${field("Center X (mm)", "qr.x", num(q.x, S.qrCompiledAt?.x).toFixed(2), 'type="number" step="0.1"')}${field("Center Y (mm)", "qr.y", num(q.y, S.qrCompiledAt?.y).toFixed(2), 'type="number" step="0.1"')}</div>
      <label class="layer-row"><input type="checkbox" data-f="qr.visible" ${q.visible === false ? "" : "checked"}> Visible (applies on next Route/compile)</label>
    </div>`;
    return;
  }

  if (info.type === "comp") {
    const { name, comp: c } = info;
    const spec = FOOTPRINT_POLARITY_SPECS[c.footprint] || {};
    const keys = new Set([...Object.keys(spec.defaultMarkers || {}), ...Object.keys(c.markers || {})]);
    if (spec.pin1Dot) keys.add("pin1Dot");
    if (spec.polarityPaths) keys.add("polarityBar");
    const markerRows = [...keys].map(key => {
      const cfg = c.markers?.[key] || {};
      const def = spec.defaultMarkers?.[key];
      const visible = cfg.visible !== undefined ? cfg.visible : (def ? def.visible !== false : true);
      const isText = key !== "pin1Dot" && key !== "polarityBar";
      const text = cfg.text ?? (key === "ref" ? name : (def?.text || ""));
      const fsz = num(cfg.fontSize, def?.fontSize || 0.8);
      const tid = key === "polarityBar" ? `tether__${name}__bar_0` : `tether__${name}__${key}`;
      return `<div class="marker-row-card">
        <div class="marker-row-top">
          <label class="marker-row-title"><input type="checkbox" data-mk="${key}" data-mf="visible" ${visible ? "checked" : ""}> ${esc(key)}</label>
          <span>
            <button class="btn-ghost" data-action="select-silk" data-id="${esc(tid)}" ${visible ? "" : "disabled"}>Select</button>
            <button class="btn-ghost" data-action="reset-marker" data-mk="${key}" title="Reset offsets">↺</button>
          </span>
        </div>
        ${isText ? `<div class="field-grid-2">
          <div class="field-col"><label>Text</label><input class="studio-input" data-mk="${key}" data-mf="text" value="${esc(text)}"></div>
          <div class="field-col"><label>Font mm (${pxFeel(fsz)})</label><input class="studio-input" type="number" step="0.05" min="0.3" data-mk="${key}" data-mf="fontSize" value="${fsz.toFixed(2)}"></div>
        </div>` : ""}
        <div class="field-grid-2">
          <div class="field-col"><label>dx (local mm)</label><input class="studio-input" type="number" step="0.05" data-mk="${key}" data-mf="dx" value="${num(cfg.dx).toFixed(2)}"></div>
          <div class="field-col"><label>dy (local mm)</label><input class="studio-input" type="number" step="0.05" data-mk="${key}" data-mf="dy" value="${num(cfg.dy).toFixed(2)}"></div>
        </div>
      </div>`;
    }).join("");
    const violations = (S.drc.violationsById[`comp__${name}`] || []).map(v => `<div class="warn-callout">${esc(v.message)}</div>`).join("");
    inspectorRoot.innerHTML = `
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">${esc(name)}</span><span class="insp-subtitle">${esc(c.footprint || "")} · ${esc(c.layer || "top")}</span></div>
        ${violations}
        <div class="field-grid-2">
          ${field("X (mm)", "comp.x", num(c.x).toFixed(2), 'type="number" step="0.1"')}
          ${field("Y (mm)", "comp.y", num(c.y).toFixed(2), 'type="number" step="0.1"')}
        </div>
        <div class="field-col"><label>Rotation</label>${rotChips(c.rotation, "comp-rot")}</div>
        ${S.tracesStale ? `<div class="warn-callout">Copper moved: traces are stale. Hit 🔀 Route to re-route before you publish.</div>` : ""}
      </div>
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">Tethered Markers</span><button class="btn-ghost" data-action="reset-all-markers">Reset all</button></div>
        <div class="insp-subtitle">Markers move and rotate with the part. Offsets are in the part's own (unrotated) frame.</div>
        ${markerRows || `<div class="insp-subtitle">No markers for this footprint.</div>`}
      </div>`;
    return;
  }

  // Silkscreen (tether or free)
  const isTether = info.type === "tether";
  const meta = info.meta || {};
  const item = info.item || {};
  const kind = info.kind;
  const violations = (S.drc.violationsById[info.id] || []).map(v => `<div class="warn-callout">${esc(v.message)}</div>`).join("");
  const header = `<div class="insp-header"><span class="insp-title">${esc(isTether ? `${info.comp} · ${info.key}` : (item.type || "text"))}</span>
    <span class="insp-subtitle">${isTether ? "tethered" : "freeform"}</span></div>`;

  if (kind === "text") {
    const text = isTether ? meta.text : item.text;
    const fsz = num(isTether ? meta.fontSize : item.fontSize, 1.0);
    const layer = (isTether ? meta.layer : item.layer) || "top";
    const align = (isTether ? meta.align : item.align) || "center";
    const rot = num(isTether ? meta.rotation : item.rotation);
    const bad = findUnsupportedGerberChars(text);
    const cfg = isTether ? (S.layout.components[info.comp].markers?.[info.key] || {}) : null;
    inspectorRoot.innerHTML = `
      <div class="insp-card">
        ${header}
        ${violations}
        <div class="field-col"><label>Text</label><input class="studio-input" data-f="text" value="${esc(text)}"></div>
        ${bad.length ? `<div class="warn-callout">Not in Gerber font, will be dropped: <strong>${esc(bad.join(" "))}</strong>. Allowed: A–Z a–z 0–9 space ! # ' ( ) * + , - . / &lt; = &gt; [ \\ ] ^ _</div>` : ""}
      </div>
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">Font Size</span><span class="insp-subtitle">${fsz.toFixed(2)} mm · ${pxFeel(fsz)}</span></div>
        ${presetChips(fsz)}
        <div class="field-grid-2">
          ${field("Exact mm", "fontSize", fsz.toFixed(2), 'type="number" step="0.05" min="0.3"')}
          <div class="field-col"><label>Slider</label><input type="range" data-f="fontSize" min="0.5" max="3.5" step="0.05" value="${fsz}"></div>
        </div>
        ${fsz < JLCPCB_MIN_FONT_MM ? `<div class="warn-callout">Smaller than the JLCPCB legibility minimum (0.80 mm).</div>` : ""}
      </div>
      <div class="insp-card">
        <div class="insp-header"><span class="insp-title">Placement</span></div>
        <div class="field-grid-2">
          ${isTether
            ? field("dx (local mm)", "dx", num(cfg.dx).toFixed(2), 'type="number" step="0.05"') + field("dy (local mm)", "dy", num(cfg.dy).toFixed(2), 'type="number" step="0.05"')
            : field("X (mm)", "x", num(item.x).toFixed(2), 'type="number" step="0.1"') + field("Y (mm)", "y", num(item.y).toFixed(2), 'type="number" step="0.1"')}
        </div>
        <div class="field-grid-2">
          <div class="field-col"><label>Layer</label><select class="studio-select" data-f="layer"><option value="top" ${layer === "top" ? "selected" : ""}>Top</option><option value="bottom" ${layer === "bottom" ? "selected" : ""}>Bottom</option></select></div>
          <div class="field-col"><label>Anchor</label><select class="studio-select" data-f="align">${["center", "center_left", "center_right", "top_center", "bottom_center"].map(a => `<option value="${a}" ${a === align ? "selected" : ""}>${a}</option>`).join("")}</select></div>
        </div>
        <div class="field-col"><label>Rotation</label>${rotChips(rot)}</div>
      </div>
      <div class="insp-card">
        <div class="field-grid-2">
          ${isTether
            ? `<button class="btn-ghost" data-action="select-parent">Select ${esc(info.comp)}</button><button class="btn-danger" data-action="delete">Hide marker</button>`
            : `<button class="btn-ghost" data-action="duplicate">Duplicate</button><button class="btn-danger" data-action="delete">Delete</button>`}
        </div>
        ${!isTether ? `<label class="layer-row"><input type="checkbox" data-f="visible" ${item.visible === false ? "" : "checked"}> Visible</label>` : ""}
      </div>`;
    return;
  }

  // Paths
  if (isTether) {
    const cfg = S.layout.components[info.comp].markers?.[info.key] || {};
    inspectorRoot.innerHTML = `<div class="insp-card">${header}${violations}
      <div class="insp-subtitle">${info.key === "pin1Dot" ? "Pin-1 dot (a round Gerber flash, not text)" : "Cathode / polarity bar"} tethered to ${esc(info.comp)}.</div>
      <div class="field-grid-2">${field("dx (local mm)", "dx", num(cfg.dx).toFixed(2), 'type="number" step="0.05"')}${field("dy (local mm)", "dy", num(cfg.dy).toFixed(2), 'type="number" step="0.05"')}</div>
      ${info.key === "pin1Dot" ? field("Diameter (mm)", "diameter", num(cfg.diameter, meta.diameter || 0.42).toFixed(2), 'type="number" step="0.05" min="0.2"') : ""}
      <div class="field-grid-2"><button class="btn-ghost" data-action="select-parent">Select ${esc(info.comp)}</button><button class="btn-danger" data-action="delete">Hide marker</button></div>
    </div>`;
    return;
  }
  const t = item.type;
  const dims = [];
  if (t === "dot") dims.push(field("Diameter (mm)", "diameter", num(item.diameter, 0.45).toFixed(2), 'type="number" step="0.05" min="0.2"'));
  if (t === "box" || t === "cathode_bar") {
    dims.push(field("Width (mm)", "width", num(item.width, 2).toFixed(2), 'type="number" step="0.1" min="0.4"'));
    dims.push(field("Height (mm)", "height", num(item.height, 2).toFixed(2), 'type="number" step="0.1" min="0.4"'));
  }
  if (t === "line" && item.x1 === undefined) dims.push(field("Length (mm)", "length", num(item.length, 2).toFixed(2), 'type="number" step="0.1" min="0.3"'));
  if (t !== "dot") dims.push(field("Stroke (mm, ≥0.15)", "strokeWidth", num(item.strokeWidth, 0.18).toFixed(2), 'type="number" step="0.01" min="0.15"'));
  const layer = item.layer || "top";
  inspectorRoot.innerHTML = `<div class="insp-card">${header}${violations}
    <div class="field-grid-2">${item.x !== undefined ? field("X (mm)", "x", num(item.x).toFixed(2), 'type="number" step="0.1"') + field("Y (mm)", "y", num(item.y).toFixed(2), 'type="number" step="0.1"') : ""}</div>
    <div class="field-grid-2">${dims.join("")}</div>
    <div class="field-col"><label>Layer</label><select class="studio-select" data-f="layer"><option value="top" ${layer === "top" ? "selected" : ""}>Top</option><option value="bottom" ${layer === "bottom" ? "selected" : ""}>Bottom</option></select></div>
    ${t !== "dot" && t !== "path" ? `<div class="field-col"><label>Rotation</label>${rotChips(item.rotation)}</div>` : ""}
    <div class="field-grid-2"><button class="btn-ghost" data-action="duplicate">Duplicate</button><button class="btn-danger" data-action="delete">Delete</button></div>
    <label class="layer-row"><input type="checkbox" data-f="visible" ${item.visible === false ? "" : "checked"}> Visible</label>
  </div>`;
}

function applyInspectorField(el) {
  const info = selInfo();
  if (!info) return false;
  const isCheckbox = el.type === "checkbox";
  const raw = isCheckbox ? el.checked : el.value;

  // Component marker fields
  if (el.dataset.mk && info.type === "comp") {
    const cfg = markerCfg(info.name, el.dataset.mk);
    const f = el.dataset.mf;
    if (f === "visible") cfg.visible = !!raw;
    else if (f === "text") cfg.text = String(raw);
    else { const v = parseFloat(raw); if (!Number.isFinite(v)) return false; cfg[f] = r3(v); }
    return true;
  }
  const f = el.dataset.f;
  if (!f) return false;

  if (info.type === "qr") {
    S.layout.qr ||= {};
    if (f === "qr.visible") S.layout.qr.visible = !!raw;
    else { const v = parseFloat(raw); if (!Number.isFinite(v)) return false; S.layout.qr[f.split(".")[1]] = r3(v); }
    return true;
  }
  if (info.type === "comp") {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return false;
    info.comp[f.split(".")[1]] = r3(v);
    return true;
  }
  const target = info.type === "tether" ? markerCfg(info.comp, info.key) : info.item;
  if (f === "visible") target.visible = !!raw;
  else if (f === "text" || f === "layer" || f === "align") target[f] = String(raw);
  else {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return false;
    target[f] = r3(f === "strokeWidth" ? Math.max(0.15, v) : v);
  }
  return true;
}

function handleInspectorAction(btn) {
  const info = selInfo();
  const action = btn.dataset.action;
  if (action === "select-silk") { select({ type: "silk", id: btn.dataset.id }); return; }
  if (action === "select-parent" && info?.comp) { select({ type: "comp", name: info.comp }); return; }
  if (!info) return;
  pushUndo();
  if (action === "preset") {
    const mm = parseFloat(btn.dataset.mm);
    if (info.type === "tether") markerCfg(info.comp, info.key).fontSize = mm;
    else if (info.item) info.item.fontSize = mm;
  } else if (action === "rot") {
    const d = parseFloat(btn.dataset.deg);
    if (info.type === "tether") markerCfg(info.comp, info.key).rotation = d;
    else if (info.item) info.item.rotation = d;
  } else if (action === "comp-rot") {
    info.comp.rotation = parseFloat(btn.dataset.deg);
  } else if (action === "reset-marker") {
    const cfg = markerCfg(info.name, btn.dataset.mk);
    delete cfg.dx; delete cfg.dy; delete cfg.rotation;
  } else if (action === "reset-all-markers") {
    for (const cfg of Object.values(info.comp.markers || {})) { delete cfg.dx; delete cfg.dy; delete cfg.rotation; }
  } else if (action === "duplicate") {
    duplicateSelection(); return;
  } else if (action === "delete") {
    deleteSelection(); return;
  }
  changed();
  renderInspector();
  renderTree();
}

// ---------------------------------------------------------------------------
// Mutations: stamps, delete, duplicate, rotate, nudge
// ---------------------------------------------------------------------------
function newId(prefix = "silk") {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function stamp(kind) {
  if (!S.layout) return;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const { w, l } = boardSize();
  let c = toWorld(W / 2, H / 2);
  c = { x: snapV(Math.max(-w / 2 + 2, Math.min(w / 2 - 2, c.x))), y: snapV(Math.max(-l / 2 + 2, Math.min(l / 2 - 2, c.y))) };
  const layer = S.stampSide;
  const base = { id: newId(kind), layer, x: c.x, y: c.y, visible: true };
  let item;
  switch (kind) {
    case "text": item = { ...base, type: "text", text: "LABEL", fontSize: 1.0, align: "center", rotation: 0 }; break;
    case "plus": item = { ...base, type: "text", text: "+", fontSize: 1.2, align: "center", rotation: 0 }; break;
    case "minus": item = { ...base, type: "text", text: "-", fontSize: 1.2, align: "center", rotation: 0 }; break;
    case "dot": item = { ...base, type: "dot", diameter: 0.45 }; break;
    case "cathode": item = { ...base, type: "cathode_bar", width: 1.1, height: 1.6, strokeWidth: 0.22, rotation: 0 }; break;
    case "box": item = { ...base, type: "box", width: 3, height: 2, strokeWidth: 0.18, rotation: 0 }; break;
    case "line": item = { ...base, type: "line", length: 3, strokeWidth: 0.2, rotation: 0 }; break;
    default: return;
  }
  pushUndo();
  S.layout.silkscreen.push(item);
  changed();
  select({ type: "silk", id: item.id });
  toast(`Stamped ${kind} on ${layer} silk at (${c.x}, ${c.y}). Drag it into place.`);
}

function deleteSelection() {
  const info = selInfo();
  if (!info) return;
  if (info.type === "comp" || info.type === "qr") { toast("Components can't be deleted here. Edit circuit.js for that.", "error"); return; }
  if (!S.undo.length || S.undo[S.undo.length - 1] !== JSON.stringify(S.layout)) pushUndo();
  if (info.type === "tether") {
    markerCfg(info.comp, info.key).visible = false;
    changed();
    select({ type: "comp", name: info.comp });
    toast(`Hid ${info.key} on ${info.comp}. Turn it back on in the component inspector.`);
    return;
  }
  S.layout.silkscreen = S.layout.silkscreen.filter(i => i.id !== info.id);
  changed();
  select(null);
}

function duplicateSelection() {
  const info = selInfo();
  if (!info || info.type !== "free") return;
  pushUndo();
  const copy = clone(info.item);
  copy.id = newId(copy.type || "silk");
  if (copy.x !== undefined) { copy.x = r3(num(copy.x) + 1); copy.y = r3(num(copy.y) - 1); }
  if (copy.x1 !== undefined) { copy.x1 += 1; copy.x2 += 1; copy.y1 -= 1; copy.y2 -= 1; }
  if (Array.isArray(copy.route)) copy.route = copy.route.map(p => ({ x: p.x + 1, y: p.y - 1 }));
  S.layout.silkscreen.push(copy);
  changed();
  select({ type: "silk", id: copy.id });
}

function rotateSelection(delta) {
  const info = selInfo();
  if (!info) return;
  pushUndo();
  const wrapDeg = (d) => ((d % 360) + 360) % 360;
  if (info.type === "comp") info.comp.rotation = wrapDeg(num(info.comp.rotation) + delta);
  else if (info.type === "tether") {
    if (info.kind !== "text") { S.undo.pop(); toast("Polarity bars and dots rotate with their part. Rotate the part instead."); return; }
    markerCfg(info.comp, info.key).rotation = wrapDeg(num(info.meta.rotation) + delta);
  } else if (info.type === "free") info.item.rotation = wrapDeg(num(info.item.rotation) + delta);
  else { S.undo.pop(); return; }
  changed();
  renderInspector();
}

function translateSelection(dx, dy, orig, ev) {
  const info = selInfo();
  if (!info) return;
  if (info.type === "comp") {
    info.comp.x = snapV(orig.x + dx, ev);
    info.comp.y = snapV(orig.y + dy, ev);
  } else if (info.type === "qr") {
    S.layout.qr ||= {};
    S.layout.qr.x = snapV(orig.x + dx, ev);
    S.layout.qr.y = snapV(orig.y + dy, ev);
  } else if (info.type === "tether") {
    const comp = S.layout.components[info.comp];
    const local = worldDeltaToLocal(dx, dy, num(comp.rotation));
    const cfg = markerCfg(info.comp, info.key);
    cfg.dx = snapV(orig.dx + local.x, ev);
    cfg.dy = snapV(orig.dy + local.y, ev);
  } else if (info.type === "free") {
    const it = info.item;
    if (it.x1 !== undefined) {
      const sx = snapV(orig.x1 + dx, ev) - orig.x1, sy = snapV(orig.y1 + dy, ev) - orig.y1;
      it.x1 = r3(orig.x1 + sx); it.y1 = r3(orig.y1 + sy); it.x2 = r3(orig.x2 + sx); it.y2 = r3(orig.y2 + sy);
    } else if (Array.isArray(it.route) && it.x === undefined) {
      it.route = orig.route.map(p => ({ x: r3(p.x + dx), y: r3(p.y + dy) }));
    } else {
      it.x = snapV(orig.x + dx, ev);
      it.y = snapV(orig.y + dy, ev);
    }
  }
}

function captureOrig() {
  const info = selInfo();
  if (!info) return null;
  if (info.type === "comp") return { x: num(info.comp.x), y: num(info.comp.y) };
  if (info.type === "qr") return { x: num(S.layout.qr?.x, S.qrCompiledAt.x), y: num(S.layout.qr?.y, S.qrCompiledAt.y) };
  if (info.type === "tether") {
    const cfg = S.layout.components[info.comp].markers?.[info.key] || {};
    return { dx: num(cfg.dx), dy: num(cfg.dy) };
  }
  return clone(info.item);
}

function nudge(dx, dy, ev) {
  const info = selInfo();
  if (!info) return;
  pushUndo();
  const orig = captureOrig();
  translateSelection(dx, dy, orig, { altKey: true });
  changed();
  renderInspector();
}

// ---------------------------------------------------------------------------
// Measure snapping
// ---------------------------------------------------------------------------
function measureSnap(w, ev) {
  const tol = 10 / S.view.s;
  let best = null, bestD = tol;
  const consider = (x, y) => {
    const d = Math.hypot(x - w.x, y - w.y);
    if (d < bestD) { bestD = d; best = { x, y }; }
  };
  if (!ev?.altKey) {
    for (const c of S.copper) {
      consider(c.x, c.y);
      consider(c.x - c.cw / 2, c.y); consider(c.x + c.cw / 2, c.y);
      consider(c.x, c.y - c.ch / 2); consider(c.x, c.y + c.ch / 2);
    }
    const { w: bw, l: bl } = boardSize();
    [-bw / 2, 0, bw / 2].forEach(x => [-bl / 2, 0, bl / 2].forEach(y => consider(x, y)));
  }
  if (best) return { p: best, snapped: true };
  return { p: { x: snapV(w.x, ev), y: snapV(w.y, ev) }, snapped: false };
}

// ---------------------------------------------------------------------------
// Pointer interaction
// ---------------------------------------------------------------------------
svg.addEventListener("pointerdown", (ev) => {
  wrap.focus();
  const { sx, sy } = eventScreen(ev);
  const w = toWorld(sx, sy);
  const target = ev.target.closest("[data-hit]");
  const hit = target?.dataset.hit;

  const wantsPan = ev.button === 1 || S.spaceHeld || S.tool === "pan";
  if (wantsPan || (S.tool === "select" && ev.button === 0 && (!hit || hit === "board"))) {
    if (!wantsPan && ev.button === 0 && S.selection) select(null);
    S.drag = { mode: "pan", sx, sy, tx: S.view.tx, ty: S.view.ty };
    svg.classList.add("cursor-panning");
    svg.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.button !== 0) return;

  if (S.tool === "measure") {
    const m = measureSnap(w, ev);
    if (!S.measureStart) S.measureStart = m.p;
    else { S.measures.push({ a: S.measureStart, b: m.p }); S.measureStart = null; }
    scheduleRender();
    return;
  }

  if (hit === "resize") {
    const info = selInfo();
    const t = info?.meta;
    if (!t) return;
    const box = computeGerberTextBox({ text: t.text, font_size: num(t.fontSize, 0.8), anchor_position: { x: t.x, y: t.y }, anchor_alignment: t.align, ccw_rotation: t.rotation, layer: t.layer });
    S.drag = { mode: "resize", startFs: num(t.fontSize, 0.8), cx: box.cx, cy: box.cy, startDist: Math.max(0.05, Math.hypot(w.x - box.cx, w.y - box.cy)), undoPushed: false };
    svg.setPointerCapture(ev.pointerId);
    return;
  }

  let sel = null;
  if (hit === "silk") sel = { type: "silk", id: target.dataset.id };
  else if (hit === "comp" && target.dataset.comp) sel = { type: "comp", name: target.dataset.comp };
  else if (hit === "qr") sel = { type: "qr" };
  if (!sel) return;

  if (JSON.stringify(sel) !== JSON.stringify(S.selection)) select(sel);
  S.drag = { mode: "move", start: w, orig: captureOrig(), moved: false, undoPushed: false };
  svg.setPointerCapture(ev.pointerId);
});

svg.addEventListener("pointermove", (ev) => {
  const { sx, sy } = eventScreen(ev);
  const w = toWorld(sx, sy);
  S.cursor = w;
  $("status-cursor").textContent = `X: ${w.x.toFixed(2)}, Y: ${w.y.toFixed(2)} mm`;

  const d = S.drag;
  if (d?.mode === "pan") {
    S.view.tx = d.tx + (sx - d.sx);
    S.view.ty = d.ty + (sy - d.sy);
    scheduleRender();
    return;
  }
  if (d?.mode === "move") {
    const dx = w.x - d.start.x, dy = w.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * S.view.s < 3) return;
    if (!d.undoPushed) { pushUndo(); d.undoPushed = true; }
    d.moved = true;
    translateSelection(dx, dy, d.orig, ev);
    deriveSilk();
    scheduleRender();
    return;
  }
  if (d?.mode === "resize") {
    if (!d.undoPushed) { pushUndo(); d.undoPushed = true; }
    const dist = Math.hypot(w.x - d.cx, w.y - d.cy);
    let fsz = d.startFs * (dist / d.startDist);
    fsz = Math.max(0.4, Math.min(6, ev.altKey ? fsz : Math.round(fsz / 0.05) * 0.05));
    const info = selInfo();
    if (info?.type === "tether") markerCfg(info.comp, info.key).fontSize = r3(fsz);
    else if (info?.item) info.item.fontSize = r3(fsz);
    deriveSilk();
    scheduleRender();
    return;
  }

  if (S.tool === "measure") {
    S.measureHover = measureSnap(w, ev);
    scheduleRender();
  } else {
    drawRulers();
  }
  updateHoverInfo(ev.target);
});

function endDrag(ev) {
  const d = S.drag;
  if (!d) return;
  S.drag = null;
  svg.classList.remove("cursor-panning");
  try { svg.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
  if ((d.mode === "move" && d.moved) || (d.mode === "resize" && d.undoPushed)) {
    markDirty();
    renderInspector();
    renderTree();
    scheduleRender();
  }
}
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);

svg.addEventListener("dblclick", (ev) => {
  const target = ev.target.closest("[data-hit='silk']");
  if (!target) return;
  const entry = S.silkIndex.get(target.dataset.id);
  if (entry?.kind !== "text") return;
  select({ type: "silk", id: target.dataset.id });
  const info = selInfo();
  const next = prompt("Silkscreen text:", entry.meta.text);
  if (next === null) return;
  pushUndo();
  if (info.type === "tether") markerCfg(info.comp, info.key).text = next;
  else info.item.text = next;
  changed();
  renderInspector();
  renderTree();
});

wrap.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const { sx, sy } = eventScreen(ev);
  zoomAt(sx, sy, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });

function updateHoverInfo(el) {
  const out = $("status-hover-info");
  const t = el?.closest?.("[data-hit]");
  if (!t) { out.textContent = S.tool === "measure" ? "Click two points to measure. Snaps to pad centers/edges. Alt = free." : "Hover a pad, part, or silkscreen label"; return; }
  if (t.dataset.hit === "silk") {
    const e = S.silkIndex.get(t.dataset.id);
    const m = e?.meta;
    if (!m) return;
    const v = S.drc.violationsById[t.dataset.id];
    out.textContent = e.kind === "text"
      ? `"${m.text}" · ${num(m.fontSize, 0.8).toFixed(2)}mm (${pxFeel(num(m.fontSize, 0.8))}) · ${m.layer}${v ? " · ⚠ " + v[0].message : ""}`
      : `${m.parentComp ? m.parentComp + " " + m.markerKey : m.shapeType || "path"} · ${m.layer}${v ? " · ⚠ " + v[0].message : ""}`;
  } else if (t.dataset.hit === "comp") {
    const c = S.layout.components[t.dataset.comp];
    out.textContent = `${t.dataset.comp}${t.dataset.pin ? " › " + t.dataset.pin : ""} · ${c?.footprint || ""} @ (${num(c?.x).toFixed(2)}, ${num(c?.y).toFixed(2)}) ${num(c?.rotation)}°`;
  } else if (t.dataset.hit === "qr") {
    out.textContent = "QR code (bottom silk). Drag to move.";
  } else {
    out.textContent = "";
  }
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------
function isTyping(ev) {
  const t = ev.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

window.addEventListener("keydown", (ev) => {
  const ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && ev.key.toLowerCase() === "s") { ev.preventDefault(); saveLayout(); return; }
  if (isTyping(ev)) return;
  if (ctrl && ev.key.toLowerCase() === "z") { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if (ctrl && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); return; }
  if (ctrl && ev.key.toLowerCase() === "d") { ev.preventDefault(); duplicateSelection(); return; }
  if (ev.key === " ") { S.spaceHeld = true; svg.classList.add("cursor-pan"); ev.preventDefault(); return; }
  const k = ev.key.toLowerCase();
  if (k === "v") setTool("select");
  else if (k === "m") setTool("measure");
  else if (k === "f") fitView();
  else if (k === "b") toggleFlip();
  else if (k === "r") rotateSelection(ev.shiftKey ? -90 : 90);
  else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); deleteSelection(); }
  else if (ev.key === "Escape") {
    if (S.measureStart) { S.measureStart = null; scheduleRender(); }
    else select(null);
  } else if (ev.key.startsWith("Arrow")) {
    ev.preventDefault();
    const step = ev.altKey ? 0.01 : (ev.shiftKey ? 0.5 : (S.snap || 0.1));
    const dirX = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
    const dirY = ev.key === "ArrowUp" ? 1 : ev.key === "ArrowDown" ? -1 : 0;
    nudge(dirX * step * (S.view.flipped ? -1 : 1), dirY * step, ev);
  }
});
window.addEventListener("keyup", (ev) => {
  if (ev.key === " ") { S.spaceHeld = false; svg.classList.remove("cursor-pan"); }
});

function setTool(tool) {
  S.tool = tool;
  S.measureStart = null;
  S.measureHover = null;
  document.querySelectorAll(".tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
  svg.classList.toggle("cursor-measure", tool === "measure");
  svg.classList.toggle("cursor-pan", tool === "pan");
  scheduleRender();
}

// ---------------------------------------------------------------------------
// Save / Publish / Route / Bootstrap
// ---------------------------------------------------------------------------
async function saveLayout() {
  if (!S.layout) return;
  if (S.apiBase === null) {
    const blob = new Blob([JSON.stringify(S.layout, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "layout.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Static mode: downloaded layout.json. Put it in ${S.project.slug}/src/`, "success", 4500);
    S.dirty = false;
    updateDirtyUi();
    return;
  }
  try {
    const res = await fetch(`${S.apiBase}/api/save-layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: S.project.id, layout: S.layout })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    S.dirty = false;
    S.layoutExistsOnDisk = true;
    $("bootstrap-banner").hidden = true;
    updateDirtyUi();
    const n = S.drc.errors.length + S.drc.warnings.length;
    toast(`💾 Saved ${j.relativePath}${n ? ` (${n} DRC violation(s) still open)` : " · DRC clean"}`, n ? "" : "success");
  } catch (err) {
    toast(`Save failed: ${err.message}`, "error", 5000);
  }
}

async function publishFab() {
  if (S.apiBase === null) { toast("Publish needs the studio server (npm run studio)", "error"); return; }
  if (S.legacy) { toast("This board's circuit.js doesn't read layout.json yet, so the export would ignore your edits.", "error", 5000); return; }
  const btn = $("btn-publish-fab");
  btn.disabled = true;
  setBusy(true, "📦 Routing + exporting Gerbers/BOM/CPL/STL…");
  try {
    const res = await fetch(`${S.apiBase}/api/publish-artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: S.project.id, layout: S.layout })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    S.dirty = false;
    updateDirtyUi();
    const sd = j.silkscreenDrc;
    const drcMsg = sd.ok ? "silk DRC clean" : `⚠ ${sd.errorCount + sd.warningCount} silk DRC violation(s)`;
    toast(`📦 Wrote ${j.writtenFiles.join(", ")} in ${(j.elapsedMs / 1000).toFixed(1)}s · ${drcMsg}`, sd.ok ? "success" : "error", 8000);
  } catch (err) {
    toast(`Publish failed: ${err.message}`, "error", 6000);
  } finally {
    btn.disabled = false;
    setBusy(false);
  }
}

async function routeTraces() {
  if (S.busy) return;
  setBusy(true, "🔀 Routing traces (2-layer autorouter)…");
  await new Promise(r => setTimeout(r, 30));
  try {
    await compileProject(true);
    buildCopperIndex();
    deriveSilk();
    scheduleRender();
    schedule3D();
    toast(`Routed ${S.traces.length} trace(s)`, "success");
  } catch (err) {
    toast(`Routing failed: ${err.message}`, "error", 6000);
  } finally {
    setBusy(false);
  }
}

function autofixFonts() {
  const small = S.silkTexts.filter(t => num(t.fontSize, 0.8) < JLCPCB_MIN_FONT_MM - 0.005);
  if (!small.length) { toast("No text is under 0.80 mm 👍", "success"); return; }
  pushUndo();
  for (const t of small) {
    if (t.parentComp) markerCfg(t.parentComp, t.markerKey).fontSize = JLCPCB_MIN_FONT_MM;
    else {
      const it = S.layout.silkscreen.find(i => i.id === t.id);
      if (it) it.fontSize = JLCPCB_MIN_FONT_MM;
    }
  }
  changed();
  renderInspector();
  toast(`Raised ${small.length} label(s) to 0.80 mm. Check for new pad overlaps.`);
}

// ---------------------------------------------------------------------------
// 3D split preview
// ---------------------------------------------------------------------------
let t3d = null;
function schedule3D() {
  if (!S.viewer3D) return;
  clearTimeout(t3d);
  t3d = setTimeout(() => {
    const { w, l } = boardSize();
    try { S.viewer3D.renderCircuit(buildSyntheticCircuitJson(), w, l, 1.0); } catch (err) { console.warn("3D render", err); }
  }, 250);
}

async function toggle3D(force) {
  const stage = $("center-stage");
  const pane = $("preview-3d-pane");
  const on = force !== undefined ? force : pane.hidden;
  pane.hidden = !on;
  stage.classList.toggle("split-3d", on);
  $("btn-toggle-3d").classList.toggle("active", on);
  if (on && !S.viewer3D) {
    try {
      const { createThreePcbViewer } = await import("./three-pcb-viewer.js");
      S.viewer3D = createThreePcbViewer($("studio-3d-container"), { boardColor: 0x16171b });
    } catch (err) {
      toast(`3D preview unavailable: ${err.message}`, "error");
      return;
    }
  }
  setTimeout(() => { S.viewer3D?.onResize?.(); scheduleRender(); }, 60);
  if (on) schedule3D();
}

// ---------------------------------------------------------------------------
// PPI calibration
// ---------------------------------------------------------------------------
function updateCalibrationBar(v) {
  $("calibration-card-bar").style.width = `${(85.6 * v) / 25.4}px`;
  $("input-ppi-slider").value = v;
  $("input-ppi-number").value = v;
}

// ---------------------------------------------------------------------------
// Wire up static UI
// ---------------------------------------------------------------------------
function wireUi() {
  $("select-project").addEventListener("change", (e) => {
    if (S.dirty && !confirm("You have unsaved layout changes. Switch project anyway?")) {
      e.target.value = S.project.id;
      return;
    }
    loadProject(e.target.value);
  });
  document.querySelectorAll(".tool-btn").forEach(b => b.addEventListener("click", () => setTool(b.dataset.tool)));
  document.querySelectorAll(".stamp-btn").forEach(b => b.addEventListener("click", () => stamp(b.dataset.stamp)));
  $("select-snap").addEventListener("change", (e) => { S.snap = parseFloat(e.target.value) || 0; });
  S.snap = parseFloat($("select-snap").value) || 0;
  $("btn-zoom-fit").addEventListener("click", fitView);
  $("btn-zoom-physical").addEventListener("click", zoomPhysical);
  $("btn-flip-board").addEventListener("click", toggleFlip);
  $("btn-toggle-3d").addEventListener("click", () => toggle3D());
  $("btn-close-3d").addEventListener("click", () => toggle3D(false));
  $("btn-undo").addEventListener("click", undo);
  $("btn-redo").addEventListener("click", redo);
  $("btn-save-layout").addEventListener("click", saveLayout);
  $("btn-publish-fab").addEventListener("click", publishFab);
  $("btn-route-traces").addEventListener("click", routeTraces);
  $("btn-autofix-fonts").addEventListener("click", autofixFonts);
  $("btn-clear-rulers").addEventListener("click", () => { S.measures = []; S.measureStart = null; scheduleRender(); });
  $("btn-bootstrap-layout").addEventListener("click", async () => {
    await saveLayout();
    if (S.apiBase !== null) toast("layout.json created. Next, ask an agent to wire circuit.js to read it (copy the 00/03 pattern).", "success", 7000);
  });

  // Stamp side
  document.querySelectorAll(".active-side-toggle .mini-pill").forEach(b => b.addEventListener("click", () => {
    S.stampSide = b.dataset.side;
    document.querySelectorAll(".active-side-toggle .mini-pill").forEach(x => x.classList.toggle("active", x === b));
  }));

  // Layers
  document.querySelectorAll(".layer-toggles input[data-layer]").forEach(cb => cb.addEventListener("change", () => {
    S.layers[cb.dataset.layer] = cb.checked;
    scheduleRender();
  }));

  // Tree
  $("input-object-search").addEventListener("input", (e) => { S.treeFilter = e.target.value; renderTree(); });
  document.querySelectorAll(".exp-tab").forEach(b => b.addEventListener("click", () => {
    S.treeTab = b.dataset.exptab;
    document.querySelectorAll(".exp-tab").forEach(x => x.classList.toggle("active", x === b));
    renderTree();
  }));
  treeList.addEventListener("click", (e) => {
    const row = e.target.closest(".tree-row");
    if (!row) return;
    if (row.dataset.treeComp) select({ type: "comp", name: row.dataset.treeComp });
    else if (row.dataset.treeSilk) select({ type: "silk", id: row.dataset.treeSilk });
  });

  // DRC list
  drcList.addEventListener("click", (e) => {
    const item = e.target.closest("[data-drc-id]");
    if (!item) return;
    const id = item.dataset.drcId;
    if (id.startsWith("comp__")) select({ type: "comp", name: id.slice(6) });
    else if (S.silkIndex.has(id)) select({ type: "silk", id });
  });

  // Inspector delegation
  inspectorRoot.addEventListener("focusin", () => { S.inspUndoArmed = true; });
  inspectorRoot.addEventListener("input", (e) => {
    const el = e.target;
    if (el.type === "checkbox" || el.tagName === "SELECT") return;
    if (S.inspUndoArmed) { pushUndo(); S.inspUndoArmed = false; }
    if (applyInspectorField(el)) { deriveSilk(); markDirty(); scheduleRender(); }
  });
  inspectorRoot.addEventListener("change", (e) => {
    const el = e.target;
    if (el.type === "checkbox" || el.tagName === "SELECT") {
      pushUndo();
      if (applyInspectorField(el)) changed();
    }
    S.inspUndoArmed = true;
    renderInspector();
    renderTree();
  });
  inspectorRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) handleInspectorAction(btn);
  });

  // PPI modal
  $("btn-calibrate-ppi").addEventListener("click", () => { updateCalibrationBar(S.cssPxPerInch); $("ppi-modal").hidden = false; });
  $("btn-close-ppi").addEventListener("click", () => { $("ppi-modal").hidden = true; });
  $("input-ppi-slider").addEventListener("input", (e) => updateCalibrationBar(num(e.target.value, 96)));
  $("input-ppi-number").addEventListener("input", (e) => updateCalibrationBar(num(e.target.value, 96)));
  $("btn-reset-ppi").addEventListener("click", () => updateCalibrationBar(96));
  $("btn-apply-ppi").addEventListener("click", () => {
    S.cssPxPerInch = num($("input-ppi-number").value, 96);
    localStorage.setItem(PPI_STORAGE_KEY, String(S.cssPxPerInch));
    $("ppi-modal").hidden = true;
    zoomPhysical();
  });

  window.addEventListener("beforeunload", (e) => {
    if (S.dirty) { e.preventDefault(); e.returnValue = ""; }
  });
  if (window.ResizeObserver) new ResizeObserver(() => scheduleRender()).observe(wrap);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  wireUi();
  await probeServer();
  const id = new URL(location.href).searchParams.get("project") || "03";
  await loadProject(id);
})();
