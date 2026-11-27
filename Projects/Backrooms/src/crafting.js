/**
 * CraftingSystem: Manages raw material inventory, recipe requirements,
 * discount multipliers, and dynamic workbench UI updates.
 */
export class CraftingSystem {
  constructor(onNotification) {
    this.onNotification = onNotification || (() => {});

    this.inventory = {
      drywall: 0,
      wood: 0,
      copper: 0,
      ballast: 0,
      fiber: 0,
      ceramic: 0,
      scrap: 0,
      pvc: 0,
      rebar: 0,
      plastic: 0,
      caster: 0,
      piston: 0,
      fitting: 0,
      barricades: 0,
      scaffolding: 0,
      beacons: 0,
      jumppads: 0,
      core: 0
    };

    this.inventoryManager = null;
    this.lanternUnlocked = false;
    this.costDiscount = 1.0;
    this.folders = ['WEAPONS', 'UPGRADES', 'PLACEABLES'];
    this.activeFolderIndex = 0;
    this.selectedIndex = 0;
    this.isBuildMenuOpen = false;
    this._recipeCardEls = [];
    this._buildCardEls = [];
    this._invEls = null;

    this.recipes = [
      // --- WEAPONS ---
      {
        key: 'breaching_charge',
        folder: 'WEAPONS',
        hotkey: 'HOTBAR',
        name: 'Shaped Breaching Charge (x3)',
        baseCost: { copper: 4, ballast: 2, scrap: 3 },
        desc: 'A volatile copper-lined demolition pack wired to a flickering ballast fuse. The only reliable way to punch through reinforced concrete subfloors, acoustic ceiling slabs, and Poolroom basins.',
        effect: (player, prog) => {
          if (this.inventoryManager) this.inventoryManager.addItem('breaching_charge', 3);
          prog.addXp(30);
          this.onNotification('Fabricated 3x Shaped Breaching Charges.', 'amber');
        }
      },
      {
        key: 'pneumatic_ram',
        folder: 'WEAPONS',
        hotkey: 'MELEE',
        name: 'Pneumatic Breaching Ram',
        baseCost: { piston: 2, caster: 3, scrap: 5 },
        desc: 'A salvaged hydraulic actuator bolted onto your prybar spine. Every swing delivers a bone-rattling shockwave that pulverizes reinforced pillars and staggers anything lurking in the dark.',
        effect: (player, prog) => {
          player.harvestPower += 65;
          prog.addXp(60);
          this.onNotification('Installed Pneumatic Breaching Ram! (+65 Salvage & Melee Power)', 'cyan');
        }
      },
      {
        key: 'nailgun',
        folder: 'WEAPONS',
        hotkey: 'HOTBAR',
        name: 'Scrap Nailgun',
        baseCost: { wood: 8, scrap: 6, copper: 4 },
        desc: 'A pressurized stud-driver rebuilt from damp framing lumber and stripped copper coils. Fires jagged steel nails in rapid bursts—and reacts strangely when infused with Anomalous Cores.',
        effect: (player, prog) => {
          if (this.inventoryManager) this.inventoryManager.addItem('nailgun', 1);
          prog.addXp(45);
          this.onNotification('Fabricated Scrap Nailgun!', 'cyan');
        }
      },
      {
        key: 'prybar',
        folder: 'WEAPONS',
        hotkey: 'MELEE',
        name: 'Reinforced Prybar Edge',
        baseCost: { drywall: 15, wood: 8 },
        desc: 'Hardened timber bracing and dense plaster counterweights bound to your demolition bar. Tears through partition walls effortlessly and hits far harder in close quarters.',
        effect: (player, prog) => {
          player.harvestPower += 22;
          prog.addXp(25);
          this.onNotification('Reinforced Prybar Edge! (+22 Harvest & Melee Power)', 'green');
        }
      },
      {
        key: 'arc_rifle',
        folder: 'WEAPONS',
        hotkey: 'HOTBAR',
        name: 'Conduit Arc-Rifle',
        baseCost: { copper: 12, ballast: 6, scrap: 6 },
        desc: 'Overdriven fluorescent ballasts chained into a makeshift magnetic rail. Hurls superheated plasma arcs that scorch entities across flooded corridors and rattle the humming lights overhead.',
        effect: (player, prog) => {
          if (this.inventoryManager) this.inventoryManager.addItem('arc_rifle', 1);
          prog.addXp(65);
          this.onNotification('Fabricated Conduit Arc-Rifle!', 'cyan');
        }
      },

      // --- UPGRADES ---
      {
        key: 'almond_water',
        folder: 'UPGRADES',
        hotkey: 'HOTBAR',
        name: 'Almond Water (x2)',
        baseCost: { fiber: 4, plastic: 2 },
        desc: 'Sweet, faintly bitter distillate filtered from damp carpet condensate. Clears the static behind your eyes and knits torn tissue back together when the walls close in.',
        effect: (player, prog) => {
          if (this.inventoryManager) this.inventoryManager.addItem('almond_water', 2);
          prog.addXp(15);
          this.onNotification('Distilled 2x Almond Water.', 'cyan');
        }
      },
      {
        key: 'ration',
        folder: 'UPGRADES',
        hotkey: 'HOTBAR',
        name: 'Condensate Ration (x2)',
        baseCost: { fiber: 6, drywall: 4 },
        desc: 'Vacuum-sealed emergency sustenance bar fortified with mineral salts. Restores heavy physical trauma and steadies your stride for the long descent.',
        effect: (player, prog) => {
          if (this.inventoryManager) this.inventoryManager.addItem('ration', 2);
          prog.addXp(15);
          this.onNotification('Packed 2x Condensate Rations.', 'green');
        }
      },
      {
        key: 'lantern',
        folder: 'UPGRADES',
        hotkey: 'F',
        name: 'Conduit Lantern',
        baseCost: { copper: 8, ballast: 2 },
        desc: 'A shoulder-mounted halogen floodlamp wired straight into a salvaged ballast choke. Cuts a warm, steady beam through unlit maintenance shafts and pitch-black sublevels.',
        effect: (player, prog) => {
          this.lanternUnlocked = true;
          player.enableLantern();
          prog.addXp(35);
          this.onNotification('Mounted Conduit Lantern!', 'green');
        }
      },
      {
        key: 'thruster_boots',
        folder: 'UPGRADES',
        hotkey: 'PASSIVE',
        name: 'Pneumatic Thruster Boots',
        baseCost: { scrap: 6, copper: 4, plastic: 4 },
        desc: 'Spring-loaded ankle pistons fed by compressed air canisters. Fire a secondary burst mid-air to clear collapsed floor shafts or vault over lunging stalkers.',
        effect: (player, prog) => {
          player.hasDoubleJump = true;
          prog.addXp(50);
          this.onNotification('Equipped Pneumatic Thruster Boots! (Double-Jump Active)', 'green');
        }
      },
      {
        key: 'filter',
        folder: 'UPGRADES',
        hotkey: 'PASSIVE',
        name: 'Fiber Condensate Filter',
        baseCost: { fiber: 14, drywall: 6 },
        desc: 'A tight-weave respirator cartridge packed with desiccated carpet fibers. Filters out mold spores and stale ozone, letting you sprint longer and move faster.',
        effect: (player, prog) => {
          player.speedMultiplier += 0.12;
          prog.addXp(40);
          this.onNotification('Fitted Condensate Filter! (+12% Move Speed)', 'cyan');
        }
      },
      {
        key: 'rover',
        folder: 'UPGRADES',
        hotkey: 'R / 7',
        name: 'Salvage Mining Rover Bot',
        baseCost: { copper: 6, ballast: 2, scrap: 4, plastic: 4 },
        desc: 'A tireless tracked automaton with a miniature rotary cutter. Roams nearby hallways on its own, chewing through loose drywall and hauling salvaged parts straight to your boots.',
        effect: (player, prog) => {
          if (player.spawnRover) {
            player.spawnRover();
          }
          prog.addXp(50);
          this.onNotification('Deployed Autonomous Salvage Rover!', 'cyan');
        }
      },

      // --- PLACEABLES ---
      {
        key: 'beacon',
        folder: 'PLACEABLES',
        hotkey: 'G',
        name: 'Luminous Trail Beacon (x5)',
        baseCost: { copper: 4, ballast: 1 },
        desc: 'Phosphor-coated copper rods that hum with a cold cyan glow. Drop them at hallway intersections so the shifting yellow maze never swallows your path back.',
        effect: (player, prog) => {
          this.inventory.beacons += 5;
          prog.addXp(20);
          this.onNotification('Crafted 5x Trail Beacons.', 'cyan');
        }
      },
      {
        key: 'scaffolding',
        folder: 'PLACEABLES',
        hotkey: 'L',
        name: 'Modular Scaffolding Tower (x4)',
        baseCost: { wood: 8, scrap: 2 },
        desc: 'Interlocking timber and scrap-steel ladder frames. Stack them beneath breached ceilings to climb into overhead crawlspaces and upper strata.',
        effect: (player, prog) => {
          this.inventory.scaffolding += 4;
          prog.addXp(25);
          this.onNotification('Crafted 4x Scaffolding Towers.', 'green');
        }
      },
      {
        key: 'jumppad',
        folder: 'PLACEABLES',
        hotkey: 'V',
        name: 'Pneumatic Jump Pad (x2)',
        baseCost: { scrap: 4, wood: 6, copper: 2 },
        desc: 'A heavy coil-spring launch plate anchored to the floor. Step onto the trigger pad to rocket straight up through multi-story shafts.',
        effect: (player, prog) => {
          this.inventory.jumppads += 2;
          prog.addXp(30);
          this.onNotification('Crafted 2x Pneumatic Jump Pads.', 'amber');
        }
      },
      {
        key: 'barricade',
        folder: 'PLACEABLES',
        hotkey: 'RMB / B',
        name: 'Drywall Barricade (x3)',
        baseCost: { drywall: 18, wood: 6 },
        desc: 'Thick slab-and-stud defensive bulkheads. Wedge them into doorways to choke off chasing entities or seal sudden drops into lower levels.',
        effect: (player, prog) => {
          this.inventory.barricades += 3;
          prog.addXp(20);
          this.onNotification('Crafted 3x Drywall Barricades.', 'green');
        }
      }
    ];

    this.initUI();
  }

