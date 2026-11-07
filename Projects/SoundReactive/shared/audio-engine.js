/**
 * AudioEngine - Web Audio API Analysis Engine for Deaf DJ Visuals
 * 
 * Features:
 * - Microphone input capture
 * - File playback / Audio drop
 * - Built-in procedural demo synthesizer (808 kick, sub, snare, hi-hats, arps)
 * - 7-Band FFT decomposition (20Hz - 20,000Hz)
 * - Synesthetic Color calculation (Red at 20Hz -> Purple at 20kHz)
 * - Beat / Transient detector & Overdrive clipping monitor
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.demoOscNodes = [];
    this.isInitialized = false;
    this.isDemoPlaying = false;
    this.demoInterval = null;
    this.fftSize = 2048;
    this.dataArray = null;
    this.timeDomainArray = null;
    
    // Sensitivity and smoothing
    this.gain = 1.2;
    this.smoothing = 0.88;
    this.noiseFloor = 0.02;
    
    // Smoothed internal values for zero-jitter rendering
    this.smoothSubBass = 0.0;
    this.smoothBass = 0.0;
    this.smoothLowMid = 0.0;
    this.smoothMid = 0.0;
    this.smoothHighMid = 0.0;
    this.smoothHigh = 0.0;
    this.smoothAir = 0.0;
    this.smoothEnergy = 0.0;
    this.smoothCentroid = 200.0;
    
    // Telemetry state
    this.telemetry = {
      overallEnergy: 0.0,
      subBass: 0.0,    // 20 - 60 Hz
      bass: 0.0,       // 60 - 250 Hz
      lowMid: 0.0,     // 250 - 500 Hz
      mid: 0.0,        // 500 - 2000 Hz
      highMid: 0.0,    // 2000 - 6000 Hz
      high: 0.0,       // 6000 - 12000 Hz
      air: 0.0,        // 12000 - 20000 Hz
      dominantFreq: 0,  // Hz
      spectralCentroid: 0,
      isBeat: false,
      transientAttack: 0.0,
      isClipping: false,
      beatPhase: 0.0,   // 0.0 -> 1.0 cycle
      primaryColor: { r: 1.0, g: 0.0, b: 0.2 },
      secondaryColor: { r: 0.6, g: 0.0, b: 1.0 },
      spectrumGradient: []
    };
    
    this.prevBass = 0.0;
    this.prevMid = 0.0;
    this.prevEnergy = 0.0;
    this.lastBeatTime = 0;
    this.estimatedBPM = 128;
  }

  async init(useMic = true) {
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

    if (useMic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (this.source) this.source.disconnect();
        this.source = this.ctx.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        this.isInitialized = true;
        return { success: true, mode: 'mic' };
      } catch (err) {
        console.warn('Microphone access denied or unavailable, falling back to Demo Synth', err);
        this.startDemoSynth();
        this.isInitialized = true;
        return { success: true, mode: 'demo', warning: 'Microphone permission denied. Playing procedural demo beat.' };
      }
    } else {
      this.startDemoSynth();
      this.isInitialized = true;
      return { success: true, mode: 'demo' };
    }
  }

  loadFile(file) {
    if (!this.ctx) return;
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
      } catch (err) {
        console.error('Failed to decode audio file', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  startDemoSynth() {
    if (this.isDemoPlaying || !this.ctx) return;
    this.isDemoPlaying = true;
    
    // Connect analyser to output so demo audio is audible if desired
    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.35;
    this.analyser.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    let step = 0;
    const tempoMs = (60 / 128) * 1000 / 4; // 128 BPM 16th notes

    this.demoInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const beat16 = step % 16;

      // 1. Kick on 0, 4, 8, 12 (4-on-the-floor sub bass)
      if (beat16 % 4 === 0) {
        this.playKick(now);
      }

      // 2. Snare / Clap on 4, 12
      if (beat16 === 4 || beat16 === 12) {
        this.playSnare(now);
      }

      // 3. Hi-Hat on every off-beat 16th and 8th
      if (beat16 % 2 === 1 || beat16 % 4 === 2) {
        this.playHiHat(now, beat16 % 4 === 2 ? 0.08 : 0.04);
      }

      // 4. Melodic Arp (Mid to High-Mid)
      if (beat16 % 2 === 0) {
        const chordNotes = [220, 261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        const freq = chordNotes[(step >> 1) % chordNotes.length];
        this.playSynthLead(now, freq);
      }

      step++;
    }, tempoMs);
  }

  stopDemoSynth() {
    this.isDemoPlaying = false;
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.12);
    gain.gain.setValueAtTime(1.0 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  playSnare(time) {
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    noise.start(time);
    noise.stop(time + 0.15);
  }

  playHiHat(time, dur = 0.05) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(9500 + Math.random() * 4000, time);
    gain.gain.setValueAtTime(0.4 * this.gain, time);
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
    gain.gain.setValueAtTime(0.25 * this.gain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.2);
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

    // Apply exponential smoothing (lerp) to avoid discontinuous jumping
    const lerp = (curr, target, factor) => curr + (target - curr) * factor;
    const factor = this.smoothFactor || 0.22;
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

    // 2. Find Dominant Frequency & Spectral Centroid
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
    const isBeat = bassDelta > 0.18 && (now - this.lastBeatTime > 220);

    if (isBeat) {
      this.lastBeatTime = now;
    }

    const transientAttack = Math.max(0, Math.max(bassDelta, midDelta) * 2.5);
    this.prevBass = rawBass;
    this.prevMid = rawMid;
    this.prevEnergy = rawRms;

    // 4. Color Spectrum Calculation (20Hz Crimson Red -> 20kHz Violet/White)
    const logMin = Math.log10(30);
    const logMax = Math.log10(16000);
    const logCentroid = Math.log10(Math.max(30, Math.min(16000, spectralCentroid)));
    const t = Math.max(0, Math.min(1, (logCentroid - logMin) / (logMax - logMin)));

    // Synesthetic color mapping (0.0=Red, 0.85=Violet)
    const hue = t * 0.85; 
    const sat = 0.95;
    const light = 0.5 + Math.min(0.4, air * 0.5);
    const primaryRGB = this.hslToRgb(hue, sat, light);

    const secondaryHue = (hue + 0.55) % 1.0;
    const secondaryRGB = this.hslToRgb(secondaryHue, 0.9, 0.45 + subBass * 0.3);

    // Store in Telemetry
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
