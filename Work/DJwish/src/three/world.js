import * as THREE from 'three';

/**
 * World layout for the DJ Deaf Wish street. 1 unit = 1 metre.
 *
 *   street mouth (z=+240) ... neon canyon ... street end (z=-170) ... plaza ... pyramid (z=-1500)
 */

export const STREET = {
  half: 16,      // building facades sit at x = +/-16
  road: 10,      // asphalt half-width, sidewalks fill 10..16
  far: -170,     // end of the canyon (pyramid side)
  near: 280      // street mouth (camera side)
};

export const PYRAMID = { x: 0, z: -1500, half: 300, height: 460 };
export const APEX = new THREE.Vector3(PYRAMID.x, PYRAMID.height, PYRAMID.z);

// Laser fan baseline, relative to the apex, matching the archival artwork proportions.
export const FAN = {
  start: new THREE.Vector3(-600, 17, 0),
  end: new THREE.Vector3(267, 485, 0),
  tilt: 0.35 // lean the fan + logo plane toward the city
};

export const FOG = { color: 0x0c0718, near: 70, far: 760 };

// Buildings with fixed footprints (murals live on these).
export const RESERVED = [
  { side: 1, z0: -168, z1: -112, depth: 30, h: 30, id: 'title' },
  { side: -1, z0: -112, z1: -70, depth: 44, h: 48, id: 'bio' },
  { side: -1, z0: -70, z1: -10, depth: 34, h: 5, id: 'bioFront' },
  { side: 1, z0: 0, z1: 40, depth: 44, h: 48, id: 'rider' },
  { side: 1, z0: 40, z1: 100, depth: 34, h: 5, id: 'riderFront' }
];

export const MURALS = {
  // Facade mural on the right-hand street wall, facing the road (-x).
  title: { kind: 'facade', side: 1, z: -140, width: 46, height: 22, bottom: 3.5 },
  // Firewalls rising above a low neighbour, facing down the street (+z).
  bio: { kind: 'firewall', facadeZ: -70, x: -38, width: 40, height: 26, bottom: 8 },
  rider: { kind: 'firewall', facadeZ: 40, x: 38, width: 40, height: 26, bottom: 8 }
};

// Freestanding plywood hoardings on the sidewalk carrying the live HTML panels.
export const HOARDINGS = {
  audio: { elementId: 'panel-audio', stop: 6, x: -12, z: 150, rotY: 0.35, width: 5.2, pxWidth: 480, pxHeight: 560, bottom: 0.5, title: 'AUDIO STATION', color: '#00f0ff' },
  links: { elementId: 'panel-links', stop: 7, x: 12, z: 214, rotY: -0.35, width: 7.2, pxWidth: 740, pxHeight: 690, bottom: 0.5, title: 'LIVE RIG', color: '#ff0055' }
};

/**
 * Page-based stops along the street & 4-sided gig tower orbit.
 * 8 discrete stops:
 * 0: Who: DJ Deaf Wish / Deaf Sonic Agency bio mural
 * 1: Gigs: CodaFest 2026 (Tower West Face - Dance Night Headline)
 * 2: Gigs: World Deaf Timberfest (Tower North Face - Outdoor Resident DJ)
 * 3: Studio: Confluence Sound Lab (Tower East Face - $97k OCF & Haptics)
 * 4: Civic: ADA Anniversary Showcase (Tower South Face - Accessible Civic Stage)
 * 5: Technical Rider mural
 * 6: Audio Station interactive hoarding
 * 7: Book Nate & Live Stage Rig hoarding
 */
export const STOPS = [
  { id: 'agency', label: 'DEAF SONIC AGENCY', pageTitle: 'Who: DJ Deaf Wish', pos: [-36, 21, -44], yaw: -2, pitch: 0, focusYaw: -2 },
  { id: 'codafest', label: 'CODAFEST 2026', pageTitle: 'Gigs: CodaFest', pos: [-32, 112, -85], yaw: 32, pitch: -2, focusYaw: 30 },
  { id: 'wdt', label: 'DEAF TIMBERFEST', pageTitle: 'Gigs: Timberfest', pos: [31, 108, -200], yaw: 178, pitch: -3, focusYaw: 178 },
  { id: 'confluence', label: 'CONFLUENCE LAB', pageTitle: 'Studio: Confluence', pos: [82, 108, -140], yaw: -90, pitch: -2, focusYaw: -90 },
  { id: 'ada', label: 'ADA SHOWCASE', pageTitle: 'Civic: ADA Fest', pos: [31, 108, -68], yaw: 0, pitch: -2, focusYaw: 0 },
  { id: 'rider', label: 'TECHNICAL RIDER', pageTitle: 'Technical Rider', pos: [10, 6.5, 105], yaw: 20, pitch: 11, focusYaw: 24 },
  { id: 'audio', label: 'AUDIO STATION', pageTitle: 'Audio Station', pos: [-6.4, 3.2, 157], yaw: -22, pitch: 8, focusYaw: -38 },
  { id: 'links', label: 'BOOK NATE & RIG', pageTitle: 'Book Nate & Live Rig', pos: [7.3, 3.2, 221.5], yaw: 18, pitch: 8, focusYaw: 32 }
];

