import * as THREE from 'three';
import { AudioManager } from './audioManager.js';
import { SceneManager } from './sceneManager.js';
import { UIManager } from './uiManager.js';

class App {
    constructor() {
        this.audioManager = new AudioManager();
        this.sceneManager = new SceneManager();
        this.uiManager = new UIManager(this); // Pass app reference

        this.isRunning = false;

        this.init();
    }

    init() {
        this.sceneManager.init(document.getElementById('canvas-container'));
        this.animate();

        const startHandler = () => {
            this.startAudio();
            document.removeEventListener('click', startHandler);
            document.removeEventListener('touchstart', startHandler);
        };
        document.addEventListener('click', startHandler);
        document.addEventListener('touchstart', startHandler);

        window.addEventListener('resize', () => {
            this.sceneManager.onResize();
        });
    }

    async startAudio() {
        try {
            const hasMic = await this.audioManager.init();
            this.uiManager.setStatus(hasMic ? "Listening..." : "Procedural Synth Active");
            this.uiManager.startButton.disabled = true;
            this.uiManager.startButton.textContent = hasMic ? "Active" : "Synth Active";
            this.isRunning = true;
        } catch (e) {
            this.uiManager.setStatus("Synth Active");
            this.isRunning = true;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isRunning) {
            this.audioManager.update();
            const data = this.audioManager.getUniformData();
            const threshold = this.uiManager.params.threshold;

            let effectiveVolume = data.volume;
            if (data.volume < threshold) {
                effectiveVolume = 0;
            }

            let selectedFreqAmp = undefined;
            if (this.uiManager.params.selectedFreqIndex !== undefined && data.frequencyData) {
                selectedFreqAmp = data.frequencyData[this.uiManager.params.selectedFreqIndex];
            }

            const sceneStats = this.sceneManager.update(data, effectiveVolume, threshold, this.uiManager.params.freqMap, selectedFreqAmp);

            if (sceneStats) {
                this.uiManager.updateDynamicVisuals(sceneStats);
            }

            this.uiManager.updateVisuals(data);
        } else {
            this.sceneManager.updateIdle();
        }

        this.sceneManager.render();
    }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
