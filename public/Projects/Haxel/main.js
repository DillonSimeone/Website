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
    
    if (isMobileDevice && navigator.vibrate) {
        phoneHaptics.setEnabled(true);
        showMobileHapticGuide();
    }
});

stopBtn.addEventListener("click", () => {
    isPlaying = false;
    document.getElementById("dot").className = "portal-dot";
    document.getElementById("connText").textContent = "idle";
    addSerialLog("[HTTP] API Command: STOP pattern playback");
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
    const getFreqAtBand = (b) => {
        if (b === 0) return 0;
        if (b === 32) return 20000;
        return Math.round(40 * Math.pow(20000 / 40, b / 32));
    };
    for (let i = 0; i < numBins; i++) {
        const startVal = i === 0 ? 0 : dividers[i - 1];
        const endVal = i === numBins - 1 ? 32 : dividers[i];
        
        const fStart = getFreqAtBand(startVal);
        const fEnd = getFreqAtBand(endVal);
        
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
        
        const minFreq = parseFloat(document.getElementById("audioMinFreq")?.value || 40);
        const maxFreq = parseFloat(document.getElementById("audioMaxFreq")?.value || 16000);
        const getBandAtFreq = (f) => Math.max(0, Math.min(32, Math.round(32 * Math.log(f / 40) / Math.log(20000 / 40))));
        const minBandIdx = getBandAtFreq(minFreq);
        const maxBandIdx = getBandAtFreq(maxFreq);

        let labelName = `Bin ${i}`;
        if (i === 0 && minBandIdx > 0) {
            labelName += ` (Anti-Loop / Low Cut)`;
        } else if (i === numBins - 1 && maxBandIdx < 32) {
            labelName += ` (High Cut / End Bin)`;
        } else {
            const activeIdx = (minBandIdx > 0) ? (i - 1) : i;
            const activeCount = numBins - (minBandIdx > 0 ? 1 : 0) - (maxBandIdx < 32 ? 1 : 0);
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
            if (i === 0 && minBandIdx > 0) {
                select.value = "none";
            } else if (i === numBins - 1 && maxBandIdx < 32) {
                select.value = "none";
            } else {
                const offset = (minBandIdx > 0) ? 1 : 0;
                select.value = defaults[(i - offset) % defaults.length];
            }
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
        const rawMags = Array.from(dataArray).map(v => v / 255);
        const mags = new Array(32).fill(0);
        
        const kWindow = analyser.fftSize;
        const sampleRate = audioCtx.sampleRate;
        const minFreq = 40;
        const maxFreq = 20000;
        let maxMag = 1e-9;
        
        for (let b = 0; b < 32; ++b) {
            const lo = minFreq * Math.pow(maxFreq / minFreq, b / 32);
            const hi = minFreq * Math.pow(maxFreq / minFreq, (b + 1) / 32);
            let loBin = Math.floor(lo * kWindow / sampleRate);
            let hiBin = Math.floor(hi * kWindow / sampleRate);
            if (hiBin <= loBin) hiBin = loBin + 1;
            
            let sum = 0;
            let count = 0;
            for (let k = loBin; k < hiBin && k < rawMags.length; ++k) {
                sum += rawMags[k];
                count++;
            }
            mags[b] = count > 0 ? (sum / count) : 0;
            if (mags[b] > maxMag) maxMag = mags[b];
        }
        for (let b = 0; b < 32; ++b) {
            mags[b] = Math.min(1.0, mags[b] / (maxMag * 1.2));
        }
        
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
        const baseRadius = 35; // 17.5px CSS radius (matches 35px diameter circle)
        
        // Draw spikes radiating outward
        const numSpikes = 28;
        const maxSpikeLength = 18;
        const amp = smoothedAmp; // ranges smoothly from 0.0 to 1.0
        
        ctx.strokeStyle = isPlaying ? "#e23b24" : "#f2b134"; // Bauhaus Red or Yellow
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        
        for (let i = 0; i < numSpikes; i++) {
            // Give them a slow rotation for a very premium feel
            const angle = (i / numSpikes) * Math.PI * 2 + timeSec * 0.4;
            // Generate micro-movement for secondary smoothness
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
        
        // Draw inner circular button background
        ctx.fillStyle = isPlaying ? "#e23b24" : "#f2b134";
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Circular button border
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw Play / Pause icon in the center
        ctx.fillStyle = "#111111";
        if (isPlaying) {
            // Pause icon: two vertical bars
            const barW = 5;
            const barH = 15;
            const gap = 5;
            ctx.fillRect(centerX - barW - gap / 2, centerY - barH / 2, barW, barH);
            ctx.fillRect(centerX + gap / 2, centerY - barH / 2, barW, barH);
        } else {
            // Play icon: triangle pointing right
            ctx.beginPath();
            const triSize = 9;
            ctx.moveTo(centerX - triSize * 0.7 + 1.5, centerY - triSize);
            ctx.lineTo(centerX + triSize * 1.3 + 1.5, centerY);
            ctx.lineTo(centerX - triSize * 0.7 + 1.5, centerY + triSize);
            ctx.closePath();
            ctx.fill();
        }
    }
    
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
            
            if (waveHistory.length > 0) {
                const latestAmp = waveHistory[waveHistory.length - 1];
                const latestAngle = Math.PI * 2 * 4 + timeSec * 3;
                const baseR = (cssH - 30) * 0.28;
                const latestR = baseR + latestAmp * baseR * 0.8;
                const lx = cx + Math.cos(latestAngle) * latestR;
                const ly = cy + Math.sin(latestAngle) * latestR;
                
                prevCtx.fillStyle = colorHistory[colorHistory.length - 1] || "#111111";
                prevCtx.strokeStyle = "#111111";
                prevCtx.lineWidth = 2;
                prevCtx.beginPath();
                prevCtx.arc(lx, ly, 6 + latestAmp * 5, 0, Math.PI * 2);
                prevCtx.fill();
                prevCtx.stroke();
                
                prevCtx.strokeStyle = "rgba(17, 17, 17, 0.25)";
                prevCtx.lineWidth = 1.5;
                prevCtx.beginPath();
                prevCtx.moveTo(cx, cy);
                prevCtx.lineTo(lx, ly);
                prevCtx.stroke();
            }
        }
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
                if (!phoneHaptics.isEnabled()) {
                    phoneHaptics.setEnabled(true);
                    try {
                        navigator.vibrate(50);
                    } catch (err) {}
                    addSerialLog("[PORTAL] Mobile haptics engaged via float button click.");
                }
                isPlaying = !isPlaying;
                const dot = document.getElementById("dot");
                const connText = document.getElementById("connText");
                if (isPlaying) {
                    if (dot) dot.className = "portal-dot ok";
                    if (connText) connText.textContent = "playing";
                    addSerialLog("[PORTAL] Mobile action: START pattern playback");
                } else {
                    if (dot) dot.className = "portal-dot";
                    if (connText) connText.textContent = "idle";
                    addSerialLog("[PORTAL] Mobile action: STOP pattern playback");
                }
                syncStateToESP32();
            });
        }

        const overlay = document.getElementById("haptic-activation-overlay");
        const enableBtn = document.getElementById("enable-haptics-btn");
        const testBtn = document.getElementById("test-haptics-btn");
        const disableBtn = document.getElementById("disable-haptics-btn");
        if (overlay) {
            overlay.style.display = "flex";
            if (enableBtn) {
                enableBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    overlay.style.display = "none";
                    phoneHaptics.setEnabled(true);
                    try {
                        navigator.vibrate(50);
                    } catch (err) {}
                    addSerialLog("[PORTAL] Mobile haptics enabled by user choice.");
                });
            }
            if (testBtn) {
                testBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    try {
                        // Sample vibration: short burst sequence
                        navigator.vibrate([80, 40, 80, 40, 150]);
                    } catch (err) {}
                    addSerialLog("[PORTAL] Mobile haptics test vibration triggered.");
                });
            }
            if (disableBtn) {
                disableBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    overlay.style.display = "none";
                    phoneHaptics.setEnabled(false);
                    addSerialLog("[PORTAL] Mobile haptics disabled by user choice.");
                });
            }
        }
    }
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

