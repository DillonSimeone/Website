/**
 * app.js — AR Book (MindAR + Three.js)
 * With sliding dev console and pose smoothing
 */
(function () {
    'use strict';
    const THREE = window.THREE;
    const arContainer = document.getElementById('ar-container');
    const loadingScreen = document.getElementById('loading-screen');
    const startBtn = document.getElementById('start-ar-btn');

    let mindarThree, renderer, scene, camera;
    const mixers = [];
    let currentModel = null;
    let devOpen = false;

    // Smoothing state
    const smoothedPos = new THREE.Vector3();
    const smoothedQuat = new THREE.Quaternion();
    let smoothInitialized = false;
    const LERP_ALPHA = 0.12; // Lower = smoother (0.05–0.3 is the sweet spot)

    // ============================================
    //  DEVELOPER CONSOLE
    // ============================================
    function createDevConsole() {
        const panel = document.createElement('div');
        panel.id = 'dev-console';
        panel.innerHTML = `
            <div class="section">📐 MODEL TRANSFORM</div>
            <div class="row">
                <label>Scale</label>
                <input type="range" id="ds-scale" min="-4" max="1" step="0.01" value="${Math.log10(0.355).toFixed(2)}">
                <span class="val" id="ds-scale-val">0.355</span>
            </div>
            <div class="row">
                <label>Pos X</label>
                <input type="range" id="ds-px" min="-2" max="2" step="0.01" value="0">
                <span class="val" id="ds-px-val">0.00</span>
            </div>
            <div class="row">
                <label>Pos Y</label>
                <input type="range" id="ds-py" min="-2" max="2" step="0.01" value="0">
                <span class="val" id="ds-py-val">0.00</span>
            </div>
            <div class="row">
                <label>Pos Z</label>
                <input type="range" id="ds-pz" min="-2" max="2" step="0.01" value="0.03">
                <span class="val" id="ds-pz-val">0.03</span>
            </div>
            <div class="row">
                <label>Rot X</label>
                <input type="range" id="ds-rx" min="-180" max="180" step="1" value="12">
                <span class="val" id="ds-rx-val">12°</span>
            </div>
            <div class="row">
                <label>Rot Y</label>
                <input type="range" id="ds-ry" min="-180" max="180" step="1" value="180">
                <span class="val" id="ds-ry-val">180°</span>
            </div>
            <div class="row">
                <label>Rot Z</label>
                <input type="range" id="ds-rz" min="-180" max="180" step="1" value="0">
                <span class="val" id="ds-rz-val">0°</span>
            </div>
            <div class="section">🎯 SMOOTHING</div>
            <div class="row">
                <label>Lerp α</label>
                <input type="range" id="ds-lerp" min="0.02" max="1" step="0.01" value="${LERP_ALPHA}">
                <span class="val" id="ds-lerp-val">${LERP_ALPHA}</span>
            </div>
            <div class="row">
                <button id="ds-copy">📋 Copy JSON</button>
                <button id="ds-reset">🔄 Reset</button>
            </div>
        `;
        document.body.appendChild(panel);

        // Toggle button
        const toggle = document.createElement('button');
        toggle.id = 'dev-toggle';
        toggle.textContent = '⚙ DEV';
        toggle.onclick = () => toggleDevConsole();
        document.body.appendChild(toggle);

        // Wire up sliders
        const sliders = {
            scale: document.getElementById('ds-scale'),
            px: document.getElementById('ds-px'),
            py: document.getElementById('ds-py'),
            pz: document.getElementById('ds-pz'),
            rx: document.getElementById('ds-rx'),
            ry: document.getElementById('ds-ry'),
            rz: document.getElementById('ds-rz'),
            lerp: document.getElementById('ds-lerp'),
        };

        function applyValues() {
            if (!currentModel) return;

            const scale = Math.pow(10, parseFloat(sliders.scale.value));
            currentModel.scale.set(scale, scale, scale);
            document.getElementById('ds-scale-val').textContent = scale < 0.01 ? scale.toExponential(2) : scale.toFixed(3);

            currentModel.position.set(
                parseFloat(sliders.px.value),
                parseFloat(sliders.py.value),
                parseFloat(sliders.pz.value)
            );
            document.getElementById('ds-px-val').textContent = parseFloat(sliders.px.value).toFixed(2);
            document.getElementById('ds-py-val').textContent = parseFloat(sliders.py.value).toFixed(2);
            document.getElementById('ds-pz-val').textContent = parseFloat(sliders.pz.value).toFixed(2);

            currentModel.rotation.set(
                parseFloat(sliders.rx.value) * Math.PI / 180,
                parseFloat(sliders.ry.value) * Math.PI / 180,
                parseFloat(sliders.rz.value) * Math.PI / 180
            );
            document.getElementById('ds-rx-val').textContent = sliders.rx.value + '°';
            document.getElementById('ds-ry-val').textContent = sliders.ry.value + '°';
            document.getElementById('ds-rz-val').textContent = sliders.rz.value + '°';

            document.getElementById('ds-lerp-val').textContent = parseFloat(sliders.lerp.value).toFixed(2);
        }

        Object.values(sliders).forEach(s => s.addEventListener('input', applyValues));

        document.getElementById('ds-copy').addEventListener('click', () => {
            const scale = Math.pow(10, parseFloat(sliders.scale.value));
            const json = {
                scale: parseFloat(scale.toFixed(6)),
                offsetX: parseFloat(parseFloat(sliders.px.value).toFixed(3)),
                offsetY: parseFloat(parseFloat(sliders.py.value).toFixed(3)),
                offsetZ: parseFloat(parseFloat(sliders.pz.value).toFixed(3)),
                rotationX: parseInt(sliders.rx.value),
                rotationY: parseInt(sliders.ry.value),
                rotationZ: parseInt(sliders.rz.value),
            };
            navigator.clipboard.writeText(JSON.stringify(json, null, 2)).then(() => {
                alert('Copied:\n' + JSON.stringify(json, null, 2));
            });
        });

        document.getElementById('ds-reset').addEventListener('click', () => {
            sliders.scale.value = Math.log10(0.355).toFixed(2);
            sliders.px.value = 0; sliders.py.value = 0; sliders.pz.value = 0.03;
            sliders.rx.value = 12; sliders.ry.value = 180; sliders.rz.value = 0;
            sliders.lerp.value = LERP_ALPHA;
            applyValues();
        });

        return sliders;
    }

    function toggleDevConsole() {
        devOpen = !devOpen;
        const panel = document.getElementById('dev-console');
        panel.classList.toggle('open', devOpen);
        // Resize AR viewport
        arContainer.style.height = devOpen ? 'calc(100% - var(--dev-height))' : '100%';
        // Notify MindAR to resize
        if (renderer) {
            setTimeout(() => {
                renderer.setSize(arContainer.clientWidth, arContainer.clientHeight);
                if (camera) {
                    camera.aspect = arContainer.clientWidth / arContainer.clientHeight;
                    camera.updateProjectionMatrix();
                }
            }, 350); // After CSS transition
        }
    }

    // ============================================
    //  INJECT STYLES
    // ============================================
    function injectDevStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --dev-height: 280px;
            }

            #ar-container {
                position: fixed !important;
                top: 0;
                left: 0;
                width: 100% !important;
                height: 100% !important;
                transition: height 0.3s ease;
                z-index: 0;
            }

            #dev-console {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 9999;
                background: rgba(8, 8, 16, 0.92);
                color: #6ee7b7;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                padding: 10px 14px;
                height: var(--dev-height);
                transform: translateY(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                overflow-y: auto;
                border-top: 2px solid rgba(110, 231, 183, 0.3);
                backdrop-filter: blur(16px);
            }

            #dev-console.open {
                transform: translateY(0);
            }

            #dev-console .row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 3px 0;
            }

            #dev-console label {
                min-width: 55px;
                color: #6ee7b7;
                font-size: 11px;
            }

            #dev-console input[type=range] {
                flex: 1;
                height: 4px;
                accent-color: #6ee7b7;
            }

            #dev-console .val {
                min-width: 60px;
                text-align: right;
                color: #e2e8f0;
                font-size: 11px;
            }

            #dev-console .section {
                color: #fbbf24;
                font-weight: bold;
                font-size: 11px;
                margin-top: 4px;
                padding-top: 4px;
                border-top: 1px solid rgba(255,255,255,0.06);
            }

            #dev-console .section:first-child {
                border-top: none;
                margin-top: 0;
            }

            #dev-console button {
                background: #6ee7b7;
                color: #000;
                border: none;
                padding: 5px 14px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 11px;
                margin: 2px;
            }

            #dev-toggle {
                position: fixed;
                bottom: 10px;
                right: 10px;
                z-index: 10000;
                background: rgba(110, 231, 183, 0.85);
                color: #000;
                border: none;
                padding: 8px 14px;
                border-radius: 24px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 12px rgba(110, 231, 183, 0.3);
                transition: bottom 0.3s ease;
            }

            #dev-console.open ~ #dev-toggle {
                bottom: calc(var(--dev-height) + 10px);
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    //  INIT
    // ============================================
    let sliders;

    async function init() {
        injectDevStyles();
        sliders = createDevConsole();

        const res = await fetch('pages.json');
        const config = await res.json();
        const pages = config.pages || [];

        mindarThree = new window.MINDAR.IMAGE.MindARThree({
            container: arContainer,
            imageTargetSrc: config.meta?.trackingDescriptor || 'targets/book_targets.mind',
            maxTrack: 1,
            uiLoading: 'no',
            uiScanning: 'no',
            filterMinCF: 0.0001,
            filterBeta: 0.5
        });

        renderer = mindarThree.renderer;
        scene = mindarThree.scene;
        camera = mindarThree.camera;
        renderer.setClearColor(0x000000, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 1.0));
        const dl = new THREE.DirectionalLight(0xffffff, 1.5);
        dl.position.set(0, 5, 5);
        scene.add(dl);

        const anchor = mindarThree.addAnchor(0);

        // Ghosting: track visibility
        let isTracking = false;
        let ghostOpacity = 1;
        let ghostFading = false;

        anchor.onTargetFound = () => {
            isTracking = true;
            ghostFading = false;
            ghostOpacity = 1;
            setGroupOpacity(anchor.group, 1);
            anchor.group.visible = true;
            smoothInitialized = false; // Reset smoothing on re-acquire
        };

        anchor.onTargetLost = () => {
            isTracking = false;
            ghostFading = true;
        };

        const page = pages[0];
        if (page) {
            const loader = new THREE.GLTFLoader();
            loader.load(page.model.src, (gltf) => {
                const model = gltf.scene;
                currentModel = model;

                // Apply transform from pages.json
                const s = page.model.scale || 0.355;
                model.scale.set(s, s, s);
                model.position.set(
                    page.model.offsetX || 0,
                    page.model.offsetY || 0,
                    page.model.offsetZ || 0
                );
                model.rotation.set(
                    (page.model.rotationX || 0) * Math.PI / 180,
                    (page.model.rotationY || 0) * Math.PI / 180,
                    (page.model.rotationZ || 0) * Math.PI / 180
                );

                model.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                anchor.group.add(model);
                console.log('Model added at scale', s);

                if (gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    mixer.clipAction(gltf.animations[0]).play();
                    mixers.push(mixer);
                }
            }, undefined, (err) => console.error('GLB ERROR:', err));
        }

        loadingScreen.classList.add('hidden');
        startBtn.classList.remove('hidden');

        // Animation loop
        startBtn.addEventListener('click', async () => {
            startBtn.classList.add('hidden');
            await mindarThree.start();

            renderer.setAnimationLoop(() => {
                const dt = 0.016;
                mixers.forEach(m => m.update(dt));

                // --- POSE SMOOTHING ---
                // Read anchor's current world position, smooth it, write it back
                if (anchor.group.visible) {
                    anchor.group.updateMatrixWorld(true);

                    const rawPos = new THREE.Vector3();
                    const rawQuat = new THREE.Quaternion();
                    const rawScale = new THREE.Vector3();
                    anchor.group.matrixWorld.decompose(rawPos, rawQuat, rawScale);

                    const alpha = parseFloat(sliders.lerp.value) || LERP_ALPHA;

                    if (!smoothInitialized) {
                        smoothedPos.copy(rawPos);
                        smoothedQuat.copy(rawQuat);
                        smoothInitialized = true;
                    } else {
                        smoothedPos.lerp(rawPos, alpha);
                        smoothedQuat.slerp(rawQuat, alpha);
                    }

                    // Write smoothed values back
                    anchor.group.position.copy(smoothedPos);
                    anchor.group.quaternion.copy(smoothedQuat);
                }

                // --- GHOSTING ---
                if (ghostFading) {
                    ghostOpacity -= dt * 0.5; // 2-second fade
                    if (ghostOpacity <= 0) {
                        ghostOpacity = 0;
                        ghostFading = false;
                        anchor.group.visible = false;
                    }
                    setGroupOpacity(anchor.group, Math.max(0, ghostOpacity));
                }

                renderer.render(scene, camera);
            });

            console.log('AR STARTED');
        });
    }

    function setGroupOpacity(group, opacity) {
        group.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => {
                    m.transparent = opacity < 1;
                    m.opacity = opacity;
                });
            }
        });
    }

    init();
})();
