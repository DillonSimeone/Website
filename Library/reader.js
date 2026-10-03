import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WALLS } from './well.js';

const PULL_DISTANCE = 0.55;
const FRONT_DISTANCE = 1.25;
const FRONT_SCALE = new THREE.Vector3(0.08, 0.78, 0.56);
const CARD_MS = 520;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The real card element is moved into the reader while open (keeping its links, galleries and
 * handlers), then put back exactly where it came from.
 */
export function createReader({ root, scene, camera, cards, material, onStateChange, onPortal = () => {} }) {
    const flyGeo = new THREE.BoxGeometry(1, 1, 1);
    const fly = new THREE.InstancedMesh(flyGeo, material, 1);
    fly.setColorAt(0, new THREE.Color(0, 0, 0));
    fly.frustumCulled = false;
    fly.visible = false;
    scene.add(fly);

    const overlay = document.createElement('div');
    overlay.className = 'lib-reader';
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="lib-reader-backdrop"></div>
        <article class="lib-reader-card" role="dialog" aria-modal="true">
            <header class="lib-reader-head">
                <span class="lib-reader-section"></span>
                <button type="button" class="lib-reader-close" aria-label="Put the book back">&times;</button>
            </header>
            <div class="lib-reader-body"></div>
        </article>`;
    root.appendChild(overlay);
    const card = overlay.querySelector('.lib-reader-card');
    const body = overlay.querySelector('.lib-reader-body');
    const sectionLabel = overlay.querySelector('.lib-reader-section');
    overlay.querySelector('.lib-reader-close').addEventListener('click', () => close());
    overlay.querySelector('.lib-reader-backdrop').addEventListener('click', () => close());

    const flash = document.createElement('div');
    flash.className = 'lib-portal-flash';
    root.appendChild(flash);

    const state = { index: -1, busy: false, open: false, portal: false, element: null, placeholder: null };
    const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3() };
    const dummy = new THREE.Matrix4();
    let frames = null;
    let frameStep = 0;
    let frameT = 0;
    let framesDone = null;

    function setPose(p) {
        dummy.compose(p.pos, p.quat, p.scale);
        fly.setMatrixAt(0, dummy);
        fly.instanceMatrix.needsUpdate = true;
    }

    function animate(list, onDone) {
        frames = list;
        frameStep = 1;
        frameT = 0;
        framesDone = onDone;
    }

    function shelfPose(i) {
        const p = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3() };
        cards.matrixOf(i).decompose(p.pos, p.quat, p.scale);
        return p;
    }

    function pulledPose(i, shelf) {
        const out = WALLS[cards.books[i].wall].dir;
        return { pos: shelf.pos.clone().addScaledVector(out, -PULL_DISTANCE), quat: shelf.quat.clone(), scale: shelf.scale.clone() };
    }

    function frontPose() {
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const x = fwd.clone().negate();
        const z = new THREE.Vector3().crossVectors(x, up).normalize();
        const y = new THREE.Vector3().crossVectors(z, x).normalize();
        const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        return { pos: camera.position.clone().addScaledVector(fwd, FRONT_DISTANCE), quat, scale: FRONT_SCALE.clone() };
    }

    /*
     * The portal book: two covers and two page blocks, hinged on the spine. Body frame: +Y along
     * the spine, +Z away from the camera. The back cover stays put; the front cover swings 180
     * degrees, so the glowing pages end up facing the viewer.
     */
    const portalBook = new THREE.InstancedMesh(flyGeo, material, 4);
    for (let k = 0; k < 4; k++) portalBook.setColorAt(k, new THREE.Color(0, 0, 0));
    portalBook.frustumCulled = false;
    portalBook.visible = false;
    scene.add(portalBook);
    const BOOK = { t: FRONT_SCALE.x, h: FRONT_SCALE.y, d: FRONT_SCALE.z, cover: 0.014 };
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    const pageColor = new THREE.Color();
    const bodyM = new THREE.Matrix4();
    const localM = new THREE.Matrix4();
    const hingeQ = new THREE.Quaternion();
    const offset = new THREE.Vector3();
    const partScale = new THREE.Vector3();
    let portalAnim = null;

    function writePortalBook(i, open, dist, glow) {
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const x = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const origin = camera.position.clone().addScaledVector(fwd, dist).addScaledVector(x, BOOK.d / 2 * (1 - open));
        bodyM.makeBasis(x, up, fwd).setPosition(origin);
        const halves = [[-1, Math.PI / 2], [1, Math.PI / 2 - open * Math.PI]];
        halves.forEach(([side, angle], h) => {
            hingeQ.setFromAxisAngle(Y_AXIS, angle);
            const inner = BOOK.t / 2 - BOOK.cover;
            offset.set(side * (BOOK.t / 2 - BOOK.cover / 2), 0, -BOOK.d / 2).applyQuaternion(hingeQ);
            localM.compose(offset, hingeQ, partScale.set(BOOK.cover, BOOK.h, BOOK.d));
            portalBook.setMatrixAt(h * 2, localM.premultiply(bodyM));
            offset.set(side * inner / 2, 0, -BOOK.d / 2).applyQuaternion(hingeQ);
            localM.compose(offset, hingeQ, partScale.set(inner, BOOK.h * 0.95, BOOK.d * 0.96));
            portalBook.setMatrixAt(h * 2 + 1, localM.premultiply(bodyM));
            portalBook.setColorAt(h * 2, cards.baseColor(i));
            portalBook.setColorAt(h * 2 + 1, pageColor.setRGB(1, 0.95, 0.82).multiplyScalar(glow));
        });
        portalBook.instanceMatrix.needsUpdate = true;
        portalBook.instanceColor.needsUpdate = true;
    }

    function runPortal(steps, onDone) {
        portalAnim = { steps, index: 0, t: 0, onDone };
    }

    function setFlash(opacity, ms) {
        flash.style.transition = `opacity ${ms}ms ease`;
        flash.style.opacity = String(opacity);
    }

    function openPortal(i) {
        state.portal = true;
        const shelf = shelfPose(i);
        animate([
            { ...shelf },
            { ...pulledPose(i, shelf), dur: 0.35 },
            { ...frontPose(), dur: 0.7 },
        ], () => {
            fly.visible = false;
            portalBook.visible = true;
            runPortal([
                { dur: 0.25, from: { open: 0, dist: FRONT_DISTANCE, glow: 1 }, to: { open: 0, dist: FRONT_DISTANCE, glow: 1.2 } },
                { dur: 1.1, from: { open: 0, dist: FRONT_DISTANCE, glow: 1.2 }, to: { open: 1, dist: 1.0, glow: 1.8 } },
                { dur: 0.9, from: { open: 1, dist: 1.0, glow: 1.8 }, to: { open: 1, dist: 0.16, glow: 3.2 }, flash: true },
            ], () => {
                setTimeout(() => onPortal(i), 150);
            });
        });
    }

    /* Coming back out of the portal: the white fades, the book closes and flies home. */
    function returnFromPortal() {
        if (!state.portal || state.index < 0) return;
        const i = state.index;
        portalBook.visible = true;
        writePortalBook(i, 1, 0.16, 3.2);
        setFlash(1, 0);
        requestAnimationFrame(() => setFlash(0, 900));
        runPortal([
            { dur: 0.9, from: { open: 1, dist: 0.16, glow: 3.2 }, to: { open: 1, dist: 1.0, glow: 1.8 } },
            { dur: 0.9, from: { open: 1, dist: 1.0, glow: 1.8 }, to: { open: 0, dist: FRONT_DISTANCE, glow: 1 } },
        ], () => returnToShelf(i));
    }

    function returnToShelf(i) {
        portalBook.visible = false;
        fly.visible = true;
        const front = frontPose();
        setPose(front);
        const shelf = shelfPose(i);
        animate([
            front,
            { ...pulledPose(i, shelf), dur: 0.6 },
            { ...shelf, dur: 0.3 },
        ], () => {
            cards.show(i);
            fly.visible = false;
            state.index = -1;
            state.busy = false;
            state.portal = false;
            onStateChange(false);
        });
    }

    const corner = new THREE.Vector3();
    function screenRect() {
        fly.getMatrixAt(0, dummy);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let c = 0; c < 8; c++) {
            corner.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(dummy).project(camera);
            const sx = (corner.x * 0.5 + 0.5) * window.innerWidth;
            const sy = (-corner.y * 0.5 + 0.5) * window.innerHeight;
            minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
            minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
        return { left: minX, top: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }

    function transformFrom(rect) {
        const final = card.getBoundingClientRect();
        const sx = rect.width / final.width;
        const sy = rect.height / final.height;
        return `translate(${rect.left - final.left}px, ${rect.top - final.top}px) scale(${sx}, ${sy}) perspective(900px) rotateY(-60deg)`;
    }

    function mountElement(book) {
        const el = book.el;
        state.placeholder = document.createComment('library-book');
        el.parentNode.insertBefore(state.placeholder, el);
        el.querySelectorAll('img[data-src]').forEach((img) => {
            if (!img.getAttribute('src')) img.src = img.getAttribute('data-src');
        });
        body.appendChild(el);
        state.element = el;
        card.setAttribute('aria-label', book.title);
        sectionLabel.textContent = book.section.name;
        card.scrollTop = 0;
    }

    function unmountElement() {
        if (state.element && state.placeholder && state.placeholder.parentNode) {
            state.placeholder.parentNode.replaceChild(state.element, state.placeholder);
        }
        state.element = null;
        state.placeholder = null;
    }

    function open(i) {
        if (state.busy || state.open || i < 0) return;
        state.busy = true;
        state.index = i;
        onStateChange(true);

        fly.setColorAt(0, cards.baseColor(i));
        fly.instanceColor.needsUpdate = true;
        const shelf = shelfPose(i);
        setPose(shelf);
        fly.visible = true;
        cards.hide(i);

        if (cards.books[i].portal) {
            openPortal(i);
            return;
        }

        animate([
            { ...shelf },
            { ...pulledPose(i, shelf), dur: 0.28 },
            { ...frontPose(), dur: 0.6 },
        ], () => {
            const rect = screenRect();
            mountElement(cards.books[i]);
            overlay.hidden = false;
            card.style.transition = 'none';
            card.style.opacity = '0.35';
            card.style.transform = transformFrom(rect);
            overlay.classList.remove('is-open');
            void card.offsetWidth;
            card.style.transition = `transform ${CARD_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${CARD_MS * 0.6}ms ease`;
            card.style.transform = '';
            card.style.opacity = '1';
            overlay.classList.add('is-open');
            setTimeout(() => {
                fly.visible = false;
                state.busy = false;
                state.open = true;
                card.querySelector('.lib-reader-close').focus({ preventScroll: true });
            }, CARD_MS);
        });
    }

    function close() {
        if (state.busy || !state.open) return;
        state.busy = true;
        const i = state.index;
        fly.visible = true;
        const front = frontPose();
        setPose(front);
        const rect = screenRect();
        card.style.transition = `transform ${CARD_MS * 0.8}ms cubic-bezier(0.6, 0, 0.8, 0.4), opacity ${CARD_MS * 0.8}ms ease`;
        card.style.transform = transformFrom(rect);
        card.style.opacity = '0';
        overlay.classList.remove('is-open');
        setTimeout(() => {
            overlay.hidden = true;
            card.style.transform = '';
            unmountElement();
            const shelf = shelfPose(i);
            animate([
                front,
                { ...pulledPose(i, shelf), dur: 0.5 },
                { ...shelf, dur: 0.28 },
            ], () => {
                cards.show(i);
                fly.visible = false;
                state.index = -1;
                state.busy = false;
                state.open = false;
                onStateChange(false);
            });
        }, CARD_MS * 0.8);
    }

    return {
        open,
        close,
        returnFromPortal,
        get inPortal() { return state.portal; },
        get active() { return state.busy || state.open; },
        get isOpen() { return state.open; },
        update(dt) {
            if (portalAnim) {
                const step = portalAnim.steps[portalAnim.index];
                if (portalAnim.t === 0 && step.flash) setFlash(1, step.dur * 900);
                portalAnim.t = Math.min(1, portalAnim.t + dt / step.dur);
                const e = ease(portalAnim.t);
                const lerp = (k) => step.from[k] + (step.to[k] - step.from[k]) * e;
                writePortalBook(state.index, lerp('open'), lerp('dist'), lerp('glow'));
                if (portalAnim.t >= 1) {
                    portalAnim.index++;
                    portalAnim.t = 0;
                    if (portalAnim.index >= portalAnim.steps.length) {
                        const done = portalAnim.onDone;
                        portalAnim = null;
                        done();
                    }
                }
            }
            if (!frames) return;
            const from = frames[frameStep - 1];
            const to = frames[frameStep];
            frameT = Math.min(1, frameT + dt / to.dur);
            const e = ease(frameT);
            pose.pos.lerpVectors(from.pos, to.pos, e);
            pose.quat.slerpQuaternions(from.quat, to.quat, e);
            pose.scale.lerpVectors(from.scale, to.scale, e);
            setPose(pose);
            if (frameT >= 1) {
                frameStep++;
                frameT = 0;
                if (frameStep >= frames.length) {
                    const done = framesDone;
                    frames = null;
                    framesDone = null;
                    if (done) done();
                }
            }
        },
        /* Put the card straight back (used when leaving the library mid-read). */
        restore() {
            unmountElement();
            overlay.hidden = true;
            if (state.index >= 0) cards.show(state.index);
            fly.visible = false;
            portalBook.visible = false;
            portalAnim = null;
            frames = null;
            state.index = -1;
            state.busy = false;
            state.open = false;
            state.portal = false;
            setFlash(0, 0);
        },
        dispose() {
            scene.remove(fly);
            scene.remove(portalBook);
            portalBook.dispose();
            flyGeo.dispose();
            fly.dispose();
            overlay.remove();
            flash.remove();
        },
    };
}
