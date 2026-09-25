import * as THREE from 'three';
import { AudioEngine } from '../shared/audio-engine.js';
import { ProjectionMapper } from '../shared/projection-mapper.js';
import { SHADER_DEFINITIONS } from '../shaders/shader-defs.js';
import { MidiController } from '../shared/midi-controller.js';

let renderer, scene, camera, mesh, material;
let audioEngine, projectionMapper, midiController;
let currentShaderIndex = 6;
let uniforms = {};

// Live DJ MIDI Runtime Variables
let visualTime = 0;
let tempoMultiplier = 1.0;
let jogTimeOffset = 0;
let isFrozen = false;
let strobeIntensity = 0;
let bassBombDecay = 0;
let bloomBombDecay = 0;
let raveHueCycle = false;
let crossfadeVal = 0.5;
let vjogAngle1 = 0;
let vjogAngle2 = 0;
let djFxOverlay = null;

// Default Settings Blueprint
const DEFAULT_SETTINGS = {
  global: {
    bassPunch: 0.4,
    trebleSparkle: 1.5,
    smoothing: 0.11,
    hueShift: 8 / 360,
    glowMult: 0.3
  },
  shaders: {}
};

// Populate default customParams per shader
SHADER_DEFINITIONS.forEach(shader => {
  DEFAULT_SETTINGS.shaders[shader.id] = {};
  if (shader.customParams) {
    shader.customParams.forEach(param => {
      DEFAULT_SETTINGS.shaders[shader.id][param.id] = param.default;
    });
  }
});

let tweakState = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const STORAGE_KEY = 'deaf_dj_shader_tweaks';

// UI Element References
const shaderTitleDisplay = document.getElementById('shader-title-display');
const barSub = document.getElementById('bar-sub');
const barBass = document.getElementById('bar-bass');
const barMid = document.getElementById('bar-mid');
const barHigh = document.getElementById('bar-high');
const barAir = document.getElementById('bar-air');
const clipWarning = document.getElementById('clipping-warning');
const shaderDock = document.getElementById('shader-dock');
const sliderGain = document.getElementById('slider-gain');
const gainVal = document.getElementById('gain-val');
const btnMic = document.getElementById('btn-mic');
const btnDemo = document.getElementById('btn-demo');
const audioFileInput = document.getElementById('audio-file-input');
const btnCalibrate = document.getElementById('btn-calibrate');
const btnFullscreen = document.getElementById('btn-fullscreen');
const startModal = document.getElementById('start-modal');
const modalBtnMic = document.getElementById('modal-btn-mic');
const modalBtnDemo = document.getElementById('modal-btn-demo');

// Drawer UI References
const tweakDrawer = document.getElementById('dj-tweak-drawer');
const btnTweak = document.getElementById('btn-tweak');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const activeShaderSectionTitle = document.getElementById('active-shader-section-title');
const shaderCustomControls = document.getElementById('shader-custom-controls');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnResetSettings = document.getElementById('btn-reset-settings');
const storageStatusMsg = document.getElementById('storage-status-msg');

// Global Slider Elements
const paramBassPunch = document.getElementById('param-bass-punch');
const valBassPunch = document.getElementById('val-bass-punch');
const paramTrebleSparkle = document.getElementById('param-treble-sparkle');
const valTrebleSparkle = document.getElementById('val-treble-sparkle');
const paramSmoothing = document.getElementById('param-smoothing');
const valSmoothing = document.getElementById('val-smoothing');
const paramHueShift = document.getElementById('param-hue-shift');
const valHueShift = document.getElementById('val-hue-shift');
const paramGlowMult = document.getElementById('param-glow-mult');
const valGlowMult = document.getElementById('val-glow-mult');

// MIDI HUD & Studio References
const btnMidi = document.getElementById('btn-midi');
const midiBtnText = document.getElementById('midi-btn-text');
const midiLed = document.getElementById('midi-led');
const midiStudioDrawer = document.getElementById('midi-studio-drawer');
const btnCloseMidi = document.getElementById('btn-close-midi');
const btnMidiRescan = document.getElementById('btn-midi-rescan');
const btnMidiLearn = document.getElementById('btn-midi-learn');
const btnCancelLearn = document.getElementById('btn-cancel-learn');
const midiLearnBanner = document.getElementById('midi-learn-banner');
const btnResetMidiMap = document.getElementById('btn-reset-midi-map');
const btnClearTerm = document.getElementById('btn-clear-term');
const midiStatusPill = document.getElementById('midi-status-pill');
const deviceNameDisplay = document.getElementById('device-name-display');
const vjogInd1 = document.getElementById('vjog-ind-1');
const vjogInd2 = document.getElementById('vjog-ind-2');
const vjog1 = document.getElementById('vjog-1');
const vjog2 = document.getElementById('vjog-2');
const vthumbCrossfader = document.getElementById('vthumb-crossfader');
const cfValDisplay = document.getElementById('cf-val-display');

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      tweakState = {
        global: { ...DEFAULT_SETTINGS.global, ...parsed.global },
        shaders: { ...DEFAULT_SETTINGS.shaders, ...parsed.shaders }
      };
    }
  } catch (err) {
    console.warn('Could not load settings from localStorage, using defaults', err);
    tweakState = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  updateGlobalSlidersUI();
}

function saveSettings(notify = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tweakState));
    if (notify && storageStatusMsg) {
      storageStatusMsg.textContent = 'SETTINGS SAVED TO LOCALSTORAGE';
      storageStatusMsg.style.color = '#00e5ff';
      setTimeout(() => {
        if (storageStatusMsg) storageStatusMsg.textContent = 'ALL SETTINGS PERSISTENT';
      }, 2000);
    }
  } catch (err) {
    console.error('Failed to save to localStorage', err);
  }
}

