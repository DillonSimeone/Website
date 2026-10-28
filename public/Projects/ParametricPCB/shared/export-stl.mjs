#!/usr/bin/env node

/**
 * ============================================================================
 * Parametric PCB Suite - 3D Routed PCB Mesh & STL Exporter
 * 
 * Generates true 3D solid STL files of routed printed circuit boards:
 * 1. FR-4 Substrate solid board slab
 * 2. Plated through-hole drill cores and annular rings
 * 3. Surface-mount copper solder pads
 * 4. 3D continuous rounded copper tube traces (Top & Bottom layers)
 * 5. Raised 3D component body packages (ICs, MOSFETs, USB, switches, LEDs)
 * 
 * Usage:
 *   node shared/export-stl.mjs [01|02|03|04|--all]
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pcbSuiteRoot = path.resolve(__dirname, "..");

/**
 * Converts a tscircuit circuitJson representation into a 3D Three.js solid Group
 */
export function buildPcbThreeGroup(circuitJson, options = {}) {
  const boardItem = circuitJson.find(i => i.type === "pcb_board");
  const boardWidth = options.boardWidth || boardItem?.width || 38;
  const boardHeight = options.boardHeight || boardItem?.height || 38;
  const boardThickness = options.boardThickness || boardItem?.thickness || 1.6;
  const halfT = boardThickness / 2;

  const group = new THREE.Group();

  // 1. Solid PCB Substrate Slab
  const substrateGeom = new THREE.BoxGeometry(boardWidth, boardHeight, boardThickness);
  const substrateMesh = new THREE.Mesh(substrateGeom);
  substrateMesh.position.set(boardItem?.center?.x || 0, boardItem?.center?.y || 0, 0);
  group.add(substrateMesh);

  // 2. Plated Through-Hole Annular Rings & Drill Barrels
  const platedHoles = circuitJson.filter(i => i.type === "pcb_plated_hole");
  for (const h of platedHoles) {
    const rOuter = (h.outer_diameter || 1.8) / 2;
    const rHole = (h.hole_diameter || 1.0) / 2;
    const x = h.x || 0;
    const y = h.y || 0;

    // Drill core cylinder
    const drillGeom = new THREE.CylinderGeometry(rHole, rHole, boardThickness + 0.06, 16);
    drillGeom.rotateX(Math.PI / 2);
    const drillMesh = new THREE.Mesh(drillGeom);
    drillMesh.position.set(x, y, 0);
    group.add(drillMesh);

    // Top and Bottom Annular Rings
    if (rOuter > rHole) {
      const ringGeom = new THREE.RingGeometry(rHole, rOuter, 20);
      const ringTop = new THREE.Mesh(ringGeom);
      ringTop.position.set(x, y, halfT + 0.02);
      group.add(ringTop);

      const ringBot = new THREE.Mesh(ringGeom);
      ringBot.position.set(x, y, -(halfT + 0.02));
      ringBot.rotation.y = Math.PI;
      group.add(ringBot);
    }
  }

  // 3. SMT Solder Pads
  const smtPads = circuitJson.filter(i => i.type === "pcb_smtpad");
  for (const pad of smtPads) {
    const w = pad.width || 1.0;
    const h = pad.height || 1.0;
    const x = pad.x || 0;
    const y = pad.y || 0;
    const isTop = (pad.layer || "top") === "top";

    const padGeom = new THREE.BoxGeometry(w, h, 0.04);
    const padMesh = new THREE.Mesh(padGeom);
    padMesh.position.set(x, y, isTop ? (halfT + 0.02) : -(halfT + 0.02));
    group.add(padMesh);
  }

  // 4. 3D Rounded Copper Tube Traces
  const traces = circuitJson.filter(i => i.type === "pcb_trace");
  for (const trace of traces) {
    const route = trace.route || [];
    if (route.length < 2) continue;

    for (let i = 0; i < route.length - 1; i++) {
      const p1 = route[i];
      const p2 = route[i + 1];
      const x1 = p1.x ?? p1.start?.x ?? p1.end?.x;
      const y1 = p1.y ?? p1.start?.y ?? p1.end?.y;
      const x2 = p2.x ?? p2.start?.x ?? p2.end?.x;
      const y2 = p2.y ?? p2.start?.y ?? p2.end?.y;

      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

      const isTop = (p1.layer || "top") === "top";
      const z = isTop ? (halfT + 0.02) : -(halfT + 0.02);

      const curve = new THREE.LineCurve3(new THREE.Vector3(x1, y1, z), new THREE.Vector3(x2, y2, z));
      const radius = Math.max(0.12, (trace.width || 0.25) / 2);
      const tubeGeom = new THREE.TubeGeometry(curve, 1, radius, 8, false);
      const tubeMesh = new THREE.Mesh(tubeGeom);
      group.add(tubeMesh);
    }
  }

  // 5. 3D Raised Component Bodies (Chips, Regulators, USB, Switches, LEDs)
  const components = circuitJson.filter(i => i.type === "pcb_component");
  for (const comp of components) {
    const cx = comp.center?.x || 0;
    const cy = comp.center?.y || 0;
    const cw = comp.width || 2.0;
    const ch = comp.height || 2.0;

    // Filter out full-board container boundaries or zero dimensions
    if (cw >= boardWidth * 0.95 && ch >= boardHeight * 0.95) continue;
    if (cw <= 0.1 || ch <= 0.1) continue;

    // Profile height based on component dimensions
    let compH = 0.6;
    if (cw >= 8 || ch >= 8) {
      compH = 2.4; // USB receptacle or MCU module
    } else if (cw >= 4 || ch >= 4) {
      compH = 1.5; // Tactile push button or power inductor
    } else if (cw >= 2 || ch >= 2) {
      compH = 0.9; // SOT-23 / SOT-23-5 IC
    } else {
      compH = 0.45; // 0603 passive
    }

    const isTop = (comp.layer || "top") === "top";
    const compZ = isTop ? (halfT + 0.04 + compH / 2) : -(halfT + 0.04 + compH / 2);

    const compGeom = new THREE.BoxGeometry(cw * 0.92, ch * 0.92, compH);
    const compMesh = new THREE.Mesh(compGeom);
    compMesh.position.set(cx, cy, compZ);
    if (comp.rotation) {
      compMesh.rotation.z = (comp.rotation * Math.PI) / 180;
    }
    group.add(compMesh);
  }

  return group;
}

