import { state, getBinOuterSize } from './state.js';
import { getPartPreset } from './parts-catalog.js';

const EPS = 0.02;

function getMetrics(bin, wall) {
    const { ew, ed } = getBinOuterSize(bin, wall);
    const noShare = Boolean(getPartPreset(bin.partId).isLedStrip);
    return { bin, ew, ed, noShare };
}

function pairWall(a, b, wall) {
    return (a.noShare || b.noShare) ? 0 : wall;
}

function overlaps(a, b, wall) {
    const w = pairWall(a, b, wall);
    const minX = (a.ew + b.ew) / 2 - w;
    const minY = (a.ed + b.ed) / 2 - w;
    return Math.abs(a.bin.x - b.bin.x) < minX - EPS &&
           Math.abs(a.bin.y - b.bin.y) < minY - EPS;
}

/**
 * Finds the tightest 2D flush position around existing bins for a newly added bin.
 */
export function placeNewBin(newBin) {
    const wall = state.global.wallThickness;
    const others = state.bins.filter(b => b.id !== newBin.id);
    if (others.length === 0) {
        newBin.x = 0;
        newBin.y = 0;
        return;
    }

    const existing = others.map(b => getMetrics(b, wall));
    const nm = getMetrics(newBin, wall);
    const candidates = [];

    for (const ex of existing) {
        const pw = pairWall(ex, nm, wall);
        const sepX = (ex.ew + nm.ew) / 2 - pw;
        const sepY = (ex.ed + nm.ed) / 2 - pw;
        const alignX = (ex.ew - nm.ew) / 2;
        const alignY = (ex.ed - nm.ed) / 2;

        for (const dy of [0, alignY, -alignY]) {
            candidates.push({ x: ex.bin.x + sepX, y: ex.bin.y + dy });
            candidates.push({ x: ex.bin.x - sepX, y: ex.bin.y + dy });
        }
        for (const dx of [0, alignX, -alignX]) {
            candidates.push({ x: ex.bin.x + dx, y: ex.bin.y + sepY });
            candidates.push({ x: ex.bin.x + dx, y: ex.bin.y - sepY });
        }
    }

    let best = null;
    let bestScore = Infinity;

    for (const c of candidates) {
        newBin.x = c.x;
        newBin.y = c.y;
        if (existing.some(ex => overlaps(ex, nm, wall))) continue;

        let minX = c.x - nm.ew / 2, maxX = c.x + nm.ew / 2;
        let minY = c.y - nm.ed / 2, maxY = c.y + nm.ed / 2;
        for (const ex of existing) {
            minX = Math.min(minX, ex.bin.x - ex.ew / 2);
            maxX = Math.max(maxX, ex.bin.x + ex.ew / 2);
            minY = Math.min(minY, ex.bin.y - ex.ed / 2);
            maxY = Math.max(maxY, ex.bin.y + ex.ed / 2);
        }
        const bw = maxX - minX;
        const bd = maxY - minY;
        const area = bw * bd;
        const maxSide = Math.max(bw, bd);
        const dist = Math.hypot(c.x, c.y);
        // Favor compact, square-ish 2D clusters over long 1D strips
        const score = area + maxSide * maxSide * 0.45 + dist * 1.5;
        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }

    if (best) {
        newBin.x = best.x;
        newBin.y = best.y;
    } else {
        // Fallback spiral search if immediate neighbors are blocked
        let placed = false;
        const step = 12;
        for (let r = step; r < 500 && !placed; r += step) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                newBin.x = Math.cos(a) * r;
                newBin.y = Math.sin(a) * r;
                if (!existing.some(ex => overlaps(ex, nm, wall))) {
                    placed = true;
                    break;
                }
            }
        }
    }
    // Settle just like drag-drop so all bins stay flush with zero clipping
    compactCluster(newBin.id);
}

/**
 * Computes the nearest valid flush snap position for a dragged bin without mutating state.
 */
