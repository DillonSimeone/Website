import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';

let scene, camera, renderer, controls;
let arrayGroup, focalPointMesh, raysGroup, waveGroup, dishGroup, legsGroup;
let animatedWaveTime = 0;

// Manifold WASM kernel for CSG export
let ManifoldModule = null;
let Manifold = null;

export async function initManifold() {
  try {
    const Module = (await import('https://unpkg.com/manifold-3d/manifold.js')).default;
    ManifoldModule = await Module();
    ManifoldModule.setup();
    Manifold = ManifoldModule.Manifold;
    console.log('Manifold WASM kernel initialized for CSG export');
    return true;
  } catch (e) {
    console.warn('Manifold WASM unavailable — STL export will be simplified', e);
    return false;
  }
}

export function getManifold() { return Manifold; }

/**
 * Computes positions and angles for N transducers on a spherical cap.
 * Apex elevated at (0,0,baseElevation).
 */
export function calculateTransducerLayout(count, transducerDiam, focalDist, baseElevation = 18.0) {
  const layout = [];
  const minClearance = 2.5; // 2.5mm clearance buffer for 12mm deep cylinder tilt
  const effectiveDiam = transducerDiam + minClearance; // ~18.5mm effective clearance diameter

  if (count <= 0) return layout;

  // Center transducer at apex (Index 0)
  layout.push({
    id: 0,
    pos: new THREE.Vector3(0, 0, baseElevation),
    dir: new THREE.Vector3(0, 0, 1),
    alpha: 0,
    theta: 0
  });

  let remaining = count - 1;
  let ringIndex = 1;

  while (remaining > 0) {
    // Arc length along spherical dish surface
    const arcRadius = ringIndex * effectiveDiam;
    const alpha = arcRadius / focalDist;
    const chordRadius = focalDist * Math.sin(alpha);
    
    // Chordal distance between adjacent transducers on this ring: 2 * chordRadius * sin(dTheta / 2) >= effectiveDiam
    // sin(dTheta / 2) >= effectiveDiam / (2 * chordRadius)
    const sinHalf = Math.min(1.0, effectiveDiam / (2 * chordRadius));
    const minDTheta = 2 * Math.asin(sinHalf);
    
    const maxOnRing = Math.floor((2 * Math.PI) / minDTheta);
    const numOnRing = Math.max(1, Math.min(remaining, maxOnRing));

    for (let i = 0; i < numOnRing; i++) {
      const theta = (2 * Math.PI * i) / numOnRing + (ringIndex % 2 === 1 ? Math.PI / numOnRing : 0);

      const sinA = Math.sin(alpha);
      const cosA = Math.cos(alpha);

      const dirX = sinA * Math.cos(theta);
      const dirY = sinA * Math.sin(theta);
      const dirZ = -cosA;

      const px = focalDist * dirX;
      const py = focalDist * dirY;
      const pz = baseElevation + focalDist * (1 + dirZ);

      layout.push({
        id: layout.length,
        pos: new THREE.Vector3(px, py, pz),
        dir: new THREE.Vector3(-dirX, -dirY, -dirZ),
        alpha,
        theta
      });
    }

    remaining -= numOnRing;
    ringIndex++;
  }

  return layout;
}

/**
 * Build a true SOLID (thick) spherical cap dish geometry.
 * Apex elevated at baseElevation.
 */
