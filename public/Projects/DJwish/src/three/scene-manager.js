import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FOG, SHARED, AUDIO_TEX, AUDIO_TEX_WIDTH, HUE_MAX, STAGE_SCENES } from './world.js';
import { SkyShow } from './sky-show.js';
import { SettingsDisc } from '../settings/settings-disc.js';
import { QualityManager } from './quality.js';
import { Sky } from './starfield.js';
import { Pyramid } from './pyramid.js';
import { LaserFan } from './lasers.js';
import { LogoMesh } from './logo-mesh.js';
import { City } from './city.js';
import { Murals } from './murals.js';
import { WallPanels } from './css3d-panels.js';
import { CameraDirector } from './camera-director.js';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.02 },
    uVignette: { value: 0.85 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uVignette;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vignette = max(0.0, 1.0 - dot(d, d) * uVignette);
      float n = rand(vUv * 1000.0 + fract(uTime * 7.3) * 91.0) - 0.5;
      c.rgb = c.rgb * vignette + n * uAmount;
      gl_FragColor = c;
    }
  `
};

/**
 * SceneManager - renderer, post-processing tiers, world assembly and the per-frame update.
 */
export class SceneManager {
  constructor(container, css3dContainer, settingsContainer) {
    this.container = container;
    this.stageMode = false;

    this.scene = new THREE.Scene();
    this.scene.background = SHARED.uFogColor.value;
    this.scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

    const aspect = window.innerWidth / window.innerHeight;
    this.fovOffset = 0;
    this.punch = 1;
    this.reactiveColor = 1;
    this.settingsOpen = false;
    this.camera = new THREE.PerspectiveCamera(this.baseFov(aspect), aspect, 0.5, 8000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Only show the VR entry point on headsets / browsers that can actually use it.
    navigator.xr?.isSessionSupported('immersive-vr').then((ok) => {
      if (!ok) return;
      const vrButton = VRButton.createButton(this.renderer);
      vrButton.id = 'djwish-vr-button';
      document.body.appendChild(vrButton);
    }).catch(() => {});

    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    // Two lights total: moon key + hemisphere fill.
    const moon = new THREE.DirectionalLight(0xfff1d6, 2.4);
    moon.position.set(-0.8, 0.9, 0.6);
    this.scene.add(moon);
    this.scene.add(new THREE.HemisphereLight(0x5a3d8a, 0x120818, 0.9));

    // World
    this.sky = new Sky(this.scene);
    this.pyramid = new Pyramid(this.scene, maxAniso);
    this.lasers = new LaserFan(this.scene);
    this.logo = new LogoMesh(this.lasers.group);
    this.city = new City(this.scene, maxAniso);
    this.murals = new Murals(this.scene, maxAniso);
    this.panels = new WallPanels(css3dContainer, this.scene);
    this.skyShow = new SkyShow(this.scene, this.lasers.group);
    this.settingsDisc = new SettingsDisc(settingsContainer, this.scene);

    this.audioSource = null;
    this.spectrum = new Float32Array(AUDIO_TEX_WIDTH);
    this.specBins = null;
    this.bandPeak = new Float32Array(7).fill(0.3);
    this.bandFloor = new Float32Array(7);
    this.bandRaw = new Float32Array(7);
    this.lampVUTarget = 0;
    this.vuLevel = 0;
    this.vuPeak = 0;
    this.vuPeakHold = 0;

    this.cameraDirector = new CameraDirector(this.camera);
    this.cameraDirector.setAspect(aspect);

    // Post-processing (high tier only)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 1.0);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.grainPass = new ShaderPass(GrainVignetteShader);
    this.composer.addPass(this.grainPass);

    this.quality = new QualityManager({ onChange: () => this.applyQuality() });
    this.applyQuality();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setLoop(fn) {
    this.renderer.setAnimationLoop(fn);
  }

  setAudioSource(audio) {
    this.audioSource = audio;
  }

  baseFov(aspect = this.camera.aspect) {
    return (aspect < 1 ? 68 : 55) + this.fovOffset;
  }

  setFovOffset(v) {
    this.fovOffset = v;
    this.camera.fov = this.baseFov();
    this.camera.updateProjectionMatrix();
  }

  /** Fly to the capstone and raise the settings disc out of it. */
  openSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    if (this.sheetBeforeSettings == null) this.sheetBeforeSettings = this.lasers.sheetTarget;
    this.lasers.setSheet(0.25);
    this.cameraDirector.enterSettings(this.settingsDisc);
    this.settingsDisc.open(() => this.pyramid.triggerFlare(1));
  }

  closeSettings() {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.settingsDisc.close(() => {
      this.pyramid.triggerFlare(0.6);
      this.lasers.setSheet(this.sheetBeforeSettings ?? 1);
      this.sheetBeforeSettings = null;
      this.cameraDirector.exitSettings();
    });
  }

  setStageMode(on, scene = 1) {
    this.stageMode = on;
    this.pyramid.setStage(on);
    if (on) {
      this.cameraDirector.enterStage(STAGE_SCENES[scene].shot);
      this.setStageScene(scene);
    } else {
      this.cameraDirector.exitStage();
      this.skyShow.setScene(0);
      this.pyramid.setMode(0);
      this.lasers.setSheet(1);
      this.lampVUTarget = 0;
    }
  }

  /** Live rig scenes are defined in STAGE_SCENES (world.js). */
  setStageScene(scene) {
    if (!this.stageMode) return;
    const s = STAGE_SCENES[scene];
    if (!s) return;
    this.skyShow.setScene(s.sky);
    this.pyramid.setMode(s.pyramid);
    this.lasers.setSheet(s.sheet);
    this.lampVUTarget = s.lampVU;
    this.cameraDirector.setStageShot(s.shot);
  }

  /** Volume meter shared by the streetlights and the pyramid VU fill. */
  updateVolumeMeter(dt, t) {
    const vu = SHARED.uLampVU;
    vu.value += (this.lampVUTarget - vu.value) * (1 - Math.exp(-dt * 3));

    const volume = t ? Math.min(1, t.overallEnergy * 1.15) : 0;
    const step = SHARED.uLampStep.value;
    const target = volume * (1 + step);
    // VU ballistics: fast rise, slower fall; the peak lamp holds then drops.
    const rate = target > this.vuLevel ? 14 : 3.5;
    this.vuLevel += (target - this.vuLevel) * (1 - Math.exp(-dt * rate));
    if (this.vuLevel >= this.vuPeak) {
      this.vuPeak = this.vuLevel;
      this.vuPeakHold = 0.8;
    } else if ((this.vuPeakHold -= dt) <= 0) {
      this.vuPeak = Math.max(this.vuLevel, this.vuPeak - dt * 0.35);
    }
    SHARED.uLampLevel.value = this.vuLevel;
    SHARED.uLampPeak.value = this.vuPeak > 0.002 ? Math.floor((this.vuPeak - 0.001) / step) * step : -1;
  }

  applyQuality() {
    const { dpr } = this.quality.tier;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    SHARED.uPixelRatio.value = dpr;
  }

  onWindowResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov(aspect);
    this.camera.updateProjectionMatrix();
    this.cameraDirector.setAspect(aspect);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.panels.setSize(w, h);
    this.settingsDisc.setSize(w, h);
  }

  updateAudioUniforms(dt, t) {
    const audible = t && t.overallEnergy > 0.015;
    const a = SHARED.uActive;
    a.value += ((audible ? this.reactiveColor : 0) - a.value) * (1 - Math.exp(-dt * (audible ? 2.5 : 0.6)));

    if (t) {
      // Adaptive per-band range so the visuals use the full 0..1 swing on any input level.
      const raw = this.bandRaw;
      raw[0] = t.subBass; raw[1] = t.bass; raw[2] = t.lowMid; raw[3] = t.mid;
      raw[4] = t.highMid; raw[5] = t.high; raw[6] = t.air;
      const bands = SHARED.uBands.value;
      let weight = 0;
      let hue = 0;
      for (let i = 0; i < 7; i++) {
        const v = raw[i];
        this.bandPeak[i] = Math.max(v, this.bandPeak[i] - dt * 0.08, 0.12);
        this.bandFloor[i] = Math.min(v, this.bandFloor[i] + dt * 0.05);
        const range = this.bandPeak[i] - this.bandFloor[i] + 0.04;
        const level = Math.min(1, Math.max(0, (v - this.bandFloor[i]) / range) * this.punch);
        bands[i] += (level - bands[i]) * (level > bands[i] ? 0.7 : 0.25);
        const w = bands[i] * bands[i];
        weight += w;
        hue += w * (i / 6);
      }
      const targetHue = weight > 0.001 ? (hue / weight) * HUE_MAX : SHARED.uHue.value;
      SHARED.uHue.value += (targetHue - SHARED.uHue.value) * (1 - Math.exp(-dt * 4));

      SHARED.uBass.value = Math.max(bands[0], bands[1]);
      SHARED.uMid.value = Math.max(bands[2], bands[3]);
      SHARED.uHigh.value = Math.max(bands[4], bands[5], bands[6]);
      SHARED.uEnergy.value = Math.min(1, t.overallEnergy);
      if (t.isBeat) SHARED.uBeat.value = 1;
    }
    SHARED.uBeat.value *= Math.exp(-dt * 6);
  }

  /** Writes a log-binned spectrum (R) and a zero-crossing-triggered waveform (G) into AUDIO_TEX. */
  updateAudioTexture(dt) {
    const audio = this.audioSource;
    if (!audio || !audio.dataArray || !audio.ctx) return;
    const freq = audio.dataArray;
    const wave = audio.timeDomainArray;
    const W = AUDIO_TEX_WIDTH;

    if (!this.specBins) {
      const nyquist = audio.ctx.sampleRate / 2;
      const bins = freq.length;
      this.specBins = new Uint16Array(W * 2);
      for (let i = 0; i < W; i++) {
        const f0 = 30 * Math.pow(16000 / 30, i / W);
        const f1 = 30 * Math.pow(16000 / 30, (i + 1) / W);
        const lo = Math.min(bins - 1, Math.floor((f0 / nyquist) * bins));
        const hi = Math.min(bins, Math.max(lo + 1, Math.ceil((f1 / nyquist) * bins)));
        this.specBins[i * 2] = lo;
        this.specBins[i * 2 + 1] = hi;
      }
    }

    let trigger = 0;
    const half = wave.length >> 1;
    for (let i = 1; i < half; i++) {
      if (wave[i - 1] < 128 && wave[i] >= 128) { trigger = i; break; }
    }
    const step = Math.max(1, Math.floor(half / W));

    const data = AUDIO_TEX.image.data;
    const decay = dt * 2.2;
    for (let i = 0; i < W; i++) {
      let m = 0;
      for (let b = this.specBins[i * 2]; b < this.specBins[i * 2 + 1]; b++) if (freq[b] > m) m = freq[b];
      let v = (m / 255 - 0.32) / 0.6;
      v = Math.min(1, Math.max(0, v * (1 + 0.5 * (i / W))));
      const s = Math.max(v, this.spectrum[i] - decay);
      this.spectrum[i] = s;
      data[i * 4] = s * 255;
      data[i * 4 + 1] = wave[Math.min(wave.length - 1, trigger + i * step)];
    }
    AUDIO_TEX.needsUpdate = true;
  }

  update(dt, telemetry) {
    SHARED.uTime.value += dt;
    this.updateAudioUniforms(dt, telemetry);
    this.updateAudioTexture(dt);
    this.updateVolumeMeter(dt, telemetry);

    const director = this.cameraDirector;
    if (!this.renderer.xr.isPresenting) director.update(dt);

    this.sky.update(this.camera);
    this.pyramid.update(dt);
    this.lasers.update(dt, director.ignite);
    this.logo.update(dt, director.ignite, this.stageMode);
    this.skyShow.update(dt);
    this.city.update();

    this.quality.sample(dt * 1000);

    if (this.renderer.xr.isPresenting || !this.quality.bloom) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.grainPass.uniforms.uTime.value = SHARED.uTime.value;
      this.composer.render(dt);
    }

    const panelsHidden = director.isPlayingIntro || this.stageMode || director.mode === 'settings' || this.settingsDisc.visible;
    this.panels.update(this.camera, director.stopFloat, panelsHidden);
    this.settingsDisc.update(dt, this.camera);
  }
}
