import { compileCircuit } from "../03-compactAudioMotionSquarePCB/src/circuit.js";

async function main() {
  console.log("Compiling circuit for comprehensive trace & clearance DRC audit...");
  const c = await compileCircuit({ skipRouting: false });
  const json = c.getCircuitJson();

  // 1. Build connectivity map: source_port_id -> netKey
  const srcPorts = json.filter(i => i.type === 'source_port');
  const srcPortToNet = new Map();
  for (const sp of srcPorts) {
    srcPortToNet.set(sp.source_port_id, sp.subcircuit_connectivity_map_key || sp.name);
  }

  // 2. Build pcb_port_id -> netKey
  const pcbPorts = json.filter(i => i.type === 'pcb_port');
  const pcbPortToNet = new Map();
  for (const pp of pcbPorts) {
    const netKey = srcPortToNet.get(pp.source_port_id) || pp.source_port_id;
    pcbPortToNet.set(pp.pcb_port_id, netKey);
  }

  // 3. Build trace connectivity map: source_trace_id -> netKey
  const sourceTraces = json.filter(i => i.type === 'source_trace');
  const traceNetMap = new Map();
  for (const st of sourceTraces) {
    const netKey = st.subcircuit_connectivity_map_key || st.name || st.source_trace_id;
    traceNetMap.set(st.source_trace_id, netKey);
  }

  // 4. Extract all trace segments
  const traces = json.filter(i => i.type === 'pcb_trace');
  const segs = [];
  for (const t of traces) {
    const net = traceNetMap.get(t.source_trace_id) || t.connection_name || t.source_trace_id;
    const r = t.route;
    if (!r || r.length < 2) continue;
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i];
      const b = r[i+1];
      const x1 = a.x ?? a.start?.x ?? a.end?.x;
      const y1 = a.y ?? a.start?.y ?? a.end?.y;
      const x2 = b.x ?? b.start?.x ?? b.end?.x;
      const y2 = b.y ?? b.start?.y ?? b.end?.y;
      const layer = a.layer || 'top';
      const w = a.width || 0.16;
      if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
        segs.push({ traceId: t.pcb_trace_id, net, layer, x1, y1, x2, y2, w });
      }
    }
  }
  console.log(`Auditing ${segs.length} copper trace segments...`);

  // Distance helpers
  function distToSeg(p, a, b) {
    const l2 = (b.x - a.x)**2 + (b.y - a.y)**2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  }

  function segSegDist(s1, s2) {
    const p1 = {x: s1.x1, y: s1.y1};
    const p2 = {x: s1.x2, y: s1.y2};
    const p3 = {x: s2.x1, y: s2.y1};
    const p4 = {x: s2.x2, y: s2.y2};
    return Math.min(
      distToSeg(p1, p3, p4),
      distToSeg(p2, p3, p4),
      distToSeg(p3, p1, p2),
      distToSeg(p4, p1, p2)
    );
  }

  let traceTraceViolations = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i];
      const s2 = segs[j];
      if (s1.layer !== s2.layer) continue;
      if (s1.net === s2.net) continue;
      const centerDist = segSegDist(s1, s2);
      const copperGap = centerDist - (s1.w / 2 + s2.w / 2);
      if (copperGap < 0.10) {
        console.log(`TRACE-TRACE VIOLATION (${s1.layer}): ${s1.net} vs ${s2.net} -> gap = ${copperGap.toFixed(4)}mm (center=${centerDist.toFixed(4)}mm, w1=${s1.w}, w2=${s2.w})`);
        console.log(`   S1: (${s1.x1.toFixed(2)},${s1.y1.toFixed(2)}) -> (${s1.x2.toFixed(2)},${s1.y2.toFixed(2)})`);
        console.log(`   S2: (${s2.x1.toFixed(2)},${s2.y1.toFixed(2)}) -> (${s2.x2.toFixed(2)},${s2.y2.toFixed(2)})`);
        traceTraceViolations++;
      }
    }
  }
  console.log(`Total Trace-to-Trace violations (< 0.10mm): ${traceTraceViolations}`);

  // 5. Trace-to-Pad DRC
  const smtPads = json.filter(i => i.type === 'pcb_smtpad');
  const platedHoles = json.filter(i => i.type === 'pcb_plated_hole');
  
  let tracePadViolations = 0;

  // Check against SMT pads
  for (const pad of smtPads) {
    const padNet = pcbPortToNet.get(pad.pcb_port_id);
    const padRadius = Math.max(pad.width, pad.height) / 2; // conservative bounding circle
    const padPt = { x: pad.x, y: pad.y };

    for (const s of segs) {
      if (s.layer !== pad.layer) continue;
      if (padNet && s.net === padNet) continue; // Same net permitted to connect
      const d = distToSeg(padPt, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      // Rectangular box distance check if within bounding circle
      const dx = Math.max(0, Math.abs(pad.x - padPt.x) - pad.width / 2);
      // For accurate segment to rect distance:
      const copperGap = d - (padRadius + s.w / 2);
      // If bounding circle indicates a potential violation, do exact rect-to-segment distance
      if (copperGap < 0.10) {
        // Let's compute exact distance to rectangle:
        // Sample 10 points along segment
        let minD = Infinity;
        for (let step = 0; step <= 10; step++) {
          const px = s.x1 + (s.x2 - s.x1) * (step / 10);
          const py = s.y1 + (s.y2 - s.y1) * (step / 10);
          const rx = Math.max(0, Math.abs(px - pad.x) - pad.width / 2);
          const ry = Math.max(0, Math.abs(py - pad.y) - pad.height / 2);
          const ptToRect = Math.hypot(rx, ry);
          if (ptToRect < minD) minD = ptToRect;
        }
        const exactGap = minD - s.w / 2;
        if (exactGap < 0.10) {
          console.log(`TRACE-PAD VIOLATION (${s.layer}): trace ${s.net} vs pad ${pad.pcb_smtpad_id} (${padNet || 'unknown'}) -> gap = ${exactGap.toFixed(4)}mm`);
          tracePadViolations++;
        }
      }
    }
  }

  // Check against Plated Holes
  for (const hole of platedHoles) {
    const holeNet = pcbPortToNet.get(hole.pcb_port_id);
    const holeR = (hole.outer_diameter || 1.6) / 2;
    const holePt = { x: hole.x, y: hole.y };

    for (const s of segs) {
      if (holeNet && s.net === holeNet) continue; // Same net permitted to connect
      const d = distToSeg(holePt, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      const copperGap = d - (holeR + s.w / 2);
      if (copperGap < 0.10) {
        console.log(`TRACE-HOLE VIOLATION (${s.layer}): trace ${s.net} vs hole ${hole.pcb_plated_hole_id} (${holeNet || 'mounting'}) -> gap = ${copperGap.toFixed(4)}mm`);
        tracePadViolations++;
      }
    }
  }

  // 6. Trace-to-Via DRC & Via-to-Via DRC
  const pcbTraces = json.filter(i => i.type === 'pcb_trace');
  const pcbTraceToNet = new Map();
  for (const pt of pcbTraces) {
    const netKey = traceNetMap.get(pt.source_trace_id) || pt.connection_name || pt.source_trace_id;
    pcbTraceToNet.set(pt.pcb_trace_id, netKey);
  }

  const vias = json.filter(i => i.type === 'pcb_via');
  const viaNetMap = new Map();
  for (const v of vias) {
    const net = pcbTraceToNet.get(v.pcb_trace_id) || traceNetMap.get(v.pcb_trace_id) || v.pcb_trace_id;
    viaNetMap.set(v.pcb_via_id, net);
  }

  let viaTraceViolations = 0;
  for (const via of vias) {
    const viaNet = viaNetMap.get(via.pcb_via_id);
    const viaR = (via.outer_diameter || 0.45) / 2;
    const viaPt = { x: via.x, y: via.y };

    for (const s of segs) {
      if (viaNet && s.net === viaNet) continue; // Same net permitted
      const d = distToSeg(viaPt, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      const copperGap = d - (viaR + s.w / 2);
      if (copperGap < 0.10) {
        console.log(`VIA-TRACE VIOLATION (${s.layer}): via ${via.pcb_via_id} (${viaNet}) vs trace ${s.net} -> gap = ${copperGap.toFixed(4)}mm`);
        viaTraceViolations++;
      }
    }
  }

  let viaViaViolations = 0;
  for (let i = 0; i < vias.length; i++) {
    for (let j = i + 1; j < vias.length; j++) {
      const v1 = vias[i];
      const v2 = vias[j];
      const n1 = viaNetMap.get(v1.pcb_via_id);
      const n2 = viaNetMap.get(v2.pcb_via_id);
      if (n1 && n2 && n1 === n2) continue; // Same net
      const d = Math.hypot(v1.x - v2.x, v1.y - v2.y);
      const copperGap = d - ((v1.outer_diameter || 0.45) / 2 + (v2.outer_diameter || 0.45) / 2);
      if (copperGap < 0.10) {
        console.log(`VIA-VIA VIOLATION: via ${v1.pcb_via_id} (${n1}) vs via ${v2.pcb_via_id} (${n2}) -> gap = ${copperGap.toFixed(4)}mm`);
        viaViaViolations++;
      }
    }
  }

  console.log(`Total Trace-to-Pad violations (< 0.10mm): ${tracePadViolations}`);
  console.log(`Total Via-to-Trace violations (< 0.10mm): ${viaTraceViolations}`);
  console.log(`Total Via-to-Via violations (< 0.10mm): ${viaViaViolations}`);
  console.log(`\n======================================================`);
  const totalViolations = traceTraceViolations + tracePadViolations + viaTraceViolations + viaViaViolations;
  if (totalViolations === 0) {
    console.log(`✔ ALL TRACES, VIAS & PADS STRICTLY COMPLIANT WITH JLCPCB >= 0.10mm CLEARANCE!`);
  } else {
    console.log(`❌ DRC FAILED: Total Violations: ${totalViolations}`);
  }
  console.log(`======================================================\n`);
}

main();
