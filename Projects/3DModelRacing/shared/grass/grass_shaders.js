/**
 * shared/grass/grass_shaders.js — Instanced GLSL Shaders with Stochastic Seam Hiding
 *
 * Uses packed InstancedBufferGeometry attributes (48 bytes per blade):
 *   aInstOrigin: vec4(jx, jz, yaw, heightScale)
 *   aInstShape:  vec4(lean, curve, clusterTint, bladeHash)
 *   aInstFlora:  vec4(plantType, twistRate, curveMode, colorSeed)
 *
 * Seam-hiding strategy:
 *   Instead of shrinking all blades in a ring boundary (which causes a stubby dip),
 *   we threshold rawFade against a deterministic per-blade spatial hash so blades
 *   thin out stochastically at full height as the next ring grows between them.
 */
import { GLSL_TERRAIN_HEIGHT } from '../terrain.js';

export function createGrassVertexShader() {
    return `
        attribute vec2 aUV;          // x: side (-1 or +1), y: t (0..1)
        attribute float aWidthTaper; // base width taper along blade height

        attribute vec4 aInstOrigin;  // x: jx, y: jz, z: yaw, w: heightScale
        attribute vec4 aInstShape;   // x: lean, y: curve, z: clusterTint, w: bladeHash
        attribute vec4 aInstFlora;   // x: plantType, y: twistRate, z: curveMode, w: colorSeed

        uniform float uTime;
        uniform sampler2D uNoiseTexture;
        uniform vec3 uPlayerPosition;
        uniform vec3 uVehiclePositions[8];
        uniform int uVehicleCount;
        uniform vec3 uRoadPoints[32];
        uniform int uRoadCount;

        // Optional O(1) Road Mask Texture (activated by non-linear road graph)
        uniform float uUseRoadMask;
        uniform sampler2D uRoadMaskTex;
        uniform vec2 uRoadMaskCenter;
        uniform float uRoadMaskSize;

        uniform float uPatchSize;
        uniform float uBladeWidth;
        uniform float uMaxBladeHeight;
        uniform float uGlobalHeightMult;
        uniform float uGlobalWidthMult;
        uniform float uDensityWidthComp;
        uniform float uFadeInMin;
        uniform float uFadeInMax;
        uniform float uFadeOutMin;
        uniform float uFadeOutMax;
        uniform float uCurvature;
        uniform float uStiffness;
        uniform float uTranslucency;
        uniform float uPatchiness;
        uniform float uDensityDropoff;
        uniform float uRadialJitterAmp;
        uniform float uBoundaryMargin;
        uniform int uCoordMode;
        uniform float uTerrainRelief;
        uniform vec2 uTerrainOffset;
        uniform float uFrustumCosCutoff;

        uniform float uDayTime;
        uniform vec3 uColRoot;
        uniform vec3 uColLower;
        uniform vec3 uColMid;
        uniform vec3 uColUpper;
        uniform vec3 uColTip;
        uniform vec3 uSunDir;
        uniform vec3 uLightTint;
        uniform vec2 uCloudOffset;
        uniform float uCloudShadowIntensity;
        uniform float uLightning;
        uniform float uWindSpeed;

        uniform vec3 uFlowerCol0;
        uniform vec3 uFlowerCol1;
        uniform vec3 uFlowerCol2;
        uniform vec3 uFlowerCol3;
        uniform float uSeasonTime;

        uniform int uShadingFx;
        uniform float uAudioBass;
        uniform float uAudioTreble;

        varying vec3 vColor;
        varying float vFogDepth;

        ${GLSL_TERRAIN_HEIGHT}

        void main() {
            vec2 originXZ;
            vec2 worldXZ;
            float effFadeOutMax = uFadeOutMax;
            float effFadeOutMin;

            if (uCoordMode == 1) {
                float halfPatch = uPatchSize * 0.5;
                originXZ.x = mod(aInstOrigin.x - uPlayerPosition.x + halfPatch, uPatchSize) - halfPatch;
                originXZ.y = mod(aInstOrigin.y - uPlayerPosition.z + halfPatch, uPatchSize) - halfPatch;
                worldXZ = vec2(uPlayerPosition.x + originXZ.x, uPlayerPosition.z + originXZ.y);

                float safeMaxFade = halfPatch - uBoundaryMargin;
                effFadeOutMax = min(uFadeOutMax, safeMaxFade);
                effFadeOutMin = min(uFadeOutMin, effFadeOutMax - 8.0);
            } else {
                originXZ = aInstOrigin.xy;
                worldXZ = originXZ;
                effFadeOutMin = min(uFadeOutMin, effFadeOutMax - 8.0);
            }

            // Continuous multi-frequency organic wave scaled to ring radius (clamped safely inside patch margin)
            float ringJitterScale = max(uRadialJitterAmp, effFadeOutMax * 0.13);
            float wave = sin(worldXZ.x * 0.055 + worldXZ.y * 0.042) * 0.58
                       + cos(worldXZ.x * 0.024 - worldXZ.y * 0.036) * 0.42;
            float radialJitter = wave * ringJitterScale;
            if (uCoordMode == 1) {
                float safeMaxFade = uPatchSize * 0.5 - uBoundaryMargin;
                float negLimit = max(0.0, safeMaxFade - effFadeOutMax - 2.0);
                radialJitter = clamp(radialJitter, -negLimit, ringJitterScale);
            }
            float distFromCam = max(0.0, length(originXZ) + radialJitter);

            float fadeIn = (uFadeInMax > 0.0) ? smoothstep(uFadeInMin, uFadeInMax, distFromCam) : 1.0;
            float fadeOut = 1.0 - smoothstep(effFadeOutMin, effFadeOutMax, distFromCam);
            float rawFade = fadeIn * fadeOut;

            if (rawFade <= 0.002) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                return;
            }

            // Stochastic staggered thinning: keeps surviving blades full-height & lush across ring seams
            float spatialHash = fract(sin(dot(floor(aInstOrigin.xy * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
            float thresh = fract(aInstShape.w * 0.6180339887 + spatialHash * 0.3819660113);
            float densityProb = pow(rawFade, uDensityDropoff);
            float rampW = 0.28;
            float edgeLow = thresh * (1.0 - rampW);
            float bladeFade = smoothstep(edgeLow, edgeLow + rampW, densityProb);

            if (bladeFade <= 0.002) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                return;
            }

            float terrainY = getTerrainHeight(worldXZ + uTerrainOffset) * uTerrainRelief;

            // Frustum cone & behind-camera pre-cull
            vec3 camFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
            vec3 toBlade = vec3(worldXZ.x, terrainY, worldXZ.y) - cameraPosition;
            float fwdDot = dot(toBlade, camFwd);
            if (fwdDot < -18.0) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                return;
            }
            float bladeCamDist = length(toBlade);
            if (bladeCamDist > 28.0 && fwdDot < bladeCamDist * uFrustumCosCutoff) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                return;
            }

            // Elevation-aware road corridor clearance (preserves shaded grass under elevated ramps/bridges)
            float underBridgeShadow = 1.0;
            if (uUseRoadMask > 0.5) {
                vec2 maskUV = (worldXZ - uRoadMaskCenter) / uRoadMaskSize + 0.5;
                if (maskUV.x > 0.0 && maskUV.x < 1.0 && maskUV.y > 0.0 && maskUV.y < 1.0) {
                    vec4 mSample = texture2D(uRoadMaskTex, maskUV);
                    // R = ground-level road suppression (0 = open meadow, 1 = road core)
                    // G = elevated bridge shadow cover (0 = open, 1 = under bridge)
                    if (mSample.r > 0.72) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        return;
                    }
                    bladeFade *= (1.0 - smoothstep(0.15, 0.72, mSample.r));
                    underBridgeShadow = mix(1.0, 0.45, mSample.g);
                    if (bladeFade <= 0.002) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        return;
                    }
                }
            } else if (uRoadCount > 1) {
                float minRD = 999.0;
                float closestRoadY = terrainY;
                for (int r = 0; r < 31; r++) {
                    if (r + 1 >= uRoadCount) break;
                    vec3 pA = uRoadPoints[r];
                    vec3 pB = uRoadPoints[r + 1];
                    vec2 ab = pB.xz - pA.xz;
                    float lenSq = dot(ab, ab);
                    if (lenSq > 0.01) {
                        float tSeg = clamp(dot(worldXZ - pA.xz, ab) / lenSq, 0.0, 1.0);
                        vec2 projXZ = pA.xz + ab * tSeg;
                        float d = length(worldXZ - projXZ);
                        if (d < minRD) {
                            minRD = d;
                            closestRoadY = mix(pA.y, pB.y, tSeg);
                        }
                    }
                }
                float roadHeightAboveGround = closestRoadY - terrainY;
                if (roadHeightAboveGround > 2.2) {
                    // Elevated bridge, sky loop, or tall ramp: keep grass alive with soft underpass shade
                    underBridgeShadow = mix(0.45, 1.0, smoothstep(4.5, 9.0, minRD));
                } else {
                    if (minRD < 5.4) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        return;
                    } else if (minRD < 7.6) {
                        bladeFade *= smoothstep(5.4, 7.6, minRD);
                        if (bladeFade <= 0.002) {
                            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                            return;
                        }
                    }
                }
            }

            float noiseH = texture2D(uNoiseTexture, worldXZ * 0.08).r * 0.45
                         + texture2D(uNoiseTexture, worldXZ * 0.035).g * 0.35
                         + texture2D(uNoiseTexture, worldXZ * 0.12).b * 0.20;

            float plantType = aInstFlora.x;
            float heightMod = (plantType >= 1.5 && plantType < 2.5) ? 1.30 : (plantType >= 0.5 && plantType < 1.5) ? 0.65 : 1.0;
            float fadeH = smoothstep(0.0, 1.0, bladeFade);
            float bladeH = (0.55 + noiseH * 0.90) * uMaxBladeHeight * uGlobalHeightMult * 1.15 * aInstOrigin.w * heightMod * fadeH;

            float t = aUV.y;
            float side = aUV.x;
            float yaw = aInstOrigin.z;
            vec3 aDir = vec3(sin(yaw), 0.0, -cos(yaw));
            vec3 pos = vec3(worldXZ.x, terrainY, worldXZ.y);

            // 3D Axial Twist
            float twistAngle = aInstFlora.y * t;
            float cosTw = cos(twistAngle);
            float sinTw = sin(twistAngle);
            vec3 origSide = vec3(-aDir.z, 0.0, aDir.x);
            vec3 sideDir = vec3(
                origSide.x * cosTw - aDir.x * sinTw,
                0.0,
                origSide.z * cosTw - aDir.z * sinTw
            );

            // Species Width Profiling + coverage-conserving width boost across sparse seams
            float widthMult = aWidthTaper;
            if (plantType >= 2.5) {
                float blossom = smoothstep(0.78, 0.95, t);
                widthMult = mix(0.38, 2.85, blossom);
                if (uShadingFx == 4) {
                    widthMult += uAudioBass * 2.2 * smoothstep(0.65, 1.0, t);
                }
            } else if (plantType >= 1.5) {
                float plume = smoothstep(0.65, 0.88, t) * (1.0 - smoothstep(0.88, 1.0, t) * 0.45);
                widthMult = mix(0.75, 2.10, plume);
            } else if (plantType >= 0.5) {
                widthMult *= 2.30;
            }

            float seamWidthComp = mix(1.26, 1.0, smoothstep(0.15, 0.85, densityProb));
            float distWComp = 1.0 + smoothstep(22.0, 260.0, distFromCam) * 0.32;
            float finalWidth = uBladeWidth * uGlobalWidthMult * uDensityWidthComp * seamWidthComp * distWComp * widthMult * 0.5 * fadeH;

            pos += sideDir * (side * finalWidth);
            pos.y += t * bladeH;

            float aLean = aInstShape.x;
            float leanDist = aLean * t * bladeH * 1.1;
            pos += aDir * leanDist;
            pos.y -= leanDist * aLean * 0.28;

            // Curvature Profile
            float bend;
            float curveMode = aInstFlora.z;
            if (curveMode > 0.7) {
                bend = pow(t, 1.45) * 1.25;
            } else if (curveMode > 0.3) {
                bend = (t * t * t - 0.35 * t) * 1.2;
            } else {
                bend = t * t;
            }

            float droopSpread = (aInstShape.w * aInstShape.w * 1.5 + 0.25);
            float effectiveCurvature = aInstShape.y * uCurvature * droopSpread;
            pos += aDir * (bend * effectiveCurvature * bladeH * 0.60);
            pos.y -= bend * effectiveCurvature * bladeH * 0.25;

            // Dual-Frequency Wind + Scrolling Curl Noise
            vec2 windDir = normalize(vec2(0.82, 0.57));
            float windPhase = dot(worldXZ, windDir) * 0.075 + uTime * 2.4;
            float gust = sin(windPhase) * 0.15 + sin(windPhase * 2.3 + worldXZ.x * 0.04) * 0.06;

            vec2 scrollUV = worldXZ * 0.024 + vec2(uTime * 0.05, uTime * 0.03);
            float curlGust = (texture2D(uNoiseTexture, scrollUV).r - 0.5) * 0.30;

            float windSway = (plantType >= 1.5 && plantType < 2.5) ? 1.35 : (plantType >= 0.5 && plantType < 1.5) ? 0.45 : 1.0;
            float stiff = max(0.05, uStiffness);
            float totalWind = ((gust + curlGust) * bend * bladeH * windSway * uWindSpeed) / stiff;
            pos.xz += windDir * totalWind;
            pos.y -= abs(totalWind) * 0.20;

            #ifdef ENABLE_TRAMPLE
            for (int v = 0; v < 8; v++) {
                if (v >= uVehicleCount) break;
                vec3 vPos = uVehiclePositions[v];
                vec2 dV = worldXZ - vPos.xz;
                float distV = length(dV);
                float trampleRadius = 6.4;
                if (distV < trampleRadius && abs(terrainY - vPos.y) < 3.5) {
                    float pushFactor = 1.0 - distV / trampleRadius;
                    pushFactor = pushFactor * pushFactor;
                    vec2 pushDir = distV > 0.01 ? normalize(dV) : vec2(0.0, 1.0);
                    pos.xz += pushDir * (pushFactor * (3.5 / stiff) * t);
                    pos.y -= (pushFactor / stiff) * bladeH * 0.90 * t;
                }
            }
            #endif

            // 5-Color Base Gradient
            vec3 c = mix(uColRoot, uColLower, smoothstep(0.0, 0.22, t));
            c = mix(c, uColMid, smoothstep(0.22, 0.52, t));
            c = mix(c, uColUpper, smoothstep(0.52, 0.82, t));
            c = mix(c, uColTip, smoothstep(0.82, 1.0, t));
            c *= mix(vec3(0.88, 1.04, 0.82), vec3(1.12, 0.96, 0.74), aInstShape.z);
            c *= (0.78 + aInstShape.w * 0.44);

            // Macro Patchiness
            if (uPatchiness > 0.001) {
                vec2 patchUV = worldXZ * 0.005;
                float pDark = texture2D(uNoiseTexture, patchUV).r - 0.5;
                float pDry = texture2D(uNoiseTexture, patchUV * 1.7 + vec2(0.35, 0.65)).g;
                c *= (1.0 + pDark * uPatchiness * 0.72);
                c = mix(c, c * vec3(1.30, 1.14, 0.55), smoothstep(0.42, 0.76, pDry) * uPatchiness);
            }

            // Wind-Tilt Skylight Shimmer
            c *= (1.0 + abs(gust + curlGust) * uWindSpeed * 0.28 * t);

            // Multi-Species Color Overrides
            if (plantType >= 2.5) {
                float blossom = smoothstep(0.78, 0.94, t);
                vec3 flowerCol;
                float fSeed = aInstFlora.w;
                if (fSeed < 0.25) flowerCol = uFlowerCol0;
                else if (fSeed < 0.50) flowerCol = uFlowerCol1;
                else if (fSeed < 0.75) flowerCol = uFlowerCol2;
                else flowerCol = uFlowerCol3;
                if (fSeed >= 0.75 && t > 0.88 && abs(side) < 0.35) flowerCol = uFlowerCol1;

                if (uShadingFx == 1) {
                    vec3 vDirFx = normalize(cameraPosition - pos);
                    float fresnel = pow(clamp(1.0 - abs(vDirFx.y), 0.0, 1.0), 2.2);
                    vec3 spectral = 0.5 + 0.5 * cos(6.28318 * (t * 1.6 + fresnel * 1.2 + uTime * 0.22 + vec3(0.0, 0.33, 0.67)));
                    flowerCol = mix(flowerCol, spectral * 1.35, 0.65 * smoothstep(0.65, 1.0, t));
                } else if (uShadingFx == 2) {
                    float pulse = sin(uTime * 4.2 + fSeed * 6.28) * 0.5 + 0.5;
                    vec3 bioGlow = mix(vec3(0.0, 0.95, 0.85), vec3(0.88, 0.12, 0.95), sin(uTime * 1.8 + t * 3.0) * 0.5 + 0.5);
                    flowerCol = mix(flowerCol, bioGlow * 1.9, 0.82 * pulse);
                } else if (uShadingFx == 3) {
                    flowerCol = flowerCol * 2.1 + vec3(0.2, 0.05, 0.3);
                } else if (uShadingFx == 4) {
                    float bassPulse = clamp(uAudioBass * 1.6, 0.0, 1.5);
                    flowerCol = mix(flowerCol, flowerCol * (1.2 + bassPulse * 2.2) + vec3(0.35, 0.20, 0.0) * bassPulse, min(1.0, bassPulse));
                }
                c = mix(c, flowerCol, blossom);
            } else if (plantType >= 1.5) {
                float plume = smoothstep(0.65, 0.85, t);
                c = mix(c, vec3(0.86, 0.73, 0.38) * (0.85 + aInstFlora.w * 0.30), plume);
            } else if (plantType >= 0.5) {
                c = mix(c, vec3(0.08, 0.28, 0.09) * (0.85 + aInstFlora.w * 0.30), 0.65);
            }

            // Shading FX Modes on Grass Blades
            vec3 emissiveBoost = vec3(0.0);
            if (uShadingFx == 1) {
                vec3 vDirFx = normalize(cameraPosition - pos);
                float fresnel = pow(clamp(1.0 - abs(vDirFx.y), 0.0, 1.0), 2.2);
                vec3 spectral = 0.5 + 0.5 * cos(6.28318 * (t * 1.6 + fresnel * 1.2 + uTime * 0.22 + vec3(0.0, 0.33, 0.67)));
                c = mix(c, spectral * 1.2, smoothstep(0.65, 1.0, t) * fresnel * 0.75);
            } else if (uShadingFx == 2) {
                float ripple = sin(distFromCam * 0.16 - uTime * 3.5);
                float wave = smoothstep(0.35, 0.95, ripple * 0.5 + 0.5);
                vec3 bioGlow = mix(vec3(0.0, 0.95, 0.85), vec3(0.88, 0.12, 0.95), sin(uTime * 1.8 + t * 3.0) * 0.5 + 0.5);
                emissiveBoost = bioGlow * wave * smoothstep(0.3, 1.0, t) * 0.85;
            } else if (uShadingFx == 3) {
                vec3 neonGrid = mix(vec3(0.06, 0.01, 0.15), vec3(0.0, 0.95, 1.0), smoothstep(0.0, 1.0, t));
                float scanline = sin(t * 30.0 - uTime * 16.0) * 0.5 + 0.5;
                neonGrid += vec3(1.0, 0.05, 0.65) * scanline * 0.55;
                c = mix(c, neonGrid * 0.4, 0.75);
                emissiveBoost = neonGrid * (0.45 + 0.35 * t);
            } else if (uShadingFx == 4) {
                float trebleWave = sin(t * 22.0 - uTime * 28.0) * uAudioTreble;
                emissiveBoost = vec3(0.2, 0.65, 1.0) * max(0.0, trebleWave) * smoothstep(0.35, 1.0, t)
                              + c * uAudioBass * 0.55;
            } else if (uShadingFx == 5) {
                // Toon Cel-Shaded Ghibli: quantized 3-band height illumination + crisp bright tips
                float celBand = floor(clamp(t + 0.12 * sin(worldXZ.x * 0.03), 0.0, 0.99) * 3.0) / 2.0;
                c = mix(c * 0.78, c * 1.24, celBand);
            }

            // Dynamic Seasonal Shifting
            if (uSeasonTime > 0.0001) {
                float sCycle = fract(uSeasonTime);
                vec3 autumnTint = vec3(1.18, 0.96, 0.65);
                vec3 frostTint = vec3(0.85, 0.96, 1.05);
                float autumnBlend = smoothstep(0.35, 0.62, sCycle) * (1.0 - smoothstep(0.65, 0.88, sCycle));
                float frostBlend = smoothstep(0.70, 0.92, sCycle) * (1.0 - smoothstep(0.96, 1.05, sCycle));
                c = mix(c, c * autumnTint + vec3(0.06, 0.04, 0.0) * t, autumnBlend * 0.75);
                c = mix(c, c * frostTint + vec3(0.03, 0.05, 0.07) * t, frostBlend * 0.60);
            }

            // Drifting Cloud Shadows
            float cShadowN = texture2D(uNoiseTexture, worldXZ * 0.0035 + uCloudOffset).r * 0.65
                           + texture2D(uNoiseTexture, worldXZ * 0.008 + uCloudOffset * 1.3).g * 0.35;
            float cloudShadow = smoothstep(0.38, 0.72, cShadowN) * uCloudShadowIntensity;
            c *= (1.0 - cloudShadow * 0.50) * underBridgeShadow;

            // Global Day/Night/Theme Illumination
            c *= uLightTint;
            c += vec3(0.42, 0.52, 0.68) * uLightning;

            float ao = pow(t, 0.55) * 0.72 + 0.28;

            // Subsurface Scattering (SSS) / Translucent Backlight
            vec3 viewDir = normalize(cameraPosition - pos);
            vec3 sDir = normalize(uSunDir);
            float sssDot = max(0.0, dot(-viewDir, sDir));
            float sssIntensity = (plantType >= 2.5) ? 0.85 : (plantType >= 1.5) ? 0.60 : 0.45;
            float sss = pow(sssDot, 3.5) * sssIntensity * t * t;
            vec3 sssGlow = mix(uColUpper, (plantType >= 2.5) ? c : uColTip, 0.65) * sss * (uTranslucency * 2.0) * uLightTint;

            vColor = (c * ao) + sssGlow + emissiveBoost;
            vFogDepth = length(pos - cameraPosition);

            gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }
    `;
}

export function createGrassFragmentShader() {
    return `
        uniform float uFogEnabled;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec3 vColor;
        varying float vFogDepth;

        void main() {
            vec3 col = vColor;
            if (uFogEnabled > 0.5) {
                float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
                col = mix(col, uFogColor, fogFactor);
            }
            gl_FragColor = vec4(col, 1.0);
        }
    `;
}
