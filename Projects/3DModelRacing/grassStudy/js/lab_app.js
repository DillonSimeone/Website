/**
 * grassStudy/js/lab_app.js — Modular Grass Study Lab Application
 *
 * Shares GrassField, PerformanceGovernor, VisualModes, WeatherManager,
 * AudioBeatAnalyser, and raycast ground utilities with the main 3D Racer.
 */
import * as THREE from 'three';
import { getTerrainHeight, getTerrainOffsetForSeed } from '../../shared/terrain.js';
import {
    getVisualMode,
    loadSavedVisualMode,
    saveVisualMode
} from '../../shared/visual_modes.js';
import { AudioBeatAnalyser } from '../../shared/audio_reactive.js';
import { WeatherManager } from '../../shared/weather_gpu.js';
import { GrassField, FLORA_PRESETS } from '../../shared/grass/grass_field.js';
import { PerformanceGovernor, detectHardwareProfile } from '../../shared/grass/perf_governor.js';
import { LabCamera } from './lab_camera.js';
import { LabSimVehicle } from './lab_sim_vehicle.js';
import { LabUI } from './lab_ui.js';

class GrassStudyApp {
    constructor() {
        this.canvas = document.getElementById('lab-canvas');
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        this.hwProfile = detectHardwareProfile(this.renderer);
        this.renderer.setPixelRatio(this.hwProfile.maxDpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0.42, 0.60, 0.82);
        this.scene.fog = new THREE.Fog(0x6b90be, 90, 520);

        this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2500);

