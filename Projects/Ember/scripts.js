// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    ["lib","saved","set","help"].forEach(id => {
        const el = document.getElementById("tab-" + id);
        if (el) el.style.display = (id === t.dataset.tab) ? "" : "none";
    });
}));

// ─── SYNTAX HIGHLIGHTER ─────────────────────────────────────────────────────
const KW   = ["if","else","return"];
const FNS  = ["sin","cos","tan","abs","sqrt","pow","floor","ceil","round","frac",
              "min","max","clamp","mix","lerp","step","smoothstep",
              "wave","triangle","square","time","perlin1D","perlin1d",
              "perlin2D","perlin2d","noise","noise2","random","hash","hsv","rgb",
              "vu","peak","pitch","beat","band","bass","mid","treble"];
const KWS  = new Set(KW), FNS_S = new Set(FNS);

function highlight(src) {
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
    return out + "\n"; // trailing line for textarea spacing
}
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── EDITOR WIRING ──────────────────────────────────────────────────────────
const ta     = document.getElementById("ta");
const hl     = document.getElementById("hl");
const gutter = document.getElementById("gutter");

function syncHL() {
    const v = ta.value;
    hl.innerHTML = highlight(v);
    const lines = v.split("\n").length;
    let g = ""; for (let i = 1; i <= lines; i++) g += i + "\n";
    gutter.textContent = g;
    hl.scrollTop  = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
}
ta.addEventListener("input", () => { syncHL(); scheduleCompile(); });
ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        syncHL(); scheduleCompile();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        document.getElementById("saveBtn").click();
    }
});

// ─── LANGUAGE COMPILER & RUNTIME ────────────────────────────────────────────
function tokenize(src) {
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

class Parser {
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

// ── Deterministic Noise Logic ──
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
const grad2 = (h, x, y) => {
    const u = (h & 1) ? x : -x;
    const v = (h & 2) ? y : -y;
    return u + v;
};
function pnoise1(x) {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = fade(x);
    const a = PRM[X], b = PRM[X + 1];
    return (lerp(grad1(a, x), grad1(b, x - 1), u) + 1) * 0.5;
}
function pnoise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = PRM[X] + Y, B = PRM[X + 1] + Y;
    const r = lerp(
        lerp(grad2(PRM[A], x, y),       grad2(PRM[B], x - 1, y), u),
        lerp(grad2(PRM[A + 1], x, y - 1), grad2(PRM[B + 1], x - 1, y - 1), u),
        v);
    return (r + 1) * 0.5;
}
function ihash(x) {
    let u = (Math.floor(x * 1000)) | 0;
    u ^= u >>> 16; u = Math.imul(u, 0x7feb352d);
    u ^= u >>> 15; u = Math.imul(u, 0x846ca68b);
    u ^= u >>> 16;
    return (u & 0xFFFFFF) / 0x1000000;
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
    perlin1D: a => pnoise1(a[0]),
    perlin1d: a => pnoise1(a[0]),
    perlin2D: a => pnoise2(a[0], a[1]),
    perlin2d: a => pnoise2(a[0], a[1]),
    noise:    a => pnoise1(a[0]),
    noise2:   a => pnoise2(a[0], a[1]),
    random:   () => Math.random(),
    hash:     a => ihash(a[0]),
    // Audio Reactivity Bindings
    vu:     () => LIVE_AUDIO.vu,
    peak:   () => LIVE_AUDIO.peak,
    pitch:  () => LIVE_AUDIO.pitch,
    beat:   () => LIVE_AUDIO.beat,
    band:   a => {
        let n = Math.max(0, Math.min(7, Math.floor(a[0])));
        return LIVE_AUDIO.bands[n] || 0;
    },
    bass:   () => (LIVE_AUDIO.bands[0] + LIVE_AUDIO.bands[1]) * 0.5,
    mid:    () => (LIVE_AUDIO.bands[3] + LIVE_AUDIO.bands[4]) * 0.5,
    treble: () => (LIVE_AUDIO.bands[6] + LIVE_AUDIO.bands[7]) * 0.5,
};

let RUN_T = 0;
const LIVE_AUDIO = { vu: 0, peak: 0, pitch: 0, beat: 0, bands: [0,0,0,0,0,0,0,0] };

class Evaluator {
    constructor(ast) { this.ast = ast; this.reset(); }
    reset() {
        this.vars = {PI: Math.PI, TAU: Math.PI * 2};
        this.out = {useRGB: false, h: 0, s: 1, v: 1, r: 0, g: 0, b: 0};
    }
    run(i, n, t) {
        this.reset();
        this.vars.i = i; this.vars.index = i;
        this.vars.n = n; this.vars.pixelCount = n;
        this.vars.t = t; this.vars.time = t;
        RUN_T = t;
        for (const s of this.ast.stmts) this.evalStmt(s);
        return this.out;
    }
    evalStmt(s) {
        if (s.kind === "asn") this.vars[s.name] = this.evalExpr(s.val);
        else this.evalExpr(s.e);
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
                    case "%": return r !== 0 ? l - Math.floor(l/r)*r : 0;
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
                if (e.name === "hsv") { this.out.useRGB = false; this.out.h = a[0]; this.out.s = a[1]; this.out.v = a[2]; return 0; }
                if (e.name === "rgb") { this.out.useRGB = true;  this.out.r = a[0]; this.out.g = a[1]; this.out.b = a[2]; return 0; }
                const fn = FNS_IMPL[e.name];
                if (!fn) throw new Error("unknown function: " + e.name);
                return fn(a);
            }
        }
        return 0;
    }
}

