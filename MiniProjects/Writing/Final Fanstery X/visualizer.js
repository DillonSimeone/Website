/* ==========================================================================
   FINAL FANSTERY X: DYNAMIC TELEMETRY VISUALIZER
   Interactive 2D/3D Canvas Engine tracking Tidus's Cognitive Architecture
   ========================================================================== */

import { state } from './state.js';

const canvas = document.getElementById('canvas-telemetry');
const ctx = canvas.getContext('2d');

let width, height;
let animationFrameId;
let tick = 0;
let particles = [];

// Initialize particles
function initParticles() {
    particles = [];
    const count = 75;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            size: Math.random() * 2 + 1,
            color: Math.random() > 0.35 ? 'rgba(0, 240, 255, ' : 'rgba(229, 168, 66, ',
            alpha: Math.random() * 0.7 + 0.2,
            orbitAngle: Math.random() * Math.PI * 2,
            orbitRadius: Math.random() * 90 + 40
        });
    }
}

export function handleResize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    width = canvas.width = rect.width;
    height = canvas.height = rect.height;
    initParticles();
}

export function startVisualizer() {
    handleResize();
    window.addEventListener('resize', handleResize);
    render();
}

function render() {
    tick += 0.025;
    ctx.clearRect(0, 0, width, height);

    // Subtle dark radial background
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width / 1.8);
    bgGrad.addColorStop(0, 'rgba(8, 22, 44, 0.45)');
    bgGrad.addColorStop(1, 'rgba(3, 6, 12, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const chapter = state.currentChapter;

    // Render Mode based on Chapter
    switch (chapter) {
        case 0:
            renderChapter0(width / 2, height / 2);
            break;
        case 1:
            renderChapter1(width / 2, height / 2);
            break;
        case 2:
            renderChapter2(width / 2, height / 2);
            break;
        case 3:
            renderChapter3(width / 2, height / 2);
            break;
        case 4:
            renderChapter4(width / 2, height / 2);
            break;
        case 5:
            renderChapter5(width / 2, height / 2);
            break;
        default:
            renderChapter0(width / 2, height / 2);
    }

    // Drifting Pyreflies
    renderPyreflies();

    animationFrameId = requestAnimationFrame(render);
}

// Chapter 0: The Cranial Overload & The Tap
function renderChapter0(cx, cy) {
    // Red high-frequency migraine pulse in center
    const pulse = Math.sin(tick * 5) * 8 + Math.cos(tick * 13) * 4;
    const baseRadius = 35 + pulse;

    // Throbbing overload core
    const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, baseRadius);
    coreGrad.addColorStop(0, 'rgba(255, 59, 75, 0.9)');
    coreGrad.addColorStop(0.6, 'rgba(255, 59, 75, 0.3)');
    coreGrad.addColorStop(1, 'rgba(255, 59, 75, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fill();

    // The copper induction tap wire extending rightward to external register block
    const tapX = cx + 110;
    const tapY = cy + 20;

    ctx.strokeStyle = 'rgba(229, 168, 66, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx + 40, cy - 30, cx + 70, cy + 50, tapX, tapY);
    ctx.stroke();

    // Data pulses traveling down the wire
    const t = (tick * 2) % 1;
    const px = cx + (tapX - cx) * t;
    const py = cy + (tapY - cy) * t + Math.sin(t * Math.PI) * 20;
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();

    // External mechanical register block
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.strokeRect(tapX - 15, tapY - 25, 60, 50);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.fillRect(tapX - 15, tapY - 25, 60, 50);

    // Spinning cog lines in the register
    ctx.save();
    ctx.translate(tapX + 15, tapY);
    ctx.rotate(tick * 3);
    ctx.strokeStyle = '#e5a842';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.rotate(Math.PI / 3);
    }
    ctx.restore();

    // Diagnostic label
    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#ff3b4b';
    ctx.fillText('CRANIAL OVERLOAD [104.8%]', cx - 80, cy - 65);
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('TAP BUS: 1.2 kHz', tapX - 15, tapY + 40);
}

// Chapter 1: Harmonic Dampeners & The Trapped Aeon
function renderChapter1(cx, cy) {
    // Valefor trapped pyrefly form (oscillating cyan avian form)
    ctx.save();
    ctx.translate(cx, cy);

    // Rotating harmonic dampener rings
    ctx.strokeStyle = 'rgba(229, 168, 66, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 75, 45, tick * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 85, 30, -tick * 1.1, 0, Math.PI * 2);
    ctx.stroke();

    // Trapped aeon wings (sine waves locked in space)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    for (let x = -70; x <= 70; x += 4) {
        const y = Math.sin(x * 0.08 + tick * 4) * (20 - Math.abs(x) * 0.2);
        if (x === -70) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Two harmonic dampener stakes driven through wings
    drawStake(-40, -10, '#e5a842');
    drawStake(40, 5, '#e5a842');

    ctx.restore();

    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#e5a842';
    ctx.fillText('CARRIER LOCK: 144.2 MHz', cx - 70, cy - 75);
    ctx.fillStyle = '#ff3b4b';
    ctx.fillText('DISMISSAL SIGNAL: BLOCKED', cx - 75, cy + 85);
}

