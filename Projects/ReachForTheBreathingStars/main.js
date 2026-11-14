import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

/* =====================================================================
   CONSTANTS
   ===================================================================== */
const G = 9.81;
const FLOOR_Y = -4;
const PRESSURE_DECAY = 15;
const LATENCY_HOP = 25;      // ms per hop from root
const GANGLION_LATENCY = 5;  // ms, local subtree reset
const LATENCY_MAX_ACTUATE = 200; // claws beyond this latency can't actuate
const GRAB_RADIUS = 2.4;
const TICK_MS = 500;         // 2 Hz simulation
const MAX_ORGANS = 140;
const NECRO_COLOR = new THREE.Color(0x1a0f1a);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/* =====================================================================
   ORGAN DEFINITIONS (procedural primitives only)
   ===================================================================== */
const DEFS = {
  core:     { name: 'Core Heart/Thorax', shape: 'sphere', r: 1.3, mass: 15, blood: 0, torque: Infinity, cal: 5,
              color: 0x8c1f2a, emissive: 0x660014, rough: 0.55, metal: 0.05, pressure: 100, noise: 0.05 },
  limb:     { name: 'Chitinous Limb Segment', desc: 'Long reach · moderate torque · cheap blood', shape: 'capsule', r: 0.25, len: 2.5,
              mass: 2, blood: 3, torque: 220, cal: 1, color: 0xcdb98a, emissive: 0x1a1000, rough: 0.35, metal: 0.4,
              scalable: true, noise: 0.015 },
  muscle:   { name: 'Striated Muscle Bundle', desc: 'High force & torque · heavy blood/calorie drain', shape: 'capsule', r: 0.5, len: 1.4,
              mass: 6, blood: 10, torque: 650, cal: 8, color: 0xa3202a, emissive: 0x500010, rough: 0.55, metal: 0.05,
              scalable: true, noise: 0.05 },
  heart:    { name: 'Auxiliary Booster Heart', desc: '+60 pressure to subtree · pulsates', shape: 'sphere', r: 0.55,
              mass: 3, blood: 2, torque: 160, cal: 4, color: 0xc0152b, emissive: 0x80001a, rough: 0.4, metal: 0.05,
              pressure: 60, noise: 0.04 },
  ganglion: { name: 'Ganglion Sub-Brain', desc: 'Resets nerve latency to 5ms for subtree', shape: 'sphere', r: 0.38,
              mass: 1, blood: 2, torque: 100, cal: 3, color: 0xfff2b0, emissive: 0xffd040, rough: 0.3, metal: 0.0,
              noise: 0.03 },
  bone:     { name: 'Calcified Bone Anchor', desc: 'Massive torque resistance · very heavy', shape: 'cyl', r: 0.22, len: 2.2,
              mass: 10, blood: 1, torque: 2500, cal: 0.5, color: 0xd8d4c8, emissive: 0x111111, rough: 0.85, metal: 0.0,
              scalable: true, reinforce: 0.75, noise: 0.02 },
  strut:    { name: 'Chitin Strut', desc: 'Light joint reinforcement', shape: 'cyl', r: 0.1, len: 1.8,
              mass: 2, blood: 0.5, torque: 500, cal: 0.2, color: 0x8a7a55, emissive: 0x100800, rough: 0.4, metal: 0.5,
              scalable: true, reinforce: 0.4, noise: 0.01 },
  claw:     { name: 'Harvester Claw / Mandible', desc: 'Terminal effector · grabs Biomass Nodes', shape: 'cone', r: 0.4, len: 1.2,
              mass: 2, blood: 4, torque: 160, cal: 2, color: 0x5a4636, emissive: 0x200800, rough: 0.3, metal: 0.55,
              scalable: true, claw: true, noise: 0.015 },
};
const PALETTE_ORGANS = ['limb', 'muscle', 'heart', 'ganglion', 'bone', 'strut', 'claw'];

/* =====================================================================
   SCENE / RENDERER
   ===================================================================== */
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070b);
scene.fog = new THREE.Fog(0x07070b, 40, 140);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(14, 7, 18);
const controls = new OrbitControls(camera, canvas);
controls.target.set(4, -1.5, 0);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0x9a8aa8, 0x201015, 0.9));
const sun = new THREE.DirectionalLight(0xffe8d8, 1.4);
sun.position.set(12, 25, 10);
scene.add(sun);
const coreLight = new THREE.PointLight(0xff2040, 25, 18, 1.6);
scene.add(coreLight);

const grid = new THREE.GridHelper(160, 80, 0x5a2434, 0x1c1620);
grid.position.y = FLOOR_Y;
scene.add(grid);
const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(120, 48),
  new THREE.MeshStandardMaterial({ color: 0x0d0a10, roughness: 1 }));
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = FLOOR_Y - 0.01;
scene.add(floorMesh);

