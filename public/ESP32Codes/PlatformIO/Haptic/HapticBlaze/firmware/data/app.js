// HapticBlaze portal — vanilla JS SPA, served from LittleFS.

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const State = { patterns: [], state: null, cfg: null, diag: null };

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// Optimistic: update local state immediately, then send to device.
function optimisticPatch(patch) {
  // Merge into local state instantly for snappy UI.
  if (State.state) {
    if ('on' in patch) State.state.on = patch.on;
    if ('mute' in patch) State.state.mute = patch.mute;
    if ('intensity' in patch) State.state.intensity = patch.intensity;
    if ('speed' in patch) State.state.speed = patch.speed;
    if ('pattern' in patch) State.state.pattern = patch.pattern;
  }
  renderAll();
  // Fire-and-forget to device. WS broadcast will confirm/correct.
  api('/json/state', { method: 'POST', body: JSON.stringify(patch) }).catch(() => {});
}
const saveConfig = (p) => api('/json/config', { method: 'POST', body: JSON.stringify(p) });

// ---------- Throttle utility ----------
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

// ---------- routing ----------
function route() {
  let tab = (location.hash.replace('#/', '') || 'play');
  // Redirect old library hash to play.
  if (tab === 'library') { location.hash = '#/play'; return; }
  $$('[data-view]').forEach(el => el.hidden = el.dataset.view !== tab);
  $$('.tabbar a').forEach(a => a.setAttribute('aria-selected', a.dataset.tab === tab ? 'true' : 'false'));
  if (tab === 'device')  refreshDiag();
  if (tab === 'setup')   renderSetup();
  if (tab === 'play')    renderPlayGrid();
}
window.addEventListener('hashchange', route);

// ---------- play (merged with library) ----------
function renderPlayGrid() {
  const q = ($('#patternSearch')?.value || '').toLowerCase();
  const grid = $('#pattern-grid');
  grid.innerHTML = '';
  const current = State.state && State.state.pattern;

  // Split into standard and audio-reactive.
  const standard = [];
  const reactive = [];
  for (const p of State.patterns) {
    const hay = (p.id + ' ' + p.category + ' ' + (p.tags || '') + ' ' + (p.description || '')).toLowerCase();
    if (q && !hay.includes(q)) continue;
    if (p.usesAudio) reactive.push(p);
    else standard.push(p);
  }

  // Render standard patterns.
  for (const p of standard) {
    grid.appendChild(makeTile(p, current, false));
  }

  // Reactive divider.
  if (reactive.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'reactive-divider';
    divider.innerHTML = '<span>🎵 Music Reactive</span>';
    grid.appendChild(divider);
    for (const p of reactive) {
      grid.appendChild(makeTile(p, current, true));
    }
  }

  renderParamsPanel();
}

function makeTile(p, current, isAudio) {
  const el = document.createElement('button');
  el.className = 'tile'
    + (p.id === current ? ' active' : '')
    + (isAudio ? ' audio-tile' : '');
  el.innerHTML = `<div class="playing-dot"></div><h3>${p.id}</h3><p>${p.category}</p>${p.description ? `<small>${p.description}</small>` : ''}`;
  el.onclick = () => optimisticPatch({ pattern: p.id, on: true });
  return el;
}

