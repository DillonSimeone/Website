import { MASK, makeRoom, portalMaterial, windowPortal, balcony, sideVec } from './kit.js';

/* A balcony and a window onto one of the endless scenes in scenes/. */
export function createSceneRoom(ctx, scene) {
    const room = makeRoom();
    windowPortal(room, ctx, portalMaterial(ctx, scene.glsl, MASK.shaded, {
        uOut: { value: sideVec(ctx.windowSide) },
        uFloor: { value: ctx.center.y },
    }));
    balcony(room, ctx);
    return room.result();
}
