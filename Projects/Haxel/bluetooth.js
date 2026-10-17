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
let startupFloor = 0.35; // default 35%

// Dynamic Audio Partitioning Bins Configuration
const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let numBins = isMobileDevice ? 5 : 4;
let dividers = isMobileDevice ? [5, 12, 22, 28] : [12, 22, 28];
let draggingDividerIdx = -1;

let timeSec = 0;
const waveHistory = [];
const colorHistory = [];
const specHistory = [];
const historyLen = 220;
let telemetryMode = "classic";
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

function showMobileHapticGuide() {
    const guide = document.getElementById("mobile-haptic-guide");
    if (guide && isMobileDevice && navigator.vibrate) {
        guide.style.display = "flex";
        // Force reflow
        guide.offsetHeight;
        guide.style.transform = "translateY(0)";
        guide.style.opacity = "1";
        
        // Hide after 3.5 seconds
        clearTimeout(window.mobileGuideTimeout);
        window.mobileGuideTimeout = setTimeout(() => {
            guide.style.transform = "translateY(-100px)";
            guide.style.opacity = "0";
            setTimeout(() => {
                guide.style.display = "none";
            }, 400);
        }, 3500);
    }
}

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
            
            if (isMobileDevice && navigator.vibrate) {
                phoneHaptics.setEnabled(true);
                showMobileHapticGuide();
            }
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

document.querySelectorAll(".motor-preset").forEach(btn => {
    btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-motor");
        if (id === "130") {
            startupFloor = 0.50;
            masterIntensity = 255;
            addSerialLog("[HAL] Preset: Type 130 Motor (floor 50%, intensity 100%)");
        } else if (id === "gentle") {
            startupFloor = 0.15;
            masterIntensity = Math.round(0.70 * 255);
            addSerialLog("[HAL] Preset: Gentle / LRA (floor 15%, intensity 70%)");
        } else {
            return;
        }
        if (floorSlider) {
            floorSlider.value = Math.round(startupFloor * 100);
            if (floorValLabel) floorValLabel.textContent = Math.round(startupFloor * 100) + "%";
        }
        if (brightInput) {
            brightInput.value = masterIntensity;
            if (brightVal) brightVal.textContent = Math.round((masterIntensity / 255) * 100) + "%";
        }
        triggerI2CBlink();
        syncStateToESP32();
    });
});

brightInput.addEventListener("input", (e) => {
    masterIntensity = parseInt(e.target.value);
    brightVal.textContent = Math.round((masterIntensity / 255) * 100) + "%";
});
brightInput.addEventListener("change", (e) => {
    addSerialLog(`[BLE] Set Master Intensity to ${e.target.value} / 255`);
    triggerI2CBlink();
    syncStateToESP32();
});

freqInput.addEventListener("input", (e) => {
    frequencyShift = parseInt(e.target.value);
    freqVal.textContent = frequencyShift + " Hz";
});
freqInput.addEventListener("change", (e) => {
    addSerialLog(`[BLE] Set Frequency Shift to ${e.target.value} Hz`);
    triggerI2CBlink();
    syncStateToESP32();
});

speedInput.addEventListener("input", (e) => {
    playbackSpeed = parseFloat(e.target.value) / 10;
    speedVal.textContent = playbackSpeed.toFixed(1) + "x";
});
speedInput.addEventListener("change", (e) => {
    addSerialLog(`[BLE] Set Playback Speed to ${playbackSpeed.toFixed(1)}x`);
    triggerI2CBlink();
    syncStateToESP32();
});

playBtn.addEventListener("click", () => {
    isPlaying = true;
    document.getElementById("dot").className = "portal-dot ok";
    document.getElementById("connText").textContent = "playing";
    addSerialLog("[BLE] API Command: START pattern playback");
    syncStateToESP32();
    
    if (isMobileDevice && navigator.vibrate) {
        phoneHaptics.setEnabled(true);
        showMobileHapticGuide();
    }
});

stopBtn.addEventListener("click", () => {
    isPlaying = false;
    document.getElementById("dot").className = "portal-dot";
    document.getElementById("connText").textContent = "idle";
    addSerialLog("[BLE] API Command: STOP pattern playback");
    syncStateToESP32();
});

const audioMinFreqInput = document.getElementById("audioMinFreq");
const minFreqValLabel = document.getElementById("minFreqVal");
const audioMaxFreqInput = document.getElementById("audioMaxFreq");
const maxFreqValLabel = document.getElementById("maxFreqVal");
const audioGainInput = document.getElementById("audioGain");
const gainValLabel = document.getElementById("gainVal");

if (audioGainInput) {
    audioGainInput.addEventListener("input", (e) => {
        if (gainValLabel) gainValLabel.textContent = parseFloat(e.target.value).toFixed(1) + "x";
    });
}

function recalculateDividers() {
    const minFreq = parseFloat(audioMinFreqInput ? audioMinFreqInput.value : 40);
    const maxFreq = parseFloat(audioMaxFreqInput ? audioMaxFreqInput.value : 16000);
    
    const getBandAtFreq = (f) => Math.max(0, Math.min(32, Math.round(32 * Math.log(f / 40) / Math.log(20000 / 40))));
    const minBandIdx = getBandAtFreq(minFreq);
    const maxBandIdx = getBandAtFreq(maxFreq);
    
    const numDividers = numBins - 1;
    if (numDividers >= 1) {
        dividers = new Array(numDividers);
        dividers[0] = minBandIdx;
        if (numDividers > 1) {
            dividers[numDividers - 1] = maxBandIdx;
            for (let i = 1; i < numDividers - 1; i++) {
                const ratio = i / (numDividers - 1);
                dividers[i] = Math.round(minBandIdx + ratio * (maxBandIdx - minBandIdx));
            }
        }
    }
    
    for (let i = 0; i < dividers.length; i++) {
        if (i > 0 && dividers[i] <= dividers[i - 1]) {
            dividers[i] = dividers[i - 1] + 1;
        }
    }
    for (let i = dividers.length - 1; i >= 0; i--) {
        if (dividers[i] >= 32) dividers[i] = 31;
        if (i < dividers.length - 1 && dividers[i] >= dividers[i + 1]) {
            dividers[i] = dividers[i + 1] - 1;
        }
    }
    
    renderBinRows();
    syncStateToESP32();
}

if (audioMinFreqInput) {
    audioMinFreqInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (minFreqValLabel) minFreqValLabel.textContent = val + " Hz";
    });
    audioMinFreqInput.addEventListener("change", () => {
        recalculateDividers();
    });
}

if (audioMaxFreqInput) {
    audioMaxFreqInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (maxFreqValLabel) maxFreqValLabel.textContent = val + " Hz";
    });
    audioMaxFreqInput.addEventListener("change", () => {
        recalculateDividers();
    });
}

