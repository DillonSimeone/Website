import * as THREE from 'three';
import { STREET, PYRAMID, SHARED, FOG_PARS, AUDIO_PARS, HUE_UNIFORMS, OUTPUT_CHUNK, HUE_MAX, MAX_STAR_WELLS } from './world.js';

export const MAX_SPOTS = 16;

const GROUND_VERT = /* glsl */ `
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];
uniform float uStarRainMix;

varying vec3 vWorld;
varying float vDepth;
varying float vWellDisp;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float disp = 0.0;
  if (uStarRainMix > 0.01) {
    for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
      float age = uStarWells[i].w;
      if (age < 0.0 || age >= 1.0) continue;
      vec2 dw = wp.xz - uStarWells[i].xz;
      float dist = length(dw);
      float maxR = max(60.0, uStarWellSpec[i].z);
      float waveR = mix(4.0, maxR, pow(age, 0.72));
      float str = uStarWellSpec[i].y;
      float env = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * str;
      float crater = -4.6 * exp(-(dist * dist) / 420.0) * (1.0 - smoothstep(0.18, 0.85, age));
      float ring = exp(-pow((dist - waveR) / 15.0, 2.0)) * cos((dist - waveR) * 0.25);
      disp += (crater + ring * 3.6) * env;
    }
  }
  wp.y += disp;
  vWellDisp = disp;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GROUND_FRAG = /* glsl */ `
${FOG_PARS}
${AUDIO_PARS}
uniform sampler2D uAudioTex;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uEnergy;
uniform float uBeat;
uniform float uStageMode;
uniform float uPeakFreqHue;
uniform float uPeakFlash;
uniform float uVisualMode;
uniform float uGroundGrid;
uniform float uCymaticMix;
uniform float uReflGain;
uniform float uStarRainMix;
uniform vec2 uPyramidPos;
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];

varying vec3 vWorld;
varying float vDepth;
varying float vWellDisp;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float gridLine(float coord, float spacing, float width) {
  float c = coord / spacing;
  float fw = fwidth(c);
  float d = abs(fract(c - 0.5) - 0.5) / max(fw, 1e-4);
  float line = 1.0 - smoothstep(width, width + 1.5, d);
  // Prevent moire shimmer in the distance
  return line * (1.0 - smoothstep(0.18, 0.55, fw));
}

