import * as THREE from 'three';
import { Chunk } from './chunk.js';
import { Level0MonoYellowBiome } from './biomes/level0_monoyellow.js';
import { Level1IndustrialBiome } from './biomes/level1_industrial.js';
import { Level37PoolroomsBiome } from './biomes/level37_poolrooms.js';
import { CrawlspacesBiome } from './biomes/crawlspaces.js';
import { SubbasementBiome } from './biomes/subbasement.js';

/**
 * WorldManager: Coordinates dynamic 3D chunk streaming across infinite X, Y, Z.
 * Selects biomes procedurally, handles chunk lifecycle, and aggregates spatial queries.
 *
 * Canonical Multi-Strata Backrooms Architecture:
 * - Each vertical stratum (cy) is a distinct Backrooms level with uniform ceiling height
 *   and contiguous ceilings, eliminating floating ceiling artifacts.
 * - Vertical strata baseline separation is 20.0m, ensuring a generous structural interstitial
 *   slab between levels so lower ceilings never clip into upper floors.
 * - Sinking or breaching down through subfloors advances progressively through the levels:
 *   cy = 1:  Level -1: Utility Crawlspaces & Plenum
 *   cy = 0:  Level 0: Monosodium Yellow Labyrinth
 *   cy = -1: Level 1: Industrial Pipe Dreams
 *   cy = -2: Level 37: The Poolrooms
 *   cy = -3: Level -2: Subbasement Crypt & Vaults
 *   cy <= -4: Deep Sub-Plenum Catacombs
 */
