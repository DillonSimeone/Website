import {
    updateBinRangeLabels as updateBinRangeLabelsShared,
    renderBinRows as renderBinRowsShared,
    initSpectrumDividers as initSpectrumDividersShared,
    drawSpectrum as drawSpectrumShared,
    downsampleMicSpectrum,
    computeSimulatedSpectrum,
    evaluateAudioReactiveOutput
} from './audio-reactive.js';
import { setupSharpCanvas, renderTelemetryVisualizer } from './visualizer.js';
import { addSerialLog, triggerI2CBlink, updateHardwarePins, initBootLogs, serialConsole } from './emulator.js';
import { PATTERNS, loadCustomPatterns, initPhoneHaptics } from './haptics.js';

// ─── CANVAS REFS ────────────────────────────────────────────────────────────
const prevCanvas = document.getElementById("prev");
const prevCtx = prevCanvas.getContext("2d");
const heroCanvas = document.getElementById("hero-canvas");
const heroCtx = heroCanvas ? heroCanvas.getContext("2d") : null;
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
// Declared early so Pattern Studio compile-on-type can live-push.
const isBleMode = window.location.pathname.includes("bluetooth.html");
const isRealESP32 = (
    window.location.hostname !== 'localhost'
    && window.location.hostname !== '127.0.0.1'
    && window.location.hostname !== 'dillonsimeone.com'
    && window.location.hostname !== ''
);
let bleDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
const HAXEL_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_CHAR_UUID       = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID       = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const isBluetoothSupported = 'bluetooth' in navigator;

let numBins = 3;
let dividers = [8, 18];

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
const STUDIO_DRAFT_ID = "studio_draft";
let studioDraftTimer = null;
let bleWriteChain = Promise.resolve();
let lastUploadedPatternKey = "";

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

async function ensurePatternUploaded(pat) {
    if (!pat || !pat.code) return false;
    if (!isBleMode || !rxCharacteristic) {
        if (isRealESP32) {
            const res = await fetch('/json/custom-patterns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pat.id, name: pat.name || pat.id, code: pat.code })
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "upload rejected");
            lastUploadedPatternKey = patternUploadKey(pat.id, pat.code);
            return true;
        }
        return false;
    }
    const key = patternUploadKey(pat.id, pat.code);
    if (key === lastUploadedPatternKey) return true;
    await bleEnqueue(() => bleSendCustomPattern({
        id: pat.id,
        name: pat.name || pat.id,
        code: pat.code
    }));
    return true;
}

