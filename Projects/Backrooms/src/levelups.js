/**
 * LevelupSystem: Manages anomalous perk definitions, weighted 3-card benefit drafts,
 * and UI modal interaction bindings.
 */

export const PERK_POOL = [
  {
    id: 'heavy_strike',
    name: 'Sledgehammer Cleave',
    category: 'Structural Demolition',
    rarity: 'common',
    desc: '+50% Harvest damage against all walls and structural fixtures.',
    apply: (player) => {
      player.harvestPower *= 1.5;
    }
  },
  {
    id: 'copper_magnet',
    name: 'Electrical Salvager',
    category: 'Structural Demolition',
    rarity: 'rare',
    desc: 'Fluorescent ballasts yield double copper wiring and rare capacitors.',
    apply: (player) => {
      player.doubleElectrical = true;
    }
  },
  {
    id: 'kinetic_leech',
    name: 'Kinetic Leech',
    category: 'Combat Adaptation',
    rarity: 'rare',
    desc: 'Slaying any entity restores +5 Integrity HP and permanently increases all weapon & melee damage by +15%.',
    apply: (player) => {
      player.lifestealOnKill = (player.lifestealOnKill || 0) + 5;
      player.weaponDamageBonus = (player.weaponDamageBonus || 1.0) * 1.15;
    }
  },
  {
    id: 'void_runner',
    name: 'Void Stalker',
    category: 'Spatial Glitching',
    rarity: 'rare',
    desc: 'Moving through unlit, dark areas increases sprint speed by +40%.',
    apply: (player) => {
      player.speedMultiplier *= 1.25;
    }
  },
  {
    id: 'phase_step',
    name: 'Noclip Phase',
    category: 'Spatial Glitching',
    rarity: 'glitched',
    desc: 'Press [Q] to warp-phase 4.2 meters forward directly through unbroken walls.',
    apply: (player) => {
      player.hasPhase = true;
    }
  },
  {
    id: 'crawlspace_climber',
    name: 'Crawlspace Climber',
    category: 'Spatial Glitching',
    rarity: 'rare',
    desc: 'Enhanced vertical thrust enables leaping through ceiling breaches into the crawlspace rafters.',
    apply: (player) => {
      player.jumpSpeed = 11.5;
    }
  },
  {
    id: 'master_scrapper',
    name: 'Efficient Fabrication',
    category: 'Improvised Engineering',
    rarity: 'common',
    desc: 'Reduces all workbench crafting resource costs by 30%.',
    apply: (player, crafting) => {
      crafting.costDiscount = 0.7;
    }
  },
  {
    id: 'ballast_dynamo',
    name: 'Ballast Dynamo',
    category: 'Improvised Engineering',
    rarity: 'rare',
    desc: 'Conduit Lantern projects a 2x wider high-intensity luminescent beam.',
    apply: (player) => {
      player.lanternIntensity = 4.0;
      player.lanternRange = 28;
      if (player.lanternLight) {
        player.lanternLight.distance = 28;
        if (player.lanternOn) player.lanternLight.intensity = 4.0;
      }
    }
  },
  {
    id: 'ambient_siphon',
    name: 'Ambient Siphon',
    category: 'Improvised Engineering',
    rarity: 'rare',
    desc: 'Passively absorbs stray electromagnetic voltage from buzzing fluorescent ballasts (+XP near lights).',
    apply: (player) => {
      player.ambientSiphon = true;
    }
  },
  {
    id: 'vacuum_aura',
    name: 'Entropic Graviton',
    category: 'Resource Magnetism',
    rarity: 'common',
    desc: 'Triples raw material vacuum range and pulls items across rooms.',
    apply: (player) => {
      player.magnetRange *= 2.6;
      player.magnetSpeed *= 1.8;
    }
  },
  {
    id: 'reclamation_xp',
    name: 'Salvage Reconstitution',
    category: 'Resource Magnetism',
    rarity: 'glitched',
    desc: '+50% bonus XP gain from all demolition and crafting actions.',
    apply: (player, crafting, prog) => {
      prog.xpMultiplier *= 1.5;
    }
  },
  {
    id: 'kinetic_shockwave',
    name: 'Kinetic Shockwave',
    category: 'Structural Demolition',
    rarity: 'glitched',
    desc: 'Breaking any structure deals 35% splash demolition damage to adjacent blocks within 2.2m.',
    apply: (player) => {
      player.splashDamageRatio += 0.35;
    }
  },
  {
    id: 'shaped_blast',
    name: 'Shaped Blast Matrix',
    category: 'Structural Demolition',
    rarity: 'rare',
    desc: 'Breaching Charges gain +45% blast radius and deal +50% explosive damage to nearby entities.',
    apply: (player) => {
      player.blastRadiusBonus = (player.blastRadiusBonus || 1.0) * 1.45;
    }
  },
  {
    id: 'low_gravity',
    name: 'Low-Gravity Anomaly',
    category: 'Spatial Glitching',
    rarity: 'glitched',
    desc: 'Reduces local gravity by 28% for extended air-time and effortless vertical leaps.',
    apply: (player) => {
      player.gravityScale *= 0.72;
    }
  },
  {
    id: 'blink_echo',
    name: 'Blink Echo',
    category: 'Spatial Glitching',
    rarity: 'rare',
    desc: 'Unlocks/upgrades Noclip Phase [Q] to warp 7.0 meters forward through unbroken walls.',
    apply: (player) => {
      player.hasPhase = true;
      player.phaseDistance = Math.max(player.phaseDistance, 7.0);
    }
  },
  {
    id: 'kinetic_overdrive',
    name: 'Kinetic Overdrive',
    category: 'Spatial Glitching',
    rarity: 'common',
    desc: '+20% Base movement speed and +25% jump velocity.',
    apply: (player) => {
      player.speedMultiplier *= 1.2;
      player.jumpSpeed *= 1.25;
    }
  },
  {
    id: 'fortified_architecture',
    name: 'Fortified Architecture',
    category: 'Improvised Engineering',
    rarity: 'common',
    desc: 'Deployed Barricades have 2.5x durability and crafting yields +15% extra XP.',
    apply: (player, crafting, prog) => {
      player.barricadeMaxHp *= 2.5;
      prog.xpMultiplier *= 1.15;
    }
  },
  {
    id: 'thermal_overclock',
    name: 'Thermal Overclock',
    category: 'Improvised Engineering',
    rarity: 'rare',
    desc: '+30% Harvest speed whenever your Conduit Lantern [F] is active.',
    apply: (player) => {
      player.thermalOverclock = true;
    }
  },
  {
    id: 'quantum_recycler',
    name: 'Quantum Recycler',
    category: 'Resource Magnetism',
    rarity: 'glitched',
    desc: '25% chance on any block break to instantly duplicate all dropped resources.',
    apply: (player) => {
      player.quantumRecycler = true;
    }
  },
  {
    id: 'singularity_pull',
    name: 'Singularity Pull',
    category: 'Resource Magnetism',
    rarity: 'rare',
    desc: '+100% Vacuum magnet range and +60% pull velocity.',
    apply: (player) => {
      player.magnetRange *= 2.0;
      player.magnetSpeed *= 1.6;
    }
  },
  {
    id: 'swarm_telemetry',
    name: 'Swarm Telemetry',
    category: 'Autonomous Robotics',
    rarity: 'rare',
    desc: 'All Salvage Mining Rovers move +60% faster and drill +75% faster.',
    apply: (player) => {
      player.roverSpeedBonus *= 1.6;
      player.roverHarvestBonus *= 1.75;
    }
  },
  {
    id: 'twin_core_fabricator',
    name: 'Twin-Core Fabricator',
    category: 'Autonomous Robotics',
    rarity: 'glitched',
    desc: 'Immediately deploys a free Salvage Mining Rover Bot and boosts rover drill speed +35%.',
    apply: (player) => {
      player.roverHarvestBonus *= 1.35;
      if (player.spawnRover) player.spawnRover();
    }
  }
];

