import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { CoreAR } from './CoreAR.js';
import { AudioManager } from './AudioManager.js';
import { PoseSmoothing } from './smoothing.js';
import { GhostingSystem } from './ghosting.js';
import { LightEstimator } from './light-estimator.js';
import { AnomalySystem } from './anomalyV4.js';
import { GnomeReward } from './gnomeReward.js';

/**
 * appV4.js - Ford Pines Scanner v8.0
 */

let coreAR, audioManager, gnomeReward, lightEstimator, anomalySystem;
let isScanning = false;
let isDevMode = false;

const ghoster = new GhostingSystem({ fadeDuration: 1.5, fadeInDuration: 0.5 });
const pageStates = new Map();
let pages = [];
let activePageIndex = 0;

// UI Ref Helpers
const sl = {
    s: null, px: null, py: null, pz: null, lerp: null,
    fmin: null, lmanual: null, lint: null, lbias: null,
    lso: null, lshowh: null, waveOp: null, sel: null, anim: null,
    cw: null, ch: null, dislerp: null, jump: null, disjump: null,
    ipx: null, ipy: null
};

// Waveform State
let smoothGain = 1.0, smoothFreq = 1.0, smoothPhaseOffset = 0.0;
let xOffset = 0;
const LERP_FACTOR = 0.06;

async function bootstrap() {
    console.log("Scanner: Initializing Modular Core...");

    const resp = await fetch('./pages.json');
    const data = await resp.json();
    pages = data.pages || [];

    // 1. Setup Audio
    audioManager = new AudioManager('./assets/sounds/');

    // 2. Setup Core AR (Rendering & Tracking)
    coreAR = new CoreAR(document.getElementById('ar-container'), {
        imageTargetSrc: data.meta.trackingDescriptor,
        onFrameUpdate: (dt) => updateLoop(dt)
    });
    await coreAR.init();

    // 3. Setup Subsystems
    lightEstimator = new LightEstimator(coreAR.renderer, coreAR.scene);
    gnomeReward = new GnomeReward(500, 375);
    await gnomeReward.load();

    anomalySystem = new AnomalySystem({
        parentContainer: document.getElementById('crt-screen'),
        onComplete: (status) => { if (status === 'detected') audioManager.playDetected(); },
        onSolved: () => handlePuzzleSolved(),
        onInteraction: () => resetGhostTimer(),
        onReset: () => handleAnomalyReset()
    });

    // 4. Load Pages & Models
    setupPages();

    // 5. Setup UI
    buildDevUI();
    setupControls();
}

function updateLoop(dt) {
    if (!isScanning) return;

    // A. Lighting
    if (lightEstimator) {
        lightEstimator.update();
        updateGlobalLighting();
    }

    // B. Tracking & Smoothing
    pageStates.forEach((state, i) => {
        if (state.mixer) state.mixer.update(dt);

        if (state.isTracking) {
            const anchorGroup = state.anchor.group;
            anchorGroup.updateMatrixWorld(true);

            const rawP = new THREE.Vector3(), rawQ = new THREE.Quaternion(), rawS = new THREE.Vector3();
            anchorGroup.matrixWorld.decompose(rawP, rawQ, rawS);

            state.smoother.update(rawP, rawQ, state.follower);
            state.visibleScale.lerp(rawS, getVal('lerp', 0.75));
            state.follower.scale.copy(state.visibleScale);

            // Sync CSS with WebGL
            if (state.cssMirror && pages[i].anomaly) {
                state.cssMirror.position.copy(state.follower.position);
                state.cssMirror.quaternion.copy(state.follower.quaternion);
                state.cssMirror.scale.copy(state.follower.scale);
            }
        }
    });



    // D. UI Decorations
    drawWaveform();
}

/* --- Subsystem Logic --- */

