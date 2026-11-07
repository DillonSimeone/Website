import { React } from "./tscircuit-core.js";
import {
  computeSloganPlacements,
  parseSloganPhrases,
  resolveSloganPhrases
} from "./slogan-placements.js";

export { DEFAULT_SLOGAN_PHRASES, resolveSloganPhrases } from "./slogan-placements.js";

let activeWorker = null;
let activeRequestId = 0;

function SloganTextComponent({ name, text, pcbX, pcbY, pcbRotation = 0 }) {
  return React.createElement("chip", {
    name: name,
    pcbX: pcbX,
    pcbY: pcbY,
    pcbRotation: pcbRotation,
    footprint: React.createElement("footprint", null,
      React.createElement("silkscreentext", {
        text: text,
        pcbX: "0mm",
        pcbY: "0mm",
        fontSize: "0.6mm"
      })
    )
  });
}

/** Build a circuit-json silkscreen entry compatible with gerber export. */
export function buildSloganSilkscreenEntry({ id, text, x, y, rotation, fontSize }) {
  return {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: id,
    text,
    x,
    y,
    center: { x, y },
    anchor_position: { x, y },
    anchor_alignment: "center",
    ccw_rotation: rotation ?? 0,
    rotation: rotation ?? 0,
    font: "tscircuit2024",
    font_size: fontSize ?? 0.6,
    layer: "top"
  };
}

/**
 * Run placement on a Web Worker when available; cancels any in-flight request.
 * @returns {Promise<ReturnType<typeof computeSloganPlacements>>}
 */
export function runSloganPlacement(params) {
  activeRequestId += 1;
  const requestId = activeRequestId;

  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  if (typeof Worker === "undefined") {
    return Promise.resolve(computeSloganPlacements(params));
  }

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./slogan-worker.js", import.meta.url), { type: "module" });
      activeWorker = worker;
    } catch {
      resolve(computeSloganPlacements(params));
      return;
    }

    worker.onmessage = (event) => {
      worker.terminate();
      if (activeWorker === worker) activeWorker = null;
      if (requestId !== activeRequestId) return;
      resolve(event.data);
    };
    worker.onerror = (err) => {
      worker.terminate();
      if (activeWorker === worker) activeWorker = null;
      if (requestId !== activeRequestId) return;
      reject(err);
    };
    worker.postMessage(params);
  });
}

async function resolvePlacements(params) {
  try {
    return await runSloganPlacement(params);
  } catch {
    return computeSloganPlacements(params);
  }
}

/**
 * Generates random, collision-checked tilted slogans on a background worker thread.
 */
export async function generateSlogans({
  boardWidth,
  boardHeight,
  ledCount,
  spacing,
  sloganPhrases = "this machine kills facism",
  sloganCount = 40
}) {
  const phrases = parseSloganPhrases(sloganPhrases);
  const count = Math.max(0, Math.min(200, parseInt(sloganCount, 10) || 0));
  const seed = boardWidth + ledCount + spacing + count + phrases.join("").length;

  const { placements } = await resolvePlacements({
    boardWidth,
    boardHeight,
    ledCount,
    spacing,
    phrases,
    sloganCount: count,
    seed
  });

  return placements.map((p) =>
    React.createElement(SloganTextComponent, {
      name: `SLOGAN_${p.index}`,
      text: p.text,
      pcbX: `${p.rx}mm`,
      pcbY: `${p.ry}mm`,
      pcbRotation: p.rotation,
      key: `slogan_${p.index}_${p.text}`
    })
  );
}