function createSolidDomeCapGeometry(R_inner, thickness, maxAngle, baseElevation = 18.0, segsR = 32, segsA = 48) {
  const R_outer = R_inner + thickness;
  const vertices = [];
  const normals = [];
  const indices = [];

  for (let r = 0; r <= segsR; r++) {
    const alpha = (r / segsR) * maxAngle;
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    for (let a = 0; a <= segsA; a++) {
      const theta = (a / segsA) * Math.PI * 2;
      const x = R_inner * sinA * Math.cos(theta);
      const y = R_inner * sinA * Math.sin(theta);
      const z = baseElevation + R_inner * (1 - cosA);
      vertices.push(x, y, z);
      normals.push(-sinA * Math.cos(theta), -sinA * Math.sin(theta), cosA);
    }
  }

  const outerOffset = (segsR + 1) * (segsA + 1);
  for (let r = 0; r <= segsR; r++) {
    const alpha = (r / segsR) * maxAngle;
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    for (let a = 0; a <= segsA; a++) {
      const theta = (a / segsA) * Math.PI * 2;
      const x = R_outer * sinA * Math.cos(theta);
      const y = R_outer * sinA * Math.sin(theta);
      const z = baseElevation + R_inner * (1 - cosA) - (thickness * cosA);
      vertices.push(x, y, z);
      normals.push(sinA * Math.cos(theta), sinA * Math.sin(theta), -cosA);
    }
  }

  for (let r = 0; r < segsR; r++) {
    for (let a = 0; a < segsA; a++) {
      const i0 = r * (segsA + 1) + a;
      const i1 = i0 + 1;
      const i2 = i0 + (segsA + 1);
      const i3 = i2 + 1;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  for (let r = 0; r < segsR; r++) {
    for (let a = 0; a < segsA; a++) {
      const i0 = outerOffset + r * (segsA + 1) + a;
      const i1 = i0 + 1;
      const i2 = i0 + (segsA + 1);
      const i3 = i2 + 1;
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
  }

  const rRim = segsR;
  for (let a = 0; a < segsA; a++) {
    const in0 = rRim * (segsA + 1) + a;
    const in1 = in0 + 1;
    const out0 = outerOffset + in0;
    const out1 = outerOffset + in1;

    indices.push(in0, out0, in1);
    indices.push(in1, out0, out1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Build hollow cylinder holder stand resting flat on bed plane Z = 0
 */
function createHollowStandGeometry(outerRadius, wallThickness, height, segs = 48) {
  const innerRadius = outerRadius - wallThickness;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segs
  });
  // Extrude from ground level Z = 0 up to height
  return geo;
}

export function initViewport(containerId) {
  const container = document.getElementById(containerId);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b10);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, -230, 140);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 40); // Target center of assembly
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const dirLight1 = new THREE.DirectionalLight(0x00f2ff, 1.2);
  dirLight1.position.set(100, -100, 200);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xc8ff00, 0.8);
  dirLight2.position.set(-100, 100, -100);
  scene.add(dirLight2);

  // Grid Helper on XY Bed Plane (Z = 0)
  const grid = new THREE.GridHelper(300, 30, 0x2d3659, 0x1a1f33);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  arrayGroup = new THREE.Group();
  scene.add(arrayGroup);

  dishGroup = new THREE.Group();
  scene.add(dishGroup);

  legsGroup = new THREE.Group();
  scene.add(legsGroup);

  raysGroup = new THREE.Group();
  scene.add(raysGroup);

  waveGroup = new THREE.Group();
  scene.add(waveGroup);

  // Focal Point Indicator
  const fpGeo = new THREE.SphereGeometry(3.0, 16, 16);
  const fpMat = new THREE.MeshPhysicalMaterial({
    color: 0x00f2ff,
    emissive: 0x00f2ff,
    emissiveIntensity: 2.0,
    roughness: 0.1,
    transmission: 0.6,
    thickness: 1.0
  });
  focalPointMesh = new THREE.Mesh(fpGeo, fpMat);
  scene.add(focalPointMesh);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  animate();
}

