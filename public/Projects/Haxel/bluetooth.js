import { Parser, tokenize, Evaluator, highlight, updateAudioState, pnoise1 } from './compiler.js';
import { addSerialLog, triggerI2CBlink, updateHardwarePins, initBootLogs, serialConsole } from './emulator.js';
import {
    computeDividersForRange,
    updateBinRangeLabels as updateBinRangeLabelsShared,
    renderBinRows as renderBinRowsShared,
    initSpectrumDividers as initSpectrumDividersShared,
    drawSpectrum as drawSpectrumShared,
    downsampleMicSpectrum,
    computeSimulatedSpectrum,
    evaluateAudioReactiveOutput
} from './audio-reactive.js';
import { setupSharpCanvas, renderTelemetryVisualizer } from './visualizer.js';
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
    if (t.dataset.tab === "studio" && customEvaluator && ta && bleReady && rxCharacteristic) {
        pushStudioDraftDebounced(ta.value);
    }
    // Setup visible canvases
    setupSharpCanvas(prevCanvas);
    setupSharpCanvas(heroCanvas);
    syncStateToESP32();
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
    saw: `/* Sawtooth Sweep preset */\nfrac(t * 1.8) * intensity`,
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

const STUDIO_DRAFT_ID = "studio_draft";
let studioDraftTimer = null;
let customEvaluator = null;

function pushStudioDraftToDevice(code, playAfter = true) {
    if (!bleReady || !rxCharacteristic) {
        return Promise.resolve(false);
    }
    const name = (customPatternNameInput && customPatternNameInput.value.trim()) || "Studio Draft";
    addSerialLog(`[CTRL→ESP] Pushing studio draft (${code.length} chars)`);

    return bleEnqueue(() => bleSendCustomPattern({ id: STUDIO_DRAFT_ID, name, code }))
        .then(() => {
            let draft = PATTERNS.find(p => p.id === STUDIO_DRAFT_ID);
            if (!draft) {
                draft = {
                    id: STUDIO_DRAFT_ID,
                    name: name + " (Live)",
                    category: "custom",
                    desc: "Live Pattern Studio draft on device.",
                    isCustom: true,
                    code,
                    func: (t) => customEvaluator
                        ? customEvaluator.run(t, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor)
                        : 0
                };
                PATTERNS.push(draft);
            } else {
                draft.name = name + " (Live)";
                draft.code = code;
                draft.func = (t) => customEvaluator
                    ? customEvaluator.run(t, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor)
                    : 0;
            }
            activePattern = draft;
            const label = document.getElementById("patternName");
            if (label) label.textContent = `${name} (Studio)`;
            if (playAfter) {
                isPlaying = true;
            }
            sendStateUpdate({
                on: isPlaying,
                intensity: +(masterIntensity / 255).toFixed(3),
                speed: +playbackSpeed.toFixed(2),
                freq: Math.round(frequencyShift),
                startupFloor: +startupFloor.toFixed(2),
                audioReactive: false,
                pattern: STUDIO_DRAFT_ID,
                name
            });
            return true;
        })
        .catch(err => {
            addSerialLog(`[CTRL→ESP] Studio draft BLE failed: ${err.message}`);
            return false;
        });
}

function pushStudioDraftDebounced(code) {
    clearTimeout(studioDraftTimer);
    studioDraftTimer = setTimeout(() => {
        if (customEvaluator) pushStudioDraftToDevice(code, true);
    }, 350);
}

