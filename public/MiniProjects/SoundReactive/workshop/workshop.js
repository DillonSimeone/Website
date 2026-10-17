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

function initThreeCymatics() {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  shaderCanvasContainer.appendChild(renderer.domElement);

  uniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2() },

    // FFT bands
    u_subBass: { value: 0 },
    u_bass: { value: 0 },
    u_lowMid: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_air: { value: 0 },
    u_energy: { value: 0 },
    u_transient: { value: 0 },

    // Acoustic Keyed Sound Features
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
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      uv *= 2.3;

      float warp = 1.0 + u_vocal * 0.35 + u_drum * 0.4;
      uv /= warp;

      float rotAngle = (u_time * 0.08 + u_mid * 0.25 + u_canjo * 0.4) * u_spinSpeed;
      vec2 rotUV = rot2D(rotAngle) * uv;

      float r = length(rotUV);
      float a = atan(rotUV.y, rotUV.x);

      float hScale = max(0.2, u_harmonicScale);
      float n1 = (1.0 + (u_subBass * 1.8 + u_drum * 2.2) * u_bassPunch) * hScale;
      float m1 = (2.0 + (u_bass * 2.2 + u_drum * 1.8) * u_bassPunch) * hScale;

      float n2 = (3.0 + u_mid * 2.5 + u_canjo * 3.0) * hScale;
      float m2 = (4.0 + (u_high * 3.5 + u_air * 2.5 + u_clap * 4.0)) * hScale;

      float w1 = chladniWave(rotUV, n1, m1);
      float w2 = chladniDual(rotUV, n2, m2);

      float rippleFreq = 7.0 + u_bass * 6.0 * u_bassPunch + u_canjo * 5.0;
      float radialWave = cos(r * rippleFreq - u_time * 0.9) * cos(6.0 * a + u_time * 0.2) * u_rippleDepth;

      float weight1 = 0.8 + (u_subBass + u_drum) * 1.5 * u_bassPunch;
      float weight2 = (u_mid * 0.8 + u_high * 1.2 + u_snare * 1.5 + u_clap * 1.8);
      float weightRadial = 0.35 + (u_bass + u_canjo) * 0.6;

      float W = (w1 * weight1 + w2 * weight2 + radialWave * weightRadial) / (weight1 + weight2 + weightRadial + 0.01);
      float nodalDist = abs(W);

      float sharpness = max(0.01, u_lineSharpness + u_snare * 1.2);
      float nodalLine = smoothstep((0.08 + u_transient * 0.06) / sharpness, 0.005, nodalDist);
      float resonanceGlow = (0.045 * u_glowMult) / (nodalDist + 0.035);

      float freqGradient = clamp(r * 0.35 + (u_high * 0.4 + u_clap * 0.5), 0.0, 1.0);
      vec3 spectralColor = freqToColor(freqGradient, (1.2 + u_energy * 0.8) * u_glowMult, 0.0);

      vec3 crimsonCore = vec3(1.0, 0.02, 0.15) * (0.8 + (u_subBass + u_drum) * 2.2 * u_bassPunch);
      vec3 violetHighs = vec3(0.75, 0.0, 1.0) * (0.8 + (u_high * 2.5 + u_clap * 3.0));
      vec3 plateColor = mix(crimsonCore, violetHighs, smoothstep(0.1, 0.8, freqGradient));

      vec3 finalCol = nodalLine * spectralColor * 2.4 + resonanceGlow * plateColor * (0.6 + u_bass * 0.8);

      float sandFactor = u_sandDensity * (1.0 + u_clap * 2.0 + u_snare * 1.5);
      if (sandFactor > 0.01) {
        float sandNoise = hash21(rotUV * 130.0 + sin(u_time * 0.15));
        if (sandNoise > (0.96 - sandFactor * 0.08)) {
          finalCol += spectralColor * smoothstep(0.12, 0.01, nodalDist) * (0.6 + u_air * 2.0) * sandFactor;
        }
      }

      finalCol *= smoothstep(1.35, 0.75, r);
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
}