export function previewDragSnap(binId, cursorX, cursorY) {
    const wall = state.global.wallThickness;
    const dragged = state.bins.find(b => b.id === binId);
    if (!dragged) return { x: cursorX, y: cursorY };

    const others = state.bins.filter(b => b.id !== binId).map(b => getMetrics(b, wall));
    if (others.length === 0) return { x: 0, y: 0 };

    const dm = getMetrics(dragged, wall);
    const candidates = [];

    for (const ex of others) {
        const pw = pairWall(ex, dm, wall);
        const sepX = (ex.ew + dm.ew) / 2 - pw;
        const sepY = (ex.ed + dm.ed) / 2 - pw;
        const alignX = (ex.ew - dm.ew) / 2;
        const alignY = (ex.ed - dm.ed) / 2;

        for (const dy of [0, alignY, -alignY]) {
            candidates.push({ x: ex.bin.x + sepX, y: ex.bin.y + dy });
            candidates.push({ x: ex.bin.x - sepX, y: ex.bin.y + dy });
        }
        for (const dx of [0, alignX, -alignX]) {
            candidates.push({ x: ex.bin.x + dx, y: ex.bin.y + sepY });
            candidates.push({ x: ex.bin.x + dx, y: ex.bin.y - sepY });
        }
    }

    let best = null;
    let bestDist = Infinity;
    const savedX = dragged.x, savedY = dragged.y;

    for (const c of candidates) {
        dragged.x = c.x;
        dragged.y = c.y;
        if (others.some(ex => overlaps(ex, dm, wall))) continue;
        const d = Math.hypot(c.x - cursorX, c.y - cursorY);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    dragged.x = savedX;
    dragged.y = savedY;
    return best || { x: cursorX, y: cursorY };
}

/**
 * Resolves any overlaps and pulls all bins tightly together with zero clipping.
 */
export function compactCluster(anchorId = null) {
    const wall = state.global.wallThickness;
    if (state.bins.length === 0) return;

    const items = state.bins.map(b => getMetrics(b, wall));

    // 1. De-overlap pass
    for (let iter = 0; iter < 40; iter++) {
        let moved = false;
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const a = items[i];
                const b = items[j];
                const pw = pairWall(a, b, wall);
                const minX = (a.ew + b.ew) / 2 - pw;
                const minY = (a.ed + b.ed) / 2 - pw;
                const dx = b.bin.x - a.bin.x;
                const dy = b.bin.y - a.bin.y;
                const penX = minX - Math.abs(dx);
                const penY = minY - Math.abs(dy);

                if (penX > EPS && penY > EPS) {
                    moved = true;
                    const pushAlongX = penX <= penY;
                    const aFixed = a.bin.id === anchorId;
                    const bFixed = b.bin.id === anchorId;

                    if (pushAlongX) {
                        const dir = dx >= 0 ? 1 : -1;
                        if (aFixed && !bFixed) b.bin.x += dir * penX;
                        else if (bFixed && !aFixed) a.bin.x -= dir * penX;
                        else {
                            a.bin.x -= dir * (penX / 2);
                            b.bin.x += dir * (penX / 2);
                        }
                    } else {
                        const dir = dy >= 0 ? 1 : -1;
                        if (aFixed && !bFixed) b.bin.y += dir * penY;
                        else if (bFixed && !aFixed) a.bin.y -= dir * penY;
                        else {
                            a.bin.y -= dir * (penY / 2);
                            b.bin.y += dir * (penY / 2);
                        }
                    }
                }
            }
        }
        if (!moved) break;
    }

    // 2. Safe inward compaction toward (0, 0)
    for (let pass = 0; pass < 3; pass++) {
        items.sort((a, b) => Math.hypot(a.bin.x, a.bin.y) - Math.hypot(b.bin.x, b.bin.y));
        for (const item of items) {
            slideTowardZeroSafe(item, items, 'x', wall);
            slideTowardZeroSafe(item, items, 'y', wall);
        }
    }

    // 3. Final strict clip-checker: guarantee zero overlaps
    for (let safety = 0; safety < 20; safety++) {
        let clipped = false;
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                if (overlaps(items[i], items[j], wall)) {
                    clipped = true;
                    const mover = items[j].bin.id === anchorId ? items[i] : items[j];
                    const other = mover === items[i] ? items[j] : items[i];
                    const pw = pairWall(mover, other, wall);
                    const sepX = (mover.ew + other.ew) / 2 - pw;
                    const sepY = (mover.ed + other.ed) / 2 - pw;
                    const dx = mover.bin.x - other.bin.x;
                    const dy = mover.bin.y - other.bin.y;
                    if (sepX - Math.abs(dx) <= sepY - Math.abs(dy)) {
                        mover.bin.x = other.bin.x + (dx >= 0 ? 1 : -1) * sepX;
                    } else {
                        mover.bin.y = other.bin.y + (dy >= 0 ? 1 : -1) * sepY;
                    }
                }
            }
        }
        if (!clipped) break;
    }

    recenterCluster();
}

