import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WorldManager } from './world/worldManager.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { CraftingSystem } from './crafting.js';
import { ProgressionSystem } from './progression.js';
import { LevelupSystem } from './levelups.js';
import { RoverManager } from './rover.js';
import { DebrisSystem, DustSystem } from './debris.js';
import { InventoryManager, ProjectileManager } from './weapons.js';
import { EntityManager } from './entities.js';
import { RadarMinimap } from './minimap.js';

/**
 * AudioEngine: Procedural Web Audio API synthesizing fluorescent ballast buzz,
 * mechanical impacts, pickup chimes, and anomalous dimensional phase sweeps.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.humOsc = null;
    this.humGain = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // 60Hz Fluorescent Ballast Buzz with harmonic filter
    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = 'sawtooth';
    this.humOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, this.ctx.currentTime);

    this.humGain = this.ctx.createGain();
    this.humGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

    this.humOsc.connect(filter);
    filter.connect(this.humGain);
    this.humGain.connect(this.ctx.destination);

    this.humOsc.start();
    this.initialized = true;

    // Ballast flicker fluctuation
    setInterval(() => {
      if (!this.ctx || this.humGain.gain.value === 0) return;
      const jitter = (Math.random() * 0.02 - 0.01);
      const current = Math.max(0.005, 0.035 + jitter);
      this.humGain.gain.setTargetAtTime(current, this.ctx.currentTime, 0.05);
    }, 120);
  }

  updateHum(normalizedProximity, frequency = 60) {
    if (!this.initialized || !this.humGain) return;
    if (this.humOsc && this.humOsc.frequency.value !== frequency) {
      this.humOsc.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.2);
    }
    const target = Math.max(0.002, 0.045 * (1.0 - Math.min(1.0, normalizedProximity)));
    this.humGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  playHitSound(materialType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (materialType === 'drywall') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 + Math.random() * 30, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (materialType === 'metal' || materialType === 'fixture') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(980 + Math.random() * 300, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
    }
  }

  playBreakSound(materialType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = materialType === 'fixture' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(materialType === 'fixture' ? 440 : 160, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.28);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playPickupSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.06);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playLevelUpFanfare() {
    if (!this.ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  playPhaseSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playDamageSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.16);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playFootstep(biomeId = 'level0') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (biomeId === 'level37') {
      // Water splash thud
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240 + Math.random() * 80, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    } else if (biomeId === 'level1') {
      // Concrete sharp tap
      osc.type = 'square';
      osc.frequency.setValueAtTime(170 + Math.random() * 35, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.045);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    } else {
      // Damp carpet muffled thump
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95 + Math.random() * 20, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.055);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    }
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

/**
 * Main Engine Initializer
 */
