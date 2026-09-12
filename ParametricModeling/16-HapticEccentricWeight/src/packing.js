// Deterministic flat packing into the 41×19×10 mm kit envelope
import { KIT_ENVELOPE } from './state.js';

/**
 * Pack parts laid flat (smallest AABB axis → print height Z).
 * Exact corner-search packer for the small kit (normally seven parts).
 * Unlike shelf packing, this can use the short spaces beside the hub/coupon.
 * Never silently scales — reports overflow if the kit cannot fit.
 */
export function packKit(items, envelope = KIT_ENVELOPE) {
  const bin = { w: envelope.w, d: envelope.d, h: envelope.h };
  const gap = 0.5;

  const normalized = items.map(item => ({
    id: item.id,
    rawSize: [...item.size]
  }));

  const rejected = normalized
    .filter(item => Math.min(...item.rawSize) > bin.h + 1e-6)
    .map(item => item.id);
  const placeable = normalized
    .filter(item => Math.min(...item.rawSize) <= bin.h + 1e-6)
    .sort((a, b) => minFootprintArea(b) - minFootprintArea(a));

  let best = [];
  const placed = [];
  let searchNodes = 0;
  const maxSearchNodes = 150000;

  function minFootprintArea(item) {
    const [x, y, z] = item.rawSize;
    return Math.min(x * y, x * z, y * z);
  }

  function variants(item) {
    const [x, y, z] = item.rawSize;
    const bases = [
      { sx: x, sy: y, height: z, upAxis: 2 },
      { sx: z, sy: y, height: x, upAxis: 0 },
      { sx: x, sy: z, height: y, upAxis: 1 }
    ].filter(v => v.height <= bin.h + 1e-6);
    const out = [];
    for (const base of bases) {
      out.push({ ...base, yaw: 0 });
      if (Math.abs(base.sx - base.sy) > 1e-6) {
        out.push({ ...base, sx: base.sy, sy: base.sx, yaw: 90 });
      }
    }
    // Prefer low height, then smaller footprint; search still backtracks through all.
    return out.sort((a, b) =>
      a.height - b.height || (a.sx * a.sy) - (b.sx * b.sy)
    );
  }

  function overlaps(x, y, sx, sy, p) {
    return !(
      x + sx + gap <= p.x + 1e-6 ||
      p.x + p.sx + gap <= x + 1e-6 ||
      y + sy + gap <= p.y + 1e-6 ||
      p.y + p.sy + gap <= y + 1e-6
    );
  }

  function candidateCoordinates() {
    const xs = [0];
    const ys = [0];
    for (const p of placed) {
      xs.push(p.x + p.sx + gap);
      ys.push(p.y + p.sy + gap);
    }
    return {
      xs: [...new Set(xs.map(v => +v.toFixed(6)))].sort((a, b) => a - b),
      ys: [...new Set(ys.map(v => +v.toFixed(6)))].sort((a, b) => a - b)
    };
  }

  function search(index) {
    if (++searchNodes > maxSearchNodes) return false;
    if (placed.length > best.length) best = placed.map(p => ({ ...p }));
    if (index === placeable.length) return true;

    const item = placeable[index];
    const { xs, ys } = candidateCoordinates();
    for (const v of variants(item)) {
      for (const y of ys) {
        if (y + v.sy > bin.d + 1e-6) continue;
        for (const x of xs) {
          if (x + v.sx > bin.w + 1e-6) continue;
          if (placed.some(p => overlaps(x, y, v.sx, v.sy, p))) continue;

          placed.push({ id: item.id, x, y, ...v });
          if (search(index + 1)) return true;
          placed.pop();
        }
      }
    }
    return false;
  }

  const solved = rejected.length === 0 && search(0);
  const packed = solved ? placed : best;
  const packedIds = new Set(packed.map(p => p.id));
  if (!solved) {
    for (const item of placeable) {
      if (!packedIds.has(item.id)) rejected.push(item.id);
    }
  }

  const placements = packed.map(p => ({
    id: p.id,
    position: [p.x + p.sx / 2, p.y + p.sy / 2, p.height / 2],
    size: [p.sx, p.sy, p.height],
    yaw: p.yaw,
    upAxis: p.upAxis,
    height: p.height
  }));

  let maxX = 0, maxY = 0, maxZ = 0;
  for (const p of placements) {
    maxX = Math.max(maxX, p.position[0] + p.size[0] / 2);
    maxY = Math.max(maxY, p.position[1] + p.size[1] / 2);
    maxZ = Math.max(maxZ, p.position[2] + p.size[2] / 2);
  }

  const fits = solved && placements.length === items.length;
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

/** Orient part using the packer's selected up-axis, then move to its cell. Consumes model. */
export function placeModel(model, placement) {
  let m = model;
  const upAxis = placement.upAxis ?? 2;

  if (upAxis === 0) {
    const n = m.rotate([0, 90, 0]);
    m.delete();
    m = n;
  } else if (upAxis === 1) {
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