// Intro flight: foot of the pyramid -> apex + lasers -> logo -> long pull-back into the street centerline -> slide left to mural.
export const INTRO_PATH = {
  pos: [
    [-233, 3, -1267],
    [-215, 70, -1190],
    [-120, 260, -1020],
    [-30, 330, -620],
    [-4, 70, -210],
    [0, 16, -44],
    [-36, 21, -44]
  ],
  target: [
    [-117, 207, -1383],
    [0, 460, -1500],
    [-166, 696, -1414],
    [-60, 520, -1500],
    [0, 50, -1500],
    [-10, 18, -100],
    [-38, 21, -70]
  ]
};

// Live rig cameras: low street shot for sky shows, far north side for cymatic city overview, overhead void apex, etc.
export const STAGE_SHOT = { pos: [0, 1.7, -125], yaw: 0, pitch: 20 };
export const TUNNEL_SHOT = { pos: [0, 70, 430], yaw: 0, pitch: 3 };
export const VU_SHOT = { pos: [0, 5.5, 272], yaw: 0, pitch: 5 };
export const CYMATIC_SHOT = { pos: [0, 685, -2420], yaw: 180, pitch: -21 };
export const CITY_EQ_SHOT = { pos: [0, 95, 290], yaw: 0, pitch: -10 };
export const MATRIX_SHOT = { pos: [0, 22, 95], yaw: 0, pitch: 8 };
export const STARFALL_SHOT = { pos: [0, 145, 760], yaw: 0, pitch: -4 };
export const VOID_APEX_SHOT = { pos: [0, 760, -1590], yaw: 180, pitch: -42 };
export const OASIS_CYMATIC_SHOT = { pos: [148.4, 15.5, 269], yaw: 5, pitch: -6 };

export const MAX_STAR_WELLS = 8;
export const MAX_LASER_HITS = 6;

/**
 * Live rig scenes. `shot` picks the camera, `sky` the sky-show layer, `pyramid` the
 * pyramid animation, `sheet` the brand laser fan level, `lampVU` the street meter,
 * `cymatic` ground wave mix, `bldgBoost` building motion multiplier, `ricochet` window
 * laser packets, `starRain` falling star shower, `voidTide` abyssal encroachment,
 * `oasisCymatic` park pool water cymatics, and `fogFar` optional extended visibility range.
 */
