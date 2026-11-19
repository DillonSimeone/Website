import { DemoSynth } from './demo-synth.js';

/**
 * AudioEngine - Web Audio API Analysis Engine for DJ Deaf Wish
 *
 * Features:
 * - Live Microphone & Line-in input capture
 * - File playback & drag-and-drop / tap-to-browse decoding (MP3/WAV/FLAC/OGG)
 * - Procedural synthesizer engine delegated to DemoSynth (3 distinct presets)
 * - Single-pass 7-Band FFT decomposition (20Hz - 20,000Hz) with pre-computed bin ranges
 * - Real-time peak frequency tracking, transient attack, live BPM estimation, and clipping telemetry
 */

const BAND_RANGES = [
  [20, 60],       // 0: subBass
  [60, 250],      // 1: bass
  [250, 500],     // 2: lowMid
  [500, 2000],    // 3: mid
  [2000, 6000],   // 4: highMid
  [6000, 12000],  // 5: high
  [12000, 20000]  // 6: air
];

const LOG_MIN_FREQ = Math.log10(30);
const LOG_MAX_FREQ = Math.log10(16000);
const LOG_FREQ_SPAN = LOG_MAX_FREQ - LOG_MIN_FREQ;
const HUE_SCALE = 0.78;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function lerpVal(curr, target, factor) {
  const c = Number.isFinite(curr) ? curr : 0;
  const t = Number.isFinite(target) ? target : 0;
  return c + (t - c) * factor;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.micStream = null;
    this.demoBus = null;
    this.demoMasterGain = null;
    this.isInitialized = false;
    this.isDemoPlaying = false;
    this.demoPreset = '808_sub';
    this.fftSize = 2048;
    this.dataArray = null;
    this.timeDomainArray = null;

    // Sensitivity and smoothing
    this.gain = 1.35;
    this.smoothing = 0.86;
    this.noiseFloor = 0.02;
    this.smoothFactor = 0.22;
    this.beatThreshold = 0.18;
    this._demoVolume = 0.32;

    // Pre-computed band bin lookup
    this._bandLo = new Uint16Array(7);
    this._bandHi = new Uint16Array(7);
    this._bandSums = new Float32Array(7);
    this._bandEnergies = new Float32Array(7);
    this._peakIdx = new Int32Array(3);
    this._peakVal = new Float32Array(3);
    this._binsSampleRate = 0;
    this._binsCount = 0;

    // Smoothed frequency band registers
    this.smoothSubBass = 0.0;
    this.smoothBass = 0.0;
    this.smoothLowMid = 0.0;
    this.smoothMid = 0.0;
    this.smoothHighMid = 0.0;
    this.smoothHigh = 0.0;
    this.smoothAir = 0.0;
    this.smoothEnergy = 0.0;
    this.smoothCentroid = 180.0;
    this.smoothDominantFreq = 0.0;

    // Live BPM tracking (ring buffer of last 12 beat timestamps)
    this._beatTimes = new Float64Array(12);
    this._beatCursor = 0;
    this._beatCount = 0;
    this._intervals = new Float64Array(11);
    this.smoothBpm = 128;

    // Telemetry payload (mutated in-place to avoid GC churn)
    this.telemetry = {
      overallEnergy: 0.0,
      subBass: 0.0,
      bass: 0.0,
      lowMid: 0.0,
      mid: 0.0,
      highMid: 0.0,
      high: 0.0,
      air: 0.0,
      dominantFreq: 0,
      peakMagnitude: 0,
      peakFreqHue: 0,
      spectralCentroid: 0,
      bpm: 128,
      isBeat: false,
      transientAttack: 0.0,
      isClipping: false,
      primaryColor: { r: 1.0, g: 0.0, b: 0.3 },
      secondaryColor: { r: 0.5, g: 0.0, b: 1.0 },
      topPeaks: [
        { freq: 60, band: 1, tier: 0, hue: 0.03, mag: 0 },
        { freq: 800, band: 3, tier: 1, hue: 0.28, mag: 0 },
        { freq: 7200, band: 5, tier: 2, hue: 0.68, mag: 0 }
      ],
      inputMode: 'none' // 'mic', 'demo', 'file'
    };

    this.prevBass = 0.0;
    this.prevMid = 0.0;
    this.prevEnergy = 0.0;
    this.lastBeatTime = 0;

    this.synth = new DemoSynth(
      () => this.ctx,
      (gainNode) => this.routeSynthGain(gainNode),
      () => this.gain
    );
  }

  get demoVolume() {
    return this._demoVolume;
  }

  set demoVolume(v) {
    this._demoVolume = v;
    if (this.demoMasterGain) this.demoMasterGain.gain.value = v;
  }

  setSmoothing(v) {
    this.smoothing = v;
    if (this.analyser) this.analyser.smoothingTimeConstant = v;
  }

  computeBandBins() {
    if (!this.analyser || !this.ctx) return;
    const sampleRate = this.ctx.sampleRate || 44100;
    const binCount = this.analyser.frequencyBinCount;
    if (this._binsSampleRate === sampleRate && this._binsCount === binCount) return;

    const nyquist = sampleRate / 2;
    if (nyquist <= 0 || binCount <= 0) return;

    for (let b = 0; b < 7; b++) {
      const [loHz, hiHz] = BAND_RANGES[b];
      const lo = clamp(Math.floor((loHz / nyquist) * binCount), 0, binCount - 1);
      const hi = clamp(Math.ceil((hiHz / nyquist) * binCount), lo, binCount - 1);
      this._bandLo[b] = lo;
      this._bandHi[b] = hi;
    }
    this._binsSampleRate = sampleRate;
    this._binsCount = binCount;
  }

  resetTelemetry() {
    this.smoothSubBass = 0.0;
    this.smoothBass = 0.0;
    this.smoothLowMid = 0.0;
    this.smoothMid = 0.0;
    this.smoothHighMid = 0.0;
    this.smoothHigh = 0.0;
    this.smoothAir = 0.0;
    this.smoothEnergy = 0.0;
    this.smoothCentroid = 180.0;
    this.smoothDominantFreq = 0.0;
    this.prevBass = 0.0;
    this.prevMid = 0.0;
    this.prevEnergy = 0.0;

    this._beatCursor = 0;
    this._beatCount = 0;
    this.lastBeatTime = 0;
    this.smoothBpm = this.telemetry.inputMode === 'demo' ? this.synth.getPresetBpm(this.demoPreset) : 128;

    if (this.dataArray) this.dataArray.fill(0);
    if (this.timeDomainArray) this.timeDomainArray.fill(128);

    this.telemetry.overallEnergy = 0.0;
    this.telemetry.subBass = 0.0;
    this.telemetry.bass = 0.0;
    this.telemetry.lowMid = 0.0;
    this.telemetry.mid = 0.0;
    this.telemetry.highMid = 0.0;
    this.telemetry.high = 0.0;
    this.telemetry.air = 0.0;
    this.telemetry.dominantFreq = 0;
    this.telemetry.peakMagnitude = 0;
    this.telemetry.peakFreqHue = 0;
    this.telemetry.spectralCentroid = 180;
    this.telemetry.bpm = Math.round(this.smoothBpm);
    this.telemetry.isBeat = false;
    this.telemetry.transientAttack = 0.0;
    this.telemetry.isClipping = false;
    for (let k = 0; k < 3; k++) {
      this.telemetry.topPeaks[k].mag = 0;
    }
  }

  async requestMicrophoneStream() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      const err = new Error('Microphone access requires HTTPS or localhost (insecure HTTP context).');
      err.name = 'SecurityError';
      throw err;
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('[DJWish AudioEngine] Standard audio constraint rejected', err);
        throw err;
      }
    }

    const legacyGUM = navigator.getUserMedia
      || navigator.webkitGetUserMedia
      || navigator.mozGetUserMedia
      || navigator.msGetUserMedia;

    if (legacyGUM) {
      return new Promise((resolve, reject) => {
        legacyGUM.call(navigator, { audio: true }, resolve, reject);
      });
    }

    const err = new Error('Microphone API (getUserMedia) is not supported in this browser.');
    err.name = 'NotSupportedError';
    throw err;
  }

  ensureContextAndNodes() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainArray = new Uint8Array(this.analyser.fftSize);
      this.computeBandBins();
    }
    if (!this.demoBus) {
      this.demoBus = this.ctx.createGain();
      this.demoMasterGain = this.ctx.createGain();
      this.demoMasterGain.gain.value = this._demoVolume;
      this.demoBus.connect(this.demoMasterGain);
      this.demoMasterGain.connect(this.ctx.destination);
    }
  }

  async init(mode = 'demo') {
    this.ensureContextAndNodes();

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (resumeErr) {
        console.warn('[DJWish AudioEngine] AudioContext resume note:', resumeErr);
      }
    }

    if (mode === 'mic') {
      try {
        const stream = await this.requestMicrophoneStream();
        if (!stream || !stream.getAudioTracks().length) {
          throw new Error('No active audio tracks detected on microphone.');
        }

        this.stopDemoSynth();
        try { this.analyser.disconnect(); } catch (_) {}

        if (this.source) {
          try { this.source.disconnect(); } catch (_) {}
          this.source = null;
        }

        if (this.micStream && this.micStream !== stream) {
          try {
            this.micStream.getTracks().forEach(t => {
              t.onended = null;
              t.stop();
            });
          } catch (_) {}
        }
        this.micStream = stream;

        stream.getTracks().forEach(track => {
          track.onended = () => {
            this.stopMic(true);
            window.dispatchEvent(new CustomEvent('djwish:mic-ended'));
          };
        });

        this.source = this.ctx.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        this.isInitialized = true;
        this.telemetry.inputMode = 'mic';
        return { success: true, mode: 'mic' };
      } catch (err) {
        console.error('[DJWish AudioEngine] Microphone initialization failed:', err);
        this.startDemoSynth();
        return { success: false, mode: 'demo', error: err };
      }
    }
    return this.startDemoSynth();
  }

  startDemoSynth(preset = this.demoPreset) {
    if (!this.ctx) return;
    this.stopDemoSynth();
    if (this.source) {
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach(t => {
          t.onended = null;
          t.stop();
        });
      } catch (_) {}
      this.micStream = null;
    }
    if (this.demoBus) {
      try { this.demoBus.gain.setValueAtTime(1, this.ctx.currentTime); } catch (_) {}
    }

    this.demoPreset = preset;
    this.isDemoPlaying = true;
    this.telemetry.inputMode = 'demo';
    this.isInitialized = true;

    this._beatCount = 0;
    this._beatCursor = 0;
    this.smoothBpm = this.synth.getPresetBpm(preset);
    this.telemetry.bpm = this.smoothBpm;

    this.synth.start(preset);
    return { success: true, mode: 'demo' };
  }

  stopDemoSynth() {
    this.isDemoPlaying = false;
    this.synth.stop();
    if (this.demoBus && this.ctx) {
      try { this.demoBus.gain.setValueAtTime(0, this.ctx.currentTime); } catch (_) {}
    }
  }

  routeSynthGain(gainNode) {
    if (this.analyser) {
      try { gainNode.connect(this.analyser); } catch (_) {}
    }
    if (this.demoBus && this.isDemoPlaying) {
      try { gainNode.connect(this.demoBus); } catch (_) {}
    }
  }

  stopMic(fallbackToDemo = true) {
    if (this.source) {
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach(t => {
          t.onended = null;
          t.stop();
        });
      } catch (_) {}
      this.micStream = null;
    }
    if (this.telemetry.inputMode === 'mic') {
      this.telemetry.inputMode = 'none';
    }
    if (fallbackToDemo) {
      return this.startDemoSynth();
    }
    return { success: true, mode: 'none' };
  }

  isMicLive() {
    return this.telemetry.inputMode === 'mic' && Boolean(this.micStream);
  }

  async loadFile(file) {
    this.ensureContextAndNodes();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          this.stopDemoSynth();
          if (this.micStream) {
            try { this.micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
            this.micStream = null;
          }
          const arrayBuffer = e.target.result;
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

          if (this.source) {
            try { this.source.stop(); } catch (_) {}
            this.source.disconnect();
          }

          const bufferSource = this.ctx.createBufferSource();
          bufferSource.buffer = audioBuffer;
          bufferSource.loop = true;
          bufferSource.connect(this.analyser);
          if (this.demoBus) {
            try { this.demoBus.gain.setValueAtTime(1, this.ctx.currentTime); } catch (_) {}
            bufferSource.connect(this.demoBus);
          } else {
            bufferSource.connect(this.ctx.destination);
          }
          bufferSource.start(0);
          this.source = bufferSource;
          this.telemetry.inputMode = 'file';
          this.isInitialized = true;
          this._beatCount = 0;
          this._beatCursor = 0;
          resolve({ success: true, fileName: file.name });
        } catch (err) {
          console.error('Failed to decode audio file', err);
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  getAverageEnergy(lowHz, highHz) {
    if (!this.analyser || !this.dataArray) return 0;
    const nyquist = (this.ctx?.sampleRate || 44100) / 2;
    if (nyquist <= 0) return 0;
    const binCount = this.analyser.frequencyBinCount;
    if (binCount <= 0) return 0;
    const lowBin = clamp(Math.floor((lowHz / nyquist) * binCount), 0, binCount - 1);
    const highBin = clamp(Math.ceil((highHz / nyquist) * binCount), 0, binCount - 1);

    if (lowBin >= highBin) {
      const v = this.dataArray[lowBin] / 255;
      return Number.isFinite(v) ? v : 0;
    }

    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) sum += this.dataArray[i];
    const avg = sum / (highBin - lowBin + 1) / 255;
    const denom = Math.max(0.01, 1.0 - this.noiseFloor);
    const result = Math.max(0, (avg - this.noiseFloor) / denom) * this.gain;
    return Number.isFinite(result) ? result : 0;
  }

  recordBeatForBpm(now) {
    const cap = this._beatTimes.length;
    this._beatTimes[this._beatCursor] = now;
    this._beatCursor = (this._beatCursor + 1) % cap;
    if (this._beatCount < cap) this._beatCount++;

    if (this._beatCount < 4) {
      if (this.telemetry.inputMode === 'demo') {
        this.smoothBpm = this.synth.getPresetBpm(this.demoPreset);
      }
      return;
    }

    // Collect valid consecutive inter-beat intervals in chronological order
    let validCount = 0;
    const oldest = this._beatCount < cap ? 0 : this._beatCursor;
    for (let k = 1; k < this._beatCount; k++) {
      const prev = this._beatTimes[(oldest + k - 1) % cap];
      const curr = this._beatTimes[(oldest + k) % cap];
      let dtMs = curr - prev;
      // Fold half-time / double-time intervals into playable DJ range (60..200 BPM)
      while (dtMs > 1000 && dtMs < 2400) dtMs *= 0.5;
      if (dtMs >= 300 && dtMs <= 1000) {
        this._intervals[validCount++] = dtMs;
      }
    }

    if (validCount >= 3) {
      // Partial insertion sort for median without allocations
      for (let i = 1; i < validCount; i++) {
        const key = this._intervals[i];
        let j = i - 1;
        while (j >= 0 && this._intervals[j] > key) {
          this._intervals[j + 1] = this._intervals[j];
          j--;
        }
        this._intervals[j + 1] = key;
      }
      const medianMs = this._intervals[validCount >> 1];
      const instantBpm = clamp(60000 / medianMs, 60, 200);
      this.smoothBpm = lerpVal(this.smoothBpm, instantBpm, 0.25);
    }
  }

  update() {
    if (!this.analyser || !this.dataArray || !this.timeDomainArray) return this.telemetry;

    try {
      this.analyser.getByteFrequencyData(this.dataArray);
      this.analyser.getByteTimeDomainData(this.timeDomainArray);
    } catch (_) {
      return this.telemetry;
    }

    this.computeBandBins();

    const nyquist = (this.ctx?.sampleRate || 44100) / 2;
    const binCount = this.analyser.frequencyBinCount;
    const data = this.dataArray;

    // 1. Single-pass FFT loop: accumulate bands, dominant peak bin, top 3 spectral peaks, & centroid
    this._bandSums.fill(0);
    this._peakVal.fill(0);
    this._peakIdx.fill(1);
    let maxBinVal = 0;
    let maxBinIdx = 1;
    let weightedSum = 0;
    let totalMag = 0;

    const pv = this._peakVal;
    const pi = this._peakIdx;

    if (binCount > 1 && nyquist > 0) {
      const freqStep = nyquist / binCount;
      for (let i = 1; i < binCount; i++) {
        const mag = data[i];
        if (mag > 0) {
          weightedSum += (i * freqStep) * mag;
          totalMag += mag;
          if (mag > maxBinVal) {
            maxBinVal = mag;
            maxBinIdx = i;
          }
          const left = data[i - 1];
          const right = i + 1 < binCount ? data[i + 1] : 0;
          if (mag > 8 && mag >= left && mag >= right && (mag > left || mag > right)) {
            if (pv[0] > 0 && Math.abs(i - pi[0]) < 2) {
              if (mag > pv[0]) { pv[0] = mag; pi[0] = i; }
            } else if (pv[1] > 0 && Math.abs(i - pi[1]) < 2) {
              if (mag > pv[1]) { pv[1] = mag; pi[1] = i; }
            } else if (pv[2] > 0 && Math.abs(i - pi[2]) < 2) {
              if (mag > pv[2]) { pv[2] = mag; pi[2] = i; }
            } else if (mag > pv[2]) {
              pv[2] = mag;
              pi[2] = i;
            }
            if (pv[2] > pv[1]) {
              const tv = pv[1]; const ti = pi[1];
              pv[1] = pv[2]; pi[1] = pi[2];
              pv[2] = tv; pi[2] = ti;
            }
            if (pv[1] > pv[0]) {
              const tv = pv[0]; const ti = pi[0];
              pv[0] = pv[1]; pi[0] = pi[1];
              pv[1] = tv; pi[1] = ti;
            }
          }
          for (let b = 0; b < 7; b++) {
            if (i >= this._bandLo[b] && i <= this._bandHi[b]) {
              this._bandSums[b] += mag;
            }
          }
        }
      }
    }

    if (pv[0] <= 8 && maxBinVal > 8) {
      pv[0] = maxBinVal;
      pi[0] = maxBinIdx;
    }

    if (binCount > 1 && nyquist > 0) {
      const topPeaks = this.telemetry.topPeaks;
      const fallbackFreqs = [60, 800, 7200];
      for (let k = 0; k < 3; k++) {
        const useVal = pv[k] > 8 ? pv[k] : (pv[0] > 8 ? pv[0] : 0);
        const useIdx = pv[k] > 8 ? pi[k] : (pv[0] > 8 ? pi[0] : 0);
        const freq = useVal > 0 ? (useIdx / binCount) * nyquist : fallbackFreqs[k];
        const cFreq = clamp(freq, 30, 16000);
        const tier = freq < 250 ? 0 : (freq < 4000 ? 1 : 2);
        let band = 6;
        for (let b = 0; b < 7; b++) {
          if (freq <= BAND_RANGES[b][1]) { band = b; break; }
        }
        const hue = clamp((Math.log10(cFreq) - LOG_MIN_FREQ) / LOG_FREQ_SPAN, 0, 1) * HUE_SCALE;
        topPeaks[k].freq = freq;
        topPeaks[k].band = band;
        topPeaks[k].tier = tier;
        topPeaks[k].hue = hue;
        topPeaks[k].mag = clamp(useVal / 255, 0, 1);
      }
    }

    const denom = Math.max(0.01, 1.0 - this.noiseFloor);
    for (let b = 0; b < 7; b++) {
      const span = Math.max(1, this._bandHi[b] - this._bandLo[b] + 1);
      const avg = this._bandSums[b] / span / 255;
      const e = Math.max(0, (avg - this.noiseFloor) / denom) * this.gain;
      this._bandEnergies[b] = Number.isFinite(e) ? e : 0;
    }

    const factor = this.smoothFactor;
    this.smoothSubBass = lerpVal(this.smoothSubBass, this._bandEnergies[0], factor);
    this.smoothBass = lerpVal(this.smoothBass, this._bandEnergies[1], factor);
    this.smoothLowMid = lerpVal(this.smoothLowMid, this._bandEnergies[2], factor);
    this.smoothMid = lerpVal(this.smoothMid, this._bandEnergies[3], factor);
    this.smoothHighMid = lerpVal(this.smoothHighMid, this._bandEnergies[4], factor);
    this.smoothHigh = lerpVal(this.smoothHigh, this._bandEnergies[5], factor);
    this.smoothAir = lerpVal(this.smoothAir, this._bandEnergies[6], factor);

    // 2. Time-domain RMS energy & clipping
    const wave = this.timeDomainArray;
    const len = wave.length;
    let sumSquares = 0;
    let maxVal = 0;
    for (let i = 0; i < len; i++) {
      const val = (wave[i] - 128) / 128;
      sumSquares += val * val;
      const av = val < 0 ? -val : val;
      if (av > maxVal) maxVal = av;
    }
    const rawRms = len > 0 ? Math.min(1.0, Math.sqrt(sumSquares / len) * this.gain * 1.8) : 0;
    this.smoothEnergy = lerpVal(this.smoothEnergy, Number.isFinite(rawRms) ? rawRms : 0, 0.25);
    const rms = Number.isFinite(this.smoothEnergy) ? this.smoothEnergy : 0;

    // 3. Peak frequency, logarithmic hue mapping & spectral centroid
    const instantDomFreq = (binCount > 1 && nyquist > 0 && maxBinVal > 8)
      ? (maxBinIdx / binCount) * nyquist
      : 0;
    this.smoothDominantFreq = instantDomFreq > 0
      ? lerpVal(this.smoothDominantFreq || instantDomFreq, instantDomFreq, 0.45)
      : lerpVal(this.smoothDominantFreq, 0, 0.08);

    const clampedPeakFreq = clamp(this.smoothDominantFreq || 45, 30, 16000);
    const peakNorm = clamp((Math.log10(clampedPeakFreq) - LOG_MIN_FREQ) / LOG_FREQ_SPAN, 0, 1);
    const peakFreqHue = peakNorm * HUE_SCALE;

    const rawCentroid = totalMag > 0 ? weightedSum / totalMag : 200;
    this.smoothCentroid = lerpVal(this.smoothCentroid, Number.isFinite(rawCentroid) ? rawCentroid : 200, 0.15);
    const spectralCentroid = Number.isFinite(this.smoothCentroid) ? this.smoothCentroid : 200;

    // 4. Transient, beat detection & live BPM
    const now = performance.now();
    const rawBass = this._bandEnergies[1];
    const rawMid = this._bandEnergies[3];
    const bassDelta = rawBass - this.prevBass;
    const midDelta = rawMid - this.prevMid;
    const isBeat = bassDelta > this.beatThreshold && (now - this.lastBeatTime > 220);

    if (isBeat) {
      this.lastBeatTime = now;
      this.recordBeatForBpm(now);
    }

    const transientAttack = Math.max(0, Math.max(bassDelta, midDelta) * 2.5);
    this.prevBass = rawBass;
    this.prevMid = rawMid;
    this.prevEnergy = rms;

    // 5. Color spectrum calculation (in-place mutation)
    const clampedCentroid = clamp(spectralCentroid, 30, 16000);
    const t = clamp((Math.log10(clampedCentroid) - LOG_MIN_FREQ) / LOG_FREQ_SPAN, 0, 1);
    const hue = Number.isFinite(t) ? t * 0.85 : 0;
    const light = 0.5 + Math.min(0.4, this.smoothAir * 0.5);
    this.hslToRgbInto(hue, 0.95, light, this.telemetry.primaryColor);
    this.hslToRgbInto((hue + 0.55) % 1.0, 0.9, 0.45 + this.smoothSubBass * 0.3, this.telemetry.secondaryColor);

    this.telemetry.overallEnergy = rms;
    this.telemetry.subBass = this.smoothSubBass;
    this.telemetry.bass = this.smoothBass;
    this.telemetry.lowMid = this.smoothLowMid;
    this.telemetry.mid = this.smoothMid;
    this.telemetry.highMid = this.smoothHighMid;
    this.telemetry.high = this.smoothHigh;
    this.telemetry.air = this.smoothAir;
    this.telemetry.dominantFreq = this.smoothDominantFreq;
    this.telemetry.peakMagnitude = maxBinVal / 255;
    this.telemetry.peakFreqHue = peakFreqHue;
    this.telemetry.spectralCentroid = spectralCentroid;
    this.telemetry.bpm = Math.round(clamp(this.smoothBpm, 60, 200));
    this.telemetry.isBeat = isBeat;
    this.telemetry.transientAttack = Math.min(1.0, Number.isFinite(transientAttack) ? transientAttack : 0);
    this.telemetry.isClipping = maxVal > 0.98;

    return this.telemetry;
  }

  hslToRgbInto(h, s, l, out) {
    if (s === 0) {
      out.r = out.g = out.b = l;
      return out;
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    out.r = hue2rgb(p, q, h + 1 / 3);
    out.g = hue2rgb(p, q, h);
    out.b = hue2rgb(p, q, h - 1 / 3);
    return out;
  }
}
