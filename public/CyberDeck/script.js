// script.js — Apocalypse Deck Orchestrator: Power Simulation & Cinematic POST.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { poses, ORIGIN_POINT } from './poses.js';
import { CameraRail } from './camera.js';
import { VoxelFormation } from './voxels.js';
import { ShaderBackground } from './background.js';
import { ContentProjector } from './content.js';

// ── Mandelbulb Overlay Renderer ──
class MandelbulbOverlay {
    constructor(scene) {
        const shader = {
            uniforms: {
                iTime: { value: 0 },
                iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                uIntensity: { value: 0.5 },
                uAlpha: { value: 0.0 },
                uSourceType: { value: 0.0 },
                uMouse: { value: new THREE.Vector2(0, 0) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { 
                    vUv = uv; 
                    gl_Position = vec4(position, 1.0); 
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec2 vUv;
                uniform float iTime;
                uniform vec2 iResolution;
                uniform float uIntensity;
                uniform float uAlpha;
                uniform float uSourceType;
                uniform vec2 uMouse;

                float hash(float p) {
                    return fract(sin(dot(vec2(p), vec2(12.9898, 78.233))) * 43758.5453);    
                }

                float map(in vec3 pos, out vec3 trap) {
                    float thres = length(pos) - 1.2;
                    if (thres > 0.2) return thres;
                    const float power = 8.0;
                    vec3 z = pos;
                    vec3 c = pos;
                    trap = vec3(1e20);
                    float dr = 1.0;
                    float r = 0.0;
                    for (int i = 0; i < 24; ++i) {        
                        r = length(z);
                        if (r > 2.0) break;
                        float theta = acos(z.z/r);
                        float phi = atan(z.y, z.x);
                        dr = pow(r, power - 1.0) * power * dr + 1.0;
                        float zr = pow(r, power);
                        theta *= power; phi *= power;
                        z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + c;
                        trap.x = min(pow(abs(z.z),0.1), trap.x);
                        trap.y = min(abs(z.x) - 0.15, trap.y);
                        trap.z = min(length(z), trap.z);
                    }
                    return 0.5 * log(r) * r / dr;
                }

                vec3 calcNormal(vec3 pos) {
                    vec3 t;
                    const float h = 0.001;
                    const vec2 k = vec2(1,-1);
                    return normalize(k.xyy*map(pos+k.xyy*h,t) + k.yyx*map(pos+k.yyx*h,t) + k.yxy*map(pos+k.yxy*h,t) + k.xxx*map(pos+k.xxx*h,t));
                }

                float castRay(vec3 ro, vec3 rd, out vec3 trap) {
                    float t = 0.0;
                    for (int i = 0; i < 64; ++i) {
                        float h = map(ro + t*rd, trap);
                        if (h < 0.001 || t > 10.0) break;
                        t += h;
                    }
                    return t;
                }

                void main() {
                    vec2 fragCoord = gl_FragCoord.xy;
                    float time = iTime * 0.5;
                    
                    // FAKE GROWTH via Zoom
                    // Small zoom = wide FOV = tiny fractal in center
                    // Normal zoom (1.5) = fractal fills view
                    float zoom = mix(0.15, 1.5, uAlpha);
                    
                    vec3 ro = vec3(2.5*sin(time) + uMouse.x * 0.5, 1.5*cos(time*0.7) + uMouse.y * 0.3, 2.5*cos(time));
                    vec3 ta = vec3(0,0,0);
                    vec3 cw = normalize(ta-ro);
                    vec3 cu = normalize(cross(cw, vec3(0,1,0)));
                    vec3 cv = normalize(cross(cu,cw));
                    vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y;
                    vec3 rd = normalize(p.x*cu + p.y*cv + zoom*cw);
                    
                    vec3 trap;
                    float t = castRay(ro, rd, trap);
                    vec3 col = vec3(0.0);
                    if (t < 10.0) {
                        vec3 pos = ro + t*rd;
                        vec3 nor = calcNormal(pos);
                        
                        // Power-source-reactive palette
                        vec3 base1, base2;
                        if (uSourceType < 0.5) {
                            // Solar: amber / gold
                            base1 = vec3(1.0, 0.7, 0.1);
                            base2 = vec3(0.9, 0.3, 0.0);
                        } else if (uSourceType < 1.5) {
                            // Wind: cyan / teal
                            base1 = vec3(0.1, 0.9, 0.8);
                            base2 = vec3(0.0, 0.4, 0.7);
                        } else {
                            // Grid: electric blue / magenta
                            base1 = vec3(0.2, 0.3, 1.0);
                            base2 = vec3(0.8, 0.1, 0.9);
                        }
                        
                        col = base1 * clamp(pow(trap.x, 10.0), 0.0, 1.0);
                        col += base2 * clamp(pow(trap.y, 10.0), 0.0, 1.0);
                        float occ = clamp(0.5 + 0.5*nor.y, 0.0, 1.0);
                        col *= occ;
                        col += 0.1;
                    }
                    float finalAlpha = (t < 10.0 ? 1.0 : 0.0) * uAlpha;
                    gl_FragColor = vec4(col * uAlpha, finalAlpha);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false
        };
        
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial(shader));
        this.mesh.renderOrder = -1; // Force behind other scene elements if needed
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    update(time, intensity, alpha, sourceType, mouseX, mouseY) {
        this.mesh.material.uniforms.iTime.value = time;
        this.mesh.material.uniforms.uIntensity.value = intensity;
        this.mesh.material.uniforms.uAlpha.value = alpha;
        this.mesh.material.uniforms.uSourceType.value = sourceType;
        this.mesh.material.uniforms.uMouse.value.set(mouseX || 0, mouseY || 0);
        this.mesh.material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
        
        // Use exponential growth for a more noticeable singularity expansion
        // Grows from 0.001 to 1.0 based on alpha
        const s = 0.001 + Math.pow(alpha, 1.5) * 0.999;
        this.mesh.scale.set(s, s, s);
    }
}

// ── Chromatic Aberration Shader ──
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
            vec2 dir = vUv - 0.5;
            float d = length(dir) * uIntensity;
            vec2 offset = dir * d;
            float r = texture2D(tDiffuse, vUv + offset).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offset).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
};

// ── Globals ──
let renderer, scene, camera;
let rail, voxels, bg, content;
let composer, chromaticPass, bloomPass;
let mandelbulb, mandelbulbAlpha = 0;
let clock;
window.globalLerpTime = 0.5;
let activePoseIndex = -1;
let uiRects = [];

// FPS tracking
let fpsFrames = 0, fpsTime = 0, fpsDisplay = 0;
let lowFpsCount = 0;
let isLowPerf = false;

// ── Power Simulation State ──
const POWER_MODES = {
    solar: { v: 5.2, label: 'SOLAR_SCAVENGE', type: 0 },
    wind: { v: 14.8, label: 'WIND_KINETIC', type: 1 },
    grid: { v: 120.0, label: 'GRID_NOMINAL', type: 2 }
};
let currentMode = 'solar';
let targetVoltage = 5.2;
let currentVoltage = 0.0;
let simulatedWatts = 0.0;
let isIntroActive = true;
let targetSourceType = 0.0;

function init() {
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.getElementById('canvas-mount').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0x33ff33, 10, 100);
    pointLight.position.set(15, 15, 15);
    scene.add(pointLight);

    rail = new CameraRail(camera, ORIGIN_POINT);
    voxels = new VoxelFormation(scene);
    bg = new ShaderBackground();
    bg.loadShader('./shaders/flow.glsl'); // Our custom power shader
    scene.add(bg.mesh);
    content = new ContentProjector(scene, camera, renderer);
    
    // Mobile optimization: Bring content closer on vertical screens
    const isMobile = window.innerWidth < window.innerHeight;
    content.maximizedPosition.z = isMobile ? 14 : 8; 
    
    content.onNavigate = (dir) => {
        let nextIndex;
        if (dir === 'next') {
            nextIndex = (activePoseIndex + 1) % poses.length;
        } else {
            nextIndex = (activePoseIndex - 1 + poses.length) % poses.length;
        }
        setPose(nextIndex);
    };

    mandelbulb = new MandelbulbOverlay(scene);

    rail.onPoseReady = (index) => {
        const pose = poses[index];
        updateUIRects();
        voxels.setFormation(pose.formation, pose, camera, uiRects);
        content.hide();
        document.querySelector('.ui-overlay').classList.remove('content-active');
    };

    rail.onSequenceComplete = (index) => {
        const pose = poses[index];
        activePoseIndex = index;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const contentPos = camera.position.clone().add(camDir.multiplyScalar(4));
        content.show(pose.content, contentPos, camDir.negate(), pose.emissiveColor);
        document.getElementById('pose-label').textContent = pose.label;
        document.querySelector('.ui-overlay').classList.add('content-active');
    };

    // Post-Processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85);
    composer.addPass(bloomPass);
    chromaticPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaticPass);

