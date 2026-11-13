import * as THREE from 'three';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { PARTS_CATALOG, getPartPreset } from './parts-catalog.js';
import {
    state, createBinFromPreset, getSelectedBin,
    serializeLayout, deserializeLayout
} from './state.js';
import { placeNewBin, compactCluster, previewDragSnap, getTrayBounds } from './packer.js';
import {
    initViewport, rebuildTrayGeometry, buildExportManifold,
    buildExportLidManifold, buildExportDiffusersManifold, refreshLidPreview,
    getHitMeshes, setHoveredBin, showDragSnapGhost, hideDragSnapGhost,
    spawnDeleteShatter
} from './geometry.js';
import { sound } from './juice.js';

const partsListEl = document.getElementById('parts-list');
const searchEl = document.getElementById('part-search');
const emptyStateEl = document.getElementById('empty-state');
const ctxMenuEl = document.getElementById('context-menu');
const inspectorEl = document.getElementById('bin-inspector');
const tooltipEl = document.getElementById('hover-tooltip');
const toastEl = document.getElementById('toast');

let viewportCtx = null;
let ctxTargetId = null;
let dragState = null;

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

function renderPartsList(filter = '') {
    const q = filter.trim().toLowerCase();
    partsListEl.innerHTML = '';
    const items = PARTS_CATALOG.filter(p => {
        const folderStr = (p.folder || []).join(' ').toLowerCase();
        return !q || p.name.toLowerCase().includes(q) || folderStr.includes(q) || p.summary.toLowerCase().includes(q);
    });

    // Build hierarchical folder tree
    const root = { children: new Map(), items: [] };
    for (const part of items) {
        let node = root;
        for (const seg of (part.folder || ['Other'])) {
            if (!node.children.has(seg)) node.children.set(seg, { children: new Map(), items: [] });
            node = node.children.get(seg);
        }
        node.items.push(part);
    }

    const renderNode = (node, container, depth = 0) => {
        for (const [folderName, child] of node.children.entries()) {
            const details = document.createElement('details');
            details.className = `folder-group depth-${depth}`;
            details.open = true;

            const count = countParts(child);
            const summary = document.createElement('summary');
            summary.className = 'folder-header';
            summary.innerHTML = `<span class="folder-icon">📁</span><span class="folder-title">${folderName}</span><span class="folder-count">${count}</span>`;
            details.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'folder-body';
            renderNode(child, body, depth + 1);
            details.appendChild(body);
            container.appendChild(details);
        }

        for (const part of node.items) {
            const card = document.createElement('div');
            card.className = 'part-card';
            card.style.setProperty('--part-color', part.color);
            card.innerHTML = `
                <div class="part-top">
                    <span class="part-name">${part.name}</span>
                    <span class="part-dims">${part.w}×${part.d}mm</span>
                </div>
                <div class="part-meta">${part.summary}</div>
            `;
            card.addEventListener('click', () => addPartToTray(part.id));
            container.appendChild(card);
        }
    };

    const countParts = (n) => {
        let c = n.items.length;
        for (const ch of n.children.values()) c += countParts(ch);
        return c;
    };

    renderNode(root, partsListEl);
}

async function refreshScene() {
    emptyStateEl.classList.toggle('hidden', state.bins.length > 0);
    document.getElementById('stat-count').textContent = state.bins.length;
    const b = getTrayBounds();
    document.getElementById('stat-dims').textContent = `${b.w} × ${b.d} × ${b.h} mm`;
    await rebuildTrayGeometry();
    syncInspector();
}

async function addPartToTray(partId) {
    const bin = createBinFromPreset(partId);
    state.bins.push(bin);
    placeNewBin(bin);
    state.selectedId = bin.id;
    sound.playPop(460);
    await refreshScene();
}

async function rotateBin(binId) {
    const bin = state.bins.find(b => b.id === binId);
    if (!bin) return;
    bin.rot = (bin.rot + 90) % 360;
    compactCluster(bin.id);
    sound.playClick(640);
    await refreshScene();
}

async function removeBins(binIds) {
    if (!binIds.length) return;
    const idSet = new Set(binIds);
    for (const b of state.bins) {
        if (idSet.has(b.id)) spawnDeleteShatter(b);
    }
    state.bins = state.bins.filter(b => !idSet.has(b.id));
    if (state.selectedId && idSet.has(state.selectedId)) {
        state.selectedId = state.bins[0]?.id || null;
        inspectorEl.classList.add('hidden');
    }
    compactCluster();
    sound.playDelete();
    await refreshScene();
}

async function deleteBin(binId) {
    await removeBins([binId]);
}

