// Shared Audio-Reactive & Frequency Band Partitioning Engine (Single Source of Truth)

export function getFreqAtBand(b) {
    if (b <= 0) return 0;
    if (b >= 32) return 20000;
    return Math.round(40 * Math.pow(20000 / 40, b / 32));
}

export function getBandAtFreq(f) {
    const clamped = Math.max(40, Math.min(20000, f || 40));
    return Math.max(0, Math.min(32, Math.round(32 * Math.log(clamped / 40) / Math.log(20000 / 40))));
}

export function computeDividersForRange(minFreq, maxFreq, numBins) {
    const minBandIdx = getBandAtFreq(minFreq);
    const maxBandIdx = getBandAtFreq(maxFreq);
    const numDividers = Math.max(0, numBins - 1);
    const dividers = new Array(numDividers);

    if (numDividers >= 1) {
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
    return dividers;
}

export function updateBinRangeLabels(numBins, dividers) {
    for (let i = 0; i < numBins; ++i) {
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

export function renderBinRows({ container, numBins, dividers, patterns, minFreq, maxFreq, onSync }) {
    if (!container) return;

    const savedValues = [];
    for (let i = 0; i < numBins; ++i) {
        const el = document.getElementById(`bin-${i}-pattern`);
        savedValues.push(el ? el.value : null);
    }

    container.innerHTML = "";
    const defaults = ["none", "Pulse", "Rumble", "Staccato", "Ocean"];
    const minBandIdx = getBandAtFreq(minFreq);
    const maxBandIdx = getBandAtFreq(maxFreq);

    for (let i = 0; i < numBins; ++i) {
        const row = document.createElement("div");
        row.className = "bin-row";

        let labelName = `Bin ${i}`;
        if (i === 0 && minBandIdx > 0) {
            labelName += " (Anti-Loop / Low Cut)";
        } else if (i === numBins - 1 && maxBandIdx < 32) {
            labelName += " (High Cut / End Bin)";
        } else {
            const activeIdx = (minBandIdx > 0) ? (i - 1) : i;
            const activeCount = numBins - (minBandIdx > 0 ? 1 : 0) - (maxBandIdx < 32 ? 1 : 0);
            if (activeCount === 3) {
                const labels = ["Bass", "Mids", "Treble"];
                labelName += ` (${labels[activeIdx] || `Active ${activeIdx + 1}`})`;
            } else if (activeCount === 2) {
                const labels = ["Bass/Mids", "Treble"];
                labelName += ` (${labels[activeIdx] || `Active ${activeIdx + 1}`})`;
            } else {
                labelName += ` (Active ${activeIdx + 1})`;
            }
        }

        row.innerHTML = `
            <span class="bin-title">${labelName}:</span>
            <span class="bin-range" id="bin-${i}-range">-</span>
            <select class="bin-pattern-select" id="bin-${i}-pattern">
                <option value="none">NONE (No Reactivity)</option>
            </select>
        `;
        container.appendChild(row);

        const sel = row.querySelector(".bin-pattern-select");
        sel.addEventListener("change", () => {
            if (onSync) onSync();
        });
        patterns.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });

        const prevVal = savedValues[i];
        const pickDefault = () => {
            if (i === 0) return "none";
            if (i === 1) return Array.from(sel.options).some(o => o.value === "Pulse") ? "Pulse" : (patterns[0]?.id || "none");
            if (i === 2) return Array.from(sel.options).some(o => o.value === "Rumble") ? "Rumble" : (patterns[1]?.id || patterns[0]?.id || "none");
            const cand = defaults[i] || "none";
            return Array.from(sel.options).some(o => o.value === cand) ? cand : "none";
        };
        if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
            sel.value = prevVal;
        } else {
            sel.value = pickDefault();
        }
    }

    updateBinRangeLabels(numBins, dividers);
}

export function initSpectrumDividers({ canvas, getDividers, onUpdate, onCommit }) {
    if (!canvas) return;
    let draggingIdx = -1;

    const getMouseX = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return clientX - rect.left;
    };

    const handleStart = (e) => {
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.width / dpr;
        const dividers = getDividers();

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
            draggingIdx = closestIdx;
            e.preventDefault();
        }
    };

    const handleMove = (e) => {
        if (draggingIdx < 0) return;
        const mx = getMouseX(e);
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.width / dpr;
        const band = Math.round((mx / cssW) * 32);
        const dividers = getDividers();

        const minVal = draggingIdx === 0 ? 1 : dividers[draggingIdx - 1] + 1;
        const maxVal = draggingIdx === dividers.length - 1 ? 31 : dividers[draggingIdx + 1] - 1;
        dividers[draggingIdx] = Math.max(minVal, Math.min(maxVal, band));

        if (onUpdate) onUpdate();
        e.preventDefault();
    };

    const handleEnd = () => {
        if (draggingIdx >= 0 && onCommit) {
            onCommit();
        }
        draggingIdx = -1;
    };

    canvas.addEventListener("mousedown", handleStart);
    canvas.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);

    canvas.addEventListener("touchstart", handleStart, { passive: false });
    canvas.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
}

