import { THREE, COMMON_GLSL, INNER, PLAIN_VERT, glowBlending, cellUniforms, makeRoom } from './kit.js';

/* Rain falling from nowhere onto a rippling floor. */
function build(ctx) {
    const room = makeRoom();
    const COUNT = 420;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(COUNT * 4).map(() => Math.random());
    const positions = new Float32Array(COUNT * 6);
    const ends = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
        const x = ctx.center.x + (seeds[i * 4] * 2 - 1) * 1.75;
        const z = ctx.center.z + (seeds[i * 4 + 1] * 2 - 1) * 1.75;
        positions.set([x, 0, z, x, 0, z], i * 6);
        ends.set([0, 1], i * 2);
    }
    const lineSeeds = new Float32Array(COUNT * 8);
    for (let i = 0; i < COUNT; i++) {
        lineSeeds.set(seeds.subarray(i * 4, i * 4 + 4), i * 8);
        lineSeeds.set(seeds.subarray(i * 4, i * 4 + 4), i * 8 + 4);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(lineSeeds, 4));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const mat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, { uFloorY: { value: ctx.center.y } }),
        vertexShader: /* glsl */ `
            attribute vec4 aSeed;
            attribute float aEnd;
            uniform float uTime;
            uniform float uFloorY;
            varying vec3 vWorld;
            varying float vEnd;
            void main() {
                float fall = fract(aSeed.z - uTime * (0.9 + aSeed.w * 0.5));
                vec3 p = position;
                p.y = uFloorY + fall * 3.2 + aEnd * 0.28;
                vWorld = p;
                vEnd = aEnd;
                gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying float vEnd;
            void main() {
                gl_FragColor = vec4(vec3(0.55, 0.65, 0.8) * (0.25 + 0.5 * vEnd) * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    room.group.add(rain);
    room.track(geo, mat);

    const puddle = new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: PLAIN_VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            void main() {
                dissolve();
                vec2 q = vWorld.xz * 2.5;
                float rings = 0.0;
                for (int i = 0; i < 3; i++) {
                    vec2 cell = floor(q + float(i) * 0.37);
                    vec2 c = cell + vec2(hash1(cell + float(i)), hash1(cell + 9.1 + float(i)));
                    float life = fract(uTime * 0.8 + hash1(cell + 4.0 + float(i)));
                    float d = length(q + float(i) * 0.37 - c);
                    rings += smoothstep(0.05, 0.0, abs(d - life * 0.6)) * (1.0 - life);
                }
                vec3 rd = normalize(vWorld - uCam);
                vec3 col = vec3(0.03, 0.04, 0.06) + lantern(vWorld, vec3(0.0, 1.0, 0.0), vec3(0.4, 0.45, 0.55)) * 0.4 + vec3(0.5, 0.6, 0.75) * rings * 0.5;
                col += vec3(0.4, 0.45, 0.6) * pow(1.0 - max(-rd.y, 0.0), 4.0) * 0.3;
                gl_FragColor = vec4(col * darkness(vWorld), 0.0);
            }`,
    });
    room.add(new THREE.PlaneGeometry(INNER * 2, INNER * 2), puddle, (m) => {
        m.position.copy(ctx.center).setY(ctx.center.y + 0.006);
        m.rotation.x = -Math.PI / 2;
    });
    return room.result();
}

export default { name: 'Indoor rain', build };
