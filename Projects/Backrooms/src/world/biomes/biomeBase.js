import * as THREE from 'three';

/**
 * Procedural PBR Normal Map generator (tangent-space RGB) for Unreal-like micro-surface relief.
 */
export function createPBRNormalMap({ size = 128, tileStep = 0, groutWidth = 2, grain = 0.25, repeat = 2 } = {}) {
  const data = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = (Math.random() - 0.5) * grain;
      if (tileStep > 0) {
        const mx = x % tileStep;
        const my = y % tileStep;
        if (mx < groutWidth || my < groutWidth) {
          h -= 0.7;
        }
      }
      heights[y * size + x] = h;
    }
  }

  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;
      const dx = (heights[y * size + xNext] - heights[y * size + xPrev]) * strength;
      const dy = (heights[yNext * size + x] - heights[yPrev * size + x]) * strength;
      const nz = 1.0;
      const len = Math.sqrt(dx * dx + dy * dy + nz * nz);
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(((-dx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor(((-dy / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural PBR Roughness Map generator for subtle wet/matte variation.
 */
export function createPBRRoughnessMap({ size = 128, base = 210, variance = 35, repeat = 2 } = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.min(255, Math.max(20, Math.floor(base + (Math.random() - 0.5) * variance)));
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function enhanceColorTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * BiomeBase: Base class providing palettes, materials, lighting signatures,
 * and loot tables for procedural Backrooms strata.
 */
export class BiomeBase {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.ambientColor = 0x1a1910;
    this.fogColor = 0x080806;
    this.fogDensity = 0.045;
    this.humFrequency = 60; // 60Hz default fluorescent buzz
    this.materials = {};

    // Resilient fallback materials
    this.defaultMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.2
    });
  }

  getWallMaterial() {
    return this.materials.wall || this.defaultMat;
  }

  getFloorMaterial() {
    return this.materials.floor || this.defaultMat;
  }

  getCeilingMaterial() {
    return this.materials.ceiling || this.defaultMat;
  }

  getSubFloorMaterial() {
    return this.materials.subfloor || this.defaultMat;
  }

  getSubCeilingMaterial() {
    return this.materials.subceiling || this.defaultMat;
  }

  getFixtureMaterial() {
    return this.materials.fixture || this.defaultMat;
  }

  getPillarMaterial() {
    return this.materials.pillar || this.getWallMaterial();
  }

  getLightingStyle() {
    return {
      color: 0xfff5bf,
      intensity: 1.8,
      distance: 12,
      decay: 1.2
    };
  }

  getDropTable(objectType) {
    return { drywall: 1 };
  }

  getSpawnWeight(chunkX, chunkY, chunkZ) {
    return 1.0;
  }
}
