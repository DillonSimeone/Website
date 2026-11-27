import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET, RESERVED, MURALS, HOARDINGS, STOPS, PYRAMID, SHARED, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK } from './world.js';
import { MAX_SPOTS } from './city-ground.js';

export const LAMP_SPACING = 24;
export const LAMP_Z0 = STREET.far + 10;
export const LAMP_X = STREET.road + 0.8;
export const LAMP_ROWS = Math.ceil((STREET.near - LAMP_Z0) / LAMP_SPACING);
export const LAMP_RANGE = (LAMP_ROWS - 1) * LAMP_SPACING;

const PALETTE = [
  new THREE.Color(1.0, 0.05, 0.35),
  new THREE.Color(0.0, 0.85, 1.0),
  new THREE.Color(0.75, 0.2, 1.0),
  new THREE.Color(1.0, 0.65, 0.1)
];

const STRIP_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vColor = aColor;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Neon strips become a running equaliser: 6 m segments cycle through the 7 bands.
const STRIP_FRAG = /* glsl */ `
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uBeat;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  float seg = floor(vWorld.z / 6.0);
  float band = mod(seg, 7.0);
  float level = clamp(bandLevel(band), 0.0, 1.3);
  vec3 eq = bandColor(band) * (0.25 + level * 2.6 + uBeat * 0.8);
  float gap = step(0.08, fract(vWorld.z / 6.0));
  vec3 col = mix(vColor, eq * gap, uActive);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

function muralZoneBlocked(side, z, margin = 6) {
  const t = MURALS.title;
  if (side === t.side && Math.abs(z - t.z) < t.width / 2 + margin) return true;
  for (const r of RESERVED) {
    if (r.side === side && (r.id === 'bioFront' || r.id === 'riderFront') && z > r.z0 - margin && z < r.z1 + margin * 2) return true;
  }
  for (const h of Object.values(HOARDINGS)) {
    if (Math.sign(h.x) === side && Math.abs(z - h.z) < 9) return true;
  }
  return false;
}

export class CityProps {
  constructor(group, rng, glows, streetBuildings, maxAniso = 4) {
    this.group = group;
    this.rng = rng;
    this.glows = glows;
    this.streetBuildings = streetBuildings;
    this.maxAniso = maxAniso;
    this.spots = [];
    this.signGain = 1;
    this.signMaterial = null;

    this.buildStreetlights();
    this.buildSigns();
    this.buildNeonStrips();
    this.buildPlazaLights();
  }

  buildStreetlights() {
    const pole = new THREE.CylinderGeometry(0.13, 0.18, 8, 6);
    pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(2.4, 0.12, 0.12);
    arm.translate(1.2, 7.9, 0);
    const head = new THREE.BoxGeometry(0.7, 0.16, 0.36);
    head.translate(2.2, 7.8, 0);
    const geo = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed(), head.toNonIndexed()]);

    const positions = [];
    for (let z = LAMP_Z0; z < STREET.near; z += LAMP_SPACING) {
      for (const side of [-1, 1]) {
        let blocked = false;
        for (const h of Object.values(HOARDINGS)) {
          if (Math.sign(h.x) === side && Math.abs(z - h.z) < 7) blocked = true;
        }
        for (const s of STOPS) {
          if (Math.abs(s.pos[0] - side * LAMP_X) < 4 && Math.abs(z - s.pos[2]) < 14) blocked = true;
        }
        if (!blocked) positions.push([side, z]);
      }
    }

    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1a24, metalness: 0.6, roughness: 0.5 });
    const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const lampColor = new THREE.Color(1.0, 0.62, 0.38);

    positions.forEach(([side, z], i) => {
      q.setFromAxisAngle(up, side === -1 ? 0 : Math.PI);
      p.set(side * LAMP_X, 0, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      this.glows.add(side * (LAMP_X - 2.2), 7.65, z, 3.4, lampColor, 1.6, Math.random(), (z - LAMP_Z0) / LAMP_RANGE);
    });

    SHARED.uLampStep.value = LAMP_SPACING / LAMP_RANGE;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  createSignAtlas() {
    const words = ['DEAF WISH', 'SUB 28Hz', '808', 'HAPTIC', 'PDX', 'BASS', 'OPEN 24H', 'VOLT'];
    const colors = ['#ff2a7a', '#00f0ff', '#ffb000', '#b04cff', '#00f0ff', '#ff2a7a', '#ffb000', '#b04cff'];
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    words.forEach((word, i) => {
      const cx = (i % 2) * 512;
      const cy = Math.floor(i / 2) * 256;
      const color = colors[i];

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx + 10, cy + 10, 492, 236, 22);
      ctx.fillStyle = '#05030a';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(cx + 26, cy + 26, 460, 204, 14);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      let size = 132;
      ctx.font = `900 ${size}px "Montserrat", sans-serif`;
      const tw = ctx.measureText(word).width;
      if (tw > 430) {
        size *= 430 / tw;
        ctx.font = `900 ${size}px "Montserrat", sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const tx = cx + 256;
      const ty = cy + 134;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 14;
      ctx.strokeText(word, tx, ty);
      ctx.fillStyle = color;
      ctx.fillText(word, tx, ty);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.strokeText(word, tx, ty);
      ctx.restore();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    return { tex, colors: colors.map(c => new THREE.Color(c)) };
  }

  buildSigns() {
    const R = this.rng;
    const { tex, colors } = this.createSignAtlas();
    const geos = [];
    let cellIndex = 0;

    for (const b of this.streetBuildings) {
      if (b.id || b.h < 14) continue;
      if (R() > 0.6) continue;
      const z = (b.z0 + b.z1) / 2 + (R() - 0.5) * (b.z1 - b.z0) * 0.4;
      if (muralZoneBlocked(b.side, z)) continue;
      const y = Math.min(b.h - 4, 7 + R() * 9);
      const x = b.side * (STREET.half - 4.1);
      const cell = cellIndex++ % 8;

      const g = new THREE.PlaneGeometry(7.6, 3.8);
      const uv = g.attributes.uv;
      const col = cell % 2;
      const row = 3 - Math.floor(cell / 2);
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (col + uv.getX(i)) / 2, (row + uv.getY(i)) / 4);
      }
      g.translate(x, y, z);
      geos.push(g);

      const c = colors[cell];
      this.glows.add(x, y + 2.6, z, 9, c, 0.22);
      if (this.spots.length < MAX_SPOTS) {
        this.spots.push({ x: b.side * (STREET.half - 4.5), z, w: 2.2, color: c.clone().multiplyScalar(0.55) });
      }
    }

    if (!geos.length) return;
    this.signMaterial = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(1.1, 1.1, 1.1),
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
      fog: false
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), this.signMaterial);
    this.group.add(mesh);
  }

  buildNeonStrips() {
    const R = this.rng;
    const geos = [];
    for (const b of this.streetBuildings) {
      if (b.id) continue;
      if (R() > 0.75) continue;
      const len = b.z1 - b.z0 - 2;
      if (len < 4) continue;
      const zc = (b.z0 + b.z1) / 2;
      if (muralZoneBlocked(b.side, zc, 0)) continue;
      const g = new THREE.PlaneGeometry(len, 0.2);
      g.rotateY(b.side === -1 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(b.side * (STREET.half - 0.06), 4.7, zc);
      const c = PALETTE[Math.floor(R() * PALETTE.length)].clone().multiplyScalar(2.2);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geos.push(g);
    }
    if (!geos.length) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: SHARED.uTime,
        uBass: SHARED.uBass,
        uBeat: SHARED.uBeat,
        uHue: SHARED.uHue,
        ...HUE_UNIFORMS,
        uActive: SHARED.uActive,
        uBands: SHARED.uBands
      },
      vertexShader: STRIP_VERT,
      fragmentShader: STRIP_FRAG,
      side: THREE.DoubleSide
    });
    this.group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  buildPlazaLights() {
    const gold = new THREE.Color(1.0, 0.7, 0.3);
    const violet = new THREE.Color(0.6, 0.25, 1.0);
    for (let z = STREET.far - 12; z > PYRAMID.z + PYRAMID.half * 1.5; z -= 22) {
      const spread = 24 + (STREET.far - z) * 0.05;
      this.glows.add(-spread, 1.2, z, 5, gold, 1.4);
      this.glows.add(spread, 1.2, z, 5, gold, 1.4);
      this.glows.add(0, 0.4, z, 3, violet, 0.9);
    }
  }

  update() {
    if (this.signMaterial) {
      const k = (1.1 + SHARED.uActive.value * (SHARED.uEnergy.value * 0.4 + SHARED.uBeat.value * 0.7)) * this.signGain;
      this.signMaterial.color.setRGB(k, k, k);
    }
  }
}
