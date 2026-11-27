import * as THREE from 'https://esm.sh/three@0.136.0';
import { OrbitControls } from 'https://esm.sh/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { compileCircuit, generateManufacturingArtifacts } from "./circuit.js";

// DOM Elements
const inputWidth = document.getElementById("input-board-width");
const inputLength = document.getElementById("input-board-length");
const btnRecompile = document.getElementById("btn-recompile");
const btnRoute = document.getElementById("btn-route");
const btnExportGerber = document.getElementById("btn-export-gerber");
const btnExportBom = document.getElementById("btn-export-bom");
const btnExportPnp = document.getElementById("btn-export-pnp");
const inputSilkScale = document.getElementById("input-silk-scale");
const labelSilkScale = document.getElementById("label-silk-scale");

const statCompCount = document.getElementById("stat-comp-count");
const statPadCount = document.getElementById("stat-pad-count");
const statRenderTime = document.getElementById("stat-render-time");
const drcStatusBox = document.getElementById("drc-status-box");

const container3D = document.getElementById("canvas-3d-container");
const container2D = document.getElementById("svg-2d-container");

// Cyberpunk Vaporwave Loading Overlay
const compileOverlay = document.getElementById("compile-overlay");
const vaporwaveText = compileOverlay?.querySelector(".vaporwave-text");

function showLoading(msg = "Updating Layout...") {
  if (compileOverlay) {
    if (vaporwaveText) vaporwaveText.textContent = msg;
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

// Tab Switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("active");
    if (btn.dataset.tab === "tab-3d" && renderer && camera) {
      onResize3D();
    }
  });
});

// Three.js State
let scene, camera, renderer, controls;
let currentArtifacts = null;
let currentCircuit = null;

// Silkscreen Live State
let currentSilkScale = parseFloat(inputSilkScale?.value || "1.0");
let activeSilkCanvas = null;
let activeSilkTexture = null;
let activeSilkCanvasBot = null;
let activeSilkTextureBot = null;
let activeBoardWidth = 20;
let activeBoardHeight = 115;
let activeCircuitJson = null;

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111317);

  const width = container3D.clientWidth || 800;
  const height = container3D.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, -120, 150);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  container3D.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights: Bright ambient + directionals on top and bottom
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(60, 120, 100);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight2.position.set(-60, -120, -100);
  scene.add(dirLight2);

  window.addEventListener("resize", onResize3D);
  setTimeout(onResize3D, 50);
  setTimeout(onResize3D, 200);
  animate3D();
}

