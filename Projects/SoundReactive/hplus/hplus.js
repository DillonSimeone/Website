/**
 * hplus — Audio-Reactive Demoscene Show
 * 
 * A timed, evolving demoscene "show" inspired by Halcyon's 1998 64k intro.
 * Colors are synesthetic: red = bass (big movements), purple = highs (tight vibrations).
 * Scenes crossfade and evolve with audio driving geometry, camera, particles, and color.
 */

import * as THREE from 'three';
import { AudioEngine } from '../shared/audio-engine.js';

// ── State ──────────────────────────────────────────────────────────────────────
let renderer, scene, camera, clock;
let audioEngine;

// Scene objects
let coreGroup, ribbonMesh, particleSystem, starField;
let crystalGroup, pulseRings, nebulaSystem, helixGroup;
let coreOuterMat, coreInnerMat, ringMat;

// Show timeline — void scenes halved, many new scenes
const SCENE_DEFS = [
  { name: '01_VOID',            dur: 4,  desc: 'VOID // EMERGENCE' },
  { name: '02_POLYGON_BIRTH',   dur: 14, desc: 'POLYGON CORE // BIRTH' },
  { name: '03_PARTICLE_SWARM',  dur: 12, desc: 'PARTICLE SWARM // EXPANSION' },
  { name: '04_CRYSTAL_LATTICE', dur: 14, desc: 'CRYSTAL LATTICE // RESONANCE' },
  { name: '05_RIBBON_FIELD',    dur: 14, desc: 'RIBBON FIELD // DEFORMATION' },
  { name: '06_PULSE_RINGS',     dur: 12, desc: 'PULSE RINGS // RADIATION' },
  { name: '07_HELIX',           dur: 14, desc: 'HELIX // DNA OF SOUND' },
  { name: '08_NEBULA',          dur: 14, desc: 'NEBULA // DEEP SPACE' },
  { name: '09_CONVERGENCE',     dur: 18, desc: 'CONVERGENCE // EVERYTHING' },
  { name: '10_VOID_RETURN',     dur: 4,  desc: 'VOID // RETURN' },
];

let showTime = 0;
let currentSceneIdx = 0;
let sceneLocalTime = 0;
let showRunning = false;
let showLoopCount = 0;

// Smoothed audio bands — full 7-band
let sSubBass = 0, sBass = 0, sLowMid = 0, sMid = 0, sHighMid = 0, sHigh = 0, sAir = 0;
let sEnergy = 0, sTransient = 0, sBeat = false;
let sPrimaryColor = { r: 1, g: 0, b: 0.2 };
let sSecondaryColor = { r: 0.6, g: 0, b: 1.0 };
let sCentroid = 200;

// Camera
const cameraTarget = new THREE.Vector3(0, 0, 0);

// Reusable color objects for scene tinting
const sceneTint  = new THREE.Color();
const sceneTint2 = new THREE.Color();

// ── DOM refs ───────────────────────────────────────────────────────────────────
const energyEl     = document.getElementById('energy-val');
const bassEl       = document.getElementById('bass-val');
const sceneNameEl  = document.getElementById('scene-name');
const sceneLabelEl = document.getElementById('scene-label');
const progressFill = document.getElementById('scene-progress-fill');
const gainSlider   = document.getElementById('gain-slider');
const gainValEl    = document.getElementById('gain-val');
const btnMic       = document.getElementById('btn-mic');
const btnDemo      = document.getElementById('btn-demo');
const audioFile    = document.getElementById('audio-file');

// ── Synesthetic Color Helper ───────────────────────────────────────────────────
// Maps the current audio spectrum to a THREE.Color.
// Bass-heavy = deep red/orange, mids = green/cyan, highs = blue/violet
function getFreqColor() {
  sceneTint.setRGB(
    Math.min(1, sPrimaryColor.r * 0.8 + sSubBass * 0.5 + sBass * 0.3),
    Math.min(1, sPrimaryColor.g * 0.6 + sMid * 0.4 + sLowMid * 0.2),
    Math.min(1, sPrimaryColor.b * 0.7 + sHigh * 0.5 + sAir * 0.3)
  );
  return sceneTint;
}
function getFreqColor2() {
  sceneTint2.setRGB(
    Math.min(1, sSecondaryColor.r * 0.7 + sBass * 0.2),
    Math.min(1, sSecondaryColor.g * 0.5 + sHighMid * 0.3),
    Math.min(1, sSecondaryColor.b * 0.8 + sAir * 0.4)
  );
  return sceneTint2;
}

