import * as THREE from 'three';

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
    this.magnetRange = 4.5;
    this.magnetSpeed = 7.2;
    this.doubleElectrical = false;
    this.hasPhase = false;
    this.ambientSiphon = false;
    this.barricadeMaxHp = 80;

    // Raycasting & Interaction
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.0;
    this.currentTarget = null;

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

    // Barricade material
    this.barricadeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c07b,
      roughness: 0.7,
      metalness: 0.1
    });
  }

  jump() {
    if (this.isOnGround) {
      this.velocity.y = this.jumpSpeed;
      this.isOnGround = false;
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

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    this.camera.position.add(dir.multiplyScalar(4.2));

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
      this.onNotification('No Barricades in inventory! Craft at workbench.', 'red');
      return;
    }

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    const spawnPos = this.camera.position.clone().add(dir.multiplyScalar(2.2));
    const currentFloorY = Math.floor(this.camera.position.y / 20.0) * 20.0;
    spawnPos.y = currentFloorY + 1.5;

    const barricadeGeo = new THREE.BoxGeometry(2.4, 2.9, 0.35);
    const barricadeMesh = new THREE.Mesh(barricadeGeo, this.barricadeMaterial);
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
    this.worldManager.cachedDestructibles.push(barricadeMesh);
    this.worldManager.cachedCollidables.push(barricadeMesh);

    this.crafting.inventory.barricades--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Barricade deployed! [${this.crafting.inventory.barricades} left]`, 'green');

    if (this.audio) this.audio.playBreakSound('drywall');
  }

  placeScaffolding() {
    if (this.crafting.inventory.scaffolding <= 0) {
      this.onNotification('No Scaffolding in inventory! Craft at workbench [L].', 'red');
      return;
    }

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    // Check if aiming at an existing scaffolding block to stack vertically!
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hits = this.raycaster.intersectObjects(this.worldManager.getDestructibleMeshes(), false);
    let spawnPos = null;

    if (hits.length > 0 && hits[0].distance < 4.5 && hits[0].object.userData.isScaffolding) {
      spawnPos = hits[0].object.position.clone();
      spawnPos.y += 1.5;
    } else {
      spawnPos = this.camera.position.clone().add(dir.multiplyScalar(2.0));
      spawnPos.y = Math.floor(this.camera.position.y / 1.5) * 1.5 + 0.75;
    }

    const scGeo = new THREE.BoxGeometry(1.2, 1.5, 1.2);
    const scMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.8,
      wireframe: true
    });
    const scMesh = new THREE.Mesh(scGeo, scMat);
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
    this.worldManager.cachedDestructibles.push(scMesh);

    this.crafting.inventory.scaffolding--;
    this.crafting.updateInventoryUI();
    this.onNotification(`Scaffolding placed! [${this.crafting.inventory.scaffolding} left]`, 'green');

    if (this.audio) this.audio.playHitSound('metal');
  }

  updatePhysics(dt, input) {
    if (!input.isLocked()) return;

    // Deceleration & friction
    this.velocity.x -= this.velocity.x * 10.0 * dt;
    this.velocity.z -= this.velocity.z * 10.0 * dt;

    // Gravity
    this.velocity.y -= 22.0 * dt;

    // Direction calculation
    this.direction.z = Number(input.moveForward) - Number(input.moveBackward);
    this.direction.x = Number(input.moveRight) - Number(input.moveLeft);
    this.direction.normalize();

    const baseSpeed = input.isSprinting ? 6.2 : 3.8;
    const speed = baseSpeed * this.speedMultiplier;

    if (input.moveForward || input.moveBackward) {
      this.velocity.z -= this.direction.z * speed * 12.0 * dt;
    }
    if (input.moveLeft || input.moveRight) {
      this.velocity.x -= this.direction.x * speed * 12.0 * dt;
    }

    const deltaX = -this.velocity.x * dt;
    const deltaZ = -this.velocity.z * dt;

    // AABB Collision with walls
    const playerRadius = 0.32;
    const oldPos = this.camera.position.clone();
    const oldBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(oldPos.x, oldPos.y - 0.70, oldPos.z),
      new THREE.Vector3(playerRadius * 2, 1.70, playerRadius * 2)
    );

    // Player stands on floor (camera is eye level = 1.6m above feet).
    // Bounding box spans from feet (camera.y - 1.55) to head (camera.y + 0.15).
    input.controls.moveRight(deltaX);
    let playerBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(this.camera.position.x, this.camera.position.y - 0.70, this.camera.position.z),
      new THREE.Vector3(playerRadius * 2, 1.70, playerRadius * 2)
    );

    const collidables = this.worldManager.getCollidableMeshes();
    let hitX = false;
    for (let i = 0; i < collidables.length; i++) {
      const col = collidables[i];
      if (!col.userData.bbox) continue;
      // Proximity optimization: only check collidables within 3.5m radius
      if (Math.abs(col.position.x - this.camera.position.x) > 3.5 ||
          Math.abs(col.position.z - this.camera.position.z) > 3.5 ||
          Math.abs(col.position.y - this.camera.position.y) > 3.5) {
        continue;
      }
      if (col.userData.bbox.intersectsBox(playerBox)) {
        // Only block if this movement newly caused collision; if already overlapping, allow moving out!
        if (!col.userData.bbox.intersectsBox(oldBox)) {
          hitX = true;
          break;
        }
      }
    }
    if (hitX) {
      this.camera.position.x = oldPos.x;
      this.camera.position.z = oldPos.z;
    }

    const midPos = this.camera.position.clone();
    const midBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(midPos.x, midPos.y - 0.70, midPos.z),
      new THREE.Vector3(playerRadius * 2, 1.70, playerRadius * 2)
    );
    input.controls.moveForward(deltaZ);
    playerBox.setFromCenterAndSize(
      new THREE.Vector3(this.camera.position.x, this.camera.position.y - 0.70, this.camera.position.z),
      new THREE.Vector3(playerRadius * 2, 1.70, playerRadius * 2)
    );

    let hitZ = false;
    for (let i = 0; i < collidables.length; i++) {
      const col = collidables[i];
      if (!col.userData.bbox) continue;
      if (Math.abs(col.position.x - this.camera.position.x) > 3.5 ||
          Math.abs(col.position.z - this.camera.position.z) > 3.5 ||
          Math.abs(col.position.y - this.camera.position.y) > 3.5) {
        continue;
      }
      if (col.userData.bbox.intersectsBox(playerBox)) {
        if (!col.userData.bbox.intersectsBox(midBox)) {
          hitZ = true;
          break;
        }
      }
    }
    if (hitZ) {
      this.camera.position.x = midPos.x;
      this.camera.position.z = midPos.z;
    }

    // Upward Ceiling / Head Collision: Prevent jumping through solid ceilings!
    if (this.velocity.y > 0) {
      const upRay = new THREE.Raycaster(
        this.camera.position.clone(),
        new THREE.Vector3(0, 1, 0),
        0,
        0.55 // Head clearance above eye level
      );
      const ceilHits = upRay.intersectObjects(this.worldManager.getDestructibleMeshes(), false);
      for (const h of ceilHits) {
        const type = h.object.userData.type;
        if (type === 'ceiling' || type === 'subceiling' || type === 'fixture' || type === 'floor' || type === 'subfloor') {
          // Bonk head on ceiling!
          this.camera.position.y = Math.min(this.camera.position.y, h.point.y - 0.3);
          this.velocity.y = 0;
          break;
        }
      }
    }

    // Dynamic Floor & Ceiling Support: Raycast downward from eye position
    // Dynamic ray length prevents tunneling through floors when falling at high terminal velocity!
    const rayLength = Math.max(1.2, Math.abs(this.velocity.y * dt) + 1.0);
    const downRay = new THREE.Raycaster(
      this.camera.position.clone(),
      new THREE.Vector3(0, -1, 0),
      0,
      1.6 + rayLength
    );
    const floorHits = downRay.intersectObjects(this.worldManager.getDestructibleMeshes(), false);

    let foundFloorY = null;
    for (const h of floorHits) {
      const type = h.object.userData.type;
      // All horizontal slabs are solid walking surfaces (floor, subfloor, subceiling, and ceiling of room below!)
      if (type === 'floor' || type === 'subfloor' || type === 'subceiling' || type === 'ceiling') {
        if (h.point.y <= this.camera.position.y - 0.8) {
          foundFloorY = h.point.y + 1.6; // Stand 1.6m eye height above surface
          break;
        }
      }
    }

    const nextY = this.camera.position.y + this.velocity.y * dt;

    if (foundFloorY !== null && (this.camera.position.y <= foundFloorY + 0.1 || nextY <= foundFloorY)) {
      this.camera.position.y = foundFloorY;
      this.velocity.y = 0;
      this.isOnGround = true;
    } else {
      this.camera.position.y = nextY;
      this.isOnGround = false;
    }

    // Check Scaffolding ladder climb to scale 16m vaulted ceilings
    const playerFeet = this.camera.position.clone();
    playerFeet.y -= 0.8;
    for (const d of this.worldManager.getDestructibleMeshes()) {
      if (d.userData && d.userData.isScaffolding) {
        if (d.position.distanceTo(playerFeet) < 1.4) {
          this.velocity.y = 0; // Neutralize gravity on scaffolding
          if (input.moveForward || input.isSprinting) {
            this.velocity.y = 5.0; // Climb upward smoothly
          } else if (input.moveBackward) {
            this.velocity.y = -3.5; // Climb downward
          }
          this.isOnGround = true;
          break;
        }
      }
    }

    // Camera walk bob
    if (this.isOnGround && (input.moveForward || input.moveBackward || input.moveLeft || input.moveRight)) {
      this.cameraBobTimer += dt * (input.isSprinting ? 14 : 9);
      this.camera.position.y += Math.sin(this.cameraBobTimer) * 0.035;
    }
  }

  updateHarvesting(dt, input, particleEmitter) {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const destructibles = this.worldManager.getDestructibleMeshes();
    const hits = this.raycaster.intersectObjects(destructibles, false);

    if (hits.length > 0 && hits[0].distance < 3.8) {
      const hit = hits[0];
      const mesh = hit.object;
      const rootMesh = mesh.userData.rootMesh || mesh;
      const worldObj = mesh.userData.worldObject || rootMesh.userData.worldObject || mesh.userData;

      if (!worldObj || worldObj.hp <= 0) {
        this.hideTargetHUD();
        return;
      }

      this.updateTargetHUD(worldObj);

      if (input.isMining) {
        this.currentTarget = rootMesh;

        const dmg = this.harvestPower * dt;
        let isDepleted = false;

        if (worldObj.damage) {
          isDepleted = worldObj.damage(dmg);
        } else {
          mesh.userData.hp = (mesh.userData.hp || 30) - dmg;
          if (rootMesh.userData) rootMesh.userData.hp = mesh.userData.hp;
          isDepleted = (mesh.userData.hp <= 0);
        }

        // Audio hit
        if (Math.random() < 0.28 && this.audio) {
          this.audio.playHitSound(worldObj.type || 'drywall');
        }

        // Mesh jitter & particle sparks
        const jitter = 0.04;
        rootMesh.scale.set(
          1 + (Math.random() - 0.5) * jitter,
          1 + (Math.random() - 0.5) * jitter,
          1 + (Math.random() - 0.5) * jitter
        );

        if (particleEmitter) {
          particleEmitter(hit.point, 2, worldObj.type === 'fixture' ? 0x00f0ff : 0xd4c07b);
        }

        if (isDepleted) {
          this.handleDepletion(rootMesh, worldObj, hit.point, particleEmitter);
        }
      } else {
        if (this.currentTarget && this.currentTarget.scale) {
          this.currentTarget.scale.set(1, 1, 1);
        }
      }
    } else {
      this.hideTargetHUD();
      if (this.currentTarget && this.currentTarget.scale) {
        this.currentTarget.scale.set(1, 1, 1);
      }
    }
  }

  handleDepletion(mesh, worldObj, hitPoint, particleEmitter) {
    const rootMesh = mesh.userData?.rootMesh || mesh;
    if (this.audio) this.audio.playBreakSound(worldObj.type || 'drywall');
    if (particleEmitter) particleEmitter(hitPoint || rootMesh.position, 28, 0xffde7a);

    // Calculate drops
    const drops = (worldObj.getDrops ? worldObj.getDrops() : worldObj.drops) || {};
    if (this.doubleElectrical && drops.copper) {
      drops.copper = Math.floor(drops.copper * 2);
      drops.ballast = (drops.ballast || 1) + 1;
    }

    this.spawnPickups(rootMesh.position, drops);

    const xpEarned = worldObj.xp || 10;
    this.progression.addXp(xpEarned);

    // Light fixture notification
    if (worldObj.isLight || worldObj.type === 'fixture') {
      this.onNotification('LIGHT FIXTURE DESTROYED - SECTOR UNLIT', 'red');
    }

    // Remove from caches & scene graphs cleanly
    this.worldManager.removeObject(rootMesh);
    if (worldObj && worldObj.destroy) {
      worldObj.destroy(this.scene);
    } else {
      if (rootMesh.parent) rootMesh.parent.remove(rootMesh);
      if (this.scene) this.scene.remove(rootMesh);
      if (rootMesh.geometry) rootMesh.geometry.dispose();
    }

    this.currentTarget = null;
    this.hideTargetHUD();
  }

  spawnPickups(origin, dropTable) {
    const geom = new THREE.BoxGeometry(0.18, 0.18, 0.18);

    for (const [key, qty] of Object.entries(dropTable)) {
      if (!qty || qty <= 0) continue;

      let color = 0xffe682;
      if (key === 'wood') color = 0x8b5a2b;
      if (key === 'copper') color = 0xff7b25;
      if (key === 'ballast') color = 0x00f0ff;
      if (key === 'fiber') color = 0x76b852;
      if (key === 'ceramic') color = 0xdcf2f8;
      if (key === 'scrap') color = 0x777b82;
      if (key === 'pvc') color = 0xc8d6e5;
      if (key === 'rebar') color = 0x4a4d52;
      if (key === 'plastic') color = 0xff8833;
      if (key === 'caster') color = 0x555555;
      if (key === 'piston') color = 0xdddddd;
      if (key === 'fitting') color = 0xb87333;

      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geom, mat);

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

    for (let i = this.floatingPickups.length - 1; i >= 0; i--) {
      const p = this.floatingPickups[i];
      const mesh = p.mesh;

      mesh.rotation.x += dt * 3.0;
      mesh.rotation.y += dt * 4.0;

      const dist = mesh.position.distanceTo(playerPos);

      if (dist < this.magnetRange) {
        const dir = new THREE.Vector3().subVectors(playerPos, mesh.position).normalize();
        mesh.position.add(dir.multiplyScalar(this.magnetSpeed * dt));

        if (dist < 0.6) {
          this.crafting.addResource(p.type, p.quantity);
          if (this.audio) this.audio.playPickupSound();
          this.onNotification(`+${p.quantity} ${p.type.toUpperCase()}`, 'green');

          this.scene.remove(mesh);
          mesh.geometry.dispose();
          this.floatingPickups.splice(i, 1);
        }
      } else {
        mesh.position.y += Math.sin(performance.now() * 0.005 + i) * 0.002;
      }
    }
  }

  updateTargetHUD(obj) {
    const info = document.getElementById('target-info');
    const title = document.getElementById('target-title');
    const fill = document.getElementById('target-hp-fill');

    if (!info || !title || !fill) return;

    info.style.display = 'flex';
    title.innerText = `${obj.title || 'Target'} [${Math.ceil(obj.hp)}/${obj.maxHp}]`;
    const pct = Math.max(0, (obj.hp / obj.maxHp) * 100);
    fill.style.width = `${pct}%`;
  }

  hideTargetHUD() {
    const info = document.getElementById('target-info');
    if (info) info.style.display = 'none';
  }
}