function resizeThree() {
  if (!renderer) return;
  const rect = shaderCanvasContainer.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  if (uniforms.u_resolution) {
    uniforms.u_resolution.value.set(rect.width, rect.height);
  }
}
window.addEventListener('resize', resizeThree);

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
  }
});

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

  // 1. Update Audio Engine
  const telemetry = audioEngine.update();

  // 2. Classify Acoustics
  const classification = classifyAcoustics(telemetry);
  soundCategoryDisplay.textContent = classification.name;
  soundCategoryDisplay.className = `detector-val ${classification.cssClass}`;

  // 3. Minimeters Spectrum Draw
  if (audioEngine.dataArray) {
    drawMinimetersSpectrum(audioEngine.dataArray);
  }

  // 4. Update Three.js Cymatics Shader Uniforms
  if (uniforms && uniforms.u_time) {
    uniforms.u_time.value = now * 0.001;

    uniforms.u_subBass.value = telemetry.subBass;
    uniforms.u_bass.value = telemetry.bass;
    uniforms.u_lowMid.value = telemetry.lowMid;
    uniforms.u_mid.value = telemetry.mid;
    uniforms.u_high.value = telemetry.high;
    uniforms.u_air.value = telemetry.air;
    uniforms.u_energy.value = telemetry.overallEnergy;
    uniforms.u_transient.value = telemetry.transientAttack;

    uniforms.u_drum.value = classification.name.includes('DRUM') ? 1.0 : 0.0;
    uniforms.u_snare.value = classification.name.includes('SNARE') ? 1.0 : 0.0;
    uniforms.u_vocal.value = classification.name.includes('YELLING') ? 1.0 : (classification.name.includes('SINGING') ? 0.6 : 0.0);
    uniforms.u_clap.value = classification.name.includes('CLAP') ? 1.0 : 0.0;
    uniforms.u_canjo.value = classification.name.includes('CANJO') ? 1.0 : 0.0;

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
   13. MUSICAL SCORE ENGINE FOR DEAF PERFORMERS (4-PART ENSEMBLE)
   ========================================================================= */

const btnMusicalScore = document.getElementById('btn-musical-score');
const scoreOverlay = document.getElementById('score-overlay');
const btnCloseScore = document.getElementById('btn-close-score');
const btnScorePlay = document.getElementById('btn-score-play');
const btnScoreLoop = document.getElementById('btn-score-loop');
const scoreTabBtns = document.querySelectorAll('.score-tab-btn');
const scoreMeasureRuler = document.getElementById('score-measure-ruler');
const scoreLanesContainer = document.getElementById('score-lanes-container');
const scorePlayhead = document.getElementById('score-playhead');
const scoreMeasureVal = document.getElementById('score-measure-val');
const scoreBeatVal = document.getElementById('score-beat-val');
const scoreBpmVal = document.getElementById('score-bpm-val');

const SCORE_DATA = [
  {
    partId: 0,
    title: 'PART A: CALL & RESPONSE',
    measures: [
      { hits: { pillar_ul: [0, 2], pillar_ur: [], pillar_ll: [], pillar_lr: [] } },
      { hits: { pillar_ul: [], pillar_ur: [1, 3], pillar_ll: [], pillar_lr: [] } },
      { hits: { pillar_ul: [], pillar_ur: [], pillar_ll: [0, 1], pillar_lr: [] } },
      { hits: { pillar_ul: [], pillar_ur: [], pillar_ll: [], pillar_lr: [2, 3] } }
    ]
  },
  {
    partId: 1,
    title: 'PART B: DRIVING GROOVE',
    measures: [
      { hits: { pillar_ul: [0, 2], pillar_ur: [1, 3], pillar_ll: [1, 2], pillar_lr: [] } },
      { hits: { pillar_ul: [0, 2], pillar_ur: [1, 3], pillar_ll: [2], pillar_lr: [3] } },
      { hits: { pillar_ul: [0, 2], pillar_ur: [1, 3], pillar_ll: [1, 2], pillar_lr: [] } },
      { hits: { pillar_ul: [0, 2], pillar_ur: [1, 3], pillar_ll: [0, 2], pillar_lr: [3] } }
    ]
  },
  {
    partId: 2,
    title: 'PART C: TUTTI CLIMAX',
    measures: [
      { hits: { pillar_ul: [0, 2], pillar_ur: [0, 2], pillar_ll: [1, 3], pillar_lr: [1, 3] } },
      { hits: { pillar_ul: [0], pillar_ur: [1], pillar_ll: [2], pillar_lr: [3] } },
      { hits: { pillar_ul: [0, 2], pillar_ur: [1, 3], pillar_ll: [0, 2], pillar_lr: [1, 3] } },
      { hits: { pillar_ul: [0, 1, 2, 3], pillar_ur: [0, 1, 2, 3], pillar_ll: [0, 1, 2, 3], pillar_lr: [0, 1, 2, 3] } }
    ]
  },
  {
    partId: 3,
    title: 'PART D: OUTRO FADE',
    measures: [
      { hits: { pillar_ul: [0], pillar_ur: [0], pillar_ll: [0], pillar_lr: [0] } },
      { hits: { pillar_ul: [], pillar_ur: [], pillar_ll: [1], pillar_lr: [3] } },
      { hits: { pillar_ul: [0], pillar_ur: [], pillar_ll: [], pillar_lr: [] } },
      { hits: { pillar_ul: [0], pillar_ur: [0], pillar_ll: [0], pillar_lr: [0] } }
    ]
  }
];

let currentScorePart = 0;
let isScoreLooping = true;
let isScorePlaying = true;
let isScoreWindowOpen = false;
let scoreStartTime = 0;
let currentHighlightedBeat = -1;

function initScore() {
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

  scoreTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scoreTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentScorePart = parseInt(btn.dataset.part, 10);
      renderScoreLanes();
      showToast(`🎼 SCORE: ${SCORE_DATA[currentScorePart].title}`);
    });
  });

  if (btnScoreLoop) {
    btnScoreLoop.addEventListener('click', () => {
      isScoreLooping = !isScoreLooping;
      btnScoreLoop.classList.toggle('active', isScoreLooping);
      btnScoreLoop.textContent = `LOOP: ${isScoreLooping ? 'ON' : 'OFF'}`;
    });
  }

  if (btnScorePlay) {
    btnScorePlay.addEventListener('click', () => {
      isScorePlaying = !isScorePlaying;
      btnScorePlay.classList.toggle('active', isScorePlaying);
      btnScorePlay.textContent = isScorePlaying ? 'PAUSE' : 'PLAY';
    });
  }

  renderScoreMeasureRuler();
  renderScoreLanes();
}

