// Geometry aggregator — Haptic Eccentric Weight Lab
export {
  box, cyl, manifoldToThree, estimateVolumeMm3, massFromVolumeMm3,
  centrifugalForceN, isSingleComponent, partBounds
} from './geometry/helpers.js';
export {
  generateHub, generateFitCoupon, generateMotorGhost,
  hexMountDims, hexPrism, hexVertexR, weightInterfaceSolid
} from './geometry/hub.js';
export { generateEccentricRotor, buildLadderSpecs, shapeForIndex } from './geometry/rotors.js';
export { generateGuard, generateEnvelopeGhost } from './geometry/guard.js';
