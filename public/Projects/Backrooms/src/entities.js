import * as THREE from 'three';
import { buildOrganEntityRig, animateOrganEntity, computeEntityStats } from './entityRigs.js';

const FALLBACK_BLUEPRINTS = [
  {
    id: 'shadow_stalker',
    name: 'Shadow Stalker',
    isBoss: false,
    nodes: [
      { id: 0, parentId: null, type: 'core', pos: [0, 1.35, 0], dir: [0, 1, 0], scale: 0.9 },
      { id: 1, parentId: 0, type: 'ocular', pos: [-0.16, 0.14, 0.34], dir: [0, 0, 1], scale: 0.9 },
      { id: 2, parentId: 0, type: 'ocular', pos: [0.16, 0.14, 0.34], dir: [0, 0, 1], scale: 0.9 },
      { id: 3, parentId: 0, type: 'limb', pos: [-0.26, -0.15, 0], dir: [-0.2, -1, 0.1], scale: 1.15 },
      { id: 4, parentId: 0, type: 'limb', pos: [0.26, -0.15, 0], dir: [0.2, -1, 0.1], scale: 1.15 }
    ]
  }
];

export class EntityManager {
  constructor(scene, worldManager, progression, crafting, inventoryManager, audio, onNotification) {
    this.scene = scene;
    this.worldManager = worldManager;
    this.progression = progression;
    this.crafting = crafting;
    this.inventoryManager = inventoryManager;
    this.audio = audio;
    this.onNotification = onNotification || (() => {});

    this.entities = [];
    this.portals = [];
    this.wave = 1;
    this.kills = 0;
    this.waveCooldown = 14.0;
    this.waveActive = false;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.deepestStrataSeen = 0;
    this.animTime = 0;

    this.blueprints = FALLBACK_BLUEPRINTS.map(bp => ({ ...bp, stats: computeEntityStats(bp.nodes) }));
    this._loadEntitiesFromDisk();

    this._waveEl = document.getElementById('wave-info');
    this._scratchVec = new THREE.Vector3();
    this._scratchDir = new THREE.Vector3();
    this._entBox = new THREE.Box3();
    this._entMin = new THREE.Vector3();
    this._entMax = new THREE.Vector3();

    this._portalGeo = new THREE.TorusGeometry(1.15, 0.12, 10, 28);
    this._portalMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  }

  async _loadEntitiesFromDisk() {
    try {
      const res = await fetch('./entities/manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const ids = await res.json();
      if (!Array.isArray(ids) || ids.length === 0) return;

      const loaded = [];
      for (const id of ids) {
        try {
          const r = await fetch(`./entities/${id}.json`, { cache: 'no-store' });
          if (!r.ok) continue;
          const bp = await r.json();
          bp.stats = computeEntityStats(bp.nodes);
          loaded.push(bp);
        } catch (_) {
          // Skip malformed entity JSON
        }
      }
      if (loaded.length > 0) {
        this.blueprints = loaded;
        console.log(`[ENTITIES] Loaded ${loaded.length} rigged blueprints from entities/`);
      }
    } catch (_) {
      // Fallback already active
    }
  }

  _pickBlueprintForDepth(depth, forceBoss = false) {
    if (forceBoss) {
      const bosses = this.blueprints.filter(b => b.isBoss || b.stats.danger >= 70);
      if (bosses.length > 0) return bosses[Math.floor(Math.random() * bosses.length)];
    }

    const normals = this.blueprints.filter(b => !b.isBoss);
    const pool = normals.length > 0 ? normals : this.blueprints;

    // Filter to entities whose spawn layer window covers current depth (startDepth .. stopDepth)
    let eligible = pool.filter(b => depth >= b.stats.startDepth && depth <= b.stats.stopDepth);
    if (eligible.length === 0) {
      // Fallback: pick highest-danger entities if player went past all non-abyssal bands
      eligible = [...pool].sort((a, b) => b.stats.danger - a.stats.danger).slice(0, 2);
    }

    // Weight toward higher danger as depth rises
    let totalWeight = 0;
    const weights = eligible.map(b => {
      const w = Math.max(1, 10 + (depth * 2) + (b.stats.danger * 0.4));
      totalWeight += w;
      return w;
    });
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return eligible[i];
    }
    return eligible[0];
  }

