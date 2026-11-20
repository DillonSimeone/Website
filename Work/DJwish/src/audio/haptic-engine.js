/**
 * HapticEngine - Web Haptics Driver for Tactile Deaf Sonic Agency
 * Translates low-frequency sub-bass transients and kick hits into tactile physical vibrations
 * using the Web Vibration API (navigator.vibrate).
 */

export class HapticEngine {
  constructor() {
    this.isEnabled = true;
    this.isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    this.lastVibrateTime = 0;
    this.minInterval = 140; // Avoid motor burnout / browser throttling
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
    if (this.isSupported) {
      try { navigator.vibrate(0); } catch (_) {}
    }
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  /**
   * Called every frame with the latest AudioEngine telemetry
   */
  update(telemetry) {
    if (!this.isEnabled || !this.isSupported || !telemetry) return;

    const now = performance.now();
    if (now - this.lastVibrateTime < this.minInterval) return;

    // Sub-bass kick hit or heavy transient attack
    if (telemetry.isBeat && telemetry.subBass > 0.35) {
      this.lastVibrateTime = now;
      const duration = Math.min(80, Math.floor(40 + telemetry.subBass * 45));
      try {
        navigator.vibrate(duration);
      } catch (_) {}
    } 
    // Snare / high-mid slap
    else if (telemetry.transientAttack > 0.75) {
      this.lastVibrateTime = now;
      try {
        navigator.vibrate([20, 15, 20]);
      } catch (_) {}
    }
  }

  /**
   * Manual haptic test buzz
   */
  testPulse() {
    if (!this.isSupported) return false;
    try {
      return navigator.vibrate([50, 40, 80]);
    } catch (_) {
      return false;
    }
  }
}