        this.ambientLight = new THREE.AmbientLight(0xb0c4de, 0.85);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.55);
        this.sunLight.position.set(40, 65, 25);
        this.scene.add(this.sunLight);

        // Terrain & Visual Mode state
        this.terrainSeed = 0;
        this.terrainRelief = 1.0;
        this.terrainOffset = { x: 0, z: 0 };
        this.terrainMesh = null;
        this.currentRingIdx = 0;
        this.currentVisualModeId = loadSavedVisualMode();
        this.timeMorphEnabled = false;
        this.timeMorphPalette = 0;
        this.timeMorphSpeed = 25;
        this.timeMorphTimer = 0;

        // Subsystems
        this.audioBeat = new AudioBeatAnalyser();
        this.weather = new WeatherManager(this.scene, { autoCycle: false, particleCount: 2800 });
        this.weather.setManualOverrides({
            rainIntensity: 0.0,
            windSpeed: 1.2,
            cloudShadowIntensity: 0.45,
            stormDarkness: 0.0
        });

        this.grass = new GrassField(this.scene, null, null, null, {
            deferred: true,
            hardwareProfile: this.hwProfile,
            coordMode: 1
        });

        this.perfGovernor = new PerformanceGovernor({
            renderer: this.renderer,
            grassField: this.grass,
            hardwareProfile: this.hwProfile,
            targetFps: 60
        });

        this.labCamera = new LabCamera({
            canvas: this.canvas,
            camera: this.camera,
            getTerrainMesh: () => this.terrainMesh,
            getTerrainState: () => ({
                relief: this.terrainRelief,
                offsetX: this.terrainOffset.x,
                offsetZ: this.terrainOffset.z
            }),
            onFreeCamera: () => this.ui?.setFollowChecked(false)
        });

        this.simVehicle = new LabSimVehicle(
            this.scene,
            () => this.terrainMesh,
            () => ({
                relief: this.terrainRelief,
                offsetX: this.terrainOffset.x,
                offsetZ: this.terrainOffset.z
            })
        );

        this.ui = new LabUI({
            onVisualModeChange: (id) => this.applyVisualMode(id, true),
            onPerfModeChange: (mode) => {
                this.perfGovernor.setMode(mode, true);
                this.ui.showToast(`⚡ Performance: ${mode.toUpperCase()}`);
            },
            onToggleSimPlayer: () => this._toggleSimPlayer(),
            onFollowToggle: (checked) => {
                this.labCamera.setFollowPlayer(checked, this.simVehicle.active ? this.simVehicle.position : null);
            },
            onRandomizeTerrain: () => this._randomizeTerrain(),
            onResetCamera: () => {
                this.labCamera.resetCamera(this.simVehicle.active ? this.simVehicle.position : null);
                this.ui.showToast('🎥 Camera grounded above terrain');
            },
            onCopyJson: () => this._copyJson(),
            onSaveConfig: () => this._saveConfigToServer(),
            onCapture: () => this._captureFrame(),
            onSpeciesPresetChange: (key) => this._applySpeciesPreset(key),
            onFloraPresetChange: (key) => this._applyFloraPreset(key),
            onViewModeChange: (mode) => {
                this.grass.setViewMode(mode, this.currentRingIdx);
            },
            onCoordModeChange: (val) => {
                const isMod = val === 'GAME_MODULO';
                this.grass.setCoordMode(isMod ? 1 : 0);
                this.ui.showToast(isMod ? '🎮 Game Modulo Mode' : '🌍 Static World Meadow Mode');
            },
            onRingSelectChange: (idx) => {
                this.currentRingIdx = idx;
                this.ui.loadConfigToUi(this.currentRingIdx, this.grass.config, { terrainRelief: this.terrainRelief });
                if (this.grass.viewMode === 'SINGLE') {
                    this.grass.setViewMode('SINGLE', this.currentRingIdx);
                }
            },
            onShadingFxChange: (fx) => {
                this.grass.setShadingFx(fx);
                if (fx === 4) {
                    this._activateAudioReactive();
                } else {
                    this._deactivateAudioReactive();
                }
            },
            onToggleBeat: () => {
                if (this.audioBeat.isPlaying) {
                    this.audioBeat.stopBeat();
                    this.ui.setBeatButtonState(false);
                } else {
                    const ok = this.audioBeat.startBeat();
                    this.ui.setBeatButtonState(ok);
                    this.ui.setMicButtonState(false);
                }
            },
            onToggleMic: async () => {
                if (this.audioBeat.isMic) {
                    this.audioBeat.stopMic();
                    this.ui.setMicButtonState(false);
                } else {
                    const ok = await this.audioBeat.startMic();
                    this.ui.setMicButtonState(ok);
                    this.ui.setBeatButtonState(false);
                    this.ui.showToast(ok ? '🎤 Microphone active' : '❌ Microphone denied', ok);
                }
            },
            onAudioSensitivity: (v) => this.audioBeat.setSensitivity(v),
            onTimeMorphToggle: (enabled) => {
                this.timeMorphEnabled = enabled;
                if (!enabled) this._syncLiveColorsFromUi();
            },
            onTimeMorphPalette: (p) => { this.timeMorphPalette = p; },
            onTimeMorphSpeed: (s) => { this.timeMorphSpeed = Math.max(5, s || 25); },
            onWeatherChange: (w) => {
                this.weather.setManualOverrides({
                    rainIntensity: w.rainEnabled ? w.rainIntensity : 0.0,
                    windSpeed: w.windSpeed,
                    cloudShadowIntensity: w.cloudShadowIntensity,
                    stormDarkness: w.rainEnabled ? w.rainIntensity * 0.45 : 0.0
                });
            },
            onLiveColorChange: () => this._syncLiveColorsFromUi(),
            onLiveUniformChange: (id, value) => this._handleLiveUniformChange(id, value),
            onStructuralChange: () => this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config),
            onRebuildGrass: () => {
                this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config);
                this.grass.buildAllRings();
                this.perfGovernor.applyImmediate();
                this.ui.dumpConfig(this.grass.config);
            }
        });

        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.currentFps = 60;

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this._boot();
    }

    async _boot() {
        // Load shared grass.json before building rings (tries server /configure/grass.json, then ../three.js/configure/grass.json)
        let loaded = await this.grass.loadConfig('/configure/grass.json');
        if (!loaded) {
            await this.grass.loadConfig('../three.js/configure/grass.json');
        }

        this.buildTerrain();
        this.grass.buildAllRings();
        this.perfGovernor.applyImmediate();
        this.ui.setPerfModeValue(this.perfGovernor.mode);

        // Apply saved Visual Mode and ground camera via raycast
        this.applyVisualMode(this.currentVisualModeId, false);
        this.labCamera.groundToTerrain(0, 0, 1.2);

        this.ui.loadConfigToUi(this.currentRingIdx, this.grass.config, { terrainRelief: this.terrainRelief });
        this._animate();
    }

    buildTerrain() {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh.geometry.dispose();
            this.terrainMesh.material.dispose();
        }

        const mode = getVisualMode(this.currentVisualModeId);
        const size = 1800.0;
        const segs = 180;
        const geo = new THREE.PlaneGeometry(size, size, segs, segs);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const cDeep = new THREE.Color(mode.terrain.deepHex);
        const cMid  = new THREE.Color(mode.terrain.midHex);
        const cHigh = new THREE.Color(mode.terrain.highHex);
        const tmpCol = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = getTerrainHeight(x, z, this.terrainRelief, this.terrainOffset.x, this.terrainOffset.z);
            pos.setY(i, y);

            const t = Math.max(0, Math.min(1, (y + 12.0) / 28.0));
            if (t < 0.5) {
                tmpCol.copy(cDeep).lerp(cMid, t * 2.0);
            } else {
                tmpCol.copy(cMid).lerp(cHigh, (t - 0.5) * 2.0);
            }
            colors[i * 3 + 0] = tmpCol.r;
            colors[i * 3 + 1] = tmpCol.g;
            colors[i * 3 + 2] = tmpCol.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.updateMatrixWorld(true);
        this.scene.add(this.terrainMesh);

        this.grass.setTerrainRelief(this.terrainRelief);
        this.grass.setTerrainOffset(this.terrainOffset.x, this.terrainOffset.z);
    }

    _randomizeTerrain() {
        this.terrainSeed = Math.floor(Math.random() * 100000) + 1;
        this.terrainOffset = getTerrainOffsetForSeed(this.terrainSeed);
        this.buildTerrain();
        this.labCamera.groundToTerrain(this.labCamera.target.x, this.labCamera.target.z, 1.2);
        this.ui.showToast(`🌄 Randomized Terrain (Seed #${this.terrainSeed}) — Camera raycast-grounded`);
    }

    applyVisualMode(modeId, notify = true) {
        const mode = getVisualMode(modeId);
        this.currentVisualModeId = mode.id;
        saveVisualMode(mode.id);

        // Sky, fog, lighting, snow
        const atm = mode.atmosphere;
        const skyCol = new THREE.Color().setRGB(...atm.skyHorizon);
        this.scene.background.copy(skyCol);
        this.scene.fog.color.set(atm.fogColor);
        this.scene.fog.near = atm.fogNear;
        this.scene.fog.far = Math.max(atm.fogFar, 480.0);

        this.sunLight.color.set(atm.sunColor);
        this.sunLight.intensity = atm.sunIntensity;
        this.ambientLight.color.set(atm.ambientColor);
        this.ambientLight.intensity = atm.ambientIntensity;
        this.renderer.toneMappingExposure = atm.exposure || 1.0;

        this.weather.setSnowMode(!!mode.weather?.snow);
        if (mode.weather?.snow) {
            this.weather.setManualOverrides({
                rainIntensity: 0.72,
                windSpeed: 1.2 * (mode.weather.windMult || 1.0),
                cloudShadowIntensity: atm.cloudShadowIntensity,
                stormDarkness: 0.12
            });
        } else {
            this.weather.setManualOverrides({
                rainIntensity: this.ui.el.weatherRainEnabled?.checked ? parseFloat(this.ui.el.weatherRainIntensity?.value || 0.75) : 0.0,
                windSpeed: parseFloat(this.ui.el.weatherWindSpeed?.value || 1.2) * (mode.weather?.windMult || 1.0),
                cloudShadowIntensity: parseFloat(this.ui.el.weatherCloudShadow?.value || atm.cloudShadowIntensity),
                stormDarkness: 0.0
            });
        }

        // Grass + Terrain
        this.grass.applyVisualMode(mode);
        this.grass.setFog(this.scene.fog.color, this.scene.fog.near, this.scene.fog.far, true);
        this.buildTerrain();

        // Try live Microphone first when switching into Audio FX mode; fall back to 130 BPM beat synth
        if (mode.shadingFx === 4) {
            this._activateAudioReactive();
        } else {
            this._deactivateAudioReactive();
        }

        this.ui.setVisualModeActive(mode.id);
        this.ui.setShadingFxValue(mode.shadingFx);
        this.ui.loadConfigToUi(this.currentRingIdx, this.grass.config, { terrainRelief: this.terrainRelief });

        if (notify) {
            this.ui.showToast(`${mode.icon} Visual Mode: ${mode.name}`);
        }
    }

    async _activateAudioReactive() {
        if (this.audioBeat.isMic || this.audioBeat.isPlaying) return;
        if (this._activatingAudio) return;
        this._activatingAudio = true;
        try {
            const micOk = await this.audioBeat.startMic();
            if (this.grass.shadingFx !== 4) {
                this.audioBeat.stopMic();
                return;
            }
            if (micOk) {
                this.ui.setMicButtonState(true);
                this.ui.setBeatButtonState(false);
                this.ui.showToast('🎤 Audio FX listening to microphone');
                return;
            }
            const beatOk = this.audioBeat.startBeat();
            this.ui.setMicButtonState(false);
            this.ui.setBeatButtonState(beatOk);
            this.ui.showToast('🎵 Mic unavailable — using 130 BPM beat synth');
        } finally {
            this._activatingAudio = false;
        }
    }

    _deactivateAudioReactive() {
        if (this.audioBeat.isMic) {
            this.audioBeat.stopMic();
            this.ui.setMicButtonState(false);
        }
        if (this.audioBeat.isPlaying) {
            this.audioBeat.stopBeat();
            this.ui.setBeatButtonState(false);
        }
    }

    _syncLiveColorsFromUi() {
        this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config);
        this.grass.syncAllUniforms();
    }

    _handleLiveUniformChange(id, value) {
        this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config);
        if (id === 'terrainRelief') {
            this.terrainRelief = value;
            this.buildTerrain();
            this.labCamera.groundToTerrain(this.labCamera.target.x, this.labCamera.target.z, 1.2);
            return;
        }
        this.grass.syncAllUniforms();
    }

    _applySpeciesPreset(key) {
        const preset = this.grass.setSpeciesPreset(key);
        if (!preset) return;
        this.ui.loadConfigToUi(this.currentRingIdx, this.grass.config, { terrainRelief: this.terrainRelief });
        this.ui.showToast(`🌾 Species: ${preset.name}`);
    }

    _applyFloraPreset(key) {
        const preset = this.grass.applyFloraPreset(key);
        if (!preset) return;
        this.ui.loadConfigToUi(this.currentRingIdx, this.grass.config, { terrainRelief: this.terrainRelief });
        this.ui.showToast(`🌸 Flora Palette: ${preset.name}`);
    }

    _toggleSimPlayer() {
        const active = this.simVehicle.toggle();
        this.ui.setSimButtonState(active);
        this.ui.setFollowChecked(active);
        this.labCamera.setFollowPlayer(active, active ? this.simVehicle.position : null);
        if (active) {
            this.grass.setCoordMode(1);
            this.ui.setCoordModeValue('GAME_MODULO');
            this.ui.showToast('🏎️ Player simulation active — trample wake enabled');
        } else {
            this.ui.showToast('⏹️ Player simulation stopped');
        }
    }

    _copyJson() {
        this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config);
        const str = JSON.stringify(this.grass.config, null, 2);
        navigator.clipboard.writeText(str).then(() => {
            this.ui.showToast('📋 Copied grass.json to clipboard!');
        }).catch(() => {
            this.ui.showToast('⚠️ Clipboard permission denied', false);
        });
    }

    async _saveConfigToServer() {
        this.ui.syncUiToConfig(this.currentRingIdx, this.grass.config);
        try {
            const res = await fetch('/api/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.grass.config)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.ui.showToast('💾 Saved to three.js/configure/grass.json');
            } else {
                this.ui.showToast(`❌ Save failed: ${data.error || res.status}`, false);
            }
        } catch (err) {
            this.ui.showToast(`❌ Server offline: ${err.message}`, false);
        }
    }

    _captureFrame() {
        this.renderer.render(this.scene, this.camera);
        const dataUrl = this.renderer.domElement.toDataURL('image/webp', 0.92);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `grass_study_${Date.now()}.webp`;
        a.click();
        this.ui.showToast('📸 Captured WebP screenshot');
    }

    _updateTimeMorph(dt) {
        if (!this.timeMorphEnabled) return;
        this.timeMorphTimer += dt / Math.max(5, this.timeMorphSpeed);
        const pKeys = ['sakura', 'sunburst', 'autumn', 'cyberpunk'];
        const target = FLORA_PRESETS[pKeys[this.timeMorphPalette % pKeys.length]] || FLORA_PRESETS.sakura;
        const cycle = Math.sin(this.timeMorphTimer * Math.PI * 2) * 0.5 + 0.5;
        const baseColors = this.grass.config.colors;
        const baseFlowers = this.grass.config.flora.flowerColors;

        const lerpVec3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const rCol = lerpVec3(baseColors.colRoot, target.colors.colRoot, cycle);
        const lCol = lerpVec3(baseColors.colLower, target.colors.colLower, cycle);
        const mCol = lerpVec3(baseColors.colMid, target.colors.colMid, cycle);
        const uCol = lerpVec3(baseColors.colUpper, target.colors.colUpper, cycle);
        const tCol = lerpVec3(baseColors.colTip, target.colors.colTip, cycle);

        for (const ring of this.grass.rings) {
            const u = ring?.uniforms;
            if (!u) continue;
            u.uColRoot.value.set(...rCol);
            u.uColLower.value.set(...lCol);
            u.uColMid.value.set(...mCol);
            u.uColUpper.value.set(...uCol);
            u.uColTip.value.set(...tCol);
            for (let i = 0; i < 4; i++) {
                const fc = lerpVec3(baseFlowers[i], target.flowerColors[i], cycle);
                u[`uFlowerCol${i}`].value.set(...fc);
            }
        }
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);

        // 1. Dynamic 60 FPS Governor
        this.perfGovernor.update(dt);

        // 2. Sim vehicle & camera
        this.simVehicle.update(dt);
        this.labCamera.update(dt, this.simVehicle.position, this.simVehicle.active);

        // 3. Weather & Audio Beat
        this.weather.update(dt, this.camera.position);
        const { bass, treble } = this.audioBeat.update(dt);
        if (this.grass.shadingFx === 4) {
            this.grass.setAudioLevels(bass, treble);
            this.ui.updateAudioLevels(bass, treble);
        }

        // 4. Time Morph
        this._updateTimeMorph(dt);

        // 5. Grass Uniforms (centered on sim vehicle or camera target)
        const anchorPos = this.simVehicle.active ? this.simVehicle.position : this.labCamera.target;
        const vehiclePositions = this.simVehicle.active ? this.simVehicle.vehiclePositions : [];
        this.grass.update(
            dt,
            anchorPos,
            0.15,
            vehiclePositions,
            null,
            this.sunLight.position,
            this.weather,
            this.camera
        );

        this.renderer.render(this.scene, this.camera);

        // 6. Telemetry update every 0.4s
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime > 400) {
            this.currentFps = Math.round(this.frameCount / ((now - this.lastFpsTime) / 1000));
            this.frameCount = 0;
            this.lastFpsTime = now;

            const m = this.grass.getMetrics();
            const gStatus = this.perfGovernor.getStatus();
            const modeLabel = this.grass.viewMode === 'SINGLE'
                ? `Ring ${this.currentRingIdx + 1}`
                : `6-Ring Meadow`;

            this.ui.updateStats({
                modeLabel,
                activeBlades: m.activeBlades,
                activeTris: m.activeTris,
                pooledBlades: m.pooledBlades,
                vramMB: m.vramMB,
                fps: this.currentFps,
                densityPercent: gStatus.densityPercent,
                perfMode: gStatus.mode,
                tier: gStatus.tier
            });
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.grassLab = new GrassStudyApp();
});
