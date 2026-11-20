import Module from 'manifold-3d';
import { buildTextLines, loadFont, resolveFontPath } from './text.js';

let wasmPromise = null;

export async function initManifold() {
  if (!wasmPromise) {
    wasmPromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}

function roundedRect2D(CrossSection, minX, minY, maxX, maxY, radius) {
  const w = maxX - minX;
  const h = maxY - minY;
  const r = Math.max(0, Math.min(radius, w / 2 - 0.05, h / 2 - 0.05));
  if (r <= 0.05) {
    return CrossSection.square([w, h]).translate([minX, minY]);
  }
  return CrossSection.square([w - 2 * r, h - 2 * r])
    .translate([minX + r, minY + r])
    .offset(r, 'Round');
}

function union2DList(CrossSection, items) {
  return items.length === 1 ? items[0] : CrossSection.union(items);
}

function union3DList(Manifold, items) {
  return items.length === 1 ? items[0] : Manifold.union(items);
}

/**
 * Find any disconnected 2D islands (e.g. dots on i/j, ?, !) and create slim rear bridges
 * down to the nearest baseline rail so every piece is physically fused.
 */
function buildIslandBridges(Manifold, CrossSection, line2D, baselineY, bridgeDepth) {
  const parts = line2D.decompose();
  if (parts.length <= 1) return [];

  // Identify the main connected body (largest bounding-box area)
  let mainIdx = 0;
  let maxArea = -1;
  const partBounds = parts.map((p, idx) => {
    const b = p.bounds();
    const area = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
    if (area > maxArea) {
      maxArea = area;
      mainIdx = idx;
    }
    return b;
  });

  const bridges = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === mainIdx) continue;
    const b = partBounds[i];
    const cx = (b.min[0] + b.max[0]) / 2;
    const islandWidth = b.max[0] - b.min[0];
    const bridgeW = Math.min(2.6, Math.max(1.4, islandWidth * 0.65));
    const yTop = (b.min[1] + b.max[1]) / 2;
    const yBot = Math.min(baselineY, yTop - 1);
    if (yTop > yBot) {
      const bridge2D = CrossSection.square([bridgeW, yTop - yBot]).translate([
        cx - bridgeW / 2,
        yBot,
      ]);
      bridges.push(Manifold.extrude(bridge2D, bridgeDepth));
    }
  }
  return bridges;
}

