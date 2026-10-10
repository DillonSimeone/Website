/**
 * Apex Parasite - Modular Organ & Spaceship-Style Chassis Engine
 * Hardpoints (Cranial Bridge, Thoracic Reactor, Weapon Bays, Propulsion, Carapace)
 * and Sub-Sockets (Internal Visceral Bays & Infusion Sockets on Rare+ parts).
 */

import { ELEMENTAL_AFFINITY, RARITY, RARITY_CONFIG, CHASSIS_HARDPOINTS, MODULE_CATEGORIES, ABILITIES } from './types.js';

let organIdCounter = 1;

export class Organ {
  constructor(config = {}) {
    this.id = config.id || `org_${organIdCounter++}`;
    this.name = config.name || 'Fleshy Biomass';
    this.category = config.category || 'REACTOR'; // WEAPON, REACTOR, CARAPACE, NEURAL, PROPULSION, INTERNAL_MOD
    this.region = config.region || 'torso'; // 'head', 'torso', 'arm_left', 'arm_right', 'legs', 'dorsal', 'internal'
    
    // Rarity Tier (common, uncommon, rare, epic, legendary)
    this.rarity = config.rarity || RARITY.COMMON;
    this.rarityData = RARITY_CONFIG[this.rarity] || RARITY_CONFIG.common;
    this.element = config.element || ELEMENTAL_AFFINITY.NONE;

    // Core Combat & Survival Stats
    this.damage = config.damage ?? 0;
    this.defense = config.defense ?? 0;
    this.hpBonus = config.hpBonus ?? 0;
    this.calorieConsumption = config.calorieConsumption ?? 0.3; // Calorie drain per turn
    this.photosynthesis = config.photosynthesis ?? 0; // Calorie reduction %

    // Active Ability attached to Rare / Epic / Legendary parts
    this.ability = config.ability || null;

    // Actual Mod Sockets (Sub-bays) provided by this organ for Internal Mods
    this.modSockets = config.modSockets ?? 0; // Number of slots (0 to 3)
    this.installedMods = Array.isArray(config.installedMods) ? [...config.installedMods] : [];

    this.icon = config.icon || MODULE_CATEGORIES[this.category]?.icon || '🧬';
    this.description = config.description || 'Biological chassis component.';
  }

  getOpenModSocketsCount() {
    return Math.max(0, this.modSockets - this.installedMods.filter(Boolean).length);
  }
}

export class GridAnatomy {
  constructor() {
    // Modular Chassis Hardpoints
    this.slots = {
      head: null,       // Cranial Bridge
      torso: null,      // Thoracic Reactor Core
      arm_left: null,   // Primary Weapon Bay (Left)
      arm_right: null,  // Secondary Weapon Bay (Right)
      dorsal: null,     // Carapace & Dorsal Rig
      legs: null        // Propulsion Array
    };
  }

  /**
   * Equips a primary organ into a chassis hardpoint.
   * Returns { unequippedOrgan, displacedMods }
   */
  equip(hardpointKey, organ) {
    if (!this.slots.hasOwnProperty(hardpointKey)) {
      console.warn(`Invalid hardpointKey: ${hardpointKey}`);
      return { unequippedOrgan: null, displacedMods: [] };
    }

    const prev = this.slots[hardpointKey];
    let displacedMods = [];

    if (prev && prev.installedMods && prev.installedMods.length > 0) {
      displacedMods = prev.installedMods.filter(Boolean);
      prev.installedMods = [];
    }

    this.slots[hardpointKey] = organ;
    return { unequippedOrgan: prev, displacedMods };
  }

  /**
   * Unequips a primary organ from a chassis hardpoint.
   * Returns { unequippedOrgan, displacedMods }
   */
  unequip(hardpointKey) {
    const organ = this.slots[hardpointKey] || null;
    let displacedMods = [];

    if (organ) {
      if (organ.installedMods && organ.installedMods.length > 0) {
        displacedMods = organ.installedMods.filter(Boolean);
        organ.installedMods = [];
      }
      this.slots[hardpointKey] = null;
    }

    return { unequippedOrgan: organ, displacedMods };
  }

  /**
   * Installs an internal module into a primary organ's mod socket.
   */
  installMod(hardpointKey, socketIndex, modOrgan) {
    const parent = this.slots[hardpointKey];
    if (!parent) return null;
    if (socketIndex < 0 || socketIndex >= parent.modSockets) return null;

    const previousMod = parent.installedMods[socketIndex] || null;
    parent.installedMods[socketIndex] = modOrgan;
    return previousMod;
  }

