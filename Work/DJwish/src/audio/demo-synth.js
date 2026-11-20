/**
 * DemoSynth - Procedural Web Audio Synthesizer for DJ Deaf Wish
 *
 * Three distinct rhythmic & timbral grooves with zero per-hit AudioBuffer allocations:
 * - '808_sub'         (128 BPM): Deep 28-45 Hz chest-rumble kicks & sub-drone
 * - 'acid_arp'        (135 BPM): Resonant TB-303 style sweeping sawtooth 16th-note arps
 * - 'warehouse_stomp' (130 BPM): Overdriven industrial 4x4 kick, heavy snare bursts & square stabs
 */

const PRESET_BPM = {
  '808_sub': 128,
  'acid_arp': 135,
  'warehouse_stomp': 130
};

const ARP_NOTES = [110, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 329.63, 220.0, 196.0, 164.81, 146.83, 130.81, 164.81, 196.0, 293.66];
const SUB_PLUCKS = [220, 261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
const STOMP_STABS = [73.42, 73.42, 87.31, 98.0, 73.42, 110.0, 82.41, 65.41];

export class DemoSynth {
  constructor(getContext, routeGainNode, getGain) {
    this.getContext = getContext;
    this.routeGainNode = routeGainNode;
    this.getGain = getGain;

    this.preset = '808_sub';
    this.isPlaying = false;
    this.interval = null;
    this.step = 0;

    this._noiseBuffer = null;
    this._noiseSampleRate = 0;
    this._driveCurve = null;
  }

  getPresetBpm(preset = this.preset) {
    return PRESET_BPM[preset] || 128;
  }

  ensureNoiseBuffer(ctx) {
    if (this._noiseBuffer && this._noiseSampleRate === ctx.sampleRate) {
      return this._noiseBuffer;
    }
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    this._noiseBuffer = buffer;
    this._noiseSampleRate = ctx.sampleRate;
    return buffer;
  }

  ensureDriveCurve() {
    if (this._driveCurve) return this._driveCurve;
    const samples = 256;
    const curve = new Float32Array(samples);
    const k = 14;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    this._driveCurve = curve;
    return curve;
  }

  start(preset = this.preset) {
    const ctx = this.getContext();
    if (!ctx) return;
    this.stop();

    this.preset = PRESET_BPM[preset] ? preset : '808_sub';
    this.isPlaying = true;
    this.step = 0;
    this.ensureNoiseBuffer(ctx);

    const bpm = this.getPresetBpm(this.preset);
    const stepMs = (60 / bpm) * 1000 / 4; // 16th note grid

    this.interval = setInterval(() => {
      if (document.hidden) return;
      const c = this.getContext();
      if (!c || c.state !== 'running') return;
      this.tick(c, c.currentTime);
      this.step++;
    }, stepMs);
  }

  stop() {
    this.isPlaying = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick(ctx, now) {
    const s = this.step;
    const beat16 = s % 16;

    if (this.preset === 'acid_arp') {
      // Tight 4x4 kick
      if (beat16 % 4 === 0) {
        this.playKick(ctx, now, { startHz: 150, endHz: 42, dur: 0.22, boost: 1.05 });
      }
      // Crisp closed & open hats
      if (beat16 % 2 === 1) {
        this.playHiHat(ctx, now, beat16 % 4 === 2 ? 0.085 : 0.038, 0.36);
      }
      // Resonant sweeping 303 acid sawtooth arp every 16th note
      const noteIdx = s % ARP_NOTES.length;
      const barPhase = (s % 64) / 64;
      const cutoff = 260 + Math.sin(barPhase * Math.PI) * 2340;
      const accent = (beat16 === 0 || beat16 === 3 || beat16 === 6 || beat16 === 10 || beat16 === 14) ? 1.4 : 0.85;
      this.playAcidArp(ctx, now, ARP_NOTES[noteIdx], cutoff, accent);
      if (beat16 === 4 || beat16 === 12) {
        this.playSnare(ctx, now, 0.55, 1600);
      }
      return;
    }

    if (this.preset === 'warehouse_stomp') {
      // Heavy overdriven industrial 4x4 kick
      if (beat16 % 4 === 0) {
        this.playKick(ctx, now, { startHz: 185, endHz: 36, dur: 0.28, boost: 1.3, overdrive: true });
      }
      // Big metallic noise-burst snares on 4 and 12
      if (beat16 === 4 || beat16 === 12) {
        this.playSnare(ctx, now, 1.15, 950);
      }
      // Off-beat driving industrial hats
      if (beat16 % 4 === 2) {
        this.playHiHat(ctx, now, 0.09, 0.45);
      }
      // Syncopated square bass stabs
      if (beat16 === 0 || beat16 === 3 || beat16 === 6 || beat16 === 10 || beat16 === 13) {
        const freq = STOMP_STABS[(s >> 1) % STOMP_STABS.length];
        this.playSquareStab(ctx, now, freq);
      }
      return;
    }

    // Default: '808_sub' (128 BPM) — chest-rumble 28-45Hz sub-bass drops
    if (beat16 === 0 || beat16 === 6 || beat16 === 8 || beat16 === 14) {
      const boost = (beat16 === 0 || beat16 === 8) ? 1.45 : 1.05;
      this.playKick(ctx, now, { startHz: 155, endHz: 28, dur: 0.36, boost });
    }
    if (beat16 === 4 || beat16 === 12) {
      this.playSnare(ctx, now, 0.75, 1200);
    }
    if (beat16 % 2 === 1 || beat16 % 4 === 2) {
      this.playHiHat(ctx, now, beat16 % 4 === 2 ? 0.075 : 0.035, 0.3);
    }
    if (beat16 % 4 === 0) {
      const freq = SUB_PLUCKS[(s >> 2) % SUB_PLUCKS.length];
      this.playSynthPluck(ctx, now, freq);
    }
    if (s % 8 === 0) {
      this.playSubDrone(ctx, now, 42.0);
    }
  }

  playKick(ctx, time, { startHz = 160, endHz = 28, dur = 0.32, boost = 1.0, overdrive = false } = {}) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(startHz, time);
    osc.frequency.exponentialRampToValueAtTime(endHz, time + 0.16);
    gain.gain.setValueAtTime(1.2 * gScale * boost, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    if (overdrive) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.ensureDriveCurve();
      shaper.oversample = 'none';
      osc.connect(shaper);
      shaper.connect(gain);
    } else {
      osc.connect(gain);
    }

    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  playSubDrone(ctx, time, freq = 42.0) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.85 * gScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.65);
    osc.connect(gain);
    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + 0.7);
  }

  playSnare(ctx, time, amp = 0.8, hpFreq = 1100) {
    const gScale = this.getGain();
    const noise = ctx.createBufferSource();
    noise.buffer = this.ensureNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hpFreq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amp * gScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.17);

    noise.connect(filter);
    filter.connect(gain);
    this.routeGainNode(gain);
    noise.start(time);
    noise.stop(time + 0.18);
  }

  playHiHat(ctx, time, dur = 0.05, amp = 0.35) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(8800 + Math.random() * 4500, time);
    gain.gain.setValueAtTime(amp * gScale, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  playSynthPluck(ctx, time, freq) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(280, time + 0.22);

    gain.gain.setValueAtTime(0.18 * gScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  playAcidArp(ctx, time, freq, cutoff = 1200, accent = 1.0) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.Q.value = 10;
    filter.frequency.setValueAtTime(Math.min(6000, cutoff * accent), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.28), time + 0.14);

    gain.gain.setValueAtTime(0.24 * gScale * accent, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  playSquareStab(ctx, time, freq) {
    const gScale = this.getGain();
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(950, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + 0.18);

    gain.gain.setValueAtTime(0.28 * gScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.19);

    osc.connect(filter);
    filter.connect(gain);
    this.routeGainNode(gain);
    osc.start(time);
    osc.stop(time + 0.2);
  }
}
