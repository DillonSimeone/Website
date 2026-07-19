// Graded mutation engine — produces a force ladder of eccentric rotors
import { params, library, kitStatus } from './state.js';
import {
  generateEccentricRotor,
  buildLadderSpecs,
  generateHub,
  generateFitCoupon,
  partBounds
} from './geometry.js';
import { packKit, itemsFromKitParts } from './packing.js';

const FIXED_PART_IDS = new Set(['HUB', 'FIT']);
const MAX_PACK_ROUNDS = 48;

/**
 * Run a mutation: generate graded rotors, then keep regenerating any that
 * fail kit packing until the whole kit is placeable (or only fixed parts remain).
 */
export async function runMutation() {
  const count = Math.max(1, Math.min(12, params.rotorCount | 0));
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  library.seed = seed;

  clearLibraryMeshes();

  const specs = buildLadderSpecs(count, seed);
  const badge = document.getElementById('count-badge');
  if (badge) badge.textContent = 'GENERATING…';

  await yieldFrame();

  let rotors = [];
  for (const spec of specs) {
    const entry = makeRotorEntry(spec);
    if (entry) rotors.push(entry);
  }

  rotors = await repairUntilPackable(rotors, count, badge);

  rotors.sort((a, b) => (a.massG * a.comOffset) - (b.massG * b.comOffset));
  library.rotors = rotors;
  library.selectedId = rotors[0]?.id ?? null;

  const pack = updateKitPacking();
  if (pack.fits && rotors.length < count) {
    kitStatus.message = `${pack.message} (trimmed ${count}→${rotors.length} rotors to fit)`;
  }
  if (badge) {
    const tag = pack.fits ? 'PACKED' : 'OVERFLOW';
    badge.textContent = `${rotors.length} ROTORS · ${tag} · SEED ${seed.toString(16).toUpperCase()}`;
  }
  return rotors;
}

/**
 * Regenerate rejected rotors (progressively smaller) until packKit succeeds.
 * If a rotor cannot shrink further, drop it and continue so the kit always ends placeable.
 */
async function repairUntilPackable(rotors, requestedCount, badge) {
  const shrinkStep = new Map(); // id → how many shrinks applied

  for (let round = 0; round < MAX_PACK_ROUNDS; round++) {
    library.rotors = rotors;
    const pack = updateKitPacking();
    if (pack.fits) return rotors;

    const rejected = (pack.rejected || []).filter(id => !FIXED_PART_IDS.has(id));
    if (badge) {
      badge.textContent = `REPACKING… ${rejected.length || pack.rejected?.length || '?'} left (round ${round + 1})`;
    }
    await yieldFrame();

    if (!rejected.length) {
      // HUB/FIT blocked the bin — shrink every rotor, then drop the largest if stuck
      const before = footprintKey(rotors);
      rotors = rotors.map(r => regenerateShrunk(r, (shrinkStep.get(r.id) || 0) + 1, shrinkStep));
      if (footprintKey(rotors) === before) {
        rotors = dropLargestRotor(rotors);
        if (!rotors.length) return rotors;
      }
      continue;
    }

    let progressed = false;
    const next = [];
    for (const r of rotors) {
      if (!rejected.includes(r.id)) {
        next.push(r);
        continue;
      }
      const step = (shrinkStep.get(r.id) || 0) + 1;
      const shrunk = regenerateShrunk(r, step, shrinkStep);
      if (shrunk && sizeChanged(r, shrunk)) {
        next.push(shrunk);
        progressed = true;
      } else if (shrunk && step <= 2) {
        // Skirt-dominated AABB: try a couple shrinks, then drop
        next.push(shrunk);
        progressed = true;
      } else {
        // Cannot shrink pack footprint further — drop this rotor
        progressed = true;
      }
    }

    if (!progressed) {
      // Nothing changed — drop one rejected rotor
      const dropId = rejected[0];
      rotors = rotors.filter(r => r.id !== dropId);
    } else {
      rotors = next;
    }

    if (!rotors.length) return rotors;
  }

  // Last resort: keep dropping until pack fits
  while (rotors.length) {
    library.rotors = rotors;
    if (updateKitPacking().fits) break;
    rotors = dropLargestRotor(rotors);
  }
  return rotors;
}

