/**
 * MONOLITH - 64K Cyber-Brutalism & Megastructure Demolition
 * 
 * High-speed architectural flythroughs, subterranean conduits, and megastructures.
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
    name: 'THE DESCENT',
    desc: '01 // HIGH-ALTITUDE CANYON DIVE',
    startTime: 0,
    endTime: 25,
    cameraKeyframes: [
      { t: 0,  pos: [0.0, 16.0, 2.0],  target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 75 },
      { t: 8,  pos: [0.5, 9.0, 1.0],   target: [0.0, 0.0, 0.0], roll: 0.1,  fov: 70 },
      { t: 16, pos: [-0.4, 4.0, 0.5],  target: [0.0, -2.0, 0.0], roll: -0.2, fov: 65 },
      { t: 25, pos: [0.0, 0.5, 0.2],   target: [0.0, 0.0, 5.0], roll: 0.0,  fov: 60 }
    ]
  },
  {
    id: 'act2',
    name: 'THE CONDUITS',
    desc: '02 // SUBTERRANEAN LASER TUNNEL',
    startTime: 25,
    endTime: 55,
    cameraKeyframes: [
      { t: 25, pos: [0.0, 0.2, 0.0],   target: [0.0, 0.0, 10.0], roll: 0.0,  fov: 65 },
      { t: 35, pos: [1.2, 0.5, 15.0],  target: [0.0, 0.0, 25.0], roll: 0.3,  fov: 60 },
      { t: 45, pos: [-1.0, -0.3, 30.0], target: [0.0, 0.0, 40.0], roll: -0.3, fov: 65 },
      { t: 55, pos: [0.0, 0.0, 50.0],  target: [0.0, 0.0, 60.0], roll: 0.0,  fov: 70 }
    ]
  },
  {
    id: 'act3',
    name: 'THE REACTOR CORE',
    desc: '03 // GYROSCOPIC HYPER-TORUS SUSPENSION',
    startTime: 55,
    endTime: 85,
    cameraKeyframes: [
      { t: 55, pos: [0.0, 2.0, 7.0],   target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 65 },
      { t: 65, pos: [6.0, 1.0, 3.0],   target: [0.0, 0.0, 0.0], roll: 0.2,  fov: 60 },
      { t: 75, pos: [0.0, -4.0, -6.0], target: [0.0, 0.0, 0.0], roll: -0.4, fov: 55 },
      { t: 85, pos: [-5.0, 2.0, 4.0],  target: [0.0, 0.0, 0.0], roll: 0.1,  fov: 70 }
    ]
  },
  {
    id: 'act4',
    name: 'HYPER-VELOCITY EVACUATION',
    desc: '04 // MONORAIL SPEED RUN & STREAKS',
    startTime: 85,
    endTime: 110,
    cameraKeyframes: [
      { t: 85,  pos: [0.0, 0.8, 0.0],   target: [0.0, 0.8, 20.0], roll: 0.0,  fov: 80 },
      { t: 92,  pos: [0.5, 0.8, 30.0],  target: [0.0, 0.8, 60.0], roll: 0.1,  fov: 85 },
      { t: 100, pos: [-0.4, 0.8, 70.0], target: [0.0, 0.8, 100.0], roll: -0.1, fov: 90 },
      { t: 110, pos: [0.0, 1.5, 120.0], target: [0.0, 3.0, 150.0], roll: 0.0, fov: 75 }
    ]
  },
  {
    id: 'act5',
    name: 'MONOLITH OVERLOOK',
    desc: '05 // DAWN BREAK OVER THE SPIRE',
    startTime: 110,
    endTime: 130,
    cameraKeyframes: [
      { t: 110, pos: [0.0, 5.0, -10.0], target: [0.0, 8.0, 0.0], roll: 0.0,  fov: 55 },
      { t: 118, pos: [3.0, 7.0, -12.0], target: [0.0, 9.0, 0.0], roll: 0.1,  fov: 50 },
      { t: 125, pos: [-2.0, 9.0, -14.0], target: [0.0, 10.0, 0.0], roll: -0.1, fov: 45 },
      { t: 130, pos: [0.0, 10.0, -16.0], target: [0.0, 10.0, 0.0], roll: 0.0, fov: 40 }
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
  // SDF SCENE ESTIMATORS (Cyber-Brutalist Architecture)
  // -------------------------------------------------------------

  // Act 0: The Descent (Skyscraper Mega-Canyon)
  float mapAct0(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float dX = abs(q.x) - (1.2 + u_subBass * 0.3);
    
    // Tower facade ribbing
    float rib = cos(q.y * 8.0) * 0.05;
    float canyon = dX + rib;

    // Repeating balconies
    vec3 bQ = q;
    pMod1(bQ.y, 1.5);
    float box = sdBox(bQ - vec3(sign(q.x)*1.5, 0.0, 0.0), vec3(0.4, 0.2, 0.8));
    canyon = min(canyon, box);

    float laser = sdCylinder(q, vec3(0.0, 0.0, 0.05));
    float d = min(canyon, laser);

    float freq = clamp(abs(q.y) * 0.05 + u_high * 0.5, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.3, 0.0), vec3(0.0, 0.8, 1.0), freq);
    return d;
  }

  // Act 1: The Conduits (Subterranean Power Tunnels)
  float mapAct1(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float zCoord = q.z;
    pMod1(q.z, 4.0);

    // Hex tunnel
    float tunnel = -sdHexPrism(q.xzy, vec2(2.2, 2.0));

    // Floor conduits
    float pipe1 = sdCappedCylinder(q.xzy - vec3(0.8, 0.0, -1.8), 2.0, 0.2);
    float pipe2 = sdCappedCylinder(q.xzy - vec3(-0.8, 0.0, -1.8), 2.0, 0.2);

    float d = min(tunnel, min(pipe1, pipe2));

    float freq = clamp(fract(zCoord * 0.05) + u_mid * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.1, 0.3), freq + u_subBass * 0.5);
    return d;
  }

  // Act 2: The Reactor Core (Gyroscopic Hyper-Torus)
  float mapAct2(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float tRot = u_time * 0.6 + u_subBass * 0.8;
    
    vec3 r1 = q;
    r1.xy = rot2D(tRot) * r1.xy;
    float ring1 = sdTorus(r1, vec2(3.0, 0.15 + u_bass * 0.1));

    vec3 r2 = q;
    r2.yz = rot2D(tRot * 0.7) * r2.yz;
    float ring2 = sdTorus(r2, vec2(2.2, 0.12));

    vec3 r3 = q;
    r3.xz = rot2D(tRot * 1.3) * r3.xz;
    float ring3 = sdTorus(r3, vec2(1.5, 0.1));

    float core = sdSphere(p, 0.8 + u_subBass * 0.6);

    float d = min(min(ring1, ring2), min(ring3, core));

    float freq = clamp(length(p) * 0.2 + u_energy * 0.5, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.0, 0.5), freq);
    return d;
  }

  // Act 3: Hyper-Velocity Evacuation (Monorail Grid)
  float mapAct3(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float zCoord = q.z;
    pMod1(q.z, 2.0);

    float rail1 = sdBox(q - vec3(0.6, 0.0, 0.0), vec3(0.08, 0.08, 1.0));
    float rail2 = sdBox(q - vec3(-0.6, 0.0, 0.0), vec3(0.08, 0.08, 1.0));
    float floorP = p.y + 0.2;

    float pillars = sdBox(q - vec3(0.0, -0.4, 0.0), vec3(0.9, 0.1, 0.15));

    float d = min(min(rail1, rail2), min(floorP, pillars));

    float freq = clamp(fract(zCoord * 0.1) + u_high * 0.5, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.8);
    return d;
  }

  // Act 4: Monolith Overlook (Colossal Spire)
  float mapAct4(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    
    // Tower tapering upwards
    float spire = sdBox(q - vec3(0.0, 8.0, 0.0), vec3(1.5, 8.0, 1.5));
    float cloudDeck = p.y - 0.0;

    float d = min(spire, cloudDeck);

    float freq = clamp(p.y * 0.05 + u_air * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.6, 0.1), vec3(0.2, 0.05, 0.4), freq);
    return d;
  }

  // Master Scene Dispatcher
  float map(vec3 p, out vec3 glowCol) {
    if (u_actIndex == 0) return mapAct0(p, glowCol);
    if (u_actIndex == 1) return mapAct1(p, glowCol);
    if (u_actIndex == 2) return mapAct2(p, glowCol);
    if (u_actIndex == 3) return mapAct3(p, glowCol);
    return mapAct4(p, glowCol);
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

    // March
    float t = 0.0;
    float maxDist = 40.0;
    vec3 hitPos = vec3(0.0);
    bool hit = false;
    vec3 accumGlow = vec3(0.0);
    vec3 glowCol = vec3(1.0);

    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      float d = map(p, glowCol);

      float glowFactor = 0.01 / (abs(d) + 0.035);
      accumGlow += glowCol * glowFactor * (0.9 + u_energy * 1.6);

      if (d < 0.002) {
        hit = true;
        hitPos = p;
        break;
      }
      if (t > maxDist) break;
      t += d * 0.85;
    }

    vec3 col = vec3(0.02, 0.015, 0.01);

    if (hit) {
      vec3 n = calcNormal(hitPos);
      vec3 lightDir = normalize(vec3(1.5, 2.5, -1.0));
      
      float diff = max(0.0, dot(n, lightDir));
      float ao = clamp(map(hitPos + n * 0.12, glowCol) / 0.12, 0.2, 1.0);
      
      vec3 ref = reflect(rd, n);
      float spec = pow(max(0.0, dot(ref, lightDir)), 24.0);

      vec3 baseCol = glowCol * 0.5;
      col = baseCol * (diff * 0.7 + 0.3) * ao + vec3(1.0, 0.9, 0.7) * spec * (0.6 + u_air * 1.5);

      // Atmospheric Fog
      float fog = 1.0 - exp(-t * 0.05);
      col = mix(col, vec3(0.02, 0.015, 0.02), fog);
    }

    col += accumGlow * 0.4;

    // Sub-bass Kick Flash
    col += vec3(1.0, 0.4, 0.0) * u_transient * 0.35;

    // Tonemapping & Optical Polish
    col = acesFilmic(col * 1.3);
    col = applyVignette(col, gl_FragCoord.xy / u_resolution.xy, 0.5, 1.5);
    col = applyFilmGrain(col, gl_FragCoord.xy / u_resolution.xy, u_time, 0.04);

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
  hud = new DemosceneHUD(director, audioEngine, 'MONOLITH // 64K CYBER-BRUTALISM');

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
      u_camPos: { value: new THREE.Vector3(0, 16, 2) },
      u_camTarget: { value: new THREE.Vector3(0, 0, 0) },
      u_camUp: { value: new THREE.Vector3(0, 1, 0) },
      u_camFov: { value: 75.0 },
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
