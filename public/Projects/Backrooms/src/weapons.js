import * as THREE from 'three';

export const ITEM_DEFS = {
  prybar: {
    id: 'prybar',
    name: 'Salvage Prybar',
    kind: 'weapon',
    weaponType: 'melee',
    icon: '⛏️',
    desc: 'Heavy demolition prybar & melee striker. Left-click to mine walls or bash entities.',
    baseDamage: 26,
    fireRate: 3.0,
    color: 0xffb000
  },
  nailgun: {
    id: 'nailgun',
    name: 'Scrap Nailgun',
    kind: 'weapon',
    weaponType: 'projectile',
    icon: '🔩',
    desc: 'Pneumatic rapid-fire nail launcher. Mutates with ricochets, multi-shot & shrapnel at high levels.',
    baseDamage: 24,
    fireRate: 7.5,
    speed: 44,
    color: 0xffaa22
  },
  arc_rifle: {
    id: 'arc_rifle',
    name: 'Conduit Arc-Rifle',
    kind: 'weapon',
    weaponType: 'beam',
    icon: '⚡',
    desc: 'High-voltage ballast discharge rifle. Mutates with chain lightning, phase-pierce & gravity vortices.',
    baseDamage: 48,
    fireRate: 2.8,
    speed: 65,
    color: 0x00f0ff
  },
  breaching_charge: {
    id: 'breaching_charge',
    name: 'Breaching Charge',
    kind: 'charge',
    icon: '💣',
    stackable: true,
    desc: 'Shaped explosive. Click to plant/throw; detonates in 1.4s, blasting reinforced floors & ceilings.'
  },
  almond_water: {
    id: 'almond_water',
    name: 'Almond Water',
    kind: 'consumable',
    icon: '🧴',
    stackable: true,
    heal: 35,
    desc: 'Restores +35 HP and stabilizes sanity.'
  },
  ration: {
    id: 'ration',
    name: 'Condensate Ration',
    kind: 'consumable',
    icon: '🥫',
    stackable: true,
    heal: 20,
    desc: 'Restores +20 HP and grants a brief sprint surge.'
  }
};

export function getWeaponMutations(item) {
  if (!item) return [];
  const lv = item.level || 1;
  const muts = [];
  if (lv >= 3) {
    muts.push(item.id === 'arc_rifle' ? 'Chain Arc (jumps to 2 targets)' : item.id === 'nailgun' ? 'Ricochet Rounds (2 bounces)' : 'Shockwave Swing (AoE cleave)');
  }
  if (lv >= 5) {
    muts.push(item.id === 'arc_rifle' ? 'Overload Detonation' : item.id === 'nailgun' ? 'Twin-Barrel Spread (+2 nails)' : 'Ballast Arc Discharge');
  }
  if (lv >= 8) {
    muts.push(item.id === 'arc_rifle' ? 'Phase-Piercing Beam (through walls)' : item.id === 'nailgun' ? 'Shrapnel Shatter' : 'Structural Rupture');
  }
  if (lv >= 12) {
    muts.push('Anomaly Singularity (Vortex Pull + 2x Crit)');
  }
  if (lv >= 16) {
    muts.push(`Hyper-Dimensional Tier ${lv - 14} (+${(lv - 15) * 25}% Strange Resonance)`);
  }
  return muts;
}

export function getWeaponStats(item, player) {
  const def = ITEM_DEFS[item.id] || ITEM_DEFS.prybar;
  const lv = item.level || 1;
  const dmgMult = Math.pow(1.22, lv - 1);
  const rateMult = Math.pow(1.06, lv - 1);
  return {
    damage: Math.round(def.baseDamage * dmgMult * (player?.weaponDamageMult || 1.0) * (player?.weaponDamageBonus || 1.0)),
    fireRate: +(def.fireRate * rateMult).toFixed(2),
    speed: def.speed || 40,
    mutations: getWeaponMutations(item)
  };
}

