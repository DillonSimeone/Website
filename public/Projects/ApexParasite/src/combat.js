/**
 * Apex Parasite: Chimera Odyssey - Asymmetric Anatomical Combat Engine
 * Discrete limb targeting, in-combat limb severance, dynamic blood tracking,
 * hemorrhagic shock collapse, and Asymmetric Worm Resilience (headless worm fights on!).
 */

import { DAMAGE_TYPES, ELEMENTAL_AFFINITY, RARITY } from './types.js';

export class AnatomicalCombatEngine {
  constructor(game) {
    this.game = game;
    this.activeBattle = null;
  }

  /**
   * Initialize a combat encounter against an enemy (Beast or Human).
   */
  startBattle({ name = 'Verdant Thorn-Beast', isHuman = false, tier = 1 }) {
    const enemyLimbs = [
      { id: 'head', name: isHuman ? 'Human Skull' : 'Sensory Crest', category: 'HEAD', hp: 25 * tier, maxHp: 25 * tier, armor: 4, hitChance: 55, isVital: true, isSevered: false },
      { id: 'thorax', name: isHuman ? 'Armored Chest' : 'Chitin Mantle', category: 'TORSO', hp: 45 * tier, maxHp: 45 * tier, armor: 6, hitChance: 85, isVital: true, isSevered: false },
      { id: 'weapon_l', name: isHuman ? 'Steel Broadsword Arm' : 'Left Razor Scythe', category: 'WEAPON', hp: 30 * tier, maxHp: 30 * tier, armor: 2, hitChance: 75, isVital: false, isSevered: false, damage: 12 * tier },
      { id: 'weapon_r', name: isHuman ? 'Hunting Knife Arm' : 'Right Razor Scythe', category: 'WEAPON', hp: 28 * tier, maxHp: 28 * tier, armor: 2, hitChance: 75, isVital: false, isSevered: false, damage: 10 * tier },
      { id: 'legs', name: isHuman ? 'Human Stalker Legs' : 'Locomotion Pods', category: 'PROPULSION', hp: 35 * tier, maxHp: 35 * tier, armor: 3, hitChance: 80, isVital: false, isSevered: false }
    ];

    this.activeBattle = {
      name,
      isHuman,
      tier,
      blood: 100, // Percentage
      painShock: 0, // 0 to 100
      limbs: enemyLimbs,
      severedLootPool: [],
      isSubdued: false,
      isDead: false,
      turn: 1
    };

    // Fade target entity into the parallax stage
    this.game.parallax.setEncounterTarget({
      name,
      isLiving: true,
      tier
    });

    this.game.hud.log({ text: `⚠️ COMBAT ENGAGED: Stalking [${name}] from the shadows!`, type: 'threat' });
  }

  /**
   * Execute player strike targeting a specific limb on the enemy.
   */
  playerStrikeLimb(limbId, weaponNode = null) {
    if (!this.activeBattle || this.activeBattle.isDead || this.activeBattle.isSubdued) return;

    const limb = this.activeBattle.limbs.find(l => l.id === limbId);
    if (!limb || limb.isSevered) {
      this.game.hud.log({ text: 'Target limb has already been severed or destroyed!', type: 'info' });
      return;
    }

    // Roll hit chance
    const hitRoll = Math.random() * 100;
    if (hitRoll > limb.hitChance) {
      this.game.hud.log({ text: `Strike missed! [${limb.name}] evaded your blow!`, type: 'combat' });
      this.game.audio.playSlice();
      this.game.parallax.triggerImpact('slash');
      this.resolveEnemyTurn();
      return;
    }

    // Calculate damage
    const totals = this.game.chimera.computeTotals();
    const baseAtk = weaponNode ? weaponNode.damage : totals.totalDmg;
    const netDmg = Math.max(2, baseAtk - limb.armor);

    limb.hp -= netDmg;
    this.activeBattle.blood = Math.max(0, this.activeBattle.blood - Math.round(netDmg * 0.6));
    this.activeBattle.painShock = Math.min(100, this.activeBattle.painShock + Math.round(netDmg * 0.8));

    // Dynamic blood pooling in parallax stage
    this.game.parallax.addBloodToPool(Math.round(netDmg * 0.7));
    this.game.parallax.triggerImpact('slash');
    this.game.audio.playSlice();

    // Gain weapon limb XP and cross-training
    if (weaponNode) {
      weaponNode.gainLimbXp(15);
      this.game.skills.gainXp('combat_slash', 18);
    }

    let logMsg = `You strike [${limb.name}] for ${netDmg} damage!`;

    // In-Combat Severance Check
    if (limb.hp <= 0 && !limb.isVital && !limb.isSevered) {
      limb.isSevered = true;
      logMsg += ` ⚡ SEVERED! The twitching [${limb.name}] drops into the blood pool!`;
      this.game.audio.playCrush();
      this.activeBattle.severedLootPool.push({
        name: limb.name,
        category: limb.category,
        damage: limb.damage || 8,
        defense: limb.armor,
        rarity: this.activeBattle.tier >= 2 ? RARITY.RARE : RARITY.UNCOMMON
      });
    }

    this.game.hud.log({ text: logMsg, type: 'combat' });

    // Check Vital Death
    if (limb.isVital && limb.hp <= 0) {
      this.resolveEnemyDeath();
      return;
    }

    // Check Hemorrhagic Shock / Incapacitation
    if (this.activeBattle.blood <= 20 || this.activeBattle.painShock >= 100) {
      this.resolveEnemyIncapacitation();
      return;
    }

    // Enemy Retaliation
    this.resolveEnemyTurn();
  }

