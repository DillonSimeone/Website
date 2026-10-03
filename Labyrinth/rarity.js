/*
 * Rarity: everything the visitor has met becomes rarer, everything unmet more common.
 * Each extra encounter divides an item's weight by 1 / FALLOFF, measured against the least-met item
 * in the same pool, so unseen things almost always come first. Counts persist in localStorage, so
 * returning visitors keep discovering instead of starting over.
 */
const STORAGE_KEY = 'labyrinth.seen.v1';
const FALLOFF = 0.015;

function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

export function createRarity({ persist = true } = {}) {
    const seen = persist ? load() : {};
    let saveTimer = 0;

    function save() {
        if (!persist) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seen)); } catch { /* storage full or blocked */ }
        }, 500);
    }

    const count = (pool, key) => (seen[pool] && seen[pool][key]) || 0;

    return {
        count,
        /* Weighted pick from keys; does not record anything. */
        pick(pool, keys) {
            if (!keys.length) return null;
            const counts = keys.map(k => count(pool, k));
            const least = Math.min(...counts);
            const weights = counts.map(c => Math.pow(FALLOFF, c - least));
            let r = Math.random() * weights.reduce((a, b) => a + b, 0);
            for (let i = 0; i < keys.length; i++) {
                r -= weights[i];
                if (r <= 0) return keys[i];
            }
            return keys[keys.length - 1];
        },
        note(pool, key) {
            if (key === null || key === undefined) return;
            seen[pool] = seen[pool] || {};
            seen[pool][key] = count(pool, key) + 1;
            save();
        },
        reset() {
            Object.keys(seen).forEach(k => delete seen[k]);
            save();
        },
    };
}
