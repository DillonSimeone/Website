import * as THREE from 'three';
import { SHARED, HUE_UNIFORMS, mulberry32 } from './world.js';
import { GlowField } from './glow.js';
import { CityBuildings } from './city-buildings.js';
import { CityGround } from './city-ground.js';
import { CityProps, LAMP_Z0, LAMP_SPACING, LAMP_X, LAMP_RANGE } from './city-props.js';
import { CityOasis } from './city-oasis.js';

/**
 * City - neon street canyon, stage-reactive skyline, East Neon Oasis park, textured ground, lamps, signs.
 */
export class City {
  constructor(scene, maxAniso = 4) {
    this.group = new THREE.Group();
    this.rng = mulberry32(1337);
    this.glows = new GlowField(320, { near: 40, far: 1900 });

    this.buildingUniforms = {
      uTime: SHARED.uTime,
      uEnergy: SHARED.uEnergy,
      uBass: SHARED.uBass,
      uBeat: SHARED.uBeat,
      uHue: SHARED.uHue,
      ...HUE_UNIFORMS,
      uActive: SHARED.uActive,
      uBands: SHARED.uBands,
      uFogColor: SHARED.uFogColor,
      uFogNear: SHARED.uFogNear,
      uFogFar: SHARED.uFogFar,
      uWindowGain: { value: 1 },
      uVUBuildings: { value: 1 },
      uStageMode: SHARED.uStageMode,
      uPeakFreqHue: SHARED.uPeakFreqHue,
      uPeakFlash: SHARED.uPeakFlash,
      uBuildingMotion: SHARED.uBuildingMotion,
      uBuildingBoost: SHARED.uBuildingBoost,
      uStarRainMix: SHARED.uStarRainMix,
      uStarWells: SHARED.uStarWells,
      uStarWellSpec: SHARED.uStarWellSpec,
      uRicochetMix: SHARED.uRicochetMix,
      uLaserHits: SHARED.uLaserHits,
      uLaserHitInfo: SHARED.uLaserHitInfo
    };

    this.reflGain = { value: 1 };

    this.buildings = new CityBuildings(this.group, this.rng, this.buildingUniforms);
    this.props = new CityProps(this.group, this.rng, this.glows, this.buildings.streetBuildings, maxAniso);
    this.oasis = new CityOasis(this.group, this.glows);
    this.ground = new CityGround(this.group, {
      reflGain: this.reflGain,
      spots: this.props.spots,
      lampParams: {
        z0: LAMP_Z0,
        spacing: LAMP_SPACING,
        x: LAMP_X,
        range: LAMP_RANGE
      }
    });

    this.glows.finalize();
    this.group.add(this.glows.mesh);
    scene.add(this.group);
  }

  get signGain() {
    return this.props.signGain;
  }

  set signGain(v) {
    this.props.signGain = v;
  }

  setFogDistance(far) {
    SHARED.uFogFar.value = far;
    this.buildings.setFogDistance(far);
  }

  applyVisualMode(mode) {
    if (!mode) return;
    this.oasis.applyVisualMode(mode);
    if (this.props.signMaterial && mode.lightTint) {
      this.props.signMaterial.color.setRGB(
        1.05 * mode.lightTint[0],
        1.05 * mode.lightTint[1],
        1.05 * mode.lightTint[2]
      );
    }
  }

  getObstacleData() {
    return {
      streetBoxes: this.buildings.streetBoxes,
      skylineBoxes: this.buildings.skylineBoxes,
      oasisBoxes: this.oasis.getObstacleBoxes()
    };
  }

  update() {
    this.props.update();
  }
}
