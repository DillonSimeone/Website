import * as THREE from 'three';
import { getTerrainHeight, GLSL_TERRAIN_HEIGHT } from './terrain.js';

/**
 * GrassField — Seamless 4-Ring Concentric Multi-LOD Meadow Architecture
 * 
 * Mathematical Guarantee Against Square Bounding-Box Artifacts:
 * - In a square modulo wrapping grid of side length P, the inscribed circle radius is P/2.
 * - By enforcing fadeOutMax < P/2 on EVERY ring with generous safety margins, all blade
 *   heights reach EXACTLY 0.0 before reaching the modulo border.
 * - Zero-fade blades are culled off-screen in the vertex shader (gl_Position = vec4(2.0)),
 *   guaranteeing a 100% mathematically pure, round radial cross-fade with zero square edges.
 * 
 * Concentric Ring Spectrum:
 * 1. Ultra Carpet (0m - 28m):    10 blades/tuft, 3 segments, interactive vehicle trample
 * 2. Medium Meadow (18m - 64m):  6 blades/tuft, 2 segments, dense fanned tufts
 * 3. Far Fields (48m - 130m):    4 blades/tuft, 1 segment, wide hill-covering tufts
 * 4. Horizon Grass (100m - 250m): 3 blades/tuft, billboard clusters merging into atmospheric fog
 */

export const DEFAULT_GRASS_RINGS = [
    {
        id: 'ring1_ultra',
        name: 'Ring 1 (Ultra Carpet)',
        segments: 2,
        bladesPerTuft: 5,
        cellSize: 0.16,
        patchSize: 140.0,
        bladeWidth: 0.034,
        maxBladeHeight: 1.0,
        fadeInMin: 0.0,
        fadeInMax: 0.0,
        fadeOutMin: 32.0,
        fadeOutMax: 64.0,
        enableTrample: true,
        leanMin: 0.05,
        leanMax: 0.30,
        curveMin: 0.15,
        curveMax: 0.40,
        hScaleMin: 0.40,
        hScaleMax: 1.20
    },
    {
        id: 'ring2_fine',
        name: 'Ring 2 (Fine Meadow)',
        segments: 2,
        bladesPerTuft: 4,
        cellSize: 0.52,
        patchSize: 240.0,
        bladeWidth: 0.046,
        maxBladeHeight: 1.05,
        fadeInMin: 32.0,
        fadeInMax: 64.0,
        fadeOutMin: 72.0,
        fadeOutMax: 115.0,
        enableTrample: true,
        leanMin: 0.06,
        leanMax: 0.32,
        curveMin: 0.14,
        curveMax: 0.38,
        hScaleMin: 0.45,
        hScaleMax: 1.25
    },
    {
        id: 'ring3_mid',
        name: 'Ring 3 (Mid Meadow)',
        segments: 1,
        bladesPerTuft: 4,
        cellSize: 0.74,
        patchSize: 390.0,
        bladeWidth: 0.065,
        maxBladeHeight: 1.10,
        fadeInMin: 72.0,
        fadeInMax: 115.0,
        fadeOutMin: 125.0,
        fadeOutMax: 185.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.12,
        curveMax: 0.36,
        hScaleMin: 0.50,
        hScaleMax: 1.30
    },
    {
        id: 'ring4_farmid',
        name: 'Ring 4 (Far-Mid Field)',
        segments: 1,
        bladesPerTuft: 3,
        cellSize: 1.10,
        patchSize: 610.0,
        bladeWidth: 0.095,
        maxBladeHeight: 1.18,
        fadeInMin: 125.0,
        fadeInMax: 185.0,
        fadeOutMin: 200.0,
        fadeOutMax: 290.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.12,
        curveMax: 0.34,
        hScaleMin: 0.50,
        hScaleMax: 1.30
    },
    {
        id: 'ring5_far',
        name: 'Ring 5 (Distant Field)',
        segments: 1,
        bladesPerTuft: 3,
        cellSize: 1.65,
        patchSize: 890.0,
        bladeWidth: 0.145,
        maxBladeHeight: 1.25,
        fadeInMin: 200.0,
        fadeInMax: 290.0,
        fadeOutMin: 310.0,
        fadeOutMax: 420.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.10,
        curveMax: 0.32,
        hScaleMin: 0.55,
        hScaleMax: 1.35
    },
    {
        id: 'ring6_horizon',
        name: 'Ring 6 (Horizon Sea)',
        segments: 1,
        bladesPerTuft: 2,
        cellSize: 2.45,
        patchSize: 1220.0,
        bladeWidth: 0.220,
        maxBladeHeight: 1.35,
        fadeInMin: 310.0,
        fadeInMax: 420.0,
        fadeOutMin: 440.0,
        fadeOutMax: 560.0,
        enableTrample: false,
        leanMin: 0.06,
        leanMax: 0.30,
        curveMin: 0.10,
        curveMax: 0.30,
        hScaleMin: 0.60,
        hScaleMax: 1.40
    }
];

