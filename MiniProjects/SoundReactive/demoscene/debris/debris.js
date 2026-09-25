/**
 * DEBRIS_REDUX - 64K Transcendent Fractal Void
 * 
 * An homage to Farbrausch's demoscene masterpiece "debris".
 * Uses pure GLSL raymarching across 5 dynamic acts with spline camera paths.
 */

import * as THREE from 'three';
import { AudioEngine } from '../../shared/audio-engine.js';
import { DemosceneGLSL } from '../../shared/demoscene-glsl.js';
import { TimelineDirector, DemosceneHUD } from '../../shared/demoscene-director.js';

// ── 5-Act Scene & Spline Camera Definitions ──────────────────────────────────
const ACTS = [
  {
    id: 'act1',
    name: 'MICROSCOPIC GENESIS',
    desc: '01 // MACRO CRYSTAL LATTICE INTERFERENCE',
    startTime: 0,
    endTime: 25,
    cameraKeyframes: [
      { t: 0,  pos: [0.0, 0.0, 4.0],   target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 65 },
      { t: 8,  pos: [0.8, 0.5, 2.5],   target: [0.0, 0.0, 0.0], roll: 0.2,  fov: 60 },
      { t: 16, pos: [-0.6, -0.4, 1.2], target: [0.1, 0.1, 0.0], roll: -0.3, fov: 55 },
      { t: 25, pos: [0.0, 0.0, 0.4],   target: [0.0, 0.0, -1.0], roll: 0.0, fov: 50 }
    ]
  },
  {
    id: 'act2',
    name: 'THE FRACTAL CAVERNS',
    desc: '02 // RECURSIVE MANDELBOX EXPEDITION',
    startTime: 25,
    endTime: 55,
    cameraKeyframes: [
      { t: 25, pos: [0.0, 0.2, -6.0], target: [0.0, 0.0, 0.0],   roll: 0.0,  fov: 70 },
      { t: 35, pos: [2.5, 1.2, -3.0], target: [1.0, 0.5, 2.0],   roll: 0.4,  fov: 65 },
      { t: 45, pos: [-2.0, -1.0, 1.0], target: [-0.5, 0.0, 5.0], roll: -0.3, fov: 60 },
      { t: 55, pos: [0.0, 0.0, 6.0],  target: [0.0, 0.0, 10.0],  roll: 0.1,  fov: 65 }
    ]
  },
  {
    id: 'act3',
    name: 'GEOMETRY STORM',
    desc: '03 // POLYHEDRAL LATTICE FOLDING',
    startTime: 55,
    endTime: 85,
    cameraKeyframes: [
      { t: 55, pos: [0.0, 4.0, 8.0],   target: [0.0, 0.0, 0.0], roll: -0.2, fov: 65 },
      { t: 65, pos: [6.0, 1.0, 4.0],   target: [0.0, 0.0, 0.0], roll: 0.3,  fov: 60 },
      { t: 75, pos: [-5.0, -3.0, 2.0], target: [0.0, 0.0, 0.0], roll: -0.4, fov: 55 },
      { t: 85, pos: [0.0, 0.0, 1.5],   target: [0.0, 0.0, -5.0], roll: 0.5, fov: 70 }
    ]
  },
  {
    id: 'act4',
    name: 'THE SUPERNOVA APEX',
    desc: '04 // VOLUMETRIC PLASMA ACCELERATION',
    startTime: 85,
    endTime: 110,
    cameraKeyframes: [
      { t: 85,  pos: [0.0, 0.0, -12.0], target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 75 },
      { t: 92,  pos: [2.0, 2.0, -6.0],  target: [0.0, 0.0, 2.0], roll: 1.5,  fov: 70 },
      { t: 100, pos: [-1.0, -1.0, -1.0], target: [0.0, 0.0, 5.0], roll: 3.14, fov: 65 },
      { t: 110, pos: [0.0, 0.0, 8.0],   target: [0.0, 0.0, 20.0], roll: 6.28, fov: 80 }
    ]
  },
  {
    id: 'act5',
    name: 'CRYSTALLINE EPILOGUE',
    desc: '05 // DEEP SPACE DRIFT & COOLING',
    startTime: 110,
    endTime: 130,
    cameraKeyframes: [
      { t: 110, pos: [0.0, 1.5, 6.0],   target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 50 },
      { t: 118, pos: [-1.5, 0.8, 8.0],  target: [0.0, 0.0, 0.0], roll: -0.1, fov: 48 },
      { t: 125, pos: [1.2, -0.5, 10.0], target: [0.0, 0.0, 0.0], roll: 0.1,  fov: 45 },
      { t: 130, pos: [0.0, 0.0, 12.0],  target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 42 }
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
  // SDF SCENE ESTIMATORS
  // -------------------------------------------------------------

  // Act 0: Micro Genesis (Topological Shape Morphing & Geode Cleavage)
  float mapAct0(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    // Transient kick cleaves the central crystal lattice apart
    q = applyGeodeFracture(q, u_transient * 1.5, vec3(0.707, 0.707, 0.0));
    
    // High-frequency surface wriggle
    q = applyWriggle(q, u_time, u_subBass * 0.4, u_mid * 0.6, u_air * 1.8);

    pMod1(q.z, 2.2);
    pModPolar(q.xy, 6.0);
    q.x -= 0.9 + u_subBass * 0.5;

    // Creative Morph: Sphere (Bass) <-> Cube (Mids) <-> Octahedron (Highs) <-> Hex (Air)
    float morphCrystal = sdMorphGeom(
      q, 
      0.65, 
      0.2 + u_subBass * 2.5, // Sphere on bass
      0.2 + u_mid * 2.5,     // Cube on mids
      0.2 + u_high * 3.0,    // Triangle/Octa on highs
      0.1 + u_air * 2.0      // Hex prism on air
    );

    float boxFrame = sdBoxFrame(q, vec3(0.6), 0.035);
    float d = min(morphCrystal, boxFrame);

    float glow = 0.025 / (abs(d) + 0.03);
    glowCol = freqToColor(clamp(length(p) * 0.2 + u_high * 0.5, 0.0, 1.0), 1.3);

    return d;
  }

  // Act 1: Fractal Caverns (Mandelbox with Harmonic Acoustic Wriggle)
  float mapAct1(vec3 p, out vec3 glowCol) {
    // Harmonic cave acoustic breathing
    vec3 z = applyWriggle(p, u_time * 0.7, u_subBass * 0.8, u_mid * 1.2, u_air * 2.2);
    
    float scale = 2.4 + u_subBass * 0.4;
    float dr = 1.0;
    float r = 0.0;
    float trap = 1e10;

    for (int i = 0; i < 6; i++) {
      // Box fold influenced by mid frequencies
      vec2 boxLimit = vec2(1.0 + u_mid * 0.3, 1.0 - u_high * 0.2);
      z = clamp(z, -boxLimit.x, boxLimit.x) * 2.0 - z;
      
      // Sphere fold
      r = dot(z, z);
      trap = min(trap, r);
      if (r < 0.25) {
        float temp = 4.0;
        z *= temp;
        dr *= temp;
      } else if (r < 1.0) {
        float temp = 1.0 / r;
        z *= temp;
        dr *= temp;
      }
      
      z = z * scale + p;
      dr = dr * abs(scale) + 1.0;
    }

    float d = (length(z) - (1.1 + u_bass * 0.3)) / abs(dr);
    float freq = clamp(trap * 0.3 + u_high * 0.6, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.1);
    return d;
  }

  // Act 2: Geometry Storm (Instanced Polyhedral Matrix with Frequency Morphing)
  float mapAct2(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    vec3 cell = pMod3(q, vec3(3.2, 3.2, 3.2));
    
    // Rotate individual units with speed modulated by pitch
    float cellPitch = hash31(cell);
    float rotA = u_time * (0.8 + cellPitch * 1.2) + u_mid * 2.5;
    q.xy = rot2D(rotA) * q.xy;
    q.yz = rot2D(rotA * 0.6) * q.yz;

    // Each floating unit morphs shape: Round on bass kicks, square on mids, sharp faceted on synth leads
    float morphUnit = sdMorphGeom(
      q,
      0.7,
      0.3 + u_subBass * 3.0,
      0.2 + u_mid * 2.5,
      0.2 + u_high * 3.0,
      0.1 + u_air * 2.0
    );

    float frame = sdBoxFrame(q, vec3(0.75), 0.03);
    float d = min(morphUnit, frame);

    float freq = clamp(cellPitch * 0.6 + u_high * 0.45, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.6);
    return d;
  }

  // Act 3: Supernova Apex (Volumetric Twisted Vortex & Core Cleavage)
  float mapAct3(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    // Dynamic acoustic twist
    q = opTwistY(q, 0.35 + u_subBass * 0.4 + u_mid * 0.5);
    
    // Snare hit transient cleavage
    q = applyGeodeFracture(q, u_transient * 1.2, vec3(0.0, 1.0, 0.0));

    float torus1 = sdTorus(q, vec2(2.8, 0.25 + u_bass * 0.2));
    float torus2 = sdTorus(q.xzy, vec2(2.0, 0.18 + u_high * 0.15));
    
    // Center Core morphs from pulsating sphere to spinning diamond octahedron
    float core = sdMorphGeom(p, 1.0 + u_subBass * 0.9, 0.8 + u_subBass * 2.0, 0.1, 0.5 + u_high * 3.0, 0.1);
    
    float d = smin(torus1, torus2, 0.45);
    d = smin(d, core, 0.5);

    float freq = clamp(length(p) * 0.15 + u_energy * 0.6, 0.0, 1.0);
    glowCol = freqToColor(freq, 2.2);
    return d;
  }

  // Act 4: Crystalline Epilogue (Deep Space Shards & Acoustic Flutter)
  float mapAct4(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    q = applyWriggle(q, u_time * 0.4, 0.0, u_mid * 0.4, u_air * 1.5);

    pModPolar(q.xz, 8.0);
    q.x -= 2.2;
    q.y += sin(u_time * 0.4 + q.x) * 0.4;

    float morphShard = sdMorphGeom(
      q,
      0.6,
      0.1 + u_subBass * 1.5,
      0.2 + u_mid * 2.0,
      0.4 + u_high * 2.5,
      0.3 + u_air * 2.0
    );

    float sph = sdSphere(p, 0.7);
    float d = min(morphShard, sph);

    float freq = clamp(length(p) * 0.1 + u_air * 0.5, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.0);
    return d;
  }

  // Master Scene Dispatcher with Camera Clearance Sphere
  float map(vec3 p, out vec3 glowCol) {
    float d = 0.0;
    if (u_actIndex == 0) d = mapAct0(p, glowCol);
    else if (u_actIndex == 1) d = mapAct1(p, glowCol);
    else if (u_actIndex == 2) d = mapAct2(p, glowCol);
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

      // Glow accumulation
      float glowFactor = 0.012 / (abs(d) + 0.04);
      accumGlow += glowCol * glowFactor * (0.8 + u_energy * 1.5);

      if (d < 0.002) {
        hit = true;
        hitPos = p;
        break;
      }
      if (t > maxDist) break;
      t += d * 0.85;
    }

    // Dynamic Cosmic Nebula Background
    float starDust = hash21(floor(rd.xy * 250.0 + fract(u_time * 0.02)));
    float stars = smoothstep(0.96 - u_air * 0.05, 1.0, starDust) * (1.0 + u_high * 2.0);
    
    vec3 nebulaCore = vec3(0.3, 0.05, 0.15) * (1.0 + u_subBass * 0.6);
    vec3 nebulaDeep = vec3(0.02, 0.03, 0.08);
    vec3 sky = mix(nebulaDeep, nebulaCore, clamp(sin(rd.y * 2.0 + rd.x * 1.5) * 0.5 + 0.5, 0.0, 1.0));
    sky += vec3(0.9, 0.8, 1.0) * stars * 1.5;

    vec3 col = sky;

    if (hit) {
      vec3 n = calcNormal(hitPos);
      vec3 lightDir = normalize(vec3(1.0, 2.0, -1.0));
      
      float diff = max(0.0, dot(n, lightDir));
      float ao = clamp(map(hitPos + n * 0.1, glowCol) / 0.1, 0.2, 1.0);
      
      vec3 ref = reflect(rd, n);
      float spec = pow(max(0.0, dot(ref, lightDir)), 16.0);

      vec3 baseCol = glowCol * 0.6;
      vec3 surfaceCol = baseCol * (diff * 0.8 + 0.2) * ao + vec3(1.0) * spec * (0.5 + u_air * 1.5);

      // Fog blending into nebula
      float fog = 1.0 - exp(-t * 0.04);
      surfaceCol = mix(surfaceCol, sky, fog);

      // Proximity Transparency Fade (smooth x-ray ghosting as objects approach lens)
      float camDist = length(hitPos - ro);
      float nearFade = smoothstep(0.3, 0.9, camDist);
      col = mix(sky + accumGlow * 0.45, surfaceCol, nearFade);
    }

    col += accumGlow * 0.45;

    // Sub-bass Kick Flash
    col += vec3(1.0, 0.1, 0.3) * u_transient * 0.3;

    // Post-FX: Radial Chromatic Aberration
    float rDist = length(uv);
    vec2 chromaOffset = uv * (0.015 + u_transient * 0.03);
    
    // Tonemapping & Optical Polish
    col = acesFilmic(col * 1.2);
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
  hud = new DemosceneHUD(director, audioEngine, 'DEBRIS_REDUX // TRANSCENDENT VOID');

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Fullscreen Raymarching Quad
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
      u_camPos: { value: new THREE.Vector3(0, 0, 4) },
      u_camTarget: { value: new THREE.Vector3(0, 0, 0) },
      u_camUp: { value: new THREE.Vector3(0, 1, 0) },
      u_camFov: { value: 60.0 },
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

  // Autostart Demo Synthesizer
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

  // Update Shader Uniforms
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