/* Range rings on the floor at 5/15/30 m */
for (const d of [5, 15, 30]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(d - 0.05, d + 0.05, 96),
    new THREE.MeshBasicMaterial({ color: 0x6a2a3c, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = FLOOR_Y + 0.01;
  scene.add(ring);
}

/* =====================================================================
   PHYSICS (cannon-es) - used for severed debris
   ===================================================================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
const fleshMat = new CANNON.Material('flesh');
world.addContactMaterial(new CANNON.ContactMaterial(fleshMat, fleshMat, { friction: 0.6, restitution: 0.12 }));
const floorBody = new CANNON.Body({ mass: 0, material: fleshMat, shape: new CANNON.Plane() });
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
floorBody.position.set(0, FLOOR_Y, 0);
world.addBody(floorBody);

/* =====================================================================
   BLEED PARTICLES
   ===================================================================== */
const NP = 1800;
const pPos = new Float32Array(NP * 3).fill(-1000);
const pVel = new Float32Array(NP * 3);
const pLife = new Float32Array(NP);
let pHead = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  color: 0xb0101c, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
particles.frustumCulled = false;
scene.add(particles);

function emit(pos, n, speed = 3) {
  for (let k = 0; k < n; k++) {
    const i = pHead; pHead = (pHead + 1) % NP;
    pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
    pVel[i * 3] = (Math.random() - 0.5) * speed;
    pVel[i * 3 + 1] = Math.random() * speed * 0.8;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    pLife[i] = 1.2 + Math.random() * 1.5;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < NP; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -1000; continue; }
    pVel[i * 3 + 1] -= G * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < FLOOR_Y + 0.03) {
      pPos[i * 3 + 1] = FLOOR_Y + 0.03;
      pVel[i * 3] *= 0.2; pVel[i * 3 + 1] = 0; pVel[i * 3 + 2] *= 0.2;
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

/* =====================================================================
   CREATURE GRAPH
   ===================================================================== */
let nextId = 1;
let organs = [];            // living, attached organs (organs[0] = root)
const linkOrgans = new Set(); // organs whose artery/nerve link needs updating (attached + debris)
const debrisList = [];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function organify(geo, amt, freq = 3) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.sin(x * freq + 1.3) * Math.sin(y * freq * 1.1 + 0.7) * Math.sin(z * freq * 0.9 + 2.1);
    p.setXYZ(i, x + n.getX(i) * k * amt, y + n.getY(i) * k * amt, z + n.getZ(i) * k * amt);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
}

function buildGeometry(def) {
  let geo, half;
  switch (def.shape) {
    case 'capsule': geo = new THREE.CapsuleGeometry(def.r, def.len, 6, 14); half = def.len / 2 + def.r; break;
    case 'sphere':  geo = new THREE.SphereGeometry(def.r, 28, 18); half = def.r; break;
    case 'cyl':     geo = new THREE.CylinderGeometry(def.r, def.r * 1.25, def.len, 16, 4); half = def.len / 2; break;
    case 'cone':    geo = new THREE.CylinderGeometry(def.r * 0.12, def.r, def.len, 16, 4); half = def.len / 2; break;
  }
  organify(geo, def.noise || 0.02);
  return { geo, half };
}

function createOrgan(type) {
  const def = DEFS[type];
  const { geo, half } = buildGeometry(def);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color, roughness: def.rough, metalness: def.metal,
    emissive: def.emissive, emissiveIntensity: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  mesh.position.y = half;
  const extra = [];
  if (def.claw) {   // decorative mandible prongs (share material, hit-testable)
    for (const s of [-1, 1]) {
      const pg = new THREE.CylinderGeometry(0.01, 0.08, 0.9, 8);
      const prong = new THREE.Mesh(pg, mat);
      prong.position.set(s * 0.2, half * 0.85, 0);
      prong.rotation.z = -s * 0.5;
      mesh.add(prong);
      extra.push(prong);
    }
  }
  const o = {
    id: nextId++, type, def, mass: def.mass, baseMass: def.mass,
    bloodSupply: 0, bloodRequired: def.blood, baseBlood: def.blood, pressureGen: def.pressure || 0,
    nerveLatency: 0, structuralLoad: 0, maxTorque: def.torque, baseTorque: def.torque,
    isNecrotic: false, mesh, parent: null, children: [],
    group, half, scl: new THREE.Vector3(1, 1, 1), extra, alive: true,
    sepsis: 0, sepsisNext: 0, necroT: 0, torque: 0, pullTorque: 0, subtreeMass: 0,
    phase: Math.random() * 6.28, quat0: new THREE.Quaternion(), link: null,
    baseColor: new THREE.Color(def.color), center: new THREE.Vector3(), chainLoad: 0,
  };
  mesh.userData.organ = o;
  extra.forEach(m => (m.userData.organ = o));
  return o;
}

function makeLink(o) {
  const g = new THREE.Group();
  const aMat = new THREE.MeshStandardMaterial({ color: 0x9a1020, emissive: 0x60000c, emissiveIntensity: 0.6, roughness: 0.4 });
  const nMat = new THREE.MeshStandardMaterial({ color: 0xe8d070, emissive: 0x806010, emissiveIntensity: 0.7, roughness: 0.4 });
  const artery = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), aMat);
  const nerve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), nMat);
  nerve.position.x = 0.11;
  g.add(artery, nerve);
  g.userData = { aMat, nMat, aBase: aMat.color.clone(), nBase: nMat.color.clone() };
  scene.add(g);
  o.link = g;
  linkOrgans.add(o);
}

