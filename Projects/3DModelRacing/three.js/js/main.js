import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';
import { VehicleStats } from './vehicle_stats.js';
import { ModelLoader, COLORS, PATTERNS } from './model_loader.js';
import { TrackGen } from './track_gen.js';
import { RoadStreamer } from './road_streamer.js';
import { WorldView } from './world.js';
import { Vehicle } from './vehicle.js';
import { RivalManager } from './rivals.js';
import { AudioSynth } from './audio.js';
import { RaceHud } from './hud.js';

class GameApp {
    constructor() {
        this.canvas = document.getElementById('webgl-canvas');
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Scenes & Cameras
        this.raceScene = new THREE.Scene();
        this.garageScene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);

        // Core Systems
        this.audio = new AudioSynth();
        this.hud = new RaceHud();

        // Game Configuration
        this.state = 'MENU'; // MENU, GARAGE, RACE, PAUSED
        this.mode = 'arcade'; // 'arcade' or 'roguelite'
        this.runSeed = 1;
        this.selectedColor = COLORS[0];
        this.selectedPattern = 0;

        // Custom Vehicle Data
        this.currentGeometry = VehicleStats.createDefaultRacer();
        this.garageEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.currentStats = VehicleStats.compute(new THREE.Vector3(1.4, 0.65, 3.0));

        // Garage Turntable State (Initially facing FRONT)
        this.turntableYaw = 0;
        this.turntablePitch = 0;
        this.turntableRoll = 0;
        this.garageVehicleElevation = 0;
        this.garageDisplayShadow = null;
        this.isDraggingTurntable = false;
        this.isAligningToFront = false;
        this.prevMousePos = { x: 0, y: 0 };

        // Active Race Entities
        this.streamer = null;
        this.trackData = null;
        this.world = null;
        this.player = null;
        this.rivals = null;
        this.elapsedTime = 0;
        this.topSpeedReached = 0;
        this.totalDistanceDriven = 0;
        this.raceFinished = false;

        // Roguelite Upgrade State
        this.playerLevel = 1;
        this.playerXp = 0;
        this.nextLevelXp = 80;
        this.activeUpgrades = [];

        // Void Loading & Launch Transition
        this.isRaceLoaded = false;
        this.launchStartTime = 0;
        this.launchCarSpeed = 0;
        this.launchCarDist = 0;
        this.hasSwappedToCompositor = false;
        this.launchBitmaps = [];
        this.isCapturingFrames = false;
        this.lastCaptureTime = 0;
        this.pingPongActive = false;
        this.compFrameIdx = 0;
        this.compFrameDir = 1;
        this.currentFps = 60;

        // In-Race Background Performance Benchmark
        this.perfBenchmarkSamples = [];
        this.perfBenchmarkDone = false;

        // Input Tracking
        this.keys = {};

        this._setupEventListeners();
        this._buildGarageScene();
        this._initUI();
        this._updateGarageElevation();

