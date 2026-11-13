import * as THREE from 'three';

const _hiddenMatrix = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -99999, 0),
  new THREE.Quaternion(),
  new THREE.Vector3(0.0001, 0.0001, 0.0001)
);

/**
 * WorldObject: Base class for all destructible spatial elements.
 * Supports both standalone THREE.Mesh and batched THREE.InstancedMesh entries.
 */
export class WorldObject {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.instancedMesh = options.instancedMesh || null;
    this.instanceId = options.instanceId !== undefined ? options.instanceId : -1;
    this.position = options.position
      ? options.position.clone()
      : (mesh ? mesh.position.clone() : new THREE.Vector3());
    this.bbox = options.bbox || null;

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
    this.requiresExplosive = options.requiresExplosive ?? false;
    this.destroyed = false;

    if (this.instancedMesh) {
      if (!this.instancedMesh.userData.instances) {
        this.instancedMesh.userData.instances = [];
      }
      this.instancedMesh.userData.instances[this.instanceId] = this;
    } else if (this.mesh) {
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
    if (this.destroyed) return false;
    const effectiveDamage = amount / this.hardness;
    this.hp = Math.max(0, this.hp - effectiveDamage);

    if (!this.instancedMesh && this.mesh) {
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
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.instancedMesh && this.instanceId >= 0) {
      this.instancedMesh.setMatrixAt(this.instanceId, _hiddenMatrix);
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedMesh.userData.instances) {
        this.instancedMesh.userData.instances[this.instanceId] = null;
      }
      return;
    }

    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child.isMesh && child.geometry && !child.geometry.userData?.isShared) {
          child.geometry.dispose();
        }
      });
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      if (scene) {
        scene.remove(this.mesh);
      }
      if (this.mesh.geometry && !this.mesh.geometry.userData?.isShared) {
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
      ...options,
      type: 'floor',
      title: options.title || 'Floor Segment',
      hp: options.hp ?? 22,
      hardness: options.hardness ?? 1.0,
      xp: options.xp ?? 8,
      drops: options.drops || { fiber: 3, wood: 1 },
      isWall: false,
      requiresExplosive: options.requiresExplosive ?? true
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
      ...options,
      type: 'subfloor',
      title: options.title || 'Sub-Floor Timber Joist',
      hp: options.hp ?? 35,
      hardness: options.hardness ?? 1.4,
      xp: options.xp ?? 12,
      drops: options.drops || { wood: 3, scrap: 1 },
      isWall: false,
      requiresExplosive: options.requiresExplosive ?? true
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
      ...options,
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
      ...options,
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
      ...options,
      type: 'ceiling',
      title: options.title || 'Acoustic Ceiling Tile',
      hp: options.hp ?? 18,
      hardness: options.hardness ?? 0.8,
      xp: options.xp ?? 6,
      drops: options.drops || { drywall: 2, wood: 1 },
      isWall: false,
      requiresExplosive: options.requiresExplosive ?? true
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
      ...options,
      type: 'subceiling',
      title: options.title || 'Structural Rafter Beam',
      hp: options.hp ?? 32,
      hardness: options.hardness ?? 1.3,
      xp: options.xp ?? 10,
      drops: options.drops || { wood: 2, scrap: 2 },
      isWall: false,
      requiresExplosive: options.requiresExplosive ?? true
    });
  }
}

/**
 * WaterBlock: Wading water voxel (Poolrooms).
 */
export class WaterBlock extends WorldObject {
  constructor(mesh, options = {}) {
    super(mesh, {
      ...options,
      type: 'floor',
      title: options.title || 'Wading Pool Basin',
      hp: options.hp ?? 16,
      hardness: options.hardness ?? 0.7,
      xp: options.xp ?? 8,
      drops: options.drops || { ceramic: 3, pvc: 2 },
      isWall: false,
      requiresExplosive: options.requiresExplosive ?? true
    });
  }
}

/**
 * Fixture: Fluorescent troffer or luminaire.
 * Uses the global pooled PointLight system via lightweight descriptors.
 */
export class Fixture extends WorldObject {
  constructor(mesh, lightConfig, options = {}) {
    super(mesh, {
      ...options,
      type: 'fixture',
      title: options.title || 'Fluorescent Troffer Fixture',
      hp: options.hp ?? 26,
      hardness: options.hardness ?? 1.1,
      xp: options.xp ?? 18,
      drops: options.drops || { copper: 3, ballast: 2 },
      isLight: true,
      isWall: false
    });
    this.lightConfig = lightConfig || { color: 0xfff5bf, intensity: 1.8, distance: 12, decay: 1.2 };
    this.baseIntensity = this.lightConfig.intensity;
    this.lightPos = options.lightPos || this.position.clone().add(new THREE.Vector3(0, -0.25, 0));
    this.alive = true;
  }

  destroy(scene) {
    this.alive = false;
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
      ...options,
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
