import * as THREE from 'three';
import {
  PYRAMID,
  SHARED,
  FOG_PARS,
  AUDIO_PARS,
  HUE_UNIFORMS,
  OUTPUT_CHUNK,
  mulberry32
} from './world.js';

const MONOLITH_COUNT = 112;

const TIDE_VERT = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uActive;
uniform float uVoidMix;

varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 d = wp.xz - vec2(0.0, -780.0);
  float ang = atan(d.y, d.x);
  float ell = length(d / vec2(620.0, 1080.0));

  float swirl = sin(ang * 7.0 + ell * 9.0 - uTime * 1.4)
    + 0.55 * cos(ang * 13.0 - ell * 14.0 + uTime * 2.1);
  float tideHeight = max(0.0, swirl) * smoothstep(0.65, 1.2, ell)
    * (2.5 + uBass * 18.0 * uActive + uBeat * 9.0 * uActive) * uVoidMix;

  wp.y += tideHeight;
  vCrest = tideHeight;
  vWorld = wp.xyz;

  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const TIDE_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uEnergy;
uniform float uBeat;
uniform float uVoidMix;
uniform float uPeakFreqHue;
uniform float uPeakFlash;

varying vec3 vWorld;
varying float vDepth;
varying float vCrest;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  if (uVoidMix < 0.005) discard;
  float fogF = smoothstep(uFogNear, max(uFogNear + 400.0, uFogFar * 1.25), vDepth);
  if (fogF >= 0.995) discard;

  vec2 d = vWorld.xz - vec2(0.0, -780.0);
  float ang = atan(d.y, d.x);
  float r = length(d / vec2(590.0, 1040.0));

  // Organic creeping tendril warp reaching toward the city perimeter
  float warp = 0.14 * sin(ang * 6.0 - uTime * 0.9)
    + 0.09 * cos(ang * 11.0 + uTime * 1.45)
    + 0.06 * sin(r * 16.0 - uTime * 2.2);
  float edge = r + warp;

  // Bass pulls the abyssal shoreline deeper inward toward the skyscrapers & pyramid
  float encroach = 1.06 - (uBass * 0.22 + uEnergy * 0.12 + uBeat * 0.08) * uActive * uVoidMix;
  float mask = smoothstep(encroach - 0.16, encroach + 0.08, edge);
  if (mask < 0.01) discard;

  // Glowing violent front line where the dark tide collides with lit ground
  float shoreline = exp(-pow((edge - encroach) * 14.0, 2.0));
  float ripple = exp(-pow(fract(edge * 4.5 + uTime * 0.55) - 0.5, 2.0) * 42.0) * smoothstep(encroach, encroach + 0.65, edge);

  // Subtle geometric abyssal fracture grid inside the dark void plane
  float sparkNoise = hash21(floor(vWorld.xz * 0.18 + uTime * 0.4));
  float fracture = smoothstep(0.955, 0.995, sparkNoise) * (0.35 + uBeat * 0.85 * uActive);

  vec3 voidBase = vec3(0.008, 0.003, 0.018);
  vec3 tint = mix(vec3(0.55, 0.08, 0.98), hueColor(uHue), uActive * 0.7);
  vec3 peakTint = rawHueColor(uPeakFreqHue);
  tint = mix(tint, peakTint, uPeakFlash * 0.4 * uActive);

  vec3 rgb = voidBase * mask
    + tint * shoreline * (0.95 + uBass * 1.15 * uActive + uBeat * 0.65 * uActive)
    + tint * ripple * (0.38 + uEnergy * 0.55 * uActive)
    + mix(tint, vec3(0.2, 0.85, 1.0), 0.35) * fracture * mask * 0.8
    + tint * smoothstep(2.0, 14.0, vCrest) * 0.35;

  vec3 col = softHDR(rgb * uVoidMix, 1.5);
  col = mix(col, uFogColor, fogF * 0.88);
  gl_FragColor = vec4(col, mask * uVoidMix);
  ${OUTPUT_CHUNK}
}
`;

const MONO_VERT = /* glsl */ `
${AUDIO_PARS}
attribute vec4 aInfo; // x, z, radiusFrac, phase
attribute vec3 aDim;  // width, baseHeight, band

uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uVoidMix;

varying vec3 vLocal;
varying vec3 vWorld;
varying float vBand;
varying float vLevel;
varying float vDepth;