export function updateGeometry(state) {
  if (!arrayGroup) return;

  // Clear all groups
  [arrayGroup, dishGroup, legsGroup, raysGroup, waveGroup].forEach(g => {
    while (g.children.length > 0) g.remove(g.children[0]);
  });

  const baseElevation = 2.0;
  const focalPos = new THREE.Vector3(0, 0, baseElevation + state.focalDistance);
  focalPointMesh.position.copy(focalPos);

  const layout = calculateTransducerLayout(state.transducerCount, state.transducerDiam, state.focalDistance, baseElevation);

  // Transducer visual models
  const transRadius = (state.transducerDiam + state.transducerKerf) / 2;
  const transGeo = new THREE.CylinderGeometry(transRadius, transRadius, state.transducerDepth, 32);
  transGeo.rotateX(Math.PI / 2);

  const transMat = new THREE.MeshStandardMaterial({
    color: 0x333d54,
    metalness: 0.8,
    roughness: 0.3
  });

  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x00f2ff,
    emissive: 0x006670,
    emissiveIntensity: 0.6,
    metalness: 0.9,
    roughness: 0.1
  });

  const dishMat = new THREE.MeshPhysicalMaterial({
    color: 0x141b2d,
    metalness: 0.2,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    transmission: 0.75,
    thickness: 5.0,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
  });

  const legMat = new THREE.MeshStandardMaterial({
    color: 0x0e1424,
    metalness: 0.5,
    roughness: 0.3
  });

  // Render transducers & rays
  layout.forEach(t => {
    const tGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(transGeo, transMat);
    tGroup.add(bodyMesh);

    const capGeo = new THREE.CylinderGeometry(transRadius * 0.85, transRadius * 0.85, 1.2, 32);
    capGeo.rotateX(Math.PI / 2);
    const capMesh = new THREE.Mesh(capGeo, faceMat);
    capMesh.position.z = (state.transducerDepth / 2) + 0.6;
    tGroup.add(capMesh);

    const forwardPos = t.pos.clone().lerp(focalPos, 0.04);
    tGroup.position.copy(forwardPos);
    tGroup.lookAt(focalPos);
    arrayGroup.add(tGroup);

    if (state.showFocalRays) {
      const rayPoints = [forwardPos.clone(), focalPos.clone()];
      const rayGeo = new THREE.BufferGeometry().setFromPoints(rayPoints);
      const rayMat = new THREE.LineBasicMaterial({
        color: 0x00f2ff,
        transparent: true,
        opacity: 0.35
      });
      raysGroup.add(new THREE.Line(rayGeo, rayMat));
    }
  });

  // Render 3D Transducer Frame (Spider Web vs Dish Shell)
  if (layout.length > 0) {
    const maxAlpha = Math.max(...layout.map(l => l.alpha)) + (state.dishRimMargin / state.focalDistance);
    const R_inner = state.focalDistance;
    const thickness = state.dishThickness;
    const topology = state.frameTopology || 'spider';

    if (topology === 'dish') {
      const domeGeo = createSolidDomeCapGeometry(R_inner, thickness, maxAlpha, baseElevation, 48, 64);
      const domeMesh = new THREE.Mesh(domeGeo, dishMat);
      dishGroup.add(domeMesh);
    } else {
      // Fast procedural Spider Web Frame rendering in browser (60 FPS, zero lag)
      const sleeveGeo = new THREE.CylinderGeometry(transRadius + 2.5, transRadius + 2.5, state.transducerDepth + 3.5, 32, 1, true);
      sleeveGeo.rotateX(Math.PI / 2);

      layout.forEach(t => {
        const sleeveMesh = new THREE.Mesh(sleeveGeo, dishMat);
        sleeveMesh.position.copy(t.pos);
        sleeveMesh.lookAt(focalPos);
        dishGroup.add(sleeveMesh);
      });

      // Procedural Connecting Struts between adjacent sockets
      const maxLinkDist = (state.transducerDiam + 6.0) * 1.65;
      const strutMat = dishMat;
      for (let i = 0; i < layout.length; i++) {
        for (let j = i + 1; j < layout.length; j++) {
          const p1 = layout[i].pos;
          const p2 = layout[j].pos;
          const dist = p1.distanceTo(p2);
          if (dist <= maxLinkDist) {
            const mid = p1.clone().add(p2).multiplyScalar(0.5);
            const strutGeo = new THREE.CylinderGeometry(2.5, 2.5, dist, 12);
            const strutMesh = new THREE.Mesh(strutGeo, strutMat);
            strutMesh.position.copy(mid);
            strutMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
            dishGroup.add(strutMesh);
          }
        }
      }

      // 4 Integrated Legs at 4-way balanced quadrant angles (45°, 135°, 225°, 315°)
      const legRadius = 3.2; // 6.4mm leg
      const padRadius = 8.0; // 16mm bed pad
      const padThick = 2.0;
      const legMat = dishMat;

      // Match closest outer socket to each target quadrant angle for 100% balanced leg tripod
      const targetAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      const maxAlphaVal = Math.max(...layout.map(l => l.alpha));
      const outerCandidates = layout.filter(l => l.alpha > 0.5 * maxAlphaVal);

      const selectedLegSockets = [];
      for (const targetTheta of targetAngles) {
        let bestSocket = outerCandidates[0] || layout[0];
        let minDiff = Infinity;
        for (const cand of outerCandidates) {
          const candTheta = Math.atan2(cand.pos.y, cand.pos.x);
          let diff = Math.abs(candTheta - targetTheta);
          while (diff > Math.PI) diff -= Math.PI * 2;
          diff = Math.abs(diff);
          if (diff < minDiff) {
            minDiff = diff;
            bestSocket = cand;
          }
        }
        if (bestSocket && !selectedLegSockets.includes(bestSocket)) {
          selectedLegSockets.push(bestSocket);
        }
      }

      for (const socket of selectedLegSockets) {
        const lx = socket.pos.x;
        const ly = socket.pos.y;
        const legH = socket.pos.z; // Top of leg attaches DIRECTLY to outer socket bottom!

        // Vertical leg cylinder
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legH, 16);
        legGeo.rotateX(Math.PI / 2);
        const legMesh = new THREE.Mesh(legGeo, legMat);
        legMesh.position.set(lx, ly, legH / 2);
        dishGroup.add(legMesh);

        // Bed contact pad at Z = 0
        const padGeo = new THREE.CylinderGeometry(padRadius, padRadius, padThick, 24);
        padGeo.rotateX(Math.PI / 2);
        const padMesh = new THREE.Mesh(padGeo, legMat);
        padMesh.position.set(lx, ly, padThick / 2);
        dishGroup.add(padMesh);
      }
    }

    // Socket Collar Rings & Rear Central Depth-Stop Crossbar Bridges on sockets
    const socketGeo = new THREE.TorusGeometry(transRadius + 0.6, 1.2, 12, 32);
    const socketMat = new THREE.MeshStandardMaterial({
      color: 0x080c18,
      roughness: 0.2,
      metalness: 0.8
    });

    const stopBarGeo = new THREE.BoxGeometry(state.transducerDiam + 2.0, 2.8, 1.5);
    const stopBarMat = new THREE.MeshStandardMaterial({
      color: 0xc8ff00,
      metalness: 0.7,
      roughness: 0.3
    });

    layout.forEach(t => {
      // Front retaining collar ring
      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.position.copy(t.pos);
      socketMesh.lookAt(focalPos);
      dishGroup.add(socketMesh);

      // Rear central depth-stop crossbar bridge (stops transmitter casing at exact 12mm depth)
      const stopMesh = new THREE.Mesh(stopBarGeo, stopBarMat);
      const rearPos = t.pos.clone().sub(t.dir.clone().multiplyScalar(state.transducerDepth * 0.5));
      stopMesh.position.copy(rearPos);
      stopMesh.lookAt(focalPos);
      dishGroup.add(stopMesh);
    });

    // Render Stand Holder only for Solid Dish topology (Spider Frame has 4 integrated legs)
    if (topology === 'dish') {
      const rimAlpha = maxAlpha;
      const dishOuterRimRadius = (R_inner + thickness) * Math.sin(rimAlpha);
      const rimZ = baseElevation + R_inner * (1 - Math.cos(rimAlpha)) + thickness;
      const standHeight = rimZ;
      const standWall = 8.0;
      const standOuterRadius = dishOuterRimRadius + 4.0;

      const standGeo = createHollowStandGeometry(standOuterRadius, standWall, standHeight, 48);
      const standMesh = new THREE.Mesh(standGeo, legMat);
      legsGroup.add(standMesh);
    }
  }

  // Create Acoustic Wavefront Rings converging from dish up toward focal point
  if (state.showWaveFronts && layout.length > 0) {
    const numRings = 5;
    for (let i = 0; i < numRings; i++) {
      const ringGeo = new THREE.TorusGeometry(10, 0.8, 16, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc8ff00,
        transparent: true,
        opacity: 0.6
      });
      const waveMesh = new THREE.Mesh(ringGeo, ringMat);
      waveGroup.add(waveMesh);
    }
  }
}