function setupPages() {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    pages.forEach((p, i) => {
        const anchor = coreAR.addAnchor(i);
        const follower = new THREE.Group();
        coreAR.scene.add(follower);
        follower.visible = false;

        const contentPivot = new THREE.Group();
        follower.add(contentPivot);

        const state = {
            anchor, follower, contentPivot, model: null, mixer: null, animations: [],
            isTracking: false,
            smoother: new PoseSmoothing({ lerpAlpha: 0.06, useJumpFilter: false }),
            visibleScale: new THREE.Vector3(1, 1, 1),
            config: p.model || {},
            cssMirror: null, cssPuzzle: null
        };
        pageStates.set(i, state);

        if (p.anomaly) {
            state.cssMirror = new THREE.Group();
            coreAR.cssScene.add(state.cssMirror);
            const puzzleModule = document.getElementById('puzzle-module');
            if (puzzleModule) {
                state.cssPuzzle = new CSS3DObject(puzzleModule);
                state.cssPuzzle.scale.set(0.002, 0.002, 0.002);
                state.cssPuzzle.visible = false;
                state.cssMirror.add(state.cssPuzzle);
            }
        }

        anchor.onTargetFound = () => handleTargetFound(i);
        anchor.onTargetLost = () => handleTargetLost(i);

        if (!p.anomaly && p.model && p.model.src) {
            loader.load('./' + p.model.src, (gltf) => {
                state.model = gltf.scene;
                state.animations = gltf.animations || [];
                contentPivot.add(state.model);
                applyConfig(state);
                if (state.animations.length > 0) {
                    state.mixer = new THREE.AnimationMixer(state.model);
                    state.mixer.clipAction(state.animations[0]).play();
                }
            });
        }
    });
}

function handleTargetFound(index) {
    const p = pages[index];
    const state = pageStates.get(index);
    state.isTracking = true;

    if (p.anomaly && isScanning) {
        resetGhostTimer();
        if (state._ghostTimer) { clearTimeout(state._ghostTimer); state._ghostTimer = null; }

        // Cancel any generic ghosting fade that may have started
        ghoster.onTrackingFound(p.id, state.follower);

        // Kill any active gnome fade-out (DIV Swap: opacity is on _imageMat)
        if (gnomeReward && gnomeReward._imageMat && gnomeReward._imageMat.uniforms.opacity) {
            gsap.killTweensOf(gnomeReward._imageMat.uniforms.opacity);
            gnomeReward._imageMat.uniforms.opacity.value = 1.0;
        }
        gsap.killTweensOf('#puzzle-module');

        state.follower.visible = true;
        if (document.getElementById('puzzle-module')) gsap.set('#puzzle-module', { opacity: 1 });
        if (state.cssMirror) state.cssMirror.visible = true;
        if (state.cssPuzzle) state.cssPuzzle.visible = true;

        // If the gnome was previously solved but got stopped by ghost timer, restart it
        if (gnomeReward && !gnomeReward.isRunning && gnomeReward.outputCanvas) {
            gnomeReward.start();
            gnomeReward._renderLoop();
        }

        anomalySystem.triggerAnomaly();
    } else {
        state.follower.visible = true;
        ghoster.onTrackingFound(p.id, state.follower);
    }

    activePageIndex = index;
    if (sl.sel) sl.sel.value = index;
    loadCfg();
}

function handleTargetLost(index) {
    const p = pages[index];
    const state = pageStates.get(index);
    state.isTracking = false;

    if (p.anomaly) {
        // Anomaly pages use their OWN ghost timer, NOT the generic ghosting system.
        // The generic ghoster would fade the entire follower group, killing the gnome.
        state._ghostTimer = setTimeout(() => {
            // Fade only the puzzle module CSS overlay
            gsap.to('#puzzle-module', { opacity: 0, duration: 2.0 });

            // Fade gnome reward shader via its opacity uniform (DIV Swap mode)
            if (gnomeReward && gnomeReward.isRunning && gnomeReward._imageMat && gnomeReward._imageMat.uniforms.opacity) {
                gsap.to(gnomeReward._imageMat.uniforms.opacity, {
                    value: 0, duration: 2.0,
                    onComplete: () => {
                        state.follower.visible = false;
                        state.cssMirror.visible = false;
                        gnomeReward.stop();
                        anomalySystem.resetForGhost();
                    }
                });
            } else {
                // Puzzle wasn't solved yet, just fade the CSS stuff
                gsap.to('#puzzle-module', {
                    opacity: 0, duration: 2.0, onComplete: () => {
                        state.follower.visible = false;
                        state.cssMirror.visible = false;
                        anomalySystem.resetForGhost();
                    }
                });
            }
        }, 5000);
    } else {
        ghoster.onTrackingLost(p.id, state.follower);
    }
}