  /**
   * Uninstalls an internal module from a primary organ's mod socket.
   */
  uninstallMod(hardpointKey, socketIndex) {
    const parent = this.slots[hardpointKey];
    if (!parent || !parent.installedMods) return null;

    const removed = parent.installedMods[socketIndex] || null;
    parent.installedMods[socketIndex] = null;
    return removed;
  }

  /**
   * Returns all equipped items: primary chassis parts and installed sub-mods.
   */
  getAllEquipped() {
    const list = [];
    for (const [key, organ] of Object.entries(this.slots)) {
      if (organ) {
        list.push({ hardpointKey: key, organ, isMod: false });
        if (organ.installedMods && organ.installedMods.length > 0) {
          organ.installedMods.forEach((mod, idx) => {
            if (mod) {
              list.push({
                hardpointKey: key,
                organ: mod,
                isMod: true,
                parentHardpoint: key,
                socketIndex: idx
              });
            }
          });
        }
      }
    }
    return list;
  }

  /**
   * Returns all active abilities from primary parts and installed mods.
   */
  getEquippedAbilities() {
    const abilities = [];
    for (const item of this.getAllEquipped()) {
      if (item.organ.ability) {
        abilities.push({
          ability: item.organ.ability,
          organ: item.organ,
          hardpointKey: item.hardpointKey,
          isMod: item.isMod
        });
      }
    }
    return abilities;
  }

  /**
   * Computes calorie drain per turn factoring photosynthesis.
   */
  computeCalorieDrain(wormMeta, isSepsis = false) {
    const equipped = this.getAllEquipped();
    let sumCalories = 0.4; // Base host metabolism
    let totalPhotosynthesis = 0;

    for (const item of equipped) {
      sumCalories += item.organ.calorieConsumption || 0.1;
      if (item.organ.element === ELEMENTAL_AFFINITY.PLANT) {
        totalPhotosynthesis += item.organ.photosynthesis || 0.2;
      }
    }

    totalPhotosynthesis = Math.min(0.65, totalPhotosynthesis);
    const metaMod = Math.max(0.5, 1.0 - (wormMeta?.metabolicEfficiency || 1) * 0.1);
    const sepsisMod = isSepsis ? 1.8 : 1.0;

    return Math.max(0.3, parseFloat((sumCalories * (1.0 - totalPhotosynthesis) * metaMod * sepsisMod).toFixed(1)));
  }

  /**
   * Computes neural complexity score.
   */
  computeNeuralComplexity() {
    const equipped = this.getAllEquipped();
    if (equipped.length === 0) return 0;

    let sumRarity = 0;
    for (const item of equipped) {
      sumRarity += item.organ.rarityData?.multiplier || 1.0;
    }

    return Math.round(equipped.length * sumRarity);
  }

  /**
   * Computes combined combat profile across all chassis parts and internal mods.
   */
  computeStats() {
    const profile = {
      damage: 6, // Base host strike
      defense: 0,
      hpBonus: 0,
      fireCount: 0,
      frostCount: 0,
      plantCount: 0,
      necroticCount: 0,
      totalModSockets: 0,
      installedModsCount: 0
    };

    for (const [key, organ] of Object.entries(this.slots)) {
      if (organ) {
        profile.damage += organ.damage;
        profile.defense += organ.defense;
        profile.hpBonus += organ.hpBonus;
        profile.totalModSockets += organ.modSockets || 0;

        if (organ.element === ELEMENTAL_AFFINITY.FIRE) profile.fireCount++;
        if (organ.element === ELEMENTAL_AFFINITY.FROST) profile.frostCount++;
        if (organ.element === ELEMENTAL_AFFINITY.PLANT) profile.plantCount++;
        if (organ.element === ELEMENTAL_AFFINITY.NECROTIC) profile.necroticCount++;

        // Add stats from installed sub-mods
        if (organ.installedMods && organ.installedMods.length > 0) {
          organ.installedMods.forEach(mod => {
            if (mod) {
              profile.installedModsCount++;
              profile.damage += mod.damage;
              profile.defense += mod.defense;
              profile.hpBonus += mod.hpBonus;

              if (mod.element === ELEMENTAL_AFFINITY.FIRE) profile.fireCount++;
              if (mod.element === ELEMENTAL_AFFINITY.FROST) profile.frostCount++;
              if (mod.element === ELEMENTAL_AFFINITY.PLANT) profile.plantCount++;
              if (mod.element === ELEMENTAL_AFFINITY.NECROTIC) profile.necroticCount++;
            }
          });
        }
      }
    }

    // Fire affinity grants +20% bonus attack per fire part/mod
    if (profile.fireCount > 0) {
      profile.damage = Math.round(profile.damage * (1 + profile.fireCount * 0.2));
    }

    return profile;
  }
}

