import { STAGE_SCENES } from '../three/world.js';

const AUTO_SPEEDS = {
  slow: { beats: 32, secs: 24, label: 'SLOW (24s)' },
  normal: { beats: 16, secs: 12, label: 'NORMAL (12s)' },
  fast: { beats: 8, secs: 6, label: 'FAST (6s)' },
  hyper: { beats: 4, secs: 3, label: 'HYPER (3s)' }
};

/**
 * StageHud - Controls Live Stage Rig HUD, Visual Theme selectors, Auto-Pilot speed &
 * theme rotation, Starfall Rain toggle, live BPM & audio telemetry, Wake Lock & Toasts.
 */
export class StageHud {
  constructor({ app, settings } = {}) {
    this.app = app;
    this.settings = settings;

    this.stageHud = document.getElementById('stage-hud');
    this.sceneSelect = document.getElementById('scene-select');
    this.themeSelect = document.getElementById('theme-select');
    this.speedSelect = document.getElementById('autopilot-speed-select');
    this.btnHeaderTheme = document.getElementById('btn-header-theme');
    this.btnAutopilot = document.getElementById('btn-stage-autopilot');
    this.btnStarRain = document.getElementById('btn-stage-starrain');
    this.hudBpm = document.getElementById('hud-bpm');
    this.hudDomFreq = document.getElementById('hud-dom-freq');
    this.hudEnergy = document.getElementById('hud-energy');
    this.hudClipWarning = document.getElementById('hud-clip-warning');
    this.deckStatusTag = document.getElementById('deck-input-status');
    this.btnToggleAudio = document.getElementById('btn-toggle-audio');
    this.toastEl = document.getElementById('toast-hud');

    this.micButtons = [
      document.getElementById('btn-stage-mic'),
      document.getElementById('btn-stage-mic-bottom'),
      document.getElementById('btn-header-mic'),
      document.getElementById('btn-toggle-mic')
    ].filter(Boolean);

    this.autoPilot = false;
    this.autoPilotSpeed = 'normal';
    this.autoCycleThemes = true;
    this.scenesSinceTheme = 0;
    this.beatCounter = 0;
    this.autoTimer = 0;
    this.lastBeatSeen = false;
    this.clipHold = 0;
    this.clipShown = false;
    this.hudTimer = 0;
    this.toastTimer = null;
    this.wakeLock = null;
  }

  setActive(on) {
    this.stageHud?.classList.toggle('active', on);
    if (on) {
      this.beatCounter = 0;
      this.autoTimer = 0;
      this.acquireWakeLock();
    } else {
      this.releaseWakeLock();
    }
  }

  syncScene(sceneIndex) {
    if (this.sceneSelect) this.sceneSelect.value = String(sceneIndex);
  }

  syncVisualMode(mode) {
    if (!mode) return;
    document.body.dataset.visualMode = mode.id;
    if (this.themeSelect) this.themeSelect.value = mode.id;
    if (this.btnHeaderTheme) {
      this.btnHeaderTheme.textContent = `THEME: ${mode.shortLabel}`;
      this.btnHeaderTheme.title = `Visual theme: ${mode.label} [T]`;
    }
  }

  setAutoPilot(on) {
    this.autoPilot = Boolean(on);
    this.beatCounter = 0;
    this.autoTimer = 0;
    this.scenesSinceTheme = 0;
    if (this.btnAutopilot) {
      this.btnAutopilot.classList.toggle('active', this.autoPilot);
      this.btnAutopilot.setAttribute('aria-pressed', this.autoPilot ? 'true' : 'false');
    }
  }

  setAutoPilotSpeed(speed) {
    this.autoPilotSpeed = speed in AUTO_SPEEDS ? speed : 'normal';
    this.beatCounter = 0;
    this.autoTimer = 0;
    if (this.speedSelect) this.speedSelect.value = this.autoPilotSpeed;
    return AUTO_SPEEDS[this.autoPilotSpeed];
  }

  setAutoCycleThemes(on) {
    this.autoCycleThemes = Boolean(on);
  }

  syncStarRain(on) {
    if (!this.btnStarRain) return;
    this.btnStarRain.classList.toggle('active', Boolean(on));
    this.btnStarRain.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  updateMicUI(isLive) {
    this.micButtons.forEach(btn => {
      btn.classList.toggle('active', isLive);
      btn.classList.toggle('toggled', isLive);
      btn.classList.toggle('untoggled', !isLive);
      btn.setAttribute('aria-pressed', isLive ? 'true' : 'false');
      btn.setAttribute('title', isLive ? 'Live Mic Input ACTIVE (Click to toggle off)' : 'Toggle Mic Input (Live Mode)');
    });
  }

  setAudioButton(active, label) {
    if (!this.btnToggleAudio) return;
    this.btnToggleAudio.textContent = label;
    this.btnToggleAudio.classList.toggle('active', active);
  }

  updateDeckStatus(text) {
    if (this.deckStatusTag) this.deckStatusTag.textContent = text;
  }

  showToast(text, accent = 'cyan') {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.dataset.accent = accent;
    this.toastEl.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 1800);
  }

  updateTelemetry(dt, telemetry) {
    if (!telemetry) return;

    if (telemetry.isClipping) this.clipHold = 0.6;
    else this.clipHold = Math.max(0, this.clipHold - dt);
    const clip = this.clipHold > 0;
    if (clip !== this.clipShown) {
      this.clipShown = clip;
      this.hudClipWarning?.classList.toggle('on', clip);
    }

    // Stage Mode Auto-Pilot: speed-controlled scene rotation & periodic theme shifts
    if (this.autoPilot && this.app.isStageMode) {
      const audible = telemetry.overallEnergy > 0.02 || this.app.isAudioStarted;
      if (telemetry.isBeat && !this.lastBeatSeen) {
        this.beatCounter++;
      }
      this.lastBeatSeen = Boolean(telemetry.isBeat);

      if (audible) {
        this.autoTimer += dt;
      }

      const cfg = AUTO_SPEEDS[this.autoPilotSpeed] || AUTO_SPEEDS.normal;
      if (this.beatCounter >= cfg.beats || this.autoTimer >= cfg.secs) {
        this.beatCounter = 0;
        this.autoTimer = 0;
        const nextScene = (this.app.stageScene % (STAGE_SCENES.length - 1)) + 1;
        this.app.switchScene(nextScene, { silentToast: false });

        this.scenesSinceTheme++;
        if (this.autoCycleThemes && this.scenesSinceTheme >= 2) {
          this.scenesSinceTheme = 0;
          this.app.cycleVisualMode({ silentToast: true });
        }
      }
    }

    this.hudTimer += dt;
    if (this.hudTimer < 0.15) return;
    this.hudTimer = 0;

    if (this.hudBpm) this.hudBpm.textContent = String(telemetry.bpm || 128);
    if (this.hudDomFreq) this.hudDomFreq.textContent = `${Math.round(telemetry.dominantFreq)} Hz`;
    if (this.hudEnergy) this.hudEnergy.textContent = `${Math.round(telemetry.overallEnergy * 100)}%`;
  }

  async acquireWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock || document.hidden) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch (_) {
      this.wakeLock = null;
    }
  }

  releaseWakeLock() {
    if (!this.wakeLock) return;
    try { this.wakeLock.release(); } catch (_) {}
    this.wakeLock = null;
  }
}