// Bass → big slow displacement; Highs → tight high-freq trembling
function bassDisplacement(t)  { return sBass * 2.5 + sSubBass * 1.8 + sTransient * 3.0; }
function highTremor(t, seed)  { return Math.sin(t * 40 + seed) * sHigh * 0.15 + Math.sin(t * 65 + seed * 1.7) * sAir * 0.08; }

// ── Init ───────────────────────────────────────────────────────────────────────
function init() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010306);
  scene.fog = new THREE.FogExp2(0x010306, 0.02);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 14);
  camera.lookAt(cameraTarget);

  // Lighting — will be tinted dynamically
  const ambient = new THREE.AmbientLight(0x0a1428, 2.0);
  ambient.name = 'ambient';
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0x4488cc, 3.0);
  key.name = 'keyLight';
  key.position.set(5, 8, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x223355, 1.5);
  fill.position.set(-4, -3, -5);
  scene.add(fill);

  const rim = new THREE.PointLight(0x00e5ff, 2.0, 30);
  rim.name = 'rimLight';
  rim.position.set(0, 0, -8);
  scene.add(rim);

  // Build all scene objects
  buildStarField();
  buildPolygonCore();
  buildParticleSwarm();
  buildRibbonField();
  buildCrystalLattice();
  buildPulseRings();
  buildHelix();
  buildNebula();

  // All hidden initially
  hideAll();

  // Audio Engine
  audioEngine = new AudioEngine();

  // Events
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  // Drag-and-drop audio
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      if (f.type.startsWith('audio/')) {
        audioEngine.loadFile(f);
        btnMic.classList.remove('active');
        btnDemo.classList.remove('active');
      }
    }
  });

  // Modal start
  document.getElementById('start-mic').addEventListener('click', () => startShow(true));
  document.getElementById('start-demo').addEventListener('click', () => startShow(false));

  // HUD audio source buttons
  btnMic.addEventListener('click', async () => {
    btnMic.classList.add('active'); btnDemo.classList.remove('active');
    audioEngine.stopDemoSynth();
    await audioEngine.init(true);
  });
  btnDemo.addEventListener('click', async () => {
    btnDemo.classList.add('active'); btnMic.classList.remove('active');
    await audioEngine.init(false);
  });
  audioFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      audioEngine.loadFile(e.target.files[0]);
      btnMic.classList.remove('active');
      btnDemo.classList.remove('active');
    }
  });
  gainSlider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    audioEngine.gain = v;
    gainValEl.textContent = v.toFixed(1) + 'x';
  });

  animate(0);
}

function hideAll() {
  coreGroup.visible = false;
  particleSystem.visible = false;
  ribbonMesh.visible = false;
  crystalGroup.visible = false;
  pulseRings.visible = false;
  helixGroup.visible = false;
  nebulaSystem.visible = false;
}

async function startShow(useMic) {
  document.getElementById('intro-overlay').classList.add('hidden');
  await audioEngine.init(useMic);
  if (useMic) btnMic.classList.add('active');
  else btnDemo.classList.add('active');
  showRunning = true;
  showTime = 0;
  currentSceneIdx = 0;
}

// ── Build Scene Objects ────────────────────────────────────────────────────────

function buildStarField() {
  const count = 800;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 100;
    pos[i*3+1] = (Math.random() - 0.5) * 100;
    pos[i*3+2] = (Math.random() - 0.5) * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starField = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x334466, size: 0.12, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending
  }));
  scene.add(starField);
}

