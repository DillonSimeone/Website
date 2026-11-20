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

        // Weather sound nodes (Rain downpour & Wind gusts)
        this.rainGain = null;
        this.rainFilter = null;
        this.windGain = null;
        this.windFilter = null;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this._setupEngine();
            this._setupBoost();
            this._setupDrift();
            this._setupWeatherAudio();
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

    _setupWeatherAudio() {
        const ctx = this.ctx;
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        // 1. Rain Ambient Hiss (Lowpass filtered white noise)
        const rainSource = ctx.createBufferSource();
        rainSource.buffer = noiseBuffer;
        rainSource.loop = true;

        this.rainFilter = ctx.createBiquadFilter();
        this.rainFilter.type = 'lowpass';
        this.rainFilter.frequency.setValueAtTime(1100, ctx.currentTime);

        this.rainGain = ctx.createGain();
        this.rainGain.gain.setValueAtTime(0.0, ctx.currentTime);

        rainSource.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(ctx.destination);
        rainSource.start();

        // 2. Wind Gust Howl (Bandpass filtered white noise)
        const windSource = ctx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;

        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.frequency.setValueAtTime(320, ctx.currentTime);
        this.windFilter.Q.setValueAtTime(3.2, ctx.currentTime);

        this.windGain = ctx.createGain();
        this.windGain.gain.setValueAtTime(0.0, ctx.currentTime);

        windSource.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(ctx.destination);
        windSource.start();
    }

    updateWeather(rainIntensity, windSpeed) {
        if (!this.initialized || this.muted || !this.ctx) return;
        const ctx = this.ctx;

        // Rain volume scales with downpour intensity
        if (this.rainGain) {
            const targetRainVol = Math.min(0.28, rainIntensity * 0.28);
            this.rainGain.gain.setTargetAtTime(targetRainVol, ctx.currentTime, 0.15);
            if (this.rainFilter) {
                this.rainFilter.frequency.setTargetAtTime(800 + rainIntensity * 700, ctx.currentTime, 0.2);
            }
        }

        // Wind howl volume and frequency
        if (this.windGain) {
            const windFactor = Math.max(0, (windSpeed - 1.0) / 1.8);
            const targetWindVol = Math.min(0.24, windFactor * 0.24);
            this.windGain.gain.setTargetAtTime(targetWindVol, ctx.currentTime, 0.2);
            if (this.windFilter) {
                this.windFilter.frequency.setTargetAtTime(260 + windFactor * 240, ctx.currentTime, 0.25);
            }
        }
    }

    playThunder(intensity = 1.0) {
        if (!this.initialized || this.muted || !this.ctx) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // 1. Initial Sharp Crack / Pop
        const crackOsc = ctx.createOscillator();
        const crackFilter = ctx.createBiquadFilter();
        const crackGain = ctx.createGain();

        crackOsc.type = 'triangle';
        crackOsc.frequency.setValueAtTime(380, now);
        crackOsc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(450, now);
        crackFilter.Q.setValueAtTime(1.5, now);

        const crackVol = Math.min(0.45, 0.25 * intensity);
        crackGain.gain.setValueAtTime(crackVol, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        crackOsc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(ctx.destination);

        crackOsc.start(now);
        crackOsc.stop(now + 0.2);

        // 2. Deep Sub-Bass Rumble Decay
        const rumbleOsc = ctx.createOscillator();
        const rumbleGain = ctx.createGain();

        rumbleOsc.type = 'sawtooth';
        rumbleOsc.frequency.setValueAtTime(55, now);
        rumbleOsc.frequency.exponentialRampToValueAtTime(28, now + 2.5);

        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(140, now);
        rumbleFilter.frequency.exponentialRampToValueAtTime(42, now + 2.2);

        const rumbleVol = Math.min(0.42, 0.32 * intensity);
        rumbleGain.gain.setValueAtTime(rumbleVol, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

        rumbleOsc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(ctx.destination);

        rumbleOsc.start(now);
        rumbleOsc.stop(now + 2.7);
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
        if (this.rainGain) this.rainGain.gain.setTargetAtTime(0, now, 0.05);
        if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.05);
    }
}
