import * as THREE from 'three';
import { BiomeBase } from './biomeBase.js';

// Texture generators
function makeWallpaperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#cbb763';
  ctx.fillRect(0, 0, 512, 512);

  for (let x = 0; x < 512; x += 32) {
    ctx.fillStyle = (x % 64 === 0) ? '#bfab55' : '#c3af5d';
    ctx.fillRect(x, 0, 16, 512);
  }

  ctx.strokeStyle = '#b49f48';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < 512; y += 48) {
    for (let x = 0; x < 512; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + 24, y);
      ctx.lineTo(x + 48, y + 24);
      ctx.lineTo(x + 24, y + 48);
      ctx.lineTo(x, y + 24);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = '#a9933b';
      ctx.beginPath();
      ctx.arc(x + 24, y + 24, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Grime and water stains
  for (let i = 0; i < 20; i++) {
    const sx = Math.random() * 512;
    const sy = Math.random() * 512;
    const sr = 15 + Math.random() * 45;
    const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr);
    grad.addColorStop(0, 'rgba(120, 100, 30, 0.35)');
    grad.addColorStop(1, 'rgba(180, 150, 50, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeCarpetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6e5e34';
  ctx.fillRect(0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 45;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + grain * 0.9));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + grain * 0.4));
  }
  ctx.putImageData(imgData, 0, 0);

  // Damp mold spots
  for (let i = 0; i < 14; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 512;
    const cr = 20 + Math.random() * 50;
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, cr);
    grad.addColorStop(0, 'rgba(45, 38, 18, 0.7)');
    grad.addColorStop(0.7, 'rgba(60, 50, 22, 0.3)');
    grad.addColorStop(1, 'rgba(100, 85, 45, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function makeCeilingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d3d3cd';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#7a7a72';
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * 240 + 8;
    const py = Math.random() * 240 + 8;
    ctx.fillRect(px, py, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }

  // Seamless acoustic mineral texture without harsh edge borders
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeTrofferTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8f8f88';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#f8fffa';
  ctx.fillRect(20, 20, 216, 216);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(65, 25, 30, 206);
  ctx.fillRect(160, 25, 30, 206);

  ctx.strokeStyle = '#a0a09a';
  ctx.lineWidth = 3;
  for (let y = 30; y < 230; y += 22) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(236, y);
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

export class Level0MonoYellowBiome extends BiomeBase {
  constructor() {
    super('level0_monoyellow', 'Level 0: Monosodium Yellow');
    this.ambientColor = 0x1f1d13;
    this.fogColor = 0x080806;
    this.fogDensity = 0.042;
    this.humFrequency = 60;

    this.wallpaperTex = makeWallpaperTexture();
    this.carpetTex = makeCarpetTexture();
    this.ceilingTex = makeCeilingTexture();
    this.trofferTex = makeTrofferTexture();

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallpaperTex,
      roughness: 0.85,
      metalness: 0.05
    });

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.carpetTex,
      roughness: 0.95,
      metalness: 0.0
    });

    this.ceilMat = new THREE.MeshStandardMaterial({
      map: this.ceilingTex,
      roughness: 0.8,
      metalness: 0.1
    });

    this.fixtureMat = new THREE.MeshStandardMaterial({
      map: this.trofferTex,
      roughness: 0.3,
      metalness: 0.5,
      emissive: 0xffffff,
      emissiveIntensity: 0.95
    });

    this.subFloorMat = new THREE.MeshStandardMaterial({
      color: 0x2e271a, // Pine plywood underlayment
      roughness: 0.9,
      metalness: 0.1
    });

    this.subCeilMat = new THREE.MeshStandardMaterial({
      color: 0x1e1c18, // Mineral fiber backing
      roughness: 0.85,
      metalness: 0.2
    });
  }

  getWallMaterial() { return this.wallMat; }
  getFloorMaterial() { return this.floorMat; }
  getCeilingMaterial() { return this.ceilMat; }
  getSubFloorMaterial() { return this.subFloorMat; }
  getSubCeilingMaterial() { return this.subCeilMat; }
  getFixtureMaterial() { return this.fixtureMat; }

  getLightingStyle() {
    return {
      color: 0xfff5bf,
      intensity: 1.8,
      distance: 12,
      decay: 1.2
    };
  }

  getDropTable(type) {
    switch (type) {
      case 'wall':
        return { drywall: 4, wood: 2 };
      case 'floor':
        return { fiber: 4, wood: 1 };
      case 'ceiling':
        return { drywall: 2, wood: 1 };
      case 'fixture':
        return { copper: 3, ballast: 2 };
      case 'subfloor':
        return { wood: 3, drywall: 1 };
      case 'subceiling':
        return { drywall: 2, copper: 1 };
      default:
        return { drywall: 1 };
    }
  }
}