export function getUpgradeCost(item) {
  const lv = item.level || 1;
  const cost = {
    scrap: 2 + lv * 2,
    copper: 1 + lv
  };
  if (lv >= 2) {
    cost.core = Math.floor(lv / 2);
  }
  return cost;
}

/**
 * InventoryManager: Manages 18-slot Backpack + 6-slot Drag-and-Drop HUD Hotbar,
 * plus Weapon Leveling Modal & Inventory Modal (E).
 */
export class InventoryManager {
  constructor(crafting, onNotification) {
    this.crafting = crafting;
    this.onNotification = onNotification || (() => {});
    this.hotbar = new Array(6).fill(null);
    this.backpack = new Array(18).fill(null);
    this.activeHotbarIndex = 0;
    this.isOpen = false;
    this.levelModalItem = null; // { zone, index, item }
    this.dragSource = null;

    // Starter loadout
    this.hotbar[0] = { id: 'prybar', level: 1 };
    this.hotbar[1] = { id: 'breaching_charge', count: 3 };
    this.hotbar[2] = { id: 'almond_water', count: 2 };

    this._invModalEl = document.getElementById('inventory-modal');
    this._backpackGridEl = document.getElementById('backpack-grid-el');
    this._modalHotbarEl = document.getElementById('modal-hotbar-el');
    this._hudHotbarEl = document.getElementById('hud-hotbar');
    this._weaponModalEl = document.getElementById('weapon-level-modal');
    this._weaponModalBodyEl = document.getElementById('weapon-level-body');

    this.render();
  }

  addItem(id, count = 1) {
    const def = ITEM_DEFS[id];
    if (!def) return false;

    if (def.stackable) {
      for (let i = 0; i < this.hotbar.length; i++) {
        if (this.hotbar[i] && this.hotbar[i].id === id) {
          this.hotbar[i].count = (this.hotbar[i].count || 1) + count;
          this.render();
          return true;
        }
      }
      for (let i = 0; i < this.backpack.length; i++) {
        if (this.backpack[i] && this.backpack[i].id === id) {
          this.backpack[i].count = (this.backpack[i].count || 1) + count;
          this.render();
          return true;
        }
      }
    }

    const newItem = def.kind === 'weapon' ? { id, level: 1 } : { id, count };
    for (let i = 0; i < this.hotbar.length; i++) {
      if (!this.hotbar[i]) {
        this.hotbar[i] = newItem;
        this.render();
        return true;
      }
    }
    for (let i = 0; i < this.backpack.length; i++) {
      if (!this.backpack[i]) {
        this.backpack[i] = newItem;
        this.render();
        return true;
      }
    }
    this.onNotification('Inventory full!', 'red');
    return false;
  }

  getActiveItem() {
    return this.hotbar[this.activeHotbarIndex] || null;
  }

  selectHotbar(idx, player, audio) {
    if (idx < 0 || idx >= this.hotbar.length) return;
    const item = this.hotbar[idx];
    if (item && ITEM_DEFS[item.id]?.kind === 'consumable') {
      this.consumeItem('hotbar', idx, player, audio);
      return;
    }
    this.activeHotbarIndex = idx;
    this.render();
    if (player && player.updateViewmodelForItem) {
      player.updateViewmodelForItem(this.getActiveItem());
    }
  }

  consumeItem(zone, idx, player, audio) {
    const arr = zone === 'hotbar' ? this.hotbar : this.backpack;
    const item = arr[idx];
    if (!item) return;
    const def = ITEM_DEFS[item.id];
    if (!def || def.kind !== 'consumable') return;

    if (def.heal && player) {
      player.heal(def.heal);
    }
    if (item.id === 'ration' && player) {
      player.speedMultiplier += 0.05;
    }
    if (audio) audio.playPickupSound();
    this.onNotification(`Consumed ${def.name} (+${def.heal} HP)`, 'green');

    item.count = (item.count || 1) - 1;
    if (item.count <= 0) {
      arr[idx] = null;
    }
    this.render();
  }

