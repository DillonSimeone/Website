import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ORGAN_DEFS,
  ORGAN_PALETTE,
  computeEntityStats,
  buildOrganEntityRig,
  animateOrganEntity
} from './entityRigs.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070b);
scene.fog = new THREE.Fog(0x07070b, 14, 48);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3.2, 2.3, 4.0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.3, 0);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0x9a8aa8, 0x201015, 1.1));
const keyLight = new THREE.DirectionalLight(0xffe8d8, 1.6);
keyLight.position.set(5, 10, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x00f0ff, 6, 16);
rimLight.position.set(-4, 4, -4);
scene.add(rimLight);

const grid = new THREE.GridHelper(24, 24, 0x5a2434, 0x1c1620);
scene.add(grid);

// State
let selectedOrgan = 'limb';
let partScale = 1.0;
let mirrorX = true;
let animatePreview = false;
let nextId = 1;

let nodes = [
  { id: 0, parentId: null, type: 'core', pos: [0, 1.4, 0], dir: [0, 1, 0], scale: 1.0 }
];
let currentRig = null;

// Ghost preview marker
const ghostMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 10, 10),
  new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true })
);
ghostMesh.visible = false;
scene.add(ghostMesh);

const paletteEl = document.getElementById('palette-el');
const statsEl = document.getElementById('stats-el');
const layerBandEl = document.getElementById('layer-band-el');
const savedListEl = document.getElementById('saved-list-el');
const statusBar = document.getElementById('status-bar');
const scaleSlider = document.getElementById('scale-slider');
const scaleVal = document.getElementById('scale-val');
const mirrorToggle = document.getElementById('mirror-toggle');
const animToggle = document.getElementById('anim-toggle');
const nameInput = document.getElementById('entity-name');
const bossToggle = document.getElementById('boss-toggle');

function setStatus(msg) {
  if (statusBar) statusBar.innerText = msg;
}

function rebuildPreview() {
  if (currentRig) scene.remove(currentRig.root);
  currentRig = buildOrganEntityRig({ nodes }, { uniqueMaterials: true });
  scene.add(currentRig.root);
  updateTelemetry();
}

function updateTelemetry() {
  const s = computeEntityStats(nodes);
  const tierColor = s.danger >= 70 ? '#ff33ff' : s.danger >= 40 ? '#ff4a4a' : s.danger >= 22 ? '#ffb000' : '#39ff14';
  statsEl.innerHTML = `
    <div>PARTS ATTACHED: <strong>${nodes.length}</strong></div>
    <div>DANGER RATING: <strong style="color:${tierColor}">${s.danger}</strong></div>
    <div>INTEGRITY (HP): <strong>${s.hp}</strong></div>
    <div>STRIDE SPEED: <strong>${s.speed.toFixed(1)} m/s</strong></div>
    <div>STRIKE DAMAGE: <strong>${s.damage}</strong></div>
    <div>PHASE ABILITY: <strong>${s.canPhase ? 'YES' : 'NO'}</strong></div>
  `;

  layerBandEl.innerHTML = `
    <div style="color:#ffb000;font-weight:bold;margin-bottom:3px;">STRATA SPAWN WINDOW</div>
    <div>Starts Spawning: <strong>${s.startFloorLabel}</strong></div>
    <div>Stops Spawning: <strong>${s.stopFloorLabel}</strong></div>
    <div style="color:#9aa8a0;font-size:10px;margin-top:3px;">
      ${s.stopDepth === Infinity
        ? 'Apex horror: remains active down into the deepest abyss.'
        : `Below ${s.stopFloorLabel}, this specimen is too safe and ceases spawning.`}
    </div>
  `;
}

function renderPalette() {
  paletteEl.innerHTML = '';
  for (const key of ORGAN_PALETTE) {
    const def = ORGAN_DEFS[key];
    const btn = document.createElement('button');
    btn.className = `organ-btn ${selectedOrgan === key ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="organ-top">
        <span>${def.name}</span>
        <span class="organ-danger">+${def.danger} DANGER</span>
      </div>
      <div class="organ-desc">${def.desc}</div>
    `;
    btn.onclick = () => {
      selectedOrgan = key;
      renderPalette();
      setStatus(`Selected ${def.name} (+${def.danger} Danger). Click any surface on the model to graft.`);
    };
    paletteEl.appendChild(btn);
  }
}

// Raycast placement onto existing organ meshes
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