  addResource(type, amount) {
    if (this.inventory[type] === undefined) {
      this.inventory[type] = 0;
    }
    this.inventory[type] += amount;
    this.updateInventoryUI();
    this.updateCraftingUI();
  }

  hasResources(costMap) {
    for (const [res, required] of Object.entries(costMap)) {
      const discountedReq = Math.ceil(required * this.costDiscount);
      if ((this.inventory[res] || 0) < discountedReq) {
        return false;
      }
    }
    return true;
  }

  consumeResources(costMap) {
    for (const [res, required] of Object.entries(costMap)) {
      const discountedReq = Math.ceil(required * this.costDiscount);
      this.inventory[res] = Math.max(0, (this.inventory[res] || 0) - discountedReq);
    }
    this.updateInventoryUI();
    this.updateCraftingUI();
  }

  craft(recipeKey, player, progression) {
    const recipe = this.recipes.find(r => r.key === recipeKey);
    if (!recipe) return false;

    if (this.hasResources(recipe.baseCost)) {
      this.consumeResources(recipe.baseCost);
      recipe.effect(player, progression);
      this.updateInventoryUI();
      this.updateCraftingUI();
      return true;
    } else {
      this.onNotification(`Insufficient resources for ${recipe.name}!`, 'red');
      return false;
    }
  }

