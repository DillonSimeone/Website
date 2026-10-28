import * as THREE from 'three';
import { SHARED, HUE_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, HUE_MAX } from './world.js';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aPhase;
attribute float aLamp;
uniform float uTime;
uniform float uBeat;
uniform float uNear;
uniform float uFar;
uniform float uLampVU;
uniform float uLampLevel;
uniform float uLampPeak;
uniform float uLampStep;
varying vec2 vUv;
varying vec3 vColor;
${HUE_PARS}

void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz);
  float flicker = 0.88 + 0.12 * sin(uTime * (2.0 + aPhase * 3.0) + aPhase * 31.0);
  flicker += uBeat * 0.35 * step(0.6, fract(aPhase * 7.0));
  vec3 color = aColor * flicker;

  // Street VU: lamps light one by one from the pyramid end up to the current volume.
  if (aLamp >= 0.0 && uLampVU > 0.001) {
    float on = step(aLamp + 0.001, uLampLevel);
    float peak = 1.0 - step(uLampStep * 0.5, abs(aLamp - uLampPeak));
    vec3 vu = hueColor(aLamp * ${HUE_MAX.toFixed(2)}) * 2.4;
    vec3 lamp = vu * on + vec3(2.4) * peak * (1.0 - on);
    color = mix(color, lamp, uLampVU);
    size *= mix(1.0, 1.0 + on * 0.5 + peak * 0.5, uLampVU);
  }

  center.xy += position.xy * size;
  float fade = 1.0 - smoothstep(uNear, uFar, -center.z);
  vColor = color * fade;
  gl_Position = projectionMatrix * center;
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.8, 1.0, d)) + exp(-d * d * 70.0) * 1.2;
  gl_FragColor = vec4(vColor * a, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/**
 * GlowField - one instanced draw call of camera-facing additive glow billboards
 * (lamp heads, sign halos, plaza lights). Lamp glows carry their position along
 * the street (0 = pyramid end, 1 = street mouth) for the street VU meter.
 */
export class GlowField {
  constructor(capacity, { near = 60, far = 1400 } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colors = new Float32Array(capacity * 3);
    this.phases = new Float32Array(capacity);
    this.lamps = new Float32Array(capacity).fill(-1);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(this.phases, 1));
    geo.setAttribute('aLamp', new THREE.InstancedBufferAttribute(this.lamps, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: SHARED.uTime,
        uBeat: SHARED.uBeat,
        uLampVU: SHARED.uLampVU,
        uLampLevel: SHARED.uLampLevel,
        uLampPeak: SHARED.uLampPeak,
        uLampStep: SHARED.uLampStep,
        ...HUE_UNIFORMS,
        uNear: { value: near },
        uFar: { value: far }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this._m = new THREE.Matrix4();
  }

  add(x, y, z, size, color, intensity = 1, phase = Math.random(), lamp = -1) {
    if (this.mesh.count >= this.capacity) return -1;
    const i = this.mesh.count++;
    this._m.makeScale(size, size, size).setPosition(x, y, z);
    this.mesh.setMatrixAt(i, this._m);
    this.colors[i * 3] = color.r * intensity;
    this.colors[i * 3 + 1] = color.g * intensity;
    this.colors[i * 3 + 2] = color.b * intensity;
    this.phases[i] = phase;
    this.lamps[i] = lamp;
    return i;
  }

  finalize() {
    this.mesh.instanceMatrix.needsUpdate = true;
    const a = this.mesh.geometry.attributes;
    a.aColor.needsUpdate = true;
    a.aPhase.needsUpdate = true;
    a.aLamp.needsUpdate = true;
  }
}
