/**
 * workshop.js - Workshop Sound-Reactive Music & Light Performance Tool
 * 
 * Features:
 * 1. Web Audio Engine & Multi-Band FFT
 * 2. Minimeters-Style 64-Band Full-Spectrum Visualizer (Red 20Hz -> Purple 20kHz)
 * 3. Sound-Reactive Cymatics Chladni WebGL Shader (Keyed to Canjo, Drums, Snares, Yelling, Clapping, Singing)
 * 4. 4 Corner Reactive Light Pillars (Upper-Left Red, Upper-Right Blue, Lower-Left Amber, Lower-Right Violet)
 * 5. High-Precision BPM Metronome (60-120 BPM, default 80)
 * 6. Dynamic MIDI Auto-Mapper (Slots 1-4 = Corner Pillars, Slots 5+ = Sliders) with individual Unlink buttons
 */

import * as THREE from 'three';
import { AudioEngine } from '../shared/audio-engine.js';
import { MidiController } from '../shared/midi-controller.js';
import { CommonGLSL } from '../shared/shader-common.js';

/* =========================================================================
   1. PILLARS & SLIDERS CONFIGURATION
   ========================================================================= */

const PILLAR_CONFIGS = [
  {
    id: 'pillar_ul',
    name: 'UPPER-LEFT (RED)',
    keyHint: '[1] / [Q]',
    color: '#ff0055',
    colorGlow: 'rgba(255, 0, 85, 0.65)',
    coreColor: '#ffffff',
    canvasId: 'pillar-canvas-ul',
    sectionId: 'pillar-section-ul',
    tagId: 'ul-binding-tag'
  },
  {
    id: 'pillar_ur',
    name: 'UPPER-RIGHT (BLUE)',
    keyHint: '[2] / [W]',
    color: '#00d2ff',
    colorGlow: 'rgba(0, 210, 255, 0.65)',
    coreColor: '#ffffff',
    canvasId: 'pillar-canvas-ur',
    sectionId: 'pillar-section-ur',
    tagId: 'ur-binding-tag'
  },
  {
    id: 'pillar_ll',
    name: 'LOWER-LEFT (AMBER)',
    keyHint: '[3] / [A]',
    color: '#ff9e00',
    colorGlow: 'rgba(255, 158, 0, 0.65)',
    coreColor: '#ffffff',
    canvasId: 'pillar-canvas-ll',
    sectionId: 'pillar-section-ll',
    tagId: 'll-binding-tag'
  },
  {
    id: 'pillar_lr',
    name: 'LOWER-RIGHT (VIOLET)',
    keyHint: '[4] / [S]',
    color: '#c77dff',
    colorGlow: 'rgba(199, 125, 255, 0.65)',
    coreColor: '#ffffff',
    canvasId: 'pillar-canvas-lr',
    sectionId: 'pillar-section-lr',
    tagId: 'lr-binding-tag'
  }
];

const SLIDER_CONFIGS = [
  { id: 'harmonicScale', name: 'HARMONIC COMPLEXITY', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'spinSpeed', name: 'VIBRATION SPEED', min: 0.0, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'rippleDepth', name: 'BESSEL RIPPLES', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'lineSharpness', name: 'NODAL SHARPNESS', min: 0.3, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'sandDensity', name: 'SAND SPARKLES', min: 0.0, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'bassPunch', name: 'BASS PUNCH', min: 0.2, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'glowMult', name: 'GLOW & BLOOM', min: 0.2, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'pillarSpeed', name: 'PILLAR BURST SPEED', min: 0.5, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'pillarDecay', name: 'PILLAR RIPPLE DECAY', min: 0.4, max: 2.5, step: 0.1, default: 1.0, unit: 'x' },
  { id: 'metronomeBpm', name: 'METRONOME BPM', min: 60, max: 120, step: 1, default: 80, unit: 'BPM' },
  { id: 'audioGain', name: 'INPUT MIC GAIN', min: 0.2, max: 3.5, step: 0.1, default: 1.2, unit: 'x' }
];

const tweakParams = {};
SLIDER_CONFIGS.forEach(cfg => {
  tweakParams[cfg.id] = cfg.default;
});

/* =========================================================================
   2. DOM ELEMENT REFERENCES
   ========================================================================= */

// Audio & Top HUD
const btnMic = document.getElementById('btn-mic');
const btnDemo = document.getElementById('btn-demo');
const btnFile = document.getElementById('btn-file');
const audioFileInput = document.getElementById('audio-file-input');
const sliderGain = document.getElementById('slider-gain');
const gainVal = document.getElementById('gain-val');
const spectrumCanvas = document.getElementById('spectrum-canvas');
const soundCategoryDisplay = document.getElementById('sound-category-display');
const midiPill = document.getElementById('midi-pill');
const midiLed = document.getElementById('midi-led');
const midiDeviceName = document.getElementById('midi-device-name');
const shaderCanvasContainer = document.getElementById('shader-canvas-container');

// Metronome
const bpmVal = document.getElementById('bpm-val');
const bpmSlider = document.getElementById('bpm-slider');
const btnBpmMinus = document.getElementById('btn-bpm-minus');
const btnBpmPlus = document.getElementById('btn-bpm-plus');
const btnTapTempo = document.getElementById('btn-tap-tempo');
const btnMetroClick = document.getElementById('btn-metro-click');
const beatDots = [
  document.getElementById('beat-dot-1'),
  document.getElementById('beat-dot-2'),
  document.getElementById('beat-dot-3'),
  document.getElementById('beat-dot-4')
];
const pendulumThumb = document.getElementById('pendulum-thumb');

// Drawer & UI
const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const slidersDrawer = document.getElementById('sliders-drawer');
const pillarsRack = document.getElementById('pillars-rack');
const slidersRack = document.getElementById('sliders-rack');
const btnResetMidi = document.getElementById('btn-reset-midi');
const btnResetSliders = document.getElementById('btn-reset-sliders');
const btnFullscreen = document.getElementById('btn-fullscreen');
const toastContainer = document.getElementById('toast-container');
const startModal = document.getElementById('start-modal');
const modalBtnMic = document.getElementById('modal-btn-mic');
const modalBtnDemo = document.getElementById('modal-btn-demo');
const fpsDisplay = document.getElementById('fps-display');
const btnQuality = document.getElementById('btn-quality');

// Performance & Quality Management
let currentQuality = 'balanced'; // 'eco', 'balanced', 'high'
let frameCount = 0;
let lastFpsUpdate = performance.now();

function getQualityPixelRatio() {
  if (currentQuality === 'eco') return 0.75;
  if (currentQuality === 'high') return Math.min(window.devicePixelRatio || 1, 1.5);
  return Math.min(window.devicePixelRatio || 1, 1.0);
}

function applyQuality(quality) {
  currentQuality = quality;
  if (renderer) {
    resizeThree();
  }
  if (btnQuality) {
    btnQuality.textContent = `PERF: ${quality.toUpperCase()} [P]`;
  }
}

/* =========================================================================
   3. AUDIO ENGINE & ACOUSTIC CLASSIFIER
   ========================================================================= */

const audioEngine = new AudioEngine();
let audioMode = 'none';

async function initAudio(useMic = true) {
  const res = await audioEngine.init(useMic);
  audioMode = res.mode;
  if (startModal) startModal.style.display = 'none';

  btnMic.classList.toggle('active', audioMode === 'mic');
  btnDemo.classList.toggle('active', audioMode === 'demo');

  showToast(audioMode === 'mic' ? '🎤 MICROPHONE LIVE' : '🎵 DEMO SYNTHESIS ACTIVE');
}

// Acoustic sound classifier (Canjo, Drums, Snares, Yelling, Clapping, Singing)
function classifyAcoustics(telemetry) {
  const { subBass, bass, lowMid, mid, highMid, high, air, overallEnergy, transientAttack } = telemetry;

  if (overallEnergy < 0.05) {
    return { name: 'LISTENING...', cssClass: 'idle' };
  }

  // Clapping / Snaps: Sharp high-frequency transient burst (>5kHz)
  if (transientAttack > 0.35 && (air > 0.4 || high > 0.45)) {
    return { name: 'CLAPPING / SNAP', cssClass: 'clap' };
  }

  // Drums / Kick: Low-frequency sub-bass shockwave
  if (subBass > 0.55 || (bass > 0.55 && transientAttack > 0.25)) {
    return { name: 'DRUM / KICK', cssClass: 'drum' };
  }

  // Snares: Fast mid-high pop
  if (highMid > 0.45 && transientAttack > 0.3) {
    return { name: 'SNARE / PERC', cssClass: 'snare' };
  }

  // Vocal / Yelling: Massive energy in vocal formant region (800Hz - 2.5kHz)
  if (overallEnergy > 0.65 && mid > 0.55) {
    return { name: 'HUMAN YELLING', cssClass: 'vocal' };
  }

  // Singing: Melodic vowel sustain with stable formant mid harmonics
  if (mid > 0.4 && lowMid > 0.35 && transientAttack < 0.2) {
    return { name: 'SINGING / VOICE', cssClass: 'vocal' };
  }

  // Canjo / String Pluck: Mid harmonic twang with quick pluck transient
  if ((lowMid > 0.45 || mid > 0.45) && transientAttack > 0.2) {
    return { name: 'CANJO / PLUCK', cssClass: 'canjo' };
  }

  return { name: 'ACOUSTIC VIBE', cssClass: 'canjo' };
}

/* =========================================================================
   4. MINIMETERS-STYLE SPECTRUM VISUALIZER (TOP HUD)
   ========================================================================= */

const specCtx = spectrumCanvas.getContext('2d');
const NUM_BANDS = 64;
const bandPeaks = new Float32Array(NUM_BANDS);
const PEAK_DECAY = 0.015;

function resizeSpectrumCanvas() {
  const rect = spectrumCanvas.parentElement.getBoundingClientRect();
  spectrumCanvas.width = rect.width * window.devicePixelRatio;
  spectrumCanvas.height = 48 * window.devicePixelRatio;
}
window.addEventListener('resize', resizeSpectrumCanvas);
resizeSpectrumCanvas();

function drawMinimetersSpectrum(dataArray) {
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  specCtx.clearRect(0, 0, w, h);

  if (!dataArray || dataArray.length === 0) return;

  const barWidth = (w / NUM_BANDS);
  const gap = 1.5 * window.devicePixelRatio;
  const actualBarW = Math.max(1, barWidth - gap);

  const binCount = dataArray.length;
  for (let i = 0; i < NUM_BANDS; i++) {
    const logMin = Math.log10(1);
    const logMax = Math.log10(binCount);
    const startBin = Math.floor(Math.pow(10, logMin + (i / NUM_BANDS) * (logMax - logMin)));
    const endBin = Math.max(startBin + 1, Math.floor(Math.pow(10, logMin + ((i + 1) / NUM_BANDS) * (logMax - logMin))));

    let sum = 0;
    let count = 0;
    for (let b = startBin; b < endBin && b < binCount; b++) {
      sum += dataArray[b];
      count++;
    }
    const rawVal = count > 0 ? (sum / count / 255) * tweakParams.audioGain : 0;
    const val = Math.min(1.0, rawVal);

    if (val > bandPeaks[i]) {
      bandPeaks[i] = val;
    } else {
      bandPeaks[i] = Math.max(0, bandPeaks[i] - PEAK_DECAY);
    }

    // Minimeters Color Synesthesia Gradient: 20Hz (Red) -> 20kHz (Purple)
    const ratio = i / (NUM_BANDS - 1);
    const hue = ratio * 285;
    const barHeight = val * (h - 4);
    const x = i * barWidth;
    const y = h - barHeight;

    specCtx.fillStyle = `hsl(${hue}, 95%, 52%)`;
    specCtx.fillRect(x, y, actualBarW, barHeight);

    const peakY = h - (bandPeaks[i] * (h - 4));
    specCtx.fillStyle = `hsl(${hue}, 100%, 75%)`;
    specCtx.fillRect(x, Math.max(0, peakY - 2), actualBarW, 2);
  }
}

/* =========================================================================
   5. 4 CORNER LIGHT PILLARS ENGINE (UL, UR, LL, LR)
   ========================================================================= */

const pillarWaves = {
  pillar_ul: [],
  pillar_ur: [],
  pillar_ll: [],
  pillar_lr: []
};

