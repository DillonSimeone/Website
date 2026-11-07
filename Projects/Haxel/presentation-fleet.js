/**
 * Leader-node fleet client — SoftAP hub at 192.168.4.1 by default.
 * HTTP fleet API proxied via presentation-server.js on localhost (CORS).
 * WebSocket connects directly to hub (no CORS restriction).
 */

export const DEFAULT_HUB_IP = '192.168.4.1';

const DEMO_PATTERNS = [
    { id: 'Pulse', label: 'Pulse' },
    { id: 'Heartbeat', label: 'Heartbeat' },
    { id: 'Rumble', label: 'Rumble' },
    { id: 'Tap', label: 'Tap' },
    { id: 'Breath', label: 'Breath' }
];

let hubIp = DEFAULT_HUB_IP;
let connected = false;
let demoMode = true;
let lastFleetData = null;
let pollTimer = null;
let ws = null;
let telemetryAmp = 0;
let statusListeners = [];

function params() {
    return new URLSearchParams(window.location.search);
}

function useLocalProxy() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
}

function fleetUrl() {
    if (useLocalProxy()) return '/api/fleet';
    return `http://${hubIp}/json/fleet`;
}

function wsUrl() {
    return `ws://${hubIp}/ws`;
}

export function getHubIp() {
    return hubIp;
}

export function isFleetConnected() {
    return connected && !demoMode;
}

export function isDemoMode() {
    return demoMode;
}

export function getLastFleetData() {
    return lastFleetData;
}

export function getTelemetryAmp() {
    return telemetryAmp;
}

export function getDemoPatterns() {
    return DEMO_PATTERNS;
}

export function onFleetStatusChange(fn) {
    statusListeners.push(fn);
    return () => {
        statusListeners = statusListeners.filter(f => f !== fn);
    };
}

function notifyStatus() {
    const summary = formatFleetSummary();
    statusListeners.forEach(fn => fn({ connected, demoMode, summary, lastFleetData, telemetryAmp }));
}

export function formatFleetSummary() {
    if (!lastFleetData) return demoMode ? 'DEMO MODE' : 'NO DATA';
    const nodes = lastFleetData.nodes || [];
    const online = nodes.filter(n => n.online).length;
    const claimed = nodes.filter(n => n.claimed).length;
    return `${claimed}/${online} CLAIMED`;
}

export async function fleetPost(body) {
    if (demoMode) {
        console.log('[fleet demo]', body);
        return { ok: true, demo: true };
    }
    const r = await fetch(fleetUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('fleet HTTP ' + r.status);
    const data = await r.json();
    if (data.fleet) lastFleetData = data.fleet;
    notifyStatus();
    return data;
}

export async function refreshFleet() {
    if (demoMode) return lastFleetData;
    try {
        const r = await fetch(fleetUrl());
        if (!r.ok) throw new Error('fleet GET ' + r.status);
        lastFleetData = await r.json();
        connected = true;
        demoMode = false;
        notifyStatus();
        return lastFleetData;
    } catch (err) {
        connected = false;
        demoMode = true;
        notifyStatus();
        return null;
    }
}

export async function fleetEstop() {
    if (demoMode) {
        if (navigator.vibrate) navigator.vibrate(0);
        return;
    }
    await fleetPost({ action: 'estop' });
}

export async function fleetClaimAll() {
    return fleetPost({ action: 'claim' });
}

export async function fleetReleaseAll() {
    return fleetPost({ action: 'release' });
}

export async function sendFleetState(extra = {}) {
    const intensityEl = document.getElementById('fleetIntensity');
    const patternEl = document.getElementById('fleetPattern');
    const intensity = intensityEl ? Number(intensityEl.value) / 255 : 0.59;
    const pattern = patternEl ? patternEl.value : 'Breath';
    return fleetPost({
        action: 'state',
        patch: { intensity, pattern, ...extra }
    });
}

export async function applyFleetPattern(patternId, intensity = 0.7) {
    return fleetPost({
        action: 'state',
        patch: { pattern: patternId, intensity, on: true, mute: false }
    });
}

export async function fleetPlay() {
    return sendFleetState({ on: true, mute: false });
}

export async function fleetStop() {
    return sendFleetState({ on: false, mute: true });
}

function connectWebSocket() {
    if (ws) {
        try { ws.close(); } catch (_) { /* ignore */ }
    }
    try {
        ws = new WebSocket(wsUrl(), 'haxel.v1');
        ws.addEventListener('open', () => {
            connected = true;
            notifyStatus();
        });
        ws.addEventListener('message', (ev) => {
            try {
                const m = JSON.parse(ev.data);
                if (m.type === 'state' && m.data) {
                    if (typeof m.data.amp === 'number') telemetryAmp = m.data.amp;
                    else if (typeof m.data.smoothedAmp === 'number') telemetryAmp = m.data.smoothedAmp;
                    notifyStatus();
                }
            } catch (_) { /* ignore */ }
        });
        ws.addEventListener('close', () => {
            connected = false;
            notifyStatus();
            setTimeout(connectWebSocket, 3000);
        });
        ws.addEventListener('error', () => {
            connected = false;
            notifyStatus();
        });
    } catch (_) {
        connected = false;
        notifyStatus();
    }
}

export function disconnectFleet() {
    clearInterval(pollTimer);
    pollTimer = null;
    if (ws) {
        try { ws.close(); } catch (_) { /* ignore */ }
        ws = null;
    }
    connected = false;
    demoMode = true;
    notifyStatus();
}

export function initFleet(options = {}) {
    hubIp = params().get('hub') || options.hubIp || DEFAULT_HUB_IP;
    const pollFast = options.fastPoll || false;
    const interval = pollFast ? 2000 : 10000;

    refreshFleet().then(() => {
        if (!demoMode) connectWebSocket();
    });

    clearInterval(pollTimer);
    pollTimer = setInterval(refreshFleet, interval);

    return { hubIp, useLocalProxy: useLocalProxy() };
}

export function setFleetPollInterval(ms) {
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshFleet, ms);
}

export function drawMiniWave(canvas, history) {
    if (!canvas || !history?.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 160;
    const h = canvas.clientHeight || 36;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f4ebd0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
        const x = (i / (history.length - 1)) * w;
        const y = h - 2 - history[i] * (h - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

export function renderFleetCards(container, data) {
    if (!container) return;
    const nodes = data?.nodes || [];
    container.innerHTML = '';
    if (!nodes.length) {
        container.innerHTML = '<div class="fleet-empty">No followers detected. Join SoftAP and power on mesh nodes.</div>';
        return;
    }
    nodes.forEach(n => {
        const card = document.createElement('div');
        card.className = 'fleet-card';
        const status = n.online ? (n.claimed ? 'CLAIMED' : 'ONLINE') : 'OFFLINE';
        const color = n.online ? (n.claimed ? '#002f6c' : '#e23b24') : '#666';
        const hist = n.ampHistory || [n.lastAmp || 0];
        card.innerHTML = `
            <div class="fleet-card-head">
                <span class="fleet-dot" style="background:${color}"></span>
                <strong>${n.name || n.mac || 'Node'}</strong>
                <span class="fleet-status">${status}</span>
            </div>
            <canvas class="fleet-wave" height="36"></canvas>
        `;
        const canvas = card.querySelector('.fleet-wave');
        drawMiniWave(canvas, hist);
        container.appendChild(card);
    });
}
