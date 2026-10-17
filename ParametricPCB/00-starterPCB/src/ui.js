/**
 * Turnkey Starter PCB Configurator Controller (00)
 * Uses shared UI components: Three.js 3D viewer, interactive 2D SVG viewer, and export tools.
 */

import { compileCircuit, generateManufacturingArtifacts } from "./circuit.js";
import { createThreePcbViewer } from "../../shared/three-pcb-viewer.js";
import { setupInteractiveSvg } from "../../shared/svg-viewer.js";
import { generatePcbSvgMarkup } from "../../shared/svg-pcb-renderer.js";
import { downloadFile } from "../../shared/export-utils.js";

// DOM References
const container3D = document.getElementById("canvas-3d-container");
const container2D = document.getElementById("svg-2d-container");
const tooltip2D = document.getElementById("pcb-2d-tooltip");

const inputWidth = document.getElementById("input-board-width");
const inputLength = document.getElementById("input-board-length");
const inputSilkScale = document.getElementById("input-silk-scale");
const labelSilkScale = document.getElementById("label-silk-scale");

const btnRecompile = document.getElementById("btn-recompile");
const btnRoute = document.getElementById("btn-route");
const btnExportEasyEda = document.getElementById("btn-export-easyeda");
const btnExportGerber = document.getElementById("btn-export-gerber");
const btnExportBom = document.getElementById("btn-export-bom");
const btnExportPnp = document.getElementById("btn-export-pnp");

const compileOverlay = document.getElementById("compile-overlay");
const statRenderTime = document.getElementById("stat-render-time");
const statPadCount = document.getElementById("stat-pad-count");
const statCompCount = document.getElementById("stat-comp-count");
const drcStatusBox = document.getElementById("drc-status-box");

// Viewers
let pcbViewer3D = null;
let svgViewer2D = null;
let currentCircuit = null;
let currentArtifacts = null;
let currentSilkScale = 1.0;

// Tab Switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("active");
    if (btn.dataset.tab === "tab-3d" && pcbViewer3D) {
      pcbViewer3D.onResize();
    }
  });
});

// Decoupled Silkscreen Live Slider
if (inputSilkScale && labelSilkScale) {
  inputSilkScale.addEventListener("input", () => {
    currentSilkScale = parseFloat(inputSilkScale.value) || 1.0;
    labelSilkScale.textContent = `${currentSilkScale.toFixed(2)}x`;
    if (pcbViewer3D) {
      pcbViewer3D.updateSilkscreenDecals(currentSilkScale);
    }
  });
}

function showLoading(msg = "Updating Layout...") {
  if (compileOverlay) {
    const textEl = compileOverlay.querySelector(".vaporwave-text");
    if (textEl) textEl.textContent = msg;
    compileOverlay.classList.add("is-visible");
  }
}

function hideLoading() {
  if (compileOverlay) {
    compileOverlay.classList.remove("is-visible");
  }
}

/// Component Pin Name & Function Definitions for Hover Tooltips
const PIN_NAMES = {
  U_MCU: {
    pin1: "5V (VBUS)", pin2: "GND", pin3: "3V3", pin4: "GPIO0", pin5: "GPIO1"
  },
  C_VBUS: { pin1: "VBUS (+5V)", pin2: "GND" },
  D_LED: { pin1: "Cathode (K -> R_LED)", pin2: "Anode (A <- 5V)" },
  R_LED: { pin1: "Pin 1 (From LED)", pin2: "Pin 2 (GND)" },
  J_AUX: { pin1: "+5V", pin2: "IO0", pin3: "IO1", pin4: "GND" }
};

// 2D Cyberpunk Callout Badges
const CALLOUTS = [
  { id: "U_MCU", label: "ESP32-C3 SuperMini", side: "top", color: "#34d399" },
  { id: "C_VBUS", label: "10µF 0603 Filter", side: "left", color: "#38bdf8" },
  { id: "D_LED", label: "0603 Power LED", side: "right", color: "#4ade80" },
  { id: "R_LED", label: "1kΩ Resistor", side: "right", color: "#fbbf24" },
  { id: "J_AUX", label: "4-Pin IO Breakout", side: "bottom", color: "#ec4899" }
];

// 2D SVG Layout Renderer (Powered by shared/svg-pcb-renderer.js)
function renderCircuitIn2D(circuitJson, boardWidth, boardHeight) {
  if (!container2D) return;
  container2D.innerHTML = generatePcbSvgMarkup(circuitJson, {
    boardWidth,
    boardHeight,
    scale: 10,
    silkScale: currentSilkScale,
    pinNames: PIN_NAMES,
    callouts: CALLOUTS
  });
}