function makeRotorEntry(spec) {
  let attempts = 0;
  let result = null;
  while (attempts < 8) {
    const trySpec = attempts === 0 ? spec : shrinkSpec(spec, attempts);
    result = generateEccentricRotor(trySpec);
    if (result.meta.connected && result.meta.maxDim <= 12.5) break;
    result.model.delete();
    result = null;
    attempts++;
  }
  if (!result) {
    result = generateEccentricRotor({
      ...spec,
      shape: 'offset',
      ecc: Math.min(spec.ecc, 1.0),
      od: Math.min(spec.od, Math.min(params.rotorOdMax, 7.2)),
      thickness: Math.min(spec.thickness, params.minWall + 0.8)
    });
  }
  const { model, meta } = result;
  model.delete();
  return {
    id: spec.id,
    spec: { ...spec },
    ...meta,
    mesh: null
  };
}

function shrinkSpec(spec, step) {
  const floorOd = 6.4;
  const floorEcc = 0.35;
  const floorT = params.minWall + 0.6;
  return {
    ...spec,
    od: Math.max(floorOd, +(spec.od - 0.25 * step).toFixed(1)),
    ecc: Math.max(floorEcc, +(spec.ecc - 0.12 * step).toFixed(2)),
    thickness: Math.max(floorT, +(spec.thickness - 0.1 * step).toFixed(1))
  };
}

function regenerateShrunk(rotor, step, shrinkStep) {
  const base = rotor.spec || {
    id: rotor.id,
    shape: rotor.shape,
    od: rotor.od,
    ecc: rotor.ecc,
    thickness: rotor.thickness
  };
  const spec = shrinkSpec(base, step);
  shrinkStep.set(rotor.id, step);
  const entry = makeRotorEntry(spec);
  if (!entry) return null;
  // Keep stable id so gallery / selection survive repacks
  entry.id = rotor.id;
  entry.spec = spec;
  return entry;
}

function dropLargestRotor(rotors) {
  if (rotors.length <= 1) return [];
  let worst = rotors[0];
  let worstScore = packScore(worst);
  for (const r of rotors) {
    const s = packScore(r);
    if (s > worstScore) {
      worst = r;
      worstScore = s;
    }
  }
  return rotors.filter(r => r.id !== worst.id);
}

function packScore(r) {
  const size = r.bounds?.size || [r.od, r.od, r.thickness];
  return size[0] * size[1] * size[2];
}

function sizeChanged(a, b) {
  const as = a.bounds?.size || [a.od, a.od, a.thickness];
  const bs = b.bounds?.size || [b.od, b.od, b.thickness];
  return as.some((v, i) => Math.abs(v - bs[i]) > 0.05);
}

function footprintKey(rotors) {
  return rotors
    .map(r => {
      const s = r.bounds?.size || [0, 0, 0];
      return `${r.id}:${s.map(x => x.toFixed(2)).join('x')}`;
    })
    .join('|');
}

export function updateKitPacking() {
  let hub = generateHub();
  let coupon = generateFitCoupon();
  const hubSize = partBounds(hub).size;
  const couponSize = partBounds(coupon).size;
  hub.delete();
  coupon.delete();

  const parts = [
    { id: 'HUB', size: hubSize },
    { id: 'FIT', size: couponSize },
    ...library.rotors.map(r => ({
      id: r.id,
      size: r.bounds?.size || [r.od, r.od, r.thickness]
    }))
  ];

  const packItems = itemsFromKitParts(parts);
  const result = packKit(packItems);
  kitStatus.fits = result.fits;
  kitStatus.message = result.message;
  kitStatus.packedBounds = result.packedBounds;
  kitStatus.placements = result.placements;
  kitStatus.rejected = result.rejected;
  return result;
}

export function selectRotor(id) {
  library.selectedId = id;
}

export function getSelectedRotor() {
  return library.rotors.find(r => r.id === library.selectedId) || null;
}

export function clearLibrary() {
  clearLibraryMeshes();
  library.rotors = [];
  library.selectedId = null;
  kitStatus.fits = true;
  kitStatus.message = 'Kit empty — run mutation';
  kitStatus.placements = [];
  kitStatus.rejected = [];
}

function clearLibraryMeshes() {
  for (const r of library.rotors) {
    if (r.mesh) {
      r.mesh.geometry?.dispose?.();
      if (r.mesh.material) {
        if (Array.isArray(r.mesh.material)) r.mesh.material.forEach(m => m.dispose());
        else r.mesh.material.dispose();
      }
      r.mesh = null;
    }
  }
}

function yieldFrame() {
  return new Promise(r => setTimeout(r, 16));
}
