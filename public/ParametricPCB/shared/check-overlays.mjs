#!/usr/bin/env node
/**
 * Parametric PCB Suite - Unified Copper Feature Collision & Clearance Detector
 * 
 * Scans PCB layouts (SMT pads, plated through-holes, mounting holes, vias) for:
 *   1. Direct geometric copper collisions (overlap > 0mm)
 *   2. Clearance violations below manufacturing threshold (gap < 0.20mm standard)
 * 
 * Usage:
 *   node shared/check-overlays.mjs                # Defaults to 03 (or detects active dir)
 *   node shared/check-overlays.mjs 03             # Checks 03-compactAudioMotionSquarePCB
 *   node shared/check-overlays.mjs 02             # Checks 02-audioMotionReactiveLedHapticPCB
 *   node shared/check-overlays.mjs 01             # Checks 01-V6Led
 *   node shared/check-overlays.mjs --clearance=0.25
 *   node shared/check-overlays.mjs --json
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pcbSuiteRoot = path.resolve(__dirname, "..");

// ANSI Terminal Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";

// CLI Arguments
const rawArgs = process.argv.slice(2);
const jsonOutput = rawArgs.includes("--json");
const clearanceArg = rawArgs.find(a => a.startsWith("--clearance="));
const MIN_CLEARANCE = clearanceArg ? parseFloat(clearanceArg.split("=")[1]) : 0.20; // 0.20mm JLCPCB default

// Determine target project
let targetSubdir = rawArgs.find(a => !a.startsWith("--"));

if (!targetSubdir) {
  // If invoked inside a subproject directory, use current working directory
  const cwd = process.cwd();
  const rel = path.relative(pcbSuiteRoot, cwd);
  if (rel && !rel.startsWith("..") && !rel.includes("shared")) {
    targetSubdir = rel;
  } else {
    targetSubdir = "03-compactAudioMotionSquarePCB";
  }
}

// Map short aliases (00, 01, 02, 03) to full folder names
const projectDirMap = {
  "00": "00-starterPCB",
  "starter": "00-starterPCB",
  "01": "01-V6Led",
  "02": "02-audioMotionReactiveLedHapticPCB",
  "03": "03-compactAudioMotionSquarePCB",
  "0": "00-starterPCB",
  "1": "01-V6Led",
  "2": "02-audioMotionReactiveLedHapticPCB",
  "3": "03-compactAudioMotionSquarePCB"
};

const resolvedSubdir = projectDirMap[targetSubdir] || targetSubdir;
let circuitModulePath = path.resolve(pcbSuiteRoot, resolvedSubdir, "src", "circuit.js");

if (!fs.existsSync(circuitModulePath)) {
  // Check if target is a direct circuit.js path
  if (fs.existsSync(path.resolve(process.cwd(), targetSubdir))) {
    circuitModulePath = path.resolve(process.cwd(), targetSubdir);
  } else {
    console.error(`${RED}Error: Cannot locate circuit.js at:${RESET} ${circuitModulePath}`);
    process.exit(2);
  }
}

async function runCheck() {
  if (!jsonOutput) {
    console.log(`${BOLD}${CYAN}======================================================${RESET}`);
    console.log(`${BOLD}${CYAN} Parametric PCB: Pad & Pin Collision Detector${RESET}`);
    console.log(`${BOLD}${CYAN}======================================================${RESET}`);
    console.log(`${GRAY}Target Project:${RESET} ${BOLD}${resolvedSubdir}${RESET}`);
    console.log(`${GRAY}Module Path:   ${circuitModulePath}${RESET}`);
    console.log(`${GRAY}Compiling circuit layout...${RESET}`);
  }

  const moduleUrl = pathToFileURL(circuitModulePath).href;
  const circuitModule = await import(moduleUrl);

  if (!circuitModule.compileCircuit) {
    throw new Error(`Module at ${circuitModulePath} does not export compileCircuit()`);
  }

  const circuit = await circuitModule.compileCircuit({
    boardWidth: 38,
    boardLength: 38,
    skipRouting: true
  });

  const circuitJson = circuit.getCircuitJson();

  // Component & Port Metadata Index Maps
  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const pcMap = new Map(circuitJson.filter(e => e.type === "pcb_component").map(c => [c.pcb_component_id, scMap.get(c.source_component_id) || c.name]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));

  // Extract all copper pads and plated holes
  const copperItems = [];

  circuitJson.forEach(item => {
    if (item.type === "pcb_smtpad") {
      const comp = pcMap.get(item.pcb_component_id) || "SMD_Part";
      const port = ppMap.get(item.pcb_port_id);
      const pin = port?.name || (item.port_hints ? item.port_hints[0] : item.pcb_smtpad_id);
      copperItems.push({
        type: "smt",
        id: item.pcb_smtpad_id,
        comp,
        pin,
        displayName: `${comp}.${pin}`,
        layer: item.layer || "top",
        x: item.x,
        y: item.y,
        w: item.width || 1.6,
        h: item.height || 1.6,
        shape: item.shape || "rect"
      });
    } else if (item.type === "pcb_plated_hole") {
      const comp = pcMap.get(item.pcb_component_id) || (item.port_hints ? item.port_hints[0] : "Hole");
      const port = ppMap.get(item.pcb_port_id);
      const pin = port?.name || (item.port_hints ? (item.port_hints[1] || item.port_hints[0]) : item.pcb_plated_hole_id);
      copperItems.push({
        type: "tht",
        id: item.pcb_plated_hole_id,
        comp,
        pin,
        displayName: `${comp}.${pin}`,
        layer: "both",
        x: item.x,
        y: item.y,
        outerDia: item.outer_diameter || 1.8,
        r: (item.outer_diameter || 1.8) / 2,
        holeDia: item.hole_diameter || 1.0,
        rDrill: (item.hole_diameter || 1.0) / 2
      });
    }
  });

  const collisions = [];
  const clearanceViolations = [];

  for (let i = 0; i < copperItems.length; i++) {
    for (let j = i + 1; j < copperItems.length; j++) {
      const a = copperItems[i];
      const b = copperItems[j];

      // Ignore pads belonging to the exact same component footprint
      if (a.comp === b.comp && a.comp !== "Hole" && a.comp !== "SMD_Part") {
        continue;
      }

      // Check copper layer overlap
      const sharesLayer = (a.layer === "both" || b.layer === "both" || a.layer === b.layer);
      if (!sharesLayer) continue;

      let gap = 0;
      let overlap = 0;

      if (a.type === "tht" && b.type === "tht") {
        // Circle vs Circle
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        gap = d - (a.r + b.r);
        if (gap < 0) overlap = -gap;
      } else if (a.type === "tht" && b.type === "smt") {
        // Circle (a) vs Rect (b)
        const nx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, a.x));
        const ny = Math.max(b.y - b.h / 2, Math.min(b.y + b.h / 2, a.y));
        const d = Math.hypot(a.x - nx, a.y - ny);
        gap = d - a.r;
        if (gap < 0) overlap = -gap;
      } else if (a.type === "smt" && b.type === "tht") {
        // Rect (a) vs Circle (b)
        const nx = Math.max(a.x - a.w / 2, Math.min(a.x + a.w / 2, b.x));
        const ny = Math.max(a.y - a.h / 2, Math.min(a.y + a.h / 2, b.y));
        const d = Math.hypot(b.x - nx, b.y - ny);
        gap = d - b.r;
        if (gap < 0) overlap = -gap;
      } else {
        // Rect (a) vs Rect (b)
        const dx = Math.abs(a.x - b.x) - (a.w / 2 + b.w / 2);
        const dy = Math.abs(a.y - b.y) - (a.h / 2 + b.h / 2);
        if (dx < 0 && dy < 0) {
          gap = Math.max(dx, dy);
          overlap = -gap;
        } else if (dx >= 0 && dy >= 0) {
          gap = Math.hypot(dx, dy);
        } else {
          gap = Math.max(dx, dy);
        }
      }

      const pairKey = [a.displayName, b.displayName].sort().join(" <-> ");
      const record = {
        key: pairKey,
        itemA: {
          name: a.displayName,
          type: a.type.toUpperCase(),
          layer: a.layer,
          x: +a.x.toFixed(2),
          y: +a.y.toFixed(2),
          dim: a.type === "tht" ? `Ø${a.outerDia}mm` : `${a.w}×${a.h}mm`
        },
        itemB: {
          name: b.displayName,
          type: b.type.toUpperCase(),
          layer: b.layer,
          x: +b.x.toFixed(2),
          y: +b.y.toFixed(2),
          dim: b.type === "tht" ? `Ø${b.outerDia}mm` : `${b.w}×${b.h}mm`
        },
        gap: +gap.toFixed(3),
        overlap: +overlap.toFixed(3)
      };

      if (overlap > 0) {
        collisions.push(record);
      } else if (gap < MIN_CLEARANCE) {
        clearanceViolations.push(record);
      }
    }
  }

  collisions.sort((x, y) => y.overlap - x.overlap);
  clearanceViolations.sort((x, y) => x.gap - y.gap);

  if (jsonOutput) {
    console.log(JSON.stringify({
      project: resolvedSubdir,
      totalPads: copperItems.length,
      collisionsCount: collisions.length,
      clearanceViolationsCount: clearanceViolations.length,
      collisions,
      clearanceViolations
    }, null, 2));
    process.exit(collisions.length > 0 ? 1 : 0);
  }

  console.log(`\n${BOLD}Total Copper Features Audited:${RESET} ${copperItems.length} (${copperItems.filter(i => i.type === "tht").length} THT pins/holes, ${copperItems.filter(i => i.type === "smt").length} SMT pads)\n`);

  if (collisions.length > 0) {
    console.log(`${BOLD}${RED}🚨 CRITICAL OVERLAYS / COPPER COLLISIONS DETECTED (${collisions.length}):${RESET}`);
    console.log(`${GRAY}The following pads/pins physically intersect on the PCB:${RESET}\n`);

    collisions.forEach((c, idx) => {
      console.log(`  ${BOLD}${RED}[${idx + 1}] PHYSICAL OVERLAP: ${c.overlap.toFixed(2)}mm${RESET}`);
      console.log(`      ${CYAN}${c.itemA.name}${RESET} [${c.itemA.type}, Layer: ${c.itemA.layer}, ${c.itemA.dim}] at (${c.itemA.x}, ${c.itemA.y})`);
      console.log(`      ${MAGENTA}collides with${RESET}`);
      console.log(`      ${CYAN}${c.itemB.name}${RESET} [${c.itemB.type}, Layer: ${c.itemB.layer}, ${c.itemB.dim}] at (${c.itemB.x}, ${c.itemB.y})\n`);
    });
  } else {
    console.log(`${BOLD}${GREEN}✔ ZERO PHYSICAL COPPER OVERLAYS DETECTED!${RESET}\n`);
  }

  if (clearanceViolations.length > 0) {
    console.log(`${BOLD}${YELLOW}⚠️  CLEARANCE WARNINGS (< ${MIN_CLEARANCE}mm, Count: ${clearanceViolations.length}):${RESET}`);
    console.log(`${GRAY}These pads do not intersect, but are too close for reliable fabrication:${RESET}\n`);

    clearanceViolations.forEach((c, idx) => {
      console.log(`  ${BOLD}${YELLOW}[${idx + 1}] GAP: ${c.gap.toFixed(3)}mm (Need ≥ ${MIN_CLEARANCE}mm)${RESET}`);
      console.log(`      ${CYAN}${c.itemA.name}${RESET} at (${c.itemA.x}, ${c.itemA.y}) <-> ${CYAN}${c.itemB.name}${RESET} at (${c.itemB.x}, ${c.itemB.y})`);
    });
    console.log("");
  }

  console.log(`${BOLD}${CYAN}======================================================${RESET}`);
  if (collisions.length > 0) {
    console.log(`${BOLD}${RED}FAILED: ${collisions.length} collision(s) detected.${RESET}`);
    process.exit(1);
  } else {
    console.log(`${BOLD}${GREEN}PASSED: All pads and pins have clean physical clearance.${RESET}`);
    process.exit(0);
  }
}

runCheck().catch(err => {
  console.error(`${RED}Collision check failed with error:${RESET}`, err);
  process.exit(2);
});
