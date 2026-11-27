import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { COMMON_GLSL, glowBlending } from './styles/index.js';

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * A library book found in the labyrinth: open, floating over a pedestal, glowing.
 * ctx: { U, fade, cellCenter } from the owning cell; it lives and dies with that cell.
 */
export function createTome(ctx, book, position) {
    const group = new THREE.Group();
    group.position.copy(position);
    const color = new THREE.Color(book.color).lerp(new THREE.Color(1, 0.85, 0.5), 0.35);
    const shared = { ...ctx.U, uFade: ctx.fade, uCellCenter: ctx.cellCenter };

    const pedestalGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.95, 8);
    const pedestalMat = new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                dissolve();
                vec3 n = normalize(vNormal);
                vec3 base = vec3(0.55, 0.52, 0.48) * (0.85 + 0.2 * noise2(vWorld.xz * 20.0 + vWorld.y * 9.0));
                vec3 col = base * (0.05 + lantern(vWorld, n, vec3(1.0, 0.85, 0.6) * 1.3) + tomeLight(vWorld, n) * 1.5);
                gl_FragColor = vec4(col * darkness(vWorld), 0.0);
            }`,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = 0.475;
    group.add(pedestal);

    const pageGeo = new THREE.BoxGeometry(0.26, 0.02, 0.36);
    pageGeo.translate(0.13, 0, 0);
    const bookMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uColor: { value: color } },
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uColor;
            varying vec3 vWorld;
            varying vec3 vNormal;
            void main() {
                dissolve();
                vec3 n = normalize(vNormal);
                vec3 v = normalize(uCam - vWorld);
                float rim = pow(1.0 - abs(dot(n, v)), 2.0);
                float pulse = 0.5 + 0.5 * sin(uTime * 2.4);
                vec3 page = n.y > 0.5 ? vec3(1.0, 0.95, 0.82) : uColor;
                vec3 col = page * (0.9 + 0.7 * pulse) + vec3(1.0, 0.8, 0.45) * rim * 1.2;
                gl_FragColor = vec4(col * darkness(vWorld), 0.0);
            }`,
    });
    const book3d = new THREE.Group();
    book3d.position.y = 1.25;
    const left = new THREE.Mesh(pageGeo, bookMat);
    const right = new THREE.Mesh(pageGeo, bookMat);
    left.rotation.z = Math.PI - 0.35;
    right.rotation.z = 0.35;
    book3d.add(left, right);
    group.add(book3d);

    const haloGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const haloMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: { ...shared, uColor: { value: color } },
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uColor;
            varying vec3 vWorld;
            varying vec2 vUv;
            void main() {
                float d = length(vUv - 0.5) * 2.0;
                float glow = pow(max(1.0 - d, 0.0), 2.2) * (0.75 + 0.25 * sin(uTime * 2.4));
                gl_FragColor = vec4(uColor * glow * 0.55 * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 1.25;
    group.add(halo);

    const SPARKS = 40;
    const sparkGeo = new THREE.BufferGeometry();
    const seeds = new Float32Array(SPARKS * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    const sparkMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: { ...shared, uColor: { value: color } },
        vertexShader: /* glsl */ `
            attribute vec3 aSeed;
            uniform float uTime;
            varying float vLife;
            varying vec3 vWorld;
            void main() {
                float life = fract(uTime * (0.15 + aSeed.z * 0.2) + aSeed.x);
                float a = aSeed.y * 6.2831 + uTime * 0.5;
                float r = 0.12 + aSeed.x * 0.3;
                vec3 p = vec3(cos(a) * r, 0.9 + life * 1.0, sin(a) * r);
                vec4 wp = modelMatrix * vec4(p, 1.0);
                vWorld = wp.xyz;
                vLife = life;
                vec4 mv = viewMatrix * wp;
                gl_PointSize = 5.0 / -mv.z;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uColor;
            varying float vLife;
            varying vec3 vWorld;
            void main() {
                float soft = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
                float fadeLife = sin(vLife * 3.14159);
                gl_FragColor = vec4(uColor * 1.4 * soft * fadeLife * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    group.add(sparks);

    left.userData.book = book;
    right.userData.book = book;
    const phase = Math.random() * 6;

    return {
        group,
        book,
        color,
        pickables: [left, right],
        glowPosition: () => group.localToWorld(new THREE.Vector3(0, 1.25, 0)),
        update(t, camera) {
            book3d.position.y = 1.25 + Math.sin(t * 1.2 + phase) * 0.06;
            book3d.rotation.y = t * 0.35 + phase;
            const flap = 0.35 + Math.sin(t * 1.7 + phase) * 0.08;
            left.rotation.z = Math.PI - flap;
            right.rotation.z = flap;
            halo.quaternion.copy(camera.quaternion);
        },
        dispose() {
            [pedestalGeo, pedestalMat, pageGeo, bookMat, haloGeo, haloMat, sparkGeo, sparkMat].forEach(d => d.dispose());
        },
    };
}

/* Reading overlay: the real card is moved in and put back exactly where it came from. */
export function createTomeReader(root, { onStateChange = () => {} } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'lab-reader';
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="lab-reader-backdrop"></div>
        <article class="lab-reader-card" role="dialog" aria-modal="true">
            <header class="lab-reader-head">
                <span class="lab-reader-section"></span>
                <button type="button" class="lab-reader-close" aria-label="Let the book go">&times;</button>
            </header>
            <div class="lab-reader-body"></div>
        </article>`;
    root.appendChild(overlay);
    const card = overlay.querySelector('.lab-reader-card');
    const body = overlay.querySelector('.lab-reader-body');
    const sectionLabel = overlay.querySelector('.lab-reader-section');
    const state = { element: null, placeholder: null, open: false };

    function restore() {
        if (state.element && state.placeholder && state.placeholder.parentNode) {
            state.placeholder.parentNode.replaceChild(state.element, state.placeholder);
        }
        state.element = null;
        state.placeholder = null;
    }

    function close() {
        if (!state.open) return;
        state.open = false;
        overlay.classList.remove('is-open');
        setTimeout(() => {
            if (state.open) return;
            overlay.hidden = true;
            restore();
            onStateChange(false);
        }, 350);
    }

    function open(book) {
        if (state.open || !book.el || !book.el.parentNode) return;
        restore();
        state.open = true;
        state.placeholder = document.createComment('labyrinth-book');
        book.el.parentNode.insertBefore(state.placeholder, book.el);
        book.el.querySelectorAll('img[data-src]').forEach((img) => {
            if (!img.getAttribute('src')) img.src = img.getAttribute('data-src');
        });
        body.appendChild(book.el);
        state.element = book.el;
        sectionLabel.textContent = `${book.section} · found in the labyrinth`;
        card.setAttribute('aria-label', book.title);
        card.scrollTop = 0;
        overlay.hidden = false;
        onStateChange(true);
        requestAnimationFrame(() => overlay.classList.add('is-open'));
        card.querySelector('.lab-reader-close').focus({ preventScroll: true });
    }

    overlay.querySelector('.lab-reader-close').addEventListener('click', close);
    overlay.querySelector('.lab-reader-backdrop').addEventListener('click', close);

    return {
        open,
        close,
        get isOpen() { return state.open; },
        restore() {
            restore();
            state.open = false;
            overlay.hidden = true;
        },
        dispose() { overlay.remove(); },
    };
}
