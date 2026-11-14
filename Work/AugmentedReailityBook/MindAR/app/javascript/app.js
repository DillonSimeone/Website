import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { CoreAR } from './CoreAR.js';
import { AudioManager } from './AudioManager.js';
import { PoseSmoothing } from './smoothing.js';
import { GhostingSystem } from './ghosting.js';
import { AnomalySystem } from './anomaly.js';
import { GnomeReward } from './gnomeReward.js';
import { WaveformRenderer } from './WaveformRenderer.js';
import { DevUI } from './DevUI.js';
import { initTelemetry, captureTelemetry } from './telemetry.js';
import { initDeveloperDebug } from './developerDebug.js';

/**
 * appV4.js - Ford Pines Scanner v8.0 (Modularized)
 * Optimized for older devices and maintainability.
 */

let coreAR, audioManager, gnomeReward, anomalySystem, waveform, devUI;
let isScanning = false;

// Scratch objects — hoisted to avoid per-frame GC pressure
const _rawP = new THREE.Vector3();
const _rawQ = new THREE.Quaternion();
const _rawS = new THREE.Vector3();
let isDevMode = false;

const ghoster = new GhostingSystem({ fadeDuration: 1.5, fadeInDuration: 0.5 });
const pageStates = new Map();
let pages = [];
let activePageIndex = 0;

// Context passed to DevUI for state synchronization
const stateCtx = {
    get pages() { return pages; },
    get pageStates() { return pageStates; },
    get activePageIndex() { return activePageIndex; },
    set activePageIndex(v) { activePageIndex = v; },
    get coreAR() { return coreAR; }
};

async function bootstrap() {
    console.log("Scanner v8.0: Initializing Modular Core...");

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
    
    // 5. Setup UI & Modules
    waveform = new WaveformRenderer('wave-canvas');
    devUI = new DevUI(stateCtx);
    devUI.build();
    setupControls();

    // 7. Initialize Modules (Formerly separate script tags)
    initTelemetry();
    initDeveloperDebug(handleARFailure, captureTelemetry);

    // 6. Setup Failure Overlay Close
    const closeBtn = document.getElementById('close-failure-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            const overlay = document.getElementById('failure-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.classList.add('hidden');
            }
        };
    }
}

function updateLoop(dt) {
    if (!isScanning) return;

    // A. Tracking & Smoothing
    pageStates.forEach((state, i) => {
        if (state.mixer) state.mixer.update(dt);
        
        if (state.isTracking) {
            const anchorGroup = state.anchor.group;
            anchorGroup.updateMatrixWorld(true);
            
            anchorGroup.matrixWorld.decompose(_rawP, _rawQ, _rawS);
            
            // Warm-up snapping for first 10 frames to ensure correct orientation
            if (state._warmupFrames < 10) {
                state.smoother.update(_rawP, _rawQ, state.follower);
                state.smoother.reset(); // Continually snap during warm-up
                state._warmupFrames++;
            } else {
                state.smoother.update(_rawP, _rawQ, state.follower);
            }

            state.visibleScale.lerp(_rawS, devUI.getVal('lerp', 0.75));
            state.follower.scale.copy(state.visibleScale);

            // Sync CSS with WebGL
            if (state.cssMirror && pages[i].anomaly) {
                state.cssMirror.position.copy(state.follower.position);
                state.cssMirror.quaternion.copy(state.follower.quaternion);
                state.cssMirror.scale.copy(state.follower.scale);
            }
        }
    });

    // B. Gnome Reward Compute Pass (shared renderer)
    if (gnomeReward && gnomeReward.isRunning && coreAR) {
        gnomeReward.onUpdate(coreAR.renderer);
    }

    // C. Tracking Metadata (Dev Console)
    if (isDevMode && devUI && isScanning) {
        let isAnyDetected = false;
        pageStates.forEach(st => {
            if (st.isTracking) isAnyDetected = true;
        });
        devUI.updateStatus(isAnyDetected);
    }

    // D. UI Decorations (Always update so we can clear/hide it)
    if (waveform) waveform.draw(isScanning);
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

        // NEW: Content Pivot handles user offsets (pages.json)
        // Follower handles raw AR pose. They no longer fight.
        const contentPivot = new THREE.Group();
        follower.add(contentPivot);

        const state = {
            anchor, follower, contentPivot, model: null, mixer: null, animations: [],
            isTracking: false,
            smoother: new PoseSmoothing({ lerpAlpha: 0.06, useJumpFilter: false }),
            visibleScale: new THREE.Vector3(1, 1, 1),
            config: p.model || {},
            cssMirror: null, cssPuzzle: null,
            _warmupFrames: 0
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
                if (devUI) devUI.apply(state);
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
    state.smoother.reset(); 
    state._warmupFrames = 0; // Reset warm-up on every discovery
    
    if (p.anomaly && isScanning) {
        resetGhostTimer();
        if (state._ghostTimer) { clearTimeout(state._ghostTimer); state._ghostTimer = null; }
        
        // Cancel any generic ghosting fade that may have started
        ghoster.onTrackingFound(p.id, state.follower);
        
        // Kill any active gnome fade-out
        if (gnomeReward && gnomeReward._displayMat && gnomeReward._displayMat.uniforms.opacity) {
            gsap.killTweensOf(gnomeReward._displayMat.uniforms.opacity);
            gnomeReward._displayMat.uniforms.opacity.value = 1.0;
        }
        gsap.killTweensOf('#puzzle-module');

        state.follower.visible = true; 
        if (document.getElementById('puzzle-module')) gsap.set('#puzzle-module', { opacity: 1 });
        if (state.cssMirror) state.cssMirror.visible = true;
        if (state.cssPuzzle) state.cssPuzzle.visible = true;
        
        // If the gnome was previously solved but got stopped by ghost timer, restart it
        if (gnomeReward && !gnomeReward.isRunning && gnomeReward._setupDone) {
            gnomeReward.start();
        }

        // PERSISTENCE FIX: If the puzzle is ALREADY solved (e.g. scanner was toggled off/on)
        // re-trigger the solve logic to ensure the gnome is injected into the DIV.
        if (anomalySystem.isSolved) {
            handlePuzzleSolved();
        }
        
        anomalySystem.triggerAnomaly();
    } else {
        state.follower.visible = true;
        ghoster.onTrackingFound(p.id, state.follower);
    }
    
    activePageIndex = index;
    if (devUI) devUI.load();
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
            
            // Fade gnome reward via its display material opacity
            if (gnomeReward && gnomeReward.isRunning && gnomeReward._displayMat && gnomeReward._displayMat.uniforms.opacity) {
                gsap.to(gnomeReward._displayMat.uniforms.opacity, { 
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
                gsap.to('#puzzle-module', { opacity: 0, duration: 2.0, onComplete: () => {
                    state.follower.visible = false;
                    state.cssMirror.visible = false;
                    anomalySystem.resetForGhost();
                }});
            }
        }, 5000);
        // DO NOT call ghoster.onTrackingLost for anomaly pages!
    } else {
        ghoster.onTrackingLost(p.id, state.follower);
    }
}

