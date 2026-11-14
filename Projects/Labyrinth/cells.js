import { DIRS, keyOf, opposite, yawOf, nodeOf, doorBetween } from './grid.js';
import { STYLES, STYLE_INDEX } from './styles/index.js';
import { ROOM_TYPES, HALL_ROOMS } from './rooms/index.js';
import { SHAPES, SHAPE_KEYS } from './shapes.js';
import { createBuildKit, buildCell } from './build.js';
import { createRarity } from './rarity.js';
import { critterOptions, habitatOf } from './critter.js';

export { CELL, LEVEL, EYE, yawOf } from './grid.js';

const AHEAD = 5;
const BEHIND = 3;
const FADE_SECONDS = 1.4;
/* A direction is only taken if at least this many free squares can be reached from it (no dead ends). */
const SAFE_REACH = 12;
const SPECIAL_THEMES = ['void', 'garden'];
const CRITTER_CHANCE = 0.3;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * An endless path of cells with no map. Only a handful exist at once: a few behind the
 * viewer, a few ahead, and one "pending" cell at the end whose exit is not chosen yet.
 * Grid squares held by live cells (and their side passages) are never reused while they live.
 */
export function createCells(scene, U, { books = [] } = {}) {
    const kit = createBuildKit();
    const rarity = createRarity();
    const cells = [];
    const occupied = new Map();
    let current = 0;
    let nextId = 0;
    let sinceRoom = 0;
    let sinceTome = 2;
    let lastRoom = null;
    const recentBooks = [];

    /*
     * A zone is a run of cells sharing a style, a shape and a theme:
     *   halls  - ordinary corridors with side passages, scene rooms and strange rooms
     *   void   - every cell floats in the star void
     *   garden - hedges, with one moon pool
     * Themes, styles and shapes are all drawn through the rarity system.
     */
    function nextZone(prev) {
        let theme = 'halls';
        if (prev && prev.theme === 'halls' && Math.random() < 0.3) theme = rarity.pick('theme', SPECIAL_THEMES);
        let style;
        let shape;
        if (theme === 'garden') {
            style = STYLE_INDEX.hedge;
            shape = rarity.pick('shape', ['square', 'octagon', 'round']);
        } else {
            const styles = STYLES.map(s => s.id).filter(id => !prev || id !== STYLES[prev.style].id);
            style = STYLE_INDEX[rarity.pick('style', styles)];
            const shapes = theme === 'void' ? ['round', 'octagon', 'square'] : SHAPE_KEYS.filter(k => !prev || k !== prev.shape);
            shape = rarity.pick('shape', shapes);
        }
        if (theme !== 'halls') rarity.note('theme', theme);
        rarity.note('style', STYLES[style].id);
        rarity.note('shape', shape);
        const length = theme === 'void' ? randInt(3, 4) : theme === 'garden' ? randInt(4, 6) : randInt(3, 6);
        return { theme, style, shape, left: length, count: 0, poolAt: theme === 'garden' ? randInt(1, 2) : -1 };
    }

    let zone = nextZone(null);

    function claim(k, cell, type = 'cell') {
        occupied.set(k, { cell, type });
        cell.keys.push(k);
    }

    function unclaim(k, cell) {
        occupied.delete(k);
        cell.keys.splice(cell.keys.indexOf(k), 1);
    }

    function isFree(k, asker) {
        const o = occupied.get(k);
        return !o || (o.type === 'ahead' && o.cell === asker);
    }

    /* How many free squares on this level can be walked to from (gx, gz), up to limit. */
    function reach(gx, gz, lvl, asker, limit = SAFE_REACH) {
        const visited = new Set([keyOf(gx, gz, lvl)]);
        const queue = [[gx, gz]];
        let n = 0;
        while (queue.length && n < limit) {
            const [x, z] = queue.shift();
            n++;
            for (const [dx, dz] of DIRS) {
                const k = keyOf(x + dx, z + dz, lvl);
                if (visited.has(k) || !isFree(k, asker)) continue;
                visited.add(k);
                queue.push([x + dx, z + dz]);
            }
        }
        return n;
    }

    function makeCell(gx, gz, lvl, inDir, kind, rise, from) {
        const styleFrom = zone.style;
        if (zone.left <= 0) zone = nextZone(zone);
        zone.left--;
        const cell = {
            id: nextId++, gx, gz, lvl, inDir, kind, rise,
            exitLvl: lvl + rise,
            outDir: null,
            stubs: [],
            room: null,
            built: null,
            keys: [],
            fade: { value: 0 },
            fadeTarget: 1,
            styleFrom,
            style: zone.style,
            theme: zone.theme,
            zone,
            zoneIndex: zone.count++,
            shape: kind === 'stairs' ? 'square' : zone.shape,
            windowSide: null,
        };
        claim(keyOf(gx, gz, lvl), cell);
        if (kind === 'stairs') {
            claim(keyOf(gx, gz, lvl + rise), cell);
            claim(keyOf(gx + DIRS[inDir][0], gz + DIRS[inDir][1], lvl + rise), cell, 'ahead');
        } else if (SHAPES[cell.shape].raised) {
            if (isFree(keyOf(gx, gz, lvl + 1), null)) claim(keyOf(gx, gz, lvl + 1), cell, 'stub');
            else cell.shape = 'square';
        }
        if (from) from.next = cell;
        return cell;
    }

    function pickBook() {
        if (!books.length) return null;
        let book;
        for (let tries = 0; tries < 8; tries++) {
            book = books[Math.floor(Math.random() * books.length)];
            if (!recentBooks.includes(book)) break;
        }
        recentBooks.push(book);
        if (recentBooks.length > Math.min(6, books.length - 1)) recentBooks.shift();
        return book;
    }

    /* Decide the exit, side passages, room and tome of the last cell, build it, and add a new pending cell. */
    function extend() {
        const L = cells[cells.length - 1];
        const lvl = L.exitLvl;
        const forward = L.inDir;
        const order = L.kind === 'stairs'
            ? [forward]
            : [...new Set((Math.random() < 0.5 ? [forward] : []).concat(Math.random() < 0.5 ? [(forward + 3) % 4, (forward + 1) % 4] : [(forward + 1) % 4, (forward + 3) % 4], [forward]))];

        const options = [];
        for (const d of order) {
            const [dx, dz] = DIRS[d];
            const gx = L.gx + dx;
            const gz = L.gz + dz;
            if (!isFree(keyOf(gx, gz, lvl), L)) continue;
            options.push({ d, gx, gz, kind: 'corridor', rise: 0, reach: reach(gx, gz, lvl, L) });
            if (L.kind === 'stairs' || L.theme === 'garden') continue;
            for (const r of [1, -1]) {
                if (isFree(keyOf(gx, gz, lvl + r), L) && isFree(keyOf(gx + dx, gz + dz, lvl + r), L)) {
                    options.push({ d, gx, gz, kind: 'stairs', rise: r, reach: reach(gx + dx, gz + dz, lvl + r, L) });
                }
            }
        }

        for (const d of order) {
            const stairs = options.filter(o => o.d === d && o.kind === 'stairs' && o.reach >= SAFE_REACH);
            if (stairs.length && Math.random() < 0.12) return finalize(L, pick(stairs), lvl);
            const flat = options.find(o => o.d === d && o.kind === 'corridor');
            if (flat && flat.reach >= SAFE_REACH) return finalize(L, flat, lvl);
        }
        if (options.length) {
            const best = options.reduce((a, b) => (b.reach > a.reach || (b.reach === a.reach && b.kind === 'stairs') ? b : a));
            return finalize(L, best, lvl);
        }
        /* Fully boxed in, which the look-ahead should make practically impossible. */
        console.warn('[labyrinth] boxed in; climbing through');
        return finalize(L, { d: forward, gx: L.gx + DIRS[forward][0], gz: L.gz + DIRS[forward][1], kind: 'stairs', rise: 1 }, lvl);
    }

    function chooseRoom(L, index) {
        if (L.kind !== 'corridor') return null;
        if (L.theme === 'void') return 'void';
        if (L.theme === 'garden') return L.zoneIndex === L.zone.poolAt ? 'pool' : null;
        if (index <= 1 || sinceRoom < 2 || Math.random() > 0.3) return null;
        return rarity.pick('room', HALL_ROOMS.filter(k => k !== lastRoom));
    }

    /*
     * A room open to the sky (or with no floor) also needs the square above (or below) kept empty,
     * or a neighbouring cell's slab would show up as a ceiling. Returns false if that square is taken.
     */
    function claimOpenings(L, next, lvl) {
        const spec = ROOM_TYPES[L.room] || {};
        const keys = [];
        if (spec.skyCeiling) keys.push(keyOf(L.gx, L.gz, L.lvl + 1));
        if (spec.noFloor) keys.push(keyOf(L.gx, L.gz, L.lvl - 1));
        const mine = (k) => occupied.get(k) && occupied.get(k).cell === L;
        if (!keys.every(k => mine(k) || isFree(k, null))) return false;
        const fresh = keys.filter(k => !mine(k));
        fresh.forEach(k => claim(k, L, 'stub'));
        const [dx, dz] = DIRS[next.d];
        const nextReach = next.kind === 'stairs'
            ? reach(next.gx + dx, next.gz + dz, lvl + next.rise, L)
            : reach(next.gx, next.gz, lvl, L);
        if (nextReach < SAFE_REACH && nextReach < (next.reach ?? 0)) {
            fresh.forEach(k => unclaim(k, L));
            return false;
        }
        return true;
    }

    function finalize(L, next, lvl) {
        const { d: outDir, gx, gz, kind, rise } = next;
        L.outDir = outDir;
        const entrySide = opposite(L.inDir);
        const index = cells.indexOf(L);

        L.room = chooseRoom(L, index);
        if (L.room && !claimOpenings(L, next, lvl)) {
            if (L.room === 'pool' && L.zone.left > 0) L.zone.poolAt = L.zoneIndex + 1;
            L.room = null;
        }
        if (L.room) {
            if (L.room !== 'void') rarity.note('room', L.room);
            lastRoom = L.room;
            sinceRoom = 0;
        } else {
            sinceRoom++;
        }

        if (L.kind === 'corridor' && !L.room && L.theme === 'halls') {
            for (let s = 0; s < 4; s++) {
                if (s === entrySide || s === outDir || Math.random() > 0.35) continue;
                const k = keyOf(L.gx + DIRS[s][0], L.gz + DIRS[s][1], L.lvl);
                if (k === keyOf(gx, gz, lvl) || !isFree(k, null)) continue;
                claim(k, L, 'stub');
                if (kind === 'corridor' && reach(gx, gz, lvl, L) < SAFE_REACH) {
                    unclaim(k, L);
                    continue;
                }
                L.stubs.push(s);
            }
        }

        const solid = [0, 1, 2, 3].filter(s => s !== entrySide && s !== outDir && !L.stubs.includes(s));
        if (L.kind === 'corridor' && (!L.room || L.room === 'babel') && L.theme !== 'void' && solid.length && sinceTome >= 4 && Math.random() < 0.3) {
            const book = pickBook();
            if (book) {
                L.tomeSide = pick(solid);
                L.tomeBook = book;
                sinceTome = 0;
            }
        } else {
            sinceTome++;
        }

        if (L.kind !== 'stairs' && index > 0 && Math.random() < CRITTER_CHANCE) {
            const spec = L.room ? ROOM_TYPES[L.room] : {};
            const options = critterOptions(habitatOf(L, spec, solid));
            if (options.length) {
                L.critter = rarity.pick('critter', options);
                rarity.note('critter', L.critter);
            }
        }

        L.built = buildCell(L, { U, kit });
        scene.add(L.built.group);
        cells.push(makeCell(gx, gz, lvl, outDir, kind, rise, L));
    }

    function release(cell) {
        scene.remove(cell.built.group);
        cell.built.dispose();
        cell.built = null;
        for (const k of cell.keys) {
            const o = occupied.get(k);
            if (o && o.cell === cell) occupied.delete(k);
        }
    }

    function ensureAhead() {
        while (cells.length - 2 - current < AHEAD) extend();
    }

    function updateFadeTargets() {
        cells.forEach((cell, i) => {
            if (cell.built) cell.fadeTarget = i < current - BEHIND ? 0 : 1;
        });
    }

    cells.push(makeCell(0, 0, 0, 0, 'corridor', 0, null));
    ensureAhead();

    return {
        get current() { return cells[current]; },
        get ahead() { return cells[current + 1] && cells[current + 1].built ? cells[current + 1] : null; },
        get behind() {
            const b = cells[current - 1];
            return b && b.built && b.fadeTarget > 0 && b.fade.value > 0.6 ? b : null;
        },
        nodeOf,
        doorBetween,
        yawInto: (cell) => yawOf(cell.inDir),
        styleName: (cell) => STYLES[cell.style].name,
        /* Where a scene room wants the viewer to look, or null. */
        sceneOf(cell) {
            const spec = cell && cell.room ? ROOM_TYPES[cell.room] : null;
            if (!spec || !spec.scene || cell.windowSide === null) return null;
            return { yaw: yawOf(cell.windowSide), pitch: spec.pitch || 0 };
        },
        stepForward() {
            if (!this.ahead) return false;
            current++;
            ensureAhead();
            updateFadeTargets();
            return true;
        },
        stepBack() {
            if (!this.behind) return false;
            current--;
            updateFadeTargets();
            return true;
        },
        pickables() {
            const list = [];
            cells.forEach(c => { if (c.built && c.built.tome && c.fade.value > 0.5) list.push(...c.built.tome.pickables); });
            return list;
        },
        /* The glowing book nearest the viewer lights the walls around it: { tome, fade } or null. */
        nearestTome(pos) {
            let best = null;
            let bestD = Infinity;
            cells.forEach(c => {
                if (!c.built || !c.built.tome) return;
                const d = c.built.tome.group.position.distanceTo(pos);
                if (d < bestD) { bestD = d; best = { tome: c.built.tome, fade: c.fade }; }
            });
            return best;
        },
        update(dt, t, camera) {
            const step = dt / FADE_SECONDS;
            cells.forEach((cell) => {
                if (!cell.built) return;
                cell.fade.value += Math.max(-step, Math.min(step, cell.fadeTarget - cell.fade.value));
                cell.built.update(t, camera);
            });
            while (cells.length && cells[0].built && cells[0].fadeTarget === 0 && cells[0].fade.value <= 0) {
                release(cells.shift());
                current--;
            }
        },
        dispose() {
            cells.forEach(c => { if (c.built) release(c); });
            cells.length = 0;
            kit.dispose();
        },
    };
}