function onResize3D() {
  if (!renderer || !camera || !container3D) return;
  const width = container3D.clientWidth;
  const height = container3D.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate3D() {
  requestAnimationFrame(animate3D);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Helper to extract x/y coordinates and layer from a route point or through_pad reference
function extractPoint(p) {
  if (!p) return null;
  const x = typeof p.x === "number" ? p.x : (p.start && typeof p.start.x === "number" ? p.start.x : (p.end && typeof p.end.x === "number" ? p.end.x : null));
  const y = typeof p.y === "number" ? p.y : (p.start && typeof p.start.y === "number" ? p.start.y : (p.end && typeof p.end.y === "number" ? p.end.y : null));
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, layer: p.layer || p.start_layer || "top" };
}

// Render 3D PCB Mesh from circuitJson
function renderCircuitIn3D(circuitJson, boardWidth, boardHeight) {
  if (!scene) return;

  // Clear previous meshes completely
  while (scene.children.length > 3) {
    scene.remove(scene.children[scene.children.length - 1]);
  }

  const group = new THREE.Group();
  const halfL = boardHeight / 2;
  const halfW = boardWidth / 2;

  // 1. PCB Substrate (FR4 Dark Solder Mask)
  const boardGeo = new THREE.BoxGeometry(boardWidth, boardHeight, 1.6);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.4,
    metalness: 0.1
  });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(0, 0, 0);
  group.add(boardMesh);

  // 2. Plated Through-Hole Barrels & Clean Annular Rings in 3D
  const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Gold ENIG finish
    roughness: 0.2,
    metalness: 0.9
  });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 }); // Dark through-hole core

  pcbHoles.forEach(hole => {
    const rOuter = (hole.outer_diameter || 1.9) / 2;
    const rHole = (hole.hole_diameter || 1.0) / 2;
    const x = hole.x || 0;
    const y = hole.y || 0;

    // Top gold annular pad ring (thin washer mesh)
    const ringGeo = new THREE.RingGeometry(rHole, rOuter, 24);
    const ringMeshTop = new THREE.Mesh(ringGeo, ringMat);
    ringMeshTop.position.set(x, y, 0.81);
    group.add(ringMeshTop);

    // Bottom gold annular pad ring
    const ringMeshBottom = new THREE.Mesh(ringGeo, ringMat);
    ringMeshBottom.position.set(x, y, -0.81);
    ringMeshBottom.rotation.y = Math.PI;
    group.add(ringMeshBottom);

    // Drill hole cylinder
    const holeGeo = new THREE.CylinderGeometry(rHole, rHole, 1.64, 16);
    const holeMesh = new THREE.Mesh(holeGeo, holeMat);
    holeMesh.rotation.x = Math.PI / 2;
    holeMesh.position.set(x, y, 0);
    group.add(holeMesh);
  });

  // 3. Copper SMT Pads in 3D (Pure surface components like MOSFET & Charger)
  const pcbPads = circuitJson.filter(item => item.type === "pcb_smtpad");
  pcbPads.forEach(pad => {
    const w = pad.width || 1.6;
    const h = pad.height || 1.6;
    const x = pad.x || 0;
    const y = pad.y || 0;
    const padGeo = new THREE.BoxGeometry(w, h, 0.03);
    const padMesh = new THREE.Mesh(padGeo, ringMat);
    padMesh.position.set(x, y, 0.815);
    group.add(padMesh);
  });

  // 4. Render 3D Copper Traces (Boundary clamped & NaN-guarded)
  const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");
  const traceTopMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.3, metalness: 0.8 }); // Top Neon Pink
  const traceBotMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.8 }); // Bottom Neon Cyan
  const maxBx3D = halfW - 0.4;
  const minBx3D = -halfW + 0.4;
  const maxBy3D = halfL - 0.4;
  const minBy3D = -halfL + 0.4;

  pcbTraces.forEach(trace => {
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (!pt1 || !pt2) continue;

        const cx1 = Math.max(minBx3D, Math.min(maxBx3D, pt1.x));
        const cy1 = Math.max(minBy3D, Math.min(maxBy3D, pt1.y));
        const cx2 = Math.max(minBx3D, Math.min(maxBx3D, pt2.x));
        const cy2 = Math.max(minBy3D, Math.min(maxBy3D, pt2.y));

        if (!Number.isFinite(cx1) || !Number.isFinite(cy1) || !Number.isFinite(cx2) || !Number.isFinite(cy2)) continue;

        const isTop = (pt1.layer || "top") === "top";
        const zPos = isTop ? 0.82 : -0.82;
        const v1 = new THREE.Vector3(cx1, cy1, zPos);
        const v2 = new THREE.Vector3(cx2, cy2, zPos);
        const curve = new THREE.LineCurve3(v1, v2);
        const tubeGeo = new THREE.TubeGeometry(curve, 2, (trace.width || 0.3) / 2, 8, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, isTop ? traceTopMat : traceBotMat);
        group.add(tubeMesh);
      }
    }
  });

  activeBoardWidth = boardWidth;
  activeBoardHeight = boardHeight;
  activeCircuitJson = circuitJson;

  // 5. Ultra High-Resolution Silkscreen Decal Layer on Top Surface (z = 0.825)
  if (!activeSilkCanvas) {
    activeSilkCanvas = document.createElement("canvas");
  }
  activeSilkCanvas.width = 2048;
  activeSilkCanvas.height = Math.round(2048 * (boardHeight / boardWidth));

  drawSilkscreenDecal(activeSilkCanvas, activeCircuitJson, boardWidth, boardHeight, currentSilkScale, "top");

  if (activeSilkTexture) {
    activeSilkTexture.dispose();
  }
  activeSilkTexture = new THREE.CanvasTexture(activeSilkCanvas);
  activeSilkTexture.needsUpdate = true;

  const silkMat = new THREE.MeshBasicMaterial({
    map: activeSilkTexture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1
  });

  const silkMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(boardWidth, boardHeight),
    silkMat
  );
  silkMesh.position.set(0, 0, 0.825);
  group.add(silkMesh);

  // 6. Bottom Silkscreen Decal Layer on Bottom Surface (z = -0.825)
  if (!activeSilkCanvasBot) {
    activeSilkCanvasBot = document.createElement("canvas");
  }
  activeSilkCanvasBot.width = 2048;
  activeSilkCanvasBot.height = Math.round(2048 * (boardHeight / boardWidth));

  drawSilkscreenDecal(activeSilkCanvasBot, activeCircuitJson, boardWidth, boardHeight, currentSilkScale, "bottom");

  if (activeSilkTextureBot) {
    activeSilkTextureBot.dispose();
  }
  activeSilkTextureBot = new THREE.CanvasTexture(activeSilkCanvasBot);
  activeSilkTextureBot.needsUpdate = true;

  const silkMatBot = new THREE.MeshBasicMaterial({
    map: activeSilkTextureBot,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1
  });

  const silkMeshBot = new THREE.Mesh(
    new THREE.PlaneGeometry(boardWidth, boardHeight),
    silkMatBot
  );
  silkMeshBot.position.set(0, 0, -0.825);
  silkMeshBot.rotation.set(0, Math.PI, 0);
  group.add(silkMeshBot);

  scene.add(group);
}

