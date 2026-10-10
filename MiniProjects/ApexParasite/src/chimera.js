/**
 * Apex Parasite: Chimera Odyssey - Recursive Node-Socket Organic Engine
 * Supports arbitrary branching: Torsos on Torsos, Forearms on Forearms,
 * multi-skull clusters, limb maturation (XP), mental bandwidth, and Refrain Alchemy Synthesis.
 */

import { RARITY, RARITY_CONFIG, ELEMENTAL_AFFINITY, ABILITIES } from './types.js';

let nodeIdCounter = 1;

export const SOCKET_TYPES = {
  UNIVERSAL: 'universal',       // Accepts any component
  TORSO_JOINT: 'torso_joint',   // Accepts another torso or heavy core
  LIMB_EXT: 'limb_ext',         // Accepts limb segment or terminal weapon
  WEAPON: 'weapon',             // Accepts claws, scythes, stingers, firearms
  CRANIAL: 'cranial',           // Accepts skulls, ocular clusters
  INTERNAL: 'internal'          // Accepts hearts, glands, organs
};

export class BodyPartNode {
  constructor(config = {}) {
    this.id = config.id || `node_${nodeIdCounter++}`;
    this.name = config.name || 'Grafted Biomass';
    this.category = config.category || 'LIMB'; // 'CORE', 'TORSO', 'LIMB', 'WEAPON', 'HEAD', 'INTERNAL', 'GEAR'
    
    // Rarity & Base Multiplier
    this.rarity = config.rarity || RARITY.COMMON;
    this.rarityData = RARITY_CONFIG[this.rarity] || RARITY_CONFIG.common;
    this.element = config.element || ELEMENTAL_AFFINITY.NONE;

    // Combat & Survival Stats
    this.damage = config.damage ?? 0;
    this.defense = config.defense ?? 0;
    this.hpBonus = config.hpBonus ?? 0;
    this.weight = config.weight ?? 1.0; // Adds to chimera total mass
    this.baseCalorieCost = config.calorieCost ?? 0.25; // Calorie drain per step/action
    
    // Mental Bandwidth: Instinctive bio-limbs (0-1), Swords (2), Firearms (5)
    this.bandwidthCost = config.bandwidthCost ?? (this.category === 'WEAPON' ? 1 : 0);
    this.concealmentMod = config.concealmentMod ?? (this.category === 'HEAD' ? -15 : this.category === 'TORSO' ? -25 : -5);

    // Active Ability if present
    this.ability = config.ability || null;

    // Maturation & DCSS Limb Level (Ranks 1 to 10)
    this.level = config.level || 1;
    this.limbXp = config.limbXp || 0;
    this.maxXp = 100;

    // Refrain Alchemy Synthesis reinforcement tracking
    this.synthesisCount = config.synthesisCount || 0;
    this.maxSyntheses = config.maxSyntheses || (this.rarity === RARITY.COMMON ? 3 : this.rarity === RARITY.RARE ? 6 : 10);
    this.bonusModifiers = config.bonusModifiers ? [...config.bonusModifiers] : [];

    // Output Sockets: Array of { socketId, label, type, childNode: null }
    this.sockets = config.sockets ? JSON.parse(JSON.stringify(config.sockets)) : [];

    this.icon = config.icon || '🧬';
    this.description = config.description || 'Mutant organic component.';
  }

  /**
   * Calorie cost scales down by ~5% per limb level as the nervous system adapts (max 45% reduction).
   */
  getEffectiveCalorieCost() {
    const adaptationMod = Math.max(0.55, 1.0 - (this.level - 1) * 0.05);
    return parseFloat((this.baseCalorieCost * adaptationMod).toFixed(2));
  }

  /**
   * Mental bandwidth draw also adapts as motor reflexes mature.
   */
  getEffectiveBandwidth() {
    if (this.bandwidthCost <= 1) return this.bandwidthCost;
    const levelDiscount = Math.floor((this.level - 1) / 3);
    return Math.max(1, this.bandwidthCost - levelDiscount);
  }

  /**
   * Add XP to this limb from combat.
   */
  gainLimbXp(amount) {
    if (this.level >= 10) return false;
    this.limbXp += amount;
    if (this.limbXp >= this.maxXp) {
      this.level++;
      this.limbXp -= this.maxXp;
      this.maxXp = Math.round(this.maxXp * 1.5);
      this.damage = Math.round(this.damage * 1.15);
      this.defense = Math.round(this.defense * 1.15);
      this.hpBonus = Math.round(this.hpBonus * 1.15);
      return true; // Leveled up!
    }
    return false;
  }
}

