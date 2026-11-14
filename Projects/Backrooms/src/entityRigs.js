import * as THREE from 'three';

/**
 * ORGAN_DEFS: Biomechanical & Backrooms entity parts (inspired by ReachForTheBreathingStars).
 * Every part contributes to the entity's total Danger Rating, stats, and silhouette.
 */
export const ORGAN_DEFS = {
  core: {
    id: 'core',
    name: 'Core Thorax',
    desc: 'Root bio-frame anchor. All limbs and sensory organs branch from this hub.',
    shape: 'sphere',
    r: 0.42,
    len: 0.85,
    danger: 6,
    hp: 30,
    speed: 0,
    damage: 4,
    color: 0x3b121c,
    emissive: 0x22040a,
    rough: 0.55,
    metal: 0.12
  },
  limb: {
    id: 'limb',
    name: 'Chitinous Limb Segment',
    desc: 'Long articulated appendage. Increases stride reach and eerie gait sway.',
    shape: 'capsule',
    r: 0.11,
    len: 0.72,
    danger: 3,
    hp: 10,
    speed: 0.35,
    damage: 2,
    color: 0xbcae86,
    emissive: 0x161004,
    rough: 0.4,
    metal: 0.35
  },
  muscle: {
    id: 'muscle',
    name: 'Striated Muscle Bundle',
    desc: 'Dense fibrous mass. Boosts hull resilience and lunging velocity.',
    shape: 'capsule',
    r: 0.19,
    len: 0.52,
    danger: 5,
    hp: 24,
    speed: 0.25,
    damage: 3,
    color: 0x7c1d26,
    emissive: 0x2b050b,
    rough: 0.55,
    metal: 0.08
  },
  bone: {
    id: 'bone',
    name: 'Calcified Bone Anchor',
    desc: 'Heavy calcified strut. Greatly reinforces armor integrity.',
    shape: 'cyl',
    r: 0.10,
    len: 0.68,
    danger: 4,
    hp: 28,
    speed: -0.05,
    damage: 2,
    color: 0xd8d2c5,
    emissive: 0x111111,
    rough: 0.8,
    metal: 0.05
  },
  ocular: {
    id: 'ocular',
    name: 'Ocular Sensor Cluster',
    desc: 'Bioluminescent eye node. Tracks prey through pitch-black shafts.',
    shape: 'sphere',
    r: 0.12,
    len: 0.24,
    danger: 3,
    hp: 6,
    speed: 0.2,
    damage: 1,
    color: 0xff2244,
    emissive: 0xff1133,
    rough: 0.2,
    metal: 0.1,
    glow: true
  },
  claw: {
    id: 'claw',
    name: 'Harvester Claw / Mandible',
    desc: 'Hooked chitinous blade. Inflicts severe tearing damage on barricades & survivors.',
    shape: 'cone',
    r: 0.14,
    len: 0.58,
    danger: 7,
    hp: 8,
    speed: 0.15,
    damage: 7,
    color: 0x4b3b2e,
    emissive: 0x1e0800,
    rough: 0.32,
    metal: 0.58
  },
  tendril: {
    id: 'tendril',
    name: 'Phase Tendril',
    desc: 'Resonant cyan filament that bends around walls and phases through barricades.',
    shape: 'capsule',
    r: 0.075,
    len: 0.85,
    danger: 8,
    hp: 12,
    speed: 0.45,
    damage: 4,
    color: 0x186a85,
    emissive: 0x00d8ff,
    rough: 0.25,
    metal: 0.2,
    glow: true,
    grantsPhase: true
  },
  arccoil: {
    id: 'arccoil',
    name: 'Ballast Arc-Coil',
    desc: 'Overcharged fluorescent organ. Marks apex horrors and drops extra Anomalous Cores.',
    shape: 'cyl',
    r: 0.16,
    len: 0.48,
    danger: 10,
    hp: 35,
    speed: 0.1,
    damage: 6,
    color: 0x621b88,
    emissive: 0xd938ff,
    rough: 0.28,
    metal: 0.72,
    glow: true
  }
};

export const ORGAN_PALETTE = ['limb', 'muscle', 'bone', 'ocular', 'claw', 'tendril', 'arccoil'];

/**
 * Computes total Danger Rating and combat stats from an entity's node list.
 */
