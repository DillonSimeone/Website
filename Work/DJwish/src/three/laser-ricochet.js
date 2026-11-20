import * as THREE from 'three';
import {
  APEX,
  STREET,
  SHARED,
  FOG_PARS,
  AUDIO_PARS,
  HUE_UNIFORMS,
  OUTPUT_CHUNK,
  MAX_LASER_HITS,
  mulberry32
} from './world.js';

const NUM_VOLLEYS = 6;
const PACKETS_PER_VOLLEY = 3;
const NUM_CHAINS = NUM_VOLLEYS * PACKETS_PER_VOLLEY; // 18 packet chains
const BOUNCES_PER_CHAIN = 4; // Seg 0: Apex->W1, Seg 1: W1->W2, Seg 2: W2->W3, Seg 3: W3->W4
const TOTAL_SEGS = NUM_CHAINS * BOUNCES_PER_CHAIN;
const RATIO_STOPS = [0.0, 0.45, 0.63, 0.81, 1.0];

const FX_SLOTS = 16;
const STRING_SEGS = 14;

const PACKET_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aColor;
attribute float aProgress;
attribute float aWidth;
attribute float aSegRatio0;
attribute float aSegRatio1;

uniform float uRicochetMix;

varying float vPathT;
varying float vSide;
varying float vProgress;
varying float vDepth;
varying vec3 vColor;

void main() {
  vSide = position.y;
  vPathT = mix(aSegRatio0, aSegRatio1, position.x);
  vProgress = aProgress;
  vColor = aColor;

  if (aProgress < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vDepth = 9999.0;
    return;
  }

  vec3 wp = mix(aStart, aEnd, position.x);
  vec4 mvA = viewMatrix * vec4(aStart, 1.0);
  vec4 mvB = viewMatrix * vec4(aEnd, 1.0);
  vec4 mvP = viewMatrix * vec4(wp, 1.0);
  vDepth = -mvP.z;

  vec2 dir = mvB.xy - mvA.xy;
  float len = length(dir);
  vec2 perp = len > 0.0001 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);

  float distScale = clamp(-mvP.z * 0.0042, 0.16, 1.5);
  float halfW = aWidth * distScale * uRicochetMix;
  mvP.xy += perp * position.y * halfW;

  gl_Position = projectionMatrix * mvP;
}
`;

const PACKET_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uRicochetMix;

varying float vPathT;
varying float vSide;
varying float vProgress;
varying float vDepth;
varying vec3 vColor;

void main() {
  if (uRicochetMix < 0.005 || vProgress < 0.0) discard;

  // Render strictly discrete moving plasma slugs (zero persistent background solid beams)
  float tailLen = vPathT < 0.45 ? 0.048 : 0.145;
  float ahead = vPathT - vProgress;
  float behind = vProgress - vPathT;
  if (ahead > 0.015 || behind > tailLen) discard;

  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  if (fogF >= 0.995) discard;

  float edge = abs(vSide);
  float core = exp(-edge * edge * 14.0);
  float halo = exp(-edge * edge * 2.6) * 0.55;

  float head = ahead > 0.0
    ? (1.0 - smoothstep(0.0, 0.015, ahead))
    : exp(-behind / (tailLen * 0.34));
  float slugHot = exp(-abs(behind - 0.008) / (tailLen * 0.16));

  vec3 rgb = (vColor * head * 1.45 + mix(vColor, vec3(1.0), 0.55) * slugHot * 0.9) * (core + halo);
  vec3 col = softHDR(rgb * uRicochetMix * (1.0 - fogF * 0.65), 1.72);

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const IMPACT_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aColor;
attribute float aAge;
attribute float aTier;
attribute float aSize;

uniform float uRicochetMix;

varying vec2 vUv;
varying vec3 vColor;
varying float vFlash;
varying float vTier;
varying float vAge;
varying float vDepth;

void main() {
  vUv = uv;
  vColor = aColor;
  vTier = aTier;
  vAge = aAge;

  if (aAge < 0.0 || aAge >= 1.0) {
    vFlash = 0.0;
    vDepth = 9999.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float spark = (1.0 - smoothstep(0.0, 1.0, aAge));
  // High-freq purple tier flickers with fast piezo jitter
  if (aTier > 1.5) {
    spark *= 0.6 + 0.55 * abs(sin(aAge * 44.0));
  }
  vFlash = spark * 1.65 * uRicochetMix;

  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  vDepth = -mv.z;
  float jitter = aTier > 1.5 ? sin(aAge * 70.0) * 0.35 : 0.0;
  float scale = aSize * (0.65 + 0.85 * spark) * uRicochetMix;
  mv.xy += (position.xy + vec2(jitter * 0.08, -jitter * 0.06)) * scale;
  gl_Position = projectionMatrix * mv;
}
`;