class GameEngine {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Three.js Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060605);
    this.scene.fog = new THREE.FogExp2(0x080806, 0.045);

    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 90);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Procedural PMREM Image-Based Lighting (Unreal-like subtle specular reflections)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmremGenerator.dispose();

    // Post-processing: Subtle UnrealBloomPass for glowing fluorescent troffers & beacons
    this.bloomEnabled = true;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.32, // strength
      0.45, // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Cached HUD DOM elements (avoid per-frame getElementById)
    this._zoneEl = document.getElementById('zone-info');
    this._coordEl = document.getElementById('coord-info');
    this._fpsEl = document.getElementById('fps-counter');
    this._notifFeedEl = document.getElementById('notification-feed');
    this._lastZoneText = '';
    this._lastCoordText = '';

    // Audio Subsystem
    this.audio = new AudioEngine();

    // Ambient + Hemisphere GI Bounce Lighting
    this.ambientLight = new THREE.AmbientLight(0x1a1910, 0.22);
    this.scene.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0xfff0c2, 0x262012, 0.45);
    this.scene.add(this.hemiLight);

    // Global 6-PointLight Pool (replaces ~588 per-chunk PointLights)
    this.lightPool = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xfff5bf, 0, 12, 1.2);
      pl.visible = false;
      this.scene.add(pl);
      this.lightPool.push({ light: pl, baseIntensity: 1.8 });
    }
    this._lastLightUpdateTime = 0;
    this._lastLightPlayerPos = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._closestLightDist = Infinity;

    // World Manager (Canonical Multi-Strata Backrooms)
    this.worldManager = new WorldManager(this.scene, {
      voxelSize: 1.5,
      gridWidth: 8,
      layerHeight: 20.0,
      radiusH: 2,
      radiusV: 1
    });

    // Autonomous Mining Rover Bot Manager
    this.roverManager = new RoverManager(this.scene, this.worldManager);

    // Crafting & Progression
    this.crafting = new CraftingSystem((msg, col) => this.showNotification(msg, col));
    this.inventoryManager = new InventoryManager(this.crafting, (msg, col) => this.showNotification(msg, col));
    this.crafting.inventoryManager = this.inventoryManager;

    this.progression = new ProgressionSystem(
      () => this.triggerLevelUp(),
      (msg, col) => this.showNotification(msg, col)
    );

    // Level-Up 3-Card Benefit Draft
    this.levelups = new LevelupSystem((perk) => {
      perk.apply(this.player, this.crafting, this.progression);
      this.isPaused = false;
      this.input.lock();
      this.showNotification(`Anomalous perk locked: [${perk.name}]`, 'green');
    });

    // Player Entity
    this.player = new Player(
      this.camera,
      this.scene,
      this.worldManager,
      this.crafting,
      this.progression,
      this.audio,
      (msg, col) => this.showNotification(msg, col)
    );

    this.debrisSystem = new DebrisSystem(this.scene, 450);
    this.dustSystem = new DustSystem(this.scene, 160);
    this.projectileManager = new ProjectileManager(this.scene, this.worldManager, this.debrisSystem, this.audio);
    this.entityManager = new EntityManager(
      this.scene,
      this.worldManager,
      this.progression,
      this.crafting,
      this.inventoryManager,
      this.audio,
      (msg, col) => this.showNotification(msg, col)
    );
    this.radar = new RadarMinimap('radar-canvas');

    this.inventoryManager.playerRef = this.player;
    this.inventoryManager.audioRef = this.audio;
    this.player.inventoryManager = this.inventoryManager;
    this.player.projectileManager = this.projectileManager;
    this.player.entityManager = this.entityManager;
    this.projectileManager.entityManager = this.entityManager;
    this.player.onGameOver = () => this.triggerGameOver();
    this.player.updateViewmodelForItem(this.inventoryManager.getActiveItem());

    // Attach spawnRover hook for crafting
    this.player.spawnRover = () => {
      this.roverManager.spawnRover(this.player.camera.position, this.player, this.audio);
    };

    // Wire crafting callback from UI
    this.crafting.onCraftRequest = (recipeKey) => {
      this.crafting.craft(recipeKey, this.player, this.progression);
    };

    // Input Controller
    this.input = new InputManager(this.camera, document.body, {
      onStart: () => this.audio.init(),
      onJump: () => this.player.jump(),
      onLantern: () => this.player.toggleLantern(),
      onBarricade: () => this.player.placeBarricade(),
      onScaffolding: () => this.player.placeScaffolding(),
      onBeacon: () => this.player.placeBeacon(),
      onJumpPad: () => this.player.placeJumpPad(),
      onPhase: () => this.player.triggerPhaseGlitch(),
      onToggleBloom: () => {
        this.bloomEnabled = !this.bloomEnabled;
        this.showNotification(`Unreal Bloom: ${this.bloomEnabled ? 'ON' : 'OFF'}`, 'cyan');
      },
      onCraftHotkey: (key) => this.crafting.craft(key, this.player, this.progression),
      onHotbarSelect: (idx) => this.inventoryManager.selectHotbar(idx, this.player, this.audio),
      onToggleInventory: () => this.toggleInventory(),
      onToggleBuildMenu: () => this.toggleBuildMenu(),
      onBuildMenuMove: (dx, dy) => this.crafting.moveSelection(dx, dy),
      onBuildMenuCraft: () => {
        if (this.crafting.craftSelected(this.player, this.progression)) {
          this.audio.playPickupSound();
        }
      },
      onLevelupChoice: (idx) => this.levelups.selectByIndex(idx)
    });

    // Particle Burst System
    this._scratchColor = new THREE.Color();
    this._particlesNeedClear = false;
    this.initParticlePool();
    this._lastStepHalf = 0;
    this.scene.add(this.camera);
    this.cameraTrauma = 0;

    // Loop state
    this.clock = new THREE.Clock();
    this.isPaused = false;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.lastSiphonTime = 0;

    // Performance & Bottleneck Telemetry Tracker
    this._perf = {
      frames: 0,
      lastLog: performance.now(),
      maxFrameMs: 0,
      physics: 0,
      stream: 0,
      harvest: 0,
      pickups: 0,
      rovers: 0,
      particles: 0,
      lighting: 0,
      render: 0,
      total: 0
    };

    // Window Resize listener
    window.addEventListener('resize', () => this.onResize());

    // Initial Chunk Seed + Pre-compile all biome shaders to eliminate 1-2s runtime hitches
    this.worldManager.update(this.player.camera.position);
    this.prewarmBiomeShaders();

    // Start RAF
    this.animate();
  }

  prewarmBiomeShaders() {
    const t0 = performance.now();
    const warmupGroup = new THREE.Group();
    const tinyGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const dummyMat = new THREE.Matrix4().makeTranslation(0, -100, 0);

    // Temporarily enable all 6 pooled PointLights so Three.js compiles the 6-light shader variant
    for (const slot of this.lightPool) {
      slot.light.visible = true;
      slot.light.intensity = 0.01;
    }

    for (const biome of Object.values(this.worldManager.biomes)) {
      const mats = [
        biome.getWallMaterial(),
        biome.getFloorMaterial(),
        biome.getCeilingMaterial(),
        biome.getSubFloorMaterial(),
        biome.getFixtureMaterial()
      ];
      for (const mat of mats) {
        const inst = new THREE.InstancedMesh(tinyGeo, mat, 1);
        inst.setMatrixAt(0, dummyMat);
        inst.frustumCulled = false;
        warmupGroup.add(inst);
      }
    }

    this.scene.add(warmupGroup);
    this.renderer.compile(this.scene, this.camera);
    if (this.composer) {
      this.composer.render();
    }
    this.scene.remove(warmupGroup);
    tinyGeo.dispose();

    for (const slot of this.lightPool) {
      slot.light.visible = false;
      slot.light.intensity = 0;
    }
    console.log(
      `[PERF] Pre-compiled all biome PBR shaders in ${(performance.now() - t0).toFixed(1)}ms ` +
      `(Programs: ${this.renderer.info.programs?.length ?? '?'})`
    );
  }

  toggleBuildMenu() {
    if (this.levelups.isOpen || this.inventoryManager.isOpen || this.player.isDead) return;

    if (this.crafting.isBuildMenuOpen) {
      this.crafting.closeBuildMenu();
      this.isPaused = false;
      this.input.lock();
    } else if (this.input.isLocked()) {
      this.isPaused = true;
      this.crafting.openBuildMenu();
      this.input.unlock();
    }
  }

  toggleInventory() {
    if (this.levelups.isOpen || this.crafting.isBuildMenuOpen || this.player.isDead) return;

    if (this.inventoryManager.isOpen) {
      this.inventoryManager.closeInventory();
      this.isPaused = false;
      this.input.lock();
    } else if (this.input.isLocked()) {
      this.isPaused = true;
      this.inventoryManager.openInventory();
      this.input.unlock();
    }
  }

  triggerGameOver() {
    this.isPaused = true;
    this.input.unlock();
    const modal = document.getElementById('gameover-modal');
    const stats = document.getElementById('gameover-stats');
    const btn = document.getElementById('gameover-restart-btn');
    if (stats) {
      const fl = Math.floor(this.player.camera.position.y / 20.0);
      stats.innerHTML =
        `PLAYER LEVEL: ${this.progression.level}<br>` +
        `STRATA DEPTH: FL ${fl}<br>` +
        `WAVE REACHED: ${this.entityManager ? this.entityManager.wave : 1}<br>` +
        `ENTITIES BANISHED: ${this.entityManager ? this.entityManager.kills : 0}`;
    }
    if (btn) {
      btn.onclick = () => window.location.reload();
    }
    if (modal) modal.style.display = 'flex';
  }

  triggerLevelUp() {
    if (this.crafting.isBuildMenuOpen) {
      this.crafting.closeBuildMenu();
    }
    this.isPaused = true;
    this.input.unlock();
    this.audio.playLevelUpFanfare();
    this.levelups.presentDraft();
  }

  initParticlePool() {
    const count = 300;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -500;
      colors[i * 3] = 0.9;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 0.5;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.95
    });

    this.particlePoints = new THREE.Points(geom, mat);
    this.scene.add(this.particlePoints);
    this.activeParticles = [];
  }

  emitParticles(pos, count = 12, colorHex = 0xcbb763) {
    const c = this._scratchColor.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      if (this.activeParticles.length >= 300) break;
      this.activeParticles.push({
        x: pos.x + (Math.random() - 0.5) * 0.4,
        y: pos.y + (Math.random() - 0.5) * 0.4,
        z: pos.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 4.0,
        vy: (Math.random() * 3.0) + 1.0,
        vz: (Math.random() - 0.5) * 4.0,
        r: c.r,
        g: c.g,
        b: c.b,
        life: 0.4 + Math.random() * 0.4
      });
    }
    this._particlesNeedClear = true;
  }

  updateParticles(dt) {
    const len = this.activeParticles.length;
    if (len === 0 && !this._particlesNeedClear) return;

    const positions = this.particlePoints.geometry.attributes.position.array;
    const colors = this.particlePoints.geometry.attributes.color.array;

    for (let i = len - 1; i >= 0; i--) {
      const pt = this.activeParticles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.activeParticles.splice(i, 1);
        continue;
      }
      pt.vy -= 9.8 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
    }

    const activeCount = this.activeParticles.length;
    for (let i = 0; i < 300; i++) {
      if (i < activeCount) {
        const pt = this.activeParticles[i];
        positions[i * 3] = pt.x;
        positions[i * 3 + 1] = pt.y;
        positions[i * 3 + 2] = pt.z;
        colors[i * 3] = pt.r;
        colors[i * 3 + 1] = pt.g;
        colors[i * 3 + 2] = pt.b;
      } else {
        positions[i * 3 + 1] = -500;
      }
    }

    this.particlePoints.geometry.attributes.position.needsUpdate = true;
    this.particlePoints.geometry.attributes.color.needsUpdate = true;

    if (activeCount === 0) {
      this._particlesNeedClear = false;
    }
  }

  updateLightingAndAudio() {
    const playerPos = this.player.camera.position;
    const now = performance.now();

    // Reassign pooled PointLights every 100ms or if player moved >0.75m
    const movedDistSq = playerPos.distanceToSquared(this._lastLightPlayerPos);
    if (now - this._lastLightUpdateTime > 100 || movedDistSq > 0.56) {
      this._lastLightUpdateTime = now;
      this._lastLightPlayerPos.copy(playerPos);

      const fixtures = this.worldManager.getNearbyLightFixtures(playerPos, 2, 0);
      // Sort by squared distance (avoids sqrt!)
      for (let i = 0; i < fixtures.length; i++) {
        const f = fixtures[i];
        f._tmpDistSq = playerPos.distanceToSquared(f.lightPos || f.position);
      }
      fixtures.sort((a, b) => a._tmpDistSq - b._tmpDistSq);

      this._closestLightDist = fixtures.length > 0 ? Math.sqrt(fixtures[0]._tmpDistSq) : Infinity;

      for (let i = 0; i < this.lightPool.length; i++) {
        const slot = this.lightPool[i];
        if (i < fixtures.length && fixtures[i]._tmpDistSq < 900) {
          const f = fixtures[i];
          const lp = f.lightPos || f.position;
          slot.light.position.copy(lp);
          slot.light.color.setHex(f.lightConfig?.color ?? 0xfff5bf);
          slot.light.distance = f.lightConfig?.distance ?? 12;
          slot.light.decay = f.lightConfig?.decay ?? 1.2;
          slot.baseIntensity = f.baseIntensity ?? 1.8;
          slot.light.intensity = slot.baseIntensity;
          slot.light.visible = true;
        } else {
          slot.light.visible = false;
        }
      }

      // Distance + vertical stratum chunk visibility culling
      const playerCy = Math.floor(playerPos.y / 20.0);
      for (const chunk of this.worldManager.loadedChunks.values()) {
        const dy = Math.abs(chunk.cy - playerCy);
        if (dy > 1) {
          chunk.group.visible = false;
          continue;
        }
        const cxCenter = (chunk.cx + 0.5) * chunk.chunkWidth;
        const czCenter = (chunk.cz + 0.5) * chunk.chunkDepth;
        const dx = cxCenter - playerPos.x;
        const dz = czCenter - playerPos.z;
        chunk.group.visible = (dx * dx + dz * dz) < 1444; // 38m radius^2
      }
    }

    // Subtle flicker on active 6 pooled lights
    for (let i = 0; i < this.lightPool.length; i++) {
      const slot = this.lightPool[i];
      if (!slot.light.visible) continue;
      if (Math.random() < 0.02) {
        slot.light.intensity = slot.baseIntensity * (0.2 + Math.random() * 0.8);
      } else {
        slot.light.intensity = slot.baseIntensity;
      }
    }

    // Ambient Siphon Perk
    if (this.player.ambientSiphon && this._closestLightDist < 6.5) {
      if (now - this.lastSiphonTime > 2000) {
        this.lastSiphonTime = now;
        this.progression.addXp(1);
      }
    }

    // Biome sync for fog and audio hum
    const currentBiome = this.worldManager.getCurrentBiome(playerPos);
    if (currentBiome) {
      this.scene.fog.color.setHex(currentBiome.fogColor);
      this.scene.fog.density = currentBiome.fogDensity;
      this.ambientLight.color.setHex(currentBiome.ambientColor);

      const normDist = this._closestLightDist === Infinity ? 1.0 : Math.min(1.0, this._closestLightDist / 14.0);
      this.audio.updateHum(normDist, currentBiome.humFrequency);

      const zoneText = `STRATA // ${currentBiome.name.toUpperCase()}`;
      if (this._zoneEl && zoneText !== this._lastZoneText) {
        this._zoneEl.innerText = zoneText;
        this._lastZoneText = zoneText;
      }

      // Biome-reactive footsteps synced to camera bob cycle
      if (this.player.isOnGround && (this.input.moveForward || this.input.moveBackward || this.input.moveLeft || this.input.moveRight)) {
        const halfCycle = Math.floor(this.player.cameraBobTimer / Math.PI);
        if (halfCycle !== this._lastStepHalf) {
          this._lastStepHalf = halfCycle;
          this.audio.playFootstep(currentBiome.id);
        }
      }
    }

    // Telemetry coords (only update DOM if string changed)
    if (this._coordEl) {
      const fl = Math.floor(playerPos.y / 20.0);
      const coordText = `X:${playerPos.x.toFixed(1)} | Y:${playerPos.y.toFixed(1)} (FL ${fl}) | Z:${playerPos.z.toFixed(1)}`;
      if (coordText !== this._lastCoordText) {
        this._coordEl.innerText = coordText;
        this._lastCoordText = coordText;
      }
    }
  }

  showNotification(msg, color = 'green') {
    const feed = this._notifFeedEl;
    if (!feed) return;

    const el = document.createElement('div');
    el.className = 'notif-msg';
    el.innerText = msg;
    if (color === 'red') el.style.borderLeftColor = 'var(--term-red)';
    if (color === 'amber') el.style.borderLeftColor = 'var(--term-amber)';
    if (color === 'cyan') el.style.borderLeftColor = 'var(--term-cyan)';

    feed.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(() => el.remove(), 400);
    }, 2800);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    if (this.composer) this.composer.setSize(this.width, this.height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const frameStart = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.1);

    // FPS counter
    this.frameCount++;
    if (frameStart - this.lastFpsUpdate > 1000) {
      if (this._fpsEl) this._fpsEl.innerText = `${this.frameCount} FPS`;
      this.frameCount = 0;
      this.lastFpsUpdate = frameStart;
    }

    const p = this._perf;
    let t0 = frameStart;

    if (!this.isPaused) {
      // 1. Physics & Movement
      this.player.updatePhysics(dt, this.input);
      let t1 = performance.now();
      p.physics += (t1 - t0); t0 = t1;

      // 2. 3D Infinite Chunk Streaming
      this.worldManager.update(this.player.camera.position);
      t1 = performance.now();
      p.stream += (t1 - t0); t0 = t1;

      // 3. Harvesting Raycasting + Procedural Debris + Camera Shake
      this.player.updateHarvesting(
        dt,
        this.input,
        (pos, count, col) => this.emitParticles(pos, count, col),
        this.debrisSystem,
        (amt) => { this.cameraTrauma = Math.min(0.8, this.cameraTrauma + amt); }
      );
      t1 = performance.now();
      p.harvest += (t1 - t0); t0 = t1;

      // 4. Magnet Pickups & Projectiles
      this.player.updatePickups(dt);
      if (this.projectileManager) {
        this.projectileManager.update(
          dt,
          this.player,
          this.progression,
          (pos, count, col) => this.emitParticles(pos, count, col),
          (amt) => { this.cameraTrauma = Math.min(0.85, this.cameraTrauma + amt); }
        );
      }
      t1 = performance.now();
      p.pickups += (t1 - t0); t0 = t1;

      // 5. Autonomous Mining Rovers & Horde Wave Entities
      if (this.roverManager) {
        this.roverManager.update(dt, this.player, (pos, count, col) => this.emitParticles(pos, count, col), this.debrisSystem);
      }
      if (this.entityManager) {
        this.entityManager.update(dt, this.player, (pos, count, col) => this.emitParticles(pos, count, col));
      }
      if (this.radar) {
        this.radar.update(dt, this.player, this.worldManager, this.roverManager, this.entityManager);
      }
      t1 = performance.now();
      p.rovers += (t1 - t0); t0 = t1;

      // 6. Particles, Procedural 3D Debris & Atmospheric Dust
      this.updateParticles(dt);
      this.debrisSystem.update(dt);
      this.dustSystem.update(dt, this.player.camera.position);
      t1 = performance.now();
      p.particles += (t1 - t0); t0 = t1;

      // 7. Dynamic Sprint FOV & Micro Camera Shake
      const targetFov = this.input.isSprinting ? 80 : 75;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
      }
      if (this.cameraTrauma > 0.001) {
        const shake = this.cameraTrauma * this.cameraTrauma * 0.04;
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
        this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
      }

      // 8. Lighting & Audio
      this.updateLightingAndAudio();
      t1 = performance.now();
      p.lighting += (t1 - t0); t0 = t1;
    }

    const renderStart = performance.now();
    if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const frameEnd = performance.now();
    p.render += (frameEnd - renderStart);

    const frameMs = frameEnd - frameStart;
    p.total += frameMs;
    if (frameMs > p.maxFrameMs) p.maxFrameMs = frameMs;
    p.frames++;

    // Log FPS & compute bottleneck breakdown every 3 seconds
    if (frameEnd - p.lastLog >= 3000 && p.frames > 0) {
      const n = p.frames;
      const elapsedSec = (frameEnd - p.lastLog) / 1000;
      const fps = Math.round(n / elapsedSec);
      const avgMs = p.total / n;
      const breakdown = {
        physics: p.physics / n,
        stream: p.stream / n,
        harvest: p.harvest / n,
        pickups: p.pickups / n,
        rovers: p.rovers / n,
        particles: p.particles / n,
        lighting: p.lighting / n,
        render: p.render / n
      };

      let topName = 'render';
      let topMs = 0;
      for (const [k, v] of Object.entries(breakdown)) {
        if (v > topMs) {
          topMs = v;
          topName = k;
        }
      }
      const topPct = avgMs > 0 ? Math.round((topMs / avgMs) * 100) : 0;
      const info = this.renderer.info.render;

      console.log(
        `[PERF] ${fps} FPS | Frame: ${avgMs.toFixed(2)}ms avg (max ${p.maxFrameMs.toFixed(1)}ms) | ` +
        `Draws: ${info.calls} | Tris: ${info.triangles} | Chunks: ${this.worldManager.loadedChunks.size} | ` +
        `BOTTLENECK: ${topName} (${topMs.toFixed(2)}ms, ${topPct}%) | ` +
        `Breakdown(ms): phys=${breakdown.physics.toFixed(2)} stream=${breakdown.stream.toFixed(2)} ` +
        `harv=${breakdown.harvest.toFixed(2)} light=${breakdown.lighting.toFixed(2)} rend=${breakdown.render.toFixed(2)}`
      );

      p.frames = 0;
      p.lastLog = frameEnd;
      p.maxFrameMs = 0;
      p.physics = p.stream = p.harvest = p.pickups = p.rovers = p.particles = p.lighting = p.render = p.total = 0;
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  new GameEngine();
});