function restoreDefaults() {
  tweakState = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  saveSettings(false);
  updateGlobalSlidersUI();
  renderActiveShaderControls();
  applySettingsToUniforms();
  if (storageStatusMsg) {
    storageStatusMsg.textContent = 'DEFAULTS RESTORED';
    storageStatusMsg.style.color = '#ff3366';
    setTimeout(() => {
      if (storageStatusMsg) storageStatusMsg.textContent = 'ALL SETTINGS PERSISTENT';
    }, 2000);
  }
}

function updateGlobalSlidersUI() {
  if (!paramBassPunch) return;
  const g = tweakState.global;
  paramBassPunch.value = g.bassPunch;
  valBassPunch.textContent = `${Number(g.bassPunch).toFixed(1)}x`;

  paramTrebleSparkle.value = g.trebleSparkle;
  valTrebleSparkle.textContent = `${Number(g.trebleSparkle).toFixed(1)}x`;

  paramSmoothing.value = g.smoothing;
  valSmoothing.textContent = Number(g.smoothing).toFixed(2);

  paramHueShift.value = g.hueShift;
  const deg = Math.round(g.hueShift * 360);
  valHueShift.textContent = `+${deg}°`;

  paramGlowMult.value = g.glowMult;
  valGlowMult.textContent = `${Number(g.glowMult).toFixed(1)}x`;
}

function applySettingsToUniforms() {
  if (!uniforms) return;
  const g = tweakState.global;

  if (uniforms.u_bassPunch) uniforms.u_bassPunch.value = g.bassPunch;
  if (uniforms.u_trebleSparkle) uniforms.u_trebleSparkle.value = g.trebleSparkle;
  if (uniforms.u_hueOffset) uniforms.u_hueOffset.value = g.hueShift;
  if (uniforms.u_glowMultiplier) uniforms.u_glowMultiplier.value = g.glowMult;

  // Update AudioEngine smoothing
  if (audioEngine) {
    // smoothing in audio-engine is the lerp factor
    audioEngine.smoothFactor = g.smoothing;
  }

  // Update Shader Specific Uniforms
  const curShader = SHADER_DEFINITIONS[currentShaderIndex];
  if (curShader && curShader.customParams) {
    const shaderSettings = tweakState.shaders[curShader.id] || {};
    curShader.customParams.forEach(param => {
      const uniformName = `u_${param.id}`;
      const val = shaderSettings[param.id] !== undefined ? shaderSettings[param.id] : param.default;
      if (!uniforms[uniformName]) {
        uniforms[uniformName] = { value: val };
      } else {
        uniforms[uniformName].value = val;
      }
    });
  }
}

function renderActiveShaderControls() {
  if (!shaderCustomControls) return;
  const curShader = SHADER_DEFINITIONS[currentShaderIndex];
  activeShaderSectionTitle.textContent = `${curShader.title} TUNER`;
  shaderCustomControls.innerHTML = '';

  if (!curShader.customParams || curShader.customParams.length === 0) {
    shaderCustomControls.innerHTML = '<div style="font-size:0.75rem; color:#666; padding:8px 0;">No custom parameters for this shader.</div>';
    return;
  }

  if (!tweakState.shaders[curShader.id]) {
    tweakState.shaders[curShader.id] = {};
  }

  curShader.customParams.forEach(param => {
    const currentVal = tweakState.shaders[curShader.id][param.id] !== undefined
      ? tweakState.shaders[curShader.id][param.id]
      : param.default;

    const row = document.createElement('div');
    row.className = 'tweak-row';

    const labelGroup = document.createElement('div');
    labelGroup.className = 'tweak-label-group';

    const label = document.createElement('span');
    label.className = 'tweak-label';
    label.textContent = param.name;

    const valDisplay = document.createElement('span');
    valDisplay.className = 'tweak-val';
    valDisplay.textContent = `${Number(currentVal).toFixed(1)}${param.unit || ''}`;

    labelGroup.appendChild(label);
    labelGroup.appendChild(valDisplay);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = param.min;
    input.max = param.max;
    input.step = param.step;
    input.value = currentVal;

    input.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.shaders[curShader.id][param.id] = v;
      valDisplay.textContent = `${v.toFixed(1)}${param.unit || ''}`;
      applySettingsToUniforms();
      saveSettings(false); // autosave
    });

    row.appendChild(labelGroup);
    row.appendChild(input);
    shaderCustomControls.appendChild(row);
  });
}


function initThree() {
  const container = document.getElementById('canvas-container');
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Setup Base Uniforms & Custom Param Uniforms
  uniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(w, h) },
    u_subBass: { value: 0.0 },
    u_bass: { value: 0.0 },
    u_lowMid: { value: 0.0 },
    u_mid: { value: 0.0 },
    u_highMid: { value: 0.0 },
    u_high: { value: 0.0 },
    u_air: { value: 0.0 },
    u_energy: { value: 0.0 },
    u_transient: { value: 0.0 },
    u_isClipping: { value: 0.0 },
    u_primaryColor: { value: new THREE.Vector3(1.0, 0.0, 0.2) },
    u_secondaryColor: { value: new THREE.Vector3(0.6, 0.0, 1.0) },
    // Global Tweaks
    u_hueOffset: { value: tweakState.global.hueShift },
    u_bassPunch: { value: tweakState.global.bassPunch },
    u_trebleSparkle: { value: tweakState.global.trebleSparkle },
    u_glowMultiplier: { value: tweakState.global.glowMult },
    // Cymatics Custom Uniforms
    u_harmonicScale: { value: 1.0 },
    u_spinSpeed: { value: 1.0 },
    u_rippleDepth: { value: 1.0 },
    u_lineSharpness: { value: 1.0 },
    u_sandDensity: { value: 1.0 }
  };

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  // Plane geometry filling the orthographic view
  const geometry = new THREE.PlaneGeometry(2, 2);
  material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: SHADER_DEFINITIONS[currentShaderIndex].fragmentShader,
    uniforms
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  window.addEventListener('resize', onWindowResize);
  applySettingsToUniforms();
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  uniforms.u_resolution.value.set(w, h);
}