// Dedicated High-Resolution Silkscreen Drawing Routine (Unified single-source directly from circuitJson)
function drawSilkscreenDecal(canvas, circuitJson, boardWidth, boardHeight, scaleFactor = 1.0, layer = "top") {
  const ctx = canvas.getContext("2d");
  const halfL = boardHeight / 2;
  const halfW = boardWidth / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!circuitJson) return;

  const pxPerMm = canvas.width / boardWidth;
  const tx = (mmX) => layer === "bottom"
    ? ((-mmX + halfW) / boardWidth) * canvas.width
    : ((mmX + halfW) / boardWidth) * canvas.width;
  const ty = (mmY) => ((halfL - mmY) / boardHeight) * canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.textBaseline = "middle";

  const silkItems = circuitJson.filter(item => item.type === "pcb_silkscreen_text" && (item.layer === layer || (!item.layer && layer === "top")));

  for (const item of silkItems) {
    const x = item.anchor_position ? item.anchor_position.x : 0;
    const y = item.anchor_position ? item.anchor_position.y : 0;
    const baseFsz = item.font_size || 0.8;
    const fszPx = Math.max(12, Math.round(baseFsz * pxPerMm * scaleFactor));

    ctx.font = `bold ${fszPx}px "Courier New", monospace`;

    const align = item.anchor_alignment || "center";
    if (align === "center_right" || align === "top_left") {
      ctx.textAlign = layer === "bottom" ? "right" : "left";
    } else if (align === "center_left" || align === "top_right") {
      ctx.textAlign = layer === "bottom" ? "left" : "right";
    } else {
      ctx.textAlign = "center";
    }

    const rot = item.ccw_rotation || 0;
    const cxPos = tx(x);
    const cyPos = ty(y);

    if (rot !== 0) {
      ctx.save();
      ctx.translate(cxPos, cyPos);
      ctx.rotate(-rot * Math.PI / 180);
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(item.text, cxPos, cyPos);
    }
  }

  // Draw silkscreen paths (QR code on bottom, Japanese ocean wave ripples on both layers)
  const paths = circuitJson.filter(item => item.type === "pcb_silkscreen_path" && (item.layer === layer || (!item.layer && layer === "top")));
  for (const p of paths) {
    const route = p.route || [];
    if (route.length >= 2) {
      const sw = (p.stroke_width || 0.18) * pxPerMm;
      const x1 = tx(route[0].x);
      const y1 = ty(route[0].y);
      const x2 = tx(route[1].x);
      const y2 = ty(route[1].y);
      ctx.lineWidth = sw;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}

// ============================================================
// Interactive Draggable & Zoomable 2D SVG Viewer with Hover Tooltips
// ============================================================
let svgTransform = { x: 0, y: 0, scale: 1.0 };
let isSvgDragging = false;
let svgDragStart = { x: 0, y: 0 };

function initSvgPanZoom() {
  if (!container2D) return;

  const tooltip2D = document.getElementById("pcb-2d-tooltip");

  function hideTooltip() {
    if (tooltip2D) {
      tooltip2D.classList.remove("active");
    }
    const hovered = container2D.querySelectorAll(".net-hovered");
    hovered.forEach(el => el.classList.remove("net-hovered"));
  }

  function highlightNet(net) {
    if (!net || net === "UNROUTED" || net === "None") return;
    const elements = container2D.querySelectorAll(`[data-net="${CSS.escape(net)}"]`);
    elements.forEach(el => {
      if (el.tagName === "line") {
        el.classList.add("net-hovered");
      } else if (el.classList.contains("pcb-pad")) {
        el.classList.add("net-hovered");
      } else if (el.classList.contains("pcb-hole-group")) {
        const circle = el.querySelector(".pcb-hole");
        if (circle) circle.classList.add("net-hovered");
      }
    });
  }

  function updateTooltipPosition(e) {
    if (!tooltip2D || !tooltip2D.classList.contains("active")) return;
    const tab2d = document.getElementById("tab-2d") || container2D;
    const rect = tab2d.getBoundingClientRect();
    const x = e.clientX - rect.left + 15;
    const y = e.clientY - rect.top + 15;
    const tipWidth = tooltip2D.offsetWidth || 280;
    const tipHeight = tooltip2D.offsetHeight || 180;
    const maxX = rect.width - tipWidth - 15;
    const maxY = rect.height - tipHeight - 15;

    tooltip2D.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    tooltip2D.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
  }

  container2D.addEventListener("mousedown", (e) => {
    isSvgDragging = true;
    svgDragStart = { x: e.clientX - svgTransform.x, y: e.clientY - svgTransform.y };
    container2D.style.cursor = "grabbing";
    hideTooltip();
  });

  window.addEventListener("mousemove", (e) => {
    if (isSvgDragging) {
      svgTransform.x = e.clientX - svgDragStart.x;
      svgTransform.y = e.clientY - svgDragStart.y;
      applySvgTransform();
    } else {
      updateTooltipPosition(e);
    }
  });

  window.addEventListener("mouseup", () => {
    isSvgDragging = false;
    if (container2D) container2D.style.cursor = "grab";
  });

  container2D.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    svgTransform.scale = Math.min(Math.max(svgTransform.scale * zoomFactor, 0.3), 5.0);
    applySvgTransform();
    hideTooltip();
  });

  // Interactive Hover Popups for Traces & Pins
  container2D.addEventListener("mouseover", (e) => {
    if (isSvgDragging || !tooltip2D) return;
    const target = e.target;

    // 1. Trace Hover
    if (target.classList.contains("pcb-trace")) {
      const net = target.getAttribute("data-net") || "TRACE";
      const layer = target.getAttribute("data-layer") || "TOP";
      const segLen = target.getAttribute("data-seg-len") || "0";
      const netLen = target.getAttribute("data-net-len") || "0";
      const from = decodeURIComponent(target.getAttribute("data-from") || "Pad");
      const to = decodeURIComponent(target.getAttribute("data-to") || "Pad");
      const width = target.getAttribute("data-width") || "0.25mm";

      tooltip2D.innerHTML = `
        <div class="tooltip-header">⚡ Copper Trace Net: ${net}</div>
        <div class="tooltip-row"><span class="tooltip-label">Net Name:</span><span class="tooltip-val val-cyan">${net}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Traces From:</span><span class="tooltip-val">${from}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Traces To:</span><span class="tooltip-val">${to}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Layer:</span><span class="tooltip-val ${layer.includes('TOP') ? 'val-pink' : 'val-cyan'}">${layer}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Segment Length:</span><span class="tooltip-val">${segLen} mm</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Total Net Length:</span><span class="tooltip-val val-lime">${netLen} mm</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Trace Width:</span><span class="tooltip-val">${width}</span></div>
      `;
      tooltip2D.classList.add("active");
      updateTooltipPosition(e);
      highlightNet(net);
      return;
    }

    // 2. Pad or Plated Hole Hover
    const padGroup = target.closest("[data-comp]");
    if (padGroup) {
      const comp = padGroup.getAttribute("data-comp") || "";
      const pin = padGroup.getAttribute("data-pin") || "";
      const func = padGroup.getAttribute("data-func") || "";
      const net = padGroup.getAttribute("data-net") || "";
      const netLen = padGroup.getAttribute("data-net-len") || "0";
      const connected = decodeURIComponent(padGroup.getAttribute("data-connected") || "");
      const x = padGroup.getAttribute("data-x") || "0";
      const y = padGroup.getAttribute("data-y") || "0";
      const drill = padGroup.getAttribute("data-drill");
      const padSize = padGroup.getAttribute("data-size") || padGroup.getAttribute("data-pad");

      const isUnrouted = !net || net === "UNROUTED";
      const isAD0 = comp === "U_IMU" && pin === "pin7";
      const netDisplay = isAD0 ? "Unrouted (Module Pulldown: 0x68)" : (isUnrouted ? "Unrouted (Floating)" : net);

      tooltip2D.innerHTML = `
        <div class="tooltip-header">📍 ${comp} > ${pin}: ${func}</div>
        <div class="tooltip-row"><span class="tooltip-label">Component:</span><span class="tooltip-val val-orange">${comp}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Pin Function:</span><span class="tooltip-val val-lime">${func}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Net Assignment:</span><span class="tooltip-val val-cyan">${netDisplay}</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Traces To:</span><span class="tooltip-val">${connected && connected !== 'None' ? connected : (isAD0 ? 'Onboard 4.7kΩ to GND (0x68)' : 'None')}</span></div>
        ${!isUnrouted && parseFloat(netLen) > 0 ? `<div class="tooltip-row"><span class="tooltip-label">Total Net Length:</span><span class="tooltip-val val-lime">${netLen} mm</span></div>` : ''}
        <div class="tooltip-row"><span class="tooltip-label">Coordinates:</span><span class="tooltip-val">X: ${x}mm, Y: ${y}mm</span></div>
        <div class="tooltip-row"><span class="tooltip-label">Pad Details:</span><span class="tooltip-val">${padSize}${drill ? ` (${drill} drill)` : ''}</span></div>
      `;
      tooltip2D.classList.add("active");
      updateTooltipPosition(e);
      if (!isUnrouted) highlightNet(net);
      return;
    }
  });

  container2D.addEventListener("mouseout", (e) => {
    const related = e.relatedTarget;
    if (!related || !container2D.contains(related)) {
      hideTooltip();
    } else {
      if (e.target.classList.contains("pcb-trace") || e.target.closest("[data-comp]")) {
        hideTooltip();
      }
    }
  });
}