/**
 * Procedural Organ & Module Factory
 */
export function generateProceduralOrgan({
  region = 'arm_left',
  category = null,
  rarity = RARITY.COMMON,
  element = ELEMENTAL_AFFINITY.NONE,
  tier = 1,
  namePrefix = '',
  isMod = false
}) {
  const rConfig = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
  const mult = rConfig.multiplier;

  let damage = 0;
  let defense = 0;
  let hpBonus = 0;
  let calorieCost = parseFloat((0.2 + (tier * 0.08) * mult).toFixed(2));
  let name = '';
  let description = '';
  let ability = null;
  let modSockets = 0;
  let icon = '🧬';
  let cat = category;

  if (isMod) {
    // Generate Internal Mod / Visceral Shard
    cat = 'INTERNAL_MOD';
    region = 'internal';
    const modTypes = [
      { name: 'Adrenal Pump', icon: '⚡', dmg: 5, def: 0, hp: 0, desc: 'Floods muscles with neuro-adrenaline (+5 ATK).' },
      { name: 'Corrosive Bile Gland', icon: '🧪', dmg: 7, def: 0, hp: 0, element: ELEMENTAL_AFFINITY.NECROTIC, desc: 'Acid secretions burning through enemy armor (+7 ATK).' },
      { name: 'Symbiotic Spore Pod', icon: '🌿', dmg: 0, def: 0, hp: 25, photo: 0.35, element: ELEMENTAL_AFFINITY.PLANT, desc: 'Photosynthetic spores (+25 HP, -35% Calorie burn).' },
      { name: 'Cryo-Resonator Shard', icon: '❄️', dmg: 0, def: 4, hp: 0, element: ELEMENTAL_AFFINITY.FROST, desc: 'Radiates a sub-zero dampening field (+4 Armor).' },
      { name: 'Hardened Chitin Weave', icon: '🛡️', dmg: 0, def: 5, hp: 15, desc: 'Dense bio-ceramic internal mesh (+5 Armor, +15 HP).' }
    ];

    const pick = modTypes[Math.floor(Math.random() * modTypes.length)];
    name = pick.name;
    icon = pick.icon;
    damage = Math.round(pick.dmg * mult);
    defense = Math.round(pick.def * mult);
    hpBonus = Math.round(pick.hp * mult);
    description = pick.desc;
    calorieCost = 0.1;
    if (pick.element) element = pick.element;

    if (rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
      if (element === ELEMENTAL_AFFINITY.FIRE) ability = ABILITIES.PYRE_BURST;
      else if (element === ELEMENTAL_AFFINITY.FROST) ability = ABILITIES.FROST_NOVA;
      else if (element === ELEMENTAL_AFFINITY.PLANT) ability = ABILITIES.SPORE_HEAL;
    }

    return new Organ({
      name: namePrefix ? `${namePrefix} ${name}` : name,
      category: cat,
      region,
      rarity,
      element,
      damage,
      defense,
      hpBonus,
      calorieConsumption: calorieCost,
      ability,
      modSockets: 0,
      icon,
      description
    });
  }

  // Primary Chassis Component
  switch (region) {
    case 'head':
      cat = 'NEURAL';
      icon = '🧠';
      name = 'Sensory Cranium';
      defense = Math.round(1 * mult);
      hpBonus = Math.round(10 * mult);
      description = 'Ocular nerve nexus granting acute tactical awareness.';
      if (rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        ability = ABILITIES.TERROR_SHRIEK;
        modSockets = 1;
      }
      break;

    case 'torso':
      cat = 'REACTOR';
      icon = '🫁';
      name = 'Thoracic Reactor';
      defense = Math.round(3 * mult);
      hpBonus = Math.round(20 * mult);
      description = 'Central metabolic furnace powering biological weapons.';
      // Real mod sockets on Cores:
      if (rarity === RARITY.UNCOMMON) modSockets = 1;
      else if (rarity === RARITY.RARE) modSockets = 2;
      else if (rarity === RARITY.EPIC) modSockets = 2;
      else if (rarity === RARITY.LEGENDARY) modSockets = 3;
      break;

    case 'arm_left':
      cat = 'WEAPON';
      icon = '🦞';
      name = 'Serrate Mandible Claw';
      damage = Math.round((5 + tier * 2) * mult);
      description = 'Razor bone appendages engineered for rapid limb severing.';
      if (rarity === RARITY.UNCOMMON || rarity === RARITY.RARE) {
        ability = ABILITIES.BILE_VIVISECT;
      }
      if (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        modSockets = 1; // Infusion Socket
      }
      break;

    case 'arm_right':
      cat = 'WEAPON';
      icon = '🔪';
      name = 'Chitin Stinger';
      damage = Math.round((6 + tier * 2) * mult);
      description = 'Hardened spur engineered for penetrating internal defenses.';
      if (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        modSockets = 1; // Infusion Socket
      }
      break;

    case 'legs':
      cat = 'PROPULSION';
      icon = '🦿';
      name = 'Locomotion Pods';
      defense = Math.round(2 * mult);
      hpBonus = Math.round(15 * mult);
      description = 'Segmented centipede limbs granting traction over gore.';
      if (rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        modSockets = 1;
      }
      break;

    case 'dorsal':
      cat = 'CARAPACE';
      icon = '🛡️';
      name = 'Spinal Carapace';
      defense = Math.round(4 * mult);
      hpBonus = Math.round(10 * mult);
      description = 'Hardened dorsal plates reinforcing central nervous chord.';
      if (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY) {
        modSockets = 1; // Dorsal Vent Socket
      }
      break;
  }

  // Elemental Affiliation & Active Abilities
  if (element === ELEMENTAL_AFFINITY.FIRE) {
    name = `Pyro-${name}`;
    damage += Math.round(3 * mult);
    if (!ability && (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY)) {
      ability = ABILITIES.PYRE_BURST;
    }
  } else if (element === ELEMENTAL_AFFINITY.FROST) {
    name = `Cryo-${name}`;
    defense += Math.round(2 * mult);
    if (!ability && (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY)) {
      ability = ABILITIES.FROST_NOVA;
    }
  } else if (element === ELEMENTAL_AFFINITY.PLANT) {
    name = `Floral ${name}`;
    calorieCost = Math.max(0.1, parseFloat((calorieCost * 0.5).toFixed(2)));
    hpBonus += 15;
    if (!ability && (rarity === RARITY.RARE || rarity === RARITY.EPIC || rarity === RARITY.LEGENDARY)) {
      ability = ABILITIES.SPORE_HEAL;
    }
  } else if (element === ELEMENTAL_AFFINITY.NECROTIC) {
    name = `Necrotic ${name}`;
    damage += Math.round(2 * mult);
  }

  if (namePrefix) {
    name = `${namePrefix} ${name}`;
  }

  return new Organ({
    name,
    category: cat,
    region,
    rarity,
    element,
    damage,
    defense,
    hpBonus,
    calorieConsumption: calorieCost,
    ability,
    modSockets,
    icon,
    description
  });
}