export const STAGE_SCENES = [
  null,
  { id: 1, label: 'SKY SPECTRUM', shot: 'stage', sky: 1, pyramid: 1, sheet: 0, lampVU: 0, cymatic: 0, bldgBoost: 1.0, fogFar: 0 },
  { id: 2, label: 'SKY SCOPE', shot: 'stage', sky: 2, pyramid: 2, sheet: 0, lampVU: 0, cymatic: 0, bldgBoost: 1.0, fogFar: 0 },
  { id: 3, label: 'HYPER TUNNEL', shot: 'tunnel', sky: 3, pyramid: 3, sheet: 0.35, lampVU: 0, cymatic: 0.25, bldgBoost: 1.1, fogFar: 1400 },
  { id: 4, label: 'STREET VU', shot: 'vu', sky: 0, pyramid: 4, sheet: 0.5, lampVU: 1, cymatic: 0, bldgBoost: 1.0, fogFar: 0 },
  { id: 5, label: 'SEARCHLIGHTS', shot: 'stage', sky: 0, pyramid: 5, sheet: 0, lampVU: 0, cymatic: 0.2, bldgBoost: 1.15, fogFar: 0 },
  { id: 6, label: 'CYMATIC RINGS', shot: 'cymatic', sky: 4, pyramid: 2, sheet: 0.2, lampVU: 0, cymatic: 1.0, bldgBoost: 1.25, fogFar: 4200 },
  { id: 7, label: 'CITY EQUALIZER', shot: 'cityEq', sky: 1, pyramid: 1, sheet: 0.25, lampVU: 1, cymatic: 0.35, bldgBoost: 1.55, fogFar: 1800 },
  { id: 8, label: 'LASER RICOCHET', shot: 'matrix', sky: 0, pyramid: 3, sheet: 0.15, lampVU: 0, cymatic: 0.2, bldgBoost: 1.15, ricochet: 1, fogFar: 1800 },
  { id: 9, label: 'DRONE PILOT', shot: 'drone', sky: 1, pyramid: 2, sheet: 0.35, lampVU: 0, cymatic: 0.35, bldgBoost: 1.25, ricochet: 0.7, fogFar: 2400 },
  { id: 10, label: 'STARFALL RAIN', shot: 'starfall', sky: 0, pyramid: 2, sheet: 0.35, lampVU: 0, cymatic: 0.3, bldgBoost: 1.15, starRain: 1, fogFar: 3400 },
  { id: 11, label: 'VOID ENCROACH', shot: 'voidApex', sky: 4, pyramid: 5, sheet: 0.15, lampVU: 0, cymatic: 0.75, bldgBoost: 1.35, voidTide: 1, fogFar: 3800 },
  { id: 12, label: 'OASIS CYMATICS', shot: 'oasisCymatic', sky: 0, pyramid: 1, sheet: 0.45, lampVU: 0, cymatic: 0.45, bldgBoost: 1.05, oasisCymatic: 1, fogFar: 2800 }
];

// Audio texture: 128 x 1, R = log-binned spectrum, G = triggered waveform.
export const AUDIO_TEX_WIDTH = 128;
const audioTexData = new Uint8Array(AUDIO_TEX_WIDTH * 4);
for (let i = 0; i < AUDIO_TEX_WIDTH; i++) audioTexData[i * 4 + 1] = 128;
export const AUDIO_TEX = new THREE.DataTexture(audioTexData, AUDIO_TEX_WIDTH, 1, THREE.RGBAFormat);
AUDIO_TEX.magFilter = THREE.LinearFilter;
AUDIO_TEX.minFilter = THREE.LinearFilter;
AUDIO_TEX.generateMipmaps = false;
AUDIO_TEX.needsUpdate = true;

// Uniforms shared by every custom shader. Updated once per frame.
export const SHARED = {
  uTime: { value: 0 },
  uBass: { value: 0 },
  uMid: { value: 0 },
  uHigh: { value: 0 },
  uEnergy: { value: 0 },
  uBeat: { value: 0 },
  uHue: { value: 0 },        // 0 = red (bass heavy) ... 0.78 = purple (treble heavy)
  uActive: { value: 0 },     // 0 = silence, 1 = audio playing
  uBands: { value: [0, 0, 0, 0, 0, 0, 0] },
  uAudioTex: { value: AUDIO_TEX },
  uLampVU: { value: 0 },     // 1 = streetlights act as a volume meter
  uLampLevel: { value: 0 },  // 0..1 along the street, pyramid end first
  uLampPeak: { value: 0 },
  uLampStep: { value: 0.05 },
  uPyrMode: { value: 0 },    // pyramid animation, see pyramid.js
  uHueShift: { value: 0 },   // user colour settings, applied inside hueColor()
  uHueSpan: { value: 0.78 },
  uHueDir: { value: 1 },
  uSat: { value: 1 },
  uPixelRatio: { value: 1 },
  uFogColor: { value: new THREE.Color(FOG.color) },
  uFogNear: { value: FOG.near },
  uFogFar: { value: FOG.far },
  uStageMode: { value: 0 },
  uPeakFreqHue: { value: 0 },
  uPeakFlash: { value: 0 },
  uVisualMode: { value: 0 },
  uThemeHueOffset: { value: 0 },
  uThemeSatMul: { value: 1 },
  uGroundGrid: { value: 0.22 },
  uCymaticMix: { value: 0 },
  uBuildingMotion: { value: 1 },
  uBuildingBoost: { value: 1 },
  uThemeFacade: { value: new THREE.Vector3(0.03, 0.026, 0.042) },
  uThemeWinA: { value: new THREE.Vector3(1.0, 0.6, 0.26) },
  uThemeWinB: { value: new THREE.Vector3(0.35, 0.75, 1.0) },
  uThemeWinC: { value: new THREE.Vector3(1.0, 0.25, 0.65) },
  uThemeLightTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
  uVoidMix: { value: 0 },
  uStarRainMix: { value: 0 },
  uRicochetMix: { value: 0 },
  uOasisCymaticMix: { value: 0 },
  uStarWells: { value: Array.from({ length: MAX_STAR_WELLS }, () => new THREE.Vector4(0, 0, 0, -1)) },
  uStarWellSpec: { value: Array.from({ length: MAX_STAR_WELLS }, () => new THREE.Vector4(0, 0, 170, 0)) },
  uLaserHits: { value: Array.from({ length: MAX_LASER_HITS }, () => new THREE.Vector4(0, 0, 0, -1)) },
  uLaserHitInfo: { value: Array.from({ length: MAX_LASER_HITS }, () => new THREE.Vector4(0, 0, 0, 1)) }
};

