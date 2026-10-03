// 3D text/letter generator using Manifold WASM

export function makeLetter(Manifold, char, h = 6.0, w = 4.0, thickness = 1.0) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const sw = 1.0;
    let strokes = [];
    const addBar = (x, y, bw, bh) => {
        let bar = cube(bw, bh, thickness).translate([x + bw/2 - w/2, y + bh/2 - h/2, 0]);
        strokes.push(bar);
    };
    if (char === 'T') {
        addBar(0, h - sw, w, sw);
        addBar(w/2 - sw/2, 0, sw, h);
    } else if (char === 'O') {
        addBar(0, 0, sw, h);
        addBar(w - sw, 0, sw, h);
        addBar(0, 0, w, sw);
        addBar(0, h - sw, w, sw);
    } else if (char === 'P') {
        addBar(0, 0, sw, h);
        addBar(0, h - sw, w, sw);
        addBar(0, h/2, w, sw);
        addBar(w - sw, h/2, sw, h/2);
    } else if (char === 'M') {
        addBar(0, 0, sw, h);
        addBar(w - sw, 0, sw, h);
        addBar(0, h - sw, w, sw);
        addBar(w/2 - sw/2, h/2, sw, h/2);
    } else if (char === 'I') {
        addBar(w/2 - sw/2, 0, sw, h);
        addBar(0, 0, w, sw);
        addBar(0, h - sw, w, sw);
    } else if (char === 'D') {
        addBar(0, 0, sw, h);
        addBar(0, 0, w - sw, sw);
        addBar(0, h - sw, w - sw, sw);
        addBar(w - sw, sw, sw, h - 2*sw);
    } else if (char === 'L') {
        addBar(0, 0, sw, h);
        addBar(0, 0, w, sw);
    } else if (char === 'E') {
        addBar(0, 0, sw, h);
        addBar(0, 0, w, sw);
        addBar(0, h/2 - sw/2, w * 0.8, sw);
        addBar(0, h - sw, w, sw);
    } else if (char === 'B') {
        addBar(0, 0, sw, h);
        addBar(0, 0, w - sw, sw);
        addBar(0, h/2 - sw/2, w - sw, sw);
        addBar(0, h - sw, w - sw, sw);
        addBar(w - sw, 0, sw, h/2);
        addBar(w - sw, h/2, sw, h/2);
    } else if (char === 'F') {
        addBar(0, 0, sw, h);
        addBar(0, h/2 - sw/2, w * 0.8, sw);
        addBar(0, h - sw, w, sw);
    } else if (char === 'N') {
        addBar(0, 0, sw, h);
        addBar(w - sw, 0, sw, h);
        addBar(0, h - sw, w, sw);
    } else if (char === 'S') {
        addBar(0, h - sw, w, sw);
        addBar(0, h/2 - sw/2, w, sw);
        addBar(0, 0, w, sw);
        addBar(0, h/2, sw, h/2);
        addBar(w - sw, 0, sw, h/2);
    } else if (char === 'K') {
        addBar(0, 0, sw, h);
        addBar(0, h/2 - sw/2, w * 0.6, sw);
        addBar(w - sw, h/2, sw, h/2);
        addBar(w - sw, 0, sw, h/2);
    }
    if (strokes.length === 0) return null;
    let union = strokes[0];
    for (let i = 1; i < strokes.length; i++) {
        let temp = union;
        union = Manifold.union(union, strokes[i]);
        temp.delete();
        strokes[i].delete();
    }
    return union;
}

export function makeText(Manifold, text, h = 6.0, w = 4.0, spacing = 1.5, thickness = 1.0) {
    let letters = [];
    const charW = w + spacing;
    const totalW = text.length * charW - spacing;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let lMan = makeLetter(Manifold, char, h, w, thickness);
        if (lMan) {
            let posX = i * charW - totalW / 2 + w / 2;
            let lMoved = lMan.translate([posX, 0, 0]);
            lMan.delete();
            letters.push(lMoved);
        }
    }
    if (letters.length === 0) return null;
    let union = letters[0];
    for (let i = 1; i < letters.length; i++) {
        let temp = union;
        union = Manifold.union(union, letters[i]);
        temp.delete();
        letters[i].delete();
    }
    return union;
}
