/**
 * app.js — Architecture v31 (Defensive + Follower)
 * - Fixed: crash on 'setting onchange of null'
 * - Preserved: Animation Selector + Debug Toggle
 */
(function () {
    'use strict';
    const THREE = window.THREE;

    const arContainer = document.getElementById('ar-container');
    const loadingScreen = document.getElementById('loading-screen');
    const startBtn = document.getElementById('start-ar-btn');
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('.status-dot');
    const devConsole = document.getElementById('dev-console');
    const devToggle = document.getElementById('dev-toggle');

    let mindarThree, renderer, scene, camera;
    const clock = new THREE.Clock();

    // State
    const pageStates = new Map();
    let pages = [];
    let activePageIndex = 0;

    // UI
    const sl = {
        s: null, px: null, py: null, pz: null, rx: null, ry: null, rz: null,
        lerp: null, hold: null, fade: null, sel: null,
        anim: null, debug: null
    };
    let devOpen = false;

    // --- Helpers ---
    function getVal(id, def) { const el = sl[id]; return el ? (parseFloat(el.value) || def) : def; }

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

    // --- UI Init ---
    function buildDev() {
        if (!devConsole) return;
        devConsole.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(110,231,183,0.1);padding-bottom:12px;margin-bottom:12px;">
                <span style="color:#6ee7b7;font-size:10px;font-weight:800;letter-spacing:0.1em;">TRANSFORM TUNER</span>
                <select id="dsel" style="background:#000;color:#6ee7b7;border:1px solid #333;font-size:10px;padding:2px 6px;"></select>
            </div>
            
            <div style="margin-bottom:12px; display:flex; gap:10px; align-items:center;">
                <select id="danim" style="flex:1; background:#111; color:#fff; border:1px solid #333; font-size:10px; padding:4px; height:24px;"></select>
                <div style="display:flex; align-items:center; gap:6px; background:rgba(255,0,0,0.1); padding:2px 6px; border-radius:4px; border:1px solid rgba(255,0,0,0.3);">
                    <input type="checkbox" id="ddebug" checked style="accent-color:red;">
                    <label for="ddebug" style="font-size:10px; color:#ff9999; font-weight:700; cursor:pointer;">DEBUG</label>
                </div>
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
            <button id="dcopy" style="margin-top:12px; width:100%; height:34px; background:var(--accent); color:#000; border:none; border-radius:8px; font-weight:800; cursor:pointer; font-size:10px;">📋 COPY CONFIG</button>
        `;

        // Manual Bind to ensure no 'null' errors
        sl.sel = document.getElementById('dsel');
        sl.anim = document.getElementById('danim');
        sl.debug = document.getElementById('ddebug');

        const ids = ['ds', 'dpx', 'dpy', 'dpz', 'drx', 'dry', 'drz', 'dghold', 'dgfade', 'dlerp'];
        ids.forEach(id => sl[id.replace('d', '').replace('g', '')] = document.getElementById(id));

        // Populate Page Select
        if (sl.sel) {
            pages.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.label; sl.sel.appendChild(o); });
            sl.sel.onchange = () => { activePageIndex = parseInt(sl.sel.value); loadCfg(); };
        }

        // Animation Change
        if (sl.anim) {
            sl.anim.onchange = () => {
                const st = pageStates.get(activePageIndex);
                if (!st || !st.mixer || !st.animations) return;
                const clip = st.animations[parseInt(sl.anim.value)];
                if (clip) {
                    st.mixer.stopAllAction();
                    const action = st.mixer.clipAction(clip);
                    action.play();
                    st.activeClipIndex = parseInt(sl.anim.value);
                }
            };
        }

        // Debug Toggle
        if (sl.debug) {
            sl.debug.onchange = () => {
                const vis = sl.debug.checked;
                pageStates.forEach(st => { if (st.debugCube) st.debugCube.visible = vis; });
            };
        }

        // Transform Sync
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

        // Refresh Animation List
        if (sl.anim) {
            sl.anim.innerHTML = '';
            if (st.animations && st.animations.length > 0) {
                st.animations.forEach((clip, i) => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = clip.name;
                    sl.anim.appendChild(opt);
                });
                sl.anim.value = st.activeClipIndex || 0;
            } else {
                sl.anim.innerHTML = '<option>No Animations</option>';
            }
        }
    }

    function writeCfg() {
        const st = pageStates.get(activePageIndex);
        if (!st || !sl.s) return;
        st.config.scale = Math.pow(10, parseFloat(sl.s.value));
        st.config.offsetX = parseFloat(sl.px.value); st.config.offsetY = parseFloat(sl.py.value); st.config.offsetZ = parseFloat(sl.pz.value);
        st.config.rotationX = parseInt(sl.rx.value); st.config.rotationY = parseInt(sl.ry.value); st.config.rotationZ = parseInt(sl.rz.value);
        applyConfig(st.model, st.config);
        if (st.smoother) st.smoother.lerpAlpha = getVal('lerp', 0.1);
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
            if (c.isMesh && c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(m => {
                    m.transparent = isTransparent;
                    m.opacity = opacity;
                    m.depthWrite = !isTransparent;
                    m.depthTest = true;
                    m.side = THREE.FrontSide;
                });
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

        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const dl = new THREE.DirectionalLight(0xffffff, 1.5);
        dl.position.set(1, 5, 3); scene.add(dl);

        pages.forEach((p, i) => {
            const anchor = mindarThree.addAnchor(i);
            scene.add(anchor.group);
            const debugMesh = addDebugBox(anchor.group);

            const follower = new THREE.Group();
            scene.add(follower);

            const state = {
                anchor, follower, debugCube: debugMesh,
                model: null, mixer: null, animations: [], activeClipIndex: 0,

                isTracking: false, isGhosting: false, lostTime: 0,

                visiblePos: new THREE.Vector3(),
                visibleQuat: new THREE.Quaternion(),
                visibleScale: new THREE.Vector3(1, 1, 1),

                config: {
                    scale: p.model.scale || 0.355,
                    offsetX: p.model.offsetX || 0, offsetY: p.model.offsetY || 0, offsetZ: p.model.offsetZ || 0,
                    rotationX: p.model.rotationX || 0, rotationY: p.model.rotationY || 0, rotationZ: p.model.rotationZ || 0
                }
            };
            pageStates.set(i, state);

            anchor.onTargetFound = () => {
                const wasGhosting = state.isGhosting;
                state.isTracking = true; state.isGhosting = false; state.lostTime = 0;

                if (state.debugCube) state.debugCube.visible = sl.debug ? sl.debug.checked : true;

                if (!wasGhosting) {
                    anchor.group.updateMatrixWorld(true);
                    anchor.group.matrixWorld.decompose(state.visiblePos, state.visibleQuat, state.visibleScale);
                    state.follower.position.copy(state.visiblePos);
                    state.follower.quaternion.copy(state.visibleQuat);
                    state.follower.scale.copy(state.visibleScale);
                }

                if (statusText) statusText.textContent = 'TRACKING: ' + p.label;
                if (statusDot) { statusDot.classList.remove('lost'); statusDot.classList.add('active'); }
                if (sl.sel) { sl.sel.value = i; activePageIndex = i; loadCfg(); }
            };

            anchor.onTargetLost = () => {
                state.isTracking = false; state.isGhosting = true; state.lostTime = 0;
                if (state.debugCube) state.debugCube.visible = false;
                if (statusText) statusText.textContent = 'SCANNING...';
                if (statusDot) { statusDot.classList.remove('active'); statusDot.classList.add('lost'); }
            };

            const loader = new THREE.GLTFLoader();
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
        renderer.setAnimationLoop(() => {
            const dt = clock.getDelta();

            pageStates.forEach(state => {
                if (state.mixer) state.mixer.update(dt);
                const holdTime = getVal('hold', 1.5);
                const fadeTime = getVal('fade', 1.5);
                const lerpAlpha = getVal('lerp', 0.1);
                const model = state.model;
                if (!model) return;

                if (state.isTracking) {
                    state.anchor.group.updateMatrixWorld(true);
                    const rawP = new THREE.Vector3(); const rawQ = new THREE.Quaternion(); const rawS = new THREE.Vector3();
                    state.anchor.group.matrixWorld.decompose(rawP, rawQ, rawS);

                    state.visiblePos.lerp(rawP, lerpAlpha);
                    state.visibleQuat.slerp(rawQ, lerpAlpha);
                    state.visibleScale.lerp(rawS, lerpAlpha);

                    state.follower.position.copy(state.visiblePos);
                    state.follower.quaternion.copy(state.visibleQuat);
                    state.follower.scale.copy(state.visibleScale);

                    state.follower.visible = true;
                    setModelOpacity(model, 1);
                }
                else if (state.isGhosting) {
                    state.lostTime += dt;
                    state.follower.visible = true;
                    if (state.lostTime > holdTime) {
                        const op = Math.max(0, 1 - (state.lostTime - holdTime) / fadeTime);
                        setModelOpacity(model, op);
                        if (op <= 0) state.follower.visible = false;
                    } else { setModelOpacity(model, 1); }
                }
            });
            renderer.render(scene, camera);
        });
    };
    init();
})();