async function duplicateBin(binId) {
    const src = state.bins.find(b => b.id === binId);
    if (!src) return;
    const copy = createBinFromPreset(src.partId);
    Object.assign(copy, {
        w: src.w, d: src.d, wallHeight: src.wallHeight,
        tolerance: src.tolerance, cradle: src.cradle, rot: src.rot,
        fanOrientation: src.fanOrientation, screwSize: src.screwSize,
        strainRelief: src.strainRelief,
        activeCutouts: { ...src.activeCutouts }
    });
    state.bins.push(copy);
    placeNewBin(copy);
    state.selectedId = copy.id;
    sound.playPop(520);
    await refreshScene();
}

function syncInspector() {
    if (inspectorEl.classList.contains('hidden')) return;
    const bin = getSelectedBin();
    if (!bin) {
        inspectorEl.classList.add('hidden');
        return;
    }
    const preset = getPartPreset(bin.partId);
    document.getElementById('insp-title').textContent = `${bin.name} Settings`;
    document.getElementById('insp-w').value = bin.w;
    document.getElementById('insp-d').value = bin.d;
    document.getElementById('insp-h').value = bin.wallHeight;
    document.getElementById('insp-tol').value = bin.tolerance;
    document.getElementById('insp-cradle').checked = bin.cradle;
    document.getElementById('insp-strain').checked = Boolean(bin.strainRelief);

    document.getElementById('insp-cradle-row').classList.toggle('hidden', !(preset.cradle || preset.id === 'custom_bin'));
    document.getElementById('insp-strain-row').classList.toggle('hidden', !(preset.allowStrainRelief || preset.id === 'custom_bin'));

    const fanRow = document.getElementById('insp-fan-row');
    fanRow.classList.toggle('hidden', !preset.isFan);
    if (preset.isFan) {
        document.getElementById('insp-fan-orient').value = bin.fanOrientation || 'horizontal';
        document.getElementById('insp-fan-screw').value = bin.screwSize || 'M3';
    }

    document.querySelectorAll('#insp-cutouts input').forEach(cb => {
        cb.checked = Boolean(bin.activeCutouts[cb.dataset.side]);
    });
}

function bindInspector() {
    document.getElementById('btn-close-inspector').addEventListener('click', () => {
        inspectorEl.classList.add('hidden');
    });

    const onDimChange = async () => {
        const bin = getSelectedBin();
        if (!bin) return;
        bin.w = Math.max(5, parseFloat(document.getElementById('insp-w').value) || bin.w);
        bin.d = Math.max(5, parseFloat(document.getElementById('insp-d').value) || bin.d);
        bin.wallHeight = Math.max(2, parseFloat(document.getElementById('insp-h').value) || bin.wallHeight);
        bin.tolerance = Math.max(0, parseFloat(document.getElementById('insp-tol').value) || 0);
        bin.cradle = document.getElementById('insp-cradle').checked;
        bin.strainRelief = document.getElementById('insp-strain').checked;
        bin.fanOrientation = document.getElementById('insp-fan-orient').value;
        bin.screwSize = document.getElementById('insp-fan-screw').value;
        compactCluster(bin.id);
        await refreshScene();
    };

    [
        'insp-w', 'insp-d', 'insp-h', 'insp-tol',
        'insp-cradle', 'insp-strain', 'insp-fan-orient', 'insp-fan-screw'
    ].forEach(id => {
        document.getElementById(id).addEventListener('change', onDimChange);
    });

    document.querySelectorAll('#insp-cutouts input').forEach(cb => {
        cb.addEventListener('change', async () => {
            const bin = getSelectedBin();
            if (!bin) return;
            bin.activeCutouts[cb.dataset.side] = cb.checked;
            await refreshScene();
        });
    });

    document.getElementById('btn-insp-reset').addEventListener('click', async () => {
        const bin = getSelectedBin();
        if (!bin) return;
        const p = getPartPreset(bin.partId);
        bin.w = p.w;
        bin.d = p.d;
        bin.wallHeight = p.wallHeight ?? state.global.defaultWallHeight;
        bin.tolerance = state.global.tolerance;
        bin.cradle = Boolean(p.cradle);
        bin.activeCutouts = {
            N: Boolean(p.cutouts?.N), S: Boolean(p.cutouts?.S),
            E: Boolean(p.cutouts?.E), W: Boolean(p.cutouts?.W)
        };
        compactCluster(bin.id);
        await refreshScene();
    });
}

