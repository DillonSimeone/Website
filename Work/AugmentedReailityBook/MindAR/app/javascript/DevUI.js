import * as THREE from 'three';

/**
 * DevUI.js — Developer Transform Tuner for Ford Pines Scanner
 */
export class DevUI {
    constructor(stateContext) {
        this.ctx = stateContext; // { pages, pageStates, activePageIndex, coreAR }
        this.sl = {
            s: null, px: null, py: null, pz: null, lerp: null, 
            fmin: null, sel: null, anim: null,
            cw: null, ch: null, dislerp: null, jump: null, disjump: null
        };
    }

    build() {
        const devConsole = document.getElementById('dev-console');
        if (!devConsole) return;
        
        devConsole.innerHTML = `
            <div class="dev-title">TRANSFORM TUNER V9.0</div>
            
            <div id="dev-status-area" style="text-align:center; margin-bottom:15px; padding:10px; border:1px solid rgba(0,255,65,0.2); border-radius:4px;">
                <div id="dev-tracking-status" style="font-weight:800; font-size:1.4rem; letter-spacing:2px;">SEARCHING</div>
            </div>

            <select id="dsel" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
            <select id="danim" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
            
            <div class="ctrl" title="Size of the 3D model/puzzle"><label>Scale</label><input type="range" id="ds" min="-6" max="1" step="0.01"><span class="v" id="dsv"></span></div>
            <div class="ctrl" title="Horizontal position offset"><label>Pos X</label><input type="range" id="dpx" min="-1" max="1" step="0.01"><span class="v" id="dpxv"></span></div>
            <div class="ctrl" title="Vertical position offset"><label>Pos Y</label><input type="range" id="dpy" min="-1" max="1" step="0.01"><span class="v" id="dpyv"></span></div>
            <div class="ctrl" title="Depth position offset"><label>Pos Z</label><input type="range" id="dpz" min="-1" max="1" step="0.01"><span class="v" id="dpzv"></span></div>
            
            <div class="dev-section">
                <div class="dev-title">SYSTEM STABILITY</div>
                <div class="ctrl" title="Smoothing strength (0.01 - 1.0). Lower is smoother, higher is faster."><label>Lerp</label><input type="range" id="dlerp" min="0.001" max="1" step="0.001" value="0.75"><span class="v" id="dlerv">0.75</span></div>
                <div class="ctrl" title="Disable all smoothing for raw tracking data"><label>Unsmoothed</label><input type="checkbox" id="ddislerp"></div>
                <div class="ctrl" title="Enable filter to ignore sudden tracking jitters"><label>Jump Filter</label><input type="checkbox" id="ddisjump"></div>
                <div class="ctrl" title="Distance threshold for the jump filter"><label>Delta</label><input type="range" id="djump" min="0.01" max="100" step="0.1" value="0.3"><span class="v" id="djumpv">0.3</span></div>
                <div class="ctrl" title="Cutoff frequency for the stability filter (log scale)"><label>Filter CF</label><input type="range" id="dfmin" min="-6" max="0" step="0.1" value="-4"><span class="v" id="dfminv">-4</span></div>
            </div>
    
            <div class="dev-section">
                <div class="dev-title">CSS3D DIMENSIONS</div>
                <div class="ctrl" title="Width of the virtual screen page"><label>Width</label><input type="range" id="dcw" min="100" max="1200" step="1" value="500"><span class="v" id="dcwv">500</span></div>
                <div class="ctrl" title="Height of the virtual screen page"><label>Height</label><input type="range" id="dch" min="100" max="1200" step="1" value="400"><span class="v" id="dchv">400</span></div>
            </div>
    
            <div style="display:flex; justify-content:center; width:100%; margin-top:20px;">
                <button id="dcopy" class="btn-gf" style="width:50%; font-size:0.8rem; padding:8px;">Copy Full Config</button>
            </div>
        `;
    
        this.sl.sel = document.getElementById('dsel');
        this.sl.anim = document.getElementById('danim');
        this.sl.s = document.getElementById('ds');
        this.sl.px = document.getElementById('dpx'); this.sl.py = document.getElementById('dpy'); this.sl.pz = document.getElementById('dpz');
        this.sl.lerp = document.getElementById('dlerp');
        this.sl.fmin = document.getElementById('dfmin');
        this.sl.cw = document.getElementById('dcw');
        this.sl.ch = document.getElementById('dch');
        this.sl.dislerp = document.getElementById('ddislerp');
        this.sl.jump = document.getElementById('djump');
        this.sl.disjump = document.getElementById('ddisjump');
    
        this.ctx.pages.forEach((p, i) => {
            const o = document.createElement('option');
            o.value = i; o.textContent = p.label;
            this.sl.sel.appendChild(o);
        });
        
        this.sl.sel.onchange = () => { 
            this.ctx.activePageIndex = parseInt(this.sl.sel.value); 
            this.load(); 
        };
    
        [this.sl.s, this.sl.px, this.sl.py, this.sl.pz, this.sl.lerp, this.sl.dislerp, this.sl.jump, this.sl.disjump, this.sl.cw, this.sl.ch].forEach(el => {
            if (el) el.oninput = () => this.write();
        });
    
        this.sl.fmin.oninput = () => {
            const val = Math.pow(10, parseFloat(this.sl.fmin.value));
            if (this.ctx.coreAR) this.ctx.coreAR.setFilterMinCF(val);
            this.write();
        };

        // Scroll-to-tune on range inputs
        [this.sl.s, this.sl.px, this.sl.py, this.sl.pz, this.sl.lerp, this.sl.jump, this.sl.fmin, this.sl.cw, this.sl.ch].forEach(el => {
            if (!el) return;
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = parseFloat(el.step) || 0.01;
                const dir = e.deltaY > 0 ? -1 : 1;
                el.value = (parseFloat(el.value) + (step * dir)).toFixed(4);
                el.dispatchEvent(new Event('input'));
            });
        });
    
        document.getElementById('dcopy').onclick = () => {
            const st = this.ctx.pageStates.get(this.ctx.activePageIndex);
            if (st) {
                const dump = {
                    targetName: this.ctx.pages[this.ctx.activePageIndex].label,
                    pageId: this.ctx.pages[this.ctx.activePageIndex].id,
                    config: st.config,
                    stability: {
                        lerp: this.getVal('lerp', 0.9),
                        unsmoothed: this.getVal('dislerp', false),
                        jumpThreshold: this.getVal('jump', 0.3),
                        useJumpFilter: this.getVal('disjump', true),
                        filterMinCF: Math.pow(10, parseFloat(this.sl.fmin.value))
                    }
                };
                navigator.clipboard.writeText(JSON.stringify(dump, null, 2)).then(() => alert('Full Config Copied!'));
            }
        };
    }

    load() {
        const st = this.ctx.pageStates.get(this.ctx.activePageIndex);
        if (!st) return;
        const c = st.config;
        
        this.sl.s.value = Math.log10(c.scale || 0.1).toFixed(2);
        this.sl.px.value = c.offsetX || 0; 
        this.sl.py.value = c.offsetY || 0; 
        this.sl.pz.value = c.offsetZ || 0;
        
        if (this.sl.sel) this.sl.sel.value = this.ctx.activePageIndex;
    
        // Update labels
        document.getElementById('dsv').textContent = (c.scale || 0.1).toFixed(4);
        document.getElementById('dpxv').textContent = (c.offsetX || 0).toFixed(2);
        document.getElementById('dpyv').textContent = (c.offsetY || 0).toFixed(2);
        document.getElementById('dpzv').textContent = (c.offsetZ || 0).toFixed(2);
    
        // CSS3D Dimensions
        if (this.sl.cw) {
            this.sl.cw.value = c.cssWidth || 500;
            this.sl.ch.value = c.cssHeight || 400;
            document.getElementById('dcwv').textContent = this.sl.cw.value;
            document.getElementById('dchv').textContent = this.sl.ch.value;
        }

        // Stability readouts
        if (document.getElementById('dlerv')) document.getElementById('dlerv').textContent = this.getVal('lerp', 0.75).toFixed(3);
        if (document.getElementById('dfminv')) document.getElementById('dfminv').textContent = parseFloat(this.sl.fmin.value).toFixed(1);
        if (document.getElementById('djumpv')) document.getElementById('djumpv').textContent = this.getVal('jump', 0.3).toFixed(2);
    
        // Populate Animations
        if (this.sl.anim) {
            this.sl.anim.innerHTML = '';
            const isAnomaly = this.ctx.pages[this.ctx.activePageIndex] && this.ctx.pages[this.ctx.activePageIndex].anomaly;
            if (st.animations && st.animations.length > 0 && !isAnomaly) {
                st.animations.forEach((clip, i) => {
                    const opt = document.createElement('option');
                    opt.value = i; opt.textContent = clip.name;
                    this.sl.anim.appendChild(opt);
                });
                this.sl.anim.value = st.activeClipIndex || 0;
                this.sl.anim.onchange = () => {
                    const clip = st.animations[parseInt(this.sl.anim.value)];
                    if (st.mixer && clip) {
                        st.mixer.stopAllAction();
                        st.mixer.clipAction(clip).play();
                        st.activeClipIndex = parseInt(this.sl.anim.value);
                    }
                };
            } else {
                this.sl.anim.innerHTML = `<option value="">${isAnomaly ? '-- SYSTEM LOCKED --' : 'No Animations'}</option>`;
            }
        }
    
        this.apply(st);
    }

    write() {
        const st = this.ctx.pageStates.get(this.ctx.activePageIndex);
        if (!st) return;
        st.config.scale = Math.pow(10, parseFloat(this.sl.s.value));
        st.config.offsetX = parseFloat(this.sl.px.value);
        st.config.offsetY = parseFloat(this.sl.py.value);
        st.config.offsetZ = parseFloat(this.sl.pz.value);
    
        document.getElementById('dsv').textContent = st.config.scale.toFixed(4);
        document.getElementById('dpxv').textContent = st.config.offsetX.toFixed(2);
        document.getElementById('dpyv').textContent = st.config.offsetY.toFixed(2);
        document.getElementById('dpzv').textContent = st.config.offsetZ.toFixed(2);
    
        if (this.sl.cw) {
            st.config.cssWidth = parseFloat(this.sl.cw.value);
            st.config.cssHeight = parseFloat(this.sl.ch.value);
            document.getElementById('dcwv').textContent = this.sl.cw.value;
            document.getElementById('dchv').textContent = this.sl.ch.value;
        }
    
        // Apply stability settings globally
        const currentLerp = this.getVal('lerp', 0.75);
        const isUnsmoothed = this.getVal('dislerp', false);
        const currentJump = this.getVal('jump', 0.3);
        const isJumpFiltered = this.getVal('disjump', false);
    
        if (document.getElementById('dlerv')) document.getElementById('dlerv').textContent = currentLerp.toFixed(3);
        if (document.getElementById('dfminv')) document.getElementById('dfminv').textContent = parseFloat(this.sl.fmin.value).toFixed(1);
        if (document.getElementById('djumpv')) document.getElementById('djumpv').textContent = currentJump.toFixed(2);
    
        this.ctx.pageStates.forEach(state => {
            if (state.smoother) {
                state.smoother.lerpAlpha = isUnsmoothed ? 1.0 : currentLerp;
                state.smoother.jumpThreshold = currentJump;
                state.smoother.useJumpFilter = isJumpFiltered;
            }
        });
    
        this.apply(st);
    }

    apply(state) {
        const { model, cssPuzzle, contentPivot, config } = state;
        const s = config.scale || 0.1;
    
        if (contentPivot) {
            contentPivot.position.set(config.offsetX || 0, config.offsetY || 0, config.offsetZ || 0);
            contentPivot.rotation.set(
                THREE.MathUtils.degToRad(config.rotationX || 0),
                THREE.MathUtils.degToRad(config.rotationY || 0),
                THREE.MathUtils.degToRad(config.rotationZ || 0)
            );
        }
    
        if (model) {
            model.scale.set(s, s, s);
            model.position.set(0, 0, 0);
            model.rotation.set(0, 0, 0);
        }
        
        if (cssPuzzle) {
            cssPuzzle.position.set(
                config.offsetX || 0, 
                config.offsetY || 0, 
                config.offsetZ || 0
            );
    
            cssPuzzle.rotation.set(
                THREE.MathUtils.degToRad(config.rotationX || 0),
                THREE.MathUtils.degToRad(config.rotationY || 0),
                THREE.MathUtils.degToRad(config.rotationZ || 0)
            );
            
            const cssS = s * 0.002;
            cssPuzzle.scale.set(cssS, cssS, cssS);
    
            if (cssPuzzle.element) {
                cssPuzzle.element.style.width = (config.cssWidth || 500) + 'px';
                cssPuzzle.element.style.height = (config.cssHeight || 400) + 'px';
            }
        }
    }

    updateStatus(isTracking) {
        const statusEl = document.getElementById('dev-tracking-status');
        if (!statusEl) return;

        if (isTracking) {
            statusEl.innerText = "DETECTED";
            statusEl.style.color = "#00ff9d"; // var(--glow)
        } else {
            statusEl.innerText = "SEARCHING";
            statusEl.style.color = "#ff3c3c"; // var(--warn)
        }
    }

    getVal(id, def) {
        if (!this.sl[id]) return def;
        if (this.sl[id].type === 'checkbox') return this.sl[id].checked;
        return parseFloat(this.sl[id].value) || def;
    }
}
