// ─── EMBER-LIKE EXPRESSION COMPILER & RUNTIME ───────────────────────────────
const KW   = ["if","else","return"];
const FNS  = ["sin","cos","tan","abs","sqrt","pow","floor","ceil","round","frac",
              "min","max","clamp","mix","lerp","step","smoothstep",
              "wave","triangle","square","time","random","hash","noise","perlin1d",
              "vu","peak","pitch","beat","band","bass","mid","treble"];
const KWS  = new Set(KW), FNS_S = new Set(FNS);

export function highlight(src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        // Comment
        if (c === "/" && src[i+1] === "/") {
            let j = i; while (j < src.length && src[j] !== "\n") j++;
            out += '<span class="cmt">' + esc(src.slice(i, j)) + "</span>";
            i = j; continue;
        }
        if (c === "/" && src[i+1] === "*") {
            let j = i + 2;
            while (j + 1 < src.length && !(src[j] === "*" && src[j+1] === "/")) j++;
            j = Math.min(j + 2, src.length);
            out += '<span class="cmt">' + esc(src.slice(i, j)) + "</span>";
            i = j; continue;
        }
        // Number
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i+1]))) {
            let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
            out += '<span class="num">' + esc(src.slice(i, j)) + "</span>";
            i = j; continue;
        }
        // Identifier
        if (/[A-Za-z_]/.test(c)) {
            let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
            const word = src.slice(i, j);
            let cls;
            if (KWS.has(word)) cls = "kw";
            else if (FNS_S.has(word)) cls = "fn";
            else cls = "var";
            out += `<span class="${cls}">${esc(word)}</span>`;
            i = j; continue;
        }
        // Operators
        if ("+-*/%<>=?:!".indexOf(c) >= 0) {
            out += '<span class="op">' + esc(c) + "</span>";
            i++; continue;
        }
        out += esc(c);
        i++;
    }
    return out + "\n";
}

function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function tokenize(src) {
    const tks = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (" \t\r\n".indexOf(c) >= 0) { i++; continue; }
        if (c === "/" && src[i+1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
        if (c === "/" && src[i+1] === "*") {
            i += 2;
            while (i+1 < src.length && !(src[i] === "*" && src[i+1] === "/")) i++;
            i = Math.min(i+2, src.length); continue;
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i+1]||""))) {
            let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
            tks.push({t:"num", v:parseFloat(src.slice(i,j))}); i = j; continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
            tks.push({t:"id", v:src.slice(i,j)}); i = j; continue;
        }
        const two = src.slice(i, i+2);
        if (two === "<=" || two === ">=" || two === "==" || two === "!=") { tks.push({t:two}); i += 2; continue; }
        if ("+-*/%<>=?:(),;{}".indexOf(c) >= 0) { tks.push({t:c}); i++; continue; }
        i++;
    }
    tks.push({t:"eof"});
    return tks;
}

export class Parser {
    constructor(tks) { this.tks = tks; this.p = 0; }
    peek(o = 0) { return this.tks[this.p + o]; }
    eat() { return this.tks[this.p++]; }
    parseProgram() {
        const stmts = [];
        while (this.peek().t !== "eof") {
            while (this.peek().t === ";") this.eat();
            if (this.peek().t === "eof") break;
            stmts.push(this.parseStmt());
            while (this.peek().t === ";") this.eat();
        }
        return {kind:"prog", stmts};
    }
    parseStmt() {
        if (this.peek().t === "id" && this.peek(1).t === "=") {
            const name = this.eat().v; this.eat();
            const val = this.parseTern();
            return {kind:"asn", name, val};
        }
        return {kind:"exp", e:this.parseTern()};
    }
    parseTern() {
        const c = this.parseCmp();
        if (this.peek().t === "?") {
            this.eat();
            const a = this.parseTern();
            if (this.peek().t !== ":") throw new Error("expected ':'");
            this.eat();
            const b = this.parseTern();
            return {kind:"tern", c, a, b};
        }
        return c;
    }
    parseCmp() {
        let l = this.parseAdd();
        while (["<",">","<=",">=","==","!="].includes(this.peek().t)) {
            const op = this.eat().t;
            const r = this.parseAdd();
            l = {kind:"bin", op, l, r};
        }
        return l;
    }
    parseAdd() {
        let l = this.parseMul();
        while (this.peek().t === "+" || this.peek().t === "-") {
            const op = this.eat().t;
            const r = this.parseMul();
            l = {kind:"bin", op, l, r};
        }
        return l;
    }
    parseMul() {
        let l = this.parseUn();
        while ("*/%".indexOf(this.peek().t) >= 0) {
            const op = this.eat().t;
            const r = this.parseUn();
            l = {kind:"bin", op, l, r};
        }
        return l;
    }
    parseUn() {
        if (this.peek().t === "-") { this.eat(); return {kind:"neg", e:this.parseUn()}; }
        if (this.peek().t === "+") { this.eat(); return this.parseUn(); }
        return this.parsePri();
    }
    parsePri() {
        const t = this.peek();
        if (t.t === "num") { this.eat(); return {kind:"num", v:t.v}; }
        if (t.t === "(") {
            this.eat();
            const e = this.parseTern();
            if (this.peek().t !== ")") throw new Error("expected ')'");
            this.eat();
            return e;
        }
        if (t.t === "id") {
            this.eat();
            if (this.peek().t === "(") {
                this.eat();
                const args = [];
                if (this.peek().t !== ")") {
                    args.push(this.parseTern());
                    while (this.peek().t === ",") { this.eat(); args.push(this.parseTern()); }
                }
                if (this.peek().t !== ")") throw new Error("expected ')'");
                this.eat();
                return {kind:"call", name:t.v, args};
            }
            return {kind:"var", name:t.v};
        }
        throw new Error("unexpected " + t.t);
    }
}

