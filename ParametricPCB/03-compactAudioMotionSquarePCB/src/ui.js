import * as THREE from 'https://esm.sh/three@0.136.0';
import { OrbitControls } from 'https://esm.sh/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { compileCircuit, generateManufacturingArtifacts } from "./circuit.js";

// DOM Elements
const inputWidth = document.getElementById("input-board-width");
const inputLength = document.getElementById("input-board-length");
const btnRecompile = document.getElementById("btn-recompile");
const btnRoute = document.getElementById("btn-route");
const btnExportEasyEda = document.getElementById("btn-export-easyeda");
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
const containerSchematic = document.getElementById("schematic-container");

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
let activeBoardWidth = 38;
let activeBoardHeight = 38;
let activeCircuitJson = null;

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111317);

  const width = container3D.clientWidth || 800;
  const height = container3D.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, -55, 75);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container3D.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(50, 80, 80);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight2.position.set(-50, -80, -80);
  scene.add(dirLight2);

  window.addEventListener("resize", onResize3D);
  if (window.ResizeObserver && container3D) {
    const ro = new ResizeObserver(() => onResize3D());
    ro.observe(container3D);
  }
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

// Helpers
function extractPoint(pt) {
  if (!pt) return null;
  const x = pt.x ?? pt.start?.x ?? pt.end?.x;
  const y = pt.y ?? pt.start?.y ?? pt.end?.y;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y, layer: pt.layer || "top" };
}

// Render 3D Model
function renderCircuitIn3D(circuitJson, boardWidth, boardHeight) {
  if (!scene) init3D();

  const toRemove = [];
  scene.children.forEach(c => {
    if (c.type === "Group") toRemove.push(c);
  });
  toRemove.forEach(c => scene.remove(c));

  const group = new THREE.Group();
  const halfW = boardWidth / 2;
  const halfL = boardHeight / 2;

  // 1. PCB Substrate (FR4 Dark Solder Mask)
  const boardGeo = new THREE.BoxGeometry(boardWidth, boardHeight, 1.6);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0x16171b,
    roughness: 0.35,
    metalness: 0.1
  });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(0, 0, 0);
  group.add(boardMesh);

  // 2. Plated Through-Hole Barrels & Clean Annular Rings
  const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Gold ENIG finish
    roughness: 0.2,
    metalness: 0.9
  });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

  pcbHoles.forEach(hole => {
    const rOuter = (hole.outer_diameter || 1.9) / 2;
    const rHole = (hole.hole_diameter || 1.0) / 2;
    const x = hole.x || 0;
    const y = hole.y || 0;

    // Top gold annular pad ring
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

  // 3. Copper SMT Pads
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

  // 4. Render 3D Copper Traces
  const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");
  const traceTopMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.3, metalness: 0.8 });
  const traceBotMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.8 });
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

  // 5. High-Resolution Silkscreen Decal Layer on Top Surface (z = 0.825)
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

// Decoupled Silkscreen Drawing Routine (Unified single-source directly from circuitJson)
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

    const cx = tx(x);
    const cy = ty(y);
    const rot = item.ccw_rotation || 0;

    if (rot !== 0) {
      ctx.save();
      ctx.translate(cx, cy);
      const rad = layer === "bottom" ? (rot * Math.PI) / 180 : -(rot * Math.PI) / 180;
      ctx.rotate(rad);
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(item.text, cx, cy);
    }
  }

  // Draw Silkscreen Paths (Vector QR Code & Seigaiha Waves)
  const silkPaths = circuitJson.filter(item => item.type === "pcb_silkscreen_path" && (item.layer === layer || (!item.layer && layer === "top")));

  for (const p of silkPaths) {
    const route = p.route || [];
    if (route.length < 2) continue;
    const sw = Math.max(2, Math.round((p.stroke_width || 0.2) * pxPerMm));
    ctx.lineWidth = sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(tx(route[0].x), ty(route[0].y));
    for (let i = 1; i < route.length; i++) {
      ctx.lineTo(tx(route[i].x), ty(route[i].y));
    }
    ctx.stroke();
  }
}

// 2D Pan/Zoom State
let svgTransform = { x: 0, y: 0, scale: 1.0 };
let isPanning = false;
let startPan = { x: 0, y: 0 };
let tooltip2D = null;

