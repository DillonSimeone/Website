import * as THREE from 'three';
import { getTerrainHeight, GLSL_TERRAIN_HEIGHT } from './terrain.js';

/**
 * GrassField — Peter Adams (Antaeus AR) GhibliGrass with Dynamic Vehicle Trample
 * 
 * Features:
 * - 160,000 individual triangle blades (480,000 vertices) in a single geometry
 * - Expansive 140m x 140m infinite sliding window centered on the player
 * - Grounded on procedural rolling hills and plains via shared getTerrainHeight
 * - Interactive Vehicle Displacement: Player and NPC rivals part the grass as they drive
 * - Multi-octave Perlin noise texture driving 3D blade bending & turbulent wind
 * - Natural ambient occlusion darkening roots and lighting tips
 * - Edge falloff and organic bald patches
 */
export class GrassField {
    constructor(scene, trackData, trackCenter, trackSize) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;
        this.trackSize = trackSize;

        this.elapsedTime = 0;
        this.mesh = null;
        this.material = null;

        const valleyRadius = Math.max(this.trackSize.x, this.trackSize.z) * 0.5 + 320.0;
        this.boundingBoxMin = new THREE.Vector3(trackCenter.x - valleyRadius, -25.0, trackCenter.z - valleyRadius);
        this.boundingBoxMax = new THREE.Vector3(trackCenter.x + valleyRadius, 65.0, trackCenter.z + valleyRadius);

        this.settings = {
            count: 160000,
            patchSize: 140.0, // Expansive coverage going far and wide across hills
            bladeWidth: 0.10,
            maxBladeHeight: 0.38, // Halved for crisp, neat lawn and meadow coverage
            heightNoiseFrequency: 14.0,
            heightNoiseAmplitude: 1.4,
            randomHeightAmount: 0.18,
            falloffSharpness: 0.38,
            baldPatchModifier: 1.6,
            windDirection: Math.PI * 0.25,
            windSpeed: 0.35,
            windNoiseScale: 0.8,
            maxBendAngle: 28.0
        };