export function computeEntityStats(nodes = []) {
  let danger = 0;
  let hp = 15;
  let speed = 2.8;
  let damage = 4;
  let canPhase = false;

  for (const n of nodes) {
    const def = ORGAN_DEFS[n.type] || ORGAN_DEFS.limb;
    const s = n.scale || 1;
    danger += Math.round(def.danger * (0.7 + 0.3 * s));
    hp += Math.round(def.hp * s);
    speed += def.speed;
    damage += Math.round(def.damage * (0.8 + 0.2 * s));
    if (def.grantsPhase) canPhase = true;
  }

  speed = Math.max(1.8, Math.min(6.4, speed));
  const layerBand = computeSpawnLayerBand(danger);
  return { danger, hp, speed, damage, canPhase, ...layerBand };
}

/**
 * Determines which strata depth layers (FL 0 down to FL -N) an entity spawns on.
 * Returns { startDepth, stopDepth, startFloorLabel, stopFloorLabel }.
 * Once player goes deeper than stopDepth, the entity is considered "too safe" and stops spawning.
 */
export function computeSpawnLayerBand(danger) {
  const startDepth = danger <= 20 ? 0 : Math.floor((danger - 16) / 10);
  const endless = danger >= 80;
  const stopDepth = endless ? Infinity : startDepth + 3 + Math.floor(danger / 18);
  const startFloorLabel = startDepth === 0 ? 'FL 0' : `FL -${startDepth}`;
  const stopFloorLabel = endless ? 'ABYSS (∞)' : `FL -${stopDepth}`;
  return { startDepth, stopDepth, startFloorLabel, stopFloorLabel };
}

function createOrganGeometry(def) {
  switch (def.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(def.r, 12, 10);
    case 'capsule': {
      const geo = new THREE.CapsuleGeometry(def.r, Math.max(0.1, def.len - def.r * 2), 6, 10);
      geo.translate(0, def.len * 0.5, 0);
      return geo;
    }
    case 'cyl': {
      const geo = new THREE.CylinderGeometry(def.r, def.r * 0.9, def.len, 10);
      geo.translate(0, def.len * 0.5, 0);
      return geo;
    }
    case 'cone': {
      const geo = new THREE.ConeGeometry(def.r, def.len, 8);
      geo.translate(0, def.len * 0.5, 0);
      return geo;
    }
    default:
      return new THREE.BoxGeometry(def.r * 2, def.len, def.r * 2);
  }
}

const _geoCache = new Map();
const _matCache = new Map();

function getCachedGeo(type) {
  if (!_geoCache.has(type)) {
    const def = ORGAN_DEFS[type] || ORGAN_DEFS.limb;
    _geoCache.set(type, createOrganGeometry(def));
  }
  return _geoCache.get(type);
}

function getCachedMat(type) {
  if (!_matCache.has(type)) {
    const def = ORGAN_DEFS[type] || ORGAN_DEFS.limb;
    const mat = def.glow
      ? new THREE.MeshStandardMaterial({
          color: def.color,
          emissive: def.emissive,
          emissiveIntensity: 1.6,
          roughness: def.rough,
          metalness: def.metal
        })
      : new THREE.MeshStandardMaterial({
          color: def.color,
          emissive: def.emissive,
          emissiveIntensity: 0.25,
          roughness: def.rough,
          metalness: def.metal
        });
    _matCache.set(type, mat);
  }
  return _matCache.get(type);
}

const _up = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/**
 * Builds a hierarchical THREE.Group organ-tree rig from a blueprint's nodes array.
 * Returns { root, joints, meshes } where joints can be procedurally animated.
 */