export class ChimeraTree {
  constructor() {
    // Root Node is the true player: The Worm Core (@)
    this.root = new BodyPartNode({
      id: 'root_worm',
      name: 'Worm Core Nexus',
      category: 'CORE',
      rarity: RARITY.LEGENDARY,
      hpBonus: 50,
      weight: 0.5,
      calorieCost: 0.1,
      bandwidthCost: 0,
      concealmentMod: 0,
      icon: '@',
      description: 'The immortal Worm parasite residing at the center of the organism.',
      sockets: [
        { socketId: 'cranial_1', label: 'Cranial Crest', type: SOCKET_TYPES.CRANIAL, childNode: null },
        { socketId: 'torso_1', label: 'Primary Torso Joint', type: SOCKET_TYPES.TORSO_JOINT, childNode: null },
        { socketId: 'lateral_L', label: 'Left Flank Socket', type: SOCKET_TYPES.UNIVERSAL, childNode: null },
        { socketId: 'lateral_R', label: 'Right Flank Socket', type: SOCKET_TYPES.UNIVERSAL, childNode: null }
      ]
    });
  }

  /**
   * Attach a child part to a specific socket on a parent node anywhere in the tree.
   */
  attachPart(parentId, socketId, childNode) {
    const parent = this.findNode(parentId, this.root);
    if (!parent) return { success: false, reason: 'Parent node not found' };

    const socket = parent.sockets.find(s => s.socketId === socketId);
    if (!socket) return { success: false, reason: 'Socket not found' };

    const displacedPart = socket.childNode || null;
    socket.childNode = childNode;

    return { success: true, displacedPart };
  }

  /**
   * Detach a part and all its children from the tree.
   */
  detachPart(nodeId) {
    if (nodeId === this.root.id) return { success: false, reason: 'Cannot detach Worm Core' };

    const parent = this.findParent(nodeId, this.root);
    if (!parent) return { success: false, reason: 'Node not attached' };

    const socket = parent.sockets.find(s => s.childNode && s.childNode.id === nodeId);
    if (!socket) return { success: false, reason: 'Socket link broken' };

    const detachedNode = socket.childNode;
    socket.childNode = null;

    // Collect all recursive children that come off with it
    const allDetached = this.collectSubtree(detachedNode);
    return { success: true, detachedRoot: detachedNode, allDetached };
  }

  findNode(nodeId, current = this.root) {
    if (current.id === nodeId) return current;
    for (const socket of current.sockets) {
      if (socket.childNode) {
        const found = this.findNode(nodeId, socket.childNode);
        if (found) return found;
      }
    }
    return null;
  }

  findParent(nodeId, current = this.root) {
    for (const socket of current.sockets) {
      if (socket.childNode) {
        if (socket.childNode.id === nodeId) return current;
        const found = this.findParent(nodeId, socket.childNode);
        if (found) return found;
      }
    }
    return null;
  }

  collectSubtree(node) {
    const list = [node];
    for (const s of node.sockets) {
      if (s.childNode) {
        list.push(...this.collectSubtree(s.childNode));
      }
    }
    return list;
  }

  getAllNodes(current = this.root) {
    return this.collectSubtree(current);
  }

  /**
   * Compute cumulative stats across the entire chimera tree.
   */
  computeTotals(modifiers = {}) {
    const all = this.getAllNodes();
    let totalDmg = 6; // Base host strike
    let totalDef = 0;
    let totalHpBonus = 0;
    let totalMass = 0;
    let totalCalorieDrain = 0.3; // Base host metabolism
    let totalBandwidth = 0;
    let concealment = 100; // Starts at 100% human disguise

    let skullCount = 0;
    let weaponCount = 0;
    let torsoCount = 0;
    const abilities = [];

    all.forEach(node => {
      totalDmg += node.damage;
      totalDef += node.defense;
      totalHpBonus += node.hpBonus;
      totalMass += node.weight;
      totalCalorieDrain += node.getEffectiveCalorieCost();
      totalBandwidth += node.getEffectiveBandwidth();
      concealment += node.concealmentMod;

      if (node.category === 'HEAD') skullCount++;
      if (node.category === 'WEAPON') weaponCount++;
      if (node.category === 'TORSO') torsoCount++;
      if (node.ability) abilities.push({ ability: node.ability, node });
    });

    // Modifiers from Roguelite Boons & Skills
    if (modifiers.metabolicEfficiency) {
      totalCalorieDrain *= (1.0 - modifiers.metabolicEfficiency);
    }
    if (modifiers.vascularHpBonus) {
      totalHpBonus += modifiers.vascularHpBonus;
    }

    concealment = Math.max(0, Math.min(100, concealment));
    totalCalorieDrain = Math.max(0.4, parseFloat(totalCalorieDrain.toFixed(2)));

    return {
      partCount: all.length,
      totalDmg,
      totalDef,
      totalHpBonus,
      totalMass: parseFloat(totalMass.toFixed(1)),
      totalCalorieDrain,
      totalBandwidth,
      concealment,
      skullCount,
      weaponCount,
      torsoCount,
      abilities
    };
  }