void main() {
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 col = uFogColor;

  if (fogF < 0.995) {
    vec2 rawP = vWorld.xz;
    vec2 p = rawP;
    float horizonDark = 0.0;
    vec3 photonGlow = vec3(0.0);

    // Balanced Schwarzschild gravitational lensing warp around falling star wells
    if (uStarRainMix > 0.01) {
      for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
        float age = uStarWells[i].w;
        if (age < 0.0 || age >= 1.0) continue;
        vec2 dVec = rawP - uStarWells[i].xz;
        float d = length(dVec);
        float maxR = max(60.0, uStarWellSpec[i].z);
        float waveR = mix(4.0, maxR, pow(age, 0.72));
        float fade = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * uStarWellSpec[i].y;
        if (d < maxR + 36.0 && d > 0.01) {
          vec2 rHat = dVec / d;
          float corePull = 14.0 / (d + 9.0) * exp(-(d * d) / 2600.0);
          float ringPull = 9.5 * exp(-pow((d - waveR) / 18.0, 2.0));
          p -= rHat * (corePull + ringPull) * fade;
          horizonDark = max(horizonDark, exp(-(d * d) / 115.0) * (1.0 - smoothstep(0.15, 0.75, age)) * 0.78 * uStarRainMix);
          float einstein = exp(-pow((d - waveR) / 7.5, 2.0));
          photonGlow += bandColor(uStarWellSpec[i].x) * einstein * fade * 0.62;
        }
      }
    }

    // Multi-scale basalt / asphalt grain (antialiased at distance)
    float grainFine = valueNoise(p * 0.55);
    float grainCoarse = valueNoise(p * 0.11);
    float grain = mix(grainFine, grainCoarse, 0.45);

    vec3 baseDark = vec3(0.016, 0.012, 0.025);
    vec3 baseLight = vec3(0.038, 0.030, 0.056);

    if (uVisualMode > 3.5 && uVisualMode < 4.5) {
      baseDark = vec3(0.018, 0.018, 0.021);
      baseLight = vec3(0.044, 0.045, 0.05);
    } else if (uVisualMode > 4.5 && uVisualMode < 5.5) {
      baseDark = vec3(0.026, 0.017, 0.009);
      baseLight = vec3(0.06, 0.038, 0.018);
    } else if (uVisualMode > 5.5) {
      baseDark = vec3(0.004, 0.003, 0.01);
      baseLight = vec3(0.016, 0.008, 0.03);
    } else if (uVisualMode > 1.5 && uVisualMode < 2.5) {
      baseDark = vec3(0.025, 0.01, 0.011);
      baseLight = vec3(0.055, 0.018, 0.015);
    }

    col = mix(baseDark, baseLight, grain * (1.0 - smoothstep(140.0, 520.0, vDepth)));

    // Urban 24m concrete slabs + plaza radial stonework near the pyramid
    float gx = gridLine(p.x, 24.0, 0.7);
    float gz = gridLine(p.y, 24.0, 0.7);
    float subG = max(gridLine(p.x, 6.0, 0.35), gridLine(p.y, 6.0, 0.35));
    float blockGrid = max(gx, gz);

    float distPyr = length(p - uPyramidPos);
    float plazaMask = 1.0 - smoothstep(320.0, 740.0, distPyr);
    float radRing = gridLine(distPyr, 36.0, 0.8);
    float angle = atan(p.y - uPyramidPos.y, p.x - uPyramidPos.x);
    float radSpoke = gridLine(angle * 24.0 / 3.14159265, 1.0, 0.5);
    float plazaSeams = max(radRing, radSpoke * 0.65);

    float seam = mix(blockGrid + subG * 0.28, plazaSeams, plazaMask);
    col *= 1.0 - min(0.5, seam * 0.45);

    // Visual mode luminous grid & circuit lines
    vec3 gridCol = mix(vec3(0.32, 0.12, 0.72), hueColor(uHue), 0.35 + uActive * 0.55);
    if (uVisualMode > 0.5 && uVisualMode < 1.5) {
      gridCol = mix(vec3(1.0, 0.1, 0.65), vec3(0.0, 0.9, 1.0), 0.5 + 0.5 * sin(p.y * 0.015));
    } else if (uVisualMode > 1.5 && uVisualMode < 2.5) {
      gridCol = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.78, 0.12), grainCoarse);
    } else if (uVisualMode > 2.5 && uVisualMode < 3.5) {
      gridCol = mix(vec3(0.15, 1.0, 0.55), vec3(0.55, 0.15, 1.0), grainFine);
    } else if (uVisualMode > 4.5 && uVisualMode < 5.5) {
      gridCol = vec3(1.0, 0.72, 0.22);
    } else if (uVisualMode > 5.5) {
      gridCol = mix(vec3(0.45, 0.08, 0.85), vec3(0.12, 0.65, 0.95), grainCoarse);
    }

    float gridEnergy = 1.0 + uActive * (uBass * 0.55 + uBeat * 0.45);
    col += gridCol * seam * (uGroundGrid * 0.62) * gridEnergy;

    // Subtle wet puddle specular sheen & stage-mode peak-frequency reflections
    float puddle = smoothstep(0.45, 0.8, valueNoise(p * 0.035 + vec2(3.1, 7.4)));
    vec3 sheenCol = mix(vec3(0.08, 0.04, 0.16), hueColor(uHue) * 0.35, uActive);
    col += sheenCol * puddle * (0.2 + uEnergy * 0.55) * uReflGain;

    float stageActive = uStageMode * uActive;
    if (stageActive > 0.01) {
      float cym = max(0.16 * stageActive, uCymaticMix * stageActive);
      float normR = fract(distPyr / 420.0 - uTime * (0.12 + uBass * 0.15));
      float spec = texture2D(uAudioTex, vec2(normR, 0.5)).r;
      float ringWave = 0.5 + 0.5 * sin(distPyr * 0.09 - uTime * 3.2);
      vec3 peakCol = rawHueColor(uPeakFreqHue);
      col += peakCol * (spec * 0.45 + ringWave * uPeakFlash * 0.28) * cym * (0.35 + puddle * 0.65);
      col += peakCol * seam * uPeakFlash * stageActive * 0.52;
    }

    col += photonGlow + hueColor(uHue) * max(0.0, vWellDisp) * 0.05;
    col *= (1.0 - horizonDark);

    col = softHDR(col, 1.22);
    col = mix(col, uFogColor, fogF);
  }

  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