function buildPolygonCore() {
  coreGroup = new THREE.Group();

  const outerGeo = new THREE.IcosahedronGeometry(3.0, 1);
  coreOuterMat = new THREE.MeshPhongMaterial({
    color: 0x102040, emissive: 0x040810, flatShading: true,
    transparent: true, opacity: 0, shininess: 40
  });
  const outer = new THREE.Mesh(outerGeo, coreOuterMat);
  outer.name = 'outer';
  coreGroup.add(outer);

  const innerGeo = new THREE.OctahedronGeometry(1.5, 0);
  coreInnerMat = new THREE.MeshStandardMaterial({
    color: 0x00aacc, emissive: 0x003344, flatShading: true,
    transparent: true, opacity: 0, metalness: 0.6, roughness: 0.2
  });
  const inner = new THREE.Mesh(innerGeo, coreInnerMat);
  inner.name = 'inner';
  coreGroup.add(inner);

  const ringGeo = new THREE.TorusGeometry(4.2, 0.06, 4, 32);
  ringMat = new THREE.MeshBasicMaterial({
    color: 0x2255aa, wireframe: true, transparent: true, opacity: 0
  });
  coreGroup.add(new THREE.Mesh(ringGeo, ringMat));

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(5.0, 0.04, 4, 32),
    new THREE.MeshBasicMaterial({ color: 0x113366, wireframe: true, transparent: true, opacity: 0 })
  );
  ring2.name = 'ring2';
  ring2.rotation.x = Math.PI / 2;
  coreGroup.add(ring2);

  scene.add(coreGroup);
}

function buildParticleSwarm() {
  const count = 2000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 3 + Math.random() * 8;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    vel[i*3]   = (Math.random() - 0.5) * 0.02;
    vel[i*3+1] = (Math.random() - 0.5) * 0.02;
    vel[i*3+2] = (Math.random() - 0.5) * 0.02;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));

  particleSystem = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x00ccff, size: 0.1, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending
  }));
  scene.add(particleSystem);
}

function buildRibbonField() {
  const geo = new THREE.PlaneGeometry(16, 16, 48, 48);
  const posAttr = geo.attributes.position;
  const origY = new Float32Array(posAttr.count);
  for (let i = 0; i < posAttr.count; i++) origY[i] = posAttr.getY(i);
  geo.setAttribute('origY', new THREE.BufferAttribute(origY, 1));

  ribbonMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    color: 0x0a1e40, emissive: 0x020810, wireframe: true,
    flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0
  }));
  ribbonMesh.rotation.x = -Math.PI / 2.8;
  ribbonMesh.position.y = -3;
  scene.add(ribbonMesh);
}

function buildCrystalLattice() {
  crystalGroup = new THREE.Group();
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const cubeMat = new THREE.MeshPhongMaterial({
    color: 0x224488, emissive: 0x081020, flatShading: true,
    transparent: true, opacity: 0
  });

  const gridSize = 4;
  const spacing = 2.8;
  for (let x = -gridSize; x <= gridSize; x++) {
    for (let y = -gridSize; y <= gridSize; y++) {
      for (let z = -gridSize; z <= gridSize; z++) {
        // Only place cubes on the shell (surface of the cube lattice)
        if (Math.abs(x) === gridSize || Math.abs(y) === gridSize || Math.abs(z) === gridSize) {
          const cube = new THREE.Mesh(cubeGeo, cubeMat.clone());
          cube.position.set(x * spacing, y * spacing, z * spacing);
          cube.userData.home = cube.position.clone();
          crystalGroup.add(cube);
        }
      }
    }
  }
  scene.add(crystalGroup);
}

