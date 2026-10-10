import * as THREE from 'three';
import { RoomTemplates } from './roomTemplates.js';
import { PropSpawner } from './propSpawner.js';
import { Floor, SubFloor, Wall, Pillar, Ceiling, WaterBlock, Fixture } from './subfloor.js';

/**
 * Chunk: A single room/chamber in the Backrooms with variable volumetric dimensions.
 *
 * Each chunk is a self-contained architectural volume with its own ceiling height,
 * room template, connectivity openings, and anomalous features. No two rooms share
 * the same dimensions or layout.
 *
 * Room types range from 1.8m claustrophobic conduits to 16m cathedral voids.
 * Connectivity openings (doorways/archways) link adjacent chunks together, with
 * transition geometry (ramps, ledges, step-downs) adapting to height mismatches
 * between neighbors.
 */
export class Chunk {
  constructor(cx, cy, cz, biome, options = {}) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.key = `${cx},${cy},${cz}`;
    this.biome = biome;

    this.voxelSize = options.voxelSize || 1.5;
    this.gridWidth = options.gridWidth || 8;
    this.chunkWidth = this.gridWidth * this.voxelSize; // 12.0m
    this.chunkDepth = this.gridWidth * this.voxelSize; // 12.0m
    this.layerHeight = options.layerHeight || 20.0;

    // Room-specific parameters from WorldManager
    this.roomType = options.roomType || 'standard_office';
    this.roomHeight = options.roomHeight || 3.0;
    this.connectivity = options.connectivity || { north: true, south: true, east: true, west: true };

    this.group = new THREE.Group();
    this.group.name = `Chunk_${this.key}`;

    this.objects = [];        // All WorldObjects (destructible)
    this.collidables = [];    // Solid meshes for player collision
    this.lights = [];         // Active Fixtures with PointLights

    this.propSpawner = new PropSpawner();
    this.roomTemplates = new RoomTemplates();

