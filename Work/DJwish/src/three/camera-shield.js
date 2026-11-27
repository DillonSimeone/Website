import * as THREE from 'three';
import { PYRAMID, HOARDINGS, SHARED } from './world.js';

/**
 * Compute conservative live world half-extents & top height of an audio-reactive building,
 * matching BUILDING_VERT in city-buildings.js so the camera shield detects expanding walls.
 */
export function getLiveBuildingBounds(b, time, bands, beat, react, isStreet) {
  let hx = b.sx * 0.5;
  let hz = b.sz * 0.5;
  let topY = b.h;

  if (react > 0.001) {
    const lvl = Math.min(1.35, Math.max(0, bands[b.band] || 0));
    const muralSafe = b.amp < 0.3;

    if (b.arch < 0.5) {
      const wave = 0.5 + 0.5 * Math.sin(time * 2.4 + b.phase);
      const minS = muralSafe ? 1.0 : 0.48;
      const baseS = muralSafe ? 1.0 : 0.65;
      const maxS = muralSafe ? 1.32 : 2.25;
      const sY = Math.min(maxS, Math.max(minS, baseS + (lvl * 0.9 + beat * 0.35 + wave * 0.28 * lvl) * react * b.amp));
      topY *= sY;
    } else if (b.arch < 1.5) {
      const rSpan = Math.hypot(hx, hz) * (isStreet ? 0.88 : 1.03);
      hx = Math.max(hx, rSpan);
      hz = Math.max(hz, rSpan);
      topY *= 1 + (lvl * 0.25 + beat * 0.15) * react * b.amp;
    } else if (b.arch < 2.5) {
      const xzCap = isStreet ? 0.52 : 1.0;
      const xzScale = Math.min(1.32, Math.max(0.66, 1.0 + ((lvl - 0.32) * 0.46 + beat * 0.2) * react * b.amp * xzCap));
      const yScale = Math.min(1.85, Math.max(0.56, 1.0 + ((lvl - 0.25) * 0.72 + beat * 0.32) * react * b.amp));
      hx *= xzScale;
      hz *= xzScale;
      topY *= yScale;
    } else {
      const rSpan = Math.hypot(hx, hz);
      const twistMix = Math.min(1, react * (isStreet ? 0.32 : 0.85));
      hx += (rSpan - hx) * twistMix;
      hz += (rSpan - hz) * twistMix;
      const bounce = Math.abs(Math.sin(time * 2.8 + b.phase));
      topY *= Math.min(1.9, Math.max(0.72, 1.0 + (bounce * lvl * 0.62 + beat * 0.28) * react * b.amp));
    }
  }

  return { cx: b.x, cz: b.z, hx, hz, topY };
}

/** Shortest vector & distance from `p` to AABB centered at `(cx, 0..topY, cz)`. */
export function closestPointBox(px, py, pz, cx, cz, hx, hz, topY, outVec) {
  const minX = cx - hx;
  const maxX = cx + hx;
  const minZ = cz - hz;
  const maxZ = cz + hz;

  const qx = Math.max(minX, Math.min(px, maxX));
  const qy = Math.max(0, Math.min(py, topY));
  const qz = Math.max(minZ, Math.min(pz, maxZ));

  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  const dSq = dx * dx + dy * dy + dz * dz;

  if (dSq < 1e-8) {
    const penL = px - minX;
    const penR = maxX - px;
    const penF = pz - minZ;
    const penB = maxZ - pz;
    const penT = topY - py;
    const m = Math.min(penL, penR, penF, penB, penT);
    if (m === penT) outVec.set(0, 1, 0);
    else if (m === penL) outVec.set(-1, 0.28, 0);
    else if (m === penR) outVec.set(1, 0.28, 0);
    else if (m === penF) outVec.set(0, 0.28, -1);
    else outVec.set(0, 0.28, 1);
    outVec.normalize();
    return -m;
  }

  const d = Math.sqrt(dSq);
  outVec.set(dx / d, dy / d, dz / d);
  return d;
}

/**
 * CameraShield - Shared collision & spatial deflection shield for both the autonomous
 * Drone Pilot (`computeRepulsion`) and scripted Stage / transition paths (`rollAroundObstacles`).
 * Prevents camera clipping through live audio-reactive buildings, Gig Tower, East Oasis
 * props, street hoardings, ground, and the 4-sided Pyramid slopes.
 */