function handlePuzzleSolved() {
    const termBox = document.querySelector('#puzzle-module .terminal-box');
    if (!termBox) return;

    gnomeReward.setupInElement(termBox);

    // Hide standard puzzle elements
    const inputBox = document.querySelector('#puzzle-module .input-box');
    if (inputBox) inputBox.style.display = 'none';
    const staticCanvas = document.getElementById('static-canvas');
    if (staticCanvas) staticCanvas.style.display = 'none';

    console.log('🧙 Gnome Reward Injected into Static Screen DIV');
}

function handleAnomalyReset() {
    isScanning = true;
    document.getElementById('scanner-ui').classList.remove('dimmed');
    document.getElementById('anomaly-dimmer').classList.remove('active');
    gsap.to('#anomaly-overlay', { opacity: 0, duration: 0.3 });
    const st = pageStates.get(activePageIndex);
    if (st) {
        if (st.cssPuzzle) st.cssPuzzle.visible = true; // Restore puzzle visibility
        gnomeReward.stop();
        if (st.follower) st.follower.remove(gnomeReward);
    }
}

function resetGhostTimer() {
    const st = pageStates.get(activePageIndex);
    if (st && st._ghostTimer) {
        clearTimeout(st._ghostTimer);
        st._ghostTimer = null;
    }
}

/* --- UI Logic --- */