  consumeChargeAtActive(player) {
    const item = this.hotbar[this.activeHotbarIndex];
    if (!item || item.id !== 'breaching_charge') return false;
    item.count = (item.count || 1) - 1;
    if (item.count <= 0) {
      this.hotbar[this.activeHotbarIndex] = null;
      if (player && player.updateViewmodelForItem) {
        player.updateViewmodelForItem(null);
      }
    }
    this.render();
    return true;
  }

  swapSlots(fromZone, fromIdx, toZone, toIdx) {
    if (fromZone === toZone && fromIdx === toIdx) return;
    const fromArr = fromZone === 'hotbar' ? this.hotbar : this.backpack;
    const toArr = toZone === 'hotbar' ? this.hotbar : this.backpack;
    const temp = fromArr[fromIdx];
    fromArr[fromIdx] = toArr[toIdx];
    toArr[toIdx] = temp;
    this.render();
  }

  openInventory() {
    this.isOpen = true;
    if (this._invModalEl) this._invModalEl.classList.add('visible');
    this.render();
  }

  closeInventory() {
    this.isOpen = false;
    this.closeWeaponModal();
    if (this._invModalEl) this._invModalEl.classList.remove('visible');
  }

  openWeaponModal(zone, idx) {
    const arr = zone === 'hotbar' ? this.hotbar : this.backpack;
    const item = arr[idx];
    if (!item || ITEM_DEFS[item.id]?.kind !== 'weapon') return;
    this.levelModalItem = { zone, idx, item };
    if (this._weaponModalEl) this._weaponModalEl.classList.add('visible');
    this.renderWeaponModal();
  }

  closeWeaponModal() {
    this.levelModalItem = null;
    if (this._weaponModalEl) this._weaponModalEl.classList.remove('visible');
  }

  renderWeaponModal() {
    if (!this._weaponModalBodyEl || !this.levelModalItem) return;
    const { item } = this.levelModalItem;
    const def = ITEM_DEFS[item.id];
    const stats = getWeaponStats(item, null);
    const nextStats = getWeaponStats({ ...item, level: item.level + 1 }, null);
    const cost = getUpgradeCost(item);
    const canAfford = this.crafting.hasResources(cost);

    const costHtml = Object.entries(cost).map(([res, req]) => {
      const discounted = Math.ceil(req * this.crafting.costDiscount);
      const owned = this.crafting.inventory[res] || 0;
      const ok = owned >= discounted;
      return `<div class="insp-cost-row ${ok ? 'ok' : 'short'}">
        <span>${res.toUpperCase()}</span>
        <span>${owned} / ${discounted}</span>
      </div>`;
    }).join('');

    const mutsHtml = stats.mutations.length > 0
      ? stats.mutations.map(m => `<div class="mut-tag">⚡ ${m}</div>`).join('')
      : '<div style="color:#777; font-size:12px;">Reach Level 3+ for strange anomalous mutations...</div>';

    this._weaponModalBodyEl.innerHTML = `
      <div class="wl-header">
        <span style="font-size:28px;">${def.icon}</span>
        <div>
          <div class="wl-title">${def.name} <span style="color:var(--term-cyan);">LVL ${item.level}</span></div>
          <div style="font-size:12px; color:#aaa;">UNCAPPED ANOMALOUS FORGE // RIGHT-CLICK WEAPON</div>
        </div>
      </div>
      <div class="wl-stats">
        <div>DAMAGE: <b>${stats.damage}</b> → <span style="color:var(--term-green);">${nextStats.damage}</span></div>
        <div>FIRE RATE: <b>${stats.fireRate}/s</b> → <span style="color:var(--term-green);">${nextStats.fireRate}/s</span></div>
      </div>
      <div class="wl-muts-header">ACTIVE ANOMALOUS MUTATIONS</div>
      <div class="wl-muts">${mutsHtml}</div>
      <div class="wl-muts-header">UPGRADE COST</div>
      <div class="insp-costs-list">${costHtml}</div>
      <div class="wl-actions">
        <button id="wl-upgrade-btn" class="wl-btn ${canAfford ? 'ready' : 'blocked'}">
          ${canAfford ? `UPGRADE TO LVL ${item.level + 1}` : 'INSUFFICIENT SALVAGE / CORES'}
        </button>
        <button id="wl-close-btn" class="wl-btn close">CLOSE</button>
      </div>
    `;

    const upBtn = document.getElementById('wl-upgrade-btn');
    if (upBtn) {
      upBtn.onclick = () => {
        if (this.crafting.hasResources(cost)) {
          this.crafting.consumeResources(cost);
          item.level = (item.level || 1) + 1;
          this.onNotification(`⚡ ${def.name} upgraded to LVL ${item.level}!`, 'cyan');
          this.renderWeaponModal();
          this.render();
        }
      };
    }
    const closeBtn = document.getElementById('wl-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => this.closeWeaponModal();
    }
  }