export const HUE_MAX = 0.78;

export const FOG_PARS = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
`;

// Uniforms every hue-using material must include (spread into its uniforms object).
export const HUE_UNIFORMS = {
  uHueShift: SHARED.uHueShift,
  uHueSpan: SHARED.uHueSpan,
  uHueDir: SHARED.uHueDir,
  uSat: SHARED.uSat,
  uThemeHueOffset: SHARED.uThemeHueOffset,
  uThemeSatMul: SHARED.uThemeSatMul
};

/**
 * Colour wheel convention: low frequencies are red, rotating up to purple at the top.
 * Also includes softHDR() for saturation-preserving HDR compression on loud peaks.
 */
export const HUE_PARS = /* glsl */ `
uniform float uHueShift;
uniform float uHueSpan;
uniform float uHueDir;
uniform float uSat;
uniform float uThemeHueOffset;
uniform float uThemeSatMul;
vec3 rawHueColor(float h) {
  float t = uHueShift + uThemeHueOffset + (h / ${HUE_MAX.toFixed(2)}) * uHueSpan * uHueDir;
  vec3 c = clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(dot(c, vec3(0.3333))), c, uSat);
}
vec3 hueColor(float h) {
  float t = uHueShift + uThemeHueOffset + (h / ${HUE_MAX.toFixed(2)}) * uHueSpan * uHueDir;
  vec3 c = clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(dot(c, vec3(0.3333))), c, clamp(uSat * uThemeSatMul, 0.0, 1.0));
}
vec3 softHDR(vec3 c, float maxPeak) {
  float m = max(max(c.r, c.g), c.b);
  if (m <= 0.0001) return c;
  float compressed = maxPeak * (1.0 - exp(-m / maxPeak));
  return c * (compressed / m);
}
`;

const _fract = (x) => x - Math.floor(x);

/** JS twin of hueColor(): sets `color` from a 0..HUE_MAX hue with the user's colour settings & visual theme. */
export function setAudioColor(color, h, lightness = 0.55) {
  const t = SHARED.uHueShift.value + SHARED.uThemeHueOffset.value + (h / HUE_MAX) * SHARED.uHueSpan.value * SHARED.uHueDir.value;
  const sat = Math.min(1, Math.max(0, SHARED.uSat.value * SHARED.uThemeSatMul.value));
  return color.setHSL(_fract(t), sat, lightness);
}

/** JS twin of rawHueColor(): preserves full saturation for peak-frequency strobe highlights. */
export function setRawAudioColor(color, h, lightness = 0.55) {
  const t = SHARED.uHueShift.value + SHARED.uThemeHueOffset.value + (h / HUE_MAX) * SHARED.uHueSpan.value * SHARED.uHueDir.value;
  return color.setHSL(_fract(t), SHARED.uSat.value, lightness);
}

export const AUDIO_PARS = /* glsl */ `
uniform float uHue;
uniform float uActive;
uniform float uBands[7];
${HUE_PARS}
vec3 bandColor(float band) {
  return hueColor(band / 6.0 * ${HUE_MAX.toFixed(2)});
}
float bandLevel(float band) {
  float r = uBands[0];
  if (band > 0.5) r = uBands[1];
  if (band > 1.5) r = uBands[2];
  if (band > 2.5) r = uBands[3];
  if (band > 3.5) r = uBands[4];
  if (band > 4.5) r = uBands[5];
  if (band > 5.5) r = uBands[6];
  return r;
}
`;

export const OUTPUT_CHUNK = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
