/**
 * NEO_SYNAPSE - 64K Synthetic Biosphere & Neural Evolution
 * 
 * Neural axons, bioluminescent deep-sea organisms, DNA helices, and cellular hiveminds.
 * Pure GLSL raymarching across 5 dynamic acts with spline camera paths.
 */

import * as THREE from 'three';
import { AudioEngine } from '../../shared/audio-engine.js';
import { DemosceneGLSL } from '../../shared/demoscene-glsl.js';
import { TimelineDirector, DemosceneHUD } from '../../shared/demoscene-director.js';

// ── 5-Act Scene & Spline Camera Definitions ──────────────────────────────────
const ACTS = [
  {
    id: 'act1',
    name: 'NEURAL AWAKENING',
    desc: '01 // AXON DENDRITE ELECTRICAL IMPULSE',
    startTime: 0,
    endTime: 25,
    cameraKeyframes: [
      { t: 0,  pos: [0.0, 0.0, -8.0],  target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 65 },
      { t: 8,  pos: [0.6, 0.4, -4.0],  target: [0.0, 0.0, 2.0], roll: 0.3,  fov: 60 },
      { t: 16, pos: [-0.5, -0.3, 0.0], target: [0.0, 0.0, 6.0], roll: -0.2, fov: 55 },
      { t: 25, pos: [0.0, 0.0, 4.0],   target: [0.0, 0.0, 10.0], roll: 0.0, fov: 60 }
    ]
  },
  {
    id: 'act2',
    name: 'THE BIOLUMINESCENT TRENCH',
    desc: '02 // ABYSSAL TRANSLUCENT ORGANISMS',
    startTime: 25,
    endTime: 55,
    cameraKeyframes: [
      { t: 25, pos: [0.0, 3.0, 8.0],   target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 70 },
      { t: 35, pos: [5.0, 1.0, 4.0],   target: [0.0, 0.0, 0.0], roll: 0.2,  fov: 65 },
      { t: 45, pos: [-4.0, -2.0, 2.0], target: [0.0, 0.0, 0.0], roll: -0.3, fov: 60 },
      { t: 55, pos: [0.0, 0.0, 3.0],   target: [0.0, 0.0, -5.0], roll: 0.0, fov: 65 }
    ]
  },
  {
    id: 'act3',
    name: 'DNA SYNTHESIS',
    desc: '03 // DUAL-HELIX INTERIOR ASCENT',
    startTime: 55,
    endTime: 85,
    cameraKeyframes: [
      { t: 55, pos: [0.0, -8.0, 0.0], target: [0.0, 0.0, 0.0],  roll: 0.0,  fov: 75 },
      { t: 65, pos: [0.4, -2.0, 0.0], target: [0.0, 5.0, 0.0],  roll: 1.5,  fov: 70 },
      { t: 75, pos: [-0.3, 4.0, 0.0], target: [0.0, 10.0, 0.0], roll: 3.14, fov: 65 },
      { t: 85, pos: [0.0, 12.0, 0.0], target: [0.0, 20.0, 0.0], roll: 4.71, fov: 80 }
    ]
  },
  {
    id: 'act4',
    name: 'CELLULAR HIVEMIND',
    desc: '04 // PULSING VORONOI TISSUE MATRIX',
    startTime: 85,
    endTime: 110,
    cameraKeyframes: [
      { t: 85,  pos: [0.0, 0.0, 6.0],   target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 70 },
      { t: 92,  pos: [2.5, 1.5, 4.0],   target: [0.0, 0.0, 0.0], roll: 0.4,  fov: 65 },
      { t: 100, pos: [-2.0, -1.0, 2.0], target: [0.0, 0.0, 0.0], roll: -0.3, fov: 60 },
      { t: 110, pos: [0.0, 0.0, 1.0],   target: [0.0, 0.0, -5.0], roll: 0.5, fov: 75 }
    ]
  },
  {
    id: 'act5',
    name: 'DISSOLUTION INTO PHOTONS',
    desc: '05 // ORGANIC STARDUST DISPERSION',
    startTime: 110,
    endTime: 130,
    cameraKeyframes: [
      { t: 110, pos: [0.0, 2.0, 10.0],  target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 55 },
      { t: 118, pos: [-2.0, 1.0, 12.0], target: [0.0, 0.0, 0.0], roll: -0.1, fov: 50 },
      { t: 125, pos: [1.5, -1.0, 14.0], target: [0.0, 0.0, 0.0], roll: 0.1,  fov: 45 },
      { t: 130, pos: [0.0, 0.0, 16.0],  target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 40 }
    ]
  }
];