/**
 * Exports a circuitJson into binary STL Buffer
 */
export function exportCircuitToStlBuffer(circuitJson, options = {}) {
  const group = buildPcbThreeGroup(circuitJson, options);
  const exporter = new STLExporter();
  const dataView = exporter.parse(group, { binary: true });
  return Buffer.from(dataView.buffer, dataView.byteOffset, dataView.byteLength);
}

/**
 * Project Configurations and Batch Pipeline
 */
export const PROJECT_CONFIGS = [
  {
    id: "00",
    name: "00-starterPCB",
    filePrefix: "00_starter",
    modulePath: "../00-starterPCB/src/circuit.js",
    destDir: "../00-starterPCB",
    compileArgs: {
      boardWidth: 40,
      boardLength: 40,
      skipRouting: false
    }
  },
  {
    id: "01",
    name: "01-V6Led",
    filePrefix: "01_v6led",
    modulePath: "../01-V6Led/src/circuit.js",
    destDir: "../01-V6Led",
    compileArgs: {
      ledCount: 6,
      spacing: 10,
      boardWidth: 70,
      boardHeight: 10,
      skipRouting: false
    }
  },
  {
    id: "02",
    name: "02-audioMotionReactiveLedHapticPCB",
    filePrefix: "02_audioMotionBaton",
    modulePath: "../02-audioMotionReactiveLedHapticPCB/src/circuit.js",
    destDir: "../02-audioMotionReactiveLedHapticPCB",
    compileArgs: {
      boardWidth: 20,
      boardLength: 120,
      skipRouting: false
    }
  },
  {
    id: "03",
    name: "03-compactAudioMotionSquarePCB",
    filePrefix: "03_compactSquare",
    modulePath: "../03-compactAudioMotionSquarePCB/src/circuit.js",
    destDir: "../03-compactAudioMotionSquarePCB",
    compileArgs: {
      boardWidth: 38,
      boardLength: 38,
      skipRouting: false
    }
  },
  {
    id: "04",
    name: "04-smdAudioMotionBatonPCB",
    filePrefix: "04_smdAudioMotionBaton",
    modulePath: "../04-smdAudioMotionBatonPCB/src/circuit.js",
    destDir: "../04-smdAudioMotionBatonPCB",
    compileArgs: {
      boardWidth: 22,
      boardLength: 110,
      skipRouting: false
    }
  }
];

