/**
 * Apex Parasite: Chimera Odyssey - Emergent Skills & DCSS Cross-Training Engine
 * Skills start hidden, silently accumulating XP from gameplay until Rank 1 awakens them.
 * Interconnected DCSS cross-training webs grant free proficiency across adjacent archetypes.
 */

export class SkillSystem {
  constructor() {
    this.skills = {
      combat_slash: { id: 'combat_slash', name: 'Slashing Weaponry', rank: 1, xp: 0, maxXp: 100, isAwakened: true, desc: 'Mastery over claws, scythes, and razor mandibles.' },
      combat_pierce: { id: 'combat_pierce', name: 'Piercing Stings', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Precision penetration with stingers, horns, and spines.' },
      combat_crush: { id: 'combat_crush', name: 'Blunt Impact', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Concussive trauma with heavy maces, paws, and tail flails.' },
      defense_carapace: { id: 'defense_carapace', name: 'Chitin Plating', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Deflection reflexes and structural shock absorption.' },
      surgery: { id: 'surgery', name: 'Surgical Extraction', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Delicate arterial clamping and intact organ harvesting.' },
      inspection: { id: 'inspection', name: 'Anatomical Insight', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Observational acuity revealing hidden affixes and weak points.' },
      foraging: { id: 'foraging', name: 'Biomass Foraging', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Calorie absorption efficiency and scent tracking in wild zones.' },
      sneaking: { id: 'sneaking', name: 'Mimicry & Stealth', rank: 0, xp: 0, maxXp: 100, isAwakened: false, desc: 'Humanoid disguise maintenance and ambush positioning.' }
    };

    // DCSS Cross-Training Webs (Linked skills receive 40% free bonus XP)
    this.crossTrainingWeb = {
      combat_slash: ['combat_pierce'],
      combat_pierce: ['combat_slash'],
      combat_crush: ['defense_carapace'],
      defense_carapace: ['combat_crush'],
      surgery: ['inspection'],
      inspection: ['surgery']
    };

    // Event listener for awakening popups
    this.onSkillAwakened = null;
  }

  /**
   * Award XP to a primary skill and automatically distribute cross-training XP.
   */
  gainXp(skillId, amount, isCross = false) {
    const skill = this.skills[skillId];
    if (!skill) return;

    skill.xp += Math.round(amount);

    // Check for Rank 1 Awakening (Discovery)
    if (!skill.isAwakened && skill.xp >= skill.maxXp) {
      skill.isAwakened = true;
      skill.rank = 1;
      skill.xp -= skill.maxXp;
      skill.maxXp = Math.round(skill.maxXp * 1.6);
      if (this.onSkillAwakened) {
        this.onSkillAwakened(skill);
      }
      return;
    }

    // Rank level-up
    while (skill.isAwakened && skill.xp >= skill.maxXp) {
      skill.rank++;
      skill.xp -= skill.maxXp;
      skill.maxXp = Math.round(skill.maxXp * 1.6);
    }

    // Trigger DCSS Cross-Training (Linked skills get 40% free XP without looping)
    if (!isCross && this.crossTrainingWeb[skillId]) {
      const crossPartners = this.crossTrainingWeb[skillId];
      crossPartners.forEach(partnerId => {
        this.gainXp(partnerId, amount * 0.4, true);
      });
    }
  }

  getAwakenedSkills() {
    return Object.values(this.skills).filter(s => s.isAwakened);
  }

  getSurgeryBonus() {
    return (this.skills.surgery.rank || 0) * 8; // +8% harvest chance per rank
  }

  getInspectionLevel() {
    return this.skills.inspection.rank || 0;
  }

  getSneakBonus() {
    return (this.skills.sneaking.rank || 0) * 6; // +6% concealment retention per rank
  }
}