// ── Noise Implementation ──
const PRM = (() => {
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    let seed = 2654435769;
    for (let i = 255; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    return p;
})();
const fade = t => t*t*t*(t*(t*6 - 15) + 10);
const lerp = (a,b,t) => a + (b-a)*t;
const grad1 = (h, x) => (h & 1) ? -x : x;
export function pnoise1(x) {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = fade(x);
    const a = PRM[X], b = PRM[X + 1];
    return (lerp(grad1(a, x), grad1(b, x - 1), u) + 1) * 0.5;
}

export let RUN_T = 0;
export let activeMags = new Array(32).fill(0);
export let smoothedAudioAmp = 0;

export function updateAudioState(mags, smoothedAmp) {
    activeMags = mags;
    smoothedAudioAmp = smoothedAmp;
}

const FNS_IMPL = {
    sin:   a => Math.sin(a[0]),
    cos:   a => Math.cos(a[0]),
    tan:   a => Math.tan(a[0]),
    abs:   a => Math.abs(a[0]),
    sqrt:  a => Math.sqrt(Math.abs(a[0])),
    pow:   a => Math.pow(a[0], a[1]),
    floor: a => Math.floor(a[0]),
    ceil:  a => Math.ceil(a[0]),
    round: a => Math.round(a[0]),
    frac:  a => a[0] - Math.floor(a[0]),
    min:   a => Math.min(a[0], a[1]),
    max:   a => Math.max(a[0], a[1]),
    clamp: a => Math.max(a[1], Math.min(a[2], a[0])),
    mix:   a => a[0] + (a[1] - a[0]) * a[2],
    lerp:  a => a[0] + (a[1] - a[0]) * a[2],
    step:  a => a[1] < a[0] ? 0 : 1,
    smoothstep: a => { let t = (a[2] - a[0]) / (a[1] - a[0]); t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); },
    wave:     a => (Math.sin(a[0] * 2 * Math.PI) + 1) * 0.5,
    triangle: a => { const f = a[0] - Math.floor(a[0]); return f < 0.5 ? f*2 : 2 - f*2; },
    square:   a => { const f = a[0] - Math.floor(a[0]); return f < (a[1] !== undefined ? a[1] : 0.5) ? 1 : 0; },
    time:     a => a[0] > 0 ? (RUN_T / a[0]) - Math.floor(RUN_T / a[0]) : 0,
    random:   () => Math.random(),
    hash:     a => (Math.sin(a[0] * 12.9898 + 78.233) * 43758.5453) % 1,
    noise:    a => pnoise1(a[0]),
    perlin1d: a => pnoise1(a[0]),
    
    // Audio Reactivity
    vu:     () => smoothedAudioAmp,
    peak:   () => smoothedAudioAmp * 1.2,
    pitch:  () => 0.5 + Math.sin(RUN_T) * 0.2,
    beat:   () => Math.pow(Math.max(0, Math.sin(RUN_T * 4.5)), 4),
    band:   a => {
        const idx = Math.max(0, Math.min(31, Math.floor(a[0])));
        return activeMags[idx] || 0;
    },
    bass:   () => (activeMags.slice(0, 4).reduce((a,b)=>a+b,0)/4),
    mid:    () => (activeMags.slice(4, 16).reduce((a,b)=>a+b,0)/12),
    treble: () => (activeMags.slice(16, 32).reduce((a,b)=>a+b,0)/16),
};

export class Evaluator {
    constructor(ast) { 
        this.ast = ast; 
        this.vars = { PI: Math.PI, TAU: Math.PI * 2 }; 
        this.lastT = 0;
    }
    run(t, freq, speed, intensity, floor) {
        const dt = this.lastT === 0 ? 0.016 : (t - this.lastT);
        this.lastT = t;

        this.vars.t = t; 
        this.vars.time = t;
        this.vars.dt = dt;
        this.vars.delta = dt;
        this.vars.freq = freq;
        this.vars.speed = speed;
        this.vars.intensity = intensity;
        this.vars.floor = floor;

        RUN_T = t;
        let lastVal = 0;
        for (const s of this.ast.stmts) {
            if (s.kind === "asn") {
                this.vars[s.name] = this.evalExpr(s.val);
            } else {
                lastVal = this.evalExpr(s.e);
            }
        }
        return Math.max(0, Math.min(1.0, lastVal));
    }
    evalExpr(e) {
        switch (e.kind) {
            case "num": return e.v;
            case "var": return this.vars[e.name] ?? 0;
            case "neg": return -this.evalExpr(e.e);
            case "bin": {
                const l = this.evalExpr(e.l), r = this.evalExpr(e.r);
                switch (e.op) {
                    case "+": return l + r;
                    case "-": return l - r;
                    case "*": return l * r;
                    case "/": return r !== 0 ? l / r : 0;
                    case "%": return r !== 0 ? l % r : 0;
                    case "<": return l < r ? 1 : 0;
                    case ">": return l > r ? 1 : 0;
                    case "<=": return l <= r ? 1 : 0;
                    case ">=": return l >= r ? 1 : 0;
                    case "==": return Math.abs(l - r) < 1e-5 ? 1 : 0;
                    case "!=": return Math.abs(l - r) >= 1e-5 ? 1 : 0;
                }
                return 0;
            }
            case "tern": return this.evalExpr(e.c) !== 0 ? this.evalExpr(e.a) : this.evalExpr(e.b);
            case "call": {
                const a = e.args.map(x => this.evalExpr(x));
                const fn = FNS_IMPL[e.name];
                if (!fn) throw new Error("unknown function: " + e.name);
                return fn(a);
            }
        }
        return 0;
    }
}
