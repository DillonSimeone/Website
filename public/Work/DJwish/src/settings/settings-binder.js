import { SHARED } from '../three/world.js';

/**
 * Applies a SettingsStore key/value pair onto the live WebGL, Audio, HUD & Camera subsystems.
 */
export function applySetting(app, key, v) {
  const sm = app.sceneManager;
  if (!sm) return;

  const audio = app.audio;
  const pyramid = sm.pyramid;
  const city = sm.city;

  switch (key) {
    case 'gain': if (audio) audio.gain = v; break;
    case 'demoVolume': if (audio) audio.demoVolume = v; break;
    case 'smoothing': audio?.setSmoothing(v); break;
    case 'response': if (audio) audio.smoothFactor = v; break;
    case 'noiseFloor': if (audio) audio.noiseFloor = v; break;
    case 'beatThreshold': if (audio) audio.beatThreshold = v; break;

    case 'visualMode': app.applyVisualMode(v); break;
    case 'hueShift': SHARED.uHueShift.value = v / 360; break;
    case 'hueSpan': SHARED.uHueSpan.value = v; break;
    case 'hueReverse': SHARED.uHueDir.value = v ? -1 : 1; break;
    case 'saturation': SHARED.uSat.value = v; break;
    case 'reactiveColor': sm.reactiveColor = v; break;
    case 'punch': sm.punch = v; break;

    case 'exposure': sm.setBaseExposure(v); break;
    case 'bloomStrength': sm.setBaseBloomStrength(v); break;
    case 'bloomRadius': sm.setBaseBloomRadius(v); break;
    case 'bloomThreshold': sm.setBaseBloomThreshold(v); break;
    case 'grain': sm.grainPass.uniforms.uAmount.value = v; break;
    case 'vignette': sm.grainPass.uniforms.uVignette.value = v; break;

    case 'fanBrightness': sm.lasers.uniforms.uFanGain.value = v; break;
    case 'showLogo': sm.logo.enabled = v; break;
    case 'capGlow': pyramid.capGlow = v; break;
    case 'brickGlow': pyramid.brickGlow = v; break;
    case 'edgeGlow': pyramid.edgeGlow = v; break;
    case 'searchlightSpeed': pyramid.searchlightSpeed = v; break;

    case 'windowGlow': city.buildingUniforms.uWindowGain.value = v; break;
    case 'vuBuildings': city.buildingUniforms.uVUBuildings.value = v ? 1 : 0; break;
    case 'buildingMotion': SHARED.uBuildingMotion.value = v * (app.reducedMotion ? 0.35 : 1); break;
    case 'signGlow': city.signGain = v; break;
    case 'reflections': city.reflGain.value = v; break;
    case 'fogDistance': sm.setUserFogFar(v); break;
    case 'stars': sm.sky.starGain.value = v; break;
    case 'starRain': app.setStarRain?.(v); break;

    case 'quality': sm.quality.setMode(v); break;
    case 'fovOffset': sm.setFovOffset(v); break;
    case 'parallax': app.director.parallax = v; break;
    case 'scrollEase': app.director.scrollEase = v; break;
    case 'autoPilot': app.stageHud?.setAutoPilot(v); break;
    case 'autoPilotSpeed': app.stageHud?.setAutoPilotSpeed(v); break;
    case 'autoCycleThemes': app.stageHud?.setAutoCycleThemes(v); break;
    case 'haptics': if (app.haptics) app.haptics.isEnabled = v; break;
    case 'showFps': app.setShowFps(v); break;
    default: break;
  }
}
