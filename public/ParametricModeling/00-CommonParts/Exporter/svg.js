// Reusable SVG Exporter for Laser Cutting Layers
export function getLaserSVG(k, t, k_f) {
  const H = k.height;
  const N = Math.ceil(H / t);
  
  const R_outer = k.outerD / 2;
  const R_top = R_outer * k.taper;
  const R_bore = k.boreD / 2;
  
  const R_slot = (R_bore + R_top) / 2;
  const slotSize = t - k_f;
  
  const rodW = t + k_f;
  const rodL = H + k_f;
  
  const spacing = k.outerD + 15;
  const margin = 20;
  const cols = Math.min(6, N + 2);
  const rows = Math.ceil((N + 2) / cols);
  
  const svgW = cols * spacing + margin * 2;
  const svgH = rows * spacing + margin * 2;
  
  let svg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}mm" height="${svgH}mm" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `  <style>\n    .cut { fill: none; stroke: #ff0000; stroke-width: 0.1; }\n    .engrave { fill: none; stroke: #0000ff; stroke-width: 0.1; }\n    .text { font-family: monospace; font-size: 3px; fill: #0000ff; }\n  </style>\n`;
  svg += `  <!-- Created by ACCESS KNOB Laser Exporter -->\n`;
  
  for (let r = 0; r < 2; r++) {
    const cx = margin + r * 15 + rodW/2;
    const cy = margin + rodL/2;
    svg += `  <rect class="cut" x="${cx - rodW/2}" y="${cy - rodL/2}" width="${rodW}" height="${rodL}" />\n`;
    svg += `  <text class="text" x="${cx - 5}" y="${cy + rodL/2 + 4}">ROD ${r+1}</text>\n`;
  }
  
  for (let i = 0; i < N; i++) {
    const idx = i + 2;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = margin + col * spacing + spacing/2;
    const cy = margin + row * spacing + spacing/2;
    
    const Z_i = (i + 0.5) * t;
    const f = Math.min(1.0, Math.max(0.0, Z_i / H));
    const R_i = R_outer - (R_outer - R_top) * f;
    
    svg += `  <!-- Layer ${i+1} (Z = ${Z_i.toFixed(2)}mm, R = ${R_i.toFixed(2)}mm) -->\n`;
    svg += `  <g id="layer-${i+1}">\n`;
    
    if (k.shape === 'cyl') {
      svg += `    <circle class="cut" cx="${cx}" cy="${cy}" r="${R_i}" />\n`;
    } else if (k.wave) {
      const pts = [];
      for (let a = 0; a < 360; a += 10) {
        const rad = a * Math.PI / 180;
        const rr = R_i - 2 + Math.sin(a * 0.15) * 3;
        pts.push(`${(cx + rr * Math.cos(rad)).toFixed(3)},${(cy + rr * Math.sin(rad)).toFixed(3)}`);
      }
      svg += `    <polygon class="cut" points="${pts.join(' ')}" />\n`;
    } else {
      const sides = k.sides;
      const star = k.star;
      const pts = [];
      const numPts = star ? sides * 2 : sides;
      for (let pIdx = 0; pIdx < numPts; pIdx++) {
        const angle = pIdx * 2 * Math.PI / numPts - Math.PI / 2;
        const rr = (star && pIdx % 2 === 1) ? R_i * 0.5 : R_i;
        pts.push(`${(cx + rr * Math.cos(angle)).toFixed(3)},${(cy + rr * Math.sin(angle)).toFixed(3)}`);
      }
      svg += `    <polygon class="cut" points="${pts.join(' ')}" />\n`;
    }
    
    if (k.texMode === 'flutes') {
      const fluteR = k.texScale / 2;
      const fluteDist = R_i - k.texDepth + fluteR;
      for (let fIdx = 0; fIdx < k.texCount; fIdx++) {
        const angle = fIdx * 2 * Math.PI / k.texCount;
        const fcx = cx + fluteDist * Math.cos(angle);
        const fcy = cy + fluteDist * Math.sin(angle);
        svg += `    <circle class="cut" cx="${fcx.toFixed(3)}" cy="${fcy.toFixed(3)}" r="${fluteR.toFixed(3)}" />\n`;
      }
    }
    
    const d_bore = k.boreD;
    const r_bore = d_bore / 2;
    if (k.shaftType === 'dshaft') {
      const flatDepth = 1.0;
      const yFlat = r_bore - flatDepth;
      const angleFlat = Math.acos(yFlat / r_bore);
      const x1 = -r_bore * Math.sin(angleFlat);
      const x2 = r_bore * Math.sin(angleFlat);
      
      const p1x = (cx + x1).toFixed(3);
      const p1y = (cy - yFlat).toFixed(3);
      const p2x = (cx + x2).toFixed(3);
      const p2y = (cy - yFlat).toFixed(3);
      
      svg += `    <path class="cut" d="M ${p1x} ${p1y} L ${p2x} ${p2y} A ${r_bore.toFixed(3)} ${r_bore.toFixed(3)} 0 1 1 ${p1x} ${p1y}" />\n`;
    } else if (k.shaftType === 'knurled') {
      const numSplines = 18;
      const splinesPts = [];
      for (let sIdx = 0; sIdx < numSplines * 2; sIdx++) {
        const angle = sIdx * Math.PI / numSplines;
        const rr = (sIdx % 2 === 1) ? r_bore + 0.3 : r_bore;
        splinesPts.push(`${(cx + rr * Math.cos(angle)).toFixed(3)},${(cy + rr * Math.sin(angle)).toFixed(3)}`);
      }
      svg += `    <polygon class="cut" points="${splinesPts.join(' ')}" />\n`;
    } else {
      svg += `    <circle class="cut" cx="${cx}" cy="${cy}" r="${r_bore}" />\n`;
    }
    
    svg += `    <rect class="cut" x="${(cx - R_slot - slotSize/2).toFixed(3)}" y="${(cy - slotSize/2).toFixed(3)}" width="${slotSize}" height="${slotSize}" />\n`;
    svg += `    <rect class="cut" x="${(cx + R_slot - slotSize/2).toFixed(3)}" y="${(cy - slotSize/2).toFixed(3)}" width="${slotSize}" height="${slotSize}" />\n`;
    svg += `    <text class="text" x="${cx - 8}" y="${cy - R_slot/2}">L${i+1}/${N}</text>\n`;
    svg += `  </g>\n`;
  }
  
  svg += `</svg>`;
  return svg;
}
