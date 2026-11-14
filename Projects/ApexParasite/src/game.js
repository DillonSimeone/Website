/**
 * Apex Parasite: Chimera Odyssey - Master Game Orchestrator
 * Connects ChimeraTree, ParallaxStage, AnatomicalCombat, LocationEngine,
 * SurgicalField, SkillSystem, and Persona 5 style HUD.
 */

import { ChimeraTree, createOrganNode, RefrainAlchemyCrucible } from './chimera.js';
import { ParallaxStage } from './parallax.js';
import { SkillSystem } from './skills.js';
import { LocationEngine, LOCATIONS } from './locations.js';
import { AnatomicalCombatEngine } from './combat.js';
import { SurgicalField } from './surgery.js';
import { GameHUD } from './hud.js';
import { BioAudio } from './audio.js';
import { AssetManager } from './assets.js';
import { RARITY, ELEMENTAL_AFFINITY } from './types.js';

export class GameEngine {
  constructor() {
    this.audio = new BioAudio();
    this.assets = new AssetManager();
    this.chimera = new ChimeraTree();
    this.skills = new SkillSystem();
    this.combat = new AnatomicalCombatEngine(this);
    this.locations = new LocationEngine(this);
    this.surgery = new SurgicalField(this);

    // Player Resources & Progression
    this.calories = 120;
    this.maxCalories = 120;
    this.blood = 100;
    this.maxBlood = 100;
    this.bioSlurry = 80;
    this.depravityScore = 0;
    
    // Level & Roguelite Boons
    this.level = 1;
    this.biomassXp = 0;
    this.maxBiomassXp = 100;
    this.activeBoons = [];

    // Carrier Sac (Unequipped parts)
    this.inventory = [];

    this.isGameOver = false;

    // Currency & Active Quests
    this.shillings = 60;
    this.activeBounty = null;

    // Initialize initial starting parts
    this.initStartingChimera();
  }

  initStartingChimera() {
    // Starting vessel: Human Vagrant
    const rootTorso = createOrganNode({
      category: 'TORSO',
      name: 'Vagrant Human Torso',
      tier: 1,
      isHuman: true
    });
    this.chimera.attachPart(this.chimera.root.id, 'torso_1', rootTorso);

    const head = createOrganNode({
      category: 'HEAD',
      name: 'Vagrant Head',
      tier: 1,
      isHuman: true
    });
    this.chimera.attachPart(this.chimera.root.id, 'cranial_1', head);

    // Arms
    const leftArm = createOrganNode({ category: 'LIMB', name: 'Human Left Arm', isHuman: true });
    this.chimera.attachPart(rootTorso.id, rootTorso.sockets[2].socketId, leftArm);

    const knife = createOrganNode({ category: 'WEAPON', name: 'Hunting Knife', tier: 1, isHuman: true });
    this.chimera.attachPart(leftArm.id, leftArm.sockets[0].socketId, knife);

    const rightArm = createOrganNode({ category: 'LIMB', name: 'Human Right Arm', isHuman: true });
    this.chimera.attachPart(rootTorso.id, rootTorso.sockets[3].socketId, rightArm);

    // Initial Carrier Sac items
    this.inventory.push(createOrganNode({
      category: 'WEAPON',
      name: 'Pyro-Chitin Stinger',
      tier: 1,
      rarity: RARITY.RARE,
      element: ELEMENTAL_AFFINITY.FIRE
    }));

    this.inventory.push(createOrganNode({
      category: 'GEAR',
      name: 'Linen Concealment Wrappings',
      tier: 1
    }));
  }

  async init() {
    const canvas = document.getElementById('parallax-canvas');
    this.parallax = new ParallaxStage(canvas, this.assets);
    this.hud = new GameHUD(this);

    // Load and key modular dark-fantasy assets
    await this.assets.loadAll();
    this.parallax.setEnvironment('CITY');

    // Explicitly initialize city environment
    this.locations.setLocation('CITY');

    // Skills awakening banner listener
    this.skills.onSkillAwakened = (skill) => {
      this.hud.showSkillAwakenedBanner(skill);
      this.audio.playSlice();
      this.hud.log({ text: `✨ SKILL AWAKENED: [${skill.name}]!`, type: 'harvest' });
    };

    this.updateAll();
  }