export function drawSpectrum(canvas, ctx, mags, dividers, numBins) {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;

    ctx.fillStyle = "#f4ebd0";
    ctx.fillRect(0, 0, cssW, cssH);

    if (mags && mags.length === 32) {
        const barW = cssW / 32;
        for (let i = 0; i < 32; ++i) {
            const val = Math.min(1.0, Math.max(0.0, mags[i]));
            const h = val * (cssH - 8);
            const hue = (i / 31) * 280;
            ctx.fillStyle = `hsl(${hue}, 85%, 45%)`;
            ctx.fillRect(i * barW + 1, cssH - h - 2, barW - 2, h);

            ctx.strokeStyle = "#111111";
            ctx.lineWidth = 1;
            ctx.strokeRect(i * barW + 1, cssH - h - 2, barW - 2, h);
        }
    }

    for (let i = 0; i < Math.min(dividers.length, numBins - 1); ++i) {
        const x = (dividers[i] / 32) * cssW;
        const color = ["#e23b24", "#f2b134", "#002f6c", "#9b59b6"][i % 4];
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, 15, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

export function downsampleMicSpectrum(analyser, dataArray) {
    analyser.getByteFrequencyData(dataArray);
    const mags = new Array(32).fill(0);
    const nBins = dataArray.length;
    for (let i = 0; i < 32; ++i) {
        const startBand = Math.min(nBins - 1, Math.floor(Math.pow(nBins, i / 32)));
        const endBand = Math.max(startBand + 1, Math.min(nBins, Math.floor(Math.pow(nBins, (i + 1) / 32))));
        let maxVal = 0;
        for (let j = startBand; j < endBand; ++j) {
            if (dataArray[j] > maxVal) maxVal = dataArray[j];
        }
        mags[i] = maxVal / 255;
    }
    return mags;
}

export function computeSimulatedSpectrum(timeSec) {
    const mags = new Array(32).fill(0);
    const beat = Math.pow(Math.max(0, Math.sin(timeSec * Math.PI * 2.2)), 4);
    const snare = Math.pow(Math.max(0, Math.sin(timeSec * Math.PI * 2.2 + Math.PI)), 6);
    for (let i = 0; i < 32; ++i) {
        const bassEnv = i < 8 ? beat * (1 - i / 10) : 0;
        const midEnv = (i >= 6 && i < 20) ? snare * 0.75 * Math.sin(((i - 6) / 14) * Math.PI) : 0;
        const hiEnv = i >= 18 ? (0.18 + 0.18 * Math.sin(timeSec * 9.0 + i * 0.7)) : 0;
        const ripple = 0.08 * (0.5 + 0.5 * Math.sin(timeSec * 5.0 + i * 0.45));
        mags[i] = Math.min(1.0, bassEnv + midEnv + hiEnv + ripple);
    }
    return mags;
}

export function evaluateAudioReactiveOutput({ mags, timeSec, numBins, dividers, gain, patterns }) {
    if (!mags || mags.length === 0) return 0;
    let maxAmp = 0;
    for (let b = 0; b < numBins; ++b) {
        const startIdx = (b === 0) ? 0 : dividers[b - 1];
        const endIdx = (b === numBins - 1) ? 32 : dividers[b];
        const len = Math.max(1, endIdx - startIdx);
        const vol = mags.slice(startIdx, endIdx).reduce((a, c) => a + c, 0) / len * (gain * 0.45);

        const sel = document.getElementById(`bin-${b}-pattern`);
        const pId = sel ? sel.value : "none";
        if (pId !== "none") {
            const pat = patterns.find(p => p.id === pId);
            if (pat && pat.func) {
                const out = vol * pat.func(timeSec);
                if (out > maxAmp) maxAmp = out;
            }
        }
    }
    return Math.min(1.0, Math.max(0.0, maxAmp));
}
