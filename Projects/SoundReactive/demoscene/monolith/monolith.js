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
    desc: '01 // HIGH-ALTITUDE DIVE TOWARDS CITYSCAPE',
    startTime: 0,
    endTime: 25,
    cameraKeyframes: [
      { t: 0,  pos: [0.0, 30.0, -25.0], target: [0.0, 4.0, 35.0],  roll: 0.0,   fov: 75 },
      { t: 8,  pos: [2.5, 18.0, -5.0],  target: [0.0, 2.0, 45.0],  roll: 0.15,  fov: 72 },
      { t: 16, pos: [-1.8, 7.0, 18.0],  target: [0.0, 1.5, 55.0],  roll: -0.18, fov: 68 },
      { t: 25, pos: [0.0, 1.2, 42.0],   target: [0.0, 0.8, 75.0],  roll: 0.0,   fov: 62 }
    ]
  },
  {
    id: 'act2',
    name: 'THE CONDUITS',
    desc: '02 // SUBTERRANEAN LASER TUNNEL',
    startTime: 25,
    endTime: 55,
    cameraKeyframes: [
      { t: 25, pos: [0.0, 0.2, 0.0],    target: [0.0, 0.0, 10.0], roll: 0.0,  fov: 65 },
      { t: 35, pos: [1.2, 0.5, 15.0],   target: [0.0, 0.0, 25.0], roll: 0.3,  fov: 60 },
      { t: 45, pos: [-1.0, -0.3, 30.0],  target: [0.0, 0.0, 40.0], roll: -0.3, fov: 65 },
      { t: 55, pos: [0.0, 0.0, 50.0],   target: [0.0, 0.0, 60.0], roll: 0.0,  fov: 70 }
    ]
  },
  {
    id: 'act3',
    name: 'THE REACTOR CORE',
    desc: '03 // GYROSCOPIC HYPER-TORUS SUSPENSION',
    startTime: 55,
    endTime: 85,
    cameraKeyframes: [
      { t: 55, pos: [0.0, 2.0, 7.0],    target: [0.0, 0.0, 0.0], roll: 0.0,  fov: 65 },
      { t: 65, pos: [6.0, 1.0, 3.0],    target: [0.0, 0.0, 0.0], roll: 0.2,  fov: 60 },
      { t: 75, pos: [0.0, -4.0, -6.0],  target: [0.0, 0.0, 0.0], roll: -0.4, fov: 55 },
      { t: 85, pos: [-5.0, 2.0, 4.0],   target: [0.0, 0.0, 0.0], roll: 0.1,  fov: 70 }
    ]
  },
  {
    id: 'act4',
    name: 'HYPER-VELOCITY EVACUATION',
    desc: '04 // MONORAIL SPEED RUN & STREAKS',
    startTime: 85,
    endTime: 110,
    cameraKeyframes: [
      { t: 85,  pos: [0.0, 0.8, 0.0],    target: [0.0, 0.8, 20.0],  roll: 0.0,  fov: 80 },
      { t: 92,  pos: [0.5, 0.8, 30.0],   target: [0.0, 0.8, 60.0],  roll: 0.1,  fov: 85 },
      { t: 100, pos: [-0.4, 0.8, 70.0],  target: [0.0, 0.8, 100.0], roll: -0.1, fov: 90 },
      { t: 110, pos: [0.0, 1.5, 120.0],  target: [0.0, 3.0, 150.0], roll: 0.0,  fov: 75 }
    ]
  },
  {
    id: 'act5',
    name: 'MONOLITH OVERLOOK',
    desc: '05 // DAWN BREAK OVER THE SPIRE',
    startTime: 110,
    endTime: 130,
    cameraKeyframes: [
      { t: 110, pos: [0.0, 5.0, -10.0],  target: [0.0, 8.0, 0.0],  roll: 0.0,  fov: 55 },
      { t: 118, pos: [3.0, 7.0, -12.0],  target: [0.0, 9.0, 0.0],  roll: 0.1,  fov: 50 },
      { t: 125, pos: [-2.0, 9.0, -14.0], target: [0.0, 10.0, 0.0], roll: -0.1, fov: 45 },
      { t: 130, pos: [0.0, 10.0, -16.0], target: [0.0, 10.0, 0.0], roll: 0.0,  fov: 40 }
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
  // SDF SCENE ESTIMATORS (Cyber-Brutalist Architecture & Landscapes)
  // -------------------------------------------------------------

  // Act 0: The Descent (Colossal Brutalist Metropolis with Extruded Towers)
  float mapAct0(vec3 p, out vec3 glowCol) {
    // 1. Ground floor at y = 0
    float ground = p.y;

    // 2. Medium Skyscraper City Grid (4x4m grid)
    vec2 grid4 = p.xz / 4.0;
    vec2 cell4 = floor(grid4);
    vec2 uv4 = (fract(grid4) - 0.5) * 4.0;
    float hRand4 = hash21(cell4);

    // Height of towers: 3m to 16m
    float h4 = hRand4 * 12.0 + 3.0;
    
    // Central flight corridor boulevard clearing (|p.x| < 3.0)
    if (abs(p.x) < 3.0) {
      h4 = 0.2; // Low roadway plaza
    }

    // Extruded tower box from ground to h4
    vec3 tower4P = vec3(uv4.x, p.y - h4 * 0.5, uv4.y);
    float tower4 = sdBox(tower4P, vec3(1.45, h4 * 0.5, 1.45));

    // Rooftop antenna spires on top of tall towers
    if (h4 > 7.0) {
      float antenna = sdCappedCylinder(vec3(uv4.x, p.y - (h4 + 1.2), uv4.y).xzy, 1.2, 0.05);
      tower4 = min(tower4, antenna);
    }

    // 3. Mega-Monolith Skyscraper Grid (16x16m grid flanking the boulevard)
    vec2 grid16 = (p.xz + vec2(8.0, 0.0)) / 16.0;
    vec2 cell16 = floor(grid16);
    vec2 uv16 = (fract(grid16) - 0.5) * 16.0;
    float hRand16 = hash21(cell16 + 77.3);
    
    float h16 = 0.0;
    // Place mega-spires only on outer flanks (|p.x| > 6.0)
    if (abs(p.x) > 6.0) {
      h16 = hRand16 * 14.0 + 14.0; // 14m to 28m mega spires!
    }
    
    vec3 megaP = vec3(uv16.x, p.y - h16 * 0.5, uv16.y);
    float megaTower = sdBox(megaP, vec3(3.2, h16 * 0.5, 3.2));

    // Combine terrain & towers
    float d = min(ground, tower4);
    if (h16 > 1.0) {
      d = min(d, megaTower);
    }

    // Material & Glow Coloring
    float isRoof = step(h4 - 0.3, p.y) * step(1.0, h4);
    float isMega = step(h16 - 0.4, p.y) * step(10.0, h16);
    
    vec3 darkTitanium = vec3(0.04, 0.05, 0.07);
    vec3 neonRoof = mix(vec3(1.0, 0.4, 0.0), vec3(0.0, 0.9, 1.0), hRand4);
    vec3 megaGlow = mix(vec3(1.0, 0.1, 0.3), vec3(1.0, 0.8, 0.2), u_subBass);

    glowCol = darkTitanium;
    if (isRoof > 0.5) glowCol = neonRoof;
    if (isMega > 0.5) glowCol = megaGlow;

    return d;
  }

  // Act 1: The Conduits (Subterranean Power Tunnels with Wriggling Pipes)
  float mapAct1(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float zCoord = q.z;
    pMod1(q.z, 4.0);

    // Floor and ceiling bounds
    float tunnel = max(abs(q.x) - 2.5, abs(q.y) - 2.0);

    // Conduits snake and undulate with audio
    vec3 pipeQ1 = applyWriggle(q - vec3(1.0, 0.0, -1.8), u_time, u_subBass * 0.3, u_mid * 0.8, u_air * 1.5);
    vec3 pipeQ2 = applyWriggle(q - vec3(-1.0, 0.0, -1.8), u_time * 1.1, u_subBass * 0.3, u_mid * 0.8, u_air * 1.5);

    float pipe1 = sdCappedCylinder(pipeQ1.xzy, 2.0, 0.25);
    float pipe2 = sdCappedCylinder(pipeQ2.xzy, 2.0, 0.25);
    float laserBeam = sdCylinder(q - vec3(0.0, -1.8, 0.0), vec3(0.0, 0.0, 0.06));

    float d = max(-tunnel, min(pipe1, pipe2));
    d = min(d, laserBeam);

    float freq = clamp(fract(zCoord * 0.05) + u_mid * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.1, 0.3), freq + u_subBass * 0.5);
    return d;
  }

  // Act 2: The Reactor Core (Gyroscopic Hyper-Torus with Morphing Ring Profiles)
  float mapAct2(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float tRot = u_time * 0.6 + u_subBass * 0.8;
    
    vec3 r1 = q;
    r1.xy = rot2D(tRot) * r1.xy;
    float ring1 = sdTorus(r1, vec2(3.2, 0.18 + u_bass * 0.15));

    vec3 r2 = q;
    r2.yz = rot2D(tRot * 0.7) * r2.yz;
    float ring2 = sdTorus(r2, vec2(2.4, 0.14 + u_mid * 0.1));

    vec3 r3 = q;
    r3.xz = rot2D(tRot * 1.3) * r3.xz;
    float ring3 = sdTorus(r3, vec2(1.6, 0.12 + u_high * 0.1));

    // Core cleaves on transients and morphs between pulsating sphere and faceted star
    vec3 coreP = applyGeodeFracture(p, u_transient * 1.1, vec3(0.0, 1.0, 0.0));
    float core = sdMorphGeom(
      coreP, 
      0.9 + u_subBass * 0.7, 
      0.7 + u_subBass * 2.0, 
      0.1 + u_mid * 1.5, 
      0.4 + u_high * 3.0, 
      0.2
    );

    // Abyss pit walls
    float pit = abs(length(p.xz) - 5.0) - 0.3;

    float d = min(min(ring1, ring2), min(ring3, core));
    d = min(d, pit);

    float freq = clamp(length(p) * 0.2 + u_energy * 0.5, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.0, 0.5), freq);
    return d;
  }

  // Act 3: Hyper-Velocity Evacuation (Monorail Grid & Acoustic Chatter)
  float mapAct3(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    float zCoord = q.z;
    pMod1(q.z, 2.0);

    // Rails chatter with high-frequency flutter
    vec3 railQ1 = applyWriggle(q - vec3(0.7, 0.0, 0.0), u_time, 0.0, 0.0, u_air * 1.2);
    vec3 railQ2 = applyWriggle(q - vec3(-0.7, 0.0, 0.0), u_time, 0.0, 0.0, u_air * 1.2);

    float rail1 = sdBox(railQ1, vec3(0.09, 0.09, 1.0));
    float rail2 = sdBox(railQ2, vec3(0.09, 0.09, 1.0));
    float floorP = p.y + 0.3;

    float pillars = sdBox(q - vec3(0.0, -0.4, 0.0), vec3(1.1, 0.1, 0.15));
    float overheadGantry = sdBox(q - vec3(0.0, 1.8, 0.0), vec3(1.4, 0.1, 0.15));

    float d = min(min(rail1, rail2), min(floorP, pillars));
    d = min(d, overheadGantry);

    float freq = clamp(fract(zCoord * 0.1) + u_high * 0.5, 0.0, 1.0);
    glowCol = freqToColor(freq, 1.8);
    return d;
  }

  // Act 4: Monolith Overlook (Colossal Spire with Morphing Crown)
  float mapAct4(vec3 p, out vec3 glowCol) {
    vec3 q = p;
    
    // Colossal Monolith Spire Body
    float spire = sdBox(q - vec3(0.0, 8.0, 0.0), vec3(1.8, 10.0, 1.8));
    
    // Crown morphs dynamically from diamond octahedron to faceted pyramid and beacon
    vec3 crownP = q - vec3(0.0, 18.0, 0.0);
    float spireTop = sdMorphGeom(
      crownP,
      2.2,
      0.1 + u_subBass * 1.5,
      0.3 + u_mid * 2.0,
      0.6 + u_high * 3.0,
      0.4 + u_air * 2.5
    );
    spire = min(spire, spireTop);

    // Sprawling Cloud Deck at the Horizon
    float cloudDeck = p.y - 0.0;

    float d = min(spire, cloudDeck);

    float freq = clamp(p.y * 0.05 + u_air * 0.4, 0.0, 1.0);
    glowCol = mix(vec3(1.0, 0.55, 0.1), vec3(0.3, 0.05, 0.5), freq);
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

    // Dynamic Atmospheric Cyberpunk Sky Gradient
    vec3 skyTop = vec3(0.03, 0.02, 0.06);
    vec3 skyHorizon = vec3(0.35, 0.12, 0.03) * (1.0 + u_subBass * 0.4);
    vec3 sky = mix(skyHorizon, skyTop, clamp(rd.y * 0.8 + 0.3, 0.0, 1.0));

    // March with safe near-plane offset
    float t = 0.25;
    float maxDist = 90.0;
    vec3 hitPos = vec3(0.0);
    bool hit = false;
    vec3 accumGlow = vec3(0.0);
    vec3 glowCol = vec3(1.0);

    for (int i = 0; i < 80; i++) {
      vec3 p = ro + rd * t;
      float d = map(p, glowCol);

      float glowFactor = 0.015 / (abs(d) + 0.04);
      accumGlow += glowCol * glowFactor * (0.85 + u_energy * 1.5);

      if (d < 0.002) {
        hit = true;
        hitPos = p;
        break;
      }
      if (t > maxDist) break;
      t += d * 0.85;
    }

    vec3 col = sky;

    if (hit) {
      vec3 n = calcNormal(hitPos);
      vec3 lightDir = normalize(vec3(1.2, 2.5, -1.2));
      
      float diff = max(0.0, dot(n, lightDir));
      float ao = clamp(map(hitPos + n * 0.25, glowCol) / 0.25, 0.15, 1.0);
      
      vec3 ref = reflect(rd, n);
      float spec = pow(max(0.0, dot(ref, lightDir)), 32.0);

      // Base Brutalist Dark Metal / Concrete Material
      vec3 baseMat = vec3(0.06, 0.07, 0.09);
      
      // Vertical concrete facade ribs
      float ribs = abs(sin(hitPos.x * 3.0)) * abs(sin(hitPos.z * 3.0));
      baseMat += vec3(0.03) * ribs;

      // Illuminated Window Matrix on buildings (when above ground y > 0.5)
      float winX = step(0.3, fract(hitPos.x * 1.8));
      float winZ = step(0.3, fract(hitPos.z * 1.8));
      float winY = step(0.55, fract(hitPos.y * 1.4));
      float isWindow = winY * (winX + winZ) * step(0.8, hitPos.y);
      
      // Random window color palette per building block
      vec3 winCol = mix(vec3(1.0, 0.7, 0.2), vec3(0.0, 0.85, 1.0), hash21(floor(hitPos.xz / 4.0)));

      // Highway / Street light conduits on ground (y <= 0.4)
      float isGround = step(hitPos.y, 0.4);
      float streetGrid = step(0.9, fract(hitPos.x * 0.25)) + step(0.9, fract(hitPos.z * 0.25));
      float highway = smoothstep(0.8, 0.0, abs(hitPos.x)) * (sin(hitPos.z * 0.6 - u_time * 6.0) * 0.5 + 0.5);
      vec3 groundLight = vec3(0.0, 0.7, 1.0) * streetGrid * 1.5 + vec3(1.0, 0.5, 0.0) * highway * 3.0;

      // Rooftop edge neon glow
      float roofEdge = smoothstep(0.3, 0.0, abs(fract(hitPos.y * 1.4) - 0.95)) * step(2.0, hitPos.y);

      vec3 surfaceCol = baseMat * (diff * 0.7 + 0.2) * ao;
      surfaceCol += winCol * isWindow * (0.8 + u_high * 2.0);
      surfaceCol += groundLight * isGround;
      surfaceCol += glowCol * roofEdge * 2.0;
      surfaceCol += vec3(1.0, 0.95, 0.85) * spec * (0.5 + u_air * 1.5);

      // Atmospheric Fog blending into sky
      float fog = 1.0 - exp(-t * 0.018);
      surfaceCol = mix(surfaceCol, sky, fog);

      // Proximity Transparency Fade
      float camDist = length(hitPos - ro);
      float nearFade = smoothstep(0.35, 1.0, camDist);
      col = mix(sky + accumGlow * 0.35, surfaceCol, nearFade);
    }

    col += accumGlow * 0.35;

    // Sub-bass Kick Flash
    col += vec3(1.0, 0.45, 0.0) * u_transient * 0.35;

    // Tonemapping & Optical Polish
    col = acesFilmic(col * 1.35);
    col = applyVignette(col, gl_FragCoord.xy / u_resolution.xy, 0.45, 1.3);
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
      u_camPos: { value: new THREE.Vector3(0, 30, -25) },
      u_camTarget: { value: new THREE.Vector3(0, 4, 35) },
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
