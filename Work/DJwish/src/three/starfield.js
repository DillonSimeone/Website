import * as THREE from 'three';
import { SHARED, OUTPUT_CHUNK } from './world.js';

const DOME_RADIUS = 6000;
const STAR_RADIUS = 5000;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uFogColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.002, 0.001, 0.008);
  vec3 col = mix(uFogColor, zenith, smoothstep(0.0, 0.32, h));
  float toward = max(0.0, dot(normalize(d.xz + 1e-5), vec2(0.0, -1.0)));
  float band = exp(-max(h, 0.0) * 11.0);
  col += vec3(0.16, 0.025, 0.14) * band * (0.35 + 0.65 * toward * toward);
  col = mix(col, uFogColor, step(h, 0.0));
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uHigh;
uniform float uPixelRatio;
uniform float uStarGain;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.6 + 0.4 * sin(uTime * (1.2 + aPhase * 3.5) + aPhase * 40.0);
  vColor = aColor * tw * uStarGain;
  gl_PointSize = aSize * uPixelRatio * (0.85 + tw * 0.3 + uHigh * 0.5);
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * a, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const SPARKLE_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uHigh;
uniform float uBeat;
varying vec2 vUv;
varying float vTw;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  float tw = 0.7 + 0.3 * sin(uTime * (1.1 + aPhase) + aPhase * 20.0);
  vTw = tw;
  c.xy += position.xy * s * tw * (1.0 + uHigh * 0.7 + uBeat * 0.35);
  gl_Position = projectionMatrix * c;
}
`;

const SPARKLE_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vTw;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float core = exp(-dot(p, p) * 22.0);
  float rays = exp(-abs(p.x) * 46.0) * (1.0 - abs(p.y)) + exp(-abs(p.y) * 46.0) * (1.0 - abs(p.x));
  float a = core * 1.6 + rays * 1.4;
  gl_FragColor = vec4(vec3(1.0, 0.97, 1.0) * a * vTw * 1.6, 1.0);
  ${OUTPUT_CHUNK}
}
`;

/**
 * Sky - gradient dome, twinkling star points and four-point cross sparkles.
 * The whole group follows the camera so the sky sits at infinity.
 */
export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    this.starGain = { value: 1 };
    this.buildDome();
    this.buildStars();
    this.buildSparkles();
    scene.add(this.group);
  }

  buildDome() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uFogColor: SHARED.uFogColor },
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), mat);
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    this.group.add(dome);
  }

  buildStars() {
    const count = 4500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      let elev;
      let azim = Math.random() * Math.PI * 2;
      if (i < count * 0.55) {
        elev = Math.asin(Math.random());
      } else {
        // Dense star band hugging the horizon behind the pyramid, like the logo art.
        elev = (1 + Math.pow(Math.random(), 1.8) * 11) * (Math.PI / 180);
        azim = Math.PI * 1.5 + (Math.random() - 0.5) * Math.PI * 1.2;
      }
      const ce = Math.cos(elev);
      positions[i * 3] = Math.cos(azim) * ce * STAR_RADIUS;
      positions[i * 3 + 1] = Math.sin(elev) * STAR_RADIUS;
      positions[i * 3 + 2] = Math.sin(azim) * ce * STAR_RADIUS;

      const tint = Math.random();
      const bright = 0.7 + Math.random() * 0.9;
      if (tint > 0.82) colors.set([0.85 * bright, 0.7 * bright, 1.0 * bright], i * 3);
      else if (tint > 0.65) colors.set([0.7 * bright, 0.95 * bright, 1.0 * bright], i * 3);
      else colors.set([bright, bright, bright], i * 3);

      sizes[i] = Math.random() < 0.04 ? 4.5 : 1.2 + Math.random() * 2.0;
      phases[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uHigh: SHARED.uHigh, uPixelRatio: SHARED.uPixelRatio, uStarGain: this.starGain },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    stars.renderOrder = -50;
    this.group.add(stars);
  }

  buildSparkles() {
    const placements = [
      [-38, 30, 150], [-22, 40, 120], [-8, 46, 110], [6, 38, 130], [18, 26, 170],
      [33, 34, 110], [-30, 12, 140], [24, 9, 120], [-12, 18, 90], [40, 18, 130],
      [-48, 22, 100], [10, 52, 100]
    ];
    const geo = new THREE.PlaneGeometry(1, 1);
    const phases = new Float32Array(placements.length);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uHigh: SHARED.uHigh, uBeat: SHARED.uBeat },
      vertexShader: SPARKLE_VERT,
      fragmentShader: SPARKLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
    const m = new THREE.Matrix4();
    const r = 4500;
    placements.forEach(([azDeg, elDeg, size], i) => {
      const az = azDeg * (Math.PI / 180);
      const el = elDeg * (Math.PI / 180);
      m.makeScale(size, size, size).setPosition(
        Math.sin(az) * Math.cos(el) * r,
        Math.sin(el) * r,
        -Math.cos(az) * Math.cos(el) * r
      );
      mesh.setMatrixAt(i, m);
      phases[i] = Math.random() * 6;
    });
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = -40;
    this.group.add(mesh);
  }

  update(camera) {
    this.group.position.copy(camera.position);
  }
}
