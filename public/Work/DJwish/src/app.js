import { SceneManager } from './three/scene-manager.js';
import { STOPS, STAGE_SCENES } from './three/world.js';
import { getNextVisualMode } from './three/visual-modes.js';
import { SettingsStore } from './settings/settings-store.js';
import { applySetting } from './settings/settings-binder.js';
import { AudioEngine } from './audio/audio-engine.js';
import { HapticEngine } from './audio/haptic-engine.js';
import { ProjectionMapper } from './stage/projection-mapper.js';
import { MidiController } from './stage/midi-controller.js';
import { HeroOverlay } from './ui/hero.js';
import { GigCardController } from './ui/gig-card.js';
import { VideoModal } from './ui/video-modal.js';
import { NavigationController } from './ui/navigation-controller.js';
import { StageHud } from './ui/stage-hud.js';
import { getBookingMailto } from './data/gigs.js';

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
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.threeContainer = document.getElementById('three-container');
    this.css3dContainer = document.getElementById('css3d-container');
    this.bootVeil = document.getElementById('boot-veil');
    this.fpsReadout = document.getElementById('fps-readout');

    this.fpsFromUrl = new URLSearchParams(window.location.search).has('fps');
    this.showFps = this.fpsFromUrl;
    if (this.showFps && this.fpsReadout) this.fpsReadout.hidden = false;

    this.settings = new SettingsStore();
    this.init();
  }

  get currentPage() {
    return this.nav ? this.nav.currentPage : 0;
  }

  get settingsOpen() {
    return Boolean(this.sceneManager?.settingsOpen);
  }

  async init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    await waitForFonts();

    this.sceneManager = new SceneManager(
      this.threeContainer,
      this.css3dContainer,
      document.getElementById('settings-layer')
    );
    this.director = this.sceneManager.cameraDirector;
    this.audio = new AudioEngine();
    this.sceneManager.setAudioSource(this.audio);
    this.haptics = new HapticEngine();
    this.projectionMapper = new ProjectionMapper('stage-viewport');
    this.midi = new MidiController();
    this.midi.init();

    this.director.onIntroApproach = () => {
      if (this.hero && !this.hero.isDismissed) this.hero.dismiss(false);
    };
    this.director.onIntroComplete = () => {
      document.body.classList.remove('intro-playing');
      if (this.hero && !this.hero.isDismissed) this.hero.dismiss(false);
    };

    this.videoModal = new VideoModal();
    this.gigCard = new GigCardController({
      onSelectGig: (pageIndex) => this.goToPage(pageIndex),
      onFastTrack: () => this.goToPage(5),
      onPlayVideo: (v) => this.videoModal.open(v)
    });

    this.nav = new NavigationController({
      app: this,
      director: this.director,
      gigCard: this.gigCard
    });

    this.stageHud = new StageHud({
      app: this,
      settings: this.settings
    });
    this.stageHud.updateMicUI(false);

    // Apply persisted settings across engine + HUD
    this.settings.applyAll((k, v) => applySetting(this, k, v));
    this.settings.onChange((k, v) => applySetting(this, k, v));
    this.settingsDisc = this.sceneManager.settingsDisc;
    this.settingsDisc.bind(this.settings);
    this.settingsDisc.onRequestClose = () => this.closeSettings();

    this.bindEvents();
    this.bindMidiEvents();

    // Connect dedicated background video to GigTower billboard (paused automatically off-stop)
    const towerVideo = document.getElementById('tower-video');
    if (towerVideo) {
      this.sceneManager.setGigVideo(towerVideo);
    }

    // Instant 30-second booker hero overlay
    this.hero = new HeroOverlay({
      onDismiss: () => {
        this.director.skipIntro(false);
        this.goToPage(0);
      }
    });

    // Populate booking mailto links
    const bookingUrl = getBookingMailto();
    const btnHeaderBook = document.getElementById('btn-header-book');
    if (btnHeaderBook) btnHeaderBook.href = bookingUrl;
    const btnPanelBook = document.getElementById('panel-btn-book');
    if (btnPanelBook) btnPanelBook.href = bookingUrl;

    const hashStop = STOPS.findIndex(s => `#${s.id}` === window.location.hash);
    if (hashStop > 0) {
      this.director.skipIntro(true);
      this.goToPage(hashStop, { instant: true });
    } else {
      window.scrollTo(0, 0);
      this.nav.updateNavButtons();
      if (!this.settings.get('playIntro') || this.reducedMotion) {
        this.director.skipIntro(true);
      }
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
        if (this.isStageMode) this.stageHud.acquireWakeLock();
      }
    });
  }

  /* ---------------- visual themes & settings ---------------- */

  applyVisualMode(modeId) {
    const mode = this.sceneManager.applyVisualMode(modeId);
    this.stageHud?.syncVisualMode(mode);
    return mode;
  }

  cycleVisualMode({ silentToast = false } = {}) {
    const next = getNextVisualMode(this.settings.get('visualMode'));
    this.settings.set('visualMode', next.id);
    if (!silentToast) this.stageHud?.showToast(`THEME: ${next.label}`, 'gold');
  }

  setStarRain(on) {
    this.sceneManager?.setUserStarRain(on);
    this.stageHud?.syncStarRain(on);
  }

  setShowFps(v) {
    this.showFps = v || this.fpsFromUrl;
    if (this.fpsReadout) this.fpsReadout.hidden = !this.showFps;
  }

  openSettings() {
    if (this.settingsOpen) return;
    document.body.classList.add('settings-open');
    document.body.classList.remove('intro-playing');
    this.sceneManager.openSettings();
  }

  closeSettings() {
    if (!this.settingsOpen) return;
    this.sceneManager.closeSettings(() => {
      if (!this.settingsOpen) document.body.classList.remove('settings-open');
    });
  }

  toggleSettings() {
    if (this.settingsOpen) this.closeSettings();
    else this.openSettings();
  }

  /* ---------------- navigation ---------------- */

  goToPage(index, opts) {
    this.nav?.goToPage(index, opts);
  }

  skipIntroIfPlaying() {
    if (this.director?.isPlayingIntro) this.director.skipIntro();
  }

  /* ---------------- audio & mic ---------------- */

  async ensureAudio() {
    if (this.isAudioStarted) return;
    await this.audio.init('demo');
    this.isAudioStarted = true;
    this.stageHud.setAudioButton(true, 'PAUSE AUDIO');
  }

  async loadAudioFile(file) {
    if (!file) return;
    try {
      await this.audio.loadFile(file);
      this.isAudioStarted = true;
      this.stageHud.updateMicUI(false);
      this.stageHud.updateDeckStatus(`FILE: ${file.name.slice(0, 16)}`);
      this.stageHud.setAudioButton(true, 'PAUSE AUDIO');
      this.stageHud.showToast(`LOADED: ${file.name.slice(0, 22)}`);
    } catch (err) {
      console.error(err);
      this.stageHud.updateDeckStatus('DECODE FAILED');
      this.stageHud.showToast('AUDIO DECODE FAILED', 'pink');
    }
  }

  async toggleMicLive() {
    if (this.isTogglingMic) return;
    this.isTogglingMic = true;

    try {
      if (this.audio?.isMicLive()) {
        this.audio.stopMic(true);
        this.audio.resetTelemetry();
        this.sceneManager?.resetAudioTelemetry();
        this.isAudioStarted = true;
        this.stageHud.updateMicUI(false);
        this.stageHud.setAudioButton(true, 'DEMO ACTIVE');
        this.stageHud.updateDeckStatus('DEMO ACTIVE');
        return;
      }

      this.audio.resetTelemetry();
      this.sceneManager?.resetAudioTelemetry();
      const res = await this.audio.init('mic');
      this.isAudioStarted = true;
      if (res && res.success && res.mode === 'mic') {
        this.stageHud.updateMicUI(true);
        this.stageHud.setAudioButton(true, 'AUDIO LIVE');
        this.stageHud.updateDeckStatus('MIC LIVE');
        this.stageHud.showToast('LIVE MIC ACTIVE');
      } else {
        this.stageHud.updateMicUI(false);
        this.stageHud.setAudioButton(true, 'DEMO ACTIVE');
        const err = res?.error;
        let msg = 'Unable to access microphone.';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!window.isSecureContext && !isLocalhost) {
          msg = 'Microphone requires HTTPS or localhost.';
        } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          msg = 'Microphone permission blocked.';
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          msg = 'No microphone detected.';
        } else if (err?.message) {
          msg = err.message;
        }
        console.warn('[DJWish] Mic status:', msg, err);
        this.stageHud.updateDeckStatus(msg.slice(0, 32));
        this.stageHud.showToast(msg, 'pink');
      }
    } catch (e) {
      console.error('[DJWish] Unexpected mic error:', e);
      this.stageHud.updateMicUI(false);
      this.stageHud.updateDeckStatus('MIC ERROR');
    } finally {
      this.isTogglingMic = false;
    }
  }

  /* ---------------- UI & keyboard events ---------------- */

  bindEvents() {
    const launch = () => this.enterStageMode();
    document.getElementById('btn-launch-stage')?.addEventListener('click', launch);
    document.getElementById('btn-launch-stage-header')?.addEventListener('click', launch);
    document.getElementById('btn-exit-stage')?.addEventListener('click', () => this.exitStageMode());

    document.getElementById('btn-header-videos')?.addEventListener('click', () => {
      this.videoModal.open({
        videoId: 'Qm_eln3aJEA',
        title: 'Nate & Shawn — Collaborative Music Video',
        desc: 'Electronic production with Shawn Trail (hearing collaborator). Explore all DJ showings on Nate\'s YouTube channel.',
        url: 'https://www.youtube.com/watch?v=Qm_eln3aJEA'
      });
    });

    document.getElementById('btn-header-theme')?.addEventListener('click', () => this.cycleVisualMode());

    const onToggleMic = async () => { await this.toggleMicLive(); };
    this.stageHud.micButtons.forEach(btn => btn.addEventListener('click', onToggleMic));

    window.addEventListener('djwish:mic-ended', () => {
      this.stageHud.updateMicUI(false);
      this.stageHud.updateDeckStatus('DEMO ACTIVE');
    });

    this.stageHud.btnToggleAudio?.addEventListener('click', async () => {
      if (!this.isAudioStarted) {
        await this.ensureAudio();
        this.stageHud.updateDeckStatus('DEMO ACTIVE');
      } else {
        this.audio.stopDemoSynth();
        if (this.audio.isMicLive()) {
          this.audio.stopMic(false);
          this.stageHud.updateMicUI(false);
        }
        this.isAudioStarted = false;
        this.stageHud.setAudioButton(false, 'START AUDIO');
        this.stageHud.updateDeckStatus('PAUSED');
      }
    });

    const trackBtns = document.querySelectorAll('.track-btn');
    trackBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        trackBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        await this.ensureAudio();
        this.audio.startDemoSynth(preset);
        this.stageHud.updateMicUI(false);
        this.stageHud.updateDeckStatus(`PRESET: ${preset.toUpperCase()}`);
      });
    });

    // Audio drop-zone + tap-to-browse mobile file picker
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('audio-file-input');
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput?.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        this.loadAudioFile(e.dataTransfer.files[0]);
      });
    }
    fileInput?.addEventListener('change', () => {
      if (fileInput.files?.[0]) {
        this.loadAudioFile(fileInput.files[0]);
        fileInput.value = '';
      }
    });

    document.getElementById('btn-skip-intro')?.addEventListener('click', () => this.skipIntroIfPlaying());

    document.getElementById('btn-replay-intro')?.addEventListener('click', () => {
      window.scrollTo(0, 0);
      this.nav.currentPage = 0;
      this.gigCard?.hide();
      this.nav.updateNavButtons();
      this.director.startIntro();
      document.body.classList.add('intro-playing');

      const oldHero = document.getElementById('hero-overlay');
      if (oldHero) oldHero.remove();
      this.hero = new HeroOverlay({
        onDismiss: () => {
          this.director.skipIntro(false);
          this.goToPage(0);
        }
      });
    });

    const btnTestHaptics = document.getElementById('btn-test-haptics');
    btnTestHaptics?.addEventListener('click', () => {
      const didPulse = this.haptics.testPulse();
      btnTestHaptics.textContent = didPulse ? 'HAPTIC PULSE OK!' : 'HAPTICS NOT SUPPORTED (MOBILE ONLY)';
      setTimeout(() => {
        btnTestHaptics.textContent = 'TEST MOBILE HAPTICS';
      }, 2200);
    });

    this.stageHud.sceneSelect?.addEventListener('change', () => {
      this.switchScene(parseInt(this.stageHud.sceneSelect.value, 10));
      this.stageHud.sceneSelect.blur();
    });

    this.stageHud.themeSelect?.addEventListener('change', () => {
      const id = this.stageHud.themeSelect.value;
      this.settings.set('visualMode', id);
      const mode = this.sceneManager.visualMode;
      this.stageHud.showToast(`THEME: ${mode.label}`, 'gold');
      this.stageHud.themeSelect.blur();
    });

    this.stageHud.btnAutopilot?.addEventListener('click', () => {
      const next = !this.settings.get('autoPilot');
      this.settings.set('autoPilot', next);
      this.stageHud.showToast(next ? 'AUTO-PILOT ON' : 'AUTO-PILOT OFF', 'gold');
    });

    this.stageHud.speedSelect?.addEventListener('change', () => {
      const speed = this.stageHud.speedSelect.value;
      this.settings.set('autoPilotSpeed', speed);
      const cfg = this.stageHud.setAutoPilotSpeed(speed);
      this.stageHud.showToast(`AUTO SPEED: ${cfg.label}`, 'gold');
      this.stageHud.speedSelect.blur();
    });

    this.stageHud.btnStarRain?.addEventListener('click', () => {
      const next = !this.settings.get('starRain');
      this.settings.set('starRain', next);
      this.stageHud.showToast(next ? 'STARFALL RAIN ON' : 'STARFALL RAIN OFF', 'cyan');
    });

    document.getElementById('btn-stage-map')?.addEventListener('click', () => this.projectionMapper.toggleCalibration());
    document.getElementById('btn-stage-midi')?.addEventListener('click', async () => {
      await this.midi.init();
      this.stageHud.showToast(`MIDI: ${this.midi.activeDeviceName}`);
    });
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

      if (e.key === 't' || e.key === 'T') {
        this.cycleVisualMode();
        return;
      }

      if ((e.key === 'a' || e.key === 'A') && this.isStageMode) {
        const next = !this.settings.get('autoPilot');
        this.settings.set('autoPilot', next);
        this.stageHud.showToast(next ? 'AUTO-PILOT ON' : 'AUTO-PILOT OFF', 'gold');
        return;
      }

      if ((e.key === 'r' || e.key === 'R') && !this.projectionMapper?.isActive) {
        const next = !this.settings.get('starRain');
        this.settings.set('starRain', next);
        this.stageHud.showToast(next ? 'STARFALL RAIN ON' : 'STARFALL RAIN OFF', 'cyan');
        return;
      }

      if (e.code === 'Space') {
        if (onControl) return;
        e.preventDefault();
        if (this.director.isPlayingIntro) this.director.skipIntro();
        else if (!this.isStageMode) this.enterStageMode();
        else this.stageHud.btnToggleAudio?.click();
        return;
      }

      if (!this.isStageMode) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this.goToPage(this.currentPage + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.goToPage(this.currentPage - 1);
        }
      } else {
        if (e.key === '[') {
          this.stepStageScene(-1);
          return;
        } else if (e.key === ']') {
          this.stepStageScene(1);
          return;
        }
      }

      let sceneReq = 0;
      if (/^[1-9]$/.test(e.key)) sceneReq = parseInt(e.key, 10);
      else if (e.key === '0') sceneReq = 10;
      else if (e.key === '-') sceneReq = 11;
      else if (e.key === '=') sceneReq = 12;

      if (sceneReq > 0 && sceneReq < STAGE_SCENES.length) {
        if (!this.isStageMode) {
          this.stageScene = sceneReq;
          this.enterStageMode();
        } else {
          this.switchScene(sceneReq);
        }
      } else if (e.key === 'l' || e.key === 'L') {
        this.toggleMicLive();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 'v' || e.key === 'V') {
        const next = !this.settings.get('haptics');
        this.settings.set('haptics', next);
        this.stageHud.showToast(next ? 'HAPTICS ON' : 'HAPTICS OFF');
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

  /* ---------------- stage mode ---------------- */

  enterStageMode() {
    if (this.isStageMode) return;
    this.isStageMode = true;
    this.gigCard?.hide();
    document.body.classList.add('stage-mode');
    document.body.classList.remove('intro-playing');
    this.stageHud.setActive(true);
    this.stageHud.syncScene(this.stageScene);
    this.sceneManager.setStageMode(true, this.stageScene);

    const s = STAGE_SCENES[this.stageScene];
    if (s) this.stageHud.showToast(`LIVE STAGE // ${s.label}`, 'pink');

    if (!this.isAudioStarted) {
      this.ensureAudio().then(() => this.stageHud.updateDeckStatus('LIVE STAGE ACTIVE'));
    }
  }

  exitStageMode() {
    if (!this.isStageMode) return;
    this.isStageMode = false;
    document.body.classList.remove('stage-mode');
    this.stageHud.setActive(false);
    this.sceneManager.setStageMode(false);
    this.nav.scrollToStop(this.currentPage, 'instant');
    this.nav.updateNavButtons();
    this.nav.updateGigCard();
  }

  switchScene(sceneIndex, { silentToast = false } = {}) {
    this.stageScene = sceneIndex;
    this.sceneManager.setStageScene(sceneIndex);
    this.stageHud.syncScene(sceneIndex);
    if (!silentToast) {
      const s = STAGE_SCENES[sceneIndex];
      if (s) this.stageHud.showToast(`SCENE ${s.id}: ${s.label}`);
    }
  }

  stepStageScene(dir) {
    const count = STAGE_SCENES.length - 1;
    const next = ((this.stageScene - 1 + dir + count) % count) + 1;
    this.switchScene(next);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  /* ---------------- frame loop ---------------- */

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
    try {
      const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 1 / 60;
      this.lastTime = time;

      const telemetry = this.audio ? this.audio.update() : null;
      if (telemetry && this.isAudioStarted && this.haptics) {
        this.haptics.update(telemetry);
      }

      if (telemetry) {
        this.sceneManager.update(dt, telemetry);
      }

      if (this.isStageMode) {
        if (telemetry) this.stageHud.updateTelemetry(dt, telemetry);
      } else {
        this.nav.updateStreetHud();
      }

      if (this.showFps) this.updateFps(dt);

      if (this.bootVeil) {
        this.bootVeil.classList.add('gone');
        const veil = this.bootVeil;
        this.bootVeil = null;
        setTimeout(() => veil.remove(), 1000);
      }
    } catch (err) {
      console.error('[DJWish] Render loop error:', err);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DJWishApp();
});