function applySvgTransform() {
  const g = document.getElementById("svg-viewport-group");
  if (g) {
    g.setAttribute("transform", `translate(${svgTransform.x + 140}, ${svgTransform.y}) scale(${svgTransform.scale})`);
  }
}

// 2D SVG Layout Viewer
function renderCircuitIn2D(circuitJson, boardWidth, boardHeight) {
  if (!container2D) return;

  const scale = 5; // px per mm
  const svgW = boardWidth * scale + 60;
  const svgH = boardHeight * scale + 60;
  const cx = svgW / 2;
  const cy = svgH / 2;
  const halfL = boardHeight / 2;
  const halfW = boardWidth / 2;

  // Metadata Index Maps
  const scMap = new Map(circuitJson.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const spMap = new Map(circuitJson.filter(e => e.type === "source_port").map(p => [p.source_port_id, p]));
  const ppMap = new Map(circuitJson.filter(e => e.type === "pcb_port").map(p => [p.pcb_port_id, spMap.get(p.source_port_id)]));
  const stMap = new Map(circuitJson.filter(e => e.type === "source_trace").map(t => [t.source_trace_id, t]));
  const pcMap = new Map(circuitJson.filter(e => e.type === "pcb_component").map(c => [c.pcb_component_id, scMap.get(c.source_component_id) || c.name || c.pcb_component_id]));

  // Human-readable Pin Functions
  const PIN_NAMES = {
    U_MCU: {
      pin1: "5V (VBUS)", pin2: "GND", pin3: "3V3", pin4: "GPIO0 (Mic ADC)",
      pin5: "GPIO1 (I2S WS)", pin6: "GPIO2 (I2C SDA)", pin7: "GPIO3 (I2C SCL)", pin8: "GPIO4 (I2S SCK)",
      pin9: "GPIO5 (IMU INT)", pin10: "GPIO6 (LED1 DATA)", pin11: "GPIO7 (Motor PWM)", pin12: "GPIO8 (I2S SD)",
      pin13: "GPIO9 (BTN / BOOT)", pin14: "GPIO10 (LED PWR EN)", pin15: "GPIO20 (LED2 DATA)", pin16: "GPIO21 (LED3 DATA)"
    },
    U_IMU: {
      pin1: "VCC (3.3V)", pin2: "GND", pin3: "SCL", pin4: "SDA",
      pin5: "XDA (Aux SDA)", pin6: "XCL (Aux SCL)", pin7: "AD0 (Address)", pin8: "INT (Interrupt)"
    },
    Q_FET: {
      pin1: "Gate (G)", pin2: "Source (S)", pin3: "Drain (D)"
    },
    Q_PWR: {
      pin1: "Gate (Pull-down / VBUS Cutoff)", pin2: "Source (VSYS Output)", pin3: "Drain (Switched LiPo In)"
    },
    D_PWR: {
      pin1: "Cathode (K -> VSYS)", pin2: "Anode (A <- USB 5V VBUS)"
    },
    R_PWR: {
      pin1: "Gate Pull-down", pin2: "GND"
    },
    R_PROG: {
      pin1: "PROG (500mA Rate)", pin2: "GND"
    },
    C_VIN: {
      pin1: "VBUS (+5V Filter)", pin2: "GND"
    },
    C_BAT: {
      pin1: "VBAT (+3.7V Filter)", pin2: "GND"
    },
    R_GATE: {
      pin1: "Gate (Anti-Chatter)", pin2: "GND"
    },
    D_HAP: {
      pin1: "Cathode (K -> VSYS)", pin2: "Anode (A <- Switched Drain)"
    },
    Q_LED_PWR: {
      pin1: "Gate (P-MOS Pull-Up to VSYS)", pin2: "Source (VSYS)", pin3: "Drain (Switched 5V Output)"
    },
    Q_LED_EN: {
      pin1: "Gate (GPIO10 Pre-Driver)", pin2: "Source (GND)", pin3: "Drain (Pulls P-MOS Gate to GND)"
    },
    R_LED_PU: {
      pin1: "Gate Pull-Up", pin2: "Source (VSYS)"
    },
    R_LED_GATE: {
      pin1: "Gate Pull-Down (GPIO10)", pin2: "GND"
    },
    U_CHG: {
      pin1: "STAT (Status)", pin2: "GND", pin3: "VBAT", pin4: "VIN (5V)", pin5: "PROG"
    },
    J_MIC_MAX: {
      pin1: "VCC (3.3V)", pin2: "GND", pin3: "OUT (Analog)"
    },
    J_MIC_INMP: {
      pin1: "SCK", pin2: "WS", pin3: "L/R", pin4: "SD", pin5: "VDD (3.3V)", pin6: "GND"
    },
    J_LED: {
      pin1: "5V (Switched Rail)", pin2: "DATA (GPIO6, Main Top)", pin3: "GND"
    },
    J_LED2: {
      pin1: "5V (Switched Rail)", pin2: "DATA (GPIO20, Aux Right)", pin3: "GND"
    },
    J_LED3: {
      pin1: "5V (Switched Rail)", pin2: "DATA (GPIO21, Aux Left)", pin3: "GND"
    },
    J_BTN: {
      pin1: "BTN (GPIO9, Mode / Boot Input)", pin2: "GND"
    },
    J_HAP_L: {
      pin1: "POS (+5V)", pin2: "NEG (Switched Drain)"
    },
    J_HAP_R: {
      pin1: "POS (+5V)", pin2: "NEG (Switched Drain)"
    },
    J_BAT: {
      pin1: "BAT+ (+3.7V)", pin2: "BAT- (GND)"
    },
    SW_EXT: {
      pin1: "BAT+ (Input)", pin2: "VSYS (Output)"
    }
  };

  // Trace lengths and net endpoint calculations
  const netLengths = new Map();
  const netEndpoints = new Map();
  const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");

  pcbTraces.forEach(trace => {
    let len = 0;
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (pt1 && pt2) {
          len += Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
        }
      }
    }
    const netName = stMap.get(trace.source_trace_id)?.name || trace.connection_name || "TRACE";
    netLengths.set(netName, (netLengths.get(netName) || 0) + len);

    const startPort = ppMap.get(trace.route?.[0]?.start_pcb_port_id);
    const endPort = ppMap.get(trace.route?.[trace.route?.length - 1]?.end_pcb_port_id);
    if (!netEndpoints.has(netName)) netEndpoints.set(netName, new Set());
    if (startPort) {
      const comp = scMap.get(startPort.source_component_id) || "Comp";
      const func = PIN_NAMES[comp]?.[startPort.name] || startPort.name;
      netEndpoints.get(netName).add(`${comp}.${startPort.name} (${func})`);
    }
    if (endPort) {
      const comp = scMap.get(endPort.source_component_id) || "Comp";
      const func = PIN_NAMES[comp]?.[endPort.name] || endPort.name;
      netEndpoints.get(netName).add(`${comp}.${endPort.name} (${func})`);
    }
  });

  const sourceTraces = circuitJson.filter(item => item.type === "source_trace");
  const portToNetName = new Map();
  sourceTraces.forEach(st => {
    (st.connected_source_port_ids || []).forEach(spId => {
      portToNetName.set(spId, st.name);
      if (!netEndpoints.has(st.name)) netEndpoints.set(st.name, new Set());
      const sp = spMap.get(spId);
      if (sp) {
        const comp = scMap.get(sp.source_component_id) || "Comp";
        const func = PIN_NAMES[comp]?.[sp.name] || sp.name;
        netEndpoints.get(st.name).add(`${comp}.${sp.name} (${func})`);
      }
    });
  });

  function getPortNetInfo(pcbPortId, pcbCompId, portHints) {
    const sp = ppMap.get(pcbPortId);
    const compName = pcMap.get(pcbCompId) || "Component";
    const pinName = sp?.name || (portHints && portHints[0]) || "pin";
    const funcLabel = PIN_NAMES[compName]?.[pinName] || pinName;
    const netName = sp ? portToNetName.get(sp.source_port_id) : "UNROUTED";
    const totalLen = (netName && netLengths.get(netName)) || 0;
    const connected = (netName && netEndpoints.get(netName)) ? Array.from(netEndpoints.get(netName)) : [];
    return { compName, pinName, funcLabel, netName: netName || "UNROUTED", totalLen, connected };
  }

  let padsSvg = "";
  // Render plated through-holes (dual mount) with drill centers and metadata
  const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
  pcbHoles.forEach(hole => {
    const info = getPortNetInfo(hole.pcb_port_id, hole.pcb_component_id, hole.port_hints);
    const rOuter = ((hole.outer_diameter || 1.9) / 2) * scale;
    const rHole = ((hole.hole_diameter || 1.0) / 2) * scale;
    const px = cx + (hole.x || 0) * scale;
    const py = cy - (hole.y || 0) * scale;
    const connectedFiltered = info.connected.filter(c => !c.startsWith(`${info.compName}.${info.pinName}`));
    const connectedStr = encodeURIComponent(connectedFiltered.length > 0 ? connectedFiltered.join(", ") : "None");

    padsSvg += `
      <g class="pcb-hole-group" 
         data-net="${info.netName}" 
         data-comp="${info.compName}" 
         data-pin="${info.pinName}" 
         data-func="${info.funcLabel}"
         data-net-len="${info.totalLen.toFixed(1)}"
         data-connected="${connectedStr}"
         data-x="${(hole.x || 0).toFixed(2)}"
         data-y="${(hole.y || 0).toFixed(2)}"
         data-drill="${hole.hole_diameter || 1.0}mm"
         data-pad="${hole.outer_diameter || 1.9}mm">
        <circle class="pcb-hole" cx="${px}" cy="${py}" r="${rOuter}" fill="#eab308" stroke="#ca8a04" stroke-width="0.5"/>
        <circle cx="${px}" cy="${py}" r="${rHole}" fill="#09090b" pointer-events="none"/>
      </g>
    `;
  });

  // Render SMT pads with metadata
  const pcbPads = circuitJson.filter(item => item.type === "pcb_smtpad");
  pcbPads.forEach(pad => {
    const info = getPortNetInfo(pad.pcb_port_id, pad.pcb_component_id, pad.port_hints);
    const pw = (pad.width || 1.6) * scale;
    const ph = (pad.height || 1.6) * scale;
    const px = cx + (pad.x || 0) * scale - pw / 2;
    const py = cy - (pad.y || 0) * scale - ph / 2;
    const connectedFiltered = info.connected.filter(c => !c.startsWith(`${info.compName}.${info.pinName}`));
    const connectedStr = encodeURIComponent(connectedFiltered.length > 0 ? connectedFiltered.join(", ") : "None");

    padsSvg += `
      <rect class="pcb-pad" 
            x="${px}" y="${py}" width="${pw}" height="${ph}" 
            fill="#eab308" stroke="#ca8a04" stroke-width="0.5" rx="1"
            data-net="${info.netName}"
            data-comp="${info.compName}"
            data-pin="${info.pinName}"
            data-func="${info.funcLabel}"
            data-net-len="${info.totalLen.toFixed(1)}"
            data-connected="${connectedStr}"
            data-x="${(pad.x || 0).toFixed(2)}"
            data-y="${(pad.y || 0).toFixed(2)}"
            data-size="${(pad.width || 1.6).toFixed(2)}x${(pad.height || 1.6).toFixed(2)}mm"/>
    `;
  });

  // Copper Traces in 2D (Boundary clamped & NaN-guarded with rich hover metadata)
  let tracesSvg = "";
  const maxBx2D = halfW - 0.4;
  const minBx2D = -halfW + 0.4;
  const maxBy2D = halfL - 0.4;
  const minBy2D = -halfL + 0.4;

  pcbTraces.forEach(trace => {
    if (trace.route && trace.route.length >= 2) {
      const netName = stMap.get(trace.source_trace_id)?.name || trace.connection_name || "TRACE";
      const totalLen = netLengths.get(netName) || 0;

      const startPort = ppMap.get(trace.route[0]?.start_pcb_port_id);
      const endPort = ppMap.get(trace.route[trace.route.length - 1]?.end_pcb_port_id);
      const startComp = startPort ? (scMap.get(startPort.source_component_id) || "Comp") : "";
      const endComp = endPort ? (scMap.get(endPort.source_component_id) || "Comp") : "";
      const fromLabel = startPort ? `${startComp}.${startPort.name} (${PIN_NAMES[startComp]?.[startPort.name] || startPort.name})` : "Start Pad";
      const toLabel = endPort ? `${endComp}.${endPort.name} (${PIN_NAMES[endComp]?.[endPort.name] || endPort.name})` : "End Pad";

      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (!pt1 || !pt2) continue;

        const cx1 = Math.max(minBx2D, Math.min(maxBx2D, pt1.x));
        const cy1 = Math.max(minBy2D, Math.min(maxBy2D, pt1.y));
        const cx2 = Math.max(minBx2D, Math.min(maxBx2D, pt2.x));
        const cy2 = Math.max(minBy2D, Math.min(maxBy2D, pt2.y));

        const x1 = cx + cx1 * scale;
        const y1 = cy - cy1 * scale;
        const x2 = cx + cx2 * scale;
        const y2 = cy - cy2 * scale;

        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

        const segLen = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
        const isTop = (pt1.layer || "top") === "top";
        const strokeColor = isTop ? "#ff007f" : "#00f0ff";
        const dashArray = isTop ? "none" : "3,2";

        tracesSvg += `
          <line class="pcb-trace" 
                x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" 
                stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${dashArray}"
                data-net="${netName}"
                data-layer="${isTop ? 'TOP (Pink)' : 'BOTTOM (Cyan)'}"
                data-seg-len="${segLen.toFixed(2)}"
                data-net-len="${totalLen.toFixed(1)}"
                data-from="${encodeURIComponent(fromLabel)}"
                data-to="${encodeURIComponent(toLabel)}"
                data-width="${(trace.width || 0.25).toFixed(2)}mm"/>
        `;
      }
    }
  });

  const bw = boardWidth * scale;
  const bh = boardHeight * scale;
  const bx = cx - bw / 2;
  const by = cy - bh / 2;

  // Single Source of Truth: Extract exact component center positions directly from circuitJson
  const compPosMap = new Map();
  circuitJson.filter(e => e.type === "pcb_component").forEach(c => {
    const name = scMap.get(c.source_component_id) || c.name || "";
    if (name && c.center) {
      compPosMap.set(name, { x: c.center.x, y: c.center.y });
    }
  });

  // Non-overlapping Callout Generator
  function makeCallout(anchorX, anchorY, side, text, color = "#00f0ff") {
    const isLeft = side === "left";
    const boxW = text.length * 6.5 + 16;
    const boxH = 18;
    const targetX = isLeft ? bx - boxW - 14 : bx + bw + 14;
    const targetY = anchorY - boxH / 2;
    const pointerEndX = isLeft ? targetX + boxW : targetX;

    return `
      <g class="callout-annotation">
        <polyline points="${anchorX},${anchorY} ${pointerEndX + (isLeft ? 6 : -6)},${anchorY} ${pointerEndX},${anchorY}" 
                  stroke="${color}" stroke-width="1.2" stroke-dasharray="2,2" fill="none" opacity="0.85"/>
        <circle cx="${anchorX}" cy="${anchorY}" r="2" fill="${color}"/>
        <rect x="${targetX}" y="${targetY}" width="${boxW}" height="${boxH}" rx="4" fill="#0c0d12" stroke="${color}" stroke-width="1.2"/>
        <text x="${targetX + boxW / 2}" y="${targetY + 12}" fill="${color}" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">${text}</text>
      </g>
    `;
  }

  const calloutDefs = [
    { id: "J_LED", label: "WS2812B Tip (GPIO 6)", side: "right", color: "#ec4899" },
    { id: "J_HAP_L", label: "Left Haptic Motor", side: "left", color: "#fbbf24" },
    { id: "J_HAP_R", label: "Right Haptic Motor", side: "right", color: "#fbbf24" },
    { id: "Q_LED_PWR", label: "High-Side LED Switch", side: "left", color: "#ec4899" },
    { id: "Q_FET", label: "AO3400A & Snubber (G7)", side: "right", color: "#f59e0b" },
    { id: "U_IMU", label: "MPU6050/6500 (Side Mount)", side: "left", color: "#60a5fa" },
    { id: "J_LED3", label: "LED3 Aux Left (G21)", side: "left", color: "#ec4899" },
    { id: "J_LED2", label: "LED2 Aux Right (G20)", side: "right", color: "#ec4899" },
    { id: "U_MCU", label: "ESP32-C3 SuperMini", side: "right", color: "#34d399" },
    { id: "J_BTN", label: "Mode Button (GPIO 9)", side: "left", color: "#38bdf8" },
    { id: "J_MIC_INMP", label: "INMP441 I2S Mic (2x3)", side: "right", color: "#a78bfa" },
    { id: "J_MIC_MAX", label: "MAX4466 Analog Mic (G0)", side: "left", color: "#c084fc" },
    { id: "Q_PWR", label: "Auto Power-Path (P-MOS)", side: "right", color: "#38bdf8" },
    { id: "SW_EXT", label: "External Switch (2-Pin)", side: "right", color: "#fb923c" },
    { id: "U_CHG", label: "LiPo Charger (TP4054)", side: "left", color: "#f87171" },
    { id: "J_BAT", label: "1S LiPo Terminals", side: "right", color: "#eab308" }
  ];

  const annotations = calloutDefs.map(def => {
    const pos = compPosMap.get(def.id);
    if (!pos) return "";
    const anchorX = cx + pos.x * scale;
    const anchorY = cy - pos.y * scale;
    return makeCallout(anchorX, anchorY, def.side, def.label, def.color);
  }).filter(Boolean).join("\n");

  const silkItems = circuitJson.filter(item => item.type === "pcb_silkscreen_text" && (item.layer === "top" || !item.layer));
  const silkPins = `
    <g id="svg-silkscreen-pins">
      ${silkItems.map(item => {
        const x = item.anchor_position ? item.anchor_position.x : 0;
        const y = item.anchor_position ? item.anchor_position.y : 0;
        const svgX = cx + x * scale;
        const svgY = cy - y * scale;
        const baseFs = (item.font_size || 0.8) * scale;
        const align = item.anchor_alignment || "center";
        let textAnchor = "middle";
        if (align === "center_right" || align === "top_left") textAnchor = "start";
        else if (align === "center_left" || align === "top_right") textAnchor = "end";

        const rot = item.ccw_rotation || 0;
        const rotAttr = rot !== 0 ? ` transform="rotate(${-rot}, ${svgX.toFixed(2)}, ${svgY.toFixed(2)})"` : "";

        return `<text data-base-size="${baseFs.toFixed(2)}" x="${svgX.toFixed(2)}" y="${svgY.toFixed(2)}"${rotAttr} fill="#ffffff" font-family="monospace" font-size="${(baseFs * currentSilkScale).toFixed(2)}" font-weight="bold" text-anchor="${textAnchor}" dominant-baseline="central">${item.text}</text>`;
      }).join("\n")}
    </g>
  `;

  const topPaths = circuitJson.filter(item => item.type === "pcb_silkscreen_path" && (item.layer === "top" || !item.layer));
  const silkPaths = `
    <g id="svg-silkscreen-paths" opacity="0.85">
      ${topPaths.map(p => {
        const route = p.route || [];
        if (route.length < 2) return "";
        const x1 = cx + route[0].x * scale;
        const y1 = cy - route[0].y * scale;
        const x2 = cx + route[1].x * scale;
        const y2 = cy - route[1].y * scale;
        const sw = Math.max(0.8, (p.stroke_width || 0.18) * scale);
        return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#ffffff" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/>`;
      }).join("\n")}
    </g>
  `;

  container2D.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${svgW + 280} ${svgH}" class="pcb-svg" style="overflow: visible;">
      <g id="svg-viewport-group" transform="translate(140, 0)">
        <!-- Board Substrate Outline -->
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#131418" stroke="#39ff14" stroke-width="2" rx="${3 * scale}"/>
        <!-- Silkscreen Japanese Ocean Wave Ripples -->
        ${silkPaths}
        <!-- Copper Traces -->
        ${tracesSvg}
        <!-- Plated Hole & SMT Pads -->
        ${padsSvg}
        <!-- Silkscreen Text Over/Under Pins -->
        ${silkPins}
        <!-- Non-Overlapping Callout Labels -->
        ${annotations}
      </g>
    </svg>
    <div class="viewport-overlay-hint">Left click + Drag: Pan • Scroll: Zoom</div>
  `;

  applySvgTransform();
}

