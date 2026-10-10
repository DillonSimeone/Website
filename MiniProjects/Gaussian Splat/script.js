// ═══════════════════════════════════════════════════════════════
// Global Config
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
    CAPTURE_INTERVAL: 3000,
    MAX_SLOTS: 8,
    RADIAL_DISTANCE: 4.5,
    SPLAT_SIZE: 0.16,
    ROTATE_SPEED: 1.0,
    SPLAT_HEIGHT: 0.0,
    RANDOM_COLORS: false,
    AUDIO_REACTIVE: false,
    AUDIO_SENSITIVITY: 1.5,
    BG_INTENSITY: 1.0,
    FADE_IN_SPEED: 0.4,       // seconds
    DISSOLVE_DURATION: 1.5,    // seconds
    CLUSTER_DENSITY: 3,
    FOG_DENSITY: 0.02,
    AUTO_CYCLE: true
};

// ═══════════════════════════════════════════════════════════════
// Scene State
// ═══════════════════════════════════════════════════════════════
let scene, camera, renderer, controls;
let ringGroup, splatsGroup, powderGroup;
let bgMesh; // Fullscreen shader background
let isCameraActive = false;
let hasWebcamPermission = false;

// Audio
let audioCtx = null, analyser = null, audioDataArray = null;
let isAudioInitialized = false;
let smoothedAudioLevel = 0; // For background shader

// Timing
let lastCaptureTime = performance.now();
let isDissolving = false;
let capturedSlots = [];      // { group, fadeProgress, spawnTime }
let activePowderParticles = [];

// Landmark Cache — keep last good capture so we never fall back to random
let latestFaceLandmarks = null;
let latestHandLandmarks = null;
let lastGoodFaceLandmarks = null;
let lastGoodHandLandmarks = null;

// Device detection
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let isPointerDragging = false;
let pointerDownPos = { x: 0, y: 0 };

// ═══════════════════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════════════════
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('landmark-canvas');
const canvasCtx = canvasElement.getContext('2d');
const cameraStatusEl = document.getElementById('camera-status');
const progressBarEl = document.getElementById('cycle-progress');
const splatCountEl = document.getElementById('splat-count');
const slotCountEl = document.getElementById('slot-count');
const toggleCamBtn = document.getElementById('toggle-camera-btn');
const dissolveBtn = document.getElementById('trigger-dissolve-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsDrawer = document.getElementById('settings-drawer');
const cycleLabel = document.getElementById('cycle-label');
const hintDesktop = document.getElementById('hint-desktop');
const hintMobile = document.getElementById('hint-mobile');

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
function init() {
    initDeviceUI();
    initThree();
    initMediaPipe();
    setupEventListeners();
    setupSettingsControls();
    animate();
}

function initDeviceUI() {
    if (isTouchDevice) {
        if (hintDesktop) hintDesktop.style.display = 'none';
        if (hintMobile) hintMobile.style.display = 'inline-block';
    } else {
        if (hintDesktop) hintDesktop.style.display = 'inline-block';
        if (hintMobile) hintMobile.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// Three.js Scene
// ═══════════════════════════════════════════════════════════════
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050810, CONFIG.FOG_DENSITY);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 3, 9.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const d1 = new THREE.DirectionalLight(0x00f2fe, 1.0);
    d1.position.set(5, 10, 7);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xff0844, 0.6);
    d2.position.set(-5, 8, -7);
    scene.add(d2);

    // Groups
    ringGroup = new THREE.Group();
    scene.add(ringGroup);
    splatsGroup = new THREE.Group();
    ringGroup.add(splatsGroup);
    powderGroup = new THREE.Group();
    scene.add(powderGroup);

    // Sound-reactive shader background
    createShaderBackground();

    window.addEventListener('resize', onWindowResize);
}