  /**
   * Identify limbs that are currently under heavy structural strain or low integrity.
   */
  getVulnerableNodes() {
    // Returns nodes that take priority in the minimalist threat HUD
    return this.getAllNodes().filter(n => n.category === 'WEAPON' || n.category === 'TORSO');
  }
}

/**
 * Procedural Factory: Generates branching parts with connection sockets.
 */
export function createOrganNode({
  category = 'LIMB',
  name = '',
  tier = 1,
  rarity = RARITY.COMMON,
  element = ELEMENTAL_AFFINITY.NONE,
  namePrefix = '',
  isHuman = false
}) {
  const rConfig = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
  const mult = rConfig.multiplier;

  let damage = 0;
  let defense = 0;
  let hpBonus = 0;
  let weight = 1.0;
  let calorieCost = parseFloat((0.15 + (tier * 0.08) * mult).toFixed(2));
  let bandwidthCost = 0;
  let concealmentMod = -5;
  let ability = null;
  let icon = '🧬';
  let sockets = [];
  let description = '';

  switch (category) {
    case 'TORSO':
      icon = '🫁';
      name = name || (isHuman ? 'Human Muscular Torso' : 'Chitinous Mantle');
      defense = Math.round(4 * mult);
      hpBonus = Math.round(25 * mult);
      weight = 3.5;
      calorieCost = 0.45;
      concealmentMod = -25;
      description = 'Structural metabolic hub. Provides 4 directional branch sockets.';
      // A torso provides 4 sockets for anything to connect to!
      sockets = [
        { socketId: `top_${nodeIdCounter}`, label: 'Cranial / Neck Socket', type: SOCKET_TYPES.CRANIAL, childNode: null },
        { socketId: `bottom_${nodeIdCounter}`, label: 'Locomotion Base', type: SOCKET_TYPES.UNIVERSAL, childNode: null },
        { socketId: `left_${nodeIdCounter}`, label: 'Left Graft Mount', type: SOCKET_TYPES.UNIVERSAL, childNode: null },
        { socketId: `right_${nodeIdCounter}`, label: 'Right Graft Mount', type: SOCKET_TYPES.UNIVERSAL, childNode: null }
      ];
      break;

    case 'LIMB':
      icon = '🦴';
      name = name || (isHuman ? 'Human Forearm' : 'Chitin Limb Segment');
      damage = Math.round(2 * mult);
      defense = Math.round(1 * mult);
      weight = 1.2;
      concealmentMod = -8;
      description = 'Articulated limb segment. Extends reach and sockets into another limb or terminal weapon.';
      // Chaining: A forearm plugs into parent and provides an extension socket!
      sockets = [
        { socketId: `ext_${nodeIdCounter}`, label: 'Limb Extension / Weapon Socket', type: SOCKET_TYPES.LIMB_EXT, childNode: null }
      ];
      break;

    case 'WEAPON':
      icon = '🦞';
      name = name || (isHuman ? 'Scavenged Iron Blade' : 'Serrate Mandible Scythe');
      damage = Math.round((7 + tier * 3) * mult);
      weight = 2.0;
      bandwidthCost = isHuman ? 2 : 1;
      concealmentMod = -12;
      description = 'Terminal offensive apparatus engineered for deep lacerations.';
      if (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        ability = ABILITIES.BILE_VIVISECT;
        if (element === ELEMENTAL_AFFINITY.FIRE) ability = ABILITIES.PYRE_BURST;
        if (element === ELEMENTAL_AFFINITY.FROST) ability = ABILITIES.FROST_NOVA;
      }
      break;

    case 'HEAD':
      icon = isHuman ? '💀' : '🧠';
      name = name || (isHuman ? 'Human Skull' : 'Sensory Cranium');
      defense = Math.round(2 * mult);
      hpBonus = Math.round(15 * mult);
      weight = 1.8;
      concealmentMod = isHuman ? -10 : -20;
      description = isHuman
        ? 'Severed human skull. Amplifies mental bandwidth and psionic resonance.'
        : 'Compound ocular nexus granting acute tactical trajectory awareness.';
      if (rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        ability = ABILITIES.TERROR_SHRIEK;
      }
      sockets = [
        { socketId: `eye_${nodeIdCounter}`, label: 'Ocular Socket', type: SOCKET_TYPES.INTERNAL, childNode: null }
      ];
      break;

    case 'PROPULSION':
      icon = '🦿';
      name = name || 'Locomotion Pods';
      defense = Math.round(2 * mult);
      hpBonus = Math.round(12 * mult);
      weight = 1.5;
      concealmentMod = -10;
      description = 'Segmented appendages granting evasion and steady traction.';
      break;

    case 'GEAR':
      icon = '🛡️';
      name = name || 'Linen Bandages';
      defense = 2;
      weight = 0.2;
      concealmentMod = +10; // Hides wounds/mutations
      description = 'Sterile cloth wrapped around limbs to arrest bleeding and preserve disguise.';
      break;
  }

  if (namePrefix) name = `${namePrefix} ${name}`;

  return new BodyPartNode({
    category,
    name,
    rarity,
    element,
    damage,
    defense,
    hpBonus,
    weight,
    calorieCost,
    bandwidthCost,
    concealmentMod,
    ability,
    sockets,
    icon,
    description
  });
}

