import { Parser, tokenize, Evaluator, highlight, updateAudioState, pnoise1 } from './compiler.js';
import { addSerialLog, triggerI2CBlink, updateHardwarePins, initBootLogs, serialConsole } from './emulator.js';
import { PATTERNS, loadCustomPatterns, initPhoneHaptics } from './haptics.js';

// ─── CANVAS REFS ────────────────────────────────────────────────────────────
const prevCanvas = document.getElementById("prev");
const prevCtx = prevCanvas.getContext("2d");
const heroCanvas = document.getElementById("hero-canvas");
const heroCtx = heroCanvas.getContext("2d");
const specCanvas = document.getElementById("spectrum-canvas");
const specCtx = specCanvas.getContext("2d");

// ─── MAIN VARIABLES ─────────────────────────────────────────────────────────
let activePattern = PATTERNS[0];
let masterIntensity = 180; // 0-255
let frequencyShift = 150; // Hz
let playbackSpeed = 1.0;
let isPlaying = true;
let smoothedAmp = 0;
let startupFloor = 0.15; // default 15%

// Dynamic Audio Partitioning Bins Configuration
let numBins = 3;
let dividers = [8, 18];
let draggingDividerIdx = -1;

let timeSec = 0;
const waveHistory = [];
const historyLen = 220;
let isMotorStalled = false;
let stallLogThrottle = 0;

let audioCtx = null;
let analyser = null;
let micStream = null;
let micSource = null;
let dataArray = null;
let useLiveMic = false;
let smoothedAudioAmp = 0;

// Phone haptics controller
const phoneHaptics = initPhoneHaptics(addSerialLog);
let lastPhoneVibrateTime = 0;

// ─── HIGH-DPI CANVAS SHARPNESS HELPER ───────────────────────────────────────
function setupSharpCanvas(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
    ctx.scale(dpr, dpr);
}

// Initialize sharp canvases on load
setupSharpCanvas(prevCanvas);
setupSharpCanvas(heroCanvas);
setupSharpCanvas(specCanvas);

window.addEventListener("resize", () => {
    setupSharpCanvas(prevCanvas);
    setupSharpCanvas(heroCanvas);
    setupSharpCanvas(specCanvas);
});

// Tab switching
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    ["play", "lib", "studio", "audio", "device"].forEach(id => {
        const el = document.getElementById("tab-" + id);
        if (el) el.style.display = (id === t.dataset.tab) ? "" : "none";
    });
    if (t.dataset.tab === "audio") {
        setupSharpCanvas(specCanvas);
        setupMicrophone();
    } else {
        stopMicrophone();
    }
    // Setup visible canvases
    setupSharpCanvas(prevCanvas);
    setupSharpCanvas(heroCanvas);
}));

// ─── EDITOR WIRING ──────────────────────────────────────────────────────────
const ta = document.getElementById("ta");
const hl = document.getElementById("hl");
const gutter = document.getElementById("gutter");
const compilerStatus = document.getElementById("compiler-status");
const customPatternNameInput = document.getElementById("customPatternName");

function syncHL() {
    if (!ta) return;
    const v = ta.value;
    hl.innerHTML = highlight(v);
    const lines = v.split("\n").length;
    let g = ""; for (let i = 1; i <= lines; i++) g += i + "\n";
    gutter.textContent = g;
    hl.scrollTop  = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
}

if (ta) {
    ta.addEventListener("input", () => { 
        syncHL(); 
        compileCustom(); 
        localStorage.setItem("HAXEL_EDITOR_DRAFT", ta.value);
    });
    ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
    ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(en);
            ta.selectionStart = ta.selectionEnd = s + 4;
            syncHL(); 
            compileCustom();
            localStorage.setItem("HAXEL_EDITOR_DRAFT", ta.value);
        }
    });
}

// Presets
const PRESETS = {
    pulse: `/* Pulse Click preset */\nsquare(t * 5, 0.2)`,
    saw: `/* Sawtooth Sweep preset */\nfrac(t * 1.8) * (intensity / 255)`,
    pwm: `/* PWM Buzz preset */\nsin(t * 60) * 0.4 + 0.6`,
    chaos: `/* Chaos Noise preset */\nnoise(t * 22) * wave(t * 3)`
};
document.querySelectorAll(".chip-preset").forEach(btn => {
    btn.addEventListener("click", () => {
        const code = PRESETS[btn.dataset.template];
        if (code) {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const text = ta.value;
            const separator = text.length > 0 && !text.endsWith("\n") ? "\n\n" : "";
            ta.value = text.substring(0, start) + separator + code + "\n" + text.substring(end);
            
            const newCursorPos = start + separator.length + code.length + 1;
            ta.selectionStart = ta.selectionEnd = newCursorPos;
            
            syncHL();
            compileCustom();
            isPlaying = true;
            document.getElementById("dot").className = "portal-dot ok";
            document.getElementById("connText").textContent = "playing";
            localStorage.setItem("HAXEL_EDITOR_DRAFT", ta.value);
        }
    });
});