function setShader(index) {
  if (index < 0 || index >= SHADER_DEFINITIONS.length) return;
  currentShaderIndex = index;
  const def = SHADER_DEFINITIONS[index];

  // Update Material Fragment Shader
  material.fragmentShader = def.fragmentShader;
  material.needsUpdate = true;

  // Update HUD
  if (shaderTitleDisplay) {
    shaderTitleDisplay.textContent = def.title;
  }

  // Update Dock Active Class
  const buttons = shaderDock.querySelectorAll('.shader-tab-btn');
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === index);
  });

  // Re-render Dynamic Custom Parameters for this Shader
  renderActiveShaderControls();
  applySettingsToUniforms();
}

function buildShaderDock() {
  shaderDock.innerHTML = '';
  SHADER_DEFINITIONS.forEach((def, index) => {
    const btn = document.createElement('button');
    btn.className = `shader-tab-btn ${index === currentShaderIndex ? 'active' : ''}`;
    const hotkeyNum = (index + 1) % 10; // 1 to 9, then 0 for 10
    btn.innerHTML = `
      <span class="hotkey">[${hotkeyNum}]</span>
      <span class="tab-name">${def.title.split(' ')[0]}</span>
    `;
    btn.addEventListener('click', () => setShader(index));
    shaderDock.appendChild(btn);
  });
}

function toggleTweakDrawer(open = null) {
  if (!tweakDrawer) return;
  const shouldOpen = open !== null ? open : !tweakDrawer.classList.contains('open');
  tweakDrawer.classList.toggle('open', shouldOpen);
  if (btnTweak) btnTweak.classList.toggle('active', shouldOpen);
  if (shouldOpen && midiStudioDrawer && midiStudioDrawer.classList.contains('open')) {
    toggleMidiStudioDrawer(false);
  }
}

function toggleMidiStudioDrawer(open = null) {
  if (!midiStudioDrawer) return;
  const shouldOpen = open !== null ? open : !midiStudioDrawer.classList.contains('open');
  midiStudioDrawer.classList.toggle('open', shouldOpen);
  if (btnMidi) btnMidi.classList.toggle('active', shouldOpen);
  if (shouldOpen && tweakDrawer && tweakDrawer.classList.contains('open')) {
    toggleTweakDrawer(false);
  }
}

// ---------------------------------------------------------------------------
// Real-Time MIDI OSD Telemetry
// ---------------------------------------------------------------------------
let osdTimeout = null;
function showMidiOsd(data) {
  const osd = document.getElementById('midi-osd');
  const osdEventTag = document.getElementById('osd-event-tag');
  const osdChannel = document.getElementById('osd-channel');
  const osdLabel = document.getElementById('osd-label');
  const osdAction = document.getElementById('osd-action');
  const osdVal = document.getElementById('osd-val');
  const osdGaugeFill = document.getElementById('osd-gauge-fill');

  if (!osd) return;

  if (osdEventTag) osdEventTag.textContent = data.eventKey || '';
  if (osdChannel) osdChannel.textContent = `CH ${data.channel !== undefined ? data.channel + 1 : 1}`;
  if (osdLabel) osdLabel.textContent = data.label || 'CONTROL';
  if (osdAction) osdAction.textContent = data.action || '';
  if (osdVal) osdVal.textContent = data.valText || '';
  if (osdGaugeFill) {
    const pct = Math.min(100, Math.max(0, (data.normalized !== undefined ? data.normalized : 0.5) * 100));
    osdGaugeFill.style.width = `${pct}%`;
  }

  osd.classList.add('visible');
  clearTimeout(osdTimeout);
  osdTimeout = setTimeout(() => {
    osd.classList.remove('visible');
  }, 1600);
}

