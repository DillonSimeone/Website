import * as THREE from 'three';
import { APEX, PYRAMID, STREET, SHARED, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, HUE_MAX, setAudioColor } from './world.js';

// Sky shows live in the laser fan's plane (origin = apex, leaning toward the city).
const SPEC = { bars: 48, width: 1500, base: 150, maxH: 430 };
const SCOPE = { samples: 128, width: 1500, base: 360, amp: 240, beams: 24 };
const TUNNEL = { far: STREET.far, near: STREET.near - 20, height: 42, spacing: 9 };
const CYMATIC = { rings: 10, segs: 128 };

const HUE = HUE_MAX.toFixed(2);

const AUDIO_SAMPLE = /* glsl */ `
uniform sampler2D uAudioTex;
float specAt(float u) { return texture2D(uAudioTex, vec2(u, 0.5)).r; }
float waveAt(float u) { return texture2D(uAudioTex, vec2(u, 0.5)).g - 0.5; }
`;

/* ---------- spectrum bars ---------- */

const BAR_VERT = /* glsl */ `
${AUDIO_SAMPLE}
uniform float uWidth;
uniform float uBase;
uniform float uMaxH;
uniform float uBarHalf;
attribute float aBar;
attribute vec2 aCorner;
varying vec2 vCorner;
varying float vU;
varying float vLevel;
void main() {
  float level = specAt(aBar);
  float h = 8.0 + level * uMaxH;
  vec3 p = vec3((aBar - 0.5) * uWidth + aCorner.x * uBarHalf, uBase + aCorner.y * h, 0.0);
  vCorner = aCorner;
  vU = aBar;
  vLevel = level;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const BAR_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uMix;
uniform float uBeat;
varying vec2 vCorner;
varying float vU;
varying float vLevel;
void main() {
  vec2 e = vec2(1.0 - abs(vCorner.x), 1.0 - vCorner.y);
  vec2 fw = fwidth(vCorner);
  float rim = max(1.0 - smoothstep(fw.x, fw.x * 2.5, e.x), 1.0 - smoothstep(fw.y, fw.y * 3.0, e.y));
  float fill = 0.18 + 0.4 * vCorner.y;
  vec3 c = hueColor(vU * ${HUE});
  vec3 col = c * (fill + rim * 2.1) * (0.28 + vLevel * 1.35);
  col += vec3(1.0) * rim * smoothstep(0.65, 1.0, vLevel) * 0.55;
  col *= 1.0 + uBeat * 0.45;
  col = softHDR(col * uMix, 1.75);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const BAR_BEAM_VERT = /* glsl */ `
