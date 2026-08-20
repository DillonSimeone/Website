import * as THREE from 'three';

let renderer, scene, camera, material, mesh;
let audioContext, analyser, dataArray;
let isAudioInitialized = false;

// Color states for smooth interpolation
const currentColor1 = new THREE.Color(0xff0000);
const currentColor2 = new THREE.Color(0x0000ff);
let currentEnergy = 0.0;
let currentFreq = 0.0;
let currentFreqCurve = 1.0;
let virtualTime = 0.0;
let spinAngle1 = 0.0;
let spinAngle2 = 0.0;
let lastTime = 0;

// Setup Shader Uniforms
const uniforms = {
  u_time: { value: 0 },
  u_resolution: { value: new THREE.Vector2() },
  u_color1: { value: currentColor1 },
  u_color2: { value: currentColor2 },
  u_energy: { value: 0.0 },
  u_spin1: { value: 0.0 },
  u_spin2: { value: 0.0 },
  u_freq_curve: { value: 1.0 },
  u_curve_amp: { value: 0.1 }
};

// Custom Fragment Shader for the Sound Tunnels
const fragmentShader = `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform float u_energy;
  uniform float u_spin1;
  uniform float u_spin2;
  uniform float u_freq_curve;
  uniform float u_curve_amp;

  #define PI 3.14159265359

  // Helper to map HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    // Normalize coordinates correctly so that the shorter screen dimension maps to [-1, 1]
    // This makes it fully responsive on mobile/portrait aspect ratios!
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv *= 1.8; // Scale the tunnel viewport slightly to fill the screen nicely

    float r_raw = length(uv);

    // If screen is taller than it is wide (mobile/portrait), increase curve size and separation
    float mobileScale = u_resolution.y > u_resolution.x ? 1.6 : 1.0;
    float finalCurveAmp = u_curve_amp * mobileScale;

    // Calculate separation/weave offset based on energy
    // As energy increases, separation approaches 0 (collapse)
    float separation = smoothstep(0.8, 0.2, u_energy) * 0.22 * mobileScale;
    vec2 weaveOffset = vec2(cos(u_time * 1.4), sin(u_time * 0.9)) * separation;

    // --- TUNNEL 1 ---
    vec2 uv1 = uv - weaveOffset;
    
    // Estimate depth z to apply curve displacement
    float r1_est = length(uv1);
    float z1_est = 2.0 / (r1_est + 0.015) + u_time * 2.2;
    vec2 curve1 = vec2(sin(z1_est * u_freq_curve), cos(z1_est * u_freq_curve * 1.2)) * finalCurveAmp;
    
    vec2 uv1_curved = uv1 - curve1;
    float r1 = length(uv1_curved);
    float theta1 = atan(uv1_curved.y, uv1_curved.x);
    // Speed down the tunnel
    float z1 = 2.0 / (r1 + 0.015) + u_time * 2.2;
    // Dot pattern along the tunnel wall (with dynamic spin)
    float dots1 = smoothstep(0.1, 0.5, sin((theta1 + u_spin1) * 10.0 + sin(z1)));
    float rings1 = smoothstep(0.2, 0.5, sin(z1 * 5.0));
    float intensity1 = (rings1 * dots1 * 0.25) / (r1 + 0.15);

    // --- TUNNEL 2 ---
    vec2 uv2 = uv + weaveOffset;
    
    // Estimate depth z for Tunnel 2 curve (inverted direction curve)
    float r2_est = length(uv2);
    float z2_est = 2.0 / (r2_est + 0.015) + u_time * 2.2;
    vec2 curve2 = vec2(cos(z2_est * u_freq_curve * 1.1), sin(z2_est * u_freq_curve)) * finalCurveAmp;
    
    vec2 uv2_curved = uv2 - curve2;
    float r2 = length(uv2_curved);
    float theta2 = atan(uv2_curved.y, uv2_curved.x);
    float z2 = 2.0 / (r2 + 0.015) + u_time * 2.2;
    float dots2 = smoothstep(0.1, 0.5, sin((theta2 + u_spin2) * 8.0 - sin(z2)));
    float rings2 = smoothstep(0.2, 0.5, sin(z2 * 6.0));
    float intensity2 = (rings2 * dots2 * 0.25) / (r2 + 0.15);

    // --- TUNNEL 3 (COLLAPSED STATE) ---
    // Collapsed tunnel curves centrally
    float z3_est = 2.0 / (r_raw + 0.015) + u_time * 3.8;
    vec2 curve3 = vec2(sin(z3_est * u_freq_curve * 1.3), cos(z3_est * u_freq_curve * 0.8)) * (finalCurveAmp * 1.3);
    vec2 uv3_curved = uv - curve3;
    float r3_curved = length(uv3_curved);
    float theta3_curved = atan(uv3_curved.y, uv3_curved.x);
    
    float star = sin(theta3_curved * 5.0 + u_time * 3.0);
    float r3 = r3_curved * (1.0 - 0.28 * star);
    float z3 = 2.0 / (r3 + 0.015) + u_time * 3.8;
    float dots3 = smoothstep(0.1, 0.6, sin((theta3_curved + u_spin1 * 1.5) * 16.0));
    float rings3 = smoothstep(0.2, 0.6, sin(z3 * 8.0));
    float intensity3 = (rings3 * dots3 * 0.4) / (r3 + 0.1);

    // Color mixing
    vec3 col1 = u_color1 * intensity1;
    vec3 col2 = u_color2 * intensity2;
    
    // Tunnel 3 blends both colors intensely
    vec3 col3 = mix(u_color1, u_color2, 0.5 + 0.5 * sin(u_time)) * intensity3 * 1.8;

    // Smoothly transition to Tunnel 3 when energy/volume is high
    float collapseMix = smoothstep(0.45, 0.75, u_energy);
    vec3 finalColor = mix(col1 + col2, col3, collapseMix);

    // Add a dark fog in the center (r -> 0) and at the outer edges
    float fog = smoothstep(0.05, 0.45, r_raw);
    finalColor *= fog;

    // Audio-driven glow/strobe
    finalColor *= (1.0 + u_energy * 2.8);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function init() {
  const container = document.getElementById('canvas-container');

  // Three.js Renderer Setup
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.Camera();

  // Create single full-screen quad mesh
  material = new THREE.ShaderMaterial({
    uniforms,
    fragmentShader,
    depthWrite: false,
    depthTest: false
  });
  
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Resize and Event listeners
  window.addEventListener('resize', onWindowResize);
  onWindowResize();

  // Event listener for audio context activation
  const overlay = document.getElementById('intro-overlay');
  overlay.addEventListener('click', initializeAudio);

  lastTime = performance.now();
  requestAnimationFrame(animate);
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
}

async function initializeAudio() {
  if (isAudioInitialized) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    isAudioInitialized = true;

    // Fade out overlay
    const overlay = document.getElementById('intro-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 500);

  } catch (err) {
    console.error("Microphone capture failed:", err);
    alert("Audio initialization failed. Ensure microphone access is granted.");
  }
}

function animate(now) {
  requestAnimationFrame(animate);

  const delta = (now - lastTime) / 1000;
  lastTime = now;

  let targetEnergy = 0.0;
  let targetFreq = 0.0;
  let dominantIndex = 0;

  if (isAudioInitialized && analyser) {
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    let maxVal = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const val = dataArray[i];
      sum += val;
      if (val > maxVal) {
        maxVal = val;
        dominantIndex = i;
      }
    }

    // Normalized energy (average volume)
    targetEnergy = sum / (dataArray.length * 255.0);

    // Calculate actual frequency (Hz)
    const sampleRate = audioContext.sampleRate;
    const fftSize = analyser.fftSize;
    targetFreq = dominantIndex * (sampleRate / fftSize);
  }

  // Smoothly lerp energy
  currentEnergy += (targetEnergy - currentEnergy) * 0.12;
  currentFreq += (targetFreq - currentFreq) * 0.1;

  // HSL Color mapping
  // Dominant frequency maps to a position in HSL spectrum
  // We limit the active range to 4000Hz so the hues rotate fully with normal audio pitches
  const normFreq = Math.min(currentFreq / 4000.0, 1.0);

  // Color 1: Low frequencies are Red, High are Purple
  const hue1 = normFreq * 0.85;
  const targetColor1 = new THREE.Color().setHSL(hue1, 1.0, 0.5);

  // Color 2: Reversed direction (Low are Purple, High are Red)
  const hue2 = (1.0 - normFreq) * 0.85;
  const targetColor2 = new THREE.Color().setHSL(hue2, 1.0, 0.5);

  // Smoothly interpolate colors (lerp)
  currentColor1.lerp(targetColor1, 0.04);
  currentColor2.lerp(targetColor2, 0.04);

  // Update UI stats panels
  document.getElementById('energy-val').innerText = currentEnergy.toFixed(2);
  document.getElementById('freq-val').innerText = Math.round(currentFreq) + 'Hz';

  // Increment virtual time (louder audio makes speed faster, creating speeding sensation)
  const speedMultiplier = 0.5 + currentEnergy * 4.0; // Increased speed multiplier
  virtualTime += delta * speedMultiplier;

  // Dynamic spin calculations based on energy level
  const baseSpinSpeed = 0.4;
  const energySpinSpeed = currentEnergy * 6.0; // Increased spin speed
  spinAngle1 += delta * (baseSpinSpeed + energySpinSpeed);
  spinAngle2 -= delta * (baseSpinSpeed + energySpinSpeed * 1.3);

  // Calculate dynamic curves based on frequency and energy
  // Frequency dictates how tightly the tunnel twists/turns
  const responsiveMaxFreq = 4000;
  const freqRatio = Math.min(currentFreq / responsiveMaxFreq, 1.0);
  const targetFreqCurve = 0.5 + freqRatio * 7.5; // Twist frequency modifier
  currentFreqCurve += (targetFreqCurve - currentFreqCurve) * 0.12;

  // Energy dictates the amplitude (wildness) of the curves
  const targetCurveAmp = 0.05 + currentEnergy * 0.22; // Increased curve amplitude

  // Pass uniforms to Shader
  uniforms.u_time.value = virtualTime;
  uniforms.u_energy.value = currentEnergy;
  uniforms.u_color1.value = currentColor1;
  uniforms.u_color2.value = currentColor2;
  uniforms.u_spin1.value = spinAngle1;
  uniforms.u_spin2.value = spinAngle2;
  uniforms.u_freq_curve.value = currentFreqCurve;
  uniforms.u_curve_amp.value = targetCurveAmp;

  renderer.render(scene, camera);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);
