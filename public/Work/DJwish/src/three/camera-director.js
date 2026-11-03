import * as THREE from 'three';
import { STOPS, INTRO_PATH, STAGE_SHOT, TUNNEL_SHOT, VU_SHOT, smoothstep } from './world.js';

const DEG = Math.PI / 180;
const LOOK_DISTANCE = 400;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function directionFromAngles(yawDeg, pitchDeg, out) {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

/**
 * CameraDirector
 *  - intro: spline flight from the foot of the pyramid, up to the apex and logo,
 *    then a long pull-back that drops into the street.
 *  - street: scroll progress walks the camera backward through the scroll stops.
 *  - stage: low street shot looking up at the pyramid for the live rig.
 */
export class CameraDirector {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'intro';
    this.introTime = 0;
    this.introDuration = 8; // Shortened from 14s for fast 30s booker onboarding
    this.ignite = 0;
    this.scroll = 0;
    this.scrollTarget = 0;
    this.aspect = 16 / 9;
    this.transition = 1;
    this.transitionDuration = 1.6;
    this.stageShot = 'stage';
    this.parallax = 1;
    this.scrollEase = 3.8;
    this.modeBeforeSettings = 'street';
    this.settingsDisc = null;
    this.stageClock = 0;
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
      this.ignite = 1;
    } else {
      this.beginTransition();
    }
    if (this.onIntroComplete) this.onIntroComplete();
  }

  /** shot: 'stage' (low street, looking up), 'tunnel' (far pull-back), 'vu' (street mouth). */
  enterStage(shot = 'stage') {
    if (this.mode === 'intro') this.skipIntro(true);
    this.mode = 'stage';
    this.stageShot = shot;
    this.beginTransition(shot === 'stage' ? 2.5 : 3.2);
  }

  setStageShot(shot) {
    if (shot === this.stageShot) return;
    const live = this.mode === 'stage';
    if (!live && !(this.mode === 'settings' && this.modeBeforeSettings === 'stage')) return;
    this.stageShot = shot;
    if (live) this.beginTransition(3.2);
  }

  exitStage() {
    this.mode = 'street';
    this.beginTransition(this.stageShot === 'stage' ? 2.0 : 2.6);
  }

  /** Fly to the pyramid tip and frame the settings disc (provides getCameraPose). */
  enterSettings(disc) {
    if (this.mode === 'settings') return;
    if (this.mode === 'intro') this.skipIntro(true);
    this.modeBeforeSettings = this.mode;
    this.settingsDisc = disc;
    this.mode = 'settings';
    this.beginTransition(2.8);
  }

  exitSettings() {
    if (this.mode !== 'settings') return;
    this.mode = this.modeBeforeSettings || 'street';
    this.beginTransition(2.6);
  }

  beginTransition(duration = 1.6) {
    this.fromPos.copy(this.pos);
    this.fromTgt.copy(this.tgt);
    this.transition = 0;
    this.transitionDuration = duration;
  }

  streetPose(outPos, outTgt) {
    const n = STOPS.length;
    const s = this.scroll * (n - 1);
    const i = Math.min(n - 2, Math.floor(s));
    const k = smoothstep(0.08, 0.92, s - i);
    const a = STOPS[i];
    const b = STOPS[i + 1];

    // Narrow screens turn directly toward content so it takes up full screen
    const wide = clamp01((this.aspect - 0.6) / 1.0);
    const yawA = lerp(a.focusYaw, a.yaw, wide);
    const yawB = lerp(b.focusYaw, b.yaw, wide);

    let posX = lerp(a.pos[0], b.pos[0], k);
    let posY = lerp(a.pos[1], b.pos[1], k);
    let posZ = lerp(a.pos[2], b.pos[2], k);
    let yaw = lerp(yawA, yawB, k);
    let pitch = lerp(a.pitch, b.pitch, k);

    if (i === 0) {
      // 1/8 (Bio at x=-36, z=-44) -> 2/8 (CodaFest at x=-32, z=-85, y=112):
      // Swing out to open street centerline (x ~ 0) to clear the bio firewall before ascending
      const midArch = Math.sin(k * Math.PI);
      posX += midArch * 26;
      posY = lerp(a.pos[1], b.pos[1], easeInOutCubic(k));
    } else if (i === 1) {
      // 2/8 (CodaFest West face) -> 3/8 (WDT North face):
      // Outward orbital arc around the elevator building's northwest corner (x=18, z=-166)
      const orbitArch = Math.sin(k * Math.PI);
      posX -= orbitArch * 34; // sweep far to the west into open plaza
      posZ -= orbitArch * 22; // round the corner safely
      posY += orbitArch * 4;
    } else if (i === 2) {
      // 3/8 (WDT North face at [31, 108, -200]) -> 4/8 (Confluence East face at [82, 108, -140]):
      // Outward orbital arc around the elevator building's northeast corner (x=44, z=-166)
      const orbitArch = Math.sin(k * Math.PI);
      posX = lerp(a.pos[0], b.pos[0], k) + orbitArch * 14;
      posZ = lerp(a.pos[2], b.pos[2], k) - orbitArch * 24;
      posY += orbitArch * 3;
      yaw = lerp(yawA, 270, k); // Smooth continuous turn from 178 deg to 270 deg
    } else if (i === 3) {
      // 4/8 (Confluence East face at [82, 108, -140]) -> 5/8 (ADA South face at [31, 108, -68]):
      // Outward orbital arc around the elevator building's southeast corner (x=44, z=-114)
      const orbitArch = Math.sin(k * Math.PI);
      posX = lerp(a.pos[0], b.pos[0], k) + orbitArch * 14;
      posZ = lerp(a.pos[2], b.pos[2], k) + orbitArch * 24;
      posY += orbitArch * 3;
      let rotYaw = lerp(270, 360, k);
      if (rotYaw >= 360) rotYaw -= 360;
      yaw = rotYaw; // Smooth continuous turn from 270 deg to 360/0 deg
    } else if (i === 4) {
      // 5/8 (ADA South face at y=108, z=-68) -> 6/8 (Technical Rider at y=6.5, z=105):
      // Somersault backflip launch over 120m elevator skyscraper:
      // Vault up to 166m altitude (clearing 123m roof cap by 43m),
      // steep dive-bomb pitch (-65 deg) directly over the rooftop capstone & neon cylinders,
      // then swoop down the open street avenue into 6/8 Technical Rider.

      if (k < 0.20) {
        const t = smoothstep(0, 0.20, k);
        posY = lerp(a.pos[1], 166, t);
      } else if (k < 0.35) {
        const t = smoothstep(0.20, 0.35, k);
        posY = lerp(166, 152, t);
      } else {
        const t = clamp01((k - 0.35) / 0.65);
        const easeOut = 1 - Math.pow(1 - t, 2.2);
        posY = lerp(152, b.pos[1], easeOut);
      }

      const backArch = Math.sin(Math.min(1, k / 0.35) * Math.PI);
      posZ = lerp(a.pos[2], b.pos[2], smoothstep(0.15, 1.0, k)) - backArch * 28;
      posX = lerp(a.pos[0], b.pos[0], smoothstep(0, 0.40, k));

      if (k < 0.12) {
        const t = smoothstep(0, 0.12, k);
        pitch = lerp(a.pitch, 14, t);
      } else if (k < 0.30) {
        const t = smoothstep(0.12, 0.30, k);
        pitch = lerp(14, -65, t);
      } else {
        const t = smoothstep(0.30, 1.0, k);
        pitch = lerp(-65, b.pitch, t);
      }

      yaw = lerp(a.yaw, b.yaw, smoothstep(0.25, 1.0, k));
    } else {
      // Street-level stops (6/8 Rider, 7/8 Audio, 8/8 Live Rig): ease toward street centerline x=0 during glide
      const midArch = Math.sin(k * Math.PI);
      posX = lerp(posX, 0, midArch * 0.4);
    }

    // On mobile / narrow screens, step back slightly so windows fill the screen comfortably
    const mobileOffset = this.aspect < 1.0 ? (1.0 - this.aspect) * 3.5 : 0;

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

  stagePose(outPos, outTgt, t) {
    if (this.stageShot === 'vu') {
      // Street mouth at eye height: both rows of streetlights recede toward the pyramid.
      const s = VU_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.11) * 1.2, s.pos[1], s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.09) * 0.8 + this.mouse.x * 2;
      const pitch = s.pitch + this.mouse.y * 1.2;
      outTgt.copy(outPos).addScaledVector(directionFromAngles(yaw, pitch, this.dir), LOOK_DISTANCE);
      return;
    }
    if (this.stageShot === 'tunnel') {
      // Far pull-back: the whole street becomes the tunnel's screen.
      const s = TUNNEL_SHOT;
      outPos.set(s.pos[0] + Math.sin(t * 0.07) * 6, s.pos[1] + Math.sin(t * 0.05) * 4, s.pos[2]);
      const yaw = s.yaw + Math.sin(t * 0.07) * 0.6 + this.mouse.x * 1.5;
      const pitch = s.pitch + this.mouse.y * 1.0;
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
        this.beginTransition();
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
      this.stagePose(this.desiredPos, this.desiredTgt, this.stageClock);
    } else {
      this.streetPose(this.desiredPos, this.desiredTgt);
    }

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
      const k = easeInOutCubic(this.transition);
      this.pos.lerpVectors(this.fromPos, this.desiredPos, k);
      this.tgt.lerpVectors(this.fromTgt, this.desiredTgt, k);
    } else {
      this.pos.copy(this.desiredPos);
      this.tgt.copy(this.desiredTgt);
    }
    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
  }
}
