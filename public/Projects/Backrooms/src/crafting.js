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
      scaffolding: 0
    };

    this.lanternUnlocked = false;
    this.costDiscount = 1.0;

    this.recipes = [
      {
        key: 'prybar',
        name: 'Makeshift Shiv / Prybar',
        baseCost: { drywall: 15, wood: 8 },
        desc: '+80% Harvest speed against all structures',
        effect: (player, prog) => {
          player.harvestPower += 22;
          prog.addXp(25);
          this.onNotification('Crafted: Makeshift Prybar! (+80% Harvest Power)', 'green');
        }
      },
      {
        key: 'lantern',
        name: 'Conduit Lantern',
        baseCost: { copper: 8, ballast: 2 },
        desc: 'Mobile directional light source [Hotkey: F]',
        effect: (player, prog) => {
          this.lanternUnlocked = true;
          player.enableLantern();
          prog.addXp(35);
          this.onNotification('Crafted: Conduit Lantern! [Press F to toggle]', 'green');
        }
      },
      {
        key: 'scaffolding',
        name: 'Modular Scaffolding Tower (x4)',
        baseCost: { wood: 8, scrap: 2 },
        desc: 'Climbable ladder blocks to scale 16m vaulted ceilings [Hotkey: L]',
        effect: (player, prog) => {
          this.inventory.scaffolding += 4;
          prog.addXp(25);
          this.onNotification('Crafted: 4x Scaffolding Towers! [Press L to place]', 'green');
        }
      },
      {
        key: 'barricade',
        name: 'Drywall Barricade (x3)',
        baseCost: { drywall: 18, wood: 6 },
        desc: 'Plug breaches & block sightlines [RMB / B]',
        effect: (player, prog) => {
          this.inventory.barricades += 3;
          prog.addXp(20);
          this.onNotification('Crafted: 3x Drywall Barricades! [Press RMB / B]', 'green');
        }
      },
      {
        key: 'filter',
        name: 'Fiber Condensate Filter',
        baseCost: { fiber: 14, drywall: 6 },
        desc: '+12% Permanent move speed & sanity boost',
        effect: (player, prog) => {
          player.speedMultiplier += 0.12;
          prog.addXp(40);
          this.onNotification('Synthesized: Condensate Infusion! (+12% Speed)', 'cyan');
        }
      },
      {
        key: 'pneumatic_ram',
        name: 'Pneumatic Breaching Ram',
        baseCost: { piston: 2, caster: 3, scrap: 5 },
        desc: '+120 Harvest damage! Pulverizes concrete pillars & vaults',
        effect: (player, prog) => {
          player.harvestPower += 65;
          prog.addXp(60);
          this.onNotification('Fabricated: Pneumatic Breaching Ram! (+120 Power)', 'cyan');
        }
      },
      {
        key: 'rover',
        name: 'Salvage Mining Rover Bot',
        baseCost: { copper: 6, ballast: 2, scrap: 4, plastic: 4 },
        desc: 'Autonomous tracked bot that mines nearby resources and brings them back to you [Hotkey: 7 / R]',
        effect: (player, prog) => {
          if (player.spawnRover) {
            player.spawnRover();
          }
          prog.addXp(50);
          this.onNotification('Deployed: Autonomous Salvage Mining Rover Bot!', 'cyan');
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
    this.updateInventoryUI();
    this.updateCraftingUI();
  }

  updateInventoryUI() {
    const dEl = document.getElementById('res-drywall');
    const wEl = document.getElementById('res-wood');
    const cEl = document.getElementById('res-copper');
    const bEl = document.getElementById('res-ballast');
    const fEl = document.getElementById('res-fiber');
    const pEl = document.getElementById('res-plastic');
    const scEl = document.getElementById('res-scaffolding');

    if (dEl) dEl.innerText = this.inventory.drywall;
    if (wEl) wEl.innerText = this.inventory.wood;
    if (cEl) cEl.innerText = this.inventory.copper;
    if (bEl) bEl.innerText = this.inventory.ballast;
    if (fEl) fEl.innerText = this.inventory.fiber;
    if (pEl) pEl.innerText = this.inventory.plastic;
    if (scEl) scEl.innerText = this.inventory.scaffolding;
  }

  updateCraftingUI() {
    const list = document.getElementById('recipe-list-el');
    if (!list) return;

    list.innerHTML = '';
    this.recipes.forEach(r => {
      const canCraft = this.hasResources(r.baseCost);
      const costStr = Object.entries(r.baseCost)
        .map(([res, req]) => `${Math.ceil(req * this.costDiscount)} ${res.toUpperCase()}`)
        .join(', ');

      const card = document.createElement('div');
      card.className = `recipe-card ${canCraft ? '' : 'disabled'}`;
      card.innerHTML = `
        <div class="recipe-top">
          <span>${r.name}</span>
          <span class="recipe-cost">${costStr}</span>
        </div>
        <div class="recipe-desc">${r.desc}</div>
      `;

      card.onclick = (e) => {
        e.stopPropagation();
        if (this.onCraftRequest) {
          this.onCraftRequest(r.key);
        }
      };

      list.appendChild(card);
    });
  }
}
