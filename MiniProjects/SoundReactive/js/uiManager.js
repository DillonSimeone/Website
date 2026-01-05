export class UIManager {
    constructor(appContext) {
        this.app = appContext;

        this.hamburgerBtn = document.getElementById('hamburger-btn');
        this.closeBtn = document.getElementById('close-btn');
        this.panel = document.getElementById('settings-panel');
        this.startButton = document.getElementById('start-audio-btn');
        this.statusText = document.getElementById('status-text');

        this.thresholdInput = document.getElementById('threshold');
        this.smoothingInput = document.getElementById('smoothing');
        this.shapeSelect = document.getElementById('shape-select');
        this.colorA = document.getElementById('color-a');
        this.colorB = document.getElementById('color-b');
        this.freqMapCheck = document.getElementById('freq-color-map');

        this.thresholdValCheck = document.getElementById('threshold-val');
        this.smoothingValCheck = document.getElementById('smoothing-val');

        this.volBar = document.getElementById('vol-bar');
        this.bassBar = document.getElementById('bass-bar');
        this.midBar = document.getElementById('mid-bar');
        this.trebleBar = document.getElementById('treble-bar');

        this.fpsVal = document.getElementById('fps-val');
        this.geomVal = document.getElementById('geom-val');

        this.params = {
            threshold: 50,
            smoothing: 0.8,
            freqMap: false
        };

        this.lastTime = 0;
        this.frameCount = 0;

        this.setupListeners();
    }

    setupListeners() {
        this.hamburgerBtn.addEventListener('click', () => {
            this.panel.classList.toggle('hidden');
        });

        this.closeBtn.addEventListener('click', () => {
            this.panel.classList.add('hidden');
        });

        this.startButton.addEventListener('click', () => {
            this.app.startAudio();
        });

        this.thresholdInput.addEventListener('input', (e) => {
            this.params.threshold = parseFloat(e.target.value);
            this.thresholdValCheck.textContent = this.params.threshold;
        });

        this.smoothingInput.addEventListener('input', (e) => {
            this.params.smoothing = parseFloat(e.target.value);
            this.smoothingValCheck.textContent = this.params.smoothing;

            if (this.app.audioManager) {
                this.app.audioManager.setSmoothing(this.params.smoothing);
            }
        });

        const shaderSelect = document.getElementById('shader-select');
        if (shaderSelect) {
            shaderSelect.addEventListener('change', (e) => {
                this.app.sceneManager.setShader(e.target.value);
            });
        }

        this.shapeSelect.addEventListener('change', (e) => {
            this.app.sceneManager.setShape(e.target.value);
            this.geomVal.textContent = e.target.options[e.target.selectedIndex].text;
        });

        this.colorA.addEventListener('input', (e) => {
            this.app.sceneManager.setColor('A', e.target.value);
        });

        this.colorB.addEventListener('input', (e) => {
            this.app.sceneManager.setColor('B', e.target.value);
        });

        this.freqMapCheck.addEventListener('change', (e) => {
            this.params.freqMap = e.target.checked;
            const helpText = document.getElementById('freq-help-text');
            if (helpText) {
                if (this.params.freqMap) {
                    helpText.classList.add('visible');
                } else {
                    helpText.classList.remove('visible');
                }
            }
        });
    }

    setStatus(text) {
        this.statusText.textContent = text;
    }

    updateVisuals(data) {
        const volPct = Math.min(100, (data.volume / 255) * 100 * 1.5);
        const bassPct = Math.min(100, (data.bass / 255) * 100 * 1.5);
        const midPct = Math.min(100, (data.mid / 255) * 100 * 1.5);
        const treblePct = Math.min(100, (data.treble / 255) * 100 * 1.5);

        this.volBar.style.width = `${volPct}%`;
        this.bassBar.style.width = `${bassPct}%`;

        if (this.midBar) this.midBar.style.width = `${midPct}%`;
        if (this.trebleBar) this.trebleBar.style.width = `${treblePct}%`;

        // FPS Counter
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastTime >= 1000) {
            this.fpsVal.textContent = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
        }

        this.drawFrequencyGraph(data.frequencyData);
    }

    updateDynamicVisuals(stats) {
        if (this.params.freqMap && stats.colorA && stats.colorB) {
            this.colorA.value = '#' + stats.colorA;
            this.colorB.value = '#' + stats.colorB;
        }
    }

    drawFrequencyGraph(dataArray) {
        if (!this.freqCanvas) {
            const canvas = document.getElementById('freq-canvas');
            if (canvas) {
                this.freqCanvas = canvas;
                this.freqCtx = canvas.getContext('2d');
                this.freqCanvas.width = this.freqCanvas.clientWidth;
                this.freqCanvas.height = this.freqCanvas.clientHeight;

                // Add click listener now that canvas exists
                this.freqCanvas.addEventListener('click', (e) => {
                    const rect = this.freqCanvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const width = this.freqCanvas.width;
                    if (this.lastDataLength) {
                        // Reverse the drawing calculation (x / width)
                        // Actually the drawing loop uses barWidth... 
                        // Simplified: map x directly to array index range
                        const pct = Math.max(0, Math.min(1, x / width));
                        this.params.selectedFreqIndex = Math.floor(pct * this.lastDataLength);
                    }
                });
            } else {
                return;
            }
        }

        this.lastDataLength = dataArray.length;
        const ctx = this.freqCtx;
        const width = this.freqCanvas.width;
        const height = this.freqCanvas.height;
        const barCount = dataArray.length;
        const barWidth = width / barCount;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);

        let maxVal = 0;
        let maxIdx = 0;

        for (let i = 0; i < barCount; i++) {
            const val = dataArray[i];
            const barHeight = (val / 255) * height;

            if (val > maxVal) {
                maxVal = val;
                maxIdx = i;
            }

            // Hue: 0 (Red) -> 260 (Purple) approx
            // Map 0 -> length to 0 -> 270 (Purple)
            const hue = (i / barCount) * 270;

            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.fillRect(i * barWidth, height - barHeight, barWidth + 0.5, barHeight);
        }

        // Draw Dot for Max Freq
        const maxX = maxIdx * barWidth + (barWidth / 2);
        const maxY = height - ((maxVal / 255) * height) - 4;
        ctx.beginPath();
        ctx.arc(maxX, Math.max(4, maxY), 3, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();

        // Draw Dot for Selected Freq (Color A Control)
        if (this.params.selectedFreqIndex !== undefined && this.params.selectedFreqIndex < barCount) {
            const idx = this.params.selectedFreqIndex;
            const selVal = dataArray[idx];
            const selX = idx * barWidth + (barWidth / 2);
            const selY = height - ((selVal / 255) * height) - 4;

            ctx.beginPath();
            ctx.arc(selX, Math.max(4, selY), 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00ffaa'; // Accent color
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fill();
        }
    }
}
