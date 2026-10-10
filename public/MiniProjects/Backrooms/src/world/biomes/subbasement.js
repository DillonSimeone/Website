import * as THREE from 'three';
import { BiomeBase } from './biomeBase.js';

function makeConcreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Heavy monolithic aggregate concrete
  ctx.fillStyle = '#36383b';
  ctx.fillRect(0, 0, 256, 256);

  // Aggregate noise & chips
  const imgData = ctx.getImageData(0, 0, 256, 256);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 35;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + grain));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Damp water leak stains & cracks
  ctx.strokeStyle = '#222325';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, 0);
    ctx.lineTo(Math.random() * 256, 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export class SubbasementBiome extends BiomeBase {
  constructor() {
    super('subbasement', 'Level -2: Subbasement Crypt');
    this.ambientColor = 0x08090b;
    this.fogColor = 0x040507;
    this.fogDensity = 0.06;
    this.humFrequency = 45; // Deep subterranean infrasound rumble

    this.concreteTex = makeConcreteTexture();

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex,
      roughness: 0.9,
      metalness: 0.2
    });

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.concreteTex,
      roughness: 0.8,
      metalness: 0.3
    });

    this.ceilMat = new THREE.MeshStandardMaterial({
      color: 0x1d1e22, // Heavy bedrock ceiling
      roughness: 0.95,
      metalness: 0.1
    });

    this.fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xaaccff,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x5588cc,
      emissiveIntensity: 0.7
    });

    this.subFloorMat = new THREE.MeshStandardMaterial({
      color: 0x151619, // Deep foundation earth
      roughness: 0.95,
      metalness: 0.05
    });

    this.subCeilMat = new THREE.MeshStandardMaterial({
      color: 0x18191c,
      roughness: 0.95,
      metalness: 0.1
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
      color: 0x77aaff, // Dim cold fluorescent
      intensity: 1.3,
      distance: 10,
      decay: 1.25
    };
  }

  getDropTable(type) {
    switch (type) {
      case 'wall':
        return { rebar: 3, scrap: 2, drywall: 1 };
      case 'floor':
        return { rebar: 2, scrap: 2 };
      case 'ceiling':
        return { rebar: 2, scrap: 2 };
      case 'fixture':
        return { copper: 4, ballast: 2 };
      case 'subfloor':
        return { rebar: 3, scrap: 1 };
      case 'subceiling':
        return { rebar: 2, copper: 1 };
      default:
        return { scrap: 1 };
    }
  }
}
