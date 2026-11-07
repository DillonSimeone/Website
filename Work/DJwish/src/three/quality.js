/**
 * QualityManager - adaptive resolution + bloom tiering driven by a rolling
 * frame-time average. Steps down when frames are slow, steps back up when
 * there is headroom (only measurable on >60 Hz displays).
 *
 * Force a tier with ?quality=high | ?quality=low
 */
export class QualityManager {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    const maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const raw = [
      { dpr: maxDpr, bloom: true },
      { dpr: Math.min(maxDpr, 1.25), bloom: true },
      { dpr: Math.min(maxDpr, 1.0), bloom: true },
      { dpr: Math.min(maxDpr, 1.0), bloom: false },
      { dpr: Math.min(maxDpr, 0.85), bloom: false },
      { dpr: 0.75, bloom: false }
    ];
    this.tiers = raw.filter((t, i) => i === 0 || t.dpr !== raw[i - 1].dpr || t.bloom !== raw[i - 1].bloom);

    const forced = new URLSearchParams(window.location.search).get('quality');
    this.locked = forced === 'high' || forced === 'low';
    if (forced === 'high') this.index = 0;
    else if (forced === 'low') this.index = this.tiers.length - 1;
    else this.index = this.isTouch ? this.tiers.findIndex(t => !t.bloom) : 0;

    this.samples = new Float32Array(90);
    this.cursor = 0;
    this.count = 0;
    this.lastChange = performance.now();
  }

  get tier() {
    return this.tiers[this.index];
  }

  get dpr() {
    return this.tier.dpr;
  }

  get bloom() {
    return this.tier.bloom;
  }

  /** 'auto' adapts to frame time; 'high' | 'medium' | 'low' lock a tier. */
  setMode(mode) {
    const forced = new URLSearchParams(window.location.search).get('quality');
    if (forced === 'high' || forced === 'low') return;
    if (mode === 'auto') {
      this.locked = false;
      this.reset();
      return;
    }
    this.locked = true;
    const medium = this.tiers.findIndex(t => t.bloom && t.dpr <= 1.0);
    const index = mode === 'high' ? 0 : mode === 'low' ? this.tiers.length - 1 : Math.max(0, medium);
    if (index !== this.index) {
      this.index = index;
      this.apply(performance.now());
    }
  }

  reset() {
    this.count = 0;
    this.cursor = 0;
    this.lastChange = performance.now();
  }

  sample(frameMs) {
    if (this.locked || frameMs > 250) return;
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.count < this.samples.length) {
      this.count++;
      return;
    }

    const now = performance.now();
    if (now - this.lastChange < 2500) return;

    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i];
    const avg = sum / this.samples.length;

    if (avg > 19.5 && this.index < this.tiers.length - 1) {
      this.index++;
      this.apply(now);
    } else if (avg < 12.0 && this.index > 0) {
      this.index--;
      this.apply(now);
    }
  }

  apply(now) {
    this.lastChange = now;
    this.count = 0;
    if (this.onChange) this.onChange(this.tier);
  }
}
