import * as THREE from 'three';
import { AudioEngine } from '../shared/audio-engine.js';
import { ProjectionMapper } from '../shared/projection-mapper.js';
import { SHADER_DEFINITIONS } from '../shaders/shader-defs.js';

let renderer, scene, camera, mesh, material;
let audioEngine, projectionMapper;
let currentShaderIndex = 6;
let uniforms = {};

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

function toggleTweakDrawer(open = null) {
  if (!tweakDrawer) return;
  const shouldOpen = open !== null ? open : !tweakDrawer.classList.contains('open');
  tweakDrawer.classList.toggle('open', shouldOpen);
  if (btnTweak) btnTweak.classList.toggle('active', shouldOpen);
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

function bindInputEvents() {
  // Key bindings 1-0 for shaders, [T] for tweak drawer, [C] for mapping, [F] for fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      setShader(idx);
    } else if (e.key === '0') {
      setShader(9);
    } else if (e.key === 't' || e.key === 'T') {
      toggleTweakDrawer();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  });

  // Drawer Toggle Handlers
  if (btnTweak) btnTweak.addEventListener('click', () => toggleTweakDrawer());
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => toggleTweakDrawer(false));
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => saveSettings(true));
  if (btnResetSettings) btnResetSettings.addEventListener('click', () => restoreDefaults());

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

let lastTime = 0;
let gridOffset = new THREE.Vector2(0, 0);
let gridVelocity = new THREE.Vector2(0, 0);

function animate(time) {
  requestAnimationFrame(animate);

  const t = time * 0.001;
  const dt = Math.max(0.001, Math.min(0.1, t - lastTime));
  lastTime = t;

  uniforms.u_time.value = t;

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
    // Repeated low notes (sub/bass) thrust forward; mids shift lateral drift; highs add speed bursts
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

    // Update Deaf DJ FFT Spectrum Bars (max 30px height)
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

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
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
  setShader(currentShaderIndex);
  bindInputEvents();
  animate(0);
});
