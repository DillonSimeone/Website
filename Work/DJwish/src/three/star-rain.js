import * as THREE from 'three';
import {
  SHARED,
  FOG_PARS,
  HUE_PARS,
  HUE_UNIFORMS,
  OUTPUT_CHUNK,
  MAX_STAR_WELLS,
  HUE_MAX,
  mulberry32
} from './world.js';

const STAR_COUNT = 240;

const STREAK_VERT = /* glsl */ `
attribute vec4 aDrop;  // x, z, yLand, phase
attribute vec3 aSpec;  // speed, maxSplashR, band

uniform float uTime;
uniform float uStarRainMix;

varying vec2 vUv;
varying float vBand;
varying float vHeadAlpha;
varying float vDepth;
varying float vGlow;

void main() {
  vUv = uv;
  vBand = aSpec.z;

  float cyc = fract(aDrop.w + uTime * aSpec.x);

  // Serene steady rainfall orthogonal to audio playback
  float fallT = clamp(cyc / 0.48, 0.0, 1.0);
  float streakVis = (1.0 - smoothstep(0.44, 0.52, cyc)) * uStarRainMix;
  vHeadAlpha = streakVis;

  float headY = mix(520.0, aDrop.z, fallT);
  float lenRand = fract(aDrop.w * 7.13 + aSpec.z * 0.19);
  float streakLen = (34.0 + 42.0 * lenRand) * (0.45 + 0.55 * fallT);
  float slantX = -0.12;
  float slantZ = 0.07;

  vec3 worldHead = vec3(aDrop.x - fallT * 38.0 * slantX, headY, aDrop.y - fallT * 38.0 * slantZ);
  vec3 tailDir = normalize(vec3(-slantX, 1.0, -slantZ));
  vec3 alongPos = worldHead + tailDir * (position.y * streakLen);

  vec4 mvHead = viewMatrix * vec4(worldHead, 1.0);
  vec4 mvPos = viewMatrix * vec4(alongPos, 1.0);
  vDepth = -mvPos.z;

  vec4 mvTail = viewMatrix * vec4(worldHead + tailDir * 10.0, 1.0);
  vec2 sDir = mvTail.xy - mvHead.xy;
  float sLen = length(sDir);
  vec2 perp = sLen > 0.0001 ? vec2(-sDir.y, sDir.x) / sLen : vec2(1.0, 0.0);

  float width = mix(0.78, 0.25, position.y) * (1.0 + clamp(-mvPos.z * 0.0011, 0.0, 1.4));
  mvPos.xy += perp * position.x * width * uStarRainMix;

  vGlow = 0.92 * streakVis;
  gl_Position = projectionMatrix * mvPos;
}
`;

const STREAK_FRAG = /* glsl */ `
${FOG_PARS}
${HUE_PARS}

varying vec2 vUv;
varying float vBand;
varying float vHeadAlpha;
varying float vDepth;
varying float vGlow;

void main() {
  if (vHeadAlpha < 0.005) discard;
  float fogF = smoothstep(uFogNear, max(uFogNear + 250.0, uFogFar * 1.45), vDepth);
  if (fogF >= 0.995) discard;

  float xDist = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-xDist * xDist * 10.0);
  float headBright = exp(-vUv.y * 4.2);
  float tailFade = (1.0 - vUv.y) * (0.35 + 0.65 * headBright);

  vec3 starCol = hueColor(vBand / 6.0 * ${HUE_MAX.toFixed(2)});
  vec3 rgb = mix(starCol, vec3(0.95, 0.98, 1.0), 0.45 + headBright * 0.4) * core * tailFade * vGlow * 1.35;

  vec3 col = softHDR(rgb * (1.0 - fogF * 0.82), 1.55);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const SPLASH_VERT = /* glsl */ `
attribute vec4 aDrop; // x, z, yLand, phase
attribute vec3 aSpec; // speed, maxSplashR, band

uniform float uTime;
uniform float uStarRainMix;

varying vec2 vUv;
varying float vSplashT;
varying float vBand;
varying float vDepth;
varying float vVis;