  initUI() {
    this._invEls = {
      drywall: document.getElementById('res-drywall'),
      wood: document.getElementById('res-wood'),
      copper: document.getElementById('res-copper'),
      ballast: document.getElementById('res-ballast'),
      fiber: document.getElementById('res-fiber'),
      plastic: document.getElementById('res-plastic'),
      scaffolding: document.getElementById('res-scaffolding'),
      core: document.getElementById('res-core')
    };

    const list = document.getElementById('recipe-list-el');
    if (list) {
      list.innerHTML = '';
      this._recipeCardEls = this.recipes.map(r => {
        const card = document.createElement('div');
        card.className = 'recipe-card disabled';

        const top = document.createElement('div');
        top.className = 'recipe-top';
        const nameSpan = document.createElement('span');
        nameSpan.innerText = r.name;
        const costSpan = document.createElement('span');
        costSpan.className = 'recipe-cost';
        top.appendChild(nameSpan);
        top.appendChild(costSpan);

        const desc = document.createElement('div');
        desc.className = 'recipe-desc';
        desc.innerText = r.desc;

        card.appendChild(top);
        card.appendChild(desc);

        card.onclick = (e) => {
          e.stopPropagation();
          if (this.onCraftRequest) this.onCraftRequest(r.key);
        };

        list.appendChild(card);
        return { recipe: r, card, costSpan };
      });
    }

    this._buildModalEl = document.getElementById('build-menu-modal');
    this._buildFoldersEl = document.getElementById('build-folders-el');
    this._buildGridEl = document.getElementById('build-grid-el');
    this._buildInspectorEl = document.getElementById('build-inspector-el');
    this._buildFeedbackEl = document.getElementById('build-feedback-el');

    this.updateInventoryUI();
    this.updateCraftingUI();
  }

