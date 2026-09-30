import * as THREE from 'three';
import { getTerrainHeight, GLSL_TERRAIN_HEIGHT } from './terrain.js';

/**
 * GrassField — Grassworks-Quality Dense Thin-Strand Meadow
 * 
 * Parameters calibrated via visual lab (grassStudy/) comparing headless Chrome
 * captures against Three.js Grassworks reference images.
 * 
 * Winning lab params:
 * Tufts: ~134K | Blades: ~1.6M | FPS: 60
 * width=0.025, height=1.0, cell=0.15, blades=12, segments=3,
 * leanMin=0.05, leanMax=0.30, curveMin=0.15, curveMax=0.40
 */

export const DEFAULT_GRASS_CONFIG = {
    bladeSegments: 3,
    bladesPerTuft: 12,
    cellSize: 0.15,
    patchSize: 55.0,
    bladeWidth: 0.025,
    maxBladeHeight: 1.0,
    leanMin: 0.05,
    leanMax: 0.30,
    curveMin: 0.15,
    curveMax: 0.40,
    hScaleMin: 0.40,
    hScaleMax: 1.20,
    farCellSize: 1.6,
    farPatchSize: 280.0,
    farBladesPerTuft: 3,
    farBladeWidth: 0.08,
    farMaxBladeHeight: 0.65,
    colors: {
        colRoot: [0.020, 0.078, 0.008],
        colLower: [0.078, 0.176, 0.024],
        colMid: [0.180, 0.361, 0.078],
        colUpper: [0.302, 0.478, 0.118],
        colTip: [0.420, 0.522, 0.157]
    }
};

export class GrassField {
    constructor(scene, trackData, trackCenter, trackSize, customConfig = null) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;
        this.trackSize = trackSize;

        this.config = Object.assign({}, DEFAULT_GRASS_CONFIG, customConfig || {});
        if (customConfig && customConfig.colors) {
            this.config.colors = Object.assign({}, DEFAULT_GRASS_CONFIG.colors, customConfig.colors);
        }

        this.elapsedTime = 0;
        this.nearMesh = null;
        this.farMesh = null;
        this.nearUniforms = null;
        this.farUniforms = null;

        this._initTextures();
        this._buildNearGrass();
        this._buildFarGrass();

