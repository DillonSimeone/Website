// 3D Geometry and Render Engine using Manifold WASM & Three.js
import { state } from './state.js';

export let THREE = null;
export let renderer = null;
export let scene = null;
export let camera = null;
let Manifold = null;
let wasmModule = null;

// ─── ROTATION CONFIG ─────────────────────────────────────────────
// 10fps stepped rotation for that characteristic "low framerate" feel
const ROTATION_FPS = 10;
const ROTATION_INTERVAL = 1 / ROTATION_FPS; // seconds per step
const ROTATION_SPEED = 0.5; // rad/s
let lastFrameTime = 0;
let rotationAccumulator = 0;

// ─── DETAIL PREVIEW DRAG STATE ───────────────────────────────────
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

export async function getManifold() {
  if (Manifold) return Manifold;
  const module = await import('https://unpkg.com/manifold-3d/manifold.js');
  wasmModule = await module.default();
  wasmModule.setup();
  Manifold = wasmModule.Manifold;
  return Manifold;
}

export async function initThree() {
  THREE = await import('https://cdn.skypack.dev/three@0.136.0');
  
  const canvas = document.createElement('canvas');
  canvas.id = 'webgl-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  // Use 100% instead of 100vw/vh so the canvas scales with browser zoom
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '210';
  document.body.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  canvas.style.backgroundColor = 'transparent';
  syncCanvasSize();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setScissorTest(true);
  
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x404040, 2.0));
  const dirLight = new THREE.DirectionalLight(0xc8ff00, 1.5);
  dirLight.position.set(20, 50, 20);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x0088ff, 1.0);
  fillLight.position.set(-20, 0, -20);
  scene.add(fillLight);
  
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  
  // Use ResizeObserver for zoom-safe resizing
  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(document.documentElement);
  
  // Fallback for older browsers
  window.addEventListener('resize', syncCanvasSize);
  
  initDetailDrag();
  requestAnimationFrame(animateThree);
}

function syncCanvasSize() {
  if (!renderer) return;
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  renderer.setSize(w, h);
}

function getClippedRect(el, container) {
  const rect = el.getBoundingClientRect();
  const headerH = document.querySelector('header')?.offsetHeight || 0;
  
  let clipLeft = 0;
  let clipTop = headerH;
  let clipRight = document.documentElement.clientWidth;
  let clipBottom = document.documentElement.clientHeight;
  
  if (container) {
    const cRect = container.getBoundingClientRect();
    clipLeft = Math.max(clipLeft, cRect.left);
    clipTop = Math.max(clipTop, cRect.top);
    clipRight = Math.min(clipRight, cRect.right);
    clipBottom = Math.min(clipBottom, cRect.bottom);
  }
  
  const panel = document.getElementById('detailPanel');
  if (panel && panel.classList.contains('open') && container?.id === 'knobGrid') {
    const pRect = panel.getBoundingClientRect();
    clipRight = Math.min(clipRight, pRect.left);
  }
  
  const rLeft = Math.max(rect.left, clipLeft);
  const rTop = Math.max(rect.top, clipTop);
  const rRight = Math.min(rect.right, clipRight);
  const rBottom = Math.min(rect.bottom, clipBottom);
  
  return {
    left: rLeft,
    top: rTop,
    width: Math.max(0, rRight - rLeft),
    height: Math.max(0, rBottom - rTop)
  };
}

