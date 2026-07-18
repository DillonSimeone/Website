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

/**
 * Run a mutation: generate graded rotors, validate connectivity & envelope,
 * update kit packing status for hub + coupon + rotors.
 */
export async function runMutation() {
  const count = Math.max(1, Math.min(12, params.rotorCount | 0));
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  library.seed = seed;

  // Dispose previous meshes
  clearLibraryMeshes();

  const specs = buildLadderSpecs(count, seed);
  const rotors = [];
  const badge = document.getElementById('count-badge');
  if (badge) badge.textContent = 'GENERATING…';

  await yieldFrame();

  for (const spec of specs) {
    let attempts = 0;
    let result = null;
    while (attempts < 8) {
      const trySpec = attempts === 0 ? spec : {
        ...spec,
        ecc: Math.max(0.4, spec.ecc - attempts * 0.15),
        od: Math.max(6.6, spec.od - attempts * 0.2)
      };
      result = generateEccentricRotor(trySpec);
      if (result.meta.connected && result.meta.maxDim <= 12.5) break;
      result.model.delete();
      result = null;
      attempts++;
    }
    if (!result) {
      // Safe connected fallback: centered offset family with modest ecc
      result = generateEccentricRotor({
        ...spec,
        shape: 'offset',
        ecc: Math.min(spec.ecc, 1.2),
        od: Math.min(spec.od, params.rotorOdMax)
      });
    }
    // Keep metadata only — geometry is regenerated on rebuild/export
    const { model, meta } = result;
    model.delete();
    rotors.push({
      id: spec.id,
      ...meta,
      mesh: null
    });
  }

  // Sort by eccentric moment m*r for a clean ladder
  rotors.sort((a, b) => (a.massG * a.comOffset) - (b.massG * b.comOffset));

  library.rotors = rotors;
  library.selectedId = rotors[0]?.id ?? null;

  updateKitPacking();
  if (badge) badge.textContent = `${rotors.length} ROTORS · SEED ${seed.toString(16).toUpperCase()}`;
  return rotors;
}

export function updateKitPacking() {
  // Measure hub + coupon + each rotor
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
  return new Promise(r => setTimeout(r, 30));
}