function resizePillarCanvases() {
  const dpr = window.devicePixelRatio || 1;
  PILLAR_CONFIGS.forEach(cfg => {
    const section = document.getElementById(cfg.sectionId);
    const canvas = document.getElementById(cfg.canvasId);
    if (section && canvas) {
      const rect = section.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
  });
}
window.addEventListener('resize', resizePillarCanvases);
resizePillarCanvases();

// Trigger a specific pillar section
export function triggerPillar(pillarId) {
  const cfg = PILLAR_CONFIGS.find(p => p.id === pillarId);
  if (!cfg) return;

  pillarWaves[pillarId].push({
    startTime: performance.now(),
    duration: 1000 * tweakParams.pillarDecay,
    burstTime: 120 / tweakParams.pillarSpeed,
    color: cfg.color,
    colorGlow: cfg.colorGlow,
    coreColor: cfg.coreColor
  });
}

function renderPillars(now) {
  PILLAR_CONFIGS.forEach(cfg => {
    const canvas = document.getElementById(cfg.canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isLeft = cfg.id.includes('ul') || cfg.id.includes('ll');
    renderSectionWaves(ctx, canvas, pillarWaves[cfg.id], now, isLeft ? 'left' : 'right');
  });
}

function renderSectionWaves(ctx, canvas, waves, now, side) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (waves.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = waves.length - 1; i >= 0; i--) {
    const wave = waves[i];
    const elapsed = now - wave.startTime;
    if (elapsed > wave.duration) {
      waves.splice(i, 1);
      continue;
    }

    const progress = elapsed / wave.duration;
    const fade = Math.pow(1 - progress, 1.8);

    // Needle -> Full Column Expansion
    let currentWidth;
    if (elapsed < wave.burstTime) {
      const burstProgress = elapsed / wave.burstTime;
      currentWidth = 2 + (w - 2) * Math.sin(burstProgress * Math.PI * 0.5);
    } else {
      const rippleOsc = Math.sin((elapsed - wave.burstTime) * 0.015) * (w * 0.05);
      currentWidth = w + rippleOsc;
    }

    const centerX = side === 'left' ? currentWidth * 0.5 : w - (currentWidth * 0.5);

    // 1. Outer Neon Aura Gradient
    const grad = ctx.createRadialGradient(
      centerX, h * 0.5, 2,
      centerX, h * 0.5, currentWidth * 0.8
    );
    grad.addColorStop(0, wave.color);
    grad.addColorStop(0.4, wave.colorGlow);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.globalAlpha = fade * 0.9;
    ctx.fillRect(0, 0, w, h);

    // 2. White-Hot Central Needle
    ctx.fillStyle = wave.coreColor;
    ctx.globalAlpha = fade;
    const needleW = Math.max(2, 4 * (1 - progress));
    ctx.fillRect(centerX - needleW * 0.5, 0, needleW, h);

    // 3. Laser Striation Ripples
    ctx.lineWidth = 2 * window.devicePixelRatio;
    ctx.strokeStyle = wave.color;
    const numRipples = 4;
    for (let r = 0; r < numRipples; r++) {
      const rippleY = ((now * 0.3 + r * (h / numRipples)) % h);
      ctx.globalAlpha = fade * 0.45;
      ctx.beginPath();
      ctx.moveTo(centerX - currentWidth * 0.45, rippleY);
      ctx.lineTo(centerX + currentWidth * 0.45, rippleY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Click/touch listeners on all 4 pillar sections
PILLAR_CONFIGS.forEach(cfg => {
  const el = document.getElementById(cfg.sectionId);
  if (el) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      triggerPillar(cfg.id);
    });
  }
});

/* =========================================================================
   6. SOUND-REACTIVE CYMATICS SHADER (THREE.JS)
   ========================================================================= */

let renderer, scene, camera, material, mesh;
let uniforms = {};
let isScoreWindowOpen = false; // When true, disables Three.js background shader rendering to maximize score FPS

// Continuous temporal integrators (strictly continuous rotation & wave ripple motion)
let accumulatedRotAngle = 0;
let accumulatedRipplePhase = 0;

// Continuous smoothed acoustic feature state (Attack-Decay smoothing envelopes)
const smoothAudio = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  high: 0,
  air: 0,
  energy: 0,
  transient: 0,
  drum: 0,
  snare: 0,
  vocal: 0,
  clap: 0,
  canjo: 0
};

// Smooth ADSR Envelope function (fast attack, smooth musical decay)
function smoothEnvelope(curr, target, dt, attackRate = 18.0, decayRate = 5.0) {
  const rate = target > curr ? attackRate : decayRate;
  return curr + (target - curr) * (1.0 - Math.exp(-rate * Math.max(0.001, dt)));
}

function initThreeCymatics() {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Optimized for laptops: antialias: false eliminates 4x MSAA bandwidth overhead on fullscreen quad
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance'
  });
  applyQuality(currentQuality);
  shaderCanvasContainer.appendChild(renderer.domElement);

  uniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2() },
    u_rotAngle: { value: 0 },
    u_ripplePhase: { value: 0 },

    // Smoothed FFT bands
    u_subBass: { value: 0 },
    u_bass: { value: 0 },
    u_lowMid: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_air: { value: 0 },
    u_energy: { value: 0 },
    u_transient: { value: 0 },

    // Continuous Acoustic Keyed Sound Features
    u_canjo: { value: 0 },
    u_drum: { value: 0 },
    u_snare: { value: 0 },
    u_vocal: { value: 0 },
    u_clap: { value: 0 },

    // Slider Parameters
    u_harmonicScale: { value: 1.0 },
    u_spinSpeed: { value: 1.0 },
    u_rippleDepth: { value: 1.0 },
    u_lineSharpness: { value: 1.0 },
    u_sandDensity: { value: 1.0 },
    u_bassPunch: { value: 1.0 },
    u_glowMult: { value: 1.0 }
  };

  const vertexShader = `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_rotAngle;
    uniform float u_ripplePhase;

    uniform float u_subBass;
    uniform float u_bass;
    uniform float u_lowMid;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_air;
    uniform float u_energy;
    uniform float u_transient;

    uniform float u_canjo;
    uniform float u_drum;
    uniform float u_snare;
    uniform float u_vocal;
    uniform float u_clap;

    uniform float u_harmonicScale;
    uniform float u_spinSpeed;
    uniform float u_rippleDepth;
    uniform float u_lineSharpness;
    uniform float u_sandDensity;
    uniform float u_bassPunch;
    uniform float u_glowMult;

    ${CommonGLSL}

    float chladniWave(vec2 p, float n, float m) {
      return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
    }

    float chladniDual(vec2 p, float n, float m) {
      return sin(n * PI * p.x) * sin(m * PI * p.y) - sin(m * PI * p.x) * sin(n * PI * p.y);
    }

    void main() {
      vec2 center = 0.5 * u_resolution.xy;
      float minDim = min(u_resolution.x, u_resolution.y);
      float aspect = u_resolution.x / u_resolution.y;

      // In tall portrait (mobile/narrow screens), scale pattern so it takes up the center space
      float scaleFactor = (aspect < 0.7) ? 1.55 : (aspect < 1.0 ? 1.85 : 2.3);
      vec2 uv = (gl_FragCoord.xy - center) / minDim * scaleFactor;

      // Organic subtle breathing (smoothly interpolated, no teleporting zoom)
      float breath = 1.0 + (u_vocal * 0.12 + u_drum * 0.15 + u_subBass * 0.1) * u_bassPunch;
      uv /= breath;

      // Rotation driven by the continuous time integral (strictly continuous, cannot jerk)
      vec2 rotUV = rot2D(u_rotAngle) * uv;

      float r = length(rotUV);
      float a = atan(rotUV.y, rotUV.x);

      float hScale = max(0.2, u_harmonicScale);

      // Stable Harmonic Basis Modes:
      // Base integer modes with microscopic continuous acoustic pitch modulation (max +-0.1)
      float n1 = (1.0 + u_subBass * 0.15) * hScale;
      float m1 = (2.0 + u_bass * 0.15) * hScale;
      float w1 = chladniWave(rotUV, n1, m1);

      float n2 = (2.0 + u_canjo * 0.12) * hScale;
      float m2 = (3.0 + u_mid * 0.15) * hScale;
      float w2 = chladniDual(rotUV, n2, m2);

      float n3 = (3.0 + u_snare * 0.15) * hScale;
      float m3 = (4.0 + u_high * 0.15) * hScale;
      float w3 = chladniWave(rotUV, n3, m3);

      float n4 = (4.0 + u_clap * 0.15) * hScale;
      float m4 = (5.0 + u_air * 0.15) * hScale;
      float w4 = chladniDual(rotUV, n4, m4);

      // Radial standing wave ripple with continuous phase integral (cannot jump or invert)
      float radialWave = cos(r * (8.5 * hScale) - u_ripplePhase) * cos(6.0 * a + u_time * 0.15);

      // Dynamic Harmonic Superposition:
      // Energy smoothly shifts weighting between harmonic layers without tearing
      float weight1 = 0.8 + (u_subBass * 1.5 + u_drum * 2.0) * u_bassPunch;
      float weight2 = 0.5 + (u_mid * 1.2 + u_canjo * 2.2);
      float weight3 = 0.35 + (u_high * 1.0 + u_snare * 2.0);
      float weight4 = 0.2 + (u_air * 1.0 + u_clap * 2.2 + u_vocal * 1.5);
      float weightRadial = (0.3 + (u_bass + u_canjo * 0.5) * 0.8) * u_rippleDepth;

      float totalWeight = weight1 + weight2 + weight3 + weight4 + weightRadial + 0.001;

      float W = (w1 * weight1 + w2 * weight2 + w3 * weight3 + w4 * weight4 + radialWave * weightRadial) / totalWeight;
      float nodalDist = abs(W);

      // Nodal line sharpness & smooth transient expansion
      float sharpness = max(0.01, u_lineSharpness * (1.0 + u_snare * 0.3));
      float nodalLine = smoothstep((0.08 + u_transient * 0.04) / sharpness, 0.005, nodalDist);
      float resonanceGlow = (0.045 * u_glowMult) / (nodalDist + 0.035);

      // Continuous 20Hz-20kHz Synesthetic Color Palette
      float freqGradient = clamp(r * 0.35 + (u_high * 0.35 + u_clap * 0.4), 0.0, 1.0);
      vec3 spectralColor = freqToColor(freqGradient, (1.2 + u_energy * 0.7) * u_glowMult, 0.0);

      // Crimson core (drums) vs Violet high-frequency mandalas (singing/claps)
      vec3 crimsonCore = vec3(1.0, 0.02, 0.15) * (0.8 + (u_subBass + u_drum) * 1.8 * u_bassPunch);
      vec3 violetHighs = vec3(0.75, 0.0, 1.0) * (0.8 + (u_high * 2.0 + u_clap * 2.2 + u_vocal * 1.2));
      vec3 plateColor = mix(crimsonCore, violetHighs, smoothstep(0.1, 0.8, freqGradient));

      vec3 finalCol = nodalLine * spectralColor * 2.4 + resonanceGlow * plateColor * (0.6 + u_bass * 0.8);

      // Acoustic Micro-Sand Sparkles along nodal lines (smoothly amplified, no flickering)
      float sandFactor = u_sandDensity * (1.0 + u_clap * 1.5 + u_snare * 1.0);
      if (sandFactor > 0.01) {
        float sandNoise = hash21(rotUV * 130.0 + sin(u_time * 0.15));
        if (sandNoise > (0.96 - sandFactor * 0.07)) {
          finalCol += spectralColor * smoothstep(0.12, 0.01, nodalDist) * (0.5 + u_air * 1.5) * sandFactor;
        }
      }

      // Adaptive boundary vignette (preserves portrait screen coverage without abrupt cutoff)
      float yAspectFactor = max(1.0, u_resolution.y / u_resolution.x * 0.62);
      float edgeDist = length(uv / vec2(1.0, yAspectFactor));
      finalCol *= smoothstep(1.45, 0.75, edgeDist);
      gl_FragColor = vec4(finalCol, 1.0);
    }
  `;

  material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  resizeThree();
  requestAnimationFrame(resizeThree);
}

function resizeThree() {
  if (!renderer || !shaderCanvasContainer) return;
  const rect = shaderCanvasContainer.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const dpr = getQualityPixelRatio();
  renderer.setPixelRatio(dpr);
  renderer.setSize(rect.width, rect.height, false);
  if (uniforms.u_resolution) {
    // Critical: gl_FragCoord is in drawing buffer pixels
    uniforms.u_resolution.value.set(renderer.domElement.width, renderer.domElement.height);
  }
  resizePillarCanvases();
}
window.addEventListener('resize', resizeThree);
if (typeof ResizeObserver !== 'undefined' && shaderCanvasContainer) {
  const ro = new ResizeObserver(() => {
    resizeThree();
  });
  ro.observe(shaderCanvasContainer);
}

/* =========================================================================
   7. HIGH-PRECISION BPM METRONOME (60 - 120 BPM, DEFAULT 80)
   ========================================================================= */

let currentBpm = 80;
let isAudioClickEnabled = true;
let nextNoteTime = 0.0;
let currentBeat = 0;
const LOOKAHEAD_MS = 25.0;
const SCHEDULE_AHEAD_TIME = 0.1;

function playMetronomeClick(time, isAccent) {
  if (!isAudioClickEnabled || !audioEngine.ctx) return;

  const osc = audioEngine.ctx.createOscillator();
  const gain = audioEngine.ctx.createGain();

  osc.connect(gain);
  gain.connect(audioEngine.ctx.destination);

  osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);
  osc.frequency.exponentialRampToValueAtTime(100, time + 0.04);

  gain.gain.setValueAtTime(isAccent ? 0.8 : 0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

  osc.start(time);
  osc.stop(time + 0.05);
}

function triggerVisualBeat(beatIndex) {
  beatDots.forEach((dot, idx) => {
    if (idx === beatIndex) {
      dot.classList.add('flash');
      setTimeout(() => dot.classList.remove('flash'), 120);
    } else {
      dot.classList.remove('flash');
    }
  });
}

function scheduleMetronome() {
  if (!audioEngine.ctx || audioEngine.ctx.state !== 'running') return;

  while (nextNoteTime < audioEngine.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
    const isAccent = (currentBeat === 0);
    playMetronomeClick(nextNoteTime, isAccent);

    const delayMs = Math.max(0, (nextNoteTime - audioEngine.ctx.currentTime) * 1000);
    const beatToTrigger = currentBeat;
    setTimeout(() => triggerVisualBeat(beatToTrigger), delayMs);

    const secondsPerBeat = 60.0 / currentBpm;
    nextNoteTime += secondsPerBeat;
    currentBeat = (currentBeat + 1) % 4;
  }
}
setInterval(scheduleMetronome, LOOKAHEAD_MS);

function updatePendulum(timeSec) {
  if (!pendulumThumb) return;
  const secondsPerBeat = 60.0 / currentBpm;
  const phase = (timeSec / secondsPerBeat) * Math.PI;
  const normalized = (Math.sin(phase) + 1) * 0.5;
  const maxTravel = 180 - 24;
  pendulumThumb.style.transform = `translateX(${normalized * maxTravel}px)`;
}

function setBpm(newBpm) {
  currentBpm = Math.max(60, Math.min(120, Math.round(newBpm)));
  tweakParams.metronomeBpm = currentBpm;
  bpmVal.textContent = `${currentBpm} BPM`;
  bpmSlider.value = currentBpm;
  updateSliderReadout('metronomeBpm', currentBpm);
}

bpmSlider.addEventListener('input', (e) => setBpm(e.target.value));
btnBpmMinus.addEventListener('click', () => setBpm(currentBpm - 1));
btnBpmPlus.addEventListener('click', () => setBpm(currentBpm + 1));

btnMetroClick.addEventListener('click', () => {
  isAudioClickEnabled = !isAudioClickEnabled;
  btnMetroClick.classList.toggle('active', isAudioClickEnabled);
  btnMetroClick.textContent = `AUDIO CLICK: ${isAudioClickEnabled ? 'ON' : 'OFF'}`;
});

let tapTimes = [];
btnTapTempo.addEventListener('click', () => handleTapTempo());

function handleTapTempo() {
  const now = performance.now();
  tapTimes = tapTimes.filter(t => now - t < 2500);
  tapTimes.push(now);

  if (tapTimes.length >= 2) {
    let intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const computedBpm = Math.round(60000 / avgInterval);
    setBpm(computedBpm);
  }
}

/* =========================================================================
   8. DYNAMIC MIDI AUTO-MAPPER ENGINE (4 PILLARS + SLIDERS)
   ========================================================================= */

const midiController = new MidiController();
const MIDI_STORAGE_KEY = 'workshop_midi_mappings';

let midiMappings = loadMidiMappings();

function loadMidiMappings() {
  try {
    const saved = localStorage.getItem(MIDI_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveMidiMappings() {
  try {
    localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midiMappings));
  } catch {}
}

function resetAllMidiMappings() {
  midiMappings = {};
  saveMidiMappings();
  updatePillarBindingTags();
  renderPillarsRack();
  renderSlidersRack();
  showToast('🔄 ALL MIDI MAPPINGS CLEARED');
}

// Unlink a single target (pillar or slider) to redo its mapping
function unlinkMidiTarget(targetId) {
  let unlinkedKey = null;
  for (const [key, map] of Object.entries(midiMappings)) {
    if (map.target === targetId) {
      unlinkedKey = key;
      delete midiMappings[key];
    }
  }

  saveMidiMappings();
  updatePillarBindingTags();
  renderPillarsRack();
  renderSlidersRack();

  const label = PILLAR_CONFIGS.find(p => p.id === targetId)?.name ||
                SLIDER_CONFIGS.find(s => s.id === targetId)?.name || targetId;
  showToast(`⚡ UNLINKED: ${label}`);
}

function updatePillarBindingTags() {
  PILLAR_CONFIGS.forEach((cfg, idx) => {
    let boundKey = null;
    for (const [key, mapping] of Object.entries(midiMappings)) {
      if (mapping.target === cfg.id) {
        boundKey = key;
        break;
      }
    }
    const tag = document.getElementById(cfg.tagId);
    if (tag) {
      tag.textContent = boundKey ? `BOUND: [${boundKey}]` : `AUTO: WAITING MIDI ${idx + 1}...`;
    }
  });
}

// Find next unassigned target (First 4 = 4 Pillars, 5+ = Sliders)
function getNextUnassignedTarget() {
  const assignedTargets = new Set();
  for (const mapping of Object.values(midiMappings)) {
    assignedTargets.add(mapping.target);
  }

  // 1. Check 4 Corner Light Pillars
  for (const pillar of PILLAR_CONFIGS) {
    if (!assignedTargets.has(pillar.id)) {
      return { target: pillar.id, name: pillar.name, type: 'pillar' };
    }
  }

  // 2. Check Parameter Sliders
  for (const cfg of SLIDER_CONFIGS) {
    if (!assignedTargets.has(cfg.id)) {
      return { target: cfg.id, name: cfg.name, type: 'slider', config: cfg };
    }
  }

  return null;
}

function handleIncomingMidi(eventKey, rawTelemetry) {
  midiLed.classList.add('activity');
  setTimeout(() => midiLed.classList.remove('activity'), 100);

  const { isNoteOn, isCC, data2 } = rawTelemetry;
  if (!isNoteOn && !isCC) return;

  // 1. Check if eventKey already has an assigned target
  let mapping = midiMappings[eventKey];

  // 2. If NOT mapped, auto-detect and assign to next available slot!
  if (!mapping) {
    const nextSlot = getNextUnassignedTarget();
    if (nextSlot) {
      mapping = {
        target: nextSlot.target,
        name: nextSlot.name,
        device: rawTelemetry.device
      };
      midiMappings[eventKey] = mapping;
      saveMidiMappings();
      updatePillarBindingTags();
      renderPillarsRack();
      renderSlidersRack();

      showToast(`⚡ AUTO-MAPPED [${eventKey}] ➔ ${nextSlot.name}`);
    }
  }

  if (!mapping) return;

  // 3. Execute Target Action
  if (mapping.target.startsWith('pillar_')) {
    if (isNoteOn || (isCC && data2 > 0)) {
      triggerPillar(mapping.target);
    }
  } else {
    // Target is a parameter slider!
    const cfg = SLIDER_CONFIGS.find(c => c.id === mapping.target);
    if (!cfg) return;

    let newVal;
    if (isCC) {
      const norm = data2 / 127.0;
      newVal = cfg.min + norm * (cfg.max - cfg.min);
    } else if (isNoteOn) {
      const step = (cfg.max - cfg.min) * 0.1;
      newVal = tweakParams[cfg.id] + step;
      if (newVal > cfg.max) newVal = cfg.min;
    }

    if (newVal !== undefined) {
      if (cfg.step >= 1) newVal = Math.round(newVal);
      else newVal = Math.round(newVal * 10) / 10;

      applySliderValue(cfg.id, newVal);
    }
  }
}

function applySliderValue(id, val) {
  tweakParams[id] = val;
  updateSliderReadout(id, val);

  if (id === 'metronomeBpm') {
    setBpm(val);
  } else if (id === 'audioGain') {
    audioEngine.gain = val;
    sliderGain.value = val;
    gainVal.textContent = `${val.toFixed(1)}x`;
  }
}

function updateSliderReadout(id, val) {
  const el = document.getElementById(`slider-${id}`);
  const valEl = document.getElementById(`val-${id}`);
  if (el) el.value = val;
  if (valEl) {
    const cfg = SLIDER_CONFIGS.find(c => c.id === id);
    valEl.textContent = `${val}${cfg ? cfg.unit : ''}`;
  }
}

/* =========================================================================
   9. DRAWER RACKS GENERATION (PILLARS & SLIDERS)
   ========================================================================= */

function renderPillarsRack() {
  if (!pillarsRack) return;
  pillarsRack.innerHTML = '';

  PILLAR_CONFIGS.forEach(cfg => {
    let boundKey = null;
    for (const [key, map] of Object.entries(midiMappings)) {
      if (map.target === cfg.id) {
        boundKey = key;
        break;
      }
    }

    const card = document.createElement('div');
    card.className = 'mapping-card';
    card.innerHTML = `
      <div class="mapping-title-group">
        <div class="mapping-color-indicator" style="background:${cfg.color};"></div>
        <div>
          <div class="mapping-label">${cfg.name}</div>
          <div style="font-size:0.6rem; color:var(--text-muted);">${cfg.keyHint}</div>
        </div>
      </div>
      <div class="mapping-actions">
        <span class="midi-assign-badge ${boundKey ? 'assigned' : ''}">
          ${boundKey ? `MIDI: ${boundKey}` : 'TOUCH TO MAP'}
        </span>
        <button class="hud-btn btn-test-pillar" style="padding:2px 6px; font-size:0.64rem;">TEST</button>
        ${boundKey ? `<button class="btn-unlink" title="Unlink MIDI mapping">UNLINK</button>` : ''}
      </div>
    `;

    card.querySelector('.btn-test-pillar').addEventListener('click', () => triggerPillar(cfg.id));

    const unlinkBtn = card.querySelector('.btn-unlink');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', () => unlinkMidiTarget(cfg.id));
    }

    pillarsRack.appendChild(card);
  });
}

