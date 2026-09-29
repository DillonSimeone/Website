// audio.js — Procedural Web Audio API Synthesizer (Engine hum, Boost, Drift screech, Chimes)

export class AudioSynth {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.muted = false;

        // Engine sound nodes
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineFilter = null;
        this.engineGain = null;

        // Boost sound nodes
        this.boostGain = null;
        this.boostNoise = null;

        // Drift sound nodes
        this.driftGain = null;
        this.driftFilter = null;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this._setupEngine();
            this._setupBoost();
            this._setupDrift();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported or blocked:', e);
        }
    }

    ensureContext() {
        if (!this.initialized) {
            this.init();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    _setupEngine() {
        const ctx = this.ctx;

        // Low rumble oscillator (sawtooth)
        this.engineOsc1 = ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.setValueAtTime(45, ctx.currentTime);

        // Sub harmonics (triangle)
        this.engineOsc2 = ctx.createOscillator();
        this.engineOsc2.type = 'triangle';
        this.engineOsc2.frequency.setValueAtTime(90, ctx.currentTime);

        // Lowpass filter to muffle raw buzz into an engine purr
        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(320, ctx.currentTime);

        this.engineGain = ctx.createGain();
        this.engineGain.gain.setValueAtTime(0.0, ctx.currentTime);

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(ctx.destination);

        this.engineOsc1.start();
        this.engineOsc2.start();
    }

    _setupBoost() {
        const ctx = this.ctx;
        // White noise buffer for thruster roar
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(450, ctx.currentTime);
        bandpass.Q.setValueAtTime(2.0, ctx.currentTime);

        this.boostGain = ctx.createGain();
        this.boostGain.gain.setValueAtTime(0.0, ctx.currentTime);

        whiteNoise.connect(bandpass);
        bandpass.connect(this.boostGain);
        this.boostGain.connect(ctx.destination);

        whiteNoise.start();
    }

    _setupDrift() {
        const ctx = this.ctx;
        // Resonant high-pass noise for tire drift screech
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        this.driftFilter = ctx.createBiquadFilter();
        this.driftFilter.type = 'highpass';
        this.driftFilter.frequency.setValueAtTime(1600, ctx.currentTime);
        this.driftFilter.Q.setValueAtTime(4.0, ctx.currentTime);

        this.driftGain = ctx.createGain();
        this.driftGain.gain.setValueAtTime(0.0, ctx.currentTime);

        whiteNoise.connect(this.driftFilter);
        this.driftFilter.connect(this.driftGain);
        this.driftGain.connect(ctx.destination);

        whiteNoise.start();
    }

    update(speed, maxSpeed, throttle, isBoosting, isDrifting) {
        if (!this.initialized || this.muted || !this.ctx) return;

        const ctx = this.ctx;
        const speedNorm = Math.min(Math.abs(speed) / Math.max(maxSpeed, 1), 1.6);

        // Engine frequency modulation
        const baseFreq = 42 + speedNorm * 110 + (throttle > 0 ? 35 : 0);
        this.engineOsc1.frequency.setTargetAtTime(baseFreq, ctx.currentTime, 0.05);
        this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.05, ctx.currentTime, 0.05);
        this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 620, ctx.currentTime, 0.05);

        const targetEngineVol = 0.12 + speedNorm * 0.15 + (throttle > 0 ? 0.08 : 0);
        this.engineGain.gain.setTargetAtTime(targetEngineVol, ctx.currentTime, 0.05);

        // Boost roar
        const targetBoostVol = isBoosting ? 0.35 : 0.0;
        this.boostGain.gain.setTargetAtTime(targetBoostVol, ctx.currentTime, 0.06);

        // Drift screech
        const targetDriftVol = isDrifting ? 0.22 : 0.0;
        this.driftGain.gain.setTargetAtTime(targetDriftVol, ctx.currentTime, 0.08);
    }

    playChime(type = 'levelup') {
        if (!this.initialized || this.muted || !this.ctx) return;
        const ctx = this.ctx;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.2, now);

        if (type === 'levelup') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);       // C5
            osc.frequency.setValueAtTime(659.25, now + 0.09); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.18); // G5
            osc.frequency.setValueAtTime(1046.5, now + 0.27); // C6
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
            osc.start(now);
            osc.stop(now + 0.65);
        } else if (type === 'ascend') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(1760, now + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.start(now);
            osc.stop(now + 1.5);
        } else if (type === 'checkpoint') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1174.66, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        }
    }

    silence() {
        if (!this.initialized || !this.ctx) return;
        const now = this.ctx.currentTime;
        if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, now, 0.05);
        if (this.boostGain) this.boostGain.gain.setTargetAtTime(0, now, 0.05);
        if (this.driftGain) this.driftGain.gain.setTargetAtTime(0, now, 0.05);
    }
}
