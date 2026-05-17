// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    ["play", "lib", "audio", "device"].forEach(id => {
        const el = document.getElementById("tab-" + id);
        if (el) el.style.display = (id === t.dataset.tab) ? "" : "none";
    });
}));

// ─── HAPTIC PATTERN ENGINE & DATA ───────────────────────────────────────────
const PATTERNS = [
    { id: "pulse", name: "Pulse Wave", category: "pulse", desc: "Classic sharp on/off click sequences.", func: (t) => Math.sin(t * 8) > 0.3 ? 1.0 : 0.0 },
    { id: "tap2", name: "Double Tap", category: "pulse", desc: "Tactile confirmation double buzz.", func: (t) => (t % 1.5 < 0.15 || (t % 1.5 > 0.25 && t % 1.5 < 0.4)) ? 1.0 : 0.0 },
    { id: "heartbeat", name: "Heartbeat Pulse", category: "rhythm", desc: "Biometric double pulse with exponential decay.", func: (t) => Math.exp(-Math.pow((t % 1.2) * 10 - 2, 2)) * 0.8 + Math.exp(-Math.pow((t % 1.2) * 10 - 4.5, 2)) * 0.5 },
    { id: "rumble", name: "Rumble Alert", category: "alert", desc: "High-frequency warning vibrations.", func: (t) => Math.sin(t * 45) * 0.6 + 0.4 },
    { id: "crescendo", name: "Crescendo Rise", category: "rhythm", desc: "Smooth intensity sweep rising to maximum.", func: (t) => (t % 1.8) / 1.8 },
    { id: "enginerev", name: "Engine Rev", category: "alert", desc: "Frequency-modulated acceleration pulse.", func: (t) => 0.4 + Math.sin(t * (15 + (t % 2.0) * 45)) * 0.6 },
    { id: "sos", name: "S.O.S. Beacon", category: "alert", desc: "Morse code emergency SOS sequence.", func: (t) => {
        const cycle = t % 4.0;
        if (cycle < 0.1 || (cycle > 0.2 && cycle < 0.3) || (cycle > 0.4 && cycle < 0.5)) return 1.0; // S
        if ((cycle > 0.8 && cycle < 1.1) || (cycle > 1.2 && cycle < 1.5) || (cycle > 1.6 && cycle < 1.9)) return 1.0; // O
        if ((cycle > 2.2 && cycle < 2.3) || (cycle > 2.4 && cycle < 2.5) || (cycle > 2.6 && cycle < 2.7)) return 1.0; // S
        return 0.0;
    }},
    { id: "ambient", name: "Ambient Hum", category: "music", desc: "Gentle low-intensity background pulse.", func: (t) => 0.3 + Math.sin(t * 12) * 0.15 },
];

let activePattern = PATTERNS[0];
let masterIntensity = 180; // 0-255
let frequencyShift = 150; // Hz
let playbackSpeed = 1.0;
let isPlaying = true;
let isMuted = false;

// ─── CONTROL BINDINGS ───────────────────────────────────────────────────────
const brightInput = document.getElementById("bright");
const brightVal = document.getElementById("brightVal");
const freqInput = document.getElementById("freqShift");
const freqVal = document.getElementById("freqVal");
const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");

const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const currentDriverText = document.getElementById("currentDriver");
const currentActuatorText = document.getElementById("currentActuator");
const drvSelect = document.getElementById("drvChip");
const actSelect = document.getElementById("actuatorType");

brightInput.addEventListener("input", (e) => {
    masterIntensity = parseInt(e.target.value);
    brightVal.textContent = Math.round((masterIntensity / 255) * 100) + "%";
});

freqInput.addEventListener("input", (e) => {
    frequencyShift = parseInt(e.target.value);
    freqVal.textContent = frequencyShift + " Hz";
});

speedInput.addEventListener("input", (e) => {
    playbackSpeed = parseFloat(e.target.value) / 10;
    speedVal.textContent = playbackSpeed.toFixed(1) + "x";
});

playBtn.addEventListener("click", () => {
    isPlaying = true;
    document.getElementById("dot").className = "portal-dot ok";
    document.getElementById("connText").textContent = "playing";
});

stopBtn.addEventListener("click", () => {
    isPlaying = false;
    document.getElementById("dot").className = "portal-dot";
    document.getElementById("connText").textContent = "idle";
});

drvSelect.addEventListener("change", (e) => {
    currentDriverText.textContent = e.target.value;
});