function init2DInteractions() {
  if (!container2D) return;

  tooltip2D = document.getElementById("pcb-2d-tooltip");
  if (!tooltip2D) {
    tooltip2D = document.createElement("div");
    tooltip2D.id = "pcb-2d-tooltip";
    tooltip2D.className = "pcb-2d-tooltip";
    const tab2d = document.getElementById("tab-2d") || container2D;
    tab2d.appendChild(tooltip2D);
  }

  container2D.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(Math.max(svgTransform.scale * zoomFactor, 0.4), 8.0);
    svgTransform.scale = newScale;
    applySvgTransform();
    hideTooltip();
  }, { passive: false });

  container2D.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isPanning = true;
      startPan = { x: e.clientX - svgTransform.x, y: e.clientY - svgTransform.y };
      container2D.style.cursor = "grabbing";
      hideTooltip();
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isPanning) {
      svgTransform.x = e.clientX - startPan.x;
      svgTransform.y = e.clientY - startPan.y;
      applySvgTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      container2D.style.cursor = "default";
    }
  });

  const updateTooltipPosition = (e) => {
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
  };

  const hideTooltip = () => {
    if (tooltip2D) tooltip2D.classList.remove("active");
    clearNetHighlights();
  };

  const highlightNet = (netName) => {
    clearNetHighlights();
    if (!netName || netName === "UNROUTED" || netName === "None") return;
    try {
      const escaped = CSS.escape(netName);
      document.querySelectorAll(`.pcb-trace[data-net="${escaped}"]`).forEach(el => el.classList.add("net-hovered"));
      document.querySelectorAll(`[data-comp][data-net="${escaped}"]`).forEach(el => {
        el.classList.add("net-hovered");
        const circ = el.querySelector("circle");
        if (circ) circ.classList.add("net-hovered");
        const rect = el.querySelector("rect");
        if (rect) rect.classList.add("net-hovered");
      });
    } catch (_) {}
  };

  const clearNetHighlights = () => {
    document.querySelectorAll(".net-hovered").forEach(el => el.classList.remove("net-hovered"));
  };

  container2D.addEventListener("mousemove", (e) => {
    if (isPanning) {
      hideTooltip();
      return;
    }

    // 1. Interactive Copper Trace Hover
    const traceEl = e.target.closest(".pcb-trace");
    if (traceEl) {
      const net = traceEl.getAttribute("data-net") || "TRACE";
      const layer = traceEl.getAttribute("data-layer") || "TOP";
      const segLen = traceEl.getAttribute("data-seg-len") || "0";
      const netLen = traceEl.getAttribute("data-net-len") || "0";
      const from = decodeURIComponent(traceEl.getAttribute("data-from") || "Pad");
      const to = decodeURIComponent(traceEl.getAttribute("data-to") || "Pad");
      const width = traceEl.getAttribute("data-width") || "0.25mm";

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

    // 2. Interactive Pad / Plated Hole Hover
    const padGroup = e.target.closest("[data-comp]");
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

    hideTooltip();
  });

  container2D.addEventListener("mouseout", (e) => {
    const related = e.relatedTarget;
    if (!related || !container2D.contains(related)) {
      hideTooltip();
    }
  });
}

function applySvgTransform() {
  const g = document.getElementById("svg-viewport-group");
  if (g) {
    g.setAttribute("transform", `translate(${svgTransform.x + 100}, ${svgTransform.y + 20}) scale(${svgTransform.scale})`);
  }
}