drvSelect.addEventListener("change", (e) => {
    currentDriverText.textContent = e.target.value;
    addSerialLog(`[HAL] Driver reconfigured to: ${e.target.value}`);
    renderMotors();
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

function getDriverKindEnum(kindStr) {
    // Must match haxel::hal::DriverKind in firmware IHapticDriver.h
    const map = {
        "NONE": 0,
        "L298N": 1,
        "DRV8833": 2,
        "DRV2605L": 3,
        "MOSFET": 4,
        "MINI_HBRIDGE": 5
    };
    return map[kindStr] !== undefined ? map[kindStr] : 4;
}

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
            document.getElementById("connText").textContent =
                (bleDevice && bleDevice.gatt && bleDevice.gatt.connected)
                    ? "connected" : "playing";
            addSerialLog(`[HAL] Loaded library pattern: "${pat.name}"`);
            
            if (pat.isCustom && pat.code) {
                ta.value = pat.code;
                syncHL();
                compileCustom();
                if (rxCharacteristic) {
                    bleEnqueue(() => bleSendCustomPattern({
                        id: pat.id,
                        name: pat.name || pat.id,
                        code: pat.code
                    }))
                        .then(() => syncStateToESP32())
                        .catch(err => addSerialLog(`[BLE] Custom upload failed: ${err.message}`));
                } else {
                    syncStateToESP32();
                }
            } else {
                syncStateToESP32();
            }

            if (isMobileDevice && navigator.vibrate) {
                phoneHaptics.setEnabled(true);
                showMobileHapticGuide();
            }
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

                if (isMobileDevice && navigator.vibrate) {
                    phoneHaptics.setEnabled(true);
                    showMobileHapticGuide();
                }
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
    
    if (rxCharacteristic) {
        bleEnqueue(() => bleWriteJson({ type: "custom-pattern-delete", id }))
            .then(() => addSerialLog(`[BLE] Sent delete custom pattern request for ${id}`))
            .catch(err => addSerialLog(`[BLE] [ERROR] Failed to send delete pattern: ${err.message}`));
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

document.querySelectorAll(".telemetry-toggle-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".telemetry-toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    telemetryMode = btn.dataset.mode;
    addSerialLog(`[IDE] Telemetry mode switched to: ${telemetryMode.toUpperCase()}`);
    
    if (telemetryMode === "waterfall") {
        const audioTab = document.querySelector('.tab[data-tab="audio"]');
        if (audioTab) audioTab.click();
    }
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
            
            if (rxCharacteristic) {
                bleEnqueue(() => bleSendCustomPattern({ id, name, code }))
                    .then(() => {
                        addSerialLog(`[BLE] Uploaded custom pattern "${name}" to device`);
                        syncStateToESP32();
                    })
                    .catch(err => addSerialLog(`[BLE] [ERROR] Failed to send save pattern: ${err.message}`));
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
        analyser.fftSize = 256; // 128 bands
        
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
    addSerialLog("[AUDIO] I2S Microphone Stream Closed");
}

const micSrcSelect = document.getElementById("micSrc");
if (micSrcSelect) {
    micSrcSelect.addEventListener("change", (e) => {
        if (e.target.value === "1") {
            setupMicrophone();
        } else {
            stopMicrophone();
        }
    });
}

// ─── SPECTRUM ROUTING MATRIX GENERATION ─────────────────────────────────────
const routingMatrix = document.getElementById("routingMatrix");
function renderBinRows() {
    if (!routingMatrix) return;
    routingMatrix.innerHTML = "";
    
    for (let i = 0; i < numBins; ++i) {
        const row = document.createElement("div");
        row.className = "routing-row";
        
        let rangeStr = "";
        const getFreqAtBand = (idx) => Math.round(40 * Math.pow(20000 / 40, idx / 32));
        const lowIdx = (i === 0) ? 0 : dividers[i - 1];
        const highIdx = (i === numBins - 1) ? 31 : dividers[i];
        rangeStr = `${getFreqAtBand(lowIdx)}-${getFreqAtBand(highIdx)} Hz`;
        
        row.innerHTML = `
            <div style="flex: 1; display: flex; flex-direction: column;">
                <span class="bin-title" style="font-weight: bold; font-size: 11px;">BIN ${String(i).padStart(2, '0')}</span>
                <span class="bin-freq-label" style="font-size: 10px; color: #555;">${rangeStr}</span>
            </div>
            
            <div class="bin-divider-handles" style="display: flex; gap: 4px; align-items: center; margin-right: 15px;">
                ${i < numBins - 1 ? `<button class="btn-div-adj down" data-div="${i}">&lt;</button><span class="div-val">${dividers[i]}</span><button class="btn-div-adj up" data-div="${i}">&gt;</button>` : ''}
            </div>

            <div style="flex: 2; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                <label style="font-size: 10px;">Pattern:</label>
                <select class="bin-pattern-select" id="bin-${i}-pattern" style="padding: 4px; font-family: var(--font-display); font-size: 10px;">
                    <option value="none">None (Muted)</option>
                </select>
            </div>
        `;
        
        routingMatrix.appendChild(row);
    }

    document.querySelectorAll(".btn-div-adj").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const divIdx = parseInt(btn.dataset.div);
            const isUp = btn.classList.contains("up");
            
            let val = dividers[divIdx];
            if (isUp) val++; else val--;
            
            const min = (divIdx === 0) ? 1 : dividers[divIdx - 1] + 1;
            const max = (divIdx === dividers.length - 1) ? 30 : dividers[divIdx + 1] - 1;
            
            if (val >= min && val <= max) {
                dividers[divIdx] = val;
                recalculateDividers();
            }
        });
    });

    populateBinPatternSelects();
    
    document.querySelectorAll(".bin-pattern-select").forEach(sel => {
        sel.addEventListener("change", () => {
            syncStateToESP32();
        });
    });
}

function populateBinPatternSelects() {
    for (let i = 0; i < numBins; ++i) {
        const sel = document.getElementById(`bin-${i}-pattern`);
        if (!sel) continue;
        
        const oldVal = sel.value;
        sel.innerHTML = `<option value="none">None (Muted)</option>`;
        PATTERNS.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        
        if (Array.from(sel.options).some(o => o.value === oldVal)) {
            sel.value = oldVal;
        } else {
            if (i === 0) sel.value = "Pulse";
            else if (i === 1) sel.value = "Sawtooth";
            else sel.value = "none";
        }
    }
}

renderBinRows();

// ─── WEB BLUETOOTH INTEGRATION ───────────────────────────────────────────────
let bleDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let bleWriteChain = Promise.resolve();
let lastUploadedPatternKey = "";
let bleReady = false;
let bleStateReceived = false;
let bleConfigReceived = false;
let pendingDeviceConfig = null;
let bleSyncTimer = null;
let bleSyncRetryCount = 0;

const HAXEL_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_CHAR_UUID       = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID       = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

function setBlePortalLocked(locked, message = "") {
    const portalBody = document.querySelector(".portal-body");
    if (portalBody) {
        portalBody.inert = locked;
        portalBody.style.opacity = locked ? "0.55" : "";
        portalBody.style.pointerEvents = locked ? "none" : "";
        portalBody.setAttribute("aria-busy", locked ? "true" : "false");
    }
    const connText = document.getElementById("connText");
    if (connText && message) connText.textContent = message;
}

function resetBleHydration(message = "connect BLE") {
    bleReady = false;
    bleStateReceived = false;
    bleConfigReceived = false;
    pendingDeviceConfig = null;
    bleSyncRetryCount = 0;
    clearTimeout(bleSyncTimer);
    setBlePortalLocked(true, message);
}

function finishBleHydrationIfReady() {
    if (!bleStateReceived || !bleConfigReceived) return;
    bleReady = true;
    clearTimeout(bleSyncTimer);
    setBlePortalLocked(false, "connected");
    const bleStatus = document.getElementById("bleStatusLabel");
    if (bleStatus) bleStatus.textContent = "Connected · settings loaded";
    addSerialLog("[SAFETY] Device state and hardware configuration loaded. Controls unlocked.");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function patternUploadKey(id, code) {
    return `${id}\n${code}`;
}

function bleEnqueue(task) {
    bleWriteChain = bleWriteChain.then(task, task);
    return bleWriteChain;
}

async function bleWriteJson(obj) {
    if (!rxCharacteristic) throw new Error("BLE not connected");
    const payload = JSON.stringify(obj);
    const data = new TextEncoder().encode(payload);
    // Prefer acknowledged writes — NR drops are silent when over MTU.
    if (rxCharacteristic.properties && rxCharacteristic.properties.write) {
        await rxCharacteristic.writeValue(data);
    } else {
        await rxCharacteristic.writeValueWithoutResponse(data);
    }
}

async function bleSendCustomPattern({ id, name, code }) {
    // Keep full JSON under ~120 bytes so default ATT MTUs still work.
    const CODE_CHUNK = 48;
    const total = Math.max(1, Math.ceil(code.length / CODE_CHUNK));
    addSerialLog(`[BLE] Uploading pattern '${id}' (${code.length} chars, ${total} chunk(s))`);
    for (let seq = 0; seq < total; seq++) {
        const piece = code.slice(seq * CODE_CHUNK, (seq + 1) * CODE_CHUNK);
        await bleWriteJson({
            type: "custom-pattern",
            id,
            name: name || id,
            code: piece,
            seq,
            total
        });
        if (seq + 1 < total) await delay(40);
    }
    lastUploadedPatternKey = patternUploadKey(id, code);
    addSerialLog(`[BLE] Pattern '${id}' upload complete`);
}

// Bluetooth API Availability Check & UI Bindings
const isBluetoothSupported = 'bluetooth' in navigator;

function updateConnectButtonsState(connected, connecting = false) {
    const connectBtn = document.getElementById("bleConnectBtn");
    const connectBtnDoc = document.getElementById("bleConnectBtnDoc");
    const buttons = [connectBtn, connectBtnDoc].filter(Boolean);
    
    buttons.forEach(btn => {
        if (!isBluetoothSupported) {
            btn.textContent = "BLE UNSUPPORTED";
            btn.disabled = true;
            btn.style.cursor = "not-allowed";
            btn.style.opacity = "0.6";
        } else if (connecting) {
            btn.textContent = "CONNECTING...";
            btn.disabled = true;
        } else if (connected) {
            btn.textContent = "DISCONNECT BLE";
            btn.disabled = false;
            btn.style.backgroundColor = "var(--bauhaus-red)";
        } else {
            btn.textContent = "CONNECT BLE";
            btn.disabled = false;
            btn.style.backgroundColor = "";
        }
    });
}

// Bind event listeners to both buttons
const connectBtn = document.getElementById('bleConnectBtn');
const connectBtnDoc = document.getElementById('bleConnectBtnDoc');
[connectBtn, connectBtnDoc].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', async () => {
            if (!isBluetoothSupported) return;
            if (bleDevice && bleDevice.gatt.connected) {
                disconnectBLE();
                return;
            }
            await connectBLE();
        });
    }
});