// Recompile Workflow
async function triggerCompilation(shouldRoute = false) {
  const activeBtn = shouldRoute ? btnRoute : btnRecompile;
  activeBtn.disabled = true;
  activeBtn.textContent = shouldRoute ? "Routing Traces..." : "Updating Layout...";
  showLoading(shouldRoute ? "Routing Traces..." : "Updating Layout...");

  await new Promise(r => setTimeout(r, 30));
  const t0 = performance.now();
  const width = parseFloat(inputWidth.value) || 40;
  const length = parseFloat(inputLength.value) || 40;

  try {
    currentCircuit = await compileCircuit({
      boardWidth: width,
      boardLength: length,
      skipRouting: !shouldRoute,
      silkScale: currentSilkScale
    });

    const circuitJson = currentCircuit.getCircuitJson();
    currentArtifacts = await generateManufacturingArtifacts(currentCircuit, { boardWidth: width, boardLength: length, silkScale: currentSilkScale });

    const elapsed = (performance.now() - t0).toFixed(0);
    statRenderTime.textContent = `${elapsed}ms`;

    const pads = circuitJson.filter(item => item.type === "pcb_smtpad");
    const holes = circuitJson.filter(item => item.type === "pcb_plated_hole");
    const traces = circuitJson.filter(item => item.type === "pcb_trace");
    const pcbComps = circuitJson.filter(item => item.type === "pcb_component");

    statPadCount.textContent = `${holes.length} THT + ${pads.length} SMD`;
    statCompCount.textContent = `${pcbComps.length}`;

    const drc = currentArtifacts?.drc || { ok: true, errors: [], warnings: [] };
    const routeMsg = shouldRoute ? ` | ${traces.length} Traces Routed` : " | Layout Only";
    if (drc.errors && drc.errors.length > 0) {
      drcStatusBox.className = "drc-box drc-fail";
      drcStatusBox.textContent = `DRC: ${drc.errors.length} Error(s) (JLCPCB Violation)`;
    } else if (drc.warnings && drc.warnings.length > 0) {
      drcStatusBox.className = "drc-box drc-warn";
      drcStatusBox.textContent = `DRC Advisory: ${drc.warnings.length} Warning(s)`;
    } else {
      drcStatusBox.className = "drc-box drc-pass";
      drcStatusBox.textContent = `DRC Passed (JLCPCB 2-Layer Compliant: ${holes.length + pads.length} pads${routeMsg})`;
    }

    if (!pcbViewer3D) {
      pcbViewer3D = createThreePcbViewer(container3D);
    }
    pcbViewer3D.renderCircuit(circuitJson, width, length, currentSilkScale);

    renderCircuitIn2D(circuitJson, width, length);

    if (!svgViewer2D) {
      svgViewer2D = setupInteractiveSvg({ container: container2D, tooltipElement: tooltip2D });
    }
  } catch (err) {
    console.error("Compilation error:", err);
    drcStatusBox.className = "drc-box drc-fail";
    drcStatusBox.textContent = `Error: ${err.message}`;
  } finally {
    hideLoading();
    activeBtn.disabled = false;
    btnRecompile.textContent = "⚡ Update Layout";
    btnRoute.textContent = "🔀 Route Traces";
  }
}

// Download Handlers
btnExportEasyEda?.addEventListener("click", async () => {
  if (currentCircuit) {
    try {
      showLoading("Generating EasyEDA / KiCad Bundle...");
      const { createEasyEdaZipBlob } = await import("../../shared/export-utils.js");
      const blob = await createEasyEdaZipBlob(currentCircuit.getCircuitJson(), { projectName: "StarterPCB" });
      downloadFile(blob, `StarterPCB_EasyEDA_KiCad_${Date.now()}.zip`);
    } catch (err) {
      alert("Error generating EasyEDA bundle: " + err.message);
    } finally {
      hideLoading();
    }
  }
});

btnExportGerber?.addEventListener("click", () => {
  if (currentArtifacts?.gerberZipBlob) {
    downloadFile(currentArtifacts.gerberZipBlob, `StarterPCB_Gerbers_${Date.now()}.zip`);
  }
});

btnExportBom?.addEventListener("click", () => {
  if (currentArtifacts?.bomCsv) {
    downloadFile(currentArtifacts.bomCsv, `StarterPCB_BOM_${Date.now()}.csv`, "text/csv");
  }
});

btnExportPnp?.addEventListener("click", () => {
  if (currentArtifacts?.pnpCsv) {
    downloadFile(currentArtifacts.pnpCsv, `StarterPCB_CPL_PNP_${Date.now()}.csv`, "text/csv");
  }
});

btnRecompile?.addEventListener("click", () => triggerCompilation(false));
btnRoute?.addEventListener("click", () => triggerCompilation(true));

// Initial compilation on page load
triggerCompilation(false);