/** Remove compiled slogan chips and patched silkscreen entries from circuit JSON. */
export function stripSlogansFromCircuitJson(circuitJson) {
  const sloganSourceIds = new Set();
  const sloganPcbCompIds = new Set();

  for (const el of circuitJson) {
    if (el.type === "source_component") {
      const baseName = (el.name || "").replace(/^R\d+_C\d+_/, "");
      if (baseName.startsWith("SLOGAN")) {
        sloganSourceIds.add(el.source_component_id);
      }
    }
  }

  for (const el of circuitJson) {
    if (el.type === "pcb_component" && sloganSourceIds.has(el.source_component_id)) {
      sloganPcbCompIds.add(el.pcb_component_id);
    }
  }

  return circuitJson.filter((el) => {
    if (el.type === "source_component" && sloganSourceIds.has(el.source_component_id)) return false;
    if (el.type === "pcb_component" && sloganPcbCompIds.has(el.pcb_component_id)) return false;
    if (el.pcb_component_id && sloganPcbCompIds.has(el.pcb_component_id)) return false;
    if (el.source_component_id && sloganSourceIds.has(el.source_component_id)) return false;
    if (el.type === "pcb_silkscreen_text") {
      const id = el.pcb_silkscreen_text_id || "";
      if (/^(R\d+_C\d+_)?slogan_/.test(id)) return false;
    }
    return true;
  });
}

/**
 * Replace slogans in an existing circuit JSON without recompiling copper/layout.
 * @returns {Promise<{ circuitJson: object[], placedCount: number, attemptedCount: number }>}
 */
export async function applySlogansToCircuitJson(circuitJson, {
  boardWidth,
  boardHeight,
  ledCount,
  spacing,
  sloganPhrases,
  sloganCount = 40,
  useMouseBites = false,
  panelRows = 1,
  panelCols = 1,
  seed = Date.now()
}) {
  const resolvedPhrases = resolveSloganPhrases(sloganPhrases);
  const phrases = parseSloganPhrases(resolvedPhrases);
  const count = Math.max(0, Math.min(200, parseInt(sloganCount, 10) || 0));
  const stripped = stripSlogansFromCircuitJson(circuitJson);

  if (count <= 0) {
    return { circuitJson: stripped, placedCount: 0, attemptedCount: 0 };
  }

  const { placements, placedCount, attemptedCount } = await resolvePlacements({
    boardWidth,
    boardHeight,
    ledCount,
    spacing,
    phrases,
    sloganCount: count,
    seed
  });

  const rows = useMouseBites ? panelRows : 1;
  const cols = useMouseBites ? panelCols : 1;
  const colGap = 2.0;
  const rowGap = 2.0;
  const newEntries = [];

  for (let r = 0; r < rows; r++) {
    const offsetY = (r - (rows - 1) / 2) * (boardHeight + rowGap);
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * (boardWidth + colGap);
      const prefix = useMouseBites ? `R${r}_C${c}_` : "";

      for (const p of placements) {
        const x = p.rx + offsetX;
        const y = p.ry + offsetY;
        newEntries.push(buildSloganSilkscreenEntry({
          id: `${prefix}slogan_${p.index}`,
          text: p.text,
          x,
          y,
          rotation: p.rotation,
          fontSize: p.fontSize
        }));
      }
    }
  }

  return {
    circuitJson: [...stripped, ...newEntries],
    placedCount: useMouseBites ? placedCount * rows * cols : placedCount,
    attemptedCount: useMouseBites ? attemptedCount * rows * cols : attemptedCount
  };
}

/** Build a stable or randomized seed for placement runs. */
export function buildSloganSeed(state, { randomize = false } = {}) {
  if (randomize) return Date.now();
  const phrase = resolveSloganPhrases(state.sloganPhrases);
  return (
    state.boardWidth +
    state.ledCount * 17 +
    state.spacing * 13 +
    (state.sloganCount || 0) * 7 +
    phrase.length
  );
}

/** Apply slogans to circuit JSON using app state fields. */
export async function applySlogansForState(circuitJson, state, { randomize = false } = {}) {
  return applySlogansToCircuitJson(circuitJson, {
    boardWidth: state.boardWidth,
    boardHeight: state.boardHeight,
    ledCount: state.ledCount,
    spacing: state.spacing,
    sloganPhrases: resolveSloganPhrases(state.sloganPhrases),
    sloganCount: state.sloganCount,
    useMouseBites: state.useMouseBites,
    panelRows: state.panelRows,
    panelCols: state.panelCols,
    seed: buildSloganSeed(state, { randomize })
  });
}