const STREET_VERT = /* glsl */ `
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];
uniform float uStarRainMix;

varying vec3 vWorld;
varying float vDepth;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float disp = 0.0;
  if (uStarRainMix > 0.01) {
    for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
      float age = uStarWells[i].w;
      if (age < 0.0 || age >= 1.0) continue;
      float dist = length(wp.xz - uStarWells[i].xz);
      float maxR = max(60.0, uStarWellSpec[i].z);
      float waveR = mix(4.0, maxR, pow(age, 0.72));
      float env = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * uStarWellSpec[i].y;
      float crater = -1.6 * exp(-(dist * dist) / 360.0) * (1.0 - smoothstep(0.18, 0.85, age));
      float ring = exp(-pow((dist - waveR) / 14.0, 2.0)) * cos((dist - waveR) * 0.25);
      disp += (crater + ring * 1.4) * env;
    }
  }
  wp.y += disp;
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
uniform float uStageMode;
uniform float uPeakFreqHue;
uniform float uPeakFlash;
uniform float uGroundGrid;
uniform float uSpotCount;
uniform vec4 uSpots[${MAX_SPOTS}];
uniform vec3 uSpotColors[${MAX_SPOTS}];
uniform float uStarRainMix;
uniform vec4 uStarWells[${MAX_STAR_WELLS}];
uniform vec4 uStarWellSpec[${MAX_STAR_WELLS}];
varying vec3 vWorld;
varying float vDepth;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 rawXZ = vWorld.xz;
  vec2 p = rawXZ;
  float horizonDark = 0.0;
  vec3 photonGlow = vec3(0.0);

  if (uStarRainMix > 0.01) {
    for (int i = 0; i < ${MAX_STAR_WELLS}; i++) {
      float age = uStarWells[i].w;
      if (age < 0.0 || age >= 1.0) continue;
      vec2 dVec = rawXZ - uStarWells[i].xz;
      float d = length(dVec);
      float maxR = max(60.0, uStarWellSpec[i].z);
      float waveR = mix(4.0, maxR, pow(age, 0.72));
      float fade = (1.0 - smoothstep(0.35, 1.0, age)) * uStarRainMix * uStarWellSpec[i].y;
      if (d < maxR + 30.0 && d > 0.01) {
        vec2 rHat = dVec / d;
        float pull = (7.0 / (d + 8.0) * exp(-(d * d) / 1800.0) + 5.5 * exp(-pow((d - waveR) / 16.0, 2.0))) * fade;
        p -= rHat * pull;
        horizonDark = max(horizonDark, exp(-(d * d) / 90.0) * (1.0 - smoothstep(0.15, 0.75, age)) * 0.7 * uStarRainMix);
        photonGlow += bandColor(uStarWellSpec[i].x) * exp(-pow((d - waveR) / 7.0, 2.0)) * fade * 0.45;
      }
    }
  }

  float x = p.x;
  float z = p.y;
  float ax = abs(x);
  bool sidewalk = ax > uRoad;

  vec3 col = sidewalk ? vec3(0.035, 0.032, 0.042) : vec3(0.012, 0.011, 0.017);
  // Subtle micro-asphalt grain
  float asphalt = hash21(floor(p * 2.5));
  col *= 0.88 + 0.24 * asphalt;

  if (sidewalk) {
    vec2 t = fract(p / 2.0);
    col *= 0.75 + 0.25 * step(0.05, t.x) * step(0.05, t.y);
  }
  col += vec3(0.06) * (1.0 - smoothstep(0.0, 0.18, abs(ax - uRoad)));
  float dash = (1.0 - step(0.12, ax)) * step(0.5, fract(z / 9.0));
  col += vec3(0.55, 0.45, 0.2) * dash * 0.22;

  float wet = 0.55 + 0.45 * sin(x * 0.7 + sin(z * 0.13) * 2.0) * sin(z * 0.21 + x * 0.3);
  wet = smoothstep(0.15, 0.85, wet) * (sidewalk ? 0.45 : 1.0);

  vec3 refl = vec3(0.0);
  // Optimized bounded spot reflection loop (avoids 32 exp() calls per pixel)
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (float(i) >= uSpotCount) break;
    vec4 s = uSpots[i];
    float dz = z - s.y;
    if (abs(dz) > 48.0) continue;
    float dx = x - s.x;
    float falloff = 1.0 + (dx * dx) / max(0.5, s.z * s.z) + (dz * dz) / 210.0;
    refl += uSpotColors[i] / (falloff * falloff);
  }

  // Lamp pools (follow the street VU meter when it is on)
  float lz = mod(z - uLampZ0 + uLampSpacing * 0.5, uLampSpacing) - uLampSpacing * 0.5;
  float lx = ax - (uLampX - 2.2);
  float lampOrder = floor((z - uLampZ0) / uLampSpacing + 0.5) * uLampSpacing / uLampRange;
  float lampOn = step(lampOrder + 0.001, uLampLevel);
  vec3 poolCol = mix(vec3(1.0, 0.55, 0.32) * 0.6, hueColor(lampOrder * ${HUE_MAX.toFixed(2)}) * lampOn * 1.3, uLampVU);
  refl += poolCol * exp(-(lz * lz) / 22.0 - (lx * lx) / 9.0);

  // Apex streak and laser sheen running down the middle of the street
  vec3 apexCol = mix(vec3(1.0, 0.55, 0.15), hueColor(uHue) * 1.3, uActive * 0.75);
  vec3 sheenCol = mix(vec3(0.35, 0.1, 0.9), hueColor(uHue), uActive * 0.6);
  refl += apexCol * exp(-x * x / 14.0) * (0.3 + uBass * 0.9 + uBeat * uActive * 0.6);
  refl += sheenCol * exp(-x * x / 110.0) * (0.12 + uMid * 0.35 + uBeat * 0.35);

  if (uStageMode * uActive > 0.01) {
    refl += rawHueColor(uPeakFreqHue) * exp(-x * x / 45.0) * uPeakFlash * uStageMode * uActive * 0.8;
  }

  col += refl * wet * (0.7 + uEnergy * 0.9) * uReflGain;

  // Subtle synthwave/mode road grid lines when groundGrid is boosted
  if (uGroundGrid > 0.3) {
    float roadGrid = max(
      1.0 - smoothstep(0.04, 0.12, abs(fract(x / 4.0) - 0.5) * 4.0),
      1.0 - smoothstep(0.04, 0.12, abs(fract(z / 8.0) - 0.5) * 8.0)
    );
    col += hueColor(uHue) * roadGrid * (uGroundGrid - 0.25) * 0.18;
  }

  col += photonGlow;
  col *= (1.0 - horizonDark);
  col = softHDR(col, 1.35);
  float fogF = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}
`;

