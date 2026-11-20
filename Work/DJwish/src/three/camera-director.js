import * as THREE from 'three';
import {
  STOPS,
  INTRO_PATH,
  PYRAMID,
  STAGE_SHOT,
  TUNNEL_SHOT,
  VU_SHOT,
  CYMATIC_SHOT,
  CITY_EQ_SHOT,
  MATRIX_SHOT,
  STARFALL_SHOT,
  VOID_APEX_SHOT,
  OASIS_CYMATIC_SHOT,
  smoothstep
} from './world.js';
import { OASIS_BOUNDS } from './city-oasis.js';

const DEG = Math.PI / 180;
const LOOK_DISTANCE = 400;

function quadBezier(a, m, b, t) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * m + t * t * b;
}

// Gig Tower center (x=31, z=-140) and polar coordinates for Stops 1..4
const TOWER_CX = 31;
const TOWER_CZ = -140;
const ORBIT_ANGLES = [
  Math.atan2(STOPS[1].pos[0] - TOWER_CX, STOPS[1].pos[2] - TOWER_CZ), // ~ -0.853 rad
  -Math.PI,
  -1.5 * Math.PI,
  -2.0 * Math.PI
];
const ORBIT_RADII = [
  Math.hypot(STOPS[1].pos[0] - TOWER_CX, STOPS[1].pos[2] - TOWER_CZ),
  Math.hypot(STOPS[2].pos[0] - TOWER_CX, STOPS[2].pos[2] - TOWER_CZ),
  Math.hypot(STOPS[3].pos[0] - TOWER_CX, STOPS[3].pos[2] - TOWER_CZ),
  Math.hypot(STOPS[4].pos[0] - TOWER_CX, STOPS[4].pos[2] - TOWER_CZ)
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return uu * u * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + tt * t * p3;
}

function lerpAngleDeg(a, b, t) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

