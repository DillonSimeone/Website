import * as THREE from 'three';
import { BiomeBase } from './biomeBase.js';

function makeIndustrialConcreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Cold grey weathered concrete
  ctx.fillStyle = '#4a4d52';
  ctx.fillRect(0, 0, 512, 512);

  // Formwork board lines
  ctx.strokeStyle = '#383a3e';
  ctx.lineWidth = 3;
  for (let y = 0; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Aggregate noise & dirt
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 30;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Rust drips and mineral run-off
  ctx.fillStyle = 'rgba(140, 75, 25, 0.45)';
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 512;
    const w = 4 + Math.random() * 8;
    const h = 80 + Math.random() * 180;
    ctx.fillRect(x, 0, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeSteelPlateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Dark oily corrugated/diamond plate steel
  ctx.fillStyle = '#2d2f33';
  ctx.fillRect(0, 0, 256, 256);

  // Rivets and plate seams
  ctx.strokeStyle = '#1e2023';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 248);

  ctx.fillStyle = '#454950';
  for (let x = 16; x < 256; x += 32) {
    for (let y = 16; y < 256; y += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export class Level1IndustrialBiome extends BiomeBase {
  constructor() {
    super('level1_industrial', 'Level 1: Industrial Pipe Dreams');
    this.ambientColor = 0x121418;
    this.fogColor = 0x090b0e;
    this.fogDensity = 0.045;
    this.humFrequency = 75; // Low mechanical hum & steam hiss

    this.concreteTex = makeIndustrialConcreteTexture();
    this.steelTex = makeSteelPlateTexture();

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex,
      roughness: 0.85,
      metalness: 0.25
    });

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex,
      roughness: 0.75,
      metalness: 0.3
    });

    this.subFloorMat = new THREE.MeshStandardMaterial({
      map: this.steelTex,
      roughness: 0.6,
      metalness: 0.7
    });

    this.ceilingMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex,
      roughness: 0.9,
      metalness: 0.2
    });

    this.fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xffd280,
      emissive: 0xffa030,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.6
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      map: this.steelTex,
      roughness: 0.5,
      metalness: 0.75
    });
  }

  getWallMaterial() { return this.wallMat; }
  getFloorMaterial() { return this.floorMat; }
  getCeilingMaterial() { return this.ceilingMat; }
  getSubFloorMaterial() { return this.subFloorMat; }
  getSubCeilingMaterial() { return this.subFloorMat; }
  getFixtureMaterial() { return this.fixtureMat; }
  getPillarMaterial() { return this.pillarMat; }

  getLightingStyle() {
    return {
      color: 0xffb74d, // Warm industrial sodium amber
      intensity: 1.8,
      distance: 18,
      decay: 1.2
    };
  }

  getDropTable(type) {
    switch (type) {
      case 'wall':
        return { drywall: 2, rebar: 3, scrap: 2 };
      case 'pillar':
        return { rebar: 6, scrap: 4 };
      case 'floor':
        return { scrap: 3, rebar: 2 };
      case 'subfloor':
        return { scrap: 4, copper: 2 };
      case 'fixture':
        return { copper: 6, ballast: 3, scrap: 2 };
      case 'ceiling':
        return { scrap: 2, rebar: 2 };
      default:
        return { scrap: 2 };
    }
  }
}
