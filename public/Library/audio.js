/**
 * The Secret Library — Procedural Web Audio Soundscape
 * Zero external audio files: generative synthesis via Web Audio API.
 * Features:
 * - Depth-tuned resonant well drone (shifting pitch & harmonic overtone between celestial and abyssal biomes)
 * - Gentle page fluttering on vertical movement
 * - Resonant wooden percussive taps when wanderer books take flight or perch
 */

export class LibraryAudio {
    constructor() {
        this.ctx = null;
        this.isMuted = true;
        this.masterGain = null;
        this.droneGain = null;
        this.fxGain = null;
        this.droneOscs = [];
        this.droneFilter = null;
        this.flutterGain = null;
        this.targetDronePitch = 55; // A1
        this.currentDronePitch = 55;
    }

    init() {
        if (this.ctx) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
        this.droneGain.connect(this.masterGain);

        this.fxGain = this.ctx.createGain();
        this.fxGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        this.fxGain.connect(this.masterGain);

        this.setupDrone();
    }

    setupDrone() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Warm resonant lowpass filter simulating a vast stone shaft
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.setValueAtTime(140, now);
        this.droneFilter.Q.setValueAtTime(3.5, now);
        this.droneFilter.connect(this.droneGain);

        // 3 detuned oscillators creating a rich cathedral/well resonance
        const freqs = [55, 55.4, 82.5]; // Fundamental, detune, fifth
        this.droneOscs = freqs.map((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = i === 2 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(f, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(i === 2 ? 0.2 : 0.4, now);
            osc.connect(g);
            g.connect(this.droneFilter);
            osc.start();
            return { osc, gain: g, baseFreq: f };
        });

        // Ethereal subtle high shimmer (harmonic resonance)
        const shimmer = this.ctx.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(220, now);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.04, now);
        shimmer.connect(sGain);
        sGain.connect(this.droneGain);
        shimmer.start();
        this.shimmerOsc = shimmer;
    }

    toggleMute() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            const target = this.isMuted ? 0.0001 : 0.45;
            this.masterGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.8);
        }
        return !this.isMuted;
    }

    unlock() {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Modulate ambient acoustics based on camera vertical position (biome depth).
     * Celestial (+Y): ethereal higher frequencies, wider filter.
     * Abyssal (-Y): sub-bass drone, claustrophobic cutoff, ominous rumble.
     */
    update(camY, dt = 0.016) {
        if (!this.ctx || this.isMuted) return;

        // Normalized depth: 0 at floor 0, positive in heaven, negative in abyss
        const depth = camY / 4.3; // floor units
        const targetCutoff = Math.max(70, Math.min(380, 130 + depth * 14));
        const targetPitchMul = Math.max(0.7, Math.min(1.5, 1.0 + depth * 0.035));

        const now = this.ctx.currentTime;
        if (this.droneFilter) {
            this.droneFilter.frequency.setTargetAtTime(targetCutoff, now, 0.5);
        }

        this.droneOscs.forEach(({ osc, baseFreq }) => {
            osc.frequency.setTargetAtTime(baseFreq * targetPitchMul, now, 0.4);
        });

        if (this.shimmerOsc) {
            const shimmerVol = Math.max(0.01, Math.min(0.09, 0.03 + depth * 0.005));
            this.shimmerOsc.frequency.setTargetAtTime(220 * targetPitchMul, now, 0.4);
        }
    }

    /**
     * Soft paper flutter sound when moving fast or when loose pages drift.
     */
    playPageFlutter(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const bufferSize = this.ctx.sampleRate * 0.22;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800 + Math.random() * 400, now);
        filter.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
        filter.Q.setValueAtTime(4.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.06 * Math.min(1.5, strength), now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.fxGain);

        noise.start(now);
        noise.stop(now + 0.23);
    }

    /**
     * Resonant wooden click / thud when a wanderer book lands on a shelf/rail.
     */
    playBookPerch(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180 + Math.random() * 40, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12 * Math.min(1.5, strength), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.fxGain);

        osc.start(now);
        osc.stop(now + 0.11);
    }

    dispose() {
        if (this.ctx) {
            try { this.ctx.close(); } catch (_) {}
            this.ctx = null;
        }
    }
}
