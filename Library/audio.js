/**
 * The Secret Library — Procedural Web Audio Soundscape
 * Zero external audio files: generative synthesis via Web Audio API.
 * Features:
 * - Depth-tuned resonant well drone (warm multi-harmonic cathedral resonance audible on all speakers)
 * - Atmospheric cylinder shaft wind draft
 * - Gentle page fluttering on vertical flight
 * - Resonant wooden percussive taps when wanderer books take flight or perch
 * - Ethereal secret scrolls revelation chime
 */
import { H } from './well.js';

export class LibraryAudio {
    constructor() {
        this.ctx = null;
        this.isMuted = false; // Enabled by default
        this.masterGain = null;
        this.droneGain = null;
        this.fxGain = null;
        this.droneOscs = [];
        this.droneFilter = null;
        this.shimmerOsc = null;
        this.shimmerGain = null;
        this.windGain = null;
        this.windFilter = null;
        this.windSource = null;
    }

    init() {
        if (this.ctx) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        try {
            this.ctx = new AudioCtx();
        } catch (_) {
            return;
        }

        const now = this.ctx.currentTime;
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0001 : 0.45, now);
        this.masterGain.connect(this.ctx.destination);

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.setValueAtTime(0.35, now);
        this.droneGain.connect(this.masterGain);

        this.fxGain = this.ctx.createGain();
        this.fxGain.gain.setValueAtTime(0.55, now);
        this.fxGain.connect(this.masterGain);

        this.setupDrone();
        this.setupShaftWind();
    }

    setupDrone() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Warm resonant lowpass filter simulating a vast stone shaft
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.setValueAtTime(320, now);
        this.droneFilter.Q.setValueAtTime(2.2, now);
        this.droneFilter.connect(this.droneGain);

        // Rich harmonic chord:
        // A1 (55Hz sub), A2 (110Hz bass), E3 (164.8Hz fifth), A3 (220Hz mid fundamental)
        // Clear and resonant on laptops, headphones, and desktop speakers!
        const freqs = [
            { f: 55, type: 'triangle', vol: 0.35 },
            { f: 110.2, type: 'triangle', vol: 0.28 },
            { f: 164.8, type: 'sine', vol: 0.22 },
            { f: 220, type: 'sine', vol: 0.16 },
        ];

        this.droneOscs = freqs.map(({ f, type, vol }) => {
            const osc = this.ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(f, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(vol, now);
            osc.connect(g);
            g.connect(this.droneFilter);
            osc.start();
            return { osc, gain: g, baseFreq: f };
        });

        // Ethereal subtle high shimmer (harmonic cathedral resonance)
        const shimmer = this.ctx.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(440, now);
        const sGain = this.ctx.createGain();
        sGain.gain.setValueAtTime(0.035, now);
        shimmer.connect(sGain);
        sGain.connect(this.droneGain);
        shimmer.start();
        this.shimmerOsc = shimmer;
        this.shimmerGain = sGain;
    }

    setupShaftWind() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // 2-second looped pink-ish noise buffer for smooth atmospheric well air draft
        const bufferSize = Math.floor(this.ctx.sampleRate * 2);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.0990460;
            b1 = 0.96300 * b1 + white * 0.2965164;
            b2 = 0.57000 * b2 + white * 1.0526913;
            data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.045;
        }

        const windSource = this.ctx.createBufferSource();
        windSource.buffer = buffer;
        windSource.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.frequency.setValueAtTime(260, now);
        this.windFilter.Q.setValueAtTime(1.8, now);

        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0.08, now);

        windSource.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.droneGain);
        windSource.start();
        this.windSource = windSource;
    }

    toggleMute() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime;
            const target = this.isMuted ? 0.0001 : 0.45;
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(target, now + 0.4);
        }
        return !this.isMuted;
    }

    unlock() {
        if (this.isMuted) return;
        if (!this.ctx) {
            this.init();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    /**
     * Modulate ambient acoustics based on camera vertical position (biome depth).
     * Celestial (+Y): ethereal higher frequencies, open filter, shimmering chimes.
     * Abyssal (-Y): sub-bass drone, cavernous resonance, ominous subterranean draft.
     */
    update(camY, dt = 0.016) {
        if (!this.ctx || this.isMuted) return;

        // Normalized depth: 0 at floor 0, positive in heaven, negative in abyss
        const depth = camY / H; // floor units
        const targetCutoff = Math.max(120, Math.min(650, 280 + depth * 18));
        const targetPitchMul = Math.max(0.75, Math.min(1.4, 1.0 + depth * 0.025));

        const now = this.ctx.currentTime;
        if (this.droneFilter) {
            this.droneFilter.frequency.setTargetAtTime(targetCutoff, now, 0.4);
        }

        this.droneOscs.forEach(({ osc, baseFreq }) => {
            osc.frequency.setTargetAtTime(baseFreq * targetPitchMul, now, 0.3);
        });

        if (this.shimmerOsc && this.shimmerGain) {
            const shimmerVol = Math.max(0.015, Math.min(0.12, 0.035 + depth * 0.004));
            this.shimmerOsc.frequency.setTargetAtTime(440 * targetPitchMul, now, 0.3);
            this.shimmerGain.gain.setTargetAtTime(shimmerVol, now, 0.3);
        }

        if (this.windFilter && this.windGain) {
            const windFreq = 220 + Math.abs(depth) * 12;
            const windVol = Math.max(0.05, Math.min(0.14, 0.07 + Math.abs(depth) * 0.003));
            this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.5);
            this.windGain.gain.setTargetAtTime(windVol, now, 0.5);
        }
    }

    /**
     * Soft paper flutter sound when moving fast or when loose pages drift.
     */
    playPageFlutter(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900 + Math.random() * 400, now);
        filter.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
        filter.Q.setValueAtTime(3.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08 * Math.min(1.5, strength), now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.fxGain);

        noise.start(now);
        noise.stop(now + 0.19);
    }

    /**
     * Resonant wooden click / thud when a wanderer book lands on a shelf/rail.
     */
    playBookPerch(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240 + Math.random() * 50, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.08);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18 * Math.min(1.5, strength), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.fxGain);

        osc.start(now);
        osc.stop(now + 0.10);
    }

    /**
     * Ethereal bell chime when opening an apocryphal secret scroll.
     */
    playSecretChime() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.06);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now + idx * 0.06);
            gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.06 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.8);

            osc.connect(gain);
            gain.connect(this.fxGain);
            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.85);
        });
    }

    dispose() {
        if (this.ctx) {
            try { this.ctx.close(); } catch (_) {}
            this.ctx = null;
        }
    }
}
