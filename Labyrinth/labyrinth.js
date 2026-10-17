import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createSharedUniforms } from './styles/index.js';
import { ROOM_TYPES } from './rooms/index.js';
import { createCells } from './cells.js';
import { createMaskedAscii } from './ascii.js';
import { createTomeReader } from './tomes.js';

const STYLE_HREF = new URL('./labyrinth.css', import.meta.url).href;
const WHEEL_STEP = 60;

let active = null;
let wanted = false;

function ensureStyles() {
    if (document.querySelector('link[data-labyrinth-css]')) return Promise.resolve();
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = STYLE_HREF;
        link.dataset.labyrinthCss = '';
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
    });
}

/**
 * options: { books: [{ el, title, section, color }], day: 0 or 1, reducedMotion, onRequestExit }
 */
export async function enter(options = {}) {
    wanted = true;
    if (active) return;
    await ensureStyles();
    if (!wanted || active) return;
    active = createLabyrinth(options);
}

export function exit() {
    wanted = false;
    if (!active) return Promise.resolve();
    const lab = active;
    active = null;
    return lab.destroy();
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function createLabyrinth({ books = [], day = 0, reducedMotion = false, onRequestExit = () => {} }) {
    THREE.ColorManagement.enabled = false;

    const root = document.createElement('div');
    root.className = 'lab-root';
    root.innerHTML = `
        <div class="lab-whisper" aria-live="polite"></div>
        <div class="lab-label" hidden></div>
        <p class="lab-hint">Scroll to wander · Drag to look · Click a glowing book to read · Esc returns to the library</p>
        <div class="lab-veil"></div>`;
    document.body.appendChild(root);
    const whisper = root.querySelector('.lab-whisper');
    const label = root.querySelector('.lab-label');
    const veil = root.querySelector('.lab-veil');

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'lab-canvas';
    root.insertBefore(canvas, root.firstChild);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 80);
    camera.rotation.order = 'YXZ';

    const U = createSharedUniforms(day);
    const cells = createCells(scene, U, { books });
    const ascii = createMaskedAscii(renderer);
    const reader = createTomeReader(root, {
        onStateChange: (reading) => root.classList.toggle('lab-reading', reading),
    });

    /* ---------- walking ---------- */
    const pos = cells.nodeOf(cells.current);
    let yaw = cells.yawInto(cells.current);
    const look = { yaw: 0, pitch: 0 };
    const stepSeconds = reducedMotion ? 0.4 : 1.0;
    let move = null;
    let tug = null;
    let queued = 0;
    let lastCell = cells.current;

    function startMove(forward) {
        const from = cells.current;
        const to = forward ? cells.ahead : cells.behind;
        if (!to) return false;
        const door = forward ? cells.doorBetween(from, to) : cells.doorBetween(to, from);
        tug = null;
        move = {
            p0: pos.clone(),
            p1: door,
            p2: cells.nodeOf(to),
            yaw0: yaw + look.yaw,
            pitch0: look.pitch,
            yaw1: cells.yawInto(to),
            to,
            t: 0,
        };
        yaw = move.yaw0;
        look.yaw = 0;
        if (forward) cells.stepForward();
        else cells.stepBack();
        return true;
    }

    function request(direction) {
        if (reader.isOpen) return;
        if (move) {
            if (Math.sign(queued) === direction || queued === 0) queued = Math.max(-2, Math.min(2, queued + direction));
            return;
        }
        startMove(direction > 0);
    }

    function updateMove(dt) {
        if (!move) {
            if (queued !== 0) {
                const dir = Math.sign(queued);
                queued -= dir;
                startMove(dir > 0);
            }
            return;
        }
        move.t = Math.min(1, move.t + dt / stepSeconds);
        const e = easeInOut(move.t);
        if (e < 0.5) pos.lerpVectors(move.p0, move.p1, e * 2);
        else pos.lerpVectors(move.p1, move.p2, (e - 0.5) * 2);
        if (!reducedMotion) pos.y += Math.sin(e * Math.PI * 2) * 0.035;
        const turn = easeInOut(Math.min(1, move.t * 1.4));
        yaw = move.yaw0 + wrapAngle(move.yaw1 - move.yaw0) * turn;
        if (!move.userLook) look.pitch = move.pitch0 * (1 - turn);
        if (move.t >= 1) {
            pos.copy(move.p2);
            yaw = move.yaw1;
            if (!move.userLook) look.pitch = 0;
            const scene = cells.sceneOf(move.to);
            move = null;
            if (scene && queued === 0) tug = scene;
        }
    }

    /* Scene rooms draw the eye toward their view, until the visitor looks around themselves. */
    function updateTug(dt) {
        if (!tug) return;
        const k = Math.min(1, dt * 1.6);
        look.yaw += wrapAngle(tug.yaw - (yaw + look.yaw)) * k;
        look.pitch += (tug.pitch - look.pitch) * k;
    }

    function announce(cell) {
        let text = '';
        if (cell.room && cell.room !== lastCell.room) text = ROOM_TYPES[cell.room].name;
        else if (cell.style !== lastCell.style) text = cells.styleName(cell);
        if (!text) return;
        whisper.textContent = text;
        whisper.classList.remove('is-shown');
        void whisper.offsetWidth;
        whisper.classList.add('is-shown');
    }

    /* ---------- input ---------- */
    const mouse = new THREE.Vector2();
    const pointer = { down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastY: 0, x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    let wheelAccum = 0;
    let hoveredBook = null;

    function pick() {
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObjects(cells.pickables(), false)[0];
        return hit && hit.distance < 7 ? hit.object.userData.book : null;
    }

    function onPointerDown(e) {
        if (e.button !== 0 || reader.isOpen) return;
        pointer.down = true;
        pointer.moved = false;
        pointer.startX = pointer.lastX = e.clientX;
        pointer.startY = pointer.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        if (!pointer.down) return;
        const dx = e.clientX - pointer.lastX;
        const dy = e.clientY - pointer.lastY;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
        if (!pointer.moved && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 5) {
            pointer.moved = true;
            canvas.classList.add('lab-dragging');
        }
        if (pointer.moved) {
            tug = null;
            if (move) {
                move.yaw0 += dx * 0.004;
                move.yaw1 += dx * 0.004;
            } else {
                look.yaw += dx * 0.004;
            }
            look.pitch = Math.max(-1.55, Math.min(1.55, look.pitch + dy * 0.004));
            if (move) move.userLook = true;
        }
    }

    function onPointerUp(e) {
        if (!pointer.down) return;
        pointer.down = false;
        canvas.classList.remove('lab-dragging');
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (pointer.moved || e.type === 'pointercancel' || reader.isOpen) return;
        mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const book = pick();
        if (book) reader.open(book);
    }

    function onWheel(e) {
        e.preventDefault();
        if (reader.isOpen) return;
        wheelAccum += Math.max(-120, Math.min(120, e.deltaY));
        while (Math.abs(wheelAccum) >= WHEEL_STEP) {
            const dir = wheelAccum < 0 ? 1 : -1;
            wheelAccum += dir * WHEEL_STEP;
            request(dir);
        }
    }

    function onKey(e) {
        if (e.key === 'Escape') {
            if (document.querySelector('.gallery-modal.active')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (reader.isOpen) reader.close();
            else onRequestExit();
            return;
        }
        if (reader.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') request(1);
        else if (key === 's' || key === 'arrowdown') request(-1);
        else return;
        e.preventDefault();
    }

    function onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);
        ascii.resize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    onResize();

    /* ---------- frame loop ---------- */
    const clock = new THREE.Clock();
    let time = 0;
    let frameId = 0;

    function updateHover() {
        const book = pointer.down || reader.isOpen ? null : pick();
        if (book !== hoveredBook) {
            hoveredBook = book;
            label.innerHTML = '';
            if (book) {
                const small = document.createElement('small');
                small.textContent = book.section;
                label.append(small, document.createTextNode(book.title));
            }
        }
        label.hidden = !hoveredBook;
        canvas.classList.toggle('lab-over-book', !!hoveredBook);
        if (hoveredBook) label.style.transform = `translate(${pointer.x + 16}px, ${pointer.y + 16}px)`;
    }

    function frame() {
        frameId = requestAnimationFrame(frame);
        if (document.hidden) { clock.getDelta(); return; }
        const dt = Math.min(clock.getDelta(), 0.05);
        time += dt;

        updateMove(dt);
        updateTug(dt);
        if (cells.current !== lastCell) {
            announce(cells.current);
            lastCell = cells.current;
        }

        const sway = reducedMotion ? 0 : 1;
        camera.position.set(pos.x, pos.y + Math.sin(time * 0.9) * 0.012 * sway, pos.z);
        camera.rotation.set(look.pitch + Math.sin(time * 0.5) * 0.004 * sway, yaw + look.yaw, 0);
        camera.updateMatrixWorld();

        U.uTime.value = time;
        U.uCam.value.copy(camera.position);
        const tomeCell = cells.nearestTome(camera.position);
        if (tomeCell) {
            U.uTome.value.copy(tomeCell.tome.glowPosition()).setW(1.6 * tomeCell.fade.value);
            U.uTomeColor.value.copy(tomeCell.tome.color);
        } else {
            U.uTome.value.set(0, -999, 0, 0);
        }

        cells.update(dt, time, camera);
        updateHover();
        ascii.render(scene, camera);
    }

    frame();
    requestAnimationFrame(() => {
        root.classList.add('lab-ready');
        veil.classList.add('is-clear');
    });

    return {
        destroy() {
            reader.restore();
            root.classList.add('lab-leaving');
            veil.classList.remove('is-clear');
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('wheel', onWheel);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onResize);
            return new Promise((resolve) => {
                setTimeout(() => {
                    cancelAnimationFrame(frameId);
                    reader.dispose();
                    cells.dispose();
                    ascii.dispose();
                    renderer.dispose();
                    renderer.forceContextLoss();
                    root.remove();
                    resolve();
                }, reducedMotion ? 50 : 450);
            });
        },
    };
}
