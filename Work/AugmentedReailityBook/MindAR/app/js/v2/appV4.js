import * as THREE from 'three';
import { MindARThree } from 'mind-ar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { PoseSmoothing } from './smoothing.js';
import { GhostingSystem } from './ghosting.js';
import { LightEstimator } from './light-estimator.js';
import { AnomalySystem } from './anomalyV4.js';
import { GnomeReward } from './gnomeReward.js';

/**
 * appV3.js - Ford Pines Scanner v7.5
 * Re-Stabilized: Selector Fixed + Waveform Fixed + Yellow Debug Fixed + Zero-Ghosting.
 */

let mindarThree, renderer, scene, camera;
let cssRenderer, cssScene;
let gnomeReward; // Shader-based reward system
let lightEstimator, anomalySystem;
let isScanning = false;
let isDevMode = false;

const ghoster = new GhostingSystem({ fadeDuration: 1.5, fadeInDuration: 0.5 });
const pageStates = new Map();
let pages = [];
let activePageIndex = 0;

/* --- Sound System --- */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.scannerBuffer = null;
        this.detectedBuffer = null;
        this.scannerNode = null;
        this.gainNode = null;
        this.isInitialized = false;
        this.soundPath = './assets/shaders/sounds/';
    }

    async init() {
        if (this.isInitialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
        this.isInitialized = true;

        this.scannerBuffer = await this.loadBuffer('538214__oldestmillennial__scanner.wav');
        this.detectedBuffer = await this.loadBuffer('263652__jobro__mgs-detected-lead.wav');

        this.startScanner();
    }

    async loadBuffer(name) {
        const resp = await fetch(this.soundPath + name);
        const array = await resp.arrayBuffer();
        return await this.ctx.decodeAudioData(array);
    }

    startScanner() {
        if (!this.scannerBuffer) return;
        this.scannerNode = this.ctx.createBufferSource();
        this.scannerNode.buffer = this.scannerBuffer;
        this.scannerNode.loop = true;
        this.scannerNode.connect(this.gainNode);
        this.scannerNode.start(0);

        this.randomizeScanner();
    }

    randomizeScanner() {
        if (!this.scannerNode || !this.isInitialized) return;
        // Random pitch/volume modulation
        const baseRate = 1.0;
        const targetRate = baseRate + (Math.random() - 0.5) * 0.1;
        const targetVolume = 0.5 + Math.random() * 0.3;

        this.scannerNode.playbackRate.setTargetAtTime(targetRate, this.ctx.currentTime, 1.0);
        this.gainNode.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 1.0);

        setTimeout(() => this.randomizeScanner(), 500 + Math.random() * 1000);
    }

    playDetected() {
        if (!this.detectedBuffer || !this.isInitialized) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.detectedBuffer;
        source.connect(this.ctx.destination);
        source.start(0);
    }
}

const sm = new SoundManager();

// UI Refs
const arContainer = document.getElementById('ar-container');
const waveCanvas = document.getElementById('wave-canvas');
const ctx = waveCanvas.getContext('2d');
const devConsole = document.getElementById('dev-console');
const devToggle = document.getElementById('dev-toggle');
const toggleBtn = document.getElementById('toggle-scan-btn');

// Waveform Smoothing
let smoothGain = 1.0;
let smoothFreq = 1.0;
let smoothPhaseOffset = 0.0;
const LERP_FACTOR = 0.06;
let xOffset = 0;

// Global Components
let globalLight, globalLightRoot, globalHelper, globalDebugBox;

// Shared UI State
const sl = {
    s: null, px: null, py: null, pz: null, rx: null, ry: null, rz: null,
    lerp: null, hold: null, fade: null, sel: null, anim: null,
    lint: null, lbias: null, lnear: null, lfar: null,
    lmanual: null, lmx: null, lmy: null, lso: null,
    lshowh: null, lshowf: null, fmin: null, waveOp: null,
    ix: null, iy: null, ipx: null, ipy: null
};