export const REPEATABLE_PERKS = [
  {
    id: 'overclock_power',
    name: 'Structural Resonance',
    category: 'Infinite Overclock',
    rarity: 'rare',
    repeatable: true,
    desc: '+18% Permanent Harvest Power across all tools.',
    apply: (player) => {
      player.harvestPower *= 1.18;
    }
  },
  {
    id: 'overclock_speed',
    name: 'Momentum Capacitor',
    category: 'Infinite Overclock',
    rarity: 'common',
    repeatable: true,
    desc: '+12% Permanent Movement Speed.',
    apply: (player) => {
      player.speedMultiplier *= 1.12;
    }
  },
  {
    id: 'overclock_xp',
    name: 'Entropic Sync',
    category: 'Infinite Overclock',
    rarity: 'glitched',
    repeatable: true,
    desc: '+20% Permanent XP Gain Multiplier.',
    apply: (player, crafting, prog) => {
      prog.xpMultiplier *= 1.20;
    }
  }
];

export class LevelupSystem {
  constructor(onPerkDrafted) {
    this.onPerkDrafted = onPerkDrafted || (() => {});
    this.unlockedPerks = new Set();
    this.modalEl = document.getElementById('levelup-modal');
    this.deckEl = document.getElementById('card-deck-el');
    this.dockEl = document.getElementById('perks-dock');
    this.currentChoices = [];
    this.isOpen = false;
  }

  presentDraft() {
    let available = PERK_POOL.filter(p => !this.unlockedPerks.has(p.id));
    if (available.length < 3) {
      available = [...available, ...REPEATABLE_PERKS];
    }
    if (available.length === 0) return false;

    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);
    this.currentChoices = choices;
    this.isOpen = true;

    this.deckEl.innerHTML = '';
    choices.forEach((perk, idx) => {
      const card = document.createElement('div');
      card.className = `draft-card ${perk.rarity}`;
      card.innerHTML = `
        <div class="card-cat">${perk.category} [${idx + 1}]</div>
        <div class="card-name">${perk.name}</div>
        <div class="card-description">${perk.desc}</div>
        <div class="card-rarity">${perk.rarity.toUpperCase()}</div>
      `;

      card.onclick = () => {
        this.selectPerk(perk);
      };

      this.deckEl.appendChild(card);
    });

    this.modalEl.classList.add('visible');
    return true;
  }

  selectByIndex(index) {
    if (!this.isOpen || index < 0 || index >= this.currentChoices.length) return false;
    this.selectPerk(this.currentChoices[index]);
    return true;
  }

  selectPerk(perk) {
    this.isOpen = false;
    this.currentChoices = [];
    if (!perk.repeatable) {
      this.unlockedPerks.add(perk.id);
    }
    this.modalEl.classList.remove('visible');

    if (this.dockEl) {
      const pill = document.createElement('div');
      pill.className = 'perk-pill';
      pill.innerText = `⚡ ${perk.name}`;
      this.dockEl.appendChild(pill);
    }

    this.onPerkDrafted(perk);
  }
}
