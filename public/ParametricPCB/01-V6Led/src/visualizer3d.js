import * as THREE from 'https://esm.sh/three@0.136.0';
import { OrbitControls } from 'https://esm.sh/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { mergeBufferGeometries } from 'https://esm.sh/three@0.136.0/examples/jsm/utils/BufferGeometryUtils.js';
import { logDebug } from './debug.js';
import { resolveDrcTargets, drcItemText } from './drc-highlight.js';

export const initThreeJS = (container, state, threeInstanceRef, onLoaded) => {
  if (!container) return;
  const tStart = performance.now();
  const logTiming = (label, t0) => {
    const elapsed = performance.now() - t0;
    logDebug(`[3D Build Timing] ${label}: ${elapsed.toFixed(1)}ms`);
    if (window.tabClickTime) {
      const totalElapsed = performance.now() - window.tabClickTime;
      logDebug(`[3D Build Timing] ${label} (elapsed since click): ${totalElapsed.toFixed(1)}ms`);
    }
  };

  let scene, camera, renderer, controls;

  // Check if we can reuse the existing WebGL context and DOM elements
  if (threeInstanceRef && threeInstanceRef.current && threeInstanceRef.current.container === container) {
    // Stop the previous animation loop and remove the old resize listener
    cancelAnimationFrame(threeInstanceRef.current.animId);
    window.removeEventListener("resize", threeInstanceRef.current.resizeHandler);

    scene = threeInstanceRef.current.scene;
    camera = threeInstanceRef.current.camera;
    renderer = threeInstanceRef.current.renderer;
    controls = threeInstanceRef.current.controls;

    // Clear the existing scene objects
    scene.clear();
  } else {
    // Complete fresh initialization
    destroyThreeJS(container, threeInstanceRef);

    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 50, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
  }

  // Re-add Lighting (since scene was cleared)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(50, 100, 50);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x00f3ff, 0.3);
  dirLight2.position.set(-50, -50, 50);
  scene.add(dirLight2);

  // Build the PCB model
  const singleW = state.boardWidth;
  const singleH = state.boardHeight;
  const pcbW = state.useMouseBites ? (state.panelCols * singleW + (state.panelCols - 1) * 2.0) : singleW;
  const pcbH = state.useMouseBites ? (state.panelRows * singleH + (state.panelRows - 1) * 2.0) : singleH;
  
  // PCB Substrate Material
  const pcbMat = new THREE.MeshLambertMaterial({
    color: 0x0c2518 // Matte Green
  });

  const cols = state.useMouseBites ? (state.panelCols || 2) : 1;
  const rows = state.useMouseBites ? (state.panelRows || 2) : 1;
  const colGap = 2.0;
  const rowGap = 2.0;

  // Render individual board substrates
  for (let r = 0; r < rows; r++) {
    const offsetY = (r - (rows - 1) / 2) * (singleH + rowGap);
    for (let c = 0; c < cols; c++) {
      const offsetX = (c - (cols - 1) / 2) * (singleW + colGap);
      const subGeom = new THREE.BoxGeometry(singleW, 1.6, singleH);
      const subMesh = new THREE.Mesh(subGeom, pcbMat);
      subMesh.position.set(offsetX, 0, offsetY);
      scene.add(subMesh);
    }
  }

  // Draw breakaway tabs linking board copies (if panelized)
  if (state.useMouseBites) {
    const tabMat = new THREE.MeshLambertMaterial({
      color: 0x071c11
    });

    // 1. Vertical breakaway tabs
    for (let r = 0; r < rows; r++) {
      const offsetY = (r - (rows - 1) / 2) * (singleH + rowGap);
      for (let c = 0; c < cols - 1; c++) {
        const tabX = (c - (cols - 1) / 2) * (singleW + colGap) + singleW / 2 + colGap / 2;
        [offsetY - singleH / 3, offsetY, offsetY + singleH / 3].forEach(tabY => {
          // Add tab bridge mesh
          const tabGeom = new THREE.BoxGeometry(colGap, 1.6, 1.0);
          const tabMesh = new THREE.Mesh(tabGeom, tabMat);
          tabMesh.position.set(tabX, 0, tabY);
          scene.add(tabMesh);

          // Render mousebite cylinder drill holes (unplated, dark)
          const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
          for (let k = -1.5; k <= 1.5; k += 1.0) {
            const hGeom = new THREE.CylinderGeometry(0.25, 0.25, 1.62, 16);
            const hMesh = new THREE.Mesh(hGeom, holeMat);
            hMesh.position.set(tabX, 0, tabY + k * 0.7);
            scene.add(hMesh);
          }
        });
      }
    }

    // 2. Horizontal breakaway tabs
    for (let r = 0; r < rows - 1; r++) {
      const tabY = (r - (rows - 1) / 2) * (singleH + rowGap) + singleH / 2 + rowGap / 2;
      for (let c = 0; c < cols; c++) {
        const offsetX = (c - (cols - 1) / 2) * (singleW + colGap);
        [offsetX - singleW / 3, offsetX, offsetX + singleW / 3].forEach(tabX => {
          // Add tab bridge mesh
          const tabGeom = new THREE.BoxGeometry(1.0, 1.6, rowGap);
          const tabMesh = new THREE.Mesh(tabGeom, tabMat);
          tabMesh.position.set(tabX, 0, tabY);
          scene.add(tabMesh);

          // Render horizontal mousebite drill holes
          const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
          for (let k = -1.5; k <= 1.5; k += 1.0) {
            const hGeom = new THREE.CylinderGeometry(0.25, 0.25, 1.62, 16);
            const hMesh = new THREE.Mesh(hGeom, holeMat);
            hMesh.position.set(tabX + k * 0.7, 0, tabY);
            scene.add(hMesh);
          }
        });
      }
    }
  }

  // Shared geometry cache to avoid duplicate instantiation overhead
  const geomCache = {};
  const getBoxGeometry = (w, h, d) => {
    const key = `box_${w}_${h}_${d}`;
    if (!geomCache[key]) geomCache[key] = new THREE.BoxGeometry(w, h, d);
    return geomCache[key];
  };
  const getCylinderGeometry = (rt, rb, h, s) => {
    const key = `cyl_${rt}_${rb}_${h}_${s}`;
    if (!geomCache[key]) geomCache[key] = new THREE.CylinderGeometry(rt, rb, h, s);
    return geomCache[key];
  };

  // Pre-create color-coded trace materials (unlit — avoids WebGL varying limits in panel mode)
  const traceMaterials = {
    top_vcc: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    bottom_vcc: new THREE.MeshBasicMaterial({ color: 0xb3261e }),
    top_gnd: new THREE.MeshBasicMaterial({ color: 0x007aff }),
    bottom_gnd: new THREE.MeshBasicMaterial({ color: 0x0056b3 }),
    top_data: new THREE.MeshBasicMaterial({ color: 0x34c759 }),
    bottom_data: new THREE.MeshBasicMaterial({ color: 0x1e7e34 })
  };

  // Pre-create component and pad materials
  const padMat = new THREE.MeshBasicMaterial({ color: 0xdfb036 });
  const ledBodyMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const ledLensMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.45
  });
  const ledEmitterMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Draw 3D Trace Routes using TubeGeometry wires
  const tTraces0 = performance.now();
  const traces = state.circuitJson.filter(e => e.type === "pcb_trace");
  const sourceTraces = state.circuitJson.filter(e => e.type === "source_trace");
  const traceGeometriesByMaterial = {};

  const queueTraceSegment = (pts, width, netName) => {
    const layer = pts[0].layer;
    const isTop = layer === "top";
    const yCoord = isTop ? 0.81 : -0.81;

    const points3D = pts.map(p => new THREE.Vector3(p.x, yCoord, -p.y));
    const curve = new THREE.CatmullRomCurve3(points3D);
    curve.curveType = "centripetal";

    const lowerNet = netName.toLowerCase();
    let matKey = isTop ? "top_data" : "bottom_data";
    if (lowerNet.includes("vcc") || lowerNet.includes("v5")) {
      matKey = isTop ? "top_vcc" : "bottom_vcc";
    } else if (lowerNet.includes("gnd")) {
      matKey = isTop ? "top_gnd" : "bottom_gnd";
    }

    const tubularSegments = Math.min(Math.max(pts.length * 2, 4), 24);
    const geom = new THREE.TubeGeometry(curve, tubularSegments, width / 2, 6, false);
    if (!traceGeometriesByMaterial[matKey]) traceGeometriesByMaterial[matKey] = [];
    traceGeometriesByMaterial[matKey].push(geom);
  };

  traces.forEach(trace => {
    if (!trace.route || trace.route.length < 2) return;

    const srcTrace = sourceTraces.find(st => st.source_trace_id === trace.source_trace_id);
    const netName = srcTrace?.name || "unknown net";

    let segment = [];
    for (let i = 0; i < trace.route.length; i++) {
      const pt = trace.route[i];
      if (pt.x === undefined || pt.y === undefined) continue;

      if (segment.length > 0 && segment[0].layer !== pt.layer) {
        if (segment.length >= 2) {
          queueTraceSegment(segment, trace.width || 0.3, netName);
        }
        segment = [];
      }
      segment.push(pt);
    }
    if (segment.length >= 2) {
      queueTraceSegment(segment, trace.width || 0.3, netName);
    }
  });

  for (const [matKey, geoms] of Object.entries(traceGeometriesByMaterial)) {
    if (!geoms.length) continue;
    const merged = geoms.length === 1 ? geoms[0] : mergeBufferGeometries(geoms, false);
    if (merged) {
      scene.add(new THREE.Mesh(merged, traceMaterials[matKey]));
    }
    geoms.forEach((g) => {
      if (g !== merged) g.dispose();
    });
  }
  logTiming("Traces Tube Geometry", tTraces0);

  // Draw Standard Vias (Cylinders)
  const tVias0 = performance.now();
  const vias = state.circuitJson.filter(e => e.type === "pcb_via");
  const viaOuterMat = new THREE.MeshBasicMaterial({ color: 0xccaa44 });
  const viaInnerMat = new THREE.MeshBasicMaterial({ color: 0x050505 }); // Dark hole inner face

  vias.forEach(via => {
    // Skip breakaway tab drill holes
    if (via.pcb_via_id?.startsWith("mb_via")) return;

    const vx = via.x || 0;
    const vy = via.y || 0;
    const outerRadius = via.outer_diameter / 2;
    const holeRadius = via.hole_diameter / 2;

    // 1. Plated outer cylinder ring (reused geometry)
    const outGeom = getCylinderGeometry(outerRadius, outerRadius, 1.62, 16);
    const outMesh = new THREE.Mesh(outGeom, viaOuterMat);
    outMesh.position.set(vx, 0, -vy);
    scene.add(outMesh);

    // 2. Unplated inner drill hole cylinder (reused geometry)
    const inGeom = getCylinderGeometry(holeRadius, holeRadius, 1.63, 16);
    const inMesh = new THREE.Mesh(inGeom, viaInnerMat);
    inMesh.position.set(vx, 0, -vy);
    scene.add(inMesh);
  });
  logTiming("Vias Placements", tVias0);

  // Extract PCB components, SMT pads, and source components from the compiled JSON
  const tPads0 = performance.now();
  const pcbComponents = state.circuitJson.filter(e => e.type === "pcb_component");
  const pcbPads = state.circuitJson.filter(e => e.type === "pcb_smtpad");
  const sourceComps = state.circuitJson.filter(e => e.type === "source_component");

  // Draw SMT Pads (drawn directly at absolute coordinates with correct shape rect/circle)
  pcbPads.forEach(pad => {
    if (pad.x === undefined || pad.y === undefined) return;
    
    let padGeom;
    const thickness = 0.03;
    if (pad.shape === "rect") {
      padGeom = getBoxGeometry(pad.width, thickness, pad.height);
    } else {
      const radius = pad.radius || (pad.width / 2);
      padGeom = getCylinderGeometry(radius, radius, thickness, 16);
    }
    
    const padMesh = new THREE.Mesh(padGeom, padMat);
    padMesh.position.set(pad.x, 0.8 + thickness / 2, -pad.y);
    scene.add(padMesh);
  });
  logTiming("SMT Pads Geometry", tPads0);

  // Keep a reference to LED mesh groups to animate in the animation loop
  const tComps0 = performance.now();
  const ledGroups = [];

  pcbComponents.forEach(comp => {
    const srcComp = sourceComps.find(sc => sc.source_component_id === comp.source_component_id);
    const designator = srcComp?.name || comp.pcb_component_id || "";
    if (!designator || designator === "board") return;

    const baseDesignator = designator.replace(/^R\d+_C\d+_/, "");
    const cx = comp.center?.x || 0;
    const cy = comp.center?.y || 0;
    const rotation = comp.rotation || 0;
    const rotRad = (rotation * Math.PI) / 180;

    if (baseDesignator.startsWith("U")) {
      // Draw 3D WS2812B-1313-V6 LED package
      const ledGroup = new THREE.Group();
      ledGroup.position.set(cx, 0.8, -cy);
      ledGroup.rotation.y = -rotRad;

      const bodyGeom = getBoxGeometry(1.3, 0.65, 1.3);
      const bodyMesh = new THREE.Mesh(bodyGeom, ledBodyMat);
      bodyMesh.position.y = 0.325;
      ledGroup.add(bodyMesh);

      const lensGeom = getBoxGeometry(1.0, 0.08, 1.0);
      const lensMesh = new THREE.Mesh(lensGeom, ledLensMat);
      lensMesh.position.y = 0.69;
      ledGroup.add(lensMesh);

      const emitterGeom = getBoxGeometry(0.35, 0.12, 0.35);
      const emitterMesh = new THREE.Mesh(emitterGeom, ledEmitterMat);
      emitterMesh.position.y = 0.62;
      ledGroup.add(emitterMesh);

      scene.add(ledGroup);
      ledGroups.push({ group: ledGroup, emitter: emitterMesh, seed: Math.random() * 100 });
    }
  });
  logTiming("Component Bodies & Lights", tComps0);

  // Render Silkscreen Decal Surface (exactly like PCB Route: One Ground Truth)
  const tDecal0 = performance.now();
  const silkCanvas = document.createElement("canvas");
  silkCanvas.width = 2048;
  silkCanvas.height = 512;
  const silkCtx = silkCanvas.getContext("2d");
  
  // Fill background transparent
  silkCtx.fillStyle = "rgba(0,0,0,0)";
  silkCtx.fillRect(0, 0, silkCanvas.width, silkCanvas.height);

  // Helper to resolve the real component designator (e.g. U1, J_MID1) from a physical ID
  const getComponentName = (pcbCompId) => {
    if (!pcbCompId) return "";
    const comp = pcbComponents.find(c => c.pcb_component_id === pcbCompId);
    if (!comp) return "";
    const srcComp = sourceComps.find(sc => sc.source_component_id === comp.source_component_id);
    return srcComp?.name || "";
  };

  // Draw slogans and other compiled silkscreen texts onto the decal canvas (ignoring footprint-level stacked texts)
  const pcbTexts = state.circuitJson.filter(e => {
    if (e.type !== "pcb_silkscreen_text") return false;
    if (e.pcb_component_id) {
      const name = getComponentName(e.pcb_component_id);
      const cleanName = name.replace(/^R\d+_C\d+_/, "");
      if (cleanName.startsWith("U") || cleanName.startsWith("J")) {
        return false; // Filter out footprint texts inside LEDs and solder headers
      }
    }
    return true;
  });

  // Draw LED corner pin labels (+, -, I, O) onto the silkscreen decal canvas
  pcbComponents.forEach(comp => {
    const srcComp = sourceComps.find(sc => sc.source_component_id === comp.source_component_id);
    const designator = srcComp?.name || comp.pcb_component_id || "";
    if (!designator || designator === "board") return;
    
    const baseDesignator = designator.replace(/^R\d+_C\d+_/, "");
    if (baseDesignator.startsWith("U")) {
      const cx = comp.center?.x || 0;
      const cy = comp.center?.y || 0;
      
      const scaleX = silkCanvas.width / pcbW;
      const scaleY = silkCanvas.height / pcbH;
      const drawX = (cx + pcbW/2) * scaleX;
      const drawY = (-cy + pcbH / 2) * scaleY;
      
      silkCtx.fillStyle = "#ffffff";
      silkCtx.font = "14px monospace";
      silkCtx.textAlign = "center";
      silkCtx.textBaseline = "middle";
      
      // Pin labels: +/I top row, O/- bottom row (1313 layout)
      silkCtx.fillText("+", drawX - 8, drawY - 4);
      silkCtx.fillText("I", drawX + 8, drawY - 4);
      silkCtx.fillText("O", drawX - 8, drawY + 4);
      silkCtx.fillText("-", drawX + 8, drawY + 4);
    }
  });
  pcbTexts.forEach(txt => {
    const cx = txt.center?.x !== undefined ? txt.center.x : (txt.x || 0);
    const cy = txt.center?.y !== undefined ? txt.center.y : (txt.y || 0);
    
    const scaleX = silkCanvas.width / pcbW;
    const scaleY = silkCanvas.height / pcbH;
    const drawX = (cx + pcbW/2) * scaleX;
    const drawY = (-cy + pcbH/2) * scaleY;
    
    const sizePx = (txt.font_size || 0.6) * scaleY;
    
    silkCtx.save();
    silkCtx.translate(drawX, drawY);
    if (txt.rotation) {
      silkCtx.rotate(-txt.rotation * Math.PI / 180);
    }
    silkCtx.fillStyle = "rgba(255, 255, 255, 0.55)";
    silkCtx.font = `bold ${sizePx}px monospace`;
    silkCtx.textAlign = "center";
    silkCtx.textBaseline = "middle";
    silkCtx.fillText(txt.text, 0, 0);
    silkCtx.restore();
  });
  logTiming("Decal Canvas Drawing (Texts)", tDecal0);

  const tDecalMesh0 = performance.now();
  const silkTexture = new THREE.CanvasTexture(silkCanvas);
  silkTexture.needsUpdate = true;

  const silkMat = new THREE.MeshBasicMaterial({
    map: silkTexture,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  // Single decal overlay spanning the exact panel board surface
  const decalGeom = getBoxGeometry(pcbW, 0.01, pcbH);
  const decalMesh = new THREE.Mesh(decalGeom, silkMat);
  decalMesh.position.set(0, 0.81, 0);
  scene.add(decalMesh);
  logTiming("Decal Mesh Projection", tDecalMesh0);

  logTiming("=== TOTAL 3D SCENE BUILD ===", tStart);

  // Resize Listener
  const handleResize = () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", handleResize);
  handleResize();

  // Animation Loop: Render scene and cycle LED emitters color (rainbow glow)
  let animId;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    
    // Animate LED RGB Emitters
    const time = Date.now() * 0.0015;
    ledGroups.forEach(led => {
      // Cycle hue over time (shifting individual LEDs for waves)
      const hue = (time + led.seed) % 1;
      const color = new THREE.Color().setHSL(hue, 1.0, 0.5);
      led.emitter.material.color.copy(color);
    });

    controls.update();
    renderer.render(scene, camera);
  };
  animate();
  
  if (onLoaded) {
    onLoaded();
  }

  threeInstanceRef.current = {
    renderer,
    scene,
    camera,
    controls,
    animId,
    resizeHandler: handleResize,
    container
  };
};