// Hardware Calibration Form Submission
document.getElementById("saveHardwareBtn")?.addEventListener("click", () => {
    const drvKindMap = {
        "MOSFET": 0,
        "DRV8833": 1,
        "DRV2605L": 2
    };
    const drvChip = document.getElementById("drvChip").value;
    const kind = drvKindMap[drvChip] !== undefined ? drvKindMap[drvChip] : 0;
    
    const sda = parseInt(document.getElementById("pinSDA").value) || 1;
    const scl = parseInt(document.getElementById("pinSCL").value) || 2;
    const pwm = parseInt(document.getElementById("pinPWM").value) || 6;
    const pwmHz = parseInt(document.getElementById("pwmFreq").value) || 20000;

    if (sda === scl || sda === pwm || scl === pwm) {
        alert("Pin Conflict: SDA, SCL, and PWM pins must all be unique!");
        addSerialLog("[ERROR] Hardware Configuration aborted: Duplicate pin assignment.");
        return;
    }
    
    const configPatch = {
        driver: {
            kind: kind,
            pins: [pwm, -1, -1, -1, -1, -1, -1, -1],
            sda: sda,
            scl: scl,
            pwmHz: pwmHz
        }
    };
    
    if (isRealESP32) {
        fetch('/json/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patch: configPatch })
        })
        .then(() => {
            addSerialLog("[PORTAL] Sent configuration patch successfully. Rebooting ESP32...");
        })
        .catch(err => {
            console.error("Config save error:", err);
        });
    } else {
        addSerialLog(`[SIMULATOR] Saved config (offline): ${JSON.stringify(configPatch)}`);
    }
});

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

