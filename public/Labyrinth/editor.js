import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CELL, LEVEL, EYE, opposite, nodeOf, doorBetween, yawOf } from './grid.js';
import { STYLES, STYLE_INDEX, MASK, createSharedUniforms } from './styles/index.js';
import { SCENES } from './scenes/index.js';
import { ROOM_TYPES, roomFile } from './rooms/index.js';
import { portalMaterial } from './rooms/kit.js';
import { SHAPES } from './shapes.js';
import { createBuildKit, buildCell, effectiveShape } from './build.js';
import { createMaskedAscii } from './ascii.js';

/*
 * Labyrinth editor: builds one cell (optionally with its neighbours) from the settings in the URL,
 * so a single style, shape, room or scene can be refined in isolation. The page reloads itself when
 * any labyrinth file changes (see editor.html) and keeps the camera across reloads.
 */

const DEFAULTS = {
    room: '', style: 'sandstone', from: '', shape: 'square', layout: 'straight',
    stubs: '0', tome: '0', neighbours: '1', day: '0', ascii: '1', view: 'walk', seed: '1', speed: '1',
};
const LAYOUTS = {
    straight: { out: 0, kind: 'corridor', rise: 0, label: 'Straight' },
    left: { out: 3, kind: 'corridor', rise: 0, label: 'Turn left' },
    right: { out: 1, kind: 'corridor', rise: 0, label: 'Turn right' },
    up: { out: 0, kind: 'stairs', rise: 1, label: 'Stairs up' },
    down: { out: 0, kind: 'stairs', rise: -1, label: 'Stairs down' },
};
const VIEWS = { walk: 'Walk (eye level)', overview: 'Overview (no ceiling, no fog)', scene: 'Scene fullscreen' };
const CAMERA_KEY = 'lab-editor-camera';

const params = new URLSearchParams(location.search);
const state = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, params.get(k) ?? DEFAULTS[k]]));

function writeUrl() {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) out.set(k, v);
    const query = out.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

/* ---------- renderer ---------- */
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(program)].filter(Boolean).join('\n').trim();
    console.error('[labyrinth editor] shader error\n' + log);
    window.labEditorError?.('Shader error (see console for the full source)\n' + log);
};
const canvas = renderer.domElement;
canvas.className = 'ed-canvas';
document.body.prepend(canvas);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
camera.rotation.order = 'YXZ';
const U = createSharedUniforms(Number(state.day));
const kit = createBuildKit();
const ascii = createMaskedAscii(renderer);

/* ---------- seeded randomness, so a layout can be rebuilt exactly ---------- */
function withSeed(seed, fn) {
    const original = Math.random;
    let a = (Number(seed) * 2654435761) >>> 0 || 1;
    Math.random = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try { return fn(); } finally { Math.random = original; }
}

/* ---------- building ---------- */
let built = [];
let cellsNow = null;
let sceneSphere = null;

function makeCell(gx, gz, lvl, inDir, outDir, kind, rise, extra = {}) {
    const style = STYLE_INDEX[state.style] ?? 0;
    return {
        gx, gz, lvl, inDir, outDir, kind, rise, exitLvl: lvl + rise,
        stubs: [], room: null, shape: 'square', style, styleFrom: style,
        fade: { value: 1 }, windowSide: null, ...extra,
    };
}

function clearBuilt() {
    built.forEach(b => { scene.remove(b.group); b.dispose(); });
    built = [];
    if (sceneSphere) {
        scene.remove(sceneSphere);
        sceneSphere.geometry.dispose();
        sceneSphere.material.dispose();
        sceneSphere = null;
    }
}

function rebuild() {
    clearBuilt();
    const layout = LAYOUTS[state.layout] || LAYOUTS.straight;
    const room = ROOM_TYPES[state.room] ? state.room : null;
    const main = makeCell(0, 0, 0, 0, layout.out, layout.kind, layout.rise, {
        room,
        shape: state.shape,
        styleFrom: STYLE_INDEX[state.from] ?? STYLE_INDEX[state.style] ?? 0,
    });
    const entry = opposite(main.inDir);
    if (state.stubs === '1' && !room && main.kind === 'corridor') {
        main.stubs = [0, 1, 2, 3].filter(s => s !== entry && s !== main.outDir);
    }
    if (state.tome === '1') {
        const solid = [0, 1, 2, 3].filter(s => s !== entry && s !== main.outDir && !main.stubs.includes(s));
        if (solid.length) {
            main.tomeSide = solid[0];
            main.tomeBook = { title: 'A found book', section: 'Editor', color: '#c9a24a', el: null };
        }
    }
    const [ox, oz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][main.outDir];
    const prev = makeCell(0, 1, 0, 0, 0, 'corridor', 0, { styleFrom: main.styleFrom, style: main.styleFrom });
    const next = makeCell(ox, oz, main.exitLvl, main.outDir, main.outDir, 'corridor', 0);
    cellsNow = { prev, main, next };

    const list = state.neighbours === '1' ? [prev, main, next] : [main];
    const hideCeiling = state.view === 'overview';
    withSeed(state.seed, () => {
        for (const cell of list) {
            const b = buildCell(cell, { U, kit, hideCeiling });
            scene.add(b.group);
            built.push(b);
        }
    });

    if (state.view === 'scene' && room && ROOM_TYPES[room].scene) {
        const ctx = { U, fade: { value: 1 }, cellCenter: { value: new THREE.Vector3(0, 0, 0) } };
        const material = portalMaterial(ctx, SCENES[room].glsl, MASK.shaded, {
            uOut: { value: new THREE.Vector3(0, 0, -1) },
            uFloor: { value: 0 },
        });
        material.side = THREE.BackSide;
        sceneSphere = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), material);
        sceneSphere.renderOrder = 10;
        material.depthTest = false;
        scene.add(sceneSphere);
    }
    built.forEach(b => { b.group.visible = !sceneSphere; });
    U.uClarity.value = state.view === 'overview' || sceneSphere ? 1 : 0;
    renderFiles();
}

