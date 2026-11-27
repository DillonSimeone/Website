/**
 * shared/audio_reactive.js — Web Audio Beat Synth & Microphone FFT Analyser
 *
 * Shared between Grass Study Lab and the 3D Racer Audio Reactive visual mode.
 * Completely decoupled from DOM so it can run headlessly or with any UI.
 */

export class AudioBeatAnalyser {
    constructor(options = {}) {
        this.ctx = null;
        this.analyser = null;
        this.dataArray = null;
        this.isPlaying = false;
        this.isMic = false;
        this.micStream = null;
        this.micSource = null;
        this.interval = null;
        this.step = 0;
        this.bass = 0;
        this.treble = 0;
        this.sensitivity = options.sensitivity !== undefined ? options.sensitivity : 1.2;
        this.bpm = options.bpm || 130;
    }

    ensureContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;
            this.ctx = new AudioCtx();
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return true;
    }

    setSensitivity(value) {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) {
            this.sensitivity = Math.max(0.1, Math.min(4.0, parsed));
        }
    }

    startBeat() {
        if (!this.ensureContext()) return false;
        if (this.isMic) this.stopMic();
        this.isPlaying = true;
        this.step = 0;
        if (this.interval) clearInterval(this.interval);

        const tickMs = 60000 / (this.bpm * 4);
        this.interval = setInterval(() => this._tick(), tickMs);
        return true;
    }

    stopBeat() {
        this.isPlaying = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    _tick() {
        if (!this.ctx || !this.isPlaying) return;
        const now = this.ctx.currentTime;
        const s = this.step % 16;

        // Kick on quarter beats
        if (s === 0 || s === 4 || s === 8 || s === 12) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.analyser);
            gain.connect(this.ctx.destination);

            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
            gain.gain.setValueAtTime(0.55, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

            osc.start(now);
            osc.stop(now + 0.18);
        }

        // Crisp Hi-Hat on offbeats
        if (s === 2 || s === 6 || s === 10 || s === 14) {
            const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(7500, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.analyser);
            gain.connect(this.ctx.destination);

            noise.start(now);
            noise.stop(now + 0.05);
        }

        // Bass synth pluck
        if (s === 2 || s === 10) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(s === 2 ? 65.41 : 73.42, now);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            osc.connect(gain);
            gain.connect(this.analyser);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.2);
        }

        this.step++;
    }

    async startMic() {
        if (!this.ensureContext() || !navigator.mediaDevices?.getUserMedia) return false;
        if (this.isPlaying) this.stopBeat();
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
            this.micSource.connect(this.analyser);
            this.isMic = true;
            return true;
        } catch (e) {
            console.warn('Microphone access unavailable:', e);
            return false;
        }
    }

    stopMic() {
        if (this.micSource) {
            try { this.micSource.disconnect(); } catch (_) {}
            this.micSource = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        this.isMic = false;
    }

    update(dt) {
        if (!this.analyser || (!this.isPlaying && !this.isMic)) {
            this.bass = Math.max(0, this.bass - dt * 4.0);
            this.treble = Math.max(0, this.treble - dt * 4.0);
            return { bass: this.bass, treble: this.treble };
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        let bSum = 0;
        for (let i = 1; i <= 4; i++) bSum += this.dataArray[i];
        const rawBass = (bSum / 4.0) / 255.0;

        let tSum = 0;
        for (let i = 20; i <= 50; i++) tSum += this.dataArray[i];
        const rawTreble = (tSum / 31.0) / 255.0;

        const targetBass = Math.min(1.5, rawBass * this.sensitivity * 1.5);
        const targetTreble = Math.min(1.5, rawTreble * this.sensitivity * 1.6);

        const alphaB = Math.min(1.0, dt * 14.0);
        const alphaT = Math.min(1.0, dt * 16.0);
        this.bass += (targetBass - this.bass) * alphaB;
        this.treble += (targetTreble - this.treble) * alphaT;

        return { bass: this.bass, treble: this.treble };
    }

    destroy() {
        this.stopBeat();
        this.stopMic();
        if (this.ctx) {
            try { this.ctx.close(); } catch (_) {}
            this.ctx = null;
        }
        this.analyser = null;
        this.dataArray = null;
    }
}