// ═══════════════════════════════════════════════════════════════
// Fullscreen Audio-Reactive Shader Background
// ═══════════════════════════════════════════════════════════════
const bgVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const bgFragmentShader = `
uniform float uTime;
uniform float uAudioLevel;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uIntensity;
varying vec2 vUv;

// Simplex-ish noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = vUv;
    vec2 centered = uv - 0.5;
    float dist = length(centered);

    // Slow time flow
    float t = uTime * 0.15;

    // Layer 1: Bass-driven large warping nebula
    float n1 = snoise(centered * 2.0 + vec2(t * 0.4, t * 0.3)) * (0.5 + uBass * 1.5);

    // Layer 2: Mid-frequency swirls
    float angle = atan(centered.y, centered.x);
    float n2 = snoise(vec2(angle * 2.0 + t, dist * 5.0 - t * 0.6)) * (0.3 + uMid * 0.8);

    // Layer 3: Treble sparkle/grain
    float n3 = snoise(centered * 12.0 + vec2(t * 2.0, -t * 1.5)) * uTreble * 0.6;

    // Color palette: deep blue → cyan → magenta → red
    vec3 colBass   = vec3(0.05, 0.02, 0.15) + vec3(0.4, 0.0, 0.1) * uBass;
    vec3 colMid    = vec3(0.0, 0.12, 0.25) + vec3(0.0, 0.5, 0.8) * uMid * 0.5;
    vec3 colTreble = vec3(0.0, 0.0, 0.0) + vec3(0.8, 0.2, 0.9) * uTreble * 0.3;

    vec3 color = colBass + colMid + colTreble;

    // Apply noise layers
    color += n1 * vec3(0.15, 0.05, 0.2);
    color += n2 * vec3(0.0, 0.2, 0.3);
    color += n3 * vec3(0.4, 0.1, 0.5);

    // Vignette
    float vignette = 1.0 - smoothstep(0.3, 0.85, dist);
    color *= vignette * 0.8;

    // Breathing pulse
    color *= 0.7 + 0.3 * sin(uTime * 0.5 + dist * 4.0) * (0.5 + uAudioLevel * 0.5);

    // Intensity control
    color *= uIntensity;

    // Base ambient floor so it's never fully black
    color = max(color, vec3(0.015, 0.01, 0.025));

    gl_FragColor = vec4(color, 1.0);
}
`;

function createShaderBackground() {
    const bgGeo = new THREE.PlaneGeometry(2, 2);
    const bgMat = new THREE.ShaderMaterial({
        vertexShader: bgVertexShader,
        fragmentShader: bgFragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uAudioLevel: { value: 0 },
            uBass: { value: 0 },
            uMid: { value: 0 },
            uTreble: { value: 0 },
            uIntensity: { value: CONFIG.BG_INTENSITY }
        },
        depthWrite: false,
        depthTest: false
    });

    bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.renderOrder = -1000;
    bgMesh.frustumCulled = false;

    // Separate background scene rendered first
    scene.add(bgMesh);
}

// ═══════════════════════════════════════════════════════════════
// MediaPipe
// ═══════════════════════════════════════════════════════════════
function initMediaPipe() {
    if (typeof FaceMesh === 'undefined') {
        cameraStatusEl.innerText = 'Demo Mode (CDN Offline)';
        return;
    }

    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults(onFaceResults);

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onHandResults);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const cameraObj = new Camera(videoElement, {
            onFrame: async () => {
                if (isCameraActive) {
                    await faceMesh.send({ image: videoElement });
                    await hands.send({ image: videoElement });
                }
            },
            width: 640, height: 480
        });
        cameraObj.start().then(() => {
            hasWebcamPermission = true;
            isCameraActive = true;
            cameraStatusEl.innerText = 'Tracking Active';
        }).catch(() => {
            hasWebcamPermission = false;
            isCameraActive = false;
            cameraStatusEl.innerText = 'Demo Mode (No Cam)';
        });
    }
}

