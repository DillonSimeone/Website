import {
    getFrequencyBins,
    getRmsAmplitude,
    getBassMidTreble,
    getPartitionDividers,
    isAudioLive,
    applyBassPulseToDocument
} from './presentation-audio.js';

const HISTORY_LEN = 220;
const waveHistory = [];
const colorHistory = [];
let timeSec = 0;
let mechOffset = 0;
let ermAngle = 0;
let pwmVal = 50;
let pwmDir = 1;
let pwmSynthetic = true;
let activeSlideIndex = 0;
let rafId = null;

/** Title slide bouncing Bauhaus shapes */
const titleShapes = [
    { type: 'circle', x: 0.2, y: 0.3, size: 120, color: '#002f6c', speedX: 0.5, speedY: 0.3 },
    { type: 'rect', x: 0.75, y: 0.2, w: 180, h: 180, color: '#f2b134', speedX: -0.4, speedY: 0.2 }
];

/** FFT slide: floating motor particles */
let motorParticles = [];
let motorParticlesInit = false;

for (let i = 0; i < HISTORY_LEN; i++) {
    waveHistory.push(0.5);
    colorHistory.push('rgba(226, 59, 36, 0.35)');
}

export function setActiveSlideIndex(idx) {
    activeSlideIndex = idx;
}

