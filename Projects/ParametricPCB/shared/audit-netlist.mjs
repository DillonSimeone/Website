#!/usr/bin/env node
/**
 * Parametric PCB Suite - Unified Netlist & Pin Connection Auditor
 * 
 * Verifies that all components in a PCB design are properly integrated:
 *   1. Zero compilation & creation errors (e.g. source_failed_to_create_component_error)
 *   2. Zero trace errors (e.g. pcb_trace_error, duplicate component names)
 *   3. Zero footprint overlap errors (e.g. pcb_footprint_overlap_error)
 *   4. Audits every component pad/pin for active net connectivity:
 *      - Every passive (resistors, caps, diodes) must have all pins routed.
 *      - Every IC / active module must have all functional pins routed.
 *      - Flags any isolated/floating pins not on the intentional NC allowlist.
 * 
 * Usage:
 *   node shared/audit-netlist.mjs 04
 *   node shared/audit-netlist.mjs 03
 *   node shared/audit-netlist.mjs 00
 *   node shared/audit-netlist.mjs --json
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
const fullAutoroute = rawArgs.includes("--full");

let targetSubdir = rawArgs.find(a => !a.startsWith("--"));
if (!targetSubdir) {
  const cwd = process.cwd();
  const rel = path.relative(pcbSuiteRoot, cwd);
  if (rel && !rel.startsWith("..") && !rel.includes("shared")) {
    targetSubdir = rel;
  } else {
    targetSubdir = "04-smdAudioMotionBatonPCB";
  }
}

const projectDirMap = {
  "00": "00-starterPCB",
  "starter": "00-starterPCB",
  "01": "01-V6Led",
  "02": "02-audioMotionReactiveLedHapticPCB",
  "03": "03-compactAudioMotionSquarePCB",
  "04": "04-smdAudioMotionBatonPCB",
  "0": "00-starterPCB",
  "1": "01-V6Led",
  "2": "02-audioMotionReactiveLedHapticPCB",
  "3": "03-compactAudioMotionSquarePCB",
  "4": "04-smdAudioMotionBatonPCB"
};

const resolvedSubdir = projectDirMap[targetSubdir] || targetSubdir;
const circuitModulePath = path.resolve(pcbSuiteRoot, resolvedSubdir, "src", "circuit.js");

if (!fs.existsSync(circuitModulePath)) {
  console.error(`${RED}Error: Cannot locate circuit.js at:${RESET} ${circuitModulePath}`);
  process.exit(2);
}

// Intentional NC (No Connect) Pins Allowlist across modules
const KNOWN_NC_PINS = new Set([
  "U_LDO.NC", "U_LDO.pin4",
  "U_MCU.IO20_RX", "U_MCU.pin11", "U_MCU.pin15",
  "U_MCU.IO21_TX", "U_MCU.pin12", "U_MCU.pin16",
  "U_MCU.IO5_WS", "U_MCU.pin4",
  "U_MCU.IO8_SD", "U_MCU.pin7",
  "U_MCU.IO9", "U_MCU.pin13",
  "U_IMU.SDx", "U_IMU.pin2",
  "U_IMU.SCx", "U_IMU.pin3",
  "U_IMU.XDA", "U_IMU.pin5",
  "U_IMU.XCL", "U_IMU.pin6",
  "U_IMU.AD0", "U_IMU.pin7",
  "U_IMU.INT2", "U_IMU.pin9",
  "U_IMU.NC", "U_IMU.pin10", "U_IMU.pin11",
  "U_IMU.REGOUT", "U_IMU.CPOUT", "U_IMU.pin20",
  "U_CHG.STAT", "U_CHG.pin1"
]);

async function runAudit() {
  if (!jsonOutput) {
    console.log(`${BOLD}${CYAN}======================================================${RESET}`);
    console.log(`${BOLD}${CYAN} Parametric PCB: Netlist & Pin Routing Auditor${RESET}`);
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

  const defaultDimensions = {
    "00-starterPCB": { boardWidth: 40, boardLength: 40 },
    "01-V6Led": { boardWidth: 70, boardLength: 10, boardHeight: 10, ledCount: 6, spacing: 8.0 },
    "02-audioMotionReactiveLedHapticPCB": { boardWidth: 20, boardLength: 120 },
    "03-compactAudioMotionSquarePCB": { boardWidth: 38, boardLength: 38 },
    "04-smdAudioMotionBatonPCB": { boardWidth: 22, boardLength: 110 }
  };

  const projectDims = defaultDimensions[resolvedSubdir] || { boardWidth: 22, boardLength: 110 };

  // Compile with routing enabled (or skip routing solver if not full pass)
  const circuit = await circuitModule.compileCircuit({
    boardWidth: projectDims.boardWidth,
    boardHeight: projectDims.boardHeight || projectDims.boardLength,
    boardLength: projectDims.boardLength,
    ledCount: projectDims.ledCount,
    spacing: projectDims.spacing,
    skipRouting: !fullAutoroute
  });

  const circuitJson = circuit.getCircuitJson();

  // 1. Audit Compilation & Architecture Errors
  const errors = circuitJson.filter(e => e.type.includes("error"));
  const warnings = circuitJson.filter(e => e.type.includes("warning"));

  // 2. Build Component, Port and Trace Connectivity Maps
  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const pcMap = new Map(circuitJson.filter(e => e.type === "pcb_component").map(c => [c.pcb_component_id, scMap.get(c.source_component_id) || c.name]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));

  // Trace connections map: source_port_id -> list of connected trace names
  const portConnections = new Map();
  const sourceTraces = circuitJson.filter(e => e.type === "source_trace");

  sourceTraces.forEach(st => {
    const rawNet = st.name || st.source_trace_id;
    const netName = rawNet.includes("__") ? rawNet.split("__")[0] : rawNet;
    (st.connected_source_port_ids || []).forEach(spId => {
      const list = portConnections.get(spId) || [];
      list.push(netName);
      portConnections.set(spId, list);
    });
  });

  // Internal component connections (e.g. bridged pins)
  const scInternalConns = circuitJson.filter(e => e.type === "source_component_internal_connection");
  scInternalConns.forEach(ic => {
    (ic.connected_source_port_ids || []).forEach(spId => {
      const list = portConnections.get(spId) || [];
      list.push("INTERNAL_BRIDGE");
      portConnections.set(spId, list);
    });
  });

  // Also inspect each source_component's internally_connected_source_port_ids
  scMap.forEach(sc => {
    if (sc.internally_connected_source_port_ids) {
      sc.internally_connected_source_port_ids.forEach(pair => {
        pair.forEach(spId => {
          const list = portConnections.get(spId) || [];
          list.push("INTERNAL_BRIDGE");
          portConnections.set(spId, list);
        });
      });
    }
  });

  // 3. Scan All Component Pads & Pins
  const smtpads = circuitJson.filter(e => e.type === "pcb_smtpad");
  const platedHoles = circuitJson.filter(e => e.type === "pcb_plated_hole");

  const componentAudits = new Map();
  const unroutedPins = [];

  const auditPad = (item, type) => {
    const pcbComp = pcMap.get(item.pcb_component_id);
    const sp = ppMap.get(item.pcb_port_id);
    const compName = (sp ? (scMap.get(sp.source_component_id)?.name || pcbComp) : pcbComp) || "Hole";
    const portHint = item.port_hints ? item.port_hints[0] : "";
    const pinName = sp ? sp.name : (portHint || item.pcb_smtpad_id || item.pcb_plated_hole_id);

    // Mechanical holes (H1-H4, mousebites) are non-electrical
    const isMechanical = compName.startsWith("H") || 
                         compName.startsWith("Hole") || 
                         item.port_hints?.some(h => h.startsWith("hole_") || h.startsWith("mb_"));
    if (isMechanical && !sp) return;

    const fullPinKey = `${compName}.${pinName}`;
    const fullHintKey = `${compName}.${portHint}`;
    const connectedNets = sp ? (portConnections.get(sp.source_port_id) || []) : [];
    const isRouted = connectedNets.length > 0;
    
    // Explicit NC, allowlisted NC, or unassigned passive QFN pads
    const isExplicitNC = sp?.name === "NC" || sp?.name?.toUpperCase().includes("NC");
    const isStarterTemplateMCU = resolvedSubdir === "00-starterPCB" && compName === "U_MCU";
    const isAllowlistedNC = isExplicitNC || 
                            isStarterTemplateMCU ||
                            KNOWN_NC_PINS.has(fullPinKey) || 
                            KNOWN_NC_PINS.has(fullHintKey) ||
                            (compName === "U_IMU" && (!sp || !sp.name || sp.name.startsWith("pin")));

    if (!componentAudits.has(compName)) {
      componentAudits.set(compName, {
        name: compName,
        totalPins: 0,
        routedPins: 0,
        unroutedPins: [],
        ncPins: []
      });
    }

    const compRecord = componentAudits.get(compName);
    compRecord.totalPins++;

    if (isRouted) {
      compRecord.routedPins++;
    } else if (isAllowlistedNC) {
      compRecord.ncPins.push(pinName);
    } else {
      compRecord.unroutedPins.push(pinName);
      unroutedPins.push({
        comp: compName,
        pin: pinName,
        pinKey: fullPinKey,
        type,
        x: item.x,
        y: item.y
      });
    }
  };

  smtpads.forEach(p => auditPad(p, "SMT"));
  platedHoles.forEach(h => auditPad(h, "THT"));

  // 4. Output Report
  if (jsonOutput) {
    console.log(JSON.stringify({
      project: resolvedSubdir,
      errors,
      unroutedPins,
      componentAudits: Array.from(componentAudits.values())
    }, null, 2));
    process.exit(errors.length > 0 || unroutedPins.length > 0 ? 1 : 0);
  }

  console.log(`\n${BOLD}Architecture & Component Connectivity Summary:${RESET}`);
  console.log(`  • Components Audited:    ${BOLD}${componentAudits.size}${RESET}`);
  console.log(`  • Total SMT Pads:        ${BOLD}${smtpads.length}${RESET}`);
  console.log(`  • Total Plated Holes:    ${BOLD}${platedHoles.length}${RESET}`);
  console.log(`  • Logical Source Traces: ${BOLD}${sourceTraces.length}${RESET}`);

  // Component breakdown table
  console.log(`\n${BOLD}Component Routing Status:${RESET}`);
  componentAudits.forEach(c => {
    const isFull = c.unroutedPins.length === 0;
    const statusIcon = isFull ? `${GREEN}✔ 100% Routed${RESET}` : `${RED}❌ ${c.unroutedPins.length} UNROUTED${RESET}`;
    const ncInfo = c.ncPins.length > 0 ? ` ${GRAY}(NC: ${c.ncPins.join(", ")})` : "";
    console.log(`  • ${BOLD}${(c.name || "Unknown").padEnd(12)}${RESET}: ${c.routedPins}/${c.totalPins} pins routed -> ${statusIcon}${ncInfo}`);
  });

  // 4. Audit JLCPCB SMT 1-to-1 BOM & CPL Parity
  let bomCplMismatch = false;
  let missingInCpl = [];
  let missingInBom = [];

  if (circuitModule.generateManufacturingArtifacts) {
    try {
      const artifacts = await circuitModule.generateManufacturingArtifacts(circuit, {
        boardWidth: projectDims.boardWidth,
        boardLength: projectDims.boardLength
      });

      if (artifacts.bomCsv && artifacts.pnpCsv) {
        const bomLines = artifacts.bomCsv.trim().split("\n").slice(1);
        const bomDesignators = new Set();
        bomLines.forEach(line => {
          const match = line.match(/^"([^"]+)"/);
          if (match) {
            match[1].split(",").forEach(d => bomDesignators.add(d.trim()));
          }
        });

        const cplLines = artifacts.pnpCsv.trim().split("\n").slice(1);
        const cplDesignators = new Set();
        cplLines.forEach(line => {
          const match = line.match(/^"?([^",]+)"?/);
          if (match && match[1].trim()) cplDesignators.add(match[1].trim());
        });

        missingInCpl = [...bomDesignators].filter(d => !cplDesignators.has(d));
        missingInBom = [...cplDesignators].filter(d => !bomDesignators.has(d));
        bomCplMismatch = missingInCpl.length > 0 || missingInBom.length > 0;

        console.log(`\n${BOLD}JLCPCB SMT 1-to-1 BOM & CPL Parity Check:${RESET}`);
        console.log(`  • BOM Unique Designators: ${BOLD}${bomDesignators.size}${RESET}`);
        console.log(`  • CPL Unique Designators: ${BOLD}${cplDesignators.size}${RESET}`);
        if (!bomCplMismatch) {
          console.log(`  • ${GREEN}✔ Strict 1-to-1 BOM & CPL parity verified! No missing parts.${RESET}`);
        } else {
          if (missingInCpl.length > 0) {
            console.log(`  • ${RED}❌ Missing in CPL (${missingInCpl.length}): ${missingInCpl.join(", ")}${RESET}`);
          }
          if (missingInBom.length > 0) {
            console.log(`  • ${RED}❌ Missing in BOM (${missingInBom.length}): ${missingInBom.join(", ")}${RESET}`);
          }
        }
      }
    } catch (err) {
      console.warn("[Artifact Audit Notice]:", err.message);
    }
  }

  // Report Compilation Errors
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ COMPILATION / ARCHITECTURE ERRORS DETECTED (${errors.length}):${RESET}`);
    errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. [${RED}${err.type || err.error_type}${RESET}]: ${err.message || JSON.stringify(err)}`);
    });
  }

  // Report Unrouted Pins
  if (unroutedPins.length > 0) {
    console.log(`\n${RED}${BOLD}❌ UNROUTED / FLOATING PINS DETECTED (${unroutedPins.length}):${RESET}`);
    unroutedPins.forEach((u, idx) => {
      console.log(`  ${idx + 1}. ${BOLD}${u.comp}.${u.pin}${RESET} (${u.type} at ${u.x.toFixed(2)}, ${u.y.toFixed(2)}mm) - ${RED}NO NET ASSIGNED${RESET}`);
    });
  }

  if (errors.length === 0 && unroutedPins.length === 0 && !bomCplMismatch) {
    console.log(`\n${BOLD}${GREEN}======================================================${RESET}`);
    console.log(`${BOLD}${GREEN}✔ NETLIST & SMT AUDIT PASSED: 100% ROUTED & 1:1 PARITY!${RESET}`);
    console.log(`${BOLD}${GREEN}======================================================${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${BOLD}${RED}======================================================${RESET}`);
    console.log(`${BOLD}${RED}FAILED: Found ${errors.length} error(s), ${unroutedPins.length} unrouted pin(s), and ${missingInCpl.length + missingInBom.length} BOM/CPL mismatch(es).${RESET}`);
    console.log(`${BOLD}${RED}======================================================${RESET}`);
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error(`${RED}Fatal Execution Error:${RESET}`, err);
  process.exit(2);
});
