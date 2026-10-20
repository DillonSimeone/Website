import { SceneManager } from './three/scene-manager.js';
import { STOPS, STAGE_SCENES, SHARED } from './three/world.js';
import { SettingsStore } from './settings/settings-store.js';
import { AudioEngine } from './audio/audio-engine.js';
import { HapticEngine } from './audio/haptic-engine.js';
import { ProjectionMapper } from './stage/projection-mapper.js';
import { MidiController } from './stage/midi-controller.js';

const FONT_FACES = [
  '400 100px "Permanent Marker"',
  '900 100px "Montserrat"',
  '800 100px "Montserrat"',
  '700 100px "Montserrat"',
  '700 100px "Courier Prime"'
];

async function waitForFonts(timeoutMs = 3000) {
  if (!document.fonts) return;
  const loads = Promise.all(FONT_FACES.map(f => document.fonts.load(f).catch(() => null)));
  await Promise.race([loads, new Promise(r => setTimeout(r, timeoutMs))]);
}

class DJWishApp {
  constructor() {
    this.isStageMode = false;
    this.isAudioStarted = false;
    this.stageScene = 1;
    this.lastTime = 0;
    this.activeDot = -1;
    this.fpsFrames = 0;
    this.fpsTime = 0;

    this.threeContainer = document.getElementById('three-container');
    this.css3dContainer = document.getElementById('css3d-container');
    this.stageHud = document.getElementById('stage-hud');
    this.bootVeil = document.getElementById('boot-veil');
    this.scrollHint = document.getElementById('scroll-hint');
    this.fpsReadout = document.getElementById('fps-readout');
    this.dots = Array.from(document.querySelectorAll('.section-dot'));

    this.hudDomFreq = document.getElementById('hud-dom-freq');
    this.hudEnergy = document.getElementById('hud-energy');
    this.hudClipWarning = document.getElementById('hud-clip-warning');
    this.deckStatusTag = document.getElementById('deck-input-status');
    this.btnToggleAudio = document.getElementById('btn-toggle-audio');

    this.fpsFromUrl = new URLSearchParams(window.location.search).has('fps');
    this.showFps = this.fpsFromUrl;
    if (this.showFps) this.fpsReadout.hidden = false;
    this.settings = new SettingsStore();

    this.init();
  }

  async init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    await waitForFonts();

    this.sceneManager = new SceneManager(this.threeContainer, this.css3dContainer, document.getElementById('settings-layer'));
    this.director = this.sceneManager.cameraDirector;
    this.audio = new AudioEngine();
    this.sceneManager.setAudioSource(this.audio);
    this.haptics = new HapticEngine();
    this.projectionMapper = new ProjectionMapper('stage-viewport');
    this.midi = new MidiController();
    this.midi.init();

    this.director.onIntroComplete = () => document.body.classList.remove('intro-playing');

    this.settings.applyAll((k, v) => this.applySetting(k, v));
    this.settings.onChange((k, v) => this.applySetting(k, v));
    this.settingsDisc = this.sceneManager.settingsDisc;
    this.settingsDisc.bind(this.settings);
    this.settingsDisc.onRequestClose = () => this.closeSettings();

    this.bindEvents();
    this.bindScroll();
    this.bindMidiEvents();

    const hashStop = STOPS.findIndex(s => `#${s.id}` === window.location.hash);
    if (hashStop > 0) {
      this.scrollToStop(hashStop, 'instant');
      this.director.setScrollProgress(this.getScrollProgress());
      this.director.skipIntro(true);
    } else {
      window.scrollTo(0, 0);
      if (!this.settings.get('playIntro')) this.director.skipIntro(true);
    }

