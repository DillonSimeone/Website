import * as THREE from 'three';
import { PYRAMID, APEX, SHARED, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, HUE_MAX, setAudioColor } from './world.js';

const TILE_METRES = 72; // one brick texture tile = 8 courses of 9 m blocks
const SEARCHLIGHTS = 6;

/*
 * Brick-face animations (emissive, masked by the brick texture so mortar stays dark):
 *  1 band courses  - seven horizontal bands, bass at the base in red up to air at the top in purple
 *  2 beat scans    - a ring of light climbs the faces on every beat
 *  3 apex pour     - band-coloured pulses pour down from the apex (feeds the street tunnel)
 *  4 VU fill       - the pyramid fills from the base with the volume, peak line on top
 *  5 face split    - each face pulses its own band under the searchlights
 */
const PYRAMID_FX = /* glsl */ `
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uLevel;
uniform float uPyrMode;
uniform float uFxMix;
uniform float uFlow;
uniform vec4 uScanAge;
vec3 pyramidFx(vec3 wp, vec3 tex) {
  if (uPyrMode < 0.5 || uFxMix < 0.001) return vec3(0.0);
  float H = ${PYRAMID.height.toFixed(1)};
  float h = clamp(wp.y / H, 0.0, 1.0);
  float brick = smoothstep(0.2, 0.55, dot(tex, vec3(0.3, 0.59, 0.11)));
  vec3 fx = vec3(0.0);
  if (uPyrMode < 1.5) {
    float band = min(6.0, floor(h * 7.0));
    float level = bandLevel(band);
    fx = bandColor(band) * level * level * 2.4;
  } else if (uPyrMode < 2.5) {
    for (int i = 0; i < 4; i++) {
      float age = uScanAge[i];
      float d = wp.y - age * 300.0;
      float ring = exp(-d * d / 60.0) * (1.0 - smoothstep(0.8, 1.6, age));
      fx += hueColor(uHue) * ring * 3.5;
    }
    fx += hueColor(uHue) * uBeat * 0.25;
  } else if (uPyrMode < 3.5) {
    float s = (H - wp.y) / 46.0 - uFlow;
    float band = mod(floor(s), 7.0);
    float level = bandLevel(band);
    fx = bandColor(band) * pow(fract(s), 6.0) * (0.5 + level * 3.0);
  } else if (uPyrMode < 4.5) {
    float fill = 1.0 - smoothstep(uLevel - 0.004, uLevel + 0.004, h);
    float top = exp(-pow((h - uLevel) * H / 5.0, 2.0)) * step(0.01, uLevel);
    fx = hueColor(h * ${HUE_MAX.toFixed(2)}) * (fill * 1.1 + top * 3.0) * (0.7 + uBeat * 0.6);
  } else {
    vec2 p = wp.xz - vec2(${PYRAMID.x.toFixed(1)}, ${PYRAMID.z.toFixed(1)});
    float band = p.x < 0.0 ? (p.y > 0.0 ? 0.0 : 2.0) : (p.y > 0.0 ? 5.0 : 3.0);
    float level = bandLevel(band);
    fx = bandColor(band) * level * level * 2.2;
  }
  return fx * brick * uFxMix * uActive;
}
`;

const BEAM_VERT = /* glsl */ `
attribute vec3 aBeamColor;
varying vec3 vColor;
varying float vAlong;
varying float vFacing;
void main() {
  vColor = aBeamColor;
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlong;
varying float vFacing;
void main() {
  float core = pow(vFacing, 3.0);
  float fade = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.02, vAlong);
  gl_FragColor = vec4(vColor * core * fade, 1.0);
  ${OUTPUT_CHUNK}
}
`;

