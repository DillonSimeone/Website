import { getPartPreset } from './parts-catalog.js';

let nextUid = 1;

export const state = {
    bins: [],
    selectedId: null,
    showGhosts: true,
    lid: {
        preview: false,
        clearance: 0.35,
        skirtHeight: 6.0,
        roofThickness: 1.8,
        wallThickness: 1.8
    },
    global: {
        wallThickness: 1.6,
        baseThickness: 1.6,
        defaultWallHeight: 6.0,
        tolerance: 0.3
    }
};

export function createBinFromPreset(partId, pos = { x: 0, y: 0 }) {
    const preset = getPartPreset(partId);
    const id = `bin_${nextUid++}`;
    return {
        id,
        partId: preset.id,
        name: preset.name,
        color: preset.color,
        w: preset.w,
        d: preset.d,
        wallHeight: preset.wallHeight ?? state.global.defaultWallHeight,
        tolerance: preset.isSpacer ? 0 : state.global.tolerance,
        cradle: Boolean(preset.cradle),
        strainRelief: false,
        fanOrientation: preset.isFan ? 'horizontal' : null,
        screwSize: preset.defaultScrew || 'M3',
        rot: 0, // 0, 90, 180, 270 degrees CCW in Manifold XY
        x: pos.x,
        y: pos.y,
        activeCutouts: {
            N: Boolean(preset.cutouts?.N),
            S: Boolean(preset.cutouts?.S),
            E: Boolean(preset.cutouts?.E),
            W: Boolean(preset.cutouts?.W)
        }
    };
}

/**
 * Returns effective outer dimensions (ew, ed) in Manifold XY after rotation.
 */
export function getBinOuterSize(bin, wall = state.global.wallThickness) {
    const preset = getPartPreset(bin.partId);
    const sideWall = wall + (preset.isLedStrip ? 1.0 : 0);
    const innerW = bin.w + 2 * bin.tolerance;
    const tail = bin.strainRelief ? 26.0 : 0;
    const innerD = bin.d + 2 * bin.tolerance + tail;
    const ow = innerW + 2 * sideWall;
    const od = innerD + 2 * wall;
    const isRotated = bin.rot === 90 || bin.rot === 270;
    return {
        ew: isRotated ? od : ow,
        ed: isRotated ? ow : od,
        innerW: isRotated ? innerD : innerW,
        innerD: isRotated ? innerW : innerD
    };
}

export function getSelectedBin() {
    return state.bins.find(b => b.id === state.selectedId) || null;
}

export function serializeLayout() {
    return JSON.stringify({
        version: 2,
        global: state.global,
        lid: state.lid,
        bins: state.bins
    }, null, 2);
}

export function deserializeLayout(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data || !Array.isArray(data.bins)) throw new Error('Invalid layout JSON');
    if (data.global) {
        Object.assign(state.global, data.global);
    }
    if (data.lid) {
        Object.assign(state.lid, data.lid);
    }
    state.bins = data.bins.map((b, i) => ({
        ...b,
        id: b.id || `bin_${nextUid + i}`
    }));
    nextUid += state.bins.length + 1;
    state.selectedId = state.bins[0]?.id || null;
}
