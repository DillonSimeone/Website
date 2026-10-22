/**
 * Thresholds — Web Audio Ambient Soundscape Engine
 * Fully generative audio using Web Audio API synthesis without external audio files.
 */

class AmbientSoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = true;
    this.masterGain = null;
    this.droneGain = null;
    this.fxGain = null;
    this.currentMood = null;
    this.activeNodes = [];
    this.tickInterval = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.65, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.droneGain.connect(this.masterGain);

    this.fxGain = this.ctx.createGain();
    this.fxGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.fxGain.connect(this.masterGain);
  }

  toggleMute() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      const targetGain = this.isMuted ? 0.0001 : 0.65;
      this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 1.2);
    }
    return !this.isMuted;
  }

  enableAudio() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isMuted = false;
    if (this.masterGain) {
      this.masterGain.gain.linearRampToValueAtTime(0.65, this.ctx.currentTime + 0.8);
    }
    return true;
  }

  clearActiveNodes() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.activeNodes = [];
  }

  setMood(mood) {
    if (!this.ctx) return;
    this.currentMood = mood;
    this.clearActiveNodes();

    const now = this.ctx.currentTime;

    switch (mood) {
      case 'candle':
        this.playCandleMood(now);
        break;
      case 'maple':
        this.playMapleMood(now);
        break;
      case 'river':
        this.playRiverMood(now);
        break;
      case 'snow':
        this.playSnowMood(now);
        break;
      case 'wheat':
        this.playWheatMood(now);
        break;
      case 'ferryman':
        this.playFerrymanMood(now);
        break;
      case 'watch':
        this.playWatchMood(now);
        break;
      case 'shadow':
        this.playShadowMood(now);
        break;
      case 'cage':
        this.playCageMood(now);
        break;
      case 'tram':
        this.playTramMood(now);
        break;
      case 'loom':
        this.playLoomMood(now);
        break;
      case 'tea':
        this.playTeaMood(now);
        break;
      default:
        this.playDefaultDrone(now);
    }
  }

  // --- Helper Synthesizers ---
  createNoiseBuffer(seconds = 3) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    // Pink noise approximation (Paul Kellet's filter)
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  playWind(baseFreq = 300, gainLevel = 0.3) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(4);
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // LFO modulate wind frequency
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(baseFreq * 0.6, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.droneGain);

    noise.start();
    lfo.start();

    this.activeNodes.push(noise, filter, lfo, lfoGain, gain);
  }

  playDroneChord(freqs, type = 'sine', baseGain = 0.2) {
    freqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(baseGain / freqs.length, this.ctx.currentTime);

      // Gentle vibrato
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.2 + Math.random() * 0.1, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(1.5, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(gain);
      gain.connect(this.droneGain);

      osc.start();
      lfo.start();
      this.activeNodes.push(osc, lfo, lfoGain, gain);
    });
  }

  playBellChime(freq = 520, decay = 4) {
    if (this.isMuted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + decay);

    osc.connect(gain);
    gain.connect(this.fxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + decay);
  }

  // --- Specific Scene Moods ---

  playCandleMood(now) {
    // Warm gentle fundamental + subtle airy draft
    this.playDroneChord([110, 164.8, 220], 'sine', 0.25);
    this.playWind(220, 0.15);

    // Schedule flame extinguishing whoosh around 8 seconds
    const breathTimer = setTimeout(() => {
      if (this.currentMood === 'candle' && this.ctx && !this.isMuted) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(2);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 1.2);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.35, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);

        noise.connect(filter);
        filter.connect(g);
        g.connect(this.fxGain);
        noise.start();
      }
    }, 7000);
    this.activeNodes.push({ disconnect: () => clearTimeout(breathTimer) });
  }

  playMapleMood(now) {
    // Pentatonic autumn resonance: D3, A3, F4
    this.playDroneChord([146.83, 220, 349.23], 'sine', 0.22);
    this.playWind(380, 0.25);
    
    // Occasional subtle distant bell
    const chimeTimer = setInterval(() => {
      if (this.currentMood === 'maple' && !this.isMuted) {
        const notes = [587.33, 659.25, 880];
        const note = notes[Math.floor(Math.random() * notes.length)];
        this.playBellChime(note, 4.5);
      }
    }, 6000);
    this.activeNodes.push({ disconnect: () => clearInterval(chimeTimer) });
  }

  playRiverMood(now) {
    // Serene flowing water low-pass filter wash + twilight drone
    this.playDroneChord([130.81, 196.00, 261.63], 'sine', 0.25);
    this.playWind(200, 0.35); // water wash
  }

  playSnowMood(now) {
    // Cold, low, hollow sub-bass drone + distant howling polar wind
    this.playDroneChord([65.41, 98.00], 'triangle', 0.28);
    this.playWind(500, 0.4);
  }

  playWheatMood(now) {
    // Warm shimmering golden hour chord + dry rustling stalks
    this.playDroneChord([174.61, 220.00, 261.63, 329.63], 'sine', 0.22);
    this.playWind(420, 0.25);
  }

  playFerrymanMood(now) {
    // Deep Stygian cavern drone + low gong
    this.playDroneChord([55, 82.41, 110], 'sawtooth', 0.12);
    this.playWind(160, 0.35);
    this.playBellChime(110, 6.0); // Ominous low toll
  }

  playWatchMood(now) {
    // Mechanical pocket watch ticks at 2Hz (120 bpm), then abruptly freezes at 8s
    this.playDroneChord([98, 146.83], 'sine', 0.18);
    let tickCount = 0;
    const maxTicks = 16; // 8 seconds of ticking

    this.tickInterval = setInterval(() => {
      if (this.currentMood !== 'watch' || !this.ctx || this.isMuted) return;
      tickCount++;
      if (tickCount <= maxTicks) {
        // High click impulse
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(tickCount % 2 === 0 ? 1200 : 800, this.ctx.currentTime);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.2, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
        osc.connect(g);
        g.connect(this.fxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
      } else if (tickCount === maxTicks + 1) {
        // Sudden binding clunk followed by quiet vacuum
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.4, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
        osc.connect(g);
        g.connect(this.fxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
        clearInterval(this.tickInterval);
      }
    }, 500);
  }

  playShadowMood(now) {
    // Intense, sun-scorched high drone with desert heat harmonics
    this.playDroneChord([110, 220, 330, 660], 'triangle', 0.18);
    this.playWind(600, 0.2);
  }

  playCageMood(now) {
    // Breathy Sufi reed resonance (Ney-like tone)
    this.playDroneChord([196, 293.66, 392], 'sine', 0.22);
    this.playWind(280, 0.28);
    this.playBellChime(784, 5.0);
  }

  playTramMood(now) {
    // Low mechanical rumble + rain wash
    this.playDroneChord([73.42, 110], 'triangle', 0.25);
    this.playWind(350, 0.3); // Rain hiss
    // Tram bell ding-ding
    setTimeout(() => {
      if (this.currentMood === 'tram' && !this.isMuted) {
        this.playBellChime(1046.5, 1.2);
        setTimeout(() => this.playBellChime(1318.5, 1.8), 240);
      }
    }, 2000);
  }

  playLoomMood(now) {
    // Warm harmonic loom resonance + thread pluck
    this.playDroneChord([130.81, 164.81, 196.00], 'sine', 0.22);
    this.playWind(240, 0.18);
  }

  playTeaMood(now) {
    // Peaceful meditative bowl resonance + soft steam hiss
    this.playDroneChord([220, 277.18, 329.63], 'sine', 0.24);
    this.playWind(300, 0.2);
    this.playBellChime(440, 6.0);
  }

  playDefaultDrone(now) {
    this.playDroneChord([110, 165], 'sine', 0.2);
  }
}

window.AmbientSoundEngine = AmbientSoundEngine;