    // ── Interaction ──
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isIntroActive) return;
            setPowerMode(btn.dataset.source);
        });
    });

    document.querySelectorAll('[data-pose]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.pose);
            if (index >= 0 && index < poses.length) setPose(index);
        });
    });

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        }
    }, { passive: true });

    // ── Diagnostics / DevMode ──
    const devToggle = document.getElementById('dev-toggle');
    const devMenu = document.getElementById('dev-menu');
    if (devToggle && devMenu) {
        devToggle.addEventListener('click', () => devMenu.classList.toggle('hidden'));
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === '1') bg.loadShader('./shaders/flow.glsl');
        if (e.key === '2') bg.loadShader('./shaders/rainbow.glsl');
        // Keyboard shortcuts: 1-5 for poses, s/w/g for power
        const poseKeys = {'!':0,'@':1,'#':2,'$':3,'%':4,'^':5,'&':6};
        if (poseKeys[e.key] !== undefined && !isIntroActive) setPose(poseKeys[e.key]);
        if (e.key === 's' && !isIntroActive) setPowerMode('solar');
        if (e.key === 'w' && !isIntroActive) setPowerMode('wind');
        if (e.key === 'g' && !isIntroActive) setPowerMode('grid');
    });

    // ── DEV Controls initialization ──
    const devControls = document.getElementById('dev-controls');
    if (devControls) {
        window.neuralIntensity = 0.2;
        createSlider(devControls, 'Neural Mesh - Data Intensity', 0, 1.0, 0.2, (val) => {
            window.neuralIntensity = parseFloat(val);
        });
        createSlider(devControls, 'Repairability - Intensity', 0, 1.0, 0.2, (val) => {
            window.repairIntensity = parseFloat(val);
        });
        createSlider(devControls, 'Adaptive Compute - Intensity', 0.1, 2.0, 0.5, (val) => {
            window.adaptiveIntensity = parseFloat(val);
        });
        createSlider(devControls, 'Global Lerp Time', 0.1, 5.0, 0.5, (val) => {
            window.globalLerpTime = parseFloat(val);
        });
        createSlider(devControls, 'Manual Voltage Override', 0, 120, 5.2, (val) => {
            targetVoltage = parseFloat(val);
        });
    }

    // Initialize UI
    setPowerMode('solar');
    setPose(0);
    document.getElementById('pose-label').textContent = 'SYSTEM_READY';
    isIntroActive = false;

    animate();
}

