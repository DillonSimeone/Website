import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* Hexagonal well: apothem R, one gallery floor every H units, shelves on all six walls. */
export const R = 6;
export const H = 4.3;
export const SHELVES = 5;
export const SHELF_BASE = 0.35;
export const SHELF_STEP = 0.75;
export const WALL_WIDTH = 2 * R * Math.tan(Math.PI / 6);
export const SHELF_MARGIN = 0.22;
export const BEAM_COUNT = 4;
export const SHADOW_CASTERS = 24;

const FLOORS_BELOW = 3;
const FLOORS_ABOVE = 6;
const RINGS = FLOORS_BELOW + FLOORS_ABOVE + 1;
const STRUCT_PER_RING = 6 * (SHELVES + 6);
const BOOKS_PER_RING = 1650;
const PER_RING = STRUCT_PER_RING + BOOKS_PER_RING;

/* Floors dissolve before the loaded range ends, so recycled rings never pop in. */
export const LIGHTING_DEFINES = {
    BEAM_COUNT,
    SHADOW_CASTERS,
    FADE_TOP_START: (4.6 * H).toFixed(3),
    FADE_TOP_END: (5.9 * H).toFixed(3),
    FADE_BOTTOM_START: (-2.1 * H).toFixed(3),
    FADE_BOTTOM_END: (-2.95 * H).toFixed(3),
};

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function frameAt(angle) {
    return {
        dir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
        tangent: new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)),
        /* rotation.y that maps local +x to the tangent and local +z toward the shaft centre */
        yaw: Math.atan2(-Math.cos(angle), -Math.sin(angle)),
    };
}

export const WALLS = Array.from({ length: 6 }, (_, w) => frameAt(w * Math.PI / 3));
const CORNERS = Array.from({ length: 6 }, (_, w) => frameAt(w * Math.PI / 3 + Math.PI / 6));

export function shelfY(floor, shelf) {
    return floor * H + SHELF_BASE + shelf * SHELF_STEP;
}

export function occupancyKey(floor, wall, shelf) {
    return `${floor}|${wall}|${shelf}`;
}

export function createSharedUniforms() {
    return {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uReveal: { value: 0 },
        uDay: { value: 0 },
        uBeamDir: { value: new THREE.Vector3(0.36, -1, 0.22).normalize() },
        uBeams: { value: Array.from({ length: BEAM_COUNT }, () => new THREE.Vector4(0, -9999, 0, 1)) },
        uShadows: { value: Array.from({ length: SHADOW_CASTERS }, () => new THREE.Vector4(0, -9999, 0, 0)) },
    };
}

