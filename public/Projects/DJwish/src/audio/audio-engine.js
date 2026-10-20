/**
 * AudioEngine - Web Audio API Analysis Engine for DJ Deaf Wish
 * 
 * Features:
 * - Live Microphone & Line-in input capture
 * - File playback & drag-and-drop decoding (MP3/WAV/FLAC)
 * - Procedural synthesizer engine with selectable presets (808 Sub Heavy, Acid Arp, Warehouse Stomp)
 * - 7-Band FFT decomposition (20Hz - 20,000Hz)
 * - Real-time transient attack, beat detection, and clipping telemetry
 * - Synesthetic color calculation (20Hz Crimson -> 20kHz Violet)
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.isInitialized = false;
    this.isDemoPlaying = false;
    this.demoInterval = null;
    this.demoPreset = '808_sub'; // '808_sub', 'acid_arp', 'warehouse_stomp'
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
    
    // Telemetry payload
    this.telemetry = {
      overallEnergy: 0.0,
      subBass: 0.0,    // 20 - 60 Hz
      bass: 0.0,       // 60 - 250 Hz
      lowMid: 0.0,     // 250 - 500 Hz
      mid: 0.0,        // 500 - 2000 Hz
      highMid: 0.0,    // 2000 - 6000 Hz
      high: 0.0,       // 6000 - 12000 Hz
      air: 0.0,        // 12000 - 20000 Hz
      dominantFreq: 0,
      spectralCentroid: 0,
      isBeat: false,
      transientAttack: 0.0,
      isClipping: false,
      primaryColor: { r: 1.0, g: 0.0, b: 0.3 },
      secondaryColor: { r: 0.5, g: 0.0, b: 1.0 },
      inputMode: 'none' // 'mic', 'demo', 'file'
    };
    
    this.prevBass = 0.0;
    this.prevMid = 0.0;
    this.prevEnergy = 0.0;
    this.lastBeatTime = 0;
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

  async init(mode = 'demo') {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainArray = new Uint8Array(this.analyser.fftSize);
    }

    if (mode === 'mic') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.stopDemoSynth();
        if (this.source) this.source.disconnect();
        this.source = this.ctx.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        this.isInitialized = true;
        this.telemetry.inputMode = 'mic';
        return { success: true, mode: 'mic' };
      } catch (err) {
        console.warn('Microphone permission denied, falling back to procedural demo beat.', err);
        return this.startDemoSynth();
      }
    } else {
      return this.startDemoSynth();
    }
  }

  startDemoSynth(preset = this.demoPreset) {
    if (!this.ctx) return;
    this.stopDemoSynth();
    this.demoPreset = preset;
    this.isDemoPlaying = true;
    this.telemetry.inputMode = 'demo';
    this.isInitialized = true;

    // Audible demo audio bus with master safety limiter
    const masterGain = this.ctx.createGain();
    masterGain.gain.value = this._demoVolume;
    this.analyser.connect(masterGain);
    masterGain.connect(this.ctx.destination);
    this.demoMasterGain = masterGain;

    let step = 0;
    const tempoMs = (60 / 128) * 1000 / 4; // 128 BPM 16th notes

    this.demoInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const beat16 = step % 16;

      // 1. Kick on 0, 4, 8, 12 (Heavy 808 sub bass transient)
      if (beat16 % 4 === 0) {
        this.playKick(now, this.demoPreset === '808_sub' ? 1.4 : 1.1);
      }

      // 2. Snare / Clap on beats 4, 12
      if (beat16 === 4 || beat16 === 12) {
        this.playSnare(now);
      }

      // 3. Hi-Hats on off-beats
      if (beat16 % 2 === 1 || beat16 % 4 === 2) {
        this.playHiHat(now, beat16 % 4 === 2 ? 0.08 : 0.04);
      }

      // 4. Melodic Arp & Sub Bass Line
      if (beat16 % 2 === 0) {
        const chordNotes = [220, 261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        const freq = chordNotes[(step >> 1) % chordNotes.length];
        this.playSynthLead(now, freq);
      }

      // 5. Deep Drone Sub (Deaf Sonic Agency rumble)
      if (step % 8 === 0) {
        this.playSubDrone(now, 45.0);
      }

      step++;
    }, tempoMs);

    return { success: true, mode: 'demo' };
  }

  stopDemoSynth() {
    this.isDemoPlaying = false;
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    if (this.demoMasterGain) {
      try {
        this.demoMasterGain.disconnect();
      } catch (_) {}
      this.demoMasterGain = null;
    }
  }

  playKick(time, boost = 1.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.16);
    gain.gain.setValueAtTime(1.2 * this.gain * boost, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  playSubDrone(time, freq = 45.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.8 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.65);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.7);
  }

  playSnare(time) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1100;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    noise.start(time);
    noise.stop(time + 0.16);
  }

  playHiHat(time, dur = 0.05) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(9000 + Math.random() * 4500, time);
    gain.gain.setValueAtTime(0.35 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + dur);
  }

  playSynthLead(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.24 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.22);
  }

  async loadFile(file) {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          this.stopDemoSynth();
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
          this.analyser.connect(this.ctx.destination);
          bufferSource.start(0);
          this.source = bufferSource;
          this.telemetry.inputMode = 'file';
          this.isInitialized = true;
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
    const nyquist = this.ctx.sampleRate / 2;
    const binCount = this.analyser.frequencyBinCount;
    const lowBin = Math.max(0, Math.floor((lowHz / nyquist) * binCount));
    const highBin = Math.min(binCount - 1, Math.ceil((highHz / nyquist) * binCount));

    if (lowBin >= highBin) return this.dataArray[lowBin] / 255;

    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += this.dataArray[i];
    }
    const avg = sum / (highBin - lowBin + 1) / 255;
    return Math.max(0, (avg - this.noiseFloor) / (1.0 - this.noiseFloor)) * this.gain;
  }

  update() {
    if (!this.analyser || !this.dataArray) return this.telemetry;

    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.timeDomainArray);

    // 1. Calculate 7 Discrete Raw Frequency Bands
    const rawSubBass = this.getAverageEnergy(20, 60);
    const rawBass = this.getAverageEnergy(60, 250);
    const rawLowMid = this.getAverageEnergy(250, 500);
    const rawMid = this.getAverageEnergy(500, 2000);
    const rawHighMid = this.getAverageEnergy(2000, 6000);
    const rawHigh = this.getAverageEnergy(6000, 12000);
    const rawAir = this.getAverageEnergy(12000, 20000);

    // Exponential smoothing
    const lerp = (curr, target, factor) => curr + (target - curr) * factor;
    const factor = this.smoothFactor;
    this.smoothSubBass = lerp(this.smoothSubBass, rawSubBass, factor);
    this.smoothBass = lerp(this.smoothBass, rawBass, factor);
    this.smoothLowMid = lerp(this.smoothLowMid, rawLowMid, factor);
    this.smoothMid = lerp(this.smoothMid, rawMid, factor);
    this.smoothHighMid = lerp(this.smoothHighMid, rawHighMid, factor);
    this.smoothHigh = lerp(this.smoothHigh, rawHigh, factor);
    this.smoothAir = lerp(this.smoothAir, rawAir, factor);

    const subBass = this.smoothSubBass;
    const bass = this.smoothBass;
    const lowMid = this.smoothLowMid;
    const mid = this.smoothMid;
    const highMid = this.smoothHighMid;
    const high = this.smoothHigh;
    const air = this.smoothAir;

    // Overall RMS energy
    let sumSquares = 0;
    let maxVal = 0;
    for (let i = 0; i < this.timeDomainArray.length; i++) {
      const val = (this.timeDomainArray[i] - 128) / 128;
      sumSquares += val * val;
      if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
    }
    const rawRms = Math.min(1.0, Math.sqrt(sumSquares / this.timeDomainArray.length) * this.gain * 1.8);
    this.smoothEnergy = lerp(this.smoothEnergy, rawRms, 0.25);
    const rms = this.smoothEnergy;
    const isClipping = maxVal > 0.98;

    // 2. Dominant Frequency & Spectral Centroid
    let maxBinVal = 0;
    let maxBinIdx = 0;
    let weightedSum = 0;
    let totalMag = 0;
    const nyquist = this.ctx.sampleRate / 2;
    const binCount = this.analyser.frequencyBinCount;

    for (let i = 0; i < binCount; i++) {
      const mag = this.dataArray[i];
      const freq = (i / binCount) * nyquist;
      weightedSum += freq * mag;
      totalMag += mag;
      if (mag > maxBinVal) {
        maxBinVal = mag;
        maxBinIdx = i;
      }
    }
    const dominantFreq = (maxBinIdx / binCount) * nyquist;
    const rawCentroid = totalMag > 0 ? weightedSum / totalMag : 200;
    this.smoothCentroid = lerp(this.smoothCentroid, rawCentroid, 0.15);
    const spectralCentroid = this.smoothCentroid;

    // 3. Transient & Beat Detection
    const now = performance.now();
    const bassDelta = rawBass - this.prevBass;
    const midDelta = rawMid - this.prevMid;
    const isBeat = bassDelta > this.beatThreshold && (now - this.lastBeatTime > 220);

    if (isBeat) {
      this.lastBeatTime = now;
    }

    const transientAttack = Math.max(0, Math.max(bassDelta, midDelta) * 2.5);
    this.prevBass = rawBass;
    this.prevMid = rawMid;
    this.prevEnergy = rawRms;

    // 4. Color Spectrum Calculation (Crimson -> Violet)
    const logMin = Math.log10(30);
    const logMax = Math.log10(16000);
    const logCentroid = Math.log10(Math.max(30, Math.min(16000, spectralCentroid)));
    const t = Math.max(0, Math.min(1, (logCentroid - logMin) / (logMax - logMin)));

    const hue = t * 0.85; 
    const sat = 0.95;
    const light = 0.5 + Math.min(0.4, air * 0.5);
    const primaryRGB = this.hslToRgb(hue, sat, light);

    const secondaryHue = (hue + 0.55) % 1.0;
    const secondaryRGB = this.hslToRgb(secondaryHue, 0.9, 0.45 + subBass * 0.3);

    // Save to Telemetry
    this.telemetry.overallEnergy = rms;
    this.telemetry.subBass = subBass;
    this.telemetry.bass = bass;
    this.telemetry.lowMid = lowMid;
    this.telemetry.mid = mid;
    this.telemetry.highMid = highMid;
    this.telemetry.high = high;
    this.telemetry.air = air;
    this.telemetry.dominantFreq = dominantFreq;
    this.telemetry.spectralCentroid = spectralCentroid;
    this.telemetry.isBeat = isBeat;
    this.telemetry.transientAttack = Math.min(1.0, transientAttack);
    this.telemetry.isClipping = isClipping;
    this.telemetry.primaryColor = primaryRGB;
    this.telemetry.secondaryColor = secondaryRGB;

    return this.telemetry;
  }

  hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r, g, b };
  }
}
