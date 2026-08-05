import { PATTERNS, speedLabelForBin } from "./patterns.js";

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bleDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let bleWriteChain = Promise.resolve();
let bleReady = false;
let bleStateReceived = false;
let bleConfigReceived = false;

let isPlaying = true;
let isMuted = false;
let activePattern = PATTERNS.find(p => p.id === "DualAxis") || PATTERNS[0];
let masterIntensity = 217;
let playbackSpeed = 1.0;
let startupFloor = 0.15;
let chargeRate = 0.1;
let decayRate = 0.6;
let numBins = 4;
let dividers = [8, 16, 24];

const motionCanvas = document.getElementById("motion-canvas");
const motionCtx = motionCanvas?.getContext("2d");
const serialLog = document.getElementById("serialLog");
const routingMatrix = document.getElementById("routingMatrix");

function addLog(msg) {
    if (!serialLog) return;
    const line = document.createElement("div");
    line.textContent = msg;
    serialLog.appendChild(line);
    serialLog.scrollTop = serialLog.scrollHeight;
}

function setPortalLocked(locked, message = "") {
    const body = document.getElementById("portal-body");
    if (body) {
        body.inert = locked;
        body.style.opacity = locked ? "0.55" : "";
        body.style.pointerEvents = locked ? "none" : "";
    }
    const connText = document.getElementById("connText");
    if (connText && message) connText.textContent = message;
}

function resetBleHydration(message = "connect BLE") {
    bleReady = false;
    bleStateReceived = false;
    bleConfigReceived = false;
    setPortalLocked(true, message);
}

function finishBleHydrationIfReady() {
    if (!bleStateReceived || !bleConfigReceived) return;
    bleReady = true;
    setPortalLocked(false, "connected");
    addLog("[SAFETY] Device state loaded. Controls unlocked.");
}

function updateConnectButtons(connected, connecting = false) {
    for (const id of ["bleConnectBtn", "bleConnectBtnDoc"]) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        if (!("bluetooth" in navigator)) {
            btn.textContent = "BLE UNSUPPORTED";
            btn.disabled = true;
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
    }
    const dot = document.getElementById("dot");
    if (dot) dot.className = connected ? "portal-dot connected" : "portal-dot";
}

function bleEnqueue(task) {
    bleWriteChain = bleWriteChain.then(task, task);
    return bleWriteChain;
}

async function bleWriteJson(obj) {
    if (!rxCharacteristic) throw new Error("BLE not connected");
    const data = new TextEncoder().encode(JSON.stringify(obj));
    if (rxCharacteristic.properties?.write) {
        await rxCharacteristic.writeValue(data);
    } else {
        await rxCharacteristic.writeValueWithoutResponse(data);
    }
}

function syncStateToDevice() {
    if (!bleReady) return;
    bleEnqueue(async () => {
        await bleWriteJson({
            type: "state",
            patch: {
                on: isPlaying,
                mute: isMuted,
                intensity: masterIntensity / 255,
                speed: playbackSpeed,
                startupFloor,
                pattern: activePattern?.id || "DualAxis",
                chargeRate,
                decayRate,
                numBins,
                dividers: dividers.slice(0, numBins - 1),
                binPatterns: Array.from({ length: numBins }, (_, i) => {
                    const el = document.getElementById(`bin-${i}-pattern`);
                    return el ? el.value : "none";
                })
            }
        });
    });
}

function populatePatternSelect() {
    const sel = document.getElementById("patternSelect");
    if (!sel) return;
    sel.innerHTML = "";
    PATTERNS.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + (p.usesMotion ? " ★" : "");
        sel.appendChild(opt);
    });
    sel.value = activePattern.id;
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
        if ([...sel.options].some(o => o.value === oldVal)) sel.value = oldVal;
        else if (i === 0) sel.value = "Heartbeat";
        else if (i === 1) sel.value = "Gallop";
        else if (i === 2) sel.value = "Shimmer";
        else sel.value = "SwingKick";
    }
}

function renderBinRows() {
    if (!routingMatrix) return;
    routingMatrix.innerHTML = "";

    for (let i = 0; i < numBins; ++i) {
        const lowIdx = i === 0 ? 0 : dividers[i - 1];
        const highIdx = i === numBins - 1 ? 31 : dividers[i];
        const row = document.createElement("div");
        row.className = "routing-row";
        row.innerHTML = `
            <div style="flex:1">
                <div class="bin-title">BIN ${String(i).padStart(2, "0")}</div>
                <div class="bin-speed-label">${speedLabelForBin(i, lowIdx, highIdx)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
                ${i < numBins - 1 ? `
                    <button class="btn-div-adj down" data-div="${i}">&lt;</button>
                    <span class="div-val">${dividers[i]}</span>
                    <button class="btn-div-adj up" data-div="${i}">&gt;</button>
                ` : ""}
            </div>
            <div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:6px">
                <label style="font-size:10px">Pattern:</label>
                <select class="bin-pattern-select" id="bin-${i}-pattern"></select>
            </div>
        `;
        routingMatrix.appendChild(row);
    }

    routingMatrix.querySelectorAll(".btn-div-adj").forEach(btn => {
        btn.addEventListener("click", () => {
            const divIdx = parseInt(btn.dataset.div, 10);
            const isUp = btn.classList.contains("up");
            let val = dividers[divIdx];
            val += isUp ? 1 : -1;
            const min = divIdx === 0 ? 1 : dividers[divIdx - 1] + 1;
            const max = divIdx === dividers.length - 1 ? 30 : dividers[divIdx + 1] - 1;
            if (val >= min && val <= max) {
                dividers[divIdx] = val;
                renderBinRows();
                syncStateToDevice();
            }
        });
    });

    populateBinPatternSelects();
    routingMatrix.querySelectorAll(".bin-pattern-select").forEach(sel => {
        sel.addEventListener("change", syncStateToDevice);
    });
}