export const destroyThreeJS = (container, threeInstanceRef) => {
  if (threeInstanceRef && threeInstanceRef.current) {
    const { renderer, animId, resizeHandler, scene, drcHighlightGroup } = threeInstanceRef.current;
    cancelAnimationFrame(animId);
    window.removeEventListener("resize", resizeHandler);
    if (scene && drcHighlightGroup) {
      scene.remove(drcHighlightGroup);
    }
    renderer.dispose();
    if (container) {
      container.innerHTML = "";
    }
    threeInstanceRef.current = null;
  }
};

function projectBoardPoint(instance, x, y) {
  if (!instance?.camera || !instance?.renderer) return null;
  const vector = new THREE.Vector3(x, 0.92, -y);
  vector.project(instance.camera);
  const rect = instance.renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (vector.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-vector.y * 0.5 + 0.5) * rect.height
  };
}

/** Highlight DRC targets in the 3D scene; returns screen position for popup. */
export function applyDrcHighlight(threeInstanceRef, highlight, circuitJson) {
  const inst = threeInstanceRef?.current;
  if (!inst?.scene) return null;

  if (inst.drcHighlightGroup) {
    inst.scene.remove(inst.drcHighlightGroup);
    inst.drcHighlightGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) obj.material.dispose?.();
    });
    inst.drcHighlightGroup = null;
  }
  inst.drcHighlightPrimary = null;

  if (!highlight?.refs?.length || !circuitJson) return null;

  const targets = resolveDrcTargets(circuitJson, highlight.refs);
  if (!targets.length) return null;

  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff007f, transparent: true, opacity: 0.95 });
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff007f, transparent: true, opacity: 0.35 });

  for (const t of targets) {
    const ringGeom = new THREE.TorusGeometry(1.1, 0.07, 8, 28);
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(t.x, 0.95, -t.y);
    group.add(ring);

    const pillarGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8);
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.set(t.x, 0, -t.y);
    group.add(pillar);
  }

  inst.scene.add(group);
  inst.drcHighlightGroup = group;

  const primary = targets[0];
  inst.drcHighlightPrimary = {
    x: primary.x,
    y: primary.y,
    label: primary.label,
    text: highlight.text ?? drcItemText(highlight)
  };

  const screen = projectBoardPoint(inst, primary.x, primary.y);
  return screen
    ? { screen, label: inst.drcHighlightPrimary.label, text: inst.drcHighlightPrimary.text }
    : null;
}

export function getDrcHighlightScreen(threeInstanceRef) {
  const inst = threeInstanceRef?.current;
  const p = inst?.drcHighlightPrimary;
  if (!p) return null;
  const screen = projectBoardPoint(inst, p.x, p.y);
  return screen ? { ...screen, label: p.label, text: p.text } : null;
}

export function clearDrcHighlight(threeInstanceRef) {
  const inst = threeInstanceRef?.current;
  if (!inst?.scene) return;

  if (inst.drcHighlightGroup) {
    inst.scene.remove(inst.drcHighlightGroup);
    inst.drcHighlightGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) obj.material.dispose?.();
    });
    inst.drcHighlightGroup = null;
  }
  inst.drcHighlightPrimary = null;
}