function buildDevUI() {
    const devConsole = document.getElementById('dev-console');
    if (!devConsole) return;

    devConsole.innerHTML = `
        <div class="dev-title">TRANSFORM TUNER V8.0</div>
        <select id="dsel" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
        <select id="danim" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
        
        <div class="ctrl"><label>Scale</label><input type="range" id="ds" min="-6" max="1" step="0.01"><span class="v" id="dsv"></span></div>
        <div class="ctrl"><label>Pos X</label><input type="range" id="dpx" min="-1" max="1" step="0.01"><span class="v" id="dpxv"></span></div>
        <div class="ctrl"><label>Pos Y</label><input type="range" id="dpy" min="-1" max="1" step="0.01"><span class="v" id="dpyv"></span></div>
        <div class="ctrl"><label>Pos Z</label><input type="range" id="dpz" min="-1" max="1" step="0.01"><span class="v" id="dpzv"></span></div>
        
        <div class="dev-section">
            <div class="dev-title">SYSTEM STABILITY</div>
            <div class="ctrl"><label>Lerp</label><input type="range" id="dlerp" min="0.001" max="1" step="0.001" value="0.75"></div>
            <div class="ctrl"><label>Unsmoothed</label><input type="checkbox" id="ddislerp"></div>
            <div class="ctrl"><label>Jump Filter</label><input type="checkbox" id="ddisjump"></div>
            <div class="ctrl"><label>Delta</label><input type="range" id="djump" min="0.01" max="100" step="0.1" value="0.3"><span class="v" id="djumpv">0.3</span></div>
            <div class="ctrl"><label>Filter CF</label><input type="range" id="dfmin" min="-6" max="0" step="0.1" value="-4"></div>
        </div>

        <div class="dev-section">
            <div class="dev-title">LIGHTING & SHADOWS</div>
            <div class="ctrl"><label>Manual</label><input type="checkbox" id="dlmanual"></div>
            <div class="ctrl"><label>Intensity</label><input type="range" id="dlint" min="0" max="10" step="0.1" value="4.0"></div>
            <div class="ctrl"><label>Bias</label><input type="range" id="dlbias" min="-0.005" max="0.005" step="0.0001" value="-0.0001"></div>
            <div class="ctrl"><label>Offset Y</label><input type="range" id="dlso" min="-0.2" max="0.2" step="0.001" value="-0.01"></div>
            <div class="ctrl"><label>Debug</label><input type="checkbox" id="dlshowh"></div>
            <div class="ctrl"><label>Wave Op</label><input type="range" id="dwaveop" min="0" max="1" step="0.01" value="0.4"></div>
        </div>

        <div class="dev-section">
            <div class="dev-title">CSS3D DIMENSIONS</div>
            <div class="ctrl"><label>Width</label><input type="range" id="dcw" min="100" max="1200" step="1" value="500"><span class="v" id="dcwv">500</span></div>
            <div class="ctrl"><label>Height</label><input type="range" id="dch" min="100" max="1200" step="1" value="400"><span class="v" id="dchv">400</span></div>
        </div>

        <div class="dev-section">
            <div class="dev-title">PUZZLE PINNING</div>
            <div class="ctrl"><label>X Offset</label><input type="range" id="dipx" min="-500" max="500" step="1" value="0"><span class="v" id="dipxv">0</span></div>
            <div class="ctrl"><label>Y Offset</label><input type="range" id="dipy" min="-500" max="500" step="1" value="0"><span class="v" id="dipyv">0</span></div>
        </div>

        <button id="dcopy" class="btn-gf" style="width:100%; margin-top:20px;">Copy Full Config</button>
    `;

    sl.sel = document.getElementById('dsel');
    sl.anim = document.getElementById('danim');
    sl.s = document.getElementById('ds');
    sl.px = document.getElementById('dpx'); sl.py = document.getElementById('dpy'); sl.pz = document.getElementById('dpz');
    sl.lerp = document.getElementById('dlerp');
    sl.fmin = document.getElementById('dfmin');
    sl.lmanual = document.getElementById('dlmanual'); sl.lint = document.getElementById('dlint');
    sl.lbias = document.getElementById('dlbias'); sl.lso = document.getElementById('dlso');
    sl.lshowh = document.getElementById('dlshowh');
    sl.waveOp = document.getElementById('dwaveop');
    sl.cw = document.getElementById('dcw');
    sl.ch = document.getElementById('dch');
    sl.dislerp = document.getElementById('ddislerp');
    sl.jump = document.getElementById('djump');
    sl.disjump = document.getElementById('ddisjump');
    sl.ipx = document.getElementById('dipx');
    sl.ipy = document.getElementById('dipy');

    pages.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = p.label;
        sl.sel.appendChild(o);
    });
    sl.sel.onchange = () => { activePageIndex = parseInt(sl.sel.value); loadCfg(); };

    [sl.s, sl.px, sl.py, sl.pz, sl.lmanual, sl.lint, sl.lbias, sl.lso, sl.waveOp, sl.lerp, sl.dislerp, sl.jump, sl.disjump, sl.ipx, sl.ipy, sl.cw, sl.ch].forEach(el => {
        if (el) el.oninput = () => writeCfg();
    });

    sl.fmin.oninput = () => {
        const val = Math.pow(10, parseFloat(sl.fmin.value));
        if (coreAR) coreAR.setFilterMinCF(val);
    };

    document.getElementById('dcopy').onclick = () => {
        const st = pageStates.get(activePageIndex);
        if (st) {
            const dump = {
                targetName: pages[activePageIndex].label,
                pageId: pages[activePageIndex].id,
                config: st.config,
                stability: {
                    lerp: getVal('lerp', 0.9),
                    unsmoothed: getVal('dislerp', false),
                    jumpThreshold: getVal('jump', 0.3),
                    useJumpFilter: getVal('disjump', true),
                    filterMinCF: Math.pow(10, parseFloat(sl.fmin.value))
                }
            };
            navigator.clipboard.writeText(JSON.stringify(dump, null, 2)).then(() => alert('Full Config Copied!'));
        }
    };
}