void main() {
  float band = aDim.z;
  vBand = band;
  float lvl = clamp(bandLevel(band), 0.0, 1.3);
  vLevel = lvl;

  // Surge tall spires upward and creep gently inward when the Void Tide intensifies
  float surge = (0.35 + lvl * 1.15 * uActive + uBeat * 0.45 * uActive) * uVoidMix;
  float bob = 0.5 + 0.5 * sin(uTime * 1.7 + aInfo.w);
  float h = aDim.y * (0.28 + surge * (0.75 + 0.35 * bob));

  float twist = position.y * (0.45 + 0.35 * sin(uTime * 0.9 + aInfo.w));
  float c = cos(twist);
  float s = sin(twist);
  vec3 loc = position;
  loc.xz *= aDim.x * (1.0 - position.y * 0.62);
  loc.xz = mat2(c, -s, s, c) * loc.xz;
  loc.y *= h;

  // Creep slightly closer toward the center on sub-bass drops
  vec2 centerToPos = vec2(aInfo.x, aInfo.y) - vec2(0.0, -780.0);
  float radial = max(1.0, length(centerToPos));
  vec2 dirIn = centerToPos / radial;
  float advance = (uBass * 65.0 * uActive + 18.0 * sin(uTime * 0.7 + aInfo.w)) * uVoidMix;
  vec2 xz = vec2(aInfo.x, aInfo.y) - dirIn * advance * step(0.15, uVoidMix);

  vec4 wp = modelMatrix * vec4(xz.x + loc.x, loc.y - 12.0 * (1.0 - uVoidMix), xz.y + loc.z, 1.0);
  vLocal = position;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const MONO_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uVoidMix;
uniform float uBeat;
uniform float uPeakFreqHue;
uniform float uPeakFlash;

varying vec3 vLocal;
varying vec3 vWorld;
varying float vBand;
varying float vLevel;
varying float vDepth;

void main() {
  if (uVoidMix < 0.01) discard;
  float fogF = smoothstep(uFogNear, max(uFogNear + 500.0, uFogFar * 1.3), vDepth);
  if (fogF >= 0.995) discard;

  // Sharp glowing arcane edge ribs + pulsing fracture runes along spire faces
  float edge = max(abs(vLocal.x), abs(vLocal.z)) * 2.0;
  float edgeGlow = smoothstep(0.76, 0.99, edge);
  float scan = exp(-pow(fract(vLocal.y * 6.0 - uTime * 0.85 + vBand * 0.15) - 0.5, 2.0) * 65.0);

  vec3 accent = mix(vec3(0.55, 0.08, 1.0), bandColor(vBand), uActive * 0.75);
  accent = mix(accent, rawHueColor(uPeakFreqHue), uPeakFlash * 0.4 * uActive);

  vec3 col = vec3(0.012, 0.006, 0.024)
    + accent * edgeGlow * (0.45 + vLevel * 0.95 * uActive + uBeat * 0.4 * uActive)
    + accent * scan * (0.35 + vLevel * 0.65 * uActive)
    + accent * smoothstep(0.7, 1.0, vLocal.y) * 0.65;

  col = softHDR(col * uVoidMix, 1.52);
  col = mix(col, uFogColor, fogF * 0.88);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const APEX_RING_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const APEX_RING_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uVoidMix;

varying vec2 vUv;
varying float vDepth;

void main() {
  if (uVoidMix < 0.01) discard;
  float fogF = smoothstep(uFogNear, max(uFogNear + 500.0, uFogFar * 1.35), vDepth);
  if (fogF >= 0.995) discard;

  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = atan(p.y, p.x);

  // Expanding triangular/hexagonal geometric containment barrier radiating from Pyramid
  float wave = fract(r * 2.2 - uTime * 0.45);
  float pulse = exp(-pow(wave - 0.5, 2.0) * 55.0);
  float spokes = pow(0.5 + 0.5 * cos(ang * 8.0 + uTime * 1.1), 8.0);
  float fade = smoothstep(0.28, 0.45, r) * (1.0 - smoothstep(0.75, 1.0, r));

  vec3 tint = mix(vec3(0.72, 0.2, 1.0), hueColor(uHue), uActive * 0.65);
  vec3 rgb = tint * (pulse * 0.95 + spokes * 0.35) * fade * (0.5 + uBass * 0.85 * uActive + uBeat * 0.6 * uActive) * uVoidMix;

  vec3 col = softHDR(rgb * (1.0 - fogF * 0.8), 1.48);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/**
 * VoidTide - Scene 11 ("VOID ENCROACH") & Abyssal Void theme companion:
 * Surging abyssal plasma tide, rising obsidian monolith spires in the surrounding black
 * expanse, and glowing pyramid containment waves best viewed from VOID_APEX_SHOT above.
 */
export class VoidTide {
  constructor(scene) {
    this.rng = mulberry32(9973);

    const audioUniforms = {
      uTime: SHARED.uTime,
      uBass: SHARED.uBass,
      uEnergy: SHARED.uEnergy,
      uBeat: SHARED.uBeat,
      uActive: SHARED.uActive,
      uHue: SHARED.uHue,
      uBands: SHARED.uBands,
      uPeakFreqHue: SHARED.uPeakFreqHue,
      uPeakFlash: SHARED.uPeakFlash,
      uVoidMix: SHARED.uVoidMix,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      ...HUE_UNIFORMS
    };

    // 1. Surging Abyssal Wave Plane around outer city flanks
    const tideGeo = new THREE.PlaneGeometry(5200, 5200, 128, 128);
    tideGeo.rotateX(-Math.PI / 2);
    const tideMat = new THREE.ShaderMaterial({
      uniforms: audioUniforms,
      vertexShader: TIDE_VERT,
      fragmentShader: TIDE_FRAG,
      transparent: true,
      depthWrite: false
    });
    this.tideMesh = new THREE.Mesh(tideGeo, tideMat);
    this.tideMesh.position.set(0, 1.15, -780);
    this.tideMesh.frustumCulled = false;
    this.tideMesh.renderOrder = 1;
    this.tideMesh.visible = false;

    // 2. Rising Obsidian Monoliths ringing outer dark flanks
    const monoGeo = new THREE.BoxGeometry(1, 1, 1);
    monoGeo.translate(0, 0.5, 0);

    const aInfo = new Float32Array(MONOLITH_COUNT * 4);
    const aDim = new Float32Array(MONOLITH_COUNT * 3);

    for (let i = 0; i < MONOLITH_COUNT; i++) {
      const ang = (i / MONOLITH_COUNT) * Math.PI * 2 + (this.rng() - 0.5) * 0.08;
      const ring = 1.02 + this.rng() * 1.15;
      const x = Math.cos(ang) * 740 * ring;
      const z = -780 + Math.sin(ang) * 1240 * ring;

      aInfo[i * 4] = x;
      aInfo[i * 4 + 1] = z;
      aInfo[i * 4 + 2] = ring;
      aInfo[i * 4 + 3] = this.rng() * Math.PI * 2;

      aDim[i * 3] = 16 + this.rng() * 34;
      aDim[i * 3 + 1] = 85 + this.rng() * 210;
      aDim[i * 3 + 2] = i % 7;
    }

    monoGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 4));
    monoGeo.setAttribute('aDim', new THREE.InstancedBufferAttribute(aDim, 3));

    const monoMat = new THREE.ShaderMaterial({
      uniforms: audioUniforms,
      vertexShader: MONO_VERT,
      fragmentShader: MONO_FRAG
    });

    this.monoMesh = new THREE.InstancedMesh(monoGeo, monoMat, MONOLITH_COUNT);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < MONOLITH_COUNT; i++) this.monoMesh.setMatrixAt(i, identity);
    this.monoMesh.frustumCulled = false;
    this.monoMesh.visible = false;

    // 3. Expanding Containment Field Ring surrounding the Pyramid
    const ringGeo = new THREE.PlaneGeometry(1800, 1800);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: audioUniforms,
      vertexShader: APEX_RING_VERT,
      fragmentShader: APEX_RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(PYRAMID.x, 4.5, PYRAMID.z);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 3;
    this.ringMesh.visible = false;

    scene.add(this.tideMesh, this.monoMesh, this.ringMesh);
  }

  update() {
    const vis = SHARED.uVoidMix.value > 0.005;
    this.tideMesh.visible = vis;
    this.monoMesh.visible = vis;
    this.ringMesh.visible = vis;
  }
}