function compileCustom() {
    if (!ta) return;
    const src = ta.value;
    try {
        const ast = new Parser(tokenize(src)).parseProgram();
        const evalr = new Evaluator(ast);
        evalr.run(0, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor);
        customEvaluator = evalr;
        compilerStatus.textContent = "compiled ✓";
        compilerStatus.className = "compilation-status ok";
        addSerialLog("[IDE] Compiled custom pattern successfully!");
        if (bleReady && rxCharacteristic) {
            pushStudioDraftDebounced(src);
        } else {
            addSerialLog("[IDE] Compiled locally — connect BLE to live-push to device");
        }
    } catch (e) {
        customEvaluator = null;
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
    const studioTab = document.getElementById("tab-studio");
    if (studioTab && studioTab.style.display !== "none" && customEvaluator && ta) {
        pushStudioDraftToDevice(ta.value, true);
    } else {
        syncStateToESP32();
    }
    
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
    audioGainInput.addEventListener("change", (e) => {
        const gainVal = parseFloat(e.target.value);
        if (Number.isFinite(gainVal)) {
            sendStateUpdate({ audioGain: +gainVal.toFixed(2) });
            triggerI2CBlink();
        }
    });
}

function recalculateDividers() {
    const minFreq = parseFloat(audioMinFreqInput ? audioMinFreqInput.value : 40);
    const maxFreq = parseFloat(audioMaxFreqInput ? audioMaxFreqInput.value : 16000);
    dividers = computeDividersForRange(minFreq, maxFreq, numBins);
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
    const kind = drvKindMap[e.target.value] ?? 4;
    if (isPositionalDriver(kind)) {
        ensurePositionalMotors(kind);
    } else if (kind === 3) {
        if (activeMotors.length > 1) activeMotors = [activeMotors[0] ?? -1];
    } else {
        activeMotors = activeMotors.filter(p => Number.isFinite(p) && p >= 0);
        if (activeMotors.length === 0) activeMotors = [6];
    }
    addSerialLog(`[HAL] Driver reconfigured to: ${e.target.value}`);
    renderMotors();
    triggerI2CBlink();
});

