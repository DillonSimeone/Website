/**
 * Parametric PCB Suite - Universal 2D SVG PCB Layout Renderer
 * Converts circuitJson into high-resolution, interactive SVG markup with:
 *   1. FR-4 substrate outline
 *   2. Copper traces with Top (pink) / Bottom (cyan dashed) layer visualization
 *   3. Plated through-holes with gold annular rings & drill cores
 *   4. SMT rectangular/circular pads with gold finish
 *   5. Silkscreen text decals
 *   6. Cyberpunk leader-line callout badges
 *   7. Full data-attribute integration for shared/svg-viewer.js tooltips & net highlighting
 */

import { extractPoint } from "./svg-viewer.js";

export function generatePcbSvgMarkup(circuitJson, options = {}) {
  const {
    boardWidth = 40,
    boardHeight = 40,
    scale = 10,
    silkScale = 1.0,
    pinNames = {},
    callouts = []
  } = options;

  if (!circuitJson || !Array.isArray(circuitJson)) return "";

  const svgW = boardWidth * scale + 120;
  const svgH = boardHeight * scale + 120;
  const cx = svgW / 2;
  const cy = svgH / 2;
  const halfL = boardHeight / 2;
  const halfW = boardWidth / 2;

  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));
  const stMap = new Map(circuitJson.filter(e => e.type === "source_trace").map(t => [t.source_trace_id, t]));

  const netLengths = new Map();
  const netEndpoints = new Map();
  const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");

  // Calculate net trace lengths & endpoints
  pcbTraces.forEach(trace => {
    let len = 0;
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (pt1 && pt2) len += Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
      }
    }
    const netName = stMap.get(trace.source_trace_id)?.name || trace.connection_name || "TRACE";
    netLengths.set(netName, (netLengths.get(netName) || 0) + len);

    const startPort = ppMap.get(trace.route?.[0]?.start_pcb_port_id);
    const endPort = ppMap.get(trace.route?.[trace.route?.length - 1]?.end_pcb_port_id);
    if (!netEndpoints.has(netName)) netEndpoints.set(netName, new Set());
    if (startPort) {
      const comp = scMap.get(startPort.source_component_id) || "Comp";
      const func = pinNames[comp]?.[startPort.name] || startPort.name;
      netEndpoints.get(netName).add(`${comp}.${startPort.name} (${func})`);
    }
    if (endPort) {
      const comp = scMap.get(endPort.source_component_id) || "Comp";
      const func = pinNames[comp]?.[endPort.name] || endPort.name;
      netEndpoints.get(netName).add(`${comp}.${endPort.name} (${func})`);
    }
  });

  const sourceTraces = circuitJson.filter(item => item.type === "source_trace");
  const portToNetName = new Map();
  sourceTraces.forEach(st => {
    (st.connected_source_port_ids || []).forEach(spId => {
      portToNetName.set(spId, st.name);
      if (!netEndpoints.has(st.name)) netEndpoints.set(st.name, new Set());
      const sp = spMap.get(spId);
      if (sp) {
        const comp = scMap.get(sp.source_component_id) || "Comp";
        const func = pinNames[comp]?.[sp.name] || sp.name;
        netEndpoints.get(st.name).add(`${comp}.${sp.name} (${func})`);
      }
    });
  });

  const bx = cx - halfW * scale;
  const by = cy - halfL * scale;
  const bw = boardWidth * scale;
  const bh = boardHeight * scale;

  // 1. Traces with metadata
  const tracesSvg = pcbTraces.map(trace => {
    const netName = stMap.get(trace.source_trace_id)?.name || trace.connection_name || "UNROUTED";
    const netLen = (netLengths.get(netName) || 0).toFixed(1);

    const startPort = ppMap.get(trace.route?.[0]?.start_pcb_port_id);
    const endPort = ppMap.get(trace.route?.[trace.route?.length - 1]?.end_pcb_port_id);
    const startComp = startPort ? (scMap.get(startPort.source_component_id) || "Comp") : "";
    const endComp = endPort ? (scMap.get(endPort.source_component_id) || "Comp") : "";
    const fromLabel = startPort ? `${startComp}.${startPort.name} (${pinNames[startComp]?.[startPort.name] || startPort.name})` : "Start Pad";
    const toLabel = endPort ? `${endComp}.${endPort.name} (${pinNames[endComp]?.[endPort.name] || endPort.name})` : "End Pad";

    const segments = [];
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (!pt1 || !pt2) continue;

        const x1 = cx + pt1.x * scale;
        const y1 = cy - pt1.y * scale;
        const x2 = cx + pt2.x * scale;
        const y2 = cy - pt2.y * scale;
        const isTop = (pt1.layer || "top") === "top";
        const strokeColor = isTop ? "#ec4899" : "#00f0ff";
        const strokeDash = isTop ? "none" : "3,2";
        const sw = Math.max(1.2, (trace.width || 0.25) * scale);
        const segLen = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y).toFixed(2);

        segments.push(`
          <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" 
                stroke="${strokeColor}" stroke-width="${sw.toFixed(2)}" stroke-dasharray="${strokeDash}" 
                stroke-linecap="round" class="pcb-trace" 
                data-net="${netName}" 
                data-layer="${isTop ? 'TOP (Pink)' : 'BOTTOM (Cyan)'}"
                data-seg-len="${segLen}"
                data-net-len="${netLen}" 
                data-from="${encodeURIComponent(fromLabel)}"
                data-to="${encodeURIComponent(toLabel)}"
                data-width="${(trace.width || 0.25).toFixed(2)}mm"
                opacity="0.9" />
        `);
      }
    }
    return segments.join("\n");
  }).join("\n");

  // 2. Plated Through-Holes & SMT Pads
  const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
  const pcbPads = circuitJson.filter(item => item.type === "pcb_smtpad");

  const padsSvg = [
    ...pcbHoles.map(hole => {
      const x = cx + (hole.x || 0) * scale;
      const y = cy - (hole.y || 0) * scale;
      const rOuter = ((hole.outer_diameter || 1.8) / 2) * scale;
      const rDrill = ((hole.hole_diameter || 1.0) / 2) * scale;
      const sp = ppMap.get(hole.pcb_port_id);
      const holeHint = hole.port_hints?.[0] || hole.name || "";
      const isM3 = (hole.hole_diameter || 0) >= 3.0 || holeHint.startsWith("H");
      const comp = sp ? (scMap.get(sp.source_component_id) || "Comp") : (isM3 ? `${holeHint} (M3)` : (holeHint || "Hole"));
      const pin = sp ? sp.name : (isM3 ? "Mounting Hole" : (holeHint || "Pin"));
      const func = pinNames[comp]?.[pin] || (isM3 ? "M3 Mechanical Mounting Hole" : (sp ? pin : "Plated Hole"));
      const net = (sp ? portToNetName.get(sp.source_port_id) : "") || "NC";
      const connectedSet = netEndpoints.get(net) || new Set();
      const connectedList = Array.from(connectedSet).filter(p => !p.startsWith(`${comp}.${pin}`));
      const connectedStr = (net !== "NC" && connectedList.length > 0) ? connectedList.join(", ") : "None";

      return `
        <g class="pad-hover-group" data-comp="${comp}" data-pin="${pin}" data-func="${func}" data-net="${net}" 
           data-connected="${encodeURIComponent(connectedStr)}" data-x="${(hole.x || 0).toFixed(2)}" data-y="${(hole.y || 0).toFixed(2)}" 
           data-drill="${hole.hole_diameter || 1.0}mm" data-pad="${hole.outer_diameter || 1.8}mm">
          <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rOuter.toFixed(2)}" fill="#d4af37" stroke="#b8972e" stroke-width="1.2" />
          <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rDrill.toFixed(2)}" fill="#090a0f" />
        </g>
      `;
    }),
    ...pcbPads.map(pad => {
      const x = cx + (pad.x || 0) * scale;
      const y = cy - (pad.y || 0) * scale;
      const w = (pad.width || 0.8) * scale;
      const h = (pad.height || 0.9) * scale;
      const sp = ppMap.get(pad.pcb_port_id);
      const comp = sp ? (scMap.get(sp.source_component_id) || "Comp") : "SMD";
      const pin = sp ? sp.name : "";
      const func = pinNames[comp]?.[pin] || pin;
      const net = (sp ? portToNetName.get(sp.source_port_id) : "") || "NC";
      const connectedSet = netEndpoints.get(net) || new Set();
      const connectedList = Array.from(connectedSet).filter(p => !p.startsWith(`${comp}.${pin}`));
      const connectedStr = (net !== "NC" && connectedList.length > 0) ? connectedList.join(", ") : "None";

      return `
        <g class="pad-hover-group" data-comp="${comp}" data-pin="${pin}" data-func="${func}" data-net="${net}" 
           data-connected="${encodeURIComponent(connectedStr)}" data-x="${(pad.x || 0).toFixed(2)}" data-y="${(pad.y || 0).toFixed(2)}" 
           data-size="${(pad.width || 0.8)}x${(pad.height || 0.9)}mm">
          <rect x="${(x - w / 2).toFixed(2)}" y="${(y - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" 
                fill="#d4af37" stroke="#b8972e" stroke-width="0.8" rx="1.5" />
        </g>
      `;
    })
  ].join("\n");

  // 3. Cyberpunk Callout Badges
  const compPosMap = new Map();
  circuitJson.forEach(item => {
    if (item.type === "pcb_component") {
      const name = scMap.get(item.source_component_id) || item.name;
      if (name) compPosMap.set(name, { x: item.center?.x ?? 0, y: item.center?.y ?? 0 });
    }
  });

  const annotations = (callouts || []).map(def => {
    const pos = compPosMap.get(def.id);
    if (!pos) return "";
    const ax = cx + pos.x * scale;
    const ay = cy - pos.y * scale;

    let tx, ty, lx, ly;
    if (def.side === "left") {
      tx = bx - 60;
      ty = ay;
      lx = tx + 45;
      ly = ay;
    } else if (def.side === "right") {
      tx = bx + bw + 60;
      ty = ay;
      lx = tx - 45;
      ly = ay;
    } else if (def.side === "top") {
      tx = ax;
      ty = by - 18;
      lx = ax;
      ly = ty + 9;
    } else { // bottom
      tx = ax;
      ty = by + bh + 18;
      lx = ax;
      ly = ty - 9;
    }

    return `
      <g class="callout-annotation" opacity="0.95">
        <circle cx="${ax.toFixed(2)}" cy="${ay.toFixed(2)}" r="2.5" fill="${def.color}"/>
        <line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${lx.toFixed(2)}" y2="${ly.toFixed(2)}" stroke="${def.color}" stroke-width="1.2" stroke-dasharray="2,2"/>
        <rect x="${(tx - 45).toFixed(2)}" y="${(ty - 9).toFixed(2)}" width="90" height="18" rx="4" fill="#0b0c10" stroke="${def.color}" stroke-width="1.2"/>
        <text x="${tx.toFixed(2)}" y="${(ty + 3).toFixed(2)}" fill="${def.color}" font-family="monospace" font-size="7.5" font-weight="bold" text-anchor="middle">${def.label}</text>
      </g>
    `;
  }).join("\n");

  // 4. Silkscreen Text Over Pins
  const silkItems = circuitJson.filter(item => item.type === "pcb_silkscreen_text" && (item.layer === "top" || !item.layer));
  const silkPins = `
    <g id="svg-silkscreen-pins">
      ${silkItems.map(item => {
        const x = item.anchor_position ? item.anchor_position.x : 0;
        const y = item.anchor_position ? item.anchor_position.y : 0;
        const svgX = cx + x * scale;
        const svgY = cy - y * scale;
        const baseFs = (item.font_size || 0.8) * scale;
        const align = item.anchor_alignment || "center";
        let textAnchor = "middle";
        if (align === "center_right" || align === "top_left") textAnchor = "start";
        else if (align === "center_left" || align === "top_right") textAnchor = "end";

        const rot = item.ccw_rotation || 0;
        const rotAttr = rot !== 0 ? ` transform="rotate(${-rot}, ${svgX.toFixed(2)}, ${svgY.toFixed(2)})"` : "";

        return `<text data-base-size="${baseFs.toFixed(2)}" x="${svgX.toFixed(2)}" y="${svgY.toFixed(2)}"${rotAttr} fill="#ffffff" font-family="monospace" font-size="${(baseFs * silkScale).toFixed(2)}" font-weight="bold" text-anchor="${textAnchor}" dominant-baseline="central">${item.text}</text>`;
      }).join("\n")}
    </g>
  `;

  return `
    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" class="pcb-svg-root" style="width:100%; height:100%;">
      <g id="svg-viewport-group">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#0a1d12" stroke="#34d399" stroke-width="1.5" rx="8" />
        ${tracesSvg}
        ${padsSvg}
        ${silkPins}
        ${annotations}
      </g>
    </svg>
  `;
}
