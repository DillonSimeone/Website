/**
 * Apex Parasite - Pure Typed-Array ECS Engine
 * Zero-garbage collection ECS storing all components in pre-allocated TypedArrays.
 * Enables instant flat serialization and O(1) component access.
 */

import { ECS_COMPONENTS } from './types.js';

export class ECSWorld {
  constructor(maxEntities = 512) {
    this.maxEntities = maxEntities;
    this.entityCount = 0;
    
    // Free list for entity recycling
    this.freeList = [];
    for (let i = maxEntities - 1; i >= 1; i--) {
      this.freeList.push(i);
    }

    // Component Bitmasks
    this.masks = new Uint32Array(maxEntities);

    // Position Component
    this.posX = new Int16Array(maxEntities);
    this.posY = new Int16Array(maxEntities);

    // Render Component
    this.glyph = new Uint16Array(maxEntities);
    this.fgR = new Float32Array(maxEntities);
    this.fgG = new Float32Array(maxEntities);
    this.fgB = new Float32Array(maxEntities);
    this.fgA = new Float32Array(maxEntities);
    this.bgR = new Float32Array(maxEntities);
    this.bgG = new Float32Array(maxEntities);
    this.bgB = new Float32Array(maxEntities);
    this.bgA = new Float32Array(maxEntities);
    this.layer = new Uint8Array(maxEntities); // 0=floor/wall, 1=corpse/loot, 2=creature

    // Stats Component
    this.hp = new Float32Array(maxEntities);
    this.maxHp = new Float32Array(maxEntities);
    this.calories = new Float32Array(maxEntities);
    this.maxCalories = new Float32Array(maxEntities);
    this.speed = new Float32Array(maxEntities);
    this.isAlive = new Uint8Array(maxEntities);

    // Status Effects Component
    this.sepsis = new Uint8Array(maxEntities);
    this.sepsisTurns = new Int16Array(maxEntities);
    this.stunTurns = new Int16Array(maxEntities);
    this.frozenTurns = new Int16Array(maxEntities);
    this.burnTurns = new Int16Array(maxEntities);

    // Host Identity Component
    this.hostType = new Uint8Array(maxEntities);
    this.hostTier = new Uint8Array(maxEntities);
    this.threatYield = new Float32Array(maxEntities);

    // AI Controller Component
    this.aiState = new Uint8Array(maxEntities); // 0: Idle/Wander, 1: Hunt, 2: Flee
    this.aiTarget = new Int16Array(maxEntities);

    // Entity Names and Anatomy References (Stored by entity ID index)
    this.names = new Array(maxEntities).fill('');
    this.anatomyMap = new Array(maxEntities).fill(null);
    this.droppedLoot = new Array(maxEntities).fill(null);
  }

  createEntity() {
    if (this.freeList.length === 0) {
      console.warn('ECS: Max entities reached!');
      return -1;
    }
    const id = this.freeList.pop();
    this.masks[id] = ECS_COMPONENTS.NONE;
    this.isAlive[id] = 1;
    this.entityCount++;
    return id;
  }

  destroyEntity(id) {
    if (id <= 0 || id >= this.maxEntities) return;
    this.masks[id] = ECS_COMPONENTS.NONE;
    this.isAlive[id] = 0;
    this.anatomyMap[id] = null;
    this.droppedLoot[id] = null;
    this.names[id] = '';
    this.freeList.push(id);
    this.entityCount--;
  }

  hasComponent(id, componentFlag) {
    return (this.masks[id] & componentFlag) === componentFlag;
  }

  addComponent(id, componentFlag) {
    this.masks[id] |= componentFlag;
  }

  removeComponent(id, componentFlag) {
    this.masks[id] &= ~componentFlag;
  }

  /**
   * Fast query for all active entities possessing all given component bitflags.
   * @param {number} requiredMask Bitwise OR of required ECS_COMPONENTS
   * @returns {number[]} Array of matching entity IDs
   */
  query(requiredMask) {
    const results = [];
    for (let id = 1; id < this.maxEntities; id++) {
      if ((this.masks[id] & requiredMask) === requiredMask) {
        results.push(id);
      }
    }
    return results;
  }

  /**
   * Find first entity at a given grid tile.
   * @param {number} x 
   * @param {number} y 
   * @param {number} layer Optional layer filter
   * @returns {number} entity ID or -1
   */
  getEntityAt(x, y, layer = null) {
    for (let id = 1; id < this.maxEntities; id++) {
      if (this.hasComponent(id, ECS_COMPONENTS.POSITION)) {
        if (this.posX[id] === x && this.posY[id] === y) {
          if (layer === null || (this.hasComponent(id, ECS_COMPONENTS.RENDER) && this.layer[id] === layer)) {
            return id;
          }
        }
      }
    }
    return -1;
  }
}
