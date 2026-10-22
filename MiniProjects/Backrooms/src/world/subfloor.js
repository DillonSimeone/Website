import * as THREE from 'three';

/**
 * WorldObject: Base class for all destructible spatial elements.
 * Tracks durability, hardness tier, loot drops, and Three.js mesh linkage.
 */
export class WorldObject {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.type = options.type || 'object';
    this.title = options.title || 'Structural Element';
    this.hp = options.hp ?? 30;
    this.maxHp = this.hp;
    this.hardness = options.hardness ?? 1.0;
    this.requiredTier = options.requiredTier ?? 0;
    this.xp = options.xp ?? 10;
    this.drops = options.drops || {};
    this.isWall = options.isWall ?? false;
    this.isLight = options.isLight ?? false;

    // Attach reference back to the Three.js mesh for raycaster resolution
    if (this.mesh) {
      this.mesh.userData.worldObject = this;
      this.mesh.userData.rootMesh = this.mesh;
      this.mesh.userData.hp = this.hp;
      this.mesh.userData.maxHp = this.maxHp;
      this.mesh.userData.title = this.title;
      this.mesh.userData.type = this.type;

      this.mesh.traverse(child => {
        if (child.isMesh) {
          child.userData.worldObject = this;
          child.userData.rootMesh = this.mesh;
          child.userData.hp = this.hp;
          child.userData.maxHp = this.maxHp;
          child.userData.title = this.title;
          child.userData.type = this.type;
        }
      });
    }
  }

  damage(amount) {
    const effectiveDamage = amount / this.hardness;
    this.hp = Math.max(0, this.hp - effectiveDamage);

    if (this.mesh) {
      this.mesh.userData.hp = this.hp;
      this.mesh.traverse(child => {
        if (child.isMesh) {
          child.userData.hp = this.hp;
        }
      });
    }

    return this.hp <= 0;
  }

  getDrops() {
    return { ...this.drops };
  }

  destroy(scene) {
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      });
      // Remove cleanly from parent group (e.g. Chunk.group)
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      // Also remove from scene if attached directly
      if (scene) {
        scene.remove(this.mesh);
      }
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      this.mesh = null;
    }
  }
}

/**
 * Floor: Walking surface (carpet, tile, concrete).
 * When broken, exposes SubFloor joists underneath.
 */
export class Floor extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'floor',
      title: options.title || 'Floor Segment',
      hp: options.hp ?? 22,
      hardness: options.hardness ?? 1.0,
      xp: options.xp ?? 8,
      drops: options.drops || { fiber: 3, wood: 1 },
      isWall: false
    });
  }
}

/**
 * SubFloor: Structural framing joists & underlayment beneath floor tiles.
 * Breaking this opens a direct downward drop into the lower level (Y-1).
 */
export class SubFloor extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'subfloor',
      title: options.title || 'Sub-Floor Timber Joist',
      hp: options.hp ?? 35,
      hardness: options.hardness ?? 1.4,
      xp: options.xp ?? 12,
      drops: options.drops || { wood: 3, scrap: 1 },
      isWall: false
    });
  }
}

/**
 * Wall: Modular partition voxel segment.
 * Breaks cleanly into plaster and structural studs when depleted.
 */
export class Wall extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'wall',
      title: options.title || 'Drywall Partition Voxel',
      hp: options.hp ?? 28,
      hardness: options.hardness ?? 1.0,
      xp: options.xp ?? 10,
      drops: options.drops || { drywall: 4, wood: 2 },
      isWall: true
    });
  }
}

/**
 * Pillar: Heavy structural column voxel (reinforced concrete / heavy timber).
 */
export class Pillar extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'wall',
      title: options.title || 'Structural Column',
      hp: options.hp ?? 50,
      hardness: options.hardness ?? 1.6,
      xp: options.xp ?? 16,
      drops: options.drops || { drywall: 3, wood: 4, rebar: 2 },
      isWall: true
    });
  }
}

/**
 * Ceiling: Acoustic drop tile or ceiling slab.
 * When broken, exposes overhead Crawlspace sub-ceiling and utility plenum.
 */
export class Ceiling extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'ceiling',
      title: options.title || 'Acoustic Ceiling Tile',
      hp: options.hp ?? 18,
      hardness: options.hardness ?? 0.8,
      xp: options.xp ?? 6,
      drops: options.drops || { drywall: 2, wood: 1 },
      isWall: false
    });
  }
}

/**
 * SubCeiling: Upper crawlspace mechanical plenum & rafters.
 * Breaking opens an ascent into the level above (Y+1).
 */
export class SubCeiling extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'subceiling',
      title: options.title || 'Structural Rafter Beam',
      hp: options.hp ?? 32,
      hardness: options.hardness ?? 1.3,
      xp: options.xp ?? 10,
      drops: options.drops || { wood: 2, scrap: 2 },
      isWall: false
    });
  }
}

/**
 * WaterBlock: Wading water voxel (Poolrooms).
 */
export class WaterBlock extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'floor',
      title: options.title || 'Wading Pool Basin',
      hp: options.hp ?? 16,
      hardness: options.hardness ?? 0.7,
      xp: options.xp ?? 8,
      drops: options.drops || { ceramic: 3, pvc: 2 },
      isWall: false
    });
  }
}

/**
 * Fixture: Fluorescent troffer or luminaire.
 * Destroys emitting PointLight cleanly and cuts local illumination.
 */
export class Fixture extends WorldObject {
  constructor(mesh, light, options = {}) {
    super(mesh, {
      type: 'fixture',
      title: options.title || 'Fluorescent Troffer Fixture',
      hp: options.hp ?? 26,
      hardness: options.hardness ?? 1.1,
      xp: options.xp ?? 18,
      drops: options.drops || { copper: 3, ballast: 2 },
      isLight: true,
      isWall: false
    });
    this.light = light;
    this.baseIntensity = light ? light.intensity : 1.8;
    this.alive = true;
  }

  destroy(scene) {
    this.alive = false;
    if (this.light) {
      if (this.light.parent) {
        this.light.parent.remove(this.light);
      }
      if (scene) {
        scene.remove(this.light);
      }
      if (this.light.dispose) this.light.dispose();
      this.light = null;
    }
    super.destroy(scene);
  }
}

/**
 * Scaffolding: Climbable modular wooden tower block.
 * Allows player to scale high vertical vaulted chambers to harvest suspended fixtures.
 */
export class Scaffolding extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      type: 'scaffolding',
      title: options.title || 'Modular Scaffolding Tower',
      hp: options.hp ?? 40,
      hardness: options.hardness ?? 1.0,
      xp: options.xp ?? 10,
      drops: options.drops || { wood: 4 },
      isWall: false
    });
    this.isScaffolding = true;
  }
}