// Display a clear warning on the page if Bluetooth is not supported
if (!isBluetoothSupported) {
    updateConnectButtonsState(false);
    
    // Add warning banner to doc-card
    const docCard = document.querySelector(".doc-card");
    if (docCard) {
        const warningAlert = document.createElement("div");
        warningAlert.style.background = "var(--bauhaus-red)";
        warningAlert.style.color = "#ffffff";
        warningAlert.style.border = "var(--border-width) solid var(--black)";
        warningAlert.style.padding = "20px";
        warningAlert.style.fontWeight = "bold";
        warningAlert.style.marginTop = "20px";
        warningAlert.style.boxShadow = "6px 6px 0 var(--black)";
        warningAlert.innerHTML = `
            <div style="font-size: 14px; text-transform: uppercase; margin-bottom: 8px; font-family: var(--font-display);">⚠️ Web Bluetooth API Unsupported</div>
            <div style="font-size: 13px; font-weight: normal; line-height: 1.4;">
                This browser does not support the Web Bluetooth API. Please open this page in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or another Chromium-based browser to connect to Haxel devices.
            </div>
        `;
        docCard.appendChild(warningAlert);
    }
}

async function connectBLE() {
    const dot = document.getElementById("dot");
    const connText = document.getElementById("connText");
    const bleStatus = document.getElementById("bleStatusLabel");
    
    resetBleHydration("connecting...");
    addSerialLog("[BLE] Requesting Bluetooth Device...");
    updateConnectButtonsState(false, true);
    
    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [HAXEL_SERVICE_UUID] },
                { namePrefix: 'Haxel' },
                { namePrefix: 'haxel' }
            ],
            optionalServices: [HAXEL_SERVICE_UUID]
        });
        
        addSerialLog(`[BLE] Found: ${bleDevice.name}. Connecting to GATT Server...`);
        dot.className = "portal-dot";
        connText.textContent = "connecting...";
        
        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        
        const server = await bleDevice.gatt.connect();
        addSerialLog("[BLE] Connected! Getting Service...");
        
        const service = await server.getPrimaryService(HAXEL_SERVICE_UUID);
        addSerialLog("[BLE] Service found. Getting Characteristics...");
        
        rxCharacteristic = await service.getCharacteristic(RX_CHAR_UUID);
        txCharacteristic = await service.getCharacteristic(TX_CHAR_UUID);
        
        addSerialLog("[BLE] Starting Notifications...");
        await txCharacteristic.startNotifications();
        txCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
        
        dot.className = "portal-dot";
        connText.textContent = "loading settings...";
        if (bleStatus) bleStatus.textContent = "Connected · loading settings";
        updateConnectButtonsState(true);
        addSerialLog("[BLE] Connected. Requesting authoritative state and configuration...");
        
        // Read-only handshake. Never send portal defaults during connection.
        await bleWriteJson({ type: "sync-request" });
        bleSyncTimer = setTimeout(() => {
            if (!bleReady) {
                addSerialLog("[SAFETY] Sync timed out; controls remain locked. Disconnect and retry.");
                connText.textContent = "sync failed";
                if (bleStatus) bleStatus.textContent = "Settings sync failed";
                dot.className = "portal-dot error";
            }
        }, 8000);
        
    } catch (err) {
        addSerialLog(`[BLE] [ERROR] Connection failed: ${err.message}`);
        dot.className = "portal-dot error";
        connText.textContent = "error";
        if (bleStatus) bleStatus.textContent = "Failed";
        updateConnectButtonsState(false);
    }
}

function disconnectBLE() {
    if (bleDevice) {
        addSerialLog("[BLE] Disconnecting...");
        bleDevice.gatt.disconnect();
    }
}

function onDisconnected() {
    const dot = document.getElementById("dot");
    const connText = document.getElementById("connText");
    const bleStatus = document.getElementById("bleStatusLabel");
    
    dot.className = "portal-dot";
    connText.textContent = "disconnected";
    if (bleStatus) bleStatus.textContent = "Disconnected";
    updateConnectButtonsState(false);
    rxCharacteristic = null;
    txCharacteristic = null;
    resetBleHydration("disconnected");
    addSerialLog("[BLE] Disconnected from device.");
}

function setDeviceControlValue(id, value) {
    const el = document.getElementById(id);
    if (!el || value === undefined || value === null) return;
    const str = String(value);
    if (el.tagName === "SELECT" && !Array.from(el.options).some(option => option.value === str)) {
        const option = document.createElement("option");
        option.value = str;
        option.textContent = str === "-1" ? "Unassigned (-1)" : `GPIO ${str}`;
        el.appendChild(option);
    }
    el.value = str;
}

function applyDeviceConfig(cfg) {
    if (!cfg) return;
    const ssidEl = document.getElementById("deviceSsid");
    if (ssidEl && cfg.apSsid) {
        // Show clean user suffix in text input (e.g., "Shrek" instead of "Haxel-Shrek")
        ssidEl.value = cfg.apSsid.replace(/^Haxel-?/i, "");
    }

    if (cfg.driver) {
        const kindToName = {
            0: "NONE", 1: "L298N", 2: "DRV8833",
            3: "DRV2605L", 4: "MOSFET", 5: "MINI_HBRIDGE"
        };
        const driverName = kindToName[cfg.driver.kind] || "MOSFET";
        setDeviceControlValue("drvChip", driverName);
        currentDriverText.textContent = driverName;
        setDeviceControlValue("pwmHz", cfg.driver.pwmHz);
        setDeviceControlValue("pinSDA", cfg.driver.sda);
        setDeviceControlValue("pinSCL", cfg.driver.scl);
        if (Array.isArray(cfg.driver.pins)) {
            activeMotors = cfg.driver.pins
                .map(p => Number(p))
                .filter(pin => Number.isFinite(pin) && pin >= 0);
        }
        const enabledSrc = Array.isArray(cfg.channelEnabled)
            ? cfg.channelEnabled
            : (Array.isArray(cfg.driver?.channelEnabled) ? cfg.driver.channelEnabled : null);
        if (enabledSrc) {
            channelEnabled = expandChannelEnabledForRows(
                enabledSrc, Math.max(1, activeMotors.length), cfg.driver.kind
            );
        }
        renderMotors();
    }

    if (cfg.audio) {
        const enabled = document.getElementById("audioEnabled");
        if (enabled) enabled.checked = !!cfg.audio.enabled;
        setDeviceControlValue("audioSource", cfg.audio.source);
        setDeviceControlValue("audioBclk", cfg.audio.bclk);
        setDeviceControlValue("audioWs", cfg.audio.ws);
        setDeviceControlValue("audioSd", cfg.audio.sd);
        setDeviceControlValue("audioAdc", cfg.audio.adc);
        document.getElementById("audioSource")?.dispatchEvent(new Event("change"));
    }

    if (cfg.led) {
        const enabled = document.getElementById("ledEnabled");
        if (enabled) enabled.checked = cfg.led.enabled !== false;
        setDeviceControlValue("ledPin", cfg.led.pin);
        setDeviceControlValue("ledCount", cfg.led.count);
    }

    activeKnobs = Array.isArray(cfg.knobs)
        ? cfg.knobs.filter(knob => knob.enabled !== false).map(knob => ({
            pin: knob.pin ?? -1,
            param: knob.param || "none"
        }))
        : [];
    renderKnobs();

    if (cfg.oled) {
        const enabled = document.getElementById("oledEnabled");
        if (enabled) enabled.checked = !!cfg.oled.enabled;
        if (cfg.oled.enabled) {
            setDeviceControlValue("pinSDA", cfg.oled.sda);
            setDeviceControlValue("pinSCL", cfg.oled.scl);
        }
    }

    addSerialLog(`[BLE] Loaded device config: ${cfg.apSsid || "Haxel"}, driver=${cfg.driver?.kind}, pins=[${activeMotors.join(",")}], PWM=${cfg.driver?.pwmHz}Hz`);
}

function handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const str = decoder.decode(value);
    
    try {
        const m = JSON.parse(str);
        if (m.type === "config-start") {
            pendingDeviceConfig = { knobs: [] };
            return;
        }
        if (m.type === "config" && m.section && m.data) {
            if (!pendingDeviceConfig) pendingDeviceConfig = { knobs: [] };
            if (m.section === "identity") {
                Object.assign(pendingDeviceConfig, m.data);
            } else if (m.section === "knob") {
                pendingDeviceConfig.knobs.push(m.data);
            } else {
                pendingDeviceConfig[m.section] = m.data;
            }
            return;
        }
        if (m.type === "config-complete") {
            const missing = [];
            if (!pendingDeviceConfig?.apSsid) missing.push("identity");
            if (!pendingDeviceConfig?.driver) missing.push("driver");
            if (pendingDeviceConfig?.driver?.kind === undefined) missing.push("driver.kind");
            if (pendingDeviceConfig?.driver?.pwmHz === undefined) missing.push("driver.pwmHz");
            if (!Array.isArray(pendingDeviceConfig?.driver?.pins)) missing.push("driver.pins");
            if (!pendingDeviceConfig?.audio) missing.push("audio");
            if (!pendingDeviceConfig?.led) missing.push("led");
            if (!pendingDeviceConfig?.oled) missing.push("oled");
            if (missing.length > 0) {
                addSerialLog(`[SAFETY] Incomplete config (${missing.join(", ")} missing); controls remain locked.`);
                if (bleSyncRetryCount < 2 && rxCharacteristic) {
                    bleSyncRetryCount++;
                    setTimeout(() => {
                        bleWriteJson({ type: "sync-request" })
                            .catch(err => addSerialLog(`[BLE] Config retry failed: ${err.message}`));
                    }, 250);
                }
                return;
            }
            applyDeviceConfig(pendingDeviceConfig);
            bleConfigReceived = true;
            finishBleHydrationIfReady();
            return;
        }

function drawSpectrum(mags) {
    if (!specCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = specCanvas.width / dpr;
    const cssH = specCanvas.height / dpr;

    specCtx.fillStyle = "#f4ebd0"; // Cream background
    specCtx.fillRect(0, 0, cssW, cssH);
    const barWidth = (cssW / 32);
    const audioGainInput = document.getElementById("audioGain");
    const gain = parseFloat(audioGainInput ? audioGainInput.value : 15) / 10;
    
    specCtx.strokeStyle = "#111111";
    specCtx.lineWidth = 1.5;

    for (let i = 0; i < 32; i++) {
        const val = Math.min(1.0, (mags ? mags[i] : 0) * (gain * 0.25));
        const barHeight = val * (cssH - 10);
        
        const hue = (i / 31) * 280;
        specCtx.fillStyle = `hsl(${hue}, 85%, 45%)`;
        specCtx.fillRect(i * barWidth + 1, cssH - barHeight, barWidth - 2, barHeight);
        specCtx.strokeRect(i * barWidth + 1, cssH - barHeight, barWidth - 2, barHeight);
    }

    // Draw Dividers
    dividers.forEach((divVal) => {
        const x = divVal * barWidth;
        specCtx.strokeStyle = "#e23b24"; // Bauhaus Red
        specCtx.lineWidth = 2.5;
        specCtx.beginPath();
        specCtx.moveTo(x, 0);
        specCtx.lineTo(x, cssH);
        specCtx.stroke();
    });
}
        if (m.type === 'state' && m.data) {
            const s = m.data;
            if (s.on !== undefined) {
                isPlaying = !!s.on;
                document.getElementById("dot").className = isPlaying ? "portal-dot ok" : "portal-dot";
            }
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
                if (Array.isArray(s.binPatterns)) {
                    s.binPatterns.forEach((pattern, index) => {
                        const select = document.getElementById(`bin-${index}-pattern`);
                        if (select) select.value = pattern;
                    });
                }
            }
            if (s.pattern) {
                const p = PATTERNS.find(pat => pat.id === s.pattern) || {
                    id: s.pattern,
                    name: s.pattern,
                    category: "device",
                    desc: "Pattern currently active on the connected device.",
                    func: () => 0
                };
                activePattern = p;
                const vLabel = document.getElementById("patternName");
                if (vLabel) vLabel.textContent = p.name;
            }
            if (s.uptime_ms !== undefined) {
                const uptimeText = document.getElementById("uptime");
                if (uptimeText) {
                    uptimeText.textContent = Math.floor(s.uptime_ms / 1000) + "s";
                }
            }
            if (Array.isArray(s.channels)) {
                s.channels.forEach((ch, i) => {
                    if (ch && typeof ch.on === "boolean") channelEnabled[i] = ch.on;
                });
                renderMotors();
            }
            bleStateReceived = true;
            finishBleHydrationIfReady();
        }
    } catch (e) {
        console.error("BLE Notification Parse Error:", e);
    }
}

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

const sendStateUpdate = throttle(async (patch) => {
    if (!rxCharacteristic || !bleReady) return;
    try {
        await bleWriteJson({ type: "state", patch: patch });
    } catch (err) {
        console.error("BLE State Write Error:", err);
    }
}, 100);

async function sendConfigUpdate(configPatch) {
    if (!rxCharacteristic || !bleReady) {
        throw new Error("Device settings have not finished loading");
    }
    return bleEnqueue(async () => {
        if (configPatch?.apSsid) {
            let name = configPatch.apSsid.trim();
            if (!name.startsWith("Haxel")) {
                name = "Haxel-" + name;
            }
            configPatch.apSsid = name;
        }

        const sections = [];
        const identity = {};
        if (configPatch.apSsid !== undefined) identity.apSsid = configPatch.apSsid;
        if (configPatch.hostname !== undefined) identity.hostname = configPatch.hostname;
        if (Object.keys(identity).length) sections.push({ section: "identity", data: identity });

        if (configPatch.driver || configPatch.channelEnabled) {
            const data = { ...(configPatch.driver || {}) };
            if (configPatch.channelEnabled) data.channelEnabled = configPatch.channelEnabled;
            sections.push({ section: "driver", data });
        }
        if (configPatch.audio) sections.push({ section: "audio", data: configPatch.audio });
        if (configPatch.led) sections.push({ section: "led", data: configPatch.led });
        if (configPatch.knobs?.length) sections.push({ section: "knobs", data: configPatch.knobs });
        if (configPatch.oled) sections.push({ section: "oled", data: configPatch.oled });

        if (!sections.length) return;

        // Small single-field patches still fit in one legacy write.
        const legacyPayload = JSON.stringify({ type: "config", patch: configPatch });
        if (sections.length === 1 && legacyPayload.length <= 200) {
            await bleWriteJson({ type: "config", patch: configPatch });
            addSerialLog(`[BLE] Sent config update (${legacyPayload.length} bytes)`);
            return;
        }

        await bleWriteJson({ type: "config-start" });
        await delay(30);
        for (const s of sections) {
            await bleWriteJson({ type: "config", section: s.section, data: s.data });
            await delay(30);
        }
        await bleWriteJson({ type: "config-complete" });
        addSerialLog(`[BLE] Sent config update (${sections.length} sections)`);
    });
}

