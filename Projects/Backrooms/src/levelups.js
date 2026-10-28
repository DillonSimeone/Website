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
    id: 'rebar_breaker',
    name: 'Tungsten Chisel',
    category: 'Structural Demolition',
    rarity: 'rare',
    desc: '+75% Demolition speed against concrete pillars and sub-floors.',
    apply: (player) => {
      player.harvestPower *= 1.4;
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
  }
];

export class LevelupSystem {
  constructor(onPerkDrafted) {
    this.onPerkDrafted = onPerkDrafted || (() => {});
    this.unlockedPerks = new Set();
    this.modalEl = document.getElementById('levelup-modal');
    this.deckEl = document.getElementById('card-deck-el');
    this.dockEl = document.getElementById('perks-dock');
  }

  presentDraft() {
    const available = PERK_POOL.filter(p => !this.unlockedPerks.has(p.id));
    if (available.length === 0) return false;

    // Shuffle and pick 3
    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);

    this.deckEl.innerHTML = '';
    choices.forEach(perk => {
      const card = document.createElement('div');
      card.className = `draft-card ${perk.rarity}`;
      card.innerHTML = `
        <div class="card-cat">${perk.category}</div>
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

  selectPerk(perk) {
    this.unlockedPerks.add(perk.id);
    this.modalEl.classList.remove('visible');

    // Add visual badge to perks dock
    if (this.dockEl) {
      const pill = document.createElement('div');
      pill.className = 'perk-pill';
      pill.innerText = `⚡ ${perk.name}`;
      this.dockEl.appendChild(pill);
    }

    this.onPerkDrafted(perk);
  }
}