function animateThree(time) {
  requestAnimationFrame(animateThree);

  // ── Delta time with 10fps stepping ──
  const dt = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;
  
  rotationAccumulator += dt;
  const steps = Math.floor(rotationAccumulator / ROTATION_INTERVAL);
  if (steps > 0) {
    state.gridRotation += steps * ROTATION_SPEED * ROTATION_INTERVAL;
    rotationAccumulator -= steps * ROTATION_INTERVAL;
  }

  // Always clear the entire screen manually before scissor rendering
  if (renderer) {
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
  }

  if (!renderer || state.knobs.length === 0) {
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  const canvasW = document.documentElement.clientWidth;
  const canvasH = document.documentElement.clientHeight;
  
  // ── Render grid cards ──
  state.knobs.forEach(k => {
    if (!k.mesh || !k.cardEl) return;
    const previewEl = k.cardEl.querySelector('.preview');
    if (!previewEl) return;
    
    const rect = previewEl.getBoundingClientRect();
    const clip = getClippedRect(previewEl, document.getElementById('knobGrid'));
    
    if (clip.height <= 0 || clip.width <= 0) return;
    
    // Apply stepped grid rotation (same for all grid cards)
    k.mesh.rotation.x = -Math.PI / 2;
    k.mesh.rotation.y = 0;
    k.mesh.rotation.z = state.gridRotation;
    
    let canvasBottom = (canvasH - (clip.top + clip.height)) * dpr;
    renderer.setViewport(rect.left * dpr, (canvasH - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);
    renderer.setScissor(clip.left * dpr, canvasBottom, clip.width * dpr, clip.height * dpr);
    
    const maxDim = Math.max(k.outerD, k.height);
    const dist = Math.max(50, maxDim * 2.8);
    camera.position.set(0, dist, dist * 0.8);
    camera.lookAt(0, 0, 0);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();

    scene.add(k.mesh);
    renderer.render(scene, camera);
    scene.remove(k.mesh);
  });

  // ── Render detail preview (user-controlled rotation, no auto-spin) ──
  if (state.selectedId) {
    const detailPreview = document.getElementById('detailPreview');
    const panel = document.getElementById('detailPanel');
    if (panel && panel.classList.contains('open') && detailPreview) {
      const k = state.knobs.find(x => x.id === state.selectedId);
      if (k && k.mesh) {
        const rect = detailPreview.getBoundingClientRect();
        const clip = getClippedRect(detailPreview, panel);
        if (clip.height > 0 && clip.width > 0) {
          // Save mesh rotation, apply detail view rotation
          const savedRot = { x: k.mesh.rotation.x, y: k.mesh.rotation.y, z: k.mesh.rotation.z };
          k.mesh.rotation.set(state.detailEuler.x, state.detailEuler.y, 0, 'YXZ');
          
          let canvasBottom = (canvasH - (clip.top + clip.height)) * dpr;
          renderer.setViewport(rect.left * dpr, (canvasH - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);
          renderer.setScissor(clip.left * dpr, canvasBottom, clip.width * dpr, clip.height * dpr);
          
          const maxDim = Math.max(k.outerD, k.height);
          const dist = Math.max(50, maxDim * 2.2) / state.detailZoom;
          camera.position.set(0, dist, dist * 0.8);
          camera.lookAt(0, 0, 0);
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          
          scene.add(k.mesh);
          renderer.render(scene, camera);
          scene.remove(k.mesh);
          
          // Restore rotation for grid rendering next frame
          k.mesh.rotation.set(savedRot.x, savedRot.y, savedRot.z);
        }
      }
    }
  }
}

// ─── DETAIL PREVIEW DRAG-TO-ROTATE & ZOOM ───────────────────────
function initDetailDrag() {
  // We listen on the document and check target, since detailPreview may be
  // recreated during render. The div itself is always in the DOM.
  const panel = document.getElementById('detailPanel');
  if (!panel) {
    // Retry after DOM is ready
    setTimeout(initDetailDrag, 100);
    return;
  }

  const previewEl = document.getElementById('detailPreview');
  if (!previewEl) {
    setTimeout(initDetailDrag, 100);
    return;
  }

  previewEl.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    state.detailEuler.y += dx * 0.01;
    state.detailEuler.x += dy * 0.01;
    // Clamp vertical rotation
    state.detailEuler.x = Math.max(-Math.PI, Math.min(0, state.detailEuler.x));
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Scroll to zoom
  previewEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.detailZoom *= (1 - e.deltaY * 0.002);
    state.detailZoom = Math.max(0.3, Math.min(4.0, state.detailZoom));
  }, { passive: false });

  // Touch support for mobile
  let touchStartX = 0, touchStartY = 0;
  previewEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isDragging = true;
    }
  }, { passive: true });

  previewEl.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    state.detailEuler.y += dx * 0.01;
    state.detailEuler.x += dy * 0.01;
    state.detailEuler.x = Math.max(-Math.PI, Math.min(0, state.detailEuler.x));
  }, { passive: true });

  previewEl.addEventListener('touchend', () => {
    isDragging = false;
  }, { passive: true });
}