  /**
   * Enemy retaliates against player chimera.
   */
  resolveEnemyTurn() {
    if (!this.activeBattle || this.activeBattle.isDead || this.activeBattle.isSubdued) return;

    // Filter available attacking limbs
    const activeAttacks = this.activeBattle.limbs.filter(l => l.category === 'WEAPON' && !l.isSevered);
    if (activeAttacks.length === 0) {
      this.game.hud.log({ text: `${this.activeBattle.name} has no remaining weapons and bobs disoriented!`, type: 'info' });
      return;
    }

    const attackLimb = activeAttacks[Math.floor(Math.random() * activeAttacks.length)];
    const totals = this.game.chimera.computeTotals();
    const incomingDmg = Math.max(1, attackLimb.damage - Math.round(totals.totalDef * 0.4));

    // Player takes damage
    this.game.inflictDamage(incomingDmg);
    this.game.parallax.triggerScreenShake(12);
    this.game.audio.playSquelch();

    this.game.hud.log({
      text: `${this.activeBattle.name} lashes back with [${attackLimb.name}] for ${incomingDmg} damage!`,
      type: 'threat'
    });

    this.activeBattle.turn++;
    this.game.updateAll();
  }

  resolveEnemyDeath() {
    this.activeBattle.isDead = true;
    this.game.hud.log({ text: `💥 CRITICAL VITAL DESTRUCTION! ${this.activeBattle.name} collapses into death!`, type: 'harvest' });
    
    // Check Guild Bounty payout
    this.checkBountyPayout();

    this.game.parallax.setEncounterTarget({
      name: this.activeBattle.name,
      isLiving: false
    });

    setTimeout(() => {
      this.game.openSurgicalField({
        name: `${this.activeBattle.name} (Corpse)`,
        isLiving: false,
        severedGroundLoot: this.activeBattle.severedLootPool,
        limbs: this.activeBattle.limbs
      });
      this.activeBattle = null;
    }, 600);
  }

  resolveEnemyIncapacitation() {
    this.activeBattle.isSubdued = true;
    this.game.hud.log({
      text: `🩸 HEMORRHAGIC COLLAPSE! ${this.activeBattle.name} drops unconscious into the spreading blood pool! [LIVING SPECIMEN SECURED]`,
      type: 'harvest'
    });

    // Check Guild Bounty payout
    this.checkBountyPayout();

    this.game.parallax.setEncounterTarget({
      name: this.activeBattle.name,
      isLiving: true
    });

    setTimeout(() => {
      this.game.openSurgicalField({
        name: `${this.activeBattle.name} (Subdued Living Specimen)`,
        isLiving: true,
        severedGroundLoot: this.activeBattle.severedLootPool,
        limbs: this.activeBattle.limbs
      });
      this.activeBattle = null;
    }, 600);
  }

  checkBountyPayout() {
    if (this.game.activeBounty && this.game.hud?.tavernBounties) {
      const bounty = this.game.hud.tavernBounties.find(b => b.id === this.game.activeBounty);
      if (bounty && (bounty.targetName === this.activeBattle.name || this.activeBattle.name.includes(bounty.targetName))) {
        this.game.shillings = (this.game.shillings || 0) + bounty.rewardShillings;
        this.game.addBiomass(bounty.rewardXp);
        this.game.hud.log({
          text: `🏆 BOUNTY CONTRACT FULFILLED: [${bounty.title}]! Claimed +${bounty.rewardShillings} Shillings and +${bounty.rewardXp} Biomass EXP!`,
          type: 'harvest'
        });
        this.game.activeBounty = null;
      }
    }
  }
}