export const LIGHTING_GLSL = /* glsl */ `
uniform vec3 uCam;
uniform float uReveal;
uniform float uTime;
uniform float uDay;
uniform vec3 uBeamDir;
uniform vec4 uBeams[BEAM_COUNT];
uniform vec4 uShadows[SHADOW_CASTERS];

vec3 hazeColor() { return mix(vec3(0.04, 0.05, 0.09), vec3(0.22, 0.2, 0.17), uDay); }
vec3 beamTint() { return mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.85, 0.6), uDay); }

float beamLight(vec3 p) {
    float s = 0.0;
    for (int i = 0; i < BEAM_COUNT; i++) {
        float dist = length(cross(p - uBeams[i].xyz, uBeamDir));
        s += 1.0 - smoothstep(uBeams[i].w * 0.35, uBeams[i].w, dist);
    }
    return min(s, 1.5);
}

/* Soft blob shadows of the falling pages, cast along the light direction. */
float pageShadow(vec3 p) {
    float s = 0.0;
    for (int i = 0; i < SHADOW_CASTERS; i++) {
        vec3 q = uShadows[i].xyz;
        float h = q.y - p.y;
        if (h <= 0.05 || h > 10.0) continue;
        vec2 at = q.xz + uBeamDir.xz * (h / -uBeamDir.y);
        float r = 0.16 + h * 0.045;
        s += (1.0 - smoothstep(r * 0.35, r, length(p.xz - at))) * (1.0 - h / 10.0);
    }
    return min(s, 1.0);
}

/* Up fades into haze, down fades into black. */
vec3 fogColorFor(float rel) {
    return mix(vec3(0.0), hazeColor(), smoothstep(-4.0, 26.0, rel));
}

float bandFade(float rel) {
    return (1.0 - smoothstep(FADE_TOP_START, FADE_TOP_END, rel)) * smoothstep(FADE_BOTTOM_END, FADE_BOTTOM_START, rel);
}

/* Screen-door dissolve: cheap, and invisible once turned into glyphs. */
void dissolve(float rel) {
    float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (bandFade(rel) < noise) discard;
}

vec3 shadeSurface(vec3 base, vec3 p, vec3 n) {
    vec3 L = -uBeamDir;
    float diff = max(dot(n, L), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    float rel = p.y - uCam.y;
    float depthDark = exp(-max(0.0, -rel) * 0.085);
    float above = 1.0 + clamp(rel * 0.025, 0.0, 0.5);
    float sh = pageShadow(p);
    float beam = beamLight(p) * mix(0.8, 1.0, uDay);
    float dCam = length(p - uCam);
    float ambient = mix(0.8, 1.1, uDay);
    vec3 lit = base * (0.16 + 0.26 * hemi + 0.22 * diff) * ambient * (1.0 - 0.3 * sh) * depthDark * above;
    lit += base * beamTint() * beam * (0.35 + 0.9 * diff) * (1.0 - 0.85 * sh);
    lit += base * vec3(1.0, 0.72, 0.45) * 0.55 / (1.0 + dCam * dCam * 0.06);
    float fogAmt = 1.0 - exp(-dCam * 0.042);
    return mix(lit, fogColorFor(rel), fogAmt) * uReveal;
}
`;

const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
        m = m * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(m) * normal);
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
        vColor = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WORLD_FRAG = /* glsl */ `
${LIGHTING_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
    dissolve(vWorld.y - uCam.y);
    gl_FragColor = vec4(shadeSurface(vColor, vWorld, normalize(vNormal)), 1.0);
}
`;

export function createWorldMaterial(U) {
    return new THREE.ShaderMaterial({
        defines: { ...LIGHTING_DEFINES },
        uniforms: { ...U },
        vertexShader: WORLD_VERT,
        fragmentShader: WORLD_FRAG,
    });
}

const COLORS = {
    panel: new THREE.Color(0.09, 0.06, 0.04),
    board: new THREE.Color(0.3, 0.19, 0.1),
    pilaster: new THREE.Color(0.21, 0.14, 0.09),
    slab: new THREE.Color(0.24, 0.22, 0.2),
    rail: new THREE.Color(0.75, 0.58, 0.26),
};
const BOOK_HUES = [0.0, 0.03, 0.07, 0.1, 0.33, 0.45, 0.6, 0.95];

/**
 * @param {Map<string, [number, number][]>} occupancy card-book ranges to leave empty on section floors
 */