function syncStateToESP32() {
    if (!bleReady) return;
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

// ─── ANIMATION / EMULATOR RENDER LOOP ─────────────────────────────────────────
function drawVirtualActuator(ctx, cx, cy, radius, amp) {
    const isLRA = actSelect.value === "LRA";
    const isSolenoid = actSelect.value === "Solenoid";
    
    if (amp > 0.02 && !isMotorStalled) {
        ctx.lineWidth = 3;
        const numWaves = 3;
        for (let i = 0; i < numWaves; i++) {
            const phase = (timeSec * 4 + i / numWaves) % 1.0;
            const currentR = radius + phase * 50;
            const alpha = (1.0 - phase) * 0.8 * amp;
            ctx.strokeStyle = `rgba(0, 47, 108, ${alpha})`;
            ctx.beginPath();
            ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    let dx = 0;
    let dy = 0;
    if (amp > 0.01 && !isMotorStalled) {
        const vibrationFreq = isLRA ? frequencyShift : 25;
        dx = (Math.random() - 0.5) * 6 * amp * (1.0 + Math.sin(timeSec * vibrationFreq) * 0.2);
        dy = (Math.random() - 0.5) * 6 * amp * (1.0 + Math.cos(timeSec * vibrationFreq) * 0.2);
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

        const stroke = isMotorStalled ? 0 : amp * 12;
        ctx.fillStyle = isMotorStalled ? "rgba(226,59,36,0.8)" : "#e23b24";
        ctx.fillRect(ax - 5 + stroke, ay - 6, 20, 12);
        ctx.strokeRect(ax - 5 + stroke, ay - 6, 20, 12);
    } else {
        ctx.strokeStyle = "rgba(17,17,17,0.2)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 0.75, 0, Math.PI * 2);
        ctx.stroke();

        const rotationSpeed = isMotorStalled ? 0 : amp * 25;
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

function animate() {
    requestAnimationFrame(animate);
    
    // Render dynamic spikes on mobile float canvas button
    const floatBtn = document.getElementById("mobile-haptic-float-btn");
    const hapticCanvas = document.getElementById("mobile-haptic-canvas");
    if (floatBtn && floatBtn.style.display !== "none" && hapticCanvas) {
        const ctx = hapticCanvas.getContext("2d");
        const w = hapticCanvas.width;
        const h = hapticCanvas.height;
        ctx.clearRect(0, 0, w, h);
        
        const centerX = w / 2;
        const centerY = h / 2;
        const baseRadius = 35; // 17.5px CSS radius
        
        const numSpikes = 28;
        const maxSpikeLength = 18;
        const amp = smoothedAmp;
        const hapticsActive = phoneHaptics.isEnabled();
        
        ctx.strokeStyle = hapticsActive ? "#e23b24" : "#f2b134";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        
        for (let i = 0; i < numSpikes; i++) {
            const angle = (i / numSpikes) * Math.PI * 2 + timeSec * 0.4;
            const noiseVal = Math.sin(timeSec * 8 + i * 1.5) * 0.12 + 0.88;
            const spikeLen = (amp * 0.85 + 0.15 * noiseVal) * maxSpikeLength;
            
            const startX = centerX + Math.cos(angle) * baseRadius;
            const startY = centerY + Math.sin(angle) * baseRadius;
            const endX = centerX + Math.cos(angle) * (baseRadius + spikeLen);
            const endY = centerY + Math.sin(angle) * (baseRadius + spikeLen);
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        
        ctx.fillStyle = hapticsActive ? "#e23b24" : "#f2b134";
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = "#111111";
        if (hapticsActive) {
            const barW = 5;
            const barH = 15;
            const gap = 5;
            ctx.fillRect(centerX - barW - gap / 2, centerY - barH / 2, barW, barH);
            ctx.fillRect(centerX + gap / 2, centerY - barH / 2, barW, barH);
        } else {
            ctx.beginPath();
            const triSize = 9;
            ctx.moveTo(centerX - triSize * 0.7 + 1.5, centerY - triSize);
            ctx.lineTo(centerX + triSize * 1.3 + 1.5, centerY);
            ctx.lineTo(centerX - triSize * 0.7 + 1.5, centerY + triSize);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    timeSec += 0.0167 * playbackSpeed;
    
    // Evaluate active pattern haptic value
    let amp = 0;
    if (isPlaying && activePattern) {
        if (activePattern.isCustom && customEvaluator) {
            try {
                amp = customEvaluator.run(timeSec, frequencyShift, playbackSpeed, masterIntensity, startupFloor);
            } catch (e) {
                amp = 0;
            }
        } else if (activePattern.func) {
            amp = activePattern.func(timeSec);
        }
        
        if (amp < 0) amp = 0;
        if (amp > 1) amp = 1;
    }
    
    // Handle audio reactivity input mapping if enabled
    let mags = null;
    if (useLiveMic && analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        mags = new Array(32).fill(0);
        
        // Logarithmic downsampling to 32 bands
        for (let i = 0; i < 32; ++i) {
            const startBand = Math.floor(Math.pow(128, i / 32));
            const endBand = Math.floor(Math.pow(128, (i + 1) / 32));
            let maxVal = 0;
            for (let j = startBand; j < endBand; ++j) {
                if (dataArray[j] > maxVal) maxVal = dataArray[j];
            }
            mags[i] = maxVal / 255;
        }

        // Apply audio reactivity routing matrix
        let finalAudioAmp = 0;
        for (let b = 0; b < numBins; ++b) {
            const sel = document.getElementById(`bin-${b}-pattern`);
            const pId = sel ? sel.value : "none";
            if (pId !== "none") {
                const lowIdx = (b === 0) ? 0 : dividers[b - 1];
                const highIdx = (b === numBins - 1) ? 31 : dividers[b];
                
                let binSum = 0, count = 0;
                for (let j = lowIdx; j <= highIdx; ++j) {
                    binSum += mags[j];
                    count++;
                }
                const binAvg = (count > 0) ? (binSum / count) : 0;
                
                const gain = parseFloat(audioGainInput ? audioGainInput.value : 15) / 10;
                const routedAmp = Math.min(1.0, binAvg * gain);
                if (routedAmp > finalAudioAmp) {
                    finalAudioAmp = routedAmp;
                }
            }
        }
        
        const gainVal = parseFloat(audioGainInput ? audioGainInput.value : 15) / 10;
        smoothedAudioAmp += (finalAudioAmp - smoothedAudioAmp) * 0.15;
        
        if (isPlaying) {
            amp = amp * (1.0 - smoothedAudioAmp) + (smoothedAudioAmp * amp);
        } else {
            amp = finalAudioAmp;
        }

        drawSpectrum(mags);
    }
    
    smoothedAmp += (amp - smoothedAmp) * 0.22;
    
    // Virtual Motor Stall Detection Warn
    if (isPlaying && amp > 0 && amp < 0.12 && startupFloor < 0.12) {
        if (++stallLogThrottle % 180 === 0) {
            addSerialLog("[EMU] [WARNING] Motor drawing current below stiction threshold. Stalling risk!");
        }
        isMotorStalled = true;
    } else {
        isMotorStalled = false;
    }

    // Trigger Phone Haptic Vibration if active
    if (phoneHaptics.isEnabled() && isPlaying && !isMotorStalled) {
        const now = Date.now();
        const hapticThreshold = 0.15;
        if (amp > hapticThreshold) {
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

    // Render visualizers
    renderVisualizer(mags);
}

function renderVisualizer(mags) {
    const isAudioTab = (document.getElementById("tab-audio").style.display !== "none");
    
    waveHistory.push(smoothedAmp);
    if (waveHistory.length > historyLen) waveHistory.shift();
    
    let activeColor = "rgba(0, 47, 108, 0.25)";
    if (isAudioTab && mags) {
        const sortedBins = Array.from({length: 32}, (_, idx) => ({index: idx, val: mags[idx]}))
            .sort((a, b) => b.val - a.val);
        const top3 = sortedBins.slice(0, 3);
        const hue1 = (top3[0].index / 31) * 280;
        const hue2 = (top3[1].index / 31) * 280;
        const hue3 = (top3[2].index / 31) * 280;
        const avgHue = (hue1 + hue2 + hue3) / 3;
        activeColor = `hsl(${avgHue}, 85%, 45%)`;
    }
    colorHistory.push(activeColor);
    if (colorHistory.length > historyLen) colorHistory.shift();
    
    specHistory.push(mags ? [...mags] : new Array(32).fill(0));
    if (specHistory.length > historyLen) specHistory.shift();
    
    updateHardwarePins(smoothedAmp, isMotorStalled);

    // Draw telemetry
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
        
        if (telemetryMode === "classic") {
            for (let i = 0; i < waveHistory.length - 1; i++) {
                const h1 = waveHistory[i] * (cssH - 20);
                const h2 = waveHistory[i + 1] * (cssH - 20);
                const x1 = startX + i * step;
                const x2 = startX + (i + 1) * step;
                
                let fillCol = colorHistory[i] || "rgba(0, 47, 108, 0.25)";
                if (fillCol.startsWith("hsl")) {
                    fillCol = fillCol.replace("hsl", "hsla").replace(")", ", 0.45)");
                }
                prevCtx.fillStyle = fillCol;
                
                prevCtx.beginPath();
                prevCtx.moveTo(x1, cssH - 10);
                prevCtx.lineTo(x1, cssH - 10 - h1);
                prevCtx.lineTo(x2, cssH - 10 - h2);
                prevCtx.lineTo(x2, cssH - 10);
                prevCtx.closePath();
                prevCtx.fill();
                
                prevCtx.strokeStyle = "#111111";
                prevCtx.lineWidth = 3;
                prevCtx.beginPath();
                prevCtx.moveTo(x1, cssH - 10 - h1);
                prevCtx.lineTo(x2, cssH - 10 - h2);
                prevCtx.stroke();
            }
        } else if (telemetryMode === "symmetric") {
            for (let i = 0; i < waveHistory.length - 1; i++) {
                const h1 = waveHistory[i] * (cssH - 20);
                const h2 = waveHistory[i + 1] * (cssH - 20);
                const x1 = startX + i * step;
                const x2 = startX + (i + 1) * step;
                
                let fillCol = colorHistory[i] || "rgba(0, 47, 108, 0.25)";
                if (fillCol.startsWith("hsl")) {
                    fillCol = fillCol.replace("hsl", "hsla").replace(")", ", 0.45)");
                }
                prevCtx.fillStyle = fillCol;
                
                const y1_top = cssH / 2 - Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
                const y2_top = cssH / 2 - Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;
                
                const y1_bot = cssH / 2 + Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
                const y2_bot = cssH / 2 + Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;
                
                prevCtx.beginPath();
                prevCtx.moveTo(x1, y1_top - h1 / 2);
                prevCtx.lineTo(x2, y2_top - h2 / 2);
                prevCtx.lineTo(x2, y2_bot + h2 / 2);
                prevCtx.lineTo(x1, y1_bot + h1 / 2);
                prevCtx.closePath();
                prevCtx.fill();
                
                prevCtx.strokeStyle = "#111111";
                prevCtx.lineWidth = 3;
                prevCtx.beginPath();
                prevCtx.moveTo(x1, y1_top - h1 / 2);
                prevCtx.lineTo(x2, y2_top - h2 / 2);
                prevCtx.stroke();
                
                prevCtx.beginPath();
                prevCtx.moveTo(x2, y2_bot + h2 / 2);
                prevCtx.lineTo(x1, y1_bot + h1 / 2);
                prevCtx.stroke();
            }
        } else if (telemetryMode === "waterfall") {
            const cellH = (cssH - 20) / 32;
            for (let i = 0; i < specHistory.length; i++) {
                const x = startX + i * step;
                const spec = specHistory[i];
                for (let j = 0; j < 32; j++) {
                    const val = spec ? spec[j] : 0;
                    if (val > 0.01) {
                        const hue = (j / 31) * 280;
                        prevCtx.fillStyle = `hsla(${hue}, 85%, 45%, ${val * 0.75})`;
                        prevCtx.fillRect(x, cssH - 10 - (j + 1) * cellH, step + 1, cellH + 0.5);
                    }
                }
            }
        } else if (telemetryMode === "orbit") {
            const cx = startX + width / 2;
            const cy = cssH / 2;
            
            prevCtx.strokeStyle = "rgba(17, 17, 17, 0.05)";
            prevCtx.lineWidth = 2;
            prevCtx.beginPath();
            prevCtx.arc(cx, cy, (cssH - 30) * 0.25, 0, Math.PI * 2);
            prevCtx.stroke();
            
            for (let i = 0; i < waveHistory.length - 1; i++) {
                const amp1 = waveHistory[i];
                const amp2 = waveHistory[i + 1];
                
                const angle1 = (i / historyLen) * Math.PI * 2 * 4 + timeSec * 3;
                const angle2 = ((i + 1) / historyLen) * Math.PI * 2 * 4 + timeSec * 3;
                
                const baseR = (cssH - 30) * 0.28;
                const r1 = baseR + amp1 * baseR * 0.8;
                const r2 = baseR + amp2 * baseR * 0.8;
                
                const x1 = cx + Math.cos(angle1) * r1;
                const y1 = cy + Math.sin(angle1) * r1;
                const x2 = cx + Math.cos(angle2) * r2;
                const y2 = cy + Math.sin(angle2) * r2;
                
                let strokeCol = colorHistory[i] || "rgba(0, 47, 108, 0.25)";
                const alpha = (i / (waveHistory.length - 1)) * 0.8;
                if (strokeCol.startsWith("hsl")) {
                    strokeCol = strokeCol.replace("hsl", "hsla").replace(")", `, ${alpha})`);
                } else {
                    strokeCol = `rgba(0, 47, 108, ${alpha})`;
                }
                
                prevCtx.strokeStyle = strokeCol;
                prevCtx.lineWidth = 2 + (i / waveHistory.length) * 3;
                prevCtx.beginPath();
                prevCtx.moveTo(x1, y1);
                prevCtx.lineTo(x2, y2);
                prevCtx.stroke();
            }
        }
    }
    
    // Draw Hero banner
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
        
        for (let i = 0; i < waveHistory.length - 1; i++) {
            const h1 = waveHistory[i] * (heroCssH - 15);
            const h2 = waveHistory[i + 1] * (heroCssH - 15);
            const x1 = i * step;
            const x2 = (i + 1) * step;
            
            let fillCol = colorHistory[i] || "rgba(226, 59, 36, 0.25)";
            if (fillCol.startsWith("hsl")) {
                fillCol = fillCol.replace("hsl", "hsla").replace(")", ", 0.45)");
            } else if (fillCol.startsWith("rgba(0, 47, 108")) {
                fillCol = "rgba(226, 59, 36, 0.35)"; // default red for hero
            }
            heroCtx.fillStyle = fillCol;
            
            const y1_top = heroCssH / 2 - Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
            const y2_top = heroCssH / 2 - Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;
            
            const y1_bot = heroCssH / 2 + Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
            const y2_bot = heroCtx ? (heroCssH / 2 + Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4) : 0;
            
            heroCtx.beginPath();
            heroCtx.moveTo(x1, y1_top - h1 / 2);
            heroCtx.lineTo(x2, y2_top - h2 / 2);
            heroCtx.lineTo(x2, y2_bot + h2 / 2);
            heroCtx.lineTo(x1, y1_bot + h1 / 2);
            heroCtx.closePath();
            heroCtx.fill();
            
            heroCtx.strokeStyle = "#111111";
            heroCtx.lineWidth = 3;
            heroCtx.beginPath();
            heroCtx.moveTo(x1, y1_top - h1 / 2);
            heroCtx.lineTo(x2, y2_top - h2 / 2);
            heroCtx.stroke();
            
            heroCtx.beginPath();
            heroCtx.moveTo(x2, y2_bot + h2 / 2);
            heroCtx.lineTo(x1, y1_bot + h1 / 2);
            heroCtx.stroke();
        }
    }
}

// ─── INITIALIZATION BOOT ─────────────────────────────────────────────────────
const draft = localStorage.getItem("HAXEL_EDITOR_DRAFT");
if (draft && ta) {
    ta.value = draft;
}

if (isMobileDevice) {
    const noteEl = document.getElementById("mobile-feedback-note");
    if (noteEl) {
        noteEl.style.display = "block";
    }
    
    if (navigator.vibrate) {
        const floatBtn = document.getElementById("mobile-haptic-float-btn");
        if (floatBtn) {
            floatBtn.style.display = "flex";
            floatBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                // Toggle phone haptics only
                const currentlyEnabled = phoneHaptics.isEnabled();
                phoneHaptics.setEnabled(!currentlyEnabled);
                if (!currentlyEnabled) {
                    try {
                        navigator.vibrate(50);
                    } catch (err) {}
                    addSerialLog("[PORTAL] Phone haptics ENABLED.");
                } else {
                    addSerialLog("[PORTAL] Phone haptics DISABLED.");
                }
            });
        }

        const overlay = document.getElementById("haptic-activation-overlay");
        const enableBtn = document.getElementById("enable-haptics-btn");
        const testBtn = document.getElementById("test-haptics-btn");
        const disableBtn = document.getElementById("disable-haptics-btn");
        if (overlay) {
            overlay.style.display = "flex";
            
            enableBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                phoneHaptics.setEnabled(true);
                overlay.style.display = "none";
                addSerialLog("[PORTAL] Phone haptics ENABLED by user choice.");
                showMobileHapticGuide();
            });
            
            testBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                try {
                    navigator.vibrate([100, 50, 100]);
                } catch (err) {}
                addSerialLog("[PORTAL] Mobile haptics test vibration triggered.");
            });
            
            disableBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                phoneHaptics.setEnabled(false);
                overlay.style.display = "none";
                addSerialLog("[PORTAL] Phone haptics DISABLED by user choice.");
            });
        }
    }
}

