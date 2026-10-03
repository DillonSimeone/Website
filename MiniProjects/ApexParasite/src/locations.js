/**
 * Apex Parasite: Chimera Odyssey - Location & Exploration Engine
 * Atmospheric menu navigation across City, Primeval Forest, Wilderness, and Camp.
 * Calorie drain scales with chimera weight, terrain, and weather. Seamless encounter transitions.
 */

export const LOCATIONS = {
  CITY: {
    id: 'CITY',
    name: 'Frontier Settlement: Oakhaven',
    tagline: 'Gas-lit cobblestones, stone cathedral spires, and vigilant town watch.',
    environment: 'CITY',
    baseTravelCost: 4.0
  },
  FOREST: {
    id: 'FOREST',
    name: 'The Primeval Canopy',
    tagline: 'Ancient mossy redwoods, volumetric sunlit godrays, and predatory beasts.',
    environment: 'FOREST',
    baseTravelCost: 2.5
  },
  WILDS: {
    id: 'WILDS',
    name: 'The Ashen Wastes & Crags',
    tagline: 'Howling sand winds, jagged obsidian spires, and roaming elemental chimeras.',
    environment: 'WILDS',
    baseTravelCost: 5.0
  },
  CAMP: {
    id: 'CAMP',
    name: 'Biomechanical Hollow (Camp)',
    tagline: 'Hidden root cave sheltered from prying eyes. Bio-Crucible & surgical assembly.',
    environment: 'FOREST',
    baseTravelCost: 0
  }
};

export class LocationEngine {
  constructor(game) {
    this.game = game;
    this.currentLocation = LOCATIONS.CITY;
    this.weather = 'CLEAR'; // 'CLEAR', 'RAIN', 'ASH', 'SPORE_STORM'
    this.weatherMod = 1.0;
  }

  setLocation(locKey) {
    if (LOCATIONS[locKey]) {
      this.currentLocation = LOCATIONS[locKey];
      this.game.parallax.setEnvironment(this.currentLocation.environment);
    }
  }

  /**
   * Computes action calorie cost based on chimera weight, terrain, and weather.
   */
  calculateActionCost(baseCost = 2.0) {
    const totals = this.game.chimera.computeTotals();
    const massFactor = Math.max(0.8, totals.totalMass * 0.12);
    const cost = parseFloat((baseCost * massFactor * this.weatherMod).toFixed(1));
    return Math.max(0.5, cost);
  }

  /**
   * Exploration Step in Primeval Forest: Moves layers and rolls random event.
   */
  exploreForest(onEventResolved) {
    const cost = this.calculateActionCost(2.5);
    this.game.consumeCalories(cost);

    // Trigger visual stalking motion in parallax
    this.game.parallax.triggerExploreStep(() => {
      // Roll random encounter / event
      const roll = Math.random();

      if (roll < 0.45) {
        // Combat Encounter: Wild Beast or Hunter Poacher
        const isHuman = Math.random() < 0.35;
        this.game.startCombatEncounter({
          name: isHuman ? 'Frontier Poacher' : 'Verdant Thorn-Beast',
          isHuman,
          tier: 1 + Math.floor(this.game.depravityScore / 40)
        });
      } else if (roll < 0.70) {
        // Sunlit Glade: Opportunity to photosynthesize, but risk of ambush!
        this.resolveSunlitGlade();
      } else if (roll < 0.88) {
        // Fresh Carcass: Scavenge free parts or biomass
        this.resolveFreshCarcass();
      } else {
        // Quiet wilderness trail
        this.game.hud.log({ text: 'You slip silently between giant root boughs. No prey detected.', type: 'info' });
        this.game.updateAll();
      }

      if (onEventResolved) onEventResolved();
    });
  }

  resolveSunlitGlade() {
    const totals = this.game.chimera.computeTotals();
    const floralParts = this.game.chimera.getAllNodes().filter(n => n.element === 'plant');
    const photoYield = floralParts.length * 15;

    // Predator ambush danger when basking in open glade!
    const isAmbushed = Math.random() < 0.35;

    if (isAmbushed) {
      this.game.hud.log({ text: '⚠️ AMBUSH! A predatory Scythe-Mantis lunges from the canopy as you enter the glade!', type: 'threat' });
      this.game.startCombatEncounter({
        name: 'Apex Scythe-Mantis',
        isHuman: false,
        tier: 2
      });
    } else {
      if (photoYield > 0) {
        this.game.restoreCalories(photoYield);
        this.game.hud.log({ text: `Sunlit Glade reached: Chloroplast organs absorb godrays (+${photoYield} Calories)!`, type: 'harvest' });
      } else {
        this.game.hud.log({ text: 'You bask briefly in a sunlit glade. Without floral organs, warmth brings only respite.', type: 'info' });
      }
      this.game.updateAll();
    }
  }

  resolveFreshCarcass() {
    this.game.hud.log({ text: 'You stumble upon a fresh battlefield: dead hunter and mangled wolf carcass.', type: 'harvest' });
    // Trigger post-combat surgical field directly on the carcass!
    this.game.openSurgicalField({
      name: 'Mangled Dire-Wolf (Carcass)',
      isLiving: false,
      parts: [
        { name: 'Serrated Wolf Fang', category: 'WEAPON', damage: 12, rarity: 'uncommon', extractChance: 80 },
        { name: 'Lupine Muscle Forearm', category: 'LIMB', damage: 4, defense: 2, rarity: 'common', extractChance: 90 },
        { name: 'Ruined Viscera', category: 'INTERNAL', feastOnly: true, calories: 35 }
      ]
    });
  }
}
