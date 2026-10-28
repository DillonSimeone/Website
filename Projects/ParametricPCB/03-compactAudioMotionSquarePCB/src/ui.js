/**
 * Compact Dense Square Audio & Motion Reactive Controller UI (03)
 * Powered by shared UI components (Three.js 3D viewer, interactive 2D SVG viewer, DRC, and export tools)
 * and declarative `src/layout.json` silkscreen & placement coordinates.
 */

import { compileCircuit, generateManufacturingArtifacts } from "./circuit.js";
import { createThreePcbViewer } from "../../shared/three-pcb-viewer.js";
import { setupInteractiveSvg } from "../../shared/svg-viewer.js";
import { generatePcbSvgMarkup } from "../../shared/svg-pcb-renderer.js";
import { downloadFile } from "../../shared/export-utils.js";
import { mountStudioEditButton } from "../../shared/studio-link.js";

// Inject "✏️ Edit in PCB Studio" button automatically on localhost
mountStudioEditButton("03");

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
let currentSilkScale = parseFloat(inputSilkScale?.value || "1.0");

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

// Decoupled 60 FPS Silkscreen Live Slider (3D Decals + 2D Vector Text)
if (inputSilkScale && labelSilkScale) {
  inputSilkScale.addEventListener("input", () => {
    currentSilkScale = parseFloat(inputSilkScale.value) || 1.0;
    labelSilkScale.textContent = `${currentSilkScale.toFixed(2)}x`;
    if (pcbViewer3D) {
      pcbViewer3D.updateSilkscreenDecals(currentSilkScale);
    }
    document.querySelectorAll("#svg-silkscreen-pins text").forEach(textEl => {
      const baseFs = parseFloat(textEl.getAttribute("data-base-size"));
      if (Number.isFinite(baseFs)) {
        textEl.setAttribute("font-size", (baseFs * currentSilkScale).toFixed(2));
      }
    });
  });
}

function showLoading(msg = "Updating Layout...") {
  if (compileOverlay) {
    const textEl = compileOverlay.querySelector(".vaporwave-text");
    if (textEl) textEl.textContent = msg;
    compileOverlay.classList.add("is-visible");
    compileOverlay.setAttribute("aria-hidden", "false");
  }
}

function hideLoading() {
  if (compileOverlay) {
    compileOverlay.classList.remove("is-visible");
    compileOverlay.setAttribute("aria-hidden", "true");
  }
}

// Component Pin Name & Function Definitions for Hover Tooltips
const PIN_NAMES = {
  U_MCU: {
    pin1: "5V (VBUS)", pin2: "GND", pin3: "3V3 (Regulated)", pin4: "GPIO0 (Mic ADC1)",
    pin5: "GPIO1 (I2S WS)", pin6: "GPIO2 (I2C SDA)", pin7: "GPIO3 (I2C SCL)", pin8: "GPIO4 (I2S SCK)",
    pin9: "GPIO5 (IMU INT)", pin10: "GPIO6 (LED1 DATA)", pin11: "GPIO7 (Haptic PWM)", pin12: "GPIO8 (I2S SD)",
    pin13: "GPIO9 (Boot Strapping)", pin14: "GPIO10 (LED Power Enable)", pin15: "GPIO20 (LED2 Aux Data)", pin16: "GPIO21 (LED3 Aux Data)"
  },
  U_IMU: {
    pin1: "VCC (3.3V)", pin2: "GND", pin3: "SCL", pin4: "SDA",
    pin5: "XDA", pin6: "XCL", pin7: "AD0 (I2C Address 0x68)", pin8: "INT"
  },
  U_CHG: { pin1: "STAT", pin2: "GND", pin3: "VBAT", pin4: "VIN (VBUS 5V)", pin5: "PROG (2kΩ)" },
  Q_PWR: { pin1: "Gate (Pull-down via R_PWR)", pin2: "Source (VSYS)", pin3: "Drain (VBAT_SW)" },
  D_PWR: { pin1: "Cathode (VSYS)", pin2: "Anode (VBUS 5V)" },
  Q_FET: { pin1: "Gate (GPIO7 PWM)", pin2: "Source (GND)", pin3: "Drain (Haptic Drive)" },
  D_HAP: { pin1: "Cathode (VSYS)", pin2: "Anode (Haptic Drive)" },
  Q_LED_PWR: { pin1: "Gate (P-MOS Pull-up)", pin2: "Source (VSYS)", pin3: "Drain (Switched 5V Rail)" },
  Q_LED_EN: { pin1: "Gate (GPIO10)", pin2: "Source (GND)", pin3: "Drain (Pulls P-MOS Gate LOW)" },
  R_PWR: { pin1: "Gate", pin2: "GND" },
  R_PROG: { pin1: "PROG", pin2: "GND" },
  R_GATE: { pin1: "Gate", pin2: "GND" },
  R_LED_PU: { pin1: "Gate", pin2: "VSYS" },
  R_LED_GATE: { pin1: "Gate", pin2: "GND" },
  C_VIN: { pin1: "VBUS (+5V)", pin2: "GND" },
  C_BAT: { pin1: "VBAT (+3.7V)", pin2: "GND" },
  J_LED: { pin1: "5V (Switched)", pin2: "DATA (GPIO6)", pin3: "GND" },
  J_LED2: { pin1: "5V (Switched)", pin2: "DATA (GPIO20)", pin3: "GND" },
  J_LED3: { pin1: "5V (Switched)", pin2: "DATA (GPIO21)", pin3: "GND" },
  J_HAP_L: { pin1: "POS (+5V)", pin2: "NEG (PWM Drain)" },
  J_HAP_R: { pin1: "POS (+5V)", pin2: "NEG (PWM Drain)" },
  J_MIC_MAX: { pin1: "VCC (3.3V)", pin2: "GND", pin3: "OUT (Analog)" },
  J_MIC_INMP: { pin1: "SCK", pin2: "WS", pin3: "L/R", pin4: "SD", pin5: "VDD (3.3V)", pin6: "GND" },
  J_BAT: { pin1: "BAT+ (+3.7V)", pin2: "BAT- (GND)" },
  SW_EXT: { pin1: "BAT+ (In)", pin2: "VSYS (Out)" }
};