function onFaceResults(results) {
    if (isCameraActive && results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        latestFaceLandmarks = results.multiFaceLandmarks[0];
        lastGoodFaceLandmarks = latestFaceLandmarks; // Cache good capture
        drawLandmarks(latestFaceLandmarks);
    } else {
        latestFaceLandmarks = null;
        // Don't clear lastGoodFaceLandmarks — keep previous good data
    }
}

function onHandResults(results) {
    if (isCameraActive && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        latestHandLandmarks = results.multiHandLandmarks;
        lastGoodHandLandmarks = latestHandLandmarks;
    } else {
        latestHandLandmarks = null;
    }
}

function drawLandmarks(landmarks) {
    canvasElement.width = videoElement.videoWidth || 320;
    canvasElement.height = videoElement.videoHeight || 240;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.fillStyle = '#00f2fe';
    for (const lm of landmarks) {
        canvasCtx.beginPath();
        canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, 1.5, 0, 2 * Math.PI);
        canvasCtx.fill();
    }
    canvasCtx.restore();
}

// ═══════════════════════════════════════════════════════════════
// Audio FFT
// ═══════════════════════════════════════════════════════════════
function initAudioFFT() {
    if (isAudioInitialized) return;
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        audioDataArray = new Uint8Array(analyser.frequencyBinCount);
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
            audioCtx.createMediaStreamSource(stream).connect(analyser);
            isAudioInitialized = true;
        }).catch(() => {
            CONFIG.AUDIO_REACTIVE = false;
            const el = document.getElementById('toggle-audio-reactive');
            if (el) el.checked = false;
        });
    } catch (e) { console.error('AudioContext error:', e); }
}

function getFFTBands() {
    if (!analyser || !audioDataArray) return { bass: 0, mid: 0, treble: 0, level: 0 };
    analyser.getByteFrequencyData(audioDataArray);
    const len = audioDataArray.length;
    const third = Math.floor(len / 3);
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < third; i++) bass += audioDataArray[i];
    for (let i = third; i < third * 2; i++) mid += audioDataArray[i];
    for (let i = third * 2; i < len; i++) treble += audioDataArray[i];
    bass = (bass / third) / 255;
    mid = (mid / third) / 255;
    treble = (treble / (len - third * 2)) / 255;
    const level = (bass + mid + treble) / 3;
    return { bass, mid, treble, level };
}

function getFFTColor(freqNorm) {
    return new THREE.Color().setHSL(freqNorm * 0.78, 1.0, 0.5);
}

