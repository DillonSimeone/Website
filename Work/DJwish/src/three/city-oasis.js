import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  SHARED,
  FOG_PARS,
  AUDIO_PARS,
  HUE_UNIFORMS,
  OUTPUT_CHUNK,
  mulberry32
} from './world.js';

export const OASIS_BOUNDS = {
  cx: 138,
  cz: 145,
  width: 148,
  length: 300,
  poolW: 72,
  poolL: 168,
  waterY: 0.48
};

const TERRACE_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
varying vec2 vLocal;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLocal = position.xz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const TERRACE_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uPoolRim;
uniform vec3 uTreeAccent;

varying vec3 vWorld;
varying float vDepth;
varying vec2 vLocal;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 col = uFogColor;

  if (fogF < 0.995) {
    vec2 p = vLocal; // local relative to (138, 145): x in [-74..74], z in [-150..150]

    float grain = hash21(floor(p * 1.4));
    vec3 stone = mix(vec3(0.022, 0.020, 0.034), vec3(0.044, 0.038, 0.062), grain);

    vec2 tile = abs(fract(p / 4.0 - 0.5) - 0.5);
    float seam = 1.0 - smoothstep(0.015, 0.06, min(tile.x, tile.y));
    stone += uPoolRim * seam * (0.04 + 0.06 * uEnergy * uActive);

    // Winding garden walkway curves (west promenade, east path, north bridge approach, south viewing terrace)
    float dWestWalk = abs(p.x + 48.0 - sin(p.y * 0.028) * 5.0);
    float dEastWalk = abs(p.x - 48.0 - cos(p.y * 0.028) * 5.0);
    float dNorthBridge = abs(p.y + 67.0 - sin(p.x * 0.035) * 3.5);
    float dSouthPromenade = abs(p.y - 102.0 - sin(p.x * 0.04) * 4.5);
    float dNorthLoop = abs(p.y + 108.0 + sin(p.x * 0.04) * 4.5);
    float pathDist = min(min(dWestWalk, dEastWalk), min(dNorthBridge, min(dSouthPromenade, dNorthLoop)));

    float pathMask = 1.0 - smoothstep(3.2, 4.4, pathDist);
    float pathEdge = exp(-pow(abs(pathDist - 3.6), 2.0) * 2.2);

    vec3 pathCol = mix(stone, vec3(0.055, 0.052, 0.085) + uPoolRim * 0.08, pathMask);
    float chevron = 0.55 + 0.45 * sin(p.y * 0.65 - uTime * 2.5 + p.x * 0.4);
    float edgeGlow = pathEdge * (0.28 + chevron * 0.42 * uActive + uBeat * 0.35 * uActive);
    pathCol += mix(uPoolRim, uTreeAccent, 0.35) * edgeGlow;

    float bx = abs(p.x);
    float bz = abs(p.y);
    float outerRim = max(smoothstep(72.2, 73.5, bx), smoothstep(148.2, 149.5, bz));
    pathCol += uTreeAccent * outerRim * (0.42 + uBass * 0.55 * uActive);

    col = softHDR(pathCol, 1.25);
    col = mix(col, uFogColor, fogF);
  }

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const WATER_VERT = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uHue;
uniform float uActive;
uniform float uOasisCymaticMix;
uniform mat4 uReflectMatrix;

varying vec3 vWorld;
varying vec2 vLocal;
varying float vDepth;
varying float vWaveH;
varying vec4 vReflectClip;

float evalChladni(vec2 uv, float t) {
  float freqShift = clamp(uHue / 0.78, 0.0, 1.0);
  float m1 = 2.0 + 3.0 * freqShift + sin(t * 0.22) * 0.45;
  float m2 = 3.0 + 2.0 * (1.0 - freqShift) + cos(t * 0.17) * 0.45;
  float a = cos(m1 * 3.14159265 * uv.x) * cos(m2 * 3.14159265 * uv.y);
  float b = cos(m2 * 3.14159265 * uv.x) * cos(m1 * 3.14159265 * uv.y);
  return a - b;
}