export function buildOrganEntityRig(blueprint, options = {}) {
  const root = new THREE.Group();
  const nodes = blueprint?.nodes?.length ? blueprint.nodes : [
    { id: 0, parentId: null, type: 'core', pos: [0, 1.3, 0], dir: [0, 1, 0], scale: 1 }
  ];

  const groupById = new Map();
  const joints = [];
  const meshes = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const def = ORGAN_DEFS[node.type] || ORGAN_DEFS.limb;
    const holder = new THREE.Group();

    holder.position.set(node.pos[0], node.pos[1], node.pos[2]);
    if (node.dir) {
      _dirVec.set(node.dir[0], node.dir[1], node.dir[2]).normalize();
      if (_dirVec.lengthSq() > 0.001) {
        _quat.setFromUnitVectors(_up, _dirVec);
        holder.quaternion.copy(_quat);
      }
    }

    const s = node.scale || 1;
    const mesh = new THREE.Mesh(
      options.uniqueMaterials ? createOrganGeometry(def) : getCachedGeo(node.type),
      options.uniqueMaterials ? getCachedMat(node.type).clone() : getCachedMat(node.type)
    );
    mesh.scale.setScalar(s);
    mesh.userData.nodeId = node.id;
    mesh.userData.nodeType = node.type;
    holder.add(mesh);
    meshes.push(mesh);

    const parentGroup = (node.parentId !== null && node.parentId !== undefined && groupById.has(node.parentId))
      ? groupById.get(node.parentId)
      : root;
    parentGroup.add(holder);
    groupById.set(node.id, holder);

    joints.push({
      id: node.id,
      type: node.type,
      holder,
      baseQuat: holder.quaternion.clone(),
      basePos: holder.position.clone(),
      phase: i * 1.15
    });
  }

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const bounds = {
    halfW: Math.max(0.48, Math.min(1.8, Math.max(size.x, size.z) * 0.52)),
    height: Math.max(1.5, size.y)
  };

  return { root, joints, meshes, bounds };
}

/**
 * Drives smooth organic procedural motion across all articulated joints,
 * including attack lunges, hit stagger/flinch, and collapse dying animations.
 */
export function animateOrganEntity(rig, time, moveSpeed = 1.0, state = {}) {
  if (!rig || !rig.joints) return;
  const isAttacking = typeof state === 'boolean' ? state : (state.attackProgress > 0);
  const attackP = typeof state === 'object' ? (state.attackProgress || 0) : (state ? 0.5 : 0);
  const hitP = typeof state === 'object' ? (state.hitProgress || 0) : 0;
  const deathP = typeof state === 'object' ? (state.deathProgress || 0) : 0;

  if (deathP > 0) {
    rig.root.rotation.x = deathP * 1.48;
    rig.root.rotation.z = Math.sin(deathP * 8) * 0.22;
    const shrink = Math.max(0.15, 1 - deathP * 0.55);
    rig.root.scale.set(shrink, shrink, shrink);
  } else {
    const lunge = attackP > 0 ? Math.sin(attackP * Math.PI) * 0.38 : 0;
    const flinch = hitP > 0 ? -Math.sin(hitP * Math.PI) * 0.36 : 0;
    rig.root.rotation.x = lunge + flinch;
    rig.root.rotation.z = hitP > 0 ? (Math.random() - 0.5) * 0.14 : 0;
    rig.root.scale.set(1, 1, 1);
  }

  const stride = time * (3.2 + moveSpeed * 0.7);

  for (let i = 0; i < rig.joints.length; i++) {
    const j = rig.joints[i];
    j.holder.quaternion.copy(j.baseQuat);

    if (deathP > 0) {
      j.holder.rotateX((i % 2 === 0 ? 1 : -1) * deathP * 1.1);
      j.holder.rotateZ((i % 2 === 0 ? -1 : 1) * deathP * 0.85);
      continue;
    }

    if (j.type === 'core') {
      const thrust = attackP > 0 ? Math.sin(attackP * Math.PI) * 0.28 : 0;
      j.holder.position.y = j.basePos.y + Math.sin(stride * 0.8) * 0.06 - hitP * 0.1;
      j.holder.position.z = j.basePos.z + thrust - hitP * 0.14;
      j.holder.rotateZ(Math.sin(stride * 0.5) * 0.06);
    } else if (j.type === 'limb' || j.type === 'bone') {
      const amp = isAttacking ? 0.62 : 0.26;
      const slash = attackP > 0 ? Math.sin(attackP * Math.PI) * 0.55 : 0;
      j.holder.rotateX(Math.sin(stride + j.phase) * amp + slash - hitP * 0.4);
      j.holder.rotateZ(Math.cos(stride * 0.7 + j.phase) * (amp * 0.45));
    } else if (j.type === 'claw') {
      const snap = isAttacking ? Math.sin(attackP * Math.PI * 2) * 0.75 : Math.sin(stride + j.phase) * 0.18;
      j.holder.rotateX(snap);
    } else if (j.type === 'tendril') {
      j.holder.rotateX(Math.sin(time * 4.5 + j.phase) * 0.34);
      j.holder.rotateZ(Math.cos(time * 3.8 + j.phase) * 0.28);
    } else if (j.type === 'arccoil') {
      j.holder.rotateY(time * (isAttacking ? 6.0 : 2.5) + j.phase);
    }
  }
}