function hsv2rgb(h, s, v) {
    h = ((h % 1) + 1) % 1;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
        case 0: r=v; g=t; b=p; break;
        case 1: r=q; g=v; b=p; break;
        case 2: r=p; g=v; b=t; break;
        case 3: r=p; g=q; b=v; break;
        case 4: r=t; g=p; b=v; break;
        case 5: r=v; g=p; b=q; break;
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

// ─── RENDERING & LOOP ENGINE ────────────────────────────────────────────────
const prev = document.getElementById("prev");
const pctx = prev.getContext("2d");

const heroCanvas = document.getElementById("hero-canvas");
const hctx = heroCanvas.getContext("2d");

let evalr = null;
let pixelCount = 60;
let brightness = 255;

function recompileLocal() {
    const src = ta.value;
    try {
        const ast = new Parser(tokenize(src)).parseProgram();
        evalr = new Evaluator(ast);
        showError("", true);
    } catch (e) {
        showError("Local error: " + e.message, false);
        evalr = null;
    }
}

function showError(msg, ok) {
    const el = document.getElementById("err");
    if (!msg) {
        el.textContent = "compiled ✓";
        el.classList.add("ok");
    } else {
        el.textContent = msg;
        el.classList.toggle("ok", !!ok);
    }
}

let lastFPSUpdate = 0;
let frameCount = 0;

function tick(ts) {
    const t = ts * 0.001;
    
    // FPS counter
    frameCount++;
    if (ts - lastFPSUpdate >= 1000) {
        const fps = Math.round((frameCount * 1000) / (ts - lastFPSUpdate));
        document.getElementById("sim-fps").textContent = fps + " FPS";
        frameCount = 0;
        lastFPSUpdate = ts;
    }

    // Run virtual sequencer if microreactivity is off
    if (document.getElementById("micSrc").value === "0") {
        runVirtualAudioSequencer(t);
    }

    if (evalr) {
        const n = pixelCount;
        
        // 1. Sync Portal Preview Canvas
        prev.width = n;
        prev.height = 1;
        const img = pctx.createImageData(n, 1);
        
        // 2. Sync Hero Presentation Canvas
        heroCanvas.width = 600;
        heroCanvas.height = 1;
        const hImg = hctx.createImageData(600, 1);

        const bRatio = brightness / 255;

        // Render preview strip
        for (let i = 0; i < n; i++) {
            let r, g, b;
            try {
                const o = evalr.run(i, n, t);
                if (o.useRGB) {
                    r = Math.max(0, Math.min(255, Math.round(o.r*255)));
                    g = Math.max(0, Math.min(255, Math.round(o.g*255)));
                    b = Math.max(0, Math.min(255, Math.round(o.b*255)));
                } else {
                    [r, g, b] = hsv2rgb(o.h, o.s, o.v);
                }
            } catch { r = g = b = 0; }
            img.data[i*4]     = Math.round(r * bRatio);
            img.data[i*4 + 1] = Math.round(g * bRatio);
            img.data[i*4 + 2] = Math.round(b * bRatio);
            img.data[i*4 + 3] = 255;
        }
        pctx.putImageData(img, 0, 0);

        // Render hero animation strip (600 virtual pixels)
        for (let i = 0; i < 600; i++) {
            let r, g, b;
            try {
                const o = evalr.run(i, 600, t);
                if (o.useRGB) {
                    r = Math.max(0, Math.min(255, Math.round(o.r*255)));
                    g = Math.max(0, Math.min(255, Math.round(o.g*255)));
                    b = Math.max(0, Math.min(255, Math.round(o.b*255)));
                } else {
                    [r, g, b] = hsv2rgb(o.h, o.s, o.v);
                }
            } catch { r = g = b = 0; }
            hImg.data[i*4]     = r;
            hImg.data[i*4 + 1] = g;
            hImg.data[i*4 + 2] = b;
            hImg.data[i*4 + 3] = 255;
        }
        hctx.putImageData(hImg, 0, 0);
    }
    requestAnimationFrame(tick);
}

// ─── AUDIO REAL-TIME ANALYZER & SIMULATOR ────────────────────────────────────
let audioCtx = null;
let analyser = null;
let micStream = null;
let audioEnabled = false;

async function toggleMicrophone() {
    const btn = document.getElementById("audio-mic-toggle");
    const option = document.getElementById("mic-browser-option");
    
    if (audioEnabled) {
        // Disabling Mic
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            micStream = null;
        }
        btn.classList.remove("active");
        btn.querySelector("span").textContent = "Enable Live Mic";
        document.getElementById("micSrc").value = "0";
        option.disabled = true;
        audioEnabled = false;
        showError("Microphone disabled.", true);
    } else {
        // Enabling Mic
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            
            // Setup Web Audio
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(micStream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512; // 256 frequency bins
            
            source.connect(analyser);
            
            btn.classList.add("active");
            btn.querySelector("span").textContent = "Mic Enabled";
            option.disabled = false;
            document.getElementById("micSrc").value = "1";
            audioEnabled = true;
            
            showError("Microphone active! Try reactive patterns.", true);
            
            runRealTimeAudioFFT();
        } catch (e) {
            showError("Mic denied/unsupported: " + e.message, false);
            option.disabled = true;
            document.getElementById("micSrc").value = "0";
        }
    }
}