function setupCanvas(canvas) {
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.offsetWidth;
    const h = canvas.clientHeight || canvas.offsetHeight;
    if (!w || !h) return null;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

function drawTitleCanvas(canvas) {
    if (!canvas || activeSlideIndex !== 0) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const { bass } = getBassMidTreble();
    const rms = getRmsAmplitude();
    const pulse = isAudioLive() ? 0.85 + bass * 0.3 : 1;

    ctx.fillStyle = '#e23b24';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = `rgba(17, 17, 17, ${0.06 + rms * 0.12})`;
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    titleShapes.forEach(s => {
        ctx.fillStyle = s.color;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 6;
        if (s.type === 'circle') {
            s.x += s.speedX / w;
            s.y += s.speedY / h;
            const px = s.x * w;
            const py = s.y * h;
            const r = s.size * pulse;
            if (px - r < 0 || px + r > w) s.speedX *= -1;
            if (py - r < 0 || py + r > h) s.speedY *= -1;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else {
            s.x += s.speedX / w;
            s.y += s.speedY / h;
            const rx = s.x * w;
            const ry = s.y * h;
            if (rx < 0 || rx + s.w > w) s.speedX *= -1;
            if (ry < 0 || ry + s.h > h) s.speedY *= -1;
            ctx.fillRect(rx, ry, s.w, s.h);
            ctx.strokeRect(rx, ry, s.w, s.h);
        }
    });

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.lineTo(w, h * 0.8);
    ctx.stroke();
}

function drawSingleWave(ctx, w, h, freq, color, amp, offset) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const step = freq > 100 ? 1 : 2;
    for (let x = 0; x < w; x += step) {
        const y = h / 2 + Math.sin((x + offset) * (freq * 0.005)) * (h * 0.38 * amp);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawMechWaves() {
    if (activeSlideIndex !== 6) return;
    const amp = isAudioLive() ? 0.45 + getRmsAmplitude() * 0.55 : 0.45;
    const waves = [
        { id: 'mechWave250', freq: 250, color: '#002f6c' },
        { id: 'mechWave40', freq: 40, color: '#f2b134' },
        { id: 'mechWave5', freq: 5, color: '#e23b24' }
    ];
    waves.forEach(w => {
        const canvas = document.getElementById(w.id);
        const setup = setupCanvas(canvas);
        if (!setup) return;
        const { ctx, w: cw, h: ch } = setup;
        ctx.fillStyle = '#f4ebd0';
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        for (let i = 0; i < cw; i += 24) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, ch); ctx.stroke();
        }
        drawSingleWave(ctx, cw, ch, w.freq, w.color, amp, mechOffset);
    });
    mechOffset -= 10;
}

function drawSolenoidServo(canvas) {
    if (!canvas || activeSlideIndex !== 7) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const t = timeSec;
    const solPhase = (Math.sin(t * 6) + 1) / 2;
    const servoAngle = Math.sin(t * 2.2) * 0.55;

    ctx.fillStyle = '#f4ebd0';
    ctx.fillRect(0, 0, w, h);

    const mid = w / 2;
    const solX = mid * 0.5;
    const servX = mid * 1.5;

    ctx.fillStyle = '#111';
    ctx.fillRect(solX - 50, h * 0.35, 100, 28);
    const plungerY = h * 0.35 - solPhase * 55;
    ctx.fillStyle = '#e23b24';
    ctx.fillRect(solX - 12, plungerY, 24, 55);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.strokeRect(solX - 50, h * 0.35, 100, 28);

    ctx.font = 'bold 13px JetBrains Mono';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.fillText('SOLENOID TAP', solX, h * 0.82);

    ctx.save();
    ctx.translate(servX, h * 0.62);
    ctx.rotate(servoAngle);
    ctx.fillStyle = '#002f6c';
    ctx.fillRect(-8, -70, 16, 70);
    ctx.fillStyle = '#f2b134';
    ctx.fillRect(-35, -78, 70, 14);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.strokeRect(-8, -70, 16, 70);
    ctx.strokeRect(-35, -78, 70, 14);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(servX, h * 0.62, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.fillText('SERVO PRESSURE', servX, h * 0.82);
}

function drawERMLRA() {
    if (activeSlideIndex !== 8) return;
    const { mid, treble } = getBassMidTreble();
    const midBoost = isAudioLive() ? mid : 0.3;

    const disc = document.getElementById('ermDisc');
    const ermContainer = document.getElementById('ermContainer');
    if (disc && ermContainer) {
        ermAngle += 0.6 + midBoost * 2.5;
        disc.style.transform = `rotate(${ermAngle}deg)`;
        const dx = (Math.random() - 0.5) * midBoost * 3;
        const dy = (Math.random() - 0.5) * midBoost * 3;
        ermContainer.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    const mass = document.getElementById('lraMass');
    const spring = document.getElementById('lraSpring');
    if (mass && spring) {
        const t = treble || 0.2;
        const offset = Math.sin(timeSec * 12) * (8 + t * 14);
        mass.style.top = `${72 + offset}px`;
        spring.style.height = `${56 + offset}px`;
    }
}

function drawMotorInternals(canvas) {
    if (!canvas || activeSlideIndex !== 9) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const spin = timeSec * 3;

    ctx.fillStyle = '#f4ebd0';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.38;
    const cy = h * 0.5;

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
        const a = spin + (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
        ctx.lineTo(cx + Math.cos(a) * 95, cy + Math.sin(a) * 95);
        ctx.stroke();
    }

    ctx.fillStyle = '#002f6c';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e23b24';
    ctx.beginPath();
    ctx.arc(cx + 38, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const rx = w * 0.72;
    ctx.font = 'bold 14px Archivo Black';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.fillText('COIL + SHAFT', rx, h * 0.28);
    ctx.font = '13px Inter';
    ctx.fillText('Wire wrapped around a core.', rx, h * 0.38);
    ctx.fillText('Surrounded by magnets.', rx, h * 0.48);
    ctx.fillText('Current pushes the shaft', rx, h * 0.58);
    ctx.fillText('off magnetic fields.', rx, h * 0.68);
    ctx.fillText('That oscillation is vibration.', rx, h * 0.78);
}

function drawPWMRibbon(canvas) {
    if (!canvas || activeSlideIndex !== 12) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    if (isAudioLive()) {
        pwmVal = Math.min(100, Math.max(0, getRmsAmplitude() * 100));
        pwmSynthetic = false;
    } else if (pwmSynthetic) {
        pwmVal += pwmDir * 0.5;
        if (pwmVal >= 100) { pwmVal = 100; pwmDir = -1; }
        else if (pwmVal <= 0) { pwmVal = 0; pwmDir = 1; }
    }

    const valText = document.getElementById('pwmVal');
    if (valText) valText.textContent = Math.round(pwmVal) + '%';

    const rawVal = pwmVal / 100;
    waveHistory.shift();
    waveHistory.push(rawVal);
    colorHistory.shift();
    colorHistory.push(`rgba(226, 59, 36, ${0.15 + (pwmVal / 100) * 0.3})`);

    ctx.fillStyle = '#f4ebd0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(17, 17, 17, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    if (waveHistory.length > 1) {
        const step = w / (HISTORY_LEN - 1);
        for (let i = 0; i < waveHistory.length - 1; i++) {
            const h1_val = waveHistory[i] * (h - 15);
            const h2_val = waveHistory[i + 1] * (h - 15);
            const x1 = i * step;
            const x2 = (i + 1) * step;
            ctx.fillStyle = colorHistory[i] || 'rgba(226, 59, 36, 0.25)';
            const baselineY = h / 2;
            const y1_top = baselineY - Math.sin(timeSec * 5 + i * 0.05) * h1_val * 0.4;
            const y2_top = baselineY - Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2_val * 0.4;
            const y1_bot = baselineY + Math.sin(timeSec * 5 + i * 0.05) * h1_val * 0.4;
            const y2_bot = baselineY + Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2_val * 0.4;
            ctx.beginPath();
            ctx.moveTo(x1, y1_top - h1_val / 2);
            ctx.lineTo(x2, y2_top - h2_val / 2);
            ctx.lineTo(x2, y2_bot + h2_val / 2);
            ctx.lineTo(x1, y1_bot + h1_val / 2);
            ctx.closePath();
            ctx.fill();
        }
    }
}

function drawFFTBars(container) {
    if (!container || activeSlideIndex !== 14) return;
    const mags = getFrequencyBins();
    const dividers = getPartitionDividers();
    const numBins = dividers.length + 1;
    const energies = [];

    container.innerHTML = '';
    for (let i = 0; i < numBins; i++) {
        const start = i === 0 ? 0 : dividers[i - 1];
        const end = i === numBins - 1 ? mags.length : dividers[i];
        let sum = 0;
        for (let j = start; j < end; j++) sum += mags[j];
        const avg = sum / Math.max(1, end - start);
        energies.push(avg);
        const heightPct = Math.max(8, avg * 95);
        const bar = document.createElement('div');
        bar.className = 'fft-bar';
        bar.style.height = `${heightPct}%`;
        if (i === 0) bar.style.backgroundColor = 'var(--bauhaus-red)';
        else if (i === 1) bar.style.backgroundColor = 'var(--bauhaus-yellow)';
        else bar.style.backgroundColor = 'var(--bauhaus-blue)';
        const label = document.createElement('span');
        label.className = 'fft-bar-label';
        label.textContent = i === 0 ? 'BASS' : i === 1 ? 'MID' : 'TREBLE';
        bar.appendChild(label);
        container.appendChild(bar);
    }
    return energies;
}

function initMotorParticles(w, h) {
    if (motorParticlesInit && motorParticles.length) return;
    motorParticles = [];
    const types = ['erm', 'lra'];
    const colors = ['#e23b24', '#f2b134', '#002f6c'];
    for (let i = 0; i < 28; i++) {
        motorParticles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 1.2,
            vy: (Math.random() - 0.5) * 1.2,
            type: types[Math.random() > 0.5 ? 1 : 0],
            bin: Math.floor(Math.random() * 3),
            size: 10 + Math.random() * 22,
            angle: Math.random() * Math.PI * 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    motorParticlesInit = true;
}

function drawMotorSwarm(canvas, energies) {
    if (!canvas || activeSlideIndex !== 14) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const e = energies || [0.2, 0.2, 0.2];
    initMotorParticles(w, h);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    motorParticles.forEach(p => {
        const energy = e[p.bin] || 0.1;
        p.x += p.vx * (0.4 + energy * 2.5);
        p.y += p.vy * (0.4 + energy * 2.5);
        if (p.x < p.size) { p.x = p.size; p.vx *= -1; }
        if (p.x > w - p.size) { p.x = w - p.size; p.vx *= -1; }
        if (p.y < p.size) { p.y = p.size; p.vy *= -1; }
        if (p.y > h - p.size) { p.y = h - p.size; p.vy *= -1; }

        const shake = energy * 6;
        const dx = (Math.random() - 0.5) * shake;
        const dy = (Math.random() - 0.5) * shake;
        const binColor = p.bin === 0 ? '#e23b24' : p.bin === 1 ? '#f2b134' : '#002f6c';

        ctx.save();
        ctx.translate(p.x + dx, p.y + dy);
        if (p.type === 'erm') {
            p.angle += 0.08 + energy * 0.35;
            ctx.rotate(p.angle);
            ctx.fillStyle = '#f2b134';
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = binColor;
            ctx.beginPath();
            ctx.arc(p.size * 0.2, -p.size * 0.15, p.size * 0.18, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const bob = Math.sin(timeSec * 14 + p.x) * energy * p.size * 0.35;
            ctx.fillStyle = binColor;
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.fillRect(-p.size * 0.35, bob - p.size * 0.15, p.size * 0.7, p.size * 0.3);
            ctx.strokeRect(-p.size * 0.35, bob - p.size * 0.15, p.size * 0.7, p.size * 0.3);
            ctx.fillStyle = '#111';
            ctx.fillRect(-2, bob - p.size * 0.55, 4, p.size * 0.4);
        }
        ctx.restore();
    });
}

function updateMicStatusBtn() {
    const btn = document.getElementById('micStatusBtn');
    if (!btn) return;
    if (isAudioLive()) {
        btn.textContent = 'MICROPHONE ACTIVE (LIVE FFT)';
        btn.style.background = '#2d6a4f';
    } else {
        btn.textContent = 'CLICK OR PRESS ARROW TO ENABLE MIC';
        btn.style.background = 'var(--bauhaus-red)';
    }
}

function tick() {
    timeSec += 0.016;
    applyBassPulseToDocument();

    drawTitleCanvas(document.getElementById('bauhausTitleCanvas'));
    drawMechWaves();
    drawSolenoidServo(document.getElementById('solenoidServoCanvas'));
    drawERMLRA();
    drawMotorInternals(document.getElementById('motorInternalsCanvas'));
    drawPWMRibbon(document.getElementById('pwmWaveCanvas'));
    const energies = drawFFTBars(document.getElementById('fftVisualizerContainer'));
    drawMotorSwarm(document.getElementById('fftMotorSwarm'), energies);
    drawUploaderMockup(document.getElementById('uploaderMockup'));
    drawUploaderEsp32(document.getElementById('uploaderEsp32'));
    updateMicStatusBtn();

    rafId = requestAnimationFrame(tick);
}

export function startVizLoop() {
    if (rafId) return;
    tick();
}

export function stopVizLoop() {
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

export function onSlideEnter(index) {
    activeSlideIndex = index;
}

export function onSlideLeave(_index) {
    /* global loop continues */
}

/* ── Uploader Mockup Animation ── */
const UPL_CYCLE = 12;       // seconds per full animation cycle
const UPL_FADE_DUR = 0.6;   // fade in/out duration
let uplStartTime = null;

const UPL_PROJECTS = [
    { name: "blinky", board: "esp32-c3-devkitm-1", envs: ["debug", "release"] },
    { name: "haptic-driver", board: "esp32-c6", envs: ["wifi", "ble"] },
    { name: "servo-sweep", board: "esp32-s3", envs: ["default"] },
];

const UPL_PHASES = [
    { t: 0.0, id: "idle" },
    { t: 0.10, id: "select" },      // cursor clicks blinky project
    { t: 0.25, id: "selected" },    // workspace card appears
    { t: 0.40, id: "click-flash" }, // cursor clicks BUILD & FLASH
    { t: 0.50, id: "flashing" },    // progress bar fills
    { t: 0.75, id: "done" },        // success
    { t: 0.88, id: "fadeout" },     // fade to black
    { t: 1.0, id: "reset" },
];

function getUplPhase(progress) {
    for (let i = UPL_PHASES.length - 1; i >= 0; i--) {
        if (progress >= UPL_PHASES[i].t) {
            const next = UPL_PHASES[i + 1] || { t: 1 };
            const local = (progress - UPL_PHASES[i].t) / (next.t - UPL_PHASES[i].t);
            return { id: UPL_PHASES[i].id, local: Math.min(local, 1) };
        }
    }
    return { id: "idle", local: 0 };
}

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawUploaderMockup(canvas) {
    if (!canvas || activeSlideIndex !== 4) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    if (uplStartTime === null) uplStartTime = timeSec;
    const elapsed = timeSec - uplStartTime;
    const progress = (elapsed % UPL_CYCLE) / UPL_CYCLE;
    const phase = getUplPhase(progress);

    // fade envelope
    let alpha = 1;
    if (progress < UPL_FADE_DUR / UPL_CYCLE) {
        alpha = progress / (UPL_FADE_DUR / UPL_CYCLE);
    } else if (phase.id === "fadeout") {
        alpha = 1 - phase.local;
    }
    ctx.globalAlpha = alpha;

    // bg
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, w, h);

    const pad = 6;
    const sidebarW = w * 0.30;

    // sidebar
    ctx.fillStyle = '#111114';
    ctx.fillRect(0, 0, sidebarW, h);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, sidebarW, h);

    // sidebar title
    ctx.fillStyle = '#00f0ff';
    ctx.font = `bold ${Math.max(6, h * 0.045)}px Inter, sans-serif`;
    ctx.fillText('PROJECT CATALOG', pad, h * 0.12);

    // project list
    const itemH = h * 0.14;
    const startY = h * 0.18;
    UPL_PROJECTS.forEach((proj, i) => {
        const y = startY + i * (itemH + 4);
        const isSelected = (phase.id !== 'idle') && i === 0;
        ctx.fillStyle = isSelected ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.03)';
        drawRoundRect(ctx, pad, y, sidebarW - pad * 2, itemH, 3);
        ctx.fill();
        if (isSelected) {
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.fillStyle = isSelected ? '#00f0ff' : '#aaa';
        ctx.font = `bold ${Math.max(7, h * 0.065)}px "Fira Code", monospace`;
        ctx.fillText(proj.name, pad + 6, y + itemH * 0.55);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.max(5, h * 0.045)}px "Fira Code", monospace`;
        ctx.fillText(proj.board, pad + 6, y + itemH * 0.85);
    });

    // cursor on select phase
    if (phase.id === "select") {
        const cy = startY + 0 * (itemH + 4) + itemH / 2;
        const cx = sidebarW / 2;
        const t = phase.local;
        const curX = w * 0.5 * (1 - t) + cx * t;
        const curY = h * 0.5 * (1 - t) + cy * t;
        drawCursorArrow(ctx, curX, curY, Math.max(8, h * 0.08));
    }

    // main panel
    const mx = sidebarW + 8;
    const mw = w - mx - pad;

    if (phase.id === 'idle' || phase.id === 'select') {
        ctx.fillStyle = '#333';
        ctx.font = `${Math.max(7, h * 0.06)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Select a project to begin.', mx + mw / 2, h * 0.5);
        ctx.textAlign = 'left';
    } else {
        // workspace card
        ctx.fillStyle = '#ff2a85';
        ctx.font = `bold ${Math.max(8, h * 0.07)}px Syne, Inter, sans-serif`;
        ctx.fillText('BLINKY', mx, h * 0.14);

        ctx.fillStyle = '#666';
        ctx.font = `${Math.max(5, h * 0.045)}px "Fira Code", monospace`;
        ctx.fillText('env: debug  │  board: esp32-c3-devkitm-1', mx, h * 0.23);

        // BUILD & FLASH button
        const btnY = h * 0.30;
        const btnW = mw * 0.55;
        const btnH = h * 0.16;
        const isFlashing = phase.id === 'flashing' || phase.id === 'done';
        ctx.fillStyle = isFlashing ? '#005566' : '#00f0ff';
        drawRoundRect(ctx, mx, btnY, btnW, btnH, 4);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(7, h * 0.06)}px "Space Grotesk", Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(isFlashing ? 'FLASHING...' : 'BUILD & FLASH DEVICE', mx + btnW / 2, btnY + btnH * 0.65);
        ctx.textAlign = 'left';

        // cursor on flash click
        if (phase.id === 'click-flash') {
            const cx = mx + btnW / 2;
            const cy = btnY + btnH / 2;
            drawCursorArrow(ctx, cx, cy, Math.max(8, h * 0.08));
        }

        // console area
        const conY = h * 0.52;
        const conH = h - conY - pad;
        ctx.fillStyle = '#0a0a0a';
        drawRoundRect(ctx, mx, conY, mw, conH, 3);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();

        // console tab
        ctx.fillStyle = '#ff2a85';
        ctx.font = `bold ${Math.max(5, h * 0.04)}px Inter, sans-serif`;
        ctx.fillText('BUILD & FLASH LOGS', mx + 6, conY + h * 0.06);

        // console text
        ctx.font = `${Math.max(5, h * 0.04)}px "Fira Code", monospace`;
        const logX = mx + 6;
        let logY = conY + h * 0.12;
        const logStep = h * 0.055;

        if (phase.id === 'flashing') {
            const lines = [
                '> pio run -t upload -e debug',
                'Compiling .pio/build/debug/src/main.cpp',
                'Linking .pio/build/debug/firmware.elf',
            ];
            const nLines = Math.min(lines.length, Math.floor(phase.local * (lines.length + 1)));
            for (let i = 0; i < nLines; i++) {
                ctx.fillStyle = i === 0 ? '#00f0ff' : '#0f0';
                ctx.fillText(lines[i], logX, logY + i * logStep);
            }
            // progress bar
            const pbY = conY + conH - h * 0.06;
            ctx.fillStyle = '#222';
            ctx.fillRect(mx + 4, pbY, mw - 8, h * 0.04);
            ctx.fillStyle = '#00f0ff';
            ctx.fillRect(mx + 4, pbY, (mw - 8) * phase.local, h * 0.04);
        } else if (phase.id === 'done') {
            const lines = [
                '> pio run -t upload -e debug',
                'Compiling .pio/build/debug/src/main.cpp',
                'Linking .pio/build/debug/firmware.elf',
                'Uploading .pio/build/debug/firmware.bin',
                '========= [SUCCESS] =========',
            ];
            for (let i = 0; i < lines.length; i++) {
                ctx.fillStyle = i === 4 ? '#0f0' : (i === 0 ? '#00f0ff' : '#0f0');
                ctx.fillText(lines[i], logX, logY + i * logStep);
            }
        }
    }

    ctx.globalAlpha = 1;
}

function drawCursorArrow(ctx, x, y, size) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + size * 0.3, y + size * 0.72);
    ctx.lineTo(x + size * 0.55, y + size * 1.1);
    ctx.lineTo(x + size * 0.7, y + size);
    ctx.lineTo(x + size * 0.42, y + size * 0.62);
    ctx.lineTo(x + size * 0.75, y + size * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

let esp32BlinkOn = false;
function drawUploaderEsp32(canvas) {
    if (!canvas || activeSlideIndex !== 4) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    if (uplStartTime === null) uplStartTime = timeSec;
    const elapsed = timeSec - uplStartTime;
    const progress = (elapsed % UPL_CYCLE) / UPL_CYCLE;
    const phase = getUplPhase(progress);

    // fade envelope
    let alpha = 1;
    if (progress < UPL_FADE_DUR / UPL_CYCLE) {
        alpha = progress / (UPL_FADE_DUR / UPL_CYCLE);
    } else if (phase.id === "fadeout") {
        alpha = 1 - phase.local;
    }
    ctx.globalAlpha = alpha;

    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, w, h);

    // draw ESP32 board (keep aspect ratio)
    const bh = h * 0.78;
    const bw = bh * 0.65;
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;

    // PCB
    ctx.fillStyle = '#1a472a';
    drawRoundRect(ctx, bx, by, bw, bh, 4);
    ctx.fill();
    ctx.strokeStyle = '#2a7a4a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // chip
    const chipW = bw * 0.4;
    const chipH = bh * 0.3;
    ctx.fillStyle = '#222';
    ctx.fillRect(bx + (bw - chipW) / 2, by + bh * 0.15, chipW, chipH);
    ctx.fillStyle = '#555';
    ctx.font = `bold ${Math.max(5, h * 0.06)}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ESP32', bx + bw / 2, by + bh * 0.15 + chipH * 0.65);

    // USB-C port
    ctx.fillStyle = '#888';
    const usbW = bw * 0.25;
    ctx.fillRect(bx + (bw - usbW) / 2, by + bh - 3, usbW, 6);

    // LED
    const ledX = bx + bw * 0.75;
    const ledY = by + bh * 0.6;
    const ledR = Math.max(3, bw * 0.06);
    const isBlinking = phase.id === 'done';
    if (isBlinking) {
        esp32BlinkOn = Math.floor(timeSec * 4) % 2 === 0;
    }
    ctx.beginPath();
    ctx.arc(ledX, ledY, ledR, 0, Math.PI * 2);
    if (isBlinking && esp32BlinkOn) {
        ctx.fillStyle = '#0f0';
        ctx.shadowColor = '#0f0';
        ctx.shadowBlur = 12;
    } else {
        ctx.fillStyle = '#333';
        ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // label
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.max(6, h * 0.06)}px Inter, sans-serif`;
    ctx.fillText('ESP32-C3', w / 2, by + bh + h * 0.08);
    ctx.textAlign = 'left';

    // status text
    if (phase.id === 'flashing') {
        ctx.fillStyle = '#ff0';
        ctx.textAlign = 'center';
        ctx.fillText('Receiving...', w / 2, by - h * 0.04);
        ctx.textAlign = 'left';
    } else if (phase.id === 'done') {
        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'center';
        ctx.fillText('Blinky!', w / 2, by - h * 0.04);
        ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
}