actSelect.addEventListener("change", (e) => {
    const act = e.target.value;
    currentActuatorText.textContent = act;
    if (act === "LRA" || act === "ERM") {
        drvSelect.value = "DRV2605L";
        if (activeMotors.length > 1) activeMotors = [activeMotors[0] ?? -1];
    } else if (act === "Solenoid") {
        drvSelect.value = "DRV8833";
        ensurePositionalMotors(2);
    }
    currentDriverText.textContent = drvSelect.value;
    renderMotors();
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
            document.getElementById("connText").textContent =
                (bleDevice && bleDevice.gatt && bleDevice.gatt.connected)
                    ? "connected" : "playing";
            addSerialLog(`[HAL] Loaded library pattern: "${pat.name}"`);
            
            if (pat.isCustom && pat.code) {
                ta.value = pat.code;
                syncHL();
                try {
                    const ast = new Parser(tokenize(pat.code)).parseProgram();
                    const evalr = new Evaluator(ast);
                    evalr.run(0, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor);
                    customEvaluator = evalr;
                    compilerStatus.textContent = "compiled ✓";
                    compilerStatus.className = "compilation-status ok";
                } catch (e) {
                    customEvaluator = null;
                }
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
                func: (t) => evalr.run(t, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor)
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
        analyser.fftSize = 1024; // 512 bands (~47 Hz resolution)
        analyser.smoothingTimeConstant = 0.65;
        analyser.minDecibels = -85;
        analyser.maxDecibels = -15;
        
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
const routingMatrix = document.getElementById("bins-container") || document.getElementById("routingMatrix");

function updateBinRangeLabels() {
    updateBinRangeLabelsShared(numBins, dividers);
}

function renderBinRows() {
    renderBinRowsShared({
        container: routingMatrix,
        numBins,
        dividers,
        patterns: PATTERNS,
        minFreq: parseFloat(audioMinFreqInput ? audioMinFreqInput.value : 40),
        maxFreq: parseFloat(audioMaxFreqInput ? audioMaxFreqInput.value : 16000),
        onSync: () => syncStateToESP32()
    });
}

function populateBinPatternSelects() {
    for (let i = 0; i < numBins; ++i) {
        const sel = document.getElementById(`bin-${i}-pattern`);
        if (!sel) continue;

        const oldVal = sel.value;
        sel.innerHTML = `<option value="none">NONE (No Reactivity)</option>`;
        PATTERNS.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });

        if (Array.from(sel.options).some(o => o.value === oldVal)) {
            sel.value = oldVal;
        } else if (i === 0) {
            sel.value = "none";
        } else if (i === 1) {
            sel.value = Array.from(sel.options).some(o => o.value === "Pulse") ? "Pulse" : (PATTERNS[0]?.id || "none");
        } else if (i === 2) {
            sel.value = Array.from(sel.options).some(o => o.value === "Rumble") ? "Rumble" : (PATTERNS[1]?.id || PATTERNS[0]?.id || "none");
        } else {
            sel.value = "none";
        }
    }
}

function initSpectrumDividers() {
    initSpectrumDividersShared({
        canvas: specCanvas,
        getDividers: () => dividers,
        onUpdate: () => updateBinRangeLabels(),
        onCommit: () => syncStateToESP32()
    });
}

renderBinRows();
initSpectrumDividers();

const addBinBtn = document.getElementById("addBinBtn");
const subBinBtn = document.getElementById("subBinBtn");

if (addBinBtn) {
    addBinBtn.addEventListener("click", () => {
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
        dividers.sort((a, b) => a - b);

        addSerialLog(`[AUDIO] Added bin partition. Total bins: ${numBins}`);
        renderBinRows();
        triggerI2CBlink();
        syncStateToESP32();
    });
}

if (subBinBtn) {
    subBinBtn.addEventListener("click", () => {
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
let bleSyncRetryTimer = null;
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
    clearInterval(bleSyncRetryTimer);
    bleSyncRetryTimer = null;
    setBlePortalLocked(true, message);
}

function finishBleHydrationIfReady() {
    if (!bleStateReceived || !bleConfigReceived) return;
    bleReady = true;
    clearTimeout(bleSyncTimer);
    clearInterval(bleSyncRetryTimer);
    bleSyncRetryTimer = null;
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
    // Prefer Write-Without-Response: ESP32 Bluedroid + Windows WinRT silently drops acknowledged writes on RX.
    if (rxCharacteristic.properties && rxCharacteristic.properties.writeWithoutResponse && typeof rxCharacteristic.writeValueWithoutResponse === "function") {
        await rxCharacteristic.writeValueWithoutResponse(data);
    } else if (rxCharacteristic.properties && rxCharacteristic.properties.write) {
        if (typeof rxCharacteristic.writeValueWithResponse === "function") {
            await rxCharacteristic.writeValueWithResponse(data);
        } else {
            await rxCharacteristic.writeValue(data);
        }
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
        bleSyncRetryTimer = setInterval(() => {
            if (bleReady || !rxCharacteristic) {
                clearInterval(bleSyncRetryTimer);
                bleSyncRetryTimer = null;
                return;
            }
            addSerialLog("[BLE] Retrying sync-request...");
            bleWriteJson({ type: "sync-request" }).catch(() => {});
        }, 2500);
        bleSyncTimer = setTimeout(() => {
            clearInterval(bleSyncRetryTimer);
            bleSyncRetryTimer = null;
            if (!bleReady) {
                addSerialLog("[SAFETY] Sync timed out; controls remain locked. Disconnect and retry.");
                connText.textContent = "sync failed";
                if (bleStatus) bleStatus.textContent = "Settings sync failed";
                dot.className = "portal-dot error";
            }
        }, 10000);
        
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
    if (typeof lastUploadedPatternKey !== "undefined") lastUploadedPatternKey = "";
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
        driverFlags = Number(cfg.driver.flags) || 0;
        if (cfg.driver.kind === 3 && actSelect) {
            actSelect.value = (driverFlags & 0x4) ? "LRA" : "ERM";
            if (currentActuatorText) currentActuatorText.textContent = actSelect.value;
        }
        setDeviceControlValue("pwmHz", cfg.driver.pwmHz);
        setDeviceControlValue("pinSDA", cfg.driver.sda);
        setDeviceControlValue("pinSCL", cfg.driver.scl);
        if (Array.isArray(cfg.driver.pins)) {
            if (isPositionalDriver(cfg.driver.kind)) {
                const slotCount = POSITIONAL_SLOT_LABELS[cfg.driver.kind].length;
                activeMotors = Array.from({ length: slotCount }, (_, i) => {
                    const p = Number(cfg.driver.pins[i]);
                    return Number.isFinite(p) ? p : -1;
                });
            } else if (cfg.driver.kind === 3) {
                const p0 = Number(cfg.driver.pins[0]);
                activeMotors = [Number.isFinite(p0) ? p0 : -1];
            } else {
                activeMotors = cfg.driver.pins
                    .map(p => Number(p))
                    .filter(pin => Number.isFinite(pin) && pin >= 0);
            }
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
        if (cfg.audio.gain != null && audioGainInput) {
            audioGainInput.value = String(cfg.audio.gain);
            if (gainValLabel) gainValLabel.textContent = parseFloat(cfg.audio.gain).toFixed(1) + "x";
        }
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
        if (!cfg.driver || cfg.driver.sda == null || cfg.driver.sda < 0) {
            setDeviceControlValue("pinSDA", cfg.oled.sda);
        }
        if (!cfg.driver || cfg.driver.scl == null || cfg.driver.scl < 0) {
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
        if (m.type !== "state" || !bleStateReceived) {
            addSerialLog(`[BLE] <- ${m.type}${m.section ? ":" + m.section : ""} (${str.length}B)`);
        }
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
            } else if (m.section === "knobs") {
                pendingDeviceConfig.knobs = Array.isArray(m.data) ? m.data : [];
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

        if (m.type === 'bins' && m.data) {
            const b = m.data;
            if (b.numBins !== undefined) {
                numBins = b.numBins;
                if (b.dividers) dividers = b.dividers.slice();
                renderBinRows();
                if (Array.isArray(b.binPatterns)) {
                    b.binPatterns.forEach((pattern, index) => {
                        const select = document.getElementById(`bin-${index}-pattern`);
                        if (select) select.value = pattern;
                    });
                }
            }
            return;
        }

        if (m.type === 'state' && m.data) {
            const wasInitial = !bleStateReceived;
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
            if (s.freq !== undefined) {
                frequencyShift = s.freq;
                const el = document.getElementById("freqShift");
                if (el && !el.matches(':active')) {
                    el.value = Math.round(frequencyShift);
                    const vLabel = document.getElementById("freqVal");
                    if (vLabel) vLabel.textContent = Math.round(frequencyShift) + " Hz";
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
            if (s.numBins !== undefined && (s.dividers || s.binPatterns)) {
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
            if (wasInitial && s.audioReactive === true) {
                document.querySelector('.tab[data-tab="audio"]')?.click();
            }
            if (s.audioReactive === true) {
                const vLabel = document.getElementById("patternName");
                if (vLabel) vLabel.textContent = "Audio Reactive";
            } else if (s.pattern) {
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
                    if (typeof ch === "boolean") channelEnabled[i] = ch;
                    else if (ch && typeof ch.on === "boolean") channelEnabled[i] = ch.on;
                });
                renderMotors();
            }
            bleStateReceived = true;
            if (!bleReady) finishBleHydrationIfReady();
        }
    } catch (e) {
        console.error("BLE Notification Parse Error:", e);
    }
}

function drawSpectrum(mags) {
    drawSpectrumShared(specCanvas, specCtx, mags, dividers, numBins);
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
        await bleEnqueue(() => bleWriteJson({ type: "state", patch: patch }));
    } catch (err) {
        console.error("BLE State Write Error:", err);
    }
}, 100);

const sendAudioBinsUpdate = throttle(async (binsPatch) => {
    if (!rxCharacteristic || !bleReady) return;
    try {
        await bleEnqueue(() => bleWriteJson({ type: "state", patch: binsPatch }));
    } catch (err) {
        console.error("BLE Bins Write Error:", err);
    }
}, 120);

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
        if (Array.isArray(configPatch.knobs)) {
            if (configPatch.knobs.length === 0) {
                sections.push({ section: "knobs", data: [] });
            } else {
                configPatch.knobs.forEach(k => sections.push({ section: "knob", data: k }));
            }
        }
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
    const isAudioTabOpen = document.getElementById("tab-audio")?.style.display !== "none";
    sendStateUpdate({
        on: isPlaying,
        intensity: +(masterIntensity / 255).toFixed(3),
        speed: +playbackSpeed.toFixed(2),
        freq: Math.round(frequencyShift),
        startupFloor: +startupFloor.toFixed(2),
        audioReactive: isAudioTabOpen,
        pattern: activePattern ? activePattern.id : ""
    });
    if (isAudioTabOpen) {
        sendAudioBinsUpdate({
            numBins: numBins,
            dividers: dividers,
            binPatterns: Array.from({length: numBins}).map((_, i) => {
                const el = document.getElementById(`bin-${i}-pattern`);
                return el ? el.value : "none";
            })
        });
    }
}

// ─── ANIMATION / EMULATOR RENDER LOOP ─────────────────────────────────────────
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
    
    const isAudioTab = document.getElementById("tab-audio")?.style.display !== "none";
    const isStudioTab = document.getElementById("tab-studio")?.style.display !== "none";
    const mags = (useLiveMic && analyser && dataArray)
        ? downsampleMicSpectrum(analyser, dataArray)
        : computeSimulatedSpectrum(timeSec);
    smoothedAudioAmp += (mags.slice(0, 4).reduce((a, b) => a + b, 0) / 4 - smoothedAudioAmp) * 0.2;
    updateAudioState(mags, smoothedAudioAmp);
    if (isAudioTab) {
        drawSpectrum(mags);
    }

    // Evaluate active pattern or audio-reactive haptic value
    let amp = 0;
    if (isPlaying) {
        if (isAudioTab && mags) {
            const gain = parseFloat(audioGainInput ? audioGainInput.value : 4);
            amp = evaluateAudioReactiveOutput({ mags, timeSec, numBins, dividers, gain, patterns: PATTERNS });

            const nowMs = Date.now();
            const hwAudioOn = !!(document.getElementById("audioEnabled")?.checked &&
                parseInt(document.getElementById("audioSource")?.value || "0", 10) > 0);
            if (bleReady && (!hwAudioOn || useLiveMic) && !window._bleAudioInFlight &&
                (!window._lastBleAudioMs || nowMs - window._lastBleAudioMs >= 100)) {
                window._lastBleAudioMs = nowMs;
                window._bleAudioInFlight = true;
                const hexMags = mags.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
                bleEnqueue(() => bleWriteJson({ type: "state", patch: { af: hexMags, r: +(gain / 4.0).toFixed(2) } }))
                    .catch(() => {})
                    .finally(() => { window._bleAudioInFlight = false; });
            }
        } else if (isStudioTab) {
            if (customEvaluator) {
                try {
                    amp = customEvaluator.run(timeSec, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor);
                } catch (e) {
                    amp = 0;
                }
            } else {
                amp = 0;
            }
        } else if (activePattern) {
            if (activePattern.isCustom && customEvaluator) {
                try {
                    amp = customEvaluator.run(timeSec, frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor);
                } catch (e) {
                    amp = 0;
                }
            } else if (activePattern.func) {
                amp = activePattern.func(timeSec);
            }
        }
        if (amp < 0) amp = 0;
        if (amp > 1) amp = 1;
        const scaledAmp = amp * (masterIntensity / 255);
        if (scaledAmp > 0.001) {
            amp = startupFloor + scaledAmp * (1.0 - startupFloor);
        } else {
            amp = 0;
        }
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
    const isAudioTab = (document.getElementById("tab-audio")?.style.display !== "none");
    renderTelemetryVisualizer({
        prevCanvas,
        prevCtx,
        heroCanvas,
        heroCtx,
        waveHistory,
        colorHistory,
        specHistory,
        historyLen,
        smoothedAmp,
        isMotorStalled,
        telemetryMode,
        timeSec,
        frequencyShift,
        actType: actSelect.value,
        mags,
        isAudioTab,
        onPinsUpdate: updateHardwarePins
    });
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
let activeKnobs = [];
let channelEnabled = [true, true, true, true, true, true, true, true];
// C3/C6/common GPIOs; device-assigned pins are merged in at render time.
const pinOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const drvKindMap = {
    "NONE": 0,
    "L298N": 1,
    "DRV8833": 2,
    "DRV2605L": 3,
    "MOSFET": 4,
    "MINI_HBRIDGE": 5
};

let driverFlags = 0;
const POSITIONAL_SLOT_LABELS = {
    1: ["Ch0 ENA", "Ch0 IN1", "Ch0 IN2", "Ch1 ENB", "Ch1 IN3", "Ch1 IN4", "STBY"],
    2: ["Ch0 AIN1", "Ch0 AIN2", "Ch1 BIN1", "Ch1 BIN2", "nSLEEP"],
    5: ["Ch0 ENA", "Ch0 IN1", "Ch0 IN2", "Ch1 ENB", "Ch1 IN3", "Ch1 IN4", "STBY"]
};

function isPositionalDriver(kind) {
    return kind === 1 || kind === 2 || kind === 5;
}

function ensurePositionalMotors(kind) {
    const labels = POSITIONAL_SLOT_LABELS[kind];
    if (!labels) return;
    const out = new Array(labels.length).fill(-1);
    for (let i = 0; i < out.length && i < activeMotors.length; i++) {
        const p = Number(activeMotors[i]);
        out[i] = Number.isFinite(p) ? p : -1;
    }
    activeMotors = out;
}

function logicalChannelForSlot(kind, slotIdx) {
    if (kind === 1 || kind === 5) {
        if (slotIdx >= 0 && slotIdx <= 2) return 0;
        if (slotIdx >= 3 && slotIdx <= 5) return 1;
        return -1;
    }
    if (kind === 2) {
        if (slotIdx >= 0 && slotIdx <= 1) return 0;
        if (slotIdx >= 2 && slotIdx <= 3) return 1;
        return -1;
    }
    return slotIdx;
}

function isChannelToggleSlot(kind, slotIdx) {
    if (kind === 1 || kind === 5) return slotIdx === 1 || slotIdx === 4;
    if (kind === 2) return slotIdx === 0 || slotIdx === 2;
    return true;
}

function motorPinSelectOptions(currentPin) {
    const pins = new Set(pinOptions);
    const p = Number(currentPin);
    if (Number.isFinite(p) && p >= 0) pins.add(p);
    return [...pins].sort((a, b) => a - b);
}

function motorRowCount() {
    return Math.max(1, activeMotors.length);
}

function expandChannelEnabledForRows(enabled, _rowCount, _driverKind) {
    const src = Array.isArray(enabled) ? enabled : [];
    const out = [true, true, true, true, true, true, true, true];
    for (let i = 0; i < 8 && i < src.length; i++) {
        out[i] = src[i] !== false;
    }
    return out;
}

function collapseChannelEnabledForSave(rowCount, driverKind) {
    const logical = logicalChannelCount(driverKind);
    const count = isPositionalDriver(driverKind) ? logical : Math.min(8, Math.max(logical, rowCount));
    const out = [];
    for (let c = 0; c < count; c++) {
        out.push(channelEnabled[c] !== false);
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
    const drvChip = document.getElementById("drvChip");
    const kind = drvKindMap[drvChip?.value] ?? 4;
    const positional = isPositionalDriver(kind);
    if (positional) ensurePositionalMotors(kind);
    const labels = POSITIONAL_SLOT_LABELS[kind];
    const rowCount = motorRowCount();
    while (channelEnabled.length < rowCount) channelEnabled.push(true);
    container.innerHTML = "";
    activeMotors.forEach((pin, idx) => {
        const pinNum = Number.isFinite(Number(pin)) ? Number(pin) : -1;
        const opts = motorPinSelectOptions(pinNum);
        const row = document.createElement("div");
        row.className = "motor-row";
        row.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;";
        const slotLabel = positional ? (labels[idx] || `Pin ${idx}`) : `Ch ${idx}:`;
        const chIdx = logicalChannelForSlot(kind, idx);
        const showToggle = chIdx >= 0 && isChannelToggleSlot(kind, idx);
        const chOn = chIdx >= 0 ? (channelEnabled[chIdx] !== false) : true;
        const toggleHtml = showToggle
            ? `<label style="display:flex; align-items:center; gap:4px; font-size:11px; margin:0; min-width:52px;">
                <input type="checkbox" class="motor-output-enable" data-ch="${chIdx}" ${chOn ? "checked" : ""} style="width:auto; margin:0;">
                <span class="hint">${chOn ? "On" : "Off"}</span>
               </label>`
            : `<span style="min-width:52px; font-size:10px; color:#777;">${chIdx >= 0 ? `Ch ${chIdx}` : ""}</span>`;
        const unassignedOpt = (positional || kind === 3)
            ? `<option value="-1" ${pinNum < 0 ? "selected" : ""}>Unassigned (-1)</option>`
            : "";
        const removeBtn = positional
            ? ""
            : `<button class="btn btn-remove-row remove-motor" data-index="${idx}" style="cursor:pointer;">&times;</button>`;
        row.innerHTML = `
            <span style="font-size: 11px; min-width: 66px;">${slotLabel}</span>
            ${toggleHtml}
            <select class="motor-pin" data-index="${idx}" style="flex:1; min-width:100px;">
                ${unassignedOpt}
                ${opts.map(p => `<option value="${p}" ${p === pinNum ? "selected" : ""}>GPIO ${p}</option>`).join("")}
            </select>
            ${removeBtn}
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
    const kind = drvKindMap[document.getElementById("drvChip")?.value] ?? 4;
    if (isPositionalDriver(kind)) {
        addSerialLog("[HAL] Positional H-bridge pin slots are fixed for this driver.");
        return;
    }
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
        const ch = parseInt(e.target.getAttribute("data-ch"), 10);
        channelEnabled[ch] = e.target.checked;
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
    
    // Add I2C pins if OLED or I2C driver (DRV2605L = 3)
    if (oledEnabled || kind === 3) {
        pinAllocations.push({ name: "I2C SDA", pin: sda });
        pinAllocations.push({ name: "I2C SCL", pin: scl });
    }
    
    // Add motor pins
    const slotLabels = POSITIONAL_SLOT_LABELS[kind];
    activeMotors.forEach((pin, idx) => {
        const label = (isPositionalDriver(kind) && slotLabels?.[idx]) ? slotLabels[idx] : `Motor Ch ${idx}`;
        pinAllocations.push({ name: label, pin });
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
        const p = Number(pin);
        if (idx < 8) pinsPadded[idx] = Number.isFinite(p) ? p : -1;
    });

    let nextFlags = driverFlags & ~(0x1 | 0x4);
    const STRAPPING_PINS = new Set([0, 2, 5, 8, 9, 12, 15, 45, 46]);
    const usedStrapping = activeMotors.filter(p => Number.isFinite(p) && p >= 0 && STRAPPING_PINS.has(p));
    if (usedStrapping.length > 0) {
        const proceed = confirm(`Warning: Motor pin(s) GPIO ${usedStrapping.join(", ")} are boot/strapping pins on some ESP32 boards. Heavy loads during boot may prevent booting.\n\nAllow strapping pin(s) anyway?`);
        if (!proceed) return;
        nextFlags |= 0x1;
    }
    if (actSelect?.value === "LRA") nextFlags |= 0x4;
    driverFlags = nextFlags;

    const audioGainVal = parseFloat(audioGainInput?.value || "1");
    const requestedSsid = document.getElementById("deviceSsid")?.value.trim() || "Haxel";
    const configPatch = {
        apSsid: requestedSsid,
        channelEnabled: collapseChannelEnabledForSave(motorRowCount(), kind),
        driver: {
            kind: kind,
            pins: pinsPadded,
            sda: Number.isFinite(sda) ? sda : -1,
            scl: Number.isFinite(scl) ? scl : -1,
            pwmHz: pwmHz,
            flags: nextFlags
        },
        audio: {
            enabled: audioEnabled,
            source: audioSource,
            bclk: audioBclk,
            ws: audioWs,
            sd: audioSd,
            adc: audioAdc,
            gain: Number.isFinite(audioGainVal) ? +audioGainVal.toFixed(2) : 1.0
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
loadCustomPatterns(frequencyShift, playbackSpeed, masterIntensity / 255, startupFloor);
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
