import * as THREE from 'three';
import { PICKUP_GEOMETRY, getPickupMaterial, SHARED_BUILDABLE_ASSETS } from './world/sharedAssets.js';

/**
 * Player: Controls player physics, 3D multi-floor collisions,
 * deconstruction raycasting, vacuum pickup magnetism, and survival abilities.
 */
export class Player {
  constructor(camera, scene, worldManager, crafting, progression, audio, onNotification) {
    this.camera = camera;
    this.scene = scene;
    this.worldManager = worldManager;
    this.crafting = crafting;
    this.progression = progression;
    this.audio = audio;
    this.onNotification = onNotification || (() => {});

    // Position & Movement Physics: Spawn in center of 12x12m initial room
    this.camera.position.set(6.0, 1.6, 6.0); // Eye height 1.6m above floor
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.isOnGround = true;
    this.cameraBobTimer = 0;

    // Player Attributes & Upgrades
    this.harvestPower = 26.0;
    this.speedMultiplier = 1.0;
    this.jumpSpeed = 7.5;
    this.gravityScale = 1.0;
    this.magnetRange = 4.5;
    this.magnetSpeed = 7.2;
    this.doubleElectrical = false;
    this.hasPhase = false;
    this.phaseDistance = 4.2;
    this.ambientSiphon = false;
    this.barricadeMaxHp = 80;
    this.splashDamageRatio = 0;
    this.strataBoreMultiplier = 1.0;
    this.thermalOverclock = false;
    this.quantumRecycler = false;
    this.roverSpeedBonus = 1.0;
    this.roverHarvestBonus = 1.0;

    // Survival Integrity (HP) & Mobility
    this.hp = 100;
    this.maxHp = 100;
    this.isDead = false;
    this.hasDoubleJump = false;
    this.airJumpsLeft = 0;
    this.speedBuffTimer = 0;
    this.fireCooldown = 0;
    this._damageFlashTimer = 0;
    this.weaponDamageBonus = 1.0;
    this.blastRadiusBonus = 1.0;
    this.lifestealOnKill = 0;

    // External System References (wired by GameEngine)
    this.inventoryManager = null;
    this.projectileManager = null;
    this.entityManager = null;
    this.onGameOver = null;

    // Cached HP HUD DOM
    this._hpFillEl = document.getElementById('hp-fill');
    this._hpNumbersEl = document.getElementById('hp-numbers');
    this.updateHPUI();

    // Raycasting & Interaction
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.0;
    this.currentTarget = null;

    // Pre-allocated scratch objects (zero per-frame GC)
    this._scratchVec = new THREE.Vector3();
    this._scratchDir = new THREE.Vector3();
    this._oldPos = new THREE.Vector3();
    this._midPos = new THREE.Vector3();
    this._boxCenter = new THREE.Vector3();
    this._boxSize = new THREE.Vector3(0.64, 1.70, 0.64);
    this._oldBox = new THREE.Box3();
    this._midBox = new THREE.Box3();
    this._playerBox = new THREE.Box3();
    this._upDir = new THREE.Vector3(0, 1, 0);
    this._downDir = new THREE.Vector3(0, -1, 0);
    this._upRay = new THREE.Raycaster(new THREE.Vector3(), this._upDir, 0, 0.55);
    this._downRay = new THREE.Raycaster(new THREE.Vector3(), this._downDir, 0, 2.8);
    this._centerNDC = { x: 0, y: 0 };

    // Cached Target HUD DOM references
    this._targetInfoEl = document.getElementById('target-info');
    this._targetTitleEl = document.getElementById('target-title');
    this._targetFillEl = document.getElementById('target-hp-fill');
    this._lastTargetText = '';
    this._lastTargetPct = -1;
    this._targetHudVisible = false;

    // Floating Pickups
    this.floatingPickups = [];

    // Conduit Lantern Setup
    this.lanternLight = new THREE.SpotLight(0xfffaed, 0, 18, Math.PI / 4, 0.4, 1.2);
    this.lanternLight.position.set(0.2, -0.2, -0.2);
    this.lanternLight.target.position.set(0, 0, -5);
    this.camera.add(this.lanternLight);
    this.camera.add(this.lanternLight.target);
    this.lanternOn = false;
    this.lanternIntensity = 2.6;
    this.lanternRange = 18;
    this.lastJumpPadTime = 0;

    // Instanced block hit-rattle scratch objects
    this._hitDummy = new THREE.Object3D();
    this._lastRattledObj = null;

    // First-Person Salvage Tool Viewmodel
    this.toolSwayTimer = 0;
    this.toolSwingTimer = 0;
    this.buildViewmodel();
  }