        this._initTextures();
        this._buildGrass();
    }

    _initTextures() {
        // 1. Procedural 256x256 RGB Perlin Noise Texture (R = Height/Bald, G = Wind X, B = Wind Z)
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

                data[idx] = Math.floor(nr * 255);
                data[idx + 1] = Math.floor(ng * 255);
                data[idx + 2] = Math.floor(nb * 255);
                data[idx + 3] = 255;
            }
        }
        nCtx.putImageData(imgData, 0, 0);
        this.noiseTexture = new THREE.CanvasTexture(nCanvas);
        this.noiseTexture.wrapS = THREE.RepeatWrapping;
        this.noiseTexture.wrapT = THREE.RepeatWrapping;

        // 2. Procedural 256x256 Diffuse Grass Map with Ghibli greens and buttercup petals
        const dCanvas = document.createElement('canvas');
        dCanvas.width = 256;
        dCanvas.height = 256;
        const dCtx = dCanvas.getContext('2d');
        dCtx.fillStyle = '#22551a';
        dCtx.fillRect(0, 0, 256, 256);

        for (let i = 0; i < 650; i++) {
            const px = Math.random() * 256;
            const py = Math.random() * 256;
            const pr = 2 + Math.random() * 9;
            const greens = ['#1a4314', '#2d6e22', '#3e882a', '#4da333', '#66bb3e', '#23591b', '#3b7829'];
            dCtx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
            dCtx.beginPath();
            dCtx.arc(px, py, pr, 0, Math.PI * 2);
            dCtx.fill();
        }

        // Golden buttercups
        for (let i = 0; i < 110; i++) {
            const fx = Math.random() * 256;
            const fy = Math.random() * 256;
            dCtx.fillStyle = '#ffd21e';
            dCtx.beginPath();
            dCtx.arc(fx, fy, 2.8, 0, Math.PI * 2);
            dCtx.fill();
            dCtx.fillStyle = '#f39c12';
            dCtx.beginPath();
            dCtx.arc(fx, fy, 1.4, 0, Math.PI * 2);
            dCtx.fill();
        }

        this.diffuseMap = new THREE.CanvasTexture(dCanvas);
        this.diffuseMap.wrapS = THREE.RepeatWrapping;
        this.diffuseMap.wrapT = THREE.RepeatWrapping;
    }

    _buildGrass() {
        const count = this.settings.count;
        const patchSize = this.settings.patchSize;

        const positions = new Float32Array(count * 3 * 3);
        const colors = new Float32Array(count * 3 * 3);
        const uvs = new Float32Array(count * 3 * 2);
        const yaws = new Float32Array(count * 3 * 3);
        const bladeOrigins = new Float32Array(count * 3 * 3);
        const indices = new Uint32Array(count * 3);

        const currentPosition = new THREE.Vector3();
        const yawUnitVec = new THREE.Vector3();
        const uv = new THREE.Vector2();

        const blCol = [0.1, 0.0, 0.0];
        const brCol = [0.0, 0.0, 0.1];
        const tcCol = [1.0, 1.0, 1.0];

        let pIdx = 0;
        let cIdx = 0;
        let uvIdx = 0;
        let yIdx = 0;
        let oIdx = 0;
        let iIdx = 0;

        for (let i = 0; i < count; i++) {
            currentPosition.x = THREE.MathUtils.randFloat(-patchSize * 0.5, patchSize * 0.5);
            currentPosition.y = 0.0;
            currentPosition.z = THREE.MathUtils.randFloat(-patchSize * 0.5, patchSize * 0.5);

            uv.set(
                THREE.MathUtils.mapLinear(currentPosition.x, this.boundingBoxMin.x, this.boundingBoxMax.x, 0, 1),
                THREE.MathUtils.mapLinear(currentPosition.z, this.boundingBoxMin.z, this.boundingBoxMax.z, 0, 1)
            );

            const yaw = Math.random() * Math.PI * 2;
            yawUnitVec.set(Math.sin(yaw), 0, -Math.cos(yaw));

            const vBase = i * 3;

            // Vertex 0: Bottom Left
            positions[pIdx++] = currentPosition.x;
            positions[pIdx++] = 0.0;
            positions[pIdx++] = currentPosition.z;
            colors[cIdx++] = blCol[0]; colors[cIdx++] = blCol[1]; colors[cIdx++] = blCol[2];
            uvs[uvIdx++] = uv.x; uvs[uvIdx++] = uv.y;
            yaws[yIdx++] = yawUnitVec.x; yaws[yIdx++] = yawUnitVec.y; yaws[yIdx++] = yawUnitVec.z;
            bladeOrigins[oIdx++] = currentPosition.x; bladeOrigins[oIdx++] = 0.0; bladeOrigins[oIdx++] = currentPosition.z;

            // Vertex 1: Bottom Right
            positions[pIdx++] = currentPosition.x;
            positions[pIdx++] = 0.0;
            positions[pIdx++] = currentPosition.z;
            colors[cIdx++] = brCol[0]; colors[cIdx++] = brCol[1]; colors[cIdx++] = brCol[2];
            uvs[uvIdx++] = uv.x; uvs[uvIdx++] = uv.y;
            yaws[yIdx++] = yawUnitVec.x; yaws[yIdx++] = yawUnitVec.y; yaws[yIdx++] = yawUnitVec.z;
            bladeOrigins[oIdx++] = currentPosition.x; bladeOrigins[oIdx++] = 0.0; bladeOrigins[oIdx++] = currentPosition.z;

            // Vertex 2: Top Center
            positions[pIdx++] = currentPosition.x;
            positions[pIdx++] = 0.0;
            positions[pIdx++] = currentPosition.z;
            colors[cIdx++] = tcCol[0]; colors[cIdx++] = tcCol[1]; colors[cIdx++] = tcCol[2];
            uvs[uvIdx++] = uv.x; uvs[uvIdx++] = uv.y;
            yaws[yIdx++] = yawUnitVec.x; yaws[yIdx++] = yawUnitVec.y; yaws[yIdx++] = yawUnitVec.z;
            bladeOrigins[oIdx++] = currentPosition.x; bladeOrigins[oIdx++] = 0.0; bladeOrigins[oIdx++] = currentPosition.z;

            indices[iIdx++] = vBase;
            indices[iIdx++] = vBase + 1;
            indices[iIdx++] = vBase + 2;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('aYaw', new THREE.BufferAttribute(yaws, 3));
        geometry.setAttribute('aBladeOrigin', new THREE.BufferAttribute(bladeOrigins, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Shaders with shared terrain height function and vehicle displacement
        const vertexShader = `
            attribute vec3 aYaw;
            attribute vec3 aBladeOrigin;

            uniform float uTime;
            uniform sampler2D uNoiseTexture;
            uniform sampler2D uDiffuseMap;
            uniform vec3 uPlayerPosition;
            uniform vec3 uVehiclePositions[8];
            uniform int uVehicleCount;
            uniform vec3 uBoundingBoxMin;
            uniform vec3 uBoundingBoxMax;
            uniform float uPatchSize;
            uniform float uBladeWidth;
            uniform float uWindDirection;
            uniform float uWindSpeed;
            uniform float uWindNoiseScale;
            uniform float uBaldPatchModifier;
            uniform float uFalloffSharpness;
            uniform float uHeightNoiseFrequency;
            uniform float uHeightNoiseAmplitude;
            uniform float uMaxBendAngle;
            uniform float uMaxBladeHeight;
            uniform float uRandomHeightAmount;

            varying vec3 vColor;

            ${GLSL_TERRAIN_HEIGHT}

            float map(float value, float min1, float max1, float min2, float max2) {
                return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
            }

            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
            }

            mat3 rotate3d(vec3 axis, float angle) {
                axis = normalize(axis);
                float s = sin(angle);
                float c = cos(angle);
                float oc = 1.0 - c;
                return mat3(
                    oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
                );
            }

            void main() {
                vec3 origin = aBladeOrigin;

                // Infinite Sliding Window relative to player
                float halfPatchSize = uPatchSize * 0.5;
                origin.x = mod(origin.x - uPlayerPosition.x + halfPatchSize, uPatchSize) - halfPatchSize;
                origin.z = mod(origin.z - uPlayerPosition.z + halfPatchSize, uPatchSize) - halfPatchSize;

                // Sample exact terrain elevation of the rolling hills & plains!
                vec2 worldXZ = vec2(uPlayerPosition.x + origin.x, uPlayerPosition.z + origin.z);
                float terrainY = getTerrainHeight(worldXZ);
                vec3 worldBase = vec3(worldXZ.x, terrainY, worldXZ.y);
                vec3 transformed = worldBase;

                // Map to bounding box UVs
                vec2 uv = vec2(
                    map(worldBase.x, uBoundingBoxMin.x, uBoundingBoxMax.x, 0.0, 1.0),
                    map(worldBase.z, uBoundingBoxMin.z, uBoundingBoxMax.z, 0.0, 1.0)
                );

                // Height variation using noise
                vec3 heightNoise = texture2D(uNoiseTexture, uv.yx * vec2(uHeightNoiseFrequency)).rgb;
                float heightModifier = ((heightNoise.r + heightNoise.g + heightNoise.b) * uMaxBladeHeight) * uHeightNoiseAmplitude;
                heightModifier += random(uv) * (uRandomHeightAmount * 0.1);

                // Edge falloff for smooth fade far and wide
                float edgeDistanceX = abs(origin.x) / halfPatchSize;
                float edgeDistanceZ = abs(origin.z) / halfPatchSize;
                float edgeFactor = 1.0 - max(edgeDistanceX, edgeDistanceZ);
                edgeFactor = pow(clamp(edgeFactor, 0.0, 1.0), uFalloffSharpness);

                // Random bald patches
                float baldPatchOffset = heightNoise.r * (uBaldPatchModifier * (1.0 - edgeFactor));
                heightModifier = max(0.04, heightModifier - baldPatchOffset);

                // Edge fade
                float edgeFade =
                    smoothstep(uBoundingBoxMin.x, uBoundingBoxMin.x + 12.0, worldBase.x) *
                    smoothstep(uBoundingBoxMax.x, uBoundingBoxMax.x - 12.0, worldBase.x) *
                    smoothstep(uBoundingBoxMin.z, uBoundingBoxMin.z + 12.0, worldBase.z) *
                    smoothstep(uBoundingBoxMax.z, uBoundingBoxMax.z - 12.0, worldBase.z);
                heightModifier *= edgeFade;

                // Width adjustment
                float factor = (color.r == 0.1) ? 1.0 : (color.b == 0.1) ? -1.0 : 0.0;
                float width = smoothstep(0.3, 1.0, heightModifier * 1.5) * uBladeWidth;
                transformed += aYaw * (width * 0.5) * factor;

                // Color sampling & ambient occlusion
                vColor = texture2D(uDiffuseMap, uv * 10.0).rgb * color;
                vec3 colorNoise = texture2D(uNoiseTexture, uv.yx * vec2(uHeightNoiseFrequency) + (uTime * 0.05)).rgb;
                vColor *= (0.65 + colorNoise * 0.35);

                // Natural Wind Sway
                float noiseScale = uWindNoiseScale * 0.1;
                vec2 noiseUV = vec2(origin.x * noiseScale, origin.z * noiseScale);
                mat2 rotation = mat2(
                    cos(uWindDirection), -sin(uWindDirection),
                    sin(uWindDirection), cos(uWindDirection)
                );
                vec2 rotatedNoiseUV = rotation * noiseUV + uTime * vec2(uWindSpeed);
                vec3 windNoise = texture2D(uNoiseTexture, rotatedNoiseUV).rgb;
                vec3 axis = vec3(windNoise.g, 0.0, windNoise.b);

                float angle = radians(map(windNoise.g + windNoise.b, 0.0, 2.0, -uMaxBendAngle, uMaxBendAngle)) * color.g;
                mat3 rotationMatrix = rotate3d(axis, angle);

                vec3 basePosition = vec3(transformed.x, terrainY, transformed.z);
                vec3 relativePosition = transformed - basePosition;
                relativePosition = rotationMatrix * relativePosition;
                transformed = basePosition + relativePosition;
                transformed.y += heightModifier * color.g;

                // =========================================================================
                // DYNAMIC VEHICLE DISPLACEMENT / TRAMPLE (Player & NPC Rivals)
                // Blades are pushed aside radially and flattened down as vehicles pass
                // =========================================================================
                for (int v = 0; v < 8; v++) {
                    if (v >= uVehicleCount) break;
                    vec3 vPos = uVehiclePositions[v];
                    vec2 diff = worldBase.xz - vPos.xz;
                    float dist = length(diff);
                    float pushRadius = 6.4; // Substantially increased radius of displacement around vehicles
                    if (dist < pushRadius && abs(worldBase.y - vPos.y) < 5.0) {
                        float pushFactor = pow(1.0 - dist / pushRadius, 1.25) * color.g;
                        vec2 pushDir = normalize(diff + vec2(0.0001, 0.0001));
                        transformed.xz += pushDir * (pushFactor * 3.4);
                        transformed.y -= pushFactor * 0.95; // decisively flatten blade toward earth
                    }
                }

                gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uDayTime;
            varying vec3 vColor;

            void main() {
                float t = uDayTime;
                float nightFactor = smoothstep(0.44, 0.56, t) * (1.0 - smoothstep(0.78, 0.88, t));
                float sunsetFactor = smoothstep(0.38, 0.48, t) * (1.0 - smoothstep(0.48, 0.58, t));

                vec3 lightTint = vec3(1.0);
                if (sunsetFactor > 0.0) lightTint = mix(lightTint, vec3(1.0, 0.72, 0.48), sunsetFactor);
                if (nightFactor > 0.0) lightTint = mix(lightTint, vec3(0.25, 0.32, 0.55), nightFactor);

                gl_FragColor = vec4(vColor * lightTint, 1.0);
            }
        `;

        // Up to 8 vehicle positions (player + 7 rivals)
        const vehiclePosUniforms = [];
        for (let i = 0; i < 8; i++) {
            vehiclePosUniforms.push(new THREE.Vector3(99999, 99999, 99999));
        }

        this.uniforms = {
            uTime: { value: 0 },
            uNoiseTexture: { value: this.noiseTexture },
            uDiffuseMap: { value: this.diffuseMap },
            uPlayerPosition: { value: new THREE.Vector3() },
            uVehiclePositions: { value: vehiclePosUniforms },
            uVehicleCount: { value: 1 },
            uBoundingBoxMin: { value: this.boundingBoxMin },
            uBoundingBoxMax: { value: this.boundingBoxMax },
            uPatchSize: { value: this.settings.patchSize },
            uBladeWidth: { value: this.settings.bladeWidth },
            uWindDirection: { value: this.settings.windDirection },
            uWindSpeed: { value: this.settings.windSpeed },
            uWindNoiseScale: { value: this.settings.windNoiseScale },
            uBaldPatchModifier: { value: this.settings.baldPatchModifier },
            uFalloffSharpness: { value: this.settings.falloffSharpness },
            uHeightNoiseFrequency: { value: this.settings.heightNoiseFrequency },
            uHeightNoiseAmplitude: { value: this.settings.heightNoiseAmplitude },
            uMaxBendAngle: { value: this.settings.maxBendAngle },
            uMaxBladeHeight: { value: this.settings.maxBladeHeight },
            uRandomHeightAmount: { value: this.settings.randomHeightAmount },
            uDayTime: { value: 0.0 }
        };

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
            vertexColors: true,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
    }

    update(delta, playerPos, dayTime, vehiclePositions = []) {
        this.elapsedTime += delta;
        if (this.uniforms) {
            this.uniforms.uTime.value = this.elapsedTime;
            if (playerPos) {
                this.uniforms.uPlayerPosition.value.copy(playerPos);
            }
            if (dayTime !== undefined) {
                this.uniforms.uDayTime.value = dayTime;
            }

            // Update vehicle trample positions
            const maxVehicles = Math.min(vehiclePositions.length, 8);
            this.uniforms.uVehicleCount.value = maxVehicles;
            for (let v = 0; v < maxVehicles; v++) {
                this.uniforms.uVehiclePositions.value[v].copy(vehiclePositions[v]);
            }
        }
    }
}
