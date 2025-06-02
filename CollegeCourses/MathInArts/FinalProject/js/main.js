// main.js (for Infinity Visualizer)
import * as THREE from './three.module.js';

let scene, camera, renderer, uniforms, analyser, dataArray;
let isMicEnabled = true;
let zoomFactor = 0.75;
let timeSpeed = 1.0;
let currentShaderIndex = 0;
let isInverted = false;
let isRotating = false;
let offset = { x: 0, y: 0 };
const shaderPaths = [
  './shaders/profile1.glsl',
  './shaders/profile2.glsl',
  './shaders/profile3.glsl',
  './shaders/profile4.glsl',
  `./shaders/profile5.glsl`,
  `./shaders/profile6.glsl`
];

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.Camera();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });

  uniforms = {
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

  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', handleKey);
  attachMouseHandlers();

  loadShader(currentShaderIndex);

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
  });
}

function handleKey(e) {
  switch (e.code) {
    case 'Space':
      isMicEnabled = !isMicEnabled;
      break;
    case 'ArrowUp':
      zoomFactor *= 0.9;
      uniforms.u_zoom.value = zoomFactor;
      break;
    case 'ArrowDown':
      zoomFactor *= 1.1;
      uniforms.u_zoom.value = zoomFactor;
      break;
    case 'ArrowLeft':
      timeSpeed = Math.max(0.1, timeSpeed * 0.9);
      uniforms.u_speed.value = timeSpeed;
      break;
    case 'ArrowRight':
      timeSpeed *= 1.1;
      uniforms.u_speed.value = timeSpeed;
      break;
    case 'KeyA':
      isInverted = !isInverted;
      uniforms.u_invert.value = isInverted;
      break;
    case 'KeyQ':
      isRotating = !isRotating;
      uniforms.u_rotate.value = isRotating;
      break;
    default:
      if (/Digit[1-9]/.test(e.code)) {
        const index = parseInt(e.code.replace('Digit', '')) - 1;
        if (index !== currentShaderIndex) {
          currentShaderIndex = index;
          loadShader(index);
        }
      }
  }
}

function attachMouseHandlers() {
  let isDragging = false;
  let dragStart = null;

  canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging && dragStart) {
      const dx = (e.clientX - dragStart.x) / window.innerHeight;
      const dy = (e.clientY - dragStart.y) / window.innerHeight;
      offset.x -= dx * zoomFactor;
      offset.y += dy * zoomFactor;
      uniforms.u_offset.value.set(offset.x, offset.y);
      dragStart = { x: e.clientX, y: e.clientY };
    }
  });
}

function loadShader(index) {
  fetch(shaderPaths[index])
    .then(res => {
      if (!res.ok) throw new Error(`Shader not found: ${shaderPaths[index]}`);
      return res.text();
    })
    .then(fragmentShader => {
      const material = new THREE.ShaderMaterial({
        uniforms,
        fragmentShader
      });
      scene.clear();
      const plane = new THREE.PlaneGeometry(2, 2);
      const mesh = new THREE.Mesh(plane, material);
      scene.add(mesh);
    })
    .catch(err => {
      console.error('Shader load error:', err);
    });
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
}

function animate(time) {
  requestAnimationFrame(animate);
  uniforms.u_time.value = time * 0.001;

  if (analyser && dataArray && isMicEnabled) {
    analyser.getByteFrequencyData(dataArray);
    const low = average(dataArray.slice(0, 16)) / 255;
    const high = average(dataArray.slice(64, 128)) / 255;
    uniforms.u_fft_low.value = low;
    uniforms.u_fft_high.value = high;
  }

  renderer.render(scene, camera);
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
