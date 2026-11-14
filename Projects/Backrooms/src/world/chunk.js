import * as THREE from 'three';
import { RoomTemplates } from './roomTemplates.js';
import { PropSpawner } from './propSpawner.js';
import { getSharedBoxGeometry } from './sharedAssets.js';

const _instDummy = new THREE.Object3D();
const _sharedPropSpawner = new PropSpawner();
const _sharedRoomTemplates = new RoomTemplates();
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

    this.objects = [];             // All WorldObjects (destructible)
    this.destructibleMeshes = [];  // Direct raycast targets (InstancedMeshes + standalone meshes)
    this.collidables = [];         // Solid colliders for player collision
    this.lights = [];              // Active Fixtures (descriptors for pooled PointLights)

    this.propSpawner = _sharedPropSpawner;
    this.roomTemplates = _sharedRoomTemplates;

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

    this.rebuildLocalDestructibles();
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
    const totalCells = W * W;

    const floorMat = this.biome.getFloorMaterial();
    const subFloorMat = this.biome.getSubFloorMaterial();
    const ceilMat = this.biome.getCeilingMaterial();
    const wallMat = this.biome.getWallMaterial();
    const fixMat = this.biome.getFixtureMaterial();
    const lightConfig = this.biome.getLightingStyle();

    const floorGeo = getSharedBoxGeometry(V, 0.1, V);
    const subFloorGeo = getSharedBoxGeometry(V, 0.14, V);
    const ceilGeo = getSharedBoxGeometry(V, 0.08, V);

    const floorInst = new THREE.InstancedMesh(floorGeo, floorMat, totalCells);
    const subFloorInst = new THREE.InstancedMesh(subFloorGeo, subFloorMat, totalCells);
    const ceilInst = new THREE.InstancedMesh(ceilGeo, ceilMat, totalCells);
    const fixInst = new THREE.InstancedMesh(ceilGeo, fixMat, 16);

    let fIdx = 0;
    let sfIdx = 0;
    let cIdx = 0;
    let fixIdx = 0;

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
        _instDummy.position.set(px, floorY, pz);
        _instDummy.scale.set(1, 1, 1);
        _instDummy.updateMatrix();
        floorInst.setMatrixAt(fIdx, _instDummy.matrix);
        const fObj = isWater
          ? new WaterBlock(null, {
              instancedMesh: floorInst,
              instanceId: fIdx,
              position: new THREE.Vector3(px, floorY, pz),
              title: 'Wading Pool Basin',
              drops: this.biome.getDropTable('floor')
            })
          : new Floor(null, {
              instancedMesh: floorInst,
              instanceId: fIdx,
              position: new THREE.Vector3(px, floorY, pz),
              title: 'White Porcelain Deck',
              drops: this.biome.getDropTable('floor')
            });
        this.objects.push(fObj);
        fIdx++;

        // Subfloor
        _instDummy.position.set(px, floorY - 0.12, pz);
        _instDummy.updateMatrix();
        subFloorInst.setMatrixAt(sfIdx, _instDummy.matrix);
        const sfObj = new SubFloor(null, {
          instancedMesh: subFloorInst,
          instanceId: sfIdx,
          position: new THREE.Vector3(px, floorY - 0.12, pz),
          title: 'Aqueduct Sub-Floor',
          drops: this.biome.getDropTable('subfloor')
        });
        this.objects.push(sfObj);
        sfIdx++;

        // Ceiling
        const isFixture = (gx % 3 === 1 && gz % 3 === 1);
        if (isFixture && fixIdx < 16) {
          _instDummy.position.set(px, origin.y + roomH, pz);
          _instDummy.updateMatrix();
          fixInst.setMatrixAt(fixIdx, _instDummy.matrix);
          const fixObj = new Fixture(null, lightConfig, {
            instancedMesh: fixInst,
            instanceId: fixIdx,
            position: new THREE.Vector3(px, origin.y + roomH, pz),
            lightPos: new THREE.Vector3(px, origin.y + roomH - 0.25, pz),
            title: 'Cyan Aquatic Luminaire',
            drops: this.biome.getDropTable('fixture')
          });
          this.objects.push(fixObj);
          this.lights.push(fixObj);
          fixIdx++;
        } else {
          _instDummy.position.set(px, origin.y + roomH, pz);
          _instDummy.updateMatrix();
          ceilInst.setMatrixAt(cIdx, _instDummy.matrix);
          const cObj = new Ceiling(null, {
            instancedMesh: ceilInst,
            instanceId: cIdx,
            position: new THREE.Vector3(px, origin.y + roomH, pz),
            title: 'Porcelain Vault Ceiling',
            drops: this.biome.getDropTable('ceiling')
          });
          this.objects.push(cObj);
          cIdx++;
        }
      }
    }

    floorInst.count = fIdx;
    subFloorInst.count = sfIdx;
    ceilInst.count = cIdx;
    fixInst.count = fixIdx;
    floorInst.instanceMatrix.needsUpdate = true;
    subFloorInst.instanceMatrix.needsUpdate = true;
    ceilInst.instanceMatrix.needsUpdate = true;
    fixInst.instanceMatrix.needsUpdate = true;
    floorInst.computeBoundingSphere();
    subFloorInst.computeBoundingSphere();
    ceilInst.computeBoundingSphere();
    fixInst.computeBoundingSphere();

    this.group.add(floorInst);
    this.group.add(subFloorInst);
    if (cIdx > 0) this.group.add(ceilInst);
    if (fixIdx > 0) this.group.add(fixInst);

    // Seal the 0.75m drop around sunken 4x4 pool basins so lower strata never peek through
    if (hasSunkenBasin) {
      const basinSpan = 4 * V;
      const curbH = 0.90;
      const curbThick = 0.16;
      const curbY = origin.y - 0.375;
      const centerX = origin.x + 4 * V;
      const centerZ = origin.z + 4 * V;

      const nsCurbGeo = getSharedBoxGeometry(basinSpan + curbThick, curbH, curbThick);
      const ewCurbGeo = getSharedBoxGeometry(curbThick, curbH, basinSpan + curbThick);

      const curbs = [
        { geo: nsCurbGeo, x: centerX, z: origin.z + 2 * V },
        { geo: nsCurbGeo, x: centerX, z: origin.z + 6 * V },
        { geo: ewCurbGeo, x: origin.x + 2 * V, z: centerZ },
        { geo: ewCurbGeo, x: origin.x + 6 * V, z: centerZ }
      ];
      for (let i = 0; i < curbs.length; i++) {
        const c = curbs[i];
        const curbMesh = new THREE.Mesh(c.geo, wallMat);
        curbMesh.position.set(c.x, curbY, c.z);
        const curbObj = new Wall(curbMesh, {
          title: 'Porcelain Pool Curb',
          hp: 20,
          requiresExplosive: true,
          drops: this.biome.getDropTable('floor')
        });
        this.group.add(curbMesh);
        this.objects.push(curbObj);
      }
    }

    // Archway Columns between Pool Chambers
    const seed2 = this.pseudoRandom(this.cx * 11.3, this.cy * 7.1, this.cz * 29.9);
    if (seed2 < 0.45) {
      const archPillarGeo = getSharedBoxGeometry(0.8, roomH, 0.8);
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

  /**
   * Helper: Register all current standalone meshes & instanced meshes in this chunk for fast local raycasting.
   */
  rebuildLocalDestructibles() {
    this.destructibleMeshes.length = 0;
    const seen = new Set();
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      if (obj.destroyed) continue;
      if (obj.instancedMesh) {
        if (!seen.has(obj.instancedMesh)) {
          seen.add(obj.instancedMesh);
          this.destructibleMeshes.push(obj.instancedMesh);
        }
      } else if (obj.mesh) {
        if (obj.mesh.isGroup) {
          obj.mesh.traverse(child => {
            if (child.isMesh && !seen.has(child)) {
              seen.add(child);
              this.destructibleMeshes.push(child);
            }
          });
        } else if (!seen.has(obj.mesh)) {
          seen.add(obj.mesh);
          this.destructibleMeshes.push(obj.mesh);
        }
      }
    }
  }

  removeObject(target) {
    if (!target) return;

    // target may be a WorldObject (instanced) or a Mesh
    const isWorldObj = target.destroyed !== undefined || target.instancedMesh !== undefined;
    if (isWorldObj) {
      const oIdx = this.objects.indexOf(target);
      if (oIdx > -1) this.objects.splice(oIdx, 1);

      const cIdx = this.collidables.findIndex(c => c === target.mesh || c.worldObject === target);
      if (cIdx > -1) this.collidables.splice(cIdx, 1);

      const lIdx = this.lights.indexOf(target);
      if (lIdx > -1) this.lights.splice(lIdx, 1);
      return;
    }

    const oIdx = this.objects.findIndex(o => o.mesh === target);
    if (oIdx > -1) this.objects.splice(oIdx, 1);

    const dIdx = this.destructibleMeshes.indexOf(target);
    if (dIdx > -1) this.destructibleMeshes.splice(dIdx, 1);

    const cIdx = this.collidables.indexOf(target);
    if (cIdx > -1) this.collidables.splice(cIdx, 1);

    const lIdx = this.lights.findIndex(l => l.mesh === target);
    if (lIdx > -1) this.lights.splice(lIdx, 1);

    if (target.parent) {
      target.parent.remove(target);
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
    this.destructibleMeshes = [];
    this.collidables = [];
    this.lights = [];
  }
}
