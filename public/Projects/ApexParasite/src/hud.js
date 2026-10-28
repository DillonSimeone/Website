/**
 * Apex Parasite: Chimera Odyssey - Persona 5 Bio-Cyberpunk HUD Controller
 * Manages high-impact angular action ribbons, tactical combat targeting reticles,
 * live specimen surgical triage, recursive node assembly, and Refrain Bio-Crucible.
 */

import { LOCATIONS } from './locations.js';
import { RefrainAlchemyCrucible, createOrganNode } from './chimera.js';
import { RARITY_CONFIG } from './types.js';

export class GameHUD {
  constructor(game) {
    this.game = game;
    this.selectedWeaponNode = null;
    this.selectedSocketTarget = null; // { parentId, socketId }

    // Bio-Crucible selection state
    this.crucibleBaseNode = null;
    this.crucibleFodderNodes = [];

    // Market & Tavern State
    this.marketWares = [
      { id: 'cloak', name: 'Linen Concealment Wrappings', icon: '🧣', desc: '+25% Disguise Concealment (Wraps monstrous limbs)', price: 20, stock: 3, buy: () => {
        this.game.chimera.root.concealment = Math.min(100, (this.game.chimera.root.concealment || 80) + 25);
        this.log({ text: 'Grafted fresh linen wraps: Concealment restored to civilian standards.', type: 'info' });
      }},
      { id: 'suture', name: 'Flesh Suture Needle & Thread', icon: '🪡', desc: 'Stitches bleeding tissue. Restores +25 Blood Volume.', price: 15, stock: 4, buy: () => {
        this.game.blood = Math.min(this.game.maxBlood, this.game.blood + 25);
        this.log({ text: 'Treated lacerations with sterile sutures (+25 Blood).', type: 'harvest' });
      }},
      { id: 'jerky', name: 'Smoked Boar Jerky Rations', icon: '🥩', desc: 'Dense protein nourishment. Restores +45 Calories.', price: 10, stock: 6, buy: () => {
        this.game.restoreCalories(45);
        this.log({ text: 'Devoured smoked rations (+45 Calories).', type: 'info' });
      }},
      { id: 'cleaver', name: 'Poacher\'s Steel Cleaver', icon: '🗡️', desc: 'Weighted hunter blade. Slicing damage organ [WEAPON].', price: 40, stock: 1, buy: () => {
        const weapon = createOrganNode({ category: 'WEAPON', name: 'Poacher Steel Cleaver', damage: 16, tier: 1, isHuman: true });
        this.game.inventory.push(weapon);
        this.log({ text: 'Acquired Poacher\'s Steel Cleaver. Added to Carrier Sac.', type: 'harvest' });
      }},
      { id: 'studs', name: 'Pummeled Bone Studs', icon: '🛡️', desc: 'Hardened armor studs. Graftable protective node [GEAR].', price: 30, stock: 2, buy: () => {
        const gear = createOrganNode({ category: 'GEAR', name: 'Bone Armor Studs', defense: 4, tier: 1, isHuman: false });
        this.game.inventory.push(gear);
        this.log({ text: 'Acquired Bone Armor Studs. Added to Carrier Sac.', type: 'harvest' });
      }}
    ];

    this.tavernBounties = [
      { id: 'thorn_beast', title: 'Hunt the Verdant Thorn-Beast', location: 'Eastern Primeval Canopy', rewardShillings: 50, rewardXp: 30, desc: 'Quadruped beast with razor scythe limbs terrorizing woodcutters.', targetName: 'Verdant Thorn-Beast' },
      { id: 'scythe_mantis', title: 'Exterminate Apex Scythe-Mantis', location: 'Deep Primeval Canopy', rewardShillings: 80, rewardXp: 50, desc: 'Rare predatory insect ambushing glades from the upper redwoods.', targetName: 'Apex Scythe-Mantis' },
      { id: 'poacher_chief', title: 'Bounty: Rogue Poacher Chief', location: 'Wilderness Outskirts', rewardShillings: 110, rewardXp: 65, desc: 'Heavily armed deserter wielding stolen military steel.', targetName: 'Poacher Chief' }
    ];

    // DOM Elements
    this.poeTooltip = document.getElementById('poe-tooltip');
    this.logStream = document.getElementById('log-stream');

    // Status bar metrics
    this.vesselName = document.getElementById('vessel-name');
    this.vesselLvl = document.getElementById('vessel-lvl');
    this.concealVal = document.getElementById('conceal-val');
    this.disguiseStatus = document.getElementById('disguise-status');
    this.calText = document.getElementById('cal-text');
    this.calFill = document.getElementById('cal-fill');
    this.bloodText = document.getElementById('blood-text');
    this.bloodFill = document.getElementById('blood-fill');
    this.biomassText = document.getElementById('biomass-text');
    this.biomassFill = document.getElementById('biomass-fill');
    this.locName = document.getElementById('loc-name');
    this.depravityVal = document.getElementById('depravity-val');

    // Action Ribbon
    this.stageLocTitle = document.getElementById('stage-loc-title');
    this.stageLocTagline = document.getElementById('stage-loc-tagline');
    this.locationActionsStack = document.getElementById('location-actions-stack');

    // Combat Overlay
    this.combatOverlay = document.getElementById('combat-stage-overlay');
    this.combatActiveWeapons = document.getElementById('combat-active-weapons');
    this.combatVulnerableLimbs = document.getElementById('combat-vulnerable-limbs');
    this.combatReticlePreview = document.getElementById('combat-reticle-preview');
    this.enemyName = document.getElementById('enemy-name');
    this.enemyBloodTag = document.getElementById('enemy-blood-tag');
    this.enemyLimbsSelector = document.getElementById('enemy-limbs-selector');

    // Surgical Field Modal
    this.surgicalOverlay = document.getElementById('surgical-field-overlay');
    this.surgerySpecimenTitle = document.getElementById('surgery-specimen-title');
    this.vitalPulseVal = document.getElementById('vital-pulse-val');
    this.vitalPulseBar = document.getElementById('vital-pulse-bar');
    this.surgeryPartsGrid = document.getElementById('surgery-parts-grid');

    // Modals
    this.assemblyModal = document.getElementById('assembly-modal');
    this.crucibleModal = document.getElementById('crucible-modal');
    this.skillsModal = document.getElementById('skills-modal');
    this.levelupModal = document.getElementById('levelup-modal');
    this.skillBanner = document.getElementById('skill-awakened-banner');

    this.initControls();
  }