function setPowerMode(mode) {
    currentMode = mode;
    targetVoltage = POWER_MODES[mode].v;
    
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === mode);
    });

    // Update background uniforms — set target for crossfade
    targetSourceType = POWER_MODES[mode].type;
    window.uSourceType = POWER_MODES[mode].type; // Expose for voxels sunflower logic
    
    // Notify voxels of wind state for per-voxel spin
    voxels.setWind(mode === 'wind');
}

// ── Toggle Listeners ──
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        window.uGridType = type; // 'ac' or 'dc'
        
        const container = btn.closest('.toggle-container');
        container.setAttribute('data-active', type);
        
        container.querySelectorAll('.toggle-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
    });
});

function setPose(index) {
    content.hide();
    rail.goToPose(index, poses[index]);
    window.activePoseIndex = index; // Expose for voxels.js
    window.targetPoseIndex = index; // Immediate trigger for fading
    document.querySelectorAll('[data-pose]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.pose) === index);
    });
    // Dynamic page title
    document.title = `APOCALYPSE_DECK | ${poses[index].label}`;

    // Randomize power source on sector change
    const modes = Object.keys(POWER_MODES);
    const randomMode = modes[Math.floor(Math.random() * modes.length)];
    setPowerMode(randomMode);
}

// Telemetry display values (for smooth count-up)
let displayVolts = 0, displayWatts = 0, displayEff = 92;