/**
 * Bio-Fusion: Fuses two organs into an upgraded rarity tier hybrid
 */
export function fuseOrgans(organA, organB) {
  const rarities = [RARITY.COMMON, RARITY.UNCOMMON, RARITY.RARE, RARITY.EPIC, RARITY.LEGENDARY];
  const idxA = rarities.indexOf(organA.rarity);
  const idxB = rarities.indexOf(organB.rarity);
  const newRarityIdx = Math.min(rarities.length - 1, Math.max(idxA, idxB) + 1);
  const newRarity = rarities[newRarityIdx];

  // Element blend
  let mergedElement = ELEMENTAL_AFFINITY.NONE;
  if (organA.element === organB.element && organA.element !== ELEMENTAL_AFFINITY.NONE) {
    mergedElement = organA.element;
  } else if (organA.element !== ELEMENTAL_AFFINITY.NONE) {
    mergedElement = organA.element;
  } else {
    mergedElement = organB.element;
  }

  const nameParts = [
    organA.name.split(' ')[0],
    organB.name.split(' ').slice(1).join(' ') || organB.name
  ];
  const hybridName = `Chimera ${nameParts.join('-')}`;

  const ability = organA.ability || organB.ability || (newRarityIdx >= 2 ? ABILITIES.PYRE_BURST : null);

  // Hybrid mod sockets inherit and expand!
  const baseSockets = Math.max(organA.modSockets || 0, organB.modSockets || 0);
  const modSockets = Math.min(3, baseSockets + 1);

  return new Organ({
    name: hybridName,
    category: organA.category,
    region: organA.region,
    rarity: newRarity,
    element: mergedElement,
    damage: Math.round((organA.damage + organB.damage) * 0.8),
    defense: Math.round((organA.defense + organB.defense) * 0.8),
    hpBonus: Math.round((organA.hpBonus + organB.hpBonus) * 0.8),
    calorieConsumption: parseFloat(((organA.calorieConsumption + organB.calorieConsumption) * 0.6).toFixed(2)),
    ability,
    modSockets,
    icon: organA.icon,
    description: `Aberrant genetic synthesis fusing ${organA.name} with ${organB.name}.`
  });
}
