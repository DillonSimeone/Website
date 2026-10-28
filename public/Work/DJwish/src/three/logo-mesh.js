import * as THREE from 'three';
import { FAN, SHARED, setAudioColor } from './world.js';

const TEXT = 'DJ DEAF WISH';
const CW = 2048;
const CH = 512;
const SKEW = -0.22;

function layoutText(ctx) {
  let size = 250;
  ctx.font = `900 ${size}px "Montserrat", "Arial Black", sans-serif`;
  let width = ctx.measureText(TEXT).width;
  const maxWidth = CW * 0.86;
  if (width > maxWidth) {
    size *= maxWidth / width;
    ctx.font = `900 ${size}px "Montserrat", "Arial Black", sans-serif`;
    width = ctx.measureText(TEXT).width;
  }
  const x0 = (CW - width) / 2 - size * 0.08;
  const baseline = CH * 0.74;
  return { size, width, x0, baseline };
}

function paintLogo(ctx, layout) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.save();
  ctx.setTransform(1, 0, SKEW, 1, 0, layout.baseline);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 22;
  ctx.strokeText(TEXT, layout.x0, 0);

  ctx.fillStyle = '#07060c';
  ctx.fillText(TEXT, layout.x0, 0);

  ctx.strokeStyle = '#9a96ad';
  ctx.lineWidth = 3;
  ctx.strokeText(TEXT, layout.x0, 0);
  ctx.restore();
}

function paintHalo(ctx, layout) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.save();
  ctx.setTransform(1, 0, SKEW, 1, 0, layout.baseline);
  ctx.lineJoin = 'round';
  const passes = [
    [90, 'rgba(160, 60, 255, 0.07)'],
    [64, 'rgba(190, 90, 255, 0.1)'],
    [44, 'rgba(220, 170, 255, 0.16)'],
    [30, 'rgba(255, 255, 255, 0.28)']
  ];
  for (const [w, c] of passes) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.strokeText(TEXT, layout.x0, 0);
  }
  ctx.restore();
}

/**
 * LogoMesh - sky-scale "DJ DEAF WISH" sitting on the far edge of the laser fan,
 * parented to the fan group so it shares its tilt.
 */
export class LogoMesh {
  constructor(parent) {
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = CW;
    logoCanvas.height = CH;
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = CW;
    haloCanvas.height = CH;

    const lctx = logoCanvas.getContext('2d');
    const hctx = haloCanvas.getContext('2d');
    const layout = layoutText(lctx);
    hctx.font = lctx.font;
    paintLogo(lctx, layout);
    paintHalo(hctx, layout);

    const logoTex = new THREE.CanvasTexture(logoCanvas);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;

    // Map canvas pixels to metres so the text spans the fan baseline exactly.
    const baseline = new THREE.Vector3().subVectors(FAN.end, FAN.start);
    const length = baseline.length();
    const angle = Math.atan2(baseline.y, baseline.x);
    const k = length / layout.width;
    const geo = new THREE.PlaneGeometry(CW * k, CH * k);

    const lx = (layout.x0 + layout.width / 2 - CW / 2) * k;
    const ly = (CH / 2 - layout.baseline) * k;
    const mid = new THREE.Vector3().addVectors(FAN.start, FAN.end).multiplyScalar(0.5);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const position = new THREE.Vector3(mid.x - (lx * cos - ly * sin), mid.y - (lx * sin + ly * cos), 2);

    this.haloMaterial = new THREE.MeshBasicMaterial({
      map: haloTex,
      color: new THREE.Color(0.9, 0.6, 1.5),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.halo = new THREE.Mesh(geo, this.haloMaterial);
    this.halo.position.copy(position);
    this.halo.position.z = 1;
    this.halo.rotation.z = angle;
    this.halo.renderOrder = 3;
    parent.add(this.halo);

    this.material = new THREE.MeshBasicMaterial({
      map: logoTex,
      color: new THREE.Color(1.5, 1.5, 1.5),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.copy(position);
    this.mesh.rotation.z = angle;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);

    this.fade = 1;
    this.enabled = true;
    this.hue = new THREE.Color();
    this.haloIdle = new THREE.Color(0.9, 0.6, 1.5);
  }

  /** `hidden` fades the logo out while a live-rig show draws in the sky instead. */
  update(dt, ignite, hidden) {
    this.fade += ((hidden || !this.enabled ? 0 : 1) - this.fade) * (1 - Math.exp(-dt * 3));
    const reveal = Math.min(1, Math.max(0, (ignite - 0.8) / 0.2)) * this.fade;
    const bass = SHARED.uBass.value;
    const beat = SHARED.uBeat.value;
    const active = SHARED.uActive.value;
    this.mesh.visible = this.halo.visible = reveal > 0.01;

    this.material.opacity = reveal;
    const rim = 1.4 + (bass * 0.8 + beat * 1.2) * active;
    this.material.color.setRGB(rim, rim, rim);

    setAudioColor(this.hue, SHARED.uHue.value, 0.6).multiplyScalar(1.6);
    this.haloMaterial.color.copy(this.haloIdle).lerp(this.hue, active * 0.85);
    this.haloMaterial.opacity = reveal * Math.min(1, 0.7 + (bass * 0.6 + beat * 0.8) * active);
  }
}
