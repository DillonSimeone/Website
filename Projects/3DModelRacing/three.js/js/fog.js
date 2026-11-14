// fog.js — Dynamic Atmospheric Distance Fog synchronized with the Day/Night Cycle
import * as THREE from 'three';

export class AtmosphericFog {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.near = options.near || 75.0;
        this.far = options.far || 380.0;

        // Calibrated atmospheric color palettes
        this.dayColor = new THREE.Color(options.dayColor || 0x7fa5d8);
        this.sunsetColor = new THREE.Color(options.sunsetColor || 0xde7b48);
        this.nightColor = new THREE.Color(options.nightColor || 0x080e1a);
        this.dawnColor = new THREE.Color(options.dawnColor || 0xb88e7d);

        this.fog = new THREE.Fog(this.dayColor.clone(), this.near, this.far);
        this.scene.fog = this.fog;
    }

    setRange(near, far) {
        this.near = near;
        this.far = far;
        this.fog.near = near;
        this.fog.far = far;
    }

    update(delta, timeOfDay, nightFactor = 0.0, fogDistanceFactor = 1.0, stormDarkness = 0.0) {
        const t = timeOfDay;
        // Sunset occurs around 0.44 - 0.54
        const sunsetFactor = Math.max(0, 1.0 - Math.abs(t - 0.49) / 0.07);
        // Dawn occurs around 0.82 - 0.92
        const dawnFactor = Math.max(0, 1.0 - Math.abs(t - 0.87) / 0.06);

        let curColor = this.dayColor.clone();
        if (sunsetFactor > 0) {
            curColor.lerp(this.sunsetColor, sunsetFactor);
        }
        if (dawnFactor > 0) {
            curColor.lerp(this.dawnColor, dawnFactor);
        }
        if (nightFactor > 0) {
            curColor.lerp(this.nightColor, nightFactor);
        }
        if (stormDarkness > 0) {
            const stormColor = new THREE.Color(0x384656);
            curColor.lerp(stormColor, stormDarkness * 0.85);
        }

        this.fog.color.copy(curColor);

        // Compress fog range during storms/rain mist
        const targetNear = Math.max(25.0, this.near * (1.0 - stormDarkness * 0.45));
        const targetFar = Math.max(130.0, this.far * fogDistanceFactor);
        this.fog.near = THREE.MathUtils.lerp(this.fog.near, targetNear, delta * 1.5);
        this.fog.far = THREE.MathUtils.lerp(this.fog.far, targetFar, delta * 1.5);
    }
}