document.getElementById("audio-mic-toggle").addEventListener("click", toggleMicrophone);
document.getElementById("micSrc").addEventListener("change", (e) => {
    if (e.target.value === "1" && !audioEnabled) {
        toggleMicrophone();
    }
});

// Calculate real FFT
function runRealTimeAudioFFT() {
    if (!audioEnabled || !analyser) return;

    const bins = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bins);
    
    const analyze = () => {
        if (!audioEnabled || !analyser) return;
        
        analyser.getByteFrequencyData(freqData);
        
        // 1. Calculate VU level (RMS)
        let sum = 0;
        for (let i = 0; i < bins; i++) {
            const v = freqData[i] / 255;
            sum += v * v;
        }
        const currentVU = Math.sqrt(sum / bins);
        
        // Smoothing and gain sliders
        const gain = document.getElementById("micGain").value / 100;
        const smooth = document.getElementById("micSmooth").value / 100;
        
        LIVE_AUDIO.vu = LIVE_AUDIO.vu * smooth + currentVU * (1 - smooth) * gain;
        LIVE_AUDIO.vu = Math.min(1.0, LIVE_AUDIO.vu);
        
        // Peak tracking with slow decay
        LIVE_AUDIO.peak = Math.max(LIVE_AUDIO.vu, LIVE_AUDIO.peak - 0.005);
        
        // Simple beat detector
        if (LIVE_AUDIO.vu > LIVE_AUDIO.peak * 0.85 && LIVE_AUDIO.vu > 0.15) {
            LIVE_AUDIO.beat = 1.0;
        } else {
            LIVE_AUDIO.beat = Math.max(0, LIVE_AUDIO.beat - 0.08);
        }

        // 2. Map logarithmic frequency bands (8 divisions)
        // Split 256 bins into 8 bands logarithmically:
        // Band 0: indices 0..2
        // Band 1: indices 3..5
        // Band 2: indices 6..10
        // Band 3: indices 11..18
        // Band 4: indices 19..32
        // Band 5: indices 33..56
        // Band 6: indices 57..100
        // Band 7: indices 101..255
        const ranges = [
            [0, 2], [3, 5], [6, 10], [11, 18],
            [19, 32], [33, 56], [57, 100], [101, 255]
        ];
        
        let maxVal = 0;
        let peakIdx = 0;

        for (let b = 0; b < 8; b++) {
            const [start, end] = ranges[b];
            let bSum = 0;
            for (let i = start; i <= end; i++) {
                const val = freqData[i] / 255;
                bSum += val;
                if (val > maxVal) {
                    maxVal = val;
                    peakIdx = i;
                }
            }
            const count = end - start + 1;
            const targetBandVal = (bSum / count) * gain;
            LIVE_AUDIO.bands[b] = LIVE_AUDIO.bands[b] * smooth + targetBandVal * (1 - smooth);
            LIVE_AUDIO.bands[b] = Math.min(1.0, LIVE_AUDIO.bands[b]);
        }

        // Dominant Pitch Estimation
        LIVE_AUDIO.pitch = peakIdx / bins;

        // Render Sidebar visualizer EQ bars
        updateEQVisualizer();
        
        requestAnimationFrame(analyze);
    };
    
    requestAnimationFrame(analyze);
}