  buildViewmodel() {
    this.toolGroup = new THREE.Group();
    this.toolBasePos = new THREE.Vector3(0.32, -0.28, -0.48);
    this.toolGroup.position.copy(this.toolBasePos);

    const gripMat = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.75, metalness: 0.3 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.28, metalness: 0.85 });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffb000,
      emissive: 0xff8800,
      emissiveIntensity: 1.2,
      roughness: 0.3
    });

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), gripMat);
    shaft.position.set(0, 0, 0);
    this.toolGroup.add(shaft);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.16), steelMat);
    head.position.set(0, 0.01, -0.22);
    this.toolGroup.add(head);

    const chisel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.12), steelMat);
    chisel.position.set(0, -0.02, -0.32);
    chisel.rotation.x = 0.35;
    this.toolGroup.add(chisel);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 0.10), coreMat);
    core.position.set(0, 0.042, -0.10);
    this.toolGroup.add(core);
    this._vmCoreMat = coreMat;
    this._vmShaft = shaft;
    this._vmHead = head;
    this._vmChisel = chisel;

    this.camera.add(this.toolGroup);
  }

  updateViewmodelForItem(item) {
    if (!this._vmCoreMat) return;
    const id = item ? item.id : 'prybar';
    if (id === 'nailgun') {
      this._vmCoreMat.color.setHex(0xffaa00);
      this._vmCoreMat.emissive.setHex(0xff6600);
      this._vmHead.scale.set(1.2, 1.4, 1.8);
      this._vmChisel.visible = false;
    } else if (id === 'arc_rifle') {
      this._vmCoreMat.color.setHex(0x00f0ff);
      this._vmCoreMat.emissive.setHex(0x00aaff);
      this._vmHead.scale.set(1.3, 1.1, 2.2);
      this._vmChisel.visible = false;
    } else if (id === 'breaching_charge') {
      this._vmCoreMat.color.setHex(0xff3344);
      this._vmCoreMat.emissive.setHex(0xff0022);
      this._vmHead.scale.set(1.5, 0.8, 0.9);
      this._vmChisel.visible = false;
    } else {
      this._vmCoreMat.color.setHex(0xffb000);
      this._vmCoreMat.emissive.setHex(0xff8800);
      this._vmHead.scale.set(1, 1, 1);
      this._vmChisel.visible = true;
    }
  }

  updateHPUI() {
    const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
    if (this._hpFillEl) this._hpFillEl.style.width = `${pct}%`;
    if (this._hpNumbersEl) this._hpNumbersEl.innerText = `${Math.ceil(this.hp)} / ${this.maxHp}`;
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateHPUI();
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.updateHPUI();
    if (this.audio && this.audio.playDamageSound) this.audio.playDamageSound();
    const vig = document.getElementById('damage-vignette');
    if (vig) {
      vig.classList.add('hit');
      setTimeout(() => vig.classList.remove('hit'), 180);
    }
    if (this.hp <= 0) {
      this.isDead = true;
      if (this.onGameOver) this.onGameOver();
    }
  }

  jump() {
    if (this.isOnGround) {
      this.velocity.y = this.jumpSpeed;
      this.isOnGround = false;
      this.airJumpsLeft = this.hasDoubleJump ? 1 : 0;
    } else if (this.hasDoubleJump && this.airJumpsLeft > 0) {
      this.velocity.y = this.jumpSpeed * 0.95;
      this.airJumpsLeft--;
      if (this.audio) this.audio.playPhaseSound();
      this.onNotification('THRUSTER DOUBLE-JUMP!', 'cyan');
    }
  }

  enableLantern() {
    this.lanternOn = true;
    this.lanternLight.intensity = this.lanternIntensity;
    this.lanternLight.distance = this.lanternRange;
  }

  toggleLantern() {
    if (!this.crafting.lanternUnlocked) {
      this.onNotification('Need to craft Conduit Lantern first!', 'red');
      return;
    }
    this.lanternOn = !this.lanternOn;
    this.lanternLight.intensity = this.lanternOn ? this.lanternIntensity : 0;
    this.onNotification(this.lanternOn ? 'Conduit Lantern: ON' : 'Conduit Lantern: OFF', 'amber');
  }

  triggerPhaseGlitch() {
    if (!this.hasPhase) {
      this.onNotification('Phase Glitch perk not unlocked yet!', 'red');
      return;
    }

    this.camera.getWorldDirection(this._scratchDir);
    this._scratchDir.y = 0;
    this._scratchDir.normalize();

    this.camera.position.addScaledVector(this._scratchDir, this.phaseDistance);

    if (this.audio) this.audio.playPhaseSound();

    const flash = document.getElementById('screen-flash');
    if (flash) {
      flash.style.background = 'rgba(0, 240, 255, 0.45)';
      flash.style.opacity = '1';
      setTimeout(() => { flash.style.opacity = '0'; }, 160);
    }

    this.onNotification('>>> NOCLIP WARP ACTIVATED <<<', 'cyan');
  }

  placeBarricade() {
    if (this.crafting.inventory.barricades <= 0) {
      this.onNotification('No Barricades in inventory! Craft at workbench [Tab].', 'red');
      return;
    }

    this.camera.getWorldDirection(this._scratchDir);
    this._scratchDir.y = 0;
    this._scratchDir.normalize();

    const spawnPos = this._scratchVec.copy(this.camera.position).addScaledVector(this._scratchDir, 2.2);
    const currentFloorY = Math.floor(this.camera.position.y / 20.0) * 20.0;
    spawnPos.y = currentFloorY + 1.5;

    const barricadeMesh = new THREE.Mesh(
      SHARED_BUILDABLE_ASSETS.barricadeGeo,
      SHARED_BUILDABLE_ASSETS.barricadeMat
    );
    barricadeMesh.position.copy(spawnPos);

    barricadeMesh.userData = {
      type: 'drywall',
      title: 'Reinforced Barricade',
      hp: this.barricadeMaxHp,
      maxHp: this.barricadeMaxHp,
      drops: { drywall: 5, wood: 2 },
      xp: 15,
      isWall: true,
      bbox: new THREE.Box3().setFromObject(barricadeMesh)
    };

    this.scene.add(barricadeMesh);
    this.worldManager.extraDestructibles.push(barricadeMesh);
    this.worldManager.extraCollidables.push(barricadeMesh);

    this.crafting.inventory.barricades--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Barricade deployed! [${this.crafting.inventory.barricades} left]`, 'green');

    if (this.audio) this.audio.playBreakSound('drywall');
  }

  placeScaffolding() {
    if (this.crafting.inventory.scaffolding <= 0) {
      this.onNotification('No Scaffolding in inventory! Craft at workbench [Tab].', 'red');
      return;
    }

    this.camera.getWorldDirection(this._scratchDir);
    this._scratchDir.y = 0;
    this._scratchDir.normalize();

    this.raycaster.setFromCamera(this._centerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.worldManager.getNearbyDestructibles(this.camera.position, 1, 1), false);
    let spawnPos = null;

    if (hits.length > 0 && hits[0].distance < 4.5 && hits[0].object.userData.isScaffolding) {
      spawnPos = hits[0].object.position.clone();
      spawnPos.y += 1.5;
    } else {
      spawnPos = this.camera.position.clone().addScaledVector(this._scratchDir, 2.0);
      spawnPos.y = Math.floor(this.camera.position.y / 1.5) * 1.5 + 0.75;
    }

    const scMesh = new THREE.Mesh(
      SHARED_BUILDABLE_ASSETS.scaffoldingGeo,
      SHARED_BUILDABLE_ASSETS.scaffoldingMat
    );
    scMesh.position.copy(spawnPos);

    scMesh.userData = {
      type: 'scaffolding',
      title: 'Modular Scaffolding Tower',
      hp: 40,
      maxHp: 40,
      drops: { wood: 4 },
      xp: 8,
      isScaffolding: true,
      bbox: new THREE.Box3().setFromObject(scMesh)
    };

    this.scene.add(scMesh);
    this.worldManager.extraDestructibles.push(scMesh);

    this.crafting.inventory.scaffolding--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Scaffolding placed! [${this.crafting.inventory.scaffolding} left]`, 'green');

    if (this.audio) this.audio.playHitSound('metal');
  }

  placeBeacon() {
    if ((this.crafting.inventory.beacons || 0) <= 0) {
      this.onNotification('No Wall Beacons in inventory! Craft at workbench [Tab].', 'red');
      return;
    }

    this.camera.getWorldDirection(this._scratchDir);
    this._scratchDir.y = 0;
    this._scratchDir.normalize();

    const spawnPos = this.camera.position.clone().addScaledVector(this._scratchDir, 1.4);
    spawnPos.y = this.camera.position.y - 0.9;

    const beaconMesh = new THREE.Mesh(
      SHARED_BUILDABLE_ASSETS.beaconGeo,
      SHARED_BUILDABLE_ASSETS.beaconMat
    );
    beaconMesh.position.copy(spawnPos);

    const lightDesc = {
      mesh: beaconMesh,
      position: spawnPos.clone(),
      lightPos: spawnPos.clone().add(new THREE.Vector3(0, 0.35, 0)),
      lightConfig: { color: 0x00f0ff, intensity: 2.0, distance: 11, decay: 1.3 },
      baseIntensity: 2.0,
      alive: true
    };

    beaconMesh.userData = {
      type: 'fixture',
      title: 'Luminous Trail Beacon',
      hp: 20,
      maxHp: 20,
      drops: { copper: 1 },
      xp: 4,
      isLight: true,
      lightDesc
    };

    this.scene.add(beaconMesh);
    this.worldManager.extraDestructibles.push(beaconMesh);
    this.worldManager.extraLights.push(lightDesc);

    this.crafting.inventory.beacons--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Trail Beacon placed! [${this.crafting.inventory.beacons} left]`, 'cyan');
    if (this.audio) this.audio.playPickupSound();
  }

  placeJumpPad() {
    if ((this.crafting.inventory.jumppads || 0) <= 0) {
      this.onNotification('No Jump Pads in inventory! Craft at workbench [Tab].', 'red');
      return;
    }

    this.camera.getWorldDirection(this._scratchDir);
    this._scratchDir.y = 0;
    this._scratchDir.normalize();

    const spawnPos = this.camera.position.clone().addScaledVector(this._scratchDir, 1.6);
    const currentFloorY = Math.floor(this.camera.position.y / 20.0) * 20.0;
    spawnPos.y = currentFloorY + 0.12;

    const padMesh = new THREE.Mesh(
      SHARED_BUILDABLE_ASSETS.jumpPadGeo,
      SHARED_BUILDABLE_ASSETS.jumpPadMat
    );
    padMesh.position.copy(spawnPos);
    padMesh.userData = {
      type: 'scaffolding',
      title: 'Pneumatic Jump Pad',
      hp: 60,
      maxHp: 60,
      drops: { scrap: 2, piston: 1 },
      xp: 10,
      isJumpPad: true
    };

    this.scene.add(padMesh);
    this.worldManager.extraDestructibles.push(padMesh);
    this.worldManager.jumpPads.push(padMesh);

    this.crafting.inventory.jumppads--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Jump Pad deployed! [${this.crafting.inventory.jumppads} left]`, 'amber');
    if (this.audio) this.audio.playHitSound('metal');
  }

  updatePhysics(dt, input) {
    if (!input.isLocked()) return;

    // Deceleration & friction
    this.velocity.x -= this.velocity.x * 10.0 * dt;
    this.velocity.z -= this.velocity.z * 10.0 * dt;

    // Gravity (scaled by Low-Gravity Anomaly perk)
    this.velocity.y -= 22.0 * this.gravityScale * dt;

    // Direction calculation
    this.direction.z = Number(input.moveForward) - Number(input.moveBackward);
    this.direction.x = Number(input.moveRight) - Number(input.moveLeft);
    this.direction.normalize();

    if (this.speedBuffTimer > 0) this.speedBuffTimer = Math.max(0, this.speedBuffTimer - dt);
    const buffMult = this.speedBuffTimer > 0 ? 1.15 : 1.0;
    const baseSpeed = input.isSprinting ? 6.2 : 3.8;
    const speed = baseSpeed * this.speedMultiplier * buffMult;

    if (input.moveForward || input.moveBackward) {
      this.velocity.z -= this.direction.z * speed * 12.0 * dt;
    }
    if (input.moveLeft || input.moveRight) {
      this.velocity.x -= this.direction.x * speed * 12.0 * dt;
    }

    const deltaX = -this.velocity.x * dt;
    const deltaZ = -this.velocity.z * dt;

    // Zero-allocation AABB Collision with nearby walls
    const camPos = this.camera.position;
    this._oldPos.copy(camPos);
    this._boxCenter.set(this._oldPos.x, this._oldPos.y - 0.70, this._oldPos.z);
    this._oldBox.setFromCenterAndSize(this._boxCenter, this._boxSize);

    input.controls.moveRight(deltaX);
    this._boxCenter.set(camPos.x, camPos.y - 0.70, camPos.z);
    this._playerBox.setFromCenterAndSize(this._boxCenter, this._boxSize);

    const collidables = this.worldManager.getNearbyCollidables(camPos, 1, 0);
    let hitX = false;
    for (let i = 0; i < collidables.length; i++) {
      const col = collidables[i];
      if (!col.userData?.bbox) continue;
      if (Math.abs(col.position.x - camPos.x) > 3.5 ||
          Math.abs(col.position.z - camPos.z) > 3.5 ||
          Math.abs(col.position.y - camPos.y) > 3.5) {
        continue;
      }
      if (col.userData.bbox.intersectsBox(this._playerBox)) {
        if (!col.userData.bbox.intersectsBox(this._oldBox)) {
          hitX = true;
          break;
        }
      }
    }
    if (hitX) {
      camPos.x = this._oldPos.x;
      camPos.z = this._oldPos.z;
    }

    this._midPos.copy(camPos);
    this._boxCenter.set(this._midPos.x, this._midPos.y - 0.70, this._midPos.z);
    this._midBox.setFromCenterAndSize(this._boxCenter, this._boxSize);

    input.controls.moveForward(deltaZ);
    this._boxCenter.set(camPos.x, camPos.y - 0.70, camPos.z);
    this._playerBox.setFromCenterAndSize(this._boxCenter, this._boxSize);

    let hitZ = false;
    for (let i = 0; i < collidables.length; i++) {
      const col = collidables[i];
      if (!col.userData?.bbox) continue;
      if (Math.abs(col.position.x - camPos.x) > 3.5 ||
          Math.abs(col.position.z - camPos.z) > 3.5 ||
          Math.abs(col.position.y - camPos.y) > 3.5) {
        continue;
      }
      if (col.userData.bbox.intersectsBox(this._playerBox)) {
        if (!col.userData.bbox.intersectsBox(this._midBox)) {
          hitZ = true;
          break;
        }
      }
    }
    if (hitZ) {
      camPos.x = this._midPos.x;
      camPos.z = this._midPos.z;
    }

    // Chunk-local destructibles for vertical raycasts (current chunk + 1 above/below)
    const verticalCandidates = this.worldManager.getNearbyDestructibles(camPos, 0, 1);

    // Upward Ceiling / Head Collision
    if (this.velocity.y > 0) {
      this._upRay.set(camPos, this._upDir);
      this._upRay.far = 0.55;
      const ceilHits = this._upRay.intersectObjects(verticalCandidates, false);
      for (let i = 0; i < ceilHits.length; i++) {
        const h = ceilHits[i];
        const obj = this._resolveHitObject(h);
        const type = obj ? obj.type : h.object.userData?.type;
        if (type === 'ceiling' || type === 'subceiling' || type === 'fixture' || type === 'floor' || type === 'subfloor') {
          camPos.y = Math.min(camPos.y, h.point.y - 0.3);
          this.velocity.y = 0;
          break;
        }
      }
    }

    // Dynamic Floor & Ceiling Support
    const rayLength = Math.max(1.2, Math.abs(this.velocity.y * dt) + 1.0);
    this._downRay.set(camPos, this._downDir);
    this._downRay.far = 1.6 + rayLength;
    const floorHits = this._downRay.intersectObjects(verticalCandidates, false);

    let foundFloorY = null;
    for (let i = 0; i < floorHits.length; i++) {
      const h = floorHits[i];
      const obj = this._resolveHitObject(h);
      const type = obj ? obj.type : h.object.userData?.type;
      if (type === 'floor' || type === 'subfloor' || type === 'subceiling' || type === 'ceiling') {
        if (h.point.y <= camPos.y - 0.8) {
          foundFloorY = h.point.y + 1.6;
          break;
        }
      }
    }

    const nextY = camPos.y + this.velocity.y * dt;

    if (foundFloorY !== null && (camPos.y <= foundFloorY + 0.1 || nextY <= foundFloorY)) {
      camPos.y = foundFloorY;
      this.velocity.y = 0;
      this.isOnGround = true;
      this.airJumpsLeft = this.hasDoubleJump ? 1 : 0;
    } else {
      camPos.y = nextY;
      this.isOnGround = false;
    }

    // Check Jump Pads
    const jumpPads = this.worldManager.jumpPads;
    if (jumpPads.length > 0) {
      const now = performance.now();
      if (now - this.lastJumpPadTime > 350) {
        const feetY = camPos.y - 1.5;
        for (let i = 0; i < jumpPads.length; i++) {
          const pad = jumpPads[i];
          const dx = pad.position.x - camPos.x;
          const dz = pad.position.z - camPos.z;
          const dy = Math.abs(pad.position.y - feetY);
          if (dx * dx + dz * dz < 0.75 && dy < 0.8) {
            this.velocity.y = 14.5;
            this.isOnGround = false;
            this.lastJumpPadTime = now;
            if (this.audio) this.audio.playPhaseSound();
            break;
          }
        }
      }
    }

    // Check Scaffolding ladder climb
    const extras = this.worldManager.extraDestructibles;
    if (extras.length > 0) {
      this._scratchVec.set(camPos.x, camPos.y - 0.8, camPos.z);
      for (let i = 0; i < extras.length; i++) {
        const d = extras[i];
        if (d.userData && d.userData.isScaffolding) {
          if (d.position.distanceToSquared(this._scratchVec) < 1.96) {
            this.velocity.y = 0;
            if (input.moveForward || input.isSprinting) {
              this.velocity.y = 5.0;
            } else if (input.moveBackward) {
              this.velocity.y = -3.5;
            }
            this.isOnGround = true;
            break;
          }
        }
      }
    }

    // Camera walk bob + Viewmodel sway
    if (this.isOnGround && (input.moveForward || input.moveBackward || input.moveLeft || input.moveRight)) {
      this.cameraBobTimer += dt * (input.isSprinting ? 14 : 9);
      camPos.y += Math.sin(this.cameraBobTimer) * 0.035;
      this.toolSwayTimer += dt * (input.isSprinting ? 12 : 8);
    } else {
      this.toolSwayTimer += dt * 1.5;
    }

    if (this.toolGroup) {
      const swayX = Math.cos(this.toolSwayTimer * 0.5) * 0.012;
      const swayY = Math.abs(Math.sin(this.toolSwayTimer)) * 0.014;
      if (input.isMining) {
        this.toolSwingTimer += dt * 26.0;
        const jab = Math.sin(this.toolSwingTimer) * 0.055;
        this.toolGroup.position.set(
          this.toolBasePos.x + swayX + (Math.random() - 0.5) * 0.008,
          this.toolBasePos.y - swayY + jab * 0.35,
          this.toolBasePos.z - Math.abs(jab)
        );
        this.toolGroup.rotation.set(jab * 2.2, 0, -0.15);
      } else {
        this.toolGroup.position.lerp(
          this._scratchVec.set(this.toolBasePos.x + swayX, this.toolBasePos.y - swayY, this.toolBasePos.z),
          Math.min(1, dt * 14)
        );
        this.toolGroup.rotation.x *= 0.82;
        this.toolGroup.rotation.z *= 0.82;
      }
    }
  }

  _restoreInstancedRattle() {
    const obj = this._lastRattledObj;
    if (obj && !obj.destroyed && obj.instancedMesh && obj.instanceId >= 0) {
      this._hitDummy.position.copy(obj.position);
      this._hitDummy.rotation.set(0, 0, 0);
      this._hitDummy.scale.set(1, 1, 1);
      this._hitDummy.updateMatrix();
      obj.instancedMesh.setMatrixAt(obj.instanceId, this._hitDummy.matrix);
      obj.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    this._lastRattledObj = null;
  }

  _resolveHitObject(hit) {
    const mesh = hit.object;
    if (hit.instanceId !== undefined && mesh.userData?.instances) {
      return mesh.userData.instances[hit.instanceId] || null;
    }
    const root = mesh.userData?.rootMesh || mesh;
    return mesh.userData?.worldObject || root.userData?.worldObject || mesh.userData || null;
  }

  updateHarvesting(dt, input, particleEmitter, debrisSystem, onShake) {
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const activeItem = this.inventoryManager ? this.inventoryManager.getActiveItem() : null;
    if (input.isMining && activeItem) {
      if ((activeItem.id === 'nailgun' || activeItem.id === 'arc_rifle') && this.projectileManager) {
        if (this.fireCooldown <= 0) {
          this.camera.getWorldDirection(this._scratchDir);
          const origin = this._scratchVec.copy(this.camera.position).addScaledVector(this._scratchDir, 0.45);
          const cooldown = this.projectileManager.spawnProjectile(origin, this._scratchDir, activeItem, this);
          this.fireCooldown = Number.isFinite(cooldown) ? cooldown : 0.15;
          this.toolSwingTimer += 0.9;
          if (this.toolGroup) {
            this.toolGroup.position.z += 0.075;
            this.toolGroup.rotation.x += 0.22;
          }
          if (onShake) onShake(0.08);
        }
      } else if (activeItem.id === 'breaching_charge' && this.projectileManager) {
        if (this.fireCooldown <= 0) {
          this.camera.getWorldDirection(this._scratchDir);
          const origin = this._scratchVec.copy(this.camera.position).addScaledVector(this._scratchDir, 0.5);
          this.projectileManager.spawnBreachingCharge(origin, this._scratchDir);
          this.inventoryManager.consumeChargeAtActive(this);
          this.fireCooldown = 0.45;
          this.onNotification('BREACHING CHARGE PLANTED — STAND CLEAR!', 'amber');
        }
      }
    }

    // Melee hit check against active entities when swinging Prybar / default tool
    if (input.isMining && (!activeItem || activeItem.id === 'prybar') && this.entityManager && this.fireCooldown <= 0) {
      this.camera.getWorldDirection(this._scratchDir);
      const meleeDmg = ((this.harvestPower * 0.85) + (activeItem ? (activeItem.level - 1) * 8 : 0)) * (this.weaponDamageBonus || 1.0);
      if (this.entityManager.tryMeleeHit(this.camera.position, this._scratchDir, 3.2, meleeDmg, this, particleEmitter)) {
        this.fireCooldown = 0.24;
      }
    }

    this.raycaster.setFromCamera(this._centerNDC, this.camera);
    const destructibles = this.worldManager.getNearbyDestructibles(this.camera.position, 1, 1);
    const hits = this.raycaster.intersectObjects(destructibles, false);

    if (hits.length > 0 && hits[0].distance < 3.8) {
      const hit = hits[0];
      const mesh = hit.object;
      const worldObj = this._resolveHitObject(hit);
      const isInstanced = (hit.instanceId !== undefined && mesh.userData?.instances);
      const rootMesh = isInstanced ? null : (mesh.userData?.rootMesh || mesh);

      if (!worldObj || worldObj.hp <= 0 || worldObj.destroyed) {
        this._restoreInstancedRattle();
        this.hideTargetHUD();
        return;
      }

      this.updateTargetHUD(worldObj);

      if (input.isMining && (!activeItem || activeItem.id === 'prybar')) {
        if (worldObj.requiresExplosive) {
          if (this.fireCooldown <= 0) {
            this.fireCooldown = 0.6;
            this.onNotification('[REINFORCED — USE BREACHING CHARGE]', 'red');
            if (this.audio) this.audio.playHitSound('concrete');
          }
          return;
        }
        this.currentTarget = rootMesh;

        let power = this.harvestPower;
        if (this.thermalOverclock && this.lanternOn) power *= 1.3;
        const t = worldObj.type;
        if (this.strataBoreMultiplier > 1.0 && (t === 'floor' || t === 'subfloor' || t === 'ceiling' || t === 'subceiling')) {
          power *= this.strataBoreMultiplier;
        }

        const dmg = power * dt;
        let isDepleted = false;

        if (worldObj.damage) {
          isDepleted = worldObj.damage(dmg);
        } else {
          mesh.userData.hp = (mesh.userData.hp || 30) - dmg;
          if (rootMesh && rootMesh.userData) rootMesh.userData.hp = mesh.userData.hp;
          isDepleted = (mesh.userData.hp <= 0);
        }

        if (Math.random() < 0.28 && this.audio) {
          this.audio.playHitSound(worldObj.type || 'drywall');
        }

        // Visual rattle + micro camera shake
        if (onShake && Math.random() < 0.45) onShake(0.05);

        if (isInstanced && !isDepleted) {
          if (this._lastRattledObj && this._lastRattledObj !== worldObj) {
            this._restoreInstancedRattle();
          }
          this._lastRattledObj = worldObj;
          const hpRatio = Math.max(0.15, worldObj.hp / Math.max(1, worldObj.maxHp));
          const j = 0.035 * (1.2 - hpRatio * 0.5);
          this._hitDummy.position.copy(worldObj.position);
          this._hitDummy.rotation.set(
            (Math.random() - 0.5) * 0.04,
            (Math.random() - 0.5) * 0.04,
            (Math.random() - 0.5) * 0.04
          );
          this._hitDummy.scale.set(
            1 - (1 - hpRatio) * 0.06 + (Math.random() - 0.5) * j,
            1 - (1 - hpRatio) * 0.06 + (Math.random() - 0.5) * j,
            1 - (1 - hpRatio) * 0.06 + (Math.random() - 0.5) * j
          );
          this._hitDummy.updateMatrix();
          worldObj.instancedMesh.setMatrixAt(worldObj.instanceId, this._hitDummy.matrix);
          worldObj.instancedMesh.instanceMatrix.needsUpdate = true;
        } else if (rootMesh && rootMesh.scale) {
          const jitter = 0.04;
          rootMesh.scale.set(
            1 + (Math.random() - 0.5) * jitter,
            1 + (Math.random() - 0.5) * jitter,
            1 + (Math.random() - 0.5) * jitter
          );
        }

        if (particleEmitter) {
          particleEmitter(hit.point, 2, worldObj.type === 'fixture' ? 0x00f0ff : 0xd4c07b);
        }

        // Occasional chipped 3D debris while drilling
        if (debrisSystem && Math.random() < 0.14) {
          this.camera.getWorldDirection(this._scratchDir);
          debrisSystem.spawnShatter(hit.point, worldObj.type || 'wall', 1, this._scratchDir.negate());
        }

        if (isDepleted) {
          this._lastRattledObj = null;
          this.handleDepletion(rootMesh, worldObj, hit.point, particleEmitter, debrisSystem, onShake);
        }
      } else {
        this._restoreInstancedRattle();
        if (this.currentTarget && this.currentTarget.scale) {
          this.currentTarget.scale.set(1, 1, 1);
        }
      }
    } else {
      this._restoreInstancedRattle();
      this.hideTargetHUD();
      if (this.currentTarget && this.currentTarget.scale) {
        this.currentTarget.scale.set(1, 1, 1);
      }
    }
  }

  handleDepletion(mesh, worldObj, hitPoint, particleEmitter, debrisSystem, onShake) {
    const rootMesh = mesh ? (mesh.userData?.rootMesh || mesh) : null;
    const originPos = hitPoint || worldObj.position || (rootMesh ? rootMesh.position : this.camera.position);

    if (this.audio) this.audio.playBreakSound(worldObj.type || 'drywall');
    if (particleEmitter) particleEmitter(originPos, 24, 0xffde7a);
    if (onShake) onShake(0.32);

    // Procedural 3D tumbling debris shatter!
    if (debrisSystem) {
      this.camera.getWorldDirection(this._scratchDir);
      debrisSystem.spawnShatter(worldObj.position || originPos, worldObj.type || 'wall', 18, this._scratchDir);
    }

    // Calculate drops
    const drops = (worldObj.getDrops ? worldObj.getDrops() : worldObj.drops) || {};
    if (this.doubleElectrical && drops.copper) {
      drops.copper = Math.floor(drops.copper * 2);
      drops.ballast = (drops.ballast || 1) + 1;
    }

    // Quantum Recycler perk: 25% chance to duplicate drops
    if (this.quantumRecycler && Math.random() < 0.25) {
      for (const k of Object.keys(drops)) {
        drops[k] = Math.ceil(drops[k] * 2);
      }
    }

    this.spawnPickups(originPos, drops);

    const xpEarned = worldObj.xp || 10;
    this.progression.addXp(xpEarned);

    if (worldObj.isLight || worldObj.type === 'fixture') {
      if (worldObj.lightDesc) worldObj.lightDesc.alive = false;
      this.onNotification('LIGHT FIXTURE DESTROYED - SECTOR UNLIT', 'red');
    }

    // Remove from world cleanly (supports both instanced WorldObject and standalone Mesh)
    this.worldManager.removeObject(worldObj.instancedMesh ? worldObj : rootMesh);
    if (worldObj && worldObj.destroy) {
      worldObj.destroy(this.scene);
    } else if (rootMesh) {
      if (rootMesh.parent) rootMesh.parent.remove(rootMesh);
      if (this.scene) this.scene.remove(rootMesh);
      if (rootMesh.geometry && !rootMesh.geometry.userData?.isShared) {
        rootMesh.geometry.dispose();
      }
    }

    // Kinetic Shockwave perk: splash damage to nearby blocks
    if (this.splashDamageRatio > 0 && originPos) {
      const { cx, cy, cz } = this.worldManager.getChunkCoords(originPos);
      const chunk = this.worldManager.loadedChunks.get(`${cx},${cy},${cz}`);
      if (chunk) {
        const splashDmg = this.harvestPower * this.splashDamageRatio;
        for (let i = 0; i < chunk.objects.length; i++) {
          const other = chunk.objects[i];
          if (!other || other.destroyed || other === worldObj || !other.position) continue;
          if (other.position.distanceToSquared(originPos) < 4.8) {
            if (other.damage && other.damage(splashDmg)) {
              this.spawnPickups(other.position, other.getDrops ? other.getDrops() : other.drops);
              this.progression.addXp(other.xp || 6);
              this.worldManager.removeObject(other.instancedMesh ? other : other.mesh);
              other.destroy(this.scene);
            }
          }
        }
      }
    }

    this.currentTarget = null;
    this.hideTargetHUD();
  }

  spawnPickups(origin, dropTable) {
    if (!dropTable) return;
    for (const [key, qty] of Object.entries(dropTable)) {
      if (!qty || qty <= 0) continue;

      const mat = getPickupMaterial(key);
      const mesh = new THREE.Mesh(PICKUP_GEOMETRY, mat);

      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 0.5;
      mesh.position.y += Math.random() * 0.3;
      mesh.position.z += (Math.random() - 0.5) * 0.5;

      this.scene.add(mesh);
      this.floatingPickups.push({
        mesh,
        type: key,
        quantity: qty
      });
    }
  }

  updatePickups(dt) {
    const playerPos = this.camera.position;
    const now = performance.now() * 0.005;

    for (let i = this.floatingPickups.length - 1; i >= 0; i--) {
      const p = this.floatingPickups[i];
      const mesh = p.mesh;

      mesh.rotation.x += dt * 3.0;
      mesh.rotation.y += dt * 4.0;

      const dist = mesh.position.distanceTo(playerPos);

      if (dist < this.magnetRange) {
        this._scratchVec.subVectors(playerPos, mesh.position).normalize();
        mesh.position.addScaledVector(this._scratchVec, this.magnetSpeed * dt);

        if (dist < 0.6) {
          this.crafting.addResource(p.type, p.quantity);
          if (this.audio) this.audio.playPickupSound();
          this.onNotification(`+${p.quantity} ${p.type.toUpperCase()}`, 'green');

          this.scene.remove(mesh);
          this.floatingPickups.splice(i, 1);
        }
      } else {
        mesh.position.y += Math.sin(now + i) * 0.002;
      }
    }
  }

  updateTargetHUD(obj) {
    if (!this._targetInfoEl || !this._targetTitleEl || !this._targetFillEl) return;

    if (!this._targetHudVisible) {
      this._targetInfoEl.style.display = 'flex';
      this._targetHudVisible = true;
    }

    const suffix = obj.requiresExplosive ? ' [REINFORCED]' : '';
    const titleText = `${obj.title || 'Target'} [${Math.ceil(obj.hp)}/${Math.ceil(obj.maxHp)}]${suffix}`;
    if (titleText !== this._lastTargetText) {
      this._targetTitleEl.innerText = titleText;
      this._lastTargetText = titleText;
    }

    const pct = Math.round(Math.max(0, (obj.hp / obj.maxHp) * 100));
    if (pct !== this._lastTargetPct) {
      this._targetFillEl.style.width = `${pct}%`;
      this._lastTargetPct = pct;
    }
  }

  hideTargetHUD() {
    if (this._targetHudVisible && this._targetInfoEl) {
      this._targetInfoEl.style.display = 'none';
      this._targetHudVisible = false;
    }
  }
}