function renderParamsPanel() {
  const wrap = $('#paramsPanel');
  if (!wrap) return;
  const current = State.state && State.state.pattern;
  const meta = State.patterns.find(p => p.id === current);
  if (!meta || !meta.params || !meta.params.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.innerHTML = `<h3>${meta.id} params</h3>` + meta.params.map(pm => `
    <label>${pm.label}
      <input type="range" min="${pm.min}" max="${pm.max}" step="${(pm.max - pm.min) / 100}"
             value="${pm.default}" data-pid="${pm.id}" />
      <output>${pm.default}</output>
    </label>
  `).join('');
  $$('input[data-pid]', wrap).forEach(inp => {
    const throttledSend = throttle((val) => {
      optimisticPatch({ params: { [inp.dataset.pid]: val } });
    }, 100);
    inp.oninput = () => {
      inp.nextElementSibling.textContent = inp.value;
      throttledSend(parseFloat(inp.value));
    };
  });
}

function applyStatePill() {
  const pill = $('#status');
  const s = State.state || {};
  if (!s.on) { pill.textContent = 'Idle'; pill.dataset.state = 'idle'; return; }
  const usesAudio = (State.patterns.find(p => p.id === s.pattern) || {}).usesAudio;
  pill.textContent = usesAudio ? 'Audio-reactive' : 'Playing';
  pill.dataset.state = usesAudio ? 'audio' : 'playing';
}

// ---------- setup ----------
const DRIVER_SLOTS = {
  1: { name: 'L298N',        maxMotors: 2, slots: [[0,1,2],[3,4,5]],   labels: { speed:'Speed (ENA, optional)', fwd:'Forward (IN1)',  rev:'Backward (IN2)' } },
  2: { name: 'DRV8833',      maxMotors: 2, slots: [[-1,0,1],[-1,2,3]], labels: { speed:null, fwd:'Forward (AIN1)', rev:'Backward (AIN2)' } },
  3: { name: 'DRV2605L',     maxMotors: 1, slots: [[-1,0,-1]],         labels: { speed:null, fwd:'EN pin', rev:null } },
  4: { name: 'MOSFET',       maxMotors: 4, slots: [[-1,0,-1],[-1,1,-1],[-1,2,-1],[-1,3,-1]], labels: { speed:null, fwd:'Gate pin', rev:null } },
  5: { name: 'Mini H-Bridge',maxMotors: 2, slots: [[-1,0,1],[-1,2,3]], labels: { speed:null, fwd:'Forward (IN1 / AIN1)', rev:'Backward (IN2 / AIN2)' } },
};

const FALLBACK_GPIOS = [0,1,3,4,5,6,7,10,20,21];
let GPIO_LIST = FALLBACK_GPIOS.slice();

async function loadGpios() {
  try {
    const r = await api('/json/gpios');
    if (Array.isArray(r.available) && r.available.length) GPIO_LIST = r.available;
  } catch (e) {
    console.warn('gpios endpoint unavailable, using fallback', e.message);
  }
  return GPIO_LIST;
}

function gpioOptions(selected, includeNone) {
  const none = includeNone
    ? `<option value="-1"${selected < 0 ? ' selected' : ''}>— jumper / +5V —</option>`
    : `<option value="-1"${selected < 0 ? ' selected' : ''}>— none —</option>`;
  return none + GPIO_LIST.map(p =>
    `<option value="${p}"${p === selected ? ' selected' : ''}>GPIO ${p}</option>`).join('');
}

function renderMotorList(driverKind, pins) {
  const def = DRIVER_SLOTS[driverKind];
  const wrap = $('#motorList'); wrap.innerHTML = '';
  let motorCount = 0;
  for (let m = 0; m < def.maxMotors; m++) {
    const [s, f, b] = def.slots[m];
    const inUse =
      (s >= 0 && pins[s] >= 0) ||
      (f >= 0 && pins[f] >= 0) ||
      (b >= 0 && pins[b] >= 0);
    if (inUse) motorCount = m + 1;
  }
  if (motorCount === 0) motorCount = 1;
  for (let m = 0; m < motorCount; m++) addMotorCard(driverKind, m, pins);
  $('#btnAddMotor').style.display = motorCount < def.maxMotors ? '' : 'none';
}

function addMotorCard(driverKind, motorIdx, pins) {
  const def = DRIVER_SLOTS[driverKind];
  const [sSlot, fSlot, bSlot] = def.slots[motorIdx];
  const L = def.labels;

  const card = document.createElement('div');
  card.className = 'motor-card';
  card.dataset.motor = motorIdx;
  card.innerHTML = `
    <div class="motor-head">
      <strong>Motor ${motorIdx + 1}</strong>
      <button type="button" class="x" aria-label="Remove">×</button>
    </div>
    ${(fSlot >= 0 && L.fwd) ? `<label>${L.fwd}
      <select data-slot="${fSlot}">${gpioOptions(pins[fSlot] ?? -1, false)}</select></label>` : ''}
    ${(bSlot >= 0 && L.rev) ? `<label>${L.rev}
      <select data-slot="${bSlot}">${gpioOptions(pins[bSlot] ?? -1, false)}</select></label>` : ''}
    ${(sSlot >= 0 && L.speed) ? `<label>${L.speed}
      <select data-slot="${sSlot}">${gpioOptions(pins[sSlot] ?? -1, true)}</select></label>` : ''}
  `;
  card.querySelector('.x').onclick = () => {
    [sSlot, fSlot, bSlot].forEach(slot => { if (slot >= 0) currentPins[slot] = -1; });
    renderMotorList(parseInt($('#cfgDriver').value), currentPins);
  };
  card.querySelectorAll('select[data-slot]').forEach(sel => {
    sel.addEventListener('change', () => {
      currentPins[parseInt(sel.dataset.slot)] = parseInt(sel.value);
    });
  });
  $('#motorList').appendChild(card);
}

let currentPins = [-1,-1,-1,-1,-1,-1,-1,-1];

async function renderSetup() {
  await loadGpios();
  try { State.cfg = await api('/json/config'); } catch {}
  const cfg = State.cfg || { driver: { kind: 5, pins: [-1,-1,-1,-1,-1,-1,-1,-1], pwmHz: 20000 } };
  currentPins = (cfg.driver.pins && cfg.driver.pins.length === 8)
    ? cfg.driver.pins.slice()
    : [-1,-1,-1,-1,-1,-1,-1,-1];
  $('#cfgDriver').value = String(cfg.driver.kind);
  $('#cfgPwmHz').value  = cfg.driver.pwmHz || 20000;
  const stby = $('#cfgStandby');
  if (stby) stby.innerHTML = gpioOptions(currentPins[6] ?? -1, true);
  renderMotorList(cfg.driver.kind, currentPins);
}

$('#cfgDriver')?.addEventListener('change', () => {
  currentPins = [-1,-1,-1,-1,-1,-1,-1,-1];
  renderMotorList(parseInt($('#cfgDriver').value), currentPins);
});

$('#btnAddMotor')?.addEventListener('click', () => {
  const driverKind = parseInt($('#cfgDriver').value);
  const def = DRIVER_SLOTS[driverKind];
  const existing = $$('#motorList .motor-card').length;
  if (existing >= def.maxMotors) return;
  addMotorCard(driverKind, existing, currentPins);
  if (existing + 1 >= def.maxMotors) $('#btnAddMotor').style.display = 'none';
});

$('#btnSaveCfg')?.addEventListener('click', async () => {
  const stby = $('#cfgStandby');
  if (stby) currentPins[6] = parseInt(stby.value);
  const body = {
    driver: {
      kind:  parseInt($('#cfgDriver').value),
      pins:  currentPins.slice(),
      pwmHz: parseInt($('#cfgPwmHz').value),
    },
  };
  $('#cfgStatus').textContent = 'Saving + rebooting…';
  try { await saveConfig(body); }
  catch (e) { $('#cfgStatus').textContent = 'Failed: ' + e.message; return; }
  $('#cfgStatus').textContent = 'Saved. The device is rebooting — reconnect to Wi-Fi and refresh in ~6 seconds.';
});

$('#btnTestBuzz')?.addEventListener('click', async () => {
  $('#cfgStatus').textContent = 'Buzzing for 1.5s…';
  try {
    const r = await fetch('/json/buzz?ms=200&intensity=0.8', { method: 'POST' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    setTimeout(() => optimisticPatch({ on: false }), 1500);
    $('#cfgStatus').textContent = 'Sent. If you felt nothing: check that the driver is powered, GND is shared with the ESP32, and Save + Reboot was done after wiring changed.';
  } catch (e) {
    $('#cfgStatus').textContent = 'Buzz failed: ' + e.message;
  }
});

// ---------- device ----------
async function refreshDiag() {
  try {
    State.diag = await api('/json/diag');
    $('#diag').textContent = JSON.stringify(State.diag, null, 2);
  } catch (e) { $('#diag').textContent = 'diag unreachable: ' + e.message; }
}
$('#btnReboot')?.addEventListener('click', () => optimisticPatch({ reboot: true }));

// ---------- buttons ----------
$('#btnOn')   .addEventListener('click', () => optimisticPatch({ on: true }));
$('#btnOff')  .addEventListener('click', () => optimisticPatch({ on: false }));
$('#btnMute') .addEventListener('click', () => optimisticPatch({ mute: !(State.state && State.state.mute) }));

// Throttled sliders — send at most every 100ms.
const throttledIntensity = throttle(v => optimisticPatch({ intensity: v }), 100);
const throttledSpeed     = throttle(v => optimisticPatch({ speed: v }), 100);
$('#intensity').addEventListener('input', e => throttledIntensity(parseFloat(e.target.value)));
$('#speed')    .addEventListener('input', e => throttledSpeed(parseFloat(e.target.value)));

$('#patternSearch')?.addEventListener('input', renderPlayGrid);

// ---------- websocket ----------
function openWebSocket() {
  const wsInd = $('#ws-indicator');
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/ws`, 'hapticblaze.v1'); }
  catch { if (wsInd) wsInd.className = 'disconnected'; setTimeout(openWebSocket, 2000); return; }

  ws.addEventListener('open', () => {
    if (wsInd) wsInd.className = 'connected';
    ws.send(JSON.stringify({ type: 'subscribe', topics: ['state'] }));
  });
  ws.addEventListener('close', () => {
    if (wsInd) wsInd.className = 'disconnected';
    setTimeout(openWebSocket, 1500);
  });
  ws.addEventListener('error', () => {
    if (wsInd) wsInd.className = 'disconnected';
  });
  ws.addEventListener('message', ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === 'state' && m.data) {
        State.state = m.data;
        renderAll();
      }
    } catch {}
  });
}

function renderAll() {
  applyStatePill();
  if (!$('[data-view="play"]').hidden) renderPlayGrid();
}

(async function init() {
  try {
    const bundle = await api('/json');
    State.patterns = bundle.patterns || [];
    State.state    = bundle.state;
  } catch (e) {
    $('#status').textContent = 'Offline';
  }
  route();
  renderAll();
  openWebSocket();
})();