function renderSlidersRack() {
  if (!slidersRack) return;
  slidersRack.innerHTML = '';

  SLIDER_CONFIGS.forEach(cfg => {
    let boundKey = null;
    for (const [key, map] of Object.entries(midiMappings)) {
      if (map.target === cfg.id) {
        boundKey = key;
        break;
      }
    }

    const card = document.createElement('div');
    card.className = 'slider-card';
    card.innerHTML = `
      <div class="slider-top-line">
        <span class="slider-name">${cfg.name}</span>
        <div class="mapping-actions">
          <span class="midi-assign-badge ${boundKey ? 'assigned' : ''}">
            ${boundKey ? `MIDI: ${boundKey}` : 'TOUCH TO MAP'}
          </span>
          ${boundKey ? `<button class="btn-unlink" title="Unlink MIDI mapping">UNLINK</button>` : ''}
        </div>
      </div>
      <div class="slider-input-row">
        <input type="range" id="slider-${cfg.id}" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${tweakParams[cfg.id]}">
        <span id="val-${cfg.id}" class="slider-val-readout">${tweakParams[cfg.id]}${cfg.unit}</span>
      </div>
    `;

    const input = card.querySelector(`#slider-${cfg.id}`);
    input.addEventListener('input', (e) => {
      applySliderValue(cfg.id, parseFloat(e.target.value));
    });

    const unlinkBtn = card.querySelector('.btn-unlink');
    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', () => unlinkMidiTarget(cfg.id));
    }

    slidersRack.appendChild(card);
  });
}

btnToggleDrawer.addEventListener('click', () => {
  slidersDrawer.classList.toggle('open');
});

btnCloseDrawer.addEventListener('click', () => {
  slidersDrawer.classList.remove('open');
});

btnResetMidi.addEventListener('click', () => resetAllMidiMappings());

btnResetSliders.addEventListener('click', () => {
  SLIDER_CONFIGS.forEach(cfg => {
    applySliderValue(cfg.id, cfg.default);
  });
  showToast('VALUES RESET TO DEFAULTS');
});

/* =========================================================================
   10. TOAST NOTIFICATIONS & HOTKEYS
   ========================================================================= */

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>⚡</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Keyboard shortcuts for testing without MIDI:
// [1] or [Q] = Upper-Left (Red)
// [2] or [W] = Upper-Right (Blue)
// [3] or [A] = Lower-Left (Amber)
// [4] or [S] = Lower-Right (Violet)
// [Space] = Tap Tempo
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  if (e.key === 'Escape') {
    closeScoreWindow();
    if (slidersDrawer) slidersDrawer.classList.remove('open');
  } else if (e.key === '1' || e.key === 'q' || e.key === 'Q') {
    triggerPillar('pillar_ul');
  } else if (e.key === '2' || e.key === 'w' || e.key === 'W') {
    triggerPillar('pillar_ur');
  } else if (e.key === '3' || e.key === 'a' || e.key === 'A') {
    triggerPillar('pillar_ll');
  } else if (e.key === '4' || e.key === 's' || e.key === 'S') {
    triggerPillar('pillar_lr');
  } else if (e.code === 'Space') {
    e.preventDefault();
    handleTapTempo();
  } else if (e.key === 'p' || e.key === 'P') {
    const nextQ = currentQuality === 'balanced' ? 'eco' : currentQuality === 'eco' ? 'high' : 'balanced';
    applyQuality(nextQ);
  }
});

if (btnQuality) {
  btnQuality.addEventListener('click', () => {
    const nextQ = currentQuality === 'balanced' ? 'eco' : currentQuality === 'eco' ? 'high' : 'balanced';
    applyQuality(nextQ);
  });
}

/* =========================================================================
   11. TOP CONTROLS & FILE UPLOADS
   ========================================================================= */

btnMic.addEventListener('click', () => initAudio(true));
btnDemo.addEventListener('click', () => initAudio(false));

btnFile.addEventListener('click', () => audioFileInput.click());
audioFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    audioEngine.loadFile(file);
    audioMode = 'file';
    btnMic.classList.remove('active');
    btnDemo.classList.remove('active');
    btnFile.classList.add('active');
    showToast(`📂 LOADED: ${file.name}`);
  }
});

sliderGain.addEventListener('input', (e) => {
  const g = parseFloat(e.target.value);
  applySliderValue('audioGain', g);
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

modalBtnMic.addEventListener('click', () => initAudio(true));
modalBtnDemo.addEventListener('click', () => initAudio(false));

/* =========================================================================
   12. MAIN ANIMATION & UPDATE LOOP
   ========================================================================= */

let prevTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = (now - prevTime) * 0.001;
  prevTime = now;

  // FPS Telemetry Update
  frameCount++;
  const nowTime = performance.now();
  if (nowTime - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (nowTime - lastFpsUpdate));
    if (fpsDisplay) {
      fpsDisplay.textContent = `FPS: ${fps}`;
      fpsDisplay.style.color = fps >= 50 ? '#00ff88' : fps >= 30 ? '#ffaa00' : '#ff0055';
    }
    frameCount = 0;
    lastFpsUpdate = nowTime;
  }

  // 1. Update Audio Engine
  const telemetry = audioEngine.update();

  // 2. Classify Acoustics
  const classification = classifyAcoustics(telemetry);
  soundCategoryDisplay.textContent = classification.name;
  soundCategoryDisplay.className = `detector-val ${classification.cssClass}`;

  // 3. Minimeters Spectrum Draw (Disabled when score is open to save CPU/GPU cycles)
  if (!isScoreWindowOpen && audioEngine.dataArray) {
    drawMinimetersSpectrum(audioEngine.dataArray);
  }

  // 4. Update Three.js Cymatics Shader Uniforms with Continuous Smooth State (Disabled when score is open to maximize FPS)
  if (!isScoreWindowOpen && uniforms && uniforms.u_time) {
    uniforms.u_time.value = now * 0.001;

    // Continuous acoustic feature extractions (continuous float weights, not binary booleans!)
    const rawDrum = Math.min(1.0, telemetry.subBass * 1.5 + (telemetry.bass > 0.35 ? telemetry.transientAttack * 0.7 : 0.0));
    const rawSnare = Math.min(1.0, telemetry.highMid * 1.6 + telemetry.transientAttack * 0.5);
    const rawVocal = Math.min(1.0, telemetry.mid * 1.4 * (0.4 + telemetry.overallEnergy * 0.6));
    const rawClap = Math.min(1.0, (telemetry.air * 1.6 + telemetry.high * 0.7) * (0.3 + telemetry.transientAttack * 0.7));
    const rawCanjo = Math.min(1.0, (telemetry.lowMid * 1.5 + telemetry.mid * 0.6) * (0.4 + (telemetry.spectralCentroid > 350 && telemetry.spectralCentroid < 1400 ? 0.6 : 0.0)));

    // Smooth all audio bands and acoustic features with musical attack-decay envelopes
    smoothAudio.subBass = smoothEnvelope(smoothAudio.subBass, telemetry.subBass, dt, 16.0, 5.0);
    smoothAudio.bass = smoothEnvelope(smoothAudio.bass, telemetry.bass, dt, 16.0, 5.0);
    smoothAudio.lowMid = smoothEnvelope(smoothAudio.lowMid, telemetry.lowMid, dt, 14.0, 5.0);
    smoothAudio.mid = smoothEnvelope(smoothAudio.mid, telemetry.mid, dt, 14.0, 5.0);
    smoothAudio.high = smoothEnvelope(smoothAudio.high, telemetry.high, dt, 16.0, 6.0);
    smoothAudio.air = smoothEnvelope(smoothAudio.air, telemetry.air, dt, 18.0, 6.0);
    smoothAudio.energy = smoothEnvelope(smoothAudio.energy, telemetry.overallEnergy, dt, 14.0, 4.0);
    smoothAudio.transient = smoothEnvelope(smoothAudio.transient, telemetry.transientAttack, dt, 24.0, 7.0);

    smoothAudio.drum = smoothEnvelope(smoothAudio.drum, rawDrum, dt, 18.0, 5.0);
    smoothAudio.snare = smoothEnvelope(smoothAudio.snare, rawSnare, dt, 20.0, 6.0);
    smoothAudio.vocal = smoothEnvelope(smoothAudio.vocal, rawVocal, dt, 12.0, 4.0);
    smoothAudio.clap = smoothEnvelope(smoothAudio.clap, rawClap, dt, 20.0, 6.0);
    smoothAudio.canjo = smoothEnvelope(smoothAudio.canjo, rawCanjo, dt, 16.0, 5.0);

    // Continuous rotation and ripple integration (strictly continuous - never jerks or snaps)
    const spinVelocity = (0.2 + smoothAudio.mid * 0.35 + smoothAudio.canjo * 0.25) * tweakParams.spinSpeed;
    accumulatedRotAngle += dt * spinVelocity;

    const rippleVelocity = (0.7 + smoothAudio.bass * 0.8 + smoothAudio.drum * 0.6) * tweakParams.rippleDepth;
    accumulatedRipplePhase += dt * rippleVelocity;

    uniforms.u_rotAngle.value = accumulatedRotAngle;
    uniforms.u_ripplePhase.value = accumulatedRipplePhase;

    uniforms.u_subBass.value = smoothAudio.subBass;
    uniforms.u_bass.value = smoothAudio.bass;
    uniforms.u_lowMid.value = smoothAudio.lowMid;
    uniforms.u_mid.value = smoothAudio.mid;
    uniforms.u_high.value = smoothAudio.high;
    uniforms.u_air.value = smoothAudio.air;
    uniforms.u_energy.value = smoothAudio.energy;
    uniforms.u_transient.value = smoothAudio.transient;

    uniforms.u_drum.value = smoothAudio.drum;
    uniforms.u_snare.value = smoothAudio.snare;
    uniforms.u_vocal.value = smoothAudio.vocal;
    uniforms.u_clap.value = smoothAudio.clap;
    uniforms.u_canjo.value = smoothAudio.canjo;

    uniforms.u_harmonicScale.value = tweakParams.harmonicScale;
    uniforms.u_spinSpeed.value = tweakParams.spinSpeed;
    uniforms.u_rippleDepth.value = tweakParams.rippleDepth;
    uniforms.u_lineSharpness.value = tweakParams.lineSharpness;
    uniforms.u_sandDensity.value = tweakParams.sandDensity;
    uniforms.u_bassPunch.value = tweakParams.bassPunch;
    uniforms.u_glowMult.value = tweakParams.glowMult;

    renderer.render(scene, camera);
  }

  // 5. Render 4 Corner Light Pillars
  renderPillars(now);

  // 6. Update Metronome Visual Pendulum Sweep
  if (audioEngine.ctx) {
    updatePendulum(audioEngine.ctx.currentTime);
  }

  // 7. Update Musical Score Playhead & Active Hit Lights
  updateScorePlayhead();
}

/* =========================================================================
   13. MUSICAL SCORE ENGINE // "LOVE YOUR NEIGHBOR" (14-SESSION ENSEMBLE)
   ========================================================================= */

const btnMusicalScore = document.getElementById('btn-musical-score');
const scoreOverlay = document.getElementById('score-overlay');
const btnCloseScore = document.getElementById('btn-close-score');
const btnScorePlay = document.getElementById('btn-score-play');
const btnScoreLoop = document.getElementById('btn-score-loop');
const btnScoreSynth = document.getElementById('btn-score-synth');
const btnScoreCountIn = document.getElementById('btn-score-countin');
const scoreTabBtns = document.querySelectorAll('.score-tab-btn');
const sessionPillsRack = document.getElementById('session-pills-rack');
const sessionBarLabel = document.getElementById('session-bar-label');
const scoreMeasureRuler = document.getElementById('score-measure-ruler');
const scoreLanesContainer = document.getElementById('score-lanes-container');
const scoreStaircaseContainer = document.getElementById('score-staircase-container');
const staircaseOrderControls = document.getElementById('staircase-order-controls');
const btnToggleStaircaseOrder = document.getElementById('btn-toggle-staircase-order');
const scorePlayhead = document.getElementById('score-playhead');
const scoreMeasureVal = document.getElementById('score-measure-val');
const scoreBeatVal = document.getElementById('score-beat-val');
const scoreBpmVal = document.getElementById('score-bpm-val');
const scoreTeleHintText = document.getElementById('score-tele-hint-text');

// Zoom and Warm-Up Controls
const btnScoreZoomIn = document.getElementById('btn-score-zoom-plus');
const btnScoreZoomOut = document.getElementById('btn-score-zoom-minus');
const scoreZoomVal = document.getElementById('score-zoom-val');
const btnScoreWarmup = document.getElementById('btn-score-warmup');

// Count-In Elements
const countInOverlay = document.getElementById('countin-overlay');
const countInNum = document.getElementById('countin-num');
const countInLabel = document.getElementById('countin-label');

// Synchronized ASL / Caption Card Elements
const captionPhraseBadge = document.getElementById('caption-phrase-badge');
const captionTempoBadge = document.getElementById('caption-tempo-badge');
const captionLyricText = document.getElementById('caption-lyric-text');
const captionSignHint = document.getElementById('caption-sign-hint');
const phraseProgressBar = document.getElementById('phrase-progress-bar');
const aslVideoAsset = document.getElementById('asl-video-asset');
const aslPlaceholder = document.getElementById('asl-media-placeholder');