// ── GLSL Raymarching Fragment Shader ─────────────────────────────────────────
const FRAGMENT_SHADER = `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform int u_actIndex;
  uniform float u_actProgress;
  
  // Camera Uniforms
  uniform vec3 u_camPos;
  uniform vec3 u_camTarget;
  uniform vec3 u_camUp;
  uniform float u_camFov;
  
  // Audio Uniforms
  uniform float u_subBass;
  uniform float u_bass;
  uniform float u_lowMid;
  uniform float u_mid;
  uniform float u_high;
  uniform float u_air;
  uniform float u_energy;
  uniform float u_transient;

  ${DemosceneGLSL}

  // -------------------------------------------------------------
  // SDF SCENE ESTIMATORS (Synthetic Biosphere)
  // -------------------------------------------------------------

  // Act 0: Neural Awakening (Axon Dendrites with Biological Wriggling & Synapse Morphing)
  float mapAct0(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    // Nerve fiber wriggles like living neural tissue
    q = applyWriggle(q, u_time * 0.8, u_subBass * 0.4, u_mid * 0.9, u_air * 1.5);
    
    float zC = q.z;
    pMod1(q.z, 3.2);

    // Central axon nerve tube
    float axon = sdCylinder(q, vec3(0.0, 0.0, 0.22 + u_subBass * 0.15));

    // Branching synaptic nodes morph shape on treble chords
    vec3 nQ = q;
    pModPolar(nQ.xy, 4.0);
    nQ.x -= 0.65;
    
    float synapse = sdMorphGeom(
      nQ,
      0.25,
      0.6 + u_subBass * 2.0, // Vesicle sphere on bass
      0.1 + u_mid * 1.5,
      0.4 + u_high * 3.0,    // Receptor crystal on highs
      0.2
    );

    float d = smin(axon, synapse, 0.28);

    float freq = clamp(fract(zC * 0.2 - u_time * 0.5) + u_high * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(0.0, 1.0, 0.6), vec3(0.1, 0.4, 1.0), freq);
    return d;
  }

  // Act 1: Bioluminescent Trench (Jellyfish with Muscular Contraction & Cilia Flutter)
  float mapAct1(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    pModPolar(q.xz, 6.0);
    q.x -= 1.8;

    // Muscular bell contraction on sub-bass kick
    float contraction = u_subBass * 0.45;
    float bellR = 0.9 + 0.15 * sin(u_time * 2.0);
    vec3 bellP = q - vec3(0.0, 0.5, 0.0);
    bellP.y *= (1.0 + contraction);
    bellP.xz *= (1.0 - contraction * 0.5);

    float bell = sdSphere(bellP, bellR);
    float hollow = sdSphere(bellP + vec3(0.0, 0.2, 0.0), bellR * 0.92);
    float cap = max(bell, -hollow);

    // Tendril strands with high-frequency acoustic wriggle
    vec3 tendrilP = applyWriggle(q, u_time * 1.2, 0.0, u_mid * 0.8, u_air * 2.2);
    float tendril = sdCylinder(tendrilP.xzy - vec3(0.15 * sin(u_time * 2.5 + q.y * 3.0), 0.0, 0.0), vec3(0.0, 0.0, 0.035));

    float d = min(cap, tendril);

    float freq = clamp(length(p) * 0.15 + u_air * 0.5, 0.0, 1.0);
    glowCol = mix(vec3(0.0, 0.85, 1.0), vec3(0.85, 0.0, 1.0), freq);
    return d;
  }

  // Act 2: DNA Synthesis (Dual Helix with Morphing Base-Pairs)
  float mapAct3D(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float twistRate = 0.5 + u_subBass * 0.25;
    q = opTwistY(q, twistRate);

    // Two parallel vertical strands
    float s1 = sdCylinder(q - vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 0.14));
    float s2 = sdCylinder(q - vec3(-1.0, 0.0, 0.0), vec3(0.0, 0.0, 0.14));

    // Base pair crossbars morph shape from rods to diamond nodes on high frequencies
    vec3 bQ = q;
    pMod1(bQ.y, 0.8);
    
    float rungs = sdMorphGeom(
      bQ,
      0.2,
      0.1 + u_subBass * 1.5,
      0.5 + u_mid * 2.0,     // Bar on mids
      0.5 + u_high * 3.0,    // Diamond on highs
      0.2
    );
    rungs = min(rungs, sdBox(bQ, vec3(1.0, 0.05, 0.05)));

    float d = min(min(s1, s2), rungs);

    float freq = clamp(fract(p.y * 0.1) + u_mid * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.1, 0.4), vec3(0.0, 1.0, 0.8), freq);
    return d;
  }

  // Act 3: Cellular Hivemind (Frequency-Driven Voronoi Honeycomb Morphing)
  float mapAct3(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    vec3 cell = pMod3(q, vec3(2.2, 2.2, 2.2));

    // Morph cells: Round bubbles on bass <-> Cubic tissue on mids <-> Hexagonal honeycombs on highs
    float cellUnit = sdMorphGeom(
      q,
      0.75,
      0.5 + u_subBass * 3.0, // Bubble sphere on bass
      0.3 + u_mid * 2.5,     // Square cell on mids
      0.4 + u_high * 3.0,    // Faceted honeycomb on highs
      0.3 + u_air * 2.0      // Hex prism
    );

    float inner = sdSphere(q, 0.5);
    float d = max(cellUnit, -inner);

    float freq = clamp(hash31(cell) * 0.5 + u_high * 0.5, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.6);
    return d;
  }

  // Act 4: Dissolution into Photons (Stardust Halos & Harmonic Flutter)
  float mapAct4(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    q = applyWriggle(q, u_time * 0.5, u_subBass * 0.3, u_mid * 0.5, u_air * 2.0);

    pModPolar(q.xy, 8.0);
    q.x -= 2.5;

    float morphDust = sdMorphGeom(
      q,
      0.45,
      0.4 + u_subBass * 1.5,
      0.1 + u_mid * 1.5,
      0.6 + u_high * 3.0,
      0.3 + u_air * 2.0
    );

    float halo = sdTorus(q, vec2(0.8, 0.04));
    float d = min(morphDust, halo);

    float freq = clamp(length(p) * 0.1 + u_energy * 0.5, 0.0, 1.0);
    glowCol = mix(vec3(0.1, 1.0, 0.9), vec3(1.0, 0.9, 0.4), freq);
    return d;
  }

  // Master Scene Dispatcher with Camera Clearance Sphere
  float map(vec3 p, out vec3 glowCol) {
    float d = 0.0;
    if (u_actIndex == 0) d = mapAct0(p, glowCol);
    else if (u_actIndex == 1) d = mapAct1(p, glowCol);
    else if (u_actIndex == 2) d = mapAct3D(p, glowCol);
    else if (u_actIndex == 3) d = mapAct3(p, glowCol);
    else d = mapAct4(p, glowCol);

    // Carve smooth transparent clearance sphere around camera to prevent near-plane clipping
    return applyCameraClearance(d, p, u_camPos, 0.5, 0.3);
  }

  vec3 calcNormal(vec3 p) {
    vec3 dummy;
    const float eps = 0.002;
    float d = map(p, dummy);
    return normalize(vec3(
      map(p + vec3(eps, 0, 0), dummy) - d,
      map(p + vec3(0, eps, 0), dummy) - d,
      map(p + vec3(0, 0, eps), dummy) - d
    ));
  }

  // -------------------------------------------------------------
  // MAIN RAYMARCH PASS
  // -------------------------------------------------------------
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    // Construct Camera Matrix
    vec3 ro = u_camPos;
    vec3 target = u_camTarget;
    vec3 cw = normalize(target - ro);
    vec3 cu = normalize(cross(cw, u_camUp));
    vec3 cv = cross(cu, cw);

    float fovRad = u_camFov * (PI / 180.0);
    float fovScale = tan(fovRad * 0.5);
    vec3 rd = normalize(uv.x * cu * fovScale + uv.y * cv * fovScale + cw);

    // March with safe near-plane offset
    float t = 0.25;
    float maxDist = 35.0;
    vec3 hitPos = vec3(0.0);
    bool hit = false;
    vec3 accumGlow = vec3(0.0);
    vec3 glowCol = vec3(1.0);

    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      float d = map(p, glowCol);

      float glowFactor = 0.012 / (abs(d) + 0.035);
      accumGlow += glowCol * glowFactor * (0.85 + u_energy * 1.5);

      if (d < 0.002) {
        hit = true;
        hitPos = p;
        break;
      }
      if (t > maxDist) break;
      t += d * 0.85;
    }

    // Bioluminescent Deep Ocean / Neural Void Background
    float plankton = hash21(floor(rd.xy * 200.0 + fract(u_time * 0.03)));
    float sparks = smoothstep(0.95 - u_air * 0.05, 1.0, plankton) * (1.0 + u_high * 2.5);
    
    vec3 deepWater = vec3(0.01, 0.03, 0.05);
    vec3 bioGlow = vec3(0.0, 0.25, 0.3) * (1.0 + u_subBass * 0.5);
    vec3 sky = mix(deepWater, bioGlow, clamp(sin(rd.y * 1.5 + rd.x * 2.0) * 0.5 + 0.5, 0.0, 1.0));
    sky += vec3(0.2, 1.0, 0.8) * sparks * 1.4;

    vec3 col = sky;

    if (hit) {
      vec3 n = calcNormal(hitPos);
      vec3 lightDir = normalize(vec3(1.0, 3.0, -1.5));
      
      float diff = max(0.0, dot(n, lightDir));
      float ao = clamp(map(hitPos + n * 0.1, glowCol) / 0.1, 0.2, 1.0);
      
      vec3 ref = reflect(rd, n);
      float spec = pow(max(0.0, dot(ref, lightDir)), 20.0);

      vec3 baseCol = glowCol * 0.6;
      vec3 surfaceCol = baseCol * (diff * 0.75 + 0.25) * ao + vec3(0.7, 1.0, 0.9) * spec * (0.5 + u_air * 1.5);

      // Organic Bioluminescent Fog
      float fog = 1.0 - exp(-t * 0.04);
      surfaceCol = mix(surfaceCol, sky, fog);

      // Proximity Transparency Fade (smooth x-ray ghosting as objects approach lens)
      float camDist = length(hitPos - ro);
      float nearFade = smoothstep(0.3, 0.9, camDist);
      col = mix(sky + accumGlow * 0.45, surfaceCol, nearFade);
    }

    col += accumGlow * 0.45;

    // Sub-bass Kick Flash
    col += vec3(0.0, 1.0, 0.6) * u_transient * 0.3;

    // Tonemapping & Optical Polish
    col = acesFilmic(col * 1.25);
    col = applyVignette(col, gl_FragCoord.xy / u_resolution.xy, 0.45, 1.4);
    col = applyFilmGrain(col, gl_FragCoord.xy / u_resolution.xy, u_time, 0.035);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Main App Initialization ──────────────────────────────────────────────────
let renderer, scene, camera, mesh, material;
let audioEngine, director, hud;
let clock;

function init() {
  const container = document.getElementById('viewport-container');
  clock = new THREE.Clock();

  audioEngine = new AudioEngine();
  director = new TimelineDirector(ACTS, { loop: true });
  hud = new DemosceneHUD(director, audioEngine, 'NEO_SYNAPSE // 64K SYNTHETIC BIOSPHERE');

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const geometry = new THREE.PlaneGeometry(2, 2);
  material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_actIndex: { value: 0 },
      u_actProgress: { value: 0 },
      u_camPos: { value: new THREE.Vector3(0, 0, -8) },
      u_camTarget: { value: new THREE.Vector3(0, 0, 0) },
      u_camUp: { value: new THREE.Vector3(0, 1, 0) },
      u_camFov: { value: 65.0 },
      u_subBass: { value: 0 },
      u_bass: { value: 0 },
      u_lowMid: { value: 0 },
      u_mid: { value: 0 },
      u_high: { value: 0 },
      u_air: { value: 0 },
      u_energy: { value: 0 },
      u_transient: { value: 0 }
    }
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  audioEngine.startDemoSynth();

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  material.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const audioTelemetry = audioEngine.update();

  const state = director.update(dt, audioTelemetry);
  hud.update(state, audioTelemetry);

  const u = material.uniforms;
  u.u_time.value = state.time;
  u.u_actIndex.value = state.actIndex;
  u.u_actProgress.value = state.actProgress;

  u.u_camPos.value.set(...state.camera.pos);
  u.u_camTarget.value.set(...state.camera.target);
  u.u_camUp.value.set(...state.camera.up);
  u.u_camFov.value = state.camera.fov;

  if (audioTelemetry) {
    u.u_subBass.value = audioTelemetry.subBass;
    u.u_bass.value = audioTelemetry.bass;
    u.u_lowMid.value = audioTelemetry.lowMid;
    u.u_mid.value = audioTelemetry.mid;
    u.u_high.value = audioTelemetry.high;
    u.u_air.value = audioTelemetry.air;
    u.u_energy.value = audioTelemetry.overallEnergy;
    u.u_transient.value = audioTelemetry.transientAttack;
  }

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', init);