function drawStake(x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(6, -20);
    ctx.lineTo(2, 25);
    ctx.lineTo(-2, 25);
    ctx.lineTo(-6, -20);
    ctx.closePath();
    ctx.fill();

    // Sparkles around stake tip
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 25, 8 + Math.sin(tick * 8) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// Chapter 2: The Seymour Dorsal Bus in Mineral Oil
function renderChapter2(cx, cy) {
    // Glass tube container
    const tubeH = 180;
    const tubeW = 44;
    const topY = cy - tubeH / 2;

    ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.fillRect(cx - tubeW / 2, topY, tubeW, tubeH);
    ctx.strokeStyle = 'rgba(229, 168, 66, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - tubeW / 2, topY, tubeW, tubeH);

    // Preserved glowing spine inside
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, topY + 15);
    ctx.bezierCurveTo(cx - 8, topY + 60, cx + 8, topY + 120, cx, topY + 165);
    ctx.stroke();

    // Vertebrae nodes & electrode taps
    for (let i = 0; i < 8; i++) {
        const vy = topY + 25 + i * 18;
        const vx = cx + Math.sin(i * 0.8) * 4;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(vx, vy, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Horizontal electrode wires
        ctx.strokeStyle = 'rgba(229, 168, 66, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(cx + (i % 2 === 0 ? 30 : -30), vy);
        ctx.stroke();
    }

    // 88 MHz carrier oscillation wave around tube
    ctx.strokeStyle = 'rgba(186, 85, 211, 0.7)';
    ctx.beginPath();
    for (let y = topY; y <= topY + tubeH; y += 4) {
        const xw = Math.sin(y * 0.15 - tick * 6) * 14;
        if (y === topY) ctx.moveTo(cx + tubeW / 2 + 10 + xw, y);
        else ctx.lineTo(cx + tubeW / 2 + 10 + xw, y);
    }
    ctx.stroke();

    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('SEYMOUR DORSAL BUS // 88.0 MHz', cx - 95, topY - 15);
    ctx.fillStyle = '#34d399';
    ctx.fillText('SUMMONER CARRIER: SYNCHRONIZED', cx - 90, topY + tubeH + 20);
}

// Chapter 3: Thunder Plains Dynamic Crucible
function renderChapter3(cx, cy) {
    // Central rotating armored chassis
    ctx.save();
    ctx.translate(cx, cy);

    // Rotating hexagon armor plates
    ctx.rotate(tick * 0.6);
    ctx.strokeStyle = 'rgba(229, 168, 66, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const rx = Math.cos(angle) * 55;
        const ry = Math.sin(angle) * 55;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.fill();

    // High voltage discharge arcs
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    for (let j = 0; j < 4; j++) {
        const startA = (j / 4) * Math.PI * 2 + tick;
        let lx = Math.cos(startA) * 55;
        let ly = Math.sin(startA) * 55;

        ctx.beginPath();
        ctx.moveTo(lx, ly);
        for (let k = 0; k < 4; k++) {
            lx += (Math.random() - 0.5) * 35;
            ly += (Math.random() - 0.5) * 35;
            ctx.lineTo(lx, ly);
        }
        ctx.stroke();
    }
    ctx.restore();

    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('1.2 GW DISCHARGE // CONTINUOUS GROUND', cx - 110, cy - 80);
    ctx.fillStyle = '#e5a842';
    ctx.fillText('CHASSIS REASSEMBLY: +100%', cx - 75, cy + 90);
}

// Chapter 4: Wall of the Fayth Soul-Stake Array
function renderChapter4(cx, cy) {
    // Vertical cliff line on left
    const wallX = cx - 90;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wallX, cy - 110);
    ctx.lineTo(wallX, cy + 110);
    ctx.stroke();

    // Central dreadnought manifold
    const hubX = cx + 50;
    ctx.fillStyle = 'rgba(229, 168, 66, 0.2)';
    ctx.strokeStyle = '#e5a842';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hubX, cy, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4 soul-stakes piercing the wall and flowing pyreflies to hub
    for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const sy = cy + i * 35;

        // Stake
        ctx.strokeStyle = '#e5a842';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(wallX - 15, sy);
        ctx.lineTo(hubX - 35, sy + (cy - sy) * 0.4);
        ctx.stroke();

        // Liquid pyrefly stream
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wallX - 10, sy);
        ctx.lineTo(hubX - 38, cy);
        ctx.stroke();
    }

    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('FAYTH INGESTION: 4.8e15 FLOPS', cx - 85, cy - 120);
    ctx.fillStyle = '#e5a842';
    ctx.fillText('PARALLEL CLUSTER: 20,000 SOULS', cx - 80, cy + 130);
}

// Chapter 5: 3-Mile Orbital Singularity Ring
function renderChapter5(cx, cy) {
    // Starfield dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let s = 0; s < 30; s++) {
        const sx = (s * 47) % width;
        const sy = (s * 31) % height;
        ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    ctx.save();
    ctx.translate(cx, cy);

    // Rotating 3-mile orbital ring
    ctx.rotate(tick * 0.2);

    // Outer ring
    ctx.strokeStyle = 'rgba(229, 168, 66, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 45, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 95, 38, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Radiating celestial filament lines reaching to stars
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1;
    for (let f = 0; f < 12; f++) {
        const angle = (f / 12) * Math.PI * 2;
        const rx1 = Math.cos(angle) * 110;
        const ry1 = Math.sin(angle) * 45;
        const rx2 = Math.cos(angle) * 175;
        const ry2 = Math.sin(angle) * 90;

        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.stroke();
    }

    // Core quartz face silhouette
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.font = '10px "Space Mono"';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('CELESTIAL APOTHEOSIS // UNBOUND', cx - 95, cy - 90);
    ctx.fillStyle = '#e5a842';
    ctx.fillText('TARGET: INTERSTELLAR VOID', cx - 75, cy + 105);
}

// Background Pyrefly Particle System
function renderPyreflies() {
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color + p.alpha + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
}
