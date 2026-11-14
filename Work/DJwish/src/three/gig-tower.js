import * as THREE from 'three';
import { SHARED, HUE_UNIFORMS, FOG_PARS, AUDIO_PARS, OUTPUT_CHUNK } from './world.js';
import { GIGS_DATA } from '../data/gigs.js';

/**
 * GigTower - An architectural skyscraper that extends upward like a high-speed elevator
 * when visiting past gigs (CodaFest and World Deaf Timberfest), and becomes a
 * VU-reactive subwoofer pumper in Live Stage Rig mode.
 *
 * Footprint: x = 31, z = -140, depth = 30 (in x), width = 56 (in z).
 */
export class GigTower {
  constructor(scene, maxAniso = 4) {
    this.group = new THREE.Group();
    this.scene = scene;
    this.maxAniso = maxAniso;

    this.baseHeight = 30;
    this.maxHeight = 120;
    this.currentHeight = 30;
    this.targetHeight = 30;
    this.currentPage = 0;

    this.position = new THREE.Vector3(31, 0, -140);
    this.group.position.copy(this.position);

    // Video billboard setup for CodaFest
    this.videoEl = null;
    this.videoTexture = null;

    this.buildBase();
    this.buildElevatorShaft();
    this.buildCodaFestBillboard();
    this.buildWdtNeonFace();
    this.buildConfluenceFace();
    this.buildAdaFace();

    scene.add(this.group);
  }

  setVideoElement(videoEl) {
    this.videoEl = videoEl;
    if (videoEl && !this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(videoEl);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.anisotropy = this.maxAniso;

      if (this.billboardMat) {
        this.billboardMat.map = this.videoTexture;
        this.billboardMat.needsUpdate = true;
      }
    }
    if (this.videoEl && this.videoEl.paused) {
      this.videoEl.play().catch(() => {});
    }
  }