// ═══════════════════════════════════════════════════════════════
// Gaussian Splat Mesh Creation
// ═══════════════════════════════════════════════════════════════
function createGaussianSplatMesh(landmarksList, isHand) {
    const points = [];
    const colors = [];

    // Decide which landmarks to use: current → lastGood → procedural
    let useLandmarks = landmarksList;
    if (!useLandmarks || useLandmarks.length === 0) {
        useLandmarks = isHand ? lastGoodHandLandmarks : lastGoodFaceLandmarks;
    }
    // If using hand landmarks stored as array of arrays, flatten first hand
    if (isHand && Array.isArray(useLandmarks) && useLandmarks.length > 0 && Array.isArray(useLandmarks[0])) {
        useLandmarks = useLandmarks[0]; // Use first hand
    }

    // Snapshot webcam for color sampling
    let snapCtx = null, snapCanvas = null;
    if (isCameraActive && videoElement.videoWidth > 0) {
        snapCanvas = document.createElement('canvas');
        snapCanvas.width = videoElement.videoWidth;
        snapCanvas.height = videoElement.videoHeight;
        snapCtx = snapCanvas.getContext('2d');
        snapCtx.drawImage(videoElement, 0, 0);
    }

    const density = CONFIG.CLUSTER_DENSITY;

    if (useLandmarks && useLandmarks.length > 0) {
        useLandmarks.forEach(lm => {
            const x = (lm.x - 0.5) * -2.2;
            const y = (0.5 - lm.y) * 2.2;
            const z = (lm.z || 0) * -2.2;

            let baseColor;
            if (CONFIG.RANDOM_COLORS) {
                baseColor = new THREE.Color().setHSL(Math.random(), 0.95, 0.6);
            } else if (snapCtx) {
                const mx = 1.0 - lm.x;
                const px = Math.floor(Math.max(0, Math.min(snapCanvas.width - 1, mx * snapCanvas.width)));
                const py = Math.floor(Math.max(0, Math.min(snapCanvas.height - 1, lm.y * snapCanvas.height)));
                const d = snapCtx.getImageData(px, py, 1, 1).data;
                baseColor = new THREE.Color(d[0] / 255, d[1] / 255, d[2] / 255);
            } else {
                baseColor = new THREE.Color(isHand ? 0x4facfe : 0xffaa88);
            }

            for (let i = 0; i < density; i++) {
                points.push(
                    x + (Math.random() - 0.5) * 0.06,
                    y + (Math.random() - 0.5) * 0.06,
                    z + (Math.random() - 0.5) * 0.06
                );
                const c = baseColor.clone().addScalar((Math.random() - 0.5) * 0.08);
                colors.push(c.r, c.g, c.b);
            }
        });
    } else {
        // Procedural fallback sphere
        const count = 220;
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 0.95 + Math.random() * 0.08;
            points.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta) * 1.25,
                r * Math.cos(phi)
            );
            const c = CONFIG.RANDOM_COLORS
                ? new THREE.Color().setHSL(Math.random(), 0.9, 0.6)
                : new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 0.7, 0.6);
            colors.push(c.r, c.g, c.b);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: CONFIG.SPLAT_SIZE,
        map: createSplatTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.0, // Start invisible for fade-in
        blending: THREE.NormalBlending,
        depthWrite: true
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.userData = { originalColors: new Float32Array(colors) };
    return mesh;
}

let _splatTexture = null;
function createSplatTexture() {
    if (_splatTexture) return _splatTexture;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _splatTexture = new THREE.Texture(c);
    _splatTexture.needsUpdate = true;
    return _splatTexture;
}

// ═══════════════════════════════════════════════════════════════
// Capture & Fade-In
// ═══════════════════════════════════════════════════════════════
function captureToSlot() {
    if (isDissolving) return;
    if (capturedSlots.length >= CONFIG.MAX_SLOTS) return;

    const idx = capturedSlots.length;
    const angle = (idx / CONFIG.MAX_SLOTS) * Math.PI * 2;

    const group = new THREE.Group();
    group.position.set(
        Math.cos(angle) * CONFIG.RADIAL_DISTANCE,
        CONFIG.SPLAT_HEIGHT,
        Math.sin(angle) * CONFIG.RADIAL_DISTANCE
    );
    group.rotation.y = -angle + Math.PI / 2;
    group.scale.set(0.01, 0.01, 0.01); // Start tiny for scale-in

    // Use current face or fall back to last good
    const faceLM = latestFaceLandmarks || lastGoodFaceLandmarks;
    const faceSplat = createGaussianSplatMesh(faceLM, false);
    group.add(faceSplat);

    // Hands
    const handLM = latestHandLandmarks || lastGoodHandLandmarks;
    if (handLM && handLM.length > 0) {
        handLM.forEach((hand, hi) => {
            const hs = createGaussianSplatMesh(hand, true);
            hs.position.set((hi === 0 ? -1 : 1) * 1.3, 0, 0.3);
            group.add(hs);
        });
    }

    splatsGroup.add(group);
    capturedSlots.push({
        group,
        spawnTime: performance.now(),
        fadeProgress: 0
    });
    updateStats();
}

