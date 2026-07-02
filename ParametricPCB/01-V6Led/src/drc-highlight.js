/** @typedef {{ kind: string, id: string }} DrcRef */

/**
 * Resolve DRC refs to board-space targets for highlighting.
 * @returns {{ kind: string, id: string, x: number, y: number, label: string }[]}
 */
export function resolveDrcTargets(circuitJson, refs) {
  if (!refs?.length || !circuitJson) return [];

  const traces = circuitJson.filter((e) => e.type === "pcb_trace");
  const sourceTraces = circuitJson.filter((e) => e.type === "source_trace");
  const vias = circuitJson.filter((e) => e.type === "pcb_via");
  const pads = circuitJson.filter((e) => e.type === "pcb_smtpad");

  const sourceNameById = new Map(
    sourceTraces.map((st) => [st.source_trace_id, st.name ?? st.source_trace_id])
  );

  const targets = [];

  for (const ref of refs) {
    if (ref.kind === "pcb_trace" || ref.kind === "source_trace") {
      const trace =
        ref.kind === "pcb_trace"
          ? traces.find((t) => t.pcb_trace_id === ref.id)
          : traces.find((t) => t.source_trace_id === ref.id);
      if (!trace?.route?.length) continue;
      const pts = trace.route.filter((p) => p.x !== undefined && p.y !== undefined);
      if (!pts.length) continue;
      const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const net = sourceNameById.get(trace.source_trace_id) ?? trace.pcb_trace_id;
      const label = trace.pcb_trace_id
        ? (net && net !== trace.pcb_trace_id && net.length <= 28
            ? `${trace.pcb_trace_id} (${net})`
            : trace.pcb_trace_id)
        : (ref.kind === "source_trace" ? ref.id : net);
      targets.push({
        kind: ref.kind,
        id: ref.id,
        x,
        y,
        label
      });
      continue;
    }

    if (ref.kind === "pcb_via") {
      const via = vias.find((v) => v.pcb_via_id === ref.id);
      if (!via) continue;
      targets.push({
        kind: ref.kind,
        id: ref.id,
        x: via.x ?? 0,
        y: via.y ?? 0,
        label: ref.id
      });
      continue;
    }

    if (ref.kind === "pcb_smtpad") {
      const pad = pads.find((p) => p.pcb_smtpad_id === ref.id);
      if (!pad) continue;
      targets.push({
        kind: ref.kind,
        id: ref.id,
        x: pad.x ?? pad.center?.x ?? 0,
        y: pad.y ?? pad.center?.y ?? 0,
        label: ref.id
      });
    }
  }

  return targets;
}

/** Parse legacy string DRC messages for hover targets. */
export function parseDrcRefsFromText(text) {
  if (typeof text !== "string") return text?.refs ?? [];
  const refs = [];
  const add = (kind, id) => {
    if (!id) return;
    const k = `${kind}:${id}`;
    if (refs.some((r) => `${r.kind}:${r.id}` === k)) return;
    refs.push({ kind, id });
  };

  for (const m of text.matchAll(/Trace (pcb_trace_\w+)/g)) add("pcb_trace", m[1]);
  for (const m of text.matchAll(/\b(source_trace_\w+)\b/g)) add("source_trace", m[1]);
  for (const m of text.matchAll(/Via (pcb_via_\w+)/g)) add("pcb_via", m[1]);
  for (const m of text.matchAll(/\b(pcb_via_\w+)\b/g)) add("pcb_via", m[1]);
  for (const m of text.matchAll(/pad (pcb_smtpad_\w+)/g)) add("pcb_smtpad", m[1]);

  return refs;
}

export function drcItemText(item) {
  return typeof item === "string" ? item : item.text;
}

export function drcItemRefs(item) {
  if (typeof item === "string") return parseDrcRefsFromText(item);
  return item.refs ?? [];
}

export function isTraceRef(ref, trace) {
  if (!ref || !trace) return false;
  if (ref.kind === "pcb_trace") return trace.pcb_trace_id === ref.id;
  if (ref.kind === "source_trace") return trace.source_trace_id === ref.id;
  return false;
}

export function matchesDrcHighlight(refs, kind, id) {
  return refs?.some((r) => r.kind === kind && r.id === id);
}