function openScoreWindow() {
  if (!scoreOverlay) return;
  scoreOverlay.classList.add('open');
  isScoreWindowOpen = true;
  scoreStartTime = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
  renderScoreMeasureRuler();
  renderScoreLanes();
}

function closeScoreWindow() {
  if (!scoreOverlay) return;
  scoreOverlay.classList.remove('open');
  isScoreWindowOpen = false;
}

function renderScoreMeasureRuler() {
  if (!scoreMeasureRuler) return;
  scoreMeasureRuler.innerHTML = '';

  for (let m = 0; m < 4; m++) {
    const block = document.createElement('div');
    block.className = 'ruler-measure-block';
    block.innerHTML = `
      <span class="ruler-measure-label">BAR ${m + 1}</span>
      <div class="ruler-beat-ticks">
        <div class="ruler-beat-tick">1</div>
        <div class="ruler-beat-tick">2</div>
        <div class="ruler-beat-tick">3</div>
        <div class="ruler-beat-tick">4</div>
      </div>
    `;
    scoreMeasureRuler.appendChild(block);
  }
}

function renderScoreLanes() {
  if (!scoreLanesContainer) return;
  scoreLanesContainer.innerHTML = '';

  const part = SCORE_DATA[currentScorePart];

  PILLAR_CONFIGS.forEach((cfg, idx) => {
    const lane = document.createElement('div');
    lane.className = `score-lane lane-${idx + 1}`;

    const header = document.createElement('div');
    header.className = 'lane-header';
    header.innerHTML = `
      <div class="lane-num-badge" style="background:${cfg.color};">${idx + 1}</div>
      <div class="lane-info">
        <span class="lane-title" style="color:${cfg.color};">${cfg.name.split(' ')[0]}</span>
        <span class="lane-key-hint">${cfg.keyHint}</span>
      </div>
    `;
    lane.appendChild(header);

    const track = document.createElement('div');
    track.className = 'lane-track';

    for (let m = 0; m < 4; m++) {
      const measure = document.createElement('div');
      measure.className = 'lane-measure';

      const hitsForMeasure = part.measures[m].hits[cfg.id] || [];

      for (let b = 0; b < 4; b++) {
        const beatSlot = document.createElement('div');
        beatSlot.className = 'lane-beat';
        const globalBeatIndex = m * 4 + b;
        beatSlot.dataset.globalBeat = globalBeatIndex;

        if (hitsForMeasure.includes(b)) {
          const hitBox = document.createElement('div');
          hitBox.className = `hit-box hit-${idx + 1}`;
          hitBox.textContent = idx + 1;
          hitBox.dataset.beatIndex = globalBeatIndex;
          hitBox.title = `Click or tap ${cfg.keyHint} to trigger!`;
          hitBox.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            triggerPillar(cfg.id);
          });
          beatSlot.appendChild(hitBox);
        }

        measure.appendChild(beatSlot);
      }
      track.appendChild(measure);
    }

    lane.appendChild(track);
    scoreLanesContainer.appendChild(lane);
  });
}

