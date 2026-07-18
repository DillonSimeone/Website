// Deterministic flat packing into the 41×19×10 mm kit envelope
import { KIT_ENVELOPE } from './state.js';

/**
 * Pack parts laid flat (smallest AABB axis → print height Z).
 * Single-floor shelf packer optimized for hub + coupon + small rotors.
 * Never silently scales — reports overflow if the kit cannot fit.
 */
export function packKit(items, envelope = KIT_ENVELOPE) {
  const bin = { w: envelope.w, d: envelope.d, h: envelope.h };
  const gap = 0.5;

  const normalized = items.map(item => {
    const sorted = [...item.size].sort((x, y) => x - y);
    return {
      id: item.id,
      // Prefer orientation: height = smallest, then try both footprint swaps
      height: sorted[0],
      footA: sorted[2],
      footB: sorted[1],
      rawSize: [...item.size]
    };
  });

  // Reject anything taller than the envelope immediately
  const rejected = [];
  const placeable = [];
  for (const item of normalized) {
    if (item.height > bin.h + 1e-6) rejected.push(item.id);
    else placeable.push(item);
  }

  // Largest footprint first for denser shelves
  placeable.sort((a, b) => (b.footA * b.footB) - (a.footA * a.footB));

  const placements = [];
  // shelves: { y, rowD, xCursor }
  const shelves = [];
  let layerZ = 0;
  let layerH = 0;

  function tryShelfPlace(item, allowNewShelf) {
    const variants = [
      { sx: item.footA, sy: item.footB, yaw: 0 },
      { sx: item.footB, sy: item.footA, yaw: 90 }
    ];

    for (const v of variants) {
      if (v.sx > bin.w + 1e-6 || v.sy > bin.d + 1e-6) continue;
      if (layerZ + item.height > bin.h + 1e-6) continue;

      for (const shelf of shelves) {
        if (v.sy > shelf.rowD + 1e-6) continue;
        if (shelf.xCursor + v.sx <= bin.w + 1e-6) {
          const x = shelf.xCursor;
          const y = shelf.y;
          shelf.xCursor += v.sx + gap;
          layerH = Math.max(layerH, item.height);
          placements.push({
            id: item.id,
            position: [x + v.sx / 2, y + v.sy / 2, layerZ + item.height / 2],
            size: [v.sx, v.sy, item.height],
            yaw: v.yaw,
            height: item.height
          });
          return true;
        }
      }

      if (!allowNewShelf) continue;
      const usedY = shelves.reduce((m, s) => Math.max(m, s.y + s.rowD + gap), 0);
      if (usedY + v.sy <= bin.d + 1e-6) {
        shelves.push({ y: usedY, rowD: v.sy, xCursor: v.sx + gap });
        layerH = Math.max(layerH, item.height);
        placements.push({
          id: item.id,
          position: [v.sx / 2, usedY + v.sy / 2, layerZ + item.height / 2],
          size: [v.sx, v.sy, item.height],
          yaw: v.yaw,
          height: item.height
        });
        return true;
      }
    }
    return false;
  }

  const deferred = [];
  for (const item of placeable) {
    if (!tryShelfPlace(item, true)) deferred.push(item);
  }

  // Second pass: try remaining into existing shelves only, then a stacked layer
  if (deferred.length) {
    const still = [];
    for (const item of deferred) {
      if (!tryShelfPlace(item, false)) still.push(item);
    }

    if (still.length) {
      // New Z layer above current
      const nextZ = layerZ + layerH + gap;
      if (nextZ < bin.h) {
        layerZ = nextZ;
        layerH = 0;
        shelves.length = 0;
        for (const item of still) {
          if (!tryShelfPlace(item, true)) rejected.push(item.id);
        }
      } else {
        still.forEach(i => rejected.push(i.id));
      }
    }
  }

  let maxX = 0, maxY = 0, maxZ = 0;
  for (const p of placements) {
    maxX = Math.max(maxX, p.position[0] + p.size[0] / 2);
    maxY = Math.max(maxY, p.position[1] + p.size[1] / 2);
    maxZ = Math.max(maxZ, p.position[2] + p.size[2] / 2);
  }

  const fits = rejected.length === 0 && placements.length === items.length;
  return {
    fits,
    placements,
    rejected,
    packedBounds: { w: maxX, d: maxY, h: maxZ },
    envelope: { ...bin },
    message: fits
      ? `Kit fits ${placements.length} parts in ${maxX.toFixed(1)}×${maxY.toFixed(1)}×${maxZ.toFixed(1)} mm`
      : `OVERFLOW — could not place: ${rejected.join(', ') || 'unknown'}`
  };
}

export function itemsFromKitParts(parts) {
  return parts.map(p => ({ id: p.id, size: [...p.size] }));
}

/** Lay centered part flat (min axis → Z), yaw, move to pack cell. Consumes model. */
export function placeModel(model, placement) {
  let m = model;
  const bb0 = m.boundingBox();
  const size = [
    bb0.max[0] - bb0.min[0],
    bb0.max[1] - bb0.min[1],
    bb0.max[2] - bb0.min[2]
  ];
  const minAxis = size.indexOf(Math.min(...size));

  if (minAxis === 0) {
    const n = m.rotate([0, 90, 0]);
    m.delete();
    m = n;
  } else if (minAxis === 1) {
    const n = m.rotate([90, 0, 0]);
    m.delete();
    m = n;
  }

  if (placement.yaw) {
    const n = m.rotate([0, 0, placement.yaw]);
    m.delete();
    m = n;
  }

  const bb = m.boundingBox();
  const cx = (bb.min[0] + bb.max[0]) / 2;
  const cy = (bb.min[1] + bb.max[1]) / 2;
  const cz = (bb.min[2] + bb.max[2]) / 2;
  const [px, py, pz] = placement.position;
  const placed = m.translate([px - cx, py - cy, pz - cz]);
  m.delete();
  return placed;
}
