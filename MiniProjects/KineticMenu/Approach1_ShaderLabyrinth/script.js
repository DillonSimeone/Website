// script.js — Main orchestrator: init, render loop, post-processing, wiring.
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
let clock;
let activePoseIndex = -1;
let uiRects = []; // Store NDC rects for avoidance

function init() {
    clock = new THREE.Clock();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('canvas-mount').appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0x00ffff, 10, 100);
    pointLight.position.set(15, 15, 15);
    scene.add(pointLight);

    const dirLight = new THREE.DirectionalLight(0xff0055, 4);
    dirLight.position.set(-15, 10, 10);
    scene.add(dirLight);

    // ── Systems ──
    rail = new CameraRail(camera, ORIGIN_POINT);
    voxels = new VoxelFormation(scene);
    bg = new ShaderBackground();
    scene.add(bg.mesh);
    content = new ContentProjector(scene, camera);

    // Camera callbacks
    rail.onPoseReady = (index) => {
        const pose = poses[index];
        updateUIRects(); // Refresh before arranging
        voxels.setFormation(pose.formation, pose, camera, uiRects);
        bg.setMood(pose.shaderMood);
        content.hide();

        if (pose.formation === 'explosion') {
            const jumpStep = pose.cameraSequence.find(s => s.jumpToRandomCube);
            if (jumpStep) {
                setTimeout(() => {
                    const targetPos = voxels.getRandomVoxelPosition();
                    const offset = new THREE.Vector3(1.5, 0.5, 1.5);
                    rail.overrideTarget(targetPos.clone().add(offset), targetPos);
                }, (pose.cameraSequence.length - 1) * 500);
            }
        }
    };

    rail.onSequenceComplete = (index) => {
        const pose = poses[index];
        activePoseIndex = index;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const contentPos = camera.position.clone().add(camDir.multiplyScalar(4));
        content.show(pose.content, contentPos, camDir.negate());
        const label = document.getElementById('pose-label');
        if (label) label.textContent = pose.label;
    };

    // ── Post-Processing ──
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85);
    composer.addPass(bloomPass);

    chromaticPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaticPass);

    // ── Events ──
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    // ── DEVMODE ──
    const devToggle = document.getElementById('dev-toggle');
    const devMenu = document.getElementById('dev-menu');
    const devControls = document.getElementById('dev-controls');
    let currentShaderName = 'alchemy';

    devToggle.addEventListener('click', () => {
        devMenu.classList.toggle('hidden');
    });
    function updateDevMenu(shaderName) {
        currentShaderName = shaderName;
        devControls.innerHTML = ''; // Clear

        if (shaderName === 'alchemy') {
            const def = 0.5;
            bg.setUniform('uFontSize', def);
            bg.setGeometry('cube');
            createSlider('Font Size', 0.5, 50, def, (val) => {
                bg.setUniform('uFontSize', parseFloat(val));
            });
        } else if (shaderName === 'rainbow') {
            const def = 5.0; // Acts as zoom/complexity multiplier
            bg.setUniform('uFontSize', def);
            bg.setGeometry('cube');
            createSlider('Zoom/Complexity', 0.1, 20.0, def, (val) => {
                bg.setUniform('uFontSize', parseFloat(val));
            });
        } else if (shaderName === 'circuits') {
            const def = 0.15;
            bg.setUniform('uFontSize', def);
            bg.setGeometry('sphere');
            createSlider('Zoom', 0.05, 1.0, def, (val) => {
                bg.setUniform('uFontSize', parseFloat(val)); 
            });
        }
    }

    function createSlider(label, min, max, value, onChange) {
        const div = document.createElement('div');
        div.className = 'dev-control';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label>${label}</label>
                <span class="dev-value" style="font-size:0.6rem; color:#00ffff; opacity:0.8;">${value}</span>
            </div>
            <input type="range" min="${min}" max="${max}" step="${(max - min) / 200}" value="${value}">
        `;
        const input = div.querySelector('input');
        const valDisp = div.querySelector('.dev-value');
        input.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value).toFixed(2);
            valDisp.textContent = val;
            onChange(val);
        });
        devControls.appendChild(div);
    }

    // Initialize dev menu with default shader
    updateDevMenu('rainbow');

    // Update dev menu when loading shaders via hotkeys
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') {
            bg.loadShader('./shaders/alchemy.glsl');
            updateDevMenu('alchemy');
        }
        if (e.key === '2') {
            bg.loadShader('./shaders/rainbow.glsl');
            updateDevMenu('rainbow');
        }
        if (e.key === '3') {
            bg.loadShader('./shaders/circuits.glsl');
            updateDevMenu('circuits');
        }
    });

    document.querySelectorAll('[data-pose]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.pose);
            if (index >= 0 && index < poses.length) setPose(index);
        });
    });

    updateUIRects();
    animate();
}

function updateUIRects() {
    const rects = [];
    const menu = document.querySelector('.menu');
    const header = document.querySelector('.header');
    
    [menu, header].forEach(el => {
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

function setPose(index) {
    content.hide();
    rail.goToPose(index, poses[index]);
    document.querySelectorAll('[data-pose]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.pose) === index);
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    rail.update(dt);
    voxels.update(dt, camera.position);
    bg.update(dt, rail.velocity, camera);
    content.update(dt);

    chromaticPass.uniforms.uIntensity.value +=
        (Math.min(rail.velocity * 0.003, 0.15) - chromaticPass.uniforms.uIntensity.value) * 0.1;

    composer.render();
}

function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    updateUIRects();
}

function onMouseMove(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    rail.setMouse(nx * 0.5, ny * 0.3);
}

window.setPose = setPose;
window.addEventListener('DOMContentLoaded', init);
