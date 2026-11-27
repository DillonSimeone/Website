/**
 * Apex Parasite: Chimera Odyssey - 2.5D Multiplane WebGL Stage Engine
 * Hooked directly into the 3DModelRacing GrassField GPU engine for real-time
 * procedural wind-swept primeval forest meadow rendering.
 *
 * Visual Architecture:
 * - True 2.5D Multiplane Tunnel Diorama: Layered depth planes (Z = -4 to -80)
 * - 3DModelRacing GrassField: GPU instanced concentric rings, 5-color gradients, wildflowers
 * - Shared Elevation: Procedural terrain mathematically synced with GLSL shader
 * - Dynamic 3D Gaslamp Lighting: Point lights casting specular sheen on wet cobblestones
 * - Atmospheric Particles: Bioluminescent spore motes in the forest canopy
 * - Responsive Spring Parallax: Mouse orbit across discrete depth slices
 */

import * as THREE from 'three';
import { GrassField, DEFAULT_GRASS_RINGS } from '../../../Projects/3DModelRacing/three.js/js/grass.js';
import { getTerrainHeight } from '../../../Projects/3DModelRacing/three.js/js/terrain.js';

export class ParallaxStage {
  constructor(canvasElement, assetManager = null) {
    this.canvas = canvasElement;
    this.assets = assetManager;

    // Viewport dimensions
    this.width = canvasElement.clientWidth || 1200;
    this.height = canvasElement.clientHeight || 700;

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Perspective Camera
    this.camera = new THREE.PerspectiveCamera(46, this.width / this.height, 0.5, 700);

    // Camera base elevation per scene (City vs Forest)
    this.baseCamY = 3.8;
    this.targetLookAtY = 3.2;
    this.camera.position.set(0, this.baseCamY, 16);

    // Mouse spring-physics parallax target
    this.targetCamX = 0;
    this.targetCamYOffset = 0;
    this.camX = 0;
    this.camY = this.baseCamY;

    // Animation Clock
    this.clock = new THREE.Clock();

    // Scene Graph
    this.scene = new THREE.Scene();
    this.cityGroup = new THREE.Group();
    this.forestGroup = new THREE.Group();
    this.scene.add(this.cityGroup);
    this.scene.add(this.forestGroup);

    // Stage State
    this.environment = 'CITY';
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.bloodPoolSize = 0;
    this.scenesBuilt = false;
    this.encounterEntity = null;
    this.encounterAnimTime = 0;

    // Pre-allocated vectors for grass updates
    this.grassFocusPos = new THREE.Vector3(0, 8.5, -10);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    this.weatherStub = {
      cloudOffset: new THREE.Vector2(),
      cloudShadowIntensity: 0.22,
      lightningIntensity: 0.0,
      windSpeed: 1.15
    };

    // Build Stages
    this._initCityScene();
    this._initForestScene();

    // Set initial environment
    this.setEnvironment('CITY');

    this.bindEvents();
    this.handleResize();
    this.startRenderLoop();
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1 to 1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      // Smooth camera orbit offsets
      this.targetCamX = Math.max(-1, Math.min(1, nx)) * 6.5;
      this.targetCamYOffset = Math.max(-1, Math.min(1, -ny)) * 2.8;
    });

    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const r = parent.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        this.width = Math.round(r.width);
        this.height = Math.round(r.height);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CITY STAGE (Frontier Settlement: Oakhaven)
  // ---------------------------------------------------------------------------
  _initCityScene() {
    // 1. Wet Flagstone Cobblestone Street Pavement
    const streetGeom = new THREE.PlaneGeometry(260, 160);
    streetGeom.rotateX(-Math.PI / 2);

    const texLoader = new THREE.TextureLoader();
    const cobblestoneTex = texLoader.load('assets/cobblestones.jpg');
    cobblestoneTex.wrapS = THREE.RepeatWrapping;
    cobblestoneTex.wrapT = THREE.RepeatWrapping;
    cobblestoneTex.repeat.set(18, 12);

    const streetMat = new THREE.MeshStandardMaterial({
      map: cobblestoneTex,
      color: 0x182433,
      roughness: 0.32, // High wet specular sheen
      metalness: 0.20
    });
    this.cityStreet = new THREE.Mesh(streetGeom, streetMat);
    this.cityStreet.position.set(0, 0, -20);
    this.cityStreet.receiveShadow = true;
    this.cityGroup.add(this.cityStreet);

    // 2. City Lighting: Cool ambient moonlight + warm gaslamp point lights
    const moonDirLight = new THREE.DirectionalLight(0xa5c8f0, 1.2);
    moonDirLight.position.set(25, 40, 20);
    this.cityGroup.add(moonDirLight);

    const cityAmbient = new THREE.AmbientLight(0x0c1524, 0.85);
    this.cityGroup.add(cityAmbient);

    // Gaslamp 3D Point Lights
    this.lampLight1 = new THREE.PointLight(0xffab38, 3.6, 38, 1.2);
    this.lampLight1.position.set(-10, 6.2, -6.5);
    this.cityGroup.add(this.lampLight1);

    this.lampLight2 = new THREE.PointLight(0xffab38, 3.4, 38, 1.2);
    this.lampLight2.position.set(8.5, 6.2, -10.5);
    this.cityGroup.add(this.lampLight2);

    // 3. Moon Disc on Distant Sky
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 128;
    moonCanvas.height = 128;
    const mCtx = moonCanvas.getContext('2d');
    const mGrad = mCtx.createRadialGradient(64, 64, 12, 64, 64, 62);
    mGrad.addColorStop(0, '#ffffff');
    mGrad.addColorStop(0.35, '#dbeafe');
    mGrad.addColorStop(0.75, 'rgba(147, 197, 253, 0.35)');
    mGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    mCtx.fillStyle = mGrad;
    mCtx.beginPath();
    mCtx.arc(64, 64, 62, 0, Math.PI * 2);
    mCtx.fill();

    const moonTex = new THREE.CanvasTexture(moonCanvas);
    const moonMat = new THREE.SpriteMaterial({ map: moonTex, transparent: true, blending: THREE.AdditiveBlending });
    const moonSprite = new THREE.Sprite(moonMat);
    moonSprite.position.set(38, 44, -150);
    moonSprite.scale.set(34, 34, 1);
    this.cityGroup.add(moonSprite);

    // 4. Combat Blood Decal Pool Mesh
    const bloodGeom = new THREE.PlaneGeometry(1, 1);
    bloodGeom.rotateX(-Math.PI / 2);
    const bloodMat = new THREE.MeshStandardMaterial({
      color: 0x880015,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.92
    });
    this.bloodMeshCity = new THREE.Mesh(bloodGeom, bloodMat);
    this.bloodMeshCity.position.set(1.5, 0.05, -6.5);
    this.bloodMeshCity.scale.set(0.01, 1, 0.01);
    this.cityGroup.add(this.bloodMeshCity);
  }

  // ---------------------------------------------------------------------------
  // FOREST STAGE (The Primeval Canopy with 3DModelRacing GrassField)
  // ---------------------------------------------------------------------------
  _initForestScene() {
    // 1. Procedural Elevated Terrain matching 3DModelRacing terrain function
    const terrainSize = 320;
    const terrainGeom = new THREE.PlaneGeometry(terrainSize, terrainSize, 80, 80);
    terrainGeom.rotateX(-Math.PI / 2);

    const pos = terrainGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, getTerrainHeight(x, z));
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x051a0d, // Dark rich humus / forest loam matching grass base
      roughness: 0.95,
      metalness: 0.02
    });
    this.forestTerrain = new THREE.Mesh(terrainGeom, terrainMat);
    this.forestTerrain.position.set(0, 0, 0);
    this.forestTerrain.receiveShadow = true;
    this.forestGroup.add(this.forestTerrain);

    // 2. High-Performance GPU GrassField from 3DModelRacing
    try {
      const trackData = { points: [] };
      const trackCenter = new THREE.Vector3(0, 8.5, -12);
      const trackSize = new THREE.Vector3(160, 20, 160);

      this.grass = new GrassField(this.forestGroup, trackData, trackCenter, trackSize, {
        colors: {
          colRoot:  [0.010, 0.040, 0.015],
          colLower: [0.035, 0.120, 0.045],
          colMid:   [0.080, 0.260, 0.110],
          colUpper: [0.160, 0.420, 0.200],
          colTip:   [0.260, 0.580, 0.320]
        },
        flora: {
          flowerFrequency: 0.09,
          cloverFrequency: 0.12,
          wheatFrequency: 0.07,
          twistIntensity: 0.95,
          flowerColors: [
            [0.949, 0.220, 0.200], // Crimson
            [0.980, 0.820, 0.141], // Gold
            [0.220, 0.549, 0.949], // Azure
            [0.600, 0.950, 0.700]  // Luminescent Mint
          ]
        },
        rings: DEFAULT_GRASS_RINGS
      });
    } catch (err) {
      console.warn('GrassField direct initialization notice:', err);
    }

    // 3. Forest Lighting
    const forestMoonLight = new THREE.DirectionalLight(0x86efac, 1.25);
    forestMoonLight.position.set(20, 42, 22);
    this.forestGroup.add(forestMoonLight);

    const forestAmbient = new THREE.AmbientLight(0x04180d, 0.95);
    this.forestGroup.add(forestAmbient);

    // Bioluminescent Spore Point Light
    const sporeLight = new THREE.PointLight(0x4ade80, 2.2, 35);
    sporeLight.position.set(0, 12, -14);
    this.forestGroup.add(sporeLight);

    // 4. Floating Bioluminescent Spore Motes Particle System
    this._initForestSporeParticles();

    // 5. Forest Combat Blood Decal Pool Mesh
    const bGeom = new THREE.PlaneGeometry(1, 1);
    bGeom.rotateX(-Math.PI / 2);
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x880015,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.92
    });
    this.bloodMeshForest = new THREE.Mesh(bGeom, bMat);
    const groundH = getTerrainHeight(1.5, -8.0);
    this.bloodMeshForest.position.set(1.5, groundH + 0.06, -8.0);
    this.bloodMeshForest.scale.set(0.01, 1, 0.01);
    this.forestGroup.add(this.bloodMeshForest);
  }

  _initForestSporeParticles() {
    const particleCount = 280;
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const x = (Math.random() - 0.5) * 70;
      const z = -4 - Math.random() * 65;
      const baseGround = getTerrainHeight(x, z);
      const y = baseGround + 1.0 + Math.random() * 16.0;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeom.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    // Circular glowing particle texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    pGrad.addColorStop(0, '#ffffff');
    pGrad.addColorStop(0.3, '#4ade80');
    pGrad.addColorStop(0.7, 'rgba(34, 197, 94, 0.35)');
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.beginPath();
    pCtx.arc(32, 32, 30, 0, Math.PI * 2);
    pCtx.fill();

    const pTex = new THREE.CanvasTexture(pCanvas);
    const pMat = new THREE.PointsMaterial({
      size: 0.95,
      map: pTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85
    });

    this.sporeParticles = new THREE.Points(pGeom, pMat);
    this.forestGroup.add(this.sporeParticles);
  }

  // ---------------------------------------------------------------------------
  // BUILD 3D ASSET PLANES (Once AssetManager finishes loading)
  // ---------------------------------------------------------------------------
  buildSceneAssets() {
    if (this.scenesBuilt || !this.assets || !this.assets.isLoaded) return;
    this.scenesBuilt = true;

    // Helper: Create textured transparent plane mesh
    const createPlane = (assetId, w, h, opacity = 1.0) => {
      const canvas = this.assets.get(assetId);
      if (!canvas) return null;

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.08,
        opacity: opacity,
        side: THREE.DoubleSide
      });
      const geom = new THREE.PlaneGeometry(w, h);
      return new THREE.Mesh(geom, mat);
    };

    // =========================================================================
    // A. CITY STAGE: 2.5D TUNNEL DIORAMA (Discrete Z-Layers)
    // =========================================================================

    // 1. Foreground Frame (Z = -6 to -8)
    const lampFG = createPlane('lamp', 3.6, 9.5);
    if (lampFG) {
      lampFG.position.set(-10, 4.7, -6.5);
      this.cityGroup.add(lampFG);
    }

    const cratesFG = createPlane('crates', 6.5, 4.2);
    if (cratesFG) {
      cratesFG.position.set(9.5, 2.1, -7.5);
      this.cityGroup.add(cratesFG);
    }

    // 2. Midground 1: Tavern & Second Lamp (Z = -11 to -14)
    const tavern = createPlane('tavern', 15, 15);
    if (tavern) {
      tavern.position.set(-11.5, 7.5, -14);
      this.cityGroup.add(tavern);
    }

    const lampMG = createPlane('lamp', 3.6, 9.5);
    if (lampMG) {
      lampMG.position.set(8.5, 4.7, -10.5);
      this.cityGroup.add(lampMG);
    }

    // 3. Midground 2: Receding Alley Buildings (Z = -19 to -26)
    const manor = createPlane('house', 14, 14);
    if (manor) {
      manor.position.set(9.0, 7.0, -19);
      this.cityGroup.add(manor);
    }

    const narrowHouse = createPlane('house_narrow', 10, 14);
    if (narrowHouse) {
      narrowHouse.position.set(-2.5, 7.0, -24);
      this.cityGroup.add(narrowHouse);
    }

    const tavern2 = createPlane('tavern', 15, 15);
    if (tavern2) {
      tavern2.position.set(18.0, 7.5, -26);
      this.cityGroup.add(tavern2);
    }

    // 4. Background: Distant Cathedral Spires (Z = -48 to -72)
    const spireLeft = createPlane('spire', 18, 36, 0.55);
    if (spireLeft) {
      spireLeft.position.set(-9.0, 18.0, -48);
      this.cityGroup.add(spireLeft);
    }

    const spireCenter = createPlane('spire', 22, 44, 0.40);
    if (spireCenter) {
      spireCenter.position.set(4.0, 22.0, -70);
      this.cityGroup.add(spireCenter);
    }

    const spireRight = createPlane('spire', 16, 32, 0.45);
    if (spireRight) {
      spireRight.position.set(19.0, 16.0, -58);
      this.cityGroup.add(spireRight);
    }

    // =========================================================================
    // B. FOREST STAGE: 2.5D PRIMEVAL REDWOOD TUNNEL DIORAMA
    // =========================================================================

    // Discrete multiplane tree configurations anchored directly into terrain
    const forestTreeConfigs = [
      // 1. Foreground Framing Trunks (Close to camera, big parallax swing)
      { x: -14.0, z: -3.5, w: 15.0, h: 26.0, flip: false, opacity: 1.0 },
      { x:  14.0, z: -4.5, w: 15.0, h: 26.0, flip: true,  opacity: 1.0 },

      // 2. Near Forest Giants (Z = -14 to -18)
      { x: -7.0,  z: -14.0, w: 18.0, h: 28.0, flip: false, opacity: 1.0 },
      { x:  8.5,  z: -17.0, w: 17.0, h: 27.0, flip: true,  opacity: 1.0 },

      // 3. Midground Dense Grove (Z = -28 to -36)
      { x: -20.0, z: -30.0, w: 22.0, h: 34.0, flip: false, opacity: 0.95 },
      { x:   1.5, z: -28.0, w: 19.0, h: 30.0, flip: true,  opacity: 0.95 },
      { x:  22.0, z: -34.0, w: 23.0, h: 35.0, flip: false, opacity: 0.95 },

      // 4. Distant Ancient Monoliths (Z = -52 to -75, misted into fog)
      { x: -14.0, z: -52.0, w: 30.0, h: 45.0, flip: true,  opacity: 0.55 },
      { x:  16.0, z: -62.0, w: 32.0, h: 48.0, flip: false, opacity: 0.45 },
      { x:   0.0, z: -75.0, w: 36.0, h: 54.0, flip: false, opacity: 0.35 }
    ];

    forestTreeConfigs.forEach(tc => {
      const tree = createPlane('tree', tc.w, tc.h, tc.opacity || 1.0);
      if (tree) {
        const groundH = getTerrainHeight(tc.x, tc.z);
        // Sunk 8% into terrain so root flare sits firmly IN the soil and grass
        tree.position.set(tc.x, groundH + tc.h * 0.5 - tc.h * 0.08, tc.z);
        if (tc.flip) tree.scale.x = -1;
        this.forestGroup.add(tree);
      }
    });

    // =========================================================================
    // C. COMBAT ENCOUNTER SPRITE PLANES (Beast for City and Forest)
    // =========================================================================
    this.beastMeshCity = createPlane('beast', 10, 10);
    if (this.beastMeshCity) {
      this.beastMeshCity.position.set(1.5, 4.8, -6.5);
      this.beastMeshCity.visible = false;
      this.cityGroup.add(this.beastMeshCity);
    }

    this.beastMeshForest = createPlane('beast', 10, 10);
    if (this.beastMeshForest) {
      const gH = getTerrainHeight(1.5, -8.0);
      this.beastMeshForest.position.set(1.5, gH + 4.8, -8.0);
      this.beastMeshForest.visible = false;
      this.forestGroup.add(this.beastMeshForest);
    }
  }

  // ---------------------------------------------------------------------------
  // ENVIRONMENT SWITCHING
  // ---------------------------------------------------------------------------
  setEnvironment(envName) {
    this.environment = envName;

    if (!this.scenesBuilt) {
      this.buildSceneAssets();
    }

    if (envName === 'FOREST') {
      this.cityGroup.visible = false;
      this.forestGroup.visible = true;
      this.scene.fog = new THREE.FogExp2(0x02160d, 0.012);
      this.scene.background = new THREE.Color(0x020a06);
      // Elevate camera to ride smoothly above rolling meadow
      this.baseCamY = 11.7;
      this.targetLookAtY = 11.2;
    } else {
      this.cityGroup.visible = true;
      this.forestGroup.visible = false;
      this.scene.fog = new THREE.FogExp2(0x020814, 0.012);
      this.scene.background = new THREE.Color(0x01040a);
      // Street eye-level
      this.baseCamY = 3.8;
      this.targetLookAtY = 3.2;
    }
  }

  // ---------------------------------------------------------------------------
  // COMBAT & STAGE HOOKS
  // ---------------------------------------------------------------------------
  triggerScreenShake(intensity = 15) {
    this.shakeIntensity = intensity;
  }

  triggerImpact(type, x, y) {
    this.triggerScreenShake(type === 'crush' ? 22 : 14);
  }

  addBloodToPool(amount = 15) {
    this.bloodPoolSize = Math.min(140, this.bloodPoolSize + amount);
    const s = (this.bloodPoolSize / 140) * 8.0;
    if (this.bloodMeshCity) {
      this.bloodMeshCity.scale.set(s * 1.5, 1, s * 0.8);
    }
    if (this.bloodMeshForest) {
      this.bloodMeshForest.scale.set(s * 1.5, 1, s * 0.8);
    }
  }

  resetBloodPool() {
    this.bloodPoolSize = 0;
    if (this.bloodMeshCity) {
      this.bloodMeshCity.scale.set(0.01, 1, 0.01);
    }
    if (this.bloodMeshForest) {
      this.bloodMeshForest.scale.set(0.01, 1, 0.01);
    }
  }

  triggerExploreStep(onComplete) {
    // Step forward camera impulse
    this.camera.position.z -= 2.0;
    setTimeout(() => {
      this.camera.position.z += 2.0;
      if (onComplete) onComplete();
    }, 380);
  }

  setEncounterTarget(entity) {
    this.encounterEntity = entity;
    this.encounterAnimTime = 0;
    if (this.environment === 'FOREST') {
      if (this.beastMeshForest) this.beastMeshForest.visible = true;
      if (this.beastMeshCity) this.beastMeshCity.visible = false;
    } else {
      if (this.beastMeshCity) this.beastMeshCity.visible = true;
      if (this.beastMeshForest) this.beastMeshForest.visible = false;
    }
  }

  clearEncounterTarget() {
    this.encounterEntity = null;
    this.resetBloodPool();
    if (this.beastMeshCity) this.beastMeshCity.visible = false;
    if (this.beastMeshForest) this.beastMeshForest.visible = false;
  }

  // ---------------------------------------------------------------------------
  // RENDER LOOP
  // ---------------------------------------------------------------------------
  startRenderLoop() {
    const loop = () => {
      this.update();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update() {
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Lazy load asset meshes once assets finish loading
    if (!this.scenesBuilt && this.assets && this.assets.isLoaded) {
      this.buildSceneAssets();
    }

    // 1. Update 3DModelRacing GrassField if in Forest
    if (this.environment === 'FOREST' && this.grass) {
      this.grassFocusPos.set(this.camX, 8.5, -10);
      this.weatherStub.cloudOffset.set(elapsed * 0.015, 0);
      this.grass.update(delta, this.grassFocusPos, 0.18, [], null, this.sunDir, this.weatherStub);
    }

    // 2. Animate Forest Spore Motes
    if (this.environment === 'FOREST' && this.sporeParticles) {
      const posAttr = this.sporeParticles.geometry.attributes.position;
      const phaseAttr = this.sporeParticles.geometry.attributes.phase;
      for (let i = 0; i < posAttr.count; i++) {
        const ph = phaseAttr.getX(i);
        const curY = posAttr.getY(i);
        posAttr.setY(i, curY + Math.sin(elapsed * 1.5 + ph) * 0.014);
      }
      posAttr.needsUpdate = true;
    }

    // 3. Smooth spring-physics mouse parallax
    const targetX = this.targetCamX;
    const targetY = this.baseCamY + this.targetCamYOffset;

    this.camX += (targetX - this.camX) * 0.06;
    this.camY += (targetY - this.camY) * 0.06;

    this.camera.position.x = this.camX;
    this.camera.position.y = this.camY;
    this.camera.lookAt(0, this.targetLookAtY, -18);

    // 4. Screen shake
    if (this.shakeIntensity > 0.05) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.06;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.06;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeIntensity = 0;
    }

    // 5. Gaslamp subtle flicker in City
    if (this.environment === 'CITY') {
      const flicker1 = Math.sin(elapsed * 9.0) * 0.25 + 3.5;
      const flicker2 = Math.cos(elapsed * 7.5) * 0.25 + 3.3;
      if (this.lampLight1) this.lampLight1.intensity = flicker1;
      if (this.lampLight2) this.lampLight2.intensity = flicker2;
    }

    // 6. Encounter breathing pulse
    if (this.encounterEntity) {
      this.encounterAnimTime += delta * 2.8;
      const pulse = Math.sin(this.encounterAnimTime) * 0.025 + 1.0;
      if (this.beastMeshCity && this.beastMeshCity.visible) {
        this.beastMeshCity.scale.set(pulse * 10, pulse * 10, 1);
      }
      if (this.beastMeshForest && this.beastMeshForest.visible) {
        this.beastMeshForest.scale.set(pulse * 10, pulse * 10, 1);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
