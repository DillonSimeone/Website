import { state } from './state.js';

export let THREE = null;
export let renderer = null;
export let scene = null;
export let camera = null;

// ─── ROTATION CONFIG ─────────────────────────────────────────────
const ROTATION_FPS = 10;
const ROTATION_INTERVAL = 1 / ROTATION_FPS; // seconds per step
const ROTATION_SPEED = 0.5; // rad/s
let lastFrameTime = 0;
let rotationAccumulator = 0;

// ─── DETAIL PREVIEW DRAG STATE ───────────────────────────────────
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

export async function initThree() {
  THREE = await import('https://cdn.skypack.dev/three@0.136.0');
  
  const canvas = document.createElement('canvas');
  canvas.id = 'webgl-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '210';
  document.body.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  canvas.style.backgroundColor = 'transparent';
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setScissorTest(true);
  syncCanvasSize();
  
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x404040, 2.0));
  const dirLight = new THREE.DirectionalLight(0xc8ff00, 1.5);
  dirLight.position.set(20, 50, 20);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x0088ff, 1.0);
  fillLight.position.set(-20, 0, -20);
  scene.add(fillLight);
  
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  
  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(document.documentElement);
  
  window.addEventListener('resize', syncCanvasSize);
  
  initDetailDrag();
  requestAnimationFrame(animateThree);
}

function syncCanvasSize() {
  if (!renderer) return;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(dpr);
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

  const dt = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;
  
  rotationAccumulator += dt;
  const steps = Math.floor(rotationAccumulator / ROTATION_INTERVAL);
  if (steps > 0) {
    state.gridRotation += steps * ROTATION_SPEED * ROTATION_INTERVAL;
    rotationAccumulator -= steps * ROTATION_INTERVAL;
  }

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
  
  const canvasH = document.documentElement.clientHeight;
  
  // ── Render grid cards ──
  state.knobs.forEach(k => {
    if (!k.mesh || !k.cardEl) return;
    const previewEl = k.cardEl.querySelector('.preview');
    if (!previewEl) return;
    
    const rect = previewEl.getBoundingClientRect();
    const clip = getClippedRect(previewEl, document.getElementById('knobGrid'));
    
    if (clip.height <= 0 || clip.width <= 0) return;
    
    k.mesh.rotation.x = -Math.PI / 2;
    k.mesh.rotation.y = 0;
    k.mesh.rotation.z = state.gridRotation;
    
    let canvasBottom = canvasH - (clip.top + clip.height);
    renderer.setViewport(rect.left, canvasH - rect.bottom, rect.width, rect.height);
    renderer.setScissor(clip.left, canvasBottom, clip.width, clip.height);
    
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

  // ── Render detail preview ──
  if (state.selectedId) {
    const detailPreview = document.getElementById('detailPreview');
    const panel = document.getElementById('detailPanel');
    if (panel && panel.classList.contains('open') && detailPreview) {
      const k = state.knobs.find(x => x.id === state.selectedId);
      if (k && k.mesh) {
        const rect = detailPreview.getBoundingClientRect();
        const clip = getClippedRect(detailPreview, panel);
        if (clip.height > 0 && clip.width > 0) {
          const savedRot = { x: k.mesh.rotation.x, y: k.mesh.rotation.y, z: k.mesh.rotation.z };
          k.mesh.rotation.set(state.detailEuler.x, state.detailEuler.y, 0, 'YXZ');
          
          let canvasBottom = canvasH - (clip.top + clip.height);
          renderer.setViewport(rect.left, canvasH - rect.bottom, rect.width, rect.height);
          renderer.setScissor(clip.left, canvasBottom, clip.width, clip.height);
          
          const maxDim = Math.max(k.outerD, k.height);
          const dist = Math.max(50, maxDim * 2.2) / state.detailZoom;
          camera.position.set(0, dist, dist * 0.8);
          camera.lookAt(0, 0, 0);
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          
          scene.add(k.mesh);
          renderer.render(scene, camera);
          scene.remove(k.mesh);
          
          k.mesh.rotation.set(savedRot.x, savedRot.y, savedRot.z);
        }
      }
    }
  }
}

function initDetailDrag() {
  const panel = document.getElementById('detailPanel');
  if (!panel) {
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
    state.detailEuler.x = Math.max(-Math.PI, Math.min(0, state.detailEuler.x));
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  previewEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.detailZoom *= (1 - e.deltaY * 0.002);
    state.detailZoom = Math.max(0.3, Math.min(4.0, state.detailZoom));
  }, { passive: false });

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