        // Attempt async config load from configure/grass.json without blocking immediate render
        this._loadConfig();
    }

    async _loadConfig() {
        try {
            const res = await fetch('./configure/grass.json');
            if (res.ok) {
                const loaded = await res.json();
                this.applyConfig(loaded);
            }
        } catch (_) {
            // Standalone / offline fallback: DEFAULT_GRASS_CONFIG is already active
        }
    }

    applyConfig(newConfig) {
        if (!newConfig) return;
        const prev = this.config;
        this.config = Object.assign({}, prev, newConfig);
        if (newConfig.colors) {
            this.config.colors = Object.assign({}, prev.colors, newConfig.colors);
        }

        const topologyChanged = (
            prev.bladeSegments !== this.config.bladeSegments ||
            prev.bladesPerTuft !== this.config.bladesPerTuft ||
            prev.cellSize !== this.config.cellSize ||
            prev.patchSize !== this.config.patchSize ||
            prev.leanMin !== this.config.leanMin ||
            prev.leanMax !== this.config.leanMax ||
            prev.curveMin !== this.config.curveMin ||
            prev.curveMax !== this.config.curveMax ||
            prev.hScaleMin !== this.config.hScaleMin ||
            prev.hScaleMax !== this.config.hScaleMax
        );

        if (topologyChanged) {
            if (this.nearMesh) {
                this.scene.remove(this.nearMesh);
                this.nearMesh.geometry.dispose();
                this.nearMesh.material.dispose();
                this.nearMesh = null;
            }
            this._buildNearGrass();
        } else {
            if (this.nearUniforms) {
                this.nearUniforms.uBladeWidth.value = this.config.bladeWidth;
                this.nearUniforms.uMaxBladeHeight.value = this.config.maxBladeHeight;
                this.nearUniforms.uPatchSize.value = this.config.patchSize;
                if (this.config.colors) {
                    this.nearUniforms.uColRoot.value.set(...this.config.colors.colRoot);
                    this.nearUniforms.uColLower.value.set(...this.config.colors.colLower);
                    this.nearUniforms.uColMid.value.set(...this.config.colors.colMid);
                    this.nearUniforms.uColUpper.value.set(...this.config.colors.colUpper);
                    this.nearUniforms.uColTip.value.set(...this.config.colors.colTip);
                }
            }
            if (this.farUniforms) {
                if (this.config.farBladeWidth) this.farUniforms.uBladeWidth.value = this.config.farBladeWidth;
                if (this.config.farMaxBladeHeight) this.farUniforms.uMaxBladeHeight.value = this.config.farMaxBladeHeight;
                if (this.config.farPatchSize) this.farUniforms.uPatchSize.value = this.config.farPatchSize;
                if (this.config.colors) {
                    this.farUniforms.uColRoot.value.set(...this.config.colors.colRoot);
                    this.farUniforms.uColMid.value.set(...this.config.colors.colMid);
                    this.farUniforms.uColTip.value.set(...this.config.colors.colTip);
                }
            }
        }
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
    }

    // ═══════════════════════════════════════════════════════════════
    // NEAR FIELD — Dense grassworks-quality thin-blade carpet
    // ═══════════════════════════════════════════════════════════════
    _buildNearGrass() {
        const SEGMENTS = this.config.bladeSegments;
        const VERTS_PER_BLADE = (SEGMENTS + 1) * 2;
        const TRIS_PER_BLADE = SEGMENTS * 2;
        const IDX_PER_BLADE = TRIS_PER_BLADE * 3;
        const BLADES_PER_TUFT = this.config.bladesPerTuft;

        // Config params
        const patchSize = this.config.patchSize;
        const cellSize = this.config.cellSize;
        const cellsPerAxis = Math.floor(patchSize / cellSize);
        const tuftCount = cellsPerAxis * cellsPerAxis;
        const totalBlades = tuftCount * BLADES_PER_TUFT;

        // Build blade template
        const bladeVerts = [];
        for (let s = 0; s <= SEGMENTS; s++) {
            const t = s / SEGMENTS;
            const w = Math.max(0.0, 1.0 - t * 0.9);
            bladeVerts.push({ side: -1, t, w });
            bladeVerts.push({ side: 1, t, w });
        }
        const idxTemplate = [];
        for (let s = 0; s < SEGMENTS; s++) {
            const bl = s * 2, br = s * 2 + 1, tl = (s + 1) * 2, tr = (s + 1) * 2 + 1;
            idxTemplate.push(bl, br, tl, br, tr, tl);
        }

        const totalVerts = totalBlades * VERTS_PER_BLADE;
        const totalIndices = totalBlades * IDX_PER_BLADE;

        const positions = new Float32Array(totalVerts * 3);
        const origins = new Float32Array(totalVerts * 3);
        const dirs = new Float32Array(totalVerts * 3);
        const uvs = new Float32Array(totalVerts * 2);
        const params = new Float32Array(totalVerts * 3);
        const leans = new Float32Array(totalVerts);
        const tints = new Float32Array(totalVerts * 2);
        const indices = new Uint32Array(totalIndices);

        let pI = 0, oI = 0, dI = 0, uI = 0, pmI = 0, lI = 0, tI = 0, iI = 0, gvb = 0;
        const half = patchSize * 0.5;

        const LEAN_MIN = this.config.leanMin, LEAN_MAX = this.config.leanMax;
        const CURVE_MIN = this.config.curveMin, CURVE_MAX = this.config.curveMax;
        const H_MIN = this.config.hScaleMin, H_MAX = this.config.hScaleMax;

        for (let cy = 0; cy < cellsPerAxis; cy++) {
            for (let cx = 0; cx < cellsPerAxis; cx++) {
                const bx = cx * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const bz = cy * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const ct = Math.random();

                for (let b = 0; b < BLADES_PER_TUFT; b++) {
                    const yaw = Math.random() * Math.PI * 2;
                    const dx = Math.sin(yaw), dz = -Math.cos(yaw);
                    const lean = LEAN_MIN + Math.random() * (LEAN_MAX - LEAN_MIN);
                    const hScale = H_MIN + Math.random() * (H_MAX - H_MIN);
                    const curve = CURVE_MIN + Math.random() * (CURVE_MAX - CURVE_MIN);
                    const bt = Math.random();
                    const jx = bx + (Math.random() - 0.5) * 0.10;
                    const jz = bz + (Math.random() - 0.5) * 0.10;

                    for (let v = 0; v < bladeVerts.length; v++) {
                        const bv = bladeVerts[v];
                        positions[pI++] = jx; positions[pI++] = 0; positions[pI++] = jz;
                        origins[oI++] = jx; origins[oI++] = 0; origins[oI++] = jz;
                        dirs[dI++] = dx; dirs[dI++] = 0; dirs[dI++] = dz;
                        uvs[uI++] = bv.side; uvs[uI++] = bv.t;
                        params[pmI++] = bv.w; params[pmI++] = hScale; params[pmI++] = curve;
                        leans[lI++] = lean;
                        tints[tI++] = ct; tints[tI++] = bt;
                    }
                    for (let i = 0; i < idxTemplate.length; i++) indices[iI++] = gvb + idxTemplate[i];
                    gvb += VERTS_PER_BLADE;
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
        geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
        geometry.setAttribute('aUV', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 3));
        geometry.setAttribute('aLean', new THREE.BufferAttribute(leans, 1));
        geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        const vertexShader = `
            attribute vec3 aOrigin;
            attribute vec3 aDir;
            attribute vec2 aUV;
            attribute vec3 aParams;   // x: widthTaper, y: heightScale, z: curveAmt
            attribute float aLean;
            attribute vec2 aTint;     // x: cluster, y: individual

            uniform float uTime;
            uniform sampler2D uNoiseTexture;
            uniform vec3 uPlayerPosition;
            uniform vec3 uVehiclePositions[8];
            uniform int uVehicleCount;
            uniform vec3 uRoadPoints[32];
            uniform int uRoadCount;
            uniform float uPatchSize;
            uniform float uBladeWidth;
            uniform float uMaxBladeHeight;
            uniform float uDayTime;
            uniform vec3 uColRoot;
            uniform vec3 uColLower;
            uniform vec3 uColMid;
            uniform vec3 uColUpper;
            uniform vec3 uColTip;

            varying vec3 vColor;

            ${GLSL_TERRAIN_HEIGHT}

            void main() {
                vec3 origin = aOrigin;
                float halfPatch = uPatchSize * 0.5;
                origin.x = mod(origin.x - uPlayerPosition.x + halfPatch, uPatchSize) - halfPatch;
                origin.z = mod(origin.z - uPlayerPosition.z + halfPatch, uPatchSize) - halfPatch;

                vec2 worldXZ = vec2(uPlayerPosition.x + origin.x, uPlayerPosition.z + origin.z);
                float terrainY = getTerrainHeight(worldXZ);

                // Height noise
                float noiseH = texture2D(uNoiseTexture, worldXZ * 0.08).r * 0.45
                             + texture2D(uNoiseTexture, worldXZ * 0.035).g * 0.35
                             + texture2D(uNoiseTexture, worldXZ * 0.12).b * 0.20;
                float bladeH = noiseH * uMaxBladeHeight * 1.8 * aParams.y;

                // Edge fade
                float distFromCam = length(origin.xz);
                float edgeFade = 1.0 - smoothstep(24.0, 30.0, distFromCam);
                bladeH *= edgeFade;

                // Road clearance
                float minRD = 999.0;
                for (int r = 0; r < 32; r++) {
                    if (r >= uRoadCount) break;
                    float d = length(worldXZ - uRoadPoints[r].xz);
                    if (d < minRD) minRD = d;
                }
                if (minRD < 6.5) bladeH = 0.0;
                else if (minRD < 8.2) bladeH *= smoothstep(6.5, 8.2, minRD);

                float t = aUV.y;
                float side = aUV.x;
                vec3 pos = vec3(worldXZ.x, terrainY, worldXZ.y);

                // Width
                vec3 sideDir = vec3(-aDir.z, 0.0, aDir.x);
                pos += sideDir * (side * uBladeWidth * aParams.x * 0.5);

                // Vertical
                pos.y += t * bladeH;

                // Lean (linear tilt)
                float leanDist = aLean * t * bladeH * 1.1;
                pos += aDir * leanDist;
                pos.y -= leanDist * aLean * 0.30;

                // Tip curve (quadratic)
                float bend = t * t;
                float curveStr = aParams.z * bladeH * 0.65;
                pos += aDir * (bend * curveStr);
                pos.y -= bend * curveStr * 0.28;

                // Wind sway
                float sw1 = sin(uTime * 1.8 + worldXZ.x * 0.15 + worldXZ.y * 0.12) * 0.12;
                float sw2 = sin(uTime * 0.7 + worldXZ.x * 0.08 - worldXZ.y * 0.06) * 0.08;
                pos.x += (sw1 + sw2) * bend * bladeH;
                pos.z += (sw1 * 0.6 - sw2 * 0.4) * bend * bladeH;

                // Vehicle trample
                for (int v = 0; v < 8; v++) {
                    if (v >= uVehicleCount) break;
                    vec2 vPos = uVehiclePositions[v].xz;
                    vec2 toBlade = worldXZ - vPos;
                    float dist = length(toBlade);
                    if (dist < 7.0) {
                        float pf = pow(1.0 - dist / 7.0, 1.2);
                        vec2 pd = dist > 0.01 ? (toBlade / dist) : vec2(1.0, 0.0);
                        pos.xz += pd * (pf * bend * 4.0);
                        pos.y -= pf * bend * (bladeH * 0.65);
                    }
                }

                // ===== Grassworks color gradient =====
                vec3 c = mix(uColRoot, uColLower, smoothstep(0.0, 0.15, t));
                c = mix(c, uColMid, smoothstep(0.15, 0.40, t));
                c = mix(c, uColUpper, smoothstep(0.40, 0.70, t));
                c = mix(c, uColTip, smoothstep(0.70, 1.0, t));

                c *= mix(vec3(0.86, 1.02, 0.80), vec3(1.14, 0.98, 0.78), aTint.x);
                c *= (0.78 + aTint.y * 0.44);

                float ao = mix(0.25, 1.0, smoothstep(0.0, 0.42, t));
                vColor = c * ao;

                gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
            }
        `;

        const fragmentShader = `
            varying vec3 vColor;
            uniform float uDayTime;

            void main() {
                float t = uDayTime;
                float nightFactor = smoothstep(0.44, 0.56, t) * (1.0 - smoothstep(0.78, 0.88, t));
                vec3 dayCol = vColor;
                vec3 nightCol = vColor * vec3(0.18, 0.22, 0.38);
                vec3 finalCol = mix(dayCol, nightCol, nightFactor);
                gl_FragColor = vec4(finalCol, 1.0);
            }
        `;

        this.nearUniforms = {
            uTime: { value: 0 },
            uNoiseTexture: { value: this.noiseTexture },
            uPlayerPosition: { value: new THREE.Vector3() },
            uVehiclePositions: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
            uVehicleCount: { value: 0 },
            uRoadPoints: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
            uRoadCount: { value: 0 },
            uPatchSize: { value: patchSize },
            uBladeWidth: { value: this.config.bladeWidth },
            uMaxBladeHeight: { value: this.config.maxBladeHeight },
            uDayTime: { value: 0.0 },
            uColRoot:  { value: new THREE.Vector3(...this.config.colors.colRoot) },
            uColLower: { value: new THREE.Vector3(...this.config.colors.colLower) },
            uColMid:   { value: new THREE.Vector3(...this.config.colors.colMid) },
            uColUpper: { value: new THREE.Vector3(...this.config.colors.colUpper) },
            uColTip:   { value: new THREE.Vector3(...this.config.colors.colTip) }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.nearUniforms,
            side: THREE.DoubleSide
        });

        this.nearMesh = new THREE.Mesh(geometry, material);
        this.nearMesh.frustumCulled = false;
        this.scene.add(this.nearMesh);
    }

    // ═══════════════════════════════════════════════════════════════
    // FAR FIELD — Sparser distant meadow coverage
    // ═══════════════════════════════════════════════════════════════
    _buildFarGrass() {
        const SEGMENTS = 2;
        const VERTS_PER_BLADE = (SEGMENTS + 1) * 2; // 6
        const TRIS_PER_BLADE = SEGMENTS * 2;         // 4
        const IDX_PER_BLADE = TRIS_PER_BLADE * 3;    // 12
        const BLADES_PER_TUFT = this.config.farBladesPerTuft || 3;

        const patchSize = this.config.farPatchSize || 280.0;
        const cellSize = this.config.farCellSize || 1.6;
        const cellsPerAxis = Math.floor(patchSize / cellSize);
        const tuftCount = cellsPerAxis * cellsPerAxis;
        const totalBlades = tuftCount * BLADES_PER_TUFT;

        const bladeVerts = [];
        for (let s = 0; s <= SEGMENTS; s++) {
            const t = s / SEGMENTS;
            const w = Math.max(0.0, 1.0 - t * 0.8);
            bladeVerts.push({ side: -1, t, w });
            bladeVerts.push({ side: 1, t, w });
        }
        const idxTemplate = [];
        for (let s = 0; s < SEGMENTS; s++) {
            const bl = s * 2, br = s * 2 + 1, tl = (s + 1) * 2, tr = (s + 1) * 2 + 1;
            idxTemplate.push(bl, br, tl, br, tr, tl);
        }

        const totalVerts = totalBlades * VERTS_PER_BLADE;
        const totalIndices = totalBlades * IDX_PER_BLADE;

        const positions = new Float32Array(totalVerts * 3);
        const origins = new Float32Array(totalVerts * 3);
        const dirs = new Float32Array(totalVerts * 3);
        const uvs = new Float32Array(totalVerts * 2);
        const params = new Float32Array(totalVerts * 3);
        const leans = new Float32Array(totalVerts);
        const tints = new Float32Array(totalVerts * 2);
        const indices = new Uint32Array(totalIndices);

        let pI = 0, oI = 0, dI = 0, uI = 0, pmI = 0, lI = 0, tI = 0, iI = 0, gvb = 0;
        const half = patchSize * 0.5;

        for (let cy = 0; cy < cellsPerAxis; cy++) {
            for (let cx = 0; cx < cellsPerAxis; cx++) {
                const bx = cx * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const bz = cy * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const ct = Math.random();

                for (let b = 0; b < BLADES_PER_TUFT; b++) {
                    const yaw = Math.random() * Math.PI * 2;
                    const dx = Math.sin(yaw), dz = -Math.cos(yaw);
                    const lean = 0.06 + Math.random() * 0.35;
                    const hScale = 0.45 + Math.random() * 0.75;
                    const curve = 0.12 + Math.random() * 0.30;
                    const bt = Math.random();
                    const jx = bx + (Math.random() - 0.5) * 0.12;
                    const jz = bz + (Math.random() - 0.5) * 0.12;

                    for (let v = 0; v < bladeVerts.length; v++) {
                        const bv = bladeVerts[v];
                        positions[pI++] = jx; positions[pI++] = 0; positions[pI++] = jz;
                        origins[oI++] = jx; origins[oI++] = 0; origins[oI++] = jz;
                        dirs[dI++] = dx; dirs[dI++] = 0; dirs[dI++] = dz;
                        uvs[uI++] = bv.side; uvs[uI++] = bv.t;
                        params[pmI++] = bv.w; params[pmI++] = hScale; params[pmI++] = curve;
                        leans[lI++] = lean;
                        tints[tI++] = ct; tints[tI++] = bt;
                    }
                    for (let i = 0; i < idxTemplate.length; i++) indices[iI++] = gvb + idxTemplate[i];
                    gvb += VERTS_PER_BLADE;
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
        geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
        geometry.setAttribute('aUV', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 3));
        geometry.setAttribute('aLean', new THREE.BufferAttribute(leans, 1));
        geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        const vertexShader = `
            attribute vec3 aOrigin;
            attribute vec3 aDir;
            attribute vec2 aUV;
            attribute vec3 aParams;
            attribute float aLean;
            attribute vec2 aTint;

            uniform float uTime;
            uniform sampler2D uNoiseTexture;
            uniform vec3 uPlayerPosition;
            uniform vec3 uRoadPoints[32];
            uniform int uRoadCount;
            uniform float uPatchSize;
            uniform float uBladeWidth;
            uniform float uMaxBladeHeight;
            uniform float uDayTime;
            uniform vec3 uColRoot;
            uniform vec3 uColMid;
            uniform vec3 uColTip;

            varying vec3 vColor;

            ${GLSL_TERRAIN_HEIGHT}

            void main() {
                vec3 origin = aOrigin;
                float halfPatch = uPatchSize * 0.5;
                origin.x = mod(origin.x - uPlayerPosition.x + halfPatch, uPatchSize) - halfPatch;
                origin.z = mod(origin.z - uPlayerPosition.z + halfPatch, uPatchSize) - halfPatch;

                vec2 worldXZ = vec2(uPlayerPosition.x + origin.x, uPlayerPosition.z + origin.z);
                float terrainY = getTerrainHeight(worldXZ);

                float noiseH = texture2D(uNoiseTexture, worldXZ * 0.08).r * 0.55
                             + texture2D(uNoiseTexture, worldXZ * 0.035).g * 0.30
                             + texture2D(uNoiseTexture, worldXZ * 0.12).b * 0.15;
                float bladeH = noiseH * uMaxBladeHeight * 1.5 * aParams.y;

                float distFromCam = length(origin.xz);
                float farIn = smoothstep(25.0, 38.0, distFromCam);
                float farOut = 1.0 - smoothstep(120.0, 140.0, distFromCam);
                bladeH *= (farIn * farOut);

                float minRD = 999.0;
                for (int r = 0; r < 32; r++) {
                    if (r >= uRoadCount) break;
                    float d = length(worldXZ - uRoadPoints[r].xz);
                    if (d < minRD) minRD = d;
                }
                if (minRD < 7.0) bladeH = 0.0;
                else if (minRD < 8.6) bladeH *= smoothstep(7.0, 8.6, minRD);

                float t = aUV.y;
                float side = aUV.x;
                vec3 pos = vec3(worldXZ.x, terrainY, worldXZ.y);

                vec3 sideDir = vec3(-aDir.z, 0.0, aDir.x);
                pos += sideDir * (side * uBladeWidth * aParams.x * 0.5);
                pos.y += t * bladeH;

                float leanDist = aLean * t * bladeH * 1.1;
                pos += aDir * leanDist;
                pos.y -= leanDist * aLean * 0.3;

                float bend = t * t;
                pos += aDir * (bend * aParams.z * bladeH * 0.6);
                pos.y -= bend * aParams.z * bladeH * 0.25;

                float sway = sin(uTime * 1.2 + worldXZ.x * 0.04 + worldXZ.y * 0.035) * 0.22;
                pos.x += sway * bend * bladeH;

                vec3 c = mix(uColRoot, uColMid, smoothstep(0.0, 0.45, t));
                c = mix(c, uColTip, smoothstep(0.45, 1.0, t));
                c *= mix(vec3(0.88, 1.04, 0.82), vec3(1.12, 0.96, 0.74), aTint.x);
                c *= (0.80 + aTint.y * 0.40);

                float ao = mix(0.30, 1.0, smoothstep(0.0, 0.45, t));
                vColor = c * ao;

                gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
            }
        `;

        const fragmentShader = `
            varying vec3 vColor;
            uniform float uDayTime;

            void main() {
                float t = uDayTime;
                float nightFactor = smoothstep(0.44, 0.56, t) * (1.0 - smoothstep(0.78, 0.88, t));
                vec3 dayCol = vColor;
                vec3 nightCol = vColor * vec3(0.18, 0.22, 0.38);
                vec3 finalCol = mix(dayCol, nightCol, nightFactor);
                gl_FragColor = vec4(finalCol, 1.0);
            }
        `;

        this.farUniforms = {
            uTime: { value: 0 },
            uNoiseTexture: { value: this.noiseTexture },
            uPlayerPosition: { value: new THREE.Vector3() },
            uRoadPoints: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
            uRoadCount: { value: 0 },
            uPatchSize: { value: patchSize },
            uBladeWidth: { value: this.config.farBladeWidth || 0.08 },
            uMaxBladeHeight: { value: this.config.farMaxBladeHeight || 0.65 },
            uDayTime: { value: 0.0 },
            uColRoot: { value: new THREE.Vector3(...this.config.colors.colRoot) },
            uColMid:  { value: new THREE.Vector3(...this.config.colors.colMid) },
            uColTip:  { value: new THREE.Vector3(...this.config.colors.colTip) }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.farUniforms,
            side: THREE.DoubleSide
        });

        this.farMesh = new THREE.Mesh(geometry, material);
        this.farMesh.frustumCulled = false;
        this.scene.add(this.farMesh);
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE — Per-frame uniform updates
    // ═══════════════════════════════════════════════════════════════
    update(delta, playerPos, dayTime, vehiclePositions = [], trackData = null) {
        this.elapsedTime += delta;

        if (this.nearUniforms) {
            this.nearUniforms.uTime.value = this.elapsedTime;
            if (playerPos) this.nearUniforms.uPlayerPosition.value.copy(playerPos);
            if (dayTime !== undefined) this.nearUniforms.uDayTime.value = dayTime;

            const maxVehicles = Math.min(vehiclePositions.length, 8);
            this.nearUniforms.uVehicleCount.value = maxVehicles;
            for (let v = 0; v < maxVehicles; v++) {
                this.nearUniforms.uVehiclePositions.value[v].copy(vehiclePositions[v]);
            }

            if (trackData && trackData.points && playerPos) {
                const pts = trackData.points;
                let rIdx = 0;
                for (let i = 0; i < pts.length && rIdx < 32; i += 2) {
                    const p = pts[i];
                    const dx = p.x - playerPos.x;
                    const dz = p.z - playerPos.z;
                    if (dx * dx + dz * dz < 36000) {
                        this.nearUniforms.uRoadPoints.value[rIdx].copy(p);
                        rIdx++;
                    }
                }
                this.nearUniforms.uRoadCount.value = rIdx;
            }
        }

        if (this.farUniforms) {
            this.farUniforms.uTime.value = this.elapsedTime;
            if (playerPos) this.farUniforms.uPlayerPosition.value.copy(playerPos);
            if (dayTime !== undefined) this.farUniforms.uDayTime.value = dayTime;

            if (this.nearUniforms) {
                this.farUniforms.uRoadCount.value = this.nearUniforms.uRoadCount.value;
                for (let r = 0; r < this.nearUniforms.uRoadCount.value; r++) {
                    this.farUniforms.uRoadPoints.value[r].copy(this.nearUniforms.uRoadPoints.value[r]);
                }
            }
        }
    }
}
