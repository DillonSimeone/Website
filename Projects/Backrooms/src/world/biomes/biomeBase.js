import * as THREE from 'three';

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