function loadCfg() {
    const st = pageStates.get(activePageIndex);
    const c = st.config;

    sl.s.value = Math.log10(c.scale || 0.1).toFixed(2);
    sl.px.value = c.offsetX || 0;
    sl.py.value = c.offsetY || 0;
    sl.pz.value = c.offsetZ || 0;

    if (sl.sel) sl.sel.value = activePageIndex;

    // Update labels
    document.getElementById('dsv').textContent = (c.scale || 0.1).toFixed(4);
    document.getElementById('dpxv').textContent = (c.offsetX || 0).toFixed(2);
    document.getElementById('dpyv').textContent = (c.offsetY || 0).toFixed(2);
    document.getElementById('dpzv').textContent = (c.offsetZ || 0).toFixed(2);

    // CSS3D Dimensions
    if (sl.cw) {
        sl.cw.value = c.cssWidth || 500;
        sl.ch.value = c.cssHeight || 400;
        document.getElementById('dcwv').textContent = sl.cw.value;
        document.getElementById('dchv').textContent = sl.ch.value;
    }

    // Puzzle Offsets (Pinning)
    if (sl.ipx) sl.ipx.value = 0;
    if (sl.ipy) sl.ipy.value = 0;
    if (document.getElementById('dipxv')) document.getElementById('dipxv').textContent = "0";
    if (document.getElementById('dipyv')) document.getElementById('dipyv').textContent = "0";

    // Populate Animations
    if (sl.anim) {
        sl.anim.innerHTML = '';
        const isAnomaly = pages[activePageIndex] && pages[activePageIndex].anomaly;
        if (st.animations && st.animations.length > 0 && !isAnomaly) {
            st.animations.forEach((clip, i) => {
                const opt = document.createElement('option');
                opt.value = i; opt.textContent = clip.name;
                sl.anim.appendChild(opt);
            });
            sl.anim.value = st.activeClipIndex || 0;
            sl.anim.onchange = () => {
                const clip = st.animations[parseInt(sl.anim.value)];
                if (st.mixer && clip) {
                    st.mixer.stopAllAction();
                    st.mixer.clipAction(clip).play();
                    st.activeClipIndex = parseInt(sl.anim.value);
                }
            };
        } else {
            sl.anim.innerHTML = `<option value="">${isAnomaly ? '-- SYSTEM LOCKED --' : 'No Animations'}</option>`;
        }
    }

    applyConfig(st);
}

function writeCfg() {
    const st = pageStates.get(activePageIndex);
    if (!st) return;
    st.config.scale = Math.pow(10, parseFloat(sl.s.value));
    st.config.offsetX = parseFloat(sl.px.value);
    st.config.offsetY = parseFloat(sl.py.value);
    st.config.offsetZ = parseFloat(sl.pz.value);

    document.getElementById('dsv').textContent = st.config.scale.toFixed(4);
    document.getElementById('dpxv').textContent = st.config.offsetX.toFixed(2);
    document.getElementById('dpyv').textContent = st.config.offsetY.toFixed(2);
    document.getElementById('dpzv').textContent = st.config.offsetZ.toFixed(2);

    if (sl.cw) {
        st.config.cssWidth = parseFloat(sl.cw.value);
        st.config.cssHeight = parseFloat(sl.ch.value);
        document.getElementById('dcwv').textContent = sl.cw.value;
        document.getElementById('dchv').textContent = sl.ch.value;
    }

    if (sl.ipx) document.getElementById('dipxv').textContent = sl.ipx.value;
    if (sl.ipy) document.getElementById('dipyv').textContent = sl.ipy.value;

    // Apply stability settings globally
    const currentLerp = getVal('lerp', 0.75);
    const isUnsmoothed = getVal('dislerp', false);
    const currentJump = getVal('jump', 0.3);
    const isJumpFiltered = getVal('disjump', false);

    if (document.getElementById('djumpv')) document.getElementById('djumpv').textContent = currentJump.toFixed(2);

    pageStates.forEach(st => {
        if (st.smoother) {
            st.smoother.lerpAlpha = isUnsmoothed ? 1.0 : currentLerp;
            st.smoother.jumpThreshold = currentJump;
            st.smoother.useJumpFilter = isJumpFiltered;
        }
    });

    applyConfig(st);
}

