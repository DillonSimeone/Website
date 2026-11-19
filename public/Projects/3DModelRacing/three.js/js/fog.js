// fog.js — Dynamic Atmospheric Distance Fog synchronized with Day/Night & Visual Themes
import * as THREE from 'three';

export class AtmosphericFog {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.near = options.near || 75.0;
        this.far = options.far || 380.0;

        this.dayColor = new THREE.Color(options.dayColor || 0x7fa5d8);
        this.sunsetColor = new THREE.Color(options.sunsetColor || 0xde7b48);
        this.nightColor = new THREE.Color(options.nightColor || 0x080e1a);
        this.dawnColor = new THREE.Color(options.dawnColor || 0xb88e7d);

        this._curColor = new THREE.Color();
        this._stormColor = new THREE.Color(0x384656);
        this.themeOverride = null;

        this.fog = new THREE.Fog(this.dayColor.clone(), this.near, this.far);
        this.scene.fog = this.fog;
    }

    setRange(near, far) {
        this.near = near;
        this.far = far;
        this.fog.near = near;
        this.fog.far = far;
    }

    setThemeOverride(mode) {
        if (!mode || mode.id === 'natural') {
            this.themeOverride = null;
            return;
        }
        const atm = mode.atmosphere;
        this.themeOverride = {
            color: new THREE.Color(atm.fogColor),
            near: atm.fogNear,
            far: atm.fogFar
        };
    }

    update(delta, timeOfDay, nightFactor = 0.0, fogDistanceFactor = 1.0, stormDarkness = 0.0) {
        let baseNear = this.near;
        let baseFar = this.far;

        if (this.themeOverride) {
            this._curColor.copy(this.themeOverride.color);
            baseNear = this.themeOverride.near;
            baseFar = this.themeOverride.far;
        } else {
            const t = timeOfDay;
            const sunsetFactor = Math.max(0, 1.0 - Math.abs(t - 0.49) / 0.07);
            const dawnFactor = Math.max(0, 1.0 - Math.abs(t - 0.87) / 0.06);

            this._curColor.copy(this.dayColor);
            if (sunsetFactor > 0) this._curColor.lerp(this.sunsetColor, sunsetFactor);
            if (dawnFactor > 0) this._curColor.lerp(this.dawnColor, dawnFactor);
            if (nightFactor > 0) this._curColor.lerp(this.nightColor, nightFactor);
        }

        if (stormDarkness > 0) {
            this._curColor.lerp(this._stormColor, stormDarkness * 0.75);
        }

        this.fog.color.copy(this._curColor);

        const targetNear = Math.max(25.0, baseNear * (1.0 - stormDarkness * 0.45));
        const targetFar = Math.max(130.0, baseFar * fogDistanceFactor);
        const lerpAlpha = Math.min(1.0, delta * 1.5);
        this.fog.near = THREE.MathUtils.lerp(this.fog.near, targetNear, lerpAlpha);
        this.fog.far = THREE.MathUtils.lerp(this.fog.far, targetFar, lerpAlpha);
    }
}