let customEvaluator = null;
function compileCustom() {
    if (!ta) return;
    const src = ta.value;
    try {
        const ast = new Parser(tokenize(src)).parseProgram();
        customEvaluator = new Evaluator(ast);
        compilerStatus.textContent = "compiled ✓";
        compilerStatus.className = "compilation-status ok";
        addSerialLog("[IDE] Compiled custom pattern successfully!");
    } catch (e) {
        compilerStatus.textContent = "Error: " + e.message;
        compilerStatus.className = "compilation-status err";
    }
}

// ─── CONTROL BINDINGS ───────────────────────────────────────────────────────
const brightInput = document.getElementById("bright");
const brightVal = document.getElementById("brightVal");
const freqInput = document.getElementById("freqShift");
const freqVal = document.getElementById("freqVal");
const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
const floorSlider = document.getElementById("startFloor");
const floorValLabel = document.getElementById("floorVal");

const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const currentDriverText = document.getElementById("currentDriver");
const currentActuatorText = document.getElementById("currentActuator");
const drvSelect = document.getElementById("drvChip");
const actSelect = document.getElementById("actuatorType");

if (floorSlider) {
    floorSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        startupFloor = val / 100;
        if (floorValLabel) floorValLabel.textContent = val + "%";
        addSerialLog(`[HAL] Startup floor adjusted to ${val}% (${Math.round(val * 2.55)}/255)`);
        triggerI2CBlink();
        syncStateToESP32();
    });
}

brightInput.addEventListener("input", (e) => {
    masterIntensity = parseInt(e.target.value);
    brightVal.textContent = Math.round((masterIntensity / 255) * 100) + "%";
});
brightInput.addEventListener("change", (e) => {
    addSerialLog(`[HTTP] Set Master Intensity to ${e.target.value} / 255`);
    triggerI2CBlink();
    syncStateToESP32();
});

freqInput.addEventListener("input", (e) => {
    frequencyShift = parseInt(e.target.value);
    freqVal.textContent = frequencyShift + " Hz";
});
freqInput.addEventListener("change", (e) => {
    addSerialLog(`[HTTP] Set Frequency Shift to ${e.target.value} Hz`);
    triggerI2CBlink();
    syncStateToESP32();
});

speedInput.addEventListener("input", (e) => {
    playbackSpeed = parseFloat(e.target.value) / 10;
    speedVal.textContent = playbackSpeed.toFixed(1) + "x";
});
speedInput.addEventListener("change", (e) => {
    addSerialLog(`[HTTP] Set Playback Speed to ${playbackSpeed.toFixed(1)}x`);
    triggerI2CBlink();
    syncStateToESP32();
});

playBtn.addEventListener("click", () => {
    isPlaying = true;
    document.getElementById("dot").className = "portal-dot ok";
    document.getElementById("connText").textContent = "playing";
    addSerialLog("[HTTP] API Command: START pattern playback");
    syncStateToESP32();
});

stopBtn.addEventListener("click", () => {
    isPlaying = false;
    document.getElementById("dot").className = "portal-dot";
    document.getElementById("connText").textContent = "idle";
    addSerialLog("[HTTP] API Command: STOP pattern playback");
    syncStateToESP32();
});

drvSelect.addEventListener("change", (e) => {
    currentDriverText.textContent = e.target.value;
    addSerialLog(`[HAL] Driver reconfigured to: ${e.target.value}`);
    triggerI2CBlink();
});

actSelect.addEventListener("change", (e) => {
    const act = e.target.value;
    currentActuatorText.textContent = act;
    if (act === "LRA" || act === "ERM") {
        drvSelect.value = "DRV2605L";
    } else if (act === "Solenoid") {
        drvSelect.value = "DRV8833";
    }
    currentDriverText.textContent = drvSelect.value;
    addSerialLog(`[HAL] Actuator mapped to: ${act} (Driver: ${drvSelect.value})`);
    triggerI2CBlink();
});

// ─── PATTERN LIBRARY CARD RENDER ─────────────────────────────────────────────
const libCards = document.getElementById("libCards");
const chips = document.querySelectorAll(".chip");