/* --- 13.1 Master Score Data ("Love Your Neighbor") --- */

// The 7 canonical 2-bar lyric phrases forming the 14-bar Master Loop (Page 3 of PDF)
const MASTER_LOOP_PHRASES = [
  {
    phraseIndex: 1,
    bars: [1, 2],
    lyric: "Our big world is open wide,",
    barASigns: "OUR WORLD BIG",
    barBSigns: "NOW OPEN WIDE",
    aslGloss: "OUR WORLD BIG, NOW OPEN WIDE",
    signHint: "ASL: OUR WORLD BIG, NOW OPEN WIDE (Bar A: OUR WORLD BIG • Bar B: NOW OPEN WIDE)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }, // Bar 1 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }  // Bar 2 (Bar B)
    ]
  },
  {
    phraseIndex: 2,
    bars: [3, 4],
    lyric: "Hands give help and hearts are kind.",
    barASigns: "TWO-HANDS GIVE HELP",
    barBSigns: "SHOW HEART KIND",
    aslGloss: "TWO-HANDS GIVE HELP, SHOW HEART KIND",
    signHint: "ASL: TWO-HANDS GIVE HELP, SHOW HEART KIND (Bar A: TWO-HANDS GIVE HELP • Bar B: SHOW HEART KIND)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: null }, // Bar 3 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: null }  // Bar 4 (Bar B)
    ]
  },
  {
    phraseIndex: 3,
    bars: [5, 6],
    lyric: "If you fall, we stand up strong,",
    barASigns: "IF YOU-FALL DOWN",
    barBSigns: "I-HELP STAND STRONG",
    aslGloss: "IF YOU-FALL DOWN, I-HELP STAND STRONG",
    signHint: "ASL: IF YOU-FALL DOWN, I-HELP STAND STRONG (Bar A: IF YOU-FALL DOWN • Bar B: I-HELP STAND STRONG)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }, // Bar 5 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }  // Bar 6 (Bar B)
    ]
  },
  {
    phraseIndex: 4,
    bars: [7, 8],
    lyric: "Walking together, right side by side.",
    barASigns: "WE WALK TOGETHER",
    barBSigns: "STAY SIDE-BY-SIDE HERE",
    aslGloss: "WE WALK TOGETHER, STAY SIDE-BY-SIDE HERE",
    signHint: "ASL: WE WALK TOGETHER, STAY SIDE-BY-SIDE HERE (Hoot sustains on beat 1 of Bar 7)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: { startBeat: 0, durationBeats: 2, label: "HOOT (2 BEATS)" } }, // Bar 7 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: null } // Bar 8 (Bar B)
    ]
  },
  {
    phraseIndex: 5,
    bars: [9, 10],
    lyric: "Feel the drum beat, share one heart,",
    barASigns: "FEEL DRUM VIBRATE",
    barBSigns: "SHARE ONE HEARTBEAT",
    aslGloss: "FEEL DRUM VIBRATE, SHARE ONE HEARTBEAT",
    signHint: "ASL: FEEL DRUM VIBRATE, SHARE ONE HEARTBEAT (Bar A: FEEL DRUM VIBRATE • Bar B: SHARE ONE HEARTBEAT)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }, // Bar 9 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [3], hoot: null }  // Bar 10 (Bar B)
    ]
  },
  {
    phraseIndex: 6,
    bars: [11, 12],
    lyric: "Everyone equal, all welcome here.",
    barASigns: "ALL PEOPLE EQUAL",
    barBSigns: "ALL WELCOME HERE",
    aslGloss: "ALL PEOPLE EQUAL, ALL WELCOME HERE",
    signHint: "ASL: ALL PEOPLE EQUAL, ALL WELCOME HERE (Clap beats 2 & 4 building toward finale)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: null }, // Bar 11 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [1, 3], hoot: null }  // Bar 12 (Bar B)
    ]
  },
  {
    phraseIndex: 7,
    bars: [13, 14],
    lyric: "Love your neighbor, we stand as one!",
    barASigns: "LOVE YOUR NEIGHBOR",
    barBSigns: "WE STAND TOGETHER",
    aslGloss: "LOVE YOUR NEIGHBOR, WE STAND TOGETHER",
    signHint: "ASL: LOVE YOUR NEIGHBOR, WE STAND TOGETHER (Hoot sustains on beat 1 for 4 beats! Clap all 4 beats!)",
    aslWebpUrl: "",
    measures: [
      { bass: [0, 2], snare: [1, 3], clap: [0, 1, 2, 3], hoot: { startBeat: 0, durationBeats: 4, label: "TOOT (4 BEATS)" } }, // Bar 13 (Bar A)
      { bass: [0, 2], snare: [1, 3], clap: [0, 1, 2, 3], hoot: null } // Bar 14 (Bar B)
    ]
  }
];

// 5 Ensemble Tracks
const ENSEMBLE_LANES = [
  { id: 'bass', name: 'CAJON BASS', keyHint: '[1] Low Center Hit', color: '#ff3366', badge: 'B', pillarId: 'pillar_ul' },
  { id: 'snare', name: 'CAJON SNARE', keyHint: '[4] Top Rim Slap', color: '#ff8800', badge: 'S', pillarId: 'pillar_lr' },
  { id: 'clap', name: 'HAND CLAP', keyHint: '[3] Loud Clap', color: '#ffcc00', badge: 'C', pillarId: 'pillar_ll' },
  { id: 'hoot', name: 'HOOT / TOOT', keyHint: '[2] Sustained Tone', color: '#00d2ff', badge: 'H', pillarId: 'pillar_ur' },
  { id: 'lyrics', name: 'SINGERS & SIGNERS', keyHint: 'Lyrics & ASL', color: '#e2b714', badge: 'V', pillarId: null }
];

/* --- 13.2 State Management --- */
let currentScoreMode = 'loop'; // 'loop' | 'lift' | 'spiral' | 'full'
let selectedSession = 1;       // Session offset 1..14
let isScoreLooping = true;
let isScorePlaying = false;    // NEVER auto-play on open! User clicks PLAY
let currentScoreZoom = 1.0;    // Score zoom scale
let isWarmupMode = true;       // Audience warm-up: no words until Bar 14
let staircaseAscending = true; // true: S1 at bottom, S14 at top (matching user sketch)
let isSynthGuideEnabled = true;
let isCountInEnabled = true;
let isCountingIn = false;
let countInStep = 0;
let countInTimer = null;
let scoreStartTime = 0;
let scorePausedElapsed = 0;
let lastTriggeredStep = -1;
let currentHighlightedBeat = -1;

// Rehearsal Web Audio Guide
let synthMasterGain = null;

function getSynthContext() {
  if (audioEngine.ctx) {
    if (audioEngine.ctx.state === 'suspended') audioEngine.ctx.resume();
    if (!synthMasterGain) {
      synthMasterGain = audioEngine.ctx.createGain();
      synthMasterGain.gain.value = 0.55;
      synthMasterGain.connect(audioEngine.ctx.destination);
    }
    return audioEngine.ctx;
  }
  return null;
}

/* --- 13.3 Synthesizer Audio Models --- */

function playSynthBass(time) {
  if (!isSynthGuideEnabled) return;
  const ctx = getSynthContext();
  if (!ctx) return;
  const t = time || ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(36, t + 0.22);

  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

  osc.connect(gain);
  gain.connect(synthMasterGain);
  osc.start(t);
  osc.stop(t + 0.3);
}

function playSynthSnare(time) {
  if (!isSynthGuideEnabled) return;
  const ctx = getSynthContext();
  if (!ctx) return;
  const t = time || ctx.currentTime;

  const bufSize = Math.floor(ctx.sampleRate * 0.14);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 900;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(synthMasterGain);
  noise.start(t);
  noise.stop(t + 0.14);
}

function playSynthClap(time) {
  if (!isSynthGuideEnabled) return;
  const ctx = getSynthContext();
  if (!ctx) return;
  const t = time || ctx.currentTime;

  [0, 0.012, 0.024].forEach((delay, idx) => {
    const burstLen = Math.floor(ctx.sampleRate * (idx === 2 ? 0.09 : 0.025));
    const buf = ctx.createBuffer(1, burstLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < burstLen; i++) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    const triggerTime = t + delay;
    gain.gain.setValueAtTime(0.65, triggerTime);
    gain.gain.exponentialRampToValueAtTime(0.001, triggerTime + (idx === 2 ? 0.08 : 0.022));

    src.connect(filter);
    filter.connect(gain);
    gain.connect(synthMasterGain);
    src.start(triggerTime);
    src.stop(triggerTime + 0.1);
  });
}

