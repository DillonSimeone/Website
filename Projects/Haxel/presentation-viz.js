import {
    getFrequencyBins,
    getRmsAmplitude,
    getBassMidTreble,
    getPartitionDividers,
    isAudioLive,
    applyBassPulseToDocument
} from './presentation-audio.js';
import { Parser, tokenize, Evaluator, updateAudioState } from './compiler.js';

// Live coding cookbook simulator state
let liveCodingInitialised = false;
const liveCodingCards = [];
const LIVE_CODING_CODES = [
    "rate = 2 + sin(t) * 1.5;\nphase = frac(phase + dt * rate);\nwave(phase)",
    "q = 0.4;\nf = 6 * dt;\nbp = bp + f * (noise(t * 3) - lp - q * bp);\nlp = lp + f * bp;\nclamp(lp, 0, 1)",
    "target = square(t / 2, 0.5);\nk = target > env ? 12 : 2.5;\nenv = env + (target - env) * min(1, dt * k);\nenv",
    "envelope = pow(2.718, -5 * (t % 1.5));\nnoise(t * 20) * envelope"
];

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

/* ── Audio-Reactive Telemetry for Slide 16 (matches Haxel website main.js) ── */
let slideTelemetryMode = 'classic';
const SLIDE_TELEMETRY_LEN = 120;
const slideWaveHistory = new Array(SLIDE_TELEMETRY_LEN).fill(0.1);
const slideColorHistory = new Array(SLIDE_TELEMETRY_LEN).fill('rgba(0, 47, 108, 0.25)');
const slideSpecHistory = [];

for (let i = 0; i < SLIDE_TELEMETRY_LEN; i++) {
    slideSpecHistory.push(new Array(32).fill(0.05));
}

export function setSlideTelemetryMode(mode) {
    slideTelemetryMode = mode;
}