  startHostCycle() {
    this.isGameOver = false;
    this.combat.activeBattle = null;
    this.parallax.clearEncounterTarget();
    this.audio.ensureContext();
    this.locations.setLocation('CITY');

    // Guarantee combat and surgical field are hidden, and location actions are visible
    document.getElementById('combat-stage-overlay')?.classList.add('hidden');
    document.getElementById('surgical-field-overlay')?.classList.add('hidden');
    document.getElementById('action-ribbon-container')?.classList.remove('hidden');

    this.updateAll();
    this.hud.log({ text: 'PRIMORDIAL PROTOCOL ENGAGED: The Worm pierces the skull of an unsuspecting vagrant.', type: 'threat' });
    this.hud.log({ text: 'Concealment: 100% [HUMANOID DISGUISE]. Assimilate or perish.', type: 'harvest' });
    this.hud.log({ text: 'Explore the city or venture into the primeval canopy to hunt.', type: 'info' });
  }

  resetGame() {
    this.isGameOver = false;
    this.combat.activeBattle = null;
    this.parallax.clearEncounterTarget();
    this.calories = 120;
    this.maxCalories = 120;
    this.blood = 100;
    this.maxBlood = 100;
    this.bioSlurry = 80;
    this.shillings = 60;
    this.activeBounty = null;
    this.depravityScore = 0;
    this.level = 1;
    this.biomassXp = 0;
    this.maxBiomassXp = 100;
    this.activeBoons = [];
    this.inventory = [];

    this.chimera = new ChimeraTree();
    this.initStartingChimera();
    this.locations.setLocation('CITY');

    // Close any lingering combat / surgery overlays and restore action ribbon
    document.getElementById('combat-stage-overlay')?.classList.add('hidden');
    document.getElementById('surgical-field-overlay')?.classList.add('hidden');
    document.getElementById('action-ribbon-container')?.classList.remove('hidden');

    this.updateAll();
  }

  consumeCalories(amt) {
    const finalAmt = parseFloat((amt * (this.calorieMod || 1.0)).toFixed(1));
    this.calories = Math.max(0, parseFloat((this.calories - finalAmt).toFixed(1)));
    if (this.calories <= 0) {
      this.inflictDamage(8);
      this.hud.log({ text: '⚠️ STARVATION! Host tissues are devouring themselves for energy (-8 Blood)!', type: 'threat' });
    }
  }

  restoreCalories(amt) {
    this.calories = Math.min(this.maxCalories, parseFloat((this.calories + amt).toFixed(1)));
  }

  inflictDamage(amt) {
    this.blood = Math.max(0, Math.round(this.blood - amt));
    if (this.blood <= 0) {
      this.handleGameOver();
    }
  }

  addBiomass(amt) {
    this.biomassXp += amt;
    this.depravityScore += Math.round(amt * 0.4);
    if (this.biomassXp >= this.maxBiomassXp) {
      this.level++;
      this.biomassXp -= this.maxBiomassXp;
      this.maxBiomassXp = Math.round(this.maxBiomassXp * 1.5);
      this.hud.showLevelUpModal();
    }
  }

  startCombatEncounter(config) {
    this.combat.startBattle(config);
    this.hud.openCombatHUD(this.combat.activeBattle);
  }

  openSurgicalField(config) {
    this.surgery.openField(config);
  }

  handleGameOver() {
    this.isGameOver = true;
    this.combat.activeBattle = null;
    this.parallax.clearEncounterTarget();
    document.getElementById('combat-stage-overlay')?.classList.add('hidden');
    this.hud.log({ text: '💀 VESSEL COLLAPSED! The Worm burrows deep into the earth with preserved Bio-Essence.', type: 'threat' });
    this.hud.showGameOverModal({
      biomass: this.biomassXp,
      depravity: this.depravityScore,
      mass: this.chimera.computeTotals().totalMass
    });
  }

  updateAll() {
    this.hud?.updateAll();
  }
}
