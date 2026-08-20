// Runtime state for Haptic Eccentric Weight Lab
// Motor: Minebea / NMB M1N10FB11G

export const MOTOR = {
  part: 'M1N10FB11G',
  frameW: 12.0,
  frameH: 10.0,
  frameL: 20.0,
  shaftDiam: 1.0,
  shaftLen: 8.5,
  ratedRpm: 13740,
  noLoadRpm: 16040,
  ratedVoltage: 5.0,
  massG: 8.0
};

/** Compact kit packing envelope (mm) */
export const KIT_ENVELOPE = {
  w: 41.0,
  d: 19.0,
  h: 10.0
};

export const params = {
  // Hub / shaft — Bambu A1 0.6 mm nozzle hole compensation
  // Small FDM holes print undersize (~0.4–0.5 mm on ⌀ for PETG @ 0.6).
  // CAD bore = shaft + glueClearance + holeKerf → as-printed ≈ shaft + glue.
  shaftDiam: 1.0,         // mm — motor shaft (M1N10FB11G)
  shaftGlueClearance: 0.08, // mm diam — loose enough for CA, still concentric
  holeKerf: 0.45,         // mm diam — A1 0.6 mm nozzle hole undersize
  shaftInsertMax: 4.25,   // mm — half shaft, hard stop
  hubOd: 5.5,             // mm — wall ≈2.0; gives two skirt rows packing tolerance
  hubHeight: 7.9,         // mm — keeps rotor stack <10 mm for two-row packing
  minWall: 1.6,           // mm — ≥2× 0.6 mm extrusion

  // Hex drive + skirt mount
  hexAf: 3.4,             // mm across-flats
  hexDepth: 2.4,          // mm slot / peg engagement
  hexClearance: 0.22,     // mm per side (FDM)
  skirtWall: 1.6,         // mm retaining lip thickness

  // Rotor eccentric mass
  rotorThickness: 2.2,    // mm top plate
  rotorOdMax: 7.6,        // mm — five skirts pack in two rows
  eccMin: 0.6,
  eccMax: 2.0,
  rotorCount: 5,
  shapeMix: 'all',

  // Physics
  petgDensity: 1.27,
  targetRpm: 13740,

  // Viewport
  explode: 45,
  slideAmount: 0,         // 0 = seated, 100 = lifted off
  opacity: 90,
  mode: 'rendered'
};

export const visibilities = {
  motor: true,
  hub: true,
  rotor: true,
  fitCoupon: true,
  guard: false,
  envelope: true
};

export const meshes = {
  motor: null,
  hub: null,
  rotor: null,
  fitCoupon: null,
  guard: null,
  envelope: null
};

export const context = {
  wasm: null,
  Manifold: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  mainGroup: null
};

export const colors = {
  motor: 0x666688,
  hub: 0x00f2ff,
  rotor: 0xc8ff00,
  fitCoupon: 0xffaa00,
  guard: 0xff5e97,
  envelope: 0x4488ff
};

export const library = {
  rotors: [],
  selectedId: null,
  seed: 0
};

export const kitStatus = {
  fits: true,
  message: 'Kit empty — run mutation',
  packedBounds: null,
  placements: []
};