function updatePowerTelemetry(dt) {
    // Lerp voltage for smoothness
    currentVoltage += (targetVoltage - currentVoltage) * dt * 2.0;
    
    // Sim watts based on voltage + some jitter
    const baseWatts = (currentVoltage * 0.5) + (currentVoltage > 100 ? 50 : 5);
    simulatedWatts = baseWatts + (Math.random() - 0.5) * (currentVoltage * 0.05);
    
    // Smooth count-up animation
    const targetEff = 92 + Math.sin(clock.elapsedTime) * 2;
    displayVolts += (currentVoltage - displayVolts) * dt * 8;
    displayWatts += (simulatedWatts - displayWatts) * dt * 6;
    displayEff += (targetEff - displayEff) * dt * 4;
    
    // Update DOM
    document.getElementById('tel-volts').textContent = `${displayVolts.toFixed(1)}V`;
    document.getElementById('tel-watts').textContent = `${displayWatts.toFixed(1)}W`;
    document.getElementById('tel-eff').textContent = `${displayEff.toFixed(1)}%`;
    
    // Context-sensitive telemetry
    const meshWrap = document.getElementById('tel-mesh-wrap');
    const fractWrap = document.getElementById('tel-fract-wrap');
    if (meshWrap) meshWrap.style.display = (activePoseIndex === 3) ? '' : 'none';
    if (fractWrap) fractWrap.style.display = (activePoseIndex === 5) ? '' : 'none';
    
    if (activePoseIndex === 3) {
        const packetCount = voxels ? voxels.packets.length : 0;
        document.getElementById('tel-mesh-bw').textContent = `${packetCount} pkt/s`;
    }
    if (activePoseIndex === 5) {
        const depth = Math.floor(8 + Math.sin(clock.elapsedTime * 0.3) * 4);
        document.getElementById('tel-fract-depth').textContent = `L${depth} / 24`;
    }

    // Update global uniforms/logic
    const voltNormalized = Math.min(currentVoltage / 120, 1.0);
    window.uVoltage = voltNormalized; // Expose for voxels.js
    bg.setUniform('uVoltage', voltNormalized);
    bloomPass.strength = 0.3 + voltNormalized * 0.4; // Further reduced for balance
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // FPS counter
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
        fpsDisplay = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0;
        fpsTime = 0;
        const el = document.getElementById('fps-counter');
        if (el) el.textContent = `${fpsDisplay} FPS`;
        
        // Performance tier detection
        if (fpsDisplay < 25 && !isLowPerf) {
            lowFpsCount++;
            if (lowFpsCount >= 4) { // 2 seconds of low FPS
                isLowPerf = true;
                renderer.setPixelRatio(1);
                console.log('[APOCALYPSE_OS] Performance tier: LOW — reducing pixel ratio');
            }
        } else if (fpsDisplay >= 45) {
            lowFpsCount = Math.max(0, lowFpsCount - 1);
        }
    }

    updatePowerTelemetry(dt);
    
    // Smooth background shader crossfade
    const currentSrc = bg.uniforms.uSourceType.value;
    bg.setUniform('uSourceType', currentSrc + (targetSourceType - currentSrc) * dt * 4.0);
    
    rail.update(dt);
    voxels.update(dt, camera.position);
    bg.update(dt, rail.velocity, camera);
    content.update(dt);

    chromaticPass.uniforms.uIntensity.value +=
        (Math.min(rail.velocity * 0.003, 0.15) - chromaticPass.uniforms.uIntensity.value) * 0.1;

    // Update Mandelbulb Overlay
    const tIdx = window.targetPoseIndex !== undefined ? window.targetPoseIndex : activePoseIndex;
    const targetAlpha = (tIdx === 5) ? 1.0 : 0.0;
    
    // Lerp speed: 1.0 / lerpTime gives 1.0 progress per N seconds
    const lerpSpeed = 1.0 / (window.globalLerpTime || 1.0);
    mandelbulbAlpha += (targetAlpha - mandelbulbAlpha) * dt * (lerpSpeed * 5.0);

    if (mandelbulbAlpha > 0.001) {
        mandelbulb.mesh.visible = true;
        mandelbulb.update(clock.elapsedTime, window.adaptiveIntensity || 0.5, mandelbulbAlpha, POWER_MODES[currentMode].type, rail.mouseX, rail.mouseY);
        
        // Ensure mandelbulb is behind content plane during takeover
        mandelbulb.mesh.renderOrder = 10;
    } else {
        mandelbulb.mesh.visible = false;
    }
    
    // Sync voxel fade-out with bulb fade-in
    window.mandelbulbAlpha = mandelbulbAlpha;

    composer.render();
}

function updateUIRects() {
    const rects = [];
    const menu = document.querySelector('.menu');
    const header = document.querySelector('.header');
    const panel = document.querySelector('.side-panel');
    
    [menu, header, panel].forEach(el => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        rects.push({
            x1: (r.left / window.innerWidth) * 2 - 1,
            y1: -((r.bottom / window.innerHeight) * 2 - 1),
            x2: (r.right / window.innerWidth) * 2 - 1,
            y2: -((r.top / window.innerHeight) * 2 - 1)
        });
    });
    uiRects = rects;
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    
    if (bg) {
        bg.setUniform('uResolution', new THREE.Vector2(window.innerWidth, window.innerHeight));
    }
    if (mandelbulb) {
        mandelbulb.mesh.material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
    }
}

function onMouseMove(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    rail.setMouse(nx * 0.5, ny * 0.3);
}

// ── Helpers ──
function createSlider(parent, label, min, max, initial, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'dev-control';
    wrap.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <label>${label}</label>
            <span class="slider-val" style="color:#33ff33; font-family:monospace; font-size:0.6rem;">${initial}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="0.1" value="${initial}" style="width:100%; accent-color:#33ff33;">
    `;
    const input = wrap.querySelector('input');
    const valSpan = wrap.querySelector('.slider-val');
    input.addEventListener('input', (e) => {
        valSpan.textContent = e.target.value;
        onChange(e.target.value);
    });
    parent.appendChild(wrap);
}

window.addEventListener('DOMContentLoaded', init);