function playSynthHoot(time, durationSec, volume = 0.5) {
  if (!isSynthGuideEnabled) return;
  const ctx = getSynthContext();
  if (!ctx) return;
  const t = time || ctx.currentTime;
  const dur = Math.max(0.3, durationSec || 1.5);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(392, t); // G4 hoot tone
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(784, t); // G5 octave harmonic

  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(volume * 0.55, t + 0.08);
  gain.gain.setValueAtTime(volume * 0.55, t + dur - 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(synthMasterGain);

  osc1.start(t);
  osc2.start(t);
  osc1.stop(t + dur + 0.05);
  osc2.stop(t + dur + 0.05);
}

/* --- 13.4 Score Generator by Mode --- */

function getActiveScoreData() {
  if (currentScoreMode === 'loop') {
    // 14-bar Master Loop re-indexed so Bar 1 starts at selectedSession
    const measures = [];
    for (let i = 0; i < 14; i++) {
      const canonicalMasterBar = ((i + selectedSession - 1) % 14) + 1;
      const phraseIdx = Math.floor((canonicalMasterBar - 1) / 2);
      const measureInPhrase = (canonicalMasterBar - 1) % 2;
      const phrase = MASTER_LOOP_PHRASES[phraseIdx];
      const mData = phrase.measures[measureInPhrase];

      const isBarA = measureInPhrase === 0;
      const activeBarSigns = isBarA ? phrase.barASigns : phrase.barBSigns;
      let lyricText = phrase.lyric;
      let barSigns = activeBarSigns;
      let aslGloss = phrase.aslGloss;
      let hintText = phrase.signHint;
      let phraseId = phrase.phraseIndex;
      let isWarmup = false;

      // When warm-up mode is enabled:
      if (isWarmupMode) {
        if (i < 13) {
          lyricText = "(Instrumental Warm-Up)";
          hintText = "Ensemble warm-up — building pulse and rhythm with the audience";
          barSigns = "";
          aslGloss = "";
          phraseId = "WARM-UP";
          isWarmup = true;
        } else {
          lyricText = "“Love your neighbor, we stand as one!”";
          hintText = "First vocal entrance! Signers cue audience: WE STAND TOGETHER";
          barSigns = phrase.barBSigns;
          aslGloss = phrase.aslGloss;
          phraseId = "WARM-UP FINALE";
          isWarmup = false;
        }
      }

      measures.push({
        displayLabel: `BAR ${i + 1} (M${canonicalMasterBar})`,
        masterBar: canonicalMasterBar,
        phraseIndex: phraseId,
        lyric: lyricText,
        aslGloss: aslGloss,
        barSigns: barSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        signHint: hintText,
        aslWebpUrl: isWarmup ? "" : phrase.aslWebpUrl,
        measureInPhrase: measureInPhrase,
        bpm: 80,
        isWarmup: isWarmup,
        bass: mData.bass,
        snare: mData.snare,
        clap: mData.clap,
        hoot: mData.hoot
      });
    }
    return {
      title: `14-BAR MASTER LOOP (SESSION ${selectedSession})`,
      totalMeasures: 14,
      tempoMode: 'fixed',
      baseBpm: 80,
      measures: measures
    };
  }

  if (currentScoreMode === 'lift') {
    // The Lift (Bars 41-45): Tempo rises 80 -> 90 BPM for 15 seconds
    // Bars 41-42: Bar A (ALL PEOPLE JOIN), Bars 43-45: Bar B (CONNECT ONE WORLD held through Bar 45)
    const measures = [];
    for (let i = 0; i < 5; i++) {
      const barNum = 41 + i;
      const prog = i / 4;
      const bpm = 80 + prog * 10;
      const isBarA = (i < 2);
      const isSpanStart = (i === 0 || i === 2);
      const spanBars = (i === 0) ? 2 : (i === 2 ? 3 : 0);
      const barTag = (i === 0) ? "BARS 41–42 • BAR A" : (i === 2 ? "BARS 43–45 • BAR B (HELD)" : "");
      const activeBarSigns = isBarA ? "ALL PEOPLE JOIN" : "CONNECT ONE WORLD";
      measures.push({
        displayLabel: `BAR ${barNum}`,
        masterBar: barNum,
        phraseIndex: 'LIFT',
        lyric: "All people join, one connected world!",
        aslGloss: "ALL PEOPLE JOIN, CONNECT ONE WORLD",
        barSigns: activeBarSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        isSpanStart: isSpanStart,
        spanBars: spanBars,
        barTag: barTag,
        signHint: isBarA ? "Signers: ALL PEOPLE JOIN (Bars 41–42)" : "Signers: CONNECT ONE WORLD (Bars 43–45) — hold lifted through Bar 45 (80→90 BPM)",
        aslWebpUrl: "",
        bpm: bpm,
        isWarmup: false,
        bass: [0, 1, 2, 3], // beats 1, 2, 3, 4
        snare: [0.5, 1.5, 2.5, 3.5], // the "and" of every beat
        clap: [1, 3], // beats 2 & 4
        hoot: (barNum === 41 || barNum === 43) ? { startBeat: 0, durationBeats: 2, label: "HOOT (2 BEATS)" } : null
      });
    }
    return {
      title: "THE LIFT // BARS 41–45 (80–90 BPM / 15 SECONDS)",
      totalMeasures: 5,
      tempoMode: 'ramp',
      baseBpm: 80,
      measures: measures
    };
  }

  if (currentScoreMode === 'spiral') {
    // Spiral Out (Bars 46-50): Tempo rises 90 -> 100 BPM for last 15 seconds
    // Bars 46-47: Bar A (HEARTBEAT GROW STRONG), Bars 48-50: Bar B (SHOUT CELEBRATE NOW in final bars)
    const measures = [];
    for (let i = 0; i < 5; i++) {
      const barNum = 46 + i;
      const prog = i / 4;
      const bpm = 90 + prog * 10;
      const isBarA = (i < 2);
      const isSpanStart = (i === 0 || i === 2);
      const spanBars = (i === 0) ? 2 : (i === 2 ? 3 : 0);
      const barTag = (i === 0) ? "BARS 46–47 • BAR A" : (i === 2 ? "BARS 48–50 • BAR B (APPLAUSE)" : "");
      const activeBarSigns = isBarA ? "HEARTBEAT GROW STRONG" : "SHOUT CELEBRATE NOW";
      measures.push({
        displayLabel: `BAR ${barNum}`,
        masterBar: barNum,
        phraseIndex: 'SPIRAL',
        lyric: '(Sustain "Ahhh" while signers build to visual applause)',
        aslGloss: "HEARTBEAT GROW STRONG, SHOUT CELEBRATE NOW",
        barSigns: activeBarSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        isSpanStart: isSpanStart,
        spanBars: spanBars,
        barTag: barTag,
        signHint: isBarA ? "Signers: HEARTBEAT GROW STRONG (Bars 46–47)" : "Signers: SHOUT CELEBRATE NOW (Bars 48–50) — build to visual applause on Bar 50!",
        aslWebpUrl: "",
        bpm: bpm,
        isWarmup: false,
        bass: [0, 1, 2, 3], // quarter notes
        snare: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // eighth notes
        clap: [0, 1, 2, 3], // every beat
        hoot: (i === 0) ? { startBeat: 0, durationBeats: 20, label: "SUSTAIN WASH (BARS 46–50)" } : null
      });
    }
    return {
      title: "SCHEFFER SPIRAL OUT // BARS 46–50 (90–100 BPM / 15 SECONDS)",
      totalMeasures: 5,
      tempoMode: 'ramp',
      baseBpm: 90,
      measures: measures
    };
  }

  if (currentScoreMode === 'full') {
    // Full 50-Bar Performance: Bars 1-40 rolling loop, 41-45 lift, 46-50 spiral out
    const measures = [];
    // 1-40: Rolling Loop
    for (let i = 0; i < 40; i++) {
      const canonicalMasterBar = ((i + selectedSession - 1) % 14) + 1;
      const phraseIdx = Math.floor((canonicalMasterBar - 1) / 2);
      const measureInPhrase = (canonicalMasterBar - 1) % 2;
      const phrase = MASTER_LOOP_PHRASES[phraseIdx];
      const mData = phrase.measures[measureInPhrase];

      const isBarA = measureInPhrase === 0;
      let lyricText = phrase.lyric;
      let barSigns = isBarA ? phrase.barASigns : phrase.barBSigns;
      let aslGloss = phrase.aslGloss;
      let hintText = phrase.signHint;
      let phraseId = phrase.phraseIndex;
      let isWarmup = false;

      // SET 1 (Bars 1 to 14): Warm-up audience with no words until Bar 14!
      if (isWarmupMode && i < 13) {
        lyricText = "(Instrumental Warm-Up)";
        hintText = "Audience & ensemble warm-up — building pulse and percussion";
        barSigns = "";
        aslGloss = "";
        phraseId = "WARM-UP";
        isWarmup = true;
      } else if (isWarmupMode && i === 13) {
        lyricText = "“Love your neighbor, we stand as one!”";
        hintText = "First vocal entrance! Signers cue audience: WE STAND TOGETHER";
        barSigns = phrase.barBSigns;
        aslGloss = phrase.aslGloss;
        phraseId = "WARM-UP FINALE";
        isWarmup = false;
      } else {
        // Normal captioning (Bars 15-40, or Bars 1-40 when warm-up disabled)
        const activeBar = isWarmupMode ? (((i - 14 + selectedSession - 1) % 14) + 1) : canonicalMasterBar;
        const activePhraseIdx = Math.floor((activeBar - 1) / 2);
        const activeMeasureInPhrase = (activeBar - 1) % 2;
        const activePhrase = MASTER_LOOP_PHRASES[activePhraseIdx];
        const activeIsBarA = activeMeasureInPhrase === 0;
        lyricText = activePhrase.lyric;
        barSigns = activeIsBarA ? activePhrase.barASigns : activePhrase.barBSigns;
        aslGloss = activePhrase.aslGloss;
        hintText = activePhrase.signHint;
        phraseId = activePhrase.phraseIndex;
        isWarmup = false;
      }

      measures.push({
        displayLabel: `BAR ${i + 1}`,
        masterBar: canonicalMasterBar,
        phraseIndex: phraseId,
        lyric: lyricText,
        aslGloss: aslGloss,
        barSigns: barSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        signHint: hintText,
        aslWebpUrl: isWarmup ? "" : phrase.aslWebpUrl,
        measureInPhrase: measureInPhrase,
        bpm: 80,
        isWarmup: isWarmup,
        bass: mData.bass,
        snare: mData.snare,
        clap: mData.clap,
        hoot: mData.hoot
      });
    }
    // 41-45: The Lift (Tempo rises 80 -> 90 BPM for 15s; Bars 41-42 Bar A, Bars 43-45 Bar B)
    for (let i = 0; i < 5; i++) {
      const barNum = 41 + i;
      const prog = i / 4;
      const isBarA = (i < 2);
      const isSpanStart = (i === 0 || i === 2);
      const spanBars = (i === 0) ? 2 : (i === 2 ? 3 : 0);
      const barTag = (i === 0) ? "BARS 41–42 • BAR A" : (i === 2 ? "BARS 43–45 • BAR B (HELD)" : "");
      const activeBarSigns = isBarA ? "ALL PEOPLE JOIN" : "CONNECT ONE WORLD";
      measures.push({
        displayLabel: `BAR ${barNum}`,
        masterBar: barNum,
        phraseIndex: 'LIFT',
        lyric: "All people join, one connected world!",
        aslGloss: "ALL PEOPLE JOIN, CONNECT ONE WORLD",
        barSigns: activeBarSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        isSpanStart: isSpanStart,
        spanBars: spanBars,
        barTag: barTag,
        signHint: isBarA ? "Signers: ALL PEOPLE JOIN (Bars 41–42)" : "Signers: CONNECT ONE WORLD (Bars 43–45) — hold lifted through Bar 45 (80→90 BPM)",
        aslWebpUrl: "",
        bpm: 80 + prog * 10,
        isWarmup: false,
        bass: [0, 1, 2, 3],
        snare: [0.5, 1.5, 2.5, 3.5],
        clap: [1, 3],
        hoot: (barNum === 41 || barNum === 43) ? { startBeat: 0, durationBeats: 2, label: "HOOT (2 BEATS)" } : null
      });
    }
    // 46-50: Spiral Out (Tempo rises 90 -> 100 BPM for last 15s; Bars 46-47 Bar A, Bars 48-50 Bar B in last bars!)
    for (let i = 0; i < 5; i++) {
      const barNum = 46 + i;
      const prog = i / 4;
      const isBarA = (i < 2);
      const isSpanStart = (i === 0 || i === 2);
      const spanBars = (i === 0) ? 2 : (i === 2 ? 3 : 0);
      const barTag = (i === 0) ? "BARS 46–47 • BAR A" : (i === 2 ? "BARS 48–50 • BAR B (APPLAUSE)" : "");
      const activeBarSigns = isBarA ? "HEARTBEAT GROW STRONG" : "SHOUT CELEBRATE NOW";
      measures.push({
        displayLabel: `BAR ${barNum}`,
        masterBar: barNum,
        phraseIndex: 'SPIRAL',
        lyric: '(Sustain "Ahhh" while signers build to visual applause)',
        aslGloss: "HEARTBEAT GROW STRONG, SHOUT CELEBRATE NOW",
        barSigns: activeBarSigns,
        barLabel: isBarA ? "Bar A" : "Bar B",
        isSpanStart: isSpanStart,
        spanBars: spanBars,
        barTag: barTag,
        signHint: isBarA ? "Signers: HEARTBEAT GROW STRONG (Bars 46–47)" : "Signers: SHOUT CELEBRATE NOW (Bars 48–50) — build to visual applause on Bar 50!",
        aslWebpUrl: "",
        bpm: 90 + prog * 10,
        isWarmup: false,
        bass: [0, 1, 2, 3],
        snare: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
        clap: [0, 1, 2, 3],
        hoot: (i === 0) ? { startBeat: 0, durationBeats: 20, label: "SUSTAIN WASH (BARS 46–50)" } : null
      });
    }

    return {
      title: `FULL 50-BAR SESSION (SESSION ${selectedSession} OFFSET)`,
      totalMeasures: 50,
      tempoMode: 'full',
      baseBpm: 80,
      measures: measures
    };
  }

  if (currentScoreMode === 'overlay') {
    // 14-Session Spiraling Staircase Overlay (Bars 1 to 64 // ~3:00 total performance)
    const measures = [];
    const totalBars = 64;

    for (let t = 0; t < totalBars; t++) {
      const barNum = t + 1;
      let bpm = 80;
      let phraseLabel = 'ROLLING LOOP';
      let lyricLine = '“Love your neighbor, near and far”';

      if (barNum <= 40) {
        bpm = 80;
        phraseLabel = `BARS 1–40 // ROLLING LOOP (80 BPM)`;
      } else if (barNum <= 50) {
        const prog = (barNum - 41) / 9;
        bpm = 80 + prog * 10; // Ramps 80 -> 90 BPM
        phraseLabel = `BARS 41–50 // THE LIFT (80→90 BPM)`;
        lyricLine = '“All people join, one connected world!”';
      } else {
        const prog = (barNum - 51) / 13;
        bpm = 90 + Math.min(1.0, prog) * 10; // Ramps 90 -> 100 BPM
        phraseLabel = `BARS 51–64 // SCHEFFER SPIRAL (90→100 BPM)`;
        lyricLine = '(Sustain "Ahhh" while signers build to visual applause)';
      }

      // Check which sessions are playing and aggregate their rhythms
      const bassBeats = new Set();
      const snareBeats = new Set();
      const clapBeats = new Set();
      let hootObj = null;
      let activeSessionsCount = 0;

      for (let s = 1; s <= 14; s++) {
        if (barNum >= s && barNum < s + 50) {
          activeSessionsCount++;
          const relBar = barNum - s + 1; // 1 to 50
          if (relBar <= 40) {
            const masterBar = ((barNum - 1) % 14) + 1;
            const phraseIdx = Math.floor((masterBar - 1) / 2);
            const mInPhrase = (masterBar - 1) % 2;
            const p = MASTER_LOOP_PHRASES[phraseIdx];
            const mD = p.measures[mInPhrase];
            mD.bass.forEach(b => bassBeats.add(b));
            mD.snare.forEach(b => snareBeats.add(b));
            mD.clap.forEach(b => clapBeats.add(b));
            if (mD.hoot) hootObj = mD.hoot;
          } else if (relBar <= 45) {
            [0, 1, 2, 3].forEach(b => bassBeats.add(b));
            [0.5, 1.5, 2.5, 3.5].forEach(b => snareBeats.add(b));
            [1, 3].forEach(b => clapBeats.add(b));
            if (relBar === 41 || relBar === 43) {
              hootObj = { startBeat: 0, durationBeats: 2, label: "HOOT (2 BEATS)" };
            }
          } else {
            [0, 1, 2, 3].forEach(b => bassBeats.add(b));
            [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach(b => snareBeats.add(b));
            [0, 1, 2, 3].forEach(b => clapBeats.add(b));
            if (relBar === 46) {
              hootObj = { startBeat: 0, durationBeats: 20, label: "SUSTAIN WASH" };
            }
          }
        }
      }

      measures.push({
        displayLabel: `BAR ${barNum}`,
        masterBar: barNum,
        phraseIndex: 'OVERLAY',
        lyric: `${activeSessionsCount} SESSIONS ACTIVE • ${lyricLine}`,
        aslGloss: "ALL SESSIONS INTERLOCKING SPIRAL",
        barSigns: "",
        barLabel: `Timeline Bar ${barNum}`,
        signHint: `Timeline Bar ${barNum} // ${activeSessionsCount} active session tracks`,
        aslWebpUrl: "",
        bpm: bpm,
        isWarmup: false,
        activeSessionsCount: activeSessionsCount,
        bass: Array.from(bassBeats).sort((a,b) => a-b),
        snare: Array.from(snareBeats).sort((a,b) => a-b),
        clap: Array.from(clapBeats).sort((a,b) => a-b),
        hoot: hootObj
      });
    }

    return {
      title: "14-SESSION SPIRAL OVERLAY (64 BARS // ~3 MIN FINAL PERFORMANCE)",
      totalMeasures: totalBars,
      tempoMode: 'overlay',
      baseBpm: 80,
      measures: measures
    };
  }

  return null;
}

/* --- 13.5 Render UI (Session Pills, Ruler, 5 Lanes) --- */

function renderSessionPills() {
  if (!sessionPillsRack) return;
  sessionPillsRack.innerHTML = '';

  for (let s = 1; s <= 14; s++) {
    const btn = document.createElement('button');
    btn.className = `session-pill-btn ${s === selectedSession ? 'active' : ''}`;
    btn.dataset.session = s;
    btn.textContent = `S${s} (Bar ${s})`;
    btn.title = `Start ensemble at Bar ${s} of Master Loop`;
    btn.addEventListener('click', () => {
      selectedSession = s;
      document.querySelectorAll('.session-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderScoreMeasureRuler();
      renderScoreLanes();
      updateCaptionCard(0, 0);
      showToast(`🎯 SESSION ${s} SELECTED (START AT BAR ${s})`);
    });
    sessionPillsRack.appendChild(btn);
  }
}

/* --- 13.4b Dynamic Score Visuals & Interactive Seek --- */

function updateScoreTempoVisuals(bpm) {
  const scoreWindow = document.querySelector('.score-window');
  if (!scoreWindow) return;

  if (bpm <= 80) {
    scoreWindow.style.backgroundColor = 'rgba(12, 14, 22, 0.97)';
    scoreWindow.style.borderColor = 'var(--border-color)';
    scoreWindow.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.85)';
    return;
  }

  if (bpm <= 90) {
    // 80 -> 90 BPM (The Lift): Faint red ambient shift
    const t = (bpm - 80) / 10;
    const r = Math.round(12 + (38 - 12) * t);
    const g = Math.round(14 + (14 - 14) * t);
    const b = Math.round(22 + (20 - 22) * t);
    scoreWindow.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.97)`;
    scoreWindow.style.borderColor = `rgba(255, 60, 90, ${0.3 + t * 0.35})`;
    scoreWindow.style.boxShadow = `0 20px 60px rgba(0, 0, 0, 0.85), 0 0 ${15 + t * 25}px rgba(255, 60, 90, ${0.2 + t * 0.25})`;
  } else {
    // 90 -> 100 BPM (Spiral Out): Redder, deeper glowing crimson shift
    const t = Math.min(1.0, (bpm - 90) / 10);
    const r = Math.round(38 + (70 - 38) * t);
    const g = Math.round(14 + (10 - 14) * t);
    const b = Math.round(20 + (22 - 20) * t);
    scoreWindow.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.98)`;
    scoreWindow.style.borderColor = `rgba(255, 30, 60, ${0.65 + t * 0.35})`;
    scoreWindow.style.boxShadow = `0 20px 60px rgba(0, 0, 0, 0.85), 0 0 ${35 + t * 45}px rgba(255, 30, 60, ${0.4 + t * 0.4})`;
  }
}

function seekToMeasure(mIdx) {
  const scoreData = getActiveScoreData();
  if (!scoreData || mIdx < 0 || mIdx >= scoreData.totalMeasures) return;

  let accTime = 0;
  for (let i = 0; i < mIdx; i++) {
    const mBpm = scoreData.measures[i].bpm || scoreData.baseBpm || 80;
    accTime += (60.0 / mBpm) * 4;
  }

  scorePausedElapsed = accTime;
  const now = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
  scoreStartTime = now - accTime;
  lastTriggeredStep = -1;

  if (currentScoreMode === 'overlay') {
    drawStaircaseCanvas(mIdx, 0);
  } else {
    updateCaptionCard(mIdx, 0);
    const measureBlocks = document.querySelectorAll('.ruler-measure-block');
    const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
    if (measureBlocks.length > mIdx && scoreGridWrapper && scorePlayhead) {
      const targetBlock = measureBlocks[mIdx];
      const blockRect = targetBlock.getBoundingClientRect();
      const wrapperRect = scoreGridWrapper.getBoundingClientRect();
      const playheadX = (blockRect.left - wrapperRect.left + scoreGridWrapper.scrollLeft);
      scorePlayhead.style.left = `${playheadX}px`;
    }
  }

  if (isScorePlaying) {
    updateScorePlayhead();
  }
}

/* --- 13.5 14-Session Spiraling Staircase Overlay (Viewport-Fit Canvas Engine) --- */

let staircaseCanvas = document.getElementById('staircase-canvas');
let staircaseTooltip = document.getElementById('staircase-tooltip');
let isStaircaseEventsBound = false;
let hoveredOverlayBar = -1;
let hoveredOverlaySession = -1;
let currentOverlayMeasureIdx = 0;
let currentOverlayBeatFloat = 0;

function initStaircaseCanvasEvents() {
  if (isStaircaseEventsBound) return;
  if (!staircaseCanvas) staircaseCanvas = document.getElementById('staircase-canvas');
  if (!staircaseTooltip) staircaseTooltip = document.getElementById('staircase-tooltip');
  if (!staircaseCanvas) return;
  isStaircaseEventsBound = true;

  staircaseCanvas.addEventListener('pointermove', (e) => {
    if (currentScoreMode !== 'overlay') return;
    const rect = staircaseCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const w = rect.width;
    const h = rect.height;
    const headerW = Math.max(88, Math.min(125, Math.floor(w * 0.085)));
    const topRulerH = 28;
    const gridW = w - headerW - 8;
    const gridH = h - topRulerH - 4;
    const barW = gridW / 64;
    const rowH = gridH / 14;

    if (x >= headerW && y >= topRulerH && x <= headerW + gridW && y <= topRulerH + gridH) {
      const bar = Math.min(64, Math.max(1, Math.floor((x - headerW) / barW) + 1));
      const row = Math.min(13, Math.max(0, Math.floor((y - topRulerH) / rowH)));
      
      const sessionList = [];
      if (staircaseAscending) {
        for (let s = 14; s >= 1; s--) sessionList.push(s);
      } else {
        for (let s = 1; s <= 14; s++) sessionList.push(s);
      }
      const s = sessionList[row];
      hoveredOverlayBar = bar;
      hoveredOverlaySession = s;

      // Tooltip HTML content
      const relBar = bar - s + 1;
      let phaseHtml = '';
      if (bar < s) {
        phaseHtml = `<span style="color:#8892b0;">Pre-Entrance Silence (Enters at Bar ${s})</span>`;
      } else if (relBar <= 40) {
        const mBar = ((bar - 1) % 14) + 1;
        const pIdx = Math.floor((mBar - 1) / 2);
        const p = MASTER_LOOP_PHRASES[pIdx];
        const signs = (mBar - 1) % 2 === 0 ? p.barASigns : p.barBSigns;
        phaseHtml = `<b style="color:#ffd166;">Rolling Loop (Bar ${relBar}/50 • M${mBar})</b><br>ASL: <b style="color:#fff;">${signs}</b><br><span style="color:#a0aec0;font-size:0.65rem;">“${p.lyric}”</span>`;
      } else if (relBar <= 45) {
        const isA = (relBar - 41) < 2;
        const signs = isA ? "ALL PEOPLE JOIN" : "CONNECT ONE WORLD";
        phaseHtml = `<b style="color:#ff758f;">THE LIFT (80→90 BPM • Bar ${relBar}/50)</b><br>ASL: <b style="color:#fff;">${signs}</b>`;
      } else if (relBar <= 50) {
        const isA = (relBar - 46) < 2;
        const signs = isA ? "HEARTBEAT GROW STRONG" : "SHOUT CELEBRATE NOW";
        phaseHtml = `<b style="color:#ff3355;">SPIRAL OUT (90→100 BPM • Bar ${relBar}/50)</b><br>ASL: <b style="color:#fff;">${signs}</b>`;
      } else if (relBar === 51) {
        phaseHtml = `<b style="color:#ffd700;">FINAL CUTOFF CHORD & SILENCE</b>`;
      } else {
        phaseHtml = `<span style="color:#666;">Session Complete</span>`;
      }

      if (staircaseTooltip) {
        const hue = Math.round((s - 1) * (360 / 14));
        staircaseTooltip.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="background:hsl(${hue},90%,55%);color:#000;font-weight:bold;padding:1px 6px;border-radius:3px;">S${s}</span>
            <b>Session ${s}</b> • <span>Timeline Bar ${bar} of 64</span>
          </div>
          ${phaseHtml}
          <div style="margin-top:5px;font-size:0.62rem;color:#00e5ff;letter-spacing:0.4px;">Click to jump playhead here</div>
        `;
        staircaseTooltip.style.display = 'block';

        const tipX = Math.max(130, Math.min(w - 140, x));
        const tipY = Math.max(65, y - 10);
        staircaseTooltip.style.left = `${tipX}px`;
        staircaseTooltip.style.top = `${tipY}px`;
      }

      drawStaircaseCanvas();
    } else {
      if (staircaseTooltip) staircaseTooltip.style.display = 'none';
      hoveredOverlayBar = -1;
      hoveredOverlaySession = -1;
      drawStaircaseCanvas();
    }
  });

  staircaseCanvas.addEventListener('pointerleave', () => {
    if (staircaseTooltip) staircaseTooltip.style.display = 'none';
    hoveredOverlayBar = -1;
    hoveredOverlaySession = -1;
    drawStaircaseCanvas();
  });

  staircaseCanvas.addEventListener('pointerdown', (e) => {
    if (currentScoreMode !== 'overlay') return;
    const rect = staircaseCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const headerW = Math.max(88, Math.min(125, Math.floor(w * 0.085)));
    const gridW = w - headerW - 8;
    const barW = gridW / 64;

    if (x >= headerW) {
      const barIdx = Math.min(63, Math.max(0, Math.floor((x - headerW) / barW)));
      seekToMeasure(barIdx);
      drawStaircaseCanvas();
    }
  });

  window.addEventListener('resize', () => {
    if (currentScoreMode === 'overlay') {
      drawStaircaseCanvas();
    }
  });
}

function renderStaircaseOverlay() {
  if (!staircaseCanvas) staircaseCanvas = document.getElementById('staircase-canvas');
  if (!staircaseTooltip) staircaseTooltip = document.getElementById('staircase-tooltip');
  initStaircaseCanvasEvents();
  drawStaircaseCanvas();
}

function drawRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawStaircaseCanvas(currentMeasureIdx = currentOverlayMeasureIdx, beatInMeasureFloat = currentOverlayBeatFloat) {
  currentOverlayMeasureIdx = currentMeasureIdx;
  currentOverlayBeatFloat = beatInMeasureFloat;

  if (!staircaseCanvas) staircaseCanvas = document.getElementById('staircase-canvas');
  if (!staircaseCanvas || currentScoreMode !== 'overlay') return;
  const ctx = staircaseCanvas.getContext('2d');
  if (!ctx) return;

  const parent = staircaseCanvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const displayW = Math.max(300, Math.floor(rect.width));
  const displayH = Math.max(200, Math.floor(rect.height));

  if (staircaseCanvas.width !== Math.floor(displayW * dpr) || staircaseCanvas.height !== Math.floor(displayH * dpr)) {
    staircaseCanvas.width = Math.floor(displayW * dpr);
    staircaseCanvas.height = Math.floor(displayH * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const w = displayW;
  const h = displayH;
  const headerW = Math.max(88, Math.min(125, Math.floor(w * 0.085)));
  const topRulerH = 28;
  const bottomMargin = 4;
  const gridW = w - headerW - 8;
  const gridH = h - topRulerH - bottomMargin;
  const barW = gridW / 64;
  const rowH = gridH / 14;

  // 1. Dark Slate Viewport Background
  ctx.fillStyle = '#080911';
  ctx.fillRect(0, 0, w, h);

  // 2. Top Measure Ruler Background
  ctx.fillStyle = '#0c0f1c';
  ctx.fillRect(0, 0, w, topRulerH);

  // Faint red tint for The Lift (Bars 41-45)
  const liftX = headerW + 40 * barW;
  const liftW = 5 * barW;
  ctx.fillStyle = 'rgba(255, 60, 90, 0.22)';
  ctx.fillRect(liftX, 0, liftW, topRulerH);

  // Redder crimson tint for Spiral Out (Bars 46-50)
  const spiralX = headerW + 45 * barW;
  const spiralW = 5 * barW;
  ctx.fillStyle = 'rgba(255, 25, 60, 0.42)';
  ctx.fillRect(spiralX, 0, spiralW, topRulerH);

  // Ruler Banners
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ff758f';
  ctx.fillText('LIFT 80→90', liftX + liftW / 2, 2);
  ctx.fillStyle = '#ff3355';
  ctx.fillText('SPIRAL 90→100', spiralX + spiralW / 2, 2);

  // Bottom border line for top ruler
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, topRulerH);
  ctx.lineTo(w, topRulerH);
  ctx.stroke();

  // Draw Ruler Measure Numbers & Ticks
  const activeTimelineBar = currentMeasureIdx + 1;
  for (let t = 1; t <= 64; t++) {
    const bx = headerW + (t - 1) * barW;

    ctx.strokeStyle = (t === 41 || t === 46 || t === 51) ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(bx, topRulerH - 7);
    ctx.lineTo(bx, topRulerH);
    ctx.stroke();

    const shouldLabel = (t === 1 || t % 4 === 0 || t === 41 || t === 45 || t === 46 || t === 50 || t === 64);
    if (shouldLabel) {
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (t === activeTimelineBar) {
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(t, bx + barW / 2, topRulerH - 12);
      } else if (t >= 41 && t <= 45) {
        ctx.fillStyle = '#ff758f';
        ctx.fillText(t, bx + barW / 2, topRulerH - 12);
      } else if (t >= 46 && t <= 50) {
        ctx.fillStyle = '#ff3355';
        ctx.fillText(t, bx + barW / 2, topRulerH - 12);
      } else {
        ctx.fillStyle = '#8892b0';
        ctx.fillText(t, bx + barW / 2, topRulerH - 12);
      }
    }
  }

  // 3. Session Rows Matrix
  const sessionList = [];
  if (staircaseAscending) {
    for (let s = 14; s >= 1; s--) sessionList.push(s);
  } else {
    for (let s = 1; s <= 14; s++) sessionList.push(s);
  }

  sessionList.forEach((s, rowIndex) => {
    const ry = topRulerH + rowIndex * rowH;
    const hue = Math.round((s - 1) * (360 / 14));

    // Zebra striping for session row
    ctx.fillStyle = rowIndex % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, ry, w, rowH);

    // Sticky Left Session Header
    const badgeW = 26;
    const badgeH = Math.min(18, Math.max(12, rowH - 6));
    const badgeY = ry + (rowH - badgeH) / 2;

    ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
    ctx.beginPath();
    drawRoundRect(ctx, 6, badgeY, badgeW, badgeH, 3);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`S${s}`, 6 + badgeW / 2, badgeY + badgeH / 2);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Bar ${s}`, 6 + badgeW + 6, ry + rowH / 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headerW - 2, ry);
    ctx.lineTo(headerW - 2, ry + rowH);
    ctx.stroke();

    // 64 Measure Cells for this Session
    for (let t = 1; t <= 64; t++) {
      const cx = headerW + (t - 1) * barW;
      const cy = ry + 1;
      const cw = Math.max(1, barW - 1.2);
      const ch = Math.max(1, rowH - 2);

      const relBar = t - s + 1;

      if (t < s) {
        // Pre-entrance staircase step (silence)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.strokeRect(cx, cy, cw, ch);
      } else if (relBar <= 40) {
        // Active Rolling Loop (40 bars)
        const masterBar = ((t - 1) % 14) + 1;
        ctx.fillStyle = `hsla(${hue}, 80%, 45%, 0.25)`;
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.5)`;
        ctx.strokeRect(cx, cy, cw, ch);

        if (masterBar === 7) {
          ctx.fillStyle = '#00e5ff';
          ctx.fillRect(cx + cw - 3, cy + 1, 2.5, 2.5);
        } else if (masterBar === 13) {
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(cx + cw - 3, cy + 1, 2.5, 2.5);
        }

        if (cw >= 14 && ch >= 12) {
          ctx.fillStyle = '#ffd166';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`M${masterBar}`, cx + cw / 2, cy + ch / 2);
        }
      } else if (relBar <= 45) {
        // The Lift (Bars 41-45: 80 -> 90 BPM)
        ctx.fillStyle = 'rgba(255, 60, 90, 0.42)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = 'rgba(255, 80, 110, 0.8)';
        ctx.strokeRect(cx, cy, cw, ch);

        if (cw >= 14 && ch >= 12) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('LIFT', cx + cw / 2, cy + ch / 2);
        }
      } else if (relBar <= 50) {
        // Spiral Out (Bars 46-50: 90 -> 100 BPM)
        ctx.fillStyle = 'rgba(255, 25, 60, 0.65)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = 'rgba(255, 50, 80, 0.95)';
        ctx.strokeRect(cx, cy, cw, ch);

        if (cw >= 14 && ch >= 12) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('SPRL', cx + cw / 2, cy + ch / 2);
        }
      } else if (relBar === 51) {
        // Final Cutoff Chord
        ctx.fillStyle = 'rgba(255, 204, 0, 0.9)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(cx, cy, cw, ch);

        if (cw >= 12 && ch >= 12) {
          ctx.fillStyle = '#000';
          ctx.font = 'bold 7.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('CUT', cx + cw / 2, cy + ch / 2);
        }
      } else {
        // Post-cutoff silence
        ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
        ctx.fillRect(cx, cy, cw, ch);
      }

      // Hovered Cell Glow
      if (s === hoveredOverlaySession && t === hoveredOverlayBar) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 1, cy - 1, cw + 2, ch + 2);
      }
    }
  });

  // 4. Highlight Active Playing Bar Column
  if (activeTimelineBar >= 1 && activeTimelineBar <= 64) {
    const colX = headerW + (activeTimelineBar - 1) * barW;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.fillRect(colX, topRulerH, barW, gridH);
  }

  // 5. Sweeping Laser Playhead Line
  const playheadX = headerW + (currentMeasureIdx + (beatInMeasureFloat / 4)) * barW;
  if (playheadX >= headerW && playheadX <= headerW + gridW) {
    ctx.save();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    const badgeText = `BAR ${activeTimelineBar}`;
    ctx.font = 'bold 8.5px monospace';
    const textW = ctx.measureText(badgeText).width + 8;
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    drawRoundRect(ctx, playheadX - textW / 2, 2, textW, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, playheadX, 9);
    ctx.restore();
  }

  ctx.restore();

  // 6. Telemetry Status Bar Update
  let activeSessionsCount = 0;
  for (let s = 1; s <= 14; s++) {
    if (activeTimelineBar >= s && activeTimelineBar <= s + 50) {
      activeSessionsCount++;
    }
  }
  if (scoreMeasureVal) scoreMeasureVal.textContent = `TIMELINE BAR ${activeTimelineBar} / 64`;
  if (scoreBeatVal) scoreBeatVal.textContent = `BEAT ${Math.floor(beatInMeasureFloat) + 1}`;
  if (scoreTeleHintText) {
    scoreTeleHintText.textContent = `🌪️ ${activeSessionsCount} SESSIONS PLAYING SIMULTANEOUSLY • CLICK ANYWHERE TO JUMP • HOVER FOR SESSION ASL DETAILS`;
  }
}

function renderScoreMeasureRuler() {
  if (!scoreMeasureRuler) return;
  scoreMeasureRuler.innerHTML = '';

  const scoreData = getActiveScoreData();
  if (!scoreData) return;

  scoreData.measures.forEach((m, idx) => {
    const block = document.createElement('div');
    block.className = 'ruler-measure-block';
    block.dataset.measureIndex = idx;

    const isLift = m.phraseIndex === 'LIFT';
    const isSpiral = m.phraseIndex === 'SPIRAL';

    if (isLift) {
      block.classList.add('tempo-lift');
    } else if (isSpiral) {
      block.classList.add('tempo-spiral');
    }

    let tempoTag = '';
    if (isLift) {
      tempoTag = `<span class="ruler-tempo-tag lift">${Math.round(m.bpm)} BPM</span>`;
    } else if (isSpiral) {
      tempoTag = `<span class="ruler-tempo-tag spiral">${Math.round(m.bpm)} BPM</span>`;
    }

    block.innerHTML = `
      <span class="ruler-measure-label">${m.displayLabel}</span>
      ${tempoTag}
      <div class="ruler-beat-ticks">
        <div class="ruler-beat-tick">1</div>
        <div class="ruler-beat-tick">2</div>
        <div class="ruler-beat-tick">3</div>
        <div class="ruler-beat-tick">4</div>
      </div>
    `;
    block.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      seekToMeasure(idx);
    });
    scoreMeasureRuler.appendChild(block);
  });
}

function renderScoreLanes() {
  const scoreAslCaptionCard = document.querySelector('.score-asl-caption-card');
  const scoreZoomGroup = document.querySelector('.score-zoom-group');
  const scoreGridWrapper = document.querySelector('.score-grid-wrapper');

  if (currentScoreMode === 'overlay') {
    if (scoreAslCaptionCard) scoreAslCaptionCard.classList.add('overlay-hidden');
    if (scoreZoomGroup) scoreZoomGroup.style.display = 'none';
    if (scoreGridWrapper) scoreGridWrapper.classList.add('overlay-canvas-mode');
    if (scoreMeasureRuler) scoreMeasureRuler.style.display = 'none';
    if (scoreLanesContainer) scoreLanesContainer.style.display = 'none';
    if (scorePlayhead) scorePlayhead.style.display = 'none';
    if (scoreStaircaseContainer) scoreStaircaseContainer.style.display = 'flex';
    if (sessionBarLabel) sessionBarLabel.style.display = 'none';
    if (sessionPillsRack) sessionPillsRack.style.display = 'none';
    if (staircaseOrderControls) staircaseOrderControls.style.display = 'flex';
    renderStaircaseOverlay();
    return;
  }

  if (scoreAslCaptionCard) scoreAslCaptionCard.classList.remove('overlay-hidden');
  if (scoreZoomGroup) scoreZoomGroup.style.display = 'flex';
  if (scoreGridWrapper) scoreGridWrapper.classList.remove('overlay-canvas-mode');
  if (scoreMeasureRuler) scoreMeasureRuler.style.display = 'flex';
  if (scoreLanesContainer) scoreLanesContainer.style.display = 'flex';
  if (scorePlayhead) scorePlayhead.style.display = 'block';
  if (scoreStaircaseContainer) scoreStaircaseContainer.style.display = 'none';
  if (sessionBarLabel) sessionBarLabel.style.display = 'flex';
  if (sessionPillsRack) sessionPillsRack.style.display = 'flex';
  if (staircaseOrderControls) staircaseOrderControls.style.display = 'none';

  if (!scoreLanesContainer) return;
  scoreLanesContainer.innerHTML = '';

  const scoreData = getActiveScoreData();
  if (!scoreData) return;

  ENSEMBLE_LANES.forEach((cfg) => {
    const lane = document.createElement('div');
    lane.className = `score-lane lane-${cfg.id}`;

    // Lane Header Dock
    const header = document.createElement('div');
    header.className = 'lane-header';
    header.innerHTML = `
      <div class="lane-num-badge" style="background:${cfg.color};">${cfg.badge}</div>
      <div class="lane-info">
        <span class="lane-title" style="color:${cfg.color};">${cfg.name}</span>
        <span class="lane-key-hint">${cfg.keyHint}</span>
      </div>
    `;
    lane.appendChild(header);

    // Track Measures
    const track = document.createElement('div');
    track.className = 'lane-track';

    scoreData.measures.forEach((m, mIdx) => {
      const measure = document.createElement('div');
      measure.className = 'lane-measure';
      measure.dataset.measureIndex = mIdx;

      // Add faint red / redder shading to graph measures
      if (m.phraseIndex === 'LIFT') {
        measure.classList.add('tempo-lift');
      } else if (m.phraseIndex === 'SPIRAL') {
        measure.classList.add('tempo-spiral');
      }

      if (cfg.id === 'lyrics') {
        // Lyrics Lane: show warm-up, multi-bar spanning blocks, or 1-bar ASL Column Block
        if (m.isWarmup) {
          if (mIdx === 0) {
            const block = document.createElement('div');
            block.className = 'lyric-phrase-block warmup-block';
            block.dataset.measureStart = 0;
            block.dataset.measureEnd = 12;
            block.style.width = 'calc(var(--measure-width, 160px) * 13 - 6px)';
            block.innerHTML = `<span class="warmup-label" style="opacity:0.85;">(Instrumental Warm-Up // Bars 1–13 • Building Pulse with Ensemble)</span>`;
            measure.appendChild(block);
          }
        } else if (m.phraseIndex === 'WARM-UP FINALE') {
          // Bar 14 of Warm-Up pass
          const block = document.createElement('div');
          block.className = 'lyric-phrase-block asl-column-block';
          block.dataset.measureStart = mIdx;
          block.dataset.measureEnd = mIdx;
          block.style.width = 'calc(var(--measure-width, 160px) - 6px)';
          block.title = 'Bar 14: WE STAND TOGETHER';
          block.innerHTML = `
            <div class="asl-col-header">
              <span class="asl-bar-tag">BAR 14</span>
            </div>
            <div class="asl-col-stack">
              <span class="asl-col-word">WE</span>
              <span class="asl-col-word">STAND</span>
              <span class="asl-col-word">TOGETHER</span>
            </div>
          `;
          measure.appendChild(block);
        } else if (m.phraseIndex === 'LIFT' || m.phraseIndex === 'SPIRAL') {
          // Multi-Bar The Lift (Bars 41-45) or Spiral Out (Bars 46-50)
          // Renders ONE wide spanning block at the start of each phrase part (Bar A or Bar B)
          if (m.isSpanStart) {
            const block = document.createElement('div');
            const spanClass = m.phraseIndex === 'LIFT' ? 'tempo-lift-block' : 'tempo-spiral-block';
            block.className = `lyric-phrase-block asl-column-block asl-span-block ${spanClass}`;
            const spanCount = m.spanBars || 1;
            block.dataset.measureStart = mIdx;
            block.dataset.measureEnd = mIdx + spanCount - 1;
            block.style.width = `calc(var(--measure-width, 160px) * ${spanCount} - 6px)`;
            block.title = `${m.barTag}: ${m.barSigns}`;

            const signsStr = m.barSigns || '';
            const words = signsStr ? signsStr.trim().split(/\s+/) : [];
            const wordsHtml = words.map(w => `<span class="asl-col-word">${w}</span>`).join('');

            block.innerHTML = `
              <div class="asl-col-header">
                <span class="asl-bar-tag">${m.barTag}</span>
              </div>
              <div class="asl-col-stack">
                ${wordsHtml}
              </div>
            `;
            measure.appendChild(block);
          }
        } else {
          // Standard 1-Bar ASL Column Block (one per measure for Bars 1-40)
          const block = document.createElement('div');
          block.className = 'lyric-phrase-block asl-column-block';
          block.dataset.measureStart = mIdx;
          block.dataset.measureEnd = mIdx;
          block.style.width = 'calc(var(--measure-width, 160px) - 6px)';
          block.title = `${m.barLabel || ''}: ${m.barSigns || ''}`;

          const signsStr = m.barSigns || '';
          const words = signsStr ? signsStr.trim().split(/\s+/) : [];
          const wordsHtml = words.map(w => `<span class="asl-col-word">${w}</span>`).join('');

          const barTag = m.barLabel ? `${m.barLabel}` : `BAR ${mIdx + 1}`;

          block.innerHTML = `
            <div class="asl-col-header">
              <span class="asl-bar-tag">${barTag}</span>
            </div>
            <div class="asl-col-stack">
              ${wordsHtml}
            </div>
          `;
          measure.appendChild(block);
        }
      } else {
        // Rhythm / Hoot Lane
        const hits = m[cfg.id] || [];

        // 4 Beats per measure
        for (let b = 0; b < 4; b++) {
          const beatSlot = document.createElement('div');
          beatSlot.className = 'lane-beat';
          const globalBeatIndex = mIdx * 4 + b;
          beatSlot.dataset.globalBeat = globalBeatIndex;

          const hasQuarterHit = Array.isArray(hits) && hits.includes(b);
          const hasEighthHit = Array.isArray(hits) && hits.includes(b + 0.5);

          if (hasQuarterHit && hasEighthHit) {
            beatSlot.classList.add('has-sub-beat');
          }

          // Regular Quarter Beat Hit
          if (hasQuarterHit) {
            const hitBox = document.createElement('div');
            hitBox.className = `hit-box hit-${cfg.id}`;
            hitBox.textContent = b + 1;
            hitBox.dataset.beatIndex = globalBeatIndex;
            hitBox.title = `Click to play ${cfg.name}`;
            hitBox.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              triggerEnsembleVoice(cfg.id, 1.0);
            });
            beatSlot.appendChild(hitBox);
          }

          // Eighth-Note Sub-beat Hit (the "and" of beat: e.g. b + 0.5)
          if (hasEighthHit) {
            const subHit = document.createElement('div');
            subHit.className = `hit-box hit-${cfg.id} sub-beat`;
            subHit.textContent = '&';
            subHit.dataset.subBeatIndex = globalBeatIndex + 0.5;
            subHit.title = `${cfg.name} Upbeat (&)`;
            subHit.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              triggerEnsembleVoice(cfg.id, 0.5);
            });
            beatSlot.appendChild(subHit);
          }

          measure.appendChild(beatSlot);
        }

        // Sustained note block (for Hoot)
        if (cfg.id === 'hoot' && m.hoot) {
          const sustain = document.createElement('div');
          sustain.className = 'sustain-block';
          const durationBeats = m.hoot.durationBeats || 2;
          const beatWidthPercent = (durationBeats / 4) * 100;
          sustain.style.width = `calc(${beatWidthPercent}% - 6px)`;
          sustain.style.left = `${(m.hoot.startBeat / 4) * 100}%`;
          sustain.innerHTML = `<span class="sustain-block-label">${m.hoot.label || 'SUSTAIN'}</span>`;
          measure.appendChild(sustain);
        }
      }

      track.appendChild(measure);
    });

    lane.appendChild(track);
    scoreLanesContainer.appendChild(lane);
  });
}