// ═══════════════════════════════════════════════════════════════
// Dissolve
// ═══════════════════════════════════════════════════════════════
function triggerDissolve() {
    if (isDissolving || capturedSlots.length === 0) return;
    isDissolving = true;

    capturedSlots.forEach(slot => {
        slot.group.children.forEach(pts => {
            if (!pts.geometry) return;
            const posAttr = pts.geometry.attributes.position;
            const colAttr = pts.geometry.attributes.color;
            for (let i = 0; i < posAttr.count; i++) {
                const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                v.applyMatrix4(pts.matrixWorld);
                activePowderParticles.push({
                    pos: v,
                    vel: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.12,
                        Math.random() * 0.12 + 0.04,
                        (Math.random() - 0.5) * 0.12
                    ),
                    color: new THREE.Color(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i)),
                    life: 1.0
                });
            }
        });
    });

    capturedSlots.forEach(s => splatsGroup.remove(s.group));
    capturedSlots = [];
    rebuildPowderMesh();

    setTimeout(() => {
        // Force clear any leftover powder
        if (powderMesh) {
            powderGroup.remove(powderMesh);
            powderMesh.geometry.dispose();
            powderMesh = null;
        }
        activePowderParticles = [];
        isDissolving = false;
        lastCaptureTime = performance.now();
        updateStats();
    }, CONFIG.DISSOLVE_DURATION * 1000);
}

