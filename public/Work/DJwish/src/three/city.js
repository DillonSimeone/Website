import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STREET, RESERVED, MURALS, HOARDINGS, STOPS, PYRAMID, SHARED, FOG_PARS, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, HUE_MAX, mulberry32 } from './world.js';
import { GlowField } from './glow.js';

const LAMP_SPACING = 24;
const LAMP_Z0 = STREET.far + 10;
const LAMP_X = STREET.road + 0.8;
const MAX_SPOTS = 16;
const LAMP_ROWS = Math.ceil((STREET.near - LAMP_Z0) / LAMP_SPACING);
const LAMP_RANGE = (LAMP_ROWS - 1) * LAMP_SPACING;

const PALETTE = [
  new THREE.Color(1.0, 0.05, 0.35),
  new THREE.Color(0.0, 0.85, 1.0),
  new THREE.Color(0.75, 0.2, 1.0),
  new THREE.Color(1.0, 0.65, 0.1)
];

const BUILDING_VERT = /* glsl */ `
attribute float aSeed;
attribute float aHeight;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vHeight;
varying float vDepth;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normal;
  vSeed = aSeed;
  vHeight = aHeight;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const BUILDING_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uFar;
uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uBeat;
uniform float uShopFronts;
uniform float uWindowGain;
uniform float uVUBuildings;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vHeight;
varying float vDepth;

// Sin-free hash: stable for large inputs, so per-window values never shimmer.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Anti-aliased box pulse on [a, b] of a periodic coordinate.
float pulse(float g, float a, float b, float w) {
  return smoothstep(a - w, a + w, g) * (1.0 - smoothstep(b - w, b + w, g));
}

void main() {
  vec3 n = vNormalW;
  vec3 col;
  float seed = floor(vSeed + 0.5);
  if (n.y > 0.5) {
    col = vec3(0.014, 0.011, 0.02);
  } else {
    bool sideX = abs(n.x) > 0.5;
    vec2 f = sideX ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
    vec2 gc = f / vec2(3.4, 3.8);
    vec2 id = floor(gc);
    vec2 g = fract(gc);
    vec2 fw = fwidth(gc);
    float win = pulse(g.x, 0.2, 0.8, fw.x) * pulse(g.y, 0.28, 0.82, fw.y);
    // When windows shrink to a few pixels, resolve to their average to stop moire.
    float lod = smoothstep(0.18, 0.45, max(fw.x, fw.y));
    win = mix(win, 0.324, lod);

    float faceId = n.x * 3.0 + n.z * 7.0;
    float r = hash(id + vec2(seed * 1.37 + faceId, seed * 0.71));
    float lit = mix(step(0.6, r), 0.4, lod);
    vec3 warm = vec3(1.0, 0.6, 0.26);
    vec3 cool = vec3(0.35, 0.75, 1.0);
    vec3 pink = vec3(1.0, 0.25, 0.65);
    vec3 wc = r > 0.94 ? pink : (r > 0.82 ? cool : warm);
    wc = mix(wc, warm * 0.9, lod);
    float flick = 0.9 + 0.1 * sin(uTime * (0.3 + r * 1.5) + r * 50.0);

    float shade = sideX ? 0.85 : 1.0;
    vec3 facade = vec3(0.03, 0.026, 0.042) * shade * (0.65 + 0.35 * hash(vec2(seed, 1.0)));
    float aboveShops = step(5.4, vWorld.y);
    col = facade;
    vec3 litCol = wc * (0.8 + 0.6 * hash(id + 3.0)) * flick * 1.4 * (1.0 + uBeat * uActive * 0.5) * uWindowGain;
    col += win * aboveShops * (lit * litCol + (1.0 - lit) * vec3(0.02, 0.02, 0.035));

    if (uShopFronts > 0.5) {
      // Street-facing VU meters: some buildings fill with windows up to their band's level.
      bool facesStreet = sideX && n.x * vWorld.x < 0.0;
      float meter = step(0.55, hash(vec2(seed, 7.0)));
      if (facesStreet && meter > 0.5 && uActive > 0.01 && uVUBuildings > 0.5) {
        float band = mod(seed, 7.0);
        float level = clamp(bandLevel(band) * 1.15, 0.0, 1.0);
        float top = 5.4 + level * (vHeight - 6.0);
        float fill = (1.0 - smoothstep(top - 0.6, top + 0.6, vWorld.y)) * aboveShops;
        vec3 vu = bandColor(band) * (1.6 + uBeat * 1.4);
        col = mix(col, facade + win * vu, fill * uActive);
      }

      // Street-level shop glass and neon spill.
      float shopBand = pulse(vWorld.y, 0.6, 4.0, fwidth(vWorld.y));
      float seg = floor((sideX ? vWorld.z : vWorld.x) / 7.0);
      float shopOn = step(0.35, hash(vec2(seg, seed)));
      vec3 shopCol = mix(vec3(1.0, 0.3, 0.55), vec3(0.2, 0.8, 1.0), hash(vec2(seg, 9.0)));
      shopCol = mix(shopCol, hueColor(uHue) * 1.4, uActive * 0.6);
      col += shopBand * shopOn * shopCol * 0.55 * (0.8 + uEnergy * 1.2 + uBeat * uActive);

      float spill = exp(-max(vWorld.y, 0.0) / 9.0);
      vec3 spillCol = mix(vec3(1.0, 0.1, 0.45), vec3(0.0, 0.75, 1.0), 0.5 + 0.5 * sin(vWorld.z * 0.05 + seed * 6.0));
      spillCol = mix(spillCol, hueColor(uHue), uActive * 0.7);
      col += spillCol * spill * (0.06 + uBass * 0.18 + uBeat * uActive * 0.12);
    }
  }

  float fogF = smoothstep(uFogNear, uFar, vDepth);
  col = mix(col, uFogColor, fogF * 0.92);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const STREET_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const STREET_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uEnergy;
uniform float uBeat;
uniform float uRoad;
uniform float uLampZ0;
uniform float uLampSpacing;
uniform float uLampX;
uniform float uLampRange;
uniform float uReflGain;
uniform float uLampVU;
uniform float uLampLevel;
uniform vec4 uSpots[${MAX_SPOTS}];
uniform vec3 uSpotColors[${MAX_SPOTS}];
varying vec3 vWorld;
varying float vDepth;

void main() {
  float x = vWorld.x;
  float z = vWorld.z;
  float ax = abs(x);
  bool sidewalk = ax > uRoad;

  vec3 col = sidewalk ? vec3(0.035, 0.032, 0.042) : vec3(0.012, 0.011, 0.017);
  if (sidewalk) {
    vec2 t = fract(vWorld.xz / 2.0);
    col *= 0.75 + 0.25 * step(0.05, t.x) * step(0.05, t.y);
  }
  col += vec3(0.06) * (1.0 - smoothstep(0.0, 0.18, abs(ax - uRoad)));
  float dash = (1.0 - step(0.12, ax)) * step(0.5, fract(z / 9.0));
  col += vec3(0.55, 0.45, 0.2) * dash * 0.22;

  float wet = 0.55 + 0.45 * sin(x * 0.7 + sin(z * 0.13) * 2.0) * sin(z * 0.21 + x * 0.3);
  wet = smoothstep(0.15, 0.85, wet) * (sidewalk ? 0.45 : 1.0);

  vec3 refl = vec3(0.0);
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    vec4 s = uSpots[i];
    float dx = x - s.x;
    float dz = z - s.y;
    refl += uSpotColors[i] * exp(-dx * dx / (s.z * s.z)) * exp(-abs(dz) / 16.0);
  }

  // Lamp pools (follow the street VU meter when it is on).
  float lz = mod(z - uLampZ0 + uLampSpacing * 0.5, uLampSpacing) - uLampSpacing * 0.5;
  float lx = ax - (uLampX - 2.2);
  float lampOrder = floor((z - uLampZ0) / uLampSpacing + 0.5) * uLampSpacing / uLampRange;
  float lampOn = step(lampOrder + 0.001, uLampLevel);
  vec3 poolCol = mix(vec3(1.0, 0.55, 0.32) * 0.6, hueColor(lampOrder * ${HUE_MAX.toFixed(2)}) * lampOn * 1.3, uLampVU);
  refl += poolCol * exp(-(lz * lz) / 22.0 - (lx * lx) / 9.0);

  // Apex streak and laser sheen running down the middle of the street, tinted by the audio colour.
  vec3 apexCol = mix(vec3(1.0, 0.55, 0.15), hueColor(uHue) * 1.3, uActive * 0.75);
  vec3 sheenCol = mix(vec3(0.35, 0.1, 0.9), hueColor(uHue), uActive * 0.6);
  refl += apexCol * exp(-x * x / 14.0) * (0.3 + uBass * 0.9 + uBeat * uActive * 0.6);
  refl += sheenCol * exp(-x * x / 110.0) * (0.12 + uMid * 0.35 + uBeat * 0.35);

  col += refl * wet * (0.7 + uEnergy * 0.9) * uReflGain;

  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

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

/**
 * City - neon street canyon, surrounding skyline, wet street, lamps, signs.
 * Roughly a dozen draw calls in total.
 */
export class City {
  constructor(scene, maxAniso = 4) {
    this.group = new THREE.Group();
    this.rng = mulberry32(1337);
    this.maxAniso = maxAniso;
    this.spots = [];
    this.streetBuildings = [];
    this.glows = new GlowField(260, { near: 40, far: 1700 });

    this.buildingUniforms = {
      uTime: SHARED.uTime,
      uEnergy: SHARED.uEnergy,
      uBass: SHARED.uBass,
      uBeat: SHARED.uBeat,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      uWindowGain: { value: 1 },
      uVUBuildings: { value: 1 }
    };
    this.reflGain = { value: 1 };
    this.signGain = 1;

    this.buildStreetBuildings();
    this.buildSkyline();
    this.buildGround();
    this.buildStreetlights();
    this.buildSigns();
    this.buildNeonStrips();
    this.buildPlazaLights();
    this.buildStreetSurface();

    this.glows.finalize();
    this.group.add(this.glows.mesh);
    scene.add(this.group);
  }

  createBuildingMaterial(far, shopFronts) {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.buildingUniforms,
        uFar: { value: far },
        uShopFronts: { value: shopFronts }
      },
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG
    });
  }

  createInstancedBuildings(list, material) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const seeds = new Float32Array(list.length);
    const heights = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      m.makeScale(b.sx, b.h, b.sz).setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m);
      seeds[i] = Math.floor(this.rng() * 1000);
      heights[i] = b.h;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aHeight', new THREE.InstancedBufferAttribute(heights, 1));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  buildStreetBuildings() {
    const R = this.rng;
    const list = [];
    for (const side of [-1, 1]) {
      const reserved = RESERVED.filter(r => r.side === side).sort((a, b) => a.z0 - b.z0);
      let z = STREET.far;
      let ri = 0;
      while (z < STREET.near) {
        const next = reserved[ri];
        if (next && z >= next.z0 - 0.01) {
          list.push({ side, z0: next.z0, z1: next.z1, depth: next.depth, h: next.h, id: next.id });
          z = next.z1;
          ri++;
          continue;
        }
        let w = 12 + R() * 22;
        if (next && z + w > next.z0 - 6) w = next.z0 - z;
        if (w < 5) {
          z = next.z0;
          continue;
        }
        const zc = z + w / 2;
        let h;
        if (zc < -112) h = 7 + R() * 6;
        else if (zc < 0) h = 20 + R() * 28;
        else h = 30 + R() * 45;
        list.push({ side, z0: z, z1: z + w, depth: 18 + R() * 14, h });
        z += w;
        if (R() < 0.2) z += 4 + R() * 3;
        if (next && z > next.z0) z = next.z0;
      }
    }

    this.streetBuildings = list;
    const instances = list.map(b => ({
      x: b.side * (STREET.half + b.depth / 2),
      z: (b.z0 + b.z1) / 2,
      sx: b.depth,
      sz: b.z1 - b.z0,
      h: b.h
    }));
    this.streetBuildingMaterial = this.createBuildingMaterial(SHARED.uFogFar.value, 1);
    this.createInstancedBuildings(instances, this.streetBuildingMaterial);
  }

  buildSkyline() {
    const R = this.rng;
    const list = [];
    let attempts = 0;
    while (list.length < 420 && attempts < 6000) {
      attempts++;
      const x = (R() * 2 - 1) * 1100;
      const z = 420 - R() * 1650;
      const sx = 22 + R() * 40;
      const sz = 22 + R() * 40;
      const inner = Math.abs(x) - sx / 2;
      const zNear = z - sz / 2;
      if (z + sz / 2 > STREET.far - 5 && inner < 64) continue;
      if (zNear <= STREET.far - 5 && inner < 60 + (STREET.far - zNear) * 0.34) continue;
      if (Math.hypot(x - PYRAMID.x, z - PYRAMID.z) < PYRAMID.half * 1.9) continue;
      const far = Math.min(1, Math.hypot(x, z + 300) / 1100);
      let h = 25 + R() * 60 + far * R() * 90;
      if (R() < 0.05) h = 160 + R() * 120;
      list.push({ x, z, sx, sz, h });
    }
    this.createInstancedBuildings(list, this.createBuildingMaterial(2600, 0));
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshBasicMaterial({ color: 0x050309 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -800);
    this.group.add(ground);
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

    // Dark opaque boards with saturated letters: bright enough to bloom at the edges,
    // dim enough in the middle that the words never wash out to white.
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

  buildStreetSurface() {
    const spots = new Array(MAX_SPOTS).fill(null).map(() => new THREE.Vector4(0, 0, 1, 0));
    const spotColors = new Array(MAX_SPOTS).fill(null).map(() => new THREE.Color(0, 0, 0));
    this.spots.forEach((s, i) => {
      spots[i].set(s.x, s.z, s.w, 0);
      spotColors[i].copy(s.color);
    });

    const length = STREET.near - STREET.far + 20;
    const geo = new THREE.PlaneGeometry(STREET.half * 2, length);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: SHARED.uTime,
        uBass: SHARED.uBass,
        uMid: SHARED.uMid,
        uEnergy: SHARED.uEnergy,
        uBeat: SHARED.uBeat,
        uHue: SHARED.uHue,
        ...HUE_UNIFORMS,
        uActive: SHARED.uActive,
        uBands: SHARED.uBands,
        uFogColor: SHARED.uFogColor,
        uFogNear: SHARED.uFogNear,
        uFogFar: SHARED.uFogFar,
        uRoad: { value: STREET.road },
        uLampZ0: { value: LAMP_Z0 },
        uLampSpacing: { value: LAMP_SPACING },
        uLampX: { value: LAMP_X },
        uLampRange: { value: LAMP_RANGE },
        uReflGain: this.reflGain,
        uLampVU: SHARED.uLampVU,
        uLampLevel: SHARED.uLampLevel,
        uSpots: { value: spots },
        uSpotColors: { value: spotColors }
      },
      vertexShader: STREET_VERT,
      fragmentShader: STREET_FRAG
    });
    const street = new THREE.Mesh(geo, mat);
    street.position.set(0, 0.01, (STREET.near + STREET.far) / 2);
    this.group.add(street);
  }

  setFogDistance(far) {
    SHARED.uFogFar.value = far;
    this.streetBuildingMaterial.uniforms.uFar.value = far;
  }

  update() {
    if (this.signMaterial) {
      const k = (1.1 + SHARED.uActive.value * (SHARED.uEnergy.value * 0.4 + SHARED.uBeat.value * 0.7)) * this.signGain;
      this.signMaterial.color.setRGB(k, k, k);
    }
  }
}