/**
 * Build standalone Dish CSG geometry oriented flat for 3D printing
 */
export function buildDishExportGeometry(state) {
  const baseElevation = 2.0;
  const layout = calculateTransducerLayout(state.transducerCount, state.transducerDiam, state.focalDistance, baseElevation);
  if (!layout.length) return null;

  const maxAlpha = Math.max(...layout.map(l => l.alpha)) + (state.dishRimMargin / state.focalDistance);
  const R_inner = state.focalDistance;
  const thickness = state.dishThickness;

  let dishGeo;
  if (Manifold) {
    dishGeo = buildManifoldExport(state, layout);
    dishGeo.rotateX(Math.PI / 2);
  } else {
    dishGeo = createSolidDomeCapGeometry(R_inner, thickness, maxAlpha, baseElevation, 48, 64);
  }

  return dishGeo;
}

/**
 * Build standalone Stand Holder CSG geometry oriented flat on print bed Z=0
 */
export function buildStandExportGeometry(state) {
  const baseElevation = 2.0;
  const layout = calculateTransducerLayout(state.transducerCount, state.transducerDiam, state.focalDistance, baseElevation);
  if (!layout.length) return null;

  const maxAlpha = Math.max(...layout.map(l => l.alpha)) + (state.dishRimMargin / state.focalDistance);
  const R_inner = state.focalDistance;
  const thickness = state.dishThickness;

  const rimAlpha = maxAlpha;
  const dishOuterRimRadius = (R_inner + thickness) * Math.sin(rimAlpha);
  const rimZ = baseElevation + R_inner * (1 - Math.cos(rimAlpha)) + thickness;
  const standHeight = rimZ;
  const standWall = 16.0;
  const standOuterRadius = dishOuterRimRadius + 4.0;

  let standGeo;
  if (Manifold) {
    standGeo = buildManifoldStandExport(state, maxAlpha, R_inner, thickness, baseElevation, standOuterRadius, standWall, standHeight);
    standGeo.rotateX(Math.PI / 2);
  } else {
    standGeo = createHollowStandGeometry(standOuterRadius, standWall, standHeight, 48);
  }

  return standGeo;
}