// 2D SVG Layout Viewer
function renderCircuitIn2D(circuitJson, boardWidth, boardHeight) {
  if (!container2D) return;

  const scale = 10; // px per mm for crisp square view
  const svgW = boardWidth * scale + 120;
  const svgH = boardHeight * scale + 120;
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

  const PIN_NAMES = {
    U_MCU: {
      pin1: "5V (VBUS)", pin2: "GND", pin3: "3V3 (Regulated)", pin4: "GPIO0 (Mic ADC1)",
      pin5: "GPIO1 (I2S WS)", pin6: "GPIO2 (I2C SDA)", pin7: "GPIO3 (I2C SCL)", pin8: "GPIO4 (I2S SCK)",
      pin9: "GPIO5 (IMU INT)", pin10: "GPIO6 (LED1 DATA)", pin11: "GPIO7 (Haptic PWM)", pin12: "GPIO8 (I2S SD)",
      pin13: "GPIO9 (Boot Strapping)", pin14: "GPIO10 (LED Power Enable)", pin15: "GPIO20 (LED2 Aux Data)", pin16: "GPIO21 (LED3 Aux Data)"
    },
    U_IMU: {
      pin1: "VCC (3.3V)", pin2: "GND", pin3: "SCL", pin4: "SDA",
      pin5: "XDA", pin6: "XCL", pin7: "AD0 (I2C Address)", pin8: "INT"
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

  const netLengths = new Map();
  const netEndpoints = new Map();
  const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");

  pcbTraces.forEach(trace => {
    let len = 0;
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (pt1 && pt2) len += Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
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

  // Board outline rect
  const bx = cx - halfW * scale;
  const by = cy - halfL * scale;
  const bw = boardWidth * scale;
  const bh = boardHeight * scale;

  // Render traces with rich interactive hover metadata
  const tracesSvg = pcbTraces.map(trace => {
    const netName = stMap.get(trace.source_trace_id)?.name || trace.connection_name || "UNROUTED";
    const netLen = (netLengths.get(netName) || 0).toFixed(1);

    const startPort = ppMap.get(trace.route?.[0]?.start_pcb_port_id);
    const endPort = ppMap.get(trace.route?.[trace.route?.length - 1]?.end_pcb_port_id);
    const startComp = startPort ? (scMap.get(startPort.source_component_id) || "Comp") : "";
    const endComp = endPort ? (scMap.get(endPort.source_component_id) || "Comp") : "";
    const fromLabel = startPort ? `${startComp}.${startPort.name} (${PIN_NAMES[startComp]?.[startPort.name] || startPort.name})` : "Start Pad";
    const toLabel = endPort ? `${endComp}.${endPort.name} (${PIN_NAMES[endComp]?.[endPort.name] || endPort.name})` : "End Pad";

    const segments = [];
    if (trace.route && trace.route.length >= 2) {
      for (let i = 0; i < trace.route.length - 1; i++) {
        const pt1 = extractPoint(trace.route[i]);
        const pt2 = extractPoint(trace.route[i + 1]);
        if (!pt1 || !pt2) continue;

        const x1 = cx + pt1.x * scale;
        const y1 = cy - pt1.y * scale;
        const x2 = cx + pt2.x * scale;
        const y2 = cy - pt2.y * scale;
        const isTop = (pt1.layer || "top") === "top";
        const strokeColor = isTop ? "#ec4899" : "#00f0ff";
        const strokeDash = isTop ? "none" : "3,2";
        const sw = Math.max(1.2, (trace.width || 0.25) * scale);
        const segLen = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y).toFixed(2);
        const layerStr = isTop ? "TOP (Pink)" : "BOTTOM (Cyan)";
        const widthStr = `${(trace.width || 0.25).toFixed(2)}mm`;

        segments.push(`
          <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" 
                stroke="${strokeColor}" stroke-width="${sw.toFixed(2)}" stroke-dasharray="${strokeDash}" 
                stroke-linecap="round" class="pcb-trace" 
                data-net="${netName}" 
                data-layer="${layerStr}"
                data-seg-len="${segLen}"
                data-net-len="${netLen}" 
                data-from="${encodeURIComponent(fromLabel)}"
                data-to="${encodeURIComponent(toLabel)}"
                data-width="${widthStr}"
                opacity="0.9" />
        `);
      }
    }
    return segments.join("\n");
  }).join("\n");

  // Render pads and plated holes
  const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
  const pcbPads = circuitJson.filter(item => item.type === "pcb_smtpad");

  const padsSvg = [
    ...pcbHoles.map(hole => {
      const x = cx + (hole.x || 0) * scale;
      const y = cy - (hole.y || 0) * scale;
      const rOuter = ((hole.outer_diameter || 1.8) / 2) * scale;
      const rDrill = ((hole.hole_diameter || 1.0) / 2) * scale;
      const sp = ppMap.get(hole.pcb_port_id);
      const holeHint = hole.port_hints?.[0] || hole.name || "";
      const isM3 = (hole.hole_diameter || 0) >= 3.0 || holeHint.startsWith("H");
      const comp = sp ? (scMap.get(sp.source_component_id) || "Comp") : (isM3 ? `${holeHint} (M3)` : (holeHint || "Hole"));
      const pin = sp ? sp.name : (isM3 ? "Mounting Hole" : (holeHint || "Pin"));
      const func = PIN_NAMES[comp]?.[pin] || (isM3 ? "M3 Mechanical Mounting Hole" : (sp ? pin : "Plated Hole"));
      const net = (sp ? portToNetName.get(sp.source_port_id) : "") || "NC";
      const connectedSet = netEndpoints.get(net) || new Set();
      const connectedList = Array.from(connectedSet).filter(p => !p.startsWith(`${comp}.${pin}`));
      const connectedStr = (net !== "NC" && connectedList.length > 0) ? connectedList.join(", ") : "None";

      return `
        <g class="pad-hover-group" data-comp="${comp}" data-pin="${pin}" data-func="${func}" data-net="${net}" 
           data-connected="${encodeURIComponent(connectedStr)}" data-x="${(hole.x || 0).toFixed(2)}" data-y="${(hole.y || 0).toFixed(2)}" 
           data-drill="${hole.hole_diameter || 1.0}mm" data-pad="${hole.outer_diameter || 1.8}mm">
          <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rOuter.toFixed(2)}" fill="#d4af37" stroke="#b8972e" stroke-width="1.2" />
          <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rDrill.toFixed(2)}" fill="#090a0f" />
        </g>
      `;
    }),
    ...pcbPads.map(pad => {
      const x = cx + (pad.x || 0) * scale;
      const y = cy - (pad.y || 0) * scale;
      const w = (pad.width || 1.6) * scale;
      const h = (pad.height || 1.6) * scale;
      const sp = ppMap.get(pad.pcb_port_id);
      const comp = sp ? (scMap.get(sp.source_component_id) || "Comp") : "Pad";
      const pin = sp ? sp.name : "";
      const func = PIN_NAMES[comp]?.[pin] || pin;
      const net = (sp ? portToNetName.get(sp.source_port_id) : "") || "NC";
      const connectedSet = netEndpoints.get(net) || new Set();
      const connectedList = Array.from(connectedSet).filter(p => !p.startsWith(`${comp}.${pin}`));
      const connectedStr = (net !== "NC" && connectedList.length > 0) ? connectedList.join(", ") : "None";

      return `
        <g class="pad-hover-group" data-comp="${comp}" data-pin="${pin}" data-func="${func}" data-net="${net}" 
           data-connected="${encodeURIComponent(connectedStr)}" data-x="${(pad.x || 0).toFixed(2)}" data-y="${(pad.y || 0).toFixed(2)}" 
           data-size="${(pad.width || 1.6)}x${(pad.height || 1.6)}mm">
          <rect x="${(x - w / 2).toFixed(2)}" y="${(y - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" 
                fill="#d4af37" stroke="#b8972e" stroke-width="0.8" rx="1.5" />
        </g>
      `;
    })
  ].join("\n");

  // Callouts
  const compPosMap = new Map();
  circuitJson.forEach(item => {
    if (item.type === "pcb_component") {
      const name = scMap.get(item.source_component_id) || item.name;
      if (name) compPosMap.set(name, { x: item.center?.x ?? 0, y: item.center?.y ?? 0 });
    }
  });

  const calloutDefs = [
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

  const annotations = calloutDefs.map(def => {
    const pos = compPosMap.get(def.id);
    if (!pos) return "";
    const ax = cx + pos.x * scale;
    const ay = cy - pos.y * scale;

    let tx, ty, lx, ly;
    if (def.side === "left") {
      tx = bx - 55;
      ty = ay;
      lx = tx + 40;
      ly = ay;
    } else if (def.side === "right") {
      tx = bx + bw + 55;
      ty = ay;
      lx = tx - 40;
      ly = ay;
    } else if (def.side === "top") {
      tx = ax;
      ty = by - 16;
      lx = ax;
      ly = ty + 9;
    } else { // bottom
      tx = def.id === "J_BAT" ? cx - 30 : cx + 45;
      ty = by + bh + 16;
      lx = tx;
      ly = ty - 9;
    }

    return `
      <g class="callout-annotation" opacity="0.95">
        <circle cx="${ax.toFixed(2)}" cy="${ay.toFixed(2)}" r="2.5" fill="${def.color}"/>
        <line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${lx.toFixed(2)}" y2="${ly.toFixed(2)}" stroke="${def.color}" stroke-width="1.2" stroke-dasharray="2,2"/>
        <rect x="${(tx - 40).toFixed(2)}" y="${(ty - 9).toFixed(2)}" width="80" height="18" rx="4" fill="#0b0c10" stroke="${def.color}" stroke-width="1.2"/>
        <text x="${tx.toFixed(2)}" y="${(ty + 3).toFixed(2)}" fill="${def.color}" font-family="monospace" font-size="7.5" font-weight="bold" text-anchor="middle">${def.label}</text>
      </g>
    `;
  }).join("\n");

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

  container2D.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${svgW + 200} ${svgH + 40}" class="pcb-svg" style="overflow: visible;">
      <g id="svg-viewport-group" transform="translate(100, 20)">
        <!-- Board Substrate Outline -->
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#131418" stroke="#39ff14" stroke-width="2" rx="${3 * scale}"/>
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
    activeBtn.textContent = shouldRoute ? "🔀 Route Traces" : "⚡ Update Layout";
  }
}

// High-speed Silkscreen Resizing (60 FPS Decoupled)
inputSilkScale?.addEventListener("input", (e) => {
  const newScale = parseFloat(e.target.value);
  currentSilkScale = newScale;
  if (labelSilkScale) labelSilkScale.textContent = `${newScale.toFixed(2)}x`;

  if (activeSilkCanvas && activeSilkTexture && activeCircuitJson) {
    drawSilkscreenDecal(activeSilkCanvas, activeCircuitJson, activeBoardWidth, activeBoardHeight, currentSilkScale, "top");
    activeSilkTexture.needsUpdate = true;
  }
  if (activeSilkCanvasBot && activeSilkTextureBot && activeCircuitJson) {
    drawSilkscreenDecal(activeSilkCanvasBot, activeCircuitJson, activeBoardWidth, activeBoardHeight, currentSilkScale, "bottom");
    activeSilkTextureBot.needsUpdate = true;
  }

  document.querySelectorAll("#svg-silkscreen-pins text").forEach(textEl => {
    const baseFs = parseFloat(textEl.getAttribute("data-base-size"));
    if (baseFs && !isNaN(baseFs)) {
      textEl.setAttribute("font-size", (baseFs * currentSilkScale).toFixed(2));
    }
  });
});

// Event Listeners
btnRecompile?.addEventListener("click", () => triggerCompilation(false));
btnRoute?.addEventListener("click", () => triggerCompilation(true));

btnExportEasyEda?.addEventListener("click", async () => {
  if (currentArtifacts && currentArtifacts.easyEdaZipBlob) {
    const url = URL.createObjectURL(currentArtifacts.easyEdaZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip";
    a.click();
    URL.revokeObjectURL(url);
  } else if (currentCircuit) {
    try {
      showLoading("Generating EasyEDA / KiCad Bundle...");
      const { createEasyEdaZipBlob } = await import("../../shared/export-utils.js");
      const blob = await createEasyEdaZipBlob(currentCircuit.getCircuitJson(), { projectName: "03_compactSquareLedHapticPCB" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "03_compactSquareLedHapticPCB_EasyEDA_KiCad.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error generating EasyEDA bundle: " + err.message);
    } finally {
      hideLoading();
    }
  } else {
    alert("Please wait for compilation to complete before downloading EasyEDA bundle.");
  }
});

btnExportGerber?.addEventListener("click", () => {
  if (currentArtifacts && currentArtifacts.gerberZipBlob) {
    const url = URL.createObjectURL(currentArtifacts.gerberZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "03_compactSquareLedHapticPCB_Gerbers.zip";
    a.click();
    URL.revokeObjectURL(url);
  } else {
    alert("Please wait for compilation to complete before downloading Gerbers.");
  }
});

btnExportBom?.addEventListener("click", () => {
  if (currentArtifacts && currentArtifacts.bomCsv) {
    const blob = new Blob([currentArtifacts.bomCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "03_compactSquareLedHapticPCB_BOM.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
});

btnExportPnp?.addEventListener("click", () => {
  if (currentArtifacts && currentArtifacts.pnpCsv) {
    const blob = new Blob([currentArtifacts.pnpCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "03_compactSquareLedHapticPCB_CPL.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
});

// Initial boot
window.addEventListener("DOMContentLoaded", () => {
  init2DInteractions();
  triggerCompilation(false);
});
