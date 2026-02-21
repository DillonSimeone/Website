/**
 * light-estimator.js — v11 (Passive Calculator)
 * Just outputs values. Doesn't move lights itself.
 */
(function () {
    const THREE = window.THREE;

    window.LightEstimator = class LightEstimator {
        constructor(renderer, scene) {
            console.log("---- LIGHT ESTIMATOR v11 (Passive) ----");
            this.renderer = renderer;
            this.scene = scene;
            this.video = null;

            this.updateInterval = 5;

            // Output Public Values
            this.currentIntensity = 1.0;
            this.currentOffset = new THREE.Vector3(0, 5, 2);

            // Internal Targets (for lerping)
            this.targetIntensity = 1.0;
            this.targetOffset = new THREE.Vector3(0, 5, 2);
            this.lerpFactor = 0.1;

            this.frameCounter = 0;
            this.canvas = document.createElement('canvas');
            this.canvas.width = 32; this.canvas.height = 32;
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

            this._createHUD();
        }

        _createHUD() {
            this.hud = document.createElement('div');
            this.hud.style.cssText = `
            position: fixed; top: 10px; right: 10px; z-index: 99999;
            background: rgba(0,0,0,0.8); color: cyan; font-family: monospace;
            padding: 8px; border: 1px solid cyan; font-size: 10px; pointer-events: none;
            display: flex; flex-direction: column; gap: 4px; width: 100px;
          `;

            this.hudCanvas = document.createElement('canvas');
            this.hudCanvas.width = 32; this.hudCanvas.height = 32;
            this.hudCanvas.style.cssText = "width: 64px; height: 64px; image-rendering: pixelated; border: 1px solid #333; margin: 0 auto;";

            this.hudText = document.createElement('div');

            this.hud.appendChild(this.hudCanvas);
            this.hud.appendChild(this.hudText);
            document.body.appendChild(this.hud);
            this.hudCtx = this.hudCanvas.getContext('2d');
        }

        _findVideo() {
            if (this.video && this.video.readyState >= 2) return true;
            const v = document.querySelector('video');
            if (v && v.readyState >= 2) {
                this.video = v;
                return true;
            }
            return false;
        }

        update() {
            if (!this._findVideo()) {
                this.hudText.innerText = "WAITING FOR VIDEO...";
                return;
            }

            if (this.frameCounter++ % this.updateInterval === 0) {
                this._analyzeFrame();
            }

            // Smoothly update public values
            this.currentIntensity = THREE.MathUtils.lerp(this.currentIntensity, this.targetIntensity, this.lerpFactor);
            this.currentOffset.lerp(this.targetOffset, this.lerpFactor);
        }

        _analyzeFrame() {
            try {
                const vw = this.video.videoWidth || 640;
                const vh = this.video.videoHeight || 480;
                if (vw === 0 || vh === 0) return;

                this.ctx.drawImage(this.video, 0, 0, vw, vh, 0, 0, 32, 32);
                const frame = this.ctx.getImageData(0, 0, 32, 32).data;
                this.hudCtx.drawImage(this.canvas, 0, 0);

                let totalLuma = 0;
                let weightedX = 0, weightedY = 0;
                let totalVal = 0;

                for (let i = 0; i < frame.length; i += 4) {
                    const r = frame[i]; const g = frame[i + 1]; const b = frame[i + 2];
                    // Use green channel dominance (webcams usually cleaner on green)
                    const luma = (r + g * 2 + b) / 4;
                    totalVal += luma;

                    const pIdx = i / 4;
                    const x = pIdx % 32;
                    const y = Math.floor(pIdx / 32);

                    const w = Math.pow(luma / 255, 5); // Extreme contrast weight
                    weightedX += x * w;
                    weightedY += y * w;
                    totalLuma += w;
                }

                const avg = totalVal / 1024;
                // Intensity 0.5 to 5.0
                this.targetIntensity = 0.5 + (avg / 255) * 4.5;

                if (totalLuma > 0.001) {
                    const cx = (weightedX / totalLuma) / 31;
                    const cy = (weightedY / totalLuma) / 31;

                    // Map centered
                    const lx = -(cx - 0.5) * 15;
                    const ly = (0.5 - cy) * 15;

                    this.targetOffset.set(lx, ly, 6); // Z=6 to stay somewhat in front
                }

                this.hudText.innerHTML = `
                I: ${this.currentIntensity.toFixed(2)}<br>
                X: ${this.currentOffset.x.toFixed(1)}<br>
                Y: ${this.currentOffset.y.toFixed(1)}
              `;

            } catch (e) { }
        }
    };
})();