function updateScorePlayhead() {
  if (!isScoreWindowOpen || !isScorePlaying || !scorePlayhead) return;

  const timeSec = audioEngine.ctx ? audioEngine.ctx.currentTime : performance.now() * 0.001;
  const secondsPerBeat = 60.0 / currentBpm;
  const totalDuration = 16 * secondsPerBeat;

  const elapsed = (timeSec - scoreStartTime) % totalDuration;
  const progress = Math.max(0, Math.min(1, elapsed / totalDuration));

  const currentTotalBeat = Math.floor(progress * 16);
  const currentMeasure = Math.floor(currentTotalBeat / 4) + 1;
  const currentBeatInBar = (currentTotalBeat % 4) + 1;

  if (scoreMeasureVal) scoreMeasureVal.textContent = `BAR ${currentMeasure} / 4`;
  if (scoreBeatVal) scoreBeatVal.textContent = `BEAT ${currentBeatInBar}`;
  if (scoreBpmVal) scoreBpmVal.textContent = `${currentBpm} BPM`;

  const gridWrapper = document.querySelector('.score-grid-wrapper');
  if (gridWrapper) {
    const laneHeaderWidth = 170;
    const paddingLeft = 20;
    const paddingRight = 20;
    const availableTrackWidth = gridWrapper.clientWidth - laneHeaderWidth - paddingLeft - paddingRight;

    const playheadX = laneHeaderWidth + paddingLeft + (progress * availableTrackWidth);
    scorePlayhead.style.left = `${playheadX}px`;
  }

  if (currentTotalBeat !== currentHighlightedBeat) {
    currentHighlightedBeat = currentTotalBeat;

    document.querySelectorAll(`.hit-box[data-beat-index="${currentTotalBeat}"]`).forEach(box => {
      box.classList.add('active');
      setTimeout(() => box.classList.remove('active'), 140);
    });
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