export async function buildMailboxSign(params) {
  const wasm = await initManifold();
  const { Manifold, CrossSection } = wasm;

  const fontPath = resolveFontPath(params.font);
  const font = loadFont(fontPath);
  const lines = buildTextLines(wasm, font, params);

  const globalMinX = Math.min(...lines.map((l) => l.bounds.min[0]));
  const globalMaxX = Math.max(...lines.map((l) => l.bounds.max[0]));
  const globalMinY = Math.min(...lines.map((l) => l.bounds.min[1]));
  const globalMaxY = Math.max(...lines.map((l) => l.bounds.max[1]));

  const solids = [];
  const bridgeDepth = Math.min(params.letterDepth, 2.4);

  if (params.style === 'plaque') {
    const pad = params.padding;
    const plate2D = roundedRect2D(
      CrossSection,
      globalMinX - pad,
      globalMinY - pad,
      globalMaxX + pad,
      globalMaxY + pad,
      Math.min(6, pad)
    );
    solids.push(Manifold.extrude(plate2D, params.plateDepth));

    const allText2D = union2DList(
      CrossSection,
      lines.map((l) => l.cs)
    );
    const letters3D = Manifold.extrude(allText2D, params.letterDepth).translate([
      0,
      0,
      params.plateDepth - 0.1, // slight overlap for clean boolean union
    ]);
    solids.push(letters3D);
  } else {
    // 'rail' or 'framed'
    const railH = params.railHeight;
    const railHalf = railH * 0.45;
    const spanPad = params.style === 'framed' ? params.padding + railH * 0.5 : lines.length > 1 ? 4 : 2;
    const railMinX = globalMinX - spanPad;
    const railMaxX = globalMaxX + spanPad;

    for (const line of lines) {
      const railY0 = line.baselineY - railHalf;
      const railY1 = railY0 + railH;
      const rail2D = roundedRect2D(CrossSection, railMinX, railY0, railMaxX, railY1, railH * 0.35);

      const lineWithRail2D = CrossSection.union([line.cs, rail2D]);
      solids.push(Manifold.extrude(line.cs, params.letterDepth));
      solids.push(Manifold.extrude(rail2D, params.railDepth));

      const bridges = buildIslandBridges(
        Manifold,
        CrossSection,
        lineWithRail2D,
        line.baselineY,
        bridgeDepth
      );
      solids.push(...bridges);
    }

    if (params.style === 'framed') {
      const pad = params.padding;
      const outer = roundedRect2D(
        CrossSection,
        globalMinX - pad - railH,
        globalMinY - pad - railH,
        globalMaxX + pad + railH,
        globalMaxY + pad + railH,
        6
      );
      const inner = roundedRect2D(
        CrossSection,
        globalMinX - pad,
        globalMinY - pad,
        globalMaxX + pad,
        globalMaxY + pad,
        3
      );
      const frame2D = outer.subtract(inner);
      solids.push(Manifold.extrude(frame2D, params.railDepth));
    } else if (lines.length > 1) {
      // Connect multi-line baseline rails with sturdy left & right vertical tie-bars
      const topRailY1 = lines[0].baselineY - railHalf + railH;
      const botRailY0 = lines[lines.length - 1].baselineY - railHalf;
      const leftBar = roundedRect2D(
        CrossSection,
        railMinX,
        botRailY0,
        railMinX + railH,
        topRailY1,
        railH * 0.35
      );
      const rightBar = roundedRect2D(
        CrossSection,
        railMaxX - railH,
        botRailY0,
        railMaxX,
        topRailY1,
        railH * 0.35
      );
      solids.push(Manifold.extrude(leftBar, params.railDepth));
      solids.push(Manifold.extrude(rightBar, params.railDepth));
    }
  }

  let sign = union3DList(Manifold, solids);

  // Optional side mounting tabs with screw holes
  if (params.mount === 'holes') {
    const b = sign.boundingBox();
    const midY = (b.min[1] + b.max[1]) / 2;
    const tabDepth = params.style === 'plaque' ? params.plateDepth : Math.min(params.railDepth, 5);
    const earW = params.holeDia + params.padding * 1.4;
    const earH = params.holeDia + params.padding * 1.4;
    const overlap = 3;

    const leftEar2D = roundedRect2D(
      CrossSection,
      b.min[0] - earW,
      midY - earH / 2,
      b.min[0] + overlap,
      midY + earH / 2,
      earH / 2
    );
    const rightEar2D = roundedRect2D(
      CrossSection,
      b.max[0] - overlap,
      midY - earH / 2,
      b.max[0] + earW,
      midY + earH / 2,
      earH / 2
    );
    const ears3D = Manifold.extrude(CrossSection.union([leftEar2D, rightEar2D]), tabDepth);
    sign = Manifold.union([sign, ears3D]);

    const holeR = params.holeDia / 2;
    const leftHole = Manifold.cylinder(tabDepth + 2, holeR, holeR, 32).translate([
      b.min[0] - earW / 2,
      midY,
      -1,
    ]);
    const rightHole = Manifold.cylinder(tabDepth + 2, holeR, holeR, 32).translate([
      b.max[0] + earW / 2,
      midY,
      -1,
    ]);
    sign = Manifold.difference([sign, leftHole, rightHole]);
  }

  // Center X/Y on the build plate with bottom flat at Z = 0
  const rawBounds = sign.boundingBox();
  const cx = (rawBounds.min[0] + rawBounds.max[0]) / 2;
  const cy = (rawBounds.min[1] + rawBounds.max[1]) / 2;
  sign = sign.translate([-cx, -cy, -rawBounds.min[2]]);

  const finalBounds = sign.boundingBox();
  const size = [
    finalBounds.max[0] - finalBounds.min[0],
    finalBounds.max[1] - finalBounds.min[1],
    finalBounds.max[2] - finalBounds.min[2],
  ];

  return {
    manifold: sign,
    fontPath,
    lines: lines.map((l) => l.text),
    size,
    volumeCm3: sign.volume() / 1000,
    numTri: sign.numTri(),
  };
}