function triggerEnsembleVoice(voiceId, durationSec = 1.0) {
  if (voiceId === 'bass') {
    playSynthBass();
    triggerPillar('pillar_ul');
  } else if (voiceId === 'snare') {
    playSynthSnare();
    triggerPillar('pillar_lr');
  } else if (voiceId === 'clap') {
    playSynthClap();
    triggerPillar('pillar_ll');
  } else if (voiceId === 'hoot') {
    playSynthHoot(null, durationSec);
    triggerPillar('pillar_ur');
  }
}

/* --- 13.6 Synchronized Caption & ASL Media Card --- */

function updateCaptionCard(measureIndex, beatInBar, beatProgress = 0) {
  const scoreData = getActiveScoreData();
  if (!scoreData || measureIndex >= scoreData.measures.length) return;

  const currentMeasure = scoreData.measures[measureIndex];

  if (captionPhraseBadge) {
    const barTag = currentMeasure.barLabel ? ` • ${currentMeasure.barLabel}` : '';
    const signsPreview = currentMeasure.barSigns ? ` [${currentMeasure.barSigns}]` : '';
    if (currentMeasure.phraseIndex === 'LIFT') {
      captionPhraseBadge.textContent = `THE LIFT // ${currentMeasure.displayLabel}${barTag}${signsPreview}`;
    } else if (currentMeasure.phraseIndex === 'SPIRAL') {
      captionPhraseBadge.textContent = `SPIRAL OUT // ${currentMeasure.displayLabel}${barTag}${signsPreview}`;
    } else if (typeof currentMeasure.phraseIndex === 'number') {
      captionPhraseBadge.textContent = `PHRASE ${currentMeasure.phraseIndex} // ${currentMeasure.displayLabel}${barTag}${signsPreview}`;
    } else {
      captionPhraseBadge.textContent = `${currentMeasure.phraseIndex} // ${currentMeasure.displayLabel}${barTag}${signsPreview}`;
    }
  }

  if (captionTempoBadge) {
    captionTempoBadge.textContent = `${Math.round(currentMeasure.bpm || currentBpm)} BPM`;
  }

  if (captionLyricText) {
    const txt = currentMeasure.lyric;
    if (txt.startsWith('(') || txt.startsWith('“') || txt.startsWith('"')) {
      captionLyricText.textContent = txt;
    } else {
      captionLyricText.textContent = `“${txt}”`;
    }
  }

  if (captionSignHint) {
    captionSignHint.textContent = '';
    captionSignHint.style.display = 'none';
  }

  // Calculate phrase progress (0% -> 100%)
  if (phraseProgressBar) {
    let progressPercent = 0;
    if (currentScoreMode === 'lift' || currentScoreMode === 'spiral') {
      progressPercent = ((measureIndex + (beatInBar + beatProgress) / 4) / scoreData.totalMeasures) * 100;
    } else if (currentMeasure.phraseIndex === 'LIFT') {
      const liftRel = measureIndex - 40;
      progressPercent = ((liftRel + (beatInBar + beatProgress) / 4) / 5) * 100;
    } else if (currentMeasure.phraseIndex === 'SPIRAL') {
      const spiralRel = measureIndex - 45;
      progressPercent = ((spiralRel + (beatInBar + beatProgress) / 4) / 5) * 100;
    } else {
      const measureInTwoBar = (currentMeasure.measureInPhrase || 0) % 2;
      progressPercent = ((measureInTwoBar * 4 + beatInBar + beatProgress) / 8) * 100;
    }
    phraseProgressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
  }

  // Highlight active lyric phrase block in score lane
  document.querySelectorAll('.lyric-phrase-block').forEach(b => {
    const start = parseInt(b.dataset.measureStart, 10);
    const end = parseInt(b.dataset.measureEnd, 10);
    if (!isNaN(start) && !isNaN(end)) {
      b.classList.toggle('active', isScorePlaying && measureIndex >= start && measureIndex <= end);
    }
  });

  // ASL WebP Media Slot
  if (aslVideoAsset && aslPlaceholder) {
    if (currentMeasure.aslWebpUrl && currentMeasure.aslWebpUrl.trim().length > 0) {
      aslVideoAsset.src = currentMeasure.aslWebpUrl;
      aslVideoAsset.style.display = 'block';
      aslPlaceholder.style.display = 'none';
    } else {
      aslVideoAsset.style.display = 'none';
      aslPlaceholder.style.display = 'flex';
    }
  }
}