actSelect.addEventListener("change", (e) => {
    currentActuatorText.textContent = e.target.value;
});

// ─── PATTERN LIBRARY CARD RENDER ─────────────────────────────────────────────
const libCards = document.getElementById("libCards");
const chips = document.querySelectorAll(".chip");

function renderCards(filterTag = "all") {
    libCards.innerHTML = "";
    PATTERNS.forEach(pat => {
        if (filterTag !== "all" && pat.category !== filterTag) return;
        
        const card = document.createElement("div");
        card.className = `card-item ${pat.id === activePattern.id ? "active" : ""}`;
        card.innerHTML = `
            <div>
                <h4>${pat.name}</h4>
                <p>${pat.desc}</p>
            </div>
        `;
        card.addEventListener("click", () => {
            activePattern = pat;
            document.querySelectorAll(".card-item").forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            document.getElementById("patternName").textContent = pat.name;
            isPlaying = true;
            document.getElementById("dot").className = "portal-dot ok";
            document.getElementById("connText").textContent = "playing";
        });
        libCards.appendChild(card);
    });
}

chips.forEach(chip => chip.addEventListener("click", () => {
    chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderCards(chip.dataset.tag);
}));

renderCards();

// ─── HIGH-FIDELITY TELEMETRY & ACTUATOR VIEWPORT ────────────────────────────
const prevCanvas = document.getElementById("prev");
const prevCtx = prevCanvas.getContext("2d");
const heroCanvas = document.getElementById("hero-canvas");
const heroCtx = heroCanvas.getContext("2d");

const waveHistory = [];
const historyLen = 220;
let timeSec = 0;