// ─── MESH CONSTRUCTION ──────────────────────────────────────────
export function manifoldToThreeMesh(model, colorHex, k) {
  if (!THREE) return null;
  const meshData = model.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertProperties, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.triVerts, 1));
  geometry.computeVertexNormals();
  
  let material;
  if (state.renderMode === 'rendered') {
    material = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.2,
        metalness: 0.8,
        side: THREE.DoubleSide
    });
  } else {
    material = new THREE.MeshBasicMaterial({
        color: 0x07294d,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  
  if (state.renderMode === 'blueprint') {
    const edges = new THREE.EdgesGeometry(geometry);
    const lineColor = (k && k.mountMode === 'slide') ? 0xffaa00 : 0x00f2ff;
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2 }));
    mesh.add(line);
  }
  
  return mesh;
}

// ─── STAR / WAVE / POLYGON PROFILE EXTRUSION ────────────────────
function buildStarProfile(sides, outerR) {
  // Inner radius at ~50% creates dramatic star indentations
  const innerR = outerR * 0.5;
  const pts = [];
  for (let i = 0; i < sides * 2; i++) {
    const angle = (i * Math.PI / sides) - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return pts;
}

function buildWaveProfile(outerR) {
  // 6 lobes with 35% amplitude for dramatically visible undulation
  const lobes = 6;
  const amplitude = outerR * 0.35;
  const baseR = outerR - amplitude;
  const pts = [];
  const segments = 72;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const r = baseR + amplitude * Math.sin(lobes * angle);
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return pts;
}

export async function generateKnobManifold(k) {
  const M = await getManifold();
  
  const rimR = k.outerD / 2;
  const taperR = (k.outerD * k.taper) / 2;
  const discH = k.height;
  const texMode = k.texMode || 'flutes';
  const texDepth = k.texDepth || 3.0;
  const texScale = k.texScale || 3.0;
  const texCount = k.texCount || 8;
  const shaftType = k.shaftType || 'dshaft';
  
  // ── Build body based on profile type ──
  let body;
  
  if (k.star && wasmModule?.CrossSection) {
    // Star profile: alternating outer/inner radii
    const pts = buildStarProfile(k.sides, rimR);
    try {
      const cs = new wasmModule.CrossSection([pts]);
      const taperScale = taperR / rimR;
      body = Manifold.extrude(cs, discH, 0, 0, [taperScale, taperScale]);
      body = body.translate([0, 0, -discH / 2]);
      cs.delete();
    } catch (e) {
      console.warn('CrossSection extrude failed for star, falling back to cylinder:', e);
      body = M.cylinder(discH, rimR, taperR, k.sides * 2, true);
    }
  } else if (k.wave && wasmModule?.CrossSection) {
    // Wave profile: sinusoidal perimeter
    const pts = buildWaveProfile(rimR);
    try {
      const cs = new wasmModule.CrossSection([pts]);
      const taperScale = taperR / rimR;
      body = Manifold.extrude(cs, discH, 0, 0, [taperScale, taperScale]);
      body = body.translate([0, 0, -discH / 2]);
      cs.delete();
    } catch (e) {
      console.warn('CrossSection extrude failed for wave, falling back to cylinder:', e);
      body = M.cylinder(discH, rimR, taperR, 36, true);
    }
  } else {
    // Standard polygon
    body = M.cylinder(discH, rimR, taperR, k.sides, true);
  }
  
  // ── Bore ──
  let boreR = (k.boreD / 2) + k.clearance;
  let bore = M.cylinder(k.slotH + 0.2, boreR, boreR, 64, true);
  
  if (shaftType === 'dshaft') {
    const flatDepth = (k.boreD === 6.0 && k.clearance === 0.15) ? 1.1 : 1.0;
    const flatBoxW = boreR * 2.5;
    const flatBoxH = boreR * 2.5;
    const flatBoxD = k.slotH + 0.5;
    let flatBox = M.cube([flatBoxW, flatBoxH, flatBoxD], true)
                   .translate([0, boreR - flatDepth + flatBoxH/2, 0]);
    let newBore = bore.subtract(flatBox);
    bore.delete(); flatBox.delete();
    bore = newBore;
  } else if (shaftType === 'knurled') {
    const numSplines = 18;
    const splineW = 0.5;
    const splineH = 0.4;
    const splineLength = k.slotH + 0.4;
    let splineUnion = null;
    for (let i = 0; i < numSplines; i++) {
      const angle = i * 360 / numSplines;
      let tooth = M.cube([splineW, splineH, splineLength], true)
                   .translate([0, boreR - splineH/3, 0])
                   .rotate([0, 0, angle]);
      if (!splineUnion) splineUnion = tooth;
      else {
        let temp = splineUnion.add(tooth);
        splineUnion.delete(); tooth.delete();
        splineUnion = temp;
      }
    }
    if (splineUnion) {
      let newBore = bore.add(splineUnion);
      bore.delete(); splineUnion.delete();
      bore = newBore;
    }
  }
  
  bore = bore.translate([0, 0, -discH/2 + (k.slotH+0.2)/2 - 0.1]);

  let finalShape = body.subtract(bore);
  body.delete(); bore.delete();

  // ─── TEXTURE GENERATION ────────────────────────────────────
  // Use effective radius for texture calculations (star/wave have irregular perimeters)
  const effectiveR = rimR;
  
  if (texMode !== 'smooth') {
    let textureCutter = null;
    
    if (texMode === 'flutes') {
      const fluteR = texScale / 2;
      const avgR = (effectiveR + taperR) / 2;
      const cx = Math.max(boreR + fluteR + 1.0, Math.max(avgR - fluteR + 0.3, avgR - texDepth + fluteR));
      for (let i = 0; i < texCount; i++) {
        const angle = i * 360 / texCount;
        let g = M.cylinder(discH * 1.4, fluteR, fluteR, 16, true)
                .translate([cx, 0, 0])
                .rotate([0, 0, angle]);
        if (!textureCutter) textureCutter = g;
        else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'rings') {
      const ringCount = Math.max(2, texCount);
      const usableH = discH * 0.8;
      const spacing = usableH / (ringCount + 1);
      const ringThickness = Math.min(texScale * 0.6, spacing * 0.7);
      
      for (let i = 1; i <= ringCount; i++) {
        const zPos = -discH / 2 + discH * 0.1 + i * spacing;
        const t = (zPos + discH / 2) / discH;
        const localR = effectiveR * (1 - t) + taperR * t;
        const outerR = localR + 1.0;
        const innerR = Math.max(boreR + 1.0, localR - texDepth);

        let outer = M.cylinder(ringThickness, outerR, outerR, 64, true);
        let inner = M.cylinder(ringThickness + 0.1, innerR, innerR, 64, true);
        let ring = outer.subtract(inner);
        outer.delete(); inner.delete();
        ring = ring.translate([0, 0, zPos]);
        if (!textureCutter) textureCutter = ring;
        else { let n = textureCutter.add(ring); textureCutter.delete(); ring.delete(); textureCutter = n; }
      }
    }
    
    else if (texMode === 'knurl') {
      const knurlR = texScale / 3;
      const numAxial = Math.max(4, texCount);
      
      for (let set = 0; set < 2; set++) {
        const tiltAngle = set === 0 ? 35 : -35;
        for (let i = 0; i < numAxial; i++) {
          const angle = i * 360 / numAxial;
          const cx = effectiveR - texDepth * 0.6 + knurlR;
          let g = M.cylinder(discH * 2.0, knurlR, knurlR, 8, true)
                  .rotate([tiltAngle, 0, 0])
                  .translate([cx, 0, 0])
                  .rotate([0, 0, angle]);
          if (!textureCutter) textureCutter = g;
          else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
        }
      }
    }
    
    else if (texMode === 'scallops') {
      const sRadius = texScale / 1.5;
      const numRings = Math.max(1, Math.floor(discH / (sRadius * 2.5)));
      const vertSpacing = discH / (numRings + 1);
      
      for (let ring = 0; ring < numRings; ring++) {
        const zPos = -discH / 2 + vertSpacing * (ring + 1);
        const countInRing = texCount;
        const ringOffset = ring % 2 === 0 ? 0 : (360 / countInRing / 2);
        
        const t = (zPos + discH / 2) / discH;
        const localR = effectiveR * (1 - t) + taperR * t;
        const cx = Math.max(boreR + sRadius + 1.0, Math.max(localR - sRadius + 0.3, localR - texDepth + sRadius));

        for (let i = 0; i < countInRing; i++) {
          const angle = i * 360 / countInRing + ringOffset;
          let g = M.sphere(sRadius, 12)
                  .translate([cx, 0, zPos])
                  .rotate([0, 0, angle]);
          if (!textureCutter) textureCutter = g;
          else { let n = textureCutter.add(g); textureCutter.delete(); g.delete(); textureCutter = n; }
        }
      }
    }
    
    if (textureCutter) {
      let n = finalShape.subtract(textureCutter);
      finalShape.delete(); textureCutter.delete();
      finalShape = n;
    }
  }

  // ─── SET SCREW ─────────────────────────────────────────────
  if (k.setScrew !== 'none') {
    let screwR = k.setScrew === 'm2' ? 1.0 : (k.setScrew === 'm3' ? 1.5 : 2.0);
    let ssHole = M.cylinder(effectiveR * 2, screwR, screwR, 16, true)
                .rotate([0, 90, 0])
                .translate([effectiveR/2, 0, -discH/2 + k.slotH/2]);
    
    let offsetAngle = (360 / texCount) / 2;
    ssHole = ssHole.rotate([0, 0, offsetAngle]);
    
    let n = finalShape.subtract(ssHole);
    finalShape.delete(); ssHole.delete();
    finalShape = n;
  }
  
  return finalShape;
}

export function setRenderMode(mode) {
  state.renderMode = mode;
  
  const btnRender = document.getElementById('btn-render-mode');
  const btnBlueprint = document.getElementById('btn-blueprint-mode');
  if (btnRender && btnBlueprint) {
    if (mode === 'rendered') {
      btnRender.classList.add('active');
      btnBlueprint.classList.remove('active');
    } else {
      btnBlueprint.classList.add('active');
      btnRender.classList.remove('active');
    }
  }
  
  state.knobs.forEach(k => {
    if (!k.mesh) return;
    
    const toRemove = [];
    k.mesh.children.forEach(child => {
      if (child instanceof THREE.LineSegments) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      k.mesh.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    });
    
    k.mesh.material.dispose();
    
    if (state.renderMode === 'rendered') {
      k.mesh.material = new THREE.MeshStandardMaterial({
          color: 0xc8ff00,
          roughness: 0.2,
          metalness: 0.8,
          side: THREE.DoubleSide
      });
    } else {
      k.mesh.material = new THREE.MeshBasicMaterial({
          color: 0x07294d,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
      });
      
      const edges = new THREE.EdgesGeometry(k.mesh.geometry);
      const lineColor = (k.mountMode === 'slide') ? 0xffaa00 : 0x00f2ff;
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2 }));
      k.mesh.add(line);
    }
  });
}