function updateLink(o) {
  if (!o.link || !o.parent) return;
  const A = o.parent.mesh.getWorldPosition(tmpV);
  const B = o.mesh.getWorldPosition(tmpV2);
  const dir = B.clone().sub(A);
  const len = Math.max(dir.length(), 0.001);
  o.link.position.copy(A).addScaledVector(dir, 0.5);
  o.link.quaternion.setFromUnitVectors(Y_AXIS, dir.divideScalar(len));
  o.link.scale.set(1, len, 1);
}

function disposeOrganVisual(o) {
  o.mesh.geometry.dispose();
  o.extra.forEach(m => m.geometry.dispose());
  o.mesh.material.dispose();
  if (o.link) {
    scene.remove(o.link);
    o.link.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    o.link.userData.aMat.dispose(); o.link.userData.nMat.dispose();
    o.link = null;
  }
  linkOrgans.delete(o);
}

function subtree(n, out = []) { out.push(n); n.children.forEach(c => subtree(c, out)); return out; }

/* Root */
function createRoot() {
  const root = createOrgan('core');
  root.mass = DEFS.core.mass;
  root.mesh.position.y = 0;   // core sphere is centered on (0,0,0)
  scene.add(root.group);
  organs = [root];
  return root;
}
let root = createRoot();

/* Attach a new organ at a raycast hit, oriented by the surface normal */
function attachOrgan(type, parent, hitPoint, worldNormal) {
  if (organs.length >= MAX_ORGANS) { log('Organ limit reached', 'o'); return null; }
  const o = createOrgan(type);
  const wq = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, worldNormal);
  parent.group.updateWorldMatrix(true, false);
  const lp = parent.group.worldToLocal(hitPoint.clone().addScaledVector(worldNormal, -0.06));
  const pq = parent.group.getWorldQuaternion(new THREE.Quaternion()).invert();
  o.group.position.copy(lp);
  o.group.quaternion.copy(pq.multiply(wq));
  o.quat0.copy(o.group.quaternion);
  parent.group.add(o.group);
  o.parent = parent;
  parent.children.push(o);
  organs.push(o);
  makeLink(o);
  scene.updateMatrixWorld(true);
  updateLink(o);
  log(`Grew ${o.def.name} #${o.id} on #${parent.id}`, 'g');
  tick();
  return o;
}

/* =====================================================================
   HYPERTROPHY / FUSION
   ===================================================================== */
function recalcStats(o) {
  const vol = o.scl.x * o.scl.y * o.scl.z;
  const cross = o.scl.x * o.scl.z;
  o.mass = o.baseMass * vol;
  o.bloodRequired = o.baseBlood * vol;          // thicken => s^2 blood cost, lengthen => s
  o.maxTorque = o.baseTorque * cross;           // cross-section drives joint tolerance
}

function hypertrophy(o, axis, dir = 1, fused = false) {
  if (!o.def.scalable) { log(`${o.def.name} cannot be hypertrophied`, 'o'); return; }
  const f = dir > 0 ? 1.25 : 1 / 1.25;
  const old = o.scl.clone();
  const nu = old.clone();
  if (axis === 'thicken') { nu.x *= f; nu.z *= f; } else { nu.y *= f; }
  if (nu.x > 3.5 || nu.y > 3.5 || nu.x < 0.5 || nu.y < 0.5) { log('Scale limit reached', 'o'); return; }
  o.scl.copy(nu);
  o.mesh.scale.copy(nu);
  o.mesh.position.y = o.half * nu.y;
  // keep children glued to the (now rescaled) surface
  for (const c of o.children) {
    const p = c.group.position;
    const ux = p.x / old.x, uy = (p.y - o.half * old.y) / old.y, uz = p.z / old.z;
    p.set(ux * nu.x, uy * nu.y + o.half * nu.y, uz * nu.z);
  }
  recalcStats(o);
  scene.updateMatrixWorld(true);
  log(`${fused ? 'Fused' : 'Hypertrophied'} ${o.def.name} #${o.id} (${axis}) → x${nu.x.toFixed(2)} y${nu.y.toFixed(2)} z${nu.z.toFixed(2)}, ` +
      `mass ${o.mass.toFixed(1)}, blood ${o.bloodRequired.toFixed(1)}`, 'g');
  tick();
}

/* =====================================================================
   AMPUTATION & JOINT FAILURE (debris physics)
   ===================================================================== */
function unregister(list) {
  for (const n of list) { n.alive = false; }
  organs = organs.filter(o => o.alive);
}

