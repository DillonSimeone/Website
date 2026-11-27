/**
 * shared/weather_gpu.js — Zero-CPU-Loop GPU Instanced Rain, Snow & Weather Engine
 *
 * Replaces per-frame CPU Matrix4.compose loops over 4,500 particles with a single
 * InstancedBufferGeometry whose vertex shader wraps particles toroidally around
 * the active camera position. Supports both slanted rain streaks and fluttering snow.
 */
import * as THREE from 'three';

export const WEATHER_TYPES = {
    SUNNY: 'SUNNY',
    DRIFTING_CLOUDS: 'DRIFTING_CLOUDS',
    RAIN_STORM: 'RAIN_STORM',
    CLEARING: 'CLEARING'
};

export class WeatherManager {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.autoCycle = options.autoCycle !== undefined ? options.autoCycle : true;
        this.particleCount = options.particleCount || 4000;

        this.currentType = WEATHER_TYPES.SUNNY;
        this.elapsedTime = 0;
        this.stateTimer = 0;
        this.stateDuration = 55.0;

        // Dynamic Weather Parameters
        this.cloudCover = 0.22;
        this.cloudShadowIntensity = 0.15;
        this.rainIntensity = 0.0;
        this.windSpeed = 1.0;
        this.windDir = new THREE.Vector2(0.82, 0.57).normalize();
        this.stormDarkness = 0.0;
        this.fogDensityFactor = 1.0;

        // Interpolation targets
        this.targetCloudCover = 0.22;
        this.targetCloudShadow = 0.15;
        this.targetRain = 0.0;
        this.targetWindSpeed = 1.0;
        this.targetStormDarkness = 0.0;
        this.targetFogDensity = 1.0;

        // Snow mode & manual overrides (used by Frostbite visual mode and Grass Study)
        this.snowMode = false;
        this.manualOverrides = null;

        this.cloudOffset = new THREE.Vector2(0, 0);

        // Lightning state
        this.lightningTimer = 0;
        this.lightningIntensity = 0.0;
        this.nextLightningDelay = 8.0 + Math.random() * 10.0;
        this.isFlashing = false;
        this.onThunderCallback = null;