/* ---------- camera ---------- */
const cam = Object.assign({ s: 1.2, yaw: 0, pitch: 0, az: 0.6, el: 0.9, dist: 9 }, JSON.parse(sessionStorage.getItem(CAMERA_KEY) || '{}'));
const saveCamera = () => sessionStorage.setItem(CAMERA_KEY, JSON.stringify(cam));

/* Path through the cells: previous centre, entry door, centre, exit door, next centre (s from 0 to 4). */
function pathPoint(s) {
    const { prev, main, next } = cellsNow;
    const pts = [nodeOf(prev), doorBetween(prev, main), nodeOf(main), doorBetween(main, next), nodeOf(next)];
    const lo = state.neighbours === '1' ? 0 : 1;
    const hi = state.neighbours === '1' ? 4 : 3;
    const c = Math.max(lo, Math.min(hi, s));
    const i = Math.min(3, Math.floor(c));
    return pts[i].clone().lerp(pts[i + 1], c - i);
}

function placeCamera(time) {
    if (state.view === 'overview') {
        const y0 = Math.min(cellsNow.main.lvl, cellsNow.main.exitLvl) * LEVEL;
        const target = new THREE.Vector3(0, y0 + 1.2, 0);
        camera.position.set(
            target.x + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist,
            target.y + Math.sin(cam.el) * cam.dist,
            target.z + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist,
        );
        camera.lookAt(target);
    } else if (sceneSphere) {
        camera.position.set(0, EYE, 0);
        camera.rotation.set(cam.pitch, cam.yaw, 0);
    } else {
        camera.position.copy(pathPoint(cam.s));
        camera.position.y += Math.sin(time * 0.9) * 0.01;
        camera.rotation.set(cam.pitch, cam.yaw, 0);
    }
    camera.updateMatrixWorld();
}

/* ---------- panel ---------- */
const panel = document.createElement('div');
panel.className = 'ed-panel';
document.body.appendChild(panel);
let filesBox = null;

function select(key, label, options) {
    const wrap = document.createElement('label');
    wrap.append(label);
    const el = document.createElement('select');
    for (const [value, text] of options) el.add(new Option(text, value, false, value === state[key]));
    el.addEventListener('change', () => { state[key] = el.value; changed(key); });
    wrap.append(el);
    panel.append(wrap);
}

function check(key, label) {
    const wrap = document.createElement('label');
    wrap.className = 'ed-check';
    wrap.append(label);
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = state[key] === '1';
    el.addEventListener('change', () => { state[key] = el.checked ? '1' : '0'; changed(key); });
    wrap.append(el);
    panel.append(wrap);
}

function range(key, label, min, max, step) {
    const wrap = document.createElement('label');
    wrap.append(label);
    const el = document.createElement('input');
    el.type = 'range';
    Object.assign(el, { min, max, step, value: state[key] });
    el.addEventListener('input', () => { state[key] = el.value; changed(key); });
    wrap.append(el);
    panel.append(wrap);
}

function buttons(list) {
    const row = document.createElement('div');
    row.className = 'ed-row';
    for (const [text, fn] of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', fn);
        row.append(b);
    }
    panel.append(row);
}

