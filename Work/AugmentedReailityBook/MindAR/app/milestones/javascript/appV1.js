import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

(function () {
    'use strict';
    const THREE = window.THREE || (window.MINDAR && window.MINDAR.IMAGE ? window.MINDAR.IMAGE.THREE : null);

    const arContainer = document.getElementById('ar-container');
    const loadingScreen = document.getElementById('loading-screen');
    const startBtn = document.getElementById('start-ar-btn');
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('.status-dot');
    const devConsole = document.getElementById('dev-console');
    const devToggle = document.getElementById('dev-toggle');

    let mindarThree, renderer, scene, camera;
    let lightEstimator;
    const clock = new THREE.Clock();

    // Global Components
    let globalLight, globalHelper, globalLightRoot;

    // State
    const pageStates = new Map();
    let pages = [];
    let activePageIndex = 0;

    const ghoster = new window.GhostingSystem({ fadeDuration: 1.5, fadeInDuration: 0.5 });

    // UI
    const sl = {
        s: null, px: null, py: null, pz: null, rx: null, ry: null, rz: null,
        lerp: null, hold: null, fade: null, sel: null,
        anim: null,
        lint: null, lbias: null, lnear: null, lfar: null,
        lmanual: null, lmx: null, lmy: null, lso: null,
        lshowh: null, lshowf: null
    };
    let devOpen = false;

    // --- Helpers ---
    function getVal(id, def) {
        if (sl[id]) return parseFloat(sl[id].value) || def;
        return def;
    }

    function applyConfig(model, config) {
        if (!model) return;
        const s = Math.max(0.001, config.scale || 0.355);
        model.scale.set(s, s, s);
        model.position.set(config.offsetX || 0, config.offsetY || 0, config.offsetZ || 0);
        model.rotation.set(
            THREE.Math.degToRad(config.rotationX || 0),
            THREE.Math.degToRad(config.rotationY || 0),
            THREE.Math.degToRad(config.rotationZ || 0)
        );
    }

    function addDebugBox(group) {
        const g = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const m = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: true });
        const mesh = new THREE.Mesh(g, m);
        group.add(mesh);
        return mesh;
    }

    function createShadowPlane() {
        const g = new THREE.PlaneGeometry(2, 2);
        const m = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.2, transparent: true });
        const plane = new THREE.Mesh(g, m);
        plane.name = 'FloorBase';
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.02;
        plane.receiveShadow = true;

        const m2 = new THREE.ShadowMaterial({ opacity: 0.7 });
        const catcher = new THREE.Mesh(g, m2);
        catcher.name = 'Catcher';
        catcher.rotation.x = -Math.PI / 2;
        catcher.position.y = -0.01;
        catcher.receiveShadow = true;

        const group = new THREE.Group();
        group.add(plane);
        group.add(catcher);
        return group;
    }

    function buildDev() {
        if (!devConsole) return;
        devConsole.style.overflowY = 'auto';
        devConsole.style.maxHeight = '80vh';

        devConsole.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(110,231,183,0.1);padding-bottom:12px;margin-bottom:12px;">
                <span style="color:#6ee7b7;font-size:10px;font-weight:800;letter-spacing:0.1em;">TRANSFORM TUNER</span>
                <select id="dsel" style="background:#000;color:#6ee7b7;border:1px solid #333;font-size:10px;padding:2px 6px;"></select>
            </div>
            
            <div style="margin-bottom:12px; display:flex; gap:10px; align-items:center;">
                <select id="danim" style="flex:1; background:#111; color:#fff; border:1px solid #333; font-size:10px; padding:4px; height:24px;"></select>
            </div>

            <div class="ctrl"><label>Scale</label><input type="range" id="ds" min="-3" max="1" step="0.01"><span class="v" id="dsv"></span></div>
            <div class="ctrl"><label>Pos X</label><input type="range" id="dpx" min="-1" max="1" step="0.01"><span class="v" id="dpxv"></span></div>
            <div class="ctrl"><label>Pos Y</label><input type="range" id="dpy" min="-1" max="1" step="0.01"><span class="v" id="dpyv"></span></div>
            <div class="ctrl"><label>Pos Z</label><input type="range" id="dpz" min="-1" max="1" step="0.01"><span class="v" id="dpzv"></span></div>
            <div class="ctrl"><label>Rot X</label><input type="range" id="drx" min="-180" max="180" step="1"><span class="v" id="drxv"></span></div>
            <div class="ctrl"><label>Rot Y</label><input type="range" id="dry" min="-180" max="180" step="1"><span class="v" id="dryv"></span></div>
            <div class="ctrl"><label>Rot Z</label><input type="range" id="drz" min="-180" max="180" step="1"><span class="v" id="drzv"></span></div>
            <div style="margin-top:8px; display:flex; gap:10px;">
                <div class="ctrl" style="flex:1;"><label>Hold</label><input type="range" id="dghold" min="0" max="5" step="0.1" value="1.5"></div>
                <div class="ctrl" style="flex:1;"><label>Fade</label><input type="range" id="dgfade" min="0.5" max="5" step="0.1" value="1.5"></div>
            </div>
            <div class="ctrl" style="margin-top:8px;"><label>Lerp</label><input type="range" id="dlerp" min="0.01" max="1" step="0.01" value="0.1"></div>

            <!-- SHADOW TUNER SECTION (Clean) -->
            <div style="margin-top:20px; border-top: 1px solid #333; padding-top: 10px;">
                <div style="color:#6ee7b7;font-size:10px;font-weight:800;letter-spacing:0.1em;margin-bottom:8px;">SHADOW TUNER</div>
                
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="checkbox" id="dlshowh" checked> <label for="dlshowh" style="font-size:10px;">HELPERS</label>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="checkbox" id="dlshowf" checked> <label for="dlshowf" style="font-size:10px;">FLOOR</label>
                    </div>
                </div>

                <div class="ctrl"><label>Intensity</label><input type="range" id="dlint" min="0" max="8" step="0.1" value="4.0"></div>
                <div class="ctrl"><label>Bias</label><input type="range" id="dlbias" min="-0.005" max="0.005" step="0.0001" value="-0.0001"></div>
                <div class="ctrl"><label>Near</label><input type="range" id="dlnear" min="0.1" max="5" step="0.1" value="0.1"></div>
                <div class="ctrl"><label>Shadow Y</label><input type="range" id="dlso" min="-0.2" max="0.2" step="0.001" value="-0.01"></div>
                
                <div style="margin-top:10px; display:flex; gap:6px; align-items:center; background:#111; padding:4px; border:1px solid #333;">
                    <input type="checkbox" id="dlmanual"> <label for="dlmanual" style="font-size:10px; font-weight:bold;">MANUAL LIGHT</label>
                </div>
                <div class="ctrl"><label>Light X</label><input type="range" id="dlmx" min="-10" max="10" step="0.1" value="0"></div>
                <div class="ctrl"><label>Light Y</label><input type="range" id="dlmy" min="-10" max="10" step="0.1" value="5"></div>
            </div>

            <button id="dcopy" style="margin-top:12px; width:100%; height:34px; background:var(--accent); color:#000; border:none; border-radius:8px; font-weight:800; cursor:pointer; font-size:10px;">📋 COPY CONFIG</button>
        `;

        sl.sel = document.getElementById('dsel');
        sl.anim = document.getElementById('danim');

        sl.lint = document.getElementById('dlint');
        sl.lbias = document.getElementById('dlbias');
        sl.lnear = document.getElementById('dlnear');
        sl.lso = document.getElementById('dlso');
        sl.lmanual = document.getElementById('dlmanual');
        sl.lmx = document.getElementById('dlmx');
        sl.lmy = document.getElementById('dlmy');
        sl.lshowh = document.getElementById('dlshowh');
        sl.lshowf = document.getElementById('dlshowf');

        const ids = ['ds', 'dpx', 'dpy', 'dpz', 'drx', 'dry', 'drz', 'dghold', 'dgfade', 'dlerp'];
        ids.forEach(id => sl[id.replace('d', '').replace('g', '')] = document.getElementById(id));

        if (sl.sel) {
            pages.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.label; sl.sel.appendChild(o); });
            sl.sel.onchange = () => { activePageIndex = parseInt(sl.sel.value); loadCfg(); };
        }

        if (sl.anim) {
            sl.anim.onchange = () => {
                const st = pageStates.get(activePageIndex);
                if (!st || !st.mixer || !st.animations) return;
                const clip = st.animations[parseInt(sl.anim.value)];
                if (clip) { st.mixer.stopAllAction(); st.mixer.clipAction(clip).play(); st.activeClipIndex = parseInt(sl.anim.value); }
            };
        }

        const sync = () => { if (sl.s && sl.s.value) writeCfg(); };
        [sl.s, sl.px, sl.py, sl.pz, sl.rx, sl.ry, sl.rz, sl.lerp].forEach(e => e && (e.oninput = sync));

        const copyBtn = document.getElementById('dcopy');
        if (copyBtn) {
            copyBtn.onclick = () => { const st = pageStates.get(activePageIndex); if (st) navigator.clipboard.writeText(JSON.stringify(st.config, null, 2)).then(() => alert('Copied!')); };
        }

        if (devToggle) devToggle.onclick = () => { devOpen = !devOpen; devConsole.classList.toggle('open', devOpen); };
    }

    function loadCfg() {
        const st = pageStates.get(activePageIndex);
        if (!st || !sl.s) return;
        const c = st.config;
        sl.s.value = Math.log10(c.scale || 0.355).toFixed(2);
        sl.px.value = c.offsetX; sl.py.value = c.offsetY; sl.pz.value = c.offsetZ;
        sl.rx.value = c.rotationX; sl.ry.value = c.rotationY; sl.rz.value = c.rotationZ;
        showVals();

        if (sl.anim) {
            sl.anim.innerHTML = '';
            if (st.animations && st.animations.length > 0) {
                st.animations.forEach((clip, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = clip.name; sl.anim.appendChild(opt); });
                sl.anim.value = st.activeClipIndex || 0;
            } else { sl.anim.innerHTML = '<option>No Animations</option>'; }
        }
    }

    function writeCfg() {
        const st = pageStates.get(activePageIndex);
        if (!st || !sl.s) return;
        st.config.scale = Math.pow(10, parseFloat(sl.s.value));
        st.config.offsetX = parseFloat(sl.px.value); st.config.offsetY = parseFloat(sl.py.value); st.config.offsetZ = parseFloat(sl.pz.value);
        st.config.rotationX = parseInt(sl.rx.value); st.config.rotationY = parseInt(sl.ry.value); st.config.rotationZ = parseInt(sl.rz.value);
        applyConfig(st.model, st.config);
        showVals();
    }

    function showVals() {
        const st = pageStates.get(activePageIndex);
        if (!st) return;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('dsv', st.config.scale.toFixed(3));
    }

    function setModelOpacity(model, opacity) {
        if (!model) return;
        const isTransparent = opacity < 0.99;
        model.traverse(c => {
            if (c.isMesh) {
                if (!c.castShadow) { c.castShadow = true; c.receiveShadow = true; }
                if (c.material) {
                    const mats = Array.isArray(c.material) ? c.material : [c.material];
                    mats.forEach(m => {
                        m.transparent = isTransparent;
                        m.opacity = opacity;
                        m.depthWrite = !isTransparent;
                        m.depthTest = true;
                        m.side = THREE.FrontSide;
                    });
                }
            }
        });
    }

    async function init() {
        const res = await fetch('pages.json');
        const data = await res.json();
        pages = data.pages || [];
        buildDev();

        mindarThree = new window.MINDAR.IMAGE.MindARThree({
            container: arContainer,
            imageTargetSrc: data.meta?.trackingDescriptor || 'targets/book_targets.mind',
            maxTrack: 1, filterMinCF: 0.0001, filterBeta: 0.1,
            uiLoading: 'no', uiScanning: 'no'
        });

        renderer = mindarThree.renderer;
        scene = mindarThree.scene;
        camera = mindarThree.camera;
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Global Ambient
        const amb = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(amb);

        // --- GLOBAL DECOUPLED LIGHTING (Unlinked from Models) ---
        globalLightRoot = new THREE.Group();
        scene.add(globalLightRoot);

        globalLight = new THREE.DirectionalLight(0xffffff, 4.0);
        globalLight.castShadow = true;
        globalLight.shadow.mapSize.width = 1024; globalLight.shadow.mapSize.height = 1024;
        globalLight.shadow.bias = -0.0001;
        globalLight.shadow.normalBias = 0.05;

        const d = 2;
        globalLight.shadow.camera.left = -d; globalLight.shadow.camera.right = d;
        globalLight.shadow.camera.top = d; globalLight.shadow.camera.bottom = -d;
        globalLight.shadow.camera.near = 0.1; globalLight.shadow.camera.far = 20;

        globalLightRoot.add(globalLight);
        globalLightRoot.add(globalLight.target);

        globalHelper = new THREE.CameraHelper(globalLight.shadow.camera);
        scene.add(globalHelper);

        pages.forEach((p, i) => {
            const anchor = mindarThree.addAnchor(i);
            scene.add(anchor.group);
            const debugMesh = addDebugBox(anchor.group);

            const follower = new THREE.Group();
            scene.add(follower);

            // Shadow Plane (Stays on follower)
            const shadowPlaneGroup = createShadowPlane();
            follower.add(shadowPlaneGroup);

            const state = {
                anchor, follower, debugCube: debugMesh,
                model: null, mixer: null, animations: [], activeClipIndex: 0,
                isTracking: false, isGhosting: false, lostTime: 0,
                smoother: new window.PoseSmoothing({ lerpAlpha: 0.1 }),
                visiblePos: new THREE.Vector3(), visibleQuat: new THREE.Quaternion(), visibleScale: new THREE.Vector3(1, 1, 1),
                config: {
                    scale: p.model.scale || 0.355,
                    offsetX: p.model.offsetX || 0, offsetY: p.model.offsetY || 0, offsetZ: p.model.offsetZ || 0,
                    rotationX: p.model.rotationX || 0, rotationY: p.model.rotationY || 0, rotationZ: p.model.rotationZ || 0
                }
            };
            pageStates.set(i, state);

            anchor.onTargetFound = () => {
                state.isTracking = true;
                ghoster.onTrackingFound(p.id, state.follower);

                if (statusText) statusText.textContent = 'TRACKING: ' + p.label;
                if (statusDot) { statusDot.classList.remove('lost'); statusDot.classList.add('active'); }
                if (sl.sel) { sl.sel.value = i; activePageIndex = i; loadCfg(); }
            };

            anchor.onTargetLost = () => {
                state.isTracking = false;
                ghoster.onTrackingLost(p.id, state.follower);

                if (statusText) statusText.textContent = 'SCANNING...';
                if (statusDot) { statusDot.classList.remove('active'); statusDot.classList.add('lost'); }
            };

            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            const loader = new THREE.GLTFLoader();
            loader.setDRACOLoader(dracoLoader);
            loader.load(p.model.src, (gltf) => {
                state.model = gltf.scene;
                state.animations = gltf.animations || [];
                follower.add(state.model);
                applyConfig(state.model, state.config);
                setModelOpacity(state.model, 1);

                if (state.animations.length > 0) {
                    state.mixer = new THREE.AnimationMixer(state.model);
                    const clip = state.animations[0];
                    state.mixer.clipAction(clip).play();
                }
                if (activePageIndex === i) loadCfg();
            });
        });

        loadingScreen.classList.add('hidden');
        startBtn.classList.remove('hidden');
    }

    startBtn.onclick = async () => {
        startBtn.classList.add('hidden');
        await mindarThree.start();
        console.log("APP: STARTING LIGHT ESTIMATOR...");
        if (window.LightEstimator) {
            lightEstimator = new window.LightEstimator(renderer, scene);
        } else { console.error("APP: LightEstimator class not found!"); }

        renderer.setAnimationLoop(() => {
            const dt = clock.getDelta();
            if (lightEstimator) lightEstimator.update();
            const uiSO = parseFloat(sl.lso?.value || -0.01);
            const uiShowH = sl.lshowh ? sl.lshowh.checked : true;
            const uiShowF = sl.lshowf ? sl.lshowf.checked : true;

            // --- Update Global Lighting ---
            if (globalLight) {
                const uiInt = parseFloat(sl.lint?.value || 4.0);
                const uiBias = parseFloat(sl.lbias?.value || -0.0001);
                const uiNear = parseFloat(sl.lnear?.value || 0.1);
                const uiManual = sl.lmanual?.checked || false;
                const uiMX = parseFloat(sl.lmx?.value || 0);
                const uiMY = parseFloat(sl.lmy?.value || 5);

                let intensity = uiInt;
                if (lightEstimator && !uiManual) intensity = (lightEstimator.currentIntensity / 2.0) * uiInt;

                globalLight.intensity = intensity;
                globalLight.shadow.bias = uiBias;
                globalLight.shadow.camera.near = uiNear;
                globalLight.shadow.camera.updateProjectionMatrix();

                if (uiManual) {
                    globalLight.position.set(uiMX, uiMY, 6);
                } else if (lightEstimator) {
                    globalLight.position.copy(lightEstimator.currentOffset);
                }
                globalLight.target.position.set(0, 0, 0);
                if (globalHelper) {
                    globalHelper.visible = uiShowH;
                    globalHelper.update();
                }
            }

            pageStates.forEach(state => {
                if (state.mixer) state.mixer.update(dt);
                const holdTime = getVal('hold', 1.5);
                const fadeTime = getVal('fade', 1.5);
                const lerpAlpha = getVal('lerp', 0.1);
                const model = state.model;
                if (!model) return;

                // Visibility Logic
                if (state.isTracking && state.debugCube) state.debugCube.visible = uiShowH;

                state.follower.traverse(c => {
                    if (c.name === 'FloorBase') c.visible = uiShowF;
                    if (c.name === 'Catcher') c.position.y = uiSO;
                });

                if (state.isTracking) {
                    state.anchor.group.updateMatrixWorld(true);
                    const rawP = new THREE.Vector3(); const rawQ = new THREE.Quaternion(); const rawS = new THREE.Vector3();
                    state.anchor.group.matrixWorld.decompose(rawP, rawQ, rawS);

                    // Apply Smoothing
                    state.smoother.update(rawP, rawQ, state.follower);

                    // --- SHREK SCALE FIX (Baseline Sync) ---
                    state.visibleScale.lerp(rawS, lerpAlpha);
                    state.follower.scale.copy(state.visibleScale);
                }
            });
            renderer.render(scene, camera);
        });
    };
    init();
})();
