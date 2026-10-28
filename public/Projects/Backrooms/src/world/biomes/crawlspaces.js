import * as THREE from 'three';
import { BiomeBase } from './biomeBase.js';

function makeConduitTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Dark industrial plenum grey
  ctx.fillStyle = '#222326';
  ctx.fillRect(0, 0, 256, 256);

  // Galvanized steel pipe bands
  ctx.fillStyle = '#3a3d42';
  for (let y = 16; y < 256; y += 48) {
    ctx.fillRect(0, y, 256, 16);
    ctx.fillStyle = '#555860';
    ctx.fillRect(0, y + 2, 256, 4);
    ctx.fillStyle = '#3a3d42';
  }

  // Rust streaks & grime
  ctx.fillStyle = 'rgba(120, 60, 20, 0.4)';
  for (let i = 0; i < 8; i++) {
    const rx = Math.random() * 256;
    ctx.fillRect(rx, 0, 8 + Math.random() * 12, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeRafterFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Exposed subfloor joists / dark plywood walkway
  ctx.fillStyle = '#1c1815';
  ctx.fillRect(0, 0, 256, 256);

  // Joist timber lines
  ctx.fillStyle = '#3a2d1f';
  ctx.fillRect(10, 0, 30, 256);
  ctx.fillRect(115, 0, 30, 256);
  ctx.fillRect(215, 0, 30, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export class CrawlspacesBiome extends BiomeBase {
  constructor() {
    super('crawlspaces', 'Level -1: Utility Crawlspaces');
    this.ambientColor = 0x120e0a;
    this.fogColor = 0x050403;
    this.fogDensity = 0.055;
    this.humFrequency = 90; // High frequency transformer whine

    this.conduitTex = makeConduitTexture();
    this.rafterTex = makeRafterFloorTexture();

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.conduitTex,
      roughness: 0.7,
      metalness: 0.5
    });

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.rafterTex,
      roughness: 0.85,
      metalness: 0.2
    });

    this.ceilMat = new THREE.MeshStandardMaterial({
      color: 0x111214, // Concrete deck slab overhead
      roughness: 0.95,
      metalness: 0.1
    });

    this.fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xffaa44,
      roughness: 0.2,
      metalness: 0.6,
      emissive: 0xff7711,
      emissiveIntensity: 0.85
    });

    this.subFloorMat = new THREE.MeshStandardMaterial({
      color: 0x14100c,
      roughness: 0.9,
      metalness: 0.2
    });

    this.subCeilMat = new THREE.MeshStandardMaterial({
      color: 0x101114,
      roughness: 0.9,
      metalness: 0.3
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
      color: 0xff8833, // Dim amber work light
      intensity: 1.4,
      distance: 10,
      decay: 1.3
    };
  }

  getDropTable(type) {
    switch (type) {
      case 'wall':
        return { scrap: 3, copper: 2, wood: 1 };
      case 'floor':
        return { wood: 3, scrap: 1 };
      case 'ceiling':
        return { scrap: 2, drywall: 1 };
      case 'fixture':
        return { copper: 4, ballast: 2 };
      case 'subfloor':
        return { wood: 2, scrap: 2 };
      case 'subceiling':
        return { scrap: 2, copper: 2 };
      default:
        return { scrap: 1 };
    }
  }
}
