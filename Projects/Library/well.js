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

/* Dynamic floor limits for potato through supercomputer hardware */
export const MIN_FLOORS_BELOW = 6;
export const MIN_FLOORS_ABOVE = 8;
export const MAX_FLOORS_BELOW = 18;
export const MAX_FLOORS_ABOVE = 24;
export const MAX_RINGS = MAX_FLOORS_BELOW + MAX_FLOORS_ABOVE + 8; // 50 rings max

const STRUCT_PER_RING = 6 * (SHELVES + 6);
const BOOKS_PER_RING = 1650;
const PER_RING = STRUCT_PER_RING + BOOKS_PER_RING;

export const LIGHTING_DEFINES = {
    BEAM_COUNT,
    SHADOW_CASTERS,
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

export const BIOME_TIERS = {
    CELESTIAL: 13,
    CANOPY: 7,
    SCRIPTORIUM: 2,
    ATRIUM: -2,
    OCEAN: -8,
    CRYSTAL: -13,
    // HELL: <= -14
};

export function createSharedUniforms() {
    return {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uReveal: { value: 0 },
        uDay: { value: 0 },
        uAsciiMode: { value: 0.0 }, // 0.0: shaded default, 1.0: ascii
        uFadeBounds: { value: new THREE.Vector4(14.0 * H, 17.0 * H, -5.0 * H, -7.0 * H) },
        uAstralPos: { value: new THREE.Vector4(0, -9999, 0, 0) }, // x, y, z, active
        uBeamDir: { value: new THREE.Vector3(0.36, -1, 0.22).normalize() },
        uBeams: { value: Array.from({ length: BEAM_COUNT }, () => new THREE.Vector4(0, -9999, 0, 1)) },
        uShadows: { value: Array.from({ length: SHADOW_CASTERS }, () => new THREE.Vector4(0, -9999, 0, 0)) },
    };
}

export const BIOME_GLSL = /* glsl */ `
struct BiomeWeights {
    float hell;
    float cave;
    float ocean;
    float scriptorium;
    float canopy;
    float celestial;
};

BiomeWeights getBiomeWeights(float y) {
    BiomeWeights b;
    b.celestial = smoothstep(50.0, 58.0, y);
    b.canopy = smoothstep(26.0, 32.0, y) * (1.0 - smoothstep(48.0, 54.0, y));
    b.ocean = smoothstep(-36.0, -30.0, y) * (1.0 - smoothstep(-14.0, -8.0, y));
    b.cave = smoothstep(-58.0, -52.0, y) * (1.0 - smoothstep(-38.0, -32.0, y));
    b.hell = 1.0 - smoothstep(-58.0, -50.0, y);
    b.scriptorium = clamp(1.0 - (b.celestial + b.canopy + b.ocean + b.cave + b.hell), 0.0, 1.0);
    return b;
}
`;

export const LIGHTING_GLSL = /* glsl */ `
${BIOME_GLSL}
uniform vec3 uCam;
uniform float uReveal;
uniform float uTime;
uniform float uDay;
uniform float uAsciiMode;
uniform vec4 uFadeBounds; // x: topStart, y: topEnd, z: bottomStart, w: bottomEnd
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

/* Sky dome haze along viewing ray dir: pure atmospheric scattering (no sharp celestial discs on geometry!) */
vec3 skyHazeAtDir(vec3 dir) {
    float up = dir.y;
    float zen = acos(clamp(up, -1.0, 1.0));
    vec3 haze = hazeColor();
    float sky = smoothstep(-0.15, 0.6, up);

    vec3 night = haze * sky;
    // Soft atmospheric moonlight haze (no sharp moon disc stamped on geometry)
    night += vec3(0.55, 0.65, 0.9) * exp(-zen * 4.0) * 0.25;

    vec3 day = mix(haze, vec3(0.35, 0.55, 0.85), smoothstep(0.1, 0.9, up)) * sky;
    // Soft solar atmospheric haze (no sharp sun disc stamped on geometry)
    float glow = exp(-zen * 3.0);
    day += vec3(1.0, 0.85, 0.55) * glow * 0.45;

    return mix(night, day, uDay);
}

/* Upward fog matches the sky dome EXACTLY in that pixel direction; down fades into black void. */
vec3 fogColorFor(vec3 p, float rel) {
    vec3 dir = normalize(p - uCam);
    vec3 skyAt = skyHazeAtDir(dir);

    float absY = uCam.y + rel;
    // Biome-tinted abyss deep down: Hell has glowing ember atmosphere
    BiomeWeights bw = getBiomeWeights(absY);
    vec3 ember = vec3(0.18, 0.025, 0.01);
    vec3 abyss = mix(vec3(0.0), ember, bw.hell);

    // As we reach the bottom cutoff boundary, fade abyss to 0.0 (pure black)
    // so it matches the sky dome and clear color seamlessly with ZERO POP!
    float bottomFade = smoothstep(uFadeBounds.w, uFadeBounds.z, rel);
    abyss *= bottomFade;

    // Upward atmosphere matches the sky dome
    return mix(abyss, skyAt, smoothstep(-8.0, 24.0, rel));
}

float bandFade(float rel) {
    return (1.0 - smoothstep(uFadeBounds.x, uFadeBounds.y, rel)) * smoothstep(uFadeBounds.w, uFadeBounds.z, rel);
}

/* Screen-door dissolve for ASCII; seamless fog blending for non-ASCII. */
void dissolve(float rel) {
    float bf = bandFade(rel);
    if (uAsciiMode > 0.5) {
        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (bf < noise) discard;
    } else {
        if (bf <= 0.001) discard;
    }
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

    float fogAmt = 1.0 - exp(-dCam * 0.038);
    // In shaded mode, blend towards fog color as we approach the fade boundary so there are ZERO stipple dots!
    float bf = bandFade(rel);
    float totalFog = uAsciiMode > 0.5 ? fogAmt : clamp(fogAmt + (1.0 - bf), 0.0, 1.0);

    return mix(lit, fogColorFor(p, rel), totalFog) * uReveal;
}
`;

const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vLocalPos;

void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
        m = m * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(m) * normal);
    vLocalPos = position;
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
varying vec3 vLocalPos;