void main() {
  vec3 pos = position;
  vec2 p = pos.xz;
  vec2 uvPool = vec2(p.x / 36.0, p.y / 84.0);

  // True RMS loudness gate prevents whispers from blowing up vertical waves into basin floor
  float loud = smoothstep(0.06, 0.72, uEnergy) * uActive;
  float rCenter = length(p);
  float rSouthFocus = length(p - vec2(0.0, 36.0));
  float cymGain = 0.45 + 0.55 * uOasisCymaticMix;

  float chladni = evalChladni(uvPool, uTime * 0.75) * cos(uTime * (2.2 + uMid * loud * 1.8));
  float faraday = sin(rCenter * 0.42 - uTime * 2.5) * 0.5 + cos(rSouthFocus * 0.55 - uTime * 2.9) * 0.5;
  float heightAmp = (0.015 + loud * (0.045 + uBass * 0.04 + uBeat * 0.025)) * cymGain;

  float h = clamp((chladni * 0.55 + faraday * 0.45) * heightAmp, -0.10, 0.14);
  pos.y += h;
  vWaveH = h;
  vLocal = p;

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  vReflectClip = uReflectMatrix * wp;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const WATER_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uPeakFreqHue;
uniform float uPeakFlash;
uniform float uOasisCymaticMix;
uniform float uHasReflect;
uniform sampler2D uReflectTex;
uniform vec3 uPoolWater;
uniform vec3 uPoolRim;
uniform vec3 uZenithColor;

varying vec3 vWorld;
varying vec2 vLocal;
varying float vDepth;
varying float vWaveH;
varying vec4 vReflectClip;

float chladniField(vec2 uv, float n, float m) {
  return cos(n * 3.14159265 * uv.x) * cos(m * 3.14159265 * uv.y)
       - cos(m * 3.14159265 * uv.x) * cos(n * 3.14159265 * uv.y);
}

void main() {
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 col = uFogColor;

  if (fogF < 0.995) {
    vec2 p = vLocal;
    vec2 uvPool = vec2(p.x / 36.0, p.y / 84.0);
    float loud = smoothstep(0.06, 0.72, uEnergy) * uActive;

    // Dynamic Chladni acoustic mode numbers steered by audio frequency & harmonics
    float fNorm = clamp(uHue / 0.78, 0.0, 1.0);
    float cyc = uTime * 0.16 + fNorm * 3.5;
    float modeA = floor(mod(cyc, 4.0)) + 2.0;
    float modeB = floor(mod(cyc * 1.37 + 1.0, 4.0)) + 3.0;
    float blend = fract(cyc);
    float ch0 = chladniField(uvPool, modeA, modeB);
    float ch1 = chladniField(uvPool, modeB, modeA + 1.0);
    float chladni = mix(ch0, ch1, blend);

    // Gentle analytical + ripple slope normal so mirror image stays crisp at low & loud levels
    vec2 eps = vec2(0.015, 0.0);
    float chDx = mix(chladniField(uvPool + eps.xy, modeA, modeB), chladniField(uvPool + eps.xy, modeB, modeA + 1.0), blend) - chladni;
    float chDz = mix(chladniField(uvPool + eps.yx, modeA, modeB), chladniField(uvPool + eps.yx, modeB, modeA + 1.0), blend) - chladni;

    float rad = length(p);
    float ringFreq = 0.42 + uOasisCymaticMix * 0.18;
    float radRip = sin(rad * ringFreq - uTime * (2.2 + loud * 1.6));
    vec2 rDir = rad > 0.001 ? p / rad : vec2(0.0, 1.0);

    float cymAmp = 0.12 + loud * (0.28 + uOasisCymaticMix * 0.42);
    float nx = clamp((chDx * 1.45 + rDir.x * radRip * 0.12) * cymAmp, -0.35, 0.35);
    float nz = clamp((chDz * 1.45 + rDir.y * radRip * 0.12) * cymAmp, -0.35, 0.35);
    vec3 N = normalize(vec3(nx * 0.4, 1.0, nz * 0.4));
    vec3 V = normalize(cameraPosition - vWorld);
    float fresnel = clamp(0.18 + 0.82 * pow(1.0 - max(dot(N, V), 0.0), 2.2), 0.18, 0.96);

    // Real-time planar mirror reflection (Pyramid + Laser Fan + Sun + Skyline) with gentle shimmer
    vec3 mirrorCol = mix(uZenithColor * 2.4, uPoolWater * 1.35, 0.45);
    if (uHasReflect > 0.5 && vReflectClip.w > 0.001) {
      vec2 baseUv = (vReflectClip.xy / vReflectClip.w) * 0.5 + 0.5;
      float distortScale = 0.0025 + loud * (0.007 + uOasisCymaticMix * 0.008);
      vec2 ruv = clamp(baseUv + vec2(nx, nz * 0.65) * distortScale, 0.004, 0.996);
      mirrorCol = texture2D(uReflectTex, ruv).rgb;
    }

    // Fine luminous filigree Chladni nodal contours that accent without obscuring reflection
    float nodalMask = exp(-abs(chladni) * 16.0);
    float faradayRings = exp(-pow(fract(rad * 0.042 - uTime * (0.24 + loud * 0.22)) - 0.5, 2.0) * 64.0);
    float microStar = pow(max(0.0, cos(uvPool.x * 16.0 * 3.14159) * cos(uvPool.y * 28.0 * 3.14159)), 6.0);

    vec3 waveTint = mix(uPoolRim, hueColor(uHue), loud * 0.65);
    vec3 peakTint = rawHueColor(uPeakFreqHue);
    vec3 cymGlow = mix(waveTint, peakTint, uPeakFlash * 0.5 * loud);

    float bankDist = min(36.0 - abs(p.x), 84.0 - abs(p.y));
    float shoreGlow = exp(-max(0.0, bankDist) * 0.42);

    float reflWeight = clamp(0.62 + 0.34 * fresnel, 0.62, 0.96);
    float cymVis = 0.28 + uOasisCymaticMix * 0.72;
    vec3 water = mix(uPoolWater * 0.25, mirrorCol * 1.12, reflWeight)
      + cymGlow * nodalMask * cymVis * (0.14 + loud * 0.42 + uBeat * loud * 0.22)
      + waveTint * faradayRings * (0.08 + loud * 0.32) * cymVis
      + peakTint * microStar * uHigh * loud * uOasisCymaticMix * 0.22
      + uPoolRim * shoreGlow * (0.36 + 0.32 * uBeat * loud)
      + vec3(0.75, 0.92, 1.0) * smoothstep(0.03, 0.12, abs(vWaveH)) * 0.14;

    col = softHDR(water, 1.42);
    col = mix(col, uFogColor, fogF);
  }

  gl_FragColor = vec4(col, 0.96);
  ${OUTPUT_CHUNK}
}
`;

const CANOPY_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aScale;
attribute float aPhase;
attribute float aBand;

uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uActive;
uniform float uStageMode;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vYNorm;
varying float vPhase;
varying float vBand;
varying float vDepth;

void main() {
  vec3 pos = position * aScale;
  vYNorm = clamp((position.y - 3.5) / 8.5, 0.0, 1.0);

  float sway = sin(uTime * 1.6 + aPhase + pos.y * 0.3) * (0.14 + uBass * 0.25 * uActive + uStageMode * 0.12);
  pos.x += sway * vYNorm;
  pos.z += cos(uTime * 1.35 + aPhase) * 0.1 * vYNorm;
  pos *= 1.0 + uBeat * 0.08 * uActive * uStageMode;

  vec4 wp = modelMatrix * vec4(aOffset + pos, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vPhase = aPhase;
  vBand = aBand;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const CANOPY_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uTreeCanopy;
uniform vec3 uTreeAccent;

varying vec3 vWorld;
varying vec3 vNormalW;
varying float vYNorm;
varying float vPhase;
varying float vBand;
varying float vDepth;

void main() {
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 col = uFogColor;

  if (fogF < 0.995) {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.1);
    float lvl = clamp(bandLevel(vBand), 0.0, 1.25);

    float sap = 0.5 + 0.5 * sin(vYNorm * 6.0 - uTime * 3.0 + vPhase);
    vec3 bioBase = mix(uTreeCanopy * 0.35, uTreeAccent * 0.85, smoothstep(0.35, 1.0, vYNorm));
    vec3 reactive = mix(uTreeAccent, bandColor(vBand), uActive * 0.65);

    vec3 leaf = bioBase * (0.55 + 0.45 * N.y * 0.5 + 0.25)
      + reactive * rim * (0.45 + 0.75 * lvl * uActive + 0.35 * uBeat * uActive)
      + uTreeAccent * sap * (0.14 + 0.28 * uEnergy * uActive);

    col = softHDR(leaf, 1.32);
    col = mix(col, uFogColor, fogF);
  }

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/**
 * CityOasis - Relocated East Cyberpunk Neon Oasis (`(138, 0, 145)`):
 * Basalt walkways, northern arched neon bridge, bioluminescent tree groves,
 * and a planar-reflecting mirror pool with live Chladni & Faraday water cymatics.
 */
export class CityOasis {
  constructor(group, glows) {
    this.group = new THREE.Group();
    this.glows = glows;
    this.obstacleBoxes = [];

    this.reflectTarget = new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    this.reflectCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 7500);
    this.uReflectMatrix = { value: new THREE.Matrix4() };
    this.uHasReflect = { value: 0 };
    this.uReflectTex = { value: this.reflectTarget.texture };

    this._reflPos = new THREE.Vector3();
    this._reflDir = new THREE.Vector3();
    this._reflTgt = new THREE.Vector3();

    const uniformsBase = {
      uTime: SHARED.uTime,
      uBass: SHARED.uBass,
      uEnergy: SHARED.uEnergy,
      uBeat: SHARED.uBeat,
      uHue: SHARED.uHue,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      ...HUE_UNIFORMS
    };

    this.uPoolWater = { value: new THREE.Vector3(0.04, 0.36, 0.58) };
    this.uPoolRim = { value: new THREE.Vector3(0.0, 0.94, 1.0) };
    this.uTreeCanopy = { value: new THREE.Vector3(0.08, 0.72, 0.85) };
    this.uTreeAccent = { value: new THREE.Vector3(1.0, 0.12, 0.55) };
    this.uZenithColor = { value: new THREE.Vector3(0.002, 0.001, 0.008) };

    this.buildTerrace(uniformsBase);
    this.buildPool(uniformsBase);
    this.buildFootbridge();
    this.buildTrees(uniformsBase);
    this.buildPathBollards();

    group.add(this.group);
  }

  buildTerrace(uniformsBase) {
    const geo = new THREE.BoxGeometry(OASIS_BOUNDS.width, 0.24, OASIS_BOUNDS.length);
    geo.translate(0, 0.12, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...uniformsBase,
        uPoolRim: this.uPoolRim,
        uTreeAccent: this.uTreeAccent
      },
      vertexShader: TERRACE_VERT,
      fragmentShader: TERRACE_FRAG
    });
    this.terraceMesh = new THREE.Mesh(geo, mat);
    this.terraceMesh.position.set(OASIS_BOUNDS.cx, 0, OASIS_BOUNDS.cz);
    this.group.add(this.terraceMesh);

    // Connector apron linking south-west edge cleanly to the street mouth (z = 266)
    const walkGeo = new THREE.BoxGeometry(36, 0.18, 18);
    walkGeo.translate(0, 0.09, 0);
    this.feederMat = new THREE.MeshBasicMaterial({ color: 0x161228 });
    this.feederMesh = new THREE.Mesh(walkGeo, this.feederMat);
    this.feederMesh.position.set(46, 0, 266);
    this.group.add(this.feederMesh);
  }

  buildPool(uniformsBase) {
    const { cx, cz, poolW, poolL, waterY } = OASIS_BOUNDS;

    const basinGeo = new THREE.PlaneGeometry(poolW + 1.2, poolL + 1.2);
    basinGeo.rotateX(-Math.PI / 2);
    const basinMat = new THREE.MeshBasicMaterial({ color: 0x040712 });
    this.basinMesh = new THREE.Mesh(basinGeo, basinMat);
    this.basinMesh.position.set(cx, 0.25, cz);
    this.group.add(this.basinMesh);

    // Dense grid supports crisp vertex Chladni standing-wave peaks & valleys
    const waterGeo = new THREE.PlaneGeometry(poolW, poolL, 72, 144);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        ...uniformsBase,
        uMid: SHARED.uMid,
        uHigh: SHARED.uHigh,
        uPeakFreqHue: SHARED.uPeakFreqHue,
        uPeakFlash: SHARED.uPeakFlash,
        uOasisCymaticMix: SHARED.uOasisCymaticMix,
        uReflectMatrix: this.uReflectMatrix,
        uHasReflect: this.uHasReflect,
        uReflectTex: this.uReflectTex,
        uPoolWater: this.uPoolWater,
        uPoolRim: this.uPoolRim,
        uZenithColor: this.uZenithColor
      },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(cx, waterY, cz);
    this.group.add(this.waterMesh);

    this.poolRimMat = new THREE.MeshBasicMaterial({ color: 0x00e8ff });
    const rimGeos = [];
    const rimH = 0.36;
    const rimT = 1.1;
    const nRim = new THREE.BoxGeometry(poolW + rimT * 2, rimH, rimT);
    nRim.translate(0, rimH / 2 + 0.25, -poolL / 2 - rimT / 2);
    const sRim = nRim.clone();
    sRim.translate(0, 0, poolL + rimT);
    const wRim = new THREE.BoxGeometry(rimT, rimH, poolL);
    wRim.translate(-poolW / 2 - rimT / 2, rimH / 2 + 0.25, 0);
    const eRim = wRim.clone();
    eRim.translate(poolW + rimT, 0, 0);
    rimGeos.push(nRim, sRim, wRim, eRim);

    const rimMesh = new THREE.Mesh(mergeGeometries(rimGeos), this.poolRimMat);
    rimMesh.position.set(cx, 0, cz);
    this.group.add(rimMesh);
  }

  buildFootbridge() {
    const { cx, cz, poolW, poolL } = OASIS_BOUNDS;
    // Place arched footbridge near the north end so the main southern/central pool reflects cleanly
    const bridgeZ = cz - poolL * 0.39; // ~ z = 79
    const span = poolW + 14;
    const segs = 28;
    const deckW = 6.0;
    const archH = 5.6;

    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x161428,
      roughness: 0.72,
      metalness: 0.25
    });
    this.bridgeRailMat = new THREE.MeshBasicMaterial({ color: 0xff2a88 });

    const deckGeos = [];
    const railGeos = [];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const tm = (t0 + t1) * 0.5;
      const x0 = (t0 - 0.5) * span;
      const x1 = (t1 - 0.5) * span;
      const xm = (x0 + x1) * 0.5;
      const y0 = 0.35 + Math.sin(t0 * Math.PI) * archH;
      const y1 = 0.35 + Math.sin(t1 * Math.PI) * archH;
      const ym = 0.35 + Math.sin(tm * Math.PI) * archH;
      const segLen = Math.hypot(x1 - x0, y1 - y0) + 0.08;
      const tilt = Math.atan2(y1 - y0, x1 - x0);

      const plank = new THREE.BoxGeometry(segLen, 0.42, deckW);
      plank.rotateZ(tilt);
      plank.translate(xm, ym, 0);
      deckGeos.push(plank);

      for (const rz of [-deckW / 2 + 0.25, deckW / 2 - 0.25]) {
        const railSeg = new THREE.BoxGeometry(segLen, 0.14, 0.14);
        railSeg.rotateZ(tilt);
        railSeg.translate(xm, ym + 1.05, rz);
        railGeos.push(railSeg);

        if (i % 3 === 0) {
          const post = new THREE.BoxGeometry(0.14, 1.05, 0.14);
          post.translate(xm, ym + 0.52, rz);
          deckGeos.push(post);
        }
      }
    }

    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(cx, 0, bridgeZ);
    bridgeGroup.add(new THREE.Mesh(mergeGeometries(deckGeos), deckMat));
    bridgeGroup.add(new THREE.Mesh(mergeGeometries(railGeos), this.bridgeRailMat));
    this.group.add(bridgeGroup);

    this.obstacleBoxes.push({ x: cx, z: bridgeZ, sx: span, sz: deckW + 4, h: archH + 3.5 });
  }

  buildTrees(uniformsBase) {
    const rng = mulberry32(9021);
    const { cx, cz, poolW, poolL } = OASIS_BOUNDS;
    const trees = [];

    const insidePool = (lx, lz) => Math.abs(lx) < poolW / 2 + 6 && Math.abs(lz) < poolL / 2 + 6;
    const onWalkway = (lx, lz) =>
      Math.abs(lz + 67) < 7.5 ||
      Math.abs(lx + 48 - Math.sin(lz * 0.028) * 5.0) < 4.8 ||
      Math.abs(lx - 48 - Math.cos(lz * 0.028) * 5.0) < 4.8 ||
      Math.abs(lz - 102 - Math.sin(lx * 0.04) * 4.5) < 5.0 ||
      Math.abs(lz + 108 + Math.sin(lx * 0.04) * 4.5) < 5.0 ||
      // Keep direct south-shore & central north sightline toward the Pyramid unobstructed
      (lz > 78 && Math.abs(lx) < 42);

    let tries = 0;
    while (trees.length < 60 && tries < 1800) {
      tries++;
      const lx = (rng() * 2 - 1) * 65;
      const lz = (rng() * 2 - 1) * 138;
      if (insidePool(lx, lz) || onWalkway(lx, lz)) continue;

      let tooClose = false;
      for (const t of trees) {
        if (Math.hypot(t.lx - lx, t.lz - lz) < 9.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      trees.push({
        lx,
        lz,
        x: cx + lx,
        z: cz + lz,
        scale: 0.78 + rng() * 0.65,
        rotY: rng() * Math.PI * 2,
        phase: rng() * Math.PI * 2,
        band: trees.length % 7
      });
    }

    const trunkBase = new THREE.CylinderGeometry(0.28, 0.48, 5.6, 6);
    trunkBase.translate(0, 2.8, 0);
    const branchA = new THREE.CylinderGeometry(0.14, 0.24, 3.4, 5);
    branchA.rotateZ(0.42);
    branchA.translate(-0.85, 5.4, 0);
    const branchB = new THREE.CylinderGeometry(0.12, 0.22, 3.1, 5);
    branchB.rotateZ(-0.46);
    branchB.rotateY(1.2);
    branchB.translate(0.75, 5.1, 0.35);
    const trunkGeo = mergeGeometries([trunkBase.toNonIndexed(), branchA.toNonIndexed(), branchB.toNonIndexed()]);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x161224,
      roughness: 0.9,
      metalness: 0.15
    });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const dummy = new THREE.Object3D();

    const lowerCrown = new THREE.OctahedronGeometry(2.7, 1);
    lowerCrown.scale(1.25, 0.68, 1.25);
    lowerCrown.translate(0, 6.2, 0);
    const upperCrown = new THREE.OctahedronGeometry(1.9, 1);
    upperCrown.scale(1.15, 0.72, 1.15);
    upperCrown.translate(-0.25, 8.2, 0.15);
    const sideCrown = new THREE.OctahedronGeometry(1.5, 1);
    sideCrown.scale(1.1, 0.62, 1.1);
    sideCrown.translate(1.25, 6.9, -0.35);
    const canopyGeo = mergeGeometries([
      lowerCrown.toNonIndexed(),
      upperCrown.toNonIndexed(),
      sideCrown.toNonIndexed()
    ]);

    const offsets = new Float32Array(trees.length * 3);
    const scales = new Float32Array(trees.length);
    const phases = new Float32Array(trees.length);
    const bands = new Float32Array(trees.length);

    const identity = new THREE.Matrix4();
    const canopyMat = new THREE.ShaderMaterial({
      uniforms: {
        ...uniformsBase,
        uStageMode: SHARED.uStageMode,
        uTreeCanopy: this.uTreeCanopy,
        uTreeAccent: this.uTreeAccent
      },
      vertexShader: CANOPY_VERT,
      fragmentShader: CANOPY_FRAG
    });
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);

    trees.forEach((t, i) => {
      dummy.position.set(t.x, 0.22, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      canopyMesh.setMatrixAt(i, identity);
      offsets[i * 3] = t.x;
      offsets[i * 3 + 1] = 0.22;
      offsets[i * 3 + 2] = t.z;
      scales[i] = t.scale;
      phases[i] = t.phase;
      bands[i] = t.band;

      this.obstacleBoxes.push({
        x: t.x,
        z: t.z,
        sx: 5.2 * t.scale,
        sz: 5.2 * t.scale,
        h: 10.6 * t.scale
      });
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    canopyGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
    canopyGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    canopyGeo.setAttribute('aBand', new THREE.InstancedBufferAttribute(bands, 1));

    trunkMesh.frustumCulled = false;
    canopyMesh.frustumCulled = false;
    this.group.add(trunkMesh, canopyMesh);
  }

  buildPathBollards() {
    const { cx, cz, poolW, poolL } = OASIS_BOUNDS;
    const spots = [];

    for (let i = 0; i < 6; i++) {
      const z = cz - poolL / 2 + 12 + i * ((poolL - 24) / 5);
      spots.push([cx - poolW / 2 - 4, z]);
      spots.push([cx + poolW / 2 + 4, z]);
    }
    const bridgeZ = cz - poolL * 0.39;
    for (const bx of [cx - poolW / 2 - 6, cx + poolW / 2 + 6]) {
      for (const bz of [bridgeZ - 5.5, bridgeZ + 5.5]) {
        spots.push([bx, bz]);
      }
    }
    for (const lx of [-34, 0, 34]) {
      spots.push([cx + lx, cz - poolL / 2 - 12]);
      spots.push([cx + lx, cz + poolL / 2 + 12]);
    }

    const postGeo = new THREE.CylinderGeometry(0.14, 0.18, 2.1, 6);
    postGeo.translate(0, 1.05, 0);
    const postMat = new THREE.MeshBasicMaterial({ color: 0x1e283c });
    const mesh = new THREE.InstancedMesh(postGeo, postMat, spots.length);
    const dummy = new THREE.Object3D();
    const cCyan = new THREE.Color(0x00e8ff);
    const cPink = new THREE.Color(0xff2a88);

    spots.forEach(([x, z], i) => {
      dummy.position.set(x, 0.24, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      this.glows.add(x, 2.4, z, 6.5, i % 2 === 0 ? cCyan : cPink, 0.24, (i * 0.41) % 1);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** Renders real-time planar mirror pass for the reflection pool when near view or in Scene 12. */
  renderReflection(renderer, scene, mainCamera, allowReflect = true) {
    if (!allowReflect || renderer.xr.isPresenting || !this.waterMesh) {
      this.uHasReflect.value = 0;
      return;
    }

    const { cx, cz, waterY } = OASIS_BOUNDS;
    const dist = Math.hypot(mainCamera.position.x - cx, mainCamera.position.z - cz);
    if (SHARED.uOasisCymaticMix.value < 0.01 && dist > 680) {
      this.uHasReflect.value = 0;
      return;
    }

    const p = this._reflPos.copy(mainCamera.position);
    if (p.y <= waterY + 0.25) {
      this.uHasReflect.value = 0;
      return;
    }

    mainCamera.getWorldDirection(this._reflDir);
    this.reflectCamera.fov = mainCamera.fov;
    this.reflectCamera.aspect = mainCamera.aspect;
    this.reflectCamera.near = mainCamera.near;
    this.reflectCamera.far = mainCamera.far;
    this.reflectCamera.updateProjectionMatrix();

    // Mirror position & look direction across the horizontal water plane y = waterY
    this.reflectCamera.position.set(p.x, 2 * waterY - p.y, p.z);
    this._reflTgt.set(
      p.x + this._reflDir.x * 200,
      2 * waterY - (p.y + this._reflDir.y * 200),
      p.z + this._reflDir.z * 200
    );
    this.reflectCamera.up.set(0, 1, 0);
    this.reflectCamera.lookAt(this._reflTgt);
    this.reflectCamera.updateMatrixWorld();

    this.uReflectMatrix.value.multiplyMatrices(
      this.reflectCamera.projectionMatrix,
      this.reflectCamera.matrixWorldInverse
    );

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;

    this.waterMesh.visible = false;
    this.basinMesh.visible = false;
    this.terraceMesh.visible = false;
    this.feederMesh.visible = false;

    renderer.setRenderTarget(this.reflectTarget);
    renderer.clear();
    renderer.render(scene, this.reflectCamera);

    this.waterMesh.visible = true;
    this.basinMesh.visible = true;
    this.terraceMesh.visible = true;
    this.feederMesh.visible = true;

    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    this.uHasReflect.value = 1;
  }

  applyVisualMode(mode) {
    if (!mode) return;
    if (mode.poolWater) this.uPoolWater.value.set(...mode.poolWater);
    if (mode.poolRim) {
      this.uPoolRim.value.set(...mode.poolRim);
      this.poolRimMat?.color.setRGB(...mode.poolRim);
    }
    if (mode.treeCanopy) this.uTreeCanopy.value.set(...mode.treeCanopy);
    if (mode.treeAccent) {
      this.uTreeAccent.value.set(...mode.treeAccent);
      this.bridgeRailMat?.color.setRGB(...mode.treeAccent);
    }
    if (mode.zenithColor) this.uZenithColor.value.set(...mode.zenithColor);
  }

  getObstacleBoxes() {
    return this.obstacleBoxes;
  }
}