        // Start render loop
        this.clock = new THREE.Clock();
        requestAnimationFrame((t) => this._loop(t));
    }

    _buildGarageScene() {
        this.garageScene.background = new THREE.Color(0x0a0515);
        this.garageScene.fog = new THREE.FogExp2(0x0a0515, 0.007);

        // Showroom Lighting with Cyberpunk Tones
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
        keyLight.position.set(5, 8, 5);
        this.garageScene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x00f2fe, 1.6);
        fillLight.position.set(-6, 4, -4);
        this.garageScene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xff007f, 2.0);
        rimLight.position.set(0, 5, -8);
        this.garageScene.add(rimLight);

        const ambient = new THREE.AmbientLight(0x180b2a, 1.8);
        this.garageScene.add(ambient);

        // 1. Infinite Cyberpunk Neon Grid Floor going out into the distance
        const gridGeo = new THREE.PlaneGeometry(800, 800, 1, 1);
        gridGeo.rotateX(-Math.PI / 2);
        this.garageGridMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uSpeed: { value: 0.0 },
                uGridColor: { value: new THREE.Color(0xff007f) },
                uSubGridColor: { value: new THREE.Color(0x00f2fe) },
                uOpacity: { value: 1.0 },
                uCenter: { value: new THREE.Vector2(0, 0) }
            },
            vertexShader: `
                varying vec2 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uSpeed;
                uniform vec3 uGridColor;
                uniform vec3 uSubGridColor;
                uniform float uOpacity;
                uniform vec2 uCenter;
                varying vec2 vWorldPos;
                void main() {
                    // Grid coordinates in world space:
                    // As the vehicle travels forward (-Z), world Z decreases, so the grid lines
                    // rush backwards underneath the car in true physical motion!
                    vec2 coord = vWorldPos;
                    coord.y += uTime * uSpeed;

                    vec2 grid = abs(fract(coord * 0.25 - 0.5) - 0.5) / fwidth(coord * 0.25);
                    float line = min(grid.x, grid.y);
                    float c1 = 1.0 - min(line, 1.0);

                    vec2 subGrid = abs(fract(coord * 1.0 - 0.5) - 0.5) / fwidth(coord * 1.0);
                    float subLine = min(subGrid.x, subGrid.y);
                    float c2 = (1.0 - min(subLine, 1.0)) * 0.35;

                    float dist = length(vWorldPos - uCenter);
                    float fade = exp(-dist * 0.0075);

                    vec3 col = uGridColor * c1 * 1.8 + uSubGridColor * c2 * 1.2;
                    col += vec3(0.04, 0.01, 0.08) * (1.0 - fade * 0.5);

                    gl_FragColor = vec4(col * fade * uOpacity, fade * uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false
        });
        const gridMesh = new THREE.Mesh(gridGeo, this.garageGridMat);
        gridMesh.position.y = -0.16;
        this.garageGridMesh = gridMesh;
        this.garageScene.add(gridMesh);

        // 2. Purple Glitching Synthwave Sun on the Horizon
        const sunGeo = new THREE.CircleGeometry(52, 64);
        this.garageSunMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uGlitch: { value: 0.0 },
                uOpacity: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uGlitch;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    float r = length(p);
                    if (r > 1.0) discard;

                    // Horizontal scanline twitch glitch
                    float twitch = sin(uTime * 45.0 + p.y * 30.0) * uGlitch * 0.04;
                    p.x += twitch;

                    vec3 colCore = vec3(1.0, 0.88, 0.20); // Vibrant solar gold
                    vec3 colMid  = vec3(1.0, 0.12, 0.58); // Neon hot magenta
                    vec3 colEdge = vec3(0.68, 0.05, 0.95); // Electric synth violet
                    vec3 sunColor = mix(colCore, colMid, smoothstep(-0.5, 0.3, p.y));
                    sunColor = mix(sunColor, colEdge, smoothstep(0.3, 0.95, r));

                    // Horizontal scanline slats getting thicker towards the bottom
                    if (p.y < 0.25) {
                        float slatPeriod = 0.11;
                        float slatRatio = mix(0.18, 0.65, clamp(-p.y * 1.2, 0.0, 1.0));
                        float slat = mod(p.y - uTime * 0.02, slatPeriod);
                        if (slat < slatPeriod * slatRatio) {
                            discard;
                        }
                    }

                    float scanline = sin(vUv.y * 320.0 + uTime * 12.0) * 0.06;
                    sunColor += vec3(0.15, 0.05, 0.25) * scanline;

                    float glow = pow(1.0 - r, 0.55);
                    gl_FragColor = vec4(sunColor * (1.35 + uGlitch * 0.8) * uOpacity, glow * uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const sunMesh = new THREE.Mesh(sunGeo, this.garageSunMat);
        sunMesh.position.set(0, 24, -160);
        this.garageSunMesh = sunMesh;
        this.garageScene.add(sunMesh);

        // Turntable Pedestal
        const platGeom = new THREE.CylinderGeometry(2.4, 2.6, 0.25, 48);
        const platMat = new THREE.MeshStandardMaterial({
            color: 0x161824,
            roughness: 0.2,
            metalness: 0.8
        });
        const platform = new THREE.Mesh(platGeom, platMat);
        platform.position.y = -0.15;
        this.garagePlatform = platform;
        this.garageScene.add(platform);

        // Holographic Axis Rings
        const ringGeom = new THREE.RingGeometry(2.7, 2.76, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.12;
        this.garageRing = ring;
        this.garageScene.add(ring);

        // Unmistakable Glowing FRONT Direction Guide
        const fwdGroup = new THREE.Group();

        // 1. Large Bold Runway Arrow on Floor
        const fwdCanvas = document.createElement('canvas');
        fwdCanvas.width = 512; fwdCanvas.height = 512;
        const fCtx = fwdCanvas.getContext('2d');
        fCtx.fillStyle = '#00f2fe';
        fCtx.beginPath();
        fCtx.moveTo(256, 40); fCtx.lineTo(390, 220); fCtx.lineTo(310, 220);
        fCtx.lineTo(310, 340); fCtx.lineTo(202, 340); fCtx.lineTo(202, 220); fCtx.lineTo(122, 220);
        fCtx.closePath();
        fCtx.fill();
        fCtx.fillStyle = '#ffffff';
        fCtx.font = '900 48px sans-serif';
        fCtx.textAlign = 'center';
        fCtx.fillText('▲ FRONT DIRECTION ▲', 256, 420);
        fCtx.font = 'bold 32px sans-serif';
        fCtx.fillStyle = '#00f2fe';
        fCtx.fillText('VEHICLE DRIVES THIS WAY', 256, 470);

        const fwdTex = new THREE.CanvasTexture(fwdCanvas);
        const fwdMarker = new THREE.Mesh(
            new THREE.PlaneGeometry(3.0, 3.0),
            new THREE.MeshBasicMaterial({ map: fwdTex, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
        );
        fwdMarker.rotation.x = -Math.PI / 2;
        fwdMarker.position.set(0, -0.11, -1.9);
        fwdGroup.add(fwdMarker);

        // 2. Cyan Glowing Alignment Laser Beam across Front
        const beamMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 3.5
        });
        const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 12), beamMat);
        beamMesh.rotation.z = Math.PI / 2;
        beamMesh.position.set(0, 0.05, -1.95);
        fwdGroup.add(beamMesh);

        // 3. Dual Vertical Guide Pylons with glowing beacon tops
        for (const px of [-1.6, 1.6]) {
            const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x1f2330 }));
            pylon.position.set(px, 0.5, -1.95);
            fwdGroup.add(pylon);

            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), beamMat);
            beacon.position.set(px, 1.15, -1.95);
            fwdGroup.add(beacon);
        }

        this.garageFwdGroup = fwdGroup;
        this.garageScene.add(fwdGroup);

        // Vehicle Display Root
        this.garageVehicleRoot = new THREE.Group();
        this.garageScene.add(this.garageVehicleRoot);

        this._rebuildGarageVehicleMesh();
    }

    _rebuildGarageVehicleMesh() {
        while (this.garageVehicleRoot.children.length > 0) {
            this.garageVehicleRoot.remove(this.garageVehicleRoot.children[0]);
        }

        const mat = ModelLoader.createMaterial(this.selectedColor, this.selectedPattern);
        this.garageMesh = new THREE.Mesh(this.currentGeometry, mat);
        this.garageVehicleRoot.add(this.garageMesh);

        this.currentGeometry.computeBoundingBox();
        const box = this.currentGeometry.boundingBox || new THREE.Box3(new THREE.Vector3(-0.7, 0, -1.5), new THREE.Vector3(0.7, 0.8, 1.5));
        const frontZ = box.min.z;
        const rearZ = box.max.z;
        const halfW = Math.max(0.18, (box.max.x - box.min.x) * 0.24);
        const lightY = box.min.y + (box.max.y - box.min.y) * 0.38;

        // Dual Xenon Headlights (Front nose cone — mounted directly to garageMesh so they are part of the model)
        const hlMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 2.8 });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.12), hlMat);
        hlL.position.set(-halfW, lightY, frontZ + 0.06);
        this.garageMesh.add(hlL);
        const hlR = hlL.clone();
        hlR.position.x = halfW;
        this.garageMesh.add(hlR);

        // Dual Red Taillights / Brake Lights (Rear deck — mounted directly to garageMesh so they are part of the model)
        const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1122, emissive: 0xff1122, emissiveIntensity: 2.8 });
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.12), tlMat);
        tlL.position.set(-halfW * 1.25, lightY + 0.08, rearZ - 0.06);
        this.garageMesh.add(tlL);
        const tlR = tlL.clone();
        tlR.position.x = halfW * 1.25;
        this.garageMesh.add(tlR);

        // Display Shadow on the pedestal deck
        if (this.garageDisplayShadow) {
            this.garageScene.remove(this.garageDisplayShadow);
            if (this.garageDisplayShadow.geometry) this.garageDisplayShadow.geometry.dispose();
            if (this.garageDisplayShadow.material) this.garageDisplayShadow.material.dispose();
            this.garageDisplayShadow = null;
        }

        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide
        });
        this.garageDisplayShadow = new THREE.Mesh(this.currentGeometry.clone(), shadowMat);
        this.garageDisplayShadow.scale.set(1.0, 0.002, 1.0);
        this.garageDisplayShadow.position.set(0, -0.015, 0);
        this.garageScene.add(this.garageDisplayShadow);
    }

    _setupEventListeners() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
            if (this.pingPongActive) {
                const compCanvas = document.getElementById('compositor-canvas');
                if (compCanvas) {
                    compCanvas.width = w;
                    compCanvas.height = h;
                }
            }
        });

        // Keyboard Controls
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this.audio.ensureContext();

            if (e.code === 'KeyR' && this.state === 'RACE') {
                this._respawnPlayer();
            }
            if (e.code === 'Escape') {
                if (this.state === 'RACE') {
                    this.switchState('GARAGE');
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Turntable Interactive Mouse Dragging
        const handleDragStart = (clientX, clientY, target) => {
            if (this.state !== 'GARAGE') return;
            if (this.isAligningToFront) return; // Prevent interaction until vehicle has finished facing forward!
            if (target && (target.closest('.garage-sidebar') || target.closest('button') || target.closest('input') || target.closest('.color-swatch') || target.closest('.dropzone'))) {
                return;
            }
            this.isDraggingTurntable = true;
            this.prevMousePos = { x: clientX, y: clientY };
        };

        window.addEventListener('mousedown', (e) => {
            handleDragStart(e.clientX, e.clientY, e.target);
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isAligningToFront || !this.isDraggingTurntable || this.state !== 'GARAGE') return;
            const dx = e.clientX - this.prevMousePos.x;
            const dy = e.clientY - this.prevMousePos.y;

            if (e.shiftKey) {
                this.turntableRoll += dx * 0.015;
            } else {
                this.turntableYaw += dx * 0.015;
                this.turntablePitch = THREE.MathUtils.clamp(this.turntablePitch + dy * 0.01, -0.6, 0.85);
            }

            this._updateGarageElevation();
            this.prevMousePos = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            this.isDraggingTurntable = false;
        });

        // Touch drag support
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                handleDragStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (this.isAligningToFront || !this.isDraggingTurntable || this.state !== 'GARAGE' || e.touches.length === 0) return;
            const dx = e.touches[0].clientX - this.prevMousePos.x;
            const dy = e.touches[0].clientY - this.prevMousePos.y;
            this.turntableYaw += dx * 0.015;
            this.turntablePitch = THREE.MathUtils.clamp(this.turntablePitch + dy * 0.01, -0.6, 0.85);

            this._updateGarageElevation();
            this.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }, { passive: true });

        window.addEventListener('touchend', () => {
            this.isDraggingTurntable = false;
        });

        // File Drag & Drop (STL / OBJ / GLB)
        const dropZone = window;
        ['dragenter', 'dragover'].forEach((evt) => {
            dropZone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                await this._handleUploadedFile(e.dataTransfer.files[0]);
            }
        });

        const fileInput = document.getElementById('model-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                if (e.target.files.length > 0) {
                    await this._handleUploadedFile(e.target.files[0]);
                }
            });
        }
    }

    async _handleUploadedFile(file) {
        try {
            const statusEl = document.getElementById('import-status');
            if (statusEl) statusEl.textContent = `Loading ${file.name}...`;

            const geom = await ModelLoader.parseFile(file);
            const { size, stats } = VehicleStats.measureGeometry(geom);

            this.currentGeometry = geom;
            this.currentStats = stats;

            this._rebuildGarageVehicleMesh();
            this._updateGarageElevation();

            if (statusEl) statusEl.textContent = `✓ Loaded ${file.name} (${geom.attributes.position.count / 3 | 0} tris)`;
        } catch (err) {
            console.error('Model import error:', err);
            const statusEl = document.getElementById('import-status');
            if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        }
    }

    _initUI() {
        // Menu Navigation
        document.getElementById('btn-arcade').onclick = () => {
            this.audio.ensureContext();
            this.mode = 'driving';
            this.runSeed = 1;
            document.getElementById('garage-mode-label').textContent = 'ENDLESS DRIVE';
            this.switchState('GARAGE');
        };

        document.getElementById('btn-roguelite').onclick = () => {
            this.audio.ensureContext();
            this.mode = 'roguelite';
            this.runSeed = Math.floor(Math.random() * 99999) + 1;
            document.getElementById('garage-mode-label').textContent = 'ROGUELITE RUN';
            this.switchState('GARAGE');
        };

        // Garage Controls
        document.getElementById('garage-start-btn').onclick = () => {
            this._initiateGarageLaunch();
        };

        document.getElementById('garage-menu-btn').onclick = () => {
            this.switchState('MENU');
        };

        document.getElementById('garage-mode-btn').onclick = () => {
            this.mode = this.mode === 'driving' ? 'roguelite' : 'driving';
            document.getElementById('garage-mode-label').textContent = this.mode === 'driving' ? 'ENDLESS DRIVE' : 'ROGUELITE RUN';
        };

        document.getElementById('garage-reset-facing-btn').onclick = () => {
            this.isAligningToFront = true;
            this.alignStartTime = performance.now();
            let startYaw = this.turntableYaw % (Math.PI * 2);
            if (startYaw > Math.PI) startYaw -= Math.PI * 2;
            if (startYaw < -Math.PI) startYaw += Math.PI * 2;
            this.alignStartYaw = startYaw;
            this.turntableYaw = startYaw;
            this.alignStartPitch = this.turntablePitch;
            this.alignStartRoll = this.turntableRoll;
            this._updateGarageElevation();
            document.body.style.cursor = 'wait';
            const hintEl = document.querySelector('.garage-center-hint span');
            if (hintEl) hintEl.textContent = '🧭 Aligning to forward heading...';
        };

        // Color Swatches
        const colorPalette = document.getElementById('color-palette');
        if (colorPalette) {
            colorPalette.innerHTML = '';
            COLORS.forEach((col, idx) => {
                const swatch = document.createElement('div');
                swatch.className = `color-swatch ${col === this.selectedColor ? 'active' : ''}`;
                swatch.style.backgroundColor = col;
                swatch.onclick = () => {
                    this.selectedColor = col;
                    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                    swatch.classList.add('active');
                    this._rebuildGarageVehicleMesh();
                };
                colorPalette.appendChild(swatch);
            });
        }

        // Pattern Grid
        const patternGrid = document.getElementById('pattern-grid');
        if (patternGrid) {
            patternGrid.innerHTML = '';
            PATTERNS.forEach((pat) => {
                const btn = document.createElement('button');
                btn.className = `pattern-btn ${pat.id === this.selectedPattern ? 'active' : ''}`;
                btn.textContent = pat.name;
                btn.onclick = () => {
                    this.selectedPattern = pat.id;
                    document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._rebuildGarageVehicleMesh();
                };
                patternGrid.appendChild(btn);
            });
        }
    }

    _updateStatsUI() {
        const s = this.currentStats;
        const topEl = document.getElementById('stat-top-speed');
        const accEl = document.getElementById('stat-accel');
        const gripEl = document.getElementById('stat-grip');
        const massEl = document.getElementById('stat-mass');
        const badgeEl = document.getElementById('stat-ascend-badge');

        if (topEl) topEl.textContent = `${Math.round(s.top_speed * 3.6)} km/h`;
        if (accEl) accEl.textContent = s.accel.toFixed(1);
        if (gripEl) gripEl.textContent = s.grip.toFixed(1);
        if (massEl) massEl.textContent = `${s.mass.toFixed(2)} t`;

        if (badgeEl) {
            if (s.can_ascend) {
                badgeEl.textContent = '★ ESCAPE VELOCITY READY';
                badgeEl.className = 'ascend-indicator ready';
            } else {
                badgeEl.textContent = 'NEEDS MORE SPEED / LESS MASS';
                badgeEl.className = 'ascend-indicator not-ready';
            }
        }
    }

    _updateGarageElevation() {
        this.garageEuler.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
        const oriented = VehicleStats.measureOrientedGeometry(this.currentGeometry, this.garageEuler);
        this.currentStats = oriented.stats;
        this._updateStatsUI();

        // Platform pedestal top is at y = -0.025. Clearance baseline at y = -0.015.
        // If bottom vertex dips below deckY, elevate the vehicle root so it rests on the platform without clipping.
        const deckY = -0.015;
        const lowestVertexY = (oriented.minY !== undefined) ? oriented.minY : -0.2;
        this.garageVehicleElevation = Math.max(0, deckY - lowestVertexY);

        if (this.garageVehicleRoot && (this.state === 'GARAGE' || this.state === 'MENU')) {
            this.garageVehicleRoot.position.set(0, this.garageVehicleElevation, 0);
        }
        if (this.garageDisplayShadow) {
            this.garageDisplayShadow.rotation.set(0, this.turntableYaw, 0);
            if (this.state === 'GARAGE_LAUNCH') {
                this.garageDisplayShadow.position.set(0, -0.15, -this.launchCarDist);
            } else {
                this.garageDisplayShadow.position.set(0, -0.015, 0);
            }
            this.garageDisplayShadow.visible = (this.state === 'GARAGE' || this.state === 'MENU' || this.state === 'GARAGE_LAUNCH');
        }
    }

    switchState(newState) {
        this.state = newState;
        document.getElementById('menu-view').style.display = newState === 'MENU' ? 'flex' : 'none';
        document.getElementById('garage-view').style.display = newState === 'GARAGE' ? 'flex' : 'none';

        if (newState === 'RACE') {
            this.hud.show();
            if (this.garageDisplayShadow) this.garageDisplayShadow.visible = false;
            this._startRace();
        } else {
            this.hud.hide();
            this.audio.silence();
            this._teardownRace();

            // Cancel any pending/finished Web Animations on overlay and reset its state
            const overlay = document.getElementById('launch-compositor-overlay');
            if (overlay) {
                overlay.getAnimations().forEach(a => a.cancel());
                overlay.style.display = 'none';
                overlay.style.opacity = '1';
                overlay.classList.remove('dissolve-out');
            }
            const compCanvas = document.getElementById('compositor-canvas');
            if (compCanvas) {
                compCanvas.style.display = 'none';
            }

            if (this.garageDisplayShadow) {
                this.garageDisplayShadow.visible = true;
                this.garageDisplayShadow.position.set(0, -0.015, 0);
            }
            if (this.garagePlatform) this.garagePlatform.visible = true;
            if (this.garageRing) this.garageRing.visible = true;
            if (this.garageFwdGroup) this.garageFwdGroup.visible = true;
            if (this.garageGridMesh) this.garageGridMesh.position.set(0, -0.16, 0);
            if (this.garageSunMesh) this.garageSunMesh.position.set(0, 24, -160);
            if (this.garageGridMat) {
                this.garageGridMat.uniforms.uOpacity.value = 1.0;
                this.garageGridMat.uniforms.uSpeed.value = 0.0;
                this.garageGridMat.uniforms.uCenter.value.set(0, 0);
            }
            if (this.garageSunMat) {
                this.garageSunMat.uniforms.uOpacity.value = 1.0;
            }
            this.pingPongActive = false;
            this.isCapturingFrames = false;
            this.hasSwappedToCompositor = false;
            this.launchCarDist = 0;
            this.launchCarSpeed = 0;
            this.isRaceLoaded = false;
            if (this.launchBitmaps) {
                for (const bmp of this.launchBitmaps) {
                    try { bmp.close(); } catch (_) {}
                }
                this.launchBitmaps = [];
            }
            if (newState === 'GARAGE') {
                this.isAligningToFront = true;
                this.alignStartTime = performance.now();
                let startYaw = this.turntableYaw % (Math.PI * 2);
                if (startYaw > Math.PI) startYaw -= Math.PI * 2;
                if (startYaw < -Math.PI) startYaw += Math.PI * 2;
                this.alignStartYaw = startYaw;
                this.turntableYaw = startYaw;
                this.alignStartPitch = (this.turntablePitch !== 0) ? this.turntablePitch : 0.12;
                this.alignStartRoll = this.turntableRoll || 0;
                this._updateGarageElevation();
                document.body.style.cursor = 'wait';
                const hintEl = document.querySelector('.garage-center-hint span');
                if (hintEl) hintEl.textContent = '🧭 Aligning to forward heading...';
            } else if (this.garageVehicleRoot) {
                this.garageVehicleRoot.position.set(0, this.garageVehicleElevation || 0, 0);
            }
        }
    }

    _initiateGarageLaunch() {
        this.audio.ensureContext();
        this.audio.playChime('checkpoint');

        this.state = 'GARAGE_LAUNCH';
        this.launchStartTime = performance.now();
        this.launchCarSpeed = 0;
        this.launchCarDist = 0;
        this.hasSwappedToCompositor = false;
        this.isCapturingFrames = true;
        this.lastCaptureTime = 0;
        this.pingPongActive = false;
        this.isRaceLoaded = false;

        // Clean up previous frame buffers
        if (this.launchBitmaps) {
            for (const bmp of this.launchBitmaps) {
                try { bmp.close(); } catch (_) {}
            }
        }
        this.launchBitmaps = [];

        const garageView = document.getElementById('garage-view');
        if (garageView) garageView.style.display = 'none';

        // 1. Hide stationary platform pedestal, orientation ring & forward guide
        if (this.garagePlatform) this.garagePlatform.visible = false;
        if (this.garageRing) this.garageRing.visible = false;
        if (this.garageFwdGroup) this.garageFwdGroup.visible = false;

        // Shadow is placed directly on the grid mesh underneath the vehicle
        if (this.garageDisplayShadow) {
            this.garageDisplayShadow.visible = true;
            this.garageDisplayShadow.position.set(0, -0.15, 0);
            this.garageDisplayShadow.rotation.set(0, this.turntableYaw, 0);
        }

        // 2. Ensure vehicle, synthwave grid runway and sun are visible
        this._updateGarageElevation();
        const carElev = this.garageVehicleElevation || 0;
        if (this.garageVehicleRoot) {
            this.garageVehicleRoot.position.set(0, carElev, 0);
            this.garageVehicleRoot.rotation.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
            this.garageVehicleRoot.visible = true;
        }

        // Camera is locked directly behind the vehicle in exact chase camera alignment
        this.camera.position.set(0, carElev + 2.5, 6.2);
        this.camera.lookAt(0, carElev + 0.8, -3.0);
        this.camera.fov = 65;
        this.camera.updateProjectionMatrix();

        if (this.garageGridMesh) {
            this.garageGridMesh.visible = true;
            this.garageGridMesh.position.set(0, -0.16, 0);
            if (this.garageGridMat) {
                this.garageGridMat.uniforms.uOpacity.value = 1.0;
                this.garageGridMat.uniforms.uSpeed.value = 0.0;
                this.garageGridMat.uniforms.uCenter.value.set(0, 0);
            }
        }
        if (this.garageSunMesh) {
            this.garageSunMesh.visible = true;
            this.garageSunMesh.position.set(0, 24, -160);
            if (this.garageSunMat) {
                this.garageSunMat.uniforms.uOpacity.value = 1.0;
            }
        }

        // 3. Reset and prepare compositor overlay and progress bar
        const overlay = document.getElementById('launch-compositor-overlay');
        if (overlay) {
            overlay.getAnimations().forEach(a => a.cancel());
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
            overlay.classList.remove('dissolve-out');
        }
        const compCanvas = document.getElementById('compositor-canvas');
        if (compCanvas) {
            compCanvas.style.display = 'none';
        }
        this._updateLoadingProgress(0, 'WARP DRIVE CHARGING...');
    }

    _startPingPongPlayback() {
        if (this.hasSwappedToCompositor) return;
        const overlay = document.getElementById('launch-compositor-overlay');
        const compCanvas = document.getElementById('compositor-canvas');
        const bgLoop = document.getElementById('compositor-bg-loop');
        const vContainer = document.getElementById('compositor-vehicle-container');
        const videoEl = document.getElementById('compositor-video-loop');

        if (videoEl) videoEl.style.display = 'none';
        if (bgLoop) bgLoop.style.display = 'none';
        if (vContainer) vContainer.style.display = 'none';

        if (compCanvas && this.launchBitmaps && this.launchBitmaps.length >= 2) {
            compCanvas.width = window.innerWidth;
            compCanvas.height = window.innerHeight;
            compCanvas.style.display = 'block';

            const ctx = compCanvas.getContext('2d');
            this.compFrameIdx = 0;
            this.compFrameDir = 1;
            this.pingPongActive = true;
            let lastTick = performance.now();

            const tick = (timestamp) => {
                if (!this.pingPongActive) return;
                // Render at smooth ~30 fps (every ~33ms)
                if (timestamp - lastTick >= 33) {
                    lastTick = timestamp;
                    const frame = this.launchBitmaps[this.compFrameIdx];
                    if (frame) {
                        ctx.drawImage(frame, 0, 0, compCanvas.width, compCanvas.height);
                    }
                    this.compFrameIdx += this.compFrameDir;
                    // Ping-pong forward then backward seamlessly!
                    if (this.compFrameIdx >= this.launchBitmaps.length - 1) {
                        this.compFrameIdx = this.launchBitmaps.length - 1;
                        this.compFrameDir = -1; // Smoothly play backward!
                    } else if (this.compFrameIdx <= 0) {
                        this.compFrameIdx = 0;
                        this.compFrameDir = 1;  // Smoothly play forward!
                    }
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);

            // Save first captured frame to sessionStorage as .webp if supported
            try {
                const offscreen = document.createElement('canvas');
                offscreen.width = 480;
                offscreen.height = Math.round(480 * (window.innerHeight / window.innerWidth));
                const octx = offscreen.getContext('2d');
                if (octx && this.launchBitmaps[0]) {
                    octx.drawImage(this.launchBitmaps[0], 0, 0, offscreen.width, offscreen.height);
                    const webpData = offscreen.toDataURL('image/webp', 0.85);
                    sessionStorage.setItem('model3d_cyber_loop', webpData);
                }
            } catch (_) {}

            if (overlay) {
                overlay.getAnimations().forEach(a => a.cancel());
                overlay.style.display = 'block';
                overlay.style.opacity = '1';
                overlay.classList.remove('dissolve-out');
            }

            this.hasSwappedToCompositor = true;
            this.isRaceLoaded = false;
            this._updateLoadingProgress(8, '⚡ INITIALIZING HYPERSPACE DRIVE...');

            // AND ONLY THEN: World actually starts loading in the background under the overlay!
            this._startSteppedLoading();
        } else {
            this._fallbackCompositorSwap();
        }
    }

    _fallbackCompositorSwap() {
        if (this.hasSwappedToCompositor) return;
        this.hasSwappedToCompositor = true;

        // Isolate vehicle for snapshot
        if (this.garageGridMesh) this.garageGridMesh.visible = false;
        if (this.garageSunMesh) this.garageSunMesh.visible = false;
        const prevBg = this.garageScene.background;
        const prevFog = this.garageScene.fog;
        this.garageScene.background = null;
        this.garageScene.fog = null;

        const prevClearColor = new THREE.Color();
        this.renderer.getClearColor(prevClearColor);
        const prevClearAlpha = this.renderer.getClearAlpha();
        this.renderer.setClearColor(0x000000, 0.0);

        this.renderer.render(this.garageScene, this.camera);
        const snapshotUrl = this.renderer.domElement.toDataURL('image/png');

        this.renderer.setClearColor(prevClearColor, prevClearAlpha);
        this.garageScene.background = prevBg;
        this.garageScene.fog = prevFog;
        if (this.garageGridMesh) this.garageGridMesh.visible = true;
        if (this.garageSunMesh) this.garageSunMesh.visible = true;

        const vImg = document.getElementById('compositor-vehicle-img');
        if (vImg) vImg.src = snapshotUrl;

        const videoEl = document.getElementById('compositor-video-loop');
        const bgLoop = document.getElementById('compositor-bg-loop');
        const vContainer = document.getElementById('compositor-vehicle-container');
        if (videoEl) videoEl.style.display = 'none';
        if (bgLoop) bgLoop.style.display = 'block';
        if (vContainer) vContainer.style.display = 'block';

        const overlay = document.getElementById('launch-compositor-overlay');
        if (overlay) {
            overlay.getAnimations().forEach(a => a.cancel());
            overlay.classList.remove('dissolve-out');
            overlay.style.display = 'block';
            overlay.style.opacity = '1';
        }

        this.isRaceLoaded = false;
        this._updateLoadingProgress(8, '⚡ INITIALIZING HYPERSPACE DRIVE...');

        // AND ONLY NOW: World starts loading in the background under the overlay!
        this._startSteppedLoading();
    }

    _updateLoadingProgress(percent, taskName) {
        this.loadingTargetProgress = percent;
        const bar = document.getElementById('compositor-loader-bar');
        const pct = document.getElementById('compositor-loader-percent');
        const task = document.getElementById('compositor-loader-task');
        if (bar) bar.style.width = `${percent}%`;
        if (pct) pct.textContent = `${Math.round(percent)}%`;
        if (task && taskName) task.textContent = taskName;
    }

    _startSteppedLoading() {
        const ringLabels = [
            'SYNCHRONIZING INNER DENSE MEADOW (0.16m)...',
            'SYNCHRONIZING FINE MEADOW & WILDFLOWERS...',
            'SYNCHRONIZING MID-RANGE VALLEY FLORA...',
            'SYNCHRONIZING FAR-MID MEADOW RIDGES...',
            'SYNCHRONIZING DISTANT MEADOW RIDGES...',
            'SYNCHRONIZING HORIZON FLORA & RADIAL BLEND...'
        ];

        const steps = [
            // Step 1: Initialize road streamer & procedural spline (14%)
            () => {
                this._updateLoadingProgress(14, 'GENERATING PROCEDURAL SPLINE & RUNWAY...');
                while (this.raceScene.children.length > 0) {
                    this.raceScene.remove(this.raceScene.children[0]);
                }
                this.streamer = new RoadStreamer(this.raceScene, this.mode, this.runSeed);
                this.trackData = this.streamer.getTrackData();
                this.hud.initTrack(this.trackData);
            },
            // Step 2: Build World, sky, sun, ground mesh, trees & props with deferred grass (26%)
            () => {
                this._updateLoadingProgress(26, 'CONSTRUCTING ATMOSPHERIC ENVIRONMENT & TERRAIN...');
                this.world = new WorldView(this.raceScene, this.trackData, this.audio, { deferredGrass: true });
                this.streamer.setSceneryManagers(this.world.trees, this.world.props);
                try {
                    if (this.world.sky) this.renderer.compile(this.world.sky, this.camera);
                    if (this.world.groundMesh) this.renderer.compile(this.world.groundMesh, this.camera);
                } catch (_) {}
            }
        ];

        // Dynamic Grass Ring Build Steps (All 6 rings: 0 to 5)
        const ringCount = 6;
        for (let r = 0; r < ringCount; r++) {
            const ringPct = 26 + Math.round(((r + 1) / ringCount) * 58); // Progress from 26% to 84%
            const taskLabel = ringLabels[r] || `SYNCHRONIZING GRASS RING ${r + 1}...`;
            steps.push(() => {
                this._updateLoadingProgress(ringPct, taskLabel);
                if (this.world && this.world.grass) {
                    this.world.grass.buildRing(r);
                    try {
                        if (this.world.grass.rings && this.world.grass.rings[r] && this.world.grass.rings[r].mesh) {
                            this.renderer.compile(this.world.grass.rings[r].mesh, this.camera);
                        }
                    } catch (_) {}
                }
            });
        }

        // Arm player vehicle with unified modelGroup rotation and AI rivals (92%)
        steps.push(() => {
            this._updateLoadingProgress(92, 'BAKING VEHICLE ORIENTATION & ARMING RIVALS...');
            const mat = ModelLoader.createMaterial(this.selectedColor, this.selectedPattern);
            this.player = new Vehicle(
                this.raceScene,
                this.currentGeometry.clone(),
                mat,
                { ...this.currentStats },
                true,
                'Player',
                this.garageEuler,
                this.currentGeometry
            );
            this.player.boostLeft = 3.0;
            this.player.teleport(this.trackData.spawn.position, this.trackData.spawn.direction);
            this.player.speed = 34.0;

            this.rivals = new RivalManager(this.raceScene, this.trackData, 5);
            this.streamer.setRivalsManager(this.rivals);
            this.streamer.setPlayer(this.player);

            try {
                if (this.player.root) this.renderer.compile(this.player.root, this.camera);
            } catch (_) {}
        });

        // 100% loaded: Shaders are already compiled incrementally, zero freeze!
        steps.push(() => {
            this._updateLoadingProgress(100, 'WARP DRIVE ENGAGED - READY!');
            this.isRaceLoaded = true;

            // Brief pause at 100% full bar before seamless dissolve into race
            setTimeout(() => {
                if (this.state === 'GARAGE_LAUNCH') {
                    this._finalizeRaceLaunch();
                }
            }, 220);
        });

        let stepIndex = 0;
        const executeNextStep = () => {
            if (this.state !== 'GARAGE_LAUNCH') return;
            if (stepIndex < steps.length) {
                try {
                    steps[stepIndex]();
                } catch (err) {
                    console.error(`Stepped Loading Error (Step ${stepIndex + 1}):`, err);
                }
                stepIndex++;
                // Double rAF yield: lets ping-pong canvas and progress bar paint buttery-smooth without any thread blocking
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (this.state === 'GARAGE_LAUNCH') {
                            executeNextStep();
                        }
                    });
                });
            }
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (this.state === 'GARAGE_LAUNCH') {
                    executeNextStep();
                }
            });
        });
    }

    _finalizeRaceLaunch() {
        this.state = 'RACE';
        this.hud.show();

        // Flush clock delta to prevent initial physics step jump
        this.clock.getDelta();
        this.audio.playChime('boost');

        if (this.garageDisplayShadow) {
            this.garageDisplayShadow.visible = false;
        }

        if (this.garageVehicleRoot) {
            this.garageVehicleRoot.position.set(0, 0, 0);
            this.garageVehicleRoot.visible = true;
        }

        // Restore garageScene defaults for future garage visits
        this.garageScene.background = new THREE.Color(0x0a0515);
        this.garageScene.fog = new THREE.FogExp2(0x0a0515, 0.007);
        if (this.garagePlatform) this.garagePlatform.visible = true;
        if (this.garageRing) this.garageRing.visible = true;
        if (this.garageFwdGroup) this.garageFwdGroup.visible = true;
        if (this.garageGridMesh) this.garageGridMesh.position.set(0, -0.16, 0);
        if (this.garageSunMesh) this.garageSunMesh.position.set(0, 24, -160);
        if (this.garageGridMat) this.garageGridMat.uniforms.uSpeed.value = 0.0;

        if (!this.player) {
            this._startRace();
        } else {
            this.player.boostLeft = 3.0;
            this.player.speed = 34.0;
            if (this.trackData) {
                const ground = this.player._sampleTrackGround(this.player.position, this.trackData);
                if (ground) {
                    this.player.position.y = ground.y + 0.65;
                    this.player.root.position.copy(this.player.position);
                }
            }
            // Align camera precisely behind vehicle spawn
            const pPos = this.player.position;
            this.camera.position.set(pPos.x, pPos.y + 2.5, pPos.z + 6.2);
            this.camera.lookAt(pPos.x, pPos.y + 0.8, pPos.z - 3.0);
            this.camera.fov = 65;
            this.camera.updateProjectionMatrix();
        }

        this.elapsedTime = 0;
        this.topSpeedReached = Math.round((this.player ? this.player.speed : 34) * 3.6);
        this.totalDistanceDriven = 0;
        this.raceFinished = false;
        this.playerLevel = 1;
        this.playerXp = 0;
        this.activeUpgrades = [];
        this.isRaceLoaded = false;
        this.perfBenchmarkSamples = [];
        this.perfBenchmarkDone = false;

        // Render live race scene underneath so it is immediately visible as overlay dissolves
        this.renderer.render(this.raceScene, this.camera);

        // Manual rAF-driven crossfade: fade overlay opacity 1→0 over 850ms
        // This replaces the Web Animations API approach which was silently failing
        const overlay = document.getElementById('launch-compositor-overlay');
        if (overlay) {
            overlay.style.pointerEvents = 'none';
            overlay.getAnimations().forEach(a => a.cancel());
            const fadeStart = performance.now();
            const fadeDuration = 850;

            const fadeStep = () => {
                if (this.state !== 'RACE') return; // Aborted (user pressed Escape)
                const progress = Math.min(1.0, (performance.now() - fadeStart) / fadeDuration);
                // Cubic ease-out for smooth deceleration
                const eased = 1.0 - Math.pow(1.0 - progress, 3);
                overlay.style.opacity = String(1.0 - eased);

                if (progress < 1.0) {
                    requestAnimationFrame(fadeStep);
                } else {
                    // Fade complete — clean up everything
                    overlay.style.display = 'none';
                    overlay.style.opacity = '1';
                    overlay.style.pointerEvents = 'auto';
                    overlay.classList.remove('dissolve-out');
                    this.pingPongActive = false;
                    if (this.launchBitmaps) {
                        for (const bmp of this.launchBitmaps) {
                            try { bmp.close(); } catch (_) {}
                        }
                        this.launchBitmaps = [];
                    }
                    const videoEl = document.getElementById('compositor-video-loop');
                    if (videoEl) {
                        videoEl.pause();
                        videoEl.src = '';
                    }
                }
            };
            requestAnimationFrame(fadeStep);
        }
    }

    _completePerfBenchmark() {
        this.perfBenchmarkDone = true;
        const samples = this.perfBenchmarkSamples;
        if (!samples || samples.length === 0) return;

        const fpsValues = samples.map(d => 1.0 / Math.max(0.001, d)).sort((a, b) => a - b);
        const sumFps = fpsValues.reduce((acc, v) => acc + v, 0);
        const avgFps = sumFps / fpsValues.length;
        const p1Idx = Math.max(0, Math.floor(fpsValues.length * 0.01));
        const fps1Low = fpsValues[p1Idx];
        const minFps = fpsValues[0];

        let gpuName = 'Standard WebGL';
        try {
            const gl = this.renderer.getContext();
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        } catch (_) {}

        let recommendedCellScale = 1.0;
        if (avgFps < 45 || fps1Low < 25) {
            recommendedCellScale = 1.45; // Sparser tufts to recover ~60 FPS on weak iGPUs
        } else if (avgFps < 58 || fps1Low < 35) {
            recommendedCellScale = 1.20;
        } else {
            recommendedCellScale = 1.0; // Keep crisp 0.16
        }

        const perfProfile = {
            avgFps: Math.round(avgFps * 10) / 10,
            fps1Low: Math.round(fps1Low * 10) / 10,
            minFps: Math.round(minFps * 10) / 10,
            gpu: gpuName,
            samplesCount: samples.length,
            baseCellSize: 0.16,
            recommendedCellScale,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            deviceMemory: navigator.deviceMemory || 'unknown',
            timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem('model3d_racing_perf_profile', JSON.stringify(perfProfile));
            console.log('🏁 [Racing Benchmark Complete] Performance profile saved to localStorage:', perfProfile);
        } catch (_) {}
    }

    _startRace() {
        this.elapsedTime = 0;
        this.topSpeedReached = 0;
        this.totalDistanceDriven = 0;
        this.raceFinished = false;
        this.playerLevel = 1;
        this.playerXp = 0;
        this.activeUpgrades = [];

        // Clear and prepare race scene
        while (this.raceScene.children.length > 0) {
            this.raceScene.remove(this.raceScene.children[0]);
        }

        // Initialize Dynamic Road Streamer for Endless Driving
        this.streamer = new RoadStreamer(this.raceScene, this.mode, this.runSeed);
        this.trackData = this.streamer.getTrackData();
        this.hud.initTrack(this.trackData);

        // Initialize Scenery & Day-Night cycle
        this.world = new WorldView(this.raceScene, this.trackData, this.audio);
        this.streamer.setSceneryManagers(this.world.trees, this.world.props);

        // Bake chosen garage facing/orientation into player vehicle geometry
        // Player Vehicle Physics (Unified Vehicle class with synchronized modelGroup rotation)
        const mat = ModelLoader.createMaterial(this.selectedColor, this.selectedPattern);
        this.player = new Vehicle(
            this.raceScene,
            this.currentGeometry.clone(),
            mat,
            { ...this.currentStats },
            true,
            'Player',
            this.garageEuler,
            this.currentGeometry
        );
        this.player.boostLeft = 3.0; // 3 seconds boost
        this.player.teleport(this.trackData.spawn.position, this.trackData.spawn.direction);

        // Multi-lane aerodynamic Rivals
        this.rivals = new RivalManager(this.raceScene, this.trackData, 5);
        this.streamer.setRivalsManager(this.rivals);
        this.streamer.setPlayer(this.player);
    }

    _respawnPlayer() {
        if (!this.player || !this.trackData) return;
        // Find nearest checkpoint
        const { points, tangents } = this.trackData;
        let bestDist = Infinity;
        let bestIndex = 1;
        for (let i = 0; i < points.length; i++) {
            const d = this.player.position.distanceTo(points[i]);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        const respawnPos = points[bestIndex].clone().add(new THREE.Vector3(0, 1.4, 0));
        this.player.teleport(respawnPos, tangents[bestIndex]);
    }

    _teardownRace() {
        if (this.streamer) {
            this.streamer.destroy();
            this.streamer = null;
        }
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }
        if (this.rivals) {
            this.rivals.destroy();
            this.rivals = null;
        }
        this.world = null;
        this.trackData = null;
        this.isRacePreloaded = false;
        this.isRacePreloading = false;
        this.isRaceLoaded = false;
    }

    _handleRaceInput() {
        if (!this.player) return;

        let throttle = 0;
        let brake = 0;
        let steer = 0;
        let boost = false;
        let drift = false;

        // Keyboard mappings
        if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) brake += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1;
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) boost = true;
        if (this.keys['Space']) drift = true;

        // Gamepad API
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (gamepads && gamepads[0]) {
            const gp = gamepads[0];
            if (Math.abs(gp.axes[0]) > 0.15) steer -= gp.axes[0];
            if (gp.buttons[7] && gp.buttons[7].value > 0.1) throttle = gp.buttons[7].value; // RT
            if (gp.buttons[6] && gp.buttons[6].value > 0.1) brake = gp.buttons[6].value; // LT
            if (gp.buttons[0] && gp.buttons[0].pressed) boost = true; // A button
            if (gp.buttons[2] && gp.buttons[2].pressed) drift = true; // X button
        }

        this.player.inputs.throttle = throttle;
        this.player.inputs.brake = brake;
        this.player.inputs.steer = steer;
        this.player.inputs.boost = boost;
        this.player.inputs.drift = drift;
    }

    _updateCamera(delta) {
        if (this.state === 'GARAGE' || this.state === 'MENU') {
            // Stationary front-quarter inspection camera
            this.camera.position.set(0, 1.85, 5.0);
            this.camera.lookAt(0, 0.35, 0);
            return;
        }

        if (this.state === 'RACE' && this.player) {
            // Chase camera behind vehicle
            const pPos = this.player.position;
            const heading = this.player.heading;

            const chaseDist = this.player.ascended ? 14.0 : 6.2;
            const chaseHeight = this.player.ascended ? 5.5 : 2.5;

            const idealCamX = pPos.x + Math.sin(heading) * chaseDist;
            const idealCamY = pPos.y + chaseHeight;
            const idealCamZ = pPos.z + Math.cos(heading) * chaseDist;

            const lerpSpeed = this.player.ascended ? 2.5 : 7.5;
            this.camera.position.lerp(new THREE.Vector3(idealCamX, idealCamY, idealCamZ), delta * lerpSpeed);

            // Dynamic speed-based FOV punch + boost kickback
            const isBoosting = this.player.inputs.boost && this.player.boostLeft > 0;
            const speedRatio = Math.min(this.player.speed / this.player.stats.top_speed, 1.5);
            const targetFov = 65 + speedRatio * 14 + (isBoosting ? 12 : 0);
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * (isBoosting ? 9.0 : 5.0));
            this.camera.updateProjectionMatrix();

            // High-speed boost camera shake
            if (isBoosting) {
                this.camera.position.x += (Math.random() - 0.5) * 0.08;
                this.camera.position.y += (Math.random() - 0.5) * 0.08;
            }

            const lookTarget = pPos.clone().add(new THREE.Vector3(-Math.sin(heading) * 3, 0.8, -Math.cos(heading) * 3));
            this.camera.lookAt(lookTarget);
        }
    }

    _checkRaceProgression(delta) {
        if (!this.player || !this.trackData || this.raceFinished) return;

        this.elapsedTime += delta;
        const curSpeedKmh = Math.abs(this.player.speed * 3.6);
        if (curSpeedKmh > this.topSpeedReached) this.topSpeedReached = curSpeedKmh;

        if (this.player) {
            this.totalDistanceDriven += Math.abs(this.player.speed) * delta;
        }
        const pts = this.trackData.points;

        // Dynamic progress calculation along streaming window
        let closestIndex = 0;
        let minDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
            const d = this.player.position.distanceTo(pts[i]);
            if (d < minDist) {
                minDist = d;
                closestIndex = i;
            }
        }
        const progress = (this.totalDistanceDriven % 3000.0) / 3000.0;

        // Roguelite XP accumulation
        if (this.mode === 'roguelite') {
            this.playerXp += Math.abs(this.player.speed) * delta * 1.5;
            if (this.player.isDrifting) {
                this.playerXp += delta * 15.0;
            }
            if (this.playerXp >= this.nextLevelXp) {
                this._triggerLevelUp();
            }
        }

        // Rank calculation
        let rank = 1;
        if (this.rivals) {
            for (const r of this.rivals.rivals) {
                if (r.pathIndex > closestIndex) rank++;
            }
        }

        // Check Ascension Trigger
        if (this.player.ascended && this.elapsedTime > 2.0 && !this.raceFinished) {
            this._endRace(true, rank);
            return;
        }

        // Update HUD
        const rivalPositions = this.rivals ? this.rivals.rivals.map(r => r.vehicle.position) : [];
        this.hud.update({
            speed: this.player.speed,
            maxSpeed: this.player.stats.top_speed,
            boostLeft: this.player.boostLeft,
            boostMax: this.player.maxBoost || 3.0,
            progress,
            distanceDriven: this.totalDistanceDriven,
            elapsedTime: this.elapsedTime,
            rank,
            totalRacers: 6,
            canAscend: this.player.stats.can_ascend,
            isAscended: this.player.ascended,
            playerPos: this.player.position,
            rivalPositions,
            trackPoints: pts,
            fps: this.currentFps
        });

        // Update Procedural Sound
        this.audio.update(
            this.player.speed,
            this.player.stats.top_speed,
            this.player.inputs.throttle,
            this.player.inputs.boost && this.player.boostLeft > 0,
            this.player.isDrifting
        );
    }

    _triggerLevelUp() {
        this.playerLevel++;
        this.playerXp = 0;
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.4);
        this.audio.playChime('levelup');

        // Offer 3 roguelite upgrades
        const availableUpgrades = [
            { id: 'nitro', icon: '🔥', title: 'Nitrous Thruster', detail: '+1.5s Boost duration & faster recharge', apply: () => { this.player.maxBoost = (this.player.maxBoost || 3.0) + 1.5; this.player.boostLeft = this.player.maxBoost; this.player.boostRechargeRate = (this.player.boostRechargeRate || 0.65) + 0.25; } },
            { id: 'top_speed', icon: '⚡', title: 'Supercharged Turbos', detail: '+12% Maximum velocity', apply: () => { this.player.stats.top_speed *= 1.12; } },
            { id: 'handling', icon: '🌀', title: 'Aero Downforce Fins', detail: '+25% Cornering grip & drift stability', apply: () => { this.player.stats.grip *= 1.25; this.player.stats.yaw *= 1.15; } },
            { id: 'lighten', icon: '🪶', title: 'Carbon Matrix Frame', detail: '-20% Mass for higher acceleration & easier Star Ascension', apply: () => {
                this.player.stats.mass = Math.max(0.4, this.player.stats.mass * 0.8);
                this.player.stats.accel *= 1.2;
                this.player.stats.can_ascend = ((this.player.stats.top_speed ** 2) / this.player.stats.mass) >= VehicleStats.LAUNCH_ENERGY;
            }}
        ];

        // Shuffle & pick 3
        const choices = availableUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3);
        this.hud.showUpgradeModal(choices, (selected) => {
            selected.apply();
        });
    }

    _endRace(ascended, rank) {
        this.raceFinished = true;
        this.audio.playChime(ascended ? 'ascend' : 'checkpoint');

        const mins = Math.floor(this.elapsedTime / 60);
        const secs = Math.floor(this.elapsedTime % 60);
        const ms = Math.floor((this.elapsedTime % 1) * 100);
        const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

        const launchEnergy = (this.topSpeedReached / 3.6) ** 2 / this.player.stats.mass;

        this.hud.showFinishModal(
            {
                ascended,
                rank,
                time: timeFormatted,
                topSpeed: Math.round(this.topSpeedReached),
                driftScore: this.player.driftScore,
                mass: this.player.stats.mass,
                launchEnergy
            },
            () => { // Retry
                this._startRace();
            },
            () => { // Garage
                this.switchState('GARAGE');
            }
        );
    }

    _loop() {
        if (this._hasCrashed) return;

        try {
            const delta = Math.min(this.clock.getDelta(), 0.1);
            const rawFps = 1.0 / Math.max(0.001, delta);
            this.currentFps = THREE.MathUtils.lerp(this.currentFps || 60, rawFps, 0.08);

            if (this.state === 'RACE') {
                this._handleRaceInput();
                if (this.streamer && this.player) {
                    this.trackData = this.streamer.update(this.player.position, delta);
                }
                if (this.player) this.player.update(delta, this.trackData);
                if (this.rivals) {
                    this.rivals.trackData = this.trackData;
                    this.rivals.update(delta, this.player ? this.player.position : null, this.camera);
                }
                const playerPos = (this.player && this.player.position) ? this.player.position : this.camera.position;
                const vehiclePositions = [];
                if (this.player && this.player.position) vehiclePositions.push(this.player.position);
                if (this.rivals && this.rivals.rivals) {
                    for (const r of this.rivals.rivals) {
                        if (r.vehicle && r.vehicle.position) vehiclePositions.push(r.vehicle.position);
                    }
                }
                if (this.world) this.world.update(delta, this.camera.position, playerPos, vehiclePositions);
                this._checkRaceProgression(delta);
                this._updateCamera(delta);

                // Background performance benchmark during active driving
                if (this.elapsedTime > 3.0 && !this.perfBenchmarkDone) {
                    this.perfBenchmarkSamples.push(delta);
                    if (this.perfBenchmarkSamples.length >= 240) {
                        this._completePerfBenchmark();
                    }
                }

                this.renderer.render(this.raceScene, this.camera);
            } else if (this.state === 'GARAGE_LAUNCH') {
                const elapsed = (performance.now() - this.launchStartTime) / 1000.0;
                const nowSec = performance.now() * 0.001;

                if (this.garageSunMat) {
                    this.garageSunMat.uniforms.uTime.value = nowSec;
                    this.garageSunMat.uniforms.uGlitch.value = Math.sin(nowSec * 3.0) > 0.96 ? 1.0 : 0.0;
                }
                if (this.garageGridMat) {
                    this.garageGridMat.uniforms.uTime.value = nowSec;
                    // Grid only scrolls when the vehicle is actually driving forward
                    this.garageGridMat.uniforms.uSpeed.value = this.launchCarSpeed > 0.5 ? 4.0 : 0.0;
                }

                if (!this.hasSwappedToCompositor) {
                    const carElev = this.garageVehicleElevation || 0;

                    // Accelerate smoothly forward away from platform (0 to 50 m/s), driving forever forward!
                    this.launchCarSpeed = Math.min(this.launchCarSpeed + delta * 45.0, 50.0);
                    this.launchCarDist += this.launchCarSpeed * delta;

                    if (this.garageVehicleRoot) {
                        this.garageVehicleRoot.position.set(0, carElev, -this.launchCarDist);
                        this.garageVehicleRoot.rotation.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
                    }

                    if (this.garageDisplayShadow) {
                        this.garageDisplayShadow.visible = true;
                        this.garageDisplayShadow.position.set(0, -0.15, -this.launchCarDist);
                        this.garageDisplayShadow.rotation.set(0, this.turntableYaw, 0);
                    }

                    // Rigidly lock chase camera behind vehicle — ZERO jumping, ZERO jerking!
                    this.camera.position.set(0, carElev + 2.5, -this.launchCarDist + 6.2);
                    this.camera.lookAt(0, carElev + 0.8, -this.launchCarDist - 3.0);
                    this.camera.fov = 65;
                    this.camera.updateProjectionMatrix();

                    // Move grid center with vehicle so runway is infinite
                    if (this.garageGridMat) {
                        this.garageGridMat.uniforms.uCenter.value.set(0, -this.launchCarDist);
                    }
                    if (this.garageGridMesh) {
                        this.garageGridMesh.position.z = -this.launchCarDist;
                    }
                    if (this.garageSunMesh) {
                        this.garageSunMesh.position.set(0, 24, -this.launchCarDist - 160);
                    }

                    this.renderer.render(this.garageScene, this.camera);

                    // Frame capture window: Starts at 1.0s after takeoff and captures for ~1.0s
                    const now = performance.now();
                    if (elapsed >= 1.0 && elapsed < 2.0 && this.isCapturingFrames) {
                        if (now - this.lastCaptureTime >= 40) {
                            this.lastCaptureTime = now;
                            // Resized to 960x540 for instant, stutter-free GPU readback without frame drops
                            const targetW = Math.min(this.canvas.width, 960);
                            const targetH = Math.round(targetW * (this.canvas.height / Math.max(1, this.canvas.width)));
                            createImageBitmap(this.canvas, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'medium' }).then((bmp) => {
                                if (this.isCapturingFrames && this.launchBitmaps) {
                                    this.launchBitmaps.push(bmp);
                                }
                            }).catch(() => {});
                        }
                    } else if (elapsed >= 2.0 && !this.hasSwappedToCompositor) {
                        this.isCapturingFrames = false;
                        if ((this.launchBitmaps && this.launchBitmaps.length >= 4) || elapsed >= 2.4) {
                            this._startPingPongPlayback();
                        }
                    }
                } else {
                    // Overlay is active; light background render
                    this.renderer.render(this.garageScene, this.camera);
                }
            } else if (this.state === 'GARAGE') {
                const nowSec = performance.now() * 0.001;
                if (this.garageSunMat) {
                    this.garageSunMat.uniforms.uTime.value = nowSec;
                    this.garageSunMat.uniforms.uGlitch.value = Math.sin(nowSec * 3.0) > 0.96 ? 1.0 : 0.0;
                }
                if (this.garageGridMat) {
                    this.garageGridMat.uniforms.uTime.value = nowSec;
                }
                this._updateCamera(delta);
                if (this.isAligningToFront) {
                    const elapsed = (performance.now() - this.alignStartTime) / 1000.0;
                    const duration = 0.65;
                    const t = Math.min(1.0, elapsed / duration);
                    const ease = 1.0 - Math.pow(1.0 - t, 3.0);
                    this.turntableYaw = THREE.MathUtils.lerp(this.alignStartYaw, 0, ease);
                    this.turntablePitch = THREE.MathUtils.lerp(this.alignStartPitch, 0, ease);
                    this.turntableRoll = THREE.MathUtils.lerp(this.alignStartRoll, 0, ease);
                    this._updateGarageElevation();
                    if (t >= 1.0) {
                        this.isAligningToFront = false;
                        this.turntableYaw = 0;
                        this.turntablePitch = 0;
                        this.turntableRoll = 0;
                        this._updateGarageElevation();
                        document.body.style.cursor = 'grab';
                        const hintEl = document.querySelector('.garage-center-hint span');
                        if (hintEl) hintEl.textContent = '🖱️ Click & Drag to Rotate Yaw/Pitch • Shift+Drag to Roll';
                    }
                }
                if (this.garageVehicleRoot) {
                    this.garageVehicleRoot.position.set(0, this.garageVehicleElevation || 0, 0);
                    this.garageVehicleRoot.rotation.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
                }
                if (this.garageDisplayShadow) {
                    this.garageDisplayShadow.position.set(0, -0.015, 0);
                    this.garageDisplayShadow.rotation.set(0, this.turntableYaw, 0);
                }
                this.renderer.render(this.garageScene, this.camera);
            } else if (this.state === 'MENU') {
                const nowSec = performance.now() * 0.001;
                if (this.garageSunMat) {
                    this.garageSunMat.uniforms.uTime.value = nowSec;
                    this.garageSunMat.uniforms.uGlitch.value = Math.sin(nowSec * 3.0) > 0.96 ? 1.0 : 0.0;
                }
                if (this.garageGridMat) {
                    this.garageGridMat.uniforms.uTime.value = nowSec;
                }
                this.turntableYaw += delta * 0.4;
                this._updateCamera(delta);
                if (this.garageVehicleRoot) {
                    this.garageVehicleRoot.position.set(0, this.garageVehicleElevation || 0, 0);
                    this.garageVehicleRoot.rotation.set(0.12, this.turntableYaw, 0, 'YXZ');
                }
                if (this.garageDisplayShadow) {
                    this.garageDisplayShadow.position.set(0, -0.015, 0);
                    this.garageDisplayShadow.rotation.set(0, this.turntableYaw, 0);
                }
                this.renderer.render(this.garageScene, this.camera);
            }
        } catch (err) {
            this._hasCrashed = true;
            console.error('Game loop encountered an error and was safely paused to prevent browser lockup:', err);
            return;
        }

        requestAnimationFrame((t) => this._loop(t));
    }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.game = new GameApp();
});
