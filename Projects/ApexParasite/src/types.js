/**
 * Apex Parasite - Type Definitions & Constants
 * Strict architecture definitions for pure ECS, grid anatomy, and ability registries.
 */

export const GLYPHS = {
  // Entities
  WORM: 64,         // '@' (ASCII 64) - The True Player
  FAUNA_VOLE: 114,  // 'r' (ASCII 114) - Crypt Vole
  FAUNA_LEECH: 126, // '~' (ASCII 126) - Cave Leech
  FAUNA_HOG: 104,   // 'h' (ASCII 104) - Pit Hog
  HUMAN_FORAGER: 70,// 'F' (ASCII 70) - Frontier Forager
  HUMAN_WATCH: 87,  // 'W' (ASCII 87) - Town Watch
  HUNTER_PURGER: 72,// 'H' (ASCII 72) - Crucible Purger
  HUNTER_CRYO: 67,  // 'C' (ASCII 67) - Cryo Inquisitor
  APEX_CHIMERA: 88, // 'X' (ASCII 88) - Flesh Amalgam
  
  // Environment
  WALL: 35,         // '#' (ASCII 35)
  FLOOR: 46,        // '.' (ASCII 46)
  DOOR_CLOSED: 43,  // '+' (ASCII 43)
  DOOR_OPEN: 47,    // '/' (ASCII 47)
  STAIRS_DOWN: 62,  // '>' (ASCII 62)
  CORPSE_SLURRY: 37,// '%' (ASCII 37)
  ORGAN_DROP: 42,   // '*' (ASCII 42)
  SEPSIS_MIASMA: 33,// '!' (ASCII 33)
  VOID_DOMAIN: 937  // 'Ω' (ASCII or custom glyph index)
};

export const ECS_COMPONENTS = {
  NONE: 0,
  POSITION: 1 << 0,
  RENDER: 1 << 1,
  STATS: 1 << 2,
  PLAYER_INPUT: 1 << 3,
  AI_CONTROLLER: 1 << 4,
  HOST_CHASSIS: 1 << 5,
  STATUS_EFFECTS: 1 << 6,
  ANATOMY: 1 << 7
};

export const HOST_TYPES = {
  FAUNA: 0,
  HUMANOID: 1,
  HUNTER: 2,
  CHIMERA: 3,
  SINGULARITY: 4
};

export const ELEMENTAL_AFFINITY = {
  NONE: 'none',
  FIRE: 'fire',       // High DPS scaling
  FROST: 'frost',     // Slows & chills
  PLANT: 'plant',     // Passive regeneration & calorie savings
  NECROTIC: 'necrotic'// Poison & armor pierce
};

export const DAMAGE_TYPES = {
  BLUNT: 'blunt',     // High systemic damage, stun
  SLICING: 'slicing', // High precision criticals
  ENERGY: 'energy',   // High melt damage
  SEDATE: 'sedate'    // Sedative stun
};

export const RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary'
};

export const RARITY_CONFIG = {
  common: { name: 'Common', color: '#94a3b8', border: '#475569', multiplier: 1.0, maxModSockets: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', border: '#16a34a', multiplier: 1.4, maxModSockets: 1 },
  rare: { name: 'Rare', color: '#38bdf8', border: '#0284c7', multiplier: 2.0, maxModSockets: 2 },
  epic: { name: 'Epic', color: '#c084fc', border: '#9333ea', multiplier: 3.2, maxModSockets: 2 },
  legendary: { name: 'Legendary', color: '#f59e0b', border: '#d97706', multiplier: 4.8, maxModSockets: 3 }
};

export const MODULE_CATEGORIES = {
  WEAPON: { id: 'WEAPON', name: 'Weapons', icon: '🦞', tag: 'WEAPON' },
  REACTOR: { id: 'REACTOR', name: 'Reactor Cores', icon: '🫁', tag: 'REACTOR' },
  CARAPACE: { id: 'CARAPACE', name: 'Carapace / Armor', icon: '🛡️', tag: 'CARAPACE' },
  NEURAL: { id: 'NEURAL', name: 'Neural Craniums', icon: '🧠', tag: 'CRANIUM' },
  PROPULSION: { id: 'PROPULSION', name: 'Propulsion', icon: '🦿', tag: 'PROPULSION' },
  INTERNAL_MOD: { id: 'INTERNAL_MOD', name: 'Internal Modules', icon: '🔌', tag: 'MOD' }
};

export const CHASSIS_HARDPOINTS = {
  HEAD: { id: 'head', name: 'Cranial Bridge', category: 'NEURAL', icon: '🧠', tag: 'CRANIUM', desc: 'Neural nexus & sensory cluster. Hosts the Parasite Worm.' },
  TORSO: { id: 'torso', name: 'Thoracic Reactor', category: 'REACTOR', icon: '🫁', tag: 'REACTOR', desc: 'Metabolic furnace. Rare+ cores grant internal mod sockets.' },
  ARM_LEFT: { id: 'arm_left', name: 'Primary Weapon Bay', category: 'WEAPON', icon: '🦞', tag: 'WEAPON-L', desc: 'Primary offensive bio-armament.' },
  ARM_RIGHT: { id: 'arm_right', name: 'Secondary Weapon Bay', category: 'WEAPON', icon: '🔪', tag: 'WEAPON-R', desc: 'Offhand offensive or defensive apparatus.' },
  DORSAL: { id: 'dorsal', name: 'Carapace & Dorsal Rig', category: 'CARAPACE', icon: '🛡️', tag: 'CARAPACE', desc: 'Exoskeleton plating and spinal conduits.' },
  LEGS: { id: 'legs', name: 'Propulsion Array', category: 'PROPULSION', icon: '🦿', tag: 'PROPULSION', desc: 'Locomotion stalks granting agility and evasion.' }
};

export const ANATOMY_REGIONS = CHASSIS_HARDPOINTS;

export const ABILITIES = {
  FROST_NOVA: {
    id: 'frost_nova',
    name: 'Frost Nova',
    icon: '❄️',
    description: 'Freezes all adjacent enemies for 3 turns.',
    range: 1,
    cooldown: 5
  },
  PYRE_BURST: {
    id: 'pyre_burst',
    name: 'Pyre Burst',
    icon: '🔥',
    description: 'Blasts line of tiles in front of you for 28 Fire damage.',
    range: 4,
    cooldown: 4
  },
  TERROR_SHRIEK: {
    id: 'terror_shriek',
    name: 'Terror Shriek',
    icon: '🗣',
    description: 'False Hydra dissonant scream stuns all visible foes.',
    range: 10,
    cooldown: 8
  },
  BILE_VIVISECT: {
    id: 'bile_vivisect',
    name: 'Bile Vivisect',
    icon: '⚕',
    description: 'Surgical extraction on adjacent enemy; deals 30 piercing dmg and extracts living parts.',
    range: 1,
    cooldown: 6
  },
  SPORE_HEAL: {
    id: 'spore_heal',
    name: 'Spore Bloom',
    icon: '🌿',
    description: 'Releases photosynthetic spores: heals +35 HP and +40 Calories.',
    range: 0,
    cooldown: 7
  }
};
