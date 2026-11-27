/**
 * All-in-One SMD Audio & Motion Reactive Baton Controller UI (04)
 * Uses shared UI components: Three.js 3D viewer, interactive 2D SVG viewer, and export tools.
 */

import { compileCircuit, generateManufacturingArtifacts } from "./circuit.js";
import { createThreePcbViewer } from "../../shared/three-pcb-viewer.js";
import { setupInteractiveSvg } from "../../shared/svg-viewer.js";
import { generatePcbSvgMarkup } from "../../shared/svg-pcb-renderer.js";
import { downloadFile } from "../../shared/export-utils.js";
import { mountStudioEditButton } from "../../shared/studio-link.js";

mountStudioEditButton("04");

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

// State
let pcbViewer3D = null;
let svgViewer2D = null;
let currentCircuit = null;
let currentArtifacts = null;
let currentSilkScale = 1.0;
let routeMode = false;

// Global Error Boundary (Catches runtime errors for headless CI and displays in DRC box)
window.addEventListener("error", (e) => {
  const drcBox = document.getElementById("drc-status-box");
  if (drcBox) {
    drcBox.className = "drc-box drc-fail";
    drcBox.textContent = `Uncaught Error: ${e.message}`;
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const drcBox = document.getElementById("drc-status-box");
  if (drcBox) {
    drcBox.className = "drc-box drc-fail";
    drcBox.textContent = `Promise Error: ${e.reason?.message || e.reason}`;
  }
});

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

// Decoupled Silkscreen Live Slider (60 FPS feedback without AST recompile)
if (inputSilkScale && labelSilkScale) {
  inputSilkScale.addEventListener("input", () => {
    currentSilkScale = parseFloat(inputSilkScale.value) || 1.0;
    labelSilkScale.textContent = `${currentSilkScale.toFixed(2)}x`;
    if (pcbViewer3D) {
      pcbViewer3D.updateSilkscreenDecals(currentSilkScale);
    }
    document.querySelectorAll("#svg-silkscreen-pins text").forEach(el => {
      const base = parseFloat(el.getAttribute("data-base-size")) || 0.65;
      el.setAttribute("font-size", `${(base * currentSilkScale).toFixed(2)}mm`);
    });
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

// Hover Tooltip Metadata for All Components
const PIN_NAMES = {
  U_MCU: {
    pin1: "3V3 (Power Input)", pin2: "EN (Hardware Reset)", pin3: "IO4 (I2S SCK / BCLK)",
    pin4: "IO5 (I2S WS / LRCLK)", pin5: "IO6 (LED Strip Data)", pin6: "IO7 (Haptic Motor PWM)",
    pin7: "IO8 (I2S SD / DOUT)", pin8: "IO9 (Bootloader / Button)", pin9: "GND (Ground)",
    pin10: "IO10 (LED Power Gate Enable)", pin11: "IO20 (UART RX)", pin12: "IO21 (UART TX)",
    pin13: "IO18 (Native USB D-)", pin14: "IO19 (Native USB D+)", pin15: "IO3 (I2C SCL)",
    pin16: "IO2 (I2C SDA)", pin17: "IO1 (IMU Motion INT)", pin18: "GND (Ground)",
    pin19: "EP_GND (Thermal Ground)"
  },
  U_IMU: {
    pin12: "INT (Motion Interrupt)", pin13: "VDD (3.3V)", pin18: "GND",
    pin23: "SCL (I2C Clock)", pin24: "SDA (I2C Data)", pin25: "Thermal Pad"
  },
  U_MIC: {
    pin1: "SCK (Clock)", pin2: "WS (Word Select)", pin3: "L/R (Left Channel)",
    pin4: "GND", pin5: "Shield Ring", pin6: "VDD (3.3V)", pin7: "GND",
    pin8: "SD (I2S Serial Data)", pin9: "GND"
  },
  U_LDO: {
    pin1: "VIN (+5V/VSYS)", pin2: "GND", pin3: "EN (High)", pin4: "NC", pin5: "VOUT (+3.3V System Rail)"
  },
  U_CHG: {
    pin1: "STAT (Charge Indicator)", pin2: "GND", pin3: "VBAT (LiPo Out)", pin4: "VIN (USB 5V)", pin5: "PROG (500mA set)"
  },
  J_USB: {
    pin1: "GND (A1/B12)", pin2: "VBUS (5V Input)", pin3: "CC1 (Host Negotiation)",
    pin4: "DP (Native USB D+ / IO19)", pin5: "DN (Native USB D- / IO18)", pin6: "CC2 (Host Negotiation)",
    pin7: "VBUS (5V Input)", pin8: "GND (B1/A12)",
    pin9: "Shield Tab 1", pin10: "Shield Tab 2", pin11: "Shield Tab 3", pin12: "Shield Tab 4"
  },
  J_LED: { pin1: "5V_SW (Switched VBUS)", pin2: "DAT (GPIO 6)", pin3: "GND" },
  J_HAP: { pin1: "VSYS (+5V/BAT)", pin2: "MTR- (Drain switched)" },
  J_MPU: { pin1: "3.3V", pin2: "GND", pin3: "SCL (IO3)", pin4: "SDA (IO2)", pin5: "INT (IO1)" },
  J_BAT: { pin1: "BAT- (GND)", pin2: "BAT+ (+3.7V LiPo)" },
  SW_EXT: { pin1: "BAT_IN", pin2: "BAT_SW" },
  SW_EN: { pin1: "EN (To MCU)", pin2: "GND" },
  SW_BOOT: { pin1: "IO9 (To MCU)", pin2: "GND" }
};

// 2D Cyberpunk Visual Callout Badges
const CALLOUTS = [
  { id: "J_USB", label: "USB-C CDC/JTAG", side: "bottom", color: "#38bdf8" },
  { id: "U_CHG", label: "LiPo Charger", side: "left", color: "#ec4899" },
  { id: "U_LDO", label: "3.3V 500mA LDO", side: "left", color: "#a855f7" },
  { id: "U_MCU", label: "ESP32-C3 SMD Module", side: "right", color: "#34d399" },
  { id: "SW_EN", label: "Reset", side: "left", color: "#fbbf24" },
  { id: "SW_BOOT", label: "Boot/User", side: "right", color: "#fbbf24" },
  { id: "U_IMU", label: "MPU-6050 6-Axis", side: "left", color: "#06b6d4" },
  { id: "J_MPU", label: "I2C Expansion", side: "right", color: "#06b6d4" },
  { id: "U_MIC", label: "INMP441 I2S Mic", side: "left", color: "#f43f5e" },
  { id: "J_LED", label: "Addressable LED Out", side: "top", color: "#4ade80" },
  { id: "J_HAP", label: "Haptic Motor", side: "top", color: "#f59e0b" }
];

async function updateBoard(options = {}) {
  const { skipRouting = !routeMode } = options;
  showLoading(skipRouting ? "Compiling All-SMD Layout..." : "Routing Multi-Layer Traces...");

  const tStart = performance.now();
  const boardWidth = parseFloat(inputWidth?.value) || 22;
  const boardLength = parseFloat(inputLength?.value) || 110;

  try {
    currentCircuit = await compileCircuit({
      boardWidth,
      boardLength,
      skipRouting,
      silkScale: currentSilkScale
    });

    currentArtifacts = await generateManufacturingArtifacts(currentCircuit, {
      boardWidth,
      boardLength,
      silkScale: currentSilkScale
    });

    const elapsed = Math.round(performance.now() - tStart);
    if (statRenderTime) statRenderTime.textContent = `${elapsed}ms`;

    const circuitJson = currentArtifacts.circuitJson;
    const comps = circuitJson.filter(e => e.type === "pcb_component" || e.type === "source_component");
    const pads = circuitJson.filter(e => e.type === "pcb_smtpad" || e.type === "pcb_plated_hole");
    if (statCompCount) statCompCount.textContent = `${comps.length}`;
    if (statPadCount) statPadCount.textContent = `${pads.length}`;

    // Update Advisory DRC Box
    const drc = currentArtifacts?.drc || { ok: true, errors: [], warnings: [] };
    if (drc.errors && drc.errors.length > 0) {
      drcStatusBox.className = "drc-box drc-fail";
      drcStatusBox.textContent = `DRC: ${drc.errors.length} Error(s) (JLCPCB Violation)`;
    } else if (drc.warnings && drc.warnings.length > 0) {
      drcStatusBox.className = "drc-box drc-warn";
      drcStatusBox.textContent = `DRC Advisory: ${drc.warnings.length} Warning(s)`;
    } else {
      drcStatusBox.className = "drc-box drc-pass";
      drcStatusBox.textContent = `✔ DRC: 100% Passed (JLCPCB 2-Layer Compliant)`;
    }

    // Render 3D Inspection Viewer
    if (container3D) {
      if (!pcbViewer3D) {
        pcbViewer3D = createThreePcbViewer(container3D);
      }
      pcbViewer3D.renderCircuit(circuitJson, boardWidth, boardLength, currentSilkScale);
    }

    // Render 2D Vector SVG Viewer
    if (container2D) {
      const svgMarkup = generatePcbSvgMarkup(circuitJson, {
        boardWidth,
        boardHeight: boardLength,
        scale: 10,
        silkScale: currentSilkScale,
        pinNames: PIN_NAMES,
        callouts: CALLOUTS
      });
      container2D.innerHTML = svgMarkup;

      if (!svgViewer2D) {
        svgViewer2D = setupInteractiveSvg({
          container: container2D,
          tooltipElement: tooltip2D
        });
      } else if (svgViewer2D && typeof svgViewer2D.update === "function") {
        svgViewer2D.update();
      }
    }
  } catch (err) {
    console.error("[Project 04 UI] Error updating board:", err);
    if (drcStatusBox) {
      drcStatusBox.className = "drc-box drc-fail";
      drcStatusBox.textContent = `Render failed: ${err.message}`;
    }
  } finally {
    hideLoading();
  }
}

// Event Bindings
if (btnRecompile) {
  btnRecompile.addEventListener("click", () => {
    routeMode = false;
    updateBoard({ skipRouting: true });
  });
}

if (btnRoute) {
  btnRoute.addEventListener("click", () => {
    routeMode = true;
    updateBoard({ skipRouting: false });
  });
}

// Instant Manufacturing Exports
if (btnExportGerber) {
  btnExportGerber.addEventListener("click", () => {
    if (!currentArtifacts?.gerberZipBlob) {
      alert("Gerber package is still compiling. Please click 'Update Layout' first.");
      return;
    }
    downloadFile(currentArtifacts.gerberZipBlob, "04_smdAudioMotionBaton_Gerbers.zip");
  });
}

if (btnExportBom) {
  btnExportBom.addEventListener("click", () => {
    if (!currentArtifacts?.bomCsv) {
      alert("BOM is not ready. Please click 'Update Layout' first.");
      return;
    }
    downloadFile(currentArtifacts.bomCsv, "04_smdAudioMotionBaton_BOM_JLCPCB.csv", "text/csv");
  });
}

if (btnExportPnp) {
  btnExportPnp.addEventListener("click", () => {
    if (!currentArtifacts?.pnpCsv) {
      alert("PNP is not ready. Please click 'Update Layout' first.");
      return;
    }
    downloadFile(currentArtifacts.pnpCsv, "04_smdAudioMotionBaton_CPL_JLCPCB.csv", "text/csv");
  });
}

if (btnExportEasyEda) {
  btnExportEasyEda.addEventListener("click", () => {
    alert("Pro-tip: Download Gerbers + BOM + CPL directly for one-click JLCPCB SMT ordering!");
  });
}

// Initial Boot
document.addEventListener("DOMContentLoaded", async () => {
  await updateBoard({ skipRouting: true });
  if (new URLSearchParams(window.location.search).has("testReroute")) {
    if (btnRoute) btnRoute.click();
  }
});