${AUDIO_SAMPLE}
uniform float uWidth;
uniform float uBase;
uniform float uMaxH;
attribute float aBar;
attribute float aEnd;
varying float vU;
varying float vEnd;
varying float vLevel;
void main() {
  float level = specAt(aBar);
  vec3 tip = vec3((aBar - 0.5) * uWidth, uBase + 8.0 + level * uMaxH, 0.0);
  vU = aBar;
  vEnd = aEnd;
  vLevel = level;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(tip * aEnd, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uMix;
uniform float uBeat;
uniform float uUseHue;
varying float vU;
varying float vEnd;
varying float vLevel;
void main() {
  vec3 c = mix(hueColor(vU * ${HUE}), hueColor(uHue), uUseHue);
  vec3 col = c * (0.22 + vLevel * 1.45) * mix(1.85, 0.75, vEnd) * (1.0 + uBeat * 0.55);
  col = softHDR(col * uMix, 1.75);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/* ---------- oscilloscope ---------- */

const SCOPE_VERT = /* glsl */ `
${AUDIO_SAMPLE}
uniform float uWidth;
uniform float uBase;
uniform float uAmp;
uniform float uThick;
attribute float aU;
attribute float aSide;
varying float vSide;
varying float vU;
vec2 scopePoint(float u) {
  return vec2((u - 0.5) * uWidth, uBase + waveAt(u) * 2.0 * uAmp);
}
void main() {
  float du = 1.0 / ${SCOPE.samples - 1}.0;
  vec2 a = scopePoint(clamp(aU - du, 0.0, 1.0));
  vec2 b = scopePoint(clamp(aU + du, 0.0, 1.0));
  vec2 t = normalize(b - a + vec2(1e-4, 0.0));
  vec2 n = vec2(-t.y, t.x);
  vec2 p = scopePoint(aU) + n * aSide * uThick;
  vSide = aSide;
  vU = aU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const SCOPE_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uMix;
uniform float uBeat;
uniform float uEnergy;
varying float vSide;
varying float vU;
void main() {
  float core = 1.0 - abs(vSide);
  vec3 c = hueColor(clamp(uHue + (vU - 0.5) * 0.12, 0.0, ${HUE}));
  vec3 col = c * pow(core, 1.6) * (1.35 + uEnergy * 1.55 + uBeat * 1.05);
  col += vec3(1.0) * pow(core, 10.0) * 1.0;
  float edgeFade = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
  col = softHDR(col * edgeFade * uMix, 1.75);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const SCOPE_BEAM_VERT = /* glsl */ `
${AUDIO_SAMPLE}
uniform float uWidth;
uniform float uBase;
uniform float uAmp;
attribute float aBar;
attribute float aEnd;
varying float vU;
varying float vEnd;
varying float vLevel;
void main() {
  float w = waveAt(aBar);
  vec3 tip = vec3((aBar - 0.5) * uWidth, uBase + w * 2.0 * uAmp, 0.0);
  vU = aBar;
  vEnd = aEnd;
  vLevel = clamp(abs(w) * 3.0, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(tip * aEnd, 1.0);
}
`;

/* ---------- street tunnel ---------- */

const TUNNEL_VERT = /* glsl */ `
attribute float aSurf;
varying vec3 vWorld;
varying float vSurf;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vSurf = aSurf;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TUNNEL_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uMix;
uniform float uTravel;
uniform float uBeat;
uniform float uMid;
uniform float uSpacing;
uniform float uNear;
uniform float uApexY;
varying vec3 vWorld;
varying float vSurf;
void main() {
  // Rings of constant z stream out of the pyramid toward the camera.
  float ph = (vWorld.z - uTravel) / uSpacing;
  float k = floor(ph);
  float band = mod(k, 7.0);
  float level = clamp(bandLevel(band), 0.0, 1.4);
  float d = abs(fract(ph) - 0.5) * uSpacing;
  float hw = 0.25 + level * 0.9;
  float px = fwidth(vWorld.z);
  float ring = 1.0 - smoothstep(hw, hw + px * 1.5, d);
  float dense = smoothstep(0.12, 0.45, fwidth(ph));
  ring = mix(ring, 0.35 * hw / uSpacing, dense);
  vec3 col = bandColor(band) * ring * (0.4 + level * 2.3);

  if (vSurf < 1.5) {
    // Laser rails along the floor and up the walls.
    float coord = vSurf < 0.5 ? vWorld.x : vWorld.y;
    float rc = abs(fract(coord / 4.0) - 0.5) * 4.0;
    float rail = 1.0 - smoothstep(0.06, 0.06 + fwidth(coord) * 1.5, rc);
    col += hueColor(uHue) * rail * (0.28 + uMid * 0.9);
    col *= 1.0 - smoothstep(uNear - 40.0, uNear, vWorld.z);
  } else {
    // Projection frustum from the apex: fainter, fades in away from the capstone.
    col *= 0.45 * (1.0 - smoothstep(uApexY - 120.0, uApexY, vWorld.y));
  }

  col *= 1.0 + uBeat * 0.55;
  col = softHDR(col * uMix, 1.65);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/* ---------- cymatic rings (scene 6) ---------- */

const CYMATIC_VERT = /* glsl */ `
${AUDIO_SAMPLE}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform vec2 uCenter;
attribute float aAngle;
attribute float aRing;
attribute float aRadius;
attribute float aHeight;
attribute float aSide;
varying float vSide;
varying float vRing;
varying float vAngle;
varying float vLevel;
void main() {
  float u = aAngle / 6.2831853;
  float band = mod(aRing, 7.0);
  float level = clamp(bandLevel(band), 0.0, 1.4);
  float wave = waveAt(fract(u * 2.0));
  float lobes = 3.0 + floor(aRing);
  float dir = mod(aRing, 2.0) < 0.5 ? 1.0 : -1.0;
  float harm = sin(aAngle * lobes + uTime * (1.2 + aRing * 0.14) * dir);

  float r = aRadius + (wave * 75.0 + harm * (14.0 + level * 42.0)) * (0.35 + uActive * 0.9) + uBeat * 18.0;
  float y = aHeight + harm * (6.0 + level * 26.0) * (0.3 + uActive) + uBass * 18.0;

  float thick = 3.5 + level * 4.5 + uBeat * 3.0;
  float rOff = r + aSide * thick;
  vec3 wp = vec3(uCenter.x + cos(aAngle) * rOff, y, uCenter.y + sin(aAngle) * rOff);

  vSide = aSide;
  vRing = aRing;
  vAngle = u;
  vLevel = level;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const CYMATIC_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uMix;
uniform float uBeat;
uniform float uPeakFreqHue;
uniform float uPeakFlash;
varying float vSide;
varying float vRing;
varying float vAngle;
varying float vLevel;
void main() {
  float core = max(0.0, 1.0 - abs(vSide));
  float band = mod(vRing, 7.0);
  vec3 c = mix(bandColor(band), rawHueColor(uPeakFreqHue), uPeakFlash * 0.55 * uActive);
  vec3 col = c * pow(core, 1.55) * (0.68 + vLevel * 1.7 + uBeat * 0.8);
  col += vec3(1.0) * pow(core, 7.0) * (0.35 + uBeat * 0.55);
  col = softHDR(col * uMix, 1.75);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

function additive(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

function beamGeometry(count) {
  const pos = new Float32Array(count * 6);
  const bar = new Float32Array(count * 2);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    bar[i * 2] = bar[i * 2 + 1] = u;
    end[i * 2] = 0;
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBar', new THREE.BufferAttribute(bar, 1));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  return geo;
}

/**
 * SkyShow - the live rig's visuals, all drawn by the pyramid:
 *  1. laser spectrum bars in the sky, 2. laser oscilloscope in the sky,
 *  3. a laser tunnel projected from the apex down the street.
 * Everything reads the shared audio texture on the GPU; no per-frame geometry work.
 */
export class SkyShow {
  constructor(scene, fanGroup) {
    this.scene = 0;
    this.travel = 0;
    this.shows = [];

    this.shows[1] = this.buildSpectrum(fanGroup);
    this.shows[2] = this.buildScope(fanGroup);
    this.shows[3] = this.buildTunnel(scene);
    this.shows[4] = this.buildCymaticRings(scene);
    for (const s of this.shows) if (s) this.setVisible(s, false);
  }

  buildSpectrum(parent) {
    const n = SPEC.bars;
    const pitch = SPEC.width / n;
    const pos = new Float32Array(n * 4 * 3);
    const bar = new Float32Array(n * 4);
    const corner = new Float32Array(n * 4 * 2);
    const index = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
      corners.forEach(([cx, cy], j) => {
        bar[i * 4 + j] = u;
        corner.set([cx, cy], (i * 4 + j) * 2);
      });
      const v = i * 4;
      index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aBar', new THREE.BufferAttribute(bar, 1));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(index);

    const mix = { value: 0 };
    const common = {
      uAudioTex: SHARED.uAudioTex,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uBeat: SHARED.uBeat,
      uMix: mix,
      uWidth: { value: SPEC.width },
      uBase: { value: SPEC.base },
      uMaxH: { value: SPEC.maxH }
    };
    const bars = new THREE.Mesh(geo, additive({ ...common, uBarHalf: { value: pitch * 0.36 } }, BAR_VERT, BAR_FRAG));
    const beams = new THREE.LineSegments(beamGeometry(n), additive({ ...common, uUseHue: { value: 0 } }, BAR_BEAM_VERT, BEAM_FRAG));
    return this.attach(parent, [beams, bars], mix);
  }

  buildScope(parent) {
    const n = SCOPE.samples;
    const pos = new Float32Array(n * 2 * 3);
    const u = new Float32Array(n * 2);
    const side = new Float32Array(n * 2);
    const index = [];
    for (let i = 0; i < n; i++) {
      u[i * 2] = u[i * 2 + 1] = i / (n - 1);
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < n - 1) {
        const v = i * 2;
        index.push(v, v + 1, v + 3, v, v + 3, v + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setIndex(index);

    const mix = { value: 0 };
    this.scopeThick = { value: 6 };
    const common = {
      uAudioTex: SHARED.uAudioTex,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uBeat: SHARED.uBeat,
      uEnergy: SHARED.uEnergy,
      uMix: mix,
      uWidth: { value: SCOPE.width },
      uBase: { value: SCOPE.base },
      uAmp: { value: SCOPE.amp }
    };
    const ribbon = new THREE.Mesh(geo, additive({ ...common, uThick: this.scopeThick }, SCOPE_VERT, SCOPE_FRAG));
    const beams = new THREE.LineSegments(beamGeometry(SCOPE.beams), additive({ ...common, uUseHue: { value: 1 } }, SCOPE_BEAM_VERT, BEAM_FRAG));
    return this.attach(parent, [beams, ribbon], mix);
  }

  buildTunnel(scene) {
    const { far, near, height } = TUNNEL;
    const x = STREET.half - 0.1;
    const pos = [];
    const surf = [];
    const tri = (a, b, c, s) => {
      pos.push(...a, ...b, ...c);
      surf.push(s, s, s);
    };
    const quad = (a, b, c, d, s) => {
      tri(a, b, c, s);
      tri(a, c, d, s);
    };
    quad([-x, 0.06, far], [x, 0.06, far], [x, 0.06, near], [-x, 0.06, near], 0);
    quad([-x, 0, far], [-x, 0, near], [-x, height, near], [-x, height, far], 1);
    quad([x, 0, far], [x, height, far], [x, height, near], [x, 0, near], 1);

    const apex = [APEX.x, APEX.y - 6, APEX.z];
    const mouth = [[-x, 0.06, far], [x, 0.06, far], [x, height, far], [-x, height, far]];
    for (let i = 0; i < 4; i++) tri(apex, mouth[i], mouth[(i + 1) % 4], 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));

    const mix = { value: 0 };
    this.tunnelTravel = { value: 0 };
    const mat = additive({
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uBeat: SHARED.uBeat,
      uMid: SHARED.uMid,
      uMix: mix,
      uTravel: this.tunnelTravel,
      uSpacing: { value: TUNNEL.spacing },
      uNear: { value: near },
      uApexY: { value: APEX.y }
    }, TUNNEL_VERT, TUNNEL_FRAG);
    const mesh = new THREE.Mesh(geo, mat);

    const edgePts = [];
    for (const m of mouth) edgePts.push(...apex, ...m);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
    this.tunnelEdgeMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const edges = new THREE.LineSegments(edgeGeo, this.tunnelEdgeMat);
    this.tunnelEdgeColor = new THREE.Color();
    return this.attach(scene, [edges, mesh], mix);
  }

  buildCymaticRings(scene) {
    const rings = CYMATIC.rings;
    const segs = CYMATIC.segs;
    const vertsPerRing = (segs + 1) * 2;
    const totalVerts = rings * vertsPerRing;

    const pos = new Float32Array(totalVerts * 3);
    const angle = new Float32Array(totalVerts);
    const ringAttr = new Float32Array(totalVerts);
    const radiusAttr = new Float32Array(totalVerts);
    const heightAttr = new Float32Array(totalVerts);
    const sideAttr = new Float32Array(totalVerts);
    const index = [];

    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1);
      const rad = 140 + t * 580;
      const h = 485 - t * 440;
      const baseV = r * vertsPerRing;
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        const v = baseV + s * 2;
        angle[v] = angle[v + 1] = ang;
        ringAttr[v] = ringAttr[v + 1] = r;
        radiusAttr[v] = radiusAttr[v + 1] = rad;
        heightAttr[v] = heightAttr[v + 1] = h;
        sideAttr[v] = -1;
        sideAttr[v + 1] = 1;
        if (s < segs) {
          index.push(v, v + 1, v + 3, v, v + 3, v + 2);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
    geo.setAttribute('aRing', new THREE.BufferAttribute(ringAttr, 1));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radiusAttr, 1));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(heightAttr, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));
    geo.setIndex(index);

    const mix = { value: 0 };
    const mat = additive({
      uAudioTex: SHARED.uAudioTex,
      uTime: SHARED.uTime,
      uBass: SHARED.uBass,
      uBeat: SHARED.uBeat,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uPeakFreqHue: SHARED.uPeakFreqHue,
      uPeakFlash: SHARED.uPeakFlash,
      uMix: mix,
      uCenter: { value: new THREE.Vector2(PYRAMID.x, PYRAMID.z) }
    }, CYMATIC_VERT, CYMATIC_FRAG);

    const mesh = new THREE.Mesh(geo, mat);
    return this.attach(scene, [mesh], mix);
  }

  attach(parent, objects, mix) {
    objects.forEach((o, i) => {
      o.frustumCulled = false;
      o.renderOrder = 6 + i;
      parent.add(o);
    });
    return { objects, mix };
  }

  setVisible(show, on) {
    for (const o of show.objects) o.visible = on;
  }

  /** 0 = off, 1 = sky spectrum, 2 = sky scope, 3 = street tunnel, 4 = cymatic rings. */
  setScene(n) {
    this.scene = n;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 2.5);
    for (let i = 1; i < this.shows.length; i++) {
      const s = this.shows[i];
      s.mix.value += ((this.scene === i ? 1 : 0) - s.mix.value) * k;
      this.setVisible(s, s.mix.value > 0.01);
    }

    const bass = SHARED.uBass.value;
    this.scopeThick.value = 5 + SHARED.uEnergy.value * 9 + SHARED.uBeat.value * 6;

    if (this.shows[3].mix.value > 0.01) {
      this.travel += dt * (24 + bass * 90 + SHARED.uBeat.value * 40);
      this.tunnelTravel.value = this.travel % (TUNNEL.spacing * 7 * 1000);
      setAudioColor(this.tunnelEdgeColor, SHARED.uHue.value, 0.6).multiplyScalar(1.5 + SHARED.uBeat.value * 2);
      this.tunnelEdgeMat.color.copy(this.tunnelEdgeColor);
      this.tunnelEdgeMat.opacity = this.shows[3].mix.value;
    }
  }
}
