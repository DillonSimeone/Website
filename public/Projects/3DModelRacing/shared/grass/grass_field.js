/**
 * shared/grass/grass_field.js — Instanced Multi-Ring Concentric Meadow Renderer
 *
 * Shared engine powering both the 3D Model Racing game and Grass Study Lab.
 * Key optimizations:
 * - Packed InstancedBufferGeometry (48 bytes/blade instead of ~550+ bytes/blade)
 * - Deterministic Fisher-Yates shuffled instance ordering so setting geometry.instanceCount
 *   gives spatially uniform 0ms dynamic density scaling across 12%..100% without VBO rebuilds
 * - Stochastic staggered ring cross-fading to eliminate sudden density cliffs
 * - Elevation-aware road mask / polyline corridor clearance (preserves shaded grass under bridges)
 */
import * as THREE from 'three';
import {
    DEFAULT_GRASS_RINGS,
    DEFAULT_GRASS_CONFIG,
    GRASS_PRESETS,
    SPECIES_PRESET_ALIASES,
    FLORA_PRESETS
} from './grass_presets.js';
import { createGrassVertexShader, createGrassFragmentShader } from './grass_shaders.js';

export { DEFAULT_GRASS_RINGS, DEFAULT_GRASS_CONFIG, GRASS_PRESETS, FLORA_PRESETS };