function buildPulseRings() {
  pulseRings = new THREE.Group();
  const ringCount = 8;
  for (let i = 0; i < ringCount; i++) {
    const r = 2 + i * 1.8;
    const geo = new THREE.TorusGeometry(r, 0.04, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00aaff, wireframe: false, transparent: true, opacity: 0
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.userData.baseRadius = r;
    ring.userData.idx = i;
    pulseRings.add(ring);
  }
  scene.add(pulseRings);
}

function buildHelix() {
  helixGroup = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.15, 6, 6);

  const strandCount = 2;
  const nodesPerStrand = 60;
  for (let s = 0; s < strandCount; s++) {
    const strand = new THREE.Group();
    strand.name = `strand${s}`;
    const phaseOffset = s * Math.PI;
    for (let i = 0; i < nodesPerStrand; i++) {
      const t = (i / nodesPerStrand) * Math.PI * 4; // 2 full twists
      const y = (i / nodesPerStrand - 0.5) * 16;
      const x = Math.cos(t + phaseOffset) * 3;
      const z = Math.sin(t + phaseOffset) * 3;
      const mat = new THREE.MeshPhongMaterial({
        color: 0x2288cc, emissive: 0x041020, flatShading: true,
        transparent: true, opacity: 0
      });
      const node = new THREE.Mesh(sphereGeo, mat);
      node.position.set(x, y, z);
      node.userData.basePos = node.position.clone();
      node.userData.idx = i;
      strand.add(node);
    }
    helixGroup.add(strand);
  }
  scene.add(helixGroup);
}

function buildNebula() {
  const count = 3000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Gaussian-ish cluster distribution
    const r = Math.pow(Math.random(), 0.5) * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta) * 0.4; // flatten
    pos[i*3+2] = r * Math.cos(phi);
    // Default blue-purple
    col[i*3]   = 0.1 + Math.random() * 0.2;
    col[i*3+1] = 0.05 + Math.random() * 0.1;
    col[i*3+2] = 0.3 + Math.random() * 0.4;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  nebulaSystem = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.12, transparent: true, opacity: 0, vertexColors: true,
    blending: THREE.AdditiveBlending
  }));
  scene.add(nebulaSystem);
}

// ── Show Timeline ──────────────────────────────────────────────────────────────

function getSceneInfo() {
  let elapsed = 0;
  for (let i = 0; i < SCENE_DEFS.length; i++) {
    if (showTime < elapsed + SCENE_DEFS[i].dur) {
      return { idx: i, local: showTime - elapsed, dur: SCENE_DEFS[i].dur, def: SCENE_DEFS[i] };
    }
    elapsed += SCENE_DEFS[i].dur;
  }
  showTime = 0;
  showLoopCount++;
  return { idx: 0, local: 0, dur: SCENE_DEFS[0].dur, def: SCENE_DEFS[0] };
}

function ease(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; }

// Slower fades: 35% of scene for fade-in, last 15% for fade-out
function sceneOpacity(local, dur) {
  const fadeInEnd = dur * 0.35;
  const fadeOutStart = dur * 0.85;
  let op = 1.0;
  if (local < fadeInEnd) op = Math.min(1, local / fadeInEnd);
  if (local > fadeOutStart) op = Math.min(op, 1.0 - (local - fadeOutStart) / (dur - fadeOutStart));
  return Math.max(0, op);
}

// ── Animate ────────────────────────────────────────────────────────────────────