  _updateWaveHUD() {
    if (!this._waveEl) return;
    this._waveEl.style.display = 'inline';
    if (this.waveActive) {
      this._waveEl.innerText = `WAVE ${this.wave} // HOSTILES: ${this.entities.length + this.toSpawn}`;
    } else {
      this._waveEl.innerText = `WAVE ${this.wave} IN ${Math.ceil(this.waveCooldown)}s`;
    }
  }

  _spawnEntity(blueprint, playerPos, isBoss = false) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 10;
    const x = playerPos.x + Math.cos(angle) * dist;
    const z = playerPos.z + Math.sin(angle) * dist;
    const floorY = Math.floor(playerPos.y / 20.0) * 20.0;

    const rig = buildOrganEntityRig(blueprint, { uniqueMaterials: true });
    rig.root.position.set(x, floorY, z);
    this.scene.add(rig.root);

    const s = blueprint.stats || computeEntityStats(blueprint.nodes);
    const hpScale = 1 + (this.wave - 1) * 0.20;
    const maxHp = Math.round(s.hp * hpScale);

    this.entities.push({
      id: blueprint.id,
      name: blueprint.name || 'Anomalous Entity',
      isBoss: isBoss || !!blueprint.isBoss,
      danger: s.danger,
      canPhase: s.canPhase,
      halfW: rig.bounds.halfW,
      navHalfW: Math.min(0.38, rig.bounds.halfW),
      height: rig.bounds.height,
      rig,
      mesh: rig.root,
      hp: maxHp,
      maxHp,
      speed: s.speed + Math.min(1.6, (this.wave - 1) * 0.06),
      damage: Math.round(s.damage * (1 + (this.wave - 1) * 0.12)),
      xp: Math.max(18, Math.round(s.danger * 1.6)),
      attackCd: 0,
      attackAnim: 0,
      hitTimer: 0,
      dying: false,
      deathTimer: 0,
      knockX: 0,
      knockZ: 0,
      steerAngle: 0,
      steerTimer: 0,
      phaseCd: 0
    });
  }

  _spawnPortal(pos) {
    const mesh = new THREE.Mesh(this._portalGeo, this._portalMat);
    mesh.position.set(pos.x, pos.y + 1.4, pos.z);
    this.scene.add(mesh);
    this.portals.push({ mesh, life: 45 });
    this.onNotification('REWARD VAULT PORTAL OPENED! Walk into the cyan ring!', 'cyan');
  }

  startNextWave(playerPos, forceBoss = false) {
    this.waveActive = true;
    const isBossWave = forceBoss || (this.wave % 5 === 0);
    this.toSpawn = 4 + this.wave * 2;
    this.spawnTimer = 0.2;
    if (isBossWave) {
      const depth = Math.abs(Math.floor(playerPos.y / 20.0));
      const bossBp = this._pickBlueprintForDepth(depth, true);
      this._spawnEntity(bossBp, playerPos, true);
      this.onNotification(`⚠ MILESTONE BOSS: ${bossBp.name.toUpperCase()} [WAVE ${this.wave}]`, 'red');
    } else {
      this.onNotification(`⚠ HORDE WAVE ${this.wave} INCOMING!`, 'red');
    }
    this._updateWaveHUD();
  }

  damageEntity(ent, amount, player, particleEmitter) {
    if (!ent || ent.dying || ent.hp <= 0) return false;
    this._lastKillerPlayer = player || this._lastKillerPlayer;
    ent.hp -= amount;
    ent.hitTimer = 0.22;

    // Knockback away from player
    if (player && player.camera) {
      const pp = player.camera.position;
      const ep = ent.mesh.position;
      const dx = ep.x - pp.x;
      const dz = ep.z - pp.z;
      const len = Math.hypot(dx, dz) || 1;
      ent.knockX = (dx / len) * 5.2;
      ent.knockZ = (dz / len) * 5.2;
    }

    // Emissive hit-flash on all meshes
    for (const m of ent.rig.meshes) {
      if (m.material && m.material.emissive) {
        if (m.userData._baseEmissive === undefined) {
          m.userData._baseEmissive = m.material.emissive.getHex();
          m.userData._baseEmissiveInt = m.material.emissiveIntensity;
        }
        m.material.emissive.setHex(0xffffff);
        m.material.emissiveIntensity = 1.8;
      }
    }

    if (particleEmitter) {
      const p = ent.mesh.position;
      particleEmitter(this._scratchVec.set(p.x, p.y + ent.height * 0.55, p.z), 10, ent.isBoss ? 0xff44ff : 0xff3344);
    }
    if (ent.hp <= 0) {
      ent.dying = true;
      ent.deathTimer = 0.55;
      ent.hitTimer = 0;
      if (this.audio) this.audio.playBreakSound('fixture');
      return true;
    }
    return false;
  }

  _finalizeEntityDeath(ent, particleEmitter) {
    const pos = ent.mesh.position.clone();
    this.scene.remove(ent.mesh);
    const idx = this.entities.indexOf(ent);
    if (idx !== -1) this.entities.splice(idx, 1);

    this.kills++;
    this.progression.addXp(ent.xp);
    if (this._lastKillerPlayer && this._lastKillerPlayer.lifestealOnKill > 0) {
      this._lastKillerPlayer.heal(this._lastKillerPlayer.lifestealOnKill);
    }

    if (particleEmitter) {
      particleEmitter(pos.clone().setY(pos.y + ent.height * 0.45), 28, ent.isBoss ? 0xff44ff : 0xff5555);
    }

    const coreDrop = ent.isBoss ? 3 : (Math.random() < Math.min(0.95, 0.45 + ent.danger * 0.008) ? 1 : 0);
    if (coreDrop > 0) {
      this.crafting.addResource('core', coreDrop);
      this.onNotification(`+${coreDrop} ANOMALOUS CORE`, 'cyan');
    }
    this.crafting.addResource('scrap', 1 + Math.floor(ent.danger / 25));
    if (Math.random() < 0.35 && this.inventoryManager) {
      this.inventoryManager.addItem('almond_water', 1);
      this.onNotification('+1 ALMOND WATER DROP', 'green');
    }

    if (ent.isBoss) {
      this._spawnPortal(pos);
      this.onNotification(`BOSS BANISHED: ${ent.name}!`, 'amber');
    }
  }

  tryMeleeHit(origin, dir, range, damage, player, particleEmitter) {
    let best = null;
    let bestDist = range;
    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      if (ent.dying) continue;
      this._scratchVec.copy(ent.mesh.position);
      this._scratchVec.y += ent.height * 0.5;
      const d = this._scratchVec.distanceTo(origin);
      if (d <= bestDist + ent.halfW * 0.5) {
        this._scratchDir.subVectors(this._scratchVec, origin).normalize();
        if (this._scratchDir.dot(dir) > 0.55) {
          best = ent;
          bestDist = d;
        }
      }
    }
    if (best) {
      this.damageEntity(best, damage, player, particleEmitter);
      if (this.audio) this.audio.playHitSound('metal');
      return true;
    }
    return false;
  }

  hitInSphere(center, radius, damage, player, particleEmitter) {
    let hitCount = 0;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      if (ent.dying) continue;
      this._scratchVec.copy(ent.mesh.position);
      this._scratchVec.y += ent.height * 0.5;
      if (this._scratchVec.distanceTo(center) <= radius + ent.halfW) {
        this.damageEntity(ent, damage, player, particleEmitter);
        hitCount++;
      }
    }
    return hitCount;
  }

  _collidesAt(x, y, z, halfW, height, collidables, ent) {
    if (ent.canPhase) return false;
    this._entMin.set(x - halfW, y + 0.15, z - halfW);
    this._entMax.set(x + halfW, y + height - 0.1, z + halfW);
    this._entBox.set(this._entMin, this._entMax);

    for (let c = 0; c < collidables.length; c++) {
      const col = collidables[c];
      if (!col.userData?.bbox) continue;
      if (Math.abs(col.position.x - x) > 4.0 || Math.abs(col.position.z - z) > 4.0) continue;
      if (col.userData.bbox.intersectsBox(this._entBox)) {
        if (col.userData.isBarricade && col.userData.worldObject) {
          if (ent.attackCd <= 0) {
            ent.attackCd = 0.7;
            ent.attackAnim = 0.35;
            const broke = col.userData.worldObject.damage(ent.damage);
            if (broke) {
              this.scene.remove(col);
              const ci = this.worldManager.extraCollidables.indexOf(col);
              if (ci !== -1) this.worldManager.extraCollidables.splice(ci, 1);
            }
          }
        }
        return true;
      }
    }
    return false;
  }

  getEntitiesForRadar() {
    return this.entities;
  }

  update(dt, player, particleEmitter) {
    this.animTime += dt;
    const playerPos = player.camera.position;
    const strataDepth = Math.abs(Math.floor(playerPos.y / 20.0));

    if (strataDepth >= this.deepestStrataSeen + 3) {
      this.deepestStrataSeen = strataDepth;
      this.startNextWave(playerPos, true);
    }

    if (!this.waveActive) {
      this.waveCooldown -= dt;
      if (this.waveCooldown <= 0) {
        this.startNextWave(playerPos, false);
      }
    } else {
      if (this.toSpawn > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = 0.85;
          this.toSpawn--;
          const bp = this._pickBlueprintForDepth(strataDepth, false);
          this._spawnEntity(bp, playerPos, false);
        }
      } else if (this.entities.length === 0) {
        this.waveActive = false;
        this.wave++;
        this.waveCooldown = 16.0;
        this.onNotification(`WAVE CLEARED! Next wave in 16s.`, 'green');
      }
    }
    this._updateWaveHUD();

    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i];
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.rotation.z += dt * 1.1;
      p.life -= dt;
      if (p.mesh.position.distanceTo(playerPos) < 1.8) {
        this.scene.remove(p.mesh);
        this.portals.splice(i, 1);
        player.heal(player.maxHp);
        this.progression.addXp(250);
        this.crafting.addResource('copper', 12);
        this.crafting.addResource('ballast', 6);
        this.crafting.addResource('core', 2);
        this.onNotification('SANCTUARY VAULT CLAIMED: FULL INTEGRITY + SALVAGE CACHE!', 'cyan');
        if (this.audio) this.audio.playLevelUpFanfare();
        continue;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.portals.splice(i, 1);
      }
    }

    const collidables = this.worldManager.getNearbyCollidables(playerPos, 1, 1);
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      const pos = ent.mesh.position;

      // Dying collapse animation
      if (ent.dying) {
        ent.deathTimer -= dt;
        const deathP = Math.min(1, 1 - ent.deathTimer / 0.55);
        animateOrganEntity(ent.rig, this.animTime + i * 0.7, 0, { deathProgress: deathP });
        if (ent.deathTimer <= 0) {
          this._finalizeEntityDeath(ent, particleEmitter);
        }
        continue;
      }

      if (ent.attackCd > 0) ent.attackCd -= dt;
      if (ent.attackAnim > 0) ent.attackAnim = Math.max(0, ent.attackAnim - dt);
      if (ent.phaseCd > 0) ent.phaseCd -= dt;

      if (ent.hitTimer > 0) {
        ent.hitTimer = Math.max(0, ent.hitTimer - dt);
        if (ent.hitTimer === 0) {
          for (const m of ent.rig.meshes) {
            if (m.material && m.material.emissive && m.userData._baseEmissive !== undefined) {
              m.material.emissive.setHex(m.userData._baseEmissive);
              m.material.emissiveIntensity = m.userData._baseEmissiveInt;
            }
          }
        }
      }

      this._scratchVec.set(playerPos.x - pos.x, 0, playerPos.z - pos.z);
      const distSq = this._scratchVec.lengthSq();

      if (distSq > 2304) {
        this.scene.remove(ent.mesh);
        this.entities.splice(i, 1);
        continue;
      }

      const dist = Math.sqrt(distSq);
      const standoffDist = ent.halfW + 0.85; // ~0.5m+ clear gap in front of player
      let movingSpeed = 0;

      if (dist > 0.01) {
        this._scratchVec.divideScalar(dist);
        let moveDirX = this._scratchVec.x;
        let moveDirZ = this._scratchVec.z;

        if (ent.steerTimer > 0) {
          ent.steerTimer = Math.max(0, ent.steerTimer - dt);
          const cos = Math.cos(ent.steerAngle);
          const sin = Math.sin(ent.steerAngle);
          moveDirX = this._scratchVec.x * cos - this._scratchVec.z * sin;
          moveDirZ = this._scratchVec.x * sin + this._scratchVec.z * cos;
        }

        ent.mesh.rotation.y = Math.atan2(moveDirX, moveDirZ);

        // Apply knockback + chase velocity with separate-axis AABB wall collision
        let vx = ent.knockX;
        let vz = ent.knockZ;
        ent.knockX *= Math.max(0, 1 - dt * 10);
        ent.knockZ *= Math.max(0, 1 - dt * 10);

        if (dist > standoffDist) {
          vx += moveDirX * ent.speed;
          vz += moveDirZ * ent.speed;
          movingSpeed = ent.speed;
        } else if (dist < standoffDist - 0.15) {
          // Gently back off if player walks into entity so entity stays aimable
          vx -= this._scratchVec.x * 2.5;
          vz -= this._scratchVec.z * 2.5;
        }

        const navW = ent.navHalfW || 0.38;
        const stepX = vx * dt;
        const stepZ = vz * dt;
        let movedDist = 0;

        if (Math.abs(stepX) > 0.0001 && !this._collidesAt(pos.x + stepX, pos.y, pos.z, navW, ent.height, collidables, ent)) {
          pos.x += stepX;
          movedDist += Math.abs(stepX);
        }
        if (Math.abs(stepZ) > 0.0001 && !this._collidesAt(pos.x, pos.y, pos.z + stepZ, navW, ent.height, collidables, ent)) {
          pos.z += stepZ;
          movedDist += Math.abs(stepZ);
        }

        // Corner/doorway steering probe if pinned against a wall
        if (dist > standoffDist && movedDist < ent.speed * dt * 0.25 && ent.steerTimer <= 0) {
          const probeAngles = [0.78, -0.78, 1.45, -1.45, 2.2, -2.2];
          const probeDist = 0.9;
          for (const ang of probeAngles) {
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            const px = this._scratchVec.x * c - this._scratchVec.z * s;
            const pz = this._scratchVec.x * s + this._scratchVec.z * c;
            if (!this._collidesAt(pos.x + px * probeDist, pos.y, pos.z + pz * probeDist, navW, ent.height, collidables, ent)) {
              ent.steerAngle = ang;
              ent.steerTimer = 0.65;
              break;
            }
          }
        }
      }

      const targetFloorY = Math.floor(playerPos.y / 20.0) * 20.0;
      pos.y += (targetFloorY - pos.y) * Math.min(1, dt * 3.0);

      animateOrganEntity(ent.rig, this.animTime + i * 0.7, movingSpeed, {
        attackProgress: ent.attackAnim > 0 ? 1 - (ent.attackAnim / 0.35) : 0,
        hitProgress: ent.hitTimer > 0 ? (ent.hitTimer / 0.22) : 0
      });

      // Attack Player from standoff range (~0.5m+ away)
      const pdy = Math.abs((playerPos.y - 1.6) - pos.y);
      if (dist <= standoffDist + 0.35 && pdy < ent.height + 0.6 && ent.attackCd <= 0) {
        ent.attackCd = 0.95;
        ent.attackAnim = 0.35;
        player.takeDamage(ent.damage);
        this.onNotification(`HIT BY ${ent.name.toUpperCase()} (-${ent.damage} HP)`, 'red');
      }
    }
  }
}