    this.isDisposed = false;
  }

  pseudoRandom(x, y, z) {
    const sin = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return sin - Math.floor(sin);
  }

  build(scene) {
    const origin = {
      x: this.cx * this.chunkWidth,
      y: this.cy * this.layerHeight,
      z: this.cz * this.chunkDepth
    };

    // Dispatch to the appropriate room template generator
    switch (this.roomType) {
      case 'cathedral_void':
        this.roomTemplates.generateCathedralVoid(this, origin, this.biome, this.propSpawner);
        break;
      case 'vaulted_hall':
        this.roomTemplates.generateVaultedHall(this, origin, this.biome, this.propSpawner);
        break;
      case 'stairs_to_drywall':
        this.roomTemplates.generateStairsToDrywall(this, origin, this.biome, this.propSpawner);
        break;
      case 'isolated_structure':
        this.roomTemplates.generateIsolatedStructure(this, origin, this.biome, this.propSpawner);
        break;
      case 'pillar_forest':
        this.roomTemplates.generatePillarForest(this, origin, this.biome, this.propSpawner);
        break;
      case 'narrow_crevice':
        this.roomTemplates.generateNarrowCrevice(this, origin, this.biome, this.propSpawner);
        break;
      case 'impossible_ledge':
        this.roomTemplates.generateImpossibleLedge(this, origin, this.biome, this.propSpawner);
        break;
      case 'standard_tall':
        this.roomTemplates.generateStandardRoom(this, origin, this.biome, this.propSpawner, 4.5);
        break;
      case 'poolrooms':
        this.buildPoolroomsChunk(origin);
        break;
      default:
        // standard_office — The classic Backrooms 3m office corridor
        this.roomTemplates.generateStandardRoom(this, origin, this.biome, this.propSpawner, 3.0);
        break;
    }

    scene.add(this.group);
  }

  /**
   * Dedicated Level 37 Poolrooms Generation:
   * Sunken wading pools, stepped white porcelain ledges, translucent water, tall vaulted atriums
   */
  buildPoolroomsChunk(origin) {
    const V = this.voxelSize;
    const W = this.gridWidth;
    const roomH = this.roomHeight;

    const floorMat = this.biome.getFloorMaterial();
    const subFloorMat = this.biome.getSubFloorMaterial();
    const ceilMat = this.biome.getCeilingMaterial();
    const wallMat = this.biome.getWallMaterial();
    const fixMat = this.biome.getFixtureMaterial();
    const lightConfig = this.biome.getLightingStyle();

    const floorGeo = new THREE.BoxGeometry(V, 0.1, V);
    const subFloorGeo = new THREE.BoxGeometry(V, 0.14, V);
    const ceilGeo = new THREE.BoxGeometry(V, 0.08, V);

    // Is this chunk a sunken pool basin?
    const seed = this.pseudoRandom(this.cx * 23.3, this.cy * 17.1, this.cz * 41.9);
    const hasSunkenBasin = seed > 0.35;

    for (let gx = 0; gx < W; gx++) {
      for (let gz = 0; gz < W; gz++) {
        const px = origin.x + (gx * V) + (V / 2);
        const pz = origin.z + (gz * V) + (V / 2);

        let floorY = origin.y;
        let isWater = false;

        // Center 4x4 voxels sink down into turquoise water basin
        if (hasSunkenBasin && gx >= 2 && gx <= 5 && gz >= 2 && gz <= 5) {
          floorY = origin.y - 0.75;
          isWater = true;
        }

        // Floor / Basin Surface
        const fMesh = new THREE.Mesh(floorGeo, floorMat);
        fMesh.position.set(px, floorY, pz);
        const fObj = isWater
          ? new WaterBlock(fMesh, { title: 'Wading Pool Basin', drops: this.biome.getDropTable('floor') })
          : new Floor(fMesh, { title: 'White Porcelain Deck', drops: this.biome.getDropTable('floor') });
        this.group.add(fMesh);
        this.objects.push(fObj);

        // Subfloor
        const sfMesh = new THREE.Mesh(subFloorGeo, subFloorMat);
        sfMesh.position.set(px, floorY - 0.12, pz);
        const sfObj = new SubFloor(sfMesh, { title: 'Aqueduct Sub-Floor', drops: this.biome.getDropTable('subfloor') });
        this.group.add(sfMesh);
        this.objects.push(sfObj);

        // Ceiling
        const isFixture = (gx % 3 === 1 && gz % 3 === 1);
        if (isFixture) {
          const fixMesh = new THREE.Mesh(ceilGeo, fixMat);
          fixMesh.position.set(px, origin.y + roomH, pz);

          const pLight = new THREE.PointLight(lightConfig.color, lightConfig.intensity, lightConfig.distance, lightConfig.decay);
          pLight.position.set(px, origin.y + roomH - 0.25, pz);
          this.group.add(pLight);

          const fixObj = new Fixture(fixMesh, pLight, { title: 'Cyan Aquatic Luminaire', drops: this.biome.getDropTable('fixture') });
          this.group.add(fixMesh);
          this.objects.push(fixObj);
          this.lights.push(fixObj);
        } else {
          const cMesh = new THREE.Mesh(ceilGeo, ceilMat);
          cMesh.position.set(px, origin.y + roomH, pz);
          const cObj = new Ceiling(cMesh, { title: 'Porcelain Vault Ceiling', drops: this.biome.getDropTable('ceiling') });
          this.group.add(cMesh);
          this.objects.push(cObj);
        }
      }
    }

    // Archway Columns between Pool Chambers
    const seed2 = this.pseudoRandom(this.cx * 11.3, this.cy * 7.1, this.cz * 29.9);
    if (seed2 < 0.45) {
      const archPillarGeo = new THREE.BoxGeometry(0.8, roomH, 0.8);
      [ { gx: 1, gz: 1 }, { gx: 6, gz: 1 }, { gx: 1, gz: 6 }, { gx: 6, gz: 6 } ].forEach(pos => {
        const pMesh = new THREE.Mesh(archPillarGeo, wallMat);
        pMesh.position.set(origin.x + (pos.gx * V) + (V / 2), origin.y + (roomH / 2), origin.z + (pos.gz * V) + (V / 2));
        const pObj = new Pillar(pMesh, { title: 'Porcelain Arch Column', hp: 45, drops: this.biome.getDropTable('wall') });
        pMesh.userData.bbox = new THREE.Box3().setFromObject(pMesh);
        this.group.add(pMesh);
        this.objects.push(pObj);
        this.collidables.push(pMesh);
      });
    }

    // Perimeter walls with openings for connectivity
    this.roomTemplates.generatePerimeterWalls(this, origin, this.biome, roomH, this.connectivity);
  }

  removeObject(mesh) {
    if (!mesh) return;

    const oIdx = this.objects.findIndex(o => o.mesh === mesh);
    if (oIdx > -1) this.objects.splice(oIdx, 1);

    const cIdx = this.collidables.indexOf(mesh);
    if (cIdx > -1) this.collidables.splice(cIdx, 1);

    const lIdx = this.lights.findIndex(l => l.mesh === mesh);
    if (lIdx > -1) this.lights.splice(lIdx, 1);

    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
  }

  dispose(scene) {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (scene && this.group) {
      scene.remove(this.group);
    }

    for (const obj of this.objects) {
      if (obj.destroy) {
        obj.destroy(scene);
      }
    }

    this.objects = [];
    this.collidables = [];
    this.lights = [];
  }
}
