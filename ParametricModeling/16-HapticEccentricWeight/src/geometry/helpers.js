// Shared Manifold / Three helpers and physics estimates
import * as THREE from 'three';
import { context, params } from '../state.js';

export function box(w, d, h) {
  return context.Manifold.cube([w, d, h], true);
}

export function cyl(r, h, facets = 48) {
  return context.Manifold.cylinder(h, r, r, facets, true);
}

export function manifoldToThree(model) {
  const mesh = model.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
  geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Estimate solid volume in mm³ from Manifold when available; else AABB proxy. */
export function estimateVolumeMm3(model) {
  try {
    if (typeof model.volume === 'function') {
      const v = model.volume();
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch (_) { /* fallback below */ }
  try {
    // Triangle mesh volume (signed) as fallback
    const mesh = model.getMesh();
    const v = mesh.vertProperties;
    const t = mesh.triVerts;
    let sum = 0;
    for (let i = 0; i < t.length; i += 3) {
      const i1 = t[i] * 3, i2 = t[i + 1] * 3, i3 = t[i + 2] * 3;
      const ax = v[i1], ay = v[i1 + 1], az = v[i1 + 2];
      const bx = v[i2], by = v[i2 + 1], bz = v[i2 + 2];
      const cx = v[i3], cy = v[i3 + 1], cz = v[i3 + 2];
      sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    const vol = Math.abs(sum) / 6;
    if (vol > 0) return vol;
  } catch (_) { /* fallback below */ }
  try {
    const bb = model.boundingBox();
    const dx = bb.max[0] - bb.min[0];
    const dy = bb.max[1] - bb.min[1];
    const dz = bb.max[2] - bb.min[2];
    return dx * dy * dz * 0.65;
  } catch (_) {
    return 0;
  }
}

export function massFromVolumeMm3(volumeMm3, densityGPerCm3 = params.petgDensity) {
  return (volumeMm3 / 1000) * densityGPerCm3; // g
}

/** Centrifugal force F = m ω² r  (N), mass in grams, r in mm, rpm */
export function centrifugalForceN(massG, comOffsetMm, rpm) {
  const m = massG / 1000;          // kg
  const r = comOffsetMm / 1000;    // m
  const omega = (rpm * 2 * Math.PI) / 60;
  return m * omega * omega * r;
}

export function isSingleComponent(model) {
  try {
    const parts = model.decompose();
    const ok = parts.length <= 1;
    parts.forEach(p => p.delete());
    return ok;
  } catch (_) {
    return true;
  }
}

export function partBounds(model) {
  const bb = model.boundingBox();
  return {
    min: [...bb.min],
    max: [...bb.max],
    size: [
      bb.max[0] - bb.min[0],
      bb.max[1] - bb.min[1],
      bb.max[2] - bb.min[2]
    ]
  };
}