function drawSlideVirtualActuator(ctx, cx, cy, radius, activeAmp) {
    if (activeAmp > 0.02) {
        ctx.lineWidth = 3;
        const numWaves = 3;
        for (let i = 0; i < numWaves; i++) {
            const phase = (timeSec * 4 + i / numWaves) % 1.0;
            const currentR = radius + phase * 50;
            const alpha = (1.0 - phase) * 0.8 * activeAmp;
            ctx.strokeStyle = `rgba(0, 47, 108, ${alpha})`;
            ctx.beginPath();
            ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    let dx = 0;
    let dy = 0;
    if (activeAmp > 0.01) {
        dx = (Math.random() - 0.5) * 6 * activeAmp * (1.0 + Math.sin(timeSec * 25) * 0.2);
        dy = (Math.random() - 0.5) * 6 * activeAmp * (1.0 + Math.cos(timeSec * 25) * 0.2);
    }

    const ax = cx + dx;
    const ay = cy + dy;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(17,17,17,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, radius * 0.75, 0, Math.PI * 2);
    ctx.stroke();

    const rotationSpeed = activeAmp * 25;
    const angle = timeSec * rotationSpeed;
    ctx.fillStyle = "#e23b24";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.arc(ax, ay, radius * 0.7, angle, angle + Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fill();
}

function getSlideAudioActiveAmp(mags) {
    const gain = parseFloat(document.getElementById("slideAudioGain")?.value || 4.0);
    let maxAmp = 0;

    for (let i = 0; i < slideNumBins; i++) {
        const startIdx = i === 0 ? 0 : slideDividers[i - 1];
        const endIdx = i === slideNumBins - 1 ? 32 : slideDividers[i];
        const len = Math.max(1, endIdx - startIdx);

        let sum = 0;
        for (let b = startIdx; b < endIdx && b < 32; b++) {
            sum += mags[b] || 0;
        }
        const vol = (sum / len) * (gain * 0.45);

        const selectEl = document.getElementById(`slide-bin-${i}-pattern`);
        const patternId = selectEl ? selectEl.value : "none";

        if (patternId !== "none") {
            let patVal = 1.0;
            if (patternId === "Pulse") {
                patVal = Math.pow(Math.max(0, Math.sin(timeSec * 6)), 3);
            } else if (patternId === "Rumble") {
                patVal = 0.5 + Math.sin(timeSec * 25) * 0.5;
            } else if (patternId === "Staccato") {
                patVal = (Math.sin(timeSec * 12) > 0.5) ? 1.0 : 0.0;
            } else if (patternId === "Ocean") {
                patVal = Math.sin(timeSec * 2) * 0.5 + 0.5;
            } else if (patternId === "Saw") {
                patVal = (timeSec * 2) % 1.0;
            } else if (patternId === "Sine") {
                patVal = Math.sin(timeSec * 5) * 0.5 + 0.5;
            } else if (patternId === "Square") {
                patVal = Math.sin(timeSec * 8) > 0 ? 1.0 : 0.0;
            } else if (patternId === "Noise") {
                patVal = Math.random();
            }

            const out = vol * patVal;
            if (out > maxAmp) maxAmp = out;
        }
    }
    return maxAmp;
}

function drawSlideTelemetry(canvas) {
    if (!canvas || !canvas.offsetParent) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    // Get 32-bin frequency magnitudes
    let mags = getFrequencyBins();
    if (!isAudioLive() || !mags) {
        mags = new Array(32);
        for (let b = 0; b < 32; b++) {
            const wave1 = Math.sin(timeSec * 4 + b * 0.25) * 0.4 + 0.5;
            const wave2 = Math.sin(timeSec * 10 - b * 0.15) * 0.3;
            mags[b] = Math.max(0.05, Math.min(1.0, (wave1 + wave2) * 0.6));
        }
    }

    // Evaluate active amplitude strictly based on frequency bin pattern mappings
    let amp = getSlideAudioActiveAmp(mags);

    slideWaveHistory.push(Math.min(1.0, Math.max(0, amp)));
    slideWaveHistory.shift();

    let activeColor = "rgba(0, 47, 108, 0.25)";
    const specBin = mags;
    slideSpecHistory.push(specBin);
    slideSpecHistory.shift();

    // HSL Spectrum Color mapping from top bins
    const sortedBins = Array.from({ length: 32 }, (_, idx) => ({ index: idx, val: specBin[idx] }))
        .sort((a, b) => b.val - a.val);
    const top3 = sortedBins.slice(0, 3);
    const hue1 = (top3[0].index / 31) * 280;
    const hue2 = (top3[1].index / 31) * 280;
    const hue3 = (top3[2].index / 31) * 280;
    const avgHue = (hue1 + hue2 + hue3) / 3;
    activeColor = `hsl(${avgHue}, 85%, 45%)`;

    slideColorHistory.push(activeColor);
    slideColorHistory.shift();

    // 1. Base Bauhaus Cream Background
    ctx.fillStyle = "#f4ebd0";
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Virtual Physical Actuator Motor Chassis on left (0 to 120)
    const actX = Math.min(60, w * 0.18);
    drawSlideVirtualActuator(ctx, actX, h / 2, Math.min(36, h * 0.22), amp);

    const startX = Math.min(120, w * 0.35);

    // Clear and fill graph viewport right of divider
    ctx.fillStyle = "#f4ebd0";
    ctx.fillRect(startX, 0, w - startX, h);

    // Vertical Divider Line
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, h);
    ctx.stroke();

    // Subtle grid lines
    ctx.strokeStyle = "rgba(17, 17, 17, 0.08)";
    ctx.lineWidth = 1;
    for (let x = startX; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 30; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const width = w - startX;
    const step = width / (SLIDE_TELEMETRY_LEN - 1);

    if (slideTelemetryMode === "classic") {
        for (let i = 0; i < slideWaveHistory.length - 1; i++) {
            const h1 = slideWaveHistory[i] * (h - 20);
            const h2 = slideWaveHistory[i + 1] * (h - 20);
            const x1 = startX + i * step;
            const x2 = startX + (i + 1) * step;

            let fillCol = slideColorHistory[i] || "rgba(0, 47, 108, 0.25)";
            if (fillCol.startsWith("hsl")) {
                fillCol = fillCol.replace("hsl", "hsla").replace(")", ", 0.45)");
            }
            ctx.fillStyle = fillCol;

            ctx.beginPath();
            ctx.moveTo(x1, h - 10);
            ctx.lineTo(x1, h - 10 - h1);
            ctx.lineTo(x2, h - 10 - h2);
            ctx.lineTo(x2, h - 10);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x1, h - 10 - h1);
            ctx.lineTo(x2, h - 10 - h2);
            ctx.stroke();
        }
    } else if (slideTelemetryMode === "symmetric") {
        for (let i = 0; i < slideWaveHistory.length - 1; i++) {
            const h1 = slideWaveHistory[i] * (h - 20);
            const h2 = slideWaveHistory[i + 1] * (h - 20);
            const x1 = startX + i * step;
            const x2 = startX + (i + 1) * step;

            let fillCol = slideColorHistory[i] || "rgba(0, 47, 108, 0.25)";
            if (fillCol.startsWith("hsl")) {
                fillCol = fillCol.replace("hsl", "hsla").replace(")", ", 0.45)");
            }
            ctx.fillStyle = fillCol;

            const y1_top = h / 2 - Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
            const y2_top = h / 2 - Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;
            const y1_bot = h / 2 + Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
            const y2_bot = h / 2 + Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;

            ctx.beginPath();
            ctx.moveTo(x1, y1_top - h1 / 2);
            ctx.lineTo(x2, y2_top - h2 / 2);
            ctx.lineTo(x2, y2_bot + h2 / 2);
            ctx.lineTo(x1, y1_bot + h1 / 2);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x1, y1_top - h1 / 2);
            ctx.lineTo(x2, y2_top - h2 / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x2, y2_bot + h2 / 2);
            ctx.lineTo(x1, y1_bot + h1 / 2);
            ctx.stroke();
        }
    } else if (slideTelemetryMode === "waterfall") {
        const cellH = (h - 20) / 32;
        for (let i = 0; i < slideSpecHistory.length; i++) {
            const x = startX + i * step;
            const spec = slideSpecHistory[i];
            for (let j = 0; j < 32; j++) {
                const val = spec ? spec[j] : 0;
                if (val > 0.01) {
                    const hue = (j / 31) * 280;
                    ctx.fillStyle = `hsla(${hue}, 85%, 45%, ${val * 0.75})`;
                    ctx.fillRect(x, h - 10 - (j + 1) * cellH, step + 1, cellH + 0.5);
                }
            }
        }
    } else if (slideTelemetryMode === "orbit") {
        const cx = startX + width / 2;
        const cy = h / 2;

        ctx.strokeStyle = "rgba(17, 17, 17, 0.05)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, (h - 30) * 0.25, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < slideWaveHistory.length - 1; i++) {
            const amp1 = slideWaveHistory[i];
            const amp2 = slideWaveHistory[i + 1];

            const angle1 = (i / SLIDE_TELEMETRY_LEN) * Math.PI * 2 * 4 + timeSec * 3;
            const angle2 = ((i + 1) / SLIDE_TELEMETRY_LEN) * Math.PI * 2 * 4 + timeSec * 3;

            const baseR = (h - 30) * 0.28;
            const r1 = baseR + amp1 * baseR * 0.8;
            const r2 = baseR + amp2 * baseR * 0.8;

            const x1 = cx + Math.cos(angle1) * r1;
            const y1 = cy + Math.sin(angle1) * r1;
            const x2 = cx + Math.cos(angle2) * r2;
            const y2 = cy + Math.sin(angle2) * r2;

            let strokeCol = slideColorHistory[i] || "rgba(0, 47, 108, 0.25)";
            const alpha = (i / (slideWaveHistory.length - 1)) * 0.8;
            if (strokeCol.startsWith("hsl")) {
                strokeCol = strokeCol.replace("hsl", "hsla").replace(")", `, ${alpha})`);
            } else {
                strokeCol = `rgba(0, 47, 108, ${alpha})`;
            }

            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = 2 + (i / slideWaveHistory.length) * 3;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        if (slideWaveHistory.length > 0) {
            const latestAmp = slideWaveHistory[slideWaveHistory.length - 1];
            const latestAngle = Math.PI * 2 * 4 + timeSec * 3;
            const baseR = (h - 30) * 0.28;
            const latestR = baseR + latestAmp * baseR * 0.8;
            const lx = cx + Math.cos(latestAngle) * latestR;
            const ly = cy + Math.sin(latestAngle) * latestR;

            ctx.fillStyle = slideColorHistory[slideColorHistory.length - 1] || "#111111";
            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(lx, ly, 6 + latestAmp * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = "rgba(17, 17, 17, 0.25)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(lx, ly);
            ctx.stroke();
        }
    }
}

/* ── Interactive Spectrum Partitioning & Dividers for Slide 16 ── */
let slideDividers = [0, 29];
let slideNumBins = 3;
let draggingSlideDividerIdx = -1;

const SLIDE_PATTERNS = [
    { id: "none", name: "NONE (No Reactivity)" },
    { id: "Pulse", name: "Pulse Wave" },
    { id: "Rumble", name: "Rumble" },
    { id: "Staccato", name: "Staccato Tap" },
    { id: "Ocean", name: "Ocean Wave" },
    { id: "Saw", name: "Sawtooth Sweep" },
    { id: "Sine", name: "Sine Wave" },
    { id: "Square", name: "Square Wave" },
    { id: "Noise", name: "Chaos Noise" }
];

export function recalculateSlideDividers() {
    const minFreqInput = document.getElementById("slideAudioMinFreq");
    const maxFreqInput = document.getElementById("slideAudioMaxFreq");
    const minFreq = parseFloat(minFreqInput ? minFreqInput.value : 40);
    const maxFreq = parseFloat(maxFreqInput ? maxFreqInput.value : 16000);

    const getBandAtFreq = (f) => Math.max(0, Math.min(32, Math.round(32 * Math.log(f / 40) / Math.log(20000 / 40))));
    const minBandIdx = getBandAtFreq(minFreq);
    const maxBandIdx = getBandAtFreq(maxFreq);

    const numDividers = slideNumBins - 1;
    if (numDividers >= 1) {
        slideDividers = new Array(numDividers);
        slideDividers[0] = minBandIdx;
        if (numDividers > 1) {
            slideDividers[numDividers - 1] = maxBandIdx;
            for (let i = 1; i < numDividers - 1; i++) {
                const ratio = i / (numDividers - 1);
                slideDividers[i] = Math.round(minBandIdx + ratio * (maxBandIdx - minBandIdx));
            }
        }
    }

    for (let i = 0; i < slideDividers.length; i++) {
        if (i > 0 && slideDividers[i] <= slideDividers[i - 1]) {
            slideDividers[i] = slideDividers[i - 1] + 1;
        }
    }
    for (let i = slideDividers.length - 1; i >= 0; i--) {
        if (slideDividers[i] >= 32) slideDividers[i] = 31;
        if (i < slideDividers.length - 1 && slideDividers[i] >= slideDividers[i + 1]) {
            slideDividers[i] = slideDividers[i + 1] - 1;
        }
    }

    renderSlideBinRows();
}

export function updateSlideBinRangeLabels() {
    const getFreqAtBand = (b) => {
        if (b === 0) return 0;
        if (b === 32) return 20000;
        return Math.round(40 * Math.pow(20000 / 40, b / 32));
    };
    for (let i = 0; i < slideNumBins; i++) {
        const startVal = i === 0 ? 0 : slideDividers[i - 1];
        const endVal = i === slideNumBins - 1 ? 32 : slideDividers[i];

        const fStart = getFreqAtBand(startVal);
        const fEnd = getFreqAtBand(endVal);

        const label = document.getElementById(`slide-bin-${i}-range`);
        if (label) {
            label.textContent = `${fStart} - ${fEnd} Hz`;
        }
    }
}

export function renderSlideBinRows() {
    const container = document.getElementById("slideBinsContainer");
    if (!container) return;

    const savedValues = [];
    for (let i = 0; i < slideNumBins; i++) {
        const el = document.getElementById(`slide-bin-${i}-pattern`);
        savedValues.push(el ? el.value : null);
    }

    container.innerHTML = "";
    const defaults = ["none", "Pulse", "Rumble", "Staccato", "Ocean"];

    const minFreq = parseFloat(document.getElementById("slideAudioMinFreq")?.value || 40);
    const maxFreq = parseFloat(document.getElementById("slideAudioMaxFreq")?.value || 16000);
    const getBandAtFreq = (f) => Math.max(0, Math.min(32, Math.round(32 * Math.log(f / 40) / Math.log(20000 / 40))));
    const minBandIdx = getBandAtFreq(minFreq);
    const maxBandIdx = getBandAtFreq(maxFreq);

    for (let i = 0; i < slideNumBins; i++) {
        const row = document.createElement("div");
        row.className = "bin-row";

        let labelName = `Bin ${i}`;
        if (i === 0 && minBandIdx > 0) {
            labelName += ` (Anti-Loop / Low Cut)`;
        } else if (i === slideNumBins - 1 && maxBandIdx < 32) {
            labelName += ` (High Cut / End Bin)`;
        } else {
            const activeIdx = (minBandIdx > 0) ? (i - 1) : i;
            const activeCount = slideNumBins - (minBandIdx > 0 ? 1 : 0) - (maxBandIdx < 32 ? 1 : 0);
            if (activeCount === 3) {
                const labels = ["Bass", "Mids", "Treble"];
                labelName += ` (${labels[activeIdx]})`;
            } else if (activeCount === 2) {
                const labels = ["Bass/Mids", "Treble"];
                labelName += ` (${labels[activeIdx]})`;
            } else {
                labelName += ` (Active ${activeIdx + 1})`;
            }
        }

        row.innerHTML = `
            <span class="bin-title">${labelName}:</span>
            <span class="bin-range" id="slide-bin-${i}-range">-</span>
            <select class="bin-pattern-select" id="slide-bin-${i}-pattern">
            </select>
        `;
        container.appendChild(row);

        const select = row.querySelector(".bin-pattern-select");
        SLIDE_PATTERNS.forEach(pat => {
            const opt = document.createElement("option");
            opt.value = pat.id;
            opt.textContent = pat.name;
            select.appendChild(opt);
        });

        const prevVal = savedValues[i];
        if (prevVal) {
            select.value = prevVal;
        } else {
            select.value = defaults[i] || "none";
        }
    }

    updateSlideBinRangeLabels();
}

export function initSlideSpectrumInteractions() {
    const canvas = document.getElementById("spectrumSlideCanvas");
    if (!canvas) return;

    const getMouseX = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return clientX - rect.left;
    };

    const handleStart = (e) => {
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.width / dpr;
        let closestIdx = -1;
        let minDist = 20;

        slideDividers.forEach((divVal, idx) => {
            const x = divVal * (cssW / 32);
            const dist = Math.abs(mx - x);
            if (dist < minDist) {
                minDist = dist;
                closestIdx = idx;
            }
        });

        if (closestIdx >= 0) {
            draggingSlideDividerIdx = closestIdx;
            e.preventDefault();
        }
    };

    const handleMove = (e) => {
        if (draggingSlideDividerIdx < 0) return;
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.width / dpr;
        const band = Math.round((mx / cssW) * 32);

        const minVal = draggingSlideDividerIdx === 0 ? 1 : slideDividers[draggingSlideDividerIdx - 1] + 1;
        const maxVal = draggingSlideDividerIdx === slideDividers.length - 1 ? 31 : slideDividers[draggingSlideDividerIdx + 1] - 1;

        slideDividers[draggingSlideDividerIdx] = Math.max(minVal, Math.min(maxVal, band));
        updateSlideBinRangeLabels();
        e.preventDefault();
    };

    const handleEnd = () => {
        draggingSlideDividerIdx = -1;
    };

    canvas.addEventListener("mousedown", handleStart);
    canvas.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    canvas.addEventListener("touchstart", handleStart, { passive: false });
    canvas.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    // + ADD BIN / - SUBTRACT BIN buttons
    document.getElementById("slideAddBinBtn")?.addEventListener("click", () => {
        if (slideNumBins >= 5) return;
        slideNumBins++;
        recalculateSlideDividers();
    });

    document.getElementById("slideSubBinBtn")?.addEventListener("click", () => {
        if (slideNumBins <= 1) return;
        slideNumBins--;
        recalculateSlideDividers();
    });

    // Sliders
    const gainSlider = document.getElementById("slideAudioGain");
    if (gainSlider) {
        gainSlider.addEventListener("input", () => {
            const label = document.getElementById("slideGainVal");
            if (label) label.textContent = `${parseFloat(gainSlider.value).toFixed(1)}x`;
        });
    }

    const minFreqSlider = document.getElementById("slideAudioMinFreq");
    if (minFreqSlider) {
        minFreqSlider.addEventListener("input", (e) => {
            const label = document.getElementById("slideMinFreqVal");
            if (label) label.textContent = `${e.target.value} Hz`;
        });
        minFreqSlider.addEventListener("change", () => {
            recalculateSlideDividers();
        });
    }

    const maxFreqSlider = document.getElementById("slideAudioMaxFreq");
    if (maxFreqSlider) {
        maxFreqSlider.addEventListener("input", (e) => {
            const label = document.getElementById("slideMaxFreqVal");
            if (label) label.textContent = `${e.target.value} Hz`;
        });
        maxFreqSlider.addEventListener("change", () => {
            recalculateSlideDividers();
        });
    }

    // Telemetry Source Dropdown (Browser Mic Web Audio integration)
    const micSelect = document.getElementById("slideMicSrc");
    if (micSelect) {
        micSelect.addEventListener("change", async (e) => {
            if (e.target.value === "1") {
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (err) {
                    console.warn("Browser mic access denied:", err);
                    micSelect.value = "0";
                }
            }
        });
    }

    recalculateSlideDividers();
}

function drawSlideSpectrum(canvas) {
    if (!canvas || !canvas.offsetParent) return;
    const setup = setupCanvas(canvas);
    if (!setup) return;
    const { ctx, w, h } = setup;

    ctx.fillStyle = "#f4ebd0";
    ctx.fillRect(0, 0, w, h);

    const barWidth = w / 32;
    const mags = getFrequencyBins();
    const gainVal = parseFloat(document.getElementById("slideAudioGain")?.value || 4.0);

    for (let i = 0; i < 32; i++) {
        let val;
        if (isAudioLive() && mags) {
            val = (mags[Math.floor((i / 32) * mags.length)] || 0.05) * (gainVal * 0.25);
        } else {
            const p1 = Math.pow(Math.max(0, Math.sin(timeSec * 4.5 + i * 0.1)), 3);
            const p2 = Math.sin(timeSec * 12 + i * 0.3) * 0.2 + 0.2;
            val = Math.min(1.0, (p1 * 0.7 + p2) * (gainVal * 0.2));
        }

        const barHeight = Math.max(4, Math.min(1.0, val) * (h - 10));
        const hue = (i / 31) * 280;
        ctx.fillStyle = `hsl(${hue}, 85%, 45%)`;
        ctx.fillRect(i * barWidth + 1, h - barHeight, barWidth - 2, barHeight);
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(i * barWidth + 1, h - barHeight, barWidth - 2, barHeight);
    }

    // Draw Frequency Dividers (Red, Yellow, Blue Pins)
    const pinColors = ["#e23b24", "#f2b134", "#002f6c", "#9b59b6"];
    slideDividers.forEach((divVal, idx) => {
        const x = divVal * barWidth;
        const color = pinColors[idx % pinColors.length];

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, 12, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function initLiveCodingSimulators() {
    if (liveCodingInitialised) return;
    for (let i = 0; i < 4; i++) {
        const canvas = document.getElementById(`liveCodingCanvas${i}`);
        if (!canvas) continue;
        let evaluator = null;
        try {
            evaluator = new Evaluator(new Parser(tokenize(LIVE_CODING_CODES[i])).parseProgram());
        } catch (err) {
            console.error("Cookbook example failed to compile:", i, err);
        }
        liveCodingCards.push({
            canvas,
            evaluator,
            vt: 0,
            hist: []
        });
    }
    liveCodingInitialised = true;
}

function simulateCookbookAudio(tSec) {
    const mags = new Array(32).fill(0);
    const kickPhase = (tSec % 0.5) / 0.5;
    const kick = Math.exp(-kickPhase * 7) * (0.75 + 0.25 * Math.sin(tSec * 0.9));
    for (let i = 0; i < 4; i++) mags[i] = kick * (1 - i * 0.18);
    for (let i = 4; i < 16; i++) {
        mags[i] = Math.max(0, 0.25 + 0.25 * Math.sin(tSec * 2.2 + i * 0.9)) *
                  (0.5 + 0.5 * Math.sin(tSec * 0.6 + i * 0.35));
    }
    const hatPhase = ((tSec + 0.125) % 0.25) / 0.25;
    const hat = Math.exp(-hatPhase * 11) * 0.55;
    for (let i = 16; i < 32; i++) mags[i] = hat * (0.35 + 0.65 * Math.abs(Math.sin(i * 2.7 + tSec * 3)));
    const amp = Math.min(1, kick * 0.6 + hat * 0.25 + 0.1);
    updateAudioState(mags, amp);
}

function drawCookbookWave(c, timeSec) {
    const canvas = c.canvas;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300;
    const cssH = canvas.clientHeight || 80;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#f4ebd0";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(17, 17, 17, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < cssW; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
    }

    const hist = c.hist;
    if (hist.length < 2) return;
    const HIST = 90;
    const step = cssW / (HIST - 1);

    for (let i = 0; i < hist.length - 1; i++) {
        const h1 = hist[i] * (cssH - 15);
        const h2 = hist[i + 1] * (cssH - 15);
        const x1 = i * step, x2 = (i + 1) * step;
        const w1 = Math.sin(timeSec * 5 + i * 0.05);
        const w2 = Math.sin(timeSec * 5 + (i + 1) * 0.05);
        const y1t = cssH / 2 - w1 * h1 * 0.4;
        const y2t = cssH / 2 - w2 * h2 * 0.4;
        const y1b = cssH / 2 + w1 * h1 * 0.4;
        const y2b = cssH / 2 + w2 * h2 * 0.4;

        ctx.fillStyle = "rgba(226, 59, 36, 0.35)";
        ctx.beginPath();
        ctx.moveTo(x1, y1t - h1 / 2);
        ctx.lineTo(x2, y2t - h2 / 2);
        ctx.lineTo(x2, y2b + h2 / 2);
        ctx.lineTo(x1, y1b + h1 / 2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1t - h1 / 2);
        ctx.lineTo(x2, y2t - h2 / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2b + h2 / 2);
        ctx.lineTo(x1, y1b + h1 / 2);
        ctx.stroke();
    }
}

function drawLiveCodingCookbook() {
    if (activeSlideIndex !== 16) return;
    initLiveCodingSimulators();

    simulateCookbookAudio(timeSec);

    const dt = 0.016;
    const HIST = 90;

    liveCodingCards.forEach(c => {
        c.vt += dt;
        let out = 0;
        if (c.evaluator) {
            try {
                out = c.evaluator.run(c.vt, 150, 1.0, 0.8, 0.15);
            } catch (e) {
                out = 0;
            }
        }
        c.hist.push(out);
        if (c.hist.length > HIST) c.hist.shift();
        drawCookbookWave(c, timeSec);
    });
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
    drawSlideTelemetry(document.getElementById('telemetrySlideCanvas'));
    drawSlideSpectrum(document.getElementById('spectrumSlideCanvas'));
    drawLiveCodingCookbook();
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