function amputate(o) {
  if (o.type === 'core') { log('Cannot amputate the Core', 'o'); return; }
  scene.updateMatrixWorld(true);
  const list = subtree(o);
  emit(o.group.getWorldPosition(new THREE.Vector3()), 60, 5);
  o.parent.children.splice(o.parent.children.indexOf(o), 1);
  o.parent.group.remove(o.group);
  unregister(list);
  list.forEach(disposeOrganVisual);
  log(`Severed ${o.def.name} #${o.id} and ${list.length - 1} descendants`, 'w');
  tick();
}

function detachToDebris(o, reason) {
  const parent = o.parent;
  parent.children.splice(parent.children.indexOf(o), 1);
  scene.updateMatrixWorld(true);
  scene.attach(o.group);
  o.group.updateMatrixWorld(true);
  if (o.link) { scene.remove(o.link); linkOrgans.delete(o); o.link.userData.hidden = true; o.link.visible = false; }
  o.parent = null;
  const list = subtree(o);
  unregister(list);
  list.forEach(n => { n.isNecrotic = true; n.alive = false; });

  // build compound body (box per organ) with COM correction
  const inv = new THREE.Matrix4().copy(o.group.matrixWorld).invert();
  const parts = [];
  let total = 0; const com = new THREE.Vector3();
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (const n of list) {
    n.mesh.updateWorldMatrix(true, false);
    const rel = new THREE.Matrix4().multiplyMatrices(inv, n.mesh.matrixWorld);
    rel.decompose(pos, q, s);
    const size = new THREE.Vector3(); n.mesh.geometry.boundingBox.getSize(size);
    parts.push({ p: pos.clone(), q: q.clone(),
      he: new CANNON.Vec3(Math.max(size.x * s.x / 2, 0.08), Math.max(size.y * s.y / 2, 0.08), Math.max(size.z * s.z / 2, 0.08)) });
    total += n.mass; com.addScaledVector(pos, n.mass);
  }
  com.divideScalar(Math.max(total, 0.01));
  const wq = o.group.getWorldQuaternion(new THREE.Quaternion());
  const wp = o.group.getWorldPosition(new THREE.Vector3());
  const body = new CANNON.Body({ mass: Math.max(total, 0.5), material: fleshMat, linearDamping: 0.05, angularDamping: 0.2 });
  for (const pt of parts) {
    body.addShape(new CANNON.Box(pt.he), new CANNON.Vec3(pt.p.x - com.x, pt.p.y - com.y, pt.p.z - com.z),
      new CANNON.Quaternion(pt.q.x, pt.q.y, pt.q.z, pt.q.w));
  }
  const wcom = com.clone().applyQuaternion(wq).add(wp);
  body.position.set(wcom.x, wcom.y, wcom.z);
  body.quaternion.set(wq.x, wq.y, wq.z, wq.w);
  body.velocity.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2);
  body.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
  world.addBody(body);
  debrisList.push({ root: o, nodes: list, body, com, bleed: 9, age: 0 });
  list.forEach(n => linkOrgans.add(n)); // keep inner links updating (excluding root's own removed link)
  linkOrgans.delete(o);
  emit(wp, 80, 6);
  log(`JOINT FAILURE: ${o.def.name} #${o.id} snapped (${reason}) with ${list.length - 1} descendants`, 'w');
  while (debrisList.length > 25) disposeDebris(debrisList.shift());
}

function disposeDebris(d) {
  world.removeBody(d.body);
  scene.remove(d.root.group);
  d.nodes.forEach(disposeOrganVisual);
}

/* =====================================================================
   PREY / BIOMASS NODES
   ===================================================================== */
let preyList = [];
let harvested = 0;
const PREY_CFG = [
  { name: 'Carcass α', dist: 5,  angle: 0.35, mass: 30 },
  { name: 'Carcass β', dist: 15, angle: 2.4,  mass: 80 },
  { name: 'Carcass γ', dist: 30, angle: 4.3,  mass: 150 },
];
function spawnPrey() {
  preyList.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  grips.forEach(g => removeTether(g)); grips.length = 0;
  preyList = PREY_CFG.map(c => {
    const r = Math.cbrt(c.mass) * 0.32;
    const geo = new THREE.SphereGeometry(r, 24, 16);
    organify(geo, r * 0.12, 2.2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x7a5a3a, roughness: 0.8, emissive: 0x1a2a0a, emissiveIntensity: 0.6 }));
    mesh.scale.set(1.3, 0.8, 1);
    mesh.position.set(Math.cos(c.angle) * c.dist, FLOOR_Y + r * 0.8, Math.sin(c.angle) * c.dist);
    scene.add(mesh);
    return { ...c, mesh, r, resist: c.mass * 1.2, cal: c.mass * 5, grabbed: false };
  });
}

/* =====================================================================
   SIMULATION TICK (2 Hz) - recursive tree traversal
   ===================================================================== */
const harvest = { active: false };
const grips = [];