/* --- 13.7 Count-In Controller --- */

function startCountInSequence() {
  if (!isCountInEnabled) {
    launchScorePlayback();
    return;
  }

  isCountingIn = true;
  countInStep = 0;
  if (countInOverlay) countInOverlay.classList.add('active');

  const stepDurationMs = (60.0 / currentBpm) * 1000;
  stepCountIn(stepDurationMs);
}

function stepCountIn(stepDurationMs) {
  if (!isCountingIn) return;
  countInStep++;

  if (countInNum) {
    countInNum.textContent = countInStep;
    countInNum.style.animation = 'none';
    void countInNum.offsetWidth; // re-trigger animation
    countInNum.style.animation = 'countPulse 0.35s ease-out';
  }

  if (countInLabel) {
    countInLabel.textContent = `COUNT-IN: BEAT ${countInStep} OF 4`;
  }

  // Play metronome click on count-in
  if (isAudioClickEnabled && audioEngine.ctx) {
    playMetronomeClick(audioEngine.ctx.currentTime, countInStep === 1);
  }

  if (countInStep >= 4) {
    countInTimer = setTimeout(() => {
      isCountingIn = false;
      if (countInOverlay) countInOverlay.classList.remove('active');
      launchScorePlayback();
    }, stepDurationMs);
  } else {
    countInTimer = setTimeout(() => stepCountIn(stepDurationMs), stepDurationMs);
  }
}

function launchScorePlayback() {
  isScorePlaying = true;
  const now = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
  scoreStartTime = now - scorePausedElapsed;
  lastTriggeredStep = -1;
  if (btnScorePlay) {
    btnScorePlay.textContent = 'PAUSE';
    btnScorePlay.classList.add('active');
  }
}

/* --- 13.8 Playhead & Audio Scheduling Engine --- */