// ---------------------------------------------------------------------------
// MIDI Terminal Console Logger
// ---------------------------------------------------------------------------
function logMidiConsole(type, text) {
  const consoleLog = document.getElementById('midi-console-log');
  if (!consoleLog) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const now = new Date();
  const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  line.textContent = `[${timeStr}] ${text}`;
  consoleLog.appendChild(line);

  if (consoleLog.children.length > 120) {
    consoleLog.removeChild(consoleLog.firstChild);
  }

  const chkAutoscroll = document.getElementById('chk-autoscroll');
  if (chkAutoscroll && chkAutoscroll.checked) {
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Virtual Deck UI Synchronization
// ---------------------------------------------------------------------------
function updateVirtualKnob(id, normalized, valText) {
  const fill = document.getElementById(`vfill-${id}`);
  const val = document.getElementById(`vval-${id}`);
  if (fill) fill.style.height = `${Math.round(normalized * 100)}%`;
  if (val && valText) val.textContent = valText;
}

function updateVirtualFader(deck, normalized, valText) {
  const thumb = document.getElementById(`vthumb-fader-${deck}`);
  const val = document.getElementById(`vval-fader-${deck}`);
  if (thumb) thumb.style.left = `${Math.round(normalized * 85)}%`;
  if (val && valText) val.textContent = valText;
}

function updateVirtualCrossfader(normalized) {
  if (vthumbCrossfader) {
    vthumbCrossfader.style.left = `${Math.round(normalized * 100)}%`;
  }
  if (cfValDisplay) {
    const pct = Math.round(normalized * 100);
    cfValDisplay.textContent = pct === 50 ? 'CENTER (50/50)' : (pct < 50 ? `DECK A (${100 - pct}%)` : `DECK B (${pct}%)`);
  }
}

function updateJogWheelVisual(deck, angle) {
  const jog = document.getElementById(`vjog-${deck}`);
  const ind = document.getElementById(`vjog-ind-${deck}`);
  if (jog) {
    jog.classList.add('scratching');
    clearTimeout(jog._scratchTimeout);
    jog._scratchTimeout = setTimeout(() => jog.classList.remove('scratching'), 150);
  }
  if (ind) {
    ind.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(-38px)`;
  }
}

// ---------------------------------------------------------------------------
// Live DJ Performance FX Triggers
// ---------------------------------------------------------------------------
function triggerStrobe() {
  if (!djFxOverlay) djFxOverlay = document.getElementById('dj-fx-overlay');
  if (djFxOverlay) {
    djFxOverlay.classList.add('strobe');
    strobeIntensity = 1.0;
  }
  logMidiConsole('note', '[FX TRIGGER] ⚡ WHITE STROBE BURST ACTIVATED');
}

function triggerInvert(active) {
  if (!djFxOverlay) djFxOverlay = document.getElementById('dj-fx-overlay');
  if (djFxOverlay) {
    djFxOverlay.classList.toggle('invert', active);
  }
  logMidiConsole('note', `[FX TRIGGER] INVERT X-RAY: ${active ? 'HOLD ACTIVE' : 'RELEASED'}`);
}

function triggerGlitch(active) {
  if (!djFxOverlay) djFxOverlay = document.getElementById('dj-fx-overlay');
  if (djFxOverlay) {
    djFxOverlay.classList.toggle('glitch', active);
  }
  logMidiConsole('note', `[FX TRIGGER] CHROMATIC GLITCH WARP: ${active ? 'HOLD ACTIVE' : 'RELEASED'}`);
}

function triggerFreeze(active) {
  isFrozen = active;
  logMidiConsole('note', `[FX TRIGGER] FREEZE FRAME: ${active ? 'TIME FROZEN' : 'RESUMED'}`);
}

function triggerBassBomb() {
  bassBombDecay = 2.0;
  logMidiConsole('note', '[FX TRIGGER] 💣 BASS BOMB SLAM: 3.0x SUB-PUNCH PEAK');
}

function toggleRaveCycle() {
  raveHueCycle = !raveHueCycle;
  logMidiConsole('note', `[FX TRIGGER] 🌈 NEON RAVE CYCLE: ${raveHueCycle ? 'LOOPING' : 'STOPPED'}`);
}

function triggerBloomFlare() {
  bloomBombDecay = 1.8;
  logMidiConsole('note', '[FX TRIGGER] ✦ BLOOM OVERDRIVE FLARE');
}

function triggerSpeedRush(active) {
  tempoMultiplier = active ? 2.5 : 1.0;
  logMidiConsole('note', `[FX TRIGGER] ⚡ SPEED RUSH: ${active ? '2.5x HYPER-TEMPO' : '1.0x NORMAL'}`);
}

// ---------------------------------------------------------------------------
// Populate Virtual Performance Pads
// ---------------------------------------------------------------------------
const DECK_2_FX_DEFS = [
  { name: 'STROBE', sub: 'BURST', fnDown: () => triggerStrobe(), fnUp: null },
  { name: 'INVERT', sub: 'X-RAY', fnDown: () => triggerInvert(true), fnUp: () => triggerInvert(false) },
  { name: 'GLITCH', sub: 'RGB SPLIT', fnDown: () => triggerGlitch(true), fnUp: () => triggerGlitch(false) },
  { name: 'FREEZE', sub: 'TIME STOP', fnDown: () => triggerFreeze(true), fnUp: () => triggerFreeze(false) },
  { name: 'BASS BOMB', sub: 'MAX PUNCH', fnDown: () => triggerBassBomb(), fnUp: null },
  { name: 'RAVE', sub: 'HUE CYCLE', fnDown: () => toggleRaveCycle(), fnUp: null },
  { name: 'BLOOM', sub: 'FLARE', fnDown: () => triggerBloomFlare(), fnUp: null },
  { name: 'SPEED', sub: '2.5X RUSH', fnDown: () => triggerSpeedRush(true), fnUp: () => triggerSpeedRush(false) }
];

function populateVirtualPads() {
  const containerDeck1 = document.getElementById('vpads-deck-1');
  const containerDeck2 = document.getElementById('vpads-deck-2');

  // Deck 1: Shaders 1-8
  if (containerDeck1) {
    containerDeck1.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const shader = SHADER_DEFINITIONS[i];
      const btn = document.createElement('button');
      btn.className = `vpad-btn ${i === currentShaderIndex ? 'active' : ''}`;
      btn.id = `vpad-1-${i + 1}`;
      btn.innerHTML = `
        <span class="vpad-num">#${i + 1}</span>
        <span>${shader ? shader.title.split(' ')[0] : `SHADER ${i + 1}`}</span>
      `;
      btn.addEventListener('click', () => {
        setShader(i);
        highlightVirtualPad(1, i, true);
        setTimeout(() => highlightVirtualPad(1, i, false), 300);
      });
      containerDeck1.appendChild(btn);
    }
  }

  // Deck 2: Live FX Triggers
  if (containerDeck2) {
    containerDeck2.innerHTML = '';
    DECK_2_FX_DEFS.forEach((fx, i) => {
      const btn = document.createElement('button');
      btn.className = 'vpad-btn';
      btn.id = `vpad-2-${i + 1}`;
      btn.innerHTML = `
        <span class="vpad-num">FX ${i + 1}</span>
        <span>${fx.name}</span>
      `;
      btn.addEventListener('mousedown', () => {
        fx.fnDown();
        btn.classList.add('active');
      });
      btn.addEventListener('mouseup', () => {
        if (fx.fnUp) fx.fnUp();
        btn.classList.remove('active');
      });
      btn.addEventListener('mouseleave', () => {
        if (fx.fnUp) fx.fnUp();
        btn.classList.remove('active');
      });
      containerDeck2.appendChild(btn);
    });
  }
}

function highlightVirtualPad(deck, padIndex, active) {
  const pad = document.getElementById(`vpad-${deck}-${padIndex + 1}`);
  if (pad) {
    if (active) pad.classList.add('active');
    else if (deck === 2 || padIndex !== currentShaderIndex) pad.classList.remove('active');
  }
}

// ---------------------------------------------------------------------------
// MIDI Controller Web API Initialization & Routing
// ---------------------------------------------------------------------------
async function initMidi() {
  midiController = new MidiController();

  midiController.on('connection', ({ connected, deviceName, inputCount }) => {
    if (midiBtnText) {
      midiBtnText.textContent = connected ? `MIDI: ${deviceName.substring(0, 10).toUpperCase()}` : 'MIDI [OFFLINE]';
    }
    if (midiLed) {
      midiLed.classList.toggle('online', connected);
    }
    if (midiStatusPill) {
      midiStatusPill.textContent = connected ? 'ONLINE' : 'OFFLINE';
      midiStatusPill.className = `status-pill ${connected ? 'online' : 'offline'}`;
    }
    if (deviceNameDisplay) {
      deviceNameDisplay.textContent = connected ? `${deviceName.toUpperCase()} (${inputCount} PORT)` : 'NO USB MIDI DETECTED';
    }
    logMidiConsole('system', connected ? `[HARDWARE] ${deviceName} Connected & Ready.` : '[SYSTEM] No MIDI Device Connected.');
  });

  midiController.on('rawMessage', (raw) => {
    // Flash activity LED
    if (midiLed) {
      midiLed.classList.add('activity');
      clearTimeout(midiLed._activityTimeout);
      midiLed._activityTimeout = setTimeout(() => midiLed.classList.remove('activity'), 70);
    }

    let type = 'system';
    let text = '';
    if (raw.isCC) {
      type = 'cc';
      text = `CH ${raw.channel + 1} | CC #${raw.data1} = ${raw.data2} (${Math.round(raw.data2 / 1.27)}%) [${raw.hex}]`;
    } else if (raw.isNoteOn) {
      type = 'note';
      text = `CH ${raw.channel + 1} | NOTE ON #${raw.data1} VEL ${raw.data2} [${raw.hex}]`;
    } else if (raw.isNoteOff) {
      type = 'note';
      text = `CH ${raw.channel + 1} | NOTE OFF #${raw.data1} [${raw.hex}]`;
    } else {
      text = `RAW MIDI [${raw.hex}]`;
    }
    logMidiConsole(type, text);
  });

  // Control Change Routing (Knobs & Faders)
  midiController.on('controlChange', (data) => {
    const ctrlId = data.control.id;
    const norm = data.normalized;

    // Deck 1 EQ Knobs
    if (ctrlId === 'eq_low_1') {
      const val = 0.2 + norm * 2.8;
      tweakState.global.bassPunch = val;
      if (paramBassPunch) { paramBassPunch.value = val; valBassPunch.textContent = `${val.toFixed(1)}x`; }
      updateVirtualKnob('eq-low-1', norm, `${val.toFixed(1)}x`);
      applySettingsToUniforms();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'DECK 1 EQ LOW', action: 'BASS PUNCH', valText: `${val.toFixed(1)}x`, normalized: norm });
    } else if (ctrlId === 'eq_mid_1') {
      const val = 0.05 + norm * 0.50;
      tweakState.global.smoothing = val;
      if (audioEngine) audioEngine.smoothFactor = val;
      if (paramSmoothing) { paramSmoothing.value = val; valSmoothing.textContent = val.toFixed(2); }
      updateVirtualKnob('eq-mid-1', norm, val.toFixed(2));
      applySettingsToUniforms();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'DECK 1 EQ MID', action: 'SMOOTHING', valText: val.toFixed(2), normalized: norm });
    } else if (ctrlId === 'eq_hi_1') {
      const val = 0.2 + norm * 2.8;
      tweakState.global.trebleSparkle = val;
      if (paramTrebleSparkle) { paramTrebleSparkle.value = val; valTrebleSparkle.textContent = `${val.toFixed(1)}x`; }
      updateVirtualKnob('eq-hi-1', norm, `${val.toFixed(1)}x`);
      applySettingsToUniforms();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'DECK 1 EQ HI', action: 'TREBLE SPARKLE', valText: `${val.toFixed(1)}x`, normalized: norm });
    } else if (ctrlId === 'cfx_1') {
      tweakState.global.hueShift = norm;
      const deg = Math.round(norm * 360);
      if (paramHueShift) { paramHueShift.value = norm; valHueShift.textContent = `+${deg}°`; }
      updateVirtualKnob('cfx-1', norm, `${deg}°`);
      applySettingsToUniforms();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'DECK 1 CFX', action: 'HUE SHIFT', valText: `+${deg}°`, normalized: norm });
    }
    // Deck 1 Channel Fader (Audio Mic Gain)
    else if (ctrlId === 'fader_1' || ctrlId === 'fader_1_alt') {
      const val = 0.2 + norm * 2.8;
      if (audioEngine) audioEngine.gain = val;
      if (sliderGain) sliderGain.value = val;
      if (gainVal) gainVal.textContent = `${val.toFixed(1)}x`;
      updateVirtualFader(1, norm, `${val.toFixed(1)}x`);
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'CH 1 FADER', action: 'MIC GAIN', valText: `${val.toFixed(1)}x`, normalized: norm });
    }
    // Deck 2 Channel Fader (Glow & Bloom)
    else if (ctrlId === 'fader_2' || ctrlId === 'fader_2_alt') {
      const val = 0.3 + norm * 2.2;
      tweakState.global.glowMult = val;
      if (paramGlowMult) { paramGlowMult.value = val; valGlowMult.textContent = `${val.toFixed(1)}x`; }
      updateVirtualFader(2, norm, `${val.toFixed(1)}x`);
      applySettingsToUniforms();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'CH 2 FADER', action: 'BLOOM / GLOW', valText: `${val.toFixed(1)}x`, normalized: norm });
    }
    // Crossfader
    else if (ctrlId === 'crossfader') {
      crossfadeVal = norm;
      updateVirtualCrossfader(norm);
      // Crossfader blends visual energy and adds subtle chromatic saturation
      uniforms.u_glowMultiplier.value = tweakState.global.glowMult * (1.0 + norm * 0.8);
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'CROSSFADER', action: 'BLEND / MORPH', valText: `${Math.round(norm * 100)}%`, normalized: norm });
    }
    // Tempo Sliders
    else if (ctrlId === 'tempo_1' || ctrlId === 'tempo_2') {
      tempoMultiplier = 0.25 + norm * 2.75;
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: data.control.name, action: 'PLAYBACK RATE', valText: `${tempoMultiplier.toFixed(2)}x`, normalized: norm });
    }
    // Deck 2 EQ Knobs (Mapped to active shader custom params or auxiliary audio shaping)
    else if (ctrlId === 'eq_hi_2' || ctrlId === 'eq_mid_2' || ctrlId === 'eq_low_2' || ctrlId === 'cfx_2') {
      const curShader = SHADER_DEFINITIONS[currentShaderIndex];
      const paramIdx = ctrlId === 'eq_hi_2' ? 0 : (ctrlId === 'eq_mid_2' ? 1 : (ctrlId === 'eq_low_2' ? 2 : 3));
      if (curShader && curShader.customParams && curShader.customParams[paramIdx]) {
        const p = curShader.customParams[paramIdx];
        const val = p.min + norm * (p.max - p.min);
        if (!tweakState.shaders[curShader.id]) tweakState.shaders[curShader.id] = {};
        tweakState.shaders[curShader.id][p.id] = val;
        applySettingsToUniforms();
        renderActiveShaderControls();
        const knobLabel = ctrlId === 'eq_hi_2' ? 'eq-hi-2' : (ctrlId === 'eq_mid_2' ? 'eq-mid-2' : (ctrlId === 'eq_low_2' ? 'eq-low-2' : 'cfx-2'));
        updateVirtualKnob(knobLabel, norm, `${val.toFixed(1)}${p.unit || ''}`);
        showMidiOsd({ eventKey: data.key, channel: data.channel, label: data.control.name, action: p.name, valText: `${val.toFixed(1)}${p.unit || ''}`, normalized: norm });
      }
    }
  });

  // Jog Wheel Scratch Routing
  midiController.on('jog', (data) => {
    jogTimeOffset += data.delta * 0.04;
    gridVelocity.x += data.delta * 0.5;

    if (data.deck === 1) {
      vjogAngle1 = (vjogAngle1 + data.delta * 10) % 360;
      updateJogWheelVisual(1, vjogAngle1);
    } else {
      vjogAngle2 = (vjogAngle2 + data.delta * 10) % 360;
      updateJogWheelVisual(2, vjogAngle2);
    }

    logMidiConsole('jog', `[JOG WHEEL] DECK ${data.deck} SCRATCH DELTA: ${data.delta > 0 ? '+' : ''}${data.delta}`);
    showMidiOsd({
      eventKey: `JOG DECK ${data.deck}`,
      channel: data.deck - 1,
      label: `DECK ${data.deck} JOG`,
      action: data.delta > 0 ? 'FORWARD SCRATCH' : 'BACKWARD SCRATCH',
      valText: `${data.delta > 0 ? '+' : ''}${data.delta}`,
      normalized: 0.5 + data.delta * 0.05
    });
  });

  // Note On Routing (Buttons & Performance Pads)
  midiController.on('noteOn', (data) => {
    const ctrlId = data.control.id;
    const deck = data.deck;

    // Deck 1 Performance Pads (1 to 8) -> Select Shaders 1 to 8
    if (deck === 1 && data.control.padIndex !== undefined) {
      const idx = data.control.padIndex;
      setShader(idx);
      highlightVirtualPad(1, idx, true);
      showMidiOsd({
        eventKey: data.key,
        channel: data.channel,
        label: `DECK 1 PAD #${idx + 1}`,
        action: 'SELECT SHADER',
        valText: SHADER_DEFINITIONS[idx]?.title || '',
        normalized: (idx + 1) / 8
      });
      return;
    }

    // Deck 2 Performance Pads (1 to 8) -> Live FX Triggers
    if (deck === 2 && data.control.padIndex !== undefined) {
      const idx = data.control.padIndex;
      const fx = DECK_2_FX_DEFS[idx];
      if (fx) {
        fx.fnDown();
        highlightVirtualPad(2, idx, true);
        showMidiOsd({
          eventKey: data.key,
          channel: data.channel,
          label: `DECK 2 PAD #${idx + 1}`,
          action: `TRIGGER ${fx.name}`,
          valText: fx.sub,
          normalized: 1.0
        });
      }
      return;
    }

    // Play / Pause Button
    if (ctrlId === 'play_1' || ctrlId === 'play_2') {
      if (audioEngine) {
        if (btnMic.classList.contains('active')) {
          btnDemo.click();
        } else {
          btnMic.click();
        }
      }
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'PLAY / PAUSE', action: 'AUDIO TOGGLE', valText: 'SWITCH SOURCE', normalized: 1.0 });
    }

    // Cue Button
    if (ctrlId === 'cue_1' || ctrlId === 'cue_2') {
      triggerStrobe();
      showMidiOsd({ eventKey: data.key, channel: data.channel, label: 'CUE BUTTON', action: 'TRANSIENT HIT', valText: 'PULSE', normalized: 1.0 });
    }
  });

  // Note Off Routing (Release Momentary FX)
  midiController.on('noteOff', (data) => {
    const deck = data.deck;
    if (deck === 1 && data.control.padIndex !== undefined) {
      highlightVirtualPad(1, data.control.padIndex, false);
    } else if (deck === 2 && data.control.padIndex !== undefined) {
      const idx = data.control.padIndex;
      const fx = DECK_2_FX_DEFS[idx];
      if (fx && fx.fnUp) fx.fnUp();
      highlightVirtualPad(2, idx, false);
    }
  });

  await midiController.init();
}