export class CameraShield {
  constructor() {
    this.streetBoxes = [];
    this.skylineBoxes = [];
    this.oasisBoxes = [];
    this.gigTower = null;
    this._n = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  setObstacles({ streetBoxes = [], skylineBoxes = [], oasisBoxes = [], gigTower = null }) {
    this.streetBoxes = streetBoxes;
    this.skylineBoxes = skylineBoxes;
    this.oasisBoxes = oasisBoxes;
    this.gigTower = gigTower;
  }

  /**
   * Computes nonlinearly escalating repulsive acceleration when obstacles enter the safety sphere.
   * Uses directional forward anticipation (`forwardBoost`) so lateral alley margins stay agile.
   */
  computeRepulsion(pos, velDir, { rSafe = 11.5, rHard = 5.2, forwardBoost = 11.0, outForce, minFloor = 5.5 }) {
    const f = outForce.set(0, 0, 0);
    const n = this._n;
    const px = pos.x;
    const py = pos.y;
    const pz = pos.z;
    const maxCheck = rSafe + forwardBoost;

    const pushFromBox = (cx, cz, hx, hz, topY) => {
      if (
        Math.abs(px - cx) > hx + maxCheck + 4 ||
        Math.abs(pz - cz) > hz + maxCheck + 4 ||
        py > topY + maxCheck + 4
      ) {
        return;
      }
      const dist = closestPointBox(px, py, pz, cx, cz, hx, hz, topY, n);
      let effSafe = rSafe;
      if (forwardBoost > 0 && velDir) {
        const approach = -(velDir.x * n.x + velDir.y * n.y + velDir.z * n.z);
        if (approach > 0) effSafe += approach * forwardBoost;
      }
      if (dist >= effSafe) return;

      const pen = effSafe - Math.max(0, dist);
      const normPen = Math.min(1.6, pen / effSafe);
      let mag = 62 * normPen + 310 * normPen * normPen * normPen;

      if (dist < rHard) {
        const deep = (rHard - dist) / rHard;
        mag += 440 * (deep + deep * deep);
        const nudge = Math.min(5.0, (rHard - dist) * 0.55);
        if (nudge > 0) pos.addScaledVector(n, nudge);
      }

      f.x += n.x * mag;
      f.y += (dist < rHard ? n.y + 0.25 : n.y) * mag;
      f.z += n.z * mag;
    };

    const t = SHARED.uTime.value;
    const bands = SHARED.uBands.value;
    const beat = SHARED.uBeat.value;
    const react = SHARED.uStageMode.value * SHARED.uActive.value * SHARED.uBuildingMotion.value * SHARED.uBuildingBoost.value;

    for (let i = 0; i < this.streetBoxes.length; i++) {
      const b = this.streetBoxes[i];
      if (Math.abs(px - b.x) > 95 || Math.abs(pz - b.z) > 95) continue;
      const live = getLiveBuildingBounds(b, t, bands, beat, react, true);
      pushFromBox(live.cx, live.cz, live.hx, live.hz, live.topY);
    }

    for (let i = 0; i < this.skylineBoxes.length; i++) {
      const b = this.skylineBoxes[i];
      if (Math.abs(px - b.x) > 110 || Math.abs(pz - b.z) > 110) continue;
      const live = getLiveBuildingBounds(b, t, bands, beat, react, false);
      pushFromBox(live.cx, live.cz, live.hx, live.hz, live.topY);
    }

    if (this.gigTower) {
      const gh = Math.max(30, this.gigTower.currentHeight + 6);
      pushFromBox(this.gigTower.position.x, this.gigTower.position.z, 16, 29, gh);
    }

    for (const h of Object.values(HOARDINGS)) {
      pushFromBox(h.x, h.z, 3.8, 3.8, 9.5);
    }

    for (let i = 0; i < this.oasisBoxes.length; i++) {
      const ob = this.oasisBoxes[i];
      if (Math.abs(px - ob.x) > 70 || Math.abs(pz - ob.z) > 70) continue;
      pushFromBox(ob.x, ob.z, ob.sx * 0.5, ob.sz * 0.5, ob.h);
    }

    // Pyramid 4-sided sloped shell clearance
    const pDx = px - PYRAMID.x;
    const pDz = pz - PYRAMID.z;
    const adx = Math.abs(pDx);
    const adz = Math.abs(pDz);
    if (adx < PYRAMID.half + 70 && adz < PYRAMID.half + 70 && py < PYRAMID.height + 70) {
      const slopeHalf = PYRAMID.half * Math.max(0, 1 - py / PYRAMID.height);
      const excess = Math.max(adx, adz) - slopeHalf;
      const pyrSafe = rSafe + 14;
      if (excess < pyrSafe) {
        const pen = pyrSafe - Math.max(0, excess);
        const normPen = Math.min(1.6, pen / pyrSafe);
        const mag = 95 * normPen + 340 * normPen * normPen * normPen;
        if (adx >= adz) n.set(Math.sign(pDx) || 1, 0.72, 0).normalize();
        else n.set(0, 0.72, Math.sign(pDz) || 1).normalize();
        f.addScaledVector(n, mag);
        if (excess < rHard + 4) {
          pos.addScaledVector(n, Math.min(6, (rHard + 4 - excess) * 0.55));
        }
      }
    }

    if (py < minFloor + 5.5) {
      const gPen = (minFloor + 5.5 - Math.max(minFloor * 0.6, py)) / 5.5;
      f.y += 140 * gPen + 240 * gPen * gPen;
    } else if (py > 580) {
      f.y -= (py - 580) * 1.4;
    }
    pos.y = Math.max(minFloor, Math.min(820, pos.y));
  }

  /**
   * Smoothly rolls `pos` around and over any penetrating obstacle or pyramid slope so
   * scripted stage shots & camera transitions never clip through geometry.
   */
  rollAroundObstacles(pos, radius = 9.0, hardRadius = 5.0) {
    const t = SHARED.uTime.value;
    const bands = SHARED.uBands.value;
    const beat = SHARED.uBeat.value;
    const react = SHARED.uStageMode.value * SHARED.uActive.value * SHARED.uBuildingMotion.value * SHARED.uBuildingBoost.value;
    const n = this._n;

    const pushOutBox = (cx, cz, hx, hz, topY) => {
      if (
        Math.abs(pos.x - cx) > hx + radius + 2 ||
        Math.abs(pos.z - cz) > hz + radius + 2 ||
        pos.y > topY + radius + 2
      ) {
        return;
      }
      const dist = closestPointBox(pos.x, pos.y, pos.z, cx, cz, hx, hz, topY, n);
      if (dist >= radius) return;
      const push = dist < hardRadius ? (radius - dist) : (radius - dist) * 0.55;
      // Bias slightly upward when brushing near upper building edges so camera rolls smoothly over roofs
      const nearRoof = pos.y > topY - radius;
      if (nearRoof && n.y >= 0) n.y = Math.max(n.y, 0.45);
      n.normalize();
      pos.addScaledVector(n, push);
    };

    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.streetBoxes.length; i++) {
        const b = this.streetBoxes[i];
        if (Math.abs(pos.x - b.x) > 85 || Math.abs(pos.z - b.z) > 85) continue;
        const live = getLiveBuildingBounds(b, t, bands, beat, react, true);
        pushOutBox(live.cx, live.cz, live.hx, live.hz, live.topY);
      }

      for (let i = 0; i < this.skylineBoxes.length; i++) {
        const b = this.skylineBoxes[i];
        if (Math.abs(pos.x - b.x) > 95 || Math.abs(pos.z - b.z) > 95) continue;
        const live = getLiveBuildingBounds(b, t, bands, beat, react, false);
        pushOutBox(live.cx, live.cz, live.hx, live.hz, live.topY);
      }

      if (this.gigTower) {
        const gh = Math.max(30, this.gigTower.currentHeight + 6);
        pushOutBox(this.gigTower.position.x, this.gigTower.position.z, 16, 29, gh);
      }

      for (const h of Object.values(HOARDINGS)) {
        pushOutBox(h.x, h.z, 3.8, 3.8, 9.5);
      }

      for (let i = 0; i < this.oasisBoxes.length; i++) {
        const ob = this.oasisBoxes[i];
        if (Math.abs(pos.x - ob.x) > 65 || Math.abs(pos.z - ob.z) > 65) continue;
        pushOutBox(ob.x, ob.z, ob.sx * 0.5, ob.sz * 0.5, ob.h);
      }

      // 4-sided Pyramid shell push-out
      const pDx = pos.x - PYRAMID.x;
      const pDz = pos.z - PYRAMID.z;
      const adx = Math.abs(pDx);
      const adz = Math.abs(pDz);
      const slopeRadius = radius + 12;
      if (adx < PYRAMID.half + slopeRadius && adz < PYRAMID.half + slopeRadius && pos.y < PYRAMID.height + slopeRadius) {
        const slopeHalf = PYRAMID.half * Math.max(0, 1 - pos.y / PYRAMID.height);
        const excess = Math.max(adx, adz) - slopeHalf;
        if (excess < slopeRadius) {
          if (adx >= adz) n.set(Math.sign(pDx) || 1, 0.72, 0).normalize();
          else n.set(0, 0.72, Math.sign(pDz) || 1).normalize();
          pos.addScaledVector(n, (slopeRadius - excess) * 0.75);
        }
      }

      if (pos.y < 1.5) pos.y = 1.5;
    }
  }

  /** Returns true if straight line `a -> b` would slice through the Pyramid volume. */
  crossesPyramid(a, b) {
    const p = this._p;
    const margin = 85;
    for (let i = 1; i <= 10; i++) {
      const t = i / 11;
      p.lerpVectors(a, b, t);
      const slopeHalf = PYRAMID.half * Math.max(0, 1 - p.y / PYRAMID.height);
      const adx = Math.abs(p.x - PYRAMID.x);
      const adz = Math.abs(p.z - PYRAMID.z);
      if (p.y < PYRAMID.height + margin && adx < slopeHalf + margin && adz < slopeHalf + margin) {
        return true;
      }
    }
    return false;
  }
}