// Draw a dynamic schematic haptic actuator (LRA or ERM) that pulses, vibrates, and casts concentric compression waves
function drawVirtualActuator(ctx, cx, cy, radius, activeAmp) {
    const isLRA = actSelect.value === "LRA";
    const isSolenoid = actSelect.value === "Solenoid";
    
    // Draw kinetic haptic waves radiating outward
    if (activeAmp > 0.05) {
        ctx.strokeStyle = `rgba(14, 165, 233, ${0.4 * activeAmp})`;
        ctx.lineWidth = 2;
        for (let r = 1.2; r <= 3.2; r += 0.8) {
            const currentR = radius * (1.0 + r * activeAmp * (1.0 + Math.sin(timeSec * 35) * 0.1));
            ctx.beginPath();
            ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // Displacement offset for motor vibration
    let dx = 0;
    let dy = 0;
    if (activeAmp > 0.01) {
        const vibrationFreq = isLRA ? frequencyShift : 25; // LRAs resonate higher
        dx = (Math.random() - 0.5) * 8 * activeAmp * (1.0 + Math.sin(timeSec * vibrationFreq) * 0.2);
        dy = (Math.random() - 0.5) * 8 * activeAmp * (1.0 + Math.cos(timeSec * vibrationFreq) * 0.2);
    }

    const ax = cx + dx;
    const ay = cy + dy;

    // 1. Draw outer steel housing
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(99, 102, 241, 0.15)";
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Draw interior details based on hardware type
    if (isLRA) {
        // LRA: Linear coil spring + vibrating central magnet
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Spring coil
        for (let i = -15; i <= 15; i += 5) {
            const sx = ax + i;
            const sy = ay + Math.sin(i * 0.4) * 8;
            if (i === -15) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Vibrating core assembly
        ctx.fillStyle = `rgba(14, 165, 233, ${0.4 + activeAmp * 0.6})`;
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "8px Outfit";
        ctx.fillText("N/S", ax - 6, ay + 3);
    } else if (isSolenoid) {
        // Solenoid: Magnetic coil shaft pushing a copper piston
        ctx.fillStyle = "#64748b";
        ctx.fillRect(ax - 20, ay - 10, 40, 20);

        // Core plunger shifting in/out
        const stroke = activeAmp * 15;
        ctx.fillStyle = "#b45309"; // Copper color
        ctx.fillRect(ax - 5 + stroke, ay - 6, 20, 12);
        ctx.strokeStyle = "#f8fafc";
        ctx.strokeRect(ax - 5 + stroke, ay - 6, 20, 12);
    } else {
        // ERM: Rotating half-moon weight
        ctx.strokeStyle = "#475569";
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 0.75, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating eccentric copper/bronze mass
        const rotationSpeed = activeAmp * 35;
        const angle = timeSec * rotationSpeed;
        ctx.fillStyle = "#d97706"; // Eccentric weight color
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.arc(ax, ay, radius * 0.7, angle, angle + Math.PI, false);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ─── AUDIO-REACTIVE SPECTRUM GENERATION ─────────────────────────────────────
const specCanvas = document.getElementById("spectrum-canvas");
const specCtx = specCanvas.getContext("2d");
let audioCtx = null;
let analyser = null;
let micStream = null;
let micSource = null;
let dataArray = null;
const audioToggle = document.getElementById("audio-mic-toggle");
let useLiveMic = false;

async function setupMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64; // 32 bands
        
        micStream = stream;
        micSource = audioCtx.createMediaStreamSource(stream);
        micSource.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        useLiveMic = true;
        document.getElementById("micSrc").value = "1";
        audioToggle.classList.add("primary");
        audioToggle.querySelector("span").textContent = "Mic Enabled";
    } catch (err) {
        console.warn("Microphone access denied:", err);
        alert("Unable to access microphone. Check browser permissions.");
    }
}

audioToggle.addEventListener("click", () => {
    if (!useLiveMic) {
        setupMicrophone();
    } else {
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        if (audioCtx) audioCtx.close();
        useLiveMic = false;
        document.getElementById("micSrc").value = "0";
        audioToggle.classList.remove("primary");
        audioToggle.querySelector("span").textContent = "Enable Live Mic";
    }
});

document.getElementById("micSrc").addEventListener("change", (e) => {
    if (e.target.value === "1" && !useLiveMic) {
        setupMicrophone();
    } else if (e.target.value === "0" && useLiveMic) {
        audioToggle.click();
    }
});

// Calculate current simulated/live audio amplitudes
function getAudioData() {
    if (useLiveMic && analyser) {
        analyser.getByteFrequencyData(dataArray);
        return Array.from(dataArray).map(v => v / 255);
    }
    // Simulated sound reactiveness: generate dynamic procedural beats
    const mags = new Array(32).fill(0);
    const pulse1 = Math.pow(Math.max(0, Math.sin(timeSec * 4.5)), 4);
    const pulse2 = Math.pow(Math.max(0, Math.cos(timeSec * 2.2)), 8);
    
    for (let i = 0; i < 32; i++) {
        if (i < 4) { // Bass Punch
            mags[i] = pulse1 * 0.95 + Math.random() * 0.05;
        } else if (i < 12) { // Mids
            mags[i] = pulse2 * 0.65 + Math.sin(timeSec * 8 + i) * 0.15 + Math.random() * 0.05;
        } else { // Treble
            mags[i] = Math.max(0, Math.sin(timeSec * 15 + i) * 0.25) + Math.random() * 0.08;
        }
    }
    return mags;
}

// ─── TICK & ANIMATION LOOP ──────────────────────────────────────────────────
function drawSpectrum(mags) {
    specCtx.clearRect(0, 0, specCanvas.width, specCanvas.height);
    const barWidth = (specCanvas.width / 32);
    const gain = parseFloat(document.getElementById("audioGain").value);
    
    // Draw spectrum telemetry bars
    for (let i = 0; i < 32; i++) {
        const val = Math.min(1.0, mags[i] * (gain * 0.25));
        const barHeight = val * specCanvas.height;
        
        // Gradient fill: Cyan to Indigo
        const grad = specCtx.createLinearGradient(0, specCanvas.height, 0, specCanvas.height - barHeight);
        grad.addColorStop(0, "#6366f1");
        grad.addColorStop(1, "#0ea5e9");
        
        specCtx.fillStyle = grad;
        specCtx.fillRect(i * barWidth + 1, specCanvas.height - barHeight, barWidth - 2, barHeight);
    }
}

function updateUptime() {
    const uptimeText = document.getElementById("uptime");
    if (uptimeText) {
        uptimeText.textContent = Math.floor(timeSec) + "s";
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    timeSec += 0.016 * playbackSpeed;
    const isAudioTab = document.getElementById("tab-audio").style.display !== "none";
    const mags = getAudioData();
    
    if (isAudioTab) {
        drawSpectrum(mags);
    }

    // Determine target haptic intensity
    let activeAmp = 0;
    if (isPlaying) {
        if (isAudioTab) {
            // Audio-reactive mode: map bass spectrum directly to LRA/ERM vibration amplitude
            const gain = parseFloat(document.getElementById("audioGain").value);
            activeAmp = Math.min(1.0, mags.slice(0, 4).reduce((a,b)=>a+b, 0)/4 * (gain * 0.45));
        } else {
            // Standard pattern mode
            activeAmp = activePattern.func(timeSec) * (masterIntensity / 255);
        }
    }
    
    // Push haptic value to scroll buffer
    waveHistory.push(activeAmp);
    if (waveHistory.length > historyLen) waveHistory.shift();
    
    // ── 1. Draw Virtual Actuator & Wave Telemetry on prevCanvas ──
    prevCtx.fillStyle = "#090d16";
    prevCtx.fillRect(0, 0, prevCanvas.width, prevCanvas.height);
    
    // Grid lines
    prevCtx.strokeStyle = "rgba(30, 41, 59, 0.5)";
    prevCtx.lineWidth = 1;
    for (let x = 120; x < prevCanvas.width; x += 40) {
        prevCtx.beginPath();
        prevCtx.moveTo(x, 0);
        prevCtx.lineTo(x, prevCanvas.height);
        prevCtx.stroke();
    }
    for (let y = 30; y < prevCanvas.height; y += 30) {
        prevCtx.beginPath();
        prevCtx.moveTo(120, y);
        prevCtx.lineTo(prevCanvas.width, y);
        prevCtx.stroke();
    }
    
    // Draw the Actuator Schematic
    drawVirtualActuator(prevCtx, 60, prevCanvas.height / 2, 36, activeAmp);
    
    // Draw the Scrolling Telemetry Wave
    if (waveHistory.length > 1) {
        const startX = 120;
        const width = prevCanvas.width - startX;
        const step = width / (historyLen - 1);
        
        prevCtx.beginPath();
        for (let i = 0; i < waveHistory.length; i++) {
            const h = waveHistory[i] * (prevCanvas.height - 20);
            const x = startX + i * step;
            const y = prevCanvas.height - 10 - h;
            if (i === 0) prevCtx.moveTo(x, y);
            else prevCtx.lineTo(x, y);
        }
        
        // Solid telemetry line
        prevCtx.strokeStyle = "#0ea5e9";
        prevCtx.lineWidth = 2.5;
        prevCtx.stroke();
        
        // Semi-transparent fill under telemetry
        prevCtx.lineTo(prevCanvas.width, prevCanvas.height - 10);
        prevCtx.lineTo(startX, prevCanvas.height - 10);
        prevCtx.closePath();
        
        const grad = prevCtx.createLinearGradient(0, 0, 0, prevCanvas.height);
        grad.addColorStop(0, "rgba(14, 165, 233, 0.25)");
        grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");
        prevCtx.fillStyle = grad;
        prevCtx.fill();
    }
    
    // ── 2. Draw Scrolling Banner on Hero Canvas ──
    heroCtx.fillStyle = "#ffffff";
    heroCtx.fillRect(0, 0, heroCanvas.width, heroCanvas.height);
    
    // Subgrid
    heroCtx.strokeStyle = "rgba(14, 165, 233, 0.05)";
    heroCtx.lineWidth = 1;
    for (let x = 0; x < heroCanvas.width; x += 50) {
        heroCtx.beginPath();
        heroCtx.moveTo(x, 0);
        heroCtx.lineTo(x, heroCanvas.height);
        heroCtx.stroke();
    }
    
    if (waveHistory.length > 1) {
        const step = heroCanvas.width / (historyLen - 1);
        heroCtx.beginPath();
        for (let i = 0; i < waveHistory.length; i++) {
            const h = waveHistory[i] * (heroCanvas.height - 15);
            const x = i * step;
            const y = heroCanvas.height / 2 + Math.sin(timeSec * 5 + i * 0.05) * h * 0.4;
            if (i === 0) heroCtx.moveTo(x, y - h/2);
            else heroCtx.lineTo(x, y - h/2);
        }
        for (let i = waveHistory.length - 1; i >= 0; i--) {
            const h = waveHistory[i] * (heroCanvas.height - 15);
            const x = i * step;
            const y = heroCanvas.height / 2 + Math.sin(timeSec * 5 + i * 0.05) * h * 0.4;
            heroCtx.lineTo(x, y + h/2);
        }
        
        const grad = heroCtx.createLinearGradient(0, 0, heroCanvas.width, 0);
        grad.addColorStop(0, "rgba(14, 165, 233, 0.85)");
        grad.addColorStop(0.5, "rgba(99, 102, 241, 0.85)");
        grad.addColorStop(1, "rgba(14, 165, 233, 0.85)");
        heroCtx.fillStyle = grad;
        heroCtx.fill();
    }

    updateUptime();
}

animate();