function bindViewportInteractions() {
    const { renderer, camera, controls } = viewportCtx;
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();

    const setPointer = (e) => {
        const rect = dom.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickBin = (e) => {
        setPointer(e);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(getHitMeshes(), false);
        return hits.length > 0 ? hits[0].object.userData.binId : null;
    };

    dom.addEventListener('pointerdown', async (e) => {
        ctxMenuEl.classList.add('hidden');
        if (e.button !== 0) return;
        const binId = pickBin(e);
        if (binId) {
            state.selectedId = binId;
            sound.playClick(540);
            await refreshScene();
            setPointer(e);
            raycaster.setFromCamera(pointer, camera);
            if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
                const bin = getSelectedBin();
                controls.enabled = false;
                dragState = {
                    binId,
                    offsetX: bin.x - hitPoint.x,
                    offsetY: bin.y - (-hitPoint.z),
                    snapX: bin.x,
                    snapY: bin.y,
                    moved: false
                };
            }
        } else if (state.selectedId) {
            state.selectedId = null;
            await refreshScene();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (dragState) {
            tooltipEl.classList.add('hidden');
            setPointer(e);
            raycaster.setFromCamera(pointer, camera);
            if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
                const bin = state.bins.find(b => b.id === dragState.binId);
                if (!bin) return;
                const cx = hitPoint.x + dragState.offsetX;
                const cy = -hitPoint.z + dragState.offsetY;
                if (Math.hypot(cx - bin.x, cy - bin.y) > 0.8) {
                    dragState.moved = true;
                    const snap = previewDragSnap(bin.id, cx, cy);
                    dragState.snapX = snap.x;
                    dragState.snapY = snap.y;
                    bin.x = cx;
                    bin.y = cy;
                    showDragSnapGhost(bin, snap.x, snap.y);
                }
            }
            return;
        }

        // Hover highlight & floating tooltip
        if (e.target === dom) {
            const hovId = pickBin(e);
            setHoveredBin(hovId);
            if (hovId) {
                const b = state.bins.find(x => x.id === hovId);
                if (b) {
                    tooltipEl.textContent = `${b.name} • ${b.w}×${b.d}mm • ${b.rot}°`;
                    tooltipEl.style.left = `${e.clientX + 14}px`;
                    tooltipEl.style.top = `${e.clientY - 12}px`;
                    tooltipEl.classList.remove('hidden');
                    dom.style.cursor = 'grab';
                    return;
                }
            }
        }
        setHoveredBin(null);
        tooltipEl.classList.add('hidden');
        dom.style.cursor = 'default';
    });

    window.addEventListener('pointerup', async () => {
        if (!dragState) return;
        const wasMoved = dragState.moved;
        const id = dragState.binId;
        const sx = dragState.snapX;
        const sy = dragState.snapY;
        dragState = null;
        controls.enabled = true;
        hideDragSnapGhost();
        if (wasMoved) {
            const bin = state.bins.find(b => b.id === id);
            if (bin) {
                bin.x = sx;
                bin.y = sy;
            }
            compactCluster(id);
            sound.playClick(780);
            await refreshScene();
        }
    });

    dom.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const binId = pickBin(e);
        if (!binId) {
            ctxMenuEl.classList.add('hidden');
            return;
        }
        state.selectedId = binId;
        ctxTargetId = binId;
        await refreshScene();

        const bin = getSelectedBin();
        document.getElementById('ctx-bin-name').textContent = `${bin.name} (${bin.rot}°)`;
        ctxMenuEl.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
        ctxMenuEl.style.top = `${Math.min(e.clientY, window.innerHeight - 180)}px`;
        ctxMenuEl.classList.remove('hidden');
    });
}