// --- Dynamic Hardware Calibration Logic ---
let activeMotors = [6];
let activeKnobs = [
    { pin: 0, param: "speed" },
    { pin: 1, param: "intensity" },
    { pin: 3, param: "gain" },
    { pin: 4, param: "pattern" }
];
let channelEnabled = [true, true, true, true, true, true, true, true];
// C3/C6/common GPIOs; device-assigned pins are merged in at render time.
const pinOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17, 18, 19, 20, 21, 22, 23];
const drvKindMap = {
    "NONE": 0,
    "L298N": 1,
    "DRV8833": 2,
    "DRV2605L": 3,
    "MOSFET": 4,
    "MINI_HBRIDGE": 5
};

function motorPinSelectOptions(currentPin) {
    const pins = new Set(pinOptions);
    const p = Number(currentPin);
    if (Number.isFinite(p) && p >= 0) pins.add(p);
    return [...pins].sort((a, b) => a - b);
}

function motorRowCount() {
    return Math.max(1, activeMotors.length);
}

/** Map firmware logical channels onto one toggle per motor pin row (e.g. L298N: 2 ch → 4 rows). */
function expandChannelEnabledForRows(enabled, rowCount, driverKind) {
    const logical = logicalChannelCount(driverKind);
    const src = Array.isArray(enabled) ? enabled : [];
    const out = [];
    for (let i = 0; i < rowCount; i++) {
        if (logical < rowCount) {
            const ch = Math.min(logical - 1, Math.floor(i * logical / rowCount));
            out.push(src[ch] !== false);
        } else {
            out.push(src[i] !== false);
        }
    }
    return out;
}