    this.render = this.render.bind(this);
    this.sceneManager.setLoop(this.render);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.sceneManager.setLoop(null);
      } else {
        this.lastTime = 0;
        this.sceneManager.quality.reset();
        this.sceneManager.setLoop(this.render);
      }
    });
  }

  /* ---------------- settings ---------------- */

  applySetting(key, v) {
    const sm = this.sceneManager;
    const audio = this.audio;
    const pyramid = sm.pyramid;
    const city = sm.city;
    switch (key) {
      case 'gain': if (audio) audio.gain = v; break;
      case 'demoVolume': if (audio) audio.demoVolume = v; break;
      case 'smoothing': audio?.setSmoothing(v); break;
      case 'response': if (audio) audio.smoothFactor = v; break;
      case 'noiseFloor': if (audio) audio.noiseFloor = v; break;
      case 'beatThreshold': if (audio) audio.beatThreshold = v; break;

      case 'hueShift': SHARED.uHueShift.value = v / 360; break;
      case 'hueSpan': SHARED.uHueSpan.value = v; break;
      case 'hueReverse': SHARED.uHueDir.value = v ? -1 : 1; break;
      case 'saturation': SHARED.uSat.value = v; break;
      case 'reactiveColor': sm.reactiveColor = v; break;
      case 'punch': sm.punch = v; break;

      case 'exposure': sm.renderer.toneMappingExposure = v; break;
      case 'bloomStrength': sm.bloomPass.strength = v; break;
      case 'bloomRadius': sm.bloomPass.radius = v; break;
      case 'bloomThreshold': sm.bloomPass.threshold = v; break;
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
      case 'signGlow': city.signGain = v; break;
      case 'reflections': city.reflGain.value = v; break;
      case 'fogDistance':
        city.setFogDistance(v);
        sm.scene.fog.far = v;
        break;
      case 'stars': sm.sky.starGain.value = v; break;

      case 'quality': sm.quality.setMode(v); break;
      case 'fovOffset': sm.setFovOffset(v); break;
      case 'parallax': this.director.parallax = v; break;
      case 'scrollEase': this.director.scrollEase = v; break;
      case 'haptics': if (this.haptics) this.haptics.isEnabled = v; break;
      case 'showFps':
        this.showFps = v || this.fpsFromUrl;
        this.fpsReadout.hidden = !this.showFps;
        break;
      default: break;
    }
  }

  get settingsOpen() {
    return this.sceneManager?.settingsOpen;
  }

  openSettings() {
    if (this.settingsOpen) return;
    document.body.classList.add('settings-open');
    document.body.classList.remove('intro-playing');
    this.sceneManager.openSettings();
  }

  closeSettings() {
    if (!this.settingsOpen) return;
    this.sceneManager.closeSettings();
    // The disc sinks first; HUD comes back as the camera starts its return flight.
    clearTimeout(this.settingsHudTimer);
    this.settingsHudTimer = setTimeout(() => {
      if (!this.settingsOpen) document.body.classList.remove('settings-open');
    }, 1500);
  }

  toggleSettings() {
    if (this.settingsOpen) this.closeSettings();
    else this.openSettings();
  }

  /* ---------------- scroll rig ---------------- */

  getScrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? window.scrollY / max : 0;
  }

  scrollToStop(index, behavior = 'smooth') {
    const i = Math.max(0, Math.min(STOPS.length - 1, index));
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: (i / (STOPS.length - 1)) * max, behavior });
  }

  currentStop() {
    return Math.round(this.getScrollProgress() * (STOPS.length - 1));
  }

  skipIntroIfPlaying() {
    if (this.director.isPlayingIntro) this.director.skipIntro();
  }

  bindScroll() {
    window.addEventListener('scroll', () => {
      if (this.isStageMode || this.settingsOpen) return;
      this.director.setScrollProgress(this.getScrollProgress());
      if (window.scrollY > 4) this.skipIntroIfPlaying();
    }, { passive: true });

    window.addEventListener('wheel', () => this.skipIntroIfPlaying(), { passive: true });
    window.addEventListener('touchmove', () => this.skipIntroIfPlaying(), { passive: true });
    this.threeContainer.addEventListener('pointerdown', () => this.skipIntroIfPlaying());

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        this.skipIntroIfPlaying();
        this.scrollToStop(parseInt(dot.dataset.stop, 10));
      });
    });
  }

  /* ---------------- UI events ---------------- */

  async ensureAudio() {
    if (this.isAudioStarted) return;
    await this.audio.init('demo');
    this.isAudioStarted = true;
    this.setAudioButton(true, 'PAUSE AUDIO');
  }

  setAudioButton(active, label) {
    if (!this.btnToggleAudio) return;
    this.btnToggleAudio.textContent = label;
    this.btnToggleAudio.classList.toggle('active', active);
  }

  bindEvents() {
    const launch = () => this.enterStageMode();
    document.getElementById('btn-launch-stage')?.addEventListener('click', launch);
    document.getElementById('btn-launch-stage-header')?.addEventListener('click', launch);
    document.getElementById('btn-exit-stage')?.addEventListener('click', () => this.exitStageMode());

    this.btnToggleAudio?.addEventListener('click', async () => {
      if (!this.isAudioStarted) {
        await this.ensureAudio();
        this.updateDeckStatus('DEMO ACTIVE');
      } else {
        this.audio.stopDemoSynth();
        this.isAudioStarted = false;
        this.setAudioButton(false, 'START AUDIO');
        this.updateDeckStatus('PAUSED');
      }
    });

    document.getElementById('btn-toggle-mic')?.addEventListener('click', async (e) => {
      const res = await this.audio.init('mic');
      this.isAudioStarted = true;
      e.currentTarget.classList.toggle('active', res.mode === 'mic');
      this.setAudioButton(true, 'AUDIO LIVE');
      this.updateDeckStatus(res.mode === 'mic' ? 'MIC LIVE' : 'DEMO FALLBACK');
    });

    const trackBtns = document.querySelectorAll('.track-btn');
    trackBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        trackBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        await this.ensureAudio();
        this.audio.startDemoSynth(preset);
        this.updateDeckStatus(`PRESET: ${preset.toUpperCase()}`);
      });
    });

    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        try {
          await this.audio.loadFile(file);
          this.isAudioStarted = true;
          this.updateDeckStatus(`FILE: ${file.name.slice(0, 16)}`);
          this.setAudioButton(true, 'PAUSE AUDIO');
        } catch (err) {
          console.error(err);
          this.updateDeckStatus('DECODE FAILED');
        }
      });
    }

    document.getElementById('btn-skip-intro')?.addEventListener('click', () => this.skipIntroIfPlaying());

    document.getElementById('btn-replay-intro')?.addEventListener('click', () => {
      window.scrollTo(0, 0);
      this.director.startIntro();
      document.body.classList.add('intro-playing');
    });

    const btnTestHaptics = document.getElementById('btn-test-haptics');
    btnTestHaptics?.addEventListener('click', () => {
      const didPulse = this.haptics.testPulse();
      btnTestHaptics.textContent = didPulse ? 'HAPTIC PULSE OK!' : 'HAPTICS NOT SUPPORTED (MOBILE ONLY)';
      setTimeout(() => {
        btnTestHaptics.textContent = 'TEST MOBILE HAPTICS';
      }, 2200);
    });

    this.sceneSelect = document.getElementById('scene-select');
    this.sceneSelect?.addEventListener('change', () => {
      this.switchScene(parseInt(this.sceneSelect.value, 10));
      this.sceneSelect.blur();
    });

    document.getElementById('btn-stage-map')?.addEventListener('click', () => this.projectionMapper.toggleCalibration());
    document.getElementById('btn-stage-fullscreen')?.addEventListener('click', () => this.toggleFullscreen());

    document.querySelectorAll('.btn-settings').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toggleSettings();
        btn.blur();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (this.settingsOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeSettings();
        } else if (!e.target.matches('input, textarea, select')) {
          if (e.key === 'ArrowLeft') this.settingsDisc.step(-1);
          else if (e.key === 'ArrowRight') this.settingsDisc.step(1);
          else if (e.key === 's' || e.key === 'S') this.closeSettings();
        }
        return;
      }
      if (e.target.matches('input, textarea, select')) return;
      const onControl = e.target.matches('button, a');

      if (e.key === 's' || e.key === 'S') {
        this.openSettings();
        return;
      }

      if (e.code === 'Space') {
        if (onControl) return;
        e.preventDefault();
        if (this.director.isPlayingIntro) this.director.skipIntro();
        else if (!this.isStageMode) this.enterStageMode();
        else this.btnToggleAudio?.click();
        return;
      }

      if (!this.isStageMode) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          this.skipIntroIfPlaying();
          this.scrollToStop(this.currentStop() + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          this.scrollToStop(this.currentStop() - 1);
        }
      }

      if (e.key >= '1' && e.key <= String(STAGE_SCENES.length - 1)) this.switchScene(parseInt(e.key, 10));
      else if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
      else if (e.key === 'v' || e.key === 'V') {
        this.settings.set('haptics', !this.settings.get('haptics'));
      } else if (e.key === 'Escape' && this.isStageMode) {
        this.exitStageMode();
      }
    });
  }

  bindMidiEvents() {
    this.midi.on('crossfader', ({ value }) => {
      const count = STAGE_SCENES.length - 1;
      const scene = Math.min(count, 1 + Math.floor(value * count));
      if (scene !== this.stageScene) this.switchScene(scene);
    });
    this.midi.on('fader_1', ({ value }) => {
      if (this.audio) this.audio.gain = 0.5 + value * 2.0;
    });
    this.midi.on('eq_low_1', ({ value }) => {
      if (this.audio) this.audio.smoothFactor = 0.05 + value * 0.4;
    });
  }

  enterStageMode() {
    if (this.isStageMode) return;
    this.isStageMode = true;
    document.body.classList.add('stage-mode');
    document.body.classList.remove('intro-playing');
    this.stageHud.classList.add('active');
    this.sceneManager.setStageMode(true, this.stageScene);

    if (!this.isAudioStarted) {
      this.ensureAudio().then(() => this.updateDeckStatus('LIVE STAGE ACTIVE'));
    }
  }

  exitStageMode() {
    if (!this.isStageMode) return;
    this.isStageMode = false;
    document.body.classList.remove('stage-mode');
    this.stageHud.classList.remove('active');
    this.sceneManager.setStageMode(false);
    this.director.setScrollProgress(this.getScrollProgress());
  }

  switchScene(sceneIndex) {
    this.stageScene = sceneIndex;
    this.sceneManager.setStageScene(sceneIndex);
    if (this.sceneSelect) this.sceneSelect.value = String(sceneIndex);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  updateDeckStatus(text) {
    if (this.deckStatusTag) this.deckStatusTag.textContent = text;
  }

  /* ---------------- frame loop ---------------- */

  updateStreetHud() {
    const stopFloat = this.director.stopFloat;
    const dot = Math.round(stopFloat);
    if (dot !== this.activeDot) {
      this.activeDot = dot;
      this.dots.forEach((d, i) => d.classList.toggle('active', i === dot));
    }
    if (this.scrollHint) {
      const show = stopFloat < 0.15 ? '1' : '0';
      if (this.scrollHint.style.opacity !== show) this.scrollHint.style.opacity = show;
    }
  }

  /** Throttled telemetry text; the overdrive tag keeps its space so the bar never reflows. */
  updateStageHud(dt, telemetry) {
    if (telemetry.isClipping) this.clipHold = 0.6;
    else this.clipHold = Math.max(0, (this.clipHold || 0) - dt);
    const clip = this.clipHold > 0;
    if (clip !== this.clipShown) {
      this.clipShown = clip;
      this.hudClipWarning.classList.toggle('on', clip);
    }

    this.hudTimer = (this.hudTimer || 0) + dt;
    if (this.hudTimer < 0.15) return;
    this.hudTimer = 0;
    this.hudDomFreq.textContent = `${Math.round(telemetry.dominantFreq)} Hz`;
    this.hudEnergy.textContent = `${Math.round(telemetry.overallEnergy * 100)}%`;
  }

  updateFps(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 0.5) return;
    const q = this.sceneManager.quality.tier;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS | ${q.dpr.toFixed(2)}x | bloom ${q.bloom ? 'on' : 'off'}`;
    this.fpsFrames = 0;
    this.fpsTime = 0;
  }

  render(time) {
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = time;

    const telemetry = this.audio.update();
    if (this.isAudioStarted) this.haptics.update(telemetry);

    this.sceneManager.update(dt, telemetry);

    if (this.isStageMode) {
      this.updateStageHud(dt, telemetry);
    } else {
      this.updateStreetHud();
    }

    if (this.showFps) this.updateFps(dt);

    if (this.bootVeil) {
      this.bootVeil.classList.add('gone');
      const veil = this.bootVeil;
      this.bootVeil = null;
      setTimeout(() => veil.remove(), 1000);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DJWishApp();
});