export class WorldManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.voxelSize = options.voxelSize || 1.5;
    this.gridWidth = options.gridWidth || 8;
    this.layerHeight = options.layerHeight || 20.0;

    this.chunkWidth = this.gridWidth * this.voxelSize; // 12.0m per chunk
    this.chunkDepth = this.gridWidth * this.voxelSize; // 12.0m per chunk

    this.radiusH = options.radiusH !== undefined ? options.radiusH : 2; // 5x5 horizontal bubble (fog hides >36m)
    this.radiusV = options.radiusV !== undefined ? options.radiusV : 1; // 1 keeps adjacent vertical strata ready

    // Registered Biomes
    this.biomes = {
      level0: new Level0MonoYellowBiome(),
      level1: new Level1IndustrialBiome(),
      poolrooms: new Level37PoolroomsBiome(),
      crawlspace: new CrawlspacesBiome(),
      subbasement: new SubbasementBiome()
    };

    this.loadedChunks = new Map(); // key -> Chunk
    this.buildQueue = [];          // Time-sliced chunk build queue
    this.lastChunkCoords = { cx: null, cy: null, cz: null };

    // Player-placed standalone objects (barricades, scaffolding, beacons, jump pads)
    this.extraDestructibles = [];
    this.extraCollidables = [];
    this.extraLights = [];
    this.jumpPads = [];

    // Scratch arrays returned by spatial queries (reused to avoid per-frame GC)
    this._nearbyDestructibles = [];
    this._nearbyCollidables = [];
    this._nearbyLights = [];

    // Legacy cached aggregation arrays (kept for compatibility if needed)
    this.cachedDestructibles = [];
    this.cachedCollidables = [];
    this.cachedLights = [];
    this.dirtyCaches = true;
  }

  /**
   * Determine biome for chunk based on vertical layer and 2D horizontal noise threshold
   */
  selectBiome(cx, cy, cz) {
    if (cy === 0) {
      // Spawn chunk and immediate neighborhood start in classic Level 0
      if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) {
        return this.biomes.level0;
      }
      const sample = Math.sin(cx * 0.35 + cz * 0.22) + Math.cos(cx * 0.18 - cz * 0.41);
      if (sample > 0.82) return this.biomes.poolrooms;
      return this.biomes.level0;
    }

    // All other vertical strata (above or below Level 0) procedurally select random Backrooms levels
    // using a deterministic per-stratum + regional hash so digging down reveals varied, unpredictable biomes!
    const regionX = Math.floor(cx / 2);
    const regionZ = Math.floor(cz / 2);
    const h = Math.sin(regionX * 19.7 + cy * 73.1 + regionZ * 37.3) * 43758.5453;
    const roll = h - Math.floor(h);

    if (roll < 0.22) return this.biomes.level0;
    if (roll < 0.44) return this.biomes.level1;
    if (roll < 0.64) return this.biomes.poolrooms;
    if (roll < 0.84) return this.biomes.subbasement;
    return this.biomes.crawlspace;
  }

  /**
   * Deterministic room template selector for a given chunk coordinate.
   * Uses stable hashing so neighbor queries produce consistent results.
   */
  getRoomType(cx, cy, cz) {
    const hash = Math.sin(cx * 71.9 + cy * 43.1 + cz * 89.3) * 43758.5453;
    const seed = hash - Math.floor(hash);

    // Spawn chunk (0, 0, 0) is guaranteed to be a classic open standard office lobby
    if (cx === 0 && cy === 0 && cz === 0) return 'standard_office';

    const biome = this.selectBiome(cx, cy, cz);
    if (biome.id === 'level37_poolrooms') return 'poolrooms';
    if (biome.id === 'crawlspaces') return 'narrow_crevice';
    if (biome.id === 'level1_industrial') {
      if (seed < 0.4) return 'vaulted_hall';
      if (seed < 0.7) return 'pillar_forest';
      return 'standard_office';
    }
    if (biome.id === 'subbasement') {
      if (seed < 0.5) return 'pillar_forest';
      return 'standard_office';
    }

    // Level 0 (Office): Rich surreal office topologies
    if (seed < 0.16) return 'pillar_forest';
    if (seed < 0.32) return 'stairs_to_drywall';
    if (seed < 0.46) return 'isolated_structure';
    if (seed < 0.60) return 'standard_tall';
    return 'standard_office';
  }

  /**
   * Get the ceiling height for a given stratum.
   * Uniform within each stratum to guarantee flat, contiguous ceilings across chunks!
   */
  getRoomHeight(roomType, cy = 0) {
    if (cy > 0) return 2.0;       // Crawlspaces: low 2.0m plenum
    if (cy === 0) return 3.2;      // Level 0: uniform 3.2m acoustic drop-tile ceiling
    if (cy === -1) return 4.2;     // Level 1: uniform 4.2m concrete industrial ceiling
    if (cy === -2) return 5.0;     // Level 37: uniform 5.0m ceramic vaulted ceiling
    if (cy === -3) return 3.8;     // Level -2: uniform 3.8m masonry crypt ceiling
    return 3.5;                    // Deep catacombs
  }

  /**
   * Compute which cardinal edges (N, S, E, W) should have doorway openings.
   * Ensures connectivity between adjacent chunks.
   */
  getConnectivity(cx, cy, cz) {
    const openings = { north: false, south: false, east: false, west: false };

    // North wall (z-): edge key = min(cz, cz-1) paired with cx
    const nHash = Math.sin((cx * 31.7 + cy * 19.3 + Math.min(cz, cz - 1) * 53.1) * 0.7) * 43758.5453;
    openings.north = (nHash - Math.floor(nHash)) < 0.75; // 75% chance of doorway opening

    // South wall (z+): edge key = min(cz, cz+1) paired with cx
    const sHash = Math.sin((cx * 31.7 + cy * 19.3 + Math.min(cz, cz + 1) * 53.1) * 0.7) * 43758.5453;
    openings.south = (sHash - Math.floor(sHash)) < 0.75;

    // West wall (x-): edge key = min(cx, cx-1) paired with cz
    const wHash = Math.sin((Math.min(cx, cx - 1) * 31.7 + cy * 19.3 + cz * 53.1) * 0.7) * 43758.5453;
    openings.west = (wHash - Math.floor(wHash)) < 0.75;

    // East wall (x+): edge key = min(cx, cx+1) paired with cz
    const eHash = Math.sin((Math.min(cx, cx + 1) * 31.7 + cy * 19.3 + cz * 53.1) * 0.7) * 43758.5453;
    openings.east = (eHash - Math.floor(eHash)) < 0.75;

    return openings;
  }

  getChunkCoords(position) {
    return {
      cx: Math.floor(position.x / this.chunkWidth),
      cy: Math.floor(position.y / this.layerHeight),
      cz: Math.floor(position.z / this.chunkDepth)
    };
  }

  update(playerPos) {
    const { cx, cy, cz } = this.getChunkCoords(playerPos);

    if (cx !== this.lastChunkCoords.cx || cy !== this.lastChunkCoords.cy || cz !== this.lastChunkCoords.cz) {
      this.lastChunkCoords = { cx, cy, cz };
      this.streamChunks(cx, cy, cz);
    }

    // Time-sliced chunk building: build up to 2 queued chunks per frame to prevent hitches
    let builtThisFrame = 0;
    while (this.buildQueue.length > 0 && builtThisFrame < 2) {
      const item = this.buildQueue.shift();
      if (!this.loadedChunks.has(item.key)) {
        this._buildAndRegisterChunk(item.cx, item.cy, item.cz, item.key);
        builtThisFrame++;
      }
    }
  }

  _buildAndRegisterChunk(cx, cy, cz, key) {
    const biome = this.selectBiome(cx, cy, cz);
    const roomType = this.getRoomType(cx, cy, cz);
    const roomHeight = this.getRoomHeight(roomType, cy);
    const connectivity = this.getConnectivity(cx, cy, cz);

    const chunk = new Chunk(cx, cy, cz, biome, {
      voxelSize: this.voxelSize,
      gridWidth: this.gridWidth,
      layerHeight: this.layerHeight,
      roomType,
      roomHeight,
      connectivity
    });
    chunk.build(this.scene);
    this.loadedChunks.set(key, chunk);
    this.dirtyCaches = true;
    return chunk;
  }

  streamChunks(centerCx, centerCy, centerCz) {
    const activeKeys = new Set();
    const pending = [];

    for (let dx = -this.radiusH; dx <= this.radiusH; dx++) {
      for (let dz = -this.radiusH; dz <= this.radiusH; dz++) {
        for (let dy = -this.radiusV; dy <= this.radiusV; dy++) {
          const cx = centerCx + dx;
          const cy = centerCy + dy;
          const cz = centerCz + dz;
          const key = `${cx},${cy},${cz}`;
          activeKeys.add(key);

          if (!this.loadedChunks.has(key)) {
            const distSq = dx * dx + dz * dz + dy * dy * 4;
            // Immediate chunk (and its direct vertical neighbors) build synchronously
            if (distSq === 0) {
              this._buildAndRegisterChunk(cx, cy, cz, key);
            } else {
              pending.push({ cx, cy, cz, key, distSq });
            }
          }
        }
      }
    }

    // Sort pending chunks nearest-first so close rooms pop in immediately
    pending.sort((a, b) => a.distSq - b.distSq);
    this.buildQueue = pending;

    // Unload chunks outside radius
    for (const [key, chunk] of this.loadedChunks.entries()) {
      if (!activeKeys.has(key)) {
        chunk.dispose(this.scene);
        this.loadedChunks.delete(key);
        this.dirtyCaches = true;
      }
    }
  }

  /**
   * Spatial Query: Return only destructible meshes within [radiusH, radiusV] chunks of position.
   * Cuts raycast candidate count from ~30,000 down to ~20-80!
   */
  getNearbyDestructibles(position, radiusH = 1, radiusV = 0) {
    const out = this._nearbyDestructibles;
    out.length = 0;

    const ccx = Math.floor(position.x / this.chunkWidth);
    const ccy = Math.floor(position.y / this.layerHeight);
    const ccz = Math.floor(position.z / this.chunkDepth);

    for (let dx = -radiusH; dx <= radiusH; dx++) {
      for (let dz = -radiusH; dz <= radiusH; dz++) {
        for (let dy = -radiusV; dy <= radiusV; dy++) {
          const chunk = this.loadedChunks.get(`${ccx + dx},${ccy + dy},${ccz + dz}`);
          if (!chunk) continue;
          const arr = chunk.destructibleMeshes;
          for (let i = 0; i < arr.length; i++) {
            out.push(arr[i]);
          }
        }
      }
    }

    for (let i = 0; i < this.extraDestructibles.length; i++) {
      out.push(this.extraDestructibles[i]);
    }
    return out;
  }

  /**
   * Spatial Query: Return only collidable AABBs within [radiusH, radiusV] chunks of position.
   */
  getNearbyCollidables(position, radiusH = 1, radiusV = 0) {
    const out = this._nearbyCollidables;
    out.length = 0;

    const ccx = Math.floor(position.x / this.chunkWidth);
    const ccy = Math.floor(position.y / this.layerHeight);
    const ccz = Math.floor(position.z / this.chunkDepth);

    for (let dx = -radiusH; dx <= radiusH; dx++) {
      for (let dz = -radiusH; dz <= radiusH; dz++) {
        for (let dy = -radiusV; dy <= radiusV; dy++) {
          const chunk = this.loadedChunks.get(`${ccx + dx},${ccy + dy},${ccz + dz}`);
          if (!chunk) continue;
          const arr = chunk.collidables;
          for (let i = 0; i < arr.length; i++) {
            out.push(arr[i]);
          }
        }
      }
    }

    for (let i = 0; i < this.extraCollidables.length; i++) {
      out.push(this.extraCollidables[i]);
    }
    return out;
  }

  /**
   * Spatial Query: Return light fixtures within nearby chunks + player beacons.
   */
  getNearbyLightFixtures(position, radiusH = 2, radiusV = 0) {
    const out = this._nearbyLights;
    out.length = 0;

    const ccx = Math.floor(position.x / this.chunkWidth);
    const ccy = Math.floor(position.y / this.layerHeight);
    const ccz = Math.floor(position.z / this.chunkDepth);

    for (let dx = -radiusH; dx <= radiusH; dx++) {
      for (let dz = -radiusH; dz <= radiusH; dz++) {
        for (let dy = -radiusV; dy <= radiusV; dy++) {
          const chunk = this.loadedChunks.get(`${ccx + dx},${ccy + dy},${ccz + dz}`);
          if (!chunk) continue;
          const arr = chunk.lights;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i].alive) out.push(arr[i]);
          }
        }
      }
    }

    for (let i = 0; i < this.extraLights.length; i++) {
      if (this.extraLights[i].alive) out.push(this.extraLights[i]);
    }
    return out;
  }

  rebuildCaches() {
    this.cachedDestructibles = [];
    this.cachedCollidables = [];
    this.cachedLights = [];

    for (const chunk of this.loadedChunks.values()) {
      for (let i = 0; i < chunk.destructibleMeshes.length; i++) {
        this.cachedDestructibles.push(chunk.destructibleMeshes[i]);
      }
      for (let i = 0; i < chunk.collidables.length; i++) {
        this.cachedCollidables.push(chunk.collidables[i]);
      }
      for (let i = 0; i < chunk.lights.length; i++) {
        this.cachedLights.push(chunk.lights[i]);
      }
    }
    for (let i = 0; i < this.extraDestructibles.length; i++) {
      this.cachedDestructibles.push(this.extraDestructibles[i]);
    }
    for (let i = 0; i < this.extraCollidables.length; i++) {
      this.cachedCollidables.push(this.extraCollidables[i]);
    }
    for (let i = 0; i < this.extraLights.length; i++) {
      this.cachedLights.push(this.extraLights[i]);
    }

    this.dirtyCaches = false;
  }

  getDestructibleMeshes() {
    if (this.dirtyCaches) this.rebuildCaches();
    return this.cachedDestructibles;
  }

  getCollidableMeshes() {
    if (this.dirtyCaches) this.rebuildCaches();
    return this.cachedCollidables;
  }

  getLightFixtures() {
    if (this.dirtyCaches) this.rebuildCaches();
    return this.cachedLights;
  }

  getCurrentBiome(position) {
    const { cx, cy, cz } = this.getChunkCoords(position);
    return this.selectBiome(cx, cy, cz);
  }

  removeObject(target) {
    if (!target) return;

    // Handle instanced WorldObject directly
    if (target.instancedMesh) {
      const pos = target.position;
      const { cx, cy, cz } = this.getChunkCoords(pos);
      const chunk = this.loadedChunks.get(`${cx},${cy},${cz}`);
      if (chunk) {
        chunk.removeObject(target);
      } else {
        for (const ch of this.loadedChunks.values()) {
          ch.removeObject(target);
        }
      }
      return;
    }

    const mesh = target.mesh || target;
    const root = mesh.userData?.rootMesh || mesh;
    const meshesToRemove = new Set([mesh, root]);
    if (root.traverse) {
      root.traverse(c => meshesToRemove.add(c));
    }

    // 1. Remove from parent chunk records
    for (const chunk of this.loadedChunks.values()) {
      for (const m of meshesToRemove) {
        chunk.removeObject(m);
      }
    }

    // 2. Remove from player-placed extra lists & legacy caches
    this.extraDestructibles = this.extraDestructibles.filter(m => !meshesToRemove.has(m));
    this.extraCollidables = this.extraCollidables.filter(m => !meshesToRemove.has(m));
    this.extraLights = this.extraLights.filter(f => !meshesToRemove.has(f.mesh));
    this.jumpPads = this.jumpPads.filter(m => !meshesToRemove.has(m));

    this.cachedDestructibles = this.cachedDestructibles.filter(m => !meshesToRemove.has(m));
    this.cachedCollidables = this.cachedCollidables.filter(m => !meshesToRemove.has(m));

    const fIdx = this.cachedLights.findIndex(f => meshesToRemove.has(f.mesh));
    if (fIdx > -1) this.cachedLights.splice(fIdx, 1);

    // 3. Explicitly detach from any parent Group or Scene
    if (root.parent) {
      root.parent.remove(root);
    }
    if (mesh.parent && mesh !== root) {
      mesh.parent.remove(mesh);
    }
    if (this.scene) {
      this.scene.remove(root);
      this.scene.remove(mesh);
    }
  }
}
