import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { R, SHELVES, WALL_WIDTH, SHELF_MARGIN, WALLS, shelfY, occupancyKey, mulberry32 } from './well.js';

export const SECTIONS = [
    { id: 'hobby', name: 'Hobbies', selector: '#hobby .artwork, #hobby .library-only', floor: 0, wall: 0, hue: 0.08 },
    { id: 'projects', name: 'Mini-Projects', selector: '#projects .grid-item', floor: -2, wall: 2, hue: 0.55 },
    { id: 'embedded', name: 'ESP32', selector: '#embedded .grid-item', floor: -4, wall: 4, hue: 0.33 },
    { id: 'work', name: 'Featured Work', selector: '#work section > div', floor: -6, wall: 1, hue: 0.0 },
    { id: 'shop', name: 'Shop', selector: '#shop .grid-item', floor: -8, wall: 3, hue: 0.13 },
];

const SHELF_ORDER = [2, 1, 3, 0, 4].filter(s => s < SHELVES);
const BOOK_GAP = 0.012;

function titleOf(el) {
    const heading = el.querySelector('h2, h1, h3');
    const text = heading ? heading.textContent.trim().replace(/\s+/g, ' ') : '';
    return text || 'Untitled';
}

/**
 * Card books are laid out on one wall per section, eye-level shelf first, centred.
 * Returns the books plus the ranges filler books must leave empty.
 */
export function layoutCards() {
    const books = [];
    const occupancy = new Map();
    const usable = WALL_WIDTH - SHELF_MARGIN * 2;

    SECTIONS.forEach((section, sectionIndex) => {
        const cards = Array.from(document.querySelectorAll(section.selector));
        section.count = cards.length;
        const rng = mulberry32(sectionIndex * 104729 + 17);
        const sized = cards.map(el => ({
            el,
            title: el.dataset.portal ? '???' : titleOf(el),
            portal: el.dataset.portal || null,
            t: 0.15 + rng() * 0.07,
            h: 0.6 + rng() * 0.08,
            d: 0.42,
            tone: rng(),
        }));

        let cursor = 0;
        for (const shelf of SHELF_ORDER) {
            if (cursor >= sized.length) break;
            const row = [];
            let width = 0;
            while (cursor < sized.length && width + sized[cursor].t <= usable) {
                width += sized[cursor].t + BOOK_GAP;
                row.push(sized[cursor++]);
            }
            let u = -width / 2;
            occupancy.set(occupancyKey(section.floor, section.wall, shelf), [[u - 0.03, u + width + 0.03]]);
            for (const book of row) {
                books.push({ ...book, section, sectionIndex, floor: section.floor, wall: section.wall, shelf, u: u + book.t / 2 });
                u += book.t + BOOK_GAP;
            }
        }
    });

    return { books, occupancy };
}

export function createCardBooks(scene, books, material) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, material, Math.max(books.length, 1));
    mesh.count = books.length;
    mesh.frustumCulled = false;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    const baseColors = [];
    const matrices = [];
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    books.forEach((book, i) => {
        const F = WALLS[book.wall];
        const radial = R + 0.3 - book.d / 2;
        dummy.position.set(
            F.dir.x * radial + F.tangent.x * book.u,
            shelfY(book.floor, book.shelf) + 0.002 + book.h / 2,
            F.dir.z * radial + F.tangent.z * book.u
        );
        dummy.rotation.set(0, F.yaw, 0);
        dummy.scale.set(book.t, book.h, book.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        matrices.push(dummy.matrix.clone());

        const color = book.portal
            ? new THREE.Color().setHSL(0.78, 0.7, 0.5)
            : new THREE.Color().setHSL(book.section.hue + (book.tone - 0.5) * 0.08, 0.55, 0.42 + book.tone * 0.12);
        baseColors.push(color);
        mesh.setColorAt(i, color);
    });
    if (!books.length) mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    mesh.computeBoundingSphere();

    const hoverColor = new THREE.Color();
    const pulseColor = new THREE.Color();
    const portals = books.map((b, i) => (b.portal ? i : -1)).filter(i => i >= 0);
    let hovered = -1;

    function setHover(i) {
        if (i === hovered) return;
        if (hovered >= 0) mesh.setColorAt(hovered, baseColors[hovered]);
        hovered = i;
        if (i >= 0) {
            hoverColor.copy(baseColors[i]).multiplyScalar(1.9);
            mesh.setColorAt(i, hoverColor);
        }
        mesh.instanceColor.needsUpdate = true;
    }

    return {
        mesh,
        books,
        baseColor: (i) => baseColors[i],
        matrixOf: (i) => matrices[i],
        pick(raycaster, maxDistance = 18) {
            if (!books.length) return -1;
            const hit = raycaster.intersectObject(mesh, false)[0];
            return hit && hit.distance <= maxDistance ? hit.instanceId : -1;
        },
        setHover,
        /* Portal books breathe with a violet glow. */
        pulse(t) {
            if (!portals.length) return;
            for (const i of portals) {
                if (i === hovered) continue;
                pulseColor.copy(baseColors[i]).multiplyScalar(1.1 + 0.9 * (0.5 + 0.5 * Math.sin(t * 2.2 + i)));
                mesh.setColorAt(i, pulseColor);
            }
            mesh.instanceColor.needsUpdate = true;
        },
        hide(i) {
            mesh.setMatrixAt(i, hidden);
            mesh.instanceMatrix.needsUpdate = true;
        },
        show(i) {
            mesh.setMatrixAt(i, matrices[i]);
            mesh.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            scene.remove(mesh);
            box.dispose();
            mesh.dispose();
        },
    };
}
