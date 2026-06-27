// 3D Geometry and Render Engine using Manifold WASM & Three.js
import { state } from './state.js';

export let THREE = null;
export let renderer = null;
export let scene = null;
export let camera = null;
let Manifold = null;
let lastTime = 0;

export async function getManifold() {
  if (Manifold) return Manifold;
  const module = await import('https://unpkg.com/manifold-3d/manifold.js');
  const wasm = await module.default();
  wasm.setup();
  Manifold = wasm.Manifold;
  return Manifold;
}

export async function initThree() {
  THREE = await import('https://cdn.skypack.dev/three@0.136.0');
  
  const canvas = document.createElement('canvas');
  canvas.id = 'webgl-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0'; canvas.style.left = '0';
  canvas.style.width = '100vw'; canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '210';
  document.body.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0); // Transparent background
  renderer.setClearAlpha(0);
  canvas.style.backgroundColor = 'transparent';
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  
  window.addEventListener('resize', () => {
    if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  requestAnimationFrame(animateThree);
}

function getClippedRect(el, container) {
  const rect = el.getBoundingClientRect();
  const headerH = document.querySelector('header')?.offsetHeight || 0;
  
  let clipLeft = 0;
  let clipTop = headerH;
  let clipRight = window.innerWidth;
  let clipBottom = window.innerHeight;
  
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
  
  state.knobs.forEach(k => {
    if (!k.mesh) return;
    
    // Rotate model
    k.mesh.rotation.z += 0.06;
    
    if (!k.cardEl) return;
    const previewEl = k.cardEl.querySelector('.preview');
    if (!previewEl) return;
    
    const rect = previewEl.getBoundingClientRect();
    const clip = getClippedRect(previewEl, document.getElementById('knobGrid'));
    
    if (clip.height <= 0 || clip.width <= 0) return;
    
    let canvasBottom = (window.innerHeight - (clip.top + clip.height)) * dpr;
    renderer.setViewport(rect.left * dpr, (window.innerHeight - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);
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

  // Render detail preview if active
  if (state.selectedId) {
    const detailPreview = document.getElementById('detailPreview');
    const panel = document.getElementById('detailPanel');
    if (panel && panel.classList.contains('open') && detailPreview) {
      const k = state.knobs.find(x => x.id === state.selectedId);
      if (k && k.mesh) {
        const rect = detailPreview.getBoundingClientRect();
        const clip = getClippedRect(detailPreview, panel);
        if (clip.height > 0 && clip.width > 0) {
          let canvasBottom = (window.innerHeight - (clip.top + clip.height)) * dpr;
          renderer.setViewport(rect.left * dpr, (window.innerHeight - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);
          renderer.setScissor(clip.left * dpr, canvasBottom, clip.width * dpr, clip.height * dpr);
          
          const maxDim = Math.max(k.outerD, k.height);
          const dist = Math.max(50, maxDim * 2.2);
          camera.position.set(0, dist, dist * 0.8);
          camera.lookAt(0, 0, 0);
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          
          scene.add(k.mesh);
          renderer.render(scene, camera);
          scene.remove(k.mesh);
        }
      }
    }
  }
}

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
  
  let body = M.cylinder(discH, rimR, taperR, k.sides, true);
  
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
  if (texMode !== 'smooth') {
    let textureCutter = null;
    
    if (texMode === 'flutes') {
      const fluteR = texScale / 2;
      const avgR = (rimR + taperR) / 2;
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
        const localR = rimR * (1 - t) + taperR * t;
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
          const cx = rimR - texDepth * 0.6 + knurlR;
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
        const localR = rimR * (1 - t) + taperR * t;
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
    let ssHole = M.cylinder(rimR * 2, screwR, screwR, 16, true)
                .rotate([0, 90, 0])
                .translate([rimR/2, 0, -discH/2 + k.slotH/2]);
    
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