const IMPACT_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
varying vec2 vUv;
varying vec3 vColor;
varying float vFlash;
varying float vTier;
varying float vAge;
varying float vDepth;

void main() {
  if (vFlash < 0.005) discard;
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  if (fogF >= 0.995) discard;

  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float core = exp(-r * r * 16.0);
  float star = exp(-abs(p.x) * 24.0 - abs(p.y) * 4.5) + exp(-abs(p.y) * 24.0 - abs(p.x) * 4.5);

  // Purple tier renders crisp trembling piezo shock rings around hit
  float piezoRing = vTier > 1.5 ? exp(-pow(r - (0.3 + 0.5 * vAge), 2.0) * 55.0) * 0.85 : 0.0;
  float mask = (core + star * 0.45 + piezoRing) * (1.0 - smoothstep(0.75, 1.0, r));

  vec3 col = softHDR(mix(vColor, vec3(1.0), core * 0.4) * mask * vFlash, 1.7);
  col *= (1.0 - fogF);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const RIPPLE_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const RIPPLE_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uAge;
uniform vec3 uColor;
uniform float uRicochetMix;

varying vec2 vUv;
varying float vDepth;

void main() {
  if (uAge < 0.0 || uAge >= 1.0 || uRicochetMix < 0.005) discard;
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  if (fogF >= 0.995) discard;

  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ringA = exp(-pow(r - mix(0.08, 0.88, uAge), 2.0) * 48.0);
  float ringB = exp(-pow(r - mix(0.04, 0.62, uAge), 2.0) * 40.0) * 0.65;
  float fade = (1.0 - smoothstep(0.15, 1.0, uAge)) * (1.0 - smoothstep(0.84, 1.0, r));

  vec3 col = softHDR(uColor * (ringA + ringB) * 1.45 * fade * uRicochetMix, 1.65);
  col *= (1.0 - fogF);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const STRING_VERT = /* glsl */ `
attribute vec3 aAnchor0;
attribute vec3 aAnchor1;
attribute vec3 aColor;
attribute float aAge;
attribute float aFreq;

uniform float uRicochetMix;

varying float vU;
varying float vSide;
varying float vAge;
varying vec3 vColor;
varying float vDepth;

void main() {
  // position.x in [0..1] along plucked string span, position.y in [-1..1] ribbon half-width
  vU = position.x;
  vSide = position.y;
  vAge = aAge;
  vColor = aColor;

  if (aAge < 0.0 || aAge >= 1.0) {
    vDepth = 9999.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 wp = mix(aAnchor0, aAnchor1, position.x);
  // Pluck standing-wave oscillation (fundamental + 2nd harmonic) orthogonal to canyon wall
  float env = sin(position.x * 3.14159265) * exp(-aAge * 2.6);
  float vib = (sin(aAge * aFreq) * 0.75 + sin(position.x * 6.283185 + aAge * aFreq * 1.5) * 0.25) * env;
  wp.x += (aAnchor0.x > 0.0 ? -1.0 : 1.0) * vib * 1.45;
  wp.y += cos(aAge * aFreq * 0.8) * env * 0.65;

  vec4 mvA = viewMatrix * vec4(aAnchor0, 1.0);
  vec4 mvB = viewMatrix * vec4(aAnchor1, 1.0);
  vec4 mvP = viewMatrix * vec4(wp, 1.0);
  vDepth = -mvP.z;

  vec2 sDir = mvB.xy - mvA.xy;
  float len = length(sDir);
  vec2 perp = len > 0.0001 ? vec2(-sDir.y, sDir.x) / len : vec2(0.0, 1.0);
  mvP.xy += perp * position.y * 0.28 * uRicochetMix;

  gl_Position = projectionMatrix * mvP;
}
`;

const STRING_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uRicochetMix;

varying float vU;
varying float vSide;
varying float vAge;
varying vec3 vColor;
varying float vDepth;

void main() {
  if (vAge < 0.0 || vAge >= 1.0 || uRicochetMix < 0.005) discard;
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  if (fogF >= 0.995) discard;

  float core = exp(-vSide * vSide * 10.0);
  float fade = (1.0 - smoothstep(0.1, 1.0, vAge)) * sin(clamp(vU, 0.0, 1.0) * 3.14159265);
  vec3 col = softHDR(mix(vColor, vec3(1.0), core * 0.35) * core * fade * 1.55 * uRicochetMix, 1.65);
  col *= (1.0 - fogF);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

function computeLiveHeightScale(b, t, bands, beat, react) {
  if (react <= 0.001) return 1;
  const lvl = Math.min(1.35, Math.max(0, bands[b.band] || 0));
  const isMuralSafe = b.amp < 0.3;
  if (b.arch < 0.5) {
    const wave = 0.5 + 0.5 * Math.sin(t * 2.4 + b.phase);
    const minS = isMuralSafe ? 1.0 : 0.48;
    const baseS = isMuralSafe ? 1.0 : 0.65;
    const maxS = isMuralSafe ? 1.32 : 2.25;
    return Math.min(maxS, Math.max(minS, baseS + (lvl * 0.9 + beat * 0.35 + wave * 0.28 * lvl) * react * b.amp));
  }
  if (b.arch < 1.5) return 1 + (lvl * 0.25 + beat * 0.15) * react * b.amp;
  if (b.arch < 2.5) return Math.min(1.85, Math.max(0.56, 1.0 + ((lvl - 0.25) * 0.72 + beat * 0.32) * react * b.amp));
  const bounce = Math.abs(Math.sin(t * 2.8 + b.phase));
  return Math.min(1.9, Math.max(0.72, 1.0 + (bounce * lvl * 0.62 + beat * 0.28) * react * b.amp));
}

/**
 * WindowRicochetShow - Scene 8 ("LASER RICOCHET") & Scene 9 companion:
 * Fires volleys of 3 trackable plasma laser packets derived from the top 3 loudest live
 * FFT frequencies (`telemetry.topPeaks`), bouncing optically off exact street window centers:
 *  - Low (<250Hz, Red): expanding bass ripple rings across struck walls + shader bulge
 *  - Mid (250Hz-4kHz, Yellow-Green): 3D plucked vibrating harmonic strings across canyon/walls
 *  - High (>=4kHz, Purple): high-frequency crackling piezo surface jitter & shimmer
 */
export class WindowRicochetShow {
  constructor(scene, streetBoxes = []) {
    this.scene = scene;
    this.rng = mulberry32(7331);
    this.windows = this.extractWindowPool(streetBoxes);

    this.chains = [];
    this.nextVolley = 0;
    this.volleyTimer = 0.1;
    this.beatCooldown = 0;

    this.impacts = Array.from({ length: FX_SLOTS }, () => ({
      x: 0, y: 0, z: 0, age: -1, duration: 0.42, tier: 0, size: 5.5, r: 1, g: 0.2, b: 0.2
    }));
    this.nextImpactSlot = 0;

    this.strings = Array.from({ length: FX_SLOTS }, () => ({
      x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, age: -1, duration: 1.35, freq: 44, r: 0.8, g: 1, b: 0.2
    }));
    this.nextStringSlot = 0;

    this.nextShaderHitSlot = 0;

    this._tmpColor = new THREE.Color();
    this._beamGeo = this.buildBeamGeometry();
    this._impactGeo = this.buildImpactGeometry();
    this._stringGeo = this.buildStringGeometry();

    const baseUniforms = {
      uRicochetMix: SHARED.uRicochetMix,
      uHue: SHARED.uHue,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      ...HUE_UNIFORMS
    };

    this.beamMat = new THREE.ShaderMaterial({
      uniforms: baseUniforms,
      vertexShader: PACKET_VERT,
      fragmentShader: PACKET_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.beamMesh = new THREE.Mesh(this._beamGeo, this.beamMat);
    this.beamMesh.frustumCulled = false;
    this.beamMesh.renderOrder = 6;
    this.beamMesh.visible = false;

    this.impactMat = new THREE.ShaderMaterial({
      uniforms: baseUniforms,
      vertexShader: IMPACT_VERT,
      fragmentShader: IMPACT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.impactMesh = new THREE.Mesh(this._impactGeo, this.impactMat);
    this.impactMesh.frustumCulled = false;
    this.impactMesh.renderOrder = 7;
    this.impactMesh.visible = false;

    this.stringMat = new THREE.ShaderMaterial({
      uniforms: baseUniforms,
      vertexShader: STRING_VERT,
      fragmentShader: STRING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.stringMesh = new THREE.Mesh(this._stringGeo, this.stringMat);
    this.stringMesh.frustumCulled = false;
    this.stringMesh.renderOrder = 7;
    this.stringMesh.visible = false;

    scene.add(this.beamMesh, this.impactMesh, this.stringMesh);

    // 16 wall-aligned bass ripple rings (Red low-freq tier)
    const ringGeo = new THREE.PlaneGeometry(34, 34);
    this.ripples = [];
    for (let i = 0; i < FX_SLOTS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...baseUniforms,
          uAge: { value: -1 },
          uColor: { value: new THREE.Color(1.0, 0.15, 0.08) }
        },
        vertexShader: RIPPLE_VERT,
        fragmentShader: RIPPLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.ripples.push({ mesh, mat, age: -1, duration: 1.05 });
    }
    this.nextRippleSlot = 0;

    for (let i = 0; i < NUM_CHAINS; i++) {
      this.chains.push({
        active: false,
        delay: 0,
        age: 0,
        duration: 1.05,
        tier: i % 3,
        hue: 0,
        mag: 0.7,
        color: new THREE.Color(),
        nodes: this.pickWindowChain(i),
        bounced: [false, false, false, false]
      });
    }
  }

  extractWindowPool(streetBoxes) {
    const pool = [];
    for (const box of streetBoxes) {
      if (!box || box.h < 12 || !box.side) continue;
      const colLim = Math.floor((box.sz * 0.5 - 1.5) / 3.4);
      const minRow = 2;
      const maxRow = Math.floor((box.h - 2.4) / 3.8);
      if (maxRow < minRow || colLim < 0) continue;

      const xFace = box.side * (STREET.half - 0.08);
      for (let col = -colLim; col <= colLim - 1; col += 2) {
        const zLocal = (col + 0.5) * 3.4;
        const wz = box.z + zLocal;
        if (wz < STREET.far + 8 || wz > STREET.near - 12) continue;
        for (let r = minRow; r <= maxRow; r += 2) {
          const baseY = (r + 0.55) * 3.8;
          if (baseY > 7 && baseY < box.h - 1.5) {
            pool.push({ box, x: xFace, z: wz, baseY, side: box.side });
          }
        }
      }
    }
    return pool;
  }

  buildBeamGeometry() {
    const vertsPerSeg = 4;
    const idxPerSeg = 6;
    const pos = new Float32Array(TOTAL_SEGS * vertsPerSeg * 3);
    const start = new Float32Array(TOTAL_SEGS * vertsPerSeg * 3);
    const end = new Float32Array(TOTAL_SEGS * vertsPerSeg * 3);
    const col = new Float32Array(TOTAL_SEGS * vertsPerSeg * 3);
    const prog = new Float32Array(TOTAL_SEGS * vertsPerSeg).fill(-1);
    const width = new Float32Array(TOTAL_SEGS * vertsPerSeg);
    const r0 = new Float32Array(TOTAL_SEGS * vertsPerSeg);
    const r1 = new Float32Array(TOTAL_SEGS * vertsPerSeg);
    const indices = new Uint16Array(TOTAL_SEGS * idxPerSeg);

    const uvCorners = [[0, -1], [1, -1], [1, 1], [0, 1]];
    for (let s = 0; s < TOTAL_SEGS; s++) {
      const vb = s * vertsPerSeg;
      for (let v = 0; v < 4; v++) {
        pos[(vb + v) * 3] = uvCorners[v][0];
        pos[(vb + v) * 3 + 1] = uvCorners[v][1];
      }
      const ib = s * idxPerSeg;
      indices[ib] = vb; indices[ib + 1] = vb + 1; indices[ib + 2] = vb + 2;
      indices[ib + 3] = vb; indices[ib + 4] = vb + 2; indices[ib + 5] = vb + 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aProgress', new THREE.BufferAttribute(prog, 1));
    geo.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
    geo.setAttribute('aSegRatio0', new THREE.BufferAttribute(r0, 1));
    geo.setAttribute('aSegRatio1', new THREE.BufferAttribute(r1, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }

  buildImpactGeometry() {
    const vertsPerQuad = 4;
    const idxPerQuad = 6;
    const pos = new Float32Array(FX_SLOTS * vertsPerQuad * 3);
    const uv = new Float32Array(FX_SLOTS * vertsPerQuad * 2);
    const aPos = new Float32Array(FX_SLOTS * vertsPerQuad * 3);
    const col = new Float32Array(FX_SLOTS * vertsPerQuad * 3);
    const age = new Float32Array(FX_SLOTS * vertsPerQuad).fill(-1);
    const tier = new Float32Array(FX_SLOTS * vertsPerQuad);
    const size = new Float32Array(FX_SLOTS * vertsPerQuad);
    const indices = new Uint16Array(FX_SLOTS * idxPerQuad);

    const corners = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
    for (let q = 0; q < FX_SLOTS; q++) {
      const vb = q * vertsPerQuad;
      for (let v = 0; v < 4; v++) {
        pos[(vb + v) * 3] = corners[v][0];
        pos[(vb + v) * 3 + 1] = corners[v][1];
        uv[(vb + v) * 2] = corners[v][2];
        uv[(vb + v) * 2 + 1] = corners[v][3];
      }
      const ib = q * idxPerQuad;
      indices[ib] = vb; indices[ib + 1] = vb + 1; indices[ib + 2] = vb + 2;
      indices[ib + 3] = vb; indices[ib + 4] = vb + 2; indices[ib + 5] = vb + 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aPos', new THREE.BufferAttribute(aPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    geo.setAttribute('aTier', new THREE.BufferAttribute(tier, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }

  buildStringGeometry() {
    // FX_SLOTS strings * STRING_SEGS quads
    const quadsPerStr = STRING_SEGS;
    const vertsPerQuad = 4;
    const totalQuads = FX_SLOTS * quadsPerStr;
    const pos = new Float32Array(totalQuads * vertsPerQuad * 3);
    const a0 = new Float32Array(totalQuads * vertsPerQuad * 3);
    const a1 = new Float32Array(totalQuads * vertsPerQuad * 3);
    const col = new Float32Array(totalQuads * vertsPerQuad * 3);
    const age = new Float32Array(totalQuads * vertsPerQuad).fill(-1);
    const freq = new Float32Array(totalQuads * vertsPerQuad);
    const indices = new Uint16Array(totalQuads * 6);

    for (let s = 0; s < FX_SLOTS; s++) {
      for (let q = 0; q < quadsPerStr; q++) {
        const gIdx = s * quadsPerStr + q;
        const vb = gIdx * 4;
        const u0 = q / quadsPerStr;
        const u1 = (q + 1) / quadsPerStr;
        const pts = [[u0, -1], [u1, -1], [u1, 1], [u0, 1]];
        for (let v = 0; v < 4; v++) {
          pos[(vb + v) * 3] = pts[v][0];
          pos[(vb + v) * 3 + 1] = pts[v][1];
        }
        const ib = gIdx * 6;
        indices[ib] = vb; indices[ib + 1] = vb + 1; indices[ib + 2] = vb + 2;
        indices[ib + 3] = vb; indices[ib + 4] = vb + 2; indices[ib + 5] = vb + 3;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAnchor0', new THREE.BufferAttribute(a0, 3));
    geo.setAttribute('aAnchor1', new THREE.BufferAttribute(a1, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    geo.setAttribute('aFreq', new THREE.BufferAttribute(freq, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }

  pickWindowChain(chainIdx) {
    if (!this.windows.length) {
      const side = chainIdx % 2 === 0 ? -1 : 1;
      const zBase = -110 + (chainIdx % 6) * 42;
      return [
        { x: side * 15.9, baseY: 18, z: zBase, side, box: null },
        { x: -side * 15.9, baseY: 22, z: zBase + 38, side: -side, box: null },
        { x: side * 15.9, baseY: 16, z: zBase + 76, side, box: null },
        { x: -side * 15.9, baseY: 26, z: zBase + 112, side: -side, box: null }
      ];
    }

    const startSide = this.rng() < 0.5 ? -1 : 1;
    const zBand = -135 + this.rng() * 270;
    const candidates = this.windows.filter(w => w.side === startSide && Math.abs(w.z - zBand) < 55);
    const pool = candidates.length ? candidates : this.windows.filter(w => w.side === startSide);
    const w0 = pool[Math.floor(this.rng() * pool.length)] || this.windows[0];

    const nodes = [w0];
    const zStep = w0.z < 40 ? 28 + this.rng() * 34 : -(26 + this.rng() * 32);
    let cur = w0;

    for (let b = 1; b < BOUNCES_PER_CHAIN; b++) {
      const nextSide = -cur.side;
      const targetZ = Math.max(STREET.far + 12, Math.min(STREET.near - 16, cur.z + zStep));
      const targetY = Math.max(9, Math.min(36, cur.baseY + (this.rng() - 0.52) * 10));

      let best = null;
      let bestScore = Infinity;
      for (const cand of this.windows) {
        if (cand.side !== nextSide) continue;
        const dz = cand.z - targetZ;
        const dy = cand.baseY - targetY;
        const d = dz * dz + dy * dy * 1.8;
        if (d < bestScore) {
          bestScore = d;
          best = cand;
        }
      }
      if (!best) {
        best = { box: null, x: nextSide * (STREET.half - 0.08), z: targetZ, baseY: targetY, side: nextSide };
      }
      nodes.push(best);
      cur = best;
    }
    return nodes;
  }

  tierColor(tier, freqHue, out) {
    if (tier === 0) {
      // Low frequency (<250Hz): vivid red / molten orange-red
      return out.setHSL(0.985 + (freqHue * 0.4) % 0.04, 1.0, 0.55);
    }
    if (tier === 1) {
      // Mid frequency (250Hz..4kHz): vivid yellow -> lime green
      const t = Math.min(1, Math.max(0, (freqHue - 0.2) / 0.35));
      return out.setHSL(0.14 + t * 0.2, 1.0, 0.54);
    }
    // High frequency (>=4kHz): violet -> neon purple
    const t = Math.min(1, Math.max(0, (freqHue - 0.55) / 0.25));
    return out.setHSL(0.73 + t * 0.09, 0.98, 0.58);
  }

  fireVolley(telemetry) {
    const peaks = telemetry?.topPeaks || [
      { tier: 0, hue: 0.02, mag: 0.7 },
      { tier: 1, hue: 0.28, mag: 0.65 },
      { tier: 2, hue: 0.72, mag: 0.6 }
    ];

    const vIdx = this.nextVolley;
    this.nextVolley = (vIdx + 1) % NUM_VOLLEYS;

    for (let k = 0; k < PACKETS_PER_VOLLEY; k++) {
      const p = peaks[k] || peaks[0];
      const ch = this.chains[vIdx * PACKETS_PER_VOLLEY + k];
      ch.active = true;
      ch.delay = k * 0.045;
      ch.age = 0;
      ch.duration = 0.95 + this.rng() * 0.16;
      ch.tier = p.tier;
      ch.hue = p.hue;
      ch.mag = Math.max(0.45, Math.min(1.2, (p.mag || 0.5) * 1.15));
      this.tierColor(p.tier, p.hue, ch.color);
      ch.nodes = this.pickWindowChain(vIdx * 3 + k);
      ch.bounced.fill(false);
    }
  }

  triggerSurfaceImpact(pt, prevPt, ch, bounceIdx) {
    const gain = 0.95 + ch.mag * 0.75;
    const r = ch.color.r * gain;
    const g = ch.color.g * gain;
    const b = ch.color.b * gain;

    // 1. Window spark flare
    const imp = this.impacts[this.nextImpactSlot];
    this.nextImpactSlot = (this.nextImpactSlot + 1) % FX_SLOTS;
    imp.x = pt.x;
    imp.y = pt.y;
    imp.z = pt.z;
    imp.age = 0;
    imp.duration = ch.tier === 2 ? 0.52 : 0.36;
    imp.tier = ch.tier;
    imp.size = ch.tier === 2 ? 7.2 : 5.4;
    imp.r = r; imp.g = g; imp.b = b;

    // 2. Shared building deformation shader uniform slot
    const sIdx = this.nextShaderHitSlot;
    this.nextShaderHitSlot = (this.nextShaderHitSlot + 1) % MAX_LASER_HITS;
    SHARED.uLaserHits.value[sIdx].set(pt.x, pt.y, pt.z, 0.001);
    SHARED.uLaserHitInfo.value[sIdx].set(ch.tier, Math.min(1.25, ch.mag), ch.hue, pt.side || 1);

    // 3. Tier-specific 3D surface effect
    if (ch.tier === 0) {
      // Low Freq (Red): flush canyon wall expanding bass ripple ring
      const rp = this.ripples[this.nextRippleSlot];
      this.nextRippleSlot = (this.nextRippleSlot + 1) % FX_SLOTS;
      rp.age = 0;
      rp.duration = 1.05;
      rp.mat.uniforms.uColor.value.setRGB(r, g, b);
      rp.mesh.position.set(pt.x - (pt.side || 1) * 0.14, pt.y, pt.z);
      rp.mesh.rotation.set(0, (pt.side || 1) > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      rp.mesh.visible = true;
    } else if (ch.tier === 1 && bounceIdx >= 1) {
      // Mid Freq (Yellow-Green): plucked vibrating harmonic string anchored to facade/canyon
      const st = this.strings[this.nextStringSlot];
      this.nextStringSlot = (this.nextStringSlot + 1) % FX_SLOTS;
      st.x0 = prevPt.x;
      st.y0 = prevPt.y;
      st.z0 = prevPt.z;
      st.x1 = pt.x;
      st.y1 = pt.y;
      st.z1 = pt.z;
      st.age = 0;
      st.duration = 1.35;
      st.freq = 36 + this.rng() * 24;
      st.r = r; st.g = g; st.b = b;
    }
  }

  update(dt, telemetry) {
    const mix = SHARED.uRicochetMix.value;
    const vis = mix > 0.005;
    this.beamMesh.visible = vis;
    this.impactMesh.visible = vis;
    this.stringMesh.visible = vis;

    const hits = SHARED.uLaserHits.value;
    if (!vis) {
      for (let i = 0; i < MAX_LASER_HITS; i++) hits[i].w = -1;
      for (const rp of this.ripples) rp.mesh.visible = false;
      return;
    }

    const t = SHARED.uTime.value;
    const bands = SHARED.uBands.value;
    const beat = SHARED.uBeat.value;
    const active = SHARED.uActive.value;
    const react = SHARED.uStageMode.value * active * SHARED.uBuildingMotion.value * SHARED.uBuildingBoost.value;

    // Advance building laser-impact uniform ages (~1.4s surface dissipation)
    for (let i = 0; i < MAX_LASER_HITS; i++) {
      if (hits[i].w >= 0) {
        hits[i].w += dt / 1.4;
        if (hits[i].w >= 1.0) hits[i].w = -1;
      }
    }

    // Spawn 3-packet volleys aligned to live audio beats & cadence
    this.beatCooldown = Math.max(0, this.beatCooldown - dt);
    this.volleyTimer -= dt;
    if ((beat > 0.72 && this.beatCooldown <= 0) || this.volleyTimer <= 0) {
      this.fireVolley(telemetry);
      this.beatCooldown = 0.28;
      this.volleyTimer = 0.42;
    }

    const startAttr = this._beamGeo.attributes.aStart;
    const endAttr = this._beamGeo.attributes.aEnd;
    const bColAttr = this._beamGeo.attributes.aColor;
    const bProgAttr = this._beamGeo.attributes.aProgress;
    const bWidthAttr = this._beamGeo.attributes.aWidth;
    const r0Attr = this._beamGeo.attributes.aSegRatio0;
    const r1Attr = this._beamGeo.attributes.aSegRatio1;

    for (let c = 0; c < NUM_CHAINS; c++) {
      const ch = this.chains[c];
      let prog = -1;

      const pts = [APEX];
      for (let b = 0; b < BOUNCES_PER_CHAIN; b++) {
        const node = ch.nodes[b];
        const sY = node.box ? computeLiveHeightScale(node.box, t, bands, beat, react) : 1;
        pts.push({
          x: node.x,
          y: Math.max(5.5, node.baseY * sY),
          z: node.z,
          side: node.side
        });
      }

      if (ch.active) {
        if (ch.delay > 0) {
          ch.delay -= dt;
        } else {
          ch.age += dt;
          prog = ch.age / ch.duration;
          if (prog >= 1.15) {
            ch.active = false;
            prog = -1;
          } else {
            // Check exact bounce thresholds to trigger tier-specific surface impacts
            for (let b = 0; b < BOUNCES_PER_CHAIN; b++) {
              if (!ch.bounced[b] && prog >= RATIO_STOPS[b + 1]) {
                ch.bounced[b] = true;
                this.triggerSurfaceImpact(pts[b + 1], pts[b], ch, b);
              }
            }
          }
        }
      }

      const gain = 1.0 + ch.mag * 0.9 * active + beat * 0.35 * active;
      const cr = ch.color.r * gain;
      const cg = ch.color.g * gain;
      const cb = ch.color.b * gain;

      for (let seg = 0; seg < BOUNCES_PER_CHAIN; seg++) {
        const sIdx = c * BOUNCES_PER_CHAIN + seg;
        const pA = pts[seg];
        const pB = pts[seg + 1];
        const segW = seg === 0 ? 0.62 : 0.42;

        for (let v = 0; v < 4; v++) {
          const vi = sIdx * 4 + v;
          startAttr.setXYZ(vi, pA.x, pA.y, pA.z);
          endAttr.setXYZ(vi, pB.x, pB.y, pB.z);
          bColAttr.setXYZ(vi, cr, cg, cb);
          bProgAttr.setX(vi, prog);
          bWidthAttr.setX(vi, segW);
          r0Attr.setX(vi, RATIO_STOPS[seg]);
          r1Attr.setX(vi, RATIO_STOPS[seg + 1]);
        }
      }
    }

    startAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
    bColAttr.needsUpdate = true;
    bProgAttr.needsUpdate = true;
    bWidthAttr.needsUpdate = true;
    r0Attr.needsUpdate = true;
    r1Attr.needsUpdate = true;

    // Update impact glints
    const iPos = this._impactGeo.attributes.aPos;
    const iCol = this._impactGeo.attributes.aColor;
    const iAge = this._impactGeo.attributes.aAge;
    const iTier = this._impactGeo.attributes.aTier;
    const iSize = this._impactGeo.attributes.aSize;

    for (let q = 0; q < FX_SLOTS; q++) {
      const imp = this.impacts[q];
      let normAge = -1;
      if (imp.age >= 0) {
        imp.age += dt;
        normAge = imp.age / imp.duration;
        if (normAge >= 1) {
          imp.age = -1;
          normAge = -1;
        }
      }
      for (let v = 0; v < 4; v++) {
        const vi = q * 4 + v;
        iPos.setXYZ(vi, imp.x, imp.y, imp.z);
        iCol.setXYZ(vi, imp.r, imp.g, imp.b);
        iAge.setX(vi, normAge);
        iTier.setX(vi, imp.tier);
        iSize.setX(vi, imp.size);
      }
    }
    iPos.needsUpdate = true;
    iCol.needsUpdate = true;
    iAge.needsUpdate = true;
    iTier.needsUpdate = true;
    iSize.needsUpdate = true;

    // Update wall bass ripple rings (Red low-freq tier)
    for (let i = 0; i < FX_SLOTS; i++) {
      const rp = this.ripples[i];
      if (rp.age >= 0) {
        rp.age += dt;
        const norm = rp.age / rp.duration;
        if (norm >= 1) {
          rp.age = -1;
          rp.mat.uniforms.uAge.value = -1;
          rp.mesh.visible = false;
        } else {
          rp.mat.uniforms.uAge.value = norm;
          rp.mesh.visible = true;
        }
      } else {
        rp.mesh.visible = false;
      }
    }

    // Update plucked harmonic strings (Yellow-Green mid-freq tier)
    const sA0 = this._stringGeo.attributes.aAnchor0;
    const sA1 = this._stringGeo.attributes.aAnchor1;
    const sCol = this._stringGeo.attributes.aColor;
    const sAge = this._stringGeo.attributes.aAge;
    const sFreq = this._stringGeo.attributes.aFreq;

    for (let s = 0; s < FX_SLOTS; s++) {
      const st = this.strings[s];
      let norm = -1;
      if (st.age >= 0) {
        st.age += dt;
        norm = st.age / st.duration;
        if (norm >= 1) {
          st.age = -1;
          norm = -1;
        }
      }
      for (let q = 0; q < STRING_SEGS; q++) {
        const gIdx = s * STRING_SEGS + q;
        for (let v = 0; v < 4; v++) {
          const vi = gIdx * 4 + v;
          sA0.setXYZ(vi, st.x0, st.y0, st.z0);
          sA1.setXYZ(vi, st.x1, st.y1, st.z1);
          sCol.setXYZ(vi, st.r, st.g, st.b);
          sAge.setX(vi, norm);
          sFreq.setX(vi, st.freq);
        }
      }
    }
    sA0.needsUpdate = true;
    sA1.needsUpdate = true;
    sCol.needsUpdate = true;
    sAge.needsUpdate = true;
    sFreq.needsUpdate = true;
  }
}