void main() {
  vUv = uv;
  vBand = aSpec.z;

  float cyc = fract(aDrop.w + uTime * aSpec.x);

  float splashT = clamp((cyc - 0.46) / 0.54, 0.0, 1.0);
  float activeSplash = step(0.46, cyc) * (1.0 - step(0.998, cyc));
  vSplashT = splashT;
  vVis = activeSplash * uStarRainMix;

  float slantX = -0.12;
  float slantZ = 0.07;
  // Rooftop impacts are strictly clamped to roof bounds inside aSpec.y; ground impacts expand wide
  float maxRadius = max(0.8, aSpec.y);
  float rad = mix(min(2.0, maxRadius * 0.35), maxRadius, pow(splashT, 0.72));

  vec3 pos = vec3(
    aDrop.x - 38.0 * slantX + position.x * rad,
    aDrop.z + 0.32,
    aDrop.y - 38.0 * slantZ + position.z * rad
  );
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SPLASH_FRAG = /* glsl */ `
${FOG_PARS}
${HUE_PARS}

varying vec2 vUv;
varying float vSplashT;
varying float vBand;
varying float vDepth;
varying float vVis;

void main() {
  if (vVis < 0.005) discard;
  float fogF = smoothstep(uFogNear, max(uFogNear + 250.0, uFogFar * 1.4), vDepth);
  if (fogF >= 0.995) discard;

  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;

  float outerWave = exp(-pow(r - 0.80, 2.0) * 34.0);
  float innerEcho = exp(-pow(r - 0.48, 2.0) * 26.0) * 0.55;
  float photonRing = exp(-pow(r - 0.22, 2.0) * 90.0) * (1.0 - smoothstep(0.05, 0.65, vSplashT));
  float eventVoidMask = smoothstep(0.06, 0.20, r);
  float fadeOut = (1.0 - smoothstep(0.28, 1.0, vSplashT)) * (1.0 - smoothstep(0.84, 1.0, r));

  vec3 baseC = hueColor(vBand / 6.0 * ${HUE_MAX.toFixed(2)});
  vec3 prismShift = mix(baseC, vec3(0.42, 0.88, 1.0), 0.38);
  vec3 rgb = (baseC * (outerWave + innerEcho) + prismShift * photonRing * 1.35) * eventVoidMask * fadeOut * vVis;

  vec3 col = softHDR(rgb * (1.0 - fogF * 0.82), 1.45);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/** Returns exact impact elevation & rooftop-safe splash radius so splashes never overhang walls. */
function lookupImpactInfo(x, z, boxes, defaultRad) {
  let maxY = 0.2;
  let maxSplashR = defaultRad;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const halfX = b.sx * 0.5;
    const halfZ = b.sz * 0.5;
    const dx = Math.abs(x - b.x);
    const dz = Math.abs(z - b.z);
    if (dx <= halfX && dz <= halfZ && b.h > maxY) {
      maxY = b.h;
      const edgeClear = Math.min(halfX - dx, halfZ - dz);
      maxSplashR = edgeClear < 1.2 ? 0.9 : Math.max(1.0, Math.min(4.8, edgeClear * 0.85));
    }
  }
  return { yLand: maxY, maxSplashR };
}

/**
 * StarRain - Serene, audio-decoupled starfall shower & gravitational black-hole impact
 * wells written to SHARED.uStarWells. Works calmly whether music is quiet or rocking
 * the city.
 */
export class StarRain {
  constructor(scene, boxes = []) {
    this.rng = mulberry32(8088);
    this.boxes = boxes;
    this.wellTimer = 0;
    this.nextWellSlot = 0;

    const dropAttr = new Float32Array(STAR_COUNT * 4);
    const specAttr = new Float32Array(STAR_COUNT * 3);
    const slantX = -0.12;
    const slantZ = 0.07;

    for (let i = 0; i < STAR_COUNT; i++) {
      const nearTown = i < STAR_COUNT * 0.65;
      const x = nearTown ? (this.rng() * 2 - 1) * 520 : (this.rng() * 2 - 1) * 760;
      const z = nearTown ? (-920 + this.rng() * 1380) : (-1360 + this.rng() * 1850);

      // Compute impact site exact coordinate matching SPLASH_VERT landing point
      const hitX = x - 38.0 * slantX;
      const hitZ = z - 38.0 * slantZ;
      const info = lookupImpactInfo(hitX, hitZ, boxes, 24.0 + this.rng() * 18.0);

      dropAttr[i * 4] = x;
      dropAttr[i * 4 + 1] = z;
      dropAttr[i * 4 + 2] = info.yLand;
      dropAttr[i * 4 + 3] = this.rng();

      specAttr[i * 3] = 0.10 + this.rng() * 0.10;
      specAttr[i * 3 + 1] = info.maxSplashR;
      specAttr[i * 3 + 2] = i % 7;
    }

    const iDrop = new THREE.InstancedBufferAttribute(dropAttr, 4);
    const iSpec = new THREE.InstancedBufferAttribute(specAttr, 3);

    const streakGeo = new THREE.PlaneGeometry(2, 1, 1, 1);
    streakGeo.translate(0, 0.5, 0);
    streakGeo.setAttribute('aDrop', iDrop);
    streakGeo.setAttribute('aSpec', iSpec);

    const commonUniforms = {
      uTime: SHARED.uTime,
      uStarRainMix: SHARED.uStarRainMix,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      ...HUE_UNIFORMS
    };

    const streakMat = new THREE.ShaderMaterial({
      uniforms: commonUniforms,
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.streakMesh = new THREE.InstancedMesh(streakGeo, streakMat, STAR_COUNT);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.renderOrder = 6;
    this.streakMesh.visible = false;

    const splashGeo = new THREE.PlaneGeometry(2, 2);
    splashGeo.rotateX(-Math.PI / 2);
    splashGeo.setAttribute('aDrop', iDrop);
    splashGeo.setAttribute('aSpec', iSpec);

    const splashMat = new THREE.ShaderMaterial({
      uniforms: commonUniforms,
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, STAR_COUNT);
    this.splashMesh.frustumCulled = false;
    this.splashMesh.renderOrder = 5;
    this.splashMesh.visible = false;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < STAR_COUNT; i++) {
      this.streakMesh.setMatrixAt(i, identity);
      this.splashMesh.setMatrixAt(i, identity);
    }

    scene.add(this.streakMesh, this.splashMesh);
  }

  spawnGravityWell() {
    // Prefer open ground/plaza/park surfaces so gravity waves deform cleanly without ragged overhang
    let x = 0;
    let z = 0;
    let info = { yLand: 0.2, maxSplashR: 170 };
    for (let attempt = 0; attempt < 6; attempt++) {
      x = (this.rng() * 2 - 1) * 420;
      z = -780 + this.rng() * 1120;
      info = lookupImpactInfo(x, z, this.boxes, 170);
      if (info.yLand < 1.0) break;
    }

    const slot = this.nextWellSlot;
    this.nextWellSlot = (slot + 1) % MAX_STAR_WELLS;

    SHARED.uStarWells.value[slot].set(x, Math.min(info.yLand, 4), z, 0.001);
    SHARED.uStarWellSpec.value[slot].set(
      Math.floor(this.rng() * 7),
      0.74,
      155 + this.rng() * 55,
      1
    );
  }

  update(dt = 0.016) {
    const mix = SHARED.uStarRainMix.value;
    const vis = mix > 0.005;
    this.streakMesh.visible = vis;
    this.splashMesh.visible = vis;

    const wells = SHARED.uStarWells.value;
    if (!vis) {
      for (let i = 0; i < MAX_STAR_WELLS; i++) {
        wells[i].w = -1;
      }
      return;
    }

    // Slow lingering gravitational ripples over ~5.2s on fixed calm cadence
    for (let i = 0; i < MAX_STAR_WELLS; i++) {
      if (wells[i].w >= 0) {
        wells[i].w += dt / 5.2;
        if (wells[i].w >= 1.0) wells[i].w = -1;
      }
    }

    this.wellTimer -= dt;
    if (this.wellTimer <= 0) {
      this.spawnGravityWell();
      this.wellTimer = 0.88;
    }
  }
}