export async function exportProjectArtifacts(cfg) {
  console.log(`\n======================================================`);
  console.log(`🔨 Compiling and exporting artifacts for: ${cfg.name}`);
  console.log(`======================================================`);

  const fullModulePath = path.resolve(__dirname, cfg.modulePath);
  const mod = await import(pathToFileURL(fullModulePath).href);

  const t0 = performance.now();
  const circuit = await mod.compileCircuit(cfg.compileArgs);
  const circuitJson = circuit.getCircuitJson();
  console.log(`Circuit compiled in ${(performance.now() - t0).toFixed(0)}ms (${circuitJson.length} items).`);

  const outDir = path.resolve(__dirname, cfg.destDir);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const writtenFiles = [];

  // 1. Generate & Save Binary STL
  const boardItem = circuitJson.find(i => i.type === "pcb_board");
  console.log(`Meshing 3D PCB solid geometry...`);
  const stlBuffer = exportCircuitToStlBuffer(circuitJson, {
    boardWidth: boardItem?.width || cfg.compileArgs.boardWidth,
    boardHeight: boardItem?.height || cfg.compileArgs.boardLength || cfg.compileArgs.boardHeight
  });

  const stlFilename = `${cfg.filePrefix}_routed.stl`;
  const stlPath = path.join(outDir, stlFilename);
  fs.writeFileSync(stlPath, stlBuffer);
  writtenFiles.push(stlFilename);
  console.log(`✔ Saved 3D STL: ${stlFilename} (${(stlBuffer.length / 1024).toFixed(1)} KB)`);

  // 2. Extract & Save BOM + CPL + Gerbers
  let arts = null;
  if (typeof mod.generateManufacturingArtifacts === "function") {
    try {
      arts = await mod.generateManufacturingArtifacts(circuit, cfg.compileArgs);
      if (arts.bomCsv) {
        const bomName = `${cfg.filePrefix}_BOM.csv`;
        fs.writeFileSync(path.join(outDir, bomName), arts.bomCsv, "utf8");
        writtenFiles.push(bomName);
        console.log(`✔ Saved BOM CSV: ${bomName}`);
      }
      if (arts.pnpCsv) {
        const pnpName = `${cfg.filePrefix}_CPL.csv`;
        fs.writeFileSync(path.join(outDir, pnpName), arts.pnpCsv, "utf8");
        writtenFiles.push(pnpName);
        console.log(`✔ Saved CPL/PNP CSV: ${pnpName}`);
      }
    } catch (err) {
      console.warn(`[Artifact Warning]:`, err.message);
    }
  } else if (typeof mod.generateBOM === "function") {
    try {
      const bom = mod.generateBOM(circuitJson);
      const pnp = mod.generatePNP(circuitJson);
      if (bom) {
        const bomName = `${cfg.filePrefix}_BOM.csv`;
        fs.writeFileSync(path.join(outDir, bomName), bom, "utf8");
        writtenFiles.push(bomName);
        console.log(`✔ Saved BOM CSV: ${bomName}`);
      }
      if (pnp) {
        const pnpName = `${cfg.filePrefix}_CPL.csv`;
        fs.writeFileSync(path.join(outDir, pnpName), pnp, "utf8");
        writtenFiles.push(pnpName);
        console.log(`✔ Saved CPL/PNP CSV: ${pnpName}`);
      }
    } catch (err) {
      console.warn(`[Artifact Warning]:`, err.message);
    }
  }

  // 3. Generate & Save Production Gerber ZIP (Universal Fab Package)
  try {
    let gerberBuf = null;
    if (arts?.gerberZipBlob) {
      gerberBuf = Buffer.isBuffer(arts.gerberZipBlob)
        ? arts.gerberZipBlob
        : Buffer.from(await arts.gerberZipBlob.arrayBuffer());
    } else {
      const { createGerberZipBlob } = await import("./export-utils.js");
      gerberBuf = await createGerberZipBlob(circuitJson, {
        projectName: cfg.filePrefix,
        prefix: cfg.filePrefix,
        format: "nodebuffer"
      });
    }
    if (gerberBuf) {
      const gerberFilename = `${cfg.filePrefix}_Gerbers.zip`;
      const gerberPath = path.join(outDir, gerberFilename);
      fs.writeFileSync(gerberPath, Buffer.from(gerberBuf));
      writtenFiles.push(gerberFilename);
      console.log(`✔ Saved Gerber ZIP: ${gerberFilename} (${(gerberBuf.length / 1024).toFixed(1)} KB)`);
    }
  } catch (gErr) {
    console.warn(`[Gerber Export Warning]:`, gErr.message);
  }

  return { stlPath, stlSize: stlBuffer.length, writtenFiles, drc: arts?.drc || null };
}

// CLI Execution Entry Point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2] || "--all";

  (async () => {
    try {
      if (arg === "--all") {
        for (const cfg of PROJECT_CONFIGS) {
          await exportProjectArtifacts(cfg);
        }
      } else {
        const cfg = PROJECT_CONFIGS.find(c => c.id === arg || c.name.includes(arg));
        if (cfg) {
          await exportProjectArtifacts(cfg);
        } else {
          console.error(`Unknown project ID: ${arg}. Expected 01, 02, 03, 04, or --all.`);
          process.exit(1);
        }
      }
      console.log(`\n🎉 All STL & BOM/PNP exports completed successfully!`);
    } catch (err) {
      console.error(`\n❌ Fatal Export Error:`, err);
      process.exit(1);
    }
  })();
}
