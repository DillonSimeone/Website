import { SceneManager } from './three/scene-manager.js';
import { STOPS, STAGE_SCENES, SHARED } from './three/world.js';
import { SettingsStore } from './settings/settings-store.js';
import { AudioEngine } from './audio/audio-engine.js';
import { HapticEngine } from './audio/haptic-engine.js';
import { ProjectionMapper } from './stage/projection-mapper.js';
import { MidiController } from './stage/midi-controller.js';
import { HeroOverlay } from './ui/hero.js';
import { GigCardController } from './ui/gig-card.js';
import { VideoModal } from './ui/video-modal.js';
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
    this.btnStageMic = document.getElementById('btn-stage-mic');
    this.btnStageMicBottom = document.getElementById('btn-stage-mic-bottom');
    this.btnHeaderMic = document.getElementById('btn-header-mic');
    this.btnToggleMic = document.getElementById('btn-toggle-mic');
    this.btnPillPrev = document.getElementById('btn-pill-prev');
    this.btnPillNext = document.getElementById('btn-pill-next');
    this.pillPageTitle = document.getElementById('pill-page-title');
    this.currentPage = 0;
    this.isPageLocked = false;
    this.touchStartY = 0;
    this.touchStartX = 0;

    this.fpsFromUrl = new URLSearchParams(window.location.search).has('fps');
    this.showFps = this.fpsFromUrl;
    if (this.showFps) this.fpsReadout.hidden = false;
    this.settings = new SettingsStore();

    this.init();
  }

  async init() {
    this.updateMicUI(false);
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

    this.director.onIntroApproach = () => {
      if (this.hero && !this.hero.isDismissed) {
        this.hero.dismiss(false);
      }
    };

    this.director.onIntroComplete = () => {
      document.body.classList.remove('intro-playing');
      if (this.hero && !this.hero.isDismissed) {
        this.hero.dismiss(false);
      }
    };

    this.settings.applyAll((k, v) => this.applySetting(k, v));
    this.settings.onChange((k, v) => this.applySetting(k, v));
    this.settingsDisc = this.sceneManager.settingsDisc;
    this.settingsDisc.bind(this.settings);
    this.settingsDisc.onRequestClose = () => this.closeSettings();

    this.bindEvents();
    this.bindScroll();
    this.bindMidiEvents();

    // In-app video player overlay
    this.videoModal = new VideoModal();

    // Past gigs floating card controller with 1-click rotation, video playback & fast-track
    this.gigCard = new GigCardController({
      onSelectGig: (pageIndex) => this.goToPage(pageIndex),
      onFastTrack: () => this.goToPage(5),
      onPlayVideo: (v) => this.videoModal.open(v)
    });

    // Top navigation YouTube showings button
    document.getElementById('btn-header-videos')?.addEventListener('click', () => {
      this.videoModal.open({
        videoId: 'Qm_eln3aJEA',
        title: 'Nate & Shawn — Collaborative Music Video',
        desc: 'Electronic production with Shawn Trail (hearing collaborator). Explore all DJ showings on Nate\'s YouTube channel.',
        url: 'https://www.youtube.com/watch?v=Qm_eln3aJEA'
      });
    });

    // Connect dedicated background video to gig tower billboard
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
      this.goToPage(hashStop, 'instant');
      this.director.skipIntro(true);
    } else {
      window.scrollTo(0, 0);
      this.updateNavButtons();
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

  goToPage(index, behavior = 'instant') {
    if (this.isStageMode || this.settingsOpen) return;

    const prev = this.currentPage;
    const target = Math.max(0, Math.min(STOPS.length - 1, index));
    this.currentPage = target;
    this.skipIntroIfPlaying();
    if (this.hero && !this.hero.isDismissed) this.hero.dismiss(false);

    // Somersault vault between Stop 4 (ADA South) and Stop 5 (Rider): doubled transition time (~3.6s duration)
    const isSomersault = (prev === 4 && target === 5) || (prev === 5 && target === 4);
    if (isSomersault) {
      this.director.scrollEase = 1.3; // Doubled transition time (~3.6s duration)
    } else {
      this.director.scrollEase = 3.8;
    }

    // Zero debounce lockout (0ms) as requested
    this.isPageLocked = false;

    // Suppress scroll-event feedback loop so window scroll doesn't fight goToPage
    this.isProgrammaticScroll = true;
    this.scrollToStop(target, 'instant');
    setTimeout(() => { this.isProgrammaticScroll = false; }, 80);

    this.director.setScrollProgress(target / (STOPS.length - 1));
    this.updateNavButtons();
    this.updateGigCard();
  }

  updateNavButtons() {
    if (this.btnPillPrev) this.btnPillPrev.disabled = (this.currentPage <= 0);
    if (this.btnPillNext) this.btnPillNext.disabled = (this.currentPage >= STOPS.length - 1);
    if (this.pillPageTitle) {
      const stop = STOPS[this.currentPage];
      const label = stop?.pageTitle || stop?.label || `Page ${this.currentPage + 1}`;
      this.pillPageTitle.textContent = `${label} (${this.currentPage + 1}/${STOPS.length})`;
    }
  }

  updateGigCard() {
    if (!this.gigCard) return;
    if (this.currentPage === 1) {
      this.gigCard.showGig('codafest');
    } else if (this.currentPage === 2) {
      this.gigCard.showGig('wdt');
    } else if (this.currentPage === 3) {
      this.gigCard.showGig('confluence');
    } else if (this.currentPage === 4) {
      this.gigCard.showGig('ada');
    } else {
      this.gigCard.hide();
    }
  }

  skipIntroIfPlaying() {
    if (this.director.isPlayingIntro) this.director.skipIntro();
  }

  bindScroll() {
    window.addEventListener('scroll', () => {
      if (this.isStageMode || this.settingsOpen) return;
      if (this.isProgrammaticScroll) return; // Prevent smooth scroll loop from overriding currentPage!
      const progress = this.getScrollProgress();
      this.director.setScrollProgress(progress);
      const stop = Math.round(progress * (STOPS.length - 1));
      if (stop !== this.currentPage) {
        this.currentPage = stop;
        this.updateNavButtons();
        this.updateGigCard();
      }
      if (window.scrollY > 4) this.skipIntroIfPlaying();
    }, { passive: true });

    window.addEventListener('wheel', (e) => {
      if (this.isStageMode || this.settingsOpen) return;
      if (this.hero && !this.hero.isDismissed) {
        this.hero.dismiss();
        return;
      }
      if (Math.abs(e.deltaY) < 18) return;

      if (e.deltaY > 0) {
        this.goToPage(this.currentPage + 1);
      } else {
        this.goToPage(this.currentPage - 1);
      }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        this.touchStartY = e.touches[0].clientY;
        this.touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.isStageMode || this.settingsOpen) return;
      if (!e.changedTouches || !e.changedTouches[0]) return;
      if (e.target && e.target.closest('#gig-floating-card, #video-modal, #gig-lightbox, #settings-disc, #street-header, #bottom-nav-pill')) return;
      const dy = this.touchStartY - e.changedTouches[0].clientY;
      const dx = this.touchStartX - e.changedTouches[0].clientX;

      if (this.hero && !this.hero.isDismissed) {
        if (Math.abs(dy) > 30) this.hero.dismiss();
        return;
      }

      if (Math.abs(dy) > 40 || Math.abs(dx) > 50) {
        if (dy > 40 || dx > 50) {
          this.goToPage(this.currentPage + 1);
        } else {
          this.goToPage(this.currentPage - 1);
        }
      }
    }, { passive: true });

    this.threeContainer.addEventListener('pointerdown', () => this.skipIntroIfPlaying());

    this.btnPillPrev?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.btnPillNext?.addEventListener('click', () => this.goToPage(this.currentPage + 1));

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        this.skipIntroIfPlaying();
        this.goToPage(parseInt(dot.dataset.stop, 10));
      });
    });
  }

  /* ---------------- UI events ---------------- */

  updateMicUI(isLive) {
    const micButtons = [
      this.btnStageMic,
      this.btnStageMicBottom,
      this.btnHeaderMic,
      this.btnToggleMic
    ].filter(Boolean);

    micButtons.forEach(btn => {
      btn.classList.toggle('active', isLive);
      btn.classList.toggle('toggled', isLive);
      btn.classList.toggle('untoggled', !isLive);
      btn.setAttribute('aria-pressed', isLive ? 'true' : 'false');
      btn.setAttribute('title', isLive ? 'Live Mic Input ACTIVE (Click to toggle off)' : 'Toggle Mic Input (Live Mode)');
    });
  }

  async toggleMicLive() {
    if (this.isTogglingMic) return;
    this.isTogglingMic = true;

    try {
      const isCurrentlyLive = this.audio?.isMicLive();
      if (isCurrentlyLive) {
        this.audio.stopMic(true);
        this.audio.resetTelemetry();
        this.sceneManager?.resetAudioTelemetry();
        this.isAudioStarted = true;
        this.updateMicUI(false);
        this.setAudioButton(true, 'DEMO ACTIVE');
        this.updateDeckStatus('DEMO ACTIVE');
        return;
      }

      this.audio.resetTelemetry();
      this.sceneManager?.resetAudioTelemetry();
      const res = await this.audio.init('mic');
      this.isAudioStarted = true;
      if (res && res.success && res.mode === 'mic') {
        this.updateMicUI(true);
        this.setAudioButton(true, 'AUDIO LIVE');
        this.updateDeckStatus('MIC LIVE');
      } else {
        this.updateMicUI(false);
        this.setAudioButton(true, 'DEMO ACTIVE');
        this.updateDeckStatus('MIC DENIED');
        const err = res?.error;
        let msg = 'Unable to access microphone.';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!window.isSecureContext && !isLocalhost) {
          msg = 'Microphone access requires HTTPS or localhost. Browsers block microphone requests over insecure HTTP.';
        } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          msg = 'Microphone permission was blocked. Please click the site settings / lock icon in your address bar and allow Microphone access, then try again.';
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          msg = 'No microphone device was detected on your system.';
        } else if (err?.message) {
          msg = err.message;
        }
        console.warn('[DJWish] Mic status:', msg, err);
        this.updateDeckStatus(msg.slice(0, 32));
      }
    } catch (e) {
      console.error('[DJWish] Unexpected mic error:', e);
      this.updateMicUI(false);
      this.updateDeckStatus('MIC ERROR');
    } finally {
      this.isTogglingMic = false;
    }
  }

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

    const onToggleMic = async () => {
      await this.toggleMicLive();
    };
    this.btnStageMic?.addEventListener('click', onToggleMic);
    this.btnStageMicBottom?.addEventListener('click', onToggleMic);
    this.btnHeaderMic?.addEventListener('click', onToggleMic);
    this.btnToggleMic?.addEventListener('click', onToggleMic);

    window.addEventListener('djwish:mic-ended', () => {
      this.updateMicUI(false);
      this.updateDeckStatus('DEMO ACTIVE');
    });

    this.btnToggleAudio?.addEventListener('click', async () => {
      if (!this.isAudioStarted) {
        await this.ensureAudio();
        this.updateDeckStatus('DEMO ACTIVE');
      } else {
        this.audio.stopDemoSynth();
        if (this.audio.isMicLive()) {
          this.audio.stopMic(false);
          this.updateMicUI(false);
        }
        this.isAudioStarted = false;
        this.setAudioButton(false, 'START AUDIO');
        this.updateDeckStatus('PAUSED');
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
        this.updateMicUI(false);
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
          this.updateMicUI(false);
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
      this.currentPage = 0;
      this.gigCard?.hide();
      this.updateNavButtons();
      this.director.startIntro();
      document.body.classList.add('intro-playing');

      // Recreate hero overlay popup during replay
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
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this.goToPage(this.currentPage + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.goToPage(this.currentPage - 1);
        }
      }

      if (e.key >= '1' && e.key <= String(STAGE_SCENES.length - 1)) this.switchScene(parseInt(e.key, 10));
      else if (e.key === 'l' || e.key === 'L') this.toggleMicLive();
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
    this.gigCard?.hide();
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
    this.goToPage(this.currentPage);
    this.updateGigCard();
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
        if (telemetry) this.updateStageHud(dt, telemetry);
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
    } catch (err) {
      console.error('[DJWish] Render loop error:', err);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DJWishApp();
});
