/**
 * Parametric state management & defaults for 17-UltraSonicTouch
 */

export const state = {
  // Transducer Hardware Specifications
  transducerCount: 20,         // Total TCT40 transmitters (20 available)
  transducerDiam: 16.0,        // Transducer cylinder OD (mm)
  transducerDepth: 12.0,       // Transducer cylinder height (mm)
  transducerKerf: 0.2,         // 3D printer bore tolerance offset (mm)
  wireHoleDiam: 4.0,           // Wire pass-through hole (mm)

  // Array Geometry Parameters
  focalDistance: 100.0,        // Distance from center of dish to focal point (mm)
  dishThickness: 5.0,          // Shell thickness of the mounting dish (mm)
  dishRimMargin: 18.0,         // Wide buffer zone margin around outermost transducers (mm)
  retentionLip: 1.2,           // Backside retention lip width (mm)

  // Viewport / Simulation settings
  showFocalRays: true,
  showWaveFronts: true,
  animateWaves: true,

  // Render & Exporter options
  frameTopology: 'spider',     // 'spider' (Truss Web, 0% Support, 65% Material Savings) vs 'dish' (Solid Shell)
  highResMesh: true
};

export const listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
}

export function updateState(key, val) {
  if (state[key] !== undefined) {
    state[key] = val;
    listeners.forEach(fn => fn(state));
  }
}