function collapseChannelEnabledForSave(rowCount, driverKind) {
    const logical = logicalChannelCount(driverKind);
    if (logical >= rowCount) return channelEnabled.slice(0, rowCount).map(v => v !== false);
    const out = [];
    for (let c = 0; c < logical; c++) {
        const row = Math.floor(c * rowCount / logical);
        out.push(channelEnabled[row] !== false);
    }
    return out;
}

function logicalChannelCount(kindOverride) {
    let kind;
    if (typeof kindOverride === "number") {
        kind = kindOverride;
    } else {
        const drvChip = document.getElementById("drvChip");
        const kindName = kindOverride ?? (drvChip ? drvChip.value : "MOSFET");
        kind = drvKindMap[kindName] ?? 4;
    }
    if (kind === 1 || kind === 2 || kind === 5) return 2;
    if (kind === 3) return 1;
    const active = activeMotors.filter(p => Number.isFinite(p) && p >= 0);
    return Math.max(1, active.length || 1);
}

async function pushChannelEnabled() {
    const drvChip = document.getElementById("drvChip");
    const kind = drvKindMap[drvChip?.value] ?? 4;
    const rowCount = motorRowCount();
    const enabled = collapseChannelEnabledForSave(rowCount, kind);
    const statePatch = { channels: enabled.map(on => ({ on: !!on })) };
    const configPatch = { channelEnabled: enabled };
    sendStateUpdate(statePatch);
    addSerialLog(`[HAL] Motor outputs: ${enabled.map((on, i) => `Ch${i}=${on ? "ON" : "OFF"}`).join(", ")}`);
    try {
        await sendConfigUpdate(configPatch);
    } catch (err) {
        addSerialLog(`[BLE] channelEnabled save failed: ${err.message}`);
    }
}

function renderMotors() {
    const container = document.getElementById("motorsContainer");
    if (!container) return;
    const rowCount = motorRowCount();
    while (channelEnabled.length < rowCount) channelEnabled.push(true);
    container.innerHTML = "";
    activeMotors.forEach((pin, idx) => {
        const pinNum = Number(pin);
        const opts = motorPinSelectOptions(pinNum);
        const row = document.createElement("div");
        row.className = "motor-row";
        row.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;";
        row.innerHTML = `
            <span style="font-size: 11px; min-width: 36px;">Ch ${idx}:</span>
            <label style="display:flex; align-items:center; gap:4px; font-size:11px; margin:0; min-width:52px;">
                <input type="checkbox" class="motor-output-enable" data-index="${idx}" ${channelEnabled[idx] !== false ? "checked" : ""} style="width:auto; margin:0;">
                <span class="hint">${channelEnabled[idx] !== false ? "On" : "Off"}</span>
            </label>
            <select class="motor-pin" data-index="${idx}" style="flex:1; min-width:100px;">
                ${opts.map(p => `<option value="${p}" ${p === pinNum ? "selected" : ""}>GPIO ${p}</option>`).join("")}
            </select>
            <button class="btn btn-remove-row remove-motor" data-index="${idx}" style="cursor:pointer;">&times;</button>
        `;
        container.appendChild(row);
    });
}

function renderKnobs() {
    const container = document.getElementById("knobsContainer");
    if (!container) return;
    container.innerHTML = "";
    activeKnobs.forEach((knob, idx) => {
        const row = document.createElement("div");
        row.className = "knob-row";
        row.innerHTML = `
            <span style="font-size: 11px;">Knob ${idx}:</span>
            <select class="knob-pin" data-index="${idx}">
                ${pinOptions.map(p => `<option value="${p}" ${p === knob.pin ? 'selected' : ''}>GPIO ${p}</option>`).join('')}
            </select>
            <select class="knob-param" data-index="${idx}">
                <option value="speed" ${knob.param === 'speed' ? 'selected' : ''}>Speed</option>
                <option value="intensity" ${knob.param === 'intensity' ? 'selected' : ''}>Intensity</option>
                <option value="gain" ${knob.param === 'gain' ? 'selected' : ''}>Gain</option>
                <option value="pattern" ${knob.param === 'pattern' ? 'selected' : ''}>Pattern</option>
                <option value="none" ${knob.param === 'none' ? 'selected' : ''}>None</option>
            </select>
            <button class="btn btn-remove-row remove-knob" data-index="${idx}" style="cursor:pointer;">&times;</button>
        `;
        container.appendChild(row);
    });
}

// Event Listeners for Dynamic Setup
document.getElementById("addMotorBtn")?.addEventListener("click", () => {
    if (activeMotors.length >= 8) {
        alert("Maximum of 8 motor channels supported.");
        return;
    }
    const used = new Set(activeMotors);
    const nextPin = pinOptions.find(p => !used.has(p)) || 0;
    activeMotors.push(nextPin);
    channelEnabled.push(true);
    renderMotors();
});

document.getElementById("addKnobBtn")?.addEventListener("click", () => {
    if (activeKnobs.length >= 8) {
        alert("Maximum of 8 analog knob controllers supported.");
        return;
    }
    const used = new Set(activeKnobs.map(k => k.pin));
    const nextPin = pinOptions.find(p => !used.has(p)) || 0;
    activeKnobs.push({ pin: nextPin, param: "none" });
    renderKnobs();
});

document.getElementById("motorsContainer")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-motor")) {
        const idx = parseInt(e.target.getAttribute("data-index"));
        activeMotors.splice(idx, 1);
        channelEnabled.splice(idx, 1);
        renderMotors();
    }
});