let powderMesh = null;
function rebuildPowderMesh() {
    if (powderMesh) { powderGroup.remove(powderMesh); powderMesh.geometry.dispose(); }
    const pos = [], col = [];
    activePowderParticles.forEach(p => {
        pos.push(p.pos.x, p.pos.y, p.pos.z);
        col.push(p.color.r, p.color.g, p.color.b);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
        size: CONFIG.SPLAT_SIZE * 0.7,
        map: createSplatTexture(),
        vertexColors: true, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    powderMesh = new THREE.Points(geo, mat);
    powderGroup.add(powderMesh);
}

function updatePowderParticles() {
    if (!activePowderParticles.length || !powderMesh) return;
    const pa = powderMesh.geometry.attributes.position;
    let alive = 0;
    for (let i = 0; i < activePowderParticles.length; i++) {
        const p = activePowderParticles[i];
        if (p.life > 0) {
            p.pos.add(p.vel);
            p.vel.y += 0.002;
            p.life -= 0.04;
            pa.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
            alive++;
        } else {
            pa.setXYZ(i, 0, -999, 0);
        }
    }
    pa.needsUpdate = true;
    powderMesh.material.opacity = Math.max(0, powderMesh.material.opacity - 0.03);
    if (alive === 0) {
        powderGroup.remove(powderMesh);
        activePowderParticles = [];
        powderMesh = null;
    }
}

// ═══════════════════════════════════════════════════════════════
// Audio Reactivity on Splats — Frequency-Based Motion
// ═══════════════════════════════════════════════════════════════
function updateAudioReactivity(bands) {
    if (!CONFIG.AUDIO_REACTIVE || !analyser || !audioDataArray) return;

    analyser.getByteFrequencyData(audioDataArray);
    const binCount = audioDataArray.length;
    const time = performance.now() * 0.001;

    capturedSlots.forEach(slot => {
        slot.group.children.forEach(pts => {
            if (!pts.geometry || !pts.userData.originalColors) return;
            const posAttr = pts.geometry.attributes.position;
            const colAttr = pts.geometry.attributes.color;
            const origColors = pts.userData.originalColors;
            const count = posAttr.count;

            for (let i = 0; i < count; i++) {
                const freqIdx = Math.floor((i / count) * binCount);
                const freqVal = (audioDataArray[freqIdx] / 255) * CONFIG.AUDIO_SENSITIVITY;
                const freqNorm = Math.min(1.0, freqVal);

                // === Color Shift: red(bass) → purple(treble) ===
                const fftCol = getFFTColor(freqNorm);
                const blend = Math.min(0.85, freqNorm * 1.1);
                const oR = origColors[i * 3], oG = origColors[i * 3 + 1], oB = origColors[i * 3 + 2];
                colAttr.setXYZ(i,
                    oR * (1 - blend) + fftCol.r * blend,
                    oG * (1 - blend) + fftCol.g * blend,
                    oB * (1 - blend) + fftCol.b * blend
                );

                // === Frequency-Based Motion ===
                // Bass (low idx): slow heavy pulse outward
                // Mid: orbital swirl
                // Treble (high idx): fast jitter
                const bandPos = freqIdx / binCount; // 0=bass, 1=treble
                const displacement = freqNorm * 0.12;

                if (bandPos < 0.33) {
                    // Bass: radial pulse
                    const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
                    const len = Math.sqrt(px * px + py * py + pz * pz) || 1;
                    posAttr.setXYZ(i,
                        px + (px / len) * displacement * Math.sin(time * 1.5),
                        py + (py / len) * displacement * Math.sin(time * 1.5),
                        pz + (pz / len) * displacement * Math.sin(time * 1.5)
                    );
                } else if (bandPos < 0.66) {
                    // Mid: orbital swirl around Y axis
                    const angle = displacement * Math.sin(time * 3.0 + i);
                    const px = posAttr.getX(i), pz = posAttr.getZ(i);
                    posAttr.setX(i, px + Math.cos(angle) * displacement * 0.5);
                    posAttr.setZ(i, pz + Math.sin(angle) * displacement * 0.5);
                } else {
                    // Treble: rapid random jitter
                    posAttr.setX(i, posAttr.getX(i) + (Math.random() - 0.5) * displacement * 0.8);
                    posAttr.setY(i, posAttr.getY(i) + (Math.random() - 0.5) * displacement * 0.8);
                    posAttr.setZ(i, posAttr.getZ(i) + (Math.random() - 0.5) * displacement * 0.8);
                }
            }
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════════
function updateStats() {
    let total = 0;
    capturedSlots.forEach(s => s.group.children.forEach(m => {
        if (m.geometry) total += m.geometry.attributes.position.count;
    }));
    splatCountEl.innerText = total.toLocaleString();
    slotCountEl.innerText = `${capturedSlots.length}/${CONFIG.MAX_SLOTS}`;
}

// ═══════════════════════════════════════════════════════════════
// Main Animation Loop
// ═══════════════════════════════════════════════════════════════
function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const elapsed = now - lastCaptureTime;
    const time = now * 0.001;

    // Ring rotation
    ringGroup.rotation.y += 0.005 * CONFIG.ROTATE_SPEED;

    // === Audio bands for shader + splat reactivity ===
    const bands = CONFIG.AUDIO_REACTIVE ? getFFTBands() : { bass: 0, mid: 0, treble: 0, level: 0 };
    smoothedAudioLevel += (bands.level - smoothedAudioLevel) * 0.1;

    // === Background shader uniforms ===
    if (bgMesh && bgMesh.material.uniforms) {
        bgMesh.material.uniforms.uTime.value = time;
        bgMesh.material.uniforms.uAudioLevel.value = smoothedAudioLevel * CONFIG.AUDIO_SENSITIVITY;
        bgMesh.material.uniforms.uBass.value = bands.bass * CONFIG.AUDIO_SENSITIVITY;
        bgMesh.material.uniforms.uMid.value = bands.mid * CONFIG.AUDIO_SENSITIVITY;
        bgMesh.material.uniforms.uTreble.value = bands.treble * CONFIG.AUDIO_SENSITIVITY;
        bgMesh.material.uniforms.uIntensity.value = CONFIG.BG_INTENSITY;
    }

    // === Spawn & Dissolve Cycle ===
    if (!isDissolving && CONFIG.AUTO_CYCLE) {
        const progress = Math.min(1.0, elapsed / CONFIG.CAPTURE_INTERVAL);
        progressBarEl.style.width = `${progress * 100}%`;

        const targetSlots = Math.floor(progress * CONFIG.MAX_SLOTS);
        if (capturedSlots.length < targetSlots && capturedSlots.length < CONFIG.MAX_SLOTS) {
            captureToSlot();
        }

        if (elapsed >= CONFIG.CAPTURE_INTERVAL || capturedSlots.length >= CONFIG.MAX_SLOTS) {
            if (capturedSlots.length > 0) triggerDissolve();
            else lastCaptureTime = now;
        }
    } else if (!isDissolving && !CONFIG.AUTO_CYCLE) {
        // Manual mode: just capture slots on timer but don't auto-dissolve
        const progress = Math.min(1.0, elapsed / CONFIG.CAPTURE_INTERVAL);
        progressBarEl.style.width = `${progress * 100}%`;
        const targetSlots = Math.floor(progress * CONFIG.MAX_SLOTS);
        if (capturedSlots.length < targetSlots && capturedSlots.length < CONFIG.MAX_SLOTS) {
            captureToSlot();
        }
    } else {
        progressBarEl.style.width = '0%';
    }

    // === Fade-In Animation for each slot ===
    const fadeDuration = CONFIG.FADE_IN_SPEED * 1000;
    capturedSlots.forEach(slot => {
        const age = now - slot.spawnTime;
        const t = Math.min(1.0, age / fadeDuration);
        // Smooth ease-out
        const eased = 1 - Math.pow(1 - t, 3);

        slot.group.scale.setScalar(eased);
        slot.group.children.forEach(pts => {
            if (pts.material) pts.material.opacity = eased * 0.95;
        });
    });

    // Splat audio reactivity
    updateAudioReactivity(bands);

    // Powder
    updatePowderParticles();

    controls.update();

    // Render background manually behind the scene
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════
function setupEventListeners() {
    window.addEventListener('keydown', e => {
        if (e.code === 'Space') { e.preventDefault(); triggerDissolve(); }
    });

    if (isTouchDevice) {
        window.addEventListener('pointerdown', e => {
            if (e.target.closest('.glass-panel') || e.target.closest('.settings-drawer') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isPointerDragging = false;
            pointerDownPos = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('pointermove', e => {
            if (Math.abs(e.clientX - pointerDownPos.x) > 5 || Math.abs(e.clientY - pointerDownPos.y) > 5) isPointerDragging = true;
        });
        window.addEventListener('pointerup', e => {
            if (e.target.closest('.glass-panel') || e.target.closest('.settings-drawer') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            if (!isPointerDragging) triggerDissolve();
        });
    }

    dissolveBtn.addEventListener('click', triggerDissolve);
    toggleCamBtn.addEventListener('click', () => {
        isCameraActive = !isCameraActive;
        cameraStatusEl.innerText = (isCameraActive && hasWebcamPermission) ? 'Tracking Active' : 'Demo Mode (Procedural)';
    });
    openSettingsBtn.addEventListener('click', () => settingsDrawer.classList.add('open'));
    closeSettingsBtn.addEventListener('click', () => settingsDrawer.classList.remove('open'));
}

// ═══════════════════════════════════════════════════════════════
// Settings Controls Binding
// ═══════════════════════════════════════════════════════════════
function setupSettingsControls() {
    function bind(id, valId, updater) {
        const slider = document.getElementById(id);
        const display = document.getElementById(valId);
        if (!slider) return;
        slider.addEventListener('input', e => updater(e, slider, display));
    }

    bind('setting-capture-interval', 'val-capture-interval', (e, s, d) => {
        const v = parseFloat(e.target.value);
        CONFIG.CAPTURE_INTERVAL = v * 1000; d.innerText = `${v.toFixed(1)}s`; cycleLabel.innerText = `${v.toFixed(1)}s`;
    });
    bind('setting-rotate-speed', 'val-rotate-speed', (e, s, d) => {
        CONFIG.ROTATE_SPEED = parseFloat(e.target.value); d.innerText = `${CONFIG.ROTATE_SPEED.toFixed(1)}x`;
    });
    bind('setting-splat-size', 'val-splat-size', (e, s, d) => {
        CONFIG.SPLAT_SIZE = parseFloat(e.target.value); d.innerText = CONFIG.SPLAT_SIZE.toFixed(2);
        capturedSlots.forEach(sl => sl.group.children.forEach(m => { if (m.material) m.material.size = CONFIG.SPLAT_SIZE; }));
    });
    bind('setting-max-slots', 'val-max-slots', (e, s, d) => {
        CONFIG.MAX_SLOTS = parseInt(e.target.value); d.innerText = CONFIG.MAX_SLOTS; updateStats();
    });
    bind('setting-audio-sensitivity', 'val-audio-sensitivity', (e, s, d) => {
        CONFIG.AUDIO_SENSITIVITY = parseFloat(e.target.value); d.innerText = `${CONFIG.AUDIO_SENSITIVITY.toFixed(1)}x`;
    });
    bind('setting-bg-intensity', 'val-bg-intensity', (e, s, d) => {
        CONFIG.BG_INTENSITY = parseFloat(e.target.value); d.innerText = `${CONFIG.BG_INTENSITY.toFixed(1)}x`;
    });
    bind('setting-fade-in-speed', 'val-fade-in-speed', (e, s, d) => {
        CONFIG.FADE_IN_SPEED = parseFloat(e.target.value); d.innerText = `${CONFIG.FADE_IN_SPEED.toFixed(2)}s`;
    });
    bind('setting-dissolve-duration', 'val-dissolve-duration', (e, s, d) => {
        CONFIG.DISSOLVE_DURATION = parseFloat(e.target.value); d.innerText = `${CONFIG.DISSOLVE_DURATION.toFixed(1)}s`;
    });
    bind('setting-cluster-density', 'val-cluster-density', (e, s, d) => {
        CONFIG.CLUSTER_DENSITY = parseInt(e.target.value); d.innerText = CONFIG.CLUSTER_DENSITY;
    });
    bind('setting-radial-distance', 'val-radial-distance', (e, s, d) => {
        CONFIG.RADIAL_DISTANCE = parseFloat(e.target.value); d.innerText = CONFIG.RADIAL_DISTANCE.toFixed(1);
    });
    bind('setting-splat-height', 'val-splat-height', (e, s, d) => {
        CONFIG.SPLAT_HEIGHT = parseFloat(e.target.value); d.innerText = CONFIG.SPLAT_HEIGHT.toFixed(1);
        capturedSlots.forEach(sl => { sl.group.position.y = CONFIG.SPLAT_HEIGHT; });
    });
    bind('setting-fog-density', 'val-fog-density', (e, s, d) => {
        CONFIG.FOG_DENSITY = parseFloat(e.target.value); d.innerText = CONFIG.FOG_DENSITY.toFixed(3);
        if (scene.fog) scene.fog.density = CONFIG.FOG_DENSITY;
    });

    // Checkboxes
    const cbAudio = document.getElementById('toggle-audio-reactive');
    if (cbAudio) cbAudio.addEventListener('change', e => { CONFIG.AUDIO_REACTIVE = e.target.checked; if (CONFIG.AUDIO_REACTIVE) initAudioFFT(); });

    const cbColors = document.getElementById('toggle-random-colors');
    if (cbColors) cbColors.addEventListener('change', e => { CONFIG.RANDOM_COLORS = e.target.checked; });

    const cbAutoCycle = document.getElementById('toggle-auto-cycle');
    if (cbAutoCycle) cbAutoCycle.addEventListener('change', e => { CONFIG.AUTO_CYCLE = e.target.checked; });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('DOMContentLoaded', init);
