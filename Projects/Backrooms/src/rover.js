import * as THREE from 'three';

/**
 * Autonomous Salvage Mining Rover
 * A small tracked drone bot that scouts nearby harvestable structures,
 * mines them with an integrated rotary drill, and navigates back to the player
 * to deliver the collected resources.
 */
export class Rover {
  constructor(position, scene, worldManager, player, audio) {
    this.scene = scene;
    this.worldManager = worldManager;
    this.player = player;
    this.audio = audio;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.currentTarget = null;
    this.currentTargetObj = null;

    this.cargo = {};
    this.state = 'SEARCH'; // 'SEARCH' | 'NAVIGATE' | 'MINING' | 'RETURN' | 'FOLLOW'
    this.searchTimer = 0;
    this.beaconTimer = 0;
    this.miningTimer = 0;
    this.stuckTimer = 0;

    this.speed = 2.6; // Movement speed in m/s
    this.harvestRate = 9.0; // Damage per second

    this.mesh = this.buildMesh();
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    group.name = 'SalvageRover';

    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xe6a100, // Hazard yellow
      roughness: 0.45,
      metalness: 0.65
    });

    const treadMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.85,
      metalness: 0.2
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.9
    });

    const opticMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.2
    });

    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff3300,
      emissiveIntensity: 1.0
    });

    // 1. Main Chassis Box
    const bodyGeo = new THREE.BoxGeometry(0.52, 0.18, 0.58);
    const bodyMesh = new THREE.Mesh(bodyGeo, chassisMat);
    bodyMesh.position.y = 0.16;
    group.add(bodyMesh);

    // Hazard stripe accents on body sides
    const stripeGeo = new THREE.BoxGeometry(0.54, 0.05, 0.40);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.position.y = 0.16;
    group.add(stripeMesh);

    // 2. Four Tread Wheels
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      [-0.28, 0.12, 0.20],
      [0.28, 0.12, 0.20],
      [-0.28, 0.12, -0.20],
      [0.28, 0.12, -0.20]
    ];

    for (const [ox, oy, oz] of wheelOffsets) {
      const wMesh = new THREE.Mesh(wheelGeo, treadMat);
      wMesh.position.set(ox, oy, oz);
      group.add(wMesh);
      this.wheels.push(wMesh);
    }

    // 3. Swiveling Turret / Head Dome
    this.turret = new THREE.Group();
    this.turret.position.set(0, 0.26, 0.06);

    const domeGeo = new THREE.SphereGeometry(0.12, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMesh = new THREE.Mesh(domeGeo, chromeMat);
    this.turret.add(domeMesh);

    // Sensor Eye Optic Lens
    const opticGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const opticMesh = new THREE.Mesh(opticGeo, opticMat);
    opticMesh.position.set(0, 0.06, 0.11);
    this.turret.add(opticMesh);

    // Sensor Spot/Point Light
    this.eyeLight = new THREE.PointLight(0x00ffff, 0.9, 5.0, 1.4);
    this.eyeLight.position.set(0, 0.08, 0.16);
    this.turret.add(this.eyeLight);

    // Antenna & Blinking Beacon
    const antGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4);
    const antMesh = new THREE.Mesh(antGeo, chromeMat);
    antMesh.position.set(0.08, 0.18, -0.06);
    this.turret.add(antMesh);

    this.beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), this.beaconMat);
    this.beaconMesh.position.set(0.08, 0.29, -0.06);
    this.turret.add(this.beaconMesh);

    group.add(this.turret);

    // 4. Front Rotary Mining Drill Assembly
    this.drillArm = new THREE.Group();
    this.drillArm.position.set(0, 0.14, 0.32);

    const mountGeo = new THREE.BoxGeometry(0.12, 0.08, 0.12);
    const mountMesh = new THREE.Mesh(mountGeo, chromeMat);
    this.drillArm.add(mountMesh);

    const bitGeo = new THREE.ConeGeometry(0.07, 0.22, 8);
    bitGeo.rotateX(Math.PI / 2);
    this.drillBit = new THREE.Mesh(bitGeo, chromeMat);
    this.drillBit.position.set(0, 0, 0.14);
    this.drillArm.add(this.drillBit);

    group.add(this.drillArm);

    return group;
  }

  update(dt, player, particleEmitter) {
    if (!this.mesh) return;

    // Blink beacon light
    this.beaconTimer += dt;
    const isLit = (Math.floor(this.beaconTimer * 4) % 2 === 0);
    this.beaconMat.emissiveIntensity = isLit ? 1.4 : 0.1;

    switch (this.state) {
      case 'SEARCH':
        this.updateSearch(dt);
        break;
      case 'NAVIGATE':
        this.updateNavigate(dt);
        break;
      case 'MINING':
        this.updateMining(dt, particleEmitter);
        break;
      case 'RETURN':
        this.updateReturn(dt, particleEmitter);
        break;
      case 'FOLLOW':
        this.updateFollow(dt);
        break;
    }

    // Keep on floor elevation smoothly
    this.mesh.position.y = this.getFloorYAt(this.mesh.position.x, this.mesh.position.z);
  }

  getFloorYAt(x, z) {
    // Current stratum baseline
    const fl = Math.floor(this.player.camera.position.y / 20.0) * 20.0;
    return fl + 0.05;
  }

  updateSearch(dt) {
    this.searchTimer += dt;
    if (this.searchTimer < 0.6) return;
    this.searchTimer = 0;

    const destructibles = this.worldManager.getDestructibleMeshes();
    let bestDist = 14.0;
    let bestMesh = null;
    let bestObj = null;

    for (let i = 0; i < destructibles.length; i++) {
      const mesh = destructibles[i];
      if (!mesh) continue;
      const root = mesh.userData?.rootMesh || mesh;
      const obj = mesh.userData?.worldObject || root.userData?.worldObject || mesh.userData;

      if (!obj || obj.hp <= 0) continue;
      // Skip scaffolding or barricades placed by player
      if (mesh.userData?.isScaffolding || root.userData?.isScaffolding) continue;

      const d = this.mesh.position.distanceTo(root.position);
      if (d < bestDist && Math.abs(root.position.y - this.mesh.position.y) < 3.5) {
        bestDist = d;
        bestMesh = root;
        bestObj = obj;
      }
    }

    if (bestMesh) {
      this.currentTarget = bestMesh;
      this.currentTargetObj = bestObj;
      this.state = 'NAVIGATE';
      this.stuckTimer = 0;
    } else {
      this.state = 'FOLLOW';
    }
  }

  updateNavigate(dt) {
    if (!this.currentTarget || !this.currentTarget.parent || (this.currentTargetObj && this.currentTargetObj.hp <= 0)) {
      this.currentTarget = null;
      this.state = 'SEARCH';
      return;
    }

    const targetPos = this.currentTarget.position.clone();
    targetPos.y = this.mesh.position.y;

    const toTarget = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
    const dist = toTarget.length();

    if (dist <= 1.4) {
      this.state = 'MINING';
      this.miningTimer = 0;
      return;
    }

    // Steer towards target
    toTarget.normalize();
    const moveDist = this.speed * dt;
    this.mesh.position.addScaledVector(toTarget, moveDist);

    // Orient rover towards movement
    this.mesh.lookAt(targetPos);

    // Roll wheels
    for (const w of this.wheels) {
      w.rotation.x += dt * 8.0;
    }

    // Safety timeout against getting trapped behind solid walls
    this.stuckTimer += dt;
    if (this.stuckTimer > 7.0) {
      this.currentTarget = null;
      this.state = 'SEARCH';
      this.stuckTimer = 0;
    }
  }

  updateMining(dt, particleEmitter) {
    if (!this.currentTarget || !this.currentTarget.parent || (this.currentTargetObj && this.currentTargetObj.hp <= 0)) {
      this.currentTarget = null;
      this.state = Object.keys(this.cargo).length > 0 ? 'RETURN' : 'SEARCH';
      return;
    }

    // Look directly at target
    const targetPos = this.currentTarget.position.clone();
    targetPos.y = this.mesh.position.y;
    this.mesh.lookAt(targetPos);

    // Spin drill bit rapidly!
    if (this.drillBit) {
      this.drillBit.rotation.z += dt * 32.0;
    }

    // Apply mining damage
    const dmg = this.harvestRate * dt;
    let isDepleted = false;

    if (this.currentTargetObj && this.currentTargetObj.damage) {
      isDepleted = this.currentTargetObj.damage(dmg);
    } else {
      this.currentTarget.userData.hp = (this.currentTarget.userData.hp || 20) - dmg;
      isDepleted = (this.currentTarget.userData.hp <= 0);
    }

    // Drill spark particles
    this.miningTimer += dt;
    if (particleEmitter && Math.random() < 0.45) {
      const tipPos = new THREE.Vector3();
      this.drillBit.getWorldPosition(tipPos);
      particleEmitter(tipPos, 2, 0x00f0ff);
    }

    // Subtle audio tick
    if (Math.random() < 0.12 && this.audio) {
      this.audio.playHitSound('metal');
    }

    // Node completed!
    if (isDepleted) {
      const drops = (this.currentTargetObj.getDrops ? this.currentTargetObj.getDrops() : this.currentTargetObj.drops) || {};
      for (const [k, v] of Object.entries(drops)) {
        this.cargo[k] = (this.cargo[k] || 0) + (v || 1);
      }

      // Sparkle burst
      if (particleEmitter) {
        particleEmitter(this.currentTarget.position, 16, 0xffd700);
      }

      // Remove mined object from world cleanly
      this.worldManager.removeObject(this.currentTarget);
      this.currentTarget = null;
      this.currentTargetObj = null;

      // Happy beep & head swivel
      if (this.audio) this.audio.playHitSound('ballast');
      this.state = 'RETURN';
    }
  }

  updateReturn(dt, particleEmitter) {
    const playerPos = this.player.camera.position.clone();
    playerPos.y = this.mesh.position.y;

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    const dist = toPlayer.length();

    if (dist <= 2.2) {
      // Delivered resources!
      this.depositCargo(particleEmitter);
      this.state = 'SEARCH';
      return;
    }

    // Steer towards player
    toPlayer.normalize();
    const moveDist = this.speed * dt;
    this.mesh.position.addScaledVector(toPlayer, moveDist);
    this.mesh.lookAt(playerPos);

    // Roll wheels
    for (const w of this.wheels) {
      w.rotation.x += dt * 8.0;
    }
  }

  depositCargo(particleEmitter) {
    let summaryParts = [];
    let totalItems = 0;

    for (const [type, qty] of Object.entries(this.cargo)) {
      if (qty > 0) {
        this.player.crafting.addResource(type, qty);
        summaryParts.push(`+${qty} ${type.toUpperCase()}`);
        totalItems += qty;
      }
    }

    if (totalItems > 0) {
      // Award XP for autonomous drone harvesting
      const xpEarned = totalItems * 5 + 15;
      this.player.progression.addXp(xpEarned);

      if (this.player.onNotification) {
        this.player.onNotification(`🤖 ROVER DELIVERED: ${summaryParts.join(', ')} (+${xpEarned} XP)`, 'cyan');
      }

      if (this.audio) {
        this.audio.playHitSound('ballast');
      }

      // Delivery sparkle particles
      if (particleEmitter) {
        particleEmitter(this.mesh.position, 20, 0x00ffff);
      }
    }

    this.cargo = {};
  }

  updateFollow(dt) {
    const playerPos = this.player.camera.position.clone();
    playerPos.y = this.mesh.position.y;

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    const dist = toPlayer.length();

    if (dist > 3.5) {
      toPlayer.normalize();
      this.mesh.position.addScaledVector(toPlayer, this.speed * 0.8 * dt);
      this.mesh.lookAt(playerPos);
      for (const w of this.wheels) {
        w.rotation.x += dt * 6.0;
      }
    }

    // Periodically re-check for harvestable objects
    this.searchTimer += dt;
    if (this.searchTimer > 1.8) {
      this.searchTimer = 0;
      this.state = 'SEARCH';
    }
  }

  destroy() {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }
}

/**
 * RoverManager: Coordinates active rovers in the scene.
 */
export class RoverManager {
  constructor(scene, worldManager) {
    this.scene = scene;
    this.worldManager = worldManager;
    this.rovers = [];
  }

  spawnRover(position, player, audio) {
    // Spawn rover 1.5m in front of player on the floor
    const spawnPos = position.clone();
    const fl = Math.floor(position.y / 20.0) * 20.0;
    spawnPos.y = fl + 0.1;

    const rover = new Rover(spawnPos, this.scene, this.worldManager, player, audio);
    this.rovers.push(rover);
    return rover;
  }

  update(dt, player, particleEmitter) {
    for (let i = 0; i < this.rovers.length; i++) {
      this.rovers[i].update(dt, player, particleEmitter);
    }
  }

  clear() {
    for (const r of this.rovers) {
      r.destroy();
    }
    this.rovers = [];
  }
}