// Procedural Sequencer Fallback: Makes elements dance beautifully without mic
function runVirtualAudioSequencer(t) {
    // Generate a rhythmic virtual sequence
    const beatInterval = 1.2; // 100 BPM
    const beatPhase = (t % beatInterval) / beatInterval;
    
    // Virtual kick beat
    const kick = Math.pow(Math.max(0, 1.0 - beatPhase * 4.0), 3.0);
    
    // Dynamic synth swells
    const swell = pnoise1(t * 0.4) * 0.4 + 0.15;
    
    // Treble sparkles
    const hihat = (t % 0.3 < 0.05) ? 0.3 * Math.random() : 0.05 * Math.random();

    LIVE_AUDIO.vu = swell + kick * 0.4 + hihat * 0.2;
    LIVE_AUDIO.peak = Math.max(LIVE_AUDIO.vu, LIVE_AUDIO.peak - 0.005);
    LIVE_AUDIO.beat = kick > 0.4 ? 1.0 : Math.max(0, LIVE_AUDIO.beat - 0.08);

    // Dynamic procedural logarithm EQ bands
    LIVE_AUDIO.bands[0] = kick * 0.9 + swell * 0.3; // Bass
    LIVE_AUDIO.bands[1] = kick * 0.7 + swell * 0.4;
    LIVE_AUDIO.bands[2] = swell * 0.6 + pnoise1(t + 2) * 0.2;
    LIVE_AUDIO.bands[3] = swell * 0.7 + pnoise2(t, 4) * 0.2; // Mid
    LIVE_AUDIO.bands[4] = swell * 0.5 + pnoise1(t * 1.5) * 0.3;
    LIVE_AUDIO.bands[5] = swell * 0.3 + pnoise2(t, t * 0.1) * 0.2;
    LIVE_AUDIO.bands[6] = hihat * 0.8 + pnoise1(t * 3.0) * 0.15; // Treble
    LIVE_AUDIO.bands[7] = hihat * 1.0 + pnoise2(t * 4.0, 100) * 0.1;

    LIVE_AUDIO.pitch = 0.1 + pnoise1(t * 0.5) * 0.5 + kick * 0.1;

    updateEQVisualizer();
}