  getFolderRecipes(folderName) {
    const target = folderName || this.folders[this.activeFolderIndex];
    return this.recipes
      .filter(r => r.folder === target)
      .sort((a, b) => {
        const sumA = Object.values(a.baseCost).reduce((s, v) => s + v, 0);
        const sumB = Object.values(b.baseCost).reduce((s, v) => s + v, 0);
        return sumA - sumB;
      });
  }

  updateInventoryUI() {
    if (!this._invEls) return;
    for (const [key, el] of Object.entries(this._invEls)) {
      if (el) el.innerText = this.inventory[key] || 0;
    }
  }

  updateCraftingUI() {
    for (let i = 0; i < this._recipeCardEls.length; i++) {
      const { recipe, card, costSpan } = this._recipeCardEls[i];
      const canCraft = this.hasResources(recipe.baseCost);
      card.classList.toggle('disabled', !canCraft);
      costSpan.innerText = Object.entries(recipe.baseCost)
        .map(([res, req]) => `${Math.ceil(req * this.costDiscount)} ${res.toUpperCase()}`)
        .join(', ');
    }
    if (this.isBuildMenuOpen) {
      this.renderBuildMenu();
    }
  }

  openBuildMenu() {
    this.isBuildMenuOpen = true;
    if (this._buildModalEl) {
      this._buildModalEl.classList.add('visible');
    }
    if (this._buildFeedbackEl) {
      this._buildFeedbackEl.innerText = '[A/D OR LEFT/RIGHT] SWITCH FOLDER // [W/S OR UP/DOWN] SELECT // [ENTER/SPACE] FABRICATE';
      this._buildFeedbackEl.style.color = 'var(--term-cyan)';
    }
    this.renderBuildMenu();
  }

  closeBuildMenu() {
    this.isBuildMenuOpen = false;
    if (this._buildModalEl) {
      this._buildModalEl.classList.remove('visible');
    }
  }

  moveSelection(dx, dy) {
    if (dx !== 0) {
      this.activeFolderIndex = (this.activeFolderIndex + dx + this.folders.length) % this.folders.length;
      this.selectedIndex = 0;
    }

    const list = this.getFolderRecipes();
    if (dy !== 0 && list.length > 0) {
      this.selectedIndex = (this.selectedIndex + dy + list.length) % list.length;
    }

    this.renderBuildMenu();
  }