  _buildSlotEl(item, zone, idx, isHud = false) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (isHud && idx === this.activeHotbarIndex ? ' active' : '');
    if (isHud) {
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.innerText = `${idx + 1}`;
      slot.appendChild(num);
    }

    if (item) {
      const def = ITEM_DEFS[item.id];
      slot.draggable = !isHud;
      slot.title = `${def.name}${item.level ? ` (LVL ${item.level})` : ''}\n${def.desc}${def.kind === 'weapon' ? '\n[Right-Click to Level Up]' : ''}`;

      const icon = document.createElement('div');
      icon.className = 'slot-icon';
      icon.innerText = def.icon;
      slot.appendChild(icon);

      const label = document.createElement('div');
      label.className = 'slot-badge';
      label.innerText = def.kind === 'weapon' ? `L${item.level || 1}` : `x${item.count || 1}`;
      slot.appendChild(label);

      if (!isHud) {
        slot.ondragstart = () => {
          this.dragSource = { zone, idx };
        };
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          if (def.kind === 'weapon') {
            this.openWeaponModal(zone, idx);
          } else if (def.kind === 'consumable') {
            this.consumeItem(zone, idx, this.playerRef, this.audioRef);
          }
        };
      }
    }

    if (!isHud) {
      slot.ondragover = (e) => e.preventDefault();
      slot.ondrop = (e) => {
        e.preventDefault();
        if (this.dragSource) {
          this.swapSlots(this.dragSource.zone, this.dragSource.idx, zone, idx);
          this.dragSource = null;
        }
      };
    } else {
      slot.onclick = () => {
        this.selectHotbar(idx, this.playerRef, this.audioRef);
      };
    }

    return slot;
  }

  render() {
    if (this._hudHotbarEl) {
      this._hudHotbarEl.innerHTML = '';
      for (let i = 0; i < this.hotbar.length; i++) {
        this._hudHotbarEl.appendChild(this._buildSlotEl(this.hotbar[i], 'hotbar', i, true));
      }
    }
    if (this._modalHotbarEl) {
      this._modalHotbarEl.innerHTML = '';
      for (let i = 0; i < this.hotbar.length; i++) {
        this._modalHotbarEl.appendChild(this._buildSlotEl(this.hotbar[i], 'hotbar', i, false));
      }
    }
    if (this._backpackGridEl) {
      this._backpackGridEl.innerHTML = '';
      for (let i = 0; i < this.backpack.length; i++) {
        this._backpackGridEl.appendChild(this._buildSlotEl(this.backpack[i], 'backpack', i, false));
      }
    }
  }
}

/**
 * ProjectileManager: Pooled InstancedMesh projectiles + Shaped Breaching Charges.
 */