// 2D Callout Badges
const CALLOUTS = [
  { id: "J_LED", label: "WS2812B Main (G6)", side: "top", color: "#ec4899" },
  { id: "U_MCU", label: "ESP32-C3 SuperMini", side: "left", color: "#34d399" },
  { id: "U_IMU", label: "MPU6050/6500 (Backside)", side: "right", color: "#60a5fa" },
  { id: "J_LED2", label: "LED2 Aux (G20)", side: "right", color: "#ec4899" },
  { id: "J_LED3", label: "LED3 Aux (G21)", side: "left", color: "#ec4899" },
  { id: "J_HAP_L", label: "Haptic Left", side: "left", color: "#fbbf24" },
  { id: "J_HAP_R", label: "Haptic Right", side: "right", color: "#fbbf24" },
  { id: "J_MIC_MAX", label: "MAX4466 Analog (G0)", side: "left", color: "#c084fc" },
  { id: "J_MIC_INMP", label: "INMP441 Digital (I2S)", side: "bottom", color: "#a78bfa" },
  { id: "J_BAT", label: "1S LiPo Terminals", side: "bottom", color: "#eab308" },
  { id: "SW_EXT", label: "Power Switch", side: "right", color: "#fb923c" }
];

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
  const width = parseFloat(inputWidth.value) || 38;
  const length = parseFloat(inputLength.value) || 38;

  try {
    currentCircuit = await compileCircuit({
      boardWidth: width,
      boardLength: length,
      skipRouting: !shouldRoute,
      silkScale: currentSilkScale
    });

    const circuitJson = currentCircuit.getCircuitJson();
    currentArtifacts = await generateManufacturingArtifacts(currentCircuit, {
      boardWidth: width,
      boardLength: length,
      silkScale: currentSilkScale
    });

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
      drcStatusBox.textContent = `DRC Passed (JLCPCB 2-Layer & Silkscreen Compliant: ${holes.length + pads.length} pads${routeMsg})`;
    }

    if (!pcbViewer3D) {
      pcbViewer3D = createThreePcbViewer(container3D, { boardColor: 0x16171b });
    }
    pcbViewer3D.renderCircuit(circuitJson, width, length, currentSilkScale);

    renderCircuitIn2D(circuitJson, width, length);

    if (!svgViewer2D) {
      svgViewer2D = setupInteractiveSvg({ container: container2D, tooltipElement: tooltip2D });
    }
  } catch (err) {
    console.error("Compilation failed:", err);
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
      const blob = await createEasyEdaZipBlob(currentCircuit.getCircuitJson(), {
        projectName: "03_compactSquareLedHapticPCB"
      });
      downloadFile(blob, "03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip");
    } catch (err) {
      alert("Error generating EasyEDA bundle: " + err.message);
    } finally {
      hideLoading();
    }
  }
});

btnExportGerber?.addEventListener("click", () => {
  if (currentArtifacts?.gerberZipBlob) {
    downloadFile(currentArtifacts.gerberZipBlob, "03_compactSquareLedHapticPCB_Gerbers.zip");
  }
});

btnExportBom?.addEventListener("click", () => {
  if (currentArtifacts?.bomCsv) {
    downloadFile(currentArtifacts.bomCsv, "03_compactSquareLedHapticPCB_BOM.csv", "text/csv");
  }
});

btnExportPnp?.addEventListener("click", () => {
  if (currentArtifacts?.pnpCsv) {
    downloadFile(currentArtifacts.pnpCsv, "03_compactSquareLedHapticPCB_CPL.csv", "text/csv");
  }
});

btnRecompile?.addEventListener("click", () => triggerCompilation(false));
btnRoute?.addEventListener("click", () => triggerCompilation(true));

// Initial compilation on page load
triggerCompilation(false);