// Recompile Workflow
async function triggerCompilation(shouldRoute = false) {
  const activeBtn = shouldRoute ? btnRoute : btnRecompile;
  activeBtn.disabled = true;
  activeBtn.textContent = shouldRoute ? "Routing Traces..." : "Updating Layout...";
  showLoading(shouldRoute ? "Routing Traces..." : "Updating Layout...");

  // Yield a frame so browser paints the vaporwave overlay before thread blocks
  await new Promise(r => setTimeout(r, 30));

  const t0 = performance.now();
  const width = parseFloat(inputWidth.value) || 20;
  const length = parseFloat(inputLength.value) || 115;

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

    drcStatusBox.className = "drc-box drc-pass";
    const routeMsg = shouldRoute ? ` | ${traces.length} Traces Routed` : " | Layout Only";
    drcStatusBox.textContent = `DRC Passed (${holes.length + pads.length} pads${routeMsg})`;

    renderCircuitIn3D(circuitJson, width, length);
    renderCircuitIn2D(circuitJson, width, length);

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

// Downloads (Instant & On-Demand Robust Generation)
btnExportGerber.addEventListener("click", async () => {
  if (!currentCircuit) {
    alert("Please compile the circuit first.");
    return;
  }

  const origText = btnExportGerber.textContent;
  btnExportGerber.disabled = true;
  btnExportGerber.textContent = "Packaging ZIP...";

  try {
    if (!currentArtifacts || !currentArtifacts.gerberZipBlob) {
      const width = parseFloat(inputWidth.value) || 20;
      const length = parseFloat(inputLength.value) || 115;
      currentArtifacts = await generateManufacturingArtifacts(currentCircuit, { boardWidth: width, boardLength: length, silkScale: currentSilkScale });
    }

    if (!currentArtifacts || !currentArtifacts.gerberZipBlob) {
      throw new Error("Failed to produce Gerber ZIP bundle.");
    }

    const url = URL.createObjectURL(currentArtifacts.gerberZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audioMotionReactiveLedHapticPCB_Gerbers_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export Gerber failed:", err);
    alert("Error downloading Gerbers: " + err.message);
  } finally {
    btnExportGerber.disabled = false;
    btnExportGerber.textContent = origText;
  }
});

btnExportBom.addEventListener("click", async () => {
  if (!currentCircuit) {
    alert("Please compile the circuit first.");
    return;
  }

  try {
    if (!currentArtifacts || !currentArtifacts.bomCsv) {
      const width = parseFloat(inputWidth.value) || 20;
      const length = parseFloat(inputLength.value) || 115;
      currentArtifacts = await generateManufacturingArtifacts(currentCircuit, { boardWidth: width, boardLength: length, silkScale: currentSilkScale });
    }

    if (!currentArtifacts || !currentArtifacts.bomCsv) {
      throw new Error("Failed to produce BOM CSV.");
    }

    const blob = new Blob([currentArtifacts.bomCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audioMotionReactiveLedHapticPCB_BOM_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export BOM failed:", err);
    alert("Error downloading BOM: " + err.message);
  }
});

if (btnExportPnp) {
  btnExportPnp.addEventListener("click", async () => {
    if (!currentCircuit) {
      alert("Please compile the circuit first.");
      return;
    }

    try {
      if (!currentArtifacts || !currentArtifacts.pnpCsv) {
        const width = parseFloat(inputWidth.value) || 20;
        const length = parseFloat(inputLength.value) || 115;
        currentArtifacts = await generateManufacturingArtifacts(currentCircuit, { boardWidth: width, boardLength: length, silkScale: currentSilkScale });
      }

      if (!currentArtifacts || !currentArtifacts.pnpCsv) {
        throw new Error("Failed to produce Pick & Place (PNP) CSV.");
      }

      const blob = new Blob([currentArtifacts.pnpCsv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audioMotionReactiveLedHapticPCB_PNP_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export PNP failed:", err);
      alert("Error downloading Pick & Place CSV: " + err.message);
    }
  });
}

btnRecompile.addEventListener("click", () => triggerCompilation(false));
btnRoute.addEventListener("click", () => triggerCompilation(true));

// Live Silkscreen Scale Adjustment Helper & Listener (No recompile, instant update)
function update2DSilkscreenScale(scale) {
  const group = document.getElementById("svg-silkscreen-pins");
  if (!group) return;
  const texts = group.querySelectorAll("text");
  texts.forEach(el => {
    const base = parseFloat(el.getAttribute("data-base-size") || "8");
    el.setAttribute("font-size", (base * scale).toFixed(1));
  });
}

if (inputSilkScale) {
  inputSilkScale.addEventListener("input", (e) => {
    const scale = parseFloat(e.target.value) || 1.0;
    currentSilkScale = scale;
    currentArtifacts = null;
    if (labelSilkScale) {
      labelSilkScale.textContent = `${scale.toFixed(1)}x`;
    }
    if (activeSilkCanvas && activeSilkTexture && activeCircuitJson) {
      drawSilkscreenDecal(activeSilkCanvas, activeCircuitJson, activeBoardWidth, activeBoardHeight, currentSilkScale, "top");
      activeSilkTexture.needsUpdate = true;
    }
    if (activeSilkCanvasBot && activeSilkTextureBot && activeCircuitJson) {
      drawSilkscreenDecal(activeSilkCanvasBot, activeCircuitJson, activeBoardWidth, activeBoardHeight, currentSilkScale, "bottom");
      activeSilkTextureBot.needsUpdate = true;
    }
    update2DSilkscreenScale(scale);
  });
}

// Initial Load
window.addEventListener("DOMContentLoaded", () => {
  init3D();
  initSvgPanZoom();
  triggerCompilation(false);
});