export class ProjectileManager {
  constructor(scene, worldManager, debrisSystem, audio) {
    this.scene = scene;
    this.worldManager = worldManager;
    this.debrisSystem = debrisSystem;
    this.audio = audio;

    this.projectiles = [];
    this.charges = [];
    this.maxProjectiles = 250;

    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.instMesh = new THREE.InstancedMesh(geo, mat, this.maxProjectiles);
    this.instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instMesh.frustumCulled = false;
    this.instMesh.count = 0;

    const col = new THREE.Color(0xffffff);
    for (let i = 0; i < this.maxProjectiles; i++) {
      this.instMesh.setColorAt(i, col);
    }
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.instMesh);

    this._chargeGeo = new THREE.BoxGeometry(0.35, 0.22, 0.35);
    this._chargeMat = new THREE.MeshStandardMaterial({
      color: 0xff3344,
      emissive: 0xff2200,
      emissiveIntensity: 1.5
    });

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._ray = new THREE.Raycaster();
  }

  spawnProjectile(origin, dir, item, player) {
    const stats = getWeaponStats(item, player);
    const lv = item.level || 1;
    const isArc = item.id === 'arc_rifle';
    const spreadCount = (item.id === 'nailgun' && lv >= 5) ? 3 : 1;

    for (let s = 0; s < spreadCount; s++) {
      if (this.projectiles.length >= this.maxProjectiles) this.projectiles.shift();
      const d = dir.clone();
      if (spreadCount > 1 && s > 0) {
        d.x += (Math.random() - 0.5) * 0.09;
        d.y += (Math.random() - 0.5) * 0.06;
        d.z += (Math.random() - 0.5) * 0.09;
        d.normalize();
      }
      this.projectiles.push({
        pos: origin.clone().addScaledVector(d, 0.6),
        vel: d.multiplyScalar(stats.speed),
        damage: stats.damage,
        bounces: (item.id === 'nailgun' && lv >= 3) ? 2 : 0,
        pierceWalls: (isArc && lv >= 8),
        chainArc: (isArc && lv >= 3),
        shrapnel: (lv >= 8),
        vortex: (lv >= 12),
        color: isArc ? 0x00f0ff : 0xffb000,
        life: 1.8
      });
    }
    if (this.audio) this.audio.playHitSound(isArc ? 'fixture' : 'metal');
    return 1 / Math.max(0.5, stats.fireRate);
  }

  spawnBreachingCharge(origin, dir) {
    const mesh = new THREE.Mesh(this._chargeGeo, this._chargeMat);
    mesh.position.copy(origin).addScaledVector(dir, 0.8);
    this.scene.add(mesh);

    this.charges.push({
      mesh,
      pos: mesh.position,
      vel: dir.clone().multiplyScalar(11.0).add(new THREE.Vector3(0, 2.5, 0)),
      timer: 1.4
    });
  }

  detonateCharge(pos, player, progression, particleEmitter, onShake) {
    if (this.audio) this.audio.playBreakSound('fixture');
    if (particleEmitter) particleEmitter(pos, 40, 0xff5522);
    if (onShake) onShake(0.75);

    const blastRadius = 2.8 * (player?.blastRadiusBonus || 1.0);
    const blastRadiusSq = blastRadius * blastRadius;
    if (this.entityManager) {
      const blastDmg = Math.round(180 * (player?.blastRadiusBonus || 1.0));
      this.entityManager.hitInSphere(pos, blastRadius * 1.6, blastDmg, player, particleEmitter);
    }
    const { cx, cy, cz } = this.worldManager.getChunkCoords(pos);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          const chunk = this.worldManager.loadedChunks.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!chunk) continue;
          for (let i = chunk.objects.length - 1; i >= 0; i--) {
            const obj = chunk.objects[i];
            if (!obj || obj.destroyed || !obj.position) continue;
            if (obj.position.distanceToSquared(pos) <= blastRadiusSq) {
              const drops = obj.getDrops ? obj.getDrops() : obj.drops;
              if (player && drops) player.spawnPickups(obj.position, drops);
              if (progression) progression.addXp(obj.xp || 10);
              if (this.debrisSystem) {
                this.debrisSystem.spawnShatter(obj.position, obj.type || 'wall', 6);
              }
              this.worldManager.removeObject(obj.instancedMesh ? obj : obj.mesh);
              if (obj.destroy) obj.destroy(this.scene);
            }
          }
        }
      }
    }
  }

  update(dt, player, progression, particleEmitter, onShake) {
    // 1. Update Breaching Charges
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.timer -= dt;
      c.vel.y -= 18.0 * dt;
      c.pos.addScaledVector(c.vel, dt);

      const floorY = Math.floor(c.pos.y / 20.0) * 20.0 + 0.14;
      if (c.pos.y < floorY) {
        c.pos.y = floorY;
        c.vel.set(0, 0, 0);
      }

      // Blink faster as detonation nears
      const blink = Math.sin(c.timer * 24) > 0;
      c.mesh.scale.setScalar(blink ? 1.18 : 0.92);

      if (c.timer <= 0) {
        this.scene.remove(c.mesh);
        this.detonateCharge(c.pos, player, progression, particleEmitter, onShake);
        this.charges.splice(i, 1);
      }
    }

    // 2. Update Projectiles
    const len = this.projectiles.length;
    if (len === 0) {
      if (this.instMesh.count !== 0) this.instMesh.count = 0;
      return;
    }

    let writeIdx = 0;
    for (let i = len - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const stepDist = p.vel.length() * dt;
      const dir = p.vel.clone().normalize();

      // Check world collision
      if (!p.pierceWalls) {
        this._ray.set(p.pos, dir);
        this._ray.far = stepDist + 0.15;
        const hits = this._ray.intersectObjects(this.worldManager.getNearbyDestructibles(p.pos, 1, 0), false);
        if (hits.length > 0) {
          const hit = hits[0];
          if (particleEmitter) particleEmitter(hit.point, 4, p.color);
          if (p.bounces > 0 && hit.face) {
            p.bounces--;
            const n = hit.face.normal;
            p.vel.reflect(n).multiplyScalar(0.85);
            p.pos.copy(hit.point).addScaledVector(n, 0.1);
          } else {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      p.pos.addScaledVector(p.vel, dt);

      // Check Entity Hits (scaled by physical rig bounds)
      if (this.entityManager && this.entityManager.entities.length > 0) {
        let hitEnt = null;
        for (let e = 0; e < this.entityManager.entities.length; e++) {
          const ent = this.entityManager.entities[e];
          if (ent.dying) continue;
          const ep = ent.mesh.position;
          const hitR = (ent.halfW || 0.6) + 0.35;
          const hitH = (ent.height || 1.8) + 0.25;
          const dx = p.pos.x - ep.x;
          const dz = p.pos.z - ep.z;
          const dy = p.pos.y - ep.y;
          if (dx * dx + dz * dz < hitR * hitR && dy >= -0.2 && dy <= hitH) {
            hitEnt = ent;
            break;
          }
        }
        if (hitEnt) {
          this.entityManager.damageEntity(hitEnt, p.damage, player, particleEmitter);
          if (p.chainCount > 0) {
            this.entityManager.hitInSphere(p.pos, 4.5, p.damage * 0.55, player, particleEmitter);
          }
          if (p.vortex) {
            for (const other of this.entityManager.entities) {
              if (other !== hitEnt && other.mesh.position.distanceTo(p.pos) < 6.0) {
                other.mesh.position.lerp(p.pos, 0.35);
              }
            }
          }
          if (!p.pierceWalls) {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      this._dummy.position.copy(p.pos);
      this._dummy.lookAt(p.pos.x + dir.x, p.pos.y + dir.y, p.pos.z + dir.z);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.instMesh.setMatrixAt(writeIdx, this._dummy.matrix);
      this._color.setHex(p.color);
      this.instMesh.setColorAt(writeIdx, this._color);
      writeIdx++;
    }

    this.instMesh.count = writeIdx;
    this.instMesh.instanceMatrix.needsUpdate = true;
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;
  }
}
