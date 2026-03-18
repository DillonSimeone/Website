/**
 * anomaly.js — Gravity Falls Anomaly Tracking & Puzzle Logic
 */

export class AnomalySystem {
    constructor(options = {}) {
        this.onComplete = options.onComplete || (() => { });
        this.onReset = options.onReset || (() => { });
        this.parentContainer = options.parentContainer || document.body;
        this.targetCode = "CIPHER";
        this.hints = [
            "A name whispered in the static of a thousand dimensions.",
            "A single eye that watches from the void.",
            "A triangular gentleman with a penchant for deals.",
            "The one who turned Gravity Falls upside down.",
            "The dream demon's last name. (Starts with C, ends with R)"
        ];

        this.currentHintIndex = 0;
        this.hintTimer = null;
        this.isAnomalyActive = false;
        this.isScanning = false;

        // Reticle Physics
        this.reticle = {
            x: 0,
            y: 0,
            vx: 2.5,
            vy: 2.5,
            width: 80,
            height: 80
        };

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

        if (!document.getElementById('anomaly-overlay')) {
            const over = document.createElement('div');
            over.id = 'anomaly-overlay';
            over.innerHTML = `<div id="anomaly-text">ANOMALY DETECTED</div>`;
            this.parentContainer.appendChild(over);
        }

        if (!document.getElementById('puzzle-module')) {
            const mod = document.createElement('div');
            mod.id = 'puzzle-module';
            mod.innerHTML = `
                <div id="puzzle-close">×</div>
                <div class="puzzle-title">SECURE TERMINAL — V7.0</div>
                <div class="puzzle-hint-container">
                    <div id="puzzle-hint">ACCESS RESTRICTED</div>
                </div>
                <!-- Integrated Underscore Display inside the input module area -->
                <div class="puzzle-input-wrapper">
                    <div id="password-display"></div>
                    <input type="text" id="puzzle-input" autoComplete="off" spellCheck="false" maxlength="${this.targetCode.length}">
                </div>
                <div class="puzzle-status" id="puzzle-status">AWAITING INPUT...</div>
            `;
            this.parentContainer.appendChild(mod);

            document.getElementById('puzzle-close').onclick = () => this.reset();

            this.inputEl = document.getElementById('puzzle-input');
            this.displayEl = document.getElementById('password-display');

            this.inputEl.oninput = (e) => this.handleInput(e.target.value.toUpperCase());
            this.inputEl.onkeydown = (e) => {
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
                }
            });
        }

        if (!document.getElementById('video-layer')) {
            const layer = document.createElement('div');
            layer.id = 'video-layer';
            layer.innerHTML = `
                <video id="video-reward" playsinline>
                    <source src="assets/anomaly_reward.mp4" type="video/mp4">
                </video>
             `;
            document.body.appendChild(layer);

            const vid = document.getElementById('video-reward');
            vid.onended = () => {
                gsap.to('#video-layer', {
                    opacity: 0, duration: 1, onComplete: () => {
                        document.getElementById('video-layer').style.display = 'none';
                        this.reset();
                    }
                });
            };
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
                if(el) el.style.display = 'none';
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

        // 1. Lock reticle and flash warning
        gsap.timeline()
            .to('#scanning-reticle', { scale: 2.0, borderColor: '#ff3c3c', duration: 0.2 })
            .to('#anomaly-overlay', { opacity: 1, duration: 0.1, repeat: 5, yoyo: true })
            .to('#ar-container', {
                opacity: 0, duration: 1, onComplete: () => {
                    this.showPuzzle();
                }
            });

        // Pause MindAR (handled by caller)
        if (this.onComplete) this.onComplete('detected');
    }

    showPuzzle() {
        const mod = document.getElementById('puzzle-module');
        mod.style.visibility = 'visible';
        gsap.to(mod, { opacity: 1, duration: 0.5 });

        this.currentHintIndex = 0;
        this.updateHint();
        this.startHintCycle();
        this.handleInput(""); // Initialize slot display

        document.getElementById('puzzle-input').focus();
    }

    updateHint() {
        const hintEl = document.getElementById('puzzle-hint');
        const nextText = this.hints[this.currentHintIndex];

        // Deleting effect
        const currentText = hintEl.textContent;
        let i = currentText.length;
        const deleteInterval = setInterval(() => {
            if (i <= 0) {
                clearInterval(deleteInterval);
                this.typeText(hintEl, nextText);
            } else {
                hintEl.textContent = currentText.substring(0, i - 1);
                i--;
            }
        }, 30);
    }

    typeText(el, text) {
        let i = 0;
        const typeInterval = setInterval(() => {
            if (i >= text.length) {
                clearInterval(typeInterval);
            } else {
                el.textContent += text[i];
                i++;
            }
        }, 50);
    }

    startHintCycle() {
        if (this.hintTimer) clearInterval(this.hintTimer);
        this.hintTimer = setInterval(() => {
            this.currentHintIndex = (this.currentHintIndex + 1) % this.hints.length;
            this.updateHint();
        }, 10000);
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

        // Use a relative shake that returns to the original position
        gsap.fromTo(mod, { x: -10 }, {
            x: 10, duration: 0.05, repeat: 7, yoyo: true, onComplete: () => {
                gsap.set(mod, { x: 0 }); // Reset to the CSS-defined translate(-50%, -50%)
            }
        });
    }

    unlockReward() {
        gsap.to('#puzzle-module', {
            opacity: 0, duration: 0.5, onComplete: () => {
                document.getElementById('puzzle-module').style.visibility = 'hidden';

                const layer = document.getElementById('video-layer');
                layer.style.display = 'block';
                layer.style.opacity = 1;

                const vid = document.getElementById('video-reward');
                vid.play().catch(e => {
                    console.warn("Autoplay failed, waiting for click", e);
                    // Create a "Play" overlay if needed
                    const overlay = document.createElement('div');
                    overlay.style = "position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:white; background:rgba(0,0,0,0.5); cursor:pointer;";
                    overlay.innerText = "CLICK TO VIEW ANOMALY RECORDING";
                    layer.appendChild(overlay);
                    overlay.onclick = () => {
                        vid.play();
                        overlay.remove();
                    };
                });
            }
        });
    }

    reset() {
        this.isAnomalyActive = false;
        clearInterval(this.hintTimer);

        gsap.timeline()
            .to('#puzzle-module', {
                opacity: 0, duration: 0.3, onComplete: () => {
                    document.getElementById('puzzle-module').style.visibility = 'hidden';
                }
            })
            .to('#ar-container', { opacity: 1, duration: 1 })
            .to('#scanning-reticle', { scale: 1, borderColor: '', borderStyle: '', duration: 0.5 });

        document.getElementById('puzzle-input').value = "";
        this.handleInput(""); // Reset slots
        document.getElementById('puzzle-hint').innerText = "ACCESS RESTRICTED";

        if (this.onReset) this.onReset();
    }
}