document.getElementById("knobsContainer")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-knob")) {
        const idx = parseInt(e.target.getAttribute("data-index"));
        activeKnobs.splice(idx, 1);
        renderKnobs();
    }
});

document.getElementById("motorsContainer")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("motor-pin")) {
        const idx = parseInt(e.target.getAttribute("data-index"), 10);
        activeMotors[idx] = parseInt(e.target.value, 10);
        renderMotors();
    } else if (e.target.classList.contains("motor-output-enable")) {
        const idx = parseInt(e.target.getAttribute("data-index"), 10);
        channelEnabled[idx] = e.target.checked;
        const hint = e.target.parentElement?.querySelector(".hint");
        if (hint) hint.textContent = e.target.checked ? "On" : "Off";
        pushChannelEnabled();
    }
});

document.getElementById("knobsContainer")?.addEventListener("change", (e) => {
    const idx = parseInt(e.target.getAttribute("data-index"));
    if (e.target.classList.contains("knob-pin")) {
        activeKnobs[idx].pin = parseInt(e.target.value);
    } else if (e.target.classList.contains("knob-param")) {
        activeKnobs[idx].param = e.target.value;
    }
});

// Audio source switch handler
document.getElementById("audioSource")?.addEventListener("change", (e) => {
    const src = parseInt(e.target.value);
    const i2sContainer = document.getElementById("i2sPinsContainer");
    const adcContainer = document.getElementById("adcPinsContainer");
    if (src === 2) { // I2S
        if (i2sContainer) i2sContainer.style.display = "block";
        if (adcContainer) adcContainer.style.display = "none";
    } else if (src === 1) { // ADC
        if (i2sContainer) i2sContainer.style.display = "none";
        if (adcContainer) adcContainer.style.display = "block";
    } else { // None/Simulated
        if (i2sContainer) i2sContainer.style.display = "none";
        if (adcContainer) adcContainer.style.display = "none";
    }
});

// Initialize dynamic lists
renderMotors();
renderKnobs();

// Hardware Calibration Form Submission
document.getElementById("saveHardwareBtn")?.addEventListener("click", () => {
    // Must match haxel::hal::DriverKind enum values.
    const drvKindMap = {
        "NONE": 0,
        "L298N": 1,
        "DRV8833": 2,
        "DRV2605L": 3,
        "MOSFET": 4,
        "MINI_HBRIDGE": 5
    };
    const drvChip = document.getElementById("drvChip").value;
    const kind = drvKindMap[drvChip] !== undefined ? drvKindMap[drvChip] : 4;
    const pwmHz = parseInt(document.getElementById("pwmHz")?.value) || 20000;
    
    const sda = parseInt(document.getElementById("pinSDA").value);
    const scl = parseInt(document.getElementById("pinSCL").value);

    const audioEnabled = document.getElementById("audioEnabled").checked;
    const audioSource = parseInt(document.getElementById("audioSource").value);
    const audioBclk = parseInt(document.getElementById("audioBclk").value);
    const audioWs = parseInt(document.getElementById("audioWs").value);
    const audioSd = parseInt(document.getElementById("audioSd").value);
    const audioAdc = parseInt(document.getElementById("audioAdc").value);

    const ledEnabled = document.getElementById("ledEnabled").checked;
    const ledPin = parseInt(document.getElementById("ledPin").value);
    const ledCountEl = document.getElementById("ledCount");
    let ledCount = parseInt(ledCountEl?.value, 10);
    if (!Number.isFinite(ledCount) || ledCount < 1) ledCount = 20;
    if (ledCount > 300) ledCount = 300;
    if (ledCountEl) ledCountEl.value = String(ledCount);

    const oledEnabled = document.getElementById("oledEnabled").checked;
    const oledSda = sda;
    const oledScl = scl;

    // Dynamic conflict validator
    const pinAllocations = [];
    
    // Add I2C pins if using I2C driver (DRV2605L = 3)
    if (kind === 3) {
        pinAllocations.push({ name: "I2C SDA", pin: sda });
        pinAllocations.push({ name: "I2C SCL", pin: scl });
    }
    
    // Add motor pins
    activeMotors.forEach((pin, idx) => {
        pinAllocations.push({ name: `Motor Ch ${idx}`, pin });
    });

    // Add audio pins
    if (audioEnabled) {
        if (audioSource === 2) {
            pinAllocations.push({ name: "I2S BCLK", pin: audioBclk });
            pinAllocations.push({ name: "I2S WS", pin: audioWs });
            pinAllocations.push({ name: "I2S SD", pin: audioSd });
        } else if (audioSource === 1) {
            pinAllocations.push({ name: "ADC Analog Mic", pin: audioAdc });
        }
    }

    // Add LED pin
    if (ledEnabled) {
        pinAllocations.push({ name: "Status LED", pin: ledPin });
    }

    // Add knob pins
    activeKnobs.forEach((k, idx) => {
        pinAllocations.push({ name: `Knob ${idx}`, pin: k.pin });
    });

    // Check for duplicate assignments
    const pinCounts = {};
    let hasConflict = false;
    let conflictMsg = "";

    pinAllocations.forEach(alloc => {
        if (alloc.pin === -1) return;
        if (!pinCounts[alloc.pin]) {
            pinCounts[alloc.pin] = [];
        }
        pinCounts[alloc.pin].push(alloc.name);
    });

    for (const [pin, names] of Object.entries(pinCounts)) {
        if (names.length > 1) {
            hasConflict = true;
            conflictMsg += `\n- GPIO ${pin} is assigned to: ${names.join(", ")}`;
        }
    }

    if (hasConflict) {
        alert("Pin Conflict Detected! You cannot assign the same GPIO pin to multiple hardware peripherals." + conflictMsg);
        addSerialLog("[ERROR] Hardware Configuration aborted: Duplicate pin assignments detected." + conflictMsg.replace(/\n/g, " "));
        return;
    }

    // Build pins array (firmware expects 8 slots, padded with -1)
    const pinsPadded = Array(8).fill(-1);
    activeMotors.forEach((pin, idx) => {
        if (idx < 8) pinsPadded[idx] = pin;
    });

    const requestedSsid = document.getElementById("deviceSsid")?.value.trim() || "Haxel";
    const configPatch = {
        apSsid: requestedSsid,
        channelEnabled: collapseChannelEnabledForSave(motorRowCount(), kind),
        driver: {
            kind: kind,
            pins: pinsPadded,
            sda: Number.isFinite(sda) ? sda : -1,
            scl: Number.isFinite(scl) ? scl : -1,
            pwmHz: pwmHz
        },
        audio: {
            enabled: audioEnabled,
            source: audioSource,
            bclk: audioBclk,
            ws: audioWs,
            sd: audioSd,
            adc: audioAdc
        },
        led: {
            enabled: ledEnabled,
            pin: ledPin,
            count: ledCount
        },
        knobs: activeKnobs.map(k => ({ enabled: true, pin: k.pin, param: k.param })),
        oled: {
            enabled: oledEnabled,
            sda: Number.isFinite(oledSda) ? oledSda : -1,
            scl: Number.isFinite(oledScl) ? oledScl : -1
        }
    };
    
    if (rxCharacteristic) {
        sendConfigUpdate(configPatch)
            .then(() => addSerialLog("[SAFETY] Configuration saved; device is rebooting with the new settings."))
            .catch(err => addSerialLog(`[BLE] [ERROR] Configuration save failed: ${err.message}`));
    } else {
        addSerialLog(`[SIMULATOR] Saved config (offline): ${JSON.stringify(configPatch)}`);
    }
});

resetBleHydration("connect BLE");
loadCustomPatterns(frequencyShift, playbackSpeed, masterIntensity, startupFloor);
renderCards();
syncHL();
compileCustom();
initBootLogs();
animate();
addSerialLog("[BLE Portal] Initialized. Click CONNECT BLE to link your hardware.");

// Setup Iframe Reference Manual Modal Listeners
(function() {
    const openBtn = document.getElementById("openManualBtn");
    const closeBtn = document.getElementById("closeManualBtn");
    const modal = document.getElementById("manualModal");
    if (openBtn && modal) {
        openBtn.addEventListener("click", () => {
            modal.style.display = "flex";
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener("click", () => {
            modal.style.display = "none";
        });
    }
})();
