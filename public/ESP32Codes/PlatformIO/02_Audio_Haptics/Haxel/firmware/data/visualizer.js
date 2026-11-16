// Shared Telemetry & Virtual Actuator Visualizer (Single Source of Truth)

export function setupSharpCanvas(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}

export function drawVirtualActuator(ctx, cx, cy, radius, amp, { actType, timeSec, frequencyShift, isMotorStalled }) {
    const isLRA = actType === "LRA";
    const isSolenoid = actType === "Solenoid";

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

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax, ay, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isLRA) {
        const offset = Math.sin(timeSec * (frequencyShift * 0.8)) * (radius * 0.4) * amp;
        ctx.fillStyle = "#111111";
        ctx.fillRect(ax - 12, ay - 6 + offset, 24, 12);
        ctx.fillStyle = "#e23b24";
        ctx.fillRect(ax - 8, ay - 3 + offset, 16, 6);
    } else if (isSolenoid) {
        const stroke = amp * 12;
        ctx.fillStyle = "#111111";
        ctx.fillRect(ax - 10, ay - 16 - stroke, 20, 22);
        ctx.fillStyle = "#f2b134";
        ctx.fillRect(ax - 6, ay - 22 - stroke, 12, 8);
    } else {
        const rotAngle = timeSec * (10 + amp * 35);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(rotAngle);

        ctx.fillStyle = "#e23b24";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius - 6, 0, Math.PI * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export function renderTelemetryVisualizer({
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
    actType,
    mags,
    isAudioTab,
    onPinsUpdate
}) {
    waveHistory.push(smoothedAmp);
    if (waveHistory.length > historyLen) waveHistory.shift();

    let activeColor = "rgba(0, 47, 108, 0.25)";
    if (isAudioTab && mags) {
        const sortedBins = Array.from({ length: 32 }, (_, idx) => ({ index: idx, val: mags[idx] }))
            .sort((a, b) => b.val - a.val);
        const top3 = sortedBins.slice(0, 3);
        const avgHue = ((top3[0].index + top3[1].index + top3[2].index) / 3 / 31) * 280;
        activeColor = `hsl(${avgHue}, 85%, 45%)`;
    }
    colorHistory.push(activeColor);
    if (colorHistory.length > historyLen) colorHistory.shift();

    specHistory.push(mags ? [...mags] : new Array(32).fill(0));
    if (specHistory.length > historyLen) specHistory.shift();

    if (onPinsUpdate) onPinsUpdate(smoothedAmp, isMotorStalled);

    const dpr = window.devicePixelRatio || 1;
    if (prevCanvas && prevCtx) {
        const cssW = prevCanvas.width / dpr;
        const cssH = prevCanvas.height / dpr;

        prevCtx.fillStyle = "#f4ebd0";
        prevCtx.fillRect(0, 0, cssW, cssH);

        drawVirtualActuator(prevCtx, 60, cssH / 2, 36, smoothedAmp, {
            actType,
            timeSec,
            frequencyShift,
            isMotorStalled
        });

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
    }

    if (heroCanvas && heroCtx) {
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
                    fillCol = "rgba(226, 59, 36, 0.35)";
                }
                heroCtx.fillStyle = fillCol;

                const y1_top = heroCssH / 2 - Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
                const y2_top = heroCssH / 2 - Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;
                const y1_bot = heroCssH / 2 + Math.sin(timeSec * 5 + i * 0.05) * h1 * 0.4;
                const y2_bot = heroCssH / 2 + Math.sin(timeSec * 5 + (i + 1) * 0.05) * h2 * 0.4;

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
}
