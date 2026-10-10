#!/usr/bin/env node

/**
 * ============================================================================
 * EasyEDA / JLCPCB Official Footprint Extractor
 * Fetches the exact factory CAD land pattern directly from EasyEDA's internal API
 * by LCSC Part Number (e.g. C8598, C20917, C15127, C382138).
 * 
 * Usage:
 *   node shared/fetch-easyeda-footprint.mjs C8598
 *   node shared/fetch-easyeda-footprint.mjs C20917 --code
 * ============================================================================
 */

const lcscId = process.argv[2];
const outputCodeOnly = process.argv.includes("--code");

if (!lcscId) {
  console.log("Usage: node shared/fetch-easyeda-footprint.mjs <LCSC_PART_NUMBER> [--code]");
  console.log("Example: node shared/fetch-easyeda-footprint.mjs C8598");
  process.exit(1);
}

async function fetchEasyEdaComponent(id) {
  const cleanId = id.toUpperCase().trim();
  const url = `https://easyeda.com/api/products/${cleanId}/components`;
  
  if (!outputCodeOnly) {
    console.log(`\n🔍 Querying EasyEDA API for LCSC part: ${cleanId}...`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}: Failed to fetch component from EasyEDA.`);
  }

  const data = await res.json();
  if (!data.success || !data.result) {
    throw new Error(`Part ${cleanId} not found in EasyEDA component registry.`);
  }

  return data.result;
}

function parseEasyEdaPads(componentData) {
  const pkg = componentData.packageDetail;
  if (!pkg || !pkg.dataStr || !pkg.dataStr.shape) {
    throw new Error("No PCB footprint data found in component response.");
  }

  const shapes = pkg.dataStr.shape;
  const rawPads = shapes.filter(s => typeof s === "string" && s.startsWith("PAD~"));
  
  if (rawPads.length === 0) {
    throw new Error("No SMT/THT pads found in footprint package.");
  }

  const parsed = [];
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < rawPads.length; i++) {
    const parts = rawPads[i].split("~");
    const shape = parts[1];
    const rawX = parseFloat(parts[2]);
    const rawY = parseFloat(parts[3]);
    const rawW = parseFloat(parts[4]);
    const rawH = parseFloat(parts[5]);
    const layer = parts[6];
    const pin = parts[8] || `${i + 1}`;

    parsed.push({ shape, rawX, rawY, rawW, rawH, layer, pin });
    sumX += rawX;
    sumY += rawY;
  }

  // EasyEDA uses 10 mil units (0.254 mm).
  // Origin is either (400, 300) or centroid of pad cluster.
  const centroidX = sumX / parsed.length;
  const centroidY = sumY / parsed.length;
  
  // If centroid is near standard origin (400, 300), snap to (400, 300)
  const originX = Math.abs(centroidX - 400) < 50 ? 400 : centroidX;
  const originY = Math.abs(centroidY - 300) < 50 ? 300 : centroidY;

  return parsed.map(p => {
    const xMm = ((p.rawX - originX) * 0.254);
    const yMm = -((p.rawY - originY) * 0.254); // Invert Y to match Cartesian EDA
    const wMm = (p.rawW * 0.254);
    const hMm = (p.rawH * 0.254);
    return {
      pin: p.pin,
      shape: p.shape.toLowerCase(),
      x: Number(xMm.toFixed(3)),
      y: Number(yMm.toFixed(3)),
      w: Number(wMm.toFixed(3)),
      h: Number(hMm.toFixed(3)),
      layer: p.layer === "1" ? "top" : (p.layer === "2" ? "bottom" : "all")
    };
  });
}

async function run() {
  try {
    const comp = await fetchEasyEdaComponent(lcscId);
    const pkg = comp.packageDetail;
    const pads = parseEasyEdaPads(comp);

    if (outputCodeOnly) {
      console.log(`// tscircuit footprint for ${comp.title} (${lcscId})`);
      console.log(`// Package: ${pkg.title}`);
      pads.forEach(p => {
        console.log(`React.createElement("smtpad", { portHints: ["pin${p.pin}"], pcbX: "${p.x}mm", pcbY: "${p.y}mm", shape: "${p.shape}", width: "${p.w}mm", height: "${p.h}mm", layer: "${p.layer}" }),`);
      });
      return;
    }

    const displayLcsc = typeof comp.lcsc === "object" ? (comp.lcsc.number || comp.lcsc.part || lcscId.toUpperCase()) : (comp.lcsc || lcscId.toUpperCase());
    console.log("======================================================");
    console.log(`📦 Component: ${comp.title}`);
    console.log(`🏷️  Package:   ${pkg.title}`);
    console.log(`🔢 LCSC ID:   ${displayLcsc}`);
    console.log("======================================================\n");

    console.log("Pad Coordinates (Millimeters):");
    pads.forEach(p => {
      console.log(`  • Pin ${p.pin.padEnd(3)} | Position: (${p.x >= 0 ? "+" : ""}${p.x.toFixed(2)}mm, ${p.y >= 0 ? "+" : ""}${p.y.toFixed(2)}mm) | Dimensions: ${p.w.toFixed(2)}mm × ${p.h.toFixed(2)}mm (${p.shape})`);
    });

    if (pads.length === 2) {
      const pitch = Math.hypot(pads[0].x - pads[1].x, pads[0].y - pads[1].y);
      const span = pitch + (pads[0].w + pads[1].w) / 2;
      const gap = pitch - (pads[0].w + pads[1].w) / 2;
      console.log("\nTwo-Pin Geometry Analysis:");
      console.log(`  • Center-to-Center Pitch: ${pitch.toFixed(2)}mm`);
      console.log(`  • Total Outer Span:       ${span.toFixed(2)}mm`);
      console.log(`  • Inner Clearance Gap:    ${gap.toFixed(2)}mm`);
    }

    console.log("\nDrop-in tscircuit React Component Code:");
    console.log("------------------------------------------------------");
    console.log(`export function ${comp.title.replace(/[^a-zA-Z0-9_]/g, "_")}({ name, pcbX = "0mm", pcbY = "0mm", pcbRotation = 0 }) {`);
    console.log("  return React.createElement(\"chip\", {");
    console.log("    name, pcbX, pcbY, pcbRotation,");
    const pinLabels = pads.map(p => `pin${p.pin}: "${p.pin}"`).join(", ");
    console.log(`    pinLabels: { ${pinLabels} },`);
    console.log("    footprint: React.createElement(\"footprint\", null,");
    pads.forEach((p, idx) => {
      const comma = idx === pads.length - 1 ? "" : ",";
      console.log(`      React.createElement("smtpad", { portHints: ["pin${p.pin}"], pcbX: "${p.x}mm", pcbY: "${p.y}mm", shape: "${p.shape}", width: "${p.w}mm", height: "${p.h}mm", layer: "${p.layer}" })${comma}`);
    });
    console.log("    )");
    console.log("  });");
    console.log("}");
    console.log("------------------------------------------------------\n");

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

run();