function animate(timestamp) {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  // Audio — full 7-band telemetry
  if (audioEngine && audioEngine.isInitialized) {
    const tel = audioEngine.update();
    if (tel) {
      const lf = 0.18;
      sSubBass += (tel.subBass - sSubBass) * lf;
      sBass    += (tel.bass - sBass) * lf;
      sLowMid  += (tel.lowMid - sLowMid) * lf;
      sMid     += (tel.mid - sMid) * lf;
      sHighMid += (tel.highMid - sHighMid) * lf;
      sHigh    += (tel.high - sHigh) * lf;
      sAir     += (tel.air - sAir) * lf;
      sEnergy  += (tel.overallEnergy - sEnergy) * lf;
      sTransient += (tel.transientAttack - sTransient) * 0.3;
      sBeat = tel.isBeat;
      sPrimaryColor = tel.primaryColor;
      sSecondaryColor = tel.secondaryColor;
      sCentroid = tel.spectralCentroid;
    }
  }

  // HUD
  if (energyEl) energyEl.textContent = sEnergy.toFixed(2);
  if (bassEl) bassEl.textContent = sBass.toFixed(2);

  if (!showRunning) {
    if (starField) starField.rotation.y += dt * 0.03;
    renderer.render(scene, camera);
    return;
  }

  showTime += dt;
  const si = getSceneInfo();
  currentSceneIdx = si.idx;
  sceneLocalTime = si.local;
  const progress = si.local / si.dur;
  const op = sceneOpacity(si.local, si.dur);

  // HUD
  if (sceneNameEl) sceneNameEl.textContent = si.def.name;
  if (sceneLabelEl) sceneLabelEl.textContent = si.def.desc;
  if (progressFill) progressFill.style.width = (progress * 100) + '%';

  // Stars — always, tinted by frequency
  if (starField) {
    starField.rotation.y = t * 0.015 + sBass * 0.08;
    starField.rotation.x = Math.sin(t * 0.04) * 0.06;
    starField.material.opacity = 0.25 + sEnergy * 0.35;
    starField.material.color.copy(getFreqColor()).multiplyScalar(0.4);
    starField.material.color.add(new THREE.Color(0.15, 0.15, 0.2));
  }

  // Tint key and rim lights by frequency
  const keyLight = scene.getObjectByName('keyLight');
  const rimLight = scene.getObjectByName('rimLight');
  if (keyLight) keyLight.color.copy(getFreqColor()).lerp(new THREE.Color(0.7, 0.7, 0.8), 0.5);
  if (rimLight) rimLight.color.copy(getFreqColor2());

  // Start by hiding everything, then each scene enables what it needs
  hideAll();

  // ── SCENE 0 & 9: VOID ──────────────────────────────────────────────────────
  if (si.idx === 0 || si.idx === 9) {
    const isEntry = si.idx === 0;
    const camZ = isEntry
      ? THREE.MathUtils.lerp(24, 14, ease(progress))
      : THREE.MathUtils.lerp(14, 24, ease(progress));
    camera.position.set(0, 0, camZ);
    camera.lookAt(cameraTarget);
    scene.fog.density = isEntry
      ? THREE.MathUtils.lerp(0.06, 0.02, ease(progress))
      : THREE.MathUtils.lerp(0.02, 0.06, ease(progress));
  }

  // ── SCENE 1: POLYGON CORE BIRTH ────────────────────────────────────────────
  else if (si.idx === 1) {
    coreGroup.visible = true;
    coreOuterMat.opacity = op * 0.85;
    coreInnerMat.opacity = op;
    ringMat.opacity = op * 0.6;
    coreGroup.children.forEach(c => { if (c.material && c.material.transparent) c.material.opacity = op * 0.5; });

    // Frequency-reactive colors
    coreOuterMat.color.copy(getFreqColor()).multiplyScalar(0.5);
    coreOuterMat.emissive.copy(getFreqColor()).multiplyScalar(0.15);
    coreInnerMat.color.copy(getFreqColor());
    coreInnerMat.emissive.copy(getFreqColor()).multiplyScalar(0.4);
    coreInnerMat.emissiveIntensity = 1.0 + sEnergy * 3.0;

    // Camera orbits
    const angle = t * 0.2 + sBass * 0.3;
    const camR = 12 - sBass * 2;
    camera.position.set(Math.sin(angle) * camR, 2 + Math.sin(t * 0.3) * 1.5, Math.cos(angle) * camR);
    camera.lookAt(cameraTarget);

    // Bass → big scale. Highs → tremor.
    const outer = coreGroup.getObjectByName('outer');
    if (outer) {
      const s = 1.0 + bassDisplacement(t) * 0.2 + highTremor(t, 1);
      outer.scale.setScalar(s);
      outer.rotation.y = t * 0.3;
      outer.rotation.x = t * 0.15 + sMid * 0.2;
    }
    const inner = coreGroup.getObjectByName('inner');
    if (inner) {
      inner.rotation.y = -t * 0.8;
      inner.rotation.z = t * 0.4;
      const s = 1.0 + sHigh * 0.4 + sTransient * 1.2 + highTremor(t, 5);
      inner.scale.setScalar(s);
    }
    coreGroup.rotation.y = t * 0.1;
  }

  // ── SCENE 2: PARTICLE SWARM ────────────────────────────────────────────────
  else if (si.idx === 2) {
    particleSystem.visible = true;
    particleSystem.material.opacity = op * 0.8;
    particleSystem.material.color.copy(getFreqColor());

    const angle = t * 0.15;
    camera.position.set(Math.sin(angle) * 15, 3 + Math.sin(t * 0.2) * 2, Math.cos(angle) * 15);
    camera.lookAt(cameraTarget);

    const posAttr = particleSystem.geometry.attributes.position;
    const velAttr = particleSystem.geometry.attributes.velocity;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
      const vx = velAttr.getX(i), vy = velAttr.getY(i), vz = velAttr.getZ(i);

      // Bass → large orbital drift, Highs → tight jitter
      x += (vx + Math.sin(t + i * 0.1) * 0.004) * (1.0 + sBass * 3.0) + highTremor(t, i);
      y += (vy + Math.cos(t + i * 0.07) * 0.004) * (1.0 + sEnergy * 2.0) + highTremor(t, i + 100);
      z += (vz + Math.sin(t * 0.5 + i * 0.05) * 0.004) * (1.0 + sMid * 2.0) + highTremor(t, i + 200);

      if (sTransient > 0.1) {
        const dist = Math.sqrt(x*x + y*y + z*z) + 0.001;
        const push = sTransient * 0.2;
        x += (x / dist) * push;
        y += (y / dist) * push;
        z += (z / dist) * push;
      }

      const r = Math.sqrt(x*x + y*y + z*z);
      if (r > 20) { const s = 3 / r; x *= s; y *= s; z *= s; }
      posAttr.setXYZ(i, x, y, z);
    }
    posAttr.needsUpdate = true;
    particleSystem.rotation.y = t * 0.08;
    particleSystem.material.size = 0.07 + sEnergy * 0.15;
  }

  // ── SCENE 3: CRYSTAL LATTICE ───────────────────────────────────────────────
  else if (si.idx === 3) {
    crystalGroup.visible = true;

    const angle = t * 0.1;
    camera.position.set(Math.sin(angle) * 18, 5 + Math.sin(t * 0.12) * 3, Math.cos(angle) * 18);
    camera.lookAt(cameraTarget);

    crystalGroup.rotation.y = t * 0.05 + sBass * 0.1;
    crystalGroup.rotation.x = Math.sin(t * 0.07) * 0.1;

    crystalGroup.children.forEach((cube, i) => {
      cube.material.opacity = op * 0.75;
      cube.material.color.copy(getFreqColor());
      cube.material.emissive.copy(getFreqColor()).multiplyScalar(0.2 + sEnergy * 0.4);

      // Bass → cubes breathe outward from center. Highs → cubes vibrate in place.
      const home = cube.userData.home;
      const dir = home.clone().normalize();
      const breathe = dir.multiplyScalar(bassDisplacement(t) * 0.3);
      const tremor = highTremor(t, i * 7);

      cube.position.set(
        home.x + breathe.x + tremor,
        home.y + breathe.y + tremor,
        home.z + breathe.z + tremor
      );

      cube.rotation.x = t * 0.4 + i * 0.1 + sHigh * 2;
      cube.rotation.y = t * 0.3 + i * 0.05;
      const cubeScale = 0.8 + sMid * 0.5 + sTransient * 0.6;
      cube.scale.setScalar(cubeScale);
    });
  }

  // ── SCENE 4: RIBBON FIELD ──────────────────────────────────────────────────
  else if (si.idx === 4) {
    ribbonMesh.visible = true;
    ribbonMesh.material.opacity = op * 0.7;
    ribbonMesh.material.color.copy(getFreqColor()).multiplyScalar(0.6);
    ribbonMesh.material.emissive.copy(getFreqColor()).multiplyScalar(0.15);

    const angle = t * 0.12 + Math.PI * 0.3;
    camera.position.set(Math.sin(angle) * 10, 8 + Math.sin(t * 0.15) * 3, Math.cos(angle) * 10);
    camera.lookAt(0, -1, 0);

    const posAttr = ribbonMesh.geometry.attributes.position;
    const origYAttr = ribbonMesh.geometry.attributes.origY;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), z = posAttr.getZ(i);
      // Bass = big slow waves, highs = tight vibrations like a drumhead
      const wave1 = Math.sin(x * 0.35 + t * 1.2) * (0.3 + sBass * 4.0 + sSubBass * 2.0);
      const wave2 = Math.cos(z * 0.3 + t * 1.0) * (0.2 + sMid * 3.0);
      const highVib = Math.sin(x * 3.0 + t * 25) * sHigh * 0.3 + Math.sin(z * 4.0 + t * 35) * sAir * 0.15;
      const ripple = Math.sin(Math.sqrt(x*x + z*z) * 0.8 - t * 3.0) * sTransient * 2.5;
      posAttr.setY(i, origYAttr.getX(i) + wave1 + wave2 + highVib + ripple);
    }
    posAttr.needsUpdate = true;
    ribbonMesh.geometry.computeVertexNormals();
  }

  // ── SCENE 5: PULSE RINGS ──────────────────────────────────────────────────
  else if (si.idx === 5) {
    pulseRings.visible = true;

    camera.position.set(0, 0, 14 - sEnergy * 3);
    camera.lookAt(cameraTarget);

    pulseRings.children.forEach((ring, i) => {
      ring.material.opacity = op * (0.8 - i * 0.08);
      ring.material.color.copy(getFreqColor());

      // Each ring responds to a different band
      const bandWeights = [sSubBass, sBass, sLowMid, sMid, sHighMid, sHigh, sAir, sEnergy];
      const bandVal = bandWeights[i % bandWeights.length];

      // Bass rings: big radial pulses. High rings: tight oscillation.
      const isLow = i < 3;
      const baseR = ring.userData.baseRadius;
      const expansion = isLow
        ? baseR + bandVal * 3.0 + sTransient * 2.0
        : baseR + bandVal * 1.0 + highTremor(t, i * 13) * 5;
      ring.scale.setScalar(expansion / baseR);

      ring.rotation.x = Math.sin(t * 0.3 + i * 0.5) * 0.3 + (isLow ? sBass * 0.5 : sHigh * 2.0);
      ring.rotation.y = t * 0.1 * (i % 2 === 0 ? 1 : -1);
    });
  }

  // ── SCENE 6: HELIX ────────────────────────────────────────────────────────
  else if (si.idx === 6) {
    helixGroup.visible = true;

    const angle = t * 0.08;
    camera.position.set(Math.sin(angle) * 12, Math.sin(t * 0.1) * 4, Math.cos(angle) * 12);
    camera.lookAt(0, 0, 0);

    helixGroup.rotation.y = t * 0.15;

    helixGroup.children.forEach((strand, si) => {
      strand.children.forEach((node, ni) => {
        node.material.opacity = op * 0.85;

        // Color gradient along helix: bottom = red (bass), top = purple (highs)
        const gradT = ni / strand.children.length;
        const nodeColor = new THREE.Color().setHSL(gradT * 0.75, 0.9, 0.45 + sEnergy * 0.2);
        node.material.color.copy(nodeColor);
        node.material.emissive.copy(nodeColor).multiplyScalar(0.2 + sEnergy * 0.3);

        // Bass pushes bottom nodes outward, highs vibrate top nodes
        const bp = node.userData.basePos;
        const bassInfluence = (1 - gradT) * bassDisplacement(t) * 0.15;
        const highInfluence = gradT * highTremor(t, ni * 3 + si * 100);

        const dir = new THREE.Vector3(bp.x, 0, bp.z).normalize();
        node.position.set(
          bp.x + dir.x * bassInfluence + highInfluence,
          bp.y + Math.sin(t * 2 + ni * 0.2) * sMid * 0.3,
          bp.z + dir.z * bassInfluence + highInfluence
        );

        const s = 0.8 + sEnergy * 0.5 + (ni === 0 ? sTransient : 0);
        node.scale.setScalar(s);
      });
    });
  }

  // ── SCENE 7: NEBULA ────────────────────────────────────────────────────────
  else if (si.idx === 7) {
    nebulaSystem.visible = true;
    nebulaSystem.material.opacity = op * 0.7;

    const angle = t * 0.06;
    camera.position.set(Math.sin(angle) * 14, 2 + Math.sin(t * 0.08) * 3, Math.cos(angle) * 14);
    camera.lookAt(cameraTarget);

    // Color particles by frequency
    const colAttr = nebulaSystem.geometry.attributes.color;
    const posAttr = nebulaSystem.geometry.attributes.position;
    for (let i = 0; i < colAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
      const dist = Math.sqrt(x*x + y*y + z*z);

      // Inner particles = bass (red), outer = highs (purple)
      const gradT = Math.min(1, dist / 10);
      const h = gradT * 0.75; // 0=red → 0.75=purple
      const s = 0.85;
      const l = 0.3 + sEnergy * 0.3 + (gradT < 0.3 ? sBass * 0.3 : sHigh * 0.2);
      const c = new THREE.Color().setHSL(h, s, l);
      colAttr.setXYZ(i, c.r, c.g, c.b);

      // Bass → inner cloud expands. Highs → outer shell trembles.
      if (dist < 4) {
        const push = bassDisplacement(t) * 0.02;
        const nx = x / (dist + 0.001);
        const ny = y / (dist + 0.001);
        const nz = z / (dist + 0.001);
        posAttr.setXYZ(i, x + nx * push, y + ny * push, z + nz * push);
      } else {
        posAttr.setX(i, x + highTremor(t, i));
        posAttr.setY(i, y + highTremor(t, i + 1000));
      }
    }
    colAttr.needsUpdate = true;
    posAttr.needsUpdate = true;

    nebulaSystem.rotation.y = t * 0.03;
    nebulaSystem.material.size = 0.1 + sEnergy * 0.12;
  }

  // ── SCENE 8: CONVERGENCE ──────────────────────────────────────────────────
  else if (si.idx === 8) {
    coreGroup.visible = true;
    particleSystem.visible = true;
    pulseRings.visible = true;

    coreOuterMat.opacity = op * 0.6;
    coreInnerMat.opacity = op * 0.8;
    ringMat.opacity = op * 0.4;
    particleSystem.material.opacity = op * 0.4;
    particleSystem.material.color.copy(getFreqColor());

    // Grand orbit
    const angle = t * 0.08 + showLoopCount * 0.5;
    const camR = 16 - sEnergy * 4;
    camera.position.set(Math.sin(angle) * camR, 3 + Math.sin(t * 0.12) * 3, Math.cos(angle) * camR);
    camera.lookAt(cameraTarget);

    // Core reacts
    coreOuterMat.color.copy(getFreqColor()).multiplyScalar(0.5);
    coreInnerMat.color.copy(getFreqColor());
    coreInnerMat.emissiveIntensity = 1.0 + sEnergy * 3.0;

    const outer = coreGroup.getObjectByName('outer');
    if (outer) {
      outer.scale.setScalar(1.0 + bassDisplacement(t) * 0.15 + highTremor(t, 1));
      outer.rotation.y = t * 0.25; outer.rotation.x = t * 0.12;
    }
    const inner = coreGroup.getObjectByName('inner');
    if (inner) {
      inner.rotation.y = -t * 0.6;
      inner.scale.setScalar(1.0 + sHigh * 0.5 + sTransient + highTremor(t, 3));
    }
    coreGroup.rotation.y = t * 0.08;

    // Pulse rings in background
    pulseRings.children.forEach((ring, i) => {
      ring.material.opacity = op * 0.3;
      ring.material.color.copy(getFreqColor2());
      ring.rotation.x = Math.sin(t * 0.2 + i) * 0.4;
      ring.rotation.y = t * 0.05;
    });

    particleSystem.rotation.y = t * 0.05;
  }

  // Dynamic background color
  const bgR = 0.004 + sEnergy * 0.015 + sBass * 0.02;
  const bgG = 0.01 + sMid * 0.008;
  const bgB = 0.02 + sHigh * 0.025 + sAir * 0.01;
  scene.background.setRGB(bgR, bgG, bgB);
  scene.fog.color.setRGB(bgR, bgG, bgB);

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKey(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    const si = getSceneInfo();
    showTime += (si.dur - si.local) + 0.01;
  }
  if (e.code === 'KeyF') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }
}

window.addEventListener('DOMContentLoaded', init);