function directionFromAngles(yawDeg, pitchDeg, out) {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

/**
 * CameraDirector
 *  - intro: spline flight from the foot of the pyramid, up to the apex and logo,
 *    then a long pull-back that drops into the street.
 *  - street: smooth monotonic paths & true polar tower orbit across all 8 stops.
 *  - stage: live rig camera presets with subtle ambient drift.
 */
export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'intro';
    this.introTime = 0;
    this.introDuration = 8;
    this.ignite = 0;
    this.scroll = 0;
    this.scrollTarget = 0;
    this.aspect = 16 / 9;
    this.transition = 1;
    this.transitionDuration = 1.5;
    this.transitionArcY = 0;
    this.stageShot = 'stage';
    this.parallax = 1;
    this.scrollEase = 3.5;
    this.modeBeforeSettings = 'street';
    this.settingsDisc = null;
    this.stageClock = 0;
    this.drone = null;
    this.shield = null;
    this.oasisTime = 0;
    this.oasisWeaveCurve = null;
    this.transitionMid = new THREE.Vector3();
    this._estPos = new THREE.Vector3();
    this._estTgt = new THREE.Vector3();
    this._oasisPoolLook = new THREE.Vector3();
    this._oasisPyrLook = new THREE.Vector3();
    this._oasisBlendLook = new THREE.Vector3();
    this.onIntroComplete = null;
    this.onIntroApproach = null;
    this.introApproachTriggered = false;

    this.pos = new THREE.Vector3();
    this.tgt = new THREE.Vector3();
    this.fromPos = new THREE.Vector3();
    this.fromTgt = new THREE.Vector3();
    this.desiredPos = new THREE.Vector3();
    this.desiredTgt = new THREE.Vector3();
    this.dir = new THREE.Vector3();

    const first = STOPS[0];
    const firstPos = new THREE.Vector3(...first.pos);
    const firstTgt = firstPos.clone().addScaledVector(directionFromAngles(first.yaw, first.pitch, this.dir), LOOK_DISTANCE);
    const posPts = INTRO_PATH.pos.map(p => new THREE.Vector3(...p));
    const tgtPts = INTRO_PATH.target.map(p => new THREE.Vector3(...p));
    posPts[posPts.length - 1].copy(firstPos);
    tgtPts[tgtPts.length - 1].copy(firstTgt);
    this.posCurve = new THREE.CatmullRomCurve3(posPts, false, 'centripetal');
    this.tgtCurve = new THREE.CatmullRomCurve3(tgtPts, false, 'centripetal');

    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });

    this.posCurve.getPoint(0, this.pos);
    this.tgtCurve.getPoint(0, this.tgt);
    this.apply();
  }

  get isPlayingIntro() {
    return this.mode === 'intro';
  }

  get stopFloat() {
    return this.scroll * (STOPS.length - 1);
  }

  setAspect(aspect) {
    this.aspect = aspect;
  }

  setScrollProgress(p) {
    this.scrollTarget = clamp01(p);
  }

  /**
   * Move camera to a stop index.
   * - Adjacent stops glide along the segment spline.
   * - Distant jumps (`direct: true`) fly along a smooth aerial transition instead of scrubbing intermediate stops.
   */
  goToStop(index, { direct = false, instant = false } = {}) {
    const i = Math.max(0, Math.min(STOPS.length - 1, index));
    const target = i / (STOPS.length - 1);
    if (instant) {
      this.scroll = this.scrollTarget = target;
      this.transition = 1;
      this.transitionArcY = 0;
      this.streetPose(this.pos, this.tgt);
      this.apply();
      return;
    }
    if (direct) {
      this.scroll = this.scrollTarget = target;
      this.beginTransition(1.45, 8);
      return;
    }
    this.scrollTarget = target;
  }

  startIntro() {
    this.mode = 'intro';
    this.introTime = 0;
    this.introApproachTriggered = false;
    this.ignite = 0;
    this.scroll = this.scrollTarget = 0;
  }

  skipIntro(instant = false) {
    if (this.mode !== 'intro') return;
    this.mode = 'street';
    if (instant) {
      this.scroll = this.scrollTarget;
      this.transition = 1;
      this.transitionArcY = 0;
      this.ignite = 1;
    } else {
      this.beginTransition(1.5, 0);
    }
    if (this.onIntroComplete) this.onIntroComplete();
  }

  setDrone(drone) {
    this.drone = drone;
  }

  setShield(shield) {
    this.shield = shield;
  }

  initOasisWeave() {
    this.oasisTime = 0;
    const pts = [this.pos.clone()];
    // If starting far north (Cymatic Rings / Void Apex), arc smoothly around pyramid shoulder first
    if (this.pos.z < -620) {
      const side = this.pos.x >= 0 ? 1 : -1;
      pts.push(new THREE.Vector3(side * 420, Math.max(this.pos.y * 0.72, 460), PYRAMID.z + 60));
      pts.push(new THREE.Vector3(64, 92, -320));
    }
    // Weave cleanly through central canyon -> south canyon exit -> East Oasis bridge promenade
    if (this.pos.z < 120) {
      pts.push(new THREE.Vector3(2, 24, 65));
    }
    pts.push(new THREE.Vector3(4, 18, 255));
    pts.push(new THREE.Vector3(64, 17, 286));
    pts.push(new THREE.Vector3(124, 16, 268));
    pts.push(new THREE.Vector3(OASIS_CYMATIC_SHOT.pos[0], OASIS_CYMATIC_SHOT.pos[1], OASIS_CYMATIC_SHOT.pos[2]));
    this.oasisWeaveCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }

  /** shot: 'stage', 'tunnel', 'vu', 'cymatic', 'cityEq', 'matrix', 'drone', 'starfall', 'voidApex', 'oasisCymatic'. */
  enterStage(shot = 'stage') {
    if (this.mode === 'intro') this.skipIntro(true);
    this.mode = 'stage';
    this.stageShot = shot;
    if (shot === 'drone' && this.drone) {
      const startPos = (this.pos.z < -650 || this.pos.y > 260) ? new THREE.Vector3(0, 26, -240) : this.pos;
      this.drone.reset(startPos, this.tgt);
    } else if (shot === 'oasisCymatic') {
      this.initOasisWeave();
    }
    const dur = shot === 'oasisCymatic' ? 0.9 : (shot === 'stage' ? 2.2 : 2.8);
    this.beginTransition(dur, 0);
  }

  setStageShot(shot) {
    if (shot === this.stageShot) return;
    const live = this.mode === 'stage';
    if (!live && !(this.mode === 'settings' && this.modeBeforeSettings === 'stage')) return;
    this.stageShot = shot;
    if (shot === 'drone' && this.drone) {
      const startPos = (this.pos.z < -650 || this.pos.y > 260) ? new THREE.Vector3(0, 26, -240) : this.pos;
      this.drone.reset(startPos, this.tgt);
    } else if (shot === 'oasisCymatic') {
      this.initOasisWeave();
    }
    const dur = shot === 'oasisCymatic' ? 0.9 : (shot === 'drone' ? 2.0 : 2.6);
    if (live) this.beginTransition(dur, 0);
  }

  exitStage() {
    this.mode = 'street';
    this.beginTransition(this.stageShot === 'stage' ? 1.9 : 2.4, 0);
  }

  /** Fly to the pyramid tip and frame the settings disc (provides getCameraPose). */
  enterSettings(disc) {
    if (this.mode === 'settings') return;
    if (this.mode === 'intro') this.skipIntro(true);
    this.modeBeforeSettings = this.mode;
    this.settingsDisc = disc;
    this.mode = 'settings';
    this.beginTransition(2.4, 0);
  }

  exitSettings() {
    if (this.mode !== 'settings') return;
    this.mode = this.modeBeforeSettings || 'street';
    this.beginTransition(2.2, 0);
  }

  beginTransition(duration = 1.5, arcY = 0) {
    this.fromPos.copy(this.pos);
    this.fromTgt.copy(this.tgt);
    this.transition = 0;
    this.transitionDuration = duration;
    this.transitionArcY = arcY;

    // Estimate destination so curved Bezier transitions avoid clipping the Pyramid or buildings
    if (this.mode === 'settings') {
      this._estPos.set(0, 522, -1340);
    } else if (this.mode === 'stage') {
      if (this.stageShot === 'drone' && this.drone) {
        this._estPos.copy(this.drone.pos);
      } else if (this.stageShot === 'oasisCymatic') {
        this._estPos.copy(this.pos);
      } else {
        this.stagePose(this._estPos, this._estTgt, this.stageClock, 0.016);
      }
    } else {
      this.streetPose(this._estPos, this._estTgt);
    }

    if (this.shield?.crossesPyramid(this.fromPos, this._estPos)) {
      const side = (this.fromPos.x + this._estPos.x) >= 0 ? 1 : -1;
      this.transitionMid.set(
        side * 420,
        Math.max(this.fromPos.y, this._estPos.y, 700),
        PYRAMID.z
      );
    } else {
      const hDist = Math.hypot(this._estPos.x - this.fromPos.x, this._estPos.z - this.fromPos.z);
      this.transitionMid.lerpVectors(this.fromPos, this._estPos, 0.5);
      if (hDist > 120 && Math.min(this.fromPos.y, this._estPos.y) < 120) {
        this.transitionMid.y = Math.max(this.transitionMid.y, Math.max(this.fromPos.y, this._estPos.y, 115) + 45) + arcY;
      } else {
        this.transitionMid.y += arcY;
      }
    }
  }

  streetPose(outPos, outTgt) {
    const n = STOPS.length;
    const s = this.scroll * (n - 1);
    const i = Math.min(n - 2, Math.floor(s));
    const k = easeInOutSine(clamp01(s - i));
    const a = STOPS[i];
    const b = STOPS[i + 1];

    // Narrow screens turn toward content so billboards & murals fill the viewport
    const wide = clamp01((this.aspect - 0.6) / 1.0);
    const yawA = lerp(a.focusYaw, a.yaw, wide);
    const yawB = lerp(b.focusYaw, b.yaw, wide);

    let posX = 0;
    let posY = 0;
    let posZ = 0;
    let yaw = 0;
    let pitch = lerp(a.pitch, b.pitch, k);

    if (i === 0) {
      // Stop 0 (Agency) -> Stop 1 (CodaFest West): monotonic cubic Bezier clearing the bio firewall
      posX = cubicBezier(a.pos[0], -30, -26, b.pos[0], k);
      posY = cubicBezier(a.pos[1], 64, 104, b.pos[1], k);
      posZ = cubicBezier(a.pos[2], -46, -66, b.pos[2], k);
      yaw = lerpAngleDeg(yawA, yawB, k);
    } else if (i >= 1 && i <= 3) {
      // Stops 1 -> 2 -> 3 -> 4: true unwrapped polar orbit around Gig Tower center (31, -140)
      const oIdx = i - 1;
      const ang = lerp(ORBIT_ANGLES[oIdx], ORBIT_ANGLES[oIdx + 1], k);
      const rad = lerp(ORBIT_RADII[oIdx], ORBIT_RADII[oIdx + 1], k);
      posX = TOWER_CX + Math.sin(ang) * rad;
      posZ = TOWER_CZ + Math.cos(ang) * rad;
      posY = lerp(a.pos[1], b.pos[1], k);

      const orbitYaws = [lerp(STOPS[1].focusYaw, STOPS[1].yaw, wide), 178, 270, 360];
      yaw = lerp(orbitYaws[oIdx], orbitYaws[oIdx + 1], k);
    } else if (i === 4) {
      // Stop 4 (ADA South) -> Stop 5 (Technical Rider): monotonic forward-only descending canyon glide
      posX = cubicBezier(a.pos[0], 14, 2, b.pos[0], k);
      posY = cubicBezier(a.pos[1], 92, 34, b.pos[1], k);
      posZ = cubicBezier(a.pos[2], -16, 48, b.pos[2], k);
      yaw = lerpAngleDeg(yawA, yawB, k);
      pitch = lerp(a.pitch, b.pitch, k) - Math.sin(k * Math.PI) * 14;
    } else {
      // Street-level stops (5 Rider -> 6 Audio -> 7 Live Rig): gentle centerline S-curve
      const midX1 = lerp(a.pos[0], 0, 0.55);
      const midX2 = lerp(b.pos[0], 0, 0.55);
      posX = cubicBezier(a.pos[0], midX1, midX2, b.pos[0], k);
      posY = lerp(a.pos[1], b.pos[1], k);
      posZ = cubicBezier(a.pos[2], lerp(a.pos[2], b.pos[2], 0.33), lerp(a.pos[2], b.pos[2], 0.67), b.pos[2], k);
      yaw = lerpAngleDeg(yawA, yawB, k);
    }

    // On mobile / narrow viewports, step back gently (capped on street hoardings so panels stay large & legible)
    const rawMobile = this.aspect < 1.0 ? (1.0 - this.aspect) * 3.2 : 0;
    const mobileOffset = s >= 5.5 ? Math.min(1.8, rawMobile) : rawMobile;

    outPos.set(posX, posY, posZ);
    outPos.x += this.mouse.x * 0.35;
    outPos.y += this.mouse.y * 0.2;

    yaw += this.mouse.x * 2.0;
    pitch += this.mouse.y * 1.2;

    directionFromAngles(yaw, pitch, this.dir);
    if (mobileOffset > 0) {
      outPos.addScaledVector(this.dir, -mobileOffset);
    }
    outTgt.copy(outPos).addScaledVector(this.dir, LOOK_DISTANCE);
  }

  stagePose(outPos, outTgt, t, dt = 0.016) {
    if (this.stageShot === 'drone' && this.drone) {
      this.drone.update(dt, outPos, outTgt, this.mouse);
      return;
    }
    if (this.stageShot === 'oasisCymatic') {
      this.oasisTime += dt;
      const ot = this.oasisTime;
      const weaveDur = 5.0;

      if (ot < weaveDur && this.oasisWeaveCurve) {
        const u = easeInOutSine(clamp01(ot / weaveDur));
        this.oasisWeaveCurve.getPoint(u, outPos);
        // Smoothly sweep gaze toward the northern mirror pool & Pyramid as we emerge into the park
        this._oasisPyrLook.set(0, 60, -1500);
        this._oasisPoolLook.set(OASIS_BOUNDS.cx - 4, OASIS_BOUNDS.waterY - 1.5, OASIS_BOUNDS.cz + 10);
        this._oasisBlendLook.lerpVectors(this._oasisPyrLook, this._oasisPoolLook, smoothstep(0.35, 0.88, u));
        this.oasisWeaveCurve.getPoint(Math.min(1, u + 0.14), outTgt);
        outTgt.lerp(this._oasisBlendLook, easeInOutSine(u));
      } else {
        // Slowly glide along Southern & Eastern pool banks keeping Pyramid reflection centered on water
        const g = Math.max(0, ot - weaveDur);
        const bankPhase = 0.5 - 0.5 * Math.cos(g * 0.15);
        const startAngle = Math.PI * 0.42; // south shore slightly east of center
        const endAngle = Math.PI * 0.02;   // eastern pool bank
        const ang = lerp(startAngle, endAngle, bankPhase);
        const radX = lerp(42, 54, bankPhase);
        const radZ = lerp(128, 95, bankPhase);

        const camX = OASIS_BOUNDS.cx + Math.cos(ang) * radX;
        const camZ = OASIS_BOUNDS.cz + Math.sin(ang) * radZ;
        const camY = 15.5 + Math.sin(g * 0.25) * 2.2;
        outPos.set(camX, camY, camZ);

        // Aim along exact mirror intersection on the pool surface toward the Pyramid mid-crown
        const sMirror = (camY - OASIS_BOUNDS.waterY) / (camY + 230);
        const waterTargetX = lerp(camX, PYRAMID.x, sMirror);
        const waterTargetZ = lerp(camZ, PYRAMID.z, sMirror);
        outTgt.set(
          waterTargetX + this.mouse.x * 16,
          OASIS_BOUNDS.waterY - 2.0 + this.mouse.y * 10,
          waterTargetZ
        );
      }
      return;
    }
    if (this.stageShot === 'starfall') {
      const s = STARFALL_SHOT;
      const x = Math.sin(t * 0.11) * 560;
      const y = s.pos[1] + Math.sin(t * 0.08) * 12;
      const z = s.pos[2] + Math.cos(t * 0.11) * 45;
      outPos.set(x, y, z);
      outTgt.set(x * 0.16 + this.mouse.x * 35, 92 + this.mouse.y * 20, -420);
      return;
    }
    if (this.stageShot === 'voidApex') {
      const s = VOID_APEX_SHOT;
      outPos.set(
        s.pos[0] + Math.sin(t * 0.09) * 75,
        s.pos[1] + Math.sin(t * 0.06) * 18,
        s.pos[2] + Math.cos(t * 0.07) * 28
      );
      const yaw = s.yaw + Math.sin(t * 0.07) * 6 + this.mouse.x * 2.5;
      const pitch = s.pitch + Math.sin(t * 0.05) * 1.8 + this.mouse.y * 1.5;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'vu') {
      const s = VU_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.11) * 1.2, s.pos[1], s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.09) * 0.8 + this.mouse.x * 2;
      const pitch = s.pitch + this.mouse.y * 1.2;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'tunnel') {
      const s = TUNNEL_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.07) * 6, s.pos[1] + Math.sin(t * 0.05) * 4, s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.07) * 0.6 + this.mouse.x * 1.5;
      const pitch = s.pitch + this.mouse.y * 1.0;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'cymatic') {
      const s = CYMATIC_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.08) * 18, s.pos[1] + Math.sin(t * 0.06) * 8, s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.08) * 2.2 + this.mouse.x * 2;
      const pitch = s.pitch + this.mouse.y * 1.2;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'cityEq') {
      const s = CITY_EQ_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.09) * 5, s.pos[1] + Math.sin(t * 0.06) * 4, s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.07) * 1.2 + this.mouse.x * 2;
      const pitch = s.pitch + this.mouse.y * 1.2;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'matrix') {
      const s = MATRIX_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.14) * 3.5, s.pos[1] + Math.cos(t * 0.1) * 1.5, s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.1) * 2.5 + this.mouse.x * 2;
      const pitch = s.pitch + this.mouse.y * 1.4;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }

    outPos.set(STAGE_SHOT.pos[0] + Math.sin(t * 0.13) * 2.5, STAGE_SHOT.pos[1], STAGE_SHOT.pos[2]);
    const yaw = STAGE_SHOT.yaw + Math.sin(t * 0.09) * 3 + this.mouse.x * 2;
    const pitch = STAGE_SHOT.pitch + this.mouse.y * 1.5;
    outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
  }

  update(dt) {
    const m = this.mouse;
    const follow = 1 - Math.exp(-dt * 3);
    m.x += (m.tx * this.parallax - m.x) * follow;
    m.y += (m.ty * this.parallax - m.y) * follow;

    if (this.mode === 'intro') {
      this.introTime += dt;
      const t = clamp01(this.introTime / this.introDuration);
      const e = easeInOutSine(t);
      this.posCurve.getPoint(e, this.pos);
      this.tgtCurve.getPoint(e, this.tgt);
      this.ignite = smoothstep(0.12, 0.4, t);
      this.apply();

      if (t >= 0.90 && !this.introApproachTriggered) {
        this.introApproachTriggered = true;
        if (this.onIntroApproach) this.onIntroApproach();
      }

      if (t >= 1) {
        this.mode = 'street';
        this.beginTransition(1.5, 0);
        if (this.onIntroComplete) this.onIntroComplete();
      }
      return;
    }

    this.ignite = Math.min(1, this.ignite + dt * 0.8);
    this.scroll += (this.scrollTarget - this.scroll) * (1 - Math.exp(-dt * this.scrollEase));

    if (this.mode === 'settings') {
      this.settingsDisc.getCameraPose(this.camera, this.desiredPos, this.desiredTgt);
      this.desiredPos.x += this.mouse.x * 0.6;
      this.desiredPos.y += this.mouse.y * 0.4;
    } else if (this.mode === 'stage') {
      this.stageClock += dt;
      this.stagePose(this.desiredPos, this.desiredTgt, this.stageClock, dt);
    } else {
      this.streetPose(this.desiredPos, this.desiredTgt);
    }

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
      const k = easeInOutCubic(this.transition);
      this.pos.set(
        quadBezier(this.fromPos.x, this.transitionMid.x, this.desiredPos.x, k),
        quadBezier(this.fromPos.y, this.transitionMid.y, this.desiredPos.y, k),
        quadBezier(this.fromPos.z, this.transitionMid.z, this.desiredPos.z, k)
      );
      this.tgt.lerpVectors(this.fromTgt, this.desiredTgt, k);
    } else {
      this.pos.copy(this.desiredPos);
      this.tgt.copy(this.desiredTgt);
    }

    // Universal shield safety sphere: roll smoothly around/over buildings & the Pyramid
    if (this.shield && ((this.mode === 'stage' && this.stageShot !== 'drone') || this.transition < 1)) {
      const r = this.mode === 'street' ? 4.2 : 8.5;
      const h = this.mode === 'street' ? 2.5 : 4.8;
      this.shield.rollAroundObstacles(this.pos, r, h);
    }

    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
  }
}
