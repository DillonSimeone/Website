// Eccentric rotors — hex peg + full-height skirt over the adapter
import { MOTOR, params } from '../state.js';
import {
  box,
  cyl,
  estimateVolumeMm3,
  massFromVolumeMm3,
  centrifugalForceN,
  isSingleComponent,
  partBounds
} from './helpers.js';
import { hexMountDims, hexPrism } from './hub.js';

const SHAPES = ['arrow', 'flat', 'twoflat', 'threeflat', 'crescent'];

export function shapeForIndex(i, mix) {
  if (SHAPES.includes(mix)) return mix;
  return SHAPES[i % SHAPES.length];
}

/** Slice off everything beyond a chord at distance d from center, facing angleDeg. */
function chordCut(body, d, angleDeg, R, t) {
  let cut = box(R * 2.5, R * 3.2, t + 0.4)
    .translate([d + R * 1.25, 0, 0])
    .rotate([0, 0, angleDeg]);
  const out = body.subtract(cut);
  body.delete();
  cut.delete();
  return out;
}

/**
 * Five visually unmistakable top silhouettes (heavy side = +X on all):
 *  arrow     — round plate with a sharp spike
 *  flat      — one straight chord on the light side (D-profile)
 *  twoflat   — two angled chords meeting on the light side (shield)
 *  threeflat — three chords, only the heavy side stays round
 *  crescent  — circular bite out of the light edge
 * Cuts never reach the skirt cavity, so the drive plate stays sealed.
 */
function buildEccentricCap(shape, od, thickness, ecc, skirtOuterR) {
  const R = Math.max(od / 2, skirtOuterR + 0.2);
  const t = thickness;
  const eccClamped = Math.min(ecc, R * 0.42);
  const wall = Math.max(1.6, params.skirtWall);
  // Deepest allowed cut: keep ≥0.4 mm of cap over the skirt cavity rim
  const seal = skirtOuterR - wall + 0.4;
  const dFlat = Math.max(seal, skirtOuterR - 0.35 - eccClamped * 0.45);

  // Disc kept just past the skirt so two rotor rows still pack in 19 mm depth
  const capR = Math.max(R * 0.92, skirtOuterR + 0.05);
  let cap = cyl(capR, t, 48);

  if (shape === 'arrow') {
    // Triangular prism (3-segment cylinder) — vertex points along +X
    const tip = Math.min(R + 1.1 + eccClamped * 0.5, 5.9);
    const triR = R * 0.8;
    let spike = cyl(triR, t, 3).translate([tip - triR, 0, 0]);
    const merged = cap.add(spike);
    cap.delete();
    spike.delete();
    return merged;
  }

  if (shape === 'flat') {
    return chordCut(cap, dFlat, 180, R, t);
  }

  if (shape === 'twoflat') {
    cap = chordCut(cap, dFlat, 140, R, t);
    return chordCut(cap, dFlat, 220, R, t);
  }

  if (shape === 'threeflat') {
    cap = chordCut(cap, dFlat, 90, R, t);
    cap = chordCut(cap, dFlat, 180, R, t);
    return chordCut(cap, dFlat, 270, R, t);
  }

  // crescent — bite tangent to the seal radius on the light side
  const cutR = R * 0.62 + eccClamped * 0.2;
  let bite = cyl(cutR, t + 0.4, 40).translate([-(cutR + seal), 0, 0]);
  const body = cap.subtract(bite);
  cap.delete();
  bite.delete();
  return body;
}

function estimateComOffset(shape, od, ecc) {
  const gain = {
    arrow: 0.95,
    flat: 0.6,
    twoflat: 0.75,
    threeflat: 0.85,
    crescent: 0.8
  }[shape] ?? 0.8;
  return Math.min(ecc * gain, od * 0.34);
}

/**
 * Weight: eccentric top + hex peg + skirt that slides over the full adapter height.
 * Extremely hard to fling axially off while spinning.
 */
export function generateEccentricRotor(spec) {
  const p = params;
  const shape = spec.shape || 'arrow';
  const od = Math.min(spec.od ?? p.rotorOdMax, p.rotorOdMax);
  const thickness = Math.max(spec.thickness ?? p.rotorThickness, p.minWall + 0.6);
  const ecc = spec.ecc ?? 1.2;
  const { pegAf, hexDepth, skirtInnerR, skirtOuterR } = hexMountDims();
  const skirtH = p.hubHeight;

  // Skirt tube
  let skirt = cyl(skirtOuterR, skirtH, 48);
  let cavity = cyl(skirtInnerR, skirtH + 0.25, 48);
  let body = skirt.subtract(cavity);
  skirt.delete();
  cavity.delete();

  // Eccentric top cap — overlap skirt by 0.15 so boolean stays one solid
  const overlap = 0.15;
  let cap = buildEccentricCap(shape, od, thickness, ecc, skirtOuterR)
    .translate([0, 0, skirtH / 2 + thickness / 2 - overlap]);
  body = body.add(cap);
  cap.delete();

  // Hex peg from underside of cap (overlaps into cap)
  const pegH = Math.max(2.0, Math.min(hexDepth - p.hexClearance * 0.5, skirtH * 0.45));
  let peg = hexPrism(pegAf, pegH + overlap)
    .translate([0, 0, skirtH / 2 - pegH / 2]);
  body = body.add(peg);
  peg.delete();

  // Heavy-side index on top (shallow)
  let mark = box(0.9, 1.4, Math.min(0.8, thickness * 0.35))
    .translate([od / 2 - 0.35, 0, skirtH / 2 + thickness - 0.25]);
  body = body.subtract(mark);
  mark.delete();

  const volume = estimateVolumeMm3(body);
  const massG = massFromVolumeMm3(volume);
  const comOffset = estimateComOffset(shape, od, ecc);
  const forceRated = centrifugalForceN(massG, comOffset, MOTOR.ratedRpm);
  const forceNoLoad = centrifugalForceN(massG, comOffset, MOTOR.noLoadRpm);
  const forceTarget = centrifugalForceN(massG, comOffset, p.targetRpm);
  const bounds = partBounds(body);
  const connected = isSingleComponent(body);

  return {
    model: body,
    meta: {
      shape,
      od,
      thickness,
      ecc,
      skirtH,
      volumeMm3: volume,
      massG,
      comOffset,
      forceRatedN: forceRated,
      forceNoLoadN: forceNoLoad,
      forceTargetN: forceTarget,
      bounds,
      connected,
      maxDim: Math.max(...bounds.size)
    }
  };
}

export function buildLadderSpecs(count, seed = 0) {
  const p = params;
  const n = Math.max(1, Math.min(10, count | 0));
  let s = (seed >>> 0) || 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };

  const specs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ecc = p.eccMin + (p.eccMax - p.eccMin) * t;
    const odJitter = (rng() - 0.5) * 0.4;
    const od = Math.min(p.rotorOdMax, Math.max(7.5, p.rotorOdMax - 0.3 + odJitter));
    const shape = shapeForIndex(i, p.shapeMix);
    const thickness = Math.max(
      p.minWall + 0.8,
      Math.min(4.0, p.rotorThickness + (rng() - 0.5) * 0.25)
    );
    specs.push({
      id: `R${(seed % 0xffff).toString(16).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      shape,
      ecc: Math.round(ecc * 100) / 100,
      od: Math.round(od * 10) / 10,
      thickness: Math.round(thickness * 10) / 10
    });
  }
  return specs;
}