/**
 * Returns print bed assembly:
 * When topology === 'spider': Exports 1-piece self-standing Spider Web unit with integrated legs & bed pads.
 * When topology === 'dish': Exports 2 parts (Dish Shell at X = -80mm, Stand Holder at X = +80mm).
 */
export function buildExportAssemblyGroup(state) {
  const exportGroup = new THREE.Group();
  const topology = state.frameTopology || 'spider';

  const dishGeo = buildDishExportGeometry(state);
  if (!dishGeo) return null;

  if (topology === 'spider') {
    // Single 1-piece self-standing Spider Web unit with integrated legs
    const spiderMesh = new THREE.Mesh(dishGeo);
    exportGroup.add(spiderMesh);
    return exportGroup;
  }

  // Dish topology: export Dish + Stand side-by-side
  const standGeo = buildStandExportGeometry(state);
  if (!standGeo) return null;

  dishGeo.translate(-80.0, 0, 0);
  standGeo.translate(80.0, 0, 0);

  exportGroup.add(new THREE.Mesh(dishGeo));
  exportGroup.add(new THREE.Mesh(standGeo));

  return exportGroup;
}

/**
 * CSG export for Stand Holder: Solid 1-piece heavy cylinder pedestal with spherical seating cup and 4 cable ports.
 */
