import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { R, H, WALLS, WALL_WIDTH, shelfY, createSharedUniforms, createWorldMaterial, createWell } from './well.js';
import { createSky, createBeams, createDust } from './sky.js';
import { createWanderers } from './wanderers.js';
import { SECTIONS, layoutCards, createCardBooks } from './books.js';
import { createPages } from './pages.js';
import { createAscii } from './ascii.js';
import { createReader } from './reader.js';

const STYLE_HREF = new URL('./library.css', import.meta.url).href;
const LAND = { floor: 1, pitch: 0.22 };
const APPROACH = 3.1;
const EYE = 2.15;
const FALL_HEIGHT = 30;
const READ_DISTANCE = 6.5;
const LABYRINTH_URL = '/Labyrinth/labyrinth.js';

let active = null;
let wanted = false;

function ensureStyles() {
    if (document.querySelector(`link[data-library-css]`)) return Promise.resolve();
    return new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = STYLE_HREF;
        link.dataset.libraryCss = '';
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
    });
}

export async function enter(options = {}) {
    wanted = true;
    if (active) return;
    await ensureStyles();
    if (!wanted || active) return;
    active = createLibrary(options);
}

export function exit() {
    wanted = false;
    if (!active) return Promise.resolve();
    const lib = active;
    active = null;
    return lib.destroy();
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function createLibrary({ onRequestExit = () => {}, reducedMotion = false }) {
    THREE.ColorManagement.enabled = false;

    const root = document.createElement('div');
    root.className = 'lib-root';
    document.body.appendChild(root);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.className = 'lib-canvas';
    root.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 220);
    camera.rotation.order = 'YXZ';

    const U = createSharedUniforms();
    const material = createWorldMaterial(U);
    const { books, occupancy } = layoutCards();
    const well = createWell(scene, U, occupancy, material);
    const cards = createCardBooks(scene, books, material);
    const beams = createBeams(scene, U);
    const sky = createSky(scene, U);
    const pages = createPages(scene, U, 360);
    const dust = createDust(scene, U);
    const wanderers = createWanderers(scene, well, material, { enabled: !reducedMotion });
    const ascii = createAscii(renderer);
    let asciiOn = true;
    let dayGoal = document.body.classList.contains('dark-mode') ? 0 : 1;
    U.uDay.value = dayGoal;

    /* ---------- DOM: section index, hover label, plaques ---------- */
    const index = document.createElement('nav');
    index.className = 'lib-index';
    index.setAttribute('aria-label', 'Library sections');
    index.innerHTML = `
        <h2>The Library</h2>
        <ol>${SECTIONS.map((s, i) => `
            <li><button type="button" data-section="${i}" ${s.count ? '' : 'disabled'}>
                <span class="lib-index-key">${i + 1}</span>${s.name}<span class="lib-index-count">${s.count}</span>
            </button></li>`).join('')}
        </ol>
        <button type="button" class="lib-daynight"></button>
        <button type="button" class="lib-leave">Leave the library</button>
        <p class="lib-hint">Drag to look · Scroll to climb · Click a shelf to fly there, a book to read · N day or night · A switches the look · Esc leaves</p>`;
    root.appendChild(index);
    const dayButton = index.querySelector('.lib-daynight');
    const syncDayButton = () => { dayButton.textContent = dayGoal ? 'Night falls (N)' : 'Sunrise (N)'; };
    syncDayButton();

    const label = document.createElement('div');
    label.className = 'lib-label';
    label.hidden = true;
    root.appendChild(label);

    const plaqueLayer = document.createElement('div');
    plaqueLayer.className = 'lib-plaques';
    root.appendChild(plaqueLayer);
    const plaques = SECTIONS.map((s, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'lib-plaque';
        el.dataset.section = String(i);
        el.textContent = `${s.name} · ${s.count} books`;
        plaqueLayer.appendChild(el);
        const F = WALLS[s.wall];
        return { el, anchor: new THREE.Vector3(F.dir.x * (R - 1.2), s.floor * H + 1.3, F.dir.z * (R - 1.2)) };
    });

    const reader = createReader({
        root, scene, camera, cards, material,
        onStateChange: (reading) => {
            root.classList.toggle('lib-reading', reading);
            if (reading) { cards.setHover(-1); label.hidden = true; }
        },
        onPortal: () => {
            history.pushState({ ...history.state, labyrinth: true, labyrinthPushed: true }, '', '?page=labyrinth');
            openLabyrinth({ hasBack: true });
        },
    });

    /* ---------- the labyrinth behind the portal book ---------- */
    const labyrinth = { open: false, module: null, hasBack: false };
    let paused = false;
    let destroyed = false;

    function tomeList() {
        return books
            .map((b, i) => ({ el: b.el, title: b.title, section: b.section.name, color: cards.baseColor(i).getHex(), portal: b.portal }))
            .filter(b => !b.portal);
    }

    function setPaused(value) {
        paused = value;
        root.classList.toggle('lib-paused', value);
        if (value) { label.hidden = true; cards.setHover(-1); hovered = -1; hoveredSection = -1; }
    }

    function openLabyrinth({ hasBack }) {
        if (labyrinth.open) return;
        labyrinth.open = true;
        labyrinth.hasBack = hasBack;
        import(/* @vite-ignore */ new URL(LABYRINTH_URL, window.location.origin).href)
            .then((mod) => {
                labyrinth.module = mod;
                if (!labyrinth.open || destroyed) return;
                setPaused(true);
                return mod.enter({ books: tomeList(), day: dayGoal, reducedMotion, onRequestExit: requestLabyrinthExit });
            })
            .catch((error) => {
                console.error(error);
                labyrinth.open = false;
                setPaused(false);
                if (history.state && history.state.labyrinth) {
                    history.replaceState({ ...history.state, labyrinth: false, labyrinthPushed: false }, '', '?page=library');
                }
                reader.returnFromPortal();
            });
    }

    function requestLabyrinthExit() {
        if (!labyrinth.open) return;
        if (labyrinth.hasBack) { history.back(); return; }
        history.replaceState({ ...history.state, labyrinth: false, labyrinthPushed: false }, '', '?page=library');
        closeLabyrinth();
    }

    function closeLabyrinth() {
        if (!labyrinth.open) return Promise.resolve();
        labyrinth.open = false;
        const done = labyrinth.module ? labyrinth.module.exit() : Promise.resolve();
        return done.then(() => {
            if (destroyed) return;
            setPaused(false);
            reader.returnFromPortal();
        });
    }

    function onPopState() {
        const s = history.state;
        if (s && s.labyrinth && !labyrinth.open) openLabyrinth({ hasBack: true });
        else if (!(s && s.labyrinth) && labyrinth.open) closeLabyrinth();
    }
    window.addEventListener('popstate', onPopState);

    /* ---------- camera state ---------- */
    const landY = LAND.floor * H + EYE;
    const view = { pos: new THREE.Vector3(0, landY, 0), yaw: WALLS[0].yaw, pitch: LAND.pitch, roll: 0 };
    const goal = { yaw: view.yaw, pitch: view.pitch, y: view.pos.y };
    let flight = null;

    function flyTo(to, duration, via, onDone) {
        flight = {
            from: { pos: view.pos.clone(), yaw: view.yaw, pitch: view.pitch },
            to,
            via: via || view.pos.clone().lerp(to.pos, 0.5),
            dYaw: wrapAngle(to.yaw - view.yaw),
            t: 0,
            duration,
            onDone,
        };
    }

    function sectionSpot(i) {
        const s = SECTIONS[i];
        const F = WALLS[s.wall];
        return new THREE.Vector3(F.dir.x * (R - APPROACH), shelfY(s.floor, 2) + 0.35, F.dir.z * (R - APPROACH));
    }

    function flyToSection(i) {
        const s = SECTIONS[i];
        if (!s || !s.count || reader.active) return;
        const F = WALLS[s.wall];
        const pos = sectionSpot(i);
        const dy = Math.abs(pos.y - view.pos.y);
        const via = new THREE.Vector3(0, (pos.y + view.pos.y) / 2, 0);
        index.querySelectorAll('[data-section]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.section) === i));
        flyTo({ pos, yaw: F.yaw, pitch: -0.04 }, Math.min(2.6, Math.max(1.1, 1.1 + dy * 0.05)), via);
    }

    if (reducedMotion) {
        U.uReveal.value = 0;
    } else {
        view.pos.y = landY + FALL_HEIGHT;
        view.pitch = -1.35;
        flyTo({ pos: new THREE.Vector3(0, landY, 0), yaw: WALLS[0].yaw, pitch: LAND.pitch }, 2.6);
    }

    /* ---------- input ---------- */
    const mouse = new THREE.Vector2(0, 0);
    const pointer = { x: 0, y: 0, down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
    const raycaster = new THREE.Raycaster();
    const rayHit = new THREE.Vector3();
    let hovered = -1;
    let hoveredSection = -1;

    /* Any ray that lands on a section's wall (with a generous margin) counts as pointing at it. */
    function pickSection(ray) {
        let best = -1;
        let bestT = Infinity;
        SECTIONS.forEach((s, i) => {
            if (!s.count) return;
            const F = WALLS[s.wall];
            const facing = F.dir.dot(ray.direction);
            if (facing <= 1e-4) return;
            const t = (R - 0.1 - F.dir.dot(ray.origin)) / facing;
            if (t <= 0 || t >= bestT) return;
            ray.at(t, rayHit);
            const y0 = s.floor * H;
            if (Math.abs(rayHit.dot(F.tangent)) > WALL_WIDTH / 2 + 0.8) return;
            if (rayHit.y < y0 - 1.2 || rayHit.y > y0 + H + 0.6) return;
            if (view.pos.distanceTo(sectionSpot(i)) < 0.8) return;
            best = i;
            bestT = t;
        });
        return best;
    }

    function pickAt(ndc) {
        raycaster.setFromCamera(ndc, camera);
        const book = cards.pick(raycaster, READ_DISTANCE);
        if (book >= 0) return { book, section: -1 };
        return { book: -1, section: pickSection(raycaster.ray) };
    }

    function onPointerDown(e) {
        if (e.button !== 0 || reader.active) return;
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
            canvas.classList.add('lib-dragging');
        }
        if (pointer.moved && !flight) {
            goal.yaw += dx * 0.0035;
            goal.pitch = Math.max(-1.45, Math.min(1.45, goal.pitch + dy * 0.0035));
        }
    }

    function onPointerUp(e) {
        if (!pointer.down) return;
        pointer.down = false;
        canvas.classList.remove('lib-dragging');
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (pointer.moved || flight || reader.active || e.type === 'pointercancel') return;
        mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const target = pickAt(mouse);
        if (target.book >= 0) reader.open(target.book);
        else if (target.section >= 0) flyToSection(target.section);
    }

    function onWheel(e) {
        e.preventDefault();
        if (flight || reader.active) return;
        const delta = Math.max(-120, Math.min(120, e.deltaY));
        goal.y -= delta * 0.012;
    }

    function onKey(e) {
        if (labyrinth.open) return;
        if (e.key === 'Escape') {
            if (document.querySelector('.gallery-modal.active')) return;
            e.preventDefault();
            if (reader.isOpen) reader.close();
            else if (!reader.active) onRequestExit();
            return;
        }
        if (reader.active || e.ctrlKey || e.metaKey || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'a') asciiOn = !asciiOn;
        else if (key === 'n') toggleDay();
        else if (/^[1-5]$/.test(key)) flyToSection(Number(key) - 1);
        else if (!flight && (key === 'arrowup' || key === 'pageup')) goal.y += H;
        else if (!flight && (key === 'arrowdown' || key === 'pagedown')) goal.y -= H;
        else if (!flight && key === 'arrowleft') goal.yaw += Math.PI / 3;
        else if (!flight && key === 'arrowright') goal.yaw -= Math.PI / 3;
        else return;
        e.preventDefault();
    }

    function toggleDay() {
        dayGoal = dayGoal ? 0 : 1;
        syncDayButton();
    }

    function onIndexClick(e) {
        const btn = e.target.closest('[data-section]');
        if (btn) { flyToSection(Number(btn.dataset.section)); return; }
        if (e.target.closest('.lib-daynight')) { toggleDay(); return; }
        if (e.target.closest('.lib-leave')) onRequestExit();
    }

    function onPlaqueClick(e) {
        const btn = e.target.closest('[data-section]');
        if (btn) flyToSection(Number(btn.dataset.section));
    }

    function onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);
        ascii.resize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function onPointerLeave() {
        mouse.set(0, 0);
        cards.setHover(-1);
        hovered = -1;
        hoveredSection = -1;
        label.hidden = true;
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    index.addEventListener('click', onIndexClick);
    plaqueLayer.addEventListener('click', onPlaqueClick);
    onResize();

    /* ---------- frame loop ---------- */
    const clock = new THREE.Clock();
    let time = 0;
    let revealTime = 0;
    let frameId = 0;
    let slowFor = 0;
    let frameAvg = 1 / 60;
    let prevYaw = view.yaw;
    const projected = new THREE.Vector3();

    function updateFlight(dt) {
        const f = flight;
        f.t = Math.min(1, f.t + dt / f.duration);
        const e = easeInOut(f.t);
        const a = f.from.pos, b = f.via, c = f.to.pos;
        const u = 1 - e;
        view.pos.set(
            u * u * a.x + 2 * u * e * b.x + e * e * c.x,
            u * u * a.y + 2 * u * e * b.y + e * e * c.y,
            u * u * a.z + 2 * u * e * b.z + e * e * c.z
        );
        view.yaw = f.from.yaw + f.dYaw * e;
        view.pitch = f.from.pitch + (f.to.pitch - f.from.pitch) * e;
        if (f.t >= 1) {
            flight = null;
            goal.yaw = view.yaw;
            goal.pitch = view.pitch;
            goal.y = view.pos.y;
            if (f.onDone) f.onDone();
        }
    }

    function updateHover() {
        if (reader.active || flight || (pointer.down && pointer.moved)) {
            if (hovered >= 0 || hoveredSection >= 0) {
                cards.setHover(-1);
                hovered = -1;
                hoveredSection = -1;
                label.hidden = true;
            }
            canvas.classList.remove('lib-over-book');
            return;
        }
        if (pointer.down) return;
        const target = pickAt(mouse);
        if (target.book !== hovered || target.section !== hoveredSection) {
            hovered = target.book;
            hoveredSection = target.section;
            cards.setHover(hovered);
            label.innerHTML = '';
            const small = document.createElement('small');
            if (hovered >= 0) {
                small.textContent = books[hovered].section.name;
                label.append(small, document.createTextNode(books[hovered].title));
            } else if (hoveredSection >= 0) {
                small.textContent = SECTIONS[hoveredSection].name;
                label.append(small, document.createTextNode('Click to fly there'));
            }
        }
        const any = hovered >= 0 || hoveredSection >= 0;
        label.hidden = !any;
        canvas.classList.toggle('lib-over-book', any);
        if (any) label.style.transform = `translate(${pointer.x + 16}px, ${pointer.y + 16}px)`;
    }

    function updatePlaques() {
        for (const p of plaques) {
            projected.copy(p.anchor).project(camera);
            const dist = camera.position.distanceTo(p.anchor);
            const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2 && dist < 20;
            p.el.style.pointerEvents = visible && !reader.active ? 'auto' : 'none';
            if (!visible) { p.el.style.opacity = '0'; continue; }
            const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
            p.el.style.opacity = String(Math.min(1, (20 - dist) / 8) * U.uReveal.value);
            p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        }
    }

    function adaptQuality(dt) {
        frameAvg += (dt - frameAvg) * 0.05;
        if (time < 2) return;
        slowFor = frameAvg > 0.02 ? slowFor + dt : 0;
        if (slowFor > 1.5 && pages.count > 90) {
            pages.setCount(pages.count / 2);
            slowFor = 0;
        }
    }

    function frame() {
        frameId = requestAnimationFrame(frame);
        if (document.hidden || paused) { clock.getDelta(); return; }
        const dt = Math.min(clock.getDelta(), 0.05);
        time += dt;
        revealTime += dt;

        if (flight) {
            updateFlight(dt);
        } else if (!reader.active) {
            const k = Math.min(1, dt * 8);
            view.yaw += wrapAngle(goal.yaw - view.yaw) * k;
            view.pitch += (goal.pitch - view.pitch) * k;
            view.pos.y += (goal.y - view.pos.y) * Math.min(1, dt * 4);
        }

        const yawVel = wrapAngle(view.yaw - prevYaw) / Math.max(dt, 0.001);
        prevYaw = view.yaw;
        const rollTarget = Math.max(-0.14, Math.min(0.14, -yawVel * 0.05));
        view.roll += (rollTarget - view.roll) * Math.min(1, dt * 4);

        const sway = reader.active ? 0 : 1;
        camera.position.set(
            view.pos.x + Math.sin(time * 0.4) * 0.03 * sway,
            view.pos.y + Math.cos(time * 0.3) * 0.025 * sway,
            view.pos.z
        );
        camera.rotation.set(
            view.pitch + mouse.y * 0.025 * sway,
            view.yaw - mouse.x * 0.04 * sway,
            view.roll
        );
        camera.updateMatrixWorld();

        U.uTime.value = time;
        U.uCam.value.copy(camera.position);
        U.uReveal.value = reducedMotion ? Math.min(1, revealTime / 0.6) : Math.min(1, revealTime / 1.6);
        const dayStep = reducedMotion ? 1 : dt * 0.6;
        U.uDay.value += Math.max(-dayStep, Math.min(dayStep, dayGoal - U.uDay.value));

        well.update(camera.position.y);
        wanderers.update(dt, camera.position.y);
        dust.setPointSize(asciiOn ? 0.7 : 2.5);
        beams.update(time, camera.position.y);
        pages.update(time, camera.position.y);
        sky.update(camera.position);
        reader.update(dt);
        cards.pulse(time);
        updateHover();
        updatePlaques();
        adaptQuality(dt);

        if (asciiOn) {
            ascii.render(scene, camera);
        } else {
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
        }
    }

    frame();
    requestAnimationFrame(() => root.classList.add('lib-ready'));
    if (history.state && history.state.labyrinth) openLabyrinth({ hasBack: !!history.state.labyrinthPushed });

    return {
        destroy() {
            destroyed = true;
            window.removeEventListener('popstate', onPopState);
            if (labyrinth.open) {
                labyrinth.open = false;
                if (labyrinth.module) labyrinth.module.exit();
            }
            reader.restore();
            root.classList.add('lib-leaving');
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('wheel', onWheel);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
            index.removeEventListener('click', onIndexClick);
            plaqueLayer.removeEventListener('click', onPlaqueClick);
            return new Promise((resolve) => {
                setTimeout(() => {
                    cancelAnimationFrame(frameId);
                    reader.dispose();
                    well.dispose();
                    cards.dispose();
                    beams.dispose();
                    sky.dispose();
                    pages.dispose();
                    dust.dispose();
                    wanderers.dispose();
                    ascii.dispose();
                    material.dispose();
                    renderer.dispose();
                    renderer.forceContextLoss();
                    root.remove();
                    resolve();
                }, 450);
            });
        },
    };
}
