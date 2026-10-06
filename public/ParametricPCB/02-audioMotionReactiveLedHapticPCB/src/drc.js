import { normalizeRouting } from "./pcb-rules.js";

function drcItem(text, refs) {
  return { text, refs: refs.filter(Boolean) };
}

function padCopperBox(pad) {
  const cx = pad.x ?? pad.center?.x ?? 0;
  const cy = pad.y ?? pad.center?.y ?? 0;
  const w = pad.width ?? (pad.radius ? pad.radius * 2 : 0.4);
  const h = pad.height ?? w;
  return {
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minY: cy - h / 2,
    maxY: cy + h / 2,
    id: pad.pcb_smtpad_id
  };
}

function padViaCopperGap(box, viaX, viaY, viaOuterRadius) {
  const nx = Math.max(box.minX, Math.min(box.maxX, viaX));
  const ny = Math.max(box.minY, Math.min(box.maxY, viaY));
  return Math.hypot(viaX - nx, viaY - ny) - viaOuterRadius;
}

function segmentSamples(x1, y1, x2, y2, step = 0.1) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.ceil(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return pts;
}

function tracePortIds(trace) {
  const ids = new Set();
  for (const pt of trace.route ?? []) {
    if (pt.start_pcb_port_id) ids.add(pt.start_pcb_port_id);
    if (pt.end_pcb_port_id) ids.add(pt.end_pcb_port_id);
  }
  return ids;
}

function traceRefs(trace) {
  const refs = [{ kind: "pcb_trace", id: trace.pcb_trace_id }];
  if (trace.source_trace_id) refs.push({ kind: "source_trace", id: trace.source_trace_id });
  return refs;
}

/**
 * Client-side advisory DRC against JLCPCB 2-layer standard rules.
 * Returns { ok, errors, warnings } with structured items { text, refs }.
 */
export function runManufacturingDrc(circuitJson, routing) {
  const errors = [];
  const warnings = [];
  const r = normalizeRouting(routing);

  const pads = circuitJson.filter((e) => e.type === "pcb_smtpad");
  const vias = circuitJson.filter(
    (e) => e.type === "pcb_via" && !e.pcb_via_id?.startsWith("mb_via")
  );
  const traces = circuitJson.filter((e) => e.type === "pcb_trace");

  const padBoxes = pads.map(padCopperBox);
  const portToPadIds = new Map();
  for (const pad of pads) {
    if (pad.pcb_port_id) {
      const list = portToPadIds.get(pad.pcb_port_id) ?? [];
      list.push(pad.pcb_smtpad_id);
      portToPadIds.set(pad.pcb_port_id, list);
    }
  }

  const traceById = new Map(traces.map((t) => [t.pcb_trace_id, t]));
  const padsForTrace = (trace) => {
    const padIds = new Set();
    for (const portId of tracePortIds(trace)) {
      for (const padId of portToPadIds.get(portId) ?? []) padIds.add(padId);
    }
    return padIds;
  };

  const padsForVia = (via) => {
    if (!via.pcb_trace_id) return new Set();
    const trace = traceById.get(via.pcb_trace_id);
    return trace ? padsForTrace(trace) : new Set();
  };

  const tracePadWarned = new Set();
  const viaPadWarned = new Set();
  const viaPairWarned = new Set();

  for (const trace of traces) {
    const connectedPads = padsForTrace(trace);
    const route = trace.route ?? [];

    for (const pt of route) {
      const w = pt.width ?? r.nominalTraceWidth;
      if (w < r.minTraceWidth - 0.001) {
        errors.push(drcItem(
          `Trace ${trace.pcb_trace_id}: width ${w.toFixed(3)}mm < ${r.minTraceWidth}mm minimum`,
          traceRefs(trace)
        ));
      }
    }

    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      if (a.route_type === "via" || b.route_type === "via") continue;
      const halfW = (a.width ?? r.nominalTraceWidth) / 2;

      for (const pt of segmentSamples(a.x, a.y, b.x, b.y)) {
        for (const box of padBoxes) {
          if (connectedPads.has(box.id)) continue;
          const key = `${trace.pcb_trace_id}:${box.id}`;
          if (tracePadWarned.has(key)) continue;

          const cx = Math.max(box.minX, Math.min(box.maxX, pt.x));
          const cy = Math.max(box.minY, Math.min(box.maxY, pt.y));
          const edgeGap = Math.hypot(pt.x - cx, pt.y - cy) - halfW;
          if (edgeGap < r.traceToPadClearance - 0.02) {
            tracePadWarned.add(key);
            warnings.push(drcItem(
              `Trace ${trace.pcb_trace_id}: copper may be within ${r.traceToPadClearance}mm of pad ${box.id}`,
              [...traceRefs(trace), { kind: "pcb_smtpad", id: box.id }]
            ));
          }
        }
      }
    }
  }

  const viaOuter = (v) => (v.outer_diameter ?? r.viaPadDiameter) / 2;
  const viaKeepout = (v) => viaOuter(v) + r.traceToViaClearance;

  for (let i = 0; i < vias.length; i++) {
    for (let j = i + 1; j < vias.length; j++) {
      const key = [vias[i].pcb_via_id, vias[j].pcb_via_id].sort().join("|");
      if (viaPairWarned.has(key)) continue;
      const d = Math.hypot(vias[i].x - vias[j].x, vias[i].y - vias[j].y);
      const minD = viaKeepout(vias[i]) + viaKeepout(vias[j]) - r.traceToViaClearance;
      if (d < minD - 0.02) {
        viaPairWarned.add(key);
        warnings.push(drcItem(
          `Vias ${vias[i].pcb_via_id} and ${vias[j].pcb_via_id}: centers only ${d.toFixed(2)}mm apart (need ≥ ${minD.toFixed(2)}mm)`,
          [
            { kind: "pcb_via", id: vias[i].pcb_via_id },
            { kind: "pcb_via", id: vias[j].pcb_via_id }
          ]
        ));
      }
    }
  }

  for (const via of vias) {
    const skipPads = padsForVia(via);
    const outerR = viaOuter(via);

    for (const box of padBoxes) {
      if (skipPads.has(box.id)) continue;
      const padCx = (box.minX + box.maxX) / 2;
      const padCy = (box.minY + box.maxY) / 2;
      if (Math.hypot(via.x - padCx, via.y - padCy) < 0.55) continue;

      const key = `${via.pcb_via_id}:${box.id}`;
      if (viaPadWarned.has(key)) continue;

      const gap = padViaCopperGap(box, via.x, via.y, outerR);
      if (gap < -0.02) {
        viaPadWarned.add(key);
        errors.push(drcItem(
          `Via ${via.pcb_via_id}: copper overlaps pad ${box.id}`,
          [{ kind: "pcb_via", id: via.pcb_via_id }, { kind: "pcb_smtpad", id: box.id }]
        ));
      } else if (gap < r.traceToPadClearance - 0.02) {
        viaPadWarned.add(key);
        warnings.push(drcItem(
          `Via ${via.pcb_via_id}: within ${r.traceToPadClearance}mm of pad ${box.id}`,
          [{ kind: "pcb_via", id: via.pcb_via_id }, { kind: "pcb_smtpad", id: box.id }]
        ));
      }
    }
  }

  const dedupeItems = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const k = item.text;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return {
    ok: errors.length === 0,
    errors: dedupeItems(errors),
    warnings: dedupeItems(warnings)
  };
}