function applyConfig(state) {
    const { model, cssPuzzle, contentPivot, config } = state;
    const s = config.scale || 0.1;

    if (contentPivot) {
        // The Pivot handles ALL user-defined offsets from pages.json
        contentPivot.position.set(config.offsetX || 0, config.offsetY || 0, config.offsetZ || 0);
        contentPivot.rotation.set(
            THREE.MathUtils.degToRad(config.rotationX || 0),
            THREE.MathUtils.degToRad(config.rotationY || 0),
            THREE.MathUtils.degToRad(config.rotationZ || 0)
        );
        // We handle scale on children to match their specific units (WebGL vs CSS3D)
    }

    if (model) {
        model.scale.set(s, s, s);
        // Position/Rotation are now handled by contentPivot parent
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
    }

    if (cssPuzzle) {
        const ipx = getVal('ipx', 0);
        const ipy = getVal('ipy', 0);

        cssPuzzle.position.set(
            (config.offsetX || 0) + (ipx * 0.001),
            (config.offsetY || 0) - (ipy * 0.001),
            (config.offsetZ || 0)
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

function setupControls() {
    document.getElementById('toggle-scan-btn').onclick = async () => {
        const btn = document.getElementById('toggle-scan-btn');
        if (!isScanning) {
            await audioManager.init();
            try {
                await coreAR.start();
                isScanning = true;
                btn.innerText = "Disengage Scanner";
                btn.classList.add('engaged');
                anomalySystem.isScanning = true;
            } catch (err) { handleARFailure(err); }
        } else {
            coreAR.stop();
            isScanning = false;
            btn.innerText = "Engage Scanner";
            btn.classList.remove('engaged');
            anomalySystem.isScanning = false;
            anomalySystem.hide();
            gnomeReward.stop();
        }
    };
    document.getElementById('dev-toggle').onclick = () => {
        isDevMode = !isDevMode;
        document.getElementById('dev-console').classList.toggle('open', isDevMode);
        document.getElementById('dev-toggle').classList.toggle('active', isDevMode);
    };
}

function updateGlobalLighting() {
    // Basic directional light following camera for simplistic "old device" lighting
    // Or just let LightEstimator provide values
}

function drawWaveform() {
    const waveCanvas = document.getElementById('wave-canvas');
    const ctx = waveCanvas.getContext('2d');
    const w = waveCanvas.width = waveCanvas.offsetWidth;
    const h = waveCanvas.height = waveCanvas.offsetHeight;
    if (w === 0) return;

    ctx.fillStyle = 'rgba(10, 14, 10, 0.22)';
    ctx.fillRect(0, 0, w, h);
    if (!isScanning) return;

    // Simple procedural waveform
    ctx.beginPath(); ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5;
    const cy = h / 2;
    for (let x = 0; x < w; x += 3) {
        const y = cy + Math.sin((x + xOffset) * 0.05) * (h / 6);
        ctx.lineTo(x, y);
    }
    ctx.stroke(); xOffset += 4;
}

function getVal(id, def) {
    if (!sl[id]) return def;
    if (sl[id].type === 'checkbox') return sl[id].checked;
    return parseFloat(sl[id].value) || def;
}

function handleARFailure(error) {
    const overlay = document.getElementById('failure-overlay');
    const details = document.getElementById('error-details');
    if (!overlay) return;
    details.innerText = `ERR_REF: ${error.message || error.toString()}`;
    overlay.classList.remove('hidden');
    overlay.classList.add('active');
    if (window.captureTelemetry) window.captureTelemetry(error.message);
}

bootstrap();