export const DEFAULT_GRASS_CONFIG = {
    adaptiveDensity: {
        enabled: true,
        targetTrianglesPerRing: 1200000,
        cullingCompensation: 1.35
    },
    flora: {
        flowerFrequency: 0.08,
        cloverFrequency: 0.10,
        wheatFrequency: 0.08,
        twistIntensity: 0.95,
        flowerColors: [
            [0.95, 0.22, 0.20], // Poppy Crimson
            [0.98, 0.82, 0.14], // Buttercup Golden
            [0.22, 0.55, 0.95], // Cornflower Blue
            [0.98, 0.98, 0.95]  // Daisy White
        ]
    },
    rings: DEFAULT_GRASS_RINGS,
    // Authentic Grassworks 5-Color Gradient
    colors: {
        colRoot:  [0.020, 0.078, 0.008],
        colLower: [0.078, 0.176, 0.024],
        colMid:   [0.180, 0.361, 0.078],
        colUpper: [0.302, 0.478, 0.118],
        colTip:   [0.420, 0.522, 0.157]
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
        if (customConfig && customConfig.flora) {
            this.config.flora = Object.assign({}, DEFAULT_GRASS_CONFIG.flora, customConfig.flora);
        }
        if (customConfig && customConfig.adaptiveDensity) {
            this.config.adaptiveDensity = Object.assign({}, DEFAULT_GRASS_CONFIG.adaptiveDensity, customConfig.adaptiveDensity);
        }

        // Apply calibrated performance scaling from in-race benchmark if saved in localStorage
        try {
            const rawProfile = typeof localStorage !== 'undefined' ? localStorage.getItem('model3d_racing_perf_profile') : null;
            if (rawProfile) {
                const profile = JSON.parse(rawProfile);
                if (profile && profile.recommendedCellScale && profile.recommendedCellScale !== 1.0) {
                    for (const r of this.config.rings) {
                        r.cellSize *= profile.recommendedCellScale;
                    }
                }
            }
        } catch (_) {}

        this.elapsedTime = 0;
        this.rings = [];

        this._initCommonShaders();
        this._initTextures();
        this._buildConcentricRings();

        // Attempt async config load from configure/grass.json without blocking immediate render
        this._loadConfig();
    }

    _initCommonShaders() {
        this.commonVertexShader = `
            attribute vec3 aOrigin;
            attribute vec3 aDir;
            attribute vec2 aUV;
            attribute vec3 aParams;   // x: widthTaper, y: heightScale, z: curveAmt
            attribute float aLean;
            attribute vec2 aTint;     // x: cluster, y: individual
            attribute vec4 aFlora;    // x: plantType, y: twistRate, z: curveMode, w: colorSeed

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
            uniform float uFadeInMin;
            uniform float uFadeInMax;
            uniform float uFadeOutMin;
            uniform float uFadeOutMax;
            uniform float uDayTime;
            uniform vec3 uColRoot;
            uniform vec3 uColLower;
            uniform vec3 uColMid;
            uniform vec3 uColUpper;
            uniform vec3 uColTip;
            uniform vec3 uSunDir;
            uniform vec2 uCloudOffset;
            uniform float uCloudShadowIntensity;
            uniform float uLightning;
            uniform float uWindSpeed;
            uniform vec3 uFlowerCol0;
            uniform vec3 uFlowerCol1;
            uniform vec3 uFlowerCol2;
            uniform vec3 uFlowerCol3;
            uniform float uSeasonTime;

            varying vec3 vColor;

            ${GLSL_TERRAIN_HEIGHT}

            void main() {
                vec3 origin = aOrigin;
                float halfPatch = uPatchSize * 0.5;
                origin.x = mod(origin.x - uPlayerPosition.x + halfPatch, uPatchSize) - halfPatch;
                origin.z = mod(origin.z - uPlayerPosition.z + halfPatch, uPatchSize) - halfPatch;

                // Radial distance from player in moving toroidal coordinate space
                float distFromCam = length(origin.xz);

                // Smooth radial cross-fading
                float fadeIn = (uFadeInMax > 0.0) ? smoothstep(uFadeInMin, uFadeInMax, distFromCam) : 1.0;
                float fadeOut = 1.0 - smoothstep(uFadeOutMin, uFadeOutMax, distFromCam);
                float fade = fadeIn * fadeOut;

                // CRITICAL: Mathematically discard any vertex beyond the inscribed circle.
                if (fade <= 0.0005) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    return;
                }

                vec2 worldXZ = vec2(uPlayerPosition.x + origin.x, uPlayerPosition.z + origin.z);

                // Road clearance check: discard grass growing inside asphalt ribbon
                float minRD = 999.0;
                for (int r = 0; r < 32; r++) {
                    if (r >= uRoadCount) break;
                    float d = length(worldXZ - uRoadPoints[r].xz);
                    if (d < minRD) minRD = d;
                }
                if (minRD < 6.4) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    return;
                } else if (minRD < 8.2) {
                    fade *= smoothstep(6.4, 8.2, minRD);
                }

                float terrainY = getTerrainHeight(worldXZ);

                // Frustum Pre-Cull: Drop blades behind camera if beyond 20m near safety zone
                vec3 camFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
                vec3 toBlade = vec3(worldXZ.x, terrainY, worldXZ.y) - cameraPosition;
                if (dot(toBlade, camFwd) < -22.0) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    return;
                }

                // Power curve preserve: prevents blades from collapsing into a mowed depression in overlap zones!
                float fadeH = pow(fade, 0.42);

                float noiseH = texture2D(uNoiseTexture, worldXZ * 0.08).r * 0.45
                             + texture2D(uNoiseTexture, worldXZ * 0.035).g * 0.35
                             + texture2D(uNoiseTexture, worldXZ * 0.12).b * 0.20;

                float plantType = aFlora.x;
                float heightMod = (plantType >= 1.5 && plantType < 2.5) ? 1.30 : (plantType >= 0.5 && plantType < 1.5) ? 0.65 : 1.0;
                float bladeH = noiseH * uMaxBladeHeight * 1.65 * aParams.y * heightMod * fadeH;

                float t = aUV.y;
                float side = aUV.x;
                vec3 pos = vec3(worldXZ.x, terrainY, worldXZ.y);

                // 3D Axial Twist: rotate blade sideDir around spine
                float twistAngle = aFlora.y * t;
                float cosTw = cos(twistAngle);
                float sinTw = sin(twistAngle);
                vec3 origSide = vec3(-aDir.z, 0.0, aDir.x);
                vec3 sideDir = vec3(
                    origSide.x * cosTw - aDir.x * sinTw,
                    0.0,
                    origSide.z * cosTw - aDir.z * sinTw
                );

                // Species Width Profiling:
                float widthMult = aParams.x;
                if (plantType >= 2.5) {
                    // Wildflowers: slender stem at base, blossom petals blooming at tip
                    float blossom = smoothstep(0.78, 0.95, t);
                    widthMult = mix(0.38, 2.85, blossom);
                } else if (plantType >= 1.5) {
                    // Wheat / Barley: swell upper grain head
                    float plume = smoothstep(0.65, 0.88, t) * (1.0 - smoothstep(0.88, 1.0, t) * 0.45);
                    widthMult = mix(0.75, 2.10, plume);
                } else if (plantType >= 0.5) {
                    // Clover / Broadleaf: wide rounded leaves
                    widthMult *= 2.30;
                }

                pos += sideDir * (side * uBladeWidth * widthMult * 0.5 * fadeH);
                pos.y += t * bladeH;

                float leanDist = aLean * t * bladeH * 1.1;
                pos += aDir * leanDist;
                pos.y -= leanDist * aLean * 0.28;

                // Curvature Profile:
                float bend;
                float curveMode = aFlora.z;
                if (curveMode > 0.7) {
                    // Heavy Droop (weighted flower / seedhead tip)
                    bend = pow(t, 1.45) * 1.25;
                } else if (curveMode > 0.3) {
                    // S-Curve wavy wild grass
                    bend = (t * t * t - 0.35 * t) * 1.2;
                } else {
                    // Natural parabolic arch
                    bend = t * t;
                }

                pos += aDir * (bend * aParams.z * bladeH * 0.60);
                pos.y -= bend * aParams.z * bladeH * 0.25;

                // Next-Gen Wind Simulation: Directional dual-frequency gusts + scrolling curl noise
                vec2 windDir = normalize(vec2(0.82, 0.57));
                float windPhase = dot(worldXZ, windDir) * 0.075 + uTime * 2.4;
                float gust = sin(windPhase) * 0.15 + sin(windPhase * 2.3 + worldXZ.x * 0.04) * 0.06;

                vec2 scrollUV = worldXZ * 0.024 + vec2(uTime * 0.05, uTime * 0.03);
                float curlGust = (texture2D(uNoiseTexture, scrollUV).r - 0.5) * 0.30;

                float windSway = (plantType >= 1.5 && plantType < 2.5) ? 1.35 : (plantType >= 0.5 && plantType < 1.5) ? 0.45 : 1.0;
                float totalWind = (gust + curlGust) * bend * bladeH * windSway * uWindSpeed;
                pos.xz += windDir * totalWind;
                pos.y -= abs(totalWind) * 0.20;

                #ifdef ENABLE_TRAMPLE
                for (int v = 0; v < 8; v++) {
                    if (v >= uVehicleCount) break;
                    vec3 vPos = uVehiclePositions[v];
                    vec2 dV = worldXZ - vPos.xz;
                    float distV = length(dV);
                    float trampleRadius = 6.4;
                    if (distV < trampleRadius && abs(terrainY - vPos.y) < 3.0) {
                        float pushFactor = (1.0 - distV / trampleRadius);
                        pushFactor = pushFactor * pushFactor;
                        vec2 pushDir = distV > 0.01 ? normalize(dV) : vec2(0.0, 1.0);
                        pos.xz += pushDir * (pushFactor * 3.4 * t);
                        pos.y -= pushFactor * bladeH * 0.90 * t;
                    }
                }
                #endif

                // Authentic 5-Color Base Gradient
                vec3 c = mix(uColRoot, uColLower, smoothstep(0.0, 0.22, t));
                c = mix(c, uColMid, smoothstep(0.22, 0.52, t));
                c = mix(c, uColUpper, smoothstep(0.52, 0.82, t));
                c = mix(c, uColTip, smoothstep(0.82, 1.0, t));
                c *= mix(vec3(0.88, 1.04, 0.82), vec3(1.12, 0.96, 0.74), aTint.x);
                c *= (0.78 + aTint.y * 0.44);

                // Multi-Species Color Overrides:
                if (plantType >= 2.5) {
                    // Wildflowers
                    float blossom = smoothstep(0.78, 0.94, t);
                    vec3 flowerCol;
                    float fSeed = aFlora.w;
                    if (fSeed < 0.25) {
                        flowerCol = uFlowerCol0; // Poppy Crimson
                    } else if (fSeed < 0.50) {
                        flowerCol = uFlowerCol1; // Buttercup Golden
                    } else if (fSeed < 0.75) {
                        flowerCol = uFlowerCol2; // Cornflower Azure
                    } else {
                        flowerCol = uFlowerCol3; // Daisy White
                    }
                    if (fSeed >= 0.75 && t > 0.88 && abs(side) < 0.35) {
                        flowerCol = uFlowerCol1; // Daisy gold center
                    }
                    c = mix(c, flowerCol, blossom);
                } else if (plantType >= 1.5) {
                    // Wheat / Barley Grain
                    float plume = smoothstep(0.65, 0.85, t);
                    vec3 wheatCol = vec3(0.86, 0.73, 0.38) * (0.85 + aFlora.w * 0.30);
                    c = mix(c, wheatCol, plume);
                } else if (plantType >= 0.5) {
                    // Clover / Broadleaf
                    vec3 cloverCol = vec3(0.08, 0.28, 0.09) * (0.85 + aFlora.w * 0.30);
                    c = mix(c, cloverCol, 0.65);
                }

                // Dynamic Seasonal / Time-Based Color Shifting across Spring, Summer, Autumn, Winter
                if (uSeasonTime > 0.0001) {
                    float sCycle = fract(uSeasonTime);
                    vec3 autumnTint = vec3(1.18, 0.96, 0.65);
                    vec3 frostTint = vec3(0.85, 0.96, 1.05);
                    float autumnBlend = smoothstep(0.35, 0.62, sCycle) * (1.0 - smoothstep(0.65, 0.88, sCycle));
                    float frostBlend = smoothstep(0.70, 0.92, sCycle);
                    c = mix(c, c * autumnTint + vec3(0.06, 0.04, 0.0) * t, autumnBlend * 0.75);
                    c = mix(c, c * frostTint + vec3(0.03, 0.05, 0.07) * t, frostBlend * 0.60);
                }

                // Drifting Cloud Shadows
                float cShadowN = texture2D(uNoiseTexture, worldXZ * 0.0035 + uCloudOffset).r * 0.65
                               + texture2D(uNoiseTexture, worldXZ * 0.008 + uCloudOffset * 1.3).g * 0.35;
                float cloudShadow = smoothstep(0.38, 0.72, cShadowN) * uCloudShadowIntensity;
                c *= (1.0 - cloudShadow * 0.50);

                // Lightning Flash Illumination
                c += vec3(0.42, 0.52, 0.68) * uLightning;

                // Height-Graded Ambient Occlusion: deep darkness at roots, luminous at tips
                float ao = pow(t, 0.55) * 0.72 + 0.28;

                // Subsurface Scattering (SSS) / Translucent Backlight:
                vec3 viewDir = normalize(cameraPosition - pos);
                vec3 sDir = normalize(uSunDir);
                float sssDot = max(0.0, dot(-viewDir, sDir));
                float sssIntensity = (plantType >= 2.5) ? 0.75 : (plantType >= 1.5) ? 0.55 : 0.42;
                float sss = pow(sssDot, 3.2) * sssIntensity * t;
                vec3 sssGlow = mix(uColUpper, (plantType >= 2.5) ? c : uColTip, 0.65) * sss * 1.6;

                vColor = (c * ao) + sssGlow;

                gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
            }
        `;

        this.commonFragmentShader = `
            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `;
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

    _calculateAdaptiveDensity(opts) {
        const adConfig = this.config.adaptiveDensity || {};
        if (!adConfig.enabled) {
            return opts.cellSize || 0.5;
        }

        const baseTargetTris = adConfig.targetTrianglesPerRing || 1200000;
        const comp = adConfig.cullingCompensation || 1.35;
        const patchSize = opts.patchSize || 140.0;
        const bladesPerTuft = opts.bladesPerTuft || 4;
        const segments = opts.segments || 2;

        // Frustum factor (~0.48 visible) + fade envelope utilization
        const fadeOut = opts.fadeOutMax || (patchSize * 0.45);
        const fadeIn = opts.fadeInMin || 0.0;
        const activeArea = Math.PI * Math.max(1.0, (fadeOut * fadeOut - fadeIn * fadeIn));
        const patchArea = patchSize * patchSize;
        const coverageRatio = Math.max(0.10, Math.min(1.0, activeArea / patchArea));

        const effectiveFrustumFraction = 0.48;
        const visibleFraction = coverageRatio * effectiveFrustumFraction;

        // Scale budget: nearer rings get slightly higher share
        const lodMultiplier = (segments > 1) ? 1.25 : 0.85;
        const targetTris = baseTargetTris * lodMultiplier;

        // Tris per blade = segments * 2
        const effectiveCapacity = Math.max(15000, targetTris / (segments * 2 * visibleFraction * comp));
        const tuftsRequired = effectiveCapacity / bladesPerTuft;
        const cellsPerAxis = Math.max(10, Math.sqrt(tuftsRequired));
        const adaptiveCellSize = patchSize / cellsPerAxis;

        // Clamp to sensible physical bounds relative to base cellSize
        const baseCell = opts.cellSize || 0.5;
        const minCell = Math.max(0.08, baseCell * 0.75);
        const maxCell = Math.max(minCell, baseCell * 1.35);
        return Math.min(maxCell, Math.max(minCell, adaptiveCellSize));
    }

    _createRingMesh(opts) {
        const {
            segments = 2,
            bladesPerTuft = 6,
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
            curveMin = 0.12,
            curveMax = 0.38
        } = opts;

        // Mathematical guarantee against square bounding-box artifacts:
        const minPatchRequired = Math.ceil(fadeOutMax * 2.15);
        const patchSize = Math.max(opts.patchSize || 0, minPatchRequired);

        // Adaptive density calculation
        const cellSize = this._calculateAdaptiveDensity(Object.assign({}, opts, { patchSize }));

        const floraConfig = this.config.flora || {};
        const flowerFreq = floraConfig.flowerFrequency !== undefined ? floraConfig.flowerFrequency : 0.08;
        const cloverFreq = floraConfig.cloverFrequency !== undefined ? floraConfig.cloverFrequency : 0.10;
        const wheatFreq = floraConfig.wheatFrequency !== undefined ? floraConfig.wheatFrequency : 0.08;
        const twistIntensity = floraConfig.twistIntensity !== undefined ? floraConfig.twistIntensity : 0.95;

        const VERTS_PER_BLADE = (segments + 1) * 2;
        const TRIS_PER_BLADE = segments * 2;
        const IDX_PER_BLADE = TRIS_PER_BLADE * 3;

        const cellsPerAxis = Math.floor(patchSize / cellSize);
        const tuftCount = cellsPerAxis * cellsPerAxis;
        const totalBlades = tuftCount * bladesPerTuft;

        const bladeVerts = [];
        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const w = Math.max(0.0, 1.0 - t * 0.85);
            bladeVerts.push({ side: -1, t, w });
            bladeVerts.push({ side: 1, t, w });
        }
        const idxTemplate = [];
        for (let s = 0; s < segments; s++) {
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
        const flora = new Float32Array(totalVerts * 4);
        const indices = new Uint32Array(totalIndices);

        let pI = 0, oI = 0, dI = 0, uI = 0, pmI = 0, lI = 0, tI = 0, flI = 0, iI = 0, gvb = 0;
        const half = patchSize * 0.5;

        for (let cy = 0; cy < cellsPerAxis; cy++) {
            for (let cx = 0; cx < cellsPerAxis; cx++) {
                const bx = cx * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const bz = cy * cellSize - half + (Math.random() * 0.7 + 0.15) * cellSize;
                const ct = Math.random();

                for (let b = 0; b < bladesPerTuft; b++) {
                    const yaw = Math.random() * Math.PI * 2;
                    const dx = Math.sin(yaw), dz = -Math.cos(yaw);
                    const lean = leanMin + Math.random() * (leanMax - leanMin);
                    const hScale = hScaleMin + Math.random() * (hScaleMax - hScaleMin);
                    const curve = curveMin + Math.random() * (curveMax - curveMin);
                    const bt = Math.random();
                    const jx = bx + (Math.random() - 0.5) * (cellSize * 0.35);
                    const jz = bz + (Math.random() - 0.5) * (cellSize * 0.35);

                    // Flora species distribution: 0 = Grass, 1 = Clover, 2 = Wheat, 3 = Wildflower
                    const roll = Math.random();
                    let pType = 0.0;
                    if (roll < flowerFreq) {
                        pType = 3.0;
                    } else if (roll < flowerFreq + cloverFreq) {
                        pType = 1.0;
                    } else if (roll < flowerFreq + cloverFreq + wheatFreq) {
                        pType = 2.0;
                    }

                    // Axial twist: [-1.2, +1.2] * twistIntensity
                    const twist = (Math.random() * 2.4 - 1.2) * twistIntensity;
                    // Curvature mode: 0.0 = Arch, 0.5 = S-Curve, 1.0 = Heavy Droop
                    let curveMode = Math.random();
                    if (pType === 3.0 || pType === 2.0) {
                        curveMode = Math.random() < 0.65 ? 1.0 : 0.0;
                    }
                    const colorSeed = Math.random();

                    for (let v = 0; v < bladeVerts.length; v++) {
                        const bv = bladeVerts[v];
                        positions[pI++] = jx; positions[pI++] = 0; positions[pI++] = jz;
                        origins[oI++] = jx; origins[oI++] = 0; origins[oI++] = jz;
                        dirs[dI++] = dx; dirs[dI++] = 0; dirs[dI++] = dz;
                        uvs[uI++] = bv.side; uvs[uI++] = bv.t;
                        params[pmI++] = bv.w; params[pmI++] = hScale; params[pmI++] = curve;
                        leans[lI++] = lean;
                        tints[tI++] = ct; tints[tI++] = bt;
                        flora[flI++] = pType; flora[flI++] = twist; flora[flI++] = curveMode; flora[flI++] = colorSeed;
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
        geometry.setAttribute('aFlora', new THREE.BufferAttribute(flora, 4));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        const uniforms = {
            uTime:             { value: 0 },
            uNoiseTexture:     { value: this.noiseTexture },
            uPlayerPosition:   { value: new THREE.Vector3() },
            uVehiclePositions: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
            uVehicleCount:     { value: 0 },
            uRoadPoints:       { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
            uRoadCount:        { value: 0 },
            uPatchSize:        { value: patchSize },
            uBladeWidth:       { value: bladeWidth },
            uMaxBladeHeight:   { value: maxBladeHeight },
            uFadeInMin:        { value: fadeInMin },
            uFadeInMax:        { value: fadeInMax },
            uFadeOutMin:       { value: fadeOutMin },
            uFadeOutMax:       { value: fadeOutMax },
            uDayTime:          { value: 0.15 },
            uColRoot:          { value: new THREE.Vector3(...this.config.colors.colRoot) },
            uColLower:         { value: new THREE.Vector3(...this.config.colors.colLower) },
            uColMid:           { value: new THREE.Vector3(...this.config.colors.colMid) },
            uColUpper:         { value: new THREE.Vector3(...this.config.colors.colUpper) },
            uColTip:           { value: new THREE.Vector3(...this.config.colors.colTip) },
            uSunDir:           { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
            uCloudOffset:      { value: new THREE.Vector2() },
            uCloudShadowIntensity: { value: 0.15 },
            uLightning:        { value: 0.0 },
            uWindSpeed:        { value: 1.0 },
            uFlowerCol0:       { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[0] || [0.95, 0.22, 0.20])) },
            uFlowerCol1:       { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[1] || [0.98, 0.82, 0.14])) },
            uFlowerCol2:       { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[2] || [0.22, 0.55, 0.95])) },
            uFlowerCol3:       { value: new THREE.Vector3(...(this.config.flora?.flowerColors?.[3] || [0.98, 0.98, 0.95])) },
            uSeasonTime:       { value: 0.0 }
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
        this.scene.add(mesh);

        return { mesh, uniforms, geometry, material };
    }

    _buildConcentricRings() {
        this._disposeRings();

        const ringList = (this.config.rings && this.config.rings.length > 0)
            ? this.config.rings
            : DEFAULT_GRASS_RINGS;

        for (const ringCfg of ringList) {
            const r = this._createRingMesh({
                id: ringCfg.id || 'ring',
                segments: ringCfg.segments !== undefined ? ringCfg.segments : (this.config.bladeSegments || 2),
                bladesPerTuft: ringCfg.bladesPerTuft !== undefined ? ringCfg.bladesPerTuft : (this.config.bladesPerTuft || 4),
                patchSize: ringCfg.patchSize,
                cellSize: ringCfg.cellSize || 0.6,
                bladeWidth: ringCfg.bladeWidth || 0.05,
                maxBladeHeight: ringCfg.maxBladeHeight || 1.0,
                fadeInMin: ringCfg.fadeInMin !== undefined ? ringCfg.fadeInMin : 0.0,
                fadeInMax: ringCfg.fadeInMax !== undefined ? ringCfg.fadeInMax : 0.0,
                fadeOutMin: ringCfg.fadeOutMin !== undefined ? ringCfg.fadeOutMin : 80.0,
                fadeOutMax: ringCfg.fadeOutMax !== undefined ? ringCfg.fadeOutMax : 120.0,
                enableTrample: !!ringCfg.enableTrample,
                leanMin: ringCfg.leanMin !== undefined ? ringCfg.leanMin : (this.config.leanMin || 0.06),
                leanMax: ringCfg.leanMax !== undefined ? ringCfg.leanMax : (this.config.leanMax || 0.32),
                hScaleMin: ringCfg.hScaleMin !== undefined ? ringCfg.hScaleMin : (this.config.hScaleMin || 0.45),
                hScaleMax: ringCfg.hScaleMax !== undefined ? ringCfg.hScaleMax : (this.config.hScaleMax || 1.25),
                curveMin: ringCfg.curveMin !== undefined ? ringCfg.curveMin : (this.config.curveMin || 0.14),
                curveMax: ringCfg.curveMax !== undefined ? ringCfg.curveMax : (this.config.curveMax || 0.36)
            });
            this.rings.push(r);
        }
    }

    _disposeRings() {
        for (const r of this.rings) {
            if (r.mesh) {
                this.scene.remove(r.mesh);
                if (r.geometry) r.geometry.dispose();
                if (r.material) r.material.dispose();
            }
        }
        this.rings = [];
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
        if (newConfig.flora) {
            this.config.flora = Object.assign({}, prev.flora || {}, newConfig.flora);
        }
        if (newConfig.adaptiveDensity) {
            this.config.adaptiveDensity = Object.assign({}, prev.adaptiveDensity || {}, newConfig.adaptiveDensity);
        }
        if (newConfig.rings) {
            this.config.rings = newConfig.rings;
        }

        // Rebuild rings if rings configuration, flora, adaptive density, or structural geometry changed
        const ringCountChanged = !prev.rings || !this.config.rings || prev.rings.length !== this.config.rings.length;
        let ringStructureChanged = ringCountChanged || !!newConfig.flora || !!newConfig.adaptiveDensity;
        if (!ringStructureChanged && this.config.rings) {
            for (let i = 0; i < this.config.rings.length; i++) {
                const pR = prev.rings[i];
                const nR = this.config.rings[i];
                if (!pR || !nR ||
                    pR.cellSize !== nR.cellSize ||
                    pR.patchSize !== nR.patchSize ||
                    pR.bladesPerTuft !== nR.bladesPerTuft ||
                    pR.segments !== nR.segments ||
                    pR.enableTrample !== nR.enableTrample) {
                    ringStructureChanged = true;
                    break;
                }
            }
        }

        if (ringStructureChanged) {
            this._buildConcentricRings();
        } else {
            // Update dynamic uniforms without reallocating buffers
            for (let i = 0; i < this.rings.length; i++) {
                const ring = this.rings[i];
                const ringCfg = (this.config.rings && this.config.rings[i]) ? this.config.rings[i] : null;
                const u = ring.uniforms;

                if (ringCfg) {
                    if (ringCfg.bladeWidth !== undefined) u.uBladeWidth.value = ringCfg.bladeWidth;
                    if (ringCfg.maxBladeHeight !== undefined) u.uMaxBladeHeight.value = ringCfg.maxBladeHeight;
                    if (ringCfg.fadeInMin !== undefined) u.uFadeInMin.value = ringCfg.fadeInMin;
                    if (ringCfg.fadeInMax !== undefined) u.uFadeInMax.value = ringCfg.fadeInMax;
                    if (ringCfg.fadeOutMin !== undefined) u.uFadeOutMin.value = ringCfg.fadeOutMin;
                    if (ringCfg.fadeOutMax !== undefined) u.uFadeOutMax.value = ringCfg.fadeOutMax;
                }

                if (this.config.colors) {
                    u.uColRoot.value.set(...this.config.colors.colRoot);
                    u.uColLower.value.set(...this.config.colors.colLower);
                    u.uColMid.value.set(...this.config.colors.colMid);
                    u.uColUpper.value.set(...this.config.colors.colUpper);
                    u.uColTip.value.set(...this.config.colors.colTip);
                }

                if (this.config.flora && this.config.flora.flowerColors) {
                    if (this.config.flora.flowerColors[0]) u.uFlowerCol0.value.set(...this.config.flora.flowerColors[0]);
                    if (this.config.flora.flowerColors[1]) u.uFlowerCol1.value.set(...this.config.flora.flowerColors[1]);
                    if (this.config.flora.flowerColors[2]) u.uFlowerCol2.value.set(...this.config.flora.flowerColors[2]);
                    if (this.config.flora.flowerColors[3]) u.uFlowerCol3.value.set(...this.config.flora.flowerColors[3]);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE — Per-frame uniform updates for all concentric rings
    // ═══════════════════════════════════════════════════════════════
    update(delta, playerPos, dayTime, vehiclePositions = [], trackData = null, sunDir = null, weather = null) {
        this.elapsedTime += delta;
        this.elapsedSeason = (this.elapsedSeason || 0) + delta * 0.0035;

        // Calculate active road points once for all rings
        const roadPts = [];
        if (trackData && trackData.points && playerPos) {
            const pts = trackData.points;
            for (let i = 0; i < pts.length && roadPts.length < 32; i += 2) {
                const p = pts[i];
                const dx = p.x - playerPos.x;
                const dz = p.z - playerPos.z;
                if (dx * dx + dz * dz < 40000) {
                    roadPts.push(p);
                }
            }
        }

        const maxVehicles = Math.min(vehiclePositions.length, 8);

        for (const ring of this.rings) {
            const u = ring.uniforms;
            u.uTime.value = this.elapsedTime;
            u.uSeasonTime.value = this.elapsedSeason;
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

    destroy() {
        this._disposeRings();
        if (this.noiseTexture) this.noiseTexture.dispose();
    }
}
