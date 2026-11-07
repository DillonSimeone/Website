// weather.js — Dynamic Weather, Atmospheric Transitions, Cloud Shadows, Rain & Lightning System
import * as THREE from 'three';

export const WEATHER_TYPES = {
    SUNNY: 'SUNNY',
    DRIFTING_CLOUDS: 'DRIFTING_CLOUDS',
    RAIN_STORM: 'RAIN_STORM',
    CLEARING: 'CLEARING'
};

export class WeatherManager {
    constructor(scene) {
        this.scene = scene;

        // Current active state & transition targets
        this.currentType = WEATHER_TYPES.SUNNY;
        this.elapsedTime = 0;
        this.stateTimer = 0;
        this.stateDuration = 55.0; // Seconds per weather state

        // Dynamic Weather Parameters
        this.cloudCover = 0.22;            // Sky cloud density threshold
        this.cloudShadowIntensity = 0.15;  // Ground shadow darkness (0 = none, 0.6 = dark)
        this.rainIntensity = 0.0;          // Rain density & streak visibility (0 = dry, 1 = downpour)
        this.windSpeed = 1.0;              // Multiplier for grass sway & rain tilt
        this.windDir = new THREE.Vector2(0.82, 0.57).normalize();
        this.stormDarkness = 0.0;          // Ambient & sun dimming factor (0 = bright, 1 = storm)
        this.fogDensityFactor = 1.0;       // Multiplier for fog distance (1 = clear, 0.45 = storm mist)

        // Interpolation targets
        this.targetCloudCover = 0.22;
        this.targetCloudShadow = 0.15;
        this.targetRain = 0.0;
        this.targetWindSpeed = 1.0;
        this.targetStormDarkness = 0.0;
        this.targetFogDensity = 1.0;

        // Drifting Cloud Shadows coordinate
        this.cloudOffset = new THREE.Vector2(0, 0);

        // Lightning state
        this.lightningTimer = 0;
        this.lightningIntensity = 0.0;
        this.nextLightningDelay = 8.0 + Math.random() * 10.0;
        this.isFlashing = false;
        this.onThunderCallback = null;

        // Instanced Rain System
        this._setupRainSystem();
    }

