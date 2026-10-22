// STL + experiment manifest exporters
import { params, library, kitStatus, MOTOR, KIT_ENVELOPE, context } from './state.js';
import {
  generateHub,
  generateFitCoupon,
  generateGuard,
  generateEccentricRotor,
  partBounds
} from './geometry.js';
import { packKit, itemsFromKitParts, placeModel } from './packing.js';
import { getSelectedRotor, updateKitPacking } from './mutation.js';

let stlExporterPromise = null;

/**
 * Load the canonical shared exporter only when an STL button is clicked.
 * A static parent-directory import prevents the entire app from booting when
 * Live Server is rooted inside this project folder.
 */
function getModelToSTL() {
  if (!stlExporterPromise) {
    stlExporterPromise = import('../../00-CommonParts/Exporter/stl.js')
      .then(module => module.modelToSTL)
      .catch(() => {
        console.warn('Shared STL exporter is outside this server root; using isolated-host fallback.');
        return fallbackModelToSTL;
      });
  }
  return stlExporterPromise;
}

// Same ASCII format as the shared exporter; used only for isolated project hosting.
function fallbackModelToSTL(model, name) {
  if (!model) return '';
  const mesh = model.getMesh();
  const vertices = mesh.vertProperties;
  const triangles = mesh.triVerts;
  let stl = `solid ${name}\n`;
  for (let i = 0; i < triangles.length; i += 3) {
    const points = [triangles[i], triangles[i + 1], triangles[i + 2]]
      .map(index => `${vertices[index * 3]} ${vertices[index * 3 + 1]} ${vertices[index * 3 + 2]}`);
    stl += `facet normal 0 0 0\n  outer loop\n`;
    for (const point of points) stl += `    vertex ${point}\n`;
    stl += `  endloop\nendfacet\n`;
  }
  return `${stl}endsolid ${name}`;
}

function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function downloadSTL(model, name) {
  const modelToSTL = await getModelToSTL();
  const stl = modelToSTL(model, name);
  dl(new Blob([stl], { type: 'text/plain' }), `${name}.stl`);
}

export async function exportHubSTL() {
  const m = generateHub();
  await downloadSTL(m, 'HapticHub_M1N10FB11G');
  m.delete();
}

export async function exportFitCouponSTL() {
  const m = generateFitCoupon();
  await downloadSTL(m, 'HapticHex_FitCoupon');
  m.delete();
}

export async function exportGuardSTL() {
  const m = generateGuard();
  await downloadSTL(m, 'HapticSpinGuard');
  m.delete();
}

export async function exportSelectedSTL() {
  const r = getSelectedRotor();
  if (!r) return;
  const { model } = generateEccentricRotor(r);
  await downloadSTL(model, `${r.id}_${r.shape}`);
  model.delete();
}

function makePart(id) {
  if (id === 'HUB') {
    const model = generateHub();
    return { id, model, size: partBounds(model).size };
  }
  if (id === 'FIT') {
    const model = generateFitCoupon();
    return { id, model, size: partBounds(model).size };
  }
  const r = library.rotors.find(x => x.id === id);
  if (!r) return null;
  const g = generateEccentricRotor(r);
  return { id, model: g.model, size: partBounds(g.model).size };
}

export async function exportPackedKitSTL() {
  if (!context.Manifold) return;
  const pack = updateKitPacking();
  if (!pack.fits) {
    alert(`Cannot export packed kit:\n${pack.message}`);
    return;
  }

  // Measure once for packing layout
  const measureIds = ['HUB', 'FIT', ...library.rotors.map(r => r.id)];
  const measured = [];
  for (const id of measureIds) {
    const p = makePart(id);
    if (!p) continue;
    measured.push({ id: p.id, size: p.size });
    p.model.delete();
  }

  const result = packKit(itemsFromKitParts(measured));
  if (!result.fits) {
    alert(result.message);
    return;
  }

  let combined = null;
  for (const placement of result.placements) {
    const part = makePart(placement.id);
    if (!part) continue;
    const placed = placeModel(part.model, placement);
    if (!combined) combined = placed;
    else {
      const n = combined.add(placed);
      combined.delete();
      placed.delete();
      combined = n;
    }
  }

  if (combined) {
    await downloadSTL(combined, 'HapticWeightLab_Kit_41x19x10');
    combined.delete();
  }
}

export function exportManifestJSON() {
  const data = {
    motor: MOTOR,
    envelope: KIT_ENVELOPE,
    params: { ...params },
    seed: library.seed,
    kit: {
      fits: kitStatus.fits,
      message: kitStatus.message,
      packedBounds: kitStatus.packedBounds,
      placements: kitStatus.placements
    },
    rotors: library.rotors.map(r => ({
      id: r.id,
      shape: r.shape,
      od: r.od,
      thickness: r.thickness,
      ecc: r.ecc,
      massG: r.massG,
      comOffset: r.comOffset,
      volumeMm3: r.volumeMm3,
      forceTargetN: r.forceTargetN,
      forceRatedN: r.forceRatedN,
      forceNoLoadN: r.forceNoLoadN,
      eccentricMomentGmm: r.massG * r.comOffset
    }))
  };
  dl(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'haptic-weight-lab.json');
}

export function exportManifestCSV() {
  const keys = [
    'id', 'shape', 'od', 'thickness', 'ecc', 'massG', 'comOffset',
    'forceTargetN', 'forceRatedN', 'forceNoLoadN', 'eccentricMomentGmm'
  ];
  const rows = [keys.join(',')];
  for (const r of library.rotors) {
    rows.push([
      r.id, r.shape, r.od, r.thickness, r.ecc,
      r.massG.toFixed(4), r.comOffset.toFixed(3),
      r.forceTargetN.toFixed(4), r.forceRatedN.toFixed(4), r.forceNoLoadN.toFixed(4),
      (r.massG * r.comOffset).toFixed(4)
    ].join(','));
  }
  dl(new Blob([rows.join('\n')], { type: 'text/csv' }), 'haptic-weight-lab.csv');
}
