// --- WebSocket ---
let ws = null;
let wsConnected = false;
let reconnectTimer = null;

function connectWebSocket() {
    const host = window.location.hostname || 'WFL.local';
    ws = new WebSocket(`ws://${host}/ws`);

    ws.onopen = () => {
        wsConnected = true;
        updateStatus('Connected', 'connected');
        loadPatterns();
        loadSettings();
    };

    ws.onclose = () => {
        wsConnected = false;
        updateStatus('Disconnected', 'error');
        reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        updateStatus('Error', 'error');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (e) {
            console.error('WS parse error:', e);
        }
    };
}

function handleMessage(data) {
    if (data.type === 'compile') {
        const indicator = document.getElementById('compile-status');
        indicator.className = 'status-indicator ' + (data.success ? 'success' : 'error');
    }
    else if (data.type === 'patterns') {
        // data.list is already an array (parsed by JSON.parse on the whole message)
        renderPatterns(data.list);
    }
    else if (data.type === 'loaded') {
        document.getElementById('pattern-name').value = data.name;
        document.getElementById('code-editor').value = data.code;
        updateLineNumbers();
        switchTab('editor');
    }
}

function send(obj) {
    if (ws && wsConnected) {
        ws.send(JSON.stringify(obj));
    }
}

function updateStatus(text, className) {
    const tag = document.getElementById('status-tag');
    tag.textContent = text;
    tag.className = 'tag ' + className;
}

// --- Tab Navigation ---
const navButtons = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tabId) {
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    tabContents.forEach(tab => tab.classList.toggle('active', tab.id === tabId));

    if (tabId === 'picker') {
        initColorWheel();
    }
}

// --- Pattern Library ---
async function loadPatterns() {
    try {
        const res = await fetch('/api/patterns');
        const patterns = await res.json();
        renderPatterns(patterns);
    } catch (e) {
        console.error('Failed to load patterns:', e);
    }
}

function renderPatterns(patterns) {
    const container = document.getElementById('pattern-list');

    if (!patterns || patterns.length === 0) {
        container.innerHTML = `<div class="pattern-card empty"><p>No patterns saved yet</p></div>`;
        return;
    }

    container.innerHTML = patterns.map(name => `
        <div class="pattern-card" onclick="loadPatternByName('${name}')">
            <h3>${name}</h3>
            <p>Click to load</p>
        </div>
    `).join('');
}

function loadPatternByName(name) {
    send({ action: 'load', name: name });
}

function newPattern() {
    document.getElementById('pattern-name').value = 'New Pattern';
    document.getElementById('code-editor').value = `// New pattern
h = index / pixelCount + time * 0.2;
hsv(h, 1, 1);`;
    updateLineNumbers();
    switchTab('editor');
}

// --- Editor ---
const codeEditor = document.getElementById('code-editor');
let liveDebounce = null;

codeEditor.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(liveDebounce);
    liveDebounce = setTimeout(() => {
        send({ action: 'live', code: codeEditor.value });
    }, 300);
});

codeEditor.addEventListener('scroll', () => {
    document.getElementById('line-numbers').scrollTop = codeEditor.scrollTop;
});

codeEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end = codeEditor.selectionEnd;
        codeEditor.value = codeEditor.value.substring(0, start) + '  ' + codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
    }
});

function updateLineNumbers() {
    const lines = codeEditor.value.split('\n').length;
    const nums = [];
    for (let i = 1; i <= lines; i++) nums.push(i);
    document.getElementById('line-numbers').innerHTML = nums.join('<br>');
}

function savePattern() {
    const name = document.getElementById('pattern-name').value.trim() || 'Untitled';
    const code = codeEditor.value;
    send({ action: 'save', name: name, code: code });

    // Visual feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Saved!';
    setTimeout(() => btn.textContent = originalText, 1500);
}

// --- Color Picker ---
let colorWheelCanvas = null;
let colorWheelCtx = null;
let pickerH = 0, pickerS = 1, pickerV = 1;

