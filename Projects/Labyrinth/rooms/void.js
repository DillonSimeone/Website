import { THREE, MASK, litMaterial, portalMaterial, makeRoom, ceilingPortal, floorPortal, sideVec } from './kit.js';

const VOID_GLSL = /* glsl */ `
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 col = vec3(0.0);
    vec2 g = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0))) * 40.0;
    vec2 cell = floor(g);
    float h = hash1(cell);
    if (h > 0.93) {
        float star = 1.0 - smoothstep(0.0, 0.35, length(fract(g) - 0.5));
        col += vec3(0.8, 0.85, 1.0) * star * (0.5 + 0.5 * sin(uTime * (0.5 + h * 3.0) + h * 30.0)) * 1.4;
    }
    float neb = fbm2(g * 0.05 + 7.0);
    col += vec3(0.25, 0.1, 0.4) * smoothstep(0.5, 0.85, neb) * 0.6;
    return col;
}
`;

/* Stars above and below (drawn as glyphs), crossed on floating stepping stones. */
function build(ctx) {
    const room = makeRoom();
    ceilingPortal(room, ctx, portalMaterial(ctx, VOID_GLSL, MASK.ascii));
    floorPortal(room, ctx, portalMaterial(ctx, VOID_GLSL, MASK.ascii));
    const stoneMat = litMaterial(ctx, 0x9aa0b8, { mask: MASK.ascii, emissive: 0.15 });
    const stoneGeo = new THREE.BoxGeometry(0.7, 0.14, 0.7);
    room.track(stoneMat, stoneGeo);
    const entry = sideVec(ctx.entrySide).multiplyScalar(1.6);
    const exit = sideVec(ctx.exitSide).multiplyScalar(1.6);
    const stones = [];
    for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const p = t < 0.5 ? entry.clone().lerp(new THREE.Vector3(), t * 2) : new THREE.Vector3().lerp(exit, (t - 0.5) * 2);
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(ctx.center.x + p.x, ctx.center.y - 0.1, ctx.center.z + p.z);
        stone.rotation.y = Math.random();
        room.group.add(stone);
        stones.push({ stone, y: stone.position.y, phase: Math.random() * 6 });
    }
    room.onUpdate((t) => stones.forEach(s => { s.stone.position.y = s.y + Math.sin(t * 0.8 + s.phase) * 0.06; }));
    return room.result();
}

export default { name: 'Star void', skyCeiling: true, noFloor: true, build };