export function createWell(scene, U, occupancy, material) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, material, RINGS * PER_RING);
    mesh.frustumCulled = false;
    scene.add(mesh);

    const ringFloor = new Array(RINGS).fill(null);
    const bookEnd = new Array(RINGS).fill(0);
    const taken = Array.from({ length: RINGS }, () => new Set());
    const rebuildListeners = [];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const probe = new THREE.Matrix4();

    function place(i, F, radial, y, u, sx, sy, sz, c, lean = 0) {
        dummy.position.set(F.dir.x * radial + F.tangent.x * u, y, F.dir.z * radial + F.tangent.z * u);
        dummy.rotation.set(0, F.yaw, lean);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, c);
    }

    function buildRing(k, floor) {
        let i = k * PER_RING;
        const end = i + PER_RING;
        const rng = mulberry32((floor * 7919) ^ 0x5bd1e995);
        const railWidth = 2 * (R - 1.2) * Math.tan(Math.PI / 6);

        for (let w = 0; w < 6; w++) {
            const F = WALLS[w];
            place(i++, F, R + 0.34, floor * H + H / 2, 0, WALL_WIDTH, H, 0.05, COLORS.panel);
            for (let s = 0; s <= SHELVES; s++) {
                place(i++, F, R + 0.1, shelfY(floor, s) - 0.02, 0, WALL_WIDTH, 0.04, 0.44, COLORS.board);
            }
            place(i++, CORNERS[w], R / Math.cos(Math.PI / 6) - 0.05, floor * H + H / 2, 0, 0.3, H, 0.45, COLORS.pilaster);
            place(i++, F, R - 0.45, floor * H - 0.06, 0, WALL_WIDTH, 0.12, 1.55, COLORS.slab);
            place(i++, F, R - 1.2, floor * H + 1.0, 0, railWidth, 0.05, 0.05, COLORS.rail);
            place(i++, F, R - 1.2, floor * H + 0.5, 0, 0.04, 1.0, 0.04, COLORS.rail);
        }

        const uMin = -WALL_WIDTH / 2 + SHELF_MARGIN;
        const uMax = WALL_WIDTH / 2 - SHELF_MARGIN;
        for (let w = 0; w < 6 && i < end; w++) {
            const F = WALLS[w];
            for (let s = 0; s < SHELVES && i < end; s++) {
                const blocked = occupancy.get(occupancyKey(floor, w, s)) || [];
                let u = uMin;
                while (u < uMax && i < end) {
                    const inside = blocked.find(([a, b]) => u + 0.05 > a && u < b);
                    if (inside) { u = inside[1] + 0.01; continue; }
                    if (rng() < 0.035) { u += 0.1 + rng() * 0.35; continue; }
                    const t = 0.07 + rng() * 0.1;
                    const h = 0.42 + rng() * 0.26;
                    const d = 0.3 + rng() * 0.12;
                    if (u + t > uMax) break;
                    const ahead = blocked.find(([a]) => a > u && a < u + t);
                    if (ahead) { u = ahead[1] + 0.01; continue; }
                    const lean = rng() < 0.03 ? (rng() - 0.5) * 0.25 : 0;
                    color.setHSL(BOOK_HUES[Math.floor(rng() * BOOK_HUES.length)], 0.3 + rng() * 0.3, 0.14 + rng() * 0.22);
                    place(i++, F, R + 0.3 - d / 2, shelfY(floor, s) + 0.002 + h / 2, u + t / 2, t, h, d, color, lean);
                    u += t + 0.004;
                }
            }
        }
        bookEnd[k] = i;

        while (i < end) mesh.setMatrixAt(i++, hidden);
        ringFloor[k] = floor;
        taken[k].clear();
        rebuildListeners.forEach(fn => fn(k));
    }

    function update(camY) {
        const fc = Math.floor(camY / H);
        let changed = false;
        for (let f = fc - FLOORS_BELOW; f <= fc + FLOORS_ABOVE; f++) {
            const k = ((f % RINGS) + RINGS) % RINGS;
            if (ringFloor[k] !== f) {
                buildRing(k, f);
                changed = true;
            }
        }
        if (changed) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    }

    /* Lift a random filler book out of the shelves on this floor; its slot stays empty. */
    function adoptBook(floor) {
        const k = ((floor % RINGS) + RINGS) % RINGS;
        if (ringFloor[k] !== floor) return null;
        const start = k * PER_RING + STRUCT_PER_RING;
        const span = bookEnd[k] - start;
        if (span <= 0) return null;
        for (let tries = 0; tries < 30; tries++) {
            const i = start + Math.floor(Math.random() * span);
            if (taken[k].has(i)) continue;
            mesh.getMatrixAt(i, probe);
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            probe.decompose(pos, quat, scale);
            if (scale.x === 0) continue;
            taken[k].add(i);
            const c = new THREE.Color();
            mesh.getColorAt(i, c);
            mesh.setMatrixAt(i, hidden);
            mesh.instanceMatrix.needsUpdate = true;
            return { k, floor, pos, quat, t: scale.x, h: scale.y, d: scale.z, color: c };
        }
        return null;
    }

    return {
        mesh,
        update,
        adoptBook,
        isRingFloor: (k, floor) => ringFloor[k] === floor,
        onRebuild(fn) { rebuildListeners.push(fn); },
        dispose() {
            scene.remove(mesh);
            box.dispose();
            mesh.dispose();
        },
    };
}
