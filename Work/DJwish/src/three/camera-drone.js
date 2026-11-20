import * as THREE from 'three';
import { PYRAMID, SHARED, mulberry32 } from './world.js';
import { OASIS_BOUNDS } from './city-oasis.js';

const PROFILES = ['alleySlalom', 'skyZoom', 'canyonSprint', 'oasisSkim', 'apexOrbit'];

/**
 * CameraDrone - Scene 9 ("DRONE PILOT"):
 * Bold, fast FPV pilot that rockets skyward, power-dives through tight building alleys,
 * sprints the neon street canyon, and skims over the East Oasis & Pyramid while guarded by
 * the shared CameraShield (11.5m nimble lateral sphere + 11m forward anticipation).
 */
export class CameraDrone {
  constructor() {
    this.rng = mulberry32(4242);
    this.shield = null;

    this.pos = new THREE.Vector3(0, 18, 220);
    this.vel = new THREE.Vector3(0, 0, -52);
    this.lookDir = new THREE.Vector3(0, -0.02, -1);
    this.waypoint = new THREE.Vector3(0, 20, -60);

    this.profileIndex = 0;
    this.activeProfile = 'alleySlalom';
    this.waypointTimer = 0;
    this.maxWaypointTime = 5.2;
    this.wanderPhase = 0;

    this._force = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._desiredVel = new THREE.Vector3();
    this._velDir = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  setShield(shield) {
    this.shield = shield;
  }

  reset(startPos, startTarget) {
    if (startPos) {
      this.pos.copy(startPos);
      this.pos.y = Math.max(9, Math.min(540, this.pos.y));
    } else {
      this.pos.set(0, 22, 210);
    }

    if (startTarget) {
      this.lookDir.copy(startTarget).sub(this.pos).normalize();
    } else {
      this.lookDir.set(0, -0.02, -1);
    }

    this.vel.copy(this.lookDir).multiplyScalar(54);
    this.profileIndex = 0;
    this.pickNextWaypoint();
  }

  pickNextWaypoint() {
    const profile = PROFILES[this.profileIndex % PROFILES.length];
    this.activeProfile = profile;
    this.profileIndex++;
    this.waypointTimer = 0;
    const R = this.rng;

    if (profile === 'skyZoom') {
      // Rocket skyward high above the skyscrapers toward/past the pyramid crown
      const ang = (R() - 0.5) * 2.2;
      const x = Math.sin(ang) * (120 + R() * 260);
      const z = -980 + R() * 1150;
      const y = 260 + R() * 270;
      this.waypoint.set(x, y, z);
      this.maxWaypointTime = 5.4;
    } else if (profile === 'alleySlalom') {
      // Power-dive into skyline gaps between audio-reactive buildings
      const side = R() < 0.5 ? -1 : 1;
      const x = side * (38 + R() * 260);
      const z = -540 + R() * 760;
      const y = 18 + R() * 44;
      this.waypoint.set(x, y, z);
      this.maxWaypointTime = 5.0;
    } else if (profile === 'canyonSprint') {
      // High-speed blast right along the illuminated street canyon walls
      const forward = this.pos.z > 40 ? -135 : 225;
      this.waypoint.set((R() - 0.5) * 6, 11 + R() * 13, forward);
      this.maxWaypointTime = 4.6;
    } else if (profile === 'oasisSkim') {
      // Low banking skim across the relocated East Oasis mirror pool
      const x = OASIS_BOUNDS.cx + (R() - 0.5) * 48;
      const z = OASIS_BOUNDS.cz + (R() - 0.5) * 180;
      const y = 11 + R() * 14;
      this.waypoint.set(x, y, z);
      this.maxWaypointTime = 5.0;
    } else {
      // Sweeping banked high orbit around the pyramid flanks
      const side = R() < 0.5 ? -1 : 1;
      const x = side * (290 + R() * 260);
      const z = PYRAMID.z + (R() - 0.35) * 680;
      const y = 120 + R() * 210;
      this.waypoint.set(x, y, z);
      this.maxWaypointTime = 5.8;
    }
  }

  update(dt, outPos, outTgt, lookMouse) {
    const safeDt = Math.min(0.06, Math.max(0.001, dt));
    const beat = SHARED.uBeat.value;
    const energy = SHARED.uEnergy.value;
    const active = SHARED.uActive.value;

    this.wanderPhase += safeDt * 1.15;
    this.waypointTimer += safeDt;

    if (this.pos.distanceTo(this.waypoint) < 52 || this.waypointTimer > this.maxWaypointTime) {
      this.pickNextWaypoint();
    }

    // Dynamic throttle tuned per maneuver (high-speed sky climb vs tight alley carve)
    let baseSpeed = 54;
    if (this.activeProfile === 'skyZoom' || this.activeProfile === 'apexOrbit') baseSpeed = 78;
    else if (this.activeProfile === 'canyonSprint') baseSpeed = 62;
    const cruiseSpeed = baseSpeed + energy * 28 * active + beat * 12 * active;

    this._toTarget.subVectors(this.waypoint, this.pos);
    const distTgt = this._toTarget.length();
    if (distTgt > 0.001) this._toTarget.multiplyScalar(1 / distTgt);

    this._desiredVel.copy(this._toTarget).multiplyScalar(cruiseSpeed);
    this._desiredVel.x += Math.sin(this.wanderPhase * 1.35) * 14.0;
    this._desiredVel.y += Math.cos(this.wanderPhase * 0.95) * 8.5;
    this._desiredVel.z += Math.cos(this.wanderPhase * 1.18) * 11.0;

    // 4 substeps ensure aggressive building kicks & steep dives never clip geometry
    const substeps = 4;
    const dtSub = safeDt / substeps;

    for (let s = 0; s < substeps; s++) {
      this.vel.lerp(this._desiredVel, 1 - Math.exp(-dtSub * 2.2));

      if (this.shield) {
        const vLen = this.vel.length();
        if (vLen > 0.01) this._velDir.copy(this.vel).multiplyScalar(1 / vLen);
        else this._velDir.set(0, 0, -1);

        this.shield.computeRepulsion(this.pos, this._velDir, {
          rSafe: 11.5,
          rHard: 5.2,
          forwardBoost: 11.0,
          outForce: this._force,
          minFloor: 5.5
        });
        this.vel.addScaledVector(this._force, dtSub);
      }

      // Soft perimeter containment keeping the drone within the visible city showcase
      const radial = Math.hypot(this.pos.x, this.pos.z + 520);
      if (radial > 1150) {
        this.vel.x -= this.pos.x * 0.25 * dtSub;
        this.vel.z -= (this.pos.z + 520) * 0.25 * dtSub;
      }

      const spd = this.vel.length();
      const maxSpd = 145;
      if (spd > maxSpd) {
        this.vel.multiplyScalar(maxSpd / spd);
      } else if (spd < 28) {
        this.vel.setLength(28);
      }

      this.pos.addScaledVector(this.vel, dtSub);
    }

    const vNorm = this._toTarget.copy(this.vel);
    if (vNorm.lengthSq() > 0.01) {
      vNorm.normalize();
      this.lookDir.lerp(vNorm, 1 - Math.exp(-safeDt * 4.2)).normalize();
    }

    outPos.copy(this.pos);
    outTgt.copy(this.pos).addScaledVector(this.lookDir, 65);

    if (lookMouse) {
      this._right.set(0, 1, 0).cross(this.lookDir).normalize();
      outTgt.addScaledVector(this._right, -lookMouse.x * 12);
      outTgt.y += lookMouse.y * 8;
    }
  }
}
