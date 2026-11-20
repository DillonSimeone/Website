import * as THREE from 'three';
import { STREET, RESERVED, PYRAMID, SHARED, FOG_PARS, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, MAX_STAR_WELLS, MAX_LASER_HITS } from './world.js';

const BUILDING_VERT = /* glsl */ `
${AUDIO_PARS}
attribute float aSeed;
attribute vec3 aSize;
attribute vec3 aBasePos;
attribute vec4 aAnim; // x: archetype (0..3), y: band (0..6), z: phase, w: amplitude

uniform float uTime;
uniform float uBeat;
uniform float uShopFronts;
uniform float uStageMode;
uniform float uBuildingMotion;
uniform float uBuildingBoost;
uniform float uStarRainMix;
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];
uniform float uRicochetMix;
uniform vec4 uLaserHits[${MAX_LASER_HITS}];
uniform vec4 uLaserHitInfo[${MAX_LASER_HITS}];

varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vNormLocal;
varying vec2 vWinCoord;
varying float vSeed;
varying float vHeight;
varying float vBand;
varying float vPhase;
varying float vDepth;
varying float vFaceId;
varying float vFacesStreet;

void main() {
  vNormLocal = position;
  vec3 loc = position * aSize;
  vec3 n = normal;

  // Compute unrotated local window & street-facing attributes before kinematic rotation
  vWinCoord = abs(normal.x) > 0.5 ? loc.zy : loc.xy;
  vFaceId = normal.x * 3.0 + normal.z * 7.0;
  vFacesStreet = (abs(normal.x) > 0.5 && normal.x * aBasePos.x < 0.0) ? 1.0 : 0.0;

  float react = uStageMode * uActive * uBuildingMotion * uBuildingBoost;
  if (react > 0.001) {
    float arch = aAnim.x;
    float band = aAnim.y;
    float phase = aAnim.z;
    float amp = aAnim.w;
    float level = clamp(bandLevel(band), 0.0, 1.35);
    bool isMuralSafe = amp < 0.3;

    if (arch < 0.5) {
      // Archetype 0: Hydraulic vertical slide up & down (grounded at y=0)
      float wave = 0.5 + 0.5 * sin(uTime * 2.4 + phase);
      float minS = isMuralSafe ? 1.0 : 0.48;
      float baseS = isMuralSafe ? 1.0 : 0.65;
      float maxS = isMuralSafe ? 1.32 : 2.25;
      float sY = clamp(baseS + (level * 0.9 + uBeat * 0.35 + wave * 0.28 * level) * react * amp, minS, maxS);
      loc.y *= sY;
    } else if (arch < 1.5) {
      // Archetype 1: Rotate in area (swivel with clearance on street, full spin in skyline)
      float dir = mod(floor(aSeed), 2.0) > 0.5 ? 1.0 : -1.0;
      float ang;
      if (uShopFronts > 0.5) {
        ang = sin(uTime * 1.15 + phase) * (0.26 + level * 0.32) * dir * react * amp;
        loc.xz *= mix(1.0, 0.8, min(1.0, react) * 0.75);
      } else {
        ang = (uTime * (0.35 + level * 0.9) + uBeat * 0.32 + phase) * dir * react * amp;
      }
      float c = cos(ang);
      float s = sin(ang);
      mat2 rot = mat2(c, -s, s, c);
      loc.xz = rot * loc.xz;
      n.xz = rot * n.xz;
      loc.y *= 1.0 + (level * 0.25 + uBeat * 0.15) * react * amp;
    } else if (arch < 2.5) {
      // Archetype 2: Beat-synced shrink & grow breathing
      float xzCap = uShopFronts > 0.5 ? 0.52 : 1.0;
      float xzScale = clamp(1.0 + ((level - 0.32) * 0.46 + uBeat * 0.2) * react * amp * xzCap, 0.66, 1.32);
      float yScale = clamp(1.0 + ((level - 0.25) * 0.72 + uBeat * 0.32) * react * amp, 0.56, 1.85);
      loc.xz *= xzScale;
      loc.y *= yScale;
    } else {
      // Archetype 3: Wave bounce + helical twist
      float twistCap = uShopFronts > 0.5 ? 0.32 : 1.0;
      float tw = position.y * sin(uTime * 2.1 + phase) * (0.28 + level * 0.52) * react * amp * twistCap;
      float c = cos(tw);
      float s = sin(tw);
      mat2 rot = mat2(c, -s, s, c);
      loc.xz = rot * loc.xz;
      n.xz = rot * n.xz;
      float bounce = abs(sin(uTime * 2.8 + phase));
      loc.y *= clamp(1.0 + (bounce * level * 0.62 + uBeat * 0.28) * react * amp, 0.72, 1.9);
    }
  }

  vec4 wp = modelMatrix * vec4(aBasePos + loc, 1.0);

  // Starfall black-hole spacetime tidal curvature & ripple wave
  if (uStarRainMix > 0.01) {
    float heightFactor = pow(clamp(position.y, 0.0, 1.0), 1.35);
    for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
      float age = uStarWells[i].w;
      if (age < 0.0 || age >= 1.0) continue;
      vec2 dw = wp.xz - uStarWells[i].xz;
      float d = length(dw);
      float maxR = max(60.0, uStarWellSpec[i].z);
      float waveR = mix(4.0, maxR, pow(age, 0.72));
      float fade = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * uStarWellSpec[i].y;
      if (d < maxR + 35.0 && d > 0.05) {
        vec2 rHat = dw / d;
        float corePull = -6.0 * exp(-(d * d) / 4200.0) * (1.0 - smoothstep(0.1, 0.8, age));
        float wavePush = 3.0 * exp(-pow((d - waveR) / 22.0, 2.0)) * sin((d - waveR) * 0.22);
        wp.xz += rHat * (corePull + wavePush) * heightFactor * fade;
        wp.y += 1.5 * exp(-pow((d - waveR) / 20.0, 2.0)) * cos((d - waveR) * 0.24) * fade;
      }
    }
  }

  // Frequency-driven Laser Ricochet surface deformation on impacted walls
  if (uRicochetMix > 0.01) {
    for (int i = 0; i < ${MAX_LASER_HITS}; i++) {
      float age = uLaserHits[i].w;
      if (age < 0.0 || age >= 1.0) continue;
      float d = length(wp.xyz - uLaserHits[i].xyz);
      if (d > 42.0) continue;
      float env = (1.0 - smoothstep(0.0, 1.0, age)) * uRicochetMix * uLaserHitInfo[i].y;
      float tier = uLaserHitInfo[i].x;
      if (tier < 0.5) {
        float wr = mix(1.0, 28.0, age);
        float bulge = exp(-pow((d - wr) / 4.5, 2.0)) * cos((d - wr) * 0.65);
        wp.x += -sign(aBasePos.x) * bulge * 1.45 * env;
      } else if (tier < 1.5) {
        float dy = abs(wp.y - uLaserHits[i].y);
        float strFlex = exp(-dy * dy * 0.05) * sin(uTime * 36.0 + d * 0.45) * exp(-d * 0.05);
        wp.x += -sign(aBasePos.x) * strFlex * 0.9 * env;
      } else {
        float vib = sin(uTime * 68.0 + d * 1.8) * exp(-d * 0.08);
        wp.xyz += n * vib * 0.42 * env;
      }
    }
  }

  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vSeed = aSeed;
  vHeight = aSize.y;
  vBand = aAnim.y;
  vPhase = aAnim.z;

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
uniform float uStageMode;
uniform float uPeakFreqHue;
uniform float uPeakFlash;
uniform vec3 uThemeFacade;
uniform vec3 uThemeWinA;
uniform vec3 uThemeWinB;
uniform vec3 uThemeWinC;
uniform float uStarRainMix;
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];
uniform float uRicochetMix;
uniform vec4 uLaserHits[${MAX_LASER_HITS}];
uniform vec4 uLaserHitInfo[${MAX_LASER_HITS}];

varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vNormLocal;
varying vec2 vWinCoord;
varying float vSeed;
varying float vHeight;
varying float vBand;
varying float vPhase;
varying float vDepth;
varying float vFaceId;
varying float vFacesStreet;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float pulse(float g, float a, float b, float w) {
  return smoothstep(a - w, a + w, g) * (1.0 - smoothstep(b - w, b + w, g));
}

void main() {
  float fogF = smoothstep(uFogNear, uFar, vDepth);
  vec3 col = uFogColor;

  // Skip window, VU & edge shading on silhouettes fully hidden by dense fog
  if (fogF < 0.995) {
    vec3 n = vNormalW;
    float seed = floor(vSeed + 0.5);
    float win = 0.0;
    float stageActive = uStageMode * uActive;
    vec3 peakCol = rawHueColor(uPeakFreqHue);

    // Gravitational black-hole window lensing & photon ring glow from Starfall impacts
    vec2 lensedWin = vWinCoord;
    float bhDim = 0.0;
    vec3 bhGlow = vec3(0.0);
    if (uStarRainMix > 0.01) {
      for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
        float age = uStarWells[i].w;
        if (age < 0.0 || age >= 1.0) continue;
        float d3 = length(vWorld - uStarWells[i].xyz);
        float maxR = max(60.0, uStarWellSpec[i].z);
        float waveR = mix(4.0, maxR, pow(age, 0.72));
        float fade = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * uStarWellSpec[i].y;
        if (d3 < maxR + 32.0) {
          float coreCurve = 6.5 / (d3 + 6.0) * exp(-(d3 * d3) / 1400.0);
          float waveCurve = 4.2 * exp(-pow((d3 - waveR) / 16.0, 2.0));
          vec2 dir2 = vWorld.zy - uStarWells[i].zy;
          float l2 = length(dir2);
          if (l2 > 0.01) lensedWin -= (dir2 / l2) * (coreCurve + waveCurve) * fade;
          bhDim = max(bhDim, exp(-(d3 * d3) / 85.0) * (1.0 - smoothstep(0.15, 0.75, age)) * 0.75 * uStarRainMix);
          float rim = exp(-pow((d3 - waveR) / 6.5, 2.0));
          bhGlow += bandColor(uStarWellSpec[i].x) * rim * fade * 0.55;
        }
      }
    }

    if (n.y > 0.5) {
      col = uThemeFacade * 0.5;
    } else {
      bool sideX = abs(n.x) > 0.5;
      vec2 gc = lensedWin / vec2(3.4, 3.8);
      vec2 id = floor(gc);
      vec2 g = fract(gc);
      vec2 fw = fwidth(gc);
      win = pulse(g.x, 0.2, 0.8, fw.x) * pulse(g.y, 0.28, 0.82, fw.y);
      float lod = smoothstep(0.18, 0.45, max(fw.x, fw.y));
      win = mix(win, 0.324, lod);

      float r = hash(id + vec2(seed * 1.37 + vFaceId, seed * 0.71));
      float lit = mix(step(0.6, r), 0.4, lod);
      vec3 wc = r > 0.94 ? uThemeWinC : (r > 0.82 ? uThemeWinB : uThemeWinA);
      wc = mix(wc, uThemeWinA * 0.9, lod);
      float flick = 0.9 + 0.1 * sin(uTime * (0.3 + r * 1.5) + r * 50.0);

      float shade = sideX ? 0.85 : 1.0;
      vec3 facade = uThemeFacade * shade * (0.65 + 0.35 * hash(vec2(seed, 1.0)));
      float aboveShops = step(5.4, vWorld.y);
      col = facade;
      vec3 litCol = wc * (0.78 + 0.52 * hash(id + 3.0)) * flick * 1.25 * (1.0 + uBeat * uActive * 0.35) * uWindowGain;
      col += win * aboveShops * (lit * litCol + (1.0 - lit) * uThemeFacade * 0.65);

      if (uShopFronts > 0.5) {
        // Street-facing VU meters
        float meter = step(0.55, hash(vec2(seed, 7.0)));
        if (vFacesStreet > 0.5 && meter > 0.5 && uActive > 0.01 && uVUBuildings > 0.5) {
          float level = clamp(bandLevel(vBand) * 1.15, 0.0, 1.0);
          float top = 5.4 + level * max(4.0, vHeight - 6.0);
          float fill = (1.0 - smoothstep(top - 0.6, top + 0.6, vWorld.y)) * aboveShops;
          vec3 vu = bandColor(vBand) * (1.3 + uBeat * 0.85);
          col = mix(col, facade + win * vu, fill * uActive);
        }

        // Street-level shop glass and neon spill
        float shopBand = pulse(vWorld.y, 0.6, 4.0, fwidth(vWorld.y));
        float seg = floor((abs(vNormalW.x) > 0.5 ? vWorld.z : vWorld.x) / 7.0);
        float shopOn = step(0.35, hash(vec2(seg, seed)));
        vec3 shopCol = mix(uThemeWinC, uThemeWinB, hash(vec2(seg, 9.0)));
        shopCol = mix(shopCol, hueColor(uHue) * 1.2, uActive * 0.6);
        col += shopBand * shopOn * shopCol * 0.5 * (0.8 + uEnergy * 0.85 + uBeat * uActive * 0.5);

        float spill = exp(-max(vWorld.y, 0.0) / 9.0);
        vec3 spillCol = mix(uThemeWinC, uThemeWinB, 0.5 + 0.5 * sin(vWorld.z * 0.05 + seed * 6.0));
        spillCol = mix(spillCol, hueColor(uHue), uActive * 0.7);
        col += spillCol * spill * (0.05 + uBass * 0.14 + uBeat * uActive * 0.1);
      } else if (stageActive > 0.01 && uVUBuildings > 0.5) {
        // Skyline band EQ glow in Stage Mode
        float level = clamp(bandLevel(vBand), 0.0, 1.0);
        float fill = 1.0 - smoothstep(level - 0.08, level + 0.08, vNormLocal.y);
        col += win * bandColor(vBand) * fill * stageActive * (0.55 + uBeat * 0.55);
      }
    }

    // Stage mode peak-frequency flash
    if (stageActive > 0.01) {
      float crown = smoothstep(0.89, 0.99, vNormLocal.y);
      float roof = step(0.5, n.y);
      float edge = smoothstep(0.455, 0.496, max(abs(vNormLocal.x), abs(vNormLocal.z)));
      float pulseWave = 0.55 + 0.45 * sin(uTime * 3.5 + vPhase);
      float flashMask = crown * 1.05 + roof * 0.55 + edge * 0.48 + win * 0.42;
      col += peakCol * uPeakFlash * stageActive * flashMask * pulseWave;
    }

    // Frequency-tiered Laser Ricochet impact effects painted on building facades
    vec3 laserFx = vec3(0.0);
    if (uRicochetMix > 0.01) {
      for (int i = 0; i < ${MAX_LASER_HITS}; i++) {
        float age = uLaserHits[i].w;
        if (age < 0.0 || age >= 1.0) continue;
        vec3 dv = vWorld - uLaserHits[i].xyz;
        float d = length(dv);
        if (d > 38.0) continue;
        float env = (1.0 - smoothstep(0.0, 1.0, age)) * uRicochetMix * uLaserHitInfo[i].y;
        float tier = uLaserHitInfo[i].x;
        vec3 hCol = rawHueColor(uLaserHitInfo[i].z);
        if (tier < 0.5) {
          float r1 = mix(0.8, 26.0, pow(age, 0.75));
          float ring = exp(-pow((d - r1) / 2.2, 2.0));
          laserFx += mix(vec3(1.0, 0.14, 0.08), hCol, 0.35) * ring * env * 1.1;
        } else if (tier < 1.5) {
          float strPos = sin(dv.z * 0.35) * 1.6 * cos(age * 42.0) * exp(-age * 2.2);
          float line = exp(-pow((dv.y - strPos) * 1.15, 2.0)) * exp(-abs(dv.z) * 0.08);
          laserFx += mix(vec3(0.75, 1.0, 0.15), hCol, 0.35) * line * env * 1.25;
        } else {
          float vib = (0.5 + 0.5 * sin(d * 2.4 - uTime * 55.0)) * exp(-d * 0.12);
          laserFx += mix(vec3(0.72, 0.18, 1.0), hCol, 0.4) * vib * env * 1.15;
        }
      }
    }

    col += bhGlow + laserFx;
    col *= (1.0 - bhDim);

    col = softHDR(col, 1.45);
    col = mix(col, uFogColor, fogF * 0.92);
  }

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

export class CityBuildings {
  constructor(group, rng, buildingUniforms) {
    this.group = group;
    this.rng = rng;
    this.buildingUniforms = buildingUniforms;
    this.streetBuildings = [];
    this.streetBoxes = [];
    this.skylineBoxes = [];

    this.buildStreetBuildings();
    this.buildSkyline();
  }

  createBuildingMaterial(far, shopFronts) {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.buildingUniforms,
        uThemeFacade: SHARED.uThemeFacade,
        uThemeWinA: SHARED.uThemeWinA,
        uThemeWinB: SHARED.uThemeWinB,
        uThemeWinC: SHARED.uThemeWinC,
        uFar: { value: far },
        uShopFronts: { value: shopFronts }
      },
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG
    });
  }

  createInstancedBuildings(list, material, outBoxes) {
    const geo = new THREE.BoxGeometry(1, 1, 1, 2, 8, 2);
    geo.translate(0, 0.5, 0);

    const n = list.length;
    const seeds = new Float32Array(n);
    const sizes = new Float32Array(n * 3);
    const basePos = new Float32Array(n * 3);
    const anims = new Float32Array(n * 4);

    const mesh = new THREE.InstancedMesh(geo, material, n);
    const identity = new THREE.Matrix4();

    for (let i = 0; i < n; i++) {
      const b = list[i];
      mesh.setMatrixAt(i, identity);

      const seed = Math.floor(this.rng() * 1000);
      seeds[i] = seed;
      sizes[i * 3] = b.sx;
      sizes[i * 3 + 1] = b.h;
      sizes[i * 3 + 2] = b.sz;

      basePos[i * 3] = b.x;
      basePos[i * 3 + 1] = 0;
      basePos[i * 3 + 2] = b.z;

      const isMuralSupport = b.muralSafe === true;
      const arch = isMuralSupport ? 0 : (i % 4);
      const band = seed % 7;
      const phase = ((seed * 1.731) % (Math.PI * 2));
      const amp = isMuralSupport ? 0.22 : (0.55 + ((seed % 45) / 100));

      anims[i * 4] = arch;
      anims[i * 4 + 1] = band;
      anims[i * 4 + 2] = phase;
      anims[i * 4 + 3] = amp;

      if (outBoxes) {
        outBoxes.push({
          x: b.x,
          z: b.z,
          sx: b.sx,
          sz: b.sz,
          h: b.h,
          side: b.side || 0,
          muralSafe: isMuralSupport,
          arch,
          band,
          phase,
          amp
        });
      }
    }

    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 3));
    geo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(basePos, 3));
    geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anims, 4));
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
    const instances = list.filter(b => b.id !== 'title').map(b => ({
      x: b.side * (STREET.half + b.depth / 2),
      z: (b.z0 + b.z1) / 2,
      sx: b.depth,
      sz: b.z1 - b.z0,
      h: b.h,
      side: b.side,
      muralSafe: b.id === 'bio' || b.id === 'rider' || b.id === 'bioFront' || b.id === 'riderFront'
    }));
    this.streetBuildingMaterial = this.createBuildingMaterial(SHARED.uFogFar.value, 1);
    this.createInstancedBuildings(instances, this.streetBuildingMaterial, this.streetBoxes);
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
      // Reserve relocated East Neon Oasis Park footprint (x: 58..224, z: -18..316)
      if (x + sx / 2 > 58 && x - sx / 2 < 224 && z + sz / 2 > -18 && z - sz / 2 < 316) continue;
      const far = Math.min(1, Math.hypot(x, z + 300) / 1100);
      let h = 25 + R() * 60 + far * R() * 90;
      if (R() < 0.05) h = 160 + R() * 120;
      // Keep skyline roofs low along sightline strip so the Pyramid reflects in the Oasis pool
      if (x + sx / 2 > 35 && x - sx / 2 < 145 && z + sz / 2 > -620 && z - sz / 2 < 0) {
        h = Math.min(h, 30);
      }
      list.push({ x, z, sx, sz, h, muralSafe: false });
    }
    this.skylineMaterial = this.createBuildingMaterial(2600, 0);
    this.createInstancedBuildings(list, this.skylineMaterial, this.skylineBoxes);
  }

  setFogDistance(far) {
    this.streetBuildingMaterial.uniforms.uFar.value = far;
    this.skylineMaterial.uniforms.uFar.value = Math.max(2600, far * 1.15);
  }
}