function updateEQVisualizer() {
    const bars = document.querySelectorAll(".bars-container .bar");
    if (bars.length === 8) {
        for (let i = 0; i < 8; i++) {
            bars[i].style.height = Math.round(Math.max(4, LIVE_AUDIO.bands[i] * 100)) + "%";
        }
    }
    document.getElementById("vuVal").textContent = LIVE_AUDIO.vu.toFixed(2);
}

// Disable mic option in selector if permissions aren't verified yet
document.getElementById("mic-browser-option").disabled = true;

// ─── PATTERN LIBRARY & DEMOS ────────────────────────────────────────────────
const DEMO_PATTERNS = [
    {
        name: "Rainbow Drift",
        tags: ["classic", "smooth"],
        code: "// Smooth rainbow drift across the strip.\nh = i/n + time(8);\nhsv(h, 1, 1);"
    },
    {
        name: "Breathing Aurora",
        tags: ["calm", "perlin"],
        code: "// Slow organic colour wash, breathes in brightness.\nh = perlin1D(i*0.05 + t*0.1)*0.4 + 0.5;\nb = wave(time(6));\nhsv(h, 1, b*0.9 + 0.1);"
    },
    {
        name: "Fire Lick",
        tags: ["fire", "hot"],
        code: "// Hot core, cooler tips, animated with perlin.\ny = i/n;\nflame = perlin2D(y*3, t*1.4);\nh = 0.05 - flame*0.05;\nv = clamp(flame*1.5 - y*0.4, 0, 1);\nhsv(h, 1, v);"
    },
    {
        name: "KITT Scanner",
        tags: ["motion", "scan"],
        code: "// Knight-Rider sweep with falloff.\npos = (triangle(time(3)))*n;\nd = abs(i - pos);\nv = clamp(1 - d/4, 0, 1);\nhsv(0, 1, v*v);"
    },
    {
        name: "Plasma Field",
        tags: ["plasma", "perlin"],
        code: "// Drifting plasma space.\nx = i/n;\np = perlin2D(x*4 + t*0.3, t*0.2);\nh = p + time(20);\nhsv(h, 1, 1);"
    },
    {
        name: "Frequency Rainbow",
        tags: ["audio", "reactive"],
        code: "// Bass=red, mids=green, highs=purple.\n// Pixels map directly to log audio frequencies!\nb = floor(i / n * 8);\nlev = band(b);\nhsv(b/8 * 0.83, 1, lev);"
    },
    {
        name: "VU Meter",
        tags: ["audio", "meter"],
        code: "// Pixels light up to the current VU level.\n// Green bottom, yellow mid, red top.\nlevel = vu();\nx = i/n;\nlit = x < level ? 1 : 0;\nh = (1 - x) * 0.33;\nhsv(h, 1, lit);"
    },
    {
        name: "Bass Bloom",
        tags: ["audio", "bass"],
        code: "// Bass drives brightness, ambient drift drives hue.\nh = perlin1D(i*0.05 + t*0.2);\nv = bass()*1.3 + 0.05;\nhsv(h, 1, clamp(v, 0, 1));"
    }
];