/* --- Config Helpers --- */
function applyConfig(model, config) {
    if (!model) return;
    const s = config.scale || 0.1;
    model.scale.set(s, s, s);
    model.position.set(config.offsetX || 0, config.offsetY || 0, config.offsetZ || 0);
    model.rotation.set(
        THREE.MathUtils.degToRad(config.rotationX || 0),
        THREE.MathUtils.degToRad(config.rotationY || 0),
        THREE.MathUtils.degToRad(config.rotationZ || 0)
    );
}

function getVal(id, def) {
    if (sl[id]) return (sl[id].type === 'checkbox' ? sl[id].checked : parseFloat(sl[id].value)) || def;
    return def;
}

/* --- UI Builders --- */
function buildDev() {
    if (!devConsole) return;
    devConsole.innerHTML = `
        <div class="dev-title">TRANSFORM TUNER V7.5</div>
        <select id="dsel" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
        <select id="danim" style="background:#000; color:#0f0; border:1px solid #111; padding:5px; margin-bottom:10px; width:100%"></select>
        
        <div class="ctrl"><label>Scale</label><input type="range" id="ds" min="-6" max="1" step="0.01"><span class="v" id="dsv"></span></div>
        <div class="ctrl"><label>Pos X</label><input type="range" id="dpx" min="-1" max="1" step="0.01"><span class="v" id="dpxv"></span></div>
        <div class="ctrl"><label>Pos Y</label><input type="range" id="dpy" min="-1" max="1" step="0.01"><span class="v" id="dpyv"></span></div>
        <div class="ctrl"><label>Pos Z</label><input type="range" id="dpz" min="-1" max="1" step="0.01"><span class="v" id="dpzv"></span></div>
        
        <div class="dev-section">
            <div class="dev-title">SYSTEM STABILITY</div>
            <div class="ctrl"><label>Lerp</label><input type="range" id="dlerp" min="0.01" max="1" step="0.01" value="0.06"></div>
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
            <div class="dev-title">IFRAME POSITIONING</div>
            <div class="ctrl"><label>X Offset</label><input type="range" id="dix" min="-500" max="500" step="1" value="0"><span class="v" id="dixv">0</span></div>
            <div class="ctrl"><label>Y Offset</label><input type="range" id="diy" min="-500" max="500" step="1" value="-200"><span class="v" id="diyv">-200</span></div>
        </div>

        <div class="dev-section">
            <div class="dev-title">PUZZLE PINNING</div>
            <div class="ctrl"><label>X Offset</label><input type="range" id="dipx" min="-500" max="500" step="1" value="0"><span class="v" id="dipxv">0</span></div>
            <div class="ctrl"><label>Y Offset</label><input type="range" id="dipy" min="-500" max="500" step="1" value="0"><span class="v" id="dipyv">0</span></div>
        </div>

        <button id="dcopy" class="btn-gf" style="width:100%; min-width:0; margin-top:20px; font-size:12px;">Copy Config</button>
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
    sl.ix = document.getElementById('dix');
    sl.iy = document.getElementById('diy');
    sl.ipx = document.getElementById('dipx');
    sl.ipy = document.getElementById('dipy');

    // Init Target Select
    pages.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = p.label;
        sl.sel.appendChild(o);
    });
    sl.sel.onchange = () => { activePageIndex = parseInt(sl.sel.value); loadCfg(); };

    [sl.s, sl.px, sl.py, sl.pz, sl.lmanual, sl.lint, sl.lbias, sl.lso, sl.waveOp, sl.lerp, sl.ix, sl.iy, sl.ipx, sl.ipy].forEach(el => {
        if (el) el.oninput = () => writeCfg();
    });

    sl.fmin.oninput = () => {
        const val = Math.pow(10, parseFloat(sl.fmin.value));
        if (mindarThree && mindarThree.controller) mindarThree.controller.filterMinCF = val;
    };

    document.getElementById('dcopy').onclick = () => {
        const st = pageStates.get(activePageIndex);
        if (st) navigator.clipboard.writeText(JSON.stringify(st.config, null, 2)).then(() => alert('Config Copied!'));
    };
}

function loadCfg() {
    const st = pageStates.get(activePageIndex);
    const c = st.config;
    sl.s.value = Math.log10(c.scale || 0.1).toFixed(2);
    sl.px.value = c.offsetX; sl.py.value = c.offsetY; sl.pz.value = c.offsetZ;

    // Correctly update the target selector display if it's out of sync
    if (sl.sel && parseInt(sl.sel.value) !== activePageIndex) {
        sl.sel.value = activePageIndex;
    }

    // Labels
    document.getElementById('dsv').textContent = c.scale.toFixed(4);
    document.getElementById('dpxv').textContent = c.offsetX.toFixed(2);
    document.getElementById('dpyv').textContent = c.offsetY.toFixed(2);
    document.getElementById('dpzv').textContent = c.offsetZ.toFixed(2);

    // Initialize Iframe Offsets
    if (sl.ix) sl.ix.value = 0;
    if (sl.iy) sl.iy.value = -200;
    if (document.getElementById('dixv')) document.getElementById('dixv').textContent = "0";
    if (document.getElementById('diyv')) document.getElementById('diyv').textContent = "-200";

    // Initialize Puzzle Offsets
    if (sl.ipx) sl.ipx.value = 0;
    if (sl.ipy) sl.ipy.value = 0;
    if (document.getElementById('dipxv')) document.getElementById('dipxv').textContent = "0";
    if (document.getElementById('dipyv')) document.getElementById('dipyv').textContent = "0";

    // Populate Animations for THIS model
    if (sl.anim) {
        sl.anim.innerHTML = '';
        const isAnomalyPage = pages[activePageIndex] && pages[activePageIndex].anomaly;

        if (st.animations && st.animations.length > 0 && !isAnomalyPage) {
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
            sl.anim.innerHTML = `<option value="">${isAnomalyPage ? '-- SYSTEM LOCKED --' : 'No Animations'}</option>`;
        }
    }
}

function writeCfg() {
    const st = pageStates.get(activePageIndex);
    if (!st) return;
    st.config.scale = Math.pow(10, parseFloat(sl.s.value));
    st.config.offsetX = parseFloat(sl.px.value);
    st.config.offsetY = parseFloat(sl.py.value);
    st.config.offsetZ = parseFloat(sl.pz.value);
    applyConfig(st.model, st.config);

    document.getElementById('dsv').textContent = st.config.scale.toFixed(4);
    document.getElementById('dpxv').textContent = st.config.offsetX.toFixed(2);
    document.getElementById('dpyv').textContent = st.config.offsetY.toFixed(2);
    document.getElementById('dpzv').textContent = st.config.offsetZ.toFixed(2);

    if (sl.waveOp) waveCanvas.style.opacity = sl.waveOp.value;

    if (sl.ix) document.getElementById('dixv').textContent = sl.ix.value;
    if (sl.iy) document.getElementById('diyv').textContent = sl.iy.value;

    if (sl.ipx) document.getElementById('dipxv').textContent = sl.ipx.value;
    if (sl.ipy) document.getElementById('dipyv').textContent = sl.ipy.value;
}

/* --- Core Loop --- */
async function init() {
    console.log("Scanner v7.5: Powering On...");

    const resp = await fetch('./pages.json');
    const data = await resp.json();
    pages = data.pages || [];

    mindarThree = new MindARThree({
        container: arContainer,
        imageTargetSrc: data.meta.trackingDescriptor || './targets/book_targets.mind',
        filterMinCF: 0.0001,
        filterBeta: 0.1,
        uiLoading: 'no',
        uiScanning: 'no'
    });

    renderer = mindarThree.renderer;
    scene = mindarThree.scene;
    camera = mindarThree.camera;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- CSS3D Renderer (separate scene, shared camera) ---
    cssScene = new THREE.Scene();
    cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(arContainer.offsetWidth, arContainer.offsetHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = '0';
    cssRenderer.domElement.style.left = '0';
    cssRenderer.domElement.style.pointerEvents = 'none'; // pass clicks through
    cssRenderer.domElement.style.zIndex = '2000';
    cssRenderer.domElement.style.display = 'none'; // hidden until scanning
    arContainer.appendChild(cssRenderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(amb);

    globalLightRoot = new THREE.Group();
    scene.add(globalLightRoot);
    globalLight = new THREE.DirectionalLight(0xffffff, 4.0);
    globalLight.castShadow = true;
    globalLightRoot.add(globalLight);
    globalLightRoot.add(globalLight.target);

    globalHelper = new THREE.CameraHelper(globalLight.shadow.camera);
    scene.add(globalHelper);
    globalHelper.visible = false;

    globalDebugBox = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    scene.add(globalDebugBox);
    globalDebugBox.visible = false;

    lightEstimator = new LightEstimator(renderer, scene);
    setTimeout(() => {
        if (lightEstimator.hud) {
            lightEstimator.hud.style.position = 'absolute';
            lightEstimator.hud.style.top = '10px';
            lightEstimator.hud.style.right = '10px';
            lightEstimator.hud.style.display = 'none';
            document.getElementById('crt-screen').appendChild(lightEstimator.hud);
        }
    }, 500);

    anomalySystem = new AnomalySystem({
        parentContainer: document.getElementById('crt-screen'),
        onComplete: (status) => {
            if (status === 'detected') {
                sm.playDetected();
            }
        },
        onSolved: () => {
            console.log('🎬 onSolved: Swapping to gnome reward');
            const mod = document.getElementById('puzzle-module');
            if (mod) gsap.set(mod, { opacity: 1 }); // Ensure it's opaque

            // Hide input box, swap static canvas for gnome canvas
            const inputBox = document.querySelector('#puzzle-module .input-box');
            if (inputBox) inputBox.style.display = 'none';
            const staticCanvas = document.getElementById('static-canvas');
            const termBox = document.querySelector('#puzzle-module .terminal-box');
            if (staticCanvas && termBox && gnomeReward) {
                staticCanvas.style.display = 'none';
                if (!document.getElementById('gnome-canvas')) {
                    termBox.appendChild(gnomeReward.canvas);
                }
                gnomeReward.canvas.style.display = 'block';
                gnomeReward.start();
            }
        },
        onInteraction: () => {
            // Reset ghost timer on any input or interaction
            const st = pageStates.get(activePageIndex);
            if (st && st._ghostTimer) {
                clearTimeout(st._ghostTimer);
                st._ghostTimer = null;
            }
        },
        onReset: () => {
            isScanning = true;
            document.getElementById('scanner-ui').classList.remove('dimmed');
            document.getElementById('anomaly-dimmer').classList.remove('active');
            gsap.to('#anomaly-overlay', { opacity: 0, duration: 0.3 });
            // Also hide CSS3D objects and gnome reward on reset
            const st = pageStates.get(activePageIndex);
            if (st) {
                if (st.cssPuzzle) st.cssPuzzle.visible = false;
                if (gnomeReward) gnomeReward.stop();
            }
        }
    });

    // Prepare anomaly HTML elements for CSS3D
    const puzzleModule = document.getElementById('puzzle-module');
    if (puzzleModule) {
        puzzleModule.style.pointerEvents = 'auto';
    }

    // Initialize gnome reward (self-contained, own canvas)
    gnomeReward = new GnomeReward(460, 460);
    await gnomeReward.load();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    pages.forEach((p, i) => {
        const anchor = mindarThree.addAnchor(i);
        const follower = new THREE.Group();
        scene.add(follower);
        follower.visible = false;

        const state = {
            anchor, follower, model: null, mixer: null, animations: [],
            isTracking: false,
            smoother: new PoseSmoothing({ lerpAlpha: 0.06 }),
            visibleScale: new THREE.Vector3(1, 1, 1),
            config: {
                scale: p.model.scale || 0.1,
                offsetX: p.model.offsetX || 0, offsetY: p.model.offsetY || 0, offsetZ: p.model.offsetZ || 0,
                rotationX: p.model.rotationX || 0, rotationY: p.model.rotationY || 0, rotationZ: p.model.rotationZ || 0
            },
            // CSS3D mirror group (only for anomaly pages)
            cssMirror: null,
            cssPuzzle: null,
            // gnomeReward mesh is added to follower on solve
        };
        pageStates.set(i, state);

        // For anomaly pages, create a mirror group in the CSS scene
        if (p.anomaly) {
            state.cssMirror = new THREE.Group();
            state.cssMirror.visible = false;
            cssScene.add(state.cssMirror);

            // Wrap puzzle module as CSS3DObject
            if (puzzleModule) {
                state.cssPuzzle = new CSS3DObject(puzzleModule);
                state.cssPuzzle.scale.set(0.002, 0.002, 0.002);
                state.cssPuzzle.visible = false;
                state.cssMirror.add(state.cssPuzzle);
            }
        }

        anchor.onTargetFound = () => {
            console.log(`Target Found: ${p.label} (Index: ${i}, Anomaly: ${!!p.anomaly})`);
            state.isTracking = true;
            if (p.anomaly && isScanning) {
                // Clear any pending ghost timer
                if (state._ghostTimer) { clearTimeout(state._ghostTimer); state._ghostTimer = null; }
                // Show CSS mirror and follower (reward mesh lives in follower)
                if (state.model) state.model.visible = false;
                follower.visible = true; // Needed for gnome reward mesh
                const mod = document.getElementById('puzzle-module');
                if (mod) gsap.set(mod, { opacity: 1 });
                if (state.cssMirror) state.cssMirror.visible = true;
                if (state.cssPuzzle) state.cssPuzzle.visible = true;
                // triggerAnomaly will call onSolved() if already solved
                anomalySystem.triggerAnomaly();
                activePageIndex = i;
                if (sl.sel) sl.sel.value = i;
                loadCfg();
                return;
            }
            follower.visible = true;
            ghoster.onTrackingFound(p.id, state.follower);
            if (sl.sel) { sl.sel.value = i; activePageIndex = i; loadCfg(); }
        };
        anchor.onTargetLost = () => {
            state.isTracking = false;
            if (p.anomaly) {
                // Ghost the CSS mirror: keep visible for 5s then fade out
                if (state.cssMirror && state.cssMirror.visible) {
                    if (state._ghostTimer) clearTimeout(state._ghostTimer);
                    state._ghostTimer = setTimeout(() => {
                        const mod = document.getElementById('puzzle-module');
                        if (mod) {
                            // Smoothly fade out the entire module
                            gsap.to(mod, {
                                opacity: 0, 
                                duration: 1.5, 
                                ease: 'power2.in',
                                onComplete: () => {
                                    state.cssMirror.visible = false;
                                    if (state.cssPuzzle) state.cssPuzzle.visible = false;
                                    if (gnomeReward) gnomeReward.stop();
                                    if (anomalySystem) anomalySystem.resetForGhost();
                                }
                            });
                        } else {
                            // Fallback if no mod
                            state.cssMirror.visible = false;
                            if (gnomeReward) gnomeReward.stop();
                        }
                    }, 5000);
                }
            }
            ghoster.onTrackingLost(p.id, state.follower);
        };

        // Only load 3D model for non-anomaly pages
        if (!p.anomaly) {
            loader.load('./' + p.model.src, (gltf) => {
                state.model = gltf.scene;
                state.animations = gltf.animations || [];
                follower.add(state.model);
                applyConfig(state.model, state.config);
                if (state.animations.length > 0) {
                    state.mixer = new THREE.AnimationMixer(state.model);
                    state.mixer.clipAction(state.animations[0]).play();
                }
                if (activePageIndex === i) loadCfg();
            });
        }
    });

    buildDev();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();
        if (isScanning && lightEstimator) lightEstimator.update();

        // Lighting Logic
        if (globalLight && lightEstimator) {
            const manual = getVal('lmanual', false);
            const showDebug = getVal('lshowh', false);

            if (manual) globalLight.position.set(getVal('lmx', 0), getVal('lmy', 5), 6);
            else globalLight.position.copy(lightEstimator.currentOffset);

            globalLight.intensity = (manual ? 1 : lightEstimator.currentIntensity / 2) * getVal('lint', 4);
            globalLight.target.position.set(0, 0, 0);

            if (globalHelper) { globalHelper.visible = showDebug; globalHelper.update(); }
            if (globalDebugBox) { globalDebugBox.visible = showDebug; globalDebugBox.position.copy(globalLight.position); }
            if (lightEstimator.hud) lightEstimator.hud.style.display = showDebug ? 'block' : 'none';
        }

        // Object Logic (Tracking)
        pageStates.forEach((state, i) => {
            const p = pages[i];
            if (state.mixer && isScanning) state.mixer.update(dt);
            if (!isScanning) return;

            if (state.isTracking) {
                const anchorGroup = state.anchor.group;
                anchorGroup.updateMatrixWorld(true);
                const rawP = new THREE.Vector3(); const rawQ = new THREE.Quaternion(); const rawS = new THREE.Vector3();
                anchorGroup.matrixWorld.decompose(rawP, rawQ, rawS);
                state.smoother.update(rawP, rawQ, state.follower);
                state.visibleScale.lerp(rawS, getVal('lerp', 0.06));
                state.follower.scale.copy(state.visibleScale);

                // Mirror the anchor's world matrix into the CSS scene
                if (state.cssMirror && p.anomaly) {
                    state.cssMirror.position.copy(state.follower.position);
                    state.cssMirror.quaternion.copy(state.follower.quaternion);
                    state.cssMirror.scale.copy(state.follower.scale);
                    state.cssMirror.updateMatrixWorld(true);
                }
            } else {
                // Lost tracking — but respect the ghosting fade
                if (state.cssMirror && !state._ghostTimer) state.cssMirror.visible = false;
            }
        });

        drawWaveform();
        renderer.render(scene, camera);
        // Render CSS3D scene with the SAME camera
        if (cssRenderer && isScanning) cssRenderer.render(cssScene, camera);
    });
}

const drawWaveform = () => {
    const w = waveCanvas.width = waveCanvas.offsetWidth;
    const h = waveCanvas.height = waveCanvas.offsetHeight;
    if (w === 0) return;

    ctx.fillStyle = isScanning ? 'rgba(10, 14, 10, 0.22)' : 'rgba(10, 14, 10, 0.15)';
    ctx.fillRect(0, 0, w, h);
    if (!isScanning) return;

    const targetKnobs = document.querySelectorAll('.knob');
    const k1Rot = parseFloat(targetKnobs[0].dataset.rot || 0);
    const k2Rot = parseFloat(targetKnobs[1].dataset.rot || 0);
    const k3Rot = parseFloat(targetKnobs[2].dataset.rot || 0);

    const targetGain = 1 + (Math.sin(k1Rot * Math.PI / 180) * 0.45);
    const targetFreq = 1 + (Math.cos(k2Rot * Math.PI / 180) * 0.35);
    const targetPhase = Math.sin(k3Rot * Math.PI / 180) * 40;

    smoothGain += (targetGain - smoothGain) * LERP_FACTOR;
    smoothFreq += (targetFreq - smoothFreq) * LERP_FACTOR;
    smoothPhaseOffset += (targetPhase - smoothPhaseOffset) * LERP_FACTOR;

    ctx.beginPath(); ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5; ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle;
    const cy = h / 2; ctx.moveTo(0, cy);
    const amp = (h / 4) * smoothGain;
    for (let x = 0; x < w; x += 3) {
        const y = cy + Math.sin((x + xOffset) * 0.015 * smoothFreq) * amp * (1 + Math.sin(xOffset * 0.05 + smoothPhaseOffset) * 0.1);
        ctx.lineTo(x, y);
    }
    ctx.stroke(); xOffset += 4;
};

/* --- Controls --- */
document.getElementById('toggle-scan-btn').onclick = async () => {
    const btn = document.getElementById('toggle-scan-btn');
    if (!isScanning) {
        if (!sm.isInitialized) await sm.init();
        else if (sm.ctx.state === 'suspended') sm.ctx.resume();

        try {
            await mindarThree.start();
            isScanning = true;
            btn.innerText = "Disengage Scanner";
            btn.classList.add('engaged');
            if (anomalySystem) anomalySystem.isScanning = true;
            if (cssRenderer) {
                cssRenderer.setSize(arContainer.offsetWidth, arContainer.offsetHeight);
                cssRenderer.domElement.style.display = 'block';
            }
        } catch (err) {
            console.error("MindAR Start Failed:", err);
            handleARFailure(err);
        }
    } else {
        mindarThree.stop();
        isScanning = false;
        btn.innerText = "Engage Scanner";
        btn.classList.remove('engaged');
        if (anomalySystem) {
            anomalySystem.isScanning = false;
            anomalySystem.hide();
        }
        if (cssRenderer) cssRenderer.domElement.style.display = 'none';
        if (gnomeReward) gnomeReward.stop();
        pageStates.forEach(s => {
            s.follower.visible = false;
            if (s.cssMirror) s.cssMirror.visible = false;
        });
    }
};

devToggle.onclick = () => {
    isDevMode = !isDevMode;
    devConsole.classList.toggle('open', isDevMode);
    devToggle.classList.toggle('active', isDevMode);
};

// Periodic Randomization
setInterval(() => {
    const knobs = document.querySelectorAll('.knob');
    knobs.forEach(k => {
        const current = parseFloat(k.dataset.rot || 0);
        const roll = Math.random();
        let next = current;
        if (roll < 0.3) next += (40 + Math.random() * 80);
        else if (roll < 0.6) next -= (40 + Math.random() * 80);
        k.dataset.rot = next; k.style.transform = `rotate(${next}deg)`;
    });
}, 1200);

document.querySelectorAll('.knob').forEach(k => {
    k.onclick = () => {
        const current = parseFloat(k.dataset.rot || 0);
        k.dataset.rot = current + 45; k.style.transform = `rotate(${current + 45}deg)`;
    };
});

/* --- Error Handling & AR Failure Alert --- */
function handleARFailure(error) {
    const overlay = document.getElementById('failure-overlay');
    const details = document.getElementById('error-details');
    if (!overlay) return;

    // Show details (limited to keep UI clean)
    const errText = error ? (error.message || error.toString()) : "Unknown Anomaly";
    if (details) details.innerText = `ERR_REF: ${errText.substring(0, 50)}...`;

    overlay.classList.remove('hidden');
    overlay.classList.add('active');

    // Send telemetry
    if (window.captureTelemetry) {
        window.captureTelemetry(errText);
    }
}

// Expose globally for developerDebug.js
window.handleARFailure = handleARFailure;

document.getElementById('close-failure-btn').onclick = () => {
    const overlay = document.getElementById('failure-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
};

document.getElementById('anomaly-dimmer').onclick = () => { if (anomalySystem) anomalySystem.reset(); };

init();