function hdist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function simulate(n, inPressure, parentLatency, inGanglion) {
  let out, sub = inGanglion;
  if (n.type === 'core') {
    n.bloodSupply = n.pressureGen; n.nerveLatency = 0; n.isNecrotic = false;
    out = n.pressureGen;
  } else {
    n.bloodSupply = Math.max(0, inPressure - PRESSURE_DECAY - n.sepsis);
    n.isNecrotic = n.bloodSupply < n.bloodRequired;
    n.nerveLatency = inGanglion ? GANGLION_LATENCY : parentLatency + LATENCY_HOP;
    if (n.type === 'ganglion' && !n.isNecrotic) { n.nerveLatency = GANGLION_LATENCY; sub = true; }
    out = n.isNecrotic ? 0 : Math.max(0, n.bloodSupply - n.bloodRequired + n.pressureGen);
  }
  let sepsis = 0;
  for (const c of n.children) {
    simulate(c, out, n.nerveLatency, sub);
    sepsis += (c.isNecrotic ? 8 : 0) + c.sepsisNext * 0.5;   // Sepsis propagates up
  }
  n.sepsisNext = n.type === 'core' ? 0 : Math.min(20, sepsis);
}

function tipPos(c) {
  const q = c.group.getWorldQuaternion(tmpQ);
  const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return c.group.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, c.half * 2 * c.scl.y);
}
function clawReady(c) {
  return c.alive && !c.isNecrotic && c.nerveLatency <= LATENCY_MAX_ACTUATE && c.bloodSupply >= c.bloodRequired;
}
function gripForce(claw) {
  let f = 40;
  for (let a = claw.parent; a && a.type !== 'core'; a = a.parent) {
    if (a.type === 'muscle' && !a.isNecrotic) f += 120 * a.scl.x * a.scl.z;
  }
  return f;
}

let stats = { mass: 0, cal: 0, peakT: 0, peakName: '-', worst: 0, maxLat: 0, minSupply: Infinity };

function tick() {
  scene.updateMatrixWorld(true);

  // 1+2: hemodynamics and nerve conduction
  organs.forEach(o => { o.sepsis = o.sepsisNext; });
  simulate(root, 0, 0, false);

  // centers
  organs.forEach(o => o.mesh.getWorldPosition(o.center));

  // grips validity + force
  for (let i = grips.length - 1; i >= 0; i--) {
    const g = grips[i];
    if (!clawReady(g.claw) || g.prey.dead) {
      log(`Claw #${g.claw.id} lost grip on ${g.prey.name}`, 'o');
      g.prey.grabbed = false; removeTether(g); grips.splice(i, 1);
      continue;
    }
    g.force = gripForce(g.claw);
    g.applied = Math.min(g.force, g.prey.resist);
  }

  // 3: lever torque
  organs.forEach(o => { o.pullTorque = 0; });
  for (const g of grips) {
    const tip = tipPos(g.claw);
    for (let a = g.claw; a && a.type !== 'core'; a = a.parent) {
      a.pullTorque += g.applied * hdist(tip, a.group.getWorldPosition(tmpV));
    }
  }
  stats = { mass: 0, cal: 0, peakT: 0, peakName: '-', worst: 0, maxLat: 0, minSupply: Infinity };
  const active = harvest.active;
  for (const n of organs) {
    stats.mass += n.mass;
    if (!n.isNecrotic) {
      let c = n.def.cal * n.scl.x * n.scl.y * n.scl.z;
      if (active && n.type === 'muscle') c *= 2.5;
      stats.cal += c;
    }
    if (n.type === 'core') continue;
    stats.maxLat = Math.max(stats.maxLat, n.nerveLatency);
    stats.minSupply = Math.min(stats.minSupply, n.bloodSupply);
    const joint = n.group.getWorldPosition(new THREE.Vector3());
    let m = 0, T = 0;
    for (const d of subtree(n)) { m += d.mass; T += d.mass * G * hdist(d.center, joint); }
    n.subtreeMass = m; n.torque = T;
    let eff = n.maxTorque * (n.isNecrotic ? 0.5 : 1);
    for (const c of n.children) if (c.def.reinforce && !c.isNecrotic) eff += c.maxTorque * c.def.reinforce;
    n.effMax = eff;
    const total = T + n.pullTorque;
    n.structuralLoad = total / eff;
    if (total > stats.peakT) { stats.peakT = total; stats.peakName = `${n.type}#${n.id}`; }
    stats.worst = Math.max(stats.worst, n.structuralLoad);
  }

  // joint failure check (shallowest first)
  let failed = false;
  const check = (n) => {
    if (!n.alive) return;
    if (n.type !== 'core' && n.structuralLoad > 1) {
      detachToDebris(n, `${(n.torque + n.pullTorque).toFixed(0)} N·m > ${n.effMax.toFixed(0)}`);
      failed = true; return;
    }
    [...n.children].forEach(check);
  };
  check(root);
  if (failed) { grips.forEach(g => { if (!g.claw.alive) g.prey.grabbed = false; }); tickFollowup(); }

  updateHUD();
}
function tickFollowup() {
  organs = organs.filter(o => o.alive);
  // recompute totals so HUD is consistent right after a snap
  scene.updateMatrixWorld(true);
  stats.mass = organs.reduce((s, o) => s + o.mass, 0);
}