  buildBase() {
    // Lower static podium (remains flush with street canyon)
    const baseGeo = new THREE.BoxGeometry(29.6, this.baseHeight, 55.6);
    baseGeo.translate(0, this.baseHeight / 2, 0);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x120c1e,
      roughness: 0.85,
      metalness: 0.2
    });

    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.group.add(this.baseMesh);
  }

  buildElevatorShaft() {
    // Dynamic rising elevator tower core (slightly inset so it slides out of the base)
    this.shaftGroup = new THREE.Group();

    const shaftWidthX = 26;
    const shaftWidthZ = 52;
    const shaftGeo = new THREE.BoxGeometry(shaftWidthX, 1, shaftWidthZ);
    shaftGeo.translate(0, 0.5, 0);

    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x0a0614,
      roughness: 0.5,
      metalness: 0.8
    });

    this.shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    this.shaftGroup.add(this.shaftMesh);

    // Glowing vertical hydraulic cylinders on corners
    this.cylinderMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.7
    });

    const cylGeo = new THREE.CylinderGeometry(1.2, 1.2, 1, 16);
    cylGeo.translate(0, 0.5, 0);

    this.cylinders = [];
    const corners = [
      [-shaftWidthX / 2 - 0.4, -shaftWidthZ / 2 - 0.4],
      [-shaftWidthX / 2 - 0.4, shaftWidthZ / 2 + 0.4],
      [shaftWidthX / 2 + 0.4, -shaftWidthZ / 2 - 0.4],
      [shaftWidthX / 2 + 0.4, shaftWidthZ / 2 + 0.4]
    ];

    corners.forEach(([cx, cz]) => {
      const cyl = new THREE.Mesh(cylGeo, this.cylinderMat);
      cyl.position.set(cx, 0, cz);
      this.shaftGroup.add(cyl);
      this.cylinders.push(cyl);
    });

    // Roof capstone & observation beacon
    this.roofCap = new THREE.Group();
    const capGeo = new THREE.BoxGeometry(shaftWidthX + 3.2, 3, shaftWidthZ + 3.2);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1c132b, metalness: 0.9, roughness: 0.3 });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    this.roofCap.add(capMesh);

    // Flashing rooftop aviation warning beacons
    const beaconGeo = new THREE.SphereGeometry(0.8, 8, 8);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const b1 = new THREE.Mesh(beaconGeo, this.beaconMat);
    b1.position.set(-shaftWidthX / 2, 2.5, -shaftWidthZ / 2);
    const b2 = new THREE.Mesh(beaconGeo, this.beaconMat);
    b2.position.set(shaftWidthX / 2, 2.5, shaftWidthZ / 2);
    this.roofCap.add(b1, b2);

    this.shaftGroup.add(this.roofCap);
    this.group.add(this.shaftGroup);
  }

  buildCodaFestBillboard() {
    // Face A: West-facing screen (facing x = -1, towards street / plaza)
    this.codaFace = new THREE.Group();

    const screenW = 42;
    const screenH = 24;

    // Outer neon bezel
    const frameGeo = new THREE.BoxGeometry(0.8, screenH + 2.4, screenW + 2.4);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x050308,
      roughness: 0.7,
      metalness: 0.4
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    this.codaFace.add(frame);

    // Neon edge trim
    const neonBorderGeo = new THREE.BoxGeometry(0.85, screenH + 0.8, screenW + 0.8);
    const neonBorderMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const neonBorder = new THREE.Mesh(neonBorderGeo, neonBorderMat);
    this.codaFace.add(neonBorder);

    // Billboard screen plane
    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    screenGeo.rotateY(-Math.PI / 2);

    // Fallback canvas poster while video loads
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0410';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 52px "Montserrat", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CODAFEST 2026', 512, 260);
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px "Courier Prime", monospace';
    ctx.fillText('HEADLINE DJ // DEAF SONIC AGENCY', 512, 330);

    const fallbackTex = new THREE.CanvasTexture(canvas);
    this.billboardMat = new THREE.MeshBasicMaterial({
      map: this.videoTexture || fallbackTex,
      toneMapped: false
    });

    const screenMesh = new THREE.Mesh(screenGeo, this.billboardMat);
    screenMesh.position.x = -0.46; // protruding slightly from West face
    this.codaFace.add(screenMesh);

    // Position relative to shaft core: west face is x = -13
    this.codaFace.position.set(-13, 0, 0);
    this.shaftGroup.add(this.codaFace);
  }

  buildWdtNeonFace() {
    // Face B: North-facing facade (facing z = -1, towards pyramid)
    this.wdtFace = new THREE.Group();

    const signW = 20;
    const signH = 24;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // Dark distressed metal sign background
    ctx.fillStyle = '#080611';
    ctx.fillRect(0, 0, 512, 600);

    // Double neon border
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 472, 560);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, 448, 536);

    // Header marquee
    ctx.fillStyle = '#ffaa00';
    ctx.font = '700 24px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CAMP TALOALI // STAYTON, OR', 256, 80);

    // Main Logo & Title
    ctx.fillStyle = '#00f0ff';
    ctx.font = '900 48px "Montserrat", sans-serif';
    ctx.fillText('WORLD DEAF', 256, 170);
    ctx.fillText('TIMBERFEST', 256, 225);

    // Stylized timber tree / axe icon
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(256, 260);
    ctx.lineTo(290, 320);
    ctx.lineTo(270, 320);
    ctx.lineTo(310, 380);
    ctx.lineTo(265, 380);
    ctx.lineTo(265, 410);
    ctx.lineTo(247, 410);
    ctx.lineTo(247, 380);
    ctx.lineTo(202, 380);
    ctx.lineTo(242, 320);
    ctx.lineTo(222, 320);
    ctx.closePath();
    ctx.fill();

    // Resident DJ Badge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Montserrat", sans-serif';
    ctx.fillText('RESIDENT DJ', 256, 465);

    ctx.fillStyle = '#00f0ff';
    ctx.font = '22px "Courier Prime", monospace';
    ctx.fillText('DEAF SONIC AGENCY', 256, 510);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;

    const signGeo = new THREE.PlaneGeometry(signW, signH);
    signGeo.rotateY(Math.PI);

    const signMat = new THREE.MeshBasicMaterial({
      map: tex,
      toneMapped: false
    });

    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.z = -26.1; // North face of shaft is z = -26
    this.wdtFace.add(signMesh);

    this.shaftGroup.add(this.wdtFace);
  }

  buildConfluenceFace() {
    // Face C: East-facing facade (facing x = +1, towards East plaza)
    this.confluenceFace = new THREE.Group();

    const screenW = 42;
    const screenH = 24;

    // Outer bezel
    const frameGeo = new THREE.BoxGeometry(0.8, screenH + 2.4, screenW + 2.4);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x050308,
      roughness: 0.7,
      metalness: 0.4
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    this.confluenceFace.add(frame);

    // Neon edge trim (Ultraviolet)
    const neonBorderGeo = new THREE.BoxGeometry(0.85, screenH + 0.8, screenW + 0.8);
    const neonBorderMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const neonBorder = new THREE.Mesh(neonBorderGeo, neonBorderMat);
    this.confluenceFace.add(neonBorder);

    // Canvas poster
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 1024, 576);
    grad.addColorStop(0, '#0c051a');
    grad.addColorStop(1, '#1b0933');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 8;
    ctx.strokeRect(24, 24, 976, 528);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, 952, 504);

    ctx.fillStyle = '#00f0ff';
    ctx.font = '700 24px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONFLUENCE RECORDING CO. // TROUTDALE, OR', 512, 90);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 50px "Montserrat", sans-serif';
    ctx.fillText('MULTISENSORY SOUND LAB', 512, 175);

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 28px "Montserrat", sans-serif';
    ctx.fillText('UNIVERSAL MUSIC DESIGN · $97K OCF CREATIVE HEIGHTS', 512, 240);

    ctx.fillStyle = '#f3efe4';
    ctx.font = '22px "Courier Prime", monospace';
    ctx.fillText('RIT BUSINESS & AUDIO ENGINEERING PEDIGREE', 512, 320);
    ctx.fillText('MODULAR SYNTHESIS · WEARABLE HAPTIC VESTS · DEAF JAZZ', 512, 365);

    ctx.fillStyle = '#a855f7';
    ctx.fillRect(252, 415, 520, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Montserrat", sans-serif';
    ctx.fillText('UNIVERSITY TOURS & RESEARCH RESIDENCY', 512, 450);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;

    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    screenGeo.rotateY(Math.PI / 2); // Faces East (+X)

    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const screenMesh = new THREE.Mesh(screenGeo, mat);
    screenMesh.position.x = 0.46;
    this.confluenceFace.add(screenMesh);

    this.confluenceFace.position.set(13, 0, 0);
    this.shaftGroup.add(this.confluenceFace);
  }

  buildAdaFace() {
    // Face D: South-facing facade (facing z = +1, towards street mouth)
    this.adaFace = new THREE.Group();

    const signW = 20;
    const signH = 24;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0812';
    ctx.fillRect(0, 0, 512, 600);

    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 472, 560);
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, 448, 536);

    ctx.fillStyle = '#ff0055';
    ctx.font = '700 22px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CITY OF HILLSBORO // CYMASPACE', 256, 80);

    ctx.fillStyle = '#ffaa00';
    ctx.font = '900 46px "Montserrat", sans-serif';
    ctx.fillText('ADA FESTIVAL', 256, 160);
    ctx.fillText('SHOWCASE', 256, 215);

    ctx.fillStyle = '#ffffff';
    ctx.font = '36px sans-serif';
    ctx.fillText('⚡ ♿ 🔊', 256, 280);

    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 24px "Montserrat", sans-serif';
    ctx.fillText('CERTIFIED ACCESSIBLE', 256, 345);
    ctx.fillText('CIVIC & FESTIVAL STAGE', 256, 380);

    ctx.fillStyle = '#cfc8dc';
    ctx.font = '19px "Courier Prime", monospace';
    ctx.fillText('TACTILE SUB-BASS DANCE PLATFORMS', 256, 440);
    ctx.fillText('SYNCHRONIZED ASL & LIGHT ARRAYS', 256, 475);

    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 18px "Courier Prime", monospace';
    ctx.fillText('MUNICIPAL & CORPORATE DEI READY', 256, 535);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;

    const signGeo = new THREE.PlaneGeometry(signW, signH);
    const signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.z = 26.1; // South face of shaft is z = +26
    this.adaFace.add(signMesh);

    this.shaftGroup.add(this.adaFace);
  }

  setPage(pageIndex) {
    this.currentPage = pageIndex;
    if (pageIndex >= 1 && pageIndex <= 4) {
      this.targetHeight = this.maxHeight;
    } else {
      this.targetHeight = this.baseHeight;
    }
  }

  update(dt, telemetry, isStageMode = false) {
    let speed = 2.4;

    if (isStageMode) {
      // VU-reactive elevator building in Live Rig mode:
      // Sub-bass (808 kicks & bass drops) physically pumps the skyscraper between 30m and 90m
      const subBass = telemetry ? (telemetry.subBass || 0) : (SHARED.uBass?.value || 0);
      const energy = telemetry ? (telemetry.overallEnergy || 0) : (SHARED.uEnergy?.value || 0);
      const beat = SHARED.uBeat?.value || 0;

      const vuLevel = Math.min(1.0, Math.max(0, subBass * 1.2 + energy * 0.4 + beat * 0.35));
      this.targetHeight = this.baseHeight + vuLevel * 60; // 30m to 90m dynamic range

      // Fast hydraulic rise on beats, smooth gravitational descent
      speed = this.targetHeight > this.currentHeight ? 12.0 : 4.5;

      // Flare neon cylinders with audio energy
      if (this.cylinderMat) {
        this.cylinderMat.emissiveIntensity = 1.6 + vuLevel * 3.2;
      }
    } else {
      // Normal page navigation mode: Pages 1, 2, 3, 4 are the 4-sided gig tower
      if (this.currentPage >= 1 && this.currentPage <= 4) {
        this.targetHeight = this.maxHeight;
      } else {
        this.targetHeight = this.baseHeight;
      }

      // Smooth ambient glow
      if (this.cylinderMat) {
        const energy = SHARED.uEnergy?.value || 0;
        this.cylinderMat.emissiveIntensity = 1.4 + energy * 1.8;
      }
    }

    // Hydraulic spring glide
    this.currentHeight += (this.targetHeight - this.currentHeight) * (1 - Math.exp(-dt * speed));

    // Update shaft geometry height
    const h = Math.max(1, this.currentHeight);
    this.shaftMesh.scale.y = h;

    this.cylinders.forEach(cyl => {
      cyl.scale.y = h;
    });

    // Position roof cap at tower top
    this.roofCap.position.y = h;

    // Position billboards near top portion of the shaft
    const displayY = Math.max(22, h - 18);
    this.codaFace.position.y = displayY;
    this.wdtFace.position.y = displayY;
    if (this.confluenceFace) this.confluenceFace.position.y = displayY;
    if (this.adaFace) this.adaFace.position.y = displayY;

    // Pulse aviation warning beacon
    if (this.beaconMat) {
      const beat = SHARED.uBeat?.value || 0;
      const flash = (Math.sin((SHARED.uTime?.value || 0) * 5) > 0.4 || beat > 0.5) ? 1.0 : 0.15;
      this.beaconMat.color.setRGB(flash, 0, flash * 0.2);
    }
  }
}