export class CityGround {
  constructor(group, propsOpts) {
    this.group = group;
    this.reflGain = propsOpts.reflGain;
    this.lampParams = propsOpts.lampParams;

    this.buildGround();
    this.buildStreetSurface(propsOpts.spots);
  }

  buildGround() {
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
        uAudioTex: SHARED.uAudioTex,
        uFogColor: SHARED.uFogColor,
        uFogNear: SHARED.uFogNear,
        uFogFar: SHARED.uFogFar,
        uStageMode: SHARED.uStageMode,
        uPeakFreqHue: SHARED.uPeakFreqHue,
        uPeakFlash: SHARED.uPeakFlash,
        uVisualMode: SHARED.uVisualMode,
        uGroundGrid: SHARED.uGroundGrid,
        uCymaticMix: SHARED.uCymaticMix,
        uReflGain: this.reflGain,
        uStarRainMix: SHARED.uStarRainMix,
        uStarWells: SHARED.uStarWells,
        uStarWellSpec: SHARED.uStarWellSpec,
        uPyramidPos: { value: new THREE.Vector2(PYRAMID.x, PYRAMID.z) }
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG
    });

    // Subdivided ground with higher density inside city core for smooth gravitational deformation
    const groundGeo = new THREE.PlaneGeometry(2, 2, 160, 160);
    groundGeo.rotateX(-Math.PI / 2);
    const gPos = groundGeo.attributes.position;
    for (let i = 0; i < gPos.count; i++) {
      const ux = gPos.getX(i);
      const uz = gPos.getZ(i);
      const wx = Math.sign(ux) * (Math.abs(ux) * 0.22 + Math.pow(Math.abs(ux), 2.4) * 0.78) * 4500;
      const wz = Math.sign(uz) * (Math.abs(uz) * 0.22 + Math.pow(Math.abs(uz), 2.4) * 0.78) * 4500;
      gPos.setXYZ(i, wx, 0, wz);
    }
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeo, mat);
    ground.position.set(0, -0.05, -250);
    this.group.add(ground);
  }

  buildStreetSurface(spotsList) {
    const spots = new Array(MAX_SPOTS).fill(null).map(() => new THREE.Vector4(0, 0, 1, 0));
    const spotColors = new Array(MAX_SPOTS).fill(null).map(() => new THREE.Color(0, 0, 0));
    const count = Math.min(MAX_SPOTS, spotsList.length);
    for (let i = 0; i < count; i++) {
      const s = spotsList[i];
      spots[i].set(s.x, s.z, s.w, 0);
      spotColors[i].copy(s.color);
    }

    const { z0, spacing, x, range } = this.lampParams;
    const length = STREET.near - STREET.far + 20;
    const geo = new THREE.PlaneGeometry(STREET.half * 2, length, 8, 96);
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
        uLampZ0: { value: z0 },
        uLampSpacing: { value: spacing },
        uLampX: { value: x },
        uLampRange: { value: range },
        uReflGain: this.reflGain,
        uLampVU: SHARED.uLampVU,
        uLampLevel: SHARED.uLampLevel,
        uStageMode: SHARED.uStageMode,
        uPeakFreqHue: SHARED.uPeakFreqHue,
        uPeakFlash: SHARED.uPeakFlash,
        uGroundGrid: SHARED.uGroundGrid,
        uStarRainMix: SHARED.uStarRainMix,
        uStarWells: SHARED.uStarWells,
        uStarWellSpec: SHARED.uStarWellSpec,
        uSpotCount: { value: count },
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
}