/* =====================================================================
   HARVEST ACTUATION
   ===================================================================== */
const tetherGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
const tetherMat = new THREE.MeshStandardMaterial({ color: 0xe0b0b0, emissive: 0x802030, emissiveIntensity: 0.6 });
function removeTether(g) { if (g.tether) { scene.remove(g.tether); g.tether = null; } }

function harvestStep(dt) {
  if (!harvest.active) return;
  const claws = organs.filter(o => o.def.claw && clawReady(o));
  for (const prey of preyList) {
    if (prey.grabbed || prey.dead) continue;
    for (const c of claws) {
      if (grips.some(g => g.claw === c)) continue;
      if (tipPos(c).distanceTo(prey.mesh.position) < GRAB_RADIUS + prey.r) {
        const g = { claw: c, prey, force: gripForce(c), applied: 0, tether: null };
        g.applied = Math.min(g.force, prey.resist);
        g.tether = new THREE.Mesh(tetherGeo, tetherMat); scene.add(g.tether);
        grips.push(g); prey.grabbed = true;
        log(`Claw #${c.id} gripped ${prey.name} (${prey.mass}kg)`, 'g');
        tick();
        break;
      }
    }
  }
  for (let i = grips.length - 1; i >= 0; i--) {
    const g = grips[i];
    const ratio = g.force / g.prey.resist;
    g.stalled = ratio < 1;
    const speed = g.stalled ? 0 : Math.min(4, 0.3 + 2.5 * (ratio - 1)) / (1 + g.claw.nerveLatency / 150);
    const p = g.prey.mesh.position;
    const d = Math.hypot(p.x, p.z);
    if (d > 0.001) { const step = Math.min(speed * dt, d); p.x -= (p.x / d) * step; p.z -= (p.z / d) * step; }
    // tether core -> prey
    const a = root.group.position, b = p;
    const dir = tmpV.copy(b).sub(a); const len = dir.length();
    g.tether.position.copy(a).addScaledVector(dir, 0.5);
    g.tether.quaternion.setFromUnitVectors(Y_AXIS, dir.divideScalar(Math.max(len, 0.001)));
    g.tether.scale.set(1, len, 1);
    if (d < DEFS.core.r + 1.6 + g.prey.r) {
      g.prey.dead = true; scene.remove(g.prey.mesh); removeTether(g); grips.splice(i, 1);
      harvested += g.prey.mass;
      log(`HARVESTED ${g.prey.name}: +${g.prey.mass} biomass, +${g.prey.cal} kcal`, 'g');
      emit(root.group.position, 40, 4);
    }
  }
}

/* =====================================================================
   HUD
   ===================================================================== */