void main() {
    dissolve(vWorld.y - uCam.y);
    vec3 N = normalize(vNormal);
    vec3 base = vColor;

    // Gilded spine foil shimmer on books facing into the central well
    if (vLocalPos.z > 0.48) {
        float rib = step(0.84, fract(vLocalPos.y * 6.0));
        float stamp = step(0.86, sin(vLocalPos.y * 24.0) * cos(vLocalPos.x * 20.0));
        float foil = max(rib, stamp);
        if (foil > 0.5) {
            vec3 V = normalize(uCam - vWorld);
            vec3 L = -uBeamDir;
            vec3 H_spec = normalize(L + V);
            float spec = pow(max(dot(N, H_spec), 0.0), 36.0);
            base = mix(base, vec3(0.92, 0.78, 0.35), 0.75) + vec3(1.0, 0.88, 0.45) * spec * 1.6;
        }
    }

    gl_FragColor = vec4(shadeSurface(base, vWorld, N), 1.0);
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

/**
 * 7 Distinct Vertical Biomes:
 * Tier 7: Celestial Stacks (floor >= 13): Alabaster ivory marble, radiant gold, azure & pearl books
 * Tier 6: Overgrown Canopy / Garden (floor 7..12): Mossy stone, ivy heartwood, sage/autumn books
 * Tier 5: High Scriptorium (floor 2..6): Rich mahogany, cedar, warm brass, burgundy & navy
 * Tier 4: Nexus Atrium (floor -2..1): Portfolio walnut, oak, bronze, classic rainbow hues
 * Tier 3: Ocean Abyss (floor -8..-3): Drowned marine stone, coral shelves, kelp & turquoise books
 * Tier 2: Subterranean Crystal Cave (floor -13..-9): Dark stalactite stone, amethyst crystal veins, mineral books
 * Tier 1: Hellish Inferno Abyss (floor <= -14): Charred volcanic obsidian, smoldering magma, blood/ember books
 */
export function getBiome(floor) {
    if (floor >= BIOME_TIERS.CELESTIAL) {
        // Celestial Stacks
        return {
            panel: new THREE.Color(0.92, 0.90, 0.86),
            board: new THREE.Color(0.82, 0.78, 0.72),
            pilaster: new THREE.Color(0.95, 0.93, 0.88),
            slab: new THREE.Color(0.96, 0.94, 0.90),
            rail: new THREE.Color(0.98, 0.88, 0.45),
            bookHues: [0.55, 0.58, 0.62, 0.12, 0.15, 0.08],
            lightBias: 0.35,
        };
    } else if (floor >= BIOME_TIERS.CANOPY) {
        // Overgrown Canopy (Garden / Living Wood)
        return {
            panel: new THREE.Color(0.12, 0.18, 0.11),
            board: new THREE.Color(0.24, 0.28, 0.18),
            pilaster: new THREE.Color(0.18, 0.22, 0.14),
            slab: new THREE.Color(0.26, 0.30, 0.22),
            rail: new THREE.Color(0.65, 0.72, 0.45),
            bookHues: [0.25, 0.30, 0.35, 0.14, 0.08],
            lightBias: 0.15,
        };
    } else if (floor >= BIOME_TIERS.SCRIPTORIUM) {
        // High Scriptorium
        return {
            panel: new THREE.Color(0.18, 0.10, 0.06),
            board: new THREE.Color(0.38, 0.22, 0.12),
            pilaster: new THREE.Color(0.28, 0.16, 0.09),
            slab: new THREE.Color(0.32, 0.28, 0.24),
            rail: new THREE.Color(0.82, 0.65, 0.28),
            bookHues: [0.0, 0.05, 0.1, 0.35, 0.58],
            lightBias: 0.1,
        };
    } else if (floor >= BIOME_TIERS.ATRIUM) {
        // Nexus Atrium
        return {
            panel: new THREE.Color(0.09, 0.06, 0.04),
            board: new THREE.Color(0.30, 0.19, 0.10),
            pilaster: new THREE.Color(0.21, 0.14, 0.09),
            slab: new THREE.Color(0.24, 0.22, 0.20),
            rail: new THREE.Color(0.75, 0.58, 0.26),
            bookHues: [0.0, 0.03, 0.07, 0.1, 0.33, 0.45, 0.6, 0.95],
            lightBias: 0.0,
        };
    } else if (floor >= BIOME_TIERS.OCEAN) {
        // Ocean Abyss (Sunken Drowned Library)
        return {
            panel: new THREE.Color(0.04, 0.10, 0.14),
            board: new THREE.Color(0.08, 0.20, 0.24),
            pilaster: new THREE.Color(0.06, 0.14, 0.18),
            slab: new THREE.Color(0.10, 0.22, 0.26),
            rail: new THREE.Color(0.25, 0.65, 0.68),
            bookHues: [0.48, 0.52, 0.56, 0.42, 0.60],
            lightBias: -0.05,
        };
    } else if (floor >= BIOME_TIERS.CRYSTAL) {
        // Subterranean Crystal Cave
        return {
            panel: new THREE.Color(0.06, 0.05, 0.08),
            board: new THREE.Color(0.16, 0.13, 0.20),
            pilaster: new THREE.Color(0.12, 0.10, 0.16),
            slab: new THREE.Color(0.18, 0.15, 0.22),
            rail: new THREE.Color(0.68, 0.45, 0.85),
            bookHues: [0.72, 0.78, 0.82, 0.55, 0.65],
            lightBias: -0.1,
        };
    } else {
        // Hellish Inferno Abyss
        return {
            panel: new THREE.Color(0.08, 0.02, 0.02),
            board: new THREE.Color(0.22, 0.06, 0.04),
            pilaster: new THREE.Color(0.15, 0.03, 0.03),
            slab: new THREE.Color(0.18, 0.08, 0.06),
            rail: new THREE.Color(0.75, 0.18, 0.08),
            bookHues: [0.0, 0.02, 0.05, 0.08, 0.98],
            lightBias: -0.15,
        };
    }
}

/**
 * @param {Map<string, [number, number][]>} occupancy card-book ranges to leave empty on section floors
 */
export function createWell(scene, U, occupancy, material) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, material, MAX_RINGS * PER_RING);
    mesh.frustumCulled = false;
    scene.add(mesh);

    let floorsBelow = 16;
    let floorsAbove = 20;

    const ringFloor = new Array(MAX_RINGS).fill(null);
    const bookEnd = new Array(MAX_RINGS).fill(0);
    const taken = Array.from({ length: MAX_RINGS }, () => new Set());
    const rebuildListeners = [];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const probe = new THREE.Matrix4();

    // Initialize all instances as hidden
    for (let i = 0; i < MAX_RINGS * PER_RING; i++) {
        mesh.setMatrixAt(i, hidden);
    }
    mesh.instanceMatrix.needsUpdate = true;

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
        const biome = getBiome(floor);

        for (let w = 0; w < 6; w++) {
            const F = WALLS[w];
            place(i++, F, R + 0.34, floor * H + H / 2, 0, WALL_WIDTH, H, 0.05, biome.panel);
            for (let s = 0; s <= SHELVES; s++) {
                place(i++, F, R + 0.1, shelfY(floor, s) - 0.02, 0, WALL_WIDTH, 0.04, 0.44, biome.board);
            }
            place(i++, CORNERS[w], R / Math.cos(Math.PI / 6) - 0.05, floor * H + H / 2, 0, 0.3, H, 0.45, biome.pilaster);
            place(i++, F, R - 0.45, floor * H - 0.06, 0, WALL_WIDTH, 0.12, 1.55, biome.slab);
            place(i++, F, R - 1.2, floor * H + 1.0, 0, railWidth, 0.05, 0.05, biome.rail);
            place(i++, F, R - 1.2, floor * H + 0.5, 0, 0.04, 1.0, 0.04, biome.rail);
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
                    const hue = biome.bookHues[Math.floor(rng() * biome.bookHues.length)];
                    color.setHSL(hue, 0.3 + rng() * 0.3, Math.max(0.08, Math.min(0.85, 0.14 + rng() * 0.22 + biome.lightBias)));
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

    function syncFadeBounds() {
        // Wide continuous 6-floor fade band to guarantee 100% seamless transition into sky/fog
        const topStart = (floorsAbove - 6.0) * H;
        const topEnd = (floorsAbove - 0.5) * H;
        const bottomStart = -(floorsBelow - 5.0) * H;
        const bottomEnd = -(floorsBelow - 0.5) * H;
        U.uFadeBounds.value.set(topStart, topEnd, bottomStart, bottomEnd);
    }

    function update(camY) {
        syncFadeBounds();
        const fc = Math.floor(camY / H);
        const minFloor = fc - floorsBelow;
        const maxFloor = fc + floorsAbove;

        const neededFloors = new Set();
        for (let f = minFloor; f <= maxFloor; f++) neededFloors.add(f);

        const assigned = new Map();
        const availableSlots = [];

        for (let k = 0; k < MAX_RINGS; k++) {
            const f = ringFloor[k];
            if (f !== null && neededFloors.has(f)) {
                assigned.set(f, k);
            } else {
                availableSlots.push(k);
            }
        }

        let changed = false;
        for (let f = minFloor; f <= maxFloor; f++) {
            if (!assigned.has(f) && availableSlots.length > 0) {
                // Find slot farthest from fc to recycle
                let bestIdx = 0;
                let bestDist = -1;
                for (let i = 0; i < availableSlots.length; i++) {
                    const k = availableSlots[i];
                    const dist = ringFloor[k] === null ? Infinity : Math.abs(ringFloor[k] - fc);
                    if (dist > bestDist) {
                        bestDist = dist;
                        bestIdx = i;
                    }
                }
                const k = availableSlots.splice(bestIdx, 1)[0];
                buildRing(k, f);
                assigned.set(f, k);
                changed = true;
            }
        }

        // Only clear slots that are strictly OUTSIDE the visible buffer range
        // This prevents sections from abruptly vanishing when adjusting LOD
        const safeMargin = 3;
        for (const k of availableSlots) {
            const f = ringFloor[k];
            if (f !== null && (f < minFloor - safeMargin || f > maxFloor + safeMargin)) {
                const start = k * PER_RING;
                const end = start + PER_RING;
                for (let i = start; i < end; i++) mesh.setMatrixAt(i, hidden);
                ringFloor[k] = null;
                taken[k].clear();
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
        for (let k = 0; k < MAX_RINGS; k++) {
            if (ringFloor[k] !== floor) continue;
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
        }
        return null;
    }

    return {
        mesh,
        update,
        adoptBook,
        setFloorRange(below, above) {
            floorsBelow = Math.max(MIN_FLOORS_BELOW, Math.min(MAX_FLOORS_BELOW, below));
            floorsAbove = Math.max(MIN_FLOORS_ABOVE, Math.min(MAX_FLOORS_ABOVE, above));
        },
        getFloorRange: () => ({ below: floorsBelow, above: floorsAbove }),
        isRingFloor: (k, floor) => ringFloor[k] === floor,
        onRebuild(fn) { rebuildListeners.push(fn); },
        dispose() {
            scene.remove(mesh);
            box.dispose();
            mesh.dispose();
        },
    };
}