function startMidiLearnSession() {
  if (!midiController) return;
  if (midiLearnBanner) midiLearnBanner.classList.remove('hidden');
  midiController.startLearn('custom_param', 'SELECTED PARAMETER', (resolved) => {
    if (midiLearnBanner) midiLearnBanner.classList.add('hidden');
    logMidiConsole('system', `[LEARN] Bound ${resolved.eventKey} Successfully!`);
  });
}

function cancelMidiLearnSession() {
  if (midiController) midiController.cancelLearn();
  if (midiLearnBanner) midiLearnBanner.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Input Events & Hotkeys Binding
// ---------------------------------------------------------------------------
function bindInputEvents() {
  // Key bindings 1-0 for shaders, [T] for tweak drawer, [M] for MIDI studio, [C] for mapping, [F] for fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      setShader(idx);
    } else if (e.key === '0') {
      setShader(9);
    } else if (e.key === 't' || e.key === 'T') {
      toggleTweakDrawer();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleMidiStudioDrawer();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  });

  // Tweak Drawer Toggle Handlers
  if (btnTweak) btnTweak.addEventListener('click', () => toggleTweakDrawer());
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => toggleTweakDrawer(false));
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => saveSettings(true));
  if (btnResetSettings) btnResetSettings.addEventListener('click', () => restoreDefaults());

  // MIDI Studio Drawer Toggle Handlers
  if (btnMidi) btnMidi.addEventListener('click', () => toggleMidiStudioDrawer());
  if (btnCloseMidi) btnCloseMidi.addEventListener('click', () => toggleMidiStudioDrawer(false));
  if (btnMidiRescan) btnMidiRescan.addEventListener('click', () => {
    if (midiController) midiController.scanInputs();
  });
  if (btnClearTerm) btnClearTerm.addEventListener('click', () => {
    const consoleLog = document.getElementById('midi-console-log');
    if (consoleLog) consoleLog.innerHTML = '<div class="log-line system">[SYSTEM] Terminal Log Cleared.</div>';
  });
  if (btnMidiLearn) btnMidiLearn.addEventListener('click', startMidiLearnSession);
  if (btnCancelLearn) btnCancelLearn.addEventListener('click', cancelMidiLearnSession);
  if (btnResetMidiMap) btnResetMidiMap.addEventListener('click', () => {
    if (midiController) {
      midiController.resetCustomMappings();
      logMidiConsole('system', '[MAP] Pioneer DDJ-200 Default Hardware Profile Restored.');
    }
  });

  // Global Sliders Input Binding
  if (paramBassPunch) {
    paramBassPunch.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.global.bassPunch = v;
      valBassPunch.textContent = `${v.toFixed(1)}x`;
      applySettingsToUniforms();
      saveSettings(false);
    });
  }

  if (paramTrebleSparkle) {
    paramTrebleSparkle.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.global.trebleSparkle = v;
      valTrebleSparkle.textContent = `${v.toFixed(1)}x`;
      applySettingsToUniforms();
      saveSettings(false);
    });
  }

  if (paramSmoothing) {
    paramSmoothing.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.global.smoothing = v;
      valSmoothing.textContent = v.toFixed(2);
      applySettingsToUniforms();
      saveSettings(false);
    });
  }

  if (paramHueShift) {
    paramHueShift.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.global.hueShift = v;
      valHueShift.textContent = `+${Math.round(v * 360)}°`;
      applySettingsToUniforms();
      saveSettings(false);
    });
  }

  if (paramGlowMult) {
    paramGlowMult.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      tweakState.global.glowMult = v;
      valGlowMult.textContent = `${v.toFixed(1)}x`;
      applySettingsToUniforms();
      saveSettings(false);
    });
  }

  // Gain Slider
  sliderGain.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    audioEngine.gain = val;
    gainVal.textContent = `${val.toFixed(1)}x`;
  });

  // Audio Switchers
  btnMic.addEventListener('click', async () => {
    btnMic.classList.add('active');
    btnDemo.classList.remove('active');
    audioEngine.stopDemoSynth();
    await audioEngine.init(true);
  });

  btnDemo.addEventListener('click', async () => {
    btnDemo.classList.add('active');
    btnMic.classList.remove('active');
    await audioEngine.init(false);
  });

  audioFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      btnDemo.classList.remove('active');
      btnMic.classList.remove('active');
      audioEngine.loadFile(e.target.files[0]);
    }
  });

  // Calibration Toggle
  btnCalibrate.addEventListener('click', () => {
    const active = projectionMapper.toggleCalibration();
    btnCalibrate.classList.toggle('active', active);
  });

  // Fullscreen Toggle
  btnFullscreen.addEventListener('click', toggleFullscreen);

  // Modal Handlers
  modalBtnMic.addEventListener('click', async () => {
    startModal.style.display = 'none';
    await audioEngine.init(true);
  });

  modalBtnDemo.addEventListener('click', async () => {
    startModal.style.display = 'none';
    btnDemo.classList.add('active');
    btnMic.classList.remove('active');
    await audioEngine.init(false);
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Main Render Loop
// ---------------------------------------------------------------------------
let lastTime = 0;
let gridOffset = new THREE.Vector2(0, 0);
let gridVelocity = new THREE.Vector2(0, 0);

function animate(time) {
  requestAnimationFrame(animate);

  const t = time * 0.001;
  const dt = Math.max(0.001, Math.min(0.1, t - lastTime));
  lastTime = t;

  // Advance visual time (modulated by tempo multiplier, frozen state, and jog scratches)
  if (!isFrozen) {
    visualTime += dt * tempoMultiplier;
  }
  uniforms.u_time.value = visualTime + jogTimeOffset;

  // Smooth Strobe Decay
  if (strobeIntensity > 0) {
    strobeIntensity *= 0.82;
    if (strobeIntensity < 0.02) {
      strobeIntensity = 0;
      if (djFxOverlay) djFxOverlay.classList.remove('strobe');
    }
  }

  // Smooth Bass Bomb Slam Decay
  if (bassBombDecay > 0) {
    bassBombDecay *= 0.88;
    if (bassBombDecay < 0.02) bassBombDecay = 0;
    uniforms.u_bassPunch.value = Math.min(3.0, tweakState.global.bassPunch + bassBombDecay);
  }

  // Smooth Bloom Flare Decay
  if (bloomBombDecay > 0) {
    bloomBombDecay *= 0.90;
    if (bloomBombDecay < 0.02) bloomBombDecay = 0;
    uniforms.u_glowMultiplier.value = Math.min(2.5, tweakState.global.glowMult + bloomBombDecay);
  }

  // Neon Rave Hue Cycle
  if (raveHueCycle) {
    tweakState.global.hueShift = (tweakState.global.hueShift + dt * 0.4) % 1.0;
    uniforms.u_hueOffset.value = tweakState.global.hueShift;
    updateGlobalSlidersUI();
  }

  if (audioEngine && audioEngine.isInitialized) {
    const telem = audioEngine.update();

    // Pass Audio Uniforms
    uniforms.u_subBass.value = telem.subBass;
    uniforms.u_bass.value = telem.bass;
    uniforms.u_lowMid.value = telem.lowMid;
    uniforms.u_mid.value = telem.mid;
    uniforms.u_highMid.value = telem.highMid;
    uniforms.u_high.value = telem.high;
    uniforms.u_air.value = telem.air;
    uniforms.u_energy.value = telem.overallEnergy;
    uniforms.u_transient.value = telem.transientAttack;
    uniforms.u_isClipping.value = telem.isClipping ? 1.0 : 0.0;

    uniforms.u_primaryColor.value.set(telem.primaryColor.r, telem.primaryColor.g, telem.primaryColor.b);
    uniforms.u_secondaryColor.value.set(telem.secondaryColor.r, telem.secondaryColor.g, telem.secondaryColor.b);

    // Grow-Decay Momentum Physics for Directional Infinite Grids:
    const targetVX = (telem.mid * 2.8 - telem.lowMid * 2.0 + telem.highMid * 1.8);
    const targetVY = (telem.subBass * 3.8 + telem.bass * 2.4 - telem.high * 1.2);

    const accelRate = 0.12;
    const decayRate = 0.04;
    gridVelocity.x += (targetVX - gridVelocity.x) * (Math.abs(targetVX) > Math.abs(gridVelocity.x) ? accelRate : decayRate);
    gridVelocity.y += (targetVY - gridVelocity.y) * (Math.abs(targetVY) > Math.abs(gridVelocity.y) ? accelRate : decayRate);

    const baseDrift = 0.45;
    gridOffset.x += (baseDrift + gridVelocity.x * 2.5) * dt;
    gridOffset.y += (baseDrift + gridVelocity.y * 3.0) * dt;

    if (!uniforms.u_gridOffset) {
      uniforms.u_gridOffset = { value: gridOffset.clone() };
      uniforms.u_gridVelocity = { value: gridVelocity.clone() };
    } else {
      uniforms.u_gridOffset.value.copy(gridOffset);
      uniforms.u_gridVelocity.value.copy(gridVelocity);
    }

    // Update Deaf DJ FFT Spectrum Bars
    barSub.style.height = `${Math.min(30, Math.max(4, telem.subBass * 30))}px`;
    barBass.style.height = `${Math.min(30, Math.max(4, telem.bass * 30))}px`;
    barMid.style.height = `${Math.min(30, Math.max(4, telem.mid * 30))}px`;
    barHigh.style.height = `${Math.min(30, Math.max(4, telem.high * 30))}px`;
    barAir.style.height = `${Math.min(30, Math.max(4, telem.air * 30))}px`;

    // Clipping Warning
    clipWarning.classList.toggle('clipping', telem.isClipping);
  }

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Initial Boot
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  djFxOverlay = document.getElementById('dj-fx-overlay');
  loadSettings();
  audioEngine = new AudioEngine();
  if (tweakState.global.smoothing) {
    audioEngine.smoothFactor = tweakState.global.smoothing;
  }
  initThree();
  projectionMapper = new ProjectionMapper('canvas-projection-wrapper');
  projectionMapper.onToggleCallback = (active) => {
    btnCalibrate.classList.toggle('active', active);
  };
  buildShaderDock();
  populateVirtualPads();
  setShader(currentShaderIndex);
  bindInputEvents();
  initMidi();
  animate(0);
});