const $ = id => document.getElementById(id);
function cls(el, c) { el.className = c || ''; }
function updateHUD() {
  $('tMass').textContent = stats.mass.toFixed(1) + ' kg';
  $('tPress').textContent = '100 mmHg';
  $('tDistal').textContent = stats.minSupply === Infinity ? '–' : stats.minSupply.toFixed(0) + ' mmHg';
  $('tCal').textContent = stats.cal.toFixed(1) + ' kcal/s';
  $('tTorque').textContent = `${stats.peakT.toFixed(0)} N·m (${stats.peakName})`;
  $('tLoad').textContent = (stats.worst * 100).toFixed(0) + '%';
  cls($('tLoad'), stats.worst > 1 ? 'bad' : stats.worst > 0.75 ? 'warn' : '');
  $('tLat').textContent = stats.maxLat.toFixed(0) + ' ms';
  cls($('tLat'), stats.maxLat > LATENCY_MAX_ACTUATE ? 'bad' : stats.maxLat > 120 ? 'warn' : '');
  $('tScore').textContent = harvested + ' kg';

  const w = [];
  for (const o of organs) {
    if (o.isNecrotic) w.push(`<div class="w">☠ NECROSIS ${o.type}#${o.id}: supply ${o.bloodSupply.toFixed(0)} &lt; ${o.bloodRequired.toFixed(1)}</div>`);
  }
  for (const o of organs) {
    if (o.type !== 'core' && !o.isNecrotic && o.sepsis > 0) w.push(`<div class="o">⚠ SEPSIS ${o.type}#${o.id}: −${o.sepsis.toFixed(0)} supply</div>`);
  }
  for (const o of organs) {
    if (o.type !== 'core' && o.structuralLoad > 0.75 && o.structuralLoad <= 1)
      w.push(`<div class="o">⚠ STRAIN ${o.type}#${o.id}: ${(o.structuralLoad * 100).toFixed(0)}% of joint limit</div>`);
  }
  $('warnings').innerHTML = w.slice(0, 12).join('') || '<div class="g">All tissue viable</div>';

  const h = [];
  const claws = organs.filter(o => o.def.claw);
  if (!claws.length) h.push('<div class="m">No Harvester Claw attached</div>');
  for (const c of claws) {
    const chain = []; for (let a = c; a && a.type !== 'core'; a = a.parent) chain.push(a);
    const chainLoad = Math.max(...chain.map(a => a.structuralLoad));
    const okB = c.bloodSupply >= c.bloodRequired && !c.isNecrotic;
    const okL = c.nerveLatency <= LATENCY_MAX_ACTUATE;
    const okT = chainLoad <= 1;
    const mk = ok => ok ? '✓' : '✗';
    h.push(`<div class="${okB && okL && okT ? 'g' : 'w'}">Claw#${c.id} blood ${mk(okB)} ${c.bloodSupply.toFixed(0)} · lat ${mk(okL)} ${c.nerveLatency.toFixed(0)}ms · joints ${mk(okT)} ${(chainLoad * 100).toFixed(0)}%</div>`);
  }
  for (const g of grips) {
    h.push(`<div class="${g.stalled ? 'w' : 'g'}">${g.prey.name}: pull ${g.force.toFixed(0)} vs resist ${g.prey.resist.toFixed(0)} ${g.stalled ? '— STALLED' : '— reeling'}</div>`);
  }
  if (harvest.active && claws.length) {
    let best = Infinity;
    for (const c of claws) if (clawReady(c)) for (const p of preyList) if (!p.dead) best = Math.min(best, tipPos(c).distanceTo(p.mesh.position) - p.r);
    if (best < Infinity && !grips.length) h.push(`<div class="o">Nearest prey is ${best.toFixed(1)}m beyond claw tip (grab ${GRAB_RADIUS}m)</div>`);
  }
  $('harvest').innerHTML = h.join('');
}

const logEl = $('log');
function log(msg, kind = 'm') {
  const d = document.createElement('div'); d.className = kind; d.textContent = msg;
  logEl.prepend(d);
  while (logEl.children.length > 9) logEl.lastChild.remove();
}

/* =====================================================================
   UI: palette + tools
   ===================================================================== */
let tool = 'limb';
const toolsEl = $('tools'), organsEl = $('organs');
const buttons = {};
function addButton(parent, key, title, desc, color) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.innerHTML = `<span class="t">${color ? `<i class="sw" style="background:#${color.toString(16).padStart(6, '0')}"></i>` : ''}${title}</span><span class="d">${desc}</span>`;
  b.onclick = () => selectTool(key);
  parent.appendChild(b); buttons[key] = b;
}
addButton(toolsEl, 'amputate', '[Tool] Amputate / Sever', 'Click an organ to cut it and its subtree');
addButton(toolsEl, 'hyper', '[Tool] Hypertrophy (Scale)', 'Thicken → force · Lengthen → reach & torque');
PALETTE_ORGANS.forEach(k => addButton(organsEl, k, '[Organ] ' + DEFS[k].name, DEFS[k].desc, DEFS[k].color));
function selectTool(k) {
  tool = k;
  Object.entries(buttons).forEach(([key, b]) => b.classList.toggle('active', key === k));
  marker.visible = false;
}

$('btnHarvest').onclick = () => {
  harvest.active = !harvest.active;
  $('btnHarvest').classList.toggle('on', harvest.active);
  $('btnHarvest').textContent = harvest.active ? '■ Stop Actuation' : '▶ Test Actuation / Harvest';
  if (!harvest.active) { grips.forEach(g => { g.prey.grabbed = false; removeTether(g); }); grips.length = 0; }
  log(harvest.active ? 'Actuation started: claws seeking nearest biomass' : 'Actuation stopped', 'm');
  tick();
};
$('btnPrey').onclick = () => { preyList.forEach(p => (p.dead = true)); spawnPrey(); log('Prey respawned at 5m / 15m / 30m', 'm'); tick(); };
$('btnReset').onclick = () => {
  grips.forEach(g => { g.prey.grabbed = false; removeTether(g); }); grips.length = 0;
  const list = subtree(root).slice(1);
  root.children.forEach(c => root.group.remove(c.group));
  root.children = [];
  unregister(list); list.forEach(disposeOrganVisual);
  organs = [root];
  while (debrisList.length) disposeDebris(debrisList.shift());
  log('Creature reset', 'm');
  tick();
};

/* =====================================================================
   RAYCAST PLACEMENT
   ===================================================================== */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.22, 28),
  new THREE.MeshBasicMaterial({ color: 0xff4060, side: THREE.DoubleSide, depthTest: false, transparent: true }));
marker.renderOrder = 10; marker.visible = false; scene.add(marker);

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = [];
  for (const o of organs) { meshes.push(o.mesh); meshes.push(...o.extra); }
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const h = hits[0];
  const normal = h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
  return { organ: h.object.userData.organ, point: h.point.clone(), normal };
}