function applyStateFromDevice(s) {
    if (typeof s.on === "boolean") isPlaying = s.on;
    if (typeof s.mute === "boolean") isMuted = s.mute;
    if (typeof s.intensity === "number") masterIntensity = Math.round(s.intensity * 255);
    if (typeof s.speed === "number") playbackSpeed = s.speed;
    if (typeof s.startupFloor === "number") startupFloor = s.startupFloor;
    if (typeof s.chargeRate === "number") chargeRate = s.chargeRate;
    if (typeof s.decayRate === "number") decayRate = s.decayRate;
    if (typeof s.numBins === "number") numBins = s.numBins;
    if (Array.isArray(s.dividers)) dividers = s.dividers.slice();
    if (typeof s.pattern === "string") {
        activePattern = PATTERNS.find(p => p.id === s.pattern) || activePattern;
    }

    document.getElementById("intensityRange").value = masterIntensity;
    document.getElementById("intensityVal").textContent = Math.round(masterIntensity / 255 * 100) + "%";
    document.getElementById("speedRange").value = Math.round(playbackSpeed * 100);
    document.getElementById("speedVal").textContent = playbackSpeed.toFixed(1) + "×";
    document.getElementById("floorRange").value = Math.round(startupFloor * 100);
    document.getElementById("floorVal").textContent = Math.round(startupFloor * 100) + "%";
    document.getElementById("chargeRange").value = Math.round(chargeRate * 100);
    document.getElementById("chargeVal").textContent = chargeRate.toFixed(2);
    document.getElementById("decayRange").value = Math.round(decayRate * 100);
    document.getElementById("decayVal").textContent = decayRate.toFixed(2);
    document.getElementById("numBinsSelect").value = String(numBins);
    document.getElementById("playBtn").textContent = isPlaying ? "STOP" : "PLAY";
    document.getElementById("muteBtn").textContent = isMuted ? "UNMUTE" : "MUTE";
    populatePatternSelect();
    renderBinRows();
    if (Array.isArray(s.binPatterns)) {
        s.binPatterns.forEach((pat, i) => {
            const el = document.getElementById(`bin-${i}-pattern`);
            if (el) el.value = pat;
        });
    }
}

function onBleNotification(event) {
    const value = new TextDecoder().decode(event.target.value);
    let msg;
    try { msg = JSON.parse(value); } catch { return; }

    if (msg.type === "state" && msg.data) {
        applyStateFromDevice(msg.data);
        bleStateReceived = true;
        finishBleHydrationIfReady();
    } else if (msg.type === "config-start") {
        bleConfigReceived = false;
    } else if (msg.type === "config" && msg.section === "identity" && msg.data?.deviceName) {
        document.getElementById("deviceName").value = msg.data.deviceName.replace(/^LightBaton-?/, "");
    } else if (msg.type === "config-complete") {
        bleConfigReceived = true;
        finishBleHydrationIfReady();
    }
}

async function connectBLE() {
    if (!("bluetooth" in navigator)) return;
    resetBleHydration("connecting...");
    updateConnectButtons(false, true);
    addLog("[BLE] Requesting device...");

    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [SERVICE_UUID] },
                { namePrefix: "LightBaton" },
                { namePrefix: "lightbaton" }
            ],
            optionalServices: [SERVICE_UUID]
        });

        bleDevice.addEventListener("gattserverdisconnected", onDisconnected);
        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        rxCharacteristic = await service.getCharacteristic(RX_CHAR_UUID);
        txCharacteristic = await service.getCharacteristic(TX_CHAR_UUID);
        await txCharacteristic.startNotifications();
        txCharacteristic.addEventListener("characteristicvaluechanged", onBleNotification);

        addLog(`[BLE] Connected to ${bleDevice.name}`);
        updateConnectButtons(true);
        await bleWriteJson({ type: "sync-request" });
    } catch (err) {
        addLog(`[BLE] Error: ${err.message}`);
        updateConnectButtons(false);
        resetBleHydration("connect BLE");
    }
}