function initColorWheel() {
    colorWheelCanvas = document.getElementById('color-wheel');
    colorWheelCtx = colorWheelCanvas.getContext('2d');
    drawColorWheel();
    updateColorPreview();

    // Sliders
    document.getElementById('hue-slider').addEventListener('input', onSliderChange);
    document.getElementById('sat-slider').addEventListener('input', onSliderChange);
    document.getElementById('val-slider').addEventListener('input', onSliderChange);

    // Canvas click
    colorWheelCanvas.addEventListener('click', onWheelClick);
    colorWheelCanvas.addEventListener('mousemove', (e) => {
        if (e.buttons === 1) onWheelClick(e);
    });
}

function drawColorWheel() {
    const ctx = colorWheelCtx;
    const size = colorWheelCanvas.width;
    const center = size / 2;
    const radius = center - 5;

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius) {
                const angle = Math.atan2(dy, dx);
                const h = (angle + Math.PI) / (2 * Math.PI);
                const s = dist / radius;
                const v = pickerV;

                const rgb = hsvToRgb(h, s, v);
                const idx = (y * size + x) * 4;
                data[idx] = rgb.r;
                data[idx + 1] = rgb.g;
                data[idx + 2] = rgb.b;
                data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function onWheelClick(e) {
    const rect = colorWheelCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const center = colorWheelCanvas.width / 2;
    const radius = center - 5;

    const dx = x - center;
    const dy = y - center;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
        const angle = Math.atan2(dy, dx);
        pickerH = (angle + Math.PI) / (2 * Math.PI);
        pickerS = Math.min(1, dist / radius);

        document.getElementById('hue-slider').value = pickerH;
        document.getElementById('sat-slider').value = pickerS;

        updateColorPreview();
        updateCursor(x, y);
    }
}

function onSliderChange() {
    pickerH = parseFloat(document.getElementById('hue-slider').value);
    pickerS = parseFloat(document.getElementById('sat-slider').value);
    pickerV = parseFloat(document.getElementById('val-slider').value);

    document.getElementById('hue-value').textContent = Math.round(pickerH * 360) + '°';
    document.getElementById('sat-value').textContent = Math.round(pickerS * 100) + '%';
    document.getElementById('val-value').textContent = Math.round(pickerV * 100) + '%';

    drawColorWheel();
    updateColorPreview();
    updateCursorFromHSV();
}

function updateCursor(x, y) {
    const cursor = document.getElementById('color-cursor');
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
}

function updateCursorFromHSV() {
    const center = colorWheelCanvas.width / 2;
    const radius = (center - 5) * pickerS;
    const angle = pickerH * 2 * Math.PI - Math.PI;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    updateCursor(x, y);
}

function updateColorPreview() {
    const rgb = hsvToRgb(pickerH, pickerS, pickerV);
    document.getElementById('color-swatch').style.background =
        `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function applyPickedColor() {
    send({ action: 'setColor', h: pickerH, s: pickerS, v: pickerV });
}

// Global brightness
document.getElementById('global-brightness').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('brightness-value').textContent = Math.round(val / 255 * 100) + '%';
    send({ action: 'brightness', value: val });
});

// --- Settings ---
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        document.getElementById('setting-ssid').value = data.ssid || '';
        document.getElementById('setting-hostname').value = data.hostname || 'WFL';
        document.getElementById('setting-count').value = data.count || 30;
        document.getElementById('setting-pin').value = data.pin || 2;
        document.getElementById('global-brightness').value = data.brightness || 128;
        document.getElementById('brightness-value').textContent = Math.round((data.brightness || 128) / 255 * 100) + '%';
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const params = new URLSearchParams(form);

    try {
        await fetch('/api/settings', { method: 'POST', body: params });
        alert('Settings saved! Device will reboot...');
        await fetch('/api/reboot', { method: 'POST' });
    } catch (err) {
        alert('Failed to save settings');
    }
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    updateLineNumbers();
    connectWebSocket();
});