canvas.addEventListener('pointermove', ev => {
  if (tool === 'amputate' || ev.buttons) { marker.visible = false; return; }
  const h = pick(ev);
  if (!h) { marker.visible = false; return; }
  marker.visible = true;
  marker.position.copy(h.point).addScaledVector(h.normal, 0.03);
  marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.normal);
});
let downPos = null;
canvas.addEventListener('pointerdown', ev => { downPos = { x: ev.clientX, y: ev.clientY, b: ev.button }; });
canvas.addEventListener('pointerup', ev => {
  if (!downPos || downPos.b !== 0) return;
  const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
  downPos = null;
  if (moved > 5) return; // it was an orbit drag
  const h = pick(ev);
  if (!h) return;
  const axis = document.querySelector('input[name=axis]:checked').value;
  if (tool === 'amputate') amputate(h.organ);
  else if (tool === 'hyper') hypertrophy(h.organ, axis, ev.shiftKey ? -1 : 1);
  else if (tool === 'muscle' && h.organ.type === 'muscle' && $('fuseToggle').checked) hypertrophy(h.organ, axis, 1, true);
  else attachOrgan(tool, h.organ, h.point, h.normal);
});

/* =====================================================================
   ANIMATION LOOP
   ===================================================================== */
const clock = new THREE.Clock();
const flexQ = new THREE.Quaternion(), flexE = new THREE.Euler();
const sideA = new THREE.Vector3();

function animateOrgan(o, t, dt, active) {
  // necrosis colour lerp
  o.necroT += ((o.isNecrotic ? 1 : 0) - o.necroT) * Math.min(1, dt * 2);
  const mat = o.mesh.material;
  mat.color.copy(o.baseColor).lerp(NECRO_COLOR, o.necroT);
  const pulse = 0.5 + 0.5 * Math.sin(t * (2 + Math.min(o.bloodSupply, 100) / 25) + o.phase);
  mat.emissiveIntensity = (1 - o.necroT) * (0.15 + 0.5 * pulse) * (o.type === 'ganglion' ? 2.2 : 1);
  if (o.link) {
    const u = o.link.userData;
    u.aMat.color.copy(u.aBase).lerp(NECRO_COLOR, o.necroT);
    u.aMat.emissiveIntensity = (1 - o.necroT) * (0.2 + 0.7 * pulse);
    u.nMat.color.copy(u.nBase).lerp(NECRO_COLOR, o.necroT);
    u.nMat.emissiveIntensity = (1 - o.necroT) * 0.8;
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // actuation flex w/ latency lag + jitter
  for (const o of organs) {
    if (o.type === 'core') continue;
    if (o.isNecrotic) { o.group.quaternion.slerp(o.quat0, 0.1); continue; }
    const lat = o.nerveLatency;
    const amp = harvest.active ? 0.07 : 0.012;
    const lagT = t - lat / 1000 * 3;
    const jit = harvest.active ? lat * 0.00022 : 0;
    flexE.set(amp * Math.sin(lagT * 3 + o.phase) + (Math.random() - 0.5) * jit, 0,
              amp * Math.cos(lagT * 2.4 + o.phase) + (Math.random() - 0.5) * jit);
    flexQ.setFromEuler(flexE);
    o.group.quaternion.copy(o.quat0).multiply(flexQ);
  }
  scene.updateMatrixWorld(true);

  // heart/core pulsing
  const beat = 1 + 0.07 * Math.sin(t * 5);
  root.mesh.scale.setScalar(beat);
  for (const o of organs) if (o.type === 'heart') o.mesh.scale.setScalar(1 + 0.2 * Math.sin(t * 6 + o.phase));
  coreLight.intensity = 20 + 8 * Math.sin(t * 5);

  harvestStep(dt);

  // debris sync
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i];
    d.age += dt;
  }
  world.step(1 / 60, dt, 3);
  for (const d of debrisList) {
    const b = d.body;
    d.root.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    tmpV.copy(d.com).applyQuaternion(d.root.group.quaternion);
    d.root.group.position.set(b.position.x - tmpV.x, b.position.y - tmpV.y, b.position.z - tmpV.z);
    if (d.bleed > 0) {
      d.bleed -= dt;
      emit(d.root.group.position, 2, 2.5);
    }
  }
  scene.updateMatrixWorld(true);

  linkOrgans.forEach(updateLink);
  organs.forEach(o => animateOrgan(o, t, dt, harvest.active));
  debrisList.forEach(d => d.nodes.forEach(o => animateOrgan(o, t, dt, false)));
  updateParticles(dt);

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* =====================================================================
   BOOT
   ===================================================================== */
spawnPrey();
selectTool('limb');
log('Click the Core to grow your first organ. Prey at 5m / 15m / 30m.', 'm');
tick();
setInterval(tick, TICK_MS);   // 2 Hz biological simulation
requestAnimationFrame(frame);