function pushStudioDraftToDevice(code, playAfter = true) {
    if (!isRealESP32 && !(isBleMode && rxCharacteristic)) {
        return Promise.resolve(false);
    }
    const name = (customPatternNameInput && customPatternNameInput.value.trim()) || "Studio Draft";
    addSerialLog(`[CTRL→ESP] Pushing studio draft (${code.length} chars)`);

    const afterOk = () => {
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
                    ? customEvaluator.run(t, frequencyShift, playbackSpeed, masterIntensity, startupFloor)
                    : 0
            };
            PATTERNS.push(draft);
        } else {
            draft.name = name + " (Live)";
            draft.code = code;
            draft.func = (t) => customEvaluator
                ? customEvaluator.run(t, frequencyShift, playbackSpeed, masterIntensity, startupFloor)
                : 0;
        }
        activePattern = draft;
        const label = document.getElementById("patternName");
        if (label) label.textContent = `${name} (Studio)`;
        if (playAfter) {
            isPlaying = true;
            const dot = document.getElementById("dot");
            if (dot) dot.className = "portal-dot ok";
        }
        // State sync without re-uploading (we just uploaded studio_draft).
        sendStateUpdate({
            on: isPlaying,
            intensity: masterIntensity / 255,
            speed: playbackSpeed,
            startupFloor: startupFloor,
            pattern: STUDIO_DRAFT_ID,
            name,
            numBins: numBins,
            dividers: dividers,
            binPatterns: Array.from({ length: numBins }).map((_, i) => {
                const el = document.getElementById(`bin-${i}-pattern`);
                return el ? el.value : "none";
            })
        });
        return true;
    };

    if (isBleMode) {
        return bleEnqueue(() => bleSendCustomPattern({ id: STUDIO_DRAFT_ID, name, code }))
            .then(() => afterOk())
            .catch(err => {
                addSerialLog(`[CTRL→ESP] Studio draft BLE failed: ${err.message}`);
                return false;
            });
    }

    return fetch('/json/custom-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: STUDIO_DRAFT_ID, name, code })
    }).then(res => res.json())
      .then(data => {
          if (!data.ok) {
              addSerialLog(`[CTRL→ESP] Studio draft rejected: ${data.error || 'unknown'}`);
              return false;
          }
          lastUploadedPatternKey = patternUploadKey(STUDIO_DRAFT_ID, code);
          return afterOk();
      }).catch(err => {
          addSerialLog(`[CTRL→ESP] Studio draft failed: ${err.message}`);
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
        customEvaluator = new Evaluator(ast);
        compilerStatus.textContent = "compiled ✓";
        compilerStatus.className = "compilation-status ok";
        addSerialLog("[IDE] Compiled custom pattern successfully!");
        // Pixelblaze-style: successful compile live-pushes without Save.
        if (isRealESP32 || (isBleMode && rxCharacteristic)) {
            pushStudioDraftDebounced(src);
        } else if (isBleMode) {
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
    // If Studio has compiled code in focus, push that live draft first.
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
                (isBleMode && bleDevice && bleDevice.gatt && bleDevice.gatt.connected)
                    ? "connected" : "playing";
            addSerialLog(`[HAL] Loaded library pattern: "${pat.name}"`);
            
            if (pat.isCustom && pat.code) {
                ta.value = pat.code;
                syncHL();
                try {
                    const ast = new Parser(tokenize(pat.code)).parseProgram();
                    customEvaluator = new Evaluator(ast);
                    compilerStatus.textContent = "compiled ✓";
                    compilerStatus.className = "compilation-status ok";
                } catch (e) {
                    customEvaluator = null;
                }
                ensurePatternUploaded(pat)
                    .then(() => syncStateToESP32())
                    .catch(err => addSerialLog(`[CTRL→ESP] Custom upload failed: ${err.message}`));
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
    
    if (isRealESP32) {
        fetch(`/json/custom-patterns?id=${id}`, {
            method: 'DELETE'
        }).then(() => {
            addSerialLog(`[ESP32] Deleted custom pattern ${id} from ESP32`);
        }).catch(err => {
            addSerialLog(`[ESP32] [ERROR] Failed to delete from ESP32: ${err.message}`);
        });
    } else if (isBleMode && rxCharacteristic) {
        bleWriteJson({ type: "custom-pattern-delete", id }).catch(err => {
            addSerialLog(`[ESP32] [ERROR] BLE delete failed: ${err.message}`);
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
            
            ensurePatternUploaded(newPat)
                .then(() => {
                    addSerialLog(`[ESP32] Custom pattern on device: "${name}"`);
                    syncStateToESP32();
                })
                .catch(err => {
                    addSerialLog(`[ESP32] [ERROR] Failed to save to device: ${err.message}`);
                    if (isRealESP32 || isBleMode) {
                        alert("Device upload failed: " + err.message);
                    }
                });
            
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
    updateBinRangeLabelsShared(numBins, dividers);
}

// Initialize dividers and bin rows on startup
initSpectrumDividersShared({
    canvas: specCanvas,
    getDividers: () => dividers,
    onUpdate: () => updateBinRangeLabels(),
    onCommit: () => syncStateToESP32()
});
renderBinRows();

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
    const mags = (useLiveMic && analyser && dataArray)
        ? downsampleMicSpectrum(analyser, dataArray)
        : computeSimulatedSpectrum(timeSec);
    smoothedAudioAmp += (mags.slice(0, 4).reduce((a, b) => a + b, 0) / 4 - smoothedAudioAmp) * 0.2;
    updateAudioState(mags, smoothedAudioAmp);

    if (isAudioTab) {
        drawSpectrumShared(specCanvas, specCtx, mags, dividers, numBins);
    }

    let activeAmp = 0;
    if (isPlaying) {
        if (isAudioTab) {
            const gain = parseFloat(document.getElementById("audioGain")?.value || 4);
            activeAmp = evaluateAudioReactiveOutput({ mags, timeSec, numBins, dividers, gain, patterns: PATTERNS });
            const nowMs = Date.now();
            if ((isRealESP32 || isBleMode) && mags && (!window._lastWifiAudioMs || nowMs - window._lastWifiAudioMs >= 66)) {
                window._lastWifiAudioMs = nowMs;
                const qMags = mags.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255));
                sendStateUpdate({ audioFrame: { mags: qMags, rms: +(gain / 4.0).toFixed(2) } });
            }
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

// ─── REAL TIME ESP32 BRIDGE & WEB BLUETOOTH UNIFICATION ─────────────────────
// isRealESP32 / isBleMode / BLE handles are declared near the top of this file.

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

// Common state applier
function applyStateUpdate(s) {
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
    if (Array.isArray(s.binPatterns)) {
        for (let i = 0; i < s.binPatterns.length && i < numBins; i++) {
            const el = document.getElementById(`bin-${i}-pattern`);
            const val = s.binPatterns[i];
            if (el && val && Array.from(el.options).some(o => o.value === val)) {
                el.value = val;
            }
        }
    }
    if (s.pattern) {
        const p = PATTERNS.find(pat => pat.id === s.pattern);
        if (p) {
            activePattern = p;
            const vLabel = document.getElementById("patternName");
            if (vLabel) vLabel.textContent = p.name;
        }
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
}

// Send State Updates
const sendStateUpdate = throttle(async (patch) => {
    addSerialLog(`[CTRL→ESP] ${JSON.stringify(patch)}`);
    if (isBleMode) {
        if (!rxCharacteristic) return;
        try {
            await bleEnqueue(() => bleWriteJson({ type: "state", patch }));
        } catch (err) {
            console.error("BLE State Write Error:", err);
            addSerialLog(`[BLE] State write failed: ${err.message}`);
        }
    } else {
        if (!isRealESP32) return;
        fetch('/json/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        }).catch((err) => {
            addSerialLog(`[CTRL→ESP] HTTP state failed: ${err.message}`);
        });
    }
}, 100);

async function syncStateToESP32() {
    const patch = {
        on: isPlaying,
        intensity: masterIntensity / 255,
        speed: playbackSpeed,
        startupFloor: startupFloor,
        audioReactive: document.getElementById("tab-audio")?.style.display !== "none",
        pattern: activePattern ? activePattern.id : "",
        numBins: numBins,
        dividers: dividers,
        binPatterns: Array.from({length: numBins}).map((_, i) => {
            const el = document.getElementById(`bin-${i}-pattern`);
            return el ? el.value : "none";
        })
    };

    if (activePattern && activePattern.code && (isBleMode || isRealESP32)) {
        try {
            await ensurePatternUploaded(activePattern);
        } catch (err) {
            addSerialLog(`[CTRL→ESP] ensure upload failed: ${err.message}`);
        }
    }
    sendStateUpdate(patch);
}

// BLE Connect Button Handlers
function updateConnectButtonsState(connected, connecting = false) {
    const connectBtn = document.getElementById("connectBleBtn") || document.getElementById("bleConnectBtn");
    const connectBtnDoc = document.getElementById("connectBleBtnDoc") || document.getElementById("bleConnectBtnDoc");
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

async function connectBLE() {
    const dot = document.getElementById("dot");
    const connText = document.getElementById("connText");
    const bleStatus = document.getElementById("bleStatusLabel");
    
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
        if (dot) dot.className = "portal-dot";
        if (connText) connText.textContent = "connecting...";
        
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
        
        if (dot) dot.className = "portal-dot ok";
        if (connText) connText.textContent = "connected";
        if (bleStatus) bleStatus.textContent = "Connected";
        updateConnectButtonsState(true);
        addSerialLog("[BLE] Bluetooth connection fully established!");
        
        sendStateUpdate({ getStatus: true });
        if (customEvaluator && ta && ta.value.trim()) {
            pushStudioDraftToDevice(ta.value, true);
        }
        
    } catch (err) {
        addSerialLog(`[BLE] [ERROR] Connection failed: ${err.message}`);
        if (dot) dot.className = "portal-dot error";
        if (connText) connText.textContent = "error";
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
    
    if (dot) dot.className = "portal-dot";
    if (connText) connText.textContent = "disconnected";
    if (bleStatus) bleStatus.textContent = "Disconnected";
    updateConnectButtonsState(false);
    rxCharacteristic = null;
    txCharacteristic = null;
    addSerialLog("[BLE] Disconnected from device.");
}

function handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const str = decoder.decode(value);
    try {
        const m = JSON.parse(str);
        if (m.type === 'state' && m.data) {
            applyStateUpdate(m.data);
        }
    } catch (e) {
        console.error("BLE Notification Parse Error:", e);
    }
}

// WebSocket connection
function openWebSocket() {
    if (isBleMode) return;
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
                applyStateUpdate(m.data);
            }
        } catch (e) {}
    });
}

// BLE initialization or WiFi init
if (isBleMode) {
    // Show BLE connect buttons and hide emulator status status text
    const connectBtn = document.getElementById("connectBleBtn") || document.getElementById("bleConnectBtn");
    const connectBtnDoc = document.getElementById("connectBleBtnDoc") || document.getElementById("bleConnectBtnDoc");
    if (connectBtn) connectBtn.style.display = "inline-block";
    if (connectBtnDoc) connectBtnDoc.style.display = "inline-block";
    
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
    
    if (!isBluetoothSupported) {
        updateConnectButtonsState(false);
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
    } else {
        updateConnectButtonsState(false);
    }
    
    addSerialLog("[BLE Portal] Initialized. Click CONNECT BLE to link your hardware.");
} else if (isRealESP32) {
    (async function initRealESP32() {
        try {
            // Prefer firmware pattern catalog so IDs always match PatternRegistry.
            const r = await fetch('/json');
            const data = await r.json();
            if (Array.isArray(data.patterns) && data.patterns.length) {
                const byId = new Map(PATTERNS.map(p => [p.id, p]));
                // Keep only customs locally, then rebuild builtins from device.
                const customs = PATTERNS.filter(p => p.isCustom);
                PATTERNS.length = 0;
                data.patterns.forEach(meta => {
                    const prev = byId.get(meta.id);
                    PATTERNS.push({
                        id: meta.id,
                        name: meta.id,
                        category: meta.category || "pulse",
                        desc: meta.description || "",
                        usesAudio: !!meta.usesAudio,
                        code: prev?.code || "",
                        func: prev?.func || ((t) => 0.5 + 0.5 * Math.sin(t * 6))
                    });
                });
                customs.forEach(c => {
                    if (!PATTERNS.some(p => p.id === c.id)) PATTERNS.push(c);
                });
                activePattern = PATTERNS.find(p => p.id === (data.state && data.state.pattern)) || PATTERNS[0];
                addSerialLog(`[CTRL] Synced ${data.patterns.length} firmware patterns`);
            }

            // Fetch custom patterns first
            const cpRes = await fetch('/json/custom-patterns');
            const cpList = await cpRes.json();
            cpList.forEach(p => {
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

            if (data.state) {
                applyStateUpdate(data.state);
                isPlaying = !!data.state.on;
                document.getElementById("dot").className = isPlaying ? "portal-dot ok" : "portal-dot";
                document.getElementById("connText").textContent = isPlaying ? "playing" : "idle";
            }

            await populateDeviceConfigFromESP();
        } catch (e) {
            addSerialLog(`[CTRL] Init fetch failed: ${e.message}`);
        }
        openWebSocket();
    })();
}

// --- Dynamic Hardware Calibration Logic ---
let activeMotors = [6];
let activeKnobs = [];
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
    sendStateUpdate({ channels: enabled.map(on => ({ on: !!on })) });
    addSerialLog(`[HAL] Motor outputs: ${enabled.map((on, i) => `Ch${i}=${on ? "ON" : "OFF"}`).join(", ")}`);
    if (isRealESP32) {
        fetch('/json/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelEnabled: enabled })
        }).catch(err => addSerialLog(`[CTRL] channelEnabled save failed: ${err.message}`));
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
    // Find first unused pin to prevent immediate conflict
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

function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const str = String(value);
    if (Array.from(el.options).some(o => o.value === str)) {
        el.value = str;
    } else if (el.tagName === "SELECT") {
        // Inject missing option (e.g. GPIO 8/9) so the live device value shows.
        const opt = document.createElement("option");
        opt.value = str;
        opt.textContent = str === "-1" ? "Unassigned (-1)" : `GPIO ${str}`;
        el.appendChild(opt);
        el.value = str;
    } else {
        el.value = str;
    }
}

function applyDeviceConfig(cfg) {
    if (!cfg) return;
    const ssidEl = document.getElementById("deviceSsid");
    if (ssidEl && cfg.apSsid) ssidEl.value = cfg.apSsid;
    const KIND_TO_NAME = { 0: "NONE", 1: "L298N", 2: "DRV8833", 3: "DRV2605L", 4: "MOSFET", 5: "MINI_HBRIDGE" };
    // Prefer exact MOSFET/DRV mapping from firmware enum.
    const kind = cfg.driver && cfg.driver.kind != null ? cfg.driver.kind : 4;
    const drvName = KIND_TO_NAME[kind] || "MOSFET";
    setSelectValue("drvChip", drvName);

    if (cfg.driver) {
        if (cfg.driver.pwmHz != null) setSelectValue("pwmHz", cfg.driver.pwmHz);
        if (cfg.driver.sda != null) setSelectValue("pinSDA", cfg.driver.sda);
        if (cfg.driver.scl != null) setSelectValue("pinSCL", cfg.driver.scl);
        if (Array.isArray(cfg.driver.pins)) {
            activeMotors = cfg.driver.pins
                .map(p => Number(p))
                .filter(pin => Number.isFinite(pin) && pin >= 0);
            if (activeMotors.length === 0) activeMotors = [6];
        }
        const enabledSrc = Array.isArray(cfg.channelEnabled)
            ? cfg.channelEnabled
            : (Array.isArray(cfg.driver?.channelEnabled) ? cfg.driver.channelEnabled : null);
        if (enabledSrc) {
            channelEnabled = expandChannelEnabledForRows(
                enabledSrc, Math.max(1, activeMotors.length), kind
            );
        }
        renderMotors();
    }

    if (cfg.audio) {
        const ae = document.getElementById("audioEnabled");
        if (ae) ae.checked = !!cfg.audio.enabled;
        if (cfg.audio.source != null) setSelectValue("audioSource", cfg.audio.source);
        if (cfg.audio.bclk != null) setSelectValue("audioBclk", cfg.audio.bclk);
        if (cfg.audio.ws != null) setSelectValue("audioWs", cfg.audio.ws);
        if (cfg.audio.sd != null) setSelectValue("audioSd", cfg.audio.sd);
        if (cfg.audio.adc != null) setSelectValue("audioAdc", cfg.audio.adc);
        document.getElementById("audioSource")?.dispatchEvent(new Event("change"));
    }

    if (cfg.led) {
        const le = document.getElementById("ledEnabled");
        if (le) le.checked = cfg.led.enabled !== false;
        if (cfg.led.pin != null) setSelectValue("ledPin", cfg.led.pin);
        const lc = document.getElementById("ledCount");
        if (lc && cfg.led.count != null) lc.value = String(cfg.led.count);
    }

    if (cfg.oled) {
        const oe = document.getElementById("oledEnabled");
        if (oe) oe.checked = !!cfg.oled.enabled;
    }

    if (Array.isArray(cfg.knobs) && cfg.knobs.length) {
        activeKnobs = cfg.knobs.map(k => ({
            pin: k.pin ?? -1,
            param: k.param || "none"
        }));
        renderKnobs();
    }

    addSerialLog(`[CTRL] Device config loaded (driver=${drvName}, pins=[${activeMotors.join(",")}], led pin=${cfg.led?.pin}, count=${cfg.led?.count})`);
}

function populateDeviceConfigFromESP() {
    return fetch('/json/config')
        .then(r => r.json())
        .then(cfg => {
            applyDeviceConfig(cfg);
            return cfg;
        })
        .catch(err => {
            addSerialLog(`[CTRL] /json/config failed: ${err.message}`);
        });
}

// Initialize dynamic lists (overwritten once /json/config arrives).
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
    const oledSda = Number.isFinite(sda) ? sda : 8;
    const oledScl = Number.isFinite(scl) ? scl : 9;

    // Dynamic conflict validator
    const pinAllocations = [];

    pinAllocations.push({ name: "I2C SDA", pin: Number.isFinite(sda) ? sda : -1 });
    pinAllocations.push({ name: "I2C SCL", pin: Number.isFinite(scl) ? scl : -1 });

    activeMotors.forEach((pin, idx) => {
        pinAllocations.push({ name: `Motor Ch ${idx}`, pin });
    });

    if (audioSource === 2) {
        pinAllocations.push({ name: "I2S BCLK", pin: audioBclk });
        pinAllocations.push({ name: "I2S WS", pin: audioWs });
        pinAllocations.push({ name: "I2S SD", pin: audioSd });
    } else if (audioSource === 1) {
        pinAllocations.push({ name: "ADC Analog Mic", pin: audioAdc });
    }

    pinAllocations.push({ name: "Status LED", pin: ledPin });

    activeKnobs.forEach((k, idx) => {
        pinAllocations.push({ name: `Knob ${idx}`, pin: k.pin });
    });

    const pinCounts = {};
    let hasConflict = false;
    let conflictMsg = "";

    pinAllocations.forEach(alloc => {
        if (alloc.pin === -1 || !Number.isFinite(alloc.pin)) return;
        if (!pinCounts[alloc.pin]) pinCounts[alloc.pin] = [];
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
            sda: oledSda,
            scl: oledScl
        }
    };

    addSerialLog(`[CTRL→ESP] Saving config: ${JSON.stringify(configPatch)}`);

    if (isRealESP32) {
        fetch('/json/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configPatch)
        })
        .then(() => {
            addSerialLog("[PORTAL] Sent configuration patch successfully. Rebooting ESP32...");
        })
        .catch(err => {
            console.error("Config save error:", err);
            addSerialLog(`[PORTAL] Config save failed: ${err.message}`);
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