/**
 * Labyrinth of Refrain Alchemy Synthesis (Bio-Crucible)
 * 1 Base Organ + up to 8 Fodder Organs.
 */
export class RefrainAlchemyCrucible {
  static synthesize({ baseNode, fodderNodes = [], bioSlurryAvailable = 100 }) {
    if (!baseNode) return { success: false, reason: 'No base organ selected' };
    if (fodderNodes.length === 0) return { success: false, reason: 'Select at least 1 fodder part' };
    if (fodderNodes.length > 8) return { success: false, reason: 'Maximum 8 fodder parts per synthesis' };

    // Check synthesis cap
    if (baseNode.synthesisCount >= baseNode.maxSyntheses) {
      return { success: false, reason: `Reached maximum synthesis reinforcement cap (${baseNode.maxSyntheses})` };
    }

    // Slurry cost calculation
    const slurryCost = fodderNodes.length * 15;
    if (bioSlurryAvailable < slurryCost) {
      return { success: false, reason: `Insufficient Bio-Slurry (Requires ${slurryCost}, have ${bioSlurryAvailable})` };
    }

    // Stat inheritance with diminishing returns per fodder slot
    let bonusAtk = 0;
    let bonusDef = 0;
    let bonusHp = 0;
    let transferredAffix = null;

    fodderNodes.forEach((fodder, idx) => {
      // Diminishing returns: 1st fodder = 20%, 8th = 5%
      const returnRatio = Math.max(0.05, 0.20 - idx * 0.02);
      const mult = (RARITY_CONFIG[fodder.rarity]?.multiplier || 1.0) * 0.8;

      bonusAtk += Math.round(fodder.damage * returnRatio * mult);
      bonusDef += Math.round(fodder.defense * returnRatio * mult);
      bonusHp += Math.round(fodder.hpBonus * returnRatio * mult);

      // Property transfer chance
      if (!transferredAffix && fodder.ability && Math.random() < 0.35) {
        transferredAffix = fodder.ability;
      }
    });

    // Apply permanent reinforcements to base node
    baseNode.damage += Math.max(1, bonusAtk);
    baseNode.defense += Math.max(0, bonusDef);
    baseNode.hpBonus += Math.max(0, bonusHp);
    baseNode.synthesisCount += 1;

    // Augmented weapon slightly increases calorie burn due to muscle mass
    baseNode.baseCalorieCost = parseFloat((baseNode.baseCalorieCost + 0.05).toFixed(2));

    if (transferredAffix && !baseNode.ability) {
      baseNode.ability = transferredAffix;
    }

    return {
      success: true,
      slurryConsumed: slurryCost,
      gainedAtk: bonusAtk,
      gainedDef: bonusDef,
      gainedHp: bonusHp,
      transferredAffix,
      newTotalDmg: baseNode.damage
    };
  }
}