function slideTowardZeroSafe(item, allItems, axis, wall) {
    const val = item.bin[axis];
    if (Math.abs(val) < EPS) return;
    const dir = val > 0 ? -1 : 1;
    let target = 0;

    for (const other of allItems) {
        if (other === item) continue;
        const pw = pairWall(item, other, wall);
        const otherAxis = axis === 'x' ? 'y' : 'x';
        const otherDimA = axis === 'x' ? item.ed : item.ew;
        const otherDimB = axis === 'x' ? other.ed : other.ew;
        const minOtherSep = (otherDimA + otherDimB) / 2 - pw;

        if (Math.abs(item.bin[otherAxis] - other.bin[otherAxis]) >= minOtherSep - EPS) {
            continue;
        }

        const dimA = axis === 'x' ? item.ew : item.ed;
        const dimB = axis === 'x' ? other.ew : other.ed;
        const minSep = (dimA + dimB) / 2 - pw;

        if (dir < 0 && other.bin[axis] < item.bin[axis]) {
            target = Math.max(target, other.bin[axis] + minSep);
        } else if (dir > 0 && other.bin[axis] > item.bin[axis]) {
            target = Math.min(target, other.bin[axis] - minSep);
        }
    }

    const oldVal = item.bin[axis];
    if ((dir < 0 && target < oldVal) || (dir > 0 && target > oldVal)) {
        item.bin[axis] = target;
        if (allItems.some(o => o !== item && overlaps(item, o, wall))) {
            item.bin[axis] = oldVal;
        }
    }
}

export function recenterCluster() {
    if (state.bins.length === 0) return;
    const wall = state.global.wallThickness;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const b of state.bins) {
        const { ew, ed } = getBinOuterSize(b, wall);
        minX = Math.min(minX, b.x - ew / 2);
        maxX = Math.max(maxX, b.x + ew / 2);
        minY = Math.min(minY, b.y - ed / 2);
        maxY = Math.max(maxY, b.y + ed / 2);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const b of state.bins) {
        b.x = Math.round((b.x - cx) * 100) / 100;
        b.y = Math.round((b.y - cy) * 100) / 100;
    }
}

export function getTrayBounds() {
    if (state.bins.length === 0) return { w: 0, d: 0, h: 0 };
    const wall = state.global.wallThickness;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxH = 0;

    for (const b of state.bins) {
        const { ew, ed } = getBinOuterSize(b, wall);
        minX = Math.min(minX, b.x - ew / 2);
        maxX = Math.max(maxX, b.x + ew / 2);
        minY = Math.min(minY, b.y - ed / 2);
        maxY = Math.max(maxY, b.y + ed / 2);
        const h = state.global.baseThickness + (b.cradle ? Math.max(b.wallHeight, 14) : b.wallHeight);
        maxH = Math.max(maxH, h);
    }

    return {
        w: Math.round((maxX - minX) * 10) / 10,
        d: Math.round((maxY - minY) * 10) / 10,
        h: Math.round(maxH * 10) / 10
    };
}
