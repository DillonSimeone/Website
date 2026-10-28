#!/usr/bin/env node
/**
 * Parametric PCB Suite - Automated Silkscreen Legibility & Polarity DRC Auditor
 *
 * Audits any PCB project against JLCPCB silkscreen fabrication & DFM rules:
 *  - Minimum character height >= 0.80mm
 *  - Supported Gerber alphabet characters (@tscircuit/alphabet)
 *  - Zero silkscreen-over-copper-pad collisions (exact OBB-vs-Pad & OBB-vs-Hole)
 *  - Board outline keepout (>= 0.25mm)
 *  - Polarity (+/- & cathode bar) and IC Pin-1 presence
 *
 * Usage:
 *   node shared/audit-silkscreen.mjs 03
 *   node shared/audit-silkscreen.mjs 00
 *   node shared/audit-silkscreen.mjs 03 --json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSilkscreenDrc } from "./silkscreen-drc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pcbSuiteRoot = path.resolve(__dirname, "..");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

const projectDirMap = {
  "00": "00-starterPCB",
  "01": "01-V6Led",
  "02": "02-audioMotionReactiveLedHapticPCB",
  "03": "03-compactAudioMotionSquarePCB",
  "04": "04-smdAudioMotionBatonPCB"
};

const defaultDims = {
  "00-starterPCB": { boardWidth: 40, boardLength: 40 },
  "01-V6Led": { boardWidth: 70, boardLength: 10, boardHeight: 10, ledCount: 6, spacing: 10 },
  "02-audioMotionReactiveLedHapticPCB": { boardWidth: 20, boardLength: 120 },
  "03-compactAudioMotionSquarePCB": { boardWidth: 38, boardLength: 38 },
  "04-smdAudioMotionBatonPCB": { boardWidth: 22, boardLength: 110 }
};

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const targetArg = rawArgs.find(a => !a.startsWith("--")) || "03";
const folder = projectDirMap[targetArg] || targetArg;
const circuitPath = path.resolve(pcbSuiteRoot, folder, "src", "circuit.js");
const layoutPath = path.resolve(pcbSuiteRoot, folder, "src", "layout.json");

if (!fs.existsSync(circuitPath)) {
  console.error(`${RED}Cannot locate circuit.js at ${circuitPath}${RESET}`);
  process.exit(2);
}

const mod = await import(pathToFileURL(circuitPath).href);
const dims = defaultDims[folder] || { boardWidth: 38, boardLength: 38 };
const layout = fs.existsSync(layoutPath) ? JSON.parse(fs.readFileSync(layoutPath, "utf8")) : null;

const circuit = await mod.compileCircuit({
  ...dims,
  skipRouting: true
});
const circuitJson = circuit.getCircuitJson();

const report = runSilkscreenDrc(circuitJson, {
  boardWidth: layout?.board?.width || dims.boardWidth,
  boardHeight: layout?.board?.length || dims.boardHeight || dims.boardLength,
  layout
});

if (jsonMode) {
  console.log(JSON.stringify({ project: folder, ...report }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

console.log(`${BOLD}${CYAN}======================================================${RESET}`);
console.log(`${BOLD}${CYAN} Parametric PCB: JLCPCB Silkscreen & Polarity Auditor${RESET}`);
console.log(`${BOLD}${CYAN}======================================================${RESET}`);
console.log(`${GRAY}Project:     ${RESET}${BOLD}${folder}${RESET}`);
console.log(`${GRAY}Layout File: ${RESET}${layout ? `${GREEN}src/layout.json loaded${RESET}` : `${YELLOW}Legacy inline circuit.js${RESET}`}`);
console.log(`${GRAY}Silk Texts:  ${RESET}${BOLD}${report.textBoxes.length}${RESET}`);

if (report.errors.length > 0) {
  console.log(`\n${RED}${BOLD}❌ SILKSCREEN ERRORS (${report.errors.length}):${RESET}`);
  report.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.text}`));
}

if (report.warnings.length > 0) {
  console.log(`\n${YELLOW}${BOLD}⚠ SILKSCREEN / POLARITY VIOLATIONS (${report.warnings.length}):${RESET}`);
  report.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w.text}`));
}

if (report.ok) {
  console.log(`\n${GREEN}${BOLD}✔ SILKSCREEN DRC PASSED: All fonts >= 0.80mm, 0 pad overlaps, 100% polarity present!${RESET}`);
  process.exit(0);
} else {
  console.log(`\n${RED}${BOLD}FAILED: ${report.errors.length} error(s) and ${report.warnings.length} violation(s).${RESET}`);
  process.exit(1);
}