function renderCards(filterTag = "all") {
    if (!libCards) return;
    libCards.innerHTML = "";
    PATTERNS.forEach(pat => {
        if (filterTag !== "all" && pat.category !== filterTag) return;
        
        const card = document.createElement("div");
        card.className = `card-item ${pat.id === activePattern.id ? "active" : ""}`;
        
        let actionsHtml = "";
        if (pat.isCustom) {
            actionsHtml += `<button class="btn-delete-pat" title="Delete custom pattern">&times;</button>`;
        }
        if (pat.code) {
            actionsHtml += `<button class="btn-edit-pat" title="Edit in Studio">EDIT</button>`;
        }
        
        card.innerHTML = `
            <div>
                <h4>${pat.name} ${pat.isCustom ? '<span class="badge-custom">Custom</span>' : ''}</h4>
                <p>${pat.desc}</p>
            </div>
            <div class="card-actions-row">
                ${actionsHtml}
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
            addSerialLog(`[HAL] Loaded library pattern: "${pat.name}"`);
            
            if (pat.isCustom && pat.code) {
                ta.value = pat.code;
                syncHL();
                compileCustom();
            }
            syncStateToESP32();
        });
        
        const editBtn = card.querySelector(".btn-edit-pat");
        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                ta.value = pat.code;
                customPatternNameInput.value = pat.name;
                syncHL();
                compileCustom();
                document.querySelector('.tab[data-tab="studio"]').click();
                isPlaying = true;
                document.getElementById("dot").className = "portal-dot ok";
                document.getElementById("connText").textContent = "playing";
                document.getElementById("patternName").textContent = `${pat.name} (Studio)`;
                localStorage.setItem("HAXEL_EDITOR_DRAFT", ta.value);
            });
        }
        
        const del = card.querySelector(".btn-delete-pat");
        if (del) {
            del.addEventListener("click", (e) => {
                deleteCustomPattern(pat.id, e);
            });
        }
        
        libCards.appendChild(card);
    });
    populateBinPatternSelects();
}

function deleteCustomPattern(id, event) {
    event.stopPropagation();
    if (!confirm("Delete this custom pattern?")) return;
    
    const idx = PATTERNS.findIndex(p => p.id === id);
    if (idx >= 0) PATTERNS.splice(idx, 1);
    
    const raw = localStorage.getItem("HAXEL_CUSTOM_PATTERNS");
    if (raw) {
        try {
            let list = JSON.parse(raw);
            list = list.filter(p => p.id !== id);
            localStorage.setItem("HAXEL_CUSTOM_PATTERNS", JSON.stringify(list));
        } catch (e) {}
    }
    
    if (isRealESP32) {
        fetch(`/json/custom-patterns?id=${id}`, {
            method: 'DELETE'
        }).then(() => {
            addSerialLog(`[ESP32] Deleted custom pattern ${id} from ESP32`);
        }).catch(err => {
            addSerialLog(`[ESP32] [ERROR] Failed to delete from ESP32: ${err.message}`);
        });
    }
    
    activePattern = PATTERNS[0];
    document.getElementById("patternName").textContent = activePattern.name;
    addSerialLog(`[IDE] Deleted custom pattern ${id}`);
    renderCards();
}

chips.forEach(chip => chip.addEventListener("click", () => {
    chips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderCards(chip.dataset.tag);
}));

// LocalStorage Custom Patterns Save Handler
const savePatternBtn = document.getElementById("savePatternBtn");
if (savePatternBtn) {
    savePatternBtn.addEventListener("click", () => {
        const name = customPatternNameInput.value.trim() || "My Waveform";
        const code = ta.value;
        const id = "custom_" + Date.now();
        
        try {
            const ast = new Parser(tokenize(code)).parseProgram();
            const evalr = new Evaluator(ast);
            
            const raw = localStorage.getItem("HAXEL_CUSTOM_PATTERNS");
            const list = raw ? JSON.parse(raw) : [];
            list.push({ id, name, code });
            localStorage.setItem("HAXEL_CUSTOM_PATTERNS", JSON.stringify(list));
            
            const newPat = {
                id,
                name,
                category: "custom",
                desc: "User defined JavaScript math pattern.",
                isCustom: true,
                code,
                func: (t) => evalr.run(t, frequencyShift, playbackSpeed, masterIntensity, startupFloor)
            };
            PATTERNS.push(newPat);
            activePattern = newPat;
            document.getElementById("patternName").textContent = name;
            
            addSerialLog(`[IDE] Saved new custom pattern: "${name}"`);
            
            if (isRealESP32) {
                fetch('/json/custom-patterns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name, code })
                }).then(res => res.json())
                  .then(data => {
                      if (!data.ok) {
                          alert("ESP32 Compilation Error: " + data.error);
                      } else {
                          addSerialLog(`[ESP32] Saved new custom pattern to ESP32: "${name}"`);
                          syncStateToESP32();
                      }
                  }).catch(err => {
                      addSerialLog(`[ESP32] [ERROR] Failed to save to ESP32: ${err.message}`);
                  });
            }
            
            renderCards();
            document.querySelector('.tab[data-tab="lib"]').click();
        } catch (e) {
            alert("Cannot save pattern. Code has compilation errors!");
        }
    });
}

// ─── AUDIO SYSTEM ───────────────────────────────────────────────────────────
async function setupMicrophone() {
    if (useLiveMic) return;
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
        setupSharpCanvas(specCanvas);
        addSerialLog("[AUDIO] I2S Microphone Stream Connected");
    } catch (err) {
        console.warn("Microphone access denied:", err);
        document.getElementById("micSrc").value = "0";
        addSerialLog("[AUDIO] [ERROR] Failed to bind I2S Microphone");
    }
}

function stopMicrophone() {
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    useLiveMic = false;
    document.getElementById("micSrc").value = "0";
}

document.getElementById("micSrc").addEventListener("change", (e) => {
    if (e.target.value === "1" && !useLiveMic) {
        setupMicrophone();
    } else if (e.target.value === "0" && useLiveMic) {
        stopMicrophone();
        addSerialLog("[AUDIO] Switched to simulated synthesizer");
    }
});

// ─── AUDIO REACTIVE BINS DRAG INTERACTIVES ──────────────────────────────────
function updateBinRangeLabels() {
    for (let i = 0; i < numBins; i++) {
        const startVal = i === 0 ? 0 : dividers[i - 1];
        const endVal = i === numBins - 1 ? 32 : dividers[i];
        
        const fStart = Math.round(startVal * 172);
        const fEnd = Math.min(5500, Math.round(endVal * 172));
        
        const label = document.getElementById(`bin-${i}-range`);
        if (label) {
            label.textContent = `${fStart} - ${fEnd} Hz`;
        }
    }
}

export function populateBinPatternSelects() {
    // Handled in renderBinRows to ensure options are always clean
}

function renderBinRows() {
    const container = document.getElementById("bins-container");
    if (!container) return;
    
    // Save current values of selects
    const savedValues = [];
    for (let i = 0; i < numBins; i++) {
        const el = document.getElementById(`bin-${i}-pattern`);
        savedValues.push(el ? el.value : null);
    }
    
    container.innerHTML = "";
    
    const defaults = ["pulse", "rumble", "staccato", "ambient", "crescendo"];
    
    for (let i = 0; i < numBins; i++) {
        const row = document.createElement("div");
        row.className = "bin-row";
        row.style = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 10px;";
        
        let labelName = `Bin ${i}`;
        if (numBins === 3) {
            const labels = ["Bass", "Mids", "Treble"];
            labelName += ` (${labels[i]})`;
        }
        
        row.innerHTML = `
            <span class="bin-title" style="font-weight: bold; width: 110px;">${labelName}:</span>
            <span class="bin-range" id="bin-${i}-range" style="font-family: var(--mono); font-size: 11px; width: 110px;">-</span>
            <select class="bin-pattern-select" id="bin-${i}-pattern" style="flex: 1; padding: 4px; border: 2px solid #111; font-family: var(--mono); font-size: 11px;">
                <option value="none">NONE (No Reactivity)</option>
            </select>
        `;
        container.appendChild(row);
        
        // Populate select options
        const select = row.querySelector(".bin-pattern-select");
        select.addEventListener("change", () => {
            syncStateToESP32();
        });
        PATTERNS.forEach(pat => {
            const opt = document.createElement("option");
            opt.value = pat.id;
            opt.textContent = pat.name;
            select.appendChild(opt);
        });
        
        // Restore value or set default
        const prevVal = savedValues[i];
        if (prevVal && Array.from(select.options).some(o => o.value === prevVal)) {
            select.value = prevVal;
        } else {
            select.value = defaults[i % defaults.length];
        }
    }
    
    updateBinRangeLabels();
}

function initSpectrumDividers() {
    if (!specCanvas) return;
    
    const getMouseX = (e) => {
        const rect = specCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return clientX - rect.left;
    };

    const handleStart = (e) => {
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = specCanvas.width / dpr;
        
        // Find which divider is clicked/touched
        let closestIdx = -1;
        let minDist = 15;
        dividers.forEach((divVal, idx) => {
            const x = divVal * (cssW / 32);
            const dist = Math.abs(mx - x);
            if (dist < minDist) {
                minDist = dist;
                closestIdx = idx;
            }
        });
        
        if (closestIdx >= 0) {
            draggingDividerIdx = closestIdx;
            e.preventDefault();
        }
    };

    const handleMove = (e) => {
        if (draggingDividerIdx < 0) return;
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = specCanvas.width / dpr;
        
        const band = Math.round((mx / cssW) * 32);
        
        // Constraints
        const minVal = draggingDividerIdx === 0 ? 1 : dividers[draggingDividerIdx - 1] + 1;
        const maxVal = draggingDividerIdx === dividers.length - 1 ? 31 : dividers[draggingDividerIdx + 1] - 1;
        
        dividers[draggingDividerIdx] = Math.max(minVal, Math.min(maxVal, band));
        
        updateBinRangeLabels();
        e.preventDefault();
    };

    const handleEnd = () => {
        if (draggingDividerIdx >= 0) {
            syncStateToESP32();
        }
        draggingDividerIdx = -1;
    };

    specCanvas.addEventListener("mousedown", handleStart);
    specCanvas.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);

    specCanvas.addEventListener("touchstart", handleStart, { passive: false });
    specCanvas.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    // Wire buttons
    const addBtn = document.getElementById("addBinBtn");
    const subBtn = document.getElementById("subBinBtn");
    
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            if (numBins >= 5) {
                addSerialLog("[WARN] Max bin partition limit (5) reached.");
                return;
            }
            numBins++;
            let newDivVal = 16;
            if (dividers.length > 0) {
                const lastVal = dividers[dividers.length - 1];
                newDivVal = Math.min(31, Math.round(lastVal + (32 - lastVal) / 2));
            }
            dividers.push(newDivVal);
            dividers.sort((a,b)=>a-b);
            
            addSerialLog(`[AUDIO] Added bin partition. Total bins: ${numBins}`);
            renderBinRows();
            triggerI2CBlink();
            syncStateToESP32();
        });
    }
    
    if (subBtn) {
        subBtn.addEventListener("click", () => {
            if (numBins <= 1) {
                addSerialLog("[WARN] Min bin partition limit (1) reached.");
                return;
            }
            numBins--;
            dividers.pop();
            
            addSerialLog(`[AUDIO] Subtracted bin partition. Total bins: ${numBins}`);
            renderBinRows();
            triggerI2CBlink();
            syncStateToESP32();
        });
    }
}

// Initialize dividers and bin rows on startup
initSpectrumDividers();
renderBinRows();

function getAudioData() {
    if (useLiveMic && analyser) {
        analyser.getByteFrequencyData(dataArray);
        const mags = Array.from(dataArray).map(v => v / 255);
        smoothedAudioAmp += (mags.slice(0, 4).reduce((a,b)=>a+b,0)/4 - smoothedAudioAmp) * 0.2;
        updateAudioState(mags, smoothedAudioAmp);
        return mags;
    }
    const mags = new Array(32).fill(0);
    const pulse1 = Math.pow(Math.max(0, Math.sin(timeSec * 4.5)), 4);
    const pulse2 = Math.pow(Math.max(0, Math.cos(timeSec * 2.2)), 8);
    
    for (let i = 0; i < 32; i++) {
        if (i < 4) {
            mags[i] = pulse1 * 0.95 + Math.random() * 0.05;
        } else if (i < 12) {
            mags[i] = pulse2 * 0.65 + Math.sin(timeSec * 8 + i) * 0.15 + Math.random() * 0.05;
        } else {
            mags[i] = Math.max(0, Math.sin(timeSec * 15 + i) * 0.25) + Math.random() * 0.08;
        }
    }
    smoothedAudioAmp += (mags.slice(0, 4).reduce((a,b)=>a+b,0)/4 - smoothedAudioAmp) * 0.2;
    updateAudioState(mags, smoothedAudioAmp);
    return mags;
}

function drawSpectrum(mags) {
    if (!specCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = specCanvas.width / dpr;
    const cssH = specCanvas.height / dpr;

    specCtx.fillStyle = "#f4ebd0"; // Cream background
    specCtx.fillRect(0, 0, cssW, cssH);
    const barWidth = (cssW / 32);
    const gain = parseFloat(document.getElementById("audioGain").value);
    
    specCtx.strokeStyle = "#111111";
    specCtx.lineWidth = 1.5;

    for (let i = 0; i < 32; i++) {
        const val = Math.min(1.0, mags[i] * (gain * 0.25));
        const barHeight = val * (cssH - 10);
        
        // Map 0-31 frequency bands to HSL color wheel (Hue 0 for Red, shifting to Hue 280 for Purple)
        const hue = (i / 31) * 280;
        specCtx.fillStyle = `hsl(${hue}, 85%, 45%)`;
        specCtx.fillRect(i * barWidth + 1, cssH - barHeight, barWidth - 2, barHeight);
        specCtx.strokeRect(i * barWidth + 1, cssH - barHeight, barWidth - 2, barHeight);
    }

    // Draw Dividers
    dividers.forEach((divVal, idx) => {
        const x = divVal * barWidth;
        const color = ["#e23b24", "#f2b134", "#002f6c", "#9b59b6"][idx % 4];
        
        specCtx.strokeStyle = color;
        specCtx.lineWidth = 3;
        specCtx.beginPath();
        specCtx.moveTo(x, 0);
        specCtx.lineTo(x, cssH);
        specCtx.stroke();

        specCtx.fillStyle = color;
        specCtx.strokeStyle = "#111111";
        specCtx.lineWidth = 2;
        specCtx.beginPath();
        specCtx.arc(x, 15, 7, 0, Math.PI * 2);
        specCtx.fill();
        specCtx.stroke();
    });
}

// ─── PHYSICAL ACTUATOR DRAWING ──────────────────────────────────────────────
function drawVirtualActuator(ctx, cx, cy, radius, activeAmp) {
    const isLRA = actSelect.value === "LRA";
    const isSolenoid = actSelect.value === "Solenoid";
    
    if (activeAmp > 0.02 && !isMotorStalled) {
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
    if (activeAmp > 0.01 && !isMotorStalled) {
        const vibrationFreq = isLRA ? frequencyShift : 25;
        dx = (Math.random() - 0.5) * 6 * activeAmp * (1.0 + Math.sin(timeSec * vibrationFreq) * 0.2);
        dy = (Math.random() - 0.5) * 6 * activeAmp * (1.0 + Math.cos(timeSec * vibrationFreq) * 0.2);
    }

    const ax = cx + dx;
    const ay = cy + dy;

    ctx.fillStyle = isMotorStalled ? "#e23b24" : "#ffffff";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isLRA) {
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = -15; i <= 15; i += 5) {
            const sx = ax + i;
            const sy = ay + Math.sin(i * 0.4) * 8;
            if (i === -15) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        ctx.fillStyle = isMotorStalled ? "rgba(226,59,36,0.5)" : "#f2b134";
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = "#111111";
        ctx.font = "bold 8px Inter";
        ctx.textAlign = "center";
        ctx.fillText(isMotorStalled ? "STALL" : "LRA", ax, ay + 3);
    } else if (isSolenoid) {
        ctx.fillStyle = "#002f6c";
        ctx.fillRect(ax - 20, ay - 10, 40, 20);
        ctx.strokeRect(ax - 20, ay - 10, 40, 20);

        const stroke = isMotorStalled ? 0 : activeAmp * 12;
        ctx.fillStyle = isMotorStalled ? "rgba(226,59,36,0.8)" : "#e23b24";
        ctx.fillRect(ax - 5 + stroke, ay - 6, 20, 12);
        ctx.strokeRect(ax - 5 + stroke, ay - 6, 20, 12);
    } else {
        ctx.strokeStyle = "rgba(17,17,17,0.2)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 0.75, 0, Math.PI * 2);
        ctx.stroke();

        const rotationSpeed = isMotorStalled ? 0 : activeAmp * 25;
        const angle = timeSec * rotationSpeed;
        ctx.fillStyle = isMotorStalled ? "rgba(226,59,36,0.5)" : "#e23b24";
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
}

// ─── TICK LOOP ──────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    
    timeSec += 0.016 * playbackSpeed;
    const isAudioTab = document.getElementById("tab-audio").style.display !== "none";
    const isStudioTab = document.getElementById("tab-studio").style.display !== "none";
    const mags = getAudioData();
    
    if (isAudioTab) {
        drawSpectrum(mags);
    }

    let activeAmp = 0;
    if (isPlaying) {
        if (isAudioTab) {
            const gain = parseFloat(document.getElementById("audioGain").value);
            let maxAmp = 0;
            
            for (let i = 0; i < numBins; i++) {
                const startIdx = i === 0 ? 0 : dividers[i - 1];
                const endIdx = i === numBins - 1 ? 32 : dividers[i];
                const len = Math.max(1, endIdx - startIdx);
                
                const vol = mags.slice(startIdx, endIdx).reduce((a,b)=>a+b, 0) / len * (gain * 0.45);
                
                const selectEl = document.getElementById(`bin-${i}-pattern`);
                const patternId = selectEl ? selectEl.value : "none";
                
                if (patternId !== "none") {
                    const pat = PATTERNS.find(p => p.id === patternId);
                    if (pat) {
                        const out = vol * pat.func(timeSec);
                        if (out > maxAmp) maxAmp = out;
                    }
                }
            }
            activeAmp = maxAmp;
        } else if (isStudioTab && customEvaluator) {
            activeAmp = customEvaluator.run(timeSec, frequencyShift, playbackSpeed, masterIntensity, startupFloor);
            const customName = customPatternNameInput.value.trim() || "Pattern Studio";
            document.getElementById("patternName").textContent = `${customName} (Studio)`;
        } else {
            activeAmp = activePattern.func(timeSec);
        }
    }

    // ── Motor Startup Floor Calibration Math Correction ──
    const targetAmp = activeAmp;
    const scaledAmp = targetAmp * (masterIntensity / 255);
    
    if (scaledAmp > 0.001) {
        // Boost target power by floor offset. This ensures the output is always >= startupFloor
        activeAmp = startupFloor + scaledAmp * (1.0 - startupFloor);
        
        // Physics Stall Condition
        if (startupFloor < 0.08 && scaledAmp < 0.18) {
            isMotorStalled = true;
            activeAmp = 0.02;
            stallLogThrottle++;
            if (stallLogThrottle % 180 === 1) {
                addSerialLog("[WARN] Motor STALLED! Cold start friction locked rotor. Increase Startup Floor.");
            }
        } else {
            isMotorStalled = false;
        }
    } else {
        isMotorStalled = false;
        activeAmp = 0.0;
    }

    smoothedAmp += (activeAmp - smoothedAmp) * 0.2;
    
    // Trigger browser haptics
    if (phoneHaptics.isEnabled() && isPlaying && !isMotorStalled) {
        const now = Date.now();
        const hapticThreshold = 0.15;
        if (activeAmp > hapticThreshold) {
            if (now - lastPhoneVibrateTime > 60) {
                navigator.vibrate(50);
                lastPhoneVibrateTime = now;
                phoneHaptics.setVibrateActive(true);
            }
        } else {
            if (phoneHaptics.isVibrateActive()) {
                navigator.vibrate(0);
                phoneHaptics.setVibrateActive(false);
            }
        }
    } else {
        if (phoneHaptics.isVibrateActive()) {
            navigator.vibrate(0);
            phoneHaptics.setVibrateActive(false);
        }
    }
    
    waveHistory.push(smoothedAmp);
    if (waveHistory.length > historyLen) waveHistory.shift();
    
    updateHardwarePins(smoothedAmp, isMotorStalled);

    // 1. Draw telemetry
    const dpr = window.devicePixelRatio || 1;
    const cssW = prevCanvas.width / dpr;
    const cssH = prevCanvas.height / dpr;

    prevCtx.fillStyle = "#f4ebd0";
    prevCtx.fillRect(0, 0, cssW, cssH);
    
    drawVirtualActuator(prevCtx, 60, cssH / 2, 36, smoothedAmp);
    
    prevCtx.fillStyle = "#f4ebd0";
    prevCtx.fillRect(120, 0, cssW - 120, cssH);
    
    prevCtx.strokeStyle = "#111111";
    prevCtx.lineWidth = 4;
    prevCtx.beginPath();
    prevCtx.moveTo(120, 0);
    prevCtx.lineTo(120, cssH);
    prevCtx.stroke();

    prevCtx.strokeStyle = "rgba(17, 17, 17, 0.08)";
    prevCtx.lineWidth = 1;
    for (let x = 120; x < cssW; x += 40) {
        prevCtx.beginPath();
        prevCtx.moveTo(x, 0);
        prevCtx.lineTo(x, cssH);
        prevCtx.stroke();
    }
    for (let y = 30; y < cssH; y += 30) {
        prevCtx.beginPath();
        prevCtx.moveTo(120, y);
        prevCtx.lineTo(cssW, y);
        prevCtx.stroke();
    }
    
    if (isMotorStalled) {
        prevCtx.fillStyle = "#e23b24";
        prevCtx.font = "bold 11px Inter";
        prevCtx.textAlign = "center";
        prevCtx.fillText("MOTOR STALLED", 180, 25);
    }

    if (waveHistory.length > 1) {
        const startX = 120;
        const width = cssW - startX;
        const step = width / (historyLen - 1);
        
        prevCtx.beginPath();
        for (let i = 0; i < waveHistory.length; i++) {
            const h = waveHistory[i] * (cssH - 20);
            const x = startX + i * step;
            const y = cssH - 10 - h;
            if (i === 0) prevCtx.moveTo(x, y);
            else prevCtx.lineTo(x, y);
        }
        
        prevCtx.strokeStyle = "#111111";
        prevCtx.lineWidth = 3;
        prevCtx.stroke();
        
        prevCtx.lineTo(cssW, cssH - 10);
        prevCtx.lineTo(startX, cssH - 10);
        prevCtx.closePath();
        
        prevCtx.fillStyle = "rgba(0, 47, 108, 0.25)";
        prevCtx.fill();
    }
    
    // 2. Draw Hero banner
    const heroCssW = heroCanvas.width / dpr;
    const heroCssH = heroCanvas.height / dpr;

    heroCtx.fillStyle = "#f4ebd0";
    heroCtx.fillRect(0, 0, heroCssW, heroCssH);
    
    heroCtx.strokeStyle = "rgba(17, 17, 17, 0.05)";
    heroCtx.lineWidth = 1;
    for (let x = 0; x < heroCssW; x += 50) {
        heroCtx.beginPath();
        heroCtx.moveTo(x, 0);
        heroCtx.lineTo(x, heroCssH);
        heroCtx.stroke();
    }
    
    if (waveHistory.length > 1) {
        const step = heroCssW / (historyLen - 1);
        heroCtx.beginPath();
        for (let i = 0; i < waveHistory.length; i++) {
            const h = waveHistory[i] * (heroCssH - 15);
            const x = i * step;
            const y = heroCssH / 2 + Math.sin(timeSec * 5 + i * 0.05) * h * 0.4;
            if (i === 0) heroCtx.moveTo(x, y - h/2);
            else heroCtx.lineTo(x, y - h/2);
        }
        for (let i = waveHistory.length - 1; i >= 0; i--) {
            const h = waveHistory[i] * (heroCssH - 15);
            const x = i * step;
            const y = heroCssH / 2 + Math.sin(timeSec * 5 + i * 0.05) * h * 0.4;
            heroCtx.lineTo(x, y + h/2);
        }
        
        heroCtx.strokeStyle = "#111111";
        heroCtx.lineWidth = 3;
        heroCtx.stroke();

        heroCtx.fillStyle = "#e23b24";
        heroCtx.fill();
    }

    const uptimeText = document.getElementById("uptime");
    if (uptimeText) {
        uptimeText.textContent = Math.floor(timeSec) + "s";
    }
}

// ─── INITIALIZATION BOOT ─────────────────────────────────────────────────────
const draft = localStorage.getItem("HAXEL_EDITOR_DRAFT");
if (draft && ta) {
    ta.value = draft;
}

loadCustomPatterns(frequencyShift, playbackSpeed, masterIntensity, startupFloor);
renderCards();
syncHL();
compileCustom();
initBootLogs();
animate();

// ─── REAL TIME ESP32 BRIDGE IMPLEMENTATION ────────────────────────────────────
const isRealESP32 = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'dillonsimeone.com' && window.location.hostname !== '');

function throttle(fn, ms) {
    let last = 0, timer = null;
    return function(...args) {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn.apply(this, args);
        } else {
            clearTimeout(timer);
            timer = setTimeout(() => { last = Date.now(); fn.apply(this, args); }, ms - (now - last));
        }
    };
}

const sendStateUpdate = throttle((patch) => {
    if (!isRealESP32) return;
    fetch('/json/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
    }).catch(() => {});
}, 100);

function syncStateToESP32() {
    if (!isRealESP32) return;
    sendStateUpdate({
        on: isPlaying,
        intensity: masterIntensity / 255,
        speed: playbackSpeed,
        startupFloor: startupFloor,
        pattern: activePattern ? activePattern.id : "",
        numBins: numBins,
        dividers: dividers,
        binPatterns: Array.from({length: numBins}).map((_, i) => {
            const el = document.getElementById(`bin-${i}-pattern`);
            return el ? el.value : "none";
        })
    });
}

function openWebSocket() {
    let ws;
    const dot = document.getElementById("dot");
    const connText = document.getElementById("connText");
    
    try {
        ws = new WebSocket(`ws://${window.location.host}/ws`, 'haxel.v1');
    } catch (e) {
        if (dot) dot.className = "portal-dot error";
        if (connText) connText.textContent = "error";
        setTimeout(openWebSocket, 2000);
        return;
    }
    
    ws.addEventListener('open', () => {
        if (dot) dot.className = "portal-dot ok";
        if (connText) connText.textContent = "connected";
    });
    
    ws.addEventListener('close', () => {
        if (dot) dot.className = "portal-dot";
        if (connText) connText.textContent = "disconnected";
        setTimeout(openWebSocket, 1500);
    });
    
    ws.addEventListener('message', ev => {
        try {
            const m = JSON.parse(ev.data);
            if (m.type === 'state' && m.data) {
                const s = m.data;
                if (s.intensity !== undefined) {
                    masterIntensity = Math.round(s.intensity * 255);
                    const el = document.getElementById("bright");
                    if (el && !el.matches(':active')) {
                        el.value = masterIntensity;
                        const vLabel = document.getElementById("brightVal");
                        if (vLabel) vLabel.textContent = Math.round((masterIntensity/255)*100) + "%";
                    }
                }
                if (s.speed !== undefined) {
                    playbackSpeed = s.speed;
                    const el = document.getElementById("speed");
                    if (el && !el.matches(':active')) {
                        el.value = Math.round(playbackSpeed * 10);
                        const vLabel = document.getElementById("speedVal");
                        if (vLabel) vLabel.textContent = playbackSpeed.toFixed(1) + "x";
                    }
                }
                if (s.startupFloor !== undefined) {
                    startupFloor = s.startupFloor;
                    const el = document.getElementById("startFloor");
                    if (el && !el.matches(':active')) {
                        el.value = Math.round(startupFloor * 100);
                        const vLabel = document.getElementById("floorVal");
                        if (vLabel) vLabel.textContent = Math.round(startupFloor * 100) + "%";
                    }
                }
                if (s.numBins !== undefined) {
                    numBins = s.numBins;
                    if (s.dividers) dividers = s.dividers.slice();
                    renderBinRows();
                }
                if (s.pattern) {
                    const p = PATTERNS.find(pat => pat.id === s.pattern);
                    if (p) {
                        activePattern = p;
                        const vLabel = document.getElementById("patternName");
                        if (vLabel) vLabel.textContent = p.name;
                    }
                }
            }
        } catch (e) {}
    });
}

if (isRealESP32) {
    (async function initRealESP32() {
        try {
            // Fetch custom patterns first
            const cpRes = await fetch('/json/custom-patterns');
            const cpList = await cpRes.json();
            cpList.forEach(p => {
                // If it doesn't already exist in PATTERNS, add it
                if (!PATTERNS.some(x => x.id === p.id)) {
                    try {
                        const ast = new Parser(tokenize(p.code)).parseProgram();
                        const evalr = new Evaluator(ast);
                        PATTERNS.push({
                            id: p.id,
                            name: p.name,
                            category: "custom",
                            desc: "User defined C++ haptic expression.",
                            isCustom: true,
                            code: p.code,
                            func: (t) => evalr.run(t, frequencyShift, playbackSpeed, masterIntensity, startupFloor)
                        });
                    } catch(e) {}
                }
            });
            renderCards();

            const r = await fetch('/json');
            const data = await r.json();
            if (data.state) {
                const s = data.state;
                if (s.intensity !== undefined) {
                    masterIntensity = Math.round(s.intensity * 255);
                    const el = document.getElementById("bright");
                    if (el) el.value = masterIntensity;
                    const vLabel = document.getElementById("brightVal");
                    if (vLabel) vLabel.textContent = Math.round((masterIntensity/255)*100) + "%";
                }
                if (s.speed !== undefined) {
                    playbackSpeed = s.speed;
                    const el = document.getElementById("speed");
                    if (el) el.value = Math.round(playbackSpeed * 10);
                    const vLabel = document.getElementById("speedVal");
                    if (vLabel) vLabel.textContent = playbackSpeed.toFixed(1) + "x";
                }
                if (s.startupFloor !== undefined) {
                    startupFloor = s.startupFloor;
                    const el = document.getElementById("startFloor");
                    if (el) el.value = Math.round(startupFloor * 100);
                    const vLabel = document.getElementById("floorVal");
                    if (vLabel) vLabel.textContent = Math.round(startupFloor * 100) + "%";
                }
                if (s.numBins !== undefined) {
                    numBins = s.numBins;
                    if (s.dividers) dividers = s.dividers.slice();
                    renderBinRows();
                }
                if (s.pattern) {
                    const p = PATTERNS.find(pat => pat.id === s.pattern);
                    if (p) {
                        activePattern = p;
                        const vLabel = document.getElementById("patternName");
                        if (vLabel) vLabel.textContent = p.name;
                    }
                }
            }
        } catch (e) {}
        openWebSocket();
    })();
}