function handlePuzzleSolved() {
    const state = pageStates.get(activePageIndex);
    if (!state) return;

    // Setup gnome as a 3D mesh using the shared renderer
    gnomeReward.setup(coreAR.renderer);

    // Apply the same scale as the 3D model would get
    const s = state.config.scale || 0.1;
    gnomeReward.scale.set(s, s, s);

    // Add gnome to the content pivot so it tracks with the AR target
    if (!state.contentPivot.children.includes(gnomeReward)) {
        state.contentPivot.add(gnomeReward);
    }
    
    // Hide the CSS3D puzzle overlay (gnome now renders in WebGL scene)
    if (state.cssPuzzle) state.cssPuzzle.visible = false;

    console.log('🧙 Gnome Reward Rendered as Scene Mesh');
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



function setupControls() {
    document.getElementById('toggle-scan-btn').onclick = async () => {
        const btn = document.getElementById('toggle-scan-btn');
        if (!isScanning) {
            if (window.captureTelemetry) window.captureTelemetry("ENG_START");
            
            // --- iOS Stability: Immediate Watchdog ---
            const watchdog = setTimeout(() => {
                if (!isScanning) handleARFailure(new Error("TIME_OUT_STARTUP"));
            }, 8000);

            try {
                await audioManager.init();
                if (window.captureTelemetry) window.captureTelemetry("AUDIO_READY");

                if (coreAR.mindarThree === null) {
                    await coreAR.init();
                    pageStates.clear();
                    setupPages();
                }
                
                await coreAR.start();
                
                clearTimeout(watchdog);
                isScanning = true;
                btn.innerText = "Disengage Scanner";
                document.getElementById('scanner-ui').classList.add('engaged');
                anomalySystem.isScanning = true;
                anomalySystem._ensureReticle();
                if (window.captureTelemetry) window.captureTelemetry("ENG_SUCCESS");
            } catch (err) { 
                clearTimeout(watchdog);
                handleARFailure(err); 
            }
        } else {
            // Full teardown — next engage will re-init from scratch
            gnomeReward.reset(coreAR.renderer);
            
            // Clear the WebGL canvas so no frozen gnome frame persists
            coreAR.renderer.setRenderTarget(null);
            coreAR.renderer.clear();

            coreAR.teardown();
            isScanning = false;
            btn.innerText = "Engage Scanner";
            document.getElementById('scanner-ui').classList.remove('engaged');
            anomalySystem.isScanning = false;
            anomalySystem.isAnomalyActive = false;
            anomalySystem.hide();

            // Clear the frozen waveform
            const waveCanvas = document.getElementById('wave-canvas');
            if (waveCanvas) {
                const ctx = waveCanvas.getContext('2d');
                ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
            }
        }
    };
    document.getElementById('dev-toggle').onclick = () => {
        isDevMode = !isDevMode;
        document.getElementById('dev-console').classList.toggle('open', isDevMode);
        document.getElementById('dev-toggle').classList.toggle('active', isDevMode);
    };
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
window.handleARFailure = handleARFailure;

// Entry
bootstrap();