function renderLibrary(patterns) {
    const root = document.getElementById("libCards");
    if (!root) return;
    root.innerHTML = "";
    patterns.forEach(p => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <div class="name">${esc(p.name)}</div>
            <canvas width="100" height="8"></canvas>
            <div class="tags">${(p.tags||[]).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>`;
        
        // Draw static frame preview
        setTimeout(() => renderCardPreview(card.querySelector("canvas"), p.code), 50);
        
        card.addEventListener("click", () => {
            ta.value = p.code;
            document.getElementById("saveName").value = p.name;
            document.getElementById("patternName").textContent = p.name;
            syncHL();
            scheduleCompile();
        });
        root.appendChild(card);
    });
}

function renderCardPreview(canvas, code) {
    try {
        const ast = new Parser(tokenize(code)).parseProgram();
        const ev = new Evaluator(ast);
        const ctx = canvas.getContext("2d");
        const n = canvas.width;
        const img = ctx.createImageData(n, 1);
        for (let i = 0; i < n; i++) {
            const o = ev.run(i, n, 12.5); // static frame clock
            let r, g, b;
            if (o.useRGB) { r = Math.round(o.r*255); g = Math.round(o.g*255); b = Math.round(o.b*255); }
            else          { [r,g,b] = hsv2rgb(o.h, o.s, o.v); }
            img.data[i*4]   = Math.max(0, Math.min(255, r));
            img.data[i*4+1] = Math.max(0, Math.min(255, g));
            img.data[i*4+2] = Math.max(0, Math.min(255, b));
            img.data[i*4+3] = 255;
        }
        ctx.putImageData(img, 0, 0);
    } catch {}
}

// ─── LOCAL STORAGE MANAGEMENT ───────────────────────────────────────────────
function getSavedPatterns() {
    let raw = localStorage.getItem("ember_saved");
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

function savePattern(name, code) {
    const list = getSavedPatterns();
    list[name] = code;
    localStorage.setItem("ember_saved", JSON.stringify(list));
    renderSavedList();
}

function deletePattern(name) {
    const list = getSavedPatterns();
    delete list[name];
    localStorage.setItem("ember_saved", JSON.stringify(list));
    renderSavedList();
}

function renderSavedList() {
    const list = getSavedPatterns();
    const root = document.getElementById("savedChips");
    if (!root) return;
    root.innerHTML = "";
    const keys = Object.keys(list);
    
    if (keys.length === 0) {
        root.innerHTML = '<span class="hint">No custom patterns saved. Click "Save" above to store your creations!</span>';
        return;
    }
    
    keys.forEach(name => {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${esc(name)}</span><span class="x" title="Delete">×</span>`;
        
        chip.firstChild.addEventListener("click", () => {
            ta.value = list[name];
            document.getElementById("saveName").value = name;
            document.getElementById("patternName").textContent = name;
            syncHL();
            scheduleCompile();
        });
        
        chip.lastChild.addEventListener("click", e => {
            e.stopPropagation();
            if (confirm(`Delete "${name}" from browser storage?`)) {
                deletePattern(name);
            }
        });
        
        root.appendChild(chip);
    });
}

// ─── TOOLBAR & SETTINGS ACTION BINDINGS ──────────────────────────────────────
let compileTimer = 0;
function scheduleCompile() {
    recompileLocal();
}

document.getElementById("saveBtn").addEventListener("click", () => {
    const name = document.getElementById("saveName").value.trim() || "Untitled";
    savePattern(name, ta.value);
    showError(`Saved "${name}" to browser local storage.`, true);
});

document.getElementById("newBtn").addEventListener("click", () => {
    ta.value = "// New pattern\nh = i/n;\nhsv(h, 1, 1);\n";
    document.getElementById("saveName").value = "New Pattern";
    document.getElementById("patternName").textContent = "New Pattern";
    syncHL();
    scheduleCompile();
});

// Strip hardware setting changes
const bright = document.getElementById("bright");
bright.addEventListener("input", () => {
    document.getElementById("brightVal").textContent = bright.value;
    brightness = +bright.value;
});

const pin = document.getElementById("pin");
pin.addEventListener("change", () => {
    document.getElementById("prevPin").textContent = "GPIO " + pin.value;
});

const count = document.getElementById("count");
count.addEventListener("input", () => {
    const val = parseInt(count.value) || 30;
    pixelCount = Math.max(10, Math.min(300, val));
    document.getElementById("prevCount").textContent = pixelCount;
});

// ─── INITIALIZATION ─────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
    // Initial pattern loader
    ta.value = "// Tweak me! Changes preview immediately below and in the hero banner.\nh = i/n + time(8);\nhsv(h, 1, 1);\n";
    syncHL();
    recompileLocal();

    // Render components
    renderLibrary(DEMO_PATTERNS);
    renderSavedList();

    // Kickoff animations
    requestAnimationFrame(tick);
});
