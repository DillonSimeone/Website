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
    // Keep all existing bins anchored — only the newly added bin is placed!
}

/**
 * Anchored settle: only moves the active bin (if it overlaps any stationary neighbor)
 * to the nearest non-overlapping flush spot. Never moves other bins.
 */
export function compactCluster(anchorId = null) {
    const wall = state.global.wallThickness;
    if (!anchorId || state.bins.length <= 1) return;

    const active = state.bins.find(b => b.id === anchorId);
    if (!active) return;

    const others = state.bins.filter(b => b.id !== anchorId).map(b => getMetrics(b, wall));
    const am = getMetrics(active, wall);

    if (others.some(ex => overlaps(ex, am, wall))) {
        const snap = previewDragSnap(anchorId, active.x, active.y);
        active.x = snap.x;
        active.y = snap.y;
    }
}

/**
 * Computes the nearest valid flush snap position for a dragged bin without mutating state.
 */
export function previewDragSnap(binId, cursorX, cursorY) {
    const wall = state.global.wallThickness;
    const dragged = state.bins.find(b => b.id === binId);
    if (!dragged) return { x: cursorX, y: cursorY };

    const others = state.bins.filter(b => b.id !== binId).map(b => getMetrics(b, wall));
    if (others.length === 0) return { x: cursorX, y: cursorY };

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

    // Spiral fallback if all immediate edge candidates are blocked
    if (!best) {
        for (let r = 10; r < 500 && !best; r += 10) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                const cx = cursorX + Math.cos(a) * r;
                const cy = cursorY + Math.sin(a) * r;
                dragged.x = cx;
                dragged.y = cy;
                if (!others.some(ex => overlaps(ex, dm, wall))) {
                    best = { x: cx, y: cy };
                    break;
                }
            }
        }
    }

    dragged.x = savedX;
    dragged.y = savedY;
    return best || { x: cursorX, y: cursorY };
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