canvas.addEventListener('pointermove', (e) => {
  if (!currentRig) return;
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(currentRig.meshes, false);
  if (hits.length > 0) {
    ghostMesh.visible = true;
    ghostMesh.position.copy(hits[0].point);
  } else {
    ghostMesh.visible = false;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !currentRig) return;
  const distMoved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (distMoved > 5) return; // Was an orbit drag, not a click

  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(currentRig.meshes, false);
  if (hits.length === 0) return;

  const hit = hits[0];
  const parentId = hit.object.userData.nodeId ?? 0;
  const parentHolder = hit.object.parent;
  parentHolder.updateWorldMatrix(true, false);

  const localPos = parentHolder.worldToLocal(hit.point.clone());
  const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  const invQuat = parentHolder.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localDir = worldNormal.clone().applyQuaternion(invQuat).normalize();

  nodes.push({
    id: nextId++,
    parentId,
    type: selectedOrgan,
    pos: [Number(localPos.x.toFixed(3)), Number(localPos.y.toFixed(3)), Number(localPos.z.toFixed(3))],
    dir: [Number(localDir.x.toFixed(3)), Number(localDir.y.toFixed(3)), Number(localDir.z.toFixed(3))],
    scale: partScale
  });

  if (mirrorX && Math.abs(hit.point.x) > 0.08) {
    // Mirror across world X if grafting on a side limb/thorax
    const mirroredWorldPoint = hit.point.clone();
    mirroredWorldPoint.x = -mirroredWorldPoint.x;
    const mirroredWorldNormal = worldNormal.clone();
    mirroredWorldNormal.x = -mirroredWorldNormal.x;
    const rootPos = currentRig.root.worldToLocal(mirroredWorldPoint);
    nodes.push({
      id: nextId++,
      parentId: 0,
      type: selectedOrgan,
      pos: [Number((rootPos.x).toFixed(3)), Number((rootPos.y - 1.4).toFixed(3)), Number((rootPos.z).toFixed(3))],
      dir: [Number(mirroredWorldNormal.x.toFixed(3)), Number(mirroredWorldNormal.y.toFixed(3)), Number(mirroredWorldNormal.z.toFixed(3))],
      scale: partScale
    });
  }

  rebuildPreview();
  setStatus(`Grafted ${ORGAN_DEFS[selectedOrgan].name}!`);
});

scaleSlider.oninput = () => {
  partScale = parseFloat(scaleSlider.value);
  scaleVal.innerText = `${partScale.toFixed(1)}x`;
};
mirrorToggle.onchange = () => { mirrorX = mirrorToggle.checked; };
animToggle.onchange = () => { animatePreview = animToggle.checked; };

document.getElementById('undo-btn').onclick = () => {
  if (nodes.length > 1) {
    nodes.pop();
    rebuildPreview();
    setStatus('Removed last grafted part.');
  }
};

document.getElementById('reset-btn').onclick = () => {
  nodes = [{ id: 0, parentId: null, type: 'core', pos: [0, 1.4, 0], dir: [0, 1, 0], scale: 1.0 }];
  nextId = 1;
  rebuildPreview();
  setStatus('Reset to Core Thorax.');
};

async function refreshSavedList() {
  try {
    const res = await fetch('/api/entities');
    if (!res.ok) throw new Error('Express server offline');
    const data = await res.json();
    savedListEl.innerHTML = '';
    for (const bp of data.entities) {
      const s = computeEntityStats(bp.nodes);
      const row = document.createElement('div');
      row.className = 'saved-item';
      row.innerHTML = `
        <span><strong>${bp.name}</strong> <span style="color:#ff4a6e;">D:${s.danger}</span></span>
        <span style="color:#ffb000;">${s.startFloorLabel}..${s.stopFloorLabel}</span>
      `;
      row.onclick = () => {
        nodes = JSON.parse(JSON.stringify(bp.nodes));
        nextId = Math.max(1, ...nodes.map(n => n.id + 1));
        nameInput.value = bp.name;
        bossToggle.checked = !!bp.isBoss;
        rebuildPreview();
        setStatus(`Loaded ${bp.name} from entities/${bp.id}.json`);
      };
      savedListEl.appendChild(row);
    }
  } catch (_) {
    savedListEl.innerHTML = '<div style="color:#ff6677;font-size:11px;">Run StartEntityForge.bat to save/load entities/ via Express.js</div>';
  }
}

document.getElementById('save-btn').onclick = async () => {
  const name = nameInput.value.trim() || 'Forged Entity';
  const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
  try {
    const res = await fetch('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, isBoss: bossToggle.checked, nodes })
    });
    const data = await res.json();
    if (data.ok) {
      setStatus(`Saved to entities/${data.id}.json! Ready in-game.`);
      refreshSavedList();
    } else {
      setStatus(`Error: ${data.error}`);
    }
  } catch (err) {
    setStatus('Save failed: Start server with StartEntityForge.bat');
  }
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();
  if (animatePreview && currentRig) {
    animateOrganEntity(currentRig, clock.elapsedTime, 3.0, false);
  }
  renderer.render(scene, camera);
}

renderPalette();
rebuildPreview();
refreshSavedList();
animate();
