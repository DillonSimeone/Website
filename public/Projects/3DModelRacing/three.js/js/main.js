import * as THREE from 'three';
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

        // Input Tracking
        this.keys = {};

        this._setupEventListeners();
        this._buildGarageScene();
        this._initUI();
        this._updateStatsUI();

        // Start render loop
        this.clock = new THREE.Clock();
        requestAnimationFrame((t) => this._loop(t));
    }

    _buildGarageScene() {
        this.garageScene.background = new THREE.Color(0x0f111a);

        // Showroom Lighting
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(5, 8, 5);
        this.garageScene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x4deeea, 1.2);
        fillLight.position.set(-6, 4, -4);
        this.garageScene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xff416c, 1.4);
        rimLight.position.set(0, 5, -8);
        this.garageScene.add(rimLight);

        const ambient = new THREE.AmbientLight(0x22243a, 1.5);
        this.garageScene.add(ambient);

        // Turntable Pedestal
        const platGeom = new THREE.CylinderGeometry(2.4, 2.6, 0.25, 48);
        const platMat = new THREE.MeshStandardMaterial({
            color: 0x161824,
            roughness: 0.2,
            metalness: 0.8
        });
        const platform = new THREE.Mesh(platGeom, platMat);
        platform.position.y = -0.15;
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

        // Dual Xenon Headlights (Front nose cone)
        const hlMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 2.8 });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.15), hlMat);
        hlL.position.set(-0.25, 0.22, -1.25);
        this.garageVehicleRoot.add(hlL);
        const hlR = hlL.clone();
        hlR.position.x = 0.25;
        this.garageVehicleRoot.add(hlR);

        // Dual Red Taillights (Rear deck)
        const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1122, emissive: 0xff1122, emissiveIntensity: 2.8 });
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.12), tlMat);
        tlL.position.set(-0.55, 0.35, 1.35);
        this.garageVehicleRoot.add(tlL);
        const tlR = tlL.clone();
        tlR.position.x = 0.55;
        this.garageVehicleRoot.add(tlR);

        // Display Shadow
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide
        });
        const shadow = new THREE.Mesh(this.currentGeometry.clone(), shadowMat);
        shadow.scale.set(1.0, 0.002, 1.0);
        shadow.position.y = -0.01;
        this.garageVehicleRoot.add(shadow);
    }

    _setupEventListeners() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
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
            if (target && (target.closest('.garage-sidebar') || target.closest('button') || target.closest('input') || target.closest('.color-swatch') || target.closest('.dropzone'))) {
                return;
            }
            this.isDraggingTurntable = true;
            this.isAligningToFront = false;
            this.prevMousePos = { x: clientX, y: clientY };
        };

        window.addEventListener('mousedown', (e) => {
            handleDragStart(e.clientX, e.clientY, e.target);
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDraggingTurntable || this.state !== 'GARAGE') return;
            const dx = e.clientX - this.prevMousePos.x;
            const dy = e.clientY - this.prevMousePos.y;

            if (e.shiftKey) {
                this.turntableRoll += dx * 0.015;
            } else {
                this.turntableYaw += dx * 0.015;
                this.turntablePitch = THREE.MathUtils.clamp(this.turntablePitch + dy * 0.01, -0.6, 0.85);
            }

            this.garageEuler.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
            const oriented = VehicleStats.measureOrientedGeometry(this.currentGeometry, this.garageEuler);
            this.currentStats = oriented.stats;
            this._updateStatsUI();

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
            if (!this.isDraggingTurntable || this.state !== 'GARAGE' || e.touches.length === 0) return;
            const dx = e.touches[0].clientX - this.prevMousePos.x;
            const dy = e.touches[0].clientY - this.prevMousePos.y;
            this.turntableYaw += dx * 0.015;
            this.turntablePitch = THREE.MathUtils.clamp(this.turntablePitch + dy * 0.01, -0.6, 0.85);

            this.garageEuler.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
            const oriented = VehicleStats.measureOrientedGeometry(this.currentGeometry, this.garageEuler);
            this.currentStats = oriented.stats;
            this._updateStatsUI();

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
            this._updateStatsUI();

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
            this.switchState('RACE');
        };

        document.getElementById('garage-menu-btn').onclick = () => {
            this.switchState('MENU');
        };

        document.getElementById('garage-mode-btn').onclick = () => {
            this.mode = this.mode === 'driving' ? 'roguelite' : 'driving';
            document.getElementById('garage-mode-label').textContent = this.mode === 'driving' ? 'ENDLESS DRIVE' : 'ROGUELITE RUN';
        };

        document.getElementById('garage-reset-facing-btn').onclick = () => {
            this.turntableYaw = 0;
            this.turntablePitch = 0;
            this.turntableRoll = 0;
            this.garageEuler.set(0, 0, 0, 'YXZ');
            const oriented = VehicleStats.measureOrientedGeometry(this.currentGeometry, this.garageEuler);
            this.currentStats = oriented.stats;
            this._updateStatsUI();
            if (this.garageVehicleRoot) {
                this.garageVehicleRoot.rotation.set(0, 0, 0, 'YXZ');
            }
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

    switchState(newState) {
        this.state = newState;
        document.getElementById('menu-view').style.display = newState === 'MENU' ? 'flex' : 'none';
        document.getElementById('garage-view').style.display = newState === 'GARAGE' ? 'flex' : 'none';

        if (newState === 'RACE') {
            this.hud.show();
            this._startRace();
        } else {
            this.hud.hide();
            this.audio.silence();
            this._teardownRace();
            if (newState === 'GARAGE') {
                this.isAligningToFront = true;
                this._updateStatsUI();
            }
        }
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
        this.world = new WorldView(this.raceScene, this.trackData);
        this.streamer.setSceneryManagers(this.world.trees, this.world.props);

        // Bake chosen garage facing/orientation into player vehicle geometry
        const bakedGeom = this.currentGeometry.clone();
        const rotMat = new THREE.Matrix4().makeRotationFromEuler(this.garageEuler);
        bakedGeom.applyMatrix4(rotMat);
        bakedGeom.computeVertexNormals();

        // Player Vehicle Physics (Unified Vehicle class)
        const mat = ModelLoader.createMaterial(this.selectedColor, this.selectedPattern);
        this.player = new Vehicle(
            this.raceScene,
            bakedGeom,
            mat,
            { ...this.currentStats },
            true,
            'Player'
        );
        this.player.boostLeft = 3.0; // 3 seconds boost
        this.player.teleport(this.trackData.spawn.position, this.trackData.spawn.direction);

        // Multi-lane aerodynamic Rivals
        this.rivals = new RivalManager(this.raceScene, this.trackData, 5);
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

            // Dynamic speed-based FOV punch
            const speedRatio = Math.min(this.player.speed / this.player.stats.top_speed, 1.5);
            const targetFov = 65 + speedRatio * 15;
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 5.0);
            this.camera.updateProjectionMatrix();

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
            boostMax: 3.0,
            progress,
            distanceDriven: this.totalDistanceDriven,
            elapsedTime: this.elapsedTime,
            rank,
            totalRacers: 6,
            canAscend: this.player.stats.can_ascend,
            isAscended: this.player.ascended,
            playerPos: this.player.position,
            rivalPositions,
            trackPoints: pts
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
            { id: 'nitro', icon: '🔥', title: 'Nitrous Thruster', detail: '+1.5s Boost duration & faster recharge', apply: () => { this.player.boostLeft += 1.5; } },
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

            if (this.state === 'RACE') {
                this._handleRaceInput();
                if (this.streamer && this.player) {
                    this.trackData = this.streamer.update(this.player.position);
                }
                if (this.player) this.player.update(delta, this.trackData);
                if (this.rivals) {
                    this.rivals.trackData = this.trackData;
                    this.rivals.update(delta, this.player ? this.player.position : null);
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
                this.renderer.render(this.raceScene, this.camera);
            } else if (this.state === 'GARAGE') {
                if (this.isAligningToFront) {
                    // Quickly rotate to front (yaw -> 0, pitch -> 0, roll -> 0)
                    this.turntableYaw = THREE.MathUtils.lerp(this.turntableYaw, 0, delta * 9.0);
                    this.turntablePitch = THREE.MathUtils.lerp(this.turntablePitch, 0, delta * 9.0);
                    this.turntableRoll = THREE.MathUtils.lerp(this.turntableRoll, 0, delta * 9.0);
                    if (Math.abs(this.turntableYaw) < 0.005 && Math.abs(this.turntablePitch) < 0.005 && Math.abs(this.turntableRoll) < 0.005) {
                        this.turntableYaw = 0;
                        this.turntablePitch = 0;
                        this.turntableRoll = 0;
                        this.isAligningToFront = false;
                    }
                    this.garageEuler.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
                    const oriented = VehicleStats.measureOrientedGeometry(this.currentGeometry, this.garageEuler);
                    this.currentStats = oriented.stats;
                    this._updateStatsUI();
                }
                this._updateCamera(delta);
                if (this.garageVehicleRoot) {
                    this.garageVehicleRoot.rotation.set(this.turntablePitch, this.turntableYaw, this.turntableRoll, 'YXZ');
                }
                this.renderer.render(this.garageScene, this.camera);
            } else if (this.state === 'MENU') {
                this.turntableYaw += delta * 0.4;
                this._updateCamera(delta);
                if (this.garageVehicleRoot) {
                    this.garageVehicleRoot.rotation.set(0.12, this.turntableYaw, 0, 'YXZ');
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
