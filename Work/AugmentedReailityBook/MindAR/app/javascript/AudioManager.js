/**
 * AudioManager.js — Ford Pines Scanner Sound System
 * Manages the scanner hum and event-based sound effects.
 */
export class AudioManager {
    constructor(soundPath = './assets/sounds/') {
        this.ctx = null;
        this.scannerBuffer = null;
        this.detectedBuffer = null;
        this.scannerNode = null;
        this.gainNode = null;
        this.isInitialized = false;
        this.soundPath = soundPath;
    }

    async init() {
        if (this.isInitialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // --- iOS CRITICAL: Resume Context on First Tap ---
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
        this.isInitialized = true;

        this.scannerBuffer = await this._loadBuffer('scanner.mp3');
        this.detectedBuffer = await this._loadBuffer('detected.mp3');

        this.startScanner();
    }

    async _loadBuffer(name) {
        const resp = await fetch(this.soundPath + name);
        const array = await resp.arrayBuffer();
        return await this.ctx.decodeAudioData(array);
    }

    startScanner() {
        if (!this.scannerBuffer || !this.isInitialized) return;
        if (this.scannerNode) this.scannerNode.stop();
        
        this.scannerNode = this.ctx.createBufferSource();
        this.scannerNode.buffer = this.scannerBuffer;
        this.scannerNode.loop = true;
        this.scannerNode.connect(this.gainNode);
        this.scannerNode.start(0);

        this._randomizeScanner();
    }

    _randomizeScanner() {
        if (!this.scannerNode || !this.isInitialized || !this.scannerNode.playbackRate) return;
        
        // Random pitch/volume modulation for "old hardware" feel
        const baseRate = 1.0;
        const targetRate = baseRate + (Math.random() - 0.5) * 0.1;
        const targetVolume = 0.5 + Math.random() * 0.3;

        this.scannerNode.playbackRate.setTargetAtTime(targetRate, this.ctx.currentTime, 1.0);
        this.gainNode.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 1.0);

        setTimeout(() => this._randomizeScanner(), 500 + Math.random() * 1000);
    }

    playDetected() {
        if (!this.detectedBuffer || !this.isInitialized) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.detectedBuffer;
        source.connect(this.ctx.destination);
        source.start(0);
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}