const MAX_VERTS_PER_RING = 8000000;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class GrassField {
    constructor(scene, trackData = null, trackCenter = null, trackSize = null, customConfig = null) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;
        this.trackSize = trackSize;

        const cfg = customConfig || {};
        this.hardwareProfile = cfg.hardwareProfile || null;
        this.maxTotalBlades = cfg.maxTotalBlades || (this.hardwareProfile ? this.hardwareProfile.maxTotalBlades : 4000000);

        this.config = this._cloneConfig(DEFAULT_GRASS_CONFIG);
        this._mergeConfig(cfg);

        this.elapsedTime = 0;
        this.elapsedSeason = 0;
        this.rings = [];
        this.densityScale = cfg.densityScale !== undefined
            ? cfg.densityScale
            : (this.hardwareProfile ? this.hardwareProfile.initialDensityScale : 0.85);
        this.activeRingLimit = 6;
        this.viewMode = 'ALL'; // 'ALL' or 'SINGLE'
        this.selectedRingIndex = 0;
        this.coordMode = cfg.coordMode !== undefined ? cfg.coordMode : 1; // 1 = Game Modulo, 0 = Static World
        this.terrainRelief = cfg.terrainRelief !== undefined ? cfg.terrainRelief : 1.0;
        this.terrainOffset = new THREE.Vector2(0, 0);
        this.globalHeightMult = 1.0;
        this.globalWidthMult = 1.0;
        this.shadingFx = cfg.shadingFx !== undefined ? cfg.shadingFx : 0;
        this.fogEnabled = cfg.fogEnabled !== undefined ? cfg.fogEnabled : true;
        this.fogColor = new THREE.Color(0x7fa5d8);
        this.fogNear = 85.0;
        this.fogFar = 390.0;
        this.lightTint = new THREE.Color(1, 1, 1);

        // Scratch objects to keep update() allocation-free
        this._camForward = new THREE.Vector3(0, 0, -1);
        this._roadPointsScratch = [];

        this._initCommonShaders();
        this._initTextures();

        if (!cfg.deferred) {
            this.buildAllRings();
            if (cfg.configUrl) {
                this.loadConfig(cfg.configUrl);
            }
        }
    }

    _cloneConfig(src) {
        return {
            adaptiveDensity: { ...(src.adaptiveDensity || {}) },
            curvature: src.curvature,
            stiffness: src.stiffness,
            translucency: src.translucency,
            patchiness: src.patchiness,
            densityDropoff: src.densityDropoff,
            radialJitterAmp: src.radialJitterAmp,
            boundaryMargin: src.boundaryMargin,
            flora: {
                ...(src.flora || {}),
                flowerColors: (src.flora?.flowerColors || []).map(c => [...c])
            },
            rings: (src.rings || DEFAULT_GRASS_RINGS).map(r => ({ ...r })),
            colors: {
                colRoot:  [...(src.colors?.colRoot || [0.02, 0.078, 0.008])],
                colLower: [...(src.colors?.colLower || [0.078, 0.176, 0.024])],
                colMid:   [...(src.colors?.colMid || [0.18, 0.361, 0.078])],
                colUpper: [...(src.colors?.colUpper || [0.302, 0.478, 0.118])],
                colTip:   [...(src.colors?.colTip || [0.42, 0.522, 0.157])]
            }
        };
    }

    _mergeConfig(patch) {
        if (!patch) return;
        const scalarKeys = ['curvature', 'stiffness', 'translucency', 'patchiness', 'densityDropoff', 'radialJitterAmp', 'boundaryMargin'];
        for (const k of scalarKeys) {
            if (patch[k] !== undefined) this.config[k] = patch[k];
        }
        if (patch.adaptiveDensity) {
            Object.assign(this.config.adaptiveDensity, patch.adaptiveDensity);
        }
        if (patch.colors) {
            for (const cKey of ['colRoot', 'colLower', 'colMid', 'colUpper', 'colTip']) {
                if (patch.colors[cKey]) this.config.colors[cKey] = [...patch.colors[cKey]];
            }
        }
        if (patch.flora) {
            if (patch.flora.flowerFrequency !== undefined) this.config.flora.flowerFrequency = patch.flora.flowerFrequency;
            if (patch.flora.cloverFrequency !== undefined) this.config.flora.cloverFrequency = patch.flora.cloverFrequency;
            if (patch.flora.wheatFrequency !== undefined) this.config.flora.wheatFrequency = patch.flora.wheatFrequency;
            if (patch.flora.twistIntensity !== undefined) this.config.flora.twistIntensity = patch.flora.twistIntensity;
            if (patch.flora.flowerColors) {
                this.config.flora.flowerColors = patch.flora.flowerColors.map(c => [...c]);
            }
        }
        if (Array.isArray(patch.rings) && patch.rings.length > 0) {
            this.config.rings = patch.rings.map(r => ({ ...r }));
        }
    }

    _initCommonShaders() {
        this.commonVertexShader = createGrassVertexShader();
        this.commonFragmentShader = createGrassFragmentShader();
    }

    _initTextures() {
        const nCanvas = document.createElement('canvas');
        nCanvas.width = 256;
        nCanvas.height = 256;
        const nCtx = nCanvas.getContext('2d');
        const imgData = nCtx.createImageData(256, 256);
        const data = imgData.data;

        const hash = (x, y) => {
            const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
            return h - Math.floor(h);
        };
        const smoothNoise = (x, y) => {
            const i = Math.floor(x);
            const j = Math.floor(y);
            const fx = x - i;
            const fy = y - j;
            const ux = fx * fx * (3.0 - 2.0 * fx);
            const uy = fy * fy * (3.0 - 2.0 * fy);
            const n00 = hash(i, j);
            const n10 = hash(i + 1, j);
            const n01 = hash(i, j + 1);
            const n11 = hash(i + 1, j + 1);
            return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
        };

        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const idx = (y * 256 + x) * 4;
                const nr = smoothNoise(x * 0.05, y * 0.05) * 0.65 + smoothNoise(x * 0.12, y * 0.12) * 0.35;
                const ng = smoothNoise(x * 0.025 + 10.0, y * 0.025 + 5.0) * 0.7 + smoothNoise(x * 0.06, y * 0.06) * 0.3;
                const nb = smoothNoise(x * 0.025 + 40.0, y * 0.025 + 80.0) * 0.7 + smoothNoise(x * 0.06 + 30.0, y * 0.06 + 20.0) * 0.3;
                data[idx]     = Math.floor(nr * 255);
                data[idx + 1] = Math.floor(ng * 255);
                data[idx + 2] = Math.floor(nb * 255);
                data[idx + 3] = 255;
            }
        }
        nCtx.putImageData(imgData, 0, 0);
        this.noiseTexture = new THREE.CanvasTexture(nCanvas);
        this.noiseTexture.wrapS = THREE.RepeatWrapping;
        this.noiseTexture.wrapT = THREE.RepeatWrapping;

        // 1x1 fallback white mask texture so sampler2D uRoadMaskTex is always bound cleanly
        const fallbackData = new Uint8Array([0, 0, 0, 255]);
        this.fallbackMaskTex = new THREE.DataTexture(fallbackData, 1, 1, THREE.RGBAFormat);
        this.fallbackMaskTex.needsUpdate = true;

        this.roadMaskState = {
            texture: null,
            centerX: 0,
            centerZ: 0,
            size: 512.0,
            enabled: false
        };
    }

    _calculateBaseRingCellSize(ring) {
        const fadeOut = ring.fadeOutMax || 64.0;
        const minPatchRequired = Math.ceil(fadeOut * 2.15);
        const patchSize = Math.max(ring.patchSize || 0, minPatchRequired);

        const adCfg = this.config.adaptiveDensity;
        let cellSize = ring.cellSize || 0.5;
        if (adCfg && adCfg.enabled) {
            const targetTris = (adCfg.targetTrianglesPerRing || 1200000) * (ring.segments > 1 ? 1.25 : 0.85);
            const comp = adCfg.cullingCompensation || 1.35;
            const fadeIn = ring.fadeInMin || 0.0;
            const activeArea = Math.PI * Math.max(1.0, (fadeOut * fadeOut - fadeIn * fadeIn));
            const patchArea = patchSize * patchSize;
            const coverageRatio = Math.max(0.10, Math.min(1.0, activeArea / patchArea));
            const visibleFraction = coverageRatio * 0.48;

            const capacity = Math.max(12000, targetTris / ((ring.segments || 1) * 2 * visibleFraction * comp));
            const tuftsReq = capacity / (ring.bladesPerTuft || 4);
            const cellsAxis = Math.max(10, Math.sqrt(tuftsReq));
            const adaptiveCell = patchSize / cellsAxis;

            const baseCell = ring.cellSize || 0.5;
            const minCell = Math.max(0.18, baseCell * 0.85);
            const maxCell = Math.max(minCell, baseCell * 1.35);
            cellSize = Math.min(maxCell, Math.max(minCell, adaptiveCell));
        }

        // Enforce single-ring vertex ceiling (< 8M verts equivalent)
        const bladesPerTuft = ring.bladesPerTuft || 4;
        const segments = ring.segments || 1;
        const vertsPerBlade = (segments + 1) * 2;
        const maxBladesByVbo = Math.floor(MAX_VERTS_PER_RING / vertsPerBlade);
        const cellsPerAxis = Math.floor(patchSize / cellSize);
        if (cellsPerAxis * cellsPerAxis * bladesPerTuft > maxBladesByVbo) {
            const safeCellsAxis = Math.max(8, Math.floor(Math.sqrt(maxBladesByVbo / bladesPerTuft)));
            cellSize = patchSize / safeCellsAxis;
        }

        return { patchSize, cellSize };
    }

    _computeRingPoolScale() {
        const ringList = this.getRingConfigs();
        let estimatedTotalBlades = 0;
        for (const r of ringList) {
            const { patchSize, cellSize } = this._calculateBaseRingCellSize(r);
            const cells = Math.floor(patchSize / cellSize);
            estimatedTotalBlades += cells * cells * (r.bladesPerTuft || 4);
        }
        if (estimatedTotalBlades <= this.maxTotalBlades) return 1.0;
        return Math.sqrt(estimatedTotalBlades / Math.max(100000, this.maxTotalBlades));
    }

    _createRingMesh(opts, poolCellMultiplier = 1.0, ringIdx = 0) {
        const {
            segments = 2,
            bladesPerTuft = 4,
            bladeWidth = 0.05,
            maxBladeHeight = 1.0,
            fadeInMin = 0.0,
            fadeInMax = 0.0,
            fadeOutMin = 50.0,
            fadeOutMax = 64.0,
            enableTrample = false,
            leanMin = 0.06,
            leanMax = 0.32,
            hScaleMin = 0.45,
            hScaleMax = 1.25,
            curveMin = 0.14,
            curveMax = 0.36
        } = opts;

        const { patchSize, cellSize: baseCell } = this._calculateBaseRingCellSize(opts);
        const cellSize = Math.max(0.18, baseCell * poolCellMultiplier);

        const floraConfig = this.config.flora || {};
        const flowerFreq = floraConfig.flowerFrequency !== undefined ? floraConfig.flowerFrequency : 0.08;
        const cloverFreq = floraConfig.cloverFrequency !== undefined ? floraConfig.cloverFrequency : 0.10;
        const wheatFreq = floraConfig.wheatFrequency !== undefined ? floraConfig.wheatFrequency : 0.08;
        const twistIntensity = floraConfig.twistIntensity !== undefined ? floraConfig.twistIntensity : 0.95;

        const VERTS_PER_BLADE = (segments + 1) * 2;
        const TRIS_PER_BLADE = segments * 2;

        const cellsPerAxis = Math.max(4, Math.floor(patchSize / cellSize));
        const tuftCount = cellsPerAxis * cellsPerAxis;
        const totalBlades = tuftCount * bladesPerTuft;

        // 1. Shared template blade geometry (only ~6 vertices and ~12 indices!)
        const basePos = new Float32Array(VERTS_PER_BLADE * 3);
        const baseUV = new Float32Array(VERTS_PER_BLADE * 2);
        const baseTaper = new Float32Array(VERTS_PER_BLADE);
        let bp = 0, bu = 0, bt = 0;

        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const w = Math.max(0.0, 1.0 - t * 0.85);
            for (const side of [-1, 1]) {
                basePos[bp++] = side * w * 0.05;
                basePos[bp++] = t;
                basePos[bp++] = 0.0;
                baseUV[bu++] = side;
                baseUV[bu++] = t;
                baseTaper[bt++] = w;
            }
        }

        const baseIdx = [];
        for (let s = 0; s < segments; s++) {
            const bl = s * 2, br = s * 2 + 1, tl = (s + 1) * 2, tr = (s + 1) * 2 + 1;
            baseIdx.push(bl, br, tl, br, tr, tl);
        }

        // 2. Deterministic Fisher-Yates slot order so ANY prefix [0..instanceCount) is spatially uniform
        const rng = mulberry32(0x9e3779b9 ^ (ringIdx + 1) * 7919);
        const slots = new Uint32Array(totalBlades);
        for (let i = 0; i < totalBlades; i++) slots[i] = i;
        for (let i = totalBlades - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = slots[i];
            slots[i] = slots[j];
            slots[j] = tmp;
        }

        // 3. Packed per-instance attributes (48 bytes per blade)
        const instOrigin = new Float32Array(totalBlades * 4);
        const instShape = new Float32Array(totalBlades * 4);
        const instFlora = new Float32Array(totalBlades * 4);

        const half = patchSize * 0.5;
        let slotPtr = 0;

        for (let cy = 0; cy < cellsPerAxis; cy++) {
            for (let cx = 0; cx < cellsPerAxis; cx++) {
                const bx = cx * cellSize - half + (rng() * 0.7 + 0.15) * cellSize;
                const bz = cy * cellSize - half + (rng() * 0.7 + 0.15) * cellSize;
                const ct = rng();

                for (let b = 0; b < bladesPerTuft; b++) {
                    const outIdx = slots[slotPtr++] * 4;
                    const yaw = rng() * Math.PI * 2;
                    const lean = leanMin + rng() * (leanMax - leanMin);
                    const hScale = hScaleMin + rng() * (hScaleMax - hScaleMin);
                    const curve = curveMin + rng() * (curveMax - curveMin);
                    const bladeHash = rng();
                    const jx = bx + (rng() - 0.5) * (cellSize * 0.35);
                    const jz = bz + (rng() - 0.5) * (cellSize * 0.35);

                    const roll = rng();
                    let pType = 0.0;
                    if (roll < flowerFreq) {
                        pType = 3.0;
                    } else if (roll < flowerFreq + cloverFreq) {
                        pType = 1.0;
                    } else if (roll < flowerFreq + cloverFreq + wheatFreq) {
                        pType = 2.0;
                    }

                    const twist = (rng() * 2.4 - 1.2) * twistIntensity;
                    let curveMode = rng();
                    if (pType === 3.0 || pType === 2.0) {
                        curveMode = rng() < 0.65 ? 1.0 : 0.0;
                    }
                    const colorSeed = rng();

                    instOrigin[outIdx]     = jx;
                    instOrigin[outIdx + 1] = jz;
                    instOrigin[outIdx + 2] = yaw;
                    instOrigin[outIdx + 3] = hScale;

                    instShape[outIdx]     = lean;
                    instShape[outIdx + 1] = curve;
                    instShape[outIdx + 2] = ct;
                    instShape[outIdx + 3] = bladeHash;

                    instFlora[outIdx]     = pType;
                    instFlora[outIdx + 1] = twist;
                    instFlora[outIdx + 2] = curveMode;
                    instFlora[outIdx + 3] = colorSeed;
                }
            }
        }

        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(basePos, 3));
        geometry.setAttribute('aUV', new THREE.BufferAttribute(baseUV, 2));
        geometry.setAttribute('aWidthTaper', new THREE.BufferAttribute(baseTaper, 1));
        geometry.setIndex(baseIdx);

        geometry.setAttribute('aInstOrigin', new THREE.InstancedBufferAttribute(instOrigin, 4));
        geometry.setAttribute('aInstShape', new THREE.InstancedBufferAttribute(instShape, 4));
        geometry.setAttribute('aInstFlora', new THREE.InstancedBufferAttribute(instFlora, 4));
        geometry.instanceCount = Math.max(1, Math.floor(totalBlades * this.densityScale));

        const uniforms = {
            uTime:                 { value: this.elapsedTime },
            uNoiseTexture:         { value: this.noiseTexture },
            uPlayerPosition:       { value: new THREE.Vector3() },
            uVehiclePositions:     { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
            uVehicleCount:         { value: 0 },
            uRoadPoints:           { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
            uRoadCount:            { value: 0 },
            uUseRoadMask:          { value: (this.roadMaskState.enabled && this.roadMaskState.texture) ? 1.0 : 0.0 },
            uRoadMaskTex:          { value: this.roadMaskState.texture || this.fallbackMaskTex },
            uRoadMaskCenter:       { value: new THREE.Vector2(this.roadMaskState.centerX, this.roadMaskState.centerZ) },
            uRoadMaskSize:         { value: this.roadMaskState.size },
            uPatchSize:            { value: patchSize },
            uBladeWidth:           { value: bladeWidth },
            uMaxBladeHeight:       { value: maxBladeHeight },
            uGlobalHeightMult:     { value: this.globalHeightMult },
            uGlobalWidthMult:      { value: this.globalWidthMult },
            uDensityWidthComp:     { value: this._calcWidthComp(this.densityScale) },
            uFadeInMin:            { value: fadeInMin },
            uFadeInMax:            { value: fadeInMax },
            uFadeOutMin:           { value: fadeOutMin },
            uFadeOutMax:           { value: fadeOutMax },
            uCurvature:            { value: this.config.curvature !== undefined ? this.config.curvature : 0.35 },
            uStiffness:            { value: this.config.stiffness !== undefined ? this.config.stiffness : 1.0 },
            uTranslucency:         { value: this.config.translucency !== undefined ? this.config.translucency : 0.65 },
            uPatchiness:           { value: this.config.patchiness !== undefined ? this.config.patchiness : 0.40 },
            uDensityDropoff:       { value: this.config.densityDropoff !== undefined ? this.config.densityDropoff : 1.0 },
            uRadialJitterAmp:      { value: this.config.radialJitterAmp !== undefined ? this.config.radialJitterAmp : 6.5 },
            uBoundaryMargin:       { value: this.config.boundaryMargin !== undefined ? this.config.boundaryMargin : 8.0 },
            uCoordMode:            { value: this.coordMode },
            uTerrainRelief:        { value: this.terrainRelief },
            uTerrainOffset:        { value: this.terrainOffset.clone() },
            uFrustumCosCutoff:     { value: -1.0 },
            uDayTime:              { value: 0.15 },
            uColRoot:              { value: new THREE.Vector3(...this.config.colors.colRoot) },
            uColLower:             { value: new THREE.Vector3(...this.config.colors.colLower) },
            uColMid:               { value: new THREE.Vector3(...this.config.colors.colMid) },
            uColUpper:             { value: new THREE.Vector3(...this.config.colors.colUpper) },
            uColTip:               { value: new THREE.Vector3(...this.config.colors.colTip) },
            uSunDir:               { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
            uLightTint:            { value: this.lightTint.clone() },
            uCloudOffset:          { value: new THREE.Vector2() },
            uCloudShadowIntensity: { value: 0.15 },
            uLightning:            { value: 0.0 },
            uWindSpeed:            { value: 1.0 },
            uFlowerCol0:           { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[0] || [0.95, 0.22, 0.20])) },
            uFlowerCol1:           { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[1] || [0.98, 0.82, 0.14])) },
            uFlowerCol2:           { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[2] || [0.22, 0.55, 0.95])) },
            uFlowerCol3:           { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[3] || [0.98, 0.98, 0.95])) },
            uSeasonTime:           { value: this.elapsedSeason },
            uShadingFx:            { value: this.shadingFx },
            uAudioBass:            { value: 0.0 },
            uAudioTreble:          { value: 0.0 },
            uFogEnabled:           { value: this.fogEnabled ? 1.0 : 0.0 },
            uFogColor:             { value: this.fogColor.clone() },
            uFogNear:              { value: this.fogNear },
            uFogFar:               { value: this.fogFar }
        };

        const material = new THREE.ShaderMaterial({
            defines: enableTrample ? { ENABLE_TRAMPLE: 1 } : {},
            vertexShader: this.commonVertexShader,
            fragmentShader: this.commonFragmentShader,
            uniforms,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.visible = this._shouldRingBeVisible(ringIdx);
        this.scene.add(mesh);

        return {
            mesh,
            uniforms,
            geometry,
            material,
            opts,
            tuftCount,
            maxInstances: totalBlades,
            trisPerBlade: TRIS_PER_BLADE
        };
    }

    _calcWidthComp(scale) {
        return 1.0 + Math.max(0.0, 1.0 - scale) * 0.38;
    }

    _shouldRingBeVisible(index) {
        if (this.viewMode === 'SINGLE') {
            return index === this.selectedRingIndex;
        }
        return index < this.activeRingLimit;
    }

    _syncRingVisibility() {
        for (let i = 0; i < this.rings.length; i++) {
            const r = this.rings[i];
            if (r && r.mesh) {
                r.mesh.visible = this._shouldRingBeVisible(i);
            }
        }
    }

    getRingConfigs() {
        return (this.config.rings && this.config.rings.length > 0)
            ? this.config.rings
            : DEFAULT_GRASS_RINGS;
    }

    getRingCount() {
        return this.getRingConfigs().length;
    }

    buildRing(index) {
        const ringList = this.getRingConfigs();
        if (index < 0 || index >= ringList.length) return null;

        const old = this.rings[index];
        const ringCfg = ringList[index];
        const poolScale = this._computeRingPoolScale();

        const r = this._createRingMesh({
            id: ringCfg.id || ('ring_' + index),
            segments: ringCfg.segments !== undefined ? ringCfg.segments : 2,
            bladesPerTuft: ringCfg.bladesPerTuft !== undefined ? ringCfg.bladesPerTuft : 4,
            patchSize: ringCfg.patchSize,
            cellSize: ringCfg.cellSize || 0.6,
            bladeWidth: ringCfg.bladeWidth || 0.05,
            maxBladeHeight: ringCfg.maxBladeHeight || 1.0,
            fadeInMin: ringCfg.fadeInMin !== undefined ? ringCfg.fadeInMin : 0.0,
            fadeInMax: ringCfg.fadeInMax !== undefined ? ringCfg.fadeInMax : 0.0,
            fadeOutMin: ringCfg.fadeOutMin !== undefined ? ringCfg.fadeOutMin : 80.0,
            fadeOutMax: ringCfg.fadeOutMax !== undefined ? ringCfg.fadeOutMax : 120.0,
            enableTrample: !!ringCfg.enableTrample,
            leanMin: ringCfg.leanMin !== undefined ? ringCfg.leanMin : 0.06,
            leanMax: ringCfg.leanMax !== undefined ? ringCfg.leanMax : 0.32,
            hScaleMin: ringCfg.hScaleMin !== undefined ? ringCfg.hScaleMin : 0.45,
            hScaleMax: ringCfg.hScaleMax !== undefined ? ringCfg.hScaleMax : 1.25,
            curveMin: ringCfg.curveMin !== undefined ? ringCfg.curveMin : 0.14,
            curveMax: ringCfg.curveMax !== undefined ? ringCfg.curveMax : 0.36
        }, poolScale, index);

        this.rings[index] = r;

        if (old && old.mesh) {
            this.scene.remove(old.mesh);
            if (old.geometry) old.geometry.dispose();
            if (old.material) old.material.dispose();
        }

        return r;
    }

    buildAllRings() {
        const count = this.getRingCount();
        for (let i = 0; i < count; i++) {
            this.buildRing(i);
        }
        // Trim extra old rings if ring count decreased
        while (this.rings.length > count) {
            const extra = this.rings.pop();
            if (extra && extra.mesh) {
                this.scene.remove(extra.mesh);
                if (extra.geometry) extra.geometry.dispose();
                if (extra.material) extra.material.dispose();
            }
        }
    }

    // Backwards compatibility alias
    _buildConcentricRings() {
        this.buildAllRings();
    }

    _disposeRings() {
        for (const r of this.rings) {
            if (r && r.mesh) {
                this.scene.remove(r.mesh);
                if (r.geometry) r.geometry.dispose();
                if (r.material) r.material.dispose();
            }
        }
        this.rings = [];
    }

    _scheduleRebuild(delay = 250) {
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(() => {
            this._rebuildTimer = null;
            this.buildAllRings();
        }, delay);
    }

    async loadConfig(url = './configure/grass.json') {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const loaded = await res.json();
                this._mergeConfig(loaded);
                if (this.rings.length > 0) {
                    this.syncAllUniforms();
                }
                return loaded;
            }
        } catch (_) {
            // Standalone/offline fallback uses DEFAULT_GRASS_CONFIG
        }
        return null;
    }

    setDensityScale(scale) {
        const clamped = Math.max(0.08, Math.min(1.0, scale));
        this.densityScale = clamped;
        const wComp = this._calcWidthComp(clamped);
        for (const r of this.rings) {
            if (!r || !r.geometry) continue;
            r.geometry.instanceCount = Math.max(1, Math.floor(r.maxInstances * clamped));
            if (r.uniforms.uDensityWidthComp) {
                r.uniforms.uDensityWidthComp.value = wComp;
            }
        }
    }

    setActiveRingLimit(count) {
        this.activeRingLimit = Math.max(1, Math.min(6, count));
        this._syncRingVisibility();
    }

    setViewMode(mode = 'ALL', selectedRingIndex = 0) {
        this.viewMode = mode === 'SINGLE' ? 'SINGLE' : 'ALL';
        this.selectedRingIndex = selectedRingIndex;
        this._syncRingVisibility();
    }

    setCoordMode(mode) {
        this.coordMode = mode ? 1 : 0;
        for (const r of this.rings) {
            if (r?.uniforms?.uCoordMode) r.uniforms.uCoordMode.value = this.coordMode;
        }
    }

    setTerrainRelief(relief) {
        this.terrainRelief = relief;
        for (const r of this.rings) {
            if (r?.uniforms?.uTerrainRelief) r.uniforms.uTerrainRelief.value = relief;
        }
    }

    setTerrainOffset(x, z) {
        this.terrainOffset.set(x, z);
        for (const r of this.rings) {
            if (r?.uniforms?.uTerrainOffset) r.uniforms.uTerrainOffset.value.set(x, z);
        }
    }

    setShadingFx(fx) {
        this.shadingFx = fx | 0;
        for (const r of this.rings) {
            if (r?.uniforms?.uShadingFx) r.uniforms.uShadingFx.value = this.shadingFx;
        }
    }

    setAudioLevels(bass, treble) {
        for (const r of this.rings) {
            if (!r?.uniforms) continue;
            r.uniforms.uAudioBass.value = bass;
            r.uniforms.uAudioTreble.value = treble;
        }
    }

    setFog(color, near, far, enabled = true) {
        this.fogEnabled = enabled;
        if (color) this.fogColor.copy(color);
        if (near !== undefined) this.fogNear = near;
        if (far !== undefined) this.fogFar = far;
        for (const r of this.rings) {
            if (!r?.uniforms) continue;
            r.uniforms.uFogEnabled.value = this.fogEnabled ? 1.0 : 0.0;
            r.uniforms.uFogColor.value.copy(this.fogColor);
            r.uniforms.uFogNear.value = this.fogNear;
            r.uniforms.uFogFar.value = this.fogFar;
        }
    }

    setLightTint(color) {
        if (color) this.lightTint.copy(color);
        for (const r of this.rings) {
            if (r?.uniforms?.uLightTint) r.uniforms.uLightTint.value.copy(this.lightTint);
        }
    }

    setRoadMask(texture, centerX, centerZ, size, enabled = true) {
        if (texture) this.roadMaskState.texture = texture;
        this.roadMaskState.centerX = centerX;
        this.roadMaskState.centerZ = centerZ;
        this.roadMaskState.size = size;
        this.roadMaskState.enabled = Boolean(enabled);

        const activeTex = this.roadMaskState.texture;
        for (const r of this.rings) {
            if (!r?.uniforms) continue;
            r.uniforms.uUseRoadMask.value = enabled && activeTex ? 1.0 : 0.0;
            if (activeTex) r.uniforms.uRoadMaskTex.value = activeTex;
            r.uniforms.uRoadMaskCenter.value.set(centerX, centerZ);
            r.uniforms.uRoadMaskSize.value = size;
        }
    }

    applyVisualMode(mode) {
        if (!mode) return;
        const g = mode.grass || {};
        this.shadingFx = mode.shadingFx !== undefined ? mode.shadingFx : 0;
        this.globalHeightMult = g.heightMult !== undefined ? g.heightMult : 1.0;
        this.globalWidthMult = g.widthMult !== undefined ? g.widthMult : 1.0;

        this.applyConfig({
            curvature: g.curvature,
            stiffness: g.stiffness,
            translucency: g.translucency,
            patchiness: g.patchiness,
            colors: g.colors,
            flora: g.flowerColors ? { flowerColors: g.flowerColors } : undefined
        });

        for (const r of this.rings) {
            if (!r?.uniforms) continue;
            r.uniforms.uShadingFx.value = this.shadingFx;
            r.uniforms.uGlobalHeightMult.value = this.globalHeightMult;
            r.uniforms.uGlobalWidthMult.value = this.globalWidthMult;
        }
    }

    set(options) {
        if (!options) return this;
        this.applyConfig(options);
        return this;
    }

    setSpeciesPreset(name) {
        const canonical = SPECIES_PRESET_ALIASES[name] || name;
        const p = GRASS_PRESETS[canonical];
        if (!p) return null;
        this.applyConfig({
            curvature: p.curvature,
            stiffness: p.stiffness,
            patchiness: p.patchiness,
            translucency: p.translucency,
            colors: p.colors
        });
        // Scale ring heights & widths relative to species defaults cleanly
        const hRatio = p.bladeHeight ? p.bladeHeight / 0.55 : 1.0;
        const wRatio = p.bladeWidth ? p.bladeWidth / 0.044 : 1.0;
        this.globalHeightMult = Math.max(0.35, Math.min(2.2, hRatio));
        this.globalWidthMult = Math.max(0.45, Math.min(2.2, wRatio));
        for (const r of this.rings) {
            if (!r?.uniforms) continue;
            r.uniforms.uGlobalHeightMult.value = this.globalHeightMult;
            r.uniforms.uGlobalWidthMult.value = this.globalWidthMult;
        }
        return p;
    }

    setPreset(name) {
        return this.setSpeciesPreset(name);
    }

    applyFloraPreset(name) {
        const p = FLORA_PRESETS[name];
        if (!p) return null;
        this.applyConfig({
            colors: p.colors,
            flora: { flowerColors: p.flowerColors }
        });
        return p;
    }

    applyConfig(newConfig) {
        if (!newConfig) return;
        const prev = this._cloneConfig(this.config);
        this._mergeConfig(newConfig);

        const ringCountChanged = prev.rings.length !== this.config.rings.length;
        let ringStructureChanged = ringCountChanged;

        if (!ringStructureChanged && newConfig.flora) {
            if (prev.flora.flowerFrequency !== this.config.flora.flowerFrequency ||
                prev.flora.cloverFrequency !== this.config.flora.cloverFrequency ||
                prev.flora.wheatFrequency !== this.config.flora.wheatFrequency ||
                prev.flora.twistIntensity !== this.config.flora.twistIntensity) {
                ringStructureChanged = true;
            }
        }
        if (!ringStructureChanged && newConfig.adaptiveDensity) {
            if (prev.adaptiveDensity.enabled !== this.config.adaptiveDensity.enabled ||
                prev.adaptiveDensity.targetTrianglesPerRing !== this.config.adaptiveDensity.targetTrianglesPerRing ||
                prev.adaptiveDensity.cullingCompensation !== this.config.adaptiveDensity.cullingCompensation) {
                ringStructureChanged = true;
            }
        }
        if (!ringStructureChanged && newConfig.rings) {
            for (let i = 0; i < this.config.rings.length; i++) {
                const pR = prev.rings[i];
                const nR = this.config.rings[i];
                if (!pR || !nR ||
                    pR.cellSize !== nR.cellSize ||
                    pR.patchSize !== nR.patchSize ||
                    pR.bladesPerTuft !== nR.bladesPerTuft ||
                    pR.segments !== nR.segments ||
                    pR.enableTrample !== nR.enableTrample ||
                    pR.leanMin !== nR.leanMin || pR.leanMax !== nR.leanMax ||
                    pR.curveMin !== nR.curveMin || pR.curveMax !== nR.curveMax ||
                    pR.hScaleMin !== nR.hScaleMin || pR.hScaleMax !== nR.hScaleMax) {
                    ringStructureChanged = true;
                    break;
                }
            }
        }

        if (ringStructureChanged && this.rings.length > 0) {
            if (newConfig.immediateRebuild) {
                this.buildAllRings();
            } else {
                this._scheduleRebuild(250);
            }
        } else {
            this.syncAllUniforms();
        }
    }

    syncAllUniforms() {
        const ringCfgs = this.getRingConfigs();
        for (let i = 0; i < this.rings.length; i++) {
            const ring = this.rings[i];
            if (!ring || !ring.uniforms) continue;
            const ringCfg = ringCfgs[i];
            const u = ring.uniforms;

            if (ringCfg) {
                if (ringCfg.bladeWidth !== undefined) u.uBladeWidth.value = ringCfg.bladeWidth;
                if (ringCfg.maxBladeHeight !== undefined) u.uMaxBladeHeight.value = ringCfg.maxBladeHeight;
                if (ringCfg.fadeInMin !== undefined) u.uFadeInMin.value = ringCfg.fadeInMin;
                if (ringCfg.fadeInMax !== undefined) u.uFadeInMax.value = ringCfg.fadeInMax;
                if (ringCfg.fadeOutMin !== undefined) u.uFadeOutMin.value = ringCfg.fadeOutMin;
                if (ringCfg.fadeOutMax !== undefined) u.uFadeOutMax.value = ringCfg.fadeOutMax;
            }

            u.uCurvature.value = this.config.curvature ?? 0.35;
            u.uStiffness.value = this.config.stiffness ?? 1.0;
            u.uTranslucency.value = this.config.translucency ?? 0.65;
            u.uPatchiness.value = this.config.patchiness ?? 0.40;
            u.uDensityDropoff.value = this.config.densityDropoff ?? 1.0;
            u.uRadialJitterAmp.value = this.config.radialJitterAmp ?? 6.5;
            u.uBoundaryMargin.value = this.config.boundaryMargin ?? 8.0;
            u.uGlobalHeightMult.value = this.globalHeightMult;
            u.uGlobalWidthMult.value = this.globalWidthMult;
            u.uShadingFx.value = this.shadingFx;
            u.uCoordMode.value = this.coordMode;
            u.uTerrainRelief.value = this.terrainRelief;
            u.uTerrainOffset.value.copy(this.terrainOffset);

            if (this.config.colors) {
                u.uColRoot.value.set(...this.config.colors.colRoot);
                u.uColLower.value.set(...this.config.colors.colLower);
                u.uColMid.value.set(...this.config.colors.colMid);
                u.uColUpper.value.set(...this.config.colors.colUpper);
                u.uColTip.value.set(...this.config.colors.colTip);
            }

            if (this.config.flora?.flowerColors) {
                const fc = this.config.flora.flowerColors;
                if (fc[0]) u.uFlowerCol0.value.set(...fc[0]);
                if (fc[1]) u.uFlowerCol1.value.set(...fc[1]);
                if (fc[2]) u.uFlowerCol2.value.set(...fc[2]);
                if (fc[3]) u.uFlowerCol3.value.set(...fc[3]);
            }
        }
    }

    update(delta, playerPos, dayTime, vehiclePositions = [], trackData = null, sunDir = null, weather = null, camera = null) {
        this.elapsedTime += delta;
        this.elapsedSeason += delta * 0.0035;

        // Calculate active connected road segments around player once
        const roadPts = this._roadPointsScratch;
        roadPts.length = 0;
        if (trackData && trackData.points && trackData.points.length > 1 && playerPos) {
            const pts = trackData.points;
            let closestIdx = 0;
            let closestDistSq = Infinity;
            for (let i = 0; i < pts.length; i += 3) {
                const dx = pts[i].x - playerPos.x;
                const dz = pts[i].z - playerPos.z;
                const dSq = dx * dx + dz * dz;
                if (dSq < closestDistSq) {
                    closestDistSq = dSq;
                    closestIdx = i;
                }
            }
            const startIdx = Math.max(0, closestIdx - 14);
            const endIdx = Math.min(pts.length - 1, startIdx + 31);
            for (let i = startIdx; i <= endIdx; i++) {
                roadPts.push(pts[i]);
            }
        }

        // Compute conservative frustum half-cone cosine cutoff so edge blades with wind sway never pop
        let cosCutoff = -1.0;
        if (camera && camera.fov && camera.aspect) {
            const tanHalfV = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
            const tanHalfDiag = Math.hypot(tanHalfV * camera.aspect, tanHalfV);
            const halfDiagRad = Math.atan(tanHalfDiag) + 0.24; // ~14 deg wind/height margin
            cosCutoff = halfDiagRad >= Math.PI * 0.49 ? -1.0 : Math.cos(halfDiagRad);
        }

        const maxVehicles = Math.min(vehiclePositions.length, 8);

        for (let i = 0; i < this.rings.length; i++) {
            const ring = this.rings[i];
            if (!ring || !ring.mesh.visible) continue;
            const u = ring.uniforms;

            u.uTime.value = this.elapsedTime;
            u.uSeasonTime.value = this.elapsedSeason;
            u.uFrustumCosCutoff.value = cosCutoff;
            if (playerPos) u.uPlayerPosition.value.copy(playerPos);
            if (dayTime !== undefined) u.uDayTime.value = dayTime;
            if (sunDir) u.uSunDir.value.copy(sunDir);

            if (weather) {
                u.uCloudOffset.value.copy(weather.cloudOffset);
                u.uCloudShadowIntensity.value = weather.cloudShadowIntensity;
                u.uLightning.value = weather.lightningIntensity;
                u.uWindSpeed.value = weather.windSpeed;
            }

            u.uVehicleCount.value = maxVehicles;
            for (let v = 0; v < maxVehicles; v++) {
                u.uVehiclePositions.value[v].copy(vehiclePositions[v]);
            }

            u.uRoadCount.value = roadPts.length;
            for (let r = 0; r < roadPts.length; r++) {
                u.uRoadPoints.value[r].copy(roadPts[r]);
            }
        }
    }

    getMetrics() {
        let activeBlades = 0;
        let activeTris = 0;
        let pooledBlades = 0;
        let visibleRings = 0;

        for (const r of this.rings) {
            if (!r || !r.geometry) continue;
            pooledBlades += r.maxInstances;
            if (r.mesh && r.mesh.visible) {
                visibleRings++;
                const inst = r.geometry.instanceCount;
                activeBlades += inst;
                activeTris += inst * r.trisPerBlade;
            }
        }

        return {
            visibleRings,
            totalRings: this.rings.length,
            activeBlades,
            activeTris,
            pooledBlades,
            vramMB: (pooledBlades * 48) / (1024 * 1024),
            densityScale: this.densityScale,
            densityPercent: Math.round(this.densityScale * 100)
        };
    }

    destroy() {
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._disposeRings();
        if (this.noiseTexture) this.noiseTexture.dispose();
        if (this.fallbackMaskTex) this.fallbackMaskTex.dispose();
    }
}
