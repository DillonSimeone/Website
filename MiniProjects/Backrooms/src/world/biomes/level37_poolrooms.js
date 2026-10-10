import * as THREE from 'three';
import { BiomeBase } from './biomeBase.js';

function makePoolTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Pure white/pale eggshell porcelain tile
  ctx.fillStyle = '#f2f7f9';
  ctx.fillRect(0, 0, 256, 256);

  // Ceramic grid lines (grout)
  ctx.strokeStyle = '#b8cdd6';
  ctx.lineWidth = 3;

  const tileSize = 32;
  for (let x = 0; x <= 256; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Soft glossy reflections / subtle specular gradient
  for (let x = 0; x < 256; x += tileSize) {
    for (let y = 0; y < 256; y += tileSize) {
      if (Math.random() < 0.25) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(x + 2, y + 2, 10, 10);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function makeWaterTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Wading water submerged floor: aquamarine blue
  ctx.fillStyle = '#2ea5c2';
  ctx.fillRect(0, 0, 256, 256);

  // Caustics shimmer
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * 256,
      Math.random() * 256,
      20 + Math.random() * 40,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export class Level37PoolroomsBiome extends BiomeBase {
  constructor() {
    super('level37_poolrooms', 'Level 37: The Poolrooms');
    this.ambientColor = 0x0a2028;
    this.fogColor = 0x06141c;
    this.fogDensity = 0.038;
    this.humFrequency = 120; // Soft resonant water chime

    this.tileTex = makePoolTileTexture();
    this.waterTex = makeWaterTileTexture();

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.tileTex,
      roughness: 0.15,
      metalness: 0.25
    });

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.waterTex,
      roughness: 0.1,
      metalness: 0.4
    });

    this.ceilMat = new THREE.MeshStandardMaterial({
      map: this.tileTex,
      roughness: 0.2,
      metalness: 0.2
    });

    this.fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xdbf7ff,
      roughness: 0.1,
      metalness: 0.3,
      emissive: 0x90e6ff,
      emissiveIntensity: 0.85
    });

    this.subFloorMat = new THREE.MeshStandardMaterial({
      color: 0x1a404a, // Waterproof aqueduct lining
      roughness: 0.4,
      metalness: 0.3
    });

    this.subCeilMat = new THREE.MeshStandardMaterial({
      color: 0x224854,
      roughness: 0.3,
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
      color: 0x95eaff,
      intensity: 1.5,
      distance: 14,
      decay: 1.1
    };
  }

  getDropTable(type) {
    switch (type) {
      case 'wall':
        return { drywall: 2, ceramic: 4, wood: 1 };
      case 'floor':
        return { ceramic: 3, pvc: 2 };
      case 'ceiling':
        return { ceramic: 3, drywall: 2 };
      case 'fixture':
        return { copper: 3, ballast: 2 };
      case 'subfloor':
        return { pvc: 3, ceramic: 2 };
      case 'subceiling':
        return { pvc: 2, copper: 1 };
      default:
        return { ceramic: 1 };
    }
  }
}