  craftSelected(player, progression) {
    const list = this.getFolderRecipes();
    const recipe = list[this.selectedIndex];
    if (!recipe) return false;
    const ok = this.craft(recipe.key, player, progression);
    if (this._buildFeedbackEl) {
      if (ok) {
        this._buildFeedbackEl.innerText = `>>> FABRICATED: ${recipe.name.toUpperCase()} <<<`;
        this._buildFeedbackEl.style.color = 'var(--term-green)';
      } else {
        this._buildFeedbackEl.innerText = `INSUFFICIENT SALVAGE FOR ${recipe.name.toUpperCase()}`;
        this._buildFeedbackEl.style.color = 'var(--term-red)';
      }
    }
    this.renderBuildMenu();
    return ok;
  }

  renderBuildMenu() {
    if (this._buildFoldersEl) {
      this._buildFoldersEl.innerHTML = '';
      this.folders.forEach((folder, fIdx) => {
        const tab = document.createElement('button');
        tab.className = `build-folder-tab ${fIdx === this.activeFolderIndex ? 'active' : ''}`;
        tab.innerText = `${folder} (${this.getFolderRecipes(folder).length})`;
        tab.onclick = () => {
          this.activeFolderIndex = fIdx;
          this.selectedIndex = 0;
          this.renderBuildMenu();
        };
        this._buildFoldersEl.appendChild(tab);
      });
    }

    const list = this.getFolderRecipes();
    if (this.selectedIndex >= list.length) this.selectedIndex = Math.max(0, list.length - 1);

    if (this._buildGridEl) {
      this._buildGridEl.innerHTML = '';
      this._buildGridEl.style.gridTemplateColumns = '1fr';
      list.forEach((r, idx) => {
        const canCraft = this.hasResources(r.baseCost);
        const card = document.createElement('div');
        card.className = `build-card ${idx === this.selectedIndex ? 'selected' : ''} ${canCraft ? 'craftable' : 'locked'}`;
        card.style.minHeight = '54px';
        card.style.flexDirection = 'row';
        card.style.alignItems = 'center';
        const costSummary = Object.entries(r.baseCost)
          .map(([res, req]) => `${Math.ceil(req * this.costDiscount)} ${res.toUpperCase()}`)
          .join(' · ');
        card.innerHTML = `
          <div>
            <div class="build-card-name">${r.name}</div>
            <div class="build-card-cat" style="margin-top:2px;">${costSummary}</div>
          </div>
          <div class="build-card-key">[${r.hotkey || '-'}]</div>
        `;
        card.onclick = () => {
          this.selectedIndex = idx;
          this.renderBuildMenu();
        };
        card.ondblclick = () => {
          this.selectedIndex = idx;
          if (this.onCraftRequest) this.onCraftRequest(r.key);
          this.renderBuildMenu();
        };
        this._buildGridEl.appendChild(card);
      });
    }

    if (this._buildInspectorEl) {
      const recipe = list[this.selectedIndex];
      if (!recipe) return;
      const canCraft = this.hasResources(recipe.baseCost);
      const costRows = Object.entries(recipe.baseCost).map(([res, req]) => {
        const needed = Math.ceil(req * this.costDiscount);
        const owned = this.inventory[res] || 0;
        const ok = owned >= needed;
        return `<div class="insp-cost-row ${ok ? 'ok' : 'short'}">
          <span>${res.toUpperCase()}</span>
          <span>${owned} / ${needed}</span>
        </div>`;
      }).join('');

      this._buildInspectorEl.innerHTML = `
        <div class="insp-cat">${recipe.folder} // BIND [${recipe.hotkey || '-'}]</div>
        <div class="insp-title">${recipe.name}</div>
        <div class="insp-desc">${recipe.desc}</div>
        <div class="insp-costs-header">REQUIRED SALVAGE</div>
        <div class="insp-costs-list">${costRows}</div>
        <div class="insp-action ${canCraft ? 'ready' : 'blocked'}">
          ${canCraft ? '[PRESS ENTER / SPACE TO FABRICATE]' : '[INSUFFICIENT MATERIALS]'}
        </div>
      `;
    }
  }
}
