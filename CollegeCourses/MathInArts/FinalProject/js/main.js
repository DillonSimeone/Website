// main.js (each shader lives in its own <div><canvas>…</canvas></div> box)

import * as THREE from './three.module.js';

let renderers = [];
let scenes = [];
let cameras = [];
let uniformsList = [];

let analyser, dataArray;
let isMicEnabled = true;
let zoomFactor = 1.0;
let timeSpeed = 1.0;
let isInverted = false;
let isRotating = false;
let offset = { x: 0, y: 0 };

let fullscreenIndex = -1;

// 1) Create a container <div> for the grid
const container = document.createElement('div');
container.style.position = 'absolute';
container.style.top = '0';
container.style.left = '0';
container.style.width = '100vw';
container.style.height = '100vh';
container.style.display = 'grid';
container.style.gridGap = '2px';
document.body.appendChild(container);

// 2) Find and load all profile shaders
(async function init() {
  // collect all fragment‐shader strings
  const shaderSources = [];
  let idx = 1;
  while (true) {
    const path = `./shaders/profile${idx}.glsl`;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error();
      const text = await res.text();
      shaderSources.push(text);
      idx++;
    } catch {
      break;
    }
  }

  // Determine grid layout (square-ish)
  const count = shaderSources.length;
  const cols = Math.ceil(Math.sqrt(count));
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  container.style.gridTemplateRows = `repeat(auto-fill, 1fr)`;

  // For each shader, create a <div> + <canvas> and a Three.js renderer
  shaderSources.forEach((fragCode, i) => {
    // Create wrapper DIV
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';
    wrapper.style.cursor = 'pointer';
    wrapper.dataset.index = i;
    container.appendChild(wrapper);

    // Create a canvas inside
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    wrapper.appendChild(canvas);

    // On double‐click, toggle fullscreen for this wrapper
    wrapper.addEventListener('dblclick', () => {
      if (fullscreenIndex === i) {
        fullscreenIndex = -1;
        updateGridStyles();
      } else {
        fullscreenIndex = i;
        updateGridStyles();
      }
    });

    // Three.js setup for this cell
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000);

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    // Uniforms for this cell
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2() },
      u_fft_low: { value: 0.0 },
      u_fft_high: { value: 0.0 },
      u_zoom: { value: zoomFactor },
      u_speed: { value: timeSpeed },
      u_invert: { value: isInverted },
      u_rotate: { value: isRotating },
      u_offset: { value: new THREE.Vector2(offset.x, offset.y) }
    };

    // Single‐quad mesh
    const material = new THREE.ShaderMaterial({
      uniforms,
      fragmentShader: fragCode
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);

    // Save references
    renderers.push(renderer);
    scenes.push(scene);
    cameras.push(camera);
    uniformsList.push(uniforms);
  });

  // Start audio‐FFT if available
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
  } catch {
    // mic unavailable
  }

  // Listen for resize & keys & start loop
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', handleKey);
  onResize();
  requestAnimationFrame(animate);
})();

// Adjust grid & canvas sizes on window resize (and fullscreen toggles)
function onResize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (fullscreenIndex >= 0) {
    // Only one cell visible (full screen)
    container.style.display = 'block';
    container.style.gridTemplateColumns = '1fr';
    container.style.gridTemplateRows = '1fr';
    const wrapper = container.children[fullscreenIndex];
    wrapper.style.width = `${vw}px`;
    wrapper.style.height = `${vh}px`;
    // hide all other wrappers
    for (let i = 0; i < container.children.length; i++) {
      if (i !== fullscreenIndex) container.children[i].style.display = 'none';
    }
    // resize its renderer to full
    renderers[fullscreenIndex].setSize(vw, vh);
    uniformsList[fullscreenIndex].u_resolution.value.set(vw, vh);
  } else {
    // Show grid again
    const count = scenes.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (let i = 0; i < count; i++) {
      const wrapper = container.children[i];
      wrapper.style.display = 'block';
      // each cell gets equal fraction
      wrapper.style.width = `${vw / cols}px`;
      wrapper.style.height = `${vh / rows}px`;
      renderers[i].setSize(vw / cols, vh / rows);
      uniformsList[i].u_resolution.value.set(vw / cols, vh / rows);
    }
  }
}

// Update grid styles after toggling fullscreenIndex
function updateGridStyles() {
  onResize();
}

// Handle WASD / arrows / keys as before, but update every uniform
function handleKey(e) {
  const panSpeed = 0.05 * zoomFactor;

  switch (e.code) {
    case 'Space':
      isMicEnabled = !isMicEnabled;
      break;

    case 'ArrowUp':
      zoomFactor *= 0.9;
      uniformsList.forEach(u => (u.u_zoom.value = zoomFactor));
      break;

    case 'ArrowDown':
      zoomFactor *= 1.1;
      uniformsList.forEach(u => (u.u_zoom.value = zoomFactor));
      break;

    case 'ArrowLeft':
      timeSpeed = Math.max(0.1, timeSpeed * 0.9);
      uniformsList.forEach(u => (u.u_speed.value = timeSpeed));
      break;

    case 'ArrowRight':
      timeSpeed *= 1.1;
      uniformsList.forEach(u => (u.u_speed.value = timeSpeed));
      break;

    case 'KeyE': // invert
      isInverted = !isInverted;
      uniformsList.forEach(u => (u.u_invert.value = isInverted));
      break;

    case 'KeyQ': // rotate
      isRotating = !isRotating;
      uniformsList.forEach(u => (u.u_rotate.value = isRotating));
      break;

    case 'KeyW':
      offset.y += panSpeed;
      uniformsList.forEach(u => u.u_offset.value.set(offset.x, offset.y));
      break;

    case 'KeyS':
      offset.y -= panSpeed;
      uniformsList.forEach(u => u.u_offset.value.set(offset.x, offset.y));
      break;

    case 'KeyA':
      offset.x -= panSpeed;
      uniformsList.forEach(u => u.u_offset.value.set(offset.x, offset.y));
      break;

    case 'KeyD':
      offset.x += panSpeed;
      uniformsList.forEach(u => u.u_offset.value.set(offset.x, offset.y));
      break;

    case 'Escape': // exit fullscreen
      fullscreenIndex = -1;
      updateGridStyles();
      break;

    default:
      return;
  }
}

// Animate loop: update uniforms and render each cell
function animate(t) {
  requestAnimationFrame(animate);

  // update FFT and time
  let low = 0, high = 0;
  if (analyser && dataArray && isMicEnabled) {
    analyser.getByteFrequencyData(dataArray);
    low = dataArray.slice(0, 16).reduce((a, b) => a + b, 0) / (16 * 255);
    high = dataArray.slice(64, 128).reduce((a, b) => a + b, 0) / (64 * 255);
  }

  scenes.forEach((scene, i) => {
    const u = uniformsList[i];
    u.u_time.value = t * 0.001;
    u.u_fft_low.value = low;
    u.u_fft_high.value = high;
  });

  // Render each cell or the fullscreen one
  if (fullscreenIndex >= 0) {
    renderers[fullscreenIndex].render(
      scenes[fullscreenIndex],
      cameras[fullscreenIndex]
    );
  } else {
    renderers.forEach((renderer, i) => {
      renderer.render(scenes[i], cameras[i]);
    });
  }
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