function createBrickTexture(maxAniso) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

  ctx.fillStyle = '#4d3405';
  ctx.fillRect(0, 0, S, S);

  const courses = 8;
  const ch = S / courses;
  const bw = S / 4;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    const offset = (r % 2) * (bw / 2);
    for (let x = -offset; x < S; x += bw) {
      const l = 0.82 + rnd() * 0.26;
      const g = ctx.createLinearGradient(0, y, 0, y + ch);
      g.addColorStop(0, rgb(255 * l, 222 * l, 92 * l));
      g.addColorStop(0.14, rgb(246 * l, 196 * l, 40 * l));
      g.addColorStop(1, rgb(204 * l, 148 * l, 18 * l));
      ctx.fillStyle = g;
      ctx.fillRect(x + 5, y + 5, bw - 10, ch - 10);

      ctx.fillStyle = 'rgba(255, 246, 205, 0.4)';
      ctx.fillRect(x + 5, y + 5, bw - 10, 6);
      ctx.fillStyle = 'rgba(70, 40, 0, 0.35)';
      ctx.fillRect(x + 5, y + ch - 11, bw - 10, 6);
    }
  }

  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = rnd() < 0.6 ? 'rgba(60, 35, 0, 0.18)' : 'rgba(255, 240, 190, 0.12)';
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 4, 1 + rnd() * 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,230,160,0.8)');
  g.addColorStop(0.45, 'rgba(255,150,40,0.25)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Pyramid - monumental smooth-faced gold brick pyramid (460 m tall), rotated so an
 * edge faces the city and two faces read like the archival logo.
 */
export class Pyramid {
  constructor(scene, maxAniso = 4) {
    this.group = new THREE.Group();
    this.group.position.set(PYRAMID.x, 0, PYRAMID.z);
    this.group.rotation.y = Math.PI / 4;
    this.stage = false;
    this.edgeColor = new THREE.Color();
    this.hueColor = new THREE.Color();
    this.glowTint = new THREE.Color();
    this.capGold = new THREE.Color(0xffb000);

    this.fxMix = { value: 0 };
    this.flow = { value: 0 };
    this.scanAge = { value: new THREE.Vector4(9, 9, 9, 9) };
    this.scanNext = 0;
    this.lastBeat = 0;
    this.mode = 0;
    this.lightsMix = 0;
    this.lightClock = 0;
    this.flare = 0;
    // User settings (settings disc).
    this.capGlow = 1;
    this.brickGlow = 1;
    this.edgeGlow = 1;
    this.searchlightSpeed = 1;

    this.buildFaces(maxAniso);
    this.buildEdges();
    this.buildCapstone();
    this.buildSearchlights(scene);
    scene.add(this.group);
  }

  buildSearchlights(scene) {
    const geo = new THREE.CylinderGeometry(110, 3, 2800, 20, 1, true);
    geo.translate(0, 1400, 0);
    this.beamColors = new Float32Array(SEARCHLIGHTS * 3);
    geo.setAttribute('aBeamColor', new THREE.InstancedBufferAttribute(this.beamColors, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.searchlights = new THREE.InstancedMesh(geo, mat, SEARCHLIGHTS);
    this.searchlights.frustumCulled = false;
    this.searchlights.renderOrder = 8;
    this.searchlights.visible = false;
    scene.add(this.searchlights);

    this._beamMatrix = new THREE.Matrix4();
    this._beamQuat = new THREE.Quaternion();
    this._beamEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._beamScale = new THREE.Vector3(1, 1, 1);
    this._beamPos = APEX.clone().setY(APEX.y - 4);
    this._beamColor = new THREE.Color();
  }

  /** 0 = none, 1..5 = brick-face animations (see PYRAMID_FX). */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.fxMix.value = 0;
    SHARED.uPyrMode.value = mode;
  }

  updateSearchlights(dt) {
    const target = this.mode === 5 ? 1 : 0;
    this.lightsMix += (target - this.lightsMix) * (1 - Math.exp(-dt * 2.5));
    const on = this.lightsMix > 0.01;
    this.searchlights.visible = on;
    if (!on) return;

    this.lightClock += dt * this.searchlightSpeed;
    const t = this.lightClock;
    const bands = SHARED.uBands.value;
    const beat = SHARED.uBeat.value;
    for (let i = 0; i < SEARCHLIGHTS; i++) {
      const dir = i % 2 ? -1 : 1;
      const yaw = t * 0.32 * dir + (i / SEARCHLIGHTS) * Math.PI * 2;
      const tilt = 0.55 + 0.35 * Math.sin(t * 0.45 + i * 1.7);
      this._beamEuler.set(tilt, yaw, 0);
      this._beamQuat.setFromEuler(this._beamEuler);
      this._beamMatrix.compose(this._beamPos, this._beamQuat, this._beamScale);
      this.searchlights.setMatrixAt(i, this._beamMatrix);

      const band = Math.min(6, i + (i > 2 ? 1 : 0));
      const level = bands[band];
      setAudioColor(this._beamColor, (band / 6) * HUE_MAX, 0.55)
        .multiplyScalar((0.25 + level * 1.4 + beat * 0.5) * this.lightsMix * SHARED.uActive.value);
      this._beamColor.toArray(this.beamColors, i * 3);
    }
    this.searchlights.instanceMatrix.needsUpdate = true;
    this.searchlights.geometry.attributes.aBeamColor.needsUpdate = true;
  }

  updateFx(dt) {
    this.fxMix.value = Math.min(1, this.fxMix.value + dt * 1.5);
    this.flow.value += dt * (0.6 + SHARED.uBass.value * 1.8);

    const beat = SHARED.uBeat.value;
    const a = this.scanAge.value;
    a.x += dt; a.y += dt; a.z += dt; a.w += dt;
    if (beat > 0.95 && this.lastBeat < 0.9) {
      a.setComponent(this.scanNext, 0);
      this.scanNext = (this.scanNext + 1) % 4;
    }
    this.lastBeat = beat;
  }

  buildFaces(maxAniso) {
    const h = PYRAMID.half;
    const H = PYRAMID.height;
    const slant = Math.hypot(H, h);
    const corners = [[-h, h], [h, h], [h, -h], [-h, -h]];

    const positions = [];
    const uvs = [];
    for (let f = 0; f < 4; f++) {
      const a = corners[f];
      const b = corners[(f + 1) % 4];
      positions.push(a[0], 0, a[1], b[0], 0, b[1], 0, H, 0);
      uvs.push(0, 0, (2 * h) / TILE_METRES, 0, h / TILE_METRES, slant / TILE_METRES);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    const map = createBrickTexture(maxAniso);
    this.faceMaterial = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0x6a4400,
      emissiveIntensity: 0.35,
      metalness: 0.25,
      roughness: 0.55,
      fog: false
    });

    this.faceMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uHaze: SHARED.uFogColor,
        uTime: SHARED.uTime,
        uBass: SHARED.uBass,
        uBeat: SHARED.uBeat,
        uHue: SHARED.uHue,
        ...HUE_UNIFORMS,
        uActive: SHARED.uActive,
        uBands: SHARED.uBands,
        uLevel: SHARED.uLampLevel,
        uPyrMode: SHARED.uPyrMode,
        uFxMix: this.fxMix,
        uFlow: this.flow,
        uScanAge: this.scanAge
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPyrWorld;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvPyrWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vPyrWorld;\nuniform vec3 uHaze;\n${PYRAMID_FX}`)
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += pyramidFx(vPyrWorld, texture2D(map, vMapUv).rgb);'
        )
        .replace(
          '#include <tonemapping_fragment>',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 0.26 * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 240.0, vPyrWorld.y))));\n#include <tonemapping_fragment>'
        );
    };

    this.faces = new THREE.Mesh(geo, this.faceMaterial);
    this.group.add(this.faces);
  }

  buildEdges() {
    const h = PYRAMID.half * 1.002;
    const H = PYRAMID.height * 1.002;
    const pts = [];
    for (const [x, z] of [[-h, h], [h, h], [h, -h], [-h, -h]]) {
      pts.push(x, 0, z, 0, H, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(1.6, 1.3, 0.7),
      transparent: true,
      opacity: 0.75,
      fog: false
    });
    this.edges = new THREE.LineSegments(geo, this.edgeMaterial);
    this.group.add(this.edges);
  }

  buildCapstone() {
    const H = PYRAMID.height;
    const capHeight = 24;
    const halfAtCut = PYRAMID.half * (capHeight / H);
    const geo = new THREE.ConeGeometry(halfAtCut * Math.SQRT2 * 1.06, capHeight + 2, 4, 1);
    geo.rotateY(Math.PI / 4);
    this.capMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff0a0,
      emissive: 0xffb000,
      emissiveIntensity: 1.5,
      metalness: 0.6,
      roughness: 0.2,
      fog: false
    });
    const cap = new THREE.Mesh(geo, this.capMaterial);
    cap.position.y = H - capHeight + (capHeight + 2) / 2;
    this.group.add(cap);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: new THREE.Color(1.6, 1.2, 0.7),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false
    }));
    this.glow.position.y = H + 4;
    this.glow.scale.setScalar(160);
    this.group.add(this.glow);
  }

  setStage(on) {
    this.stage = on;
  }

  update(dt) {
    this.updateFx(dt);
    this.updateSearchlights(dt);

    const bass = SHARED.uBass.value;
    const beat = SHARED.uBeat.value;
    const active = SHARED.uActive.value;
    const hue = SHARED.uHue.value;

    // Audio colour: red for bass-heavy sound, rotating up to purple for treble.
    setAudioColor(this.hueColor, hue, 0.55);

    // Settings-disc launch flare: decays on its own once triggered.
    this.flare = Math.max(0, this.flare - dt * 0.8);
    const flare = this.flare;

    this.capMaterial.emissive.copy(this.capGold).lerp(this.hueColor, active * 0.85);
    this.capMaterial.emissiveIntensity = (1.4 + bass * 5.0 + beat * 4.0 + flare * 6) * Math.max(0.2, this.capGlow);
    this.glow.scale.setScalar((150 + bass * 120 + beat * 80 + flare * 160) * this.capGlow);
    this.glow.visible = this.capGlow > 0.01;
    this.glowTint.setRGB(1.6, 1.2, 0.7).lerp(this.edgeColor.copy(this.hueColor).multiplyScalar(2.0), active * 0.8);
    this.glow.material.color.copy(this.glowTint);
    this.glow.material.opacity = Math.min(1, 0.7 + bass * 0.3);

    const brickPulse = this.stage ? 1.2 : 0.35;
    this.faceMaterial.emissiveIntensity = (0.35 + bass * brickPulse * active + beat * 0.25 * active) * this.brickGlow;

    const strobe = this.mode === 5 ? 4.5 : 2.2;
    this.edgeColor.setRGB(1.6, 1.3, 0.7).lerp(this.hueColor, active * 0.9)
      .multiplyScalar((1 + active * 0.8) * (1 + beat * strobe * active) * this.edgeGlow);
    this.edgeMaterial.color.copy(this.edgeColor);
    this.edges.visible = this.edgeGlow > 0.01;
  }

  /** Burst of light from the capstone (settings disc launch / return). */
  triggerFlare(amount = 1) {
    this.flare = Math.max(this.flare, amount);
  }
}
