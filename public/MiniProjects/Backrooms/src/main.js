import * as THREE from 'three';
import { WorldManager } from './world/worldManager.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { CraftingSystem } from './crafting.js';
import { ProgressionSystem } from './progression.js';
import { LevelupSystem } from './levelups.js';
import { RoverManager } from './rover.js';

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Audio Subsystem
    this.audio = new AudioEngine();

    // Ambient Lighting
    this.ambientLight = new THREE.AmbientLight(0x1a1910, 0.3);
    this.scene.add(this.ambientLight);

    // World Manager (Canonical Multi-Strata Backrooms)
    this.worldManager = new WorldManager(this.scene, {
      voxelSize: 1.5,
      gridWidth: 8,
      layerHeight: 20.0,
      radiusH: 3,
      radiusV: 1
    });

    // Autonomous Mining Rover Bot Manager
    this.roverManager = new RoverManager(this.scene, this.worldManager);

    // Crafting & Progression
    this.crafting = new CraftingSystem((msg, col) => this.showNotification(msg, col));
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
      onPhase: () => this.player.triggerPhaseGlitch(),
      onCraftHotkey: (key) => this.crafting.craft(key, this.player, this.progression)
    });

    // Particle Burst System
    this.initParticlePool();

    // Loop state
    this.clock = new THREE.Clock();
    this.isPaused = false;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.lastSiphonTime = 0;

    // Window Resize listener
    window.addEventListener('resize', () => this.onResize());

    // Initial Chunk Seed
    this.worldManager.update(this.player.camera.position);

    // Start RAF
    this.animate();
  }

  triggerLevelUp() {
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
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
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
  }

  updateParticles(dt) {
    const positions = this.particlePoints.geometry.attributes.position.array;
    const colors = this.particlePoints.geometry.attributes.color.array;

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
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

    for (let i = 0; i < 300; i++) {
      if (i < this.activeParticles.length) {
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
  }

  updateLightingAndAudio() {
    const playerPos = this.player.camera.position;
    const fixtures = this.worldManager.getLightFixtures();
    let closestDist = Infinity;

    // Forward light culling: keep 6 closest operational PointLights active
    const operational = fixtures.filter(f => f.alive && f.light);
    operational.sort((a, b) => {
      const da = playerPos.distanceTo(a.mesh.position);
      const db = playerPos.distanceTo(b.mesh.position);
      return da - db;
    });

    if (operational.length > 0) {
      closestDist = playerPos.distanceTo(operational[0].mesh.position);
    }

    operational.forEach((f, idx) => {
      const isActive = idx < 6;
      f.light.visible = isActive;
      if (isActive && Math.random() < 0.02) {
        f.light.intensity = f.baseIntensity * (0.2 + Math.random() * 0.8);
      } else if (isActive) {
        f.light.intensity = f.baseIntensity;
      }
    });

    // Ambient Siphon Perk
    if (this.player.ambientSiphon && closestDist < 6.5) {
      if (performance.now() - this.lastSiphonTime > 2000) {
        this.lastSiphonTime = performance.now();
        this.progression.addXp(1);
      }
    }

    // Biome sync for fog and audio hum
    const currentBiome = this.worldManager.getCurrentBiome(playerPos);
    if (currentBiome) {
      this.scene.fog.color.setHex(currentBiome.fogColor);
      this.scene.fog.density = currentBiome.fogDensity;
      this.ambientLight.color.setHex(currentBiome.ambientColor);

      const normDist = closestDist === Infinity ? 1.0 : Math.min(1.0, closestDist / 14.0);
      this.audio.updateHum(normDist, currentBiome.humFrequency);

      const zoneEl = document.getElementById('zone-info');
      if (zoneEl) zoneEl.innerText = `STRATA // ${currentBiome.name.toUpperCase()}`;
    }

    // Telemetry coords
    const coordEl = document.getElementById('coord-info');
    if (coordEl) {
      const fl = Math.floor(playerPos.y / 20.0);
      coordEl.innerText = `X:${playerPos.x.toFixed(1)} | Y:${playerPos.y.toFixed(1)} (FL ${fl}) | Z:${playerPos.z.toFixed(1)}`;
    }
  }

  showNotification(msg, color = 'green') {
    const feed = document.getElementById('notification-feed');
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
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // FPS counter
    this.frameCount++;
    if (performance.now() - this.lastFpsUpdate > 1000) {
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl) fpsEl.innerText = `${this.frameCount} FPS`;
      this.frameCount = 0;
      this.lastFpsUpdate = performance.now();
    }

    if (!this.isPaused) {
      // 1. Physics & Movement
      this.player.updatePhysics(dt, this.input);

      // 2. 3D Infinite Chunk Streaming
      this.worldManager.update(this.player.camera.position);

      // 3. Harvesting Raycasting
      this.player.updateHarvesting(dt, this.input, (pos, count, col) => this.emitParticles(pos, count, col));

      // 4. Magnet Pickups
      this.player.updatePickups(dt);

      // 5. Autonomous Mining Rovers
      if (this.roverManager) {
        this.roverManager.update(dt, this.player, (pos, count, col) => this.emitParticles(pos, count, col));
      }

      // 6. Particles
      this.updateParticles(dt);

      // 7. Lighting & Audio
      this.updateLightingAndAudio();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  new GameEngine();
});