    _setupRainSystem() {
        const RAIN_COUNT = 4500;
        this.rainCount = RAIN_COUNT;

        // Slender tapered rain streak geometry
        const streakGeo = new THREE.PlaneGeometry(0.032, 1.25);
        streakGeo.rotateY(Math.PI / 4);

        const streakMat = new THREE.MeshBasicMaterial({
            color: 0xbbd8ff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.rainMesh = new THREE.InstancedMesh(streakGeo, streakMat, RAIN_COUNT);
        this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.rainMesh.frustumCulled = false;
        this.rainMesh.visible = false;
        this.scene.add(this.rainMesh);

        // Initialize particle positions in a local volume
        this.rainVolume = { x: 55.0, y: 32.0, z: 55.0 };
        this.rainPositions = new Float32Array(RAIN_COUNT * 3);
        this.dummyMatrix = new THREE.Matrix4();
        this.dummyPos = new THREE.Vector3();
        this.dummyRot = new THREE.Euler();
        this.dummyQuat = new THREE.Quaternion();
        this.dummyScale = new THREE.Vector3(1, 1, 1);

        for (let i = 0; i < RAIN_COUNT; i++) {
            this.rainPositions[i * 3 + 0] = (Math.random() - 0.5) * this.rainVolume.x;
            this.rainPositions[i * 3 + 1] = Math.random() * this.rainVolume.y - 10.0;
            this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.rainVolume.z;
        }
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
                this.targetCloudShadow = 0.55; // Prominent rolling shadows on hills & grass
                this.targetRain = 0.0;
                this.targetWindSpeed = 1.35;
                this.targetStormDarkness = 0.15;
                this.targetFogDensity = 0.95;
                break;
            case WEATHER_TYPES.RAIN_STORM:
                this.targetCloudCover = 0.88;
                this.targetCloudShadow = 0.65;
                this.targetRain = 1.0;
                this.targetWindSpeed = 2.6; // High wind gale
                this.targetStormDarkness = 0.65;
                this.targetFogDensity = 0.48; // Dense misty storm fog
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
        this.stateTimer += delta;

        // Auto-cycle weather states if duration expires
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

        // Smoothly interpolate atmospheric parameters toward active targets
        const lerpSpeed = delta * 0.85;
        this.cloudCover = THREE.MathUtils.lerp(this.cloudCover, this.targetCloudCover, lerpSpeed);
        this.cloudShadowIntensity = THREE.MathUtils.lerp(this.cloudShadowIntensity, this.targetCloudShadow, lerpSpeed);
        this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, this.targetRain, lerpSpeed);
        this.windSpeed = THREE.MathUtils.lerp(this.windSpeed, this.targetWindSpeed, lerpSpeed);
        this.stormDarkness = THREE.MathUtils.lerp(this.stormDarkness, this.targetStormDarkness, lerpSpeed);
        this.fogDensityFactor = THREE.MathUtils.lerp(this.fogDensityFactor, this.targetFogDensity, lerpSpeed);

        // Advance drifting cloud shadow offset along wind direction
        const cloudDriftSpeed = 0.009 * this.windSpeed;
        this.cloudOffset.x += this.windDir.x * cloudDriftSpeed * delta;
        this.cloudOffset.y += this.windDir.y * cloudDriftSpeed * delta;

        // Update Lightning & Thunder System
        this._updateLightning(delta);

        // Update Instanced Rain
        this._updateRain(delta, cameraPos);
    }

    _updateLightning(delta) {
        if (this.currentType === WEATHER_TYPES.RAIN_STORM && this.rainIntensity > 0.4) {
            this.lightningTimer += delta;
            if (this.lightningTimer >= this.nextLightningDelay && !this.isFlashing) {
                this.isFlashing = true;
                this.lightningIntensity = 1.0;
                this.lightningTimer = 0;
                this.nextLightningDelay = 7.0 + Math.random() * 12.0;

                // Trigger thunder sound with distance acoustic delay
                if (this.onThunderCallback) {
                    const soundDelayMs = 150 + Math.random() * 400;
                    const thunderPower = 0.7 + Math.random() * 0.3;
                    setTimeout(() => {
                        if (this.onThunderCallback) this.onThunderCallback(thunderPower);
                    }, soundDelayMs);
                }
            }
        }

        // Lightning decay animation (multi-peak crackle)
        if (this.isFlashing) {
            this.lightningIntensity -= delta * 5.5;
            if (this.lightningIntensity <= 0.0) {
                this.lightningIntensity = 0.0;
                this.isFlashing = false;
            }
        }
    }

    _updateRain(delta, cameraPos) {
        if (!this.rainMesh) return;

        if (this.rainIntensity <= 0.01) {
            this.rainMesh.visible = false;
            return;
        }

        this.rainMesh.visible = true;
        this.rainMesh.material.opacity = Math.min(0.72, this.rainIntensity * 0.68);

        const camX = cameraPos ? cameraPos.x : 0;
        const camY = cameraPos ? cameraPos.y : 0;
        const camZ = cameraPos ? cameraPos.z : 0;

        const fallSpeed = 44.0; // Downward velocity (m/s)
        const windDriftX = this.windDir.x * this.windSpeed * 8.5;
        const windDriftZ = this.windDir.y * this.windSpeed * 8.5;

        // Slant angle aligned to wind vector
        const slantAngle = Math.atan2(Math.hypot(windDriftX, windDriftZ), fallSpeed);
        const windAngle = Math.atan2(windDriftX, windDriftZ);
        this.dummyRot.set(slantAngle, windAngle, 0, 'YXZ');
        this.dummyQuat.setFromEuler(this.dummyRot);

        const halfX = this.rainVolume.x * 0.5;
        const halfY = this.rainVolume.y * 0.5;
        const halfZ = this.rainVolume.z * 0.5;

        for (let i = 0; i < this.rainCount; i++) {
            const idx = i * 3;
            let rx = this.rainPositions[idx + 0] + windDriftX * delta;
            let ry = this.rainPositions[idx + 1] - fallSpeed * delta;
            let rz = this.rainPositions[idx + 2] + windDriftZ * delta;

            // Toroidal wrap relative to camera
            if (ry < -halfY) ry += this.rainVolume.y;
            if (rx < -halfX) rx += this.rainVolume.x;
            else if (rx > halfX) rx -= this.rainVolume.x;
            if (rz < -halfZ) rz += this.rainVolume.z;
            else if (rz > halfZ) rz -= this.rainVolume.z;

            this.rainPositions[idx + 0] = rx;
            this.rainPositions[idx + 1] = ry;
            this.rainPositions[idx + 2] = rz;

            this.dummyPos.set(camX + rx, camY + ry + 2.0, camZ + rz);
            this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
            this.rainMesh.setMatrixAt(i, this.dummyMatrix);
        }

        this.rainMesh.instanceMatrix.needsUpdate = true;
    }

    destroy() {
        if (this.rainMesh) {
            this.scene.remove(this.rainMesh);
            if (this.rainMesh.geometry) this.rainMesh.geometry.dispose();
            if (this.rainMesh.material) this.rainMesh.material.dispose();
        }
    }
}