  initControls() {
    // Top Bar Modal Openers
    document.getElementById('btn-open-assembly')?.addEventListener('click', () => {
      this.openAssemblyModal();
    });
    document.getElementById('btn-close-assembly')?.addEventListener('click', () => {
      this.assemblyModal.classList.add('hidden');
    });

    document.getElementById('btn-open-crucible')?.addEventListener('click', () => {
      this.openCrucibleModal();
    });
    document.getElementById('btn-close-crucible')?.addEventListener('click', () => {
      this.crucibleModal.classList.add('hidden');
    });

    document.getElementById('btn-open-skills')?.addEventListener('click', () => {
      this.openSkillsModal();
    });
    document.getElementById('btn-close-skills')?.addEventListener('click', () => {
      this.skillsModal.classList.add('hidden');
    });

    document.getElementById('btn-audio-toggle')?.addEventListener('click', () => {
      const isMuted = this.game.audio.toggleMute();
      this.log({ text: isMuted ? 'Audio muted.' : 'Audio unmuted.', type: 'info' });
    });

    // Market & Tavern Modals
    document.getElementById('btn-close-market')?.addEventListener('click', () => {
      document.getElementById('market-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-close-tavern')?.addEventListener('click', () => {
      document.getElementById('tavern-modal')?.classList.add('hidden');
    });

    // Tavern Stew Eating
    document.getElementById('btn-buy-stew')?.addEventListener('click', () => {
      if ((this.game.shillings || 0) < 8) {
        this.log({ text: 'Not enough shillings for stew (Need 8 Shillings).', type: 'threat' });
        return;
      }
      this.game.shillings -= 8;
      this.game.restoreCalories(50);
      this.game.audio.playSlice();
      this.log({ text: 'Consumed hearty venison stew (+50 Calories).', type: 'harvest' });
      this.updateStatusBar();
      this.renderTavernModal();
    });

    // Surgical Field buttons
    document.getElementById('btn-dissolve-corpse')?.addEventListener('click', () => {
      this.game.surgery.dissolveCorpse();
    });
    document.getElementById('btn-close-surgery')?.addEventListener('click', () => {
      this.game.surgery.closeField();
    });

    // Bio-Crucible execution
    document.getElementById('btn-execute-synthesis')?.addEventListener('click', () => {
      this.executeAlchemySynthesis();
    });
  }

  updateAll() {
    this.updateStatusBar();
    this.renderActionRibbon();
    if (this.game.combat.activeBattle) {
      this.renderCombatHUD();
    }
  }

  updateStatusBar() {
    const totals = this.game.chimera.computeTotals();

    if (this.vesselName) this.vesselName.textContent = this.game.chimera.root.name;
    if (this.vesselLvl) this.vesselLvl.textContent = `LVL ${this.game.level}`;

    if (this.concealVal) this.concealVal.textContent = `${totals.concealment}%`;
    if (this.disguiseStatus) {
      if (totals.concealment >= 70) {
        this.disguiseStatus.textContent = '[WANDERER DISGUISE]';
        this.disguiseStatus.style.color = '#10b981';
      } else if (totals.concealment >= 35) {
        this.disguiseStatus.textContent = '[MUTANT SUSPECT]';
        this.disguiseStatus.style.color = '#f59e0b';
      } else {
        this.disguiseStatus.textContent = '[ABOMINATION: ALARM]';
        this.disguiseStatus.style.color = '#f43f5e';
      }
    }

    // Calories
    if (this.calText) this.calText.textContent = `${Math.round(this.game.calories)}/${this.game.maxCalories}`;
    if (this.calFill) this.calFill.style.width = `${(this.game.calories / this.game.maxCalories) * 100}%`;

    // Blood
    if (this.bloodText) this.bloodText.textContent = `${Math.round(this.game.blood)}/${this.game.maxBlood}`;
    if (this.bloodFill) this.bloodFill.style.width = `${(this.game.blood / this.game.maxBlood) * 100}%`;

    // Biomass
    if (this.biomassText) this.biomassText.textContent = `${this.game.biomassXp}/${this.game.maxBiomassXp}`;
    if (this.biomassFill) this.biomassFill.style.width = `${(this.game.biomassXp / this.game.maxBiomassXp) * 100}%`;

    // Location & Depravity
    if (this.locName) this.locName.textContent = this.game.locations.currentLocation.name;
    if (this.depravityVal) this.depravityVal.textContent = this.game.depravityScore;
  }

  renderActionRibbon() {
    if (!this.locationActionsStack) return;
    this.locationActionsStack.innerHTML = '';

    const loc = this.game.locations.currentLocation;
    const totals = this.game.chimera.computeTotals();

    if (this.stageLocTitle) this.stageLocTitle.textContent = loc.name.toUpperCase();
    if (this.stageLocTagline) this.stageLocTagline.textContent = loc.tagline;

    if (loc.id === 'CITY') {
      if (totals.concealment >= 30) {
        this.addActionBtn('🛒 WANDER COBBLESTONE MARKET', 'Visit flesh-apothecary & buy bandages', () => {
          this.openMarketModal();
        });

        this.addActionBtn('🍺 ENTER HUNTER TAVERN', 'Eavesdrop on rare beast bounties', () => {
          this.openTavernModal();
        });

        const travelCost = this.game.locations.calculateActionCost(4.0);
        this.addActionBtn('🌲 VENTURE INTO THE PRIMEVAL FOREST', `Trek into the wilderness to hunt (-${travelCost} Cal)`, () => {
          this.game.consumeCalories(travelCost);
          this.game.locations.setLocation('FOREST');
          this.log({ text: `Departed city gates. Entering primeval forest canopy (-${travelCost} Calories).`, type: 'info' });
          this.updateAll();
        });

        this.addActionBtn('🩸 INCITE MIDNIGHT SLAUGHTER', 'Raid garrison & harvest human skulls', () => {
          this.log({ text: '⚠️ GARRISON ATTACK! The Worm unleashes its horror upon the city watch!', type: 'threat' });
          this.game.depravityScore += 25;
          this.game.startCombatEncounter({ name: 'City Watch Captain', isHuman: true, tier: 2 });
        }, true);
      } else {
        // Low Concealment Alert!
        this.addActionBtn('⚠️ DEFEND AGAINST TOWN GARRISON', 'City bells toll! Guards draw steel!', () => {
          this.game.startCombatEncounter({ name: 'Inquisition Purger', isHuman: true, tier: 2 });
        }, true);

        this.addActionBtn('🏃 FLEE INTO THE PRIMEVAL FOREST', 'Escape into the shadowy boughs', () => {
          this.game.locations.setLocation('FOREST');
          this.log({ text: 'Fled from the city under a hail of crossbow bolts.', type: 'info' });
          this.updateAll();
        });
      }
    } else if (loc.id === 'FOREST') {
      const exploreCost = this.game.locations.calculateActionCost(2.5);
      this.addActionBtn(`🌿 EXPLORE / VENTURE DEEPER`, `Stalk prey through the canopy (-${exploreCost} Cal)`, () => {
        this.game.locations.exploreForest(() => this.updateAll());
      });

      this.addActionBtn('⛺ SET BIOMECHANICAL CAMP', 'Rest, mutate in crucible, assemble limbs', () => {
        this.game.locations.setLocation('CAMP');
        this.log({ text: 'Sheltered beneath ancient root hollows.', type: 'info' });
        this.updateAll();
      });

      const returnCost = this.game.locations.calculateActionCost(3.5);
      this.addActionBtn('🏙️ RETURN TO OAKHAVEN CITY', `Trek back to the frontier settlement (-${returnCost} Cal)`, () => {
        this.game.consumeCalories(returnCost);
        this.game.locations.setLocation('CITY');
        this.log({ text: `Approaching the gas-lit outskirts of Oakhaven (-${returnCost} Calories).`, type: 'info' });
        this.updateAll();
      });
    } else if (loc.id === 'CAMP') {
      this.addActionBtn('🧬 OPEN CHIMERA ASSEMBLY RIG', 'Graft and rearrange branching limbs', () => {
        this.openAssemblyModal();
      });

      this.addActionBtn('⚗️ BIO-ALCHEMICAL CRUCIBLE', 'Sacrifice fodder to permanently boost stats', () => {
        this.openCrucibleModal();
      });

      this.addActionBtn('🌲 RESUME FOREST HUNT', 'Leave root camp and stalk the deep canopy', () => {
        this.game.locations.setLocation('FOREST');
        this.log({ text: 'Departed camp. Resuming forest stalk.', type: 'info' });
        this.updateAll();
      });
    }
  }

  addActionBtn(label, hint, onClick, isDanger = false) {
    const btn = document.createElement('button');
    btn.className = `ribbon-action-btn ${isDanger ? 'action-btn-danger' : ''}`;
    btn.innerHTML = `<span>${label}</span> <span class="cost-pill">${hint}</span>`;
    btn.addEventListener('click', () => {
      this.game.audio.playSlice();
      onClick();
    });
    this.locationActionsStack.appendChild(btn);
  }

  /* ==========================================================================
     COMBAT STAGE HUD (Direct Anatomical Target Hover & Strike)
     ========================================================================== */
  openCombatHUD(battle) {
    if (!this.combatOverlay) return;
    this.combatOverlay.classList.remove('hidden');
    document.getElementById('action-ribbon-container')?.classList.add('hidden');
    this.renderCombatHUD();
  }

  renderCombatHUD() {
    const battle = this.game.combat.activeBattle;
    if (!battle) {
      this.combatOverlay.classList.add('hidden');
      document.getElementById('action-ribbon-container')?.classList.remove('hidden');
      return;
    }

    // Top Specimen Telemetry
    const nameEl = document.getElementById('enemy-name');
    const subTagEl = document.getElementById('enemy-sub-tag');
    const bloodValEl = document.getElementById('enemy-blood-val');
    const bloodFillEl = document.getElementById('enemy-blood-fill');

    if (nameEl) nameEl.textContent = battle.name.toUpperCase();
    if (subTagEl) subTagEl.textContent = battle.isHuman ? `[Hostile Human • Tier ${battle.tier}]` : `[Primeval Fauna • Tier ${battle.tier}]`;
    if (bloodValEl) bloodValEl.textContent = `${battle.blood}%`;
    if (bloodFillEl) bloodFillEl.style.width = `${battle.blood}%`;

    // Render Transparent Modular Creature Sprite on Canvas
    const spriteCanvas = document.getElementById('creature-sprite-canvas');
    if (spriteCanvas && this.game.assets) {
      const beastSprite = this.game.assets.get('beast');
      if (beastSprite) {
        const sCtx = spriteCanvas.getContext('2d');
        sCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
        sCtx.drawImage(beastSprite, 0, 0, spriteCanvas.width, spriteCanvas.height);
      }
    }

    // Render Player Active Weapons
    if (this.combatActiveWeapons) {
      this.combatActiveWeapons.innerHTML = '';
      const weapons = this.game.chimera.getAllNodes().filter(n => n.category === 'WEAPON');
      if (weapons.length === 0) {
        this.combatActiveWeapons.innerHTML = '<span style="color: #64748b; font-size: 10px;">Unarmed Strikes (4 ATK)</span>';
      } else {
        if (!this.selectedWeaponNode || !weapons.includes(this.selectedWeaponNode)) {
          this.selectedWeaponNode = weapons[0];
        }
        weapons.forEach(w => {
          const card = document.createElement('div');
          card.className = `weapon-strike-card ${this.selectedWeaponNode === w ? 'selected' : ''}`;
          card.innerHTML = `<span>${w.icon || '⚔️'} ${w.name}</span> <span style="color: #f43f5e; font-weight: 800;">${w.damage} ATK</span>`;
          card.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
          card.addEventListener('click', () => {
            this.selectedWeaponNode = w;
            this.renderCombatHUD();
          });
          this.combatActiveWeapons.appendChild(card);
        });
      }
    }

    // Direct Interactive SVG Targeting on Creature Limbs!
    const svgLimbGroups = document.querySelectorAll('#creature-target-svg .creature-limb-group');
    const reticle = document.getElementById('combat-hover-reticle');

    svgLimbGroups.forEach(group => {
      const limbId = group.dataset.limb;
      const limb = battle.limbs.find(l => l.id === limbId);

      // Clone node to strip stale listeners
      const freshGroup = group.cloneNode(true);
      group.parentNode.replaceChild(freshGroup, group);

      if (!limb || limb.isSevered) {
        freshGroup.classList.add('severed');
        return;
      } else {
        freshGroup.classList.remove('severed');
      }

      freshGroup.addEventListener('mouseenter', (e) => {
        freshGroup.classList.add('targeted');
        const totals = this.game.chimera.computeTotals();
        const baseAtk = this.selectedWeaponNode ? this.selectedWeaponNode.damage : totals.totalDmg;
        const estDmg = Math.max(2, baseAtk - limb.armor);

        const retName = document.getElementById('reticle-name');
        const retHit = document.getElementById('reticle-hit');
        const retDmg = document.getElementById('reticle-dmg');
        const retArmor = document.getElementById('reticle-armor');
        const retTrait = document.getElementById('reticle-trait');
        const retStatus = document.getElementById('reticle-status');

        if (retName) retName.textContent = limb.name.toUpperCase();
        if (retHit) retHit.textContent = `${limb.hitChance}%`;
        if (retDmg) retDmg.textContent = `${estDmg} Dmg`;
        if (retArmor) retArmor.textContent = `${limb.armor}`;
        if (retTrait) retTrait.textContent = limb.isVital ? '💀 Lethal Vital Organ' : '⚡ Severable Appendage';
        if (retStatus) retStatus.textContent = `[${limb.hp}/${limb.maxHp} HP]`;

        if (reticle) {
          reticle.classList.remove('hidden');
          reticle.style.left = `${e.clientX + 15}px`;
          reticle.style.top = `${e.clientY - 20}px`;
        }
        this.game.audio.playNerveTwitch();
      });

      freshGroup.addEventListener('mousemove', (e) => {
        if (reticle) {
          reticle.style.left = `${e.clientX + 15}px`;
          reticle.style.top = `${e.clientY - 20}px`;
        }
      });

      freshGroup.addEventListener('mouseleave', () => {
        freshGroup.classList.remove('targeted');
        if (reticle) reticle.classList.add('hidden');
      });

      freshGroup.addEventListener('click', (e) => {
        if (reticle) reticle.classList.add('hidden');
        this.spawnDamageFlyoff(e.clientX, e.clientY, `-${Math.max(2, (this.selectedWeaponNode ? this.selectedWeaponNode.damage : 8) - limb.armor)}`);
        this.game.combat.playerStrikeLimb(limbId, this.selectedWeaponNode);

        if (this.game.combat.activeBattle) {
          this.renderCombatHUD();
        }
      });
    });
  }

  spawnDamageFlyoff(x, y, text = 'HIT!') {
    const layer = document.getElementById('combat-damage-layer');
    if (!layer) return;
    const fly = document.createElement('div');
    fly.className = 'combat-float-num';
    fly.textContent = text;
    fly.style.left = `${x}px`;
    fly.style.top = `${y}px`;
    layer.appendChild(fly);
    setTimeout(() => fly.remove(), 900);
  }

  /* ==========================================================================
     SURGICAL FIELD RADIAL CALLOUT TRIAGE
     ========================================================================== */
  renderSurgicalModal(specimen, vitalPulse, isFlatlined) {
    if (!this.surgicalOverlay) return;
    this.surgicalOverlay.classList.remove('hidden');
    this.combatOverlay?.classList.add('hidden');

    if (this.surgerySpecimenTitle) this.surgerySpecimenTitle.textContent = specimen.name.toUpperCase();
    if (this.vitalPulseVal) this.vitalPulseVal.textContent = isFlatlined ? '0% [FLATLINE]' : `${vitalPulse}%`;
    if (this.vitalPulseBar) this.vitalPulseBar.style.width = `${vitalPulse}%`;

    const layer = document.getElementById('radial-callouts-layer');
    const svgLines = document.getElementById('radial-lines-svg');
    if (!layer) return;

    layer.innerHTML = '';
    if (svgLines) svgLines.innerHTML = '';

    const items = specimen.harvestables;
    const total = items.length;
    const centerX = 450;
    const centerY = 260;
    const radiusX = 320;
    const radiusY = 170;

    items.forEach((item, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      const posX = centerX + Math.cos(angle) * radiusX;
      const posY = centerY + Math.sin(angle) * radiusY;

      const card = document.createElement('div');
      card.className = `radial-callout-card ${item.isHarvested ? 'harvested' : ''} ${item.feastOnly ? 'feast-card' : ''}`;
      card.style.left = `${posX}px`;
      card.style.top = `${posY}px`;

      const statusTag = item.isHarvested 
        ? '<span class="status-harvested">[EXTRACTED]</span>'
        : (isFlatlined && !item.isGroundLoot && item.pulseCost > 20)
          ? '<span class="status-necrotic">[NECROTIC]</span>'
          : item.feastOnly
            ? `<span class="status-feast">+${item.calories} CAL</span>`
            : `<span class="status-pulse">-${item.pulseCost}% Pulse</span>`;

      card.innerHTML = `
        <div class="callout-card-header">
          <span class="callout-item-name">${item.name}</span>
          <span class="callout-rarity rarity-${item.rarity || 'common'}">${(item.rarity || 'COMMON').toUpperCase()}</span>
        </div>
        <div class="callout-card-body">
          <span>${item.feastOnly ? 'Feast On Biomass' : `Extraction: ${item.harvestChance}%`}</span>
          ${statusTag}
        </div>
      `;

      card.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
      card.addEventListener('click', () => {
        this.game.surgery.extractOrgan(item.id);
      });

      layer.appendChild(card);

      if (svgLines) {
        const anchorX = centerX + Math.cos(angle) * 75;
        const anchorY = centerY + Math.sin(angle) * 45;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', anchorX);
        line.setAttribute('y1', anchorY);
        line.setAttribute('x2', posX);
        line.setAttribute('y2', posY);
        line.setAttribute('stroke', item.feastOnly ? '#f43f5e' : '#38bdf8');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('opacity', '0.65');
        svgLines.appendChild(line);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', anchorX);
        circle.setAttribute('cy', anchorY);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', item.feastOnly ? '#f43f5e' : '#00f0ff');
        svgLines.appendChild(circle);
      }
    });
  }

  /* ==========================================================================
     MARKETPLACE & TAVERN MODALS
     ========================================================================== */
  openMarketModal() {
    const modal = document.getElementById('market-modal');
    if (!modal) return;
    this.renderMarketModal();
    modal.classList.remove('hidden');
  }

  renderMarketModal() {
    const shillingsEl = document.getElementById('market-shillings-val');
    const sacEl = document.getElementById('market-sac-val');
    const buyList = document.getElementById('market-items-list');
    const sellList = document.getElementById('market-sell-list');

    if (shillingsEl) shillingsEl.textContent = this.game.shillings || 0;
    if (sacEl) sacEl.textContent = this.game.inventory.length;

    // Render Buy Shelf
    if (buyList) {
      buyList.innerHTML = '';
      this.marketWares.forEach(ware => {
        const canAfford = (this.game.shillings || 0) >= ware.price;
        const inStock = ware.stock > 0;

        const card = document.createElement('div');
        card.className = 'market-ware-card';
        card.innerHTML = `
          <div class="ware-info">
            <div class="ware-title-row">
              <span class="ware-name">${ware.icon} ${ware.name}</span>
              <span class="ware-stock">[STOCK: ${ware.stock}]</span>
            </div>
            <p class="ware-desc">${ware.desc}</p>
          </div>
          <div class="ware-action">
            <button class="hud-btn ${canAfford && inStock ? 'p5-btn-gold' : 'p5-btn'}" ${!canAfford || !inStock ? 'disabled' : ''}>
              ${!inStock ? 'OUT OF STOCK' : `BUY [${ware.price} S]`}
            </button>
          </div>
        `;

        const btn = card.querySelector('button');
        if (btn && canAfford && inStock) {
          btn.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
          btn.addEventListener('click', () => {
            this.game.shillings -= ware.price;
            ware.stock--;
            ware.buy();
            this.game.audio.playSlice();
            this.updateStatusBar();
            this.renderMarketModal();
          });
        }
        buyList.appendChild(card);
      });
    }

    // Render Sell Shelf (Organs in Sac)
    if (sellList) {
      sellList.innerHTML = '';
      if (this.game.inventory.length === 0) {
        sellList.innerHTML = '<div style="color: #64748b; font-size: 11px; padding: 12px;">Your Carrier Sac contains no harvested organs to sell. Hunt beasts in the forest to butcher parts!</div>';
      } else {
        this.game.inventory.forEach((part, index) => {
          const sellValue = Math.round(15 * (part.tier || 1) + (part.damage || 0) + (part.defense || 0));
          const card = document.createElement('div');
          card.className = 'market-ware-card';
          card.innerHTML = `
            <div class="ware-info">
              <div class="ware-title-row">
                <span class="ware-name">${part.icon || '🧬'} ${part.name}</span>
                <span class="ware-stock rarity-${part.rarity || 'common'}">[${(part.rarity || 'COMMON').toUpperCase()}]</span>
              </div>
              <p class="ware-desc">${part.desc || 'Biological specimen harvested from the wild.'}</p>
            </div>
            <div class="ware-action">
              <button class="hud-btn p5-btn-danger">
                SELL [+${sellValue} S]
              </button>
            </div>
          `;

          const btn = card.querySelector('button');
          if (btn) {
            btn.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
            btn.addEventListener('click', () => {
              this.game.shillings = (this.game.shillings || 0) + sellValue;
              this.game.inventory.splice(index, 1);
              this.game.audio.playSquelch();
              this.log({ text: `Sold [${part.name}] to apothecary for +${sellValue} Shillings.`, type: 'harvest' });
              this.updateStatusBar();
              this.renderMarketModal();
            });
          }
          sellList.appendChild(card);
        });
      }
    }
  }

  openTavernModal() {
    const modal = document.getElementById('tavern-modal');
    if (!modal) return;
    this.renderTavernModal();
    modal.classList.remove('hidden');
  }

  renderTavernModal() {
    const bountiesList = document.getElementById('tavern-bounties-list');
    if (!bountiesList) return;
    bountiesList.innerHTML = '';

    this.tavernBounties.forEach(bounty => {
      const isActive = this.game.activeBounty === bounty.id;
      const card = document.createElement('div');
      card.className = `tavern-bounty-card ${isActive ? 'bounty-active' : ''}`;
      card.innerHTML = `
        <div class="bounty-header">
          <span class="bounty-title">📜 ${bounty.title}</span>
          <span class="bounty-reward">REWARD: ${bounty.rewardShillings} S • +${bounty.rewardXp} XP</span>
        </div>
        <p class="bounty-desc">${bounty.desc}</p>
        <div class="bounty-action">
          <button class="hud-btn ${isActive ? 'p5-btn-gold' : 'p5-btn'}">
            ${isActive ? 'ACTIVE CONTRACT (TRACKING)' : 'ACCEPT BOUNTY'}
          </button>
        </div>
      `;

      const btn = card.querySelector('button');
      if (btn && !isActive) {
        btn.addEventListener('mouseenter', () => this.game.audio.playNerveTwitch());
        btn.addEventListener('click', () => {
          this.game.activeBounty = bounty.id;
          this.game.audio.playSlice();
          this.log({ text: `Accepted Guild Bounty: [${bounty.title}]! Target haunts the ${bounty.location}.`, type: 'threat' });
          this.renderTavernModal();
        });
      }
      bountiesList.appendChild(card);
    });
  }

  hideSurgicalModal() {
    this.surgicalOverlay?.classList.add('hidden');
    document.getElementById('action-ribbon-container')?.classList.remove('hidden');
  }

  /* ==========================================================================
     CHIMERA NODE-SOCKET ASSEMBLY MODAL
     ========================================================================== */
  openAssemblyModal() {
    if (!this.assemblyModal) return;
    this.assemblyModal.classList.remove('hidden');
    this.renderAssemblyModal();
  }

  renderAssemblyModal() {
    const container = document.getElementById('tree-nodes-container');
    const sacGrid = document.getElementById('carrier-sac-grid');
    const massVal = document.getElementById('chimera-mass-val');
    const sacCount = document.getElementById('sac-count');
    const summary = document.getElementById('assembly-stats-summary');

    const totals = this.game.chimera.computeTotals();
    if (massVal) massVal.textContent = totals.totalMass;
    if (sacCount) sacCount.textContent = this.game.inventory.length;

    if (summary) {
      summary.innerHTML = `
        <span style="color: #f43f5e;">⚔️ ATK: +${totals.totalDmg}</span>
        <span style="color: #38bdf8;">🛡️ DEF: +${totals.totalDef}</span>
        <span style="color: #4ade80;">❤️ MAX HP: +${totals.totalHpBonus}</span>
        <span style="color: #f59e0b;">⚡ CAL DRAIN: -${totals.totalCalorieDrain}/step</span>
        <span style="color: #a855f7;">🧠 BANDWIDTH: ${totals.totalBandwidth}</span>
      `;
    }

    // Render Tree Nodes
    if (container) {
      container.innerHTML = '';
      const allNodes = this.game.chimera.getAllNodes();
      allNodes.forEach(node => {
        const card = document.createElement('div');
        card.className = 'tree-node-card';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-weight: 800;">
            <span>${node.icon} ${node.name} (Lvl ${node.level})</span>
            <span style="font-size: 8px; color: #94a3b8;">${node.category}</span>
          </div>
          <div style="font-size: 8px; color: #64748b;">
            Dmg: +${node.damage} | Def: +${node.defense} | Cal: ${node.getEffectiveCalorieCost()}/step | Wt: ${node.weight}kg
          </div>
          <div class="node-sockets-row">
            ${node.sockets.map(s => `
              <div class="socket-pill" data-node-id="${node.id}" data-socket-id="${s.socketId}">
                [+] ${s.label}: ${s.childNode ? `<strong>${s.childNode.name}</strong>` : '<em style="color: #64748b;">Empty</em>'}
              </div>
            `).join('')}
          </div>
        `;

        // Socket click handles attaching selected item or detaching
        card.querySelectorAll('.socket-pill').forEach(pill => {
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            const nId = pill.getAttribute('data-node-id');
            const sId = pill.getAttribute('data-socket-id');
            this.handleSocketClick(nId, sId);
          });
        });

        container.appendChild(card);
      });
    }

    // Render Carrier Sac Inventory
    if (sacGrid) {
      sacGrid.innerHTML = '';
      this.game.inventory.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'tree-node-card';
        card.innerHTML = `
          <div style="font-weight: 800; font-size: 10px;">${item.icon} ${item.name}</div>
          <div style="font-size: 8px; color: #94a3b8;">${item.category} • Dmg: ${item.damage}</div>
          <button style="font-size: 8px; margin-top: 4px; padding: 2px 4px; background: #00f0ff; color: #000; font-weight: 700; border: none; cursor: pointer;">
            Graft to Selected Socket
          </button>
        `;

        card.addEventListener('click', () => {
          if (this.selectedSocketTarget) {
            const { parentId, socketId } = this.selectedSocketTarget;
            const res = this.game.chimera.attachPart(parentId, socketId, item);
            if (res.success) {
              this.game.inventory.splice(idx, 1);
              if (res.displacedPart) this.game.inventory.push(res.displacedPart);
              this.selectedSocketTarget = null;
              this.game.audio.playSquelch();
              this.log({ text: `Grafted [${item.name}] into chimera rig!`, type: 'harvest' });
              this.renderAssemblyModal();
              this.game.updateAll();
            }
          } else {
            this.log({ text: `Click an open [+] socket on a limb first!`, type: 'info' });
          }
        });

        sacGrid.appendChild(card);
      });
    }
  }

  handleSocketClick(nodeId, socketId) {
    const node = this.game.chimera.findNode(nodeId);
    const socket = node.sockets.find(s => s.socketId === socketId);

    if (socket && socket.childNode) {
      // Unplug child limb
      const res = this.game.chimera.detachPart(socket.childNode.id);
      if (res.success) {
        this.game.inventory.push(...res.allDetached);
        this.game.audio.playSquelch();
        this.log({ text: `Detached [${res.detachedRoot.name}] and child branches to sac.`, type: 'info' });
        this.renderAssemblyModal();
        this.game.updateAll();
      }
    } else {
      this.selectedSocketTarget = { parentId: nodeId, socketId };
      this.log({ text: `Socket [${socket.label}] selected. Click any organ in Carrier Sac to attach!`, type: 'harvest' });
    }
  }

  /* ==========================================================================
     BIO-CRUCIBLE (REFRAIN ALCHEMY SYNTHESIS)
     ========================================================================== */
  openCrucibleModal() {
    if (!this.crucibleModal) return;
    this.crucibleModal.classList.remove('hidden');
    this.renderCrucibleModal();
  }

  renderCrucibleModal() {
    const baseDisplay = document.getElementById('selected-base-display');
    const fodderRow = document.getElementById('fodder-slots-row');
    const forecast = document.getElementById('crucible-forecast-box');
    const slurryVal = document.getElementById('slurry-val');
    const execBtn = document.getElementById('btn-execute-synthesis');

    if (slurryVal) slurryVal.textContent = this.game.bioSlurry;

    if (baseDisplay) {
      baseDisplay.textContent = this.crucibleBaseNode
        ? `[BASE] ${this.crucibleBaseNode.name} (${this.crucibleBaseNode.damage} ATK • ${this.crucibleBaseNode.synthesisCount}/${this.crucibleBaseNode.maxSyntheses} Syntheses)`
        : 'Click an organ in Carrier Sac to select as Base';
    }

    if (fodderRow) {
      fodderRow.innerHTML = '';
      for (let i = 0; i < 8; i++) {
        const fodder = this.crucibleFodderNodes[i] || null;
        const box = document.createElement('div');
        box.className = `fodder-slot-box ${fodder ? 'filled' : ''}`;
        box.innerHTML = fodder
          ? `<span>${fodder.name}</span><br><span style="color: #4ade80;">+${fodder.damage} ATK</span>`
          : `[Fodder ${i + 1}]`;

        box.addEventListener('click', () => {
          if (fodder) {
            this.crucibleFodderNodes.splice(i, 1);
            this.renderCrucibleModal();
          }
        });
        fodderRow.appendChild(box);
      }
    }

    if (execBtn) {
      execBtn.disabled = !this.crucibleBaseNode || this.crucibleFodderNodes.length === 0;
    }

    if (forecast) {
      if (this.crucibleBaseNode && this.crucibleFodderNodes.length > 0) {
        forecast.innerHTML = `
          <strong>Synthesis Forecast:</strong>
          Consuming ${this.crucibleFodderNodes.length} fodder limbs will permanently reinforce <strong>${this.crucibleBaseNode.name}</strong>.
          Cost: ${this.crucibleFodderNodes.length * 15} Bio-Slurry.
        `;
      } else {
        forecast.textContent = 'Select base organ and sacrificial fodder to preview synthesis outcome...';
      }
    }
  }

  executeAlchemySynthesis() {
    if (!this.crucibleBaseNode || this.crucibleFodderNodes.length === 0) return;

    const res = RefrainAlchemyCrucible.synthesize({
      baseNode: this.crucibleBaseNode,
      fodderNodes: this.crucibleFodderNodes,
      bioSlurryAvailable: this.game.bioSlurry
    });

    if (res.success) {
      this.game.bioSlurry -= res.slurryConsumed;
      // Remove fodder from inventory
      this.game.inventory = this.game.inventory.filter(item => !this.crucibleFodderNodes.includes(item));
      this.crucibleFodderNodes = [];
      this.game.audio.playSquelch();
      this.log({
        text: `Alchemy Synthesis successful! [${this.crucibleBaseNode.name}] reinforced: +${res.gainedAtk} ATK!`,
        type: 'harvest'
      });
      this.renderCrucibleModal();
      this.game.updateAll();
    } else {
      this.log({ text: `Synthesis failed: ${res.reason}`, type: 'threat' });
    }
  }

  /* ==========================================================================
     SKILLS & LEVEL UP MODALS
     ========================================================================== */
  openSkillsModal() {
    if (!this.skillsModal) return;
    this.skillsModal.classList.remove('hidden');
    const grid = document.getElementById('skills-grid');
    if (grid) {
      grid.innerHTML = '';
      const awakened = this.game.skills.getAwakenedSkills();
      awakened.forEach(s => {
        const card = document.createElement('div');
        card.className = 'skill-card';
        card.innerHTML = `
          <div style="font-weight: 800; color: #00f0ff;">${s.name} (Rank ${s.rank})</div>
          <div style="font-size: 8px; color: #94a3b8;">${s.desc}</div>
          <div style="font-size: 8px; color: #f59e0b; margin-top: 4px;">XP: ${s.xp}/${s.maxXp}</div>
        `;
        grid.appendChild(card);
      });
    }
  }

  showSkillAwakenedBanner(skill) {
    if (!this.skillBanner) return;
    document.getElementById('awakened-skill-name').textContent = `${skill.name.toUpperCase()} (RANK 1)`;
    this.skillBanner.classList.remove('hidden');
    setTimeout(() => {
      this.skillBanner.classList.add('hidden');
    }, 3500);
  }

  showLevelUpModal() {
    if (!this.levelupModal) return;
    this.levelupModal.classList.remove('hidden');
    const boonsRow = document.getElementById('boons-row');
    if (boonsRow) {
      boonsRow.innerHTML = '';
      const boons = [
        { title: 'Metabolic Efficiency', desc: '-15% Calorie consumption across all attached limbs.', apply: () => this.game.activeBoons.push('metabolic') },
        { title: 'Nerve Lattice Insulation', desc: '+5 Part Socket Capacity before motor complexity penalties.', apply: () => this.game.activeBoons.push('nerve') },
        { title: 'Vascular Hypertrophy', desc: '+30 Max Blood Volume and +10 Blood restoration on feasts.', apply: () => { this.game.maxBlood += 30; this.game.blood += 30; } }
      ];

      boons.forEach(b => {
        const card = document.createElement('div');
        card.className = 'boon-card';
        card.innerHTML = `
          <h3 style="font-family: var(--font-serif); font-size: 13px; color: #f59e0b;">${b.title}</h3>
          <p style="font-size: 9px; color: #94a3b8;">${b.desc}</p>
        `;
        card.addEventListener('click', () => {
          b.apply();
          this.game.audio.playSlice();
          this.log({ text: `Mutational Boon Chosen: [${b.title}]!`, type: 'harvest' });
          this.levelupModal.classList.add('hidden');
          this.game.updateAll();
        });
        boonsRow.appendChild(card);
      });
    }
  }

  showGameOverModal(stats = {}) {
    const modal = document.getElementById('game-over-modal');
    if (!modal) return;

    const biomassEl = document.getElementById('go-biomass');
    if (biomassEl) biomassEl.textContent = stats.biomass ?? this.game.biomassXp;

    const depEl = document.getElementById('go-depravity');
    if (depEl) depEl.textContent = stats.depravity ?? this.game.depravityScore;

    const massEl = document.getElementById('go-mass');
    if (massEl) massEl.textContent = `${stats.mass ?? this.game.chimera.computeTotals().totalMass} KG`;

    // Award bonus Primordial Slurry for the meta progression
    if (this.game.startMenu) {
      const earnedSlurry = Math.round((stats.biomass ?? this.game.biomassXp) * 0.5) + 30;
      this.game.startMenu.metaData.primordialSlurry += earnedSlurry;
      this.game.startMenu.saveMeta();
      this.log({ text: `💀 Vessel dissolved. +${earnedSlurry} Primordial Slurry preserved in Sanctuary.`, type: 'harvest' });
    }

    modal.classList.remove('hidden');

    const btnRestart = document.getElementById('btn-gameover-restart');
    if (btnRestart && !btnRestart._hasListener) {
      btnRestart._hasListener = true;
      btnRestart.addEventListener('click', () => {
        modal.classList.add('hidden');
        this.game.resetGame();
        this.game.startMenu?.showMenu();
      });
    }

    const btnSanctuary = document.getElementById('btn-gameover-sanctuary');
    if (btnSanctuary && !btnSanctuary._hasListener) {
      btnSanctuary._hasListener = true;
      btnSanctuary.addEventListener('click', () => {
        this.game.startMenu?.openSanctuary();
      });
    }
  }

  log({ text, type = 'info' }) {
    if (!this.logStream) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = text;
    this.logStream.appendChild(entry);
    this.logStream.scrollTop = this.logStream.scrollHeight;
  }
}
