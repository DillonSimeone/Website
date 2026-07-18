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

const SHAPES = ['offset', 'crescent', 'lobe'];

export function shapeForIndex(i, mix) {
  if (mix === 'offset' || mix === 'crescent' || mix === 'lobe') return mix;
  return SHAPES[i % SHAPES.length];
}

function buildEccentricCap(shape, od, thickness, ecc, skirtOuterR) {
  const R = Math.max(od / 2, skirtOuterR + 0.2);
  const t = thickness;
  const eccClamped = Math.min(ecc, R * 0.42);

  // Always include a solid drive plate covering the skirt OD
  let plate = cyl(Math.max(R * 0.92, skirtOuterR), t, 48);

  if (shape === 'offset') {
    let heavy = cyl(R * 0.7, t, 36).translate([eccClamped, 0, 0]);
    plate = plate.add(heavy);
    heavy.delete();
    return plate;
  }

  if (shape === 'crescent') {
    const cutR = R * 0.55;
    const cutShift = R * 0.55 + eccClamped * 0.3;
    // Keep cut away from center so hex/skirt stay solid
    let cut = cyl(cutR, t + 0.4, 40).translate([-cutShift, 0, 0]);
    let body = plate.subtract(cut);
    plate.delete();
    cut.delete();
    // Reinforce center
    let core = cyl(skirtOuterR + 0.4, t, 40);
    body = body.add(core);
    core.delete();
    return body;
  }

  // lobe
  const lobeR = R * 0.5;
  const lobeShift = Math.min(eccClamped + lobeR * 0.15, R - lobeR - 0.2);
  let lobe = cyl(lobeR, t, 36).translate([lobeShift, 0, 0]);
  plate = plate.add(lobe);
  lobe.delete();
  return plate;
}

function estimateComOffset(shape, od, ecc) {
  if (shape === 'offset') return Math.min(ecc * 0.8, od * 0.32);
  if (shape === 'crescent') return Math.min(ecc * 0.95, od * 0.34);
  return Math.min(ecc * 0.88, od * 0.33);
}

/**
 * Weight: eccentric top + hex peg + skirt that slides over the full adapter height.
 * Extremely hard to fling axially off while spinning.
 */
export function generateEccentricRotor(spec) {
  const p = params;
  const shape = spec.shape || 'offset';
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