function updateScorePlayhead() {
  if (!isScoreWindowOpen || !isScorePlaying || isCountingIn || !scorePlayhead) return;

  const scoreData = getActiveScoreData();
  if (!scoreData || scoreData.totalMeasures === 0) return;

  const timeSec = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
  const elapsed = Math.max(0, timeSec - scoreStartTime);

  // 1. Calculate total duration across ALL measures in this score section
  let totalScoreDuration = 0;
  for (let m = 0; m < scoreData.totalMeasures; m++) {
    const mBpm = scoreData.measures[m].bpm || scoreData.baseBpm || 80;
    totalScoreDuration += (60.0 / mBpm) * 4;
  }

  // 2. Looping Check (triggers when elapsed reaches the end of the full score)
  if (elapsed >= totalScoreDuration) {
    const wasWarmupActive = isWarmupMode;
    if (wasWarmupActive) {
      // Warm-up run completed through Bar 14!
      // Disable warm-up mode automatically so all subsequent loops display full lyrics & ASL signs
      isWarmupMode = false;
      if (btnScoreWarmup) {
        btnScoreWarmup.classList.remove('active');
        btnScoreWarmup.textContent = 'WARM-UP: OFF';
      }
      renderScoreLanes();
      showToast('🎉 FIRST PASS COMPLETE // WARM-UP DISABLED & CAPTIONS ACTIVE');
    }

    if (isScoreLooping) {
      scoreStartTime = timeSec;
      scorePausedElapsed = 0;
      lastTriggeredStep = -1;
      updateScoreTempoVisuals(80);
      const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
      if (scoreGridWrapper) scoreGridWrapper.scrollLeft = 0;
      updateCaptionCard(0, 0);
      return;
    } else {
      isScorePlaying = false;
      scorePausedElapsed = 0;
      updateScoreTempoVisuals(80);
      if (btnScorePlay) {
        btnScorePlay.textContent = 'PLAY';
        btnScorePlay.classList.remove('active');
      }
      if (scorePlayhead) scorePlayhead.style.left = '170px';
      const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
      if (scoreGridWrapper) scoreGridWrapper.scrollLeft = 0;
      updateCaptionCard(0, 0);
      return;
    }
  }

  // 3. Find current measure and position within measure
  let accumulatedTime = 0;
  let currentMeasureIdx = 0;
  let beatInMeasureFloat = 0;
  let currentMeasureBpm = scoreData.baseBpm;

  for (let m = 0; m < scoreData.totalMeasures; m++) {
    const mBpm = scoreData.measures[m].bpm || scoreData.baseBpm || 80;
    const mDuration = (60.0 / mBpm) * 4;

    if (elapsed < accumulatedTime + mDuration || m === scoreData.totalMeasures - 1) {
      currentMeasureIdx = m;
      currentMeasureBpm = mBpm;
      const measureElapsed = elapsed - accumulatedTime;
      beatInMeasureFloat = Math.min(3.999, Math.max(0, measureElapsed / (60.0 / mBpm)));
      break;
    }
    accumulatedTime += mDuration;
  }

  // In Full Session mode (50 bars), auto-raise warm-up flag when advancing past Bar 14 into Bar 15!
  if (currentScoreMode === 'full' && isWarmupMode && currentMeasureIdx >= 14) {
    isWarmupMode = false;
    if (btnScoreWarmup) {
      btnScoreWarmup.classList.remove('active');
      btnScoreWarmup.textContent = 'WARM-UP: COMPLETED';
    }
    renderScoreLanes();
    showToast('🎉 FIRST SET COMPLETE // CAPTIONING ENABLED');
  }

  const beatInBar = Math.floor(beatInMeasureFloat);
  const beatProgress = beatInMeasureFloat - beatInBar;
  const globalEighthStep = Math.floor((currentMeasureIdx * 4 + beatInMeasureFloat) * 2);

  // Telemetry Display Updates
  if (scoreMeasureVal) scoreMeasureVal.textContent = `BAR ${currentMeasureIdx + 1} / ${scoreData.totalMeasures}`;
  if (scoreBeatVal) scoreBeatVal.textContent = `BEAT ${beatInBar + 1}`;
  if (scoreBpmVal) scoreBpmVal.textContent = `${Math.round(currentMeasureBpm)} BPM`;

  // Dynamic Background Color Shift keyed to BPM
  updateScoreTempoVisuals(currentMeasureBpm);

  if (currentScoreMode === 'overlay') {
    drawStaircaseCanvas(currentMeasureIdx, beatInMeasureFloat);
  } else {
    // Update Caption & ASL Card
    updateCaptionCard(currentMeasureIdx, beatInBar, beatProgress);

    // Align playhead smoothly across measure blocks
    const measureBlocks = document.querySelectorAll('.ruler-measure-block');
    const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
    if (measureBlocks.length > currentMeasureIdx && scoreGridWrapper) {
      const targetBlock = measureBlocks[currentMeasureIdx];
      const blockRect = targetBlock.getBoundingClientRect();
      const wrapperRect = scoreGridWrapper.getBoundingClientRect();

      const measureFraction = beatInMeasureFloat / 4.0;
      const playheadX = (blockRect.left - wrapperRect.left + scoreGridWrapper.scrollLeft) + (measureFraction * blockRect.width);
      scorePlayhead.style.left = `${playheadX}px`;

      // Continuous smooth camera tracking:
      // Center the camera smoothly ahead of the playhead for a silky cinematic glide
      const targetScroll = Math.max(0, playheadX - (scoreGridWrapper.clientWidth * 0.38));
      const scrollDelta = targetScroll - scoreGridWrapper.scrollLeft;
      if (Math.abs(scrollDelta) > 0.5) {
        scoreGridWrapper.scrollLeft += scrollDelta * 0.15;
      }
    }
  }

  // Trigger hits & synth guides on new eighth-note step
  if (globalEighthStep !== lastTriggeredStep) {
    lastTriggeredStep = globalEighthStep;

    const measureData = scoreData.measures[currentMeasureIdx];
    const quarterBeat = beatInBar;
    const isEighthUpbeat = (globalEighthStep % 2) === 1;

    if (!isEighthUpbeat) {
      // Quarter Note Hits (Downbeats)
      if (measureData.bass && measureData.bass.includes(quarterBeat)) {
        triggerEnsembleVoice('bass');
      }
      if (measureData.snare && measureData.snare.includes(quarterBeat)) {
        triggerEnsembleVoice('snare');
      }
      if (measureData.clap && measureData.clap.includes(quarterBeat)) {
        triggerEnsembleVoice('clap');
      }
      if (measureData.hoot && measureData.hoot.startBeat === quarterBeat) {
        const durSec = (measureData.hoot.durationBeats / (currentMeasureBpm / 60.0));
        triggerEnsembleVoice('hoot', durSec);
      }

      // Flash ONLY downbeat hit boxes exactly once on entry
      const globalBeatIndex = currentMeasureIdx * 4 + quarterBeat;
      document.querySelectorAll(`.hit-box:not(.sub-beat)[data-beat-index="${globalBeatIndex}"]`).forEach(box => {
        box.classList.add('active');
        setTimeout(() => box.classList.remove('active'), 140);
      });
    } else {
      // Eighth Note Upbeats (&)
      const subBeatVal = quarterBeat + 0.5;
      if (measureData.snare && measureData.snare.includes(subBeatVal)) {
        triggerEnsembleVoice('snare');
      }

      // Flash ONLY eighth-note sub-beat hit boxes on upbeat entry
      const globalSubBeatIndex = currentMeasureIdx * 4 + quarterBeat + 0.5;
      document.querySelectorAll(`.hit-box.sub-beat[data-sub-beat-index="${globalSubBeatIndex}"]`).forEach(box => {
        box.classList.add('active');
        setTimeout(() => box.classList.remove('active'), 140);
      });
    }
  }
}

/* --- 13.9 Zoom Controller --- */

function applyZoom(newZoom) {
  currentScoreZoom = Math.max(0.7, Math.min(2.5, Math.round(newZoom * 10) / 10));
  if (scoreZoomVal) scoreZoomVal.textContent = `${currentScoreZoom.toFixed(1)}x`;
  const measureWidth = Math.round(160 * currentScoreZoom);
  if (scoreOverlay) {
    scoreOverlay.style.setProperty('--measure-width', `${measureWidth}px`);
  }
}

/* --- 13.10 Score Overlay Init & Listeners --- */

function initScore() {
  renderSessionPills();

  if (btnScoreWarmup) {
    btnScoreWarmup.classList.toggle('active', isWarmupMode);
  }

  if (btnMusicalScore) {
    btnMusicalScore.addEventListener('click', openScoreWindow);
  }
  if (btnCloseScore) {
    btnCloseScore.addEventListener('click', closeScoreWindow);
  }
  if (scoreOverlay) {
    scoreOverlay.addEventListener('click', (e) => {
      if (e.target === scoreOverlay) closeScoreWindow();
    });
  }

  // Zoom Controls
  if (btnScoreZoomIn) {
    btnScoreZoomIn.addEventListener('click', () => {
      applyZoom(currentScoreZoom + 0.15);
    });
  }
  if (btnScoreZoomOut) {
    btnScoreZoomOut.addEventListener('click', () => {
      applyZoom(currentScoreZoom - 0.15);
    });
  }

  // Audience Warm-Up Toggle
  if (btnScoreWarmup) {
    btnScoreWarmup.addEventListener('click', () => {
      isWarmupMode = !isWarmupMode;
      btnScoreWarmup.classList.toggle('active', isWarmupMode);
      btnScoreWarmup.textContent = `WARM-UP: ${isWarmupMode ? 'AUTO' : 'OFF'}`;
      renderScoreLanes();
      updateCaptionCard(0, 0);
      showToast(`WARM-UP: ${isWarmupMode ? 'ARMED FOR PASS 1 (NO WORDS UNTIL BAR 14)' : 'OFF (ALL LYRICS SHOWN)'}`);
    });
  }

  // Section Tabs (Loop, Lift, Spiral, Full)
  scoreTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scoreTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentScoreMode = btn.dataset.mode || 'loop';
      renderScoreMeasureRuler();
      renderScoreLanes();
      updateCaptionCard(0, 0);

      // Reset playhead & pause cleanly
      isScorePlaying = false;
      scorePausedElapsed = 0;
      if (btnScorePlay) {
        btnScorePlay.textContent = 'PLAY';
        btnScorePlay.classList.remove('active');
      }
      if (isCountingIn) {
        isCountingIn = false;
        clearTimeout(countInTimer);
        if (countInOverlay) countInOverlay.classList.remove('active');
      }
      if (scorePlayhead) scorePlayhead.style.left = '170px';
      const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
      if (scoreGridWrapper) scoreGridWrapper.scrollLeft = 0;

      // Re-arm warm-up mode for Loop and Full modes
      if (currentScoreMode === 'loop' || currentScoreMode === 'full') {
        isWarmupMode = true;
        if (btnScoreWarmup) {
          btnScoreWarmup.classList.add('active');
          btnScoreWarmup.textContent = 'WARM-UP: AUTO';
        }
      }

      updateScoreTempoVisuals(80);
      const title = getActiveScoreData().title;
      showToast(`🎼 SCORE: ${title}`);
    });
  });

  // Staircase Vertical Ordering Toggle (S1 at bottom like sketch <-> S1 at top)
  if (btnToggleStaircaseOrder) {
    btnToggleStaircaseOrder.addEventListener('click', () => {
      staircaseAscending = !staircaseAscending;
      btnToggleStaircaseOrder.textContent = staircaseAscending ? 'STAIRCASE: S1 AT BOTTOM ⇅' : 'STAIRCASE: S1 AT TOP ⇅';
      drawStaircaseCanvas();
      showToast(`STAIRCASE: ${staircaseAscending ? 'S1 AT BOTTOM (SKETCH ORDER)' : 'S1 AT TOP (DAW ORDER)'}`);
    });
  }

  // Loop Toggle
  if (btnScoreLoop) {
    btnScoreLoop.addEventListener('click', () => {
      isScoreLooping = !isScoreLooping;
      btnScoreLoop.classList.toggle('active', isScoreLooping);
      btnScoreLoop.textContent = `LOOP: ${isScoreLooping ? 'ON' : 'OFF'}`;
      showToast(`LOOP: ${isScoreLooping ? 'ENABLED' : 'DISABLED'}`);
    });
  }

  // Play / Pause Button with Count-In & Pause Resume
  if (btnScorePlay) {
    btnScorePlay.addEventListener('click', () => {
      if (isScorePlaying || isCountingIn) {
        // Pause playback
        isScorePlaying = false;
        if (isCountingIn) {
          isCountingIn = false;
          clearTimeout(countInTimer);
          if (countInOverlay) countInOverlay.classList.remove('active');
        }
        const now = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
        scorePausedElapsed = Math.max(0, now - scoreStartTime);
        btnScorePlay.classList.remove('active');
        btnScorePlay.textContent = 'PLAY';
      } else {
        // Start playback with 4-beat visual count-in
        startCountInSequence();
      }
    });
  }

  // Synth Guide Audio Toggle
  if (btnScoreSynth) {
    btnScoreSynth.addEventListener('click', () => {
      isSynthGuideEnabled = !isSynthGuideEnabled;
      btnScoreSynth.classList.toggle('active', isSynthGuideEnabled);
      btnScoreSynth.textContent = `SYNTH: ${isSynthGuideEnabled ? 'ON' : 'OFF'}`;
      showToast(`SYNTH GUIDE: ${isSynthGuideEnabled ? 'ON' : 'MUTED'}`);
    });
  }

  // Count-In Toggle
  if (btnScoreCountIn) {
    btnScoreCountIn.addEventListener('click', () => {
      isCountInEnabled = !isCountInEnabled;
      btnScoreCountIn.classList.toggle('active', isCountInEnabled);
      btnScoreCountIn.textContent = `COUNT-IN: ${isCountInEnabled ? '4' : 'OFF'}`;
      showToast(`COUNT-IN: ${isCountInEnabled ? '4 BEATS' : 'OFF'}`);
    });
  }

  renderScoreMeasureRuler();
  renderScoreLanes();
  updateCaptionCard(0, 0);
}

function openScoreWindow() {
  if (!scoreOverlay) return;
  scoreOverlay.classList.add('open');
  isScoreWindowOpen = true;

  // Disable background shader canvas to eliminate GPU load and maximize FPS
  if (shaderCanvasContainer) shaderCanvasContainer.style.visibility = 'hidden';

  // Never auto-play on open! Conductor clicks PLAY when ready.
  isScorePlaying = false;
  scorePausedElapsed = 0;
  scoreStartTime = 0;
  lastTriggeredStep = -1;

  // Arm warm-up mode for pass 1
  isWarmupMode = true;
  if (btnScoreWarmup) {
    btnScoreWarmup.classList.add('active');
    btnScoreWarmup.textContent = 'WARM-UP: AUTO';
  }

  if (btnScorePlay) {
    btnScorePlay.textContent = 'PLAY';
    btnScorePlay.classList.remove('active');
  }
  if (isCountingIn) {
    isCountingIn = false;
    clearTimeout(countInTimer);
    if (countInOverlay) countInOverlay.classList.remove('active');
  }

  if (scorePlayhead) scorePlayhead.style.left = '170px';
  const scoreGridWrapper = document.querySelector('.score-grid-wrapper');
  if (scoreGridWrapper) scoreGridWrapper.scrollLeft = 0;

  applyZoom(currentScoreZoom);
  renderSessionPills();
  renderScoreMeasureRuler();
  renderScoreLanes();
  updateCaptionCard(0, 0);

  const scoreData = getActiveScoreData();
  if (scoreMeasureVal && scoreData) scoreMeasureVal.textContent = `BAR 1 / ${scoreData.totalMeasures}`;
  if (scoreBeatVal) scoreBeatVal.textContent = 'BEAT 1';
  if (scoreBpmVal && scoreData) scoreBpmVal.textContent = `${Math.round(scoreData.baseBpm || 80)} BPM`;
}

function closeScoreWindow() {
  if (!scoreOverlay) return;
  scoreOverlay.classList.remove('open');
  isScoreWindowOpen = false;

  // Restore background shader canvas and resume WebGL rendering
  if (shaderCanvasContainer) shaderCanvasContainer.style.visibility = '';
  resizeThree();

  isScorePlaying = false;
  scorePausedElapsed = 0;
  updateScoreTempoVisuals(80);
  if (btnScorePlay) {
    btnScorePlay.textContent = 'PLAY';
    btnScorePlay.classList.remove('active');
  }
  if (isCountingIn) {
    isCountingIn = false;
    clearTimeout(countInTimer);
    if (countInOverlay) countInOverlay.classList.remove('active');
  }
}

/* =========================================================================
   14. INITIALIZATION & MIDI LISTENERS
   ========================================================================= */

async function init() {
  initThreeCymatics();
  updatePillarBindingTags();
  renderPillarsRack();
  renderSlidersRack();
  initScore();

  const hasMidi = await midiController.init();
  if (hasMidi) {
    midiLed.classList.add('connected');
    midiDeviceName.textContent = `MIDI: ${midiController.activeDeviceName}`;
  } else {
    midiDeviceName.textContent = 'MIDI: NO DEVICE (KEYS 1-4 READY)';
  }

  midiController.on('connection', ({ connected, deviceName }) => {
    midiLed.classList.toggle('connected', connected);
    midiDeviceName.textContent = connected ? `MIDI: ${deviceName}` : 'MIDI: DISCONNECTED';
    showToast(connected ? `⚡ MIDI CONNECTED: ${deviceName}` : 'MIDI DISCONNECTED');
  });

  midiController.on('rawMessage', (raw) => {
    handleIncomingMidi(raw.eventKey, raw);
  });

  requestAnimationFrame(animate);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
