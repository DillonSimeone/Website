import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

import { CoreAR } from './CoreAR.js';
import { AudioManager } from './AudioManager.js';
import { PoseSmoothing } from './smoothing.js';
import { GhostingSystem } from './ghosting.js';
import { LightEstimator } from './light-estimator.js';
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

let coreAR, audioManager, gnomeReward, lightEstimator, anomalySystem, waveform, devUI;
let isScanning = false;
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
            
            // Warm-up snapping for first 10 frames to ensure correct orientation
            if (state._warmupFrames < 10) {
                state.smoother.update(rawP, rawQ, state.follower);
                state.smoother.reset(); // Continually snap during warm-up
                state._warmupFrames++;
            } else {
                state.smoother.update(rawP, rawQ, state.follower);
            }

            state.visibleScale.lerp(rawS, devUI.getVal('lerp', 0.75));
            state.follower.scale.copy(state.visibleScale);

            // Sync CSS with WebGL
            if (state.cssMirror && pages[i].anomaly) {
                state.cssMirror.position.copy(state.follower.position);
                state.cssMirror.quaternion.copy(state.follower.quaternion);
                state.cssMirror.scale.copy(state.follower.scale);
            }
        }
    });

    // D. Tracking Metadata (Dev Console)
    if (isDevMode && devUI && isScanning) {
        let isAnyDetected = false;
        pageStates.forEach(st => {
            if (st.isTracking) isAnyDetected = true;
        });
        devUI.updateStatus(isAnyDetected);
    }

    // E. UI Decorations (Always update so we can clear/hide it)
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
    const termBox = document.querySelector('#puzzle-module .terminal-box');
    if (!termBox) return;

    // SWAP: Inject content B (Gnome) into content A (Static Screen)
    // This is the definitive fix for parity; they are now the same element.
    gnomeReward.setupInElement(termBox);
    
    // Hide standard puzzle elements (use visibility to preserve layout for the overlay)
    const inputBox = document.querySelector('#puzzle-module .input-box');
    if (inputBox) inputBox.style.display = 'none';
    const staticCanvas = document.getElementById('static-canvas');
    if (staticCanvas) staticCanvas.style.visibility = 'hidden'; // NOT display:none — keeps box height

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
                if (window.captureTelemetry) window.captureTelemetry("ENG_SUCCESS");
            } catch (err) { 
                clearTimeout(watchdog);
                handleARFailure(err); 
            }
        } else {
            // Full teardown — next engage will re-init from scratch
            coreAR.teardown();
            isScanning = false;
            btn.innerText = "Engage Scanner";
            document.getElementById('scanner-ui').classList.remove('engaged');
            anomalySystem.isScanning = false;
            anomalySystem.isAnomalyActive = false;
            anomalySystem.hide();
            gnomeReward.stop();

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

function updateGlobalLighting() {}



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