function bindGlobalControls() {
    searchEl.addEventListener('input', (e) => renderPartsList(e.target.value));

    const bindSlider = (id, valId, key, suffix = ' mm', cb = null) => {
        const el = document.getElementById(id);
        const valEl = document.getElementById(valId);
        el.addEventListener('input', async () => {
            const v = parseFloat(el.value);
            state.global[key] = v;
            valEl.textContent = `${v}${suffix}`;
            if (cb) cb(v);
            compactCluster();
            await refreshScene();
        });
    };

    bindSlider('param-wall', 'val-wall', 'wallThickness');
    bindSlider('param-base', 'val-base', 'baseThickness');
    bindSlider('param-height', 'val-height', 'defaultWallHeight', ' mm', (v) => {
        state.bins.forEach(b => { b.wallHeight = v; });
    });
    bindSlider('param-tol', 'val-tol', 'tolerance', ' mm', (v) => {
        state.bins.forEach(b => { b.tolerance = v; });
    });

    document.getElementById('param-lid-skirt').addEventListener('input', async (e) => {
        const v = parseFloat(e.target.value);
        state.lid.skirtHeight = v;
        document.getElementById('val-lid-skirt').textContent = `${v} mm`;
        await refreshLidPreview();
    });

    document.getElementById('btn-toggle-lid').addEventListener('click', async (e) => {
        state.lid.preview = !state.lid.preview;
        e.currentTarget.classList.toggle('active', state.lid.preview);
        e.currentTarget.textContent = state.lid.preview ? '🧢 Lid: ON' : '🧢 Lid: OFF';
        sound.playClick(600);
        await refreshLidPreview();
    });

    document.getElementById('btn-export-lid').addEventListener('click', async () => {
        if (state.bins.length === 0) return showToast('Add at least one bin before exporting lid.');
        showToast('Generating contour slide-over Lid STL…');
        const lidModel = await buildExportLidManifold();
        if (!lidModel) return showToast('No coverable bins (motors & LED strips are excluded).');
        const stl = modelToSTL(lidModel, 'ProtoTray_Lid');
        lidModel.delete();
        const blob = new Blob([stl], { type: 'model/stl' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `prototray_lid_${state.bins.length}bins.stl`;
        a.click();
        URL.revokeObjectURL(a.href);
        sound.playExport();
        showToast('Exported slide-over Lid STL (roof-down for printing)!');
    });

    document.getElementById('btn-export-diffusers').addEventListener('click', async () => {
        const model = await buildExportDiffusersManifold();
        if (!model) return showToast('Add at least one LED Strip bin first.');
        const stl = modelToSTL(model, 'ProtoTray_LED_Diffusers');
        model.delete();
        const blob = new Blob([stl], { type: 'model/stl' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'prototray_led_diffusers.stl';
        a.click();
        URL.revokeObjectURL(a.href);
        sound.playExport();
        showToast('Exported 1.6mm slide-in LED Diffuser Strips STL!');
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
        sound.enabled = !sound.enabled;
        e.currentTarget.classList.toggle('active', sound.enabled);
        e.currentTarget.textContent = sound.enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
        if (sound.enabled) sound.playClick(680);
    });

    document.getElementById('btn-toggle-ghosts').addEventListener('click', async (e) => {
        state.showGhosts = !state.showGhosts;
        e.currentTarget.classList.toggle('active', state.showGhosts);
        e.currentTarget.textContent = state.showGhosts ? '👻 Ghosts: ON' : '👻 Ghosts: OFF';
        await refreshScene();
    });

    document.getElementById('btn-clear-tray').addEventListener('click', async () => {
        await removeBins(state.bins.map(b => b.id));
    });

    document.getElementById('btn-export-stl').addEventListener('click', async () => {
        if (state.bins.length === 0) return showToast('Add at least one bin before exporting.');
        showToast('Merging watertight STL…');
        const model = await buildExportManifold();
        if (!model) return;
        const stl = modelToSTL(model, 'ProtoTray');
        model.delete();
        const blob = new Blob([stl], { type: 'model/stl' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `prototray_${state.bins.length}bins.stl`;
        a.click();
        URL.revokeObjectURL(a.href);
        sound.playExport();
        showToast('Exported watertight ProtoTray STL!');
    });

    document.getElementById('btn-save-json').addEventListener('click', () => {
        const blob = new Blob([serializeLayout()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'prototray-layout.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Saved layout JSON');
    });

    const fileInput = document.getElementById('file-load-json');
    document.getElementById('btn-load-json').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            deserializeLayout(await file.text());
            compactCluster();
            await refreshScene();
            showToast('Loaded layout JSON');
        } catch (err) {
            showToast('Invalid layout JSON');
        }
        fileInput.value = '';
    });

    ctxMenuEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.ctx-item');
        if (!btn || !ctxTargetId) return;
        const action = btn.dataset.action;
        ctxMenuEl.classList.add('hidden');
        if (action === 'rotate') await rotateBin(ctxTargetId);
        else if (action === 'duplicate') await duplicateBin(ctxTargetId);
        else if (action === 'delete') await deleteBin(ctxTargetId);
        else if (action === 'settings') {
            state.selectedId = ctxTargetId;
            inspectorEl.classList.remove('hidden');
            syncInspector();
        }
    });

    window.addEventListener('keydown', async (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space' && state.selectedId) {
            e.preventDefault();
            await rotateBin(state.selectedId);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
            e.preventDefault();
            await deleteBin(state.selectedId);
        } else if (e.key === 'Escape') {
            ctxMenuEl.classList.add('hidden');
            inspectorEl.classList.add('hidden');
        }
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('#context-menu')) ctxMenuEl.classList.add('hidden');
    });
}

// Boot
renderPartsList();
viewportCtx = initViewport(document.getElementById('canvas-container'));
bindViewportInteractions();
bindInspector();
bindGlobalControls();
refreshScene();