function onDisconnected() {
    addLog("[BLE] Disconnected");
    rxCharacteristic = null;
    txCharacteristic = null;
    updateConnectButtons(false);
    resetBleHydration("connect BLE");
}

function disconnectBLE() {
    if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
}

// Tab switching
document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        ["play", "motion", "device", "log"].forEach(id => {
            const el = document.getElementById("tab-" + id);
            if (el) el.style.display = tab.dataset.tab === id ? "" : "none";
        });
    });
});

document.getElementById("patternSelect")?.addEventListener("change", e => {
    activePattern = PATTERNS.find(p => p.id === e.target.value) || activePattern;
    syncStateToDevice();
});

document.getElementById("intensityRange")?.addEventListener("input", e => {
    masterIntensity = parseInt(e.target.value, 10);
    document.getElementById("intensityVal").textContent = Math.round(masterIntensity / 255 * 100) + "%";
    syncStateToDevice();
});

document.getElementById("speedRange")?.addEventListener("input", e => {
    playbackSpeed = parseInt(e.target.value, 10) / 100;
    document.getElementById("speedVal").textContent = playbackSpeed.toFixed(1) + "×";
    syncStateToDevice();
});

document.getElementById("floorRange")?.addEventListener("input", e => {
    startupFloor = parseInt(e.target.value, 10) / 100;
    document.getElementById("floorVal").textContent = Math.round(startupFloor * 100) + "%";
    syncStateToDevice();
});

document.getElementById("chargeRange")?.addEventListener("input", e => {
    chargeRate = parseInt(e.target.value, 10) / 100;
    document.getElementById("chargeVal").textContent = chargeRate.toFixed(2);
    syncStateToDevice();
});

document.getElementById("decayRange")?.addEventListener("input", e => {
    decayRate = parseInt(e.target.value, 10) / 100;
    document.getElementById("decayVal").textContent = decayRate.toFixed(2);
    syncStateToDevice();
});

document.getElementById("numBinsSelect")?.addEventListener("change", e => {
    numBins = parseInt(e.target.value, 10);
    while (dividers.length < numBins - 1) dividers.push(Math.min(30, (dividers.at(-1) || 8) + 8));
    dividers = dividers.slice(0, numBins - 1);
    renderBinRows();
    syncStateToDevice();
});

document.getElementById("playBtn")?.addEventListener("click", () => {
    isPlaying = !isPlaying;
    document.getElementById("playBtn").textContent = isPlaying ? "STOP" : "PLAY";
    syncStateToDevice();
});

document.getElementById("muteBtn")?.addEventListener("click", () => {
    isMuted = !isMuted;
    document.getElementById("muteBtn").textContent = isMuted ? "UNMUTE" : "MUTE";
    syncStateToDevice();
});

document.getElementById("saveDeviceBtn")?.addEventListener("click", () => {
    if (!bleReady) return;
    const name = document.getElementById("deviceName").value.trim() || "LightBaton";
    bleEnqueue(async () => {
        await bleWriteJson({ type: "config", patch: { deviceName: name } });
        addLog("[BLE] Device name saved. Reconnect to see new advertising name.");
    });
});

for (const id of ["bleConnectBtn", "bleConnectBtnDoc"]) {
    document.getElementById(id)?.addEventListener("click", async () => {
        if (bleDevice?.gatt?.connected) disconnectBLE();
        else await connectBLE();
    });
}

// Motion preview animation (simulated X/Y when not connected)
let previewT = 0;
function drawMotionPreview() {
    if (!motionCtx || !motionCanvas) return;
    previewT += 0.016;
    const w = motionCanvas.clientWidth;
    const h = motionCanvas.clientHeight;
    motionCtx.clearRect(0, 0, w, h);
    motionCtx.fillStyle = "#fff";
    motionCtx.fillRect(0, 0, w, h);

    const sx = 0.5 + Math.sin(previewT * 1.3) * 0.35;
    const sy = 0.5 + Math.cos(previewT * 0.9) * 0.35;

    motionCtx.strokeStyle = "#002f6c";
    motionCtx.lineWidth = 2;
    motionCtx.beginPath();
    motionCtx.moveTo(w * 0.1, h * 0.5);
    motionCtx.lineTo(w * 0.9, h * 0.5);
    motionCtx.moveTo(w * 0.5, h * 0.15);
    motionCtx.lineTo(w * 0.5, h * 0.85);
    motionCtx.stroke();

    motionCtx.fillStyle = "#e23b24";
    motionCtx.beginPath();
    motionCtx.arc(w * sx, h * (1 - sy), 10, 0, Math.PI * 2);
    motionCtx.fill();

    motionCtx.font = "11px JetBrains Mono";
    motionCtx.fillStyle = "#111";
    motionCtx.fillText(`X ${(sx * 100).toFixed(0)}%  Y ${(sy * 100).toFixed(0)}%`, 12, 18);
    requestAnimationFrame(drawMotionPreview);
}

populatePatternSelect();
renderBinRows();
resetBleHydration();
updateConnectButtons(false);
drawMotionPreview();
