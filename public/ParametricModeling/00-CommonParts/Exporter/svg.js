// Reusable SVG Exporter for Laser Cutting Layers
// Reusable SVG Exporter for Laser Cutting Layers
export function getLaserSVG(k, t, k_f) {
  const H = k.height;
  const N = Math.ceil(H / t);
  
  const R_outer = k.outerD / 2;
  const R_top = R_outer * k.taper;
  const R_bore = k.boreD / 2;
  const r_bore = R_bore;
  
  // To ensure slots align across all layers, we must calculate the safe space
  // using the smallest layer (the top layer).
  const Z_top = (N - 0.5) * t;
  const f_top = Math.min(1.0, Math.max(0.0, Z_top / H));
  const R_top_layer = R_outer - (R_outer - R_top) * f_top;
  
  let R_profile_min = R_top_layer;
  if (k.shape === 'cyl') {
    R_profile_min = R_top_layer;
  } else if (k.wave) {
    R_profile_min = R_top_layer - 5; // conservative estimate for wave
  } else {
    const sides = k.sides || 6;
    const star = k.star;
    if (star) {
      R_profile_min = R_top_layer * 0.5;
    } else {
      R_profile_min = R_top_layer * Math.cos(Math.PI / sides);
    }
  }
  if (k.texMode === 'flutes') {
    R_profile_min = Math.min(R_profile_min, R_top_layer - k.texDepth);
  } else if (k.texMode === 'rings') {
    R_profile_min = Math.min(R_profile_min, R_top_layer - k.texDepth);
  }
  
  // Calculate slot size and position
  const minRodW = 3.0; // Rods must be at least 3mm on any axis to avoid burning to ash
  const minSlotSize = minRodW - k_f * 2; 
  const defaultSlotSize = Math.max(minSlotSize, t - k_f);
  
  const spaceMin = r_bore + 1.2; // 1.2mm wall around bore for strength
  const spaceMax = R_profile_min - 1.2; // 1.2mm wall from outer edge
  
  let slotSize = defaultSlotSize;
  let R_slot = (r_bore + R_top_layer) / 2; // default guess
  let hasRods = true;
  
  if (spaceMax - spaceMin < minSlotSize) {
    // If the solid area is too narrow to support a 3mm-wide rod, disable rods entirely
    hasRods = false;
  } else {
    if (spaceMin + defaultSlotSize > spaceMax) {
      // Fit slot into the maximum available space, which is >= minSlotSize
      slotSize = spaceMax - spaceMin;
      R_slot = (spaceMin + spaceMax) / 2;
    } else {
      // Fits! Place slot in the center of the safe zone
      R_slot = (spaceMin + spaceMax) / 2;
    }
  }
  
  const rodW = hasRods ? (slotSize + k_f * 2) : 0;
  const rodL = H + k_f;
  
  // DENSE PACKING ALGORITHM (Multi-plate 4x4 inch shelf packing)
  const plateWidth = 101.6; // 4 inches in mm
  const plateHeight = 101.6; // 4 inches in mm
  const plateGap = 10.0; // gap between plates in the output SVG
  const margin = 5.0; // 5mm margin on each plate
  const gap = 1.0; // 1mm minimum space between pieces as requested
  
  const printableW = plateWidth - margin * 2;
  const printableH = plateHeight - margin * 2;
  
  const items = [];
  if (hasRods) {
    // Orient rods horizontally for optimal packing: width = rodL, height = rodW
    items.push({ type: 'rod', id: 1, w: rodL, h: rodW });
    items.push({ type: 'rod', id: 2, w: rodL, h: rodW });
  }
  
  // Add layers
  for (let i = 0; i < N; i++) {
    const Z_i = (i + 0.5) * t;
    const f = Math.min(1.0, Math.max(0.0, Z_i / H));
    const R_i = R_outer - (R_outer - R_top) * f;
    items.push({ type: 'layer', index: i, w: R_i * 2, h: R_i * 2, R_i, Z_i });
  }
  
  // MASONRY OPTIMIZATION: Sort items descending by height (First-Fit Decreasing Height)
  items.sort((a, b) => b.h - a.h);
  
  // Pack items sequentially into 101.6x101.6 mm plates
  const plates = [ [] ];
  let currentPlateIdx = 0;
  let currentX = margin;
  let currentY = margin;
  let rowHeight = 0;
  
  for (const item of items) {
    // If item exceeds current row width, drop to next row
    if (currentX + item.w > printableW + margin && currentX > margin) {
      currentX = margin;
      currentY += rowHeight + gap;
      rowHeight = 0;
    }
    
    // If item row exceeds plate height, start a new plate
    if (currentY + item.h > printableH + margin && currentY > margin) {
      currentPlateIdx++;
      if (plates.length <= currentPlateIdx) {
        plates.push([]);
      }
      currentX = margin;
      currentY = margin;
      rowHeight = 0;
    }
    
    item.plate = currentPlateIdx;
    item.localX = currentX;
    item.localY = currentY;
    
    currentX += item.w + gap;
    if (item.h > rowHeight) {
      rowHeight = item.h;
    }
    
    plates[currentPlateIdx].push(item);
  }
  
  const numPlates = plates.length;
  const svgW = numPlates * plateWidth + (numPlates - 1) * plateGap;
  const svgH = plateHeight;
  
  let svg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}mm" height="${svgH}mm" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `  <style>\n    .cut { fill: none; stroke: #ff0000; stroke-width: 0.1; }\n    .engrave { fill: none; stroke: #0000ff; stroke-width: 0.1; }\n    .text { font-family: monospace; font-size: 2px; fill: #0000ff; }\n    .plate-bound { fill: none; stroke: #555555; stroke-width: 0.1; stroke-dasharray: 2 2; }\n    .plate-label { font-family: monospace; font-size: 2px; fill: #888888; }\n  </style>\n`;
  svg += `  <!-- Created by ACCESS KNOB Laser Exporter -->\n`;
  
  // Draw plate boundaries
  for (let p = 0; p < numPlates; p++) {
    const px = p * (plateWidth + plateGap);
    svg += `  <!-- Plate ${p+1} Boundary (4x4 inches) -->\n`;
    svg += `  <rect class="plate-bound" x="${px.toFixed(3)}" y="0" width="${plateWidth}" height="${plateHeight}" />\n`;
    svg += `  <text class="plate-label" x="${(px + margin).toFixed(3)}" y="${(plateHeight - 2).toFixed(3)}">PLATE ${p+1} (4x4")</text>\n`;
  }
  
  // Draw packed items
  for (const item of items) {
    const absX = item.plate * (plateWidth + plateGap) + item.localX;
    const absY = item.localY;
    
    if (item.type === 'rod') {
      const cx = absX + item.w / 2;
      const cy = absY + item.h / 2;
      svg += `  <!-- Rod ${item.id} -->\n`;
      svg += `  <rect class="cut" x="${absX.toFixed(3)}" y="${absY.toFixed(3)}" width="${item.w.toFixed(3)}" height="${item.h.toFixed(3)}" />\n`;
      // Center horizontal text inside the horizontal rod
      svg += `  <text class="text" x="${cx.toFixed(3)}" y="${cy.toFixed(3)}" text-anchor="middle" dominant-baseline="middle">ROD ${item.id}</text>\n`;
    } else {
      const i = item.index;
      const R_i = item.R_i;
      const Z_i = item.Z_i;
      const cx = absX + R_i;
      const cy = absY + R_i;
      
      svg += `  <!-- Layer ${i+1} (Z = ${Z_i.toFixed(2)}mm, R = ${R_i.toFixed(2)}mm) -->\n`;
      svg += `  <g id="layer-${i+1}">\n`;
      
      if (k.shape === 'cyl') {
        svg += `    <circle class="cut" cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${R_i.toFixed(3)}" />\n`;
      } else if (k.wave) {
        const pts = [];
        for (let a = 0; a < 360; a += 10) {
          const rad = a * Math.PI / 180;
          const rr = R_i - 2 + Math.sin(a * 0.15) * 3;
          pts.push(`${(cx + rr * Math.cos(rad)).toFixed(3)},${(cy + rr * Math.sin(rad)).toFixed(3)}`);
        }
        svg += `    <polygon class="cut" points="${pts.join(' ')}" />\n`;
      } else {
        const sides = k.sides || 6;
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
        svg += `    <circle class="cut" cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r_bore.toFixed(3)}" />\n`;
      }
      
      // Draw alignment slots
      if (hasRods) {
        svg += `    <rect class="cut" x="${(cx - R_slot - slotSize/2).toFixed(3)}" y="${(cy - slotSize/2).toFixed(3)}" width="${slotSize.toFixed(3)}" height="${slotSize.toFixed(3)}" />\n`;
        svg += `    <rect class="cut" x="${(cx + R_slot - slotSize/2).toFixed(3)}" y="${(cy - slotSize/2).toFixed(3)}" width="${slotSize.toFixed(3)}" height="${slotSize.toFixed(3)}" />\n`;
      }
      
      // Position blue text centered on the solid top region (above the bore, below the outer edge)
      // Since it's straight up, the outer radius is at least R_profile_min.
      // The solid area goes from y = cy - r_bore down to y = cy - R_i.
      // Center it in this region:
      const yText = cy - (r_bore + R_i) / 2;
      svg += `    <text class="text" x="${cx.toFixed(3)}" y="${yText.toFixed(3)}" text-anchor="middle" dominant-baseline="middle">L${i+1}/${N}</text>\n`;
      svg += `  </g>\n`;
    }
  }
  
  svg += `</svg>`;
  return svg;
}
