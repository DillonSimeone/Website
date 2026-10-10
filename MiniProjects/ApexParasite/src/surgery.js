/**
 * Apex Parasite: Chimera Odyssey - Surgical Field & Live Specimen Triage
 * Manages post-combat body inspection, vital pulse shock meter, arterial clamping,
 * pristine live extraction vs corpse butchering, and biomass feasting.
 */

import { createOrganNode } from './chimera.js';

export class SurgicalField {
  constructor(game) {
    this.game = game;
    this.activeSpecimen = null;
    this.vitalPulse = 100;
    this.isFlatlined = false;
  }

  openField({ name, isLiving = false, severedGroundLoot = [], limbs = [] }) {
    this.vitalPulse = isLiving ? 75 : 0;
    this.isFlatlined = !isLiving;

    // Generate surgical harvest items from remaining limbs and severed loot
    const harvestables = [];

    // Severed Ground Loot (Zero pulse cost, already on ground)
    severedGroundLoot.forEach(loot => {
      harvestables.push({
        id: `loot_${Math.random()}`,
        name: loot.name,
        category: loot.category || 'WEAPON',
        damage: loot.damage || 8,
        defense: loot.defense || 0,
        rarity: loot.rarity || 'uncommon',
        isGroundLoot: true,
        pulseCost: 0,
        harvestChance: 100,
        isHarvested: false
      });
    });

    // Intact Anatomical Limbs
    limbs.forEach(limb => {
      if (!limb.isSevered) {
        const isDelicate = limb.category === 'HEAD' || limb.category === 'TORSO';
        harvestables.push({
          id: `limb_${limb.id}`,
          name: limb.name,
          category: limb.category,
          damage: limb.damage || (limb.category === 'WEAPON' ? 10 : 0),
          defense: limb.armor || 2,
          rarity: isLiving ? 'rare' : 'common',
          isGroundLoot: false,
          pulseCost: isDelicate ? 35 : 15,
          harvestChance: Math.min(95, 60 + this.game.skills.getSurgeryBonus()),
          isHarvested: false
        });
      }
    });

    // Always include a Visceral Slurry feast node
    harvestables.push({
      id: 'slurry_node',
      name: 'Hemolymph Blood Slurry',
      category: 'INTERNAL',
      feastOnly: true,
      calories: 45,
      isHarvested: false
    });

    this.activeSpecimen = {
      name,
      isLiving,
      harvestables
    };

    this.game.hud.renderSurgicalModal(this.activeSpecimen, this.vitalPulse, this.isFlatlined);
  }

  /**
   * Attempt surgical extraction on a specific organ node.
   */
  extractOrgan(itemId) {
    if (!this.activeSpecimen) return;
    const item = this.activeSpecimen.harvestables.find(h => h.id === itemId);
    if (!item || item.isHarvested) return;

    if (item.feastOnly) {
      // Feast action
      item.isHarvested = true;
      this.game.restoreCalories(item.calories);
      this.game.addBiomass(30);
      this.game.audio.playSquelch();
      this.game.hud.log({ text: `Feasted on [${item.name}]: +${item.calories} Calories, +30 Biomass!`, type: 'harvest' });
      this.game.hud.renderSurgicalModal(this.activeSpecimen, this.vitalPulse, this.isFlatlined);
      return;
    }

    if (this.isFlatlined && !item.isGroundLoot && item.pulseCost > 20) {
      this.game.hud.log({ text: `Specimen flatlined! Delicate membranes on [${item.name}] have ruptured into mush.`, type: 'threat' });
      return;
    }

    // Roll harvest chance influenced by Surgery Skill
    const roll = Math.random() * 100;
    if (roll <= item.harvestChance) {
      item.isHarvested = true;
      const organNode = createOrganNode({
        category: item.category,
        name: item.name,
        rarity: item.rarity
      });

      this.game.inventory.push(organNode);
      this.game.skills.gainXp('surgery', 25);
      this.game.audio.playSquelch();
      this.game.hud.log({ text: `Surgically extracted [${item.name}] into Carrier Sac!`, type: 'harvest' });

      // Drain Vital Pulse if specimen is living
      if (this.activeSpecimen.isLiving && item.pulseCost > 0) {
        this.vitalPulse = Math.max(0, this.vitalPulse - item.pulseCost);
        if (this.vitalPulse <= 0 && !this.isFlatlined) {
          this.isFlatlined = true;
          this.game.audio.playCrush();
          this.game.hud.log({ text: `⚠️ FLATLINE! Heart arrested. Remaining delicate organs ruined by systemic necrosis!`, type: 'threat' });
        }
      }
    } else {
      this.game.hud.log({ text: `Extraction slipped! Damaged [${item.name}] during incision.`, type: 'combat' });
      this.vitalPulse = Math.max(0, this.vitalPulse - 10);
    }

    this.game.hud.renderSurgicalModal(this.activeSpecimen, this.vitalPulse, this.isFlatlined);
  }

  dissolveCorpse() {
    this.game.hud.log({ text: 'Dissolved remaining tissues with acidic miasma. No evidence left behind.', type: 'info' });
    this.closeField();
  }

  closeField() {
    this.activeSpecimen = null;
    this.game.parallax.clearEncounterTarget();
    this.game.hud.hideSurgicalModal();
    this.game.updateAll();
  }
}