        this._setupPrecipitationSystem();
    }

    _setupPrecipitationSystem() {
        const COUNT = this.particleCount;
        const volX = 58.0;
        const volY = 34.0;
        const volZ = 58.0;

        // Unit quad centered at origin
        const baseQuad = new THREE.PlaneGeometry(1.0, 1.0);
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = baseQuad.index;
        geo.attributes.position = baseQuad.attributes.position;
        geo.attributes.uv = baseQuad.attributes.uv;

        const offsets = new Float32Array(COUNT * 3);
        const seeds = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) {
            offsets[i * 3 + 0] = Math.random() * volX;
            offsets[i * 3 + 1] = Math.random() * volY;
            offsets[i * 3 + 2] = Math.random() * volZ;
            seeds[i] = Math.random();
        }

        geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
        geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        geo.instanceCount = COUNT;

        this.precipUniforms = {
            uTime:       { value: 0.0 },
            uCameraPos:  { value: new THREE.Vector3() },
            uVolume:     { value: new THREE.Vector3(volX, volY, volZ) },
            uWindDrift:  { value: new THREE.Vector2(6.5, 4.5) },
            uFallSpeed:  { value: 44.0 },
            uOpacity:    { value: 0.0 },
            uSnowMode:   { value: 0.0 },
            uColor:      { value: new THREE.Color(0xbbd8ff) }
        };

        const mat = new THREE.ShaderMaterial({
            uniforms: this.precipUniforms,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: `
                attribute vec3 aOffset;
                attribute float aSeed;

                uniform float uTime;
                uniform vec3 uCameraPos;
                uniform vec3 uVolume;
                uniform vec2 uWindDrift;
                uniform float uFallSpeed;
                uniform float uSnowMode;

                varying vec2 vUv;
                varying float vSeed;

                void main() {
                    vUv = uv;
                    vSeed = aSeed;

                    vec3 halfV = uVolume * 0.5;
                    float speedScale = mix(0.85, 1.20, aSeed);
                    float fall = uFallSpeed * speedScale;

                    // World-anchored toroidal wrapping around camera position
                    vec2 drift = uWindDrift * uTime;
                    if (uSnowMode > 0.5) {
                        drift.x += sin(uTime * 1.8 + aSeed * 18.84) * 1.6;
                        drift.y += cos(uTime * 1.5 + aSeed * 12.56) * 1.6;
                    }

                    vec3 rel;
                    rel.x = mod(aOffset.x + drift.x - uCameraPos.x + halfV.x, uVolume.x) - halfV.x;
                    rel.y = mod(aOffset.y - fall * uTime - uCameraPos.y + halfV.y, uVolume.y) - halfV.y;
                    rel.z = mod(aOffset.z + drift.y - uCameraPos.z + halfV.z, uVolume.z) - halfV.z;

                    vec3 center = uCameraPos + rel;
                    center.y += 2.0;

                    vec3 toCam = normalize(uCameraPos - center);
                    vec3 quadRight;
                    vec3 quadUp;
                    vec2 size;

                    if (uSnowMode > 0.5) {
                        quadUp = vec3(0.0, 1.0, 0.0);
                        quadRight = normalize(cross(quadUp, toCam));
                        quadUp = normalize(cross(toCam, quadRight));
                        float s = mix(0.10, 0.20, aSeed);
                        size = vec2(s, s);
                    } else {
                        vec3 velDir = normalize(vec3(uWindDrift.x, -fall, uWindDrift.y));
                        quadUp = -velDir;
                        quadRight = normalize(cross(toCam, quadUp));
                        size = vec2(0.032, mix(1.0, 1.45, aSeed));
                    }

                    vec3 worldPos = center + quadRight * (position.x * size.x) + quadUp * (position.y * size.y);
                    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                uniform float uSnowMode;
                uniform vec3 uColor;
                varying vec2 vUv;
                varying float vSeed;

                void main() {
                    float alpha = uOpacity;
                    if (uSnowMode > 0.5) {
                        float d = length(vUv - 0.5) * 2.0;
                        float soft = 1.0 - smoothstep(0.15, 1.0, d);
                        alpha *= soft * soft;
                    } else {
                        float edgeX = 1.0 - abs(vUv.x - 0.5) * 2.0;
                        float edgeY = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
                        alpha *= edgeX * edgeY;
                    }
                    if (alpha <= 0.005) discard;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `
        });

        this.rainMesh = new THREE.Mesh(geo, mat);
        this.rainMesh.frustumCulled = false;
        this.rainMesh.visible = false;
        this.rainMesh.renderOrder = 8;
        this.scene.add(this.rainMesh);
    }

    setSnowMode(enabled) {
        this.snowMode = !!enabled;
        if (this.precipUniforms) {
            this.precipUniforms.uSnowMode.value = this.snowMode ? 1.0 : 0.0;
            this.precipUniforms.uColor.value.setHex(this.snowMode ? 0xf2f8ff : 0xbbd8ff);
        }
    }

    setManualOverrides(opts = null) {
        this.manualOverrides = opts;
    }

    setWeather(type, duration = 60.0) {
        this.currentType = type;
        this.stateDuration = duration;
        this.stateTimer = 0;

        switch (type) {
            case WEATHER_TYPES.SUNNY:
                this.targetCloudCover = 0.18;
                this.targetCloudShadow = 0.12;
                this.targetRain = 0.0;
                this.targetWindSpeed = 1.0;
                this.targetStormDarkness = 0.0;
                this.targetFogDensity = 1.0;
                break;
            case WEATHER_TYPES.DRIFTING_CLOUDS:
                this.targetCloudCover = 0.58;
                this.targetCloudShadow = 0.55;
                this.targetRain = 0.0;
                this.targetWindSpeed = 1.35;
                this.targetStormDarkness = 0.15;
                this.targetFogDensity = 0.95;
                break;
            case WEATHER_TYPES.RAIN_STORM:
                this.targetCloudCover = 0.88;
                this.targetCloudShadow = 0.65;
                this.targetRain = 1.0;
                this.targetWindSpeed = 2.6;
                this.targetStormDarkness = 0.65;
                this.targetFogDensity = 0.48;
                this.nextLightningDelay = 4.0 + Math.random() * 6.0;
                break;
            case WEATHER_TYPES.CLEARING:
                this.targetCloudCover = 0.35;
                this.targetCloudShadow = 0.25;
                this.targetRain = 0.10;
                this.targetWindSpeed = 1.15;
                this.targetStormDarkness = 0.10;
                this.targetFogDensity = 0.85;
                break;
        }
    }

    update(delta, cameraPos) {
        this.elapsedTime += delta;

        if (this.manualOverrides) {
            const ov = this.manualOverrides;
            if (ov.rainIntensity !== undefined) this.rainIntensity = ov.rainIntensity;
            if (ov.windSpeed !== undefined) this.windSpeed = ov.windSpeed;
            if (ov.cloudShadowIntensity !== undefined) this.cloudShadowIntensity = ov.cloudShadowIntensity;
            if (ov.stormDarkness !== undefined) this.stormDarkness = ov.stormDarkness;
        } else {
            if (this.autoCycle) {
                this.stateTimer += delta;
                if (this.stateTimer >= this.stateDuration) {
                    this.stateTimer = 0;
                    if (this.currentType === WEATHER_TYPES.SUNNY) {
                        this.setWeather(WEATHER_TYPES.DRIFTING_CLOUDS, 50.0);
                    } else if (this.currentType === WEATHER_TYPES.DRIFTING_CLOUDS) {
                        this.setWeather(WEATHER_TYPES.RAIN_STORM, 55.0);
                    } else if (this.currentType === WEATHER_TYPES.RAIN_STORM) {
                        this.setWeather(WEATHER_TYPES.CLEARING, 35.0);
                    } else {
                        this.setWeather(WEATHER_TYPES.SUNNY, 65.0);
                    }
                }
            }

            const lerpSpeed = Math.min(1.0, delta * 0.85);
            this.cloudCover = THREE.MathUtils.lerp(this.cloudCover, this.targetCloudCover, lerpSpeed);
            this.cloudShadowIntensity = THREE.MathUtils.lerp(this.cloudShadowIntensity, this.targetCloudShadow, lerpSpeed);
            const rainTarget = this.snowMode ? Math.max(0.55, this.targetRain) : this.targetRain;
            this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, rainTarget, lerpSpeed);
            this.windSpeed = THREE.MathUtils.lerp(this.windSpeed, this.targetWindSpeed, lerpSpeed);
            this.stormDarkness = THREE.MathUtils.lerp(this.stormDarkness, this.targetStormDarkness, lerpSpeed);
            this.fogDensityFactor = THREE.MathUtils.lerp(this.fogDensityFactor, this.targetFogDensity, lerpSpeed);
        }

        const cloudDriftSpeed = 0.009 * this.windSpeed;
        this.cloudOffset.x += this.windDir.x * cloudDriftSpeed * delta;
        this.cloudOffset.y += this.windDir.y * cloudDriftSpeed * delta;

        this._updateLightning(delta);
        this._updatePrecipitationUniforms(cameraPos);
    }

    _updateLightning(delta) {
        if (!this.snowMode && this.currentType === WEATHER_TYPES.RAIN_STORM && this.rainIntensity > 0.4) {
            this.lightningTimer += delta;
            if (this.lightningTimer >= this.nextLightningDelay && !this.isFlashing) {
                this.isFlashing = true;
                this.lightningIntensity = 1.0;
                this.lightningTimer = 0;
                this.nextLightningDelay = 7.0 + Math.random() * 12.0;

                if (this.onThunderCallback) {
                    const soundDelayMs = 150 + Math.random() * 400;
                    const thunderPower = 0.7 + Math.random() * 0.3;
                    setTimeout(() => {
                        if (this.onThunderCallback) this.onThunderCallback(thunderPower);
                    }, soundDelayMs);
                }
            }
        }

        if (this.isFlashing) {
            this.lightningIntensity -= delta * 5.5;
            if (this.lightningIntensity <= 0.0) {
                this.lightningIntensity = 0.0;
                this.isFlashing = false;
            }
        }
    }

    _updatePrecipitationUniforms(cameraPos) {
        if (!this.rainMesh || !this.precipUniforms) return;

        const effectiveIntensity = this.snowMode ? Math.max(0.55, this.rainIntensity) : this.rainIntensity;
        if (effectiveIntensity <= 0.01) {
            this.rainMesh.visible = false;
            return;
        }

        this.rainMesh.visible = true;
        const u = this.precipUniforms;
        u.uTime.value = this.elapsedTime;
        if (cameraPos) u.uCameraPos.value.copy(cameraPos);

        const fallSpeed = this.snowMode ? 5.2 : 44.0;
        const driftScale = this.snowMode ? 2.4 : 8.5;
        u.uFallSpeed.value = fallSpeed;
        u.uWindDrift.value.set(
            this.windDir.x * this.windSpeed * driftScale,
            this.windDir.y * this.windSpeed * driftScale
        );
        u.uOpacity.value = this.snowMode
            ? Math.min(0.85, effectiveIntensity * 0.78)
            : Math.min(0.72, effectiveIntensity * 0.68);
    }

    destroy() {
        if (this.rainMesh) {
            this.scene.remove(this.rainMesh);
            if (this.rainMesh.geometry) this.rainMesh.geometry.dispose();
            if (this.rainMesh.material) this.rainMesh.material.dispose();
            this.rainMesh = null;
        }
    }
}