function buildPanel() {
    panel.innerHTML = '<h1>Labyrinth editor</h1>';
    const styleOptions = STYLES.map(s => [s.id, s.name]);
    const sceneKeys = Object.keys(SCENES);
    select('room', 'Room', [['', '(none)'],
        ...Object.keys(ROOM_TYPES).filter(k => !SCENES[k]).map(k => [k, ROOM_TYPES[k].name]),
        ...sceneKeys.map(k => [k, `Scene: ${SCENES[k].name}`])]);
    select('style', 'Style', styleOptions);
    select('from', 'Blend from', [['', '(same)'], ...styleOptions]);
    select('shape', 'Shape', Object.entries(SHAPES).map(([k, s]) => [k, s.name]));
    select('layout', 'Layout', Object.entries(LAYOUTS).map(([k, l]) => [k, l.label]));
    select('view', 'View', Object.entries(VIEWS));
    check('stubs', 'Side paths');
    check('tome', 'Found book');
    check('neighbours', 'Neighbours');
    check('ascii', 'ASCII');
    range('day', 'Day', 0, 1, 0.01);
    range('speed', 'Time', 0, 3, 0.05);
    const seedWrap = document.createElement('label');
    seedWrap.append('Seed');
    const seed = document.createElement('input');
    seed.type = 'number';
    seed.value = state.seed;
    seed.addEventListener('change', () => { state.seed = String(Math.max(1, Math.floor(Number(seed.value) || 1))); changed('seed'); });
    seedWrap.append(seed);
    panel.append(seedWrap);
    buttons([
        ['Reroll', () => { state.seed = String(Number(state.seed) + 1); seed.value = state.seed; changed('seed'); }],
        ['Copy link', () => navigator.clipboard?.writeText(location.href)],
    ]);
    const live = document.createElement('label');
    live.className = 'ed-check';
    live.append('Live reload');
    const liveBox = document.createElement('input');
    liveBox.type = 'checkbox';
    liveBox.checked = localStorage.getItem('lab-editor-live') !== '0';
    liveBox.addEventListener('change', () => localStorage.setItem('lab-editor-live', liveBox.checked ? '1' : '0'));
    live.append(liveBox);
    panel.append(live);
    filesBox = document.createElement('div');
    filesBox.className = 'ed-files';
    panel.append(filesBox);
    const help = document.createElement('p');
    help.className = 'ed-help';
    help.textContent = 'Drag to look (orbit in overview). Scroll or W/S to walk (zoom in overview). F faces a scene window. The page reloads when a labyrinth file is saved.';
    panel.append(help);
}

/* The files that define what is on screen, so work (and an agent's reading) can stay on just those. */
function renderFiles() {
    if (!filesBox) return;
    const lines = [`styles/${state.style}.js`];
    if (state.from && state.from !== state.style) lines.push(`styles/${state.from}.js`);
    const shape = effectiveShape(cellsNow.main);
    lines.push(`shapes.js (${shape}${shape !== state.shape ? `, forced from ${state.shape}` : ''})`);
    if (ROOM_TYPES[state.room]) {
        lines.push(roomFile(state.room));
        lines.push(SCENES[state.room] ? 'rooms/scene.js + scenes/frame.js' : 'rooms/kit.js (shared helpers)');
    }
    filesBox.textContent = `Files for this view:\n${lines.join('\n')}\n\nLink:\n${location.search || '(defaults)'}`;
}

function changed(key) {
    writeUrl();
    if (key === 'day') { U.uDay.value = Number(state.day); return; }
    if (key === 'speed' || key === 'ascii') return;
    if (key === 'view' && state.view === 'walk' && cam.s < 0.5) cam.s = 1.2;
    rebuild();
}

/* ---------- input ---------- */
const drag = { down: false, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
    drag.down = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
    if (!drag.down) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (state.view === 'overview') {
        cam.az -= dx * 0.006;
        cam.el = Math.max(0.05, Math.min(1.5, cam.el + dy * 0.006));
    } else {
        cam.yaw += dx * 0.004;
        cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch + dy * 0.004));
    }
    saveCamera();
});
const endDrag = (e) => {
    drag.down = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (state.view === 'overview') cam.dist = Math.max(2, Math.min(25, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    else cam.s -= Math.sign(e.deltaY) * 0.1;
    saveCamera();
}, { passive: false });
window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('.ed-panel')) return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') cam.s += 0.1;
    else if (key === 's' || key === 'arrowdown') cam.s -= 0.1;
    else if (key === 'f' && cellsNow && ROOM_TYPES[state.room]?.scene) {
        cam.yaw = yawOf(cellsNow.main.windowSide ?? 0);
        cam.pitch = ROOM_TYPES[state.room].pitch || 0;
    } else return;
    saveCamera();
});

function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    ascii.resize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

/* ---------- frame loop ---------- */
const clock = new THREE.Clock();
let time = 0;

function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt * Number(state.speed);
    placeCamera(time);
    U.uTime.value = time;
    U.uCam.value.copy(camera.position);
    const tomeHolder = built.find(b => b.tome);
    if (tomeHolder && !sceneSphere) {
        U.uTome.value.copy(tomeHolder.tome.glowPosition()).setW(1.6);
        U.uTomeColor.value.copy(tomeHolder.tome.color);
    } else {
        U.uTome.value.set(0, -999, 0, 0);
    }
    built.forEach(b => b.update(time, camera));
    if (state.ascii === '1') ascii.render(scene, camera);
    else renderer.render(scene, camera);
}

buildPanel();
onResize();
writeUrl();
rebuild();
frame();
