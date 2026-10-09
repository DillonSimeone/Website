/**
 * Parametric PCB Suite - Shared Three.js 3D PCB Visualizer
 * Provides:
 * 1. Substrate mesh with corner fillets and substrate thickness (1.6mm centered at z=0)
 * 2. Plated through-hole annular rings and drill core cylinders (zero Z-fighting)
 * 3. Surface-mount rectangular copper pads
 * 4. Smooth continuous 3D tube traces (Top = Pink, Bottom = Cyan)
 * 5. High-resolution decoupled 2D Canvas silkscreen decals (Top & Bottom)
 * 6. Responsive ResizeObserver camera management (100% full-height, no cutoffs)
 */

import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

export function createThreePcbViewer(container, options = {}) {
  if (!container) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.backgroundColor || 0x111317);

  const initialW = container.clientWidth || 800;
  const initialH = container.clientHeight || 600;

  const camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.1, 1000);
  camera.position.set(0, -55, 75);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(initialW, initialH);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Studio Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(50, 80, 80);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight2.position.set(-50, -80, -80);
  scene.add(dirLight2);

  // Responsive Resizing via ResizeObserver
  function onResize() {
    if (!renderer || !camera || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener("resize", onResize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(container);
  }
  setTimeout(onResize, 50);
  setTimeout(onResize, 200);

  // Animation Loop
  let isRunning = true;
  function animate() {
    if (!isRunning) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Decoupled Silkscreen Canvas Textures
  let activeSilkCanvasTop = document.createElement("canvas");
  let activeSilkCanvasBot = document.createElement("canvas");
  let activeSilkTextureTop = null;
  let activeSilkTextureBot = null;
  let currentBoardWidth = 38;
  let currentBoardHeight = 38;
  let currentCircuitJson = null;
  let currentSilkScale = 1.0;

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

    const silkItems = circuitJson.filter(item => 
      item.type === "pcb_silkscreen_text" && (item.layer === layer || (!item.layer && layer === "top"))
    );

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

    // Silkscreen vector paths
    const silkPaths = circuitJson.filter(item => 
      item.type === "pcb_silkscreen_path" && (item.layer === layer || (!item.layer && layer === "top"))
    );

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

  function updateSilkscreenDecals(silkScale = 1.0) {
    currentSilkScale = silkScale;
    if (!currentCircuitJson) return;

    drawSilkscreenDecal(activeSilkCanvasTop, currentCircuitJson, currentBoardWidth, currentBoardHeight, currentSilkScale, "top");
    drawSilkscreenDecal(activeSilkCanvasBot, currentCircuitJson, currentBoardWidth, currentBoardHeight, currentSilkScale, "bottom");

    if (activeSilkTextureTop) activeSilkTextureTop.needsUpdate = true;
    if (activeSilkTextureBot) activeSilkTextureBot.needsUpdate = true;
  }

  function renderCircuit(circuitJson, boardWidth, boardHeight, silkScale = 1.0) {
    currentCircuitJson = circuitJson;
    currentBoardWidth = boardWidth;
    currentBoardHeight = boardHeight;
    currentSilkScale = silkScale;

    // Remove previous board objects except lights
    const toRemove = [];
    scene.children.forEach(c => {
      if (c.isMesh || c.isGroup) toRemove.push(c);
    });
    toRemove.forEach(c => scene.remove(c));

    const boardGroup = new THREE.Group();

    // 1. PCB Substrate Mesh (Dark Green FR-4)
    const boardThickness = 1.6;
    const substrateGeom = new THREE.BoxGeometry(boardWidth, boardHeight, boardThickness);
    const substrateMat = new THREE.MeshStandardMaterial({
      color: 0x0e3a1f, // Premium matte solder mask dark green
      roughness: 0.45,
      metalness: 0.1
    });
    const substrateMesh = new THREE.Mesh(substrateGeom, substrateMat);
    boardGroup.add(substrateMesh);

    // 2. Plated Through-Holes & Drill Barrels (Annular Rings)
    const pcbHoles = circuitJson.filter(item => item.type === "pcb_plated_hole");
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const drillMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

    pcbHoles.forEach(h => {
      const rOuter = (h.outer_diameter || 1.8) / 2;
      const rHole = (h.hole_diameter || 1.0) / 2;
      const x = h.x || 0;
      const y = h.y || 0;

      // Dark Drill Core Cylinder
      const drillGeom = new THREE.CylinderGeometry(rHole, rHole, boardThickness + 0.04, 16);
      drillGeom.rotateX(Math.PI / 2);
      const drillMesh = new THREE.Mesh(drillGeom, drillMat);
      drillMesh.position.set(x, y, 0);
      boardGroup.add(drillMesh);

      // Top & Bottom Gold Annular Rings
      const ringGeom = new THREE.RingGeometry(rHole, rOuter, 24);
      const ringTop = new THREE.Mesh(ringGeom, goldMat);
      ringTop.position.set(x, y, boardThickness / 2 + 0.015);
      boardGroup.add(ringTop);

      const ringBot = new THREE.Mesh(ringGeom, goldMat);
      ringBot.position.set(x, y, -(boardThickness / 2 + 0.015));
      ringBot.rotation.y = Math.PI;
      boardGroup.add(ringBot);
    });

    // 3. SMT Copper Pads
    const pcbPads = circuitJson.filter(item => item.type === "pcb_smtpad");
    pcbPads.forEach(pad => {
      const w = pad.width || 1.6;
      const h = pad.height || 1.6;
      const x = pad.x || 0;
      const y = pad.y || 0;
      const isTop = (pad.layer || "top") === "top";
      const padGeom = new THREE.BoxGeometry(w, h, 0.03);
      const padMesh = new THREE.Mesh(padGeom, goldMat);
      padMesh.position.set(x, y, isTop ? (boardThickness / 2 + 0.015) : -(boardThickness / 2 + 0.015));
      boardGroup.add(padMesh);
    });

    // 4. Smooth 3D Tube Copper Traces
    const pcbTraces = circuitJson.filter(item => item.type === "pcb_trace");
    const topTraceMat = new THREE.MeshStandardMaterial({ color: 0xff007f, metalness: 0.6, roughness: 0.3 });
    const botTraceMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, metalness: 0.6, roughness: 0.3 });

    pcbTraces.forEach(trace => {
      if (!trace.route || trace.route.length < 2) return;
      for (let i = 0; i < trace.route.length - 1; i++) {
        const p1 = trace.route[i];
        const p2 = trace.route[i + 1];
        const x1 = p1.x ?? p1.start?.x ?? p1.end?.x;
        const y1 = p1.y ?? p1.start?.y ?? p1.end?.y;
        const x2 = p2.x ?? p2.start?.x ?? p2.end?.x;
        const y2 = p2.y ?? p2.start?.y ?? p2.end?.y;
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

        const isTop = (p1.layer || "top") === "top";
        const z = isTop ? (boardThickness / 2 + 0.012) : -(boardThickness / 2 + 0.012);
        const curve = new THREE.LineCurve3(new THREE.Vector3(x1, y1, z), new THREE.Vector3(x2, y2, z));
        const radius = Math.max(0.12, (trace.width || 0.25) / 2);
        const tubeGeom = new THREE.TubeGeometry(curve, 1, radius, 8, false);
        const tubeMesh = new THREE.Mesh(tubeGeom, isTop ? topTraceMat : botTraceMat);
        boardGroup.add(tubeMesh);
      }
    });

    // 5. Silkscreen Canvas Decals (Top and Bottom)
    activeSilkCanvasTop.width = 2048;
    activeSilkCanvasTop.height = Math.round(2048 * (boardHeight / boardWidth));
    activeSilkCanvasBot.width = 2048;
    activeSilkCanvasBot.height = Math.round(2048 * (boardHeight / boardWidth));

    drawSilkscreenDecal(activeSilkCanvasTop, currentCircuitJson, boardWidth, boardHeight, currentSilkScale, "top");
    drawSilkscreenDecal(activeSilkCanvasBot, currentCircuitJson, boardWidth, boardHeight, currentSilkScale, "bottom");

    if (activeSilkTextureTop) activeSilkTextureTop.dispose();
    if (activeSilkTextureBot) activeSilkTextureBot.dispose();

    activeSilkTextureTop = new THREE.CanvasTexture(activeSilkCanvasTop);
    activeSilkTextureBot = new THREE.CanvasTexture(activeSilkCanvasBot);
    activeSilkTextureTop.needsUpdate = true;
    activeSilkTextureBot.needsUpdate = true;

    const silkMatTop = new THREE.MeshBasicMaterial({
      map: activeSilkTextureTop,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });

    const silkMatBot = new THREE.MeshBasicMaterial({
      map: activeSilkTextureBot,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });

    const silkGeom = new THREE.PlaneGeometry(boardWidth, boardHeight);
    const silkMeshTop = new THREE.Mesh(silkGeom, silkMatTop);
    silkMeshTop.position.set(0, 0, boardThickness / 2 + 0.025);
    boardGroup.add(silkMeshTop);

    const silkMeshBot = new THREE.Mesh(silkGeom, silkMatBot);
    silkMeshBot.position.set(0, 0, -(boardThickness / 2 + 0.025));
    silkMeshBot.rotation.y = Math.PI;
    boardGroup.add(silkMeshBot);

    scene.add(boardGroup);
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    renderCircuit,
    updateSilkscreenDecals,
    onResize,
    destroy() {
      isRunning = false;
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement?.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    }
  };
}