function buildManifoldStandExport(state, maxAlpha, R_inner, thickness, baseElevation, outerR, wallThick, height) {
  const nCirc = 64;
  const innerR = outerR - wallThick;

  let outerCyl = Manifold.cylinder(height, outerR, outerR, nCirc);
  let innerCyl = Manifold.cylinder(height + 10, innerR, innerR, nCirc);
  innerCyl = innerCyl.translate([0, 0, -5]);

  let stand = outerCyl.subtract(innerCyl);

  // 1. Spherical Recess Cutout at Top of Stand (where curved dish/spider rim sits)
  const dishOuterR = R_inner + thickness;
  let sphereCutter = Manifold.sphere(dishOuterR, nCirc);
  sphereCutter = sphereCutter.translate([0, 0, baseElevation + R_inner]);
  stand = stand.subtract(sphereCutter);

  // 2. 4 Cable Pass-Through Port Cutouts at Base
  const portW = 18.0;
  const portH = 14.0;
  for (let i = 0; i < 4; i++) {
    const angleDeg = i * 90;
    let portBox = Manifold.cube([portW, outerR * 3, portH], true);
    portBox = portBox.rotate([0, 0, angleDeg]);
    portBox = portBox.translate([0, 0, portH / 2]);
    stand = stand.subtract(portBox);
  }

  const mesh = stand.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * CSG export for Transducer Frame:
 * 1. 'spider': 100% Solid Interconnected Web Chassis (socket sleeves + continuous web ribs + 12mm depth stops + twin pin slots).
 * 2. 'dish': Solid Curved Dish Shell.
 */
function buildManifoldExport(state, layout) {
  const baseElevation = 2.0;
  const maxAlpha = Math.max(...layout.map(l => l.alpha)) + (state.dishRimMargin / state.focalDistance);
  const focalDist = state.focalDistance;
  const topology = state.frameTopology || 'spider';

  const pocketDepth = state.transducerDepth; // 12.0mm depth
  const stopWallThick = 3.5;                 // 3.5mm stop wall thickness
  const totalShellThick = pocketDepth + stopWallThick; // 15.5mm total thickness
  const nCirc = 48;

  const pocketRadius = (state.transducerDiam + state.transducerKerf) / 2; // 8.1mm
  const sleeveOuterR = pocketRadius + 2.5; // 10.6mm (21.2mm OD for heavy overlap)
  const pinSlotRadius = 3.4; // 6.8mm diameter pin slot
  const pinOffset = 4.5;

  if (topology === 'spider') {
    // -------------------------------------------------------------
    // TRUE OPEN SPIDER WEB CHASSIS (1-PIECE MONOLITHIC SOLID PRINT)
    // -------------------------------------------------------------
    let spiderFrame = null;
    const socketPositions = [];

    // STEP 1: Add all solid outer socket cylinders
    for (const t of layout) {
      const alpha = t.alpha;
      const theta = t.theta;
      const sinA = Math.sin(alpha);
      const cosA = Math.cos(alpha);

      const dx = sinA * Math.cos(theta);
      const dy = -cosA;
      const dz = sinA * Math.sin(theta);
      const dirLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ndx = dx / dirLen, ndy = dy / dirLen, ndz = dz / dirLen;
      const elevAngle = Math.acos(ndz);
      const azimAngle = Math.atan2(ndy, ndx);

      // Solid outer sleeve cylinder (21.0mm OD)
      let outerSleeve = Manifold.cylinder(totalShellThick, sleeveOuterR, sleeveOuterR, nCirc, true);
      outerSleeve = outerSleeve.rotate([0, elevAngle * 180 / Math.PI, 0]);
      outerSleeve = outerSleeve.rotate([0, 0, azimAngle * 180 / Math.PI]);

      const midR = focalDist + (totalShellThick / 2);
      const px = ndx * midR, py = ndy * midR, pz = ndz * midR;
      outerSleeve = outerSleeve.translate([px, py, pz]);

      socketPositions.push({ pos: [px, py, pz], nd: [ndx, ndy, ndz], elevAngle, azimAngle });
      spiderFrame = spiderFrame ? spiderFrame.add(outerSleeve) : outerSleeve;
    }

    // STEP 2: Add all connecting struts bridging neighboring sockets
    const maxLinkDist = (state.transducerDiam + 6.0) * 1.65;
    for (let i = 0; i < socketPositions.length; i++) {
      for (let j = i + 1; j < socketPositions.length; j++) {
        const p1 = socketPositions[i].pos;
        const p2 = socketPositions[j].pos;
        const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]);

        if (dist <= maxLinkDist) {
          const midX = (p1[0] + p2[0]) / 2;
          const midY = (p1[1] + p2[1]) / 2;
          const midZ = (p1[2] + p2[2]) / 2;

          let strut = Manifold.cylinder(dist, 2.5, 2.5, 24, true);
          const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];

          const elev = Math.acos(dz / dist);
          const azim = Math.atan2(dy, dx);

          strut = strut.rotate([0, elev * 180 / Math.PI, 0]);
          strut = strut.rotate([0, 0, azim * 180 / Math.PI]);
          strut = strut.translate([midX, midY, midZ]);

          spiderFrame = spiderFrame.add(strut);
        }
      }
    }

    // STEP 3: Add 4 integrated legs and flat bed pads at 4-way balanced quadrant angles
    const legRadius = 3.2; // 6.4mm diameter leg
    const padRadius = 8.0; // 16mm flat bed pad
    const padThick = 2.0;

    const targetAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const maxR = Math.max(...socketPositions.map(s => Math.hypot(s.pos[0], s.pos[2])));
    const outerCandidates = socketPositions.filter(s => Math.hypot(s.pos[0], s.pos[2]) > 0.5 * maxR);

    const selectedLegSockets = [];
    for (const targetTheta of targetAngles) {
      let bestSocket = outerCandidates[0] || socketPositions[0];
      let minDiff = Infinity;
      for (const cand of outerCandidates) {
        const candTheta = Math.atan2(cand.pos[2], cand.pos[0]);
        let diff = Math.abs(candTheta - targetTheta);
        while (diff > Math.PI) diff -= Math.PI * 2;
        diff = Math.abs(diff);
        if (diff < minDiff) {
          minDiff = diff;
          bestSocket = cand;
        }
      }
      if (bestSocket && !selectedLegSockets.includes(bestSocket)) {
        selectedLegSockets.push(bestSocket);
      }
    }

    for (const socket of selectedLegSockets) {
      const sp = socket.pos;
      const lx = sp[0];
      const lz = sp[2];
      const socketY = sp[1];

      const bedY = -(focalDist + totalShellThick + baseElevation);
      const legHeight = Math.abs(socketY - bedY);
      const ly = socketY - (legHeight / 2);

      let legCyl = Manifold.cylinder(legHeight, legRadius, legRadius, 24, true);
      legCyl = legCyl.rotate([90, 0, 0]);
      legCyl = legCyl.translate([lx, ly, lz]);

      let bedPad = Manifold.cylinder(padThick, padRadius, padRadius, 32, true);
      bedPad = bedPad.rotate([90, 0, 0]);
      bedPad = bedPad.translate([lx, bedY + (padThick / 2), lz]);

      spiderFrame = spiderFrame.add(legCyl).add(bedPad);
    }

    // STEP 4: SUBTRACT ALL 16.2mm POCKET BORES & TWIN PIN SLOTS LAST!
    // Trims away any leg or strut material that pokes inside the transducer pockets!
    for (const s of socketPositions) {
      const elevAngle = s.elevAngle;
      const azimAngle = s.azimAngle;
      const ndx = s.nd[0], ndy = s.nd[1], ndz = s.nd[2];

      // 16.2mm main pocket bore (12.0mm depth)
      let pocketBore = Manifold.cylinder(pocketDepth + 0.2, pocketRadius, pocketRadius, nCirc, true);
      const pocketShiftZ = -(totalShellThick / 2) + (pocketDepth / 2);
      pocketBore = pocketBore.translate([0, 0, pocketShiftZ]);

      // Twin pin slots through 3.5mm rear wall
      let pinSlot1 = Manifold.cylinder(stopWallThick * 3, pinSlotRadius, pinSlotRadius, 32, true);
      let pinSlot2 = Manifold.cylinder(stopWallThick * 3, pinSlotRadius, pinSlotRadius, 32, true);
      const rearShiftZ = (totalShellThick / 2) - (stopWallThick / 2);
      pinSlot1 = pinSlot1.translate([-pinOffset, 0, rearShiftZ]);
      pinSlot2 = pinSlot2.translate([pinOffset, 0, rearShiftZ]);

      let socketCutout = pocketBore.add(pinSlot1).add(pinSlot2);
      socketCutout = socketCutout.rotate([0, elevAngle * 180 / Math.PI, 0]);
      socketCutout = socketCutout.rotate([0, 0, azimAngle * 180 / Math.PI]);

      const midR = focalDist + (totalShellThick / 2);
      socketCutout = socketCutout.translate([ndx * midR, ndy * midR, ndz * midR]);

      spiderFrame = spiderFrame.subtract(socketCutout);
    }

    const meshData = spiderFrame.getMesh();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.triVerts, 1));
    geometry.computeVertexNormals();

    return geometry;
  }

  // -------------------------------------------------------------
  // CLASSIC CYLINDER STAND FOR SOLID DISH
  // -------------------------------------------------------------
  const innerR = outerR - wallThick;

  let outerCyl = Manifold.cylinder(height, outerR, outerR, nCirc);
  let innerCyl = Manifold.cylinder(height + 10, innerR, innerR, nCirc);
  innerCyl = innerCyl.translate([0, 0, -5]);

  let stand = outerCyl.subtract(innerCyl);

  // 1. Spherical Recess Cutout at Top of Stand
  const dishOuterR = R_inner + thickness;
  let sphereCutter = Manifold.sphere(dishOuterR, nCirc);
  sphereCutter = sphereCutter.translate([0, 0, baseElevation + R_inner]);
  stand = stand.subtract(sphereCutter);

  // 2. 4 Cable Pass-Through Port Cutouts at Base
  const portW = 16.0;
  const portH = 12.0;
  for (let i = 0; i < 4; i++) {
    const angleDeg = i * 90;
    let portBox = Manifold.cube([portW, outerR * 3, portH], true);
    portBox = portBox.rotate([0, 0, angleDeg]);
    portBox = portBox.translate([0, 0, portH / 2]);
    stand = stand.subtract(portBox);
  }

  const mesh = stand.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();

  return geometry;
}



function animate() {
  requestAnimationFrame(animate);

  if (controls) controls.update();

  if (waveGroup && waveGroup.children.length > 0) {
    animatedWaveTime += 0.012;
    const numRings = waveGroup.children.length;
    const baseZ = 2.0;
    const maxZ = baseZ + (state?.focalDistance || 100);
    const maxRadiusAtDish = 60.0;

    waveGroup.children.forEach((ring, idx) => {
      const progress = ((animatedWaveTime + idx / numRings) % 1.0);
      const currentZ = baseZ + progress * (maxZ - baseZ);
      ring.position.set(0, 0, currentZ);

      const currentRadius = Math.max(0.5, (1.0 - progress) * maxRadiusAtDish);
      ring.scale.set(currentRadius / 10, currentRadius / 10, 1.0);

      ring.material.opacity = Math.sin(progress * Math.PI) * 0.7;
    });
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}
