/**
 * anomaly.js — Gravity Falls Anomaly Tracking & Puzzle Logic
 */

export class AnomalySystem {
    constructor(options = {}) {
        this.onComplete = options.onComplete || (() => { });
        this.onReset = options.onReset || (() => { });
        this.onSolved = options.onSolved || (() => { });
        this.onInteraction = options.onInteraction || (() => { });
        this.parentContainer = options.parentContainer || document.body;
        this.targetCode = "CIPHER";

        this.isAnomalyActive = false;
        this.isSolved = false;
        this.isScanning = false;
        this.ghostTimer = null;

        // Reticle Physics
        this.reticle = {
            x: 0,
            y: 0,
            vx: 2.5,
            vy: 2.5,
            width: 80,
            height: 80
        };
        this.staticSize = options.staticSize || 460; // Square, configurable

        this.initUI();
        this.hide(); // Call hide immediately after UI initialization
        this.startReticleAnimation();
    }

    initUI() {
        // Create scanning artifacts if not present
        if (!document.getElementById('scan-lines')) {
            const lines = document.createElement('div');
            lines.id = 'scan-lines';
            document.body.appendChild(lines);
        }

        if (!document.getElementById('scanning-reticle')) {
            const ret = document.createElement('div');
            ret.id = 'scanning-reticle';
            ret.innerHTML = `
                <div class="reticle-circle"></div>
                ${Array.from({ length: 4 }).map((_, i) => `<div class="reticle-bar" style="transform: translate(-50%, -50%) rotate(${i * 90}deg) translateX(34px)"></div>`).join('')}
            `;
            this.parentContainer.appendChild(ret);
        }

        /* Anomaly Overlay Disabled for V4 */
        /*
        if (!document.getElementById('anomaly-overlay')) {
            const over = document.createElement('div');
            over.id = 'anomaly-overlay';
            over.innerHTML = `<div id="anomaly-text">ANOMALY DETECTED</div>`;
            this.parentContainer.appendChild(over);
        }
        */

        if (!document.getElementById('puzzle-module')) {
            const sz = this.staticSize;
            const mod = document.createElement('div');
            mod.id = 'puzzle-module';
            mod.innerHTML = `
                <div class="terminal-box" style="padding:0; border:none; border-radius:12px; overflow:hidden; display:flex; justify-content:center; align-items:center; background:#000;">
                    <div id="puzzle-close">×</div>
                    <canvas id="static-canvas" width="${sz}" height="${sz}" style="width:${sz}px; height:${sz}px; display:block;"></canvas>
                </div>
                <div class="input-box">
                    <div class="puzzle-input-wrapper">
                        <div id="password-display"></div>
                        <input type="text" id="puzzle-input" autoComplete="off" spellCheck="false" maxlength="${this.targetCode.length}">
                    </div>
                    <div class="puzzle-status" id="puzzle-status">AWAITING INPUT...</div>
                </div>
            `;
            this.parentContainer.appendChild(mod);

            document.getElementById('puzzle-close').onclick = () => this.reset();

            this.inputEl = document.getElementById('puzzle-input');
            this.displayEl = document.getElementById('password-display');

            this.inputEl.oninput = (e) => {
                this.onInteraction();
                this.handleInput(e.target.value.toUpperCase());
            };
            this.inputEl.onkeydown = (e) => {
                this.onInteraction();
                if (e.key === 'Enter') {
                    if (this.inputEl.value.toUpperCase() === this.targetCode) {
                        this.unlockReward();
                    } else {
                        this.shakeScreen();
                    }
                }
            };

            // Re-focus input if user clicks anywhere in the module
            mod.onclick = () => this.inputEl.focus();

            this.createSlots();

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (this.isAnomalyActive && !mod.contains(e.target)) {
                    // Only if not clicking the input itself
                    if (document.getElementById('ar-container').contains(e.target)) {
                        this.reset();
                    }
                } else if (this.isAnomalyActive) {
                    const layer = document.getElementById('video-layer');
                    if (layer && layer.style.display === 'block' && !layer.contains(e.target)) {
                        this.reset();
                    }
                }
            });
        }
    }

    hide() {
        // Hide all anomaly UI elements initially
        const overlay = document.getElementById('anomaly-overlay');
        const puzzle = document.getElementById('puzzle-module');

        if (overlay) overlay.style.opacity = '0';
        if (puzzle) puzzle.style.visibility = 'hidden';
    }

    startReticleAnimation() {
        const update = () => {
            const el = document.getElementById('scanning-reticle');
            if (this.isAnomalyActive || !this.isScanning || !el) {
                if (el) el.style.display = 'none';
                return requestAnimationFrame(update);
            }

            el.style.display = 'block';
            const rect = this.parentContainer.getBoundingClientRect();
            if (rect.width === 0) return requestAnimationFrame(update);

            // Initial center if 0
            if (this.reticle.x === 0) {
                this.reticle.x = rect.width / 2;
                this.reticle.y = rect.height / 2;
            }

            this.reticle.x += this.reticle.vx;
            this.reticle.y += this.reticle.vy;

            const right = rect.width;
            const bottom = rect.height;

            if (this.reticle.x <= 40 || this.reticle.x >= right - 40) {
                this.reticle.vx *= -1;
                this.reticle.x = Math.max(40, Math.min(this.reticle.x, right - 40));
            }
            if (this.reticle.y <= 40 || this.reticle.y >= bottom - 40) {
                this.reticle.vy *= -1;
                this.reticle.y = Math.max(40, Math.min(this.reticle.y, bottom - 40));
            }

            el.style.left = `${this.reticle.x}px`;
            el.style.top = `${this.reticle.y}px`;
            requestAnimationFrame(update);
        };
        update();
    }

    triggerAnomaly() {
        if (this.isAnomalyActive) return;
        this.isAnomalyActive = true;

        console.log("ANOMALY TRIGGERED!");

        if (this.isSolved) {
            // Already solved — show reward in puzzle-module (gnome canvas is inside it)
            const mod = document.getElementById('puzzle-module');
            if (mod) { mod.style.visibility = 'visible'; mod.style.opacity = '1'; }
            if (this.onSolved) this.onSolved();
        } else {
            this.showPuzzle();
        }

        if (this.onComplete) this.onComplete('detected');
    }

    showPuzzle() {
        const mod = document.getElementById('puzzle-module');
        if (!mod) return;
        
        mod.style.visibility = 'visible';
        gsap.fromTo(mod, { opacity: 0 }, { opacity: 1, duration: 0.5 });

        this.handleInput("");
        this.startStaticShader();

        // Delayed focus
        setTimeout(() => {
            const input = document.getElementById('puzzle-input');
            if (input) { input.focus(); input.select(); }
        }, 150);
    }

    /** Gold noise static shader rendered on the terminal's upper canvas */
    startStaticShader() {
        const canvas = document.getElementById('static-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const PHI = 1.61803398874989484820459;
        const goldNoise = (x, y, seed) => {
            const dot = x * PHI + y;
            return Math.abs(Math.tan(Math.sqrt(dot * dot + seed * seed) * seed) * x) % 1;
        };
        let t = 0;
        const draw = () => {
            const mod = document.getElementById('puzzle-module');
            if (!mod || mod.style.visibility === 'hidden') return; // stop when hidden
            const img = ctx.createImageData(w, h);
            const seed = (t * 0.05) % 1;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    img.data[i]     = goldNoise(x, y, seed + 0.1) * 255;
                    img.data[i + 1] = goldNoise(x, y, seed + 0.2) * 255;
                    img.data[i + 2] = goldNoise(x, y, seed + 0.3) * 255;
                    img.data[i + 3] = 255;
                }
            }
            ctx.putImageData(img, 0, 0);
            // Tint green
            ctx.fillStyle = 'rgba(0, 255, 65, 0.15)';
            ctx.fillRect(0, 0, w, h);
            t++;
            requestAnimationFrame(draw);
        };
        draw();
    }



    createSlots() {
        this.displayEl.innerHTML = '';
        for (let i = 0; i < this.targetCode.length; i++) {
            const slot = document.createElement('div');
            slot.className = 'char-slot';
            slot.dataset.index = i;
            this.displayEl.appendChild(slot);
        }
    }

    handleInput(value) {
        // Limit to target length
        if (value.length > this.targetCode.length) {
            value = value.substring(0, this.targetCode.length);
            this.inputEl.value = value;
        }

        const slots = this.displayEl.querySelectorAll('.char-slot');
        slots.forEach((slot, i) => {
            slot.innerText = value[i] || '';
            let className = 'char-slot';
            if (i === value.length) className += ' active';
            if (i < value.length) className += ' filled';
            slot.className = className;
        });

        const status = document.getElementById('puzzle-status');
        if (value === this.targetCode) {
            status.innerText = "CODE VALIDATED. PRESS ENTER.";
            status.style.color = "#00ff9d";
        } else if (value.length === this.targetCode.length) {
            status.innerText = "INVALID CODE SEQUENCE";
            status.style.color = "#ff3c3c";
        } else {
            status.innerText = "AWAITING INPUT...";
            status.style.color = "#00ff9d";
        }
    }

    shakeScreen() {
        const mod = document.getElementById('puzzle-module');
        const status = document.getElementById('puzzle-status');

        status.innerText = "ACCESS DENIED";
        status.style.color = "#ff3c3c";

        // Shake the inner terminal boxes, not the CSS3DObject wrapper
        const boxes = mod.querySelectorAll('.terminal-box, .input-box');
        boxes.forEach(box => {
            gsap.fromTo(box, { x: -8 }, {
                x: 8, duration: 0.05, repeat: 7, yoyo: true, onComplete: () => {
                    gsap.set(box, { x: 0 });
                }
            });
        });
    }

    unlockReward() {
        this.isSolved = true;
        console.log("PUZZLE SOLVED — Unlocking Reward");

        const mod = document.getElementById('puzzle-module');
        const input = mod.querySelector('.input-box');

        // Fade out input box only
        if (input) {
            gsap.to(input, {
                opacity: 0, 
                duration: 0.5, 
                onComplete: () => { input.style.display = 'none'; }
            });
        }

        // Swap content immediately (gnome starts behind the fade or instantly)
        if (this.onSolved) this.onSolved();
    }

    /**
     * Called by app.js when the ghost timer expires.
     * Resets anomaly state so re-detection works.
     */
    resetForGhost() {
        this.isAnomalyActive = false;
        if (this.ghostTimer) { clearTimeout(this.ghostTimer); this.ghostTimer = null; }
        console.log('AnomalySystem: resetForGhost — ready for re-detection');
    }

    reset() {
        this.isAnomalyActive = false;
        if (this.ghostTimer) { clearTimeout(this.ghostTimer); this.ghostTimer = null; }

        const mod = document.getElementById('puzzle-module');
        const layer = document.getElementById('video-layer');

        // Immediately hide (no animation needed for reset)
        if (mod) { mod.style.visibility = 'hidden'; mod.style.opacity = '0'; }
        if (layer) { layer.style.display = 'none'; layer.style.opacity = '0'; }

        const reticle = document.getElementById('scanning-reticle');
        if (reticle) gsap.to(reticle, { scale: 1, borderColor: '', borderStyle: '', duration: 0.5 });

        const input = document.getElementById('puzzle-input');
        if (input) input.value = "";
        this.handleInput("");

        if (this.onReset) this.onReset();
    }
}
