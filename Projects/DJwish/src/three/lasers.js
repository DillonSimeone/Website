import * as THREE from 'three';
import { APEX, FAN, SHARED, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK } from './world.js';

const BEAMS = 48;

const FAN_VERT = /* glsl */ `
attribute vec2 aFan;
varying vec2 vFan;
void main() {
  vFan = aFan;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FAN_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uTime;
uniform float uIgnite;
uniform float uMid;
uniform float uHigh;
uniform float uBass;
uniform float uEnergy;
uniform float uBeat;
uniform float uSheet;
uniform float uFanGain;
uniform float uBeams;
varying vec2 vFan;

void main() {
  float u = vFan.x;
  float v = vFan.y;
  if (v > uIgnite) discard;

  float cell = u * uBeams;
  float f = fract(cell);

  float streak = 0.55 + 0.45 * sin(u * 190.0 + uTime * 2.6) * sin(u * 41.0 - uTime * 1.1);
  float sweepPos = 0.5 + 0.48 * sin(uTime * 0.55);
  float sweep = exp(-pow((u - sweepPos) * 5.5, 2.0));

  vec3 violet = vec3(0.62, 0.12, 1.0);
  vec3 indigo = vec3(0.16, 0.06, 0.95);
  vec3 idle = mix(violet * 1.25, indigo, v);
  float body = 0.32 + 0.3 * streak + 0.7 * sweep * (0.35 + uMid);
  idle *= body * 0.7;

  // With audio the fan becomes a spectrum: bass on the left in red, rotating to purple on the right.
  float band = clamp(floor(u * 7.0), 0.0, 6.0);
  float level = clamp(bandLevel(band), 0.0, 1.4);
  vec3 live = bandColor(band) * (0.12 + level * 1.5) * (0.55 + 0.45 * streak);
  live *= mix(1.15, 0.6, v);
  live += bandColor(band) * uBeat * 0.35;
  vec3 col = mix(idle, live, uActive);

  // Thin separators between beams, constant pixel width, faded near the apex.
  float w = fwidth(cell) * 1.3;
  float sep = 1.0 - smoothstep(0.0, w, min(f, 1.0 - f));
  sep *= smoothstep(0.04, 0.35, v);
  vec3 sepCol = mix(vec3(1.6, 0.06, 0.2), hueColor(uHue) * 1.8, uActive);
  col += sepCol * sep * (0.55 + uHigh * 0.8 + uBeat * uActive);

  // White-hot origin at the apex and a soft far edge.
  col += vec3(1.4, 1.0, 1.6) * exp(-v * 14.0) * (1.0 + uBass * 1.6);
  col *= mix(1.0, 0.7, smoothstep(0.85, 1.0, v));

  // Ignition front glows as it travels out.
  col += vec3(1.0, 0.6, 1.4) * exp(-pow((uIgnite - v) * 18.0, 2.0)) * step(uIgnite, 0.999);

  gl_FragColor = vec4(col * uSheet * uFanGain, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const LINE_VERT = /* glsl */ `
attribute float aV;
varying float vV;
void main() {
  vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINE_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uIgnite;
uniform float uHigh;
uniform float uBeat;
uniform float uSheet;
uniform float uFanGain;
varying float vV;
void main() {
  if (vV > uIgnite) discard;
  vec3 base = mix(vec3(2.2, 0.12, 0.3), hueColor(uHue) * 2.2, uActive);
  vec3 col = base * (0.8 + uHigh * 0.8 + uBeat * 1.6);
  gl_FragColor = vec4(col * uSheet * uFanGain, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/**
 * LaserFan - violet laser sheet fanning from the pyramid apex to the baseline of
 * the sky logo, matching the archival artwork. All animation is shader-side.
 */
export class LaserFan {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.copy(APEX);
    this.group.rotation.x = FAN.tilt;

    this.uniforms = {
      uTime: SHARED.uTime,
      uMid: SHARED.uMid,
      uHigh: SHARED.uHigh,
      uBass: SHARED.uBass,
      uEnergy: SHARED.uEnergy,
      uBeat: SHARED.uBeat,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uIgnite: { value: 0 },
      uSheet: { value: 1 },
      uFanGain: { value: 1 },
      uBeams: { value: BEAMS }
    };
    this.sheetTarget = 1;

    this.buildSheet();
    this.buildEdgeBeams();
    scene.add(this.group);
  }

  buildSheet() {
    const pos = new Float32Array(BEAMS * 9);
    const fan = new Float32Array(BEAMS * 6);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < BEAMS; i++) {
      a.lerpVectors(FAN.start, FAN.end, i / BEAMS);
      b.lerpVectors(FAN.start, FAN.end, (i + 1) / BEAMS);
      pos.set([0, 0, 0, a.x, a.y, a.z, b.x, b.y, b.z], i * 9);
      fan.set([(i + 0.5) / BEAMS, 0, i / BEAMS, 1, (i + 1) / BEAMS, 1], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFan', new THREE.BufferAttribute(fan, 2));

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FAN_VERT,
      fragmentShader: FAN_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.sheet = new THREE.Mesh(geo, mat);
    this.sheet.renderOrder = 1;
    this.sheet.frustumCulled = false;
    this.group.add(this.sheet);
  }

  buildEdgeBeams() {
    const pos = [];
    const v = [];
    const p = new THREE.Vector3();
    for (let i = 0; i <= BEAMS; i += 6) {
      p.lerpVectors(FAN.start, FAN.end, i / BEAMS);
      pos.push(0, 0, 0, p.x, p.y, p.z);
      v.push(0, 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aV', new THREE.Float32BufferAttribute(v, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.renderOrder = 2;
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  /** Fade the brand fan down while a live-rig show owns the sky. */
  setSheet(level) {
    this.sheetTarget = level;
  }

  update(dt, ignite) {
    this.uniforms.uIgnite.value = ignite >= 0.999 ? 1.001 : ignite;
    const s = this.uniforms.uSheet;
    s.value += (this.sheetTarget - s.value) * (1 - Math.exp(-dt * 3));
    const visible = s.value > 0.01 && this.uniforms.uFanGain.value > 0.01;
    this.sheet.visible = visible;
    this.lines.visible = visible;
  }
}
